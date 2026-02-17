#!/usr/bin/env python3
"""
Database Migration Runner

Runs SQL migration files in order against the PostgreSQL database.

Usage:
    python scripts/run_migrations.py [OPTIONS]

Options:
    --verify-only       Only run verification queries, don't execute migrations
    --from NUM          Start from migration number (e.g., --from 022)
    --to NUM            End at migration number (e.g., --to 025)

Examples:
    python scripts/run_migrations.py                    # Run all pending migrations
    python scripts/run_migrations.py --verify-only      # Verify DB state only
    python scripts/run_migrations.py --from 022 --to 025  # Run migrations 022-025

Environment:
    DATABASE_URL: PostgreSQL connection string (with SSL)
"""

import argparse
import asyncio
import os
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

import asyncpg


async def verify_database_state(conn):
    """Run post-migration verification queries."""
    print("\n" + "="*60)
    print("VERIFICATION CHECKS")
    print("="*60)

    checks_passed = 0
    checks_failed = 0

    # Check 1: idx_entities_unique_name index exists
    print("\n[CHECK 1] Verifying idx_entities_unique_name index...")
    try:
        result = await conn.fetchrow("""
            SELECT indexname
            FROM pg_indexes
            WHERE tablename = 'entities'
            AND indexname = 'idx_entities_unique_name'
        """)
        if result:
            print("         ✓ Index exists")
            checks_passed += 1
        else:
            print("         ✗ Index NOT FOUND")
            checks_failed += 1
    except Exception as e:
        print(f"         ✗ ERROR: {e}")
        checks_failed += 1

    # Check 2: Relationship enum values
    print("\n[CHECK 2] Verifying relationship enum values...")
    expected_values = ['REPORTS_FINDING', 'ADDRESSES_PROBLEM', 'PROPOSES_INNOVATION']
    try:
        result = await conn.fetch("""
            SELECT enumlabel
            FROM pg_enum
            WHERE enumtypid = (
                SELECT oid FROM pg_type WHERE typname = 'relationship_type'
            )
        """)
        existing_values = [row['enumlabel'] for row in result]

        missing = [v for v in expected_values if v not in existing_values]
        if missing:
            print(f"         ✗ Missing enum values: {missing}")
            checks_failed += 1
        else:
            print(f"         ✓ All required enum values present: {expected_values}")
            checks_passed += 1
    except Exception as e:
        print(f"         ✗ ERROR: {e}")
        checks_failed += 1

    # Check 3: detection_method column in concept_clusters
    print("\n[CHECK 3] Verifying detection_method column...")
    try:
        result = await conn.fetchrow("""
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = 'concept_clusters'
            AND column_name = 'detection_method'
        """)
        if result:
            print(f"         ✓ Column exists (type: {result['data_type']})")
            checks_passed += 1
        else:
            print("         ✗ Column NOT FOUND")
            checks_failed += 1
    except Exception as e:
        print(f"         ✗ ERROR: {e}")
        checks_failed += 1

    # Summary
    print("\n" + "="*60)
    print(f"VERIFICATION SUMMARY: {checks_passed} passed, {checks_failed} failed")
    print("="*60)

    return checks_failed == 0


async def run_migrations(verify_only=False, from_num=None, to_num=None):
    """Run all migration files in order."""
    # Get database URL from environment
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("ERROR: DATABASE_URL environment variable not set")
        print("\nSet it with:")
        print("  export DATABASE_URL='postgresql://user:pass@host:5432/db?sslmode=require'")
        sys.exit(1)

    # Ensure SSL for Render
    if "sslmode" not in database_url:
        database_url += "?sslmode=require"

    # Migration files directory
    migrations_dir = Path(__file__).parent.parent / "database" / "migrations"

    if not migrations_dir.exists():
        print(f"ERROR: Migrations directory not found: {migrations_dir}")
        sys.exit(1)

    # Get migration files sorted by name
    all_migration_files = sorted(migrations_dir.glob("*.sql"))

    if not all_migration_files:
        print("No migration files found")
        return

    # Filter by range if specified
    migration_files = all_migration_files
    if from_num is not None or to_num is not None:
        def extract_number(filename):
            """Extract migration number from filename like '022_something.sql'"""
            parts = filename.name.split('_')
            if parts and parts[0].isdigit():
                return int(parts[0])
            return None

        migration_files = []
        for f in all_migration_files:
            num = extract_number(f)
            if num is None:
                continue
            if from_num is not None and num < from_num:
                continue
            if to_num is not None and num > to_num:
                continue
            migration_files.append(f)

        print(f"Filtered to {len(migration_files)} migrations (range: {from_num or 'start'}-{to_num or 'end'})")

    print(f"Found {len(migration_files)} migration files to process")
    print(f"Database: {database_url[:50]}...")

    if verify_only:
        print("\n⚠️  VERIFY-ONLY MODE: Will not execute migrations")

    print()

    # Connect to database
    try:
        conn = await asyncpg.connect(database_url)
        print("Connected to database")
    except Exception as e:
        print(f"ERROR: Failed to connect: {e}")
        sys.exit(1)

    # If verify-only, just run checks and exit
    if verify_only:
        success = await verify_database_state(conn)
        await conn.close()
        sys.exit(0 if success else 1)

    # Create migrations tracking table
    await conn.execute("""
        CREATE TABLE IF NOT EXISTS _migrations (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL UNIQUE,
            applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)

    # Get already applied migrations
    applied = set(
        row["name"]
        for row in await conn.fetch("SELECT name FROM _migrations")
    )

    # Track what was done
    skipped = []
    executed = []
    failed = []

    # Run each migration
    for migration_file in migration_files:
        name = migration_file.name

        if name in applied:
            print(f"  [SKIP] {name} (already applied)")
            skipped.append(name)
            continue

        print(f"  [RUN]  {name}...")

        try:
            # Read and execute migration
            sql = migration_file.read_text()

            # Execute in transaction
            async with conn.transaction():
                await conn.execute(sql)

                # Record migration
                await conn.execute(
                    "INSERT INTO _migrations (name) VALUES ($1)",
                    name
                )

            print(f"         OK")
            executed.append(name)

        except Exception as e:
            print(f"         FAILED: {e}")
            failed.append((name, str(e)))
            await conn.close()
            sys.exit(1)

    # Run verification checks
    verification_passed = await verify_database_state(conn)

    await conn.close()

    # Print summary
    print("\n" + "="*60)
    print("MIGRATION SUMMARY")
    print("="*60)
    print(f"  Skipped (already applied): {len(skipped)}")
    print(f"  Executed successfully:     {len(executed)}")
    print(f"  Failed:                    {len(failed)}")

    if executed:
        print("\nExecuted migrations:")
        for name in executed:
            print(f"  ✓ {name}")

    if failed:
        print("\nFailed migrations:")
        for name, error in failed:
            print(f"  ✗ {name}: {error}")

    print("\nVerification: " + ("✓ PASSED" if verification_passed else "✗ FAILED"))
    print("="*60)

    print("\nAll migrations completed successfully!")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run database migrations")
    parser.add_argument(
        "--verify-only",
        action="store_true",
        help="Only run verification queries, don't execute migrations"
    )
    parser.add_argument(
        "--from",
        dest="from_num",
        type=int,
        help="Start from migration number (e.g., 022)"
    )
    parser.add_argument(
        "--to",
        dest="to_num",
        type=int,
        help="End at migration number (e.g., 025)"
    )

    args = parser.parse_args()
    asyncio.run(run_migrations(
        verify_only=args.verify_only,
        from_num=args.from_num,
        to_num=args.to_num
    ))
