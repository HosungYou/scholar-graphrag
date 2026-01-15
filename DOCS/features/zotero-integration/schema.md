# Zotero Hybrid Import Schema Design

## Overview

This document describes the PostgreSQL schema design for **Zotero Hybrid Import** in ScholaRAG_Graph_Review. The design enables bidirectional synchronization between Zotero reference manager and the concept-centric knowledge graph.

## Design Philosophy

### Hybrid Import Strategy

ScholaRAG_Graph supports **THREE data sources** for entity creation:

1. **Zotero Import** (`node_source = 'zotero'`): Papers, authors, tags from Zotero library
2. **PDF LLM Extraction** (`node_source = 'pdf_llm'`): Concepts, methods, findings extracted from PDFs
3. **Manual Creation** (`node_source = 'manual'`): User-created entities

**Key Principle**: Entities can have **multiple sources** (merged):
- Example: A "Transfer Learning" concept might be:
  - Found as a Zotero tag (`zotero`)
  - Extracted from 5 paper abstracts (`pdf_llm`)
  - Manually refined by user (`manual`)
  - → Final entity has `node_source = 'merged'`

### Why Not Paper/Author as Graph Nodes?

Following the **Concept-Centric Architecture** established in migration 004:

- **Papers** and **Authors** are **METADATA**, not graph nodes
- They are stored in `paper_metadata` table for reference
- Only **Concepts**, **Methods**, **Findings**, **Problems** are visualized nodes
- This prevents "hub-and-spoke" graphs dominated by highly-cited papers

## Schema Components

### 1. Node Source Tracking

#### `node_source` Enum
```sql
CREATE TYPE node_source AS ENUM (
    'zotero',           -- Imported from Zotero
    'pdf_llm',          -- Extracted from PDF via LLM
    'manual',           -- Manually created by user
    'merged',           -- Merged from multiple sources
    'auto_inferred'     -- Inferred by system (relationships)
);
```

**Usage**:
- Every entity has a `node_source` column
- Determines authority for conflict resolution
- Enables filtering by data origin

### 2. Extended `entities` Table

#### New Columns

| Column | Type | Purpose | Example |
|--------|------|---------|---------|
| `zotero_item_key` | VARCHAR(20) | Zotero item identifier | `"ABC123XY"` |
| `zotero_version` | INTEGER | Version for incremental sync | `42` |
| `zotero_collection_keys` | VARCHAR(20)[] | Collections containing item | `{COLL1, COLL2}` |
| `node_source` | node_source | Data origin | `'zotero'`, `'merged'` |
| `source_metadata` | JSONB | Source-specific metadata | `{"confidence": 0.95}` |
| `last_synced_at` | TIMESTAMP | Last sync time | `2024-01-15 14:30:00` |

#### Indexes
```sql
CREATE INDEX idx_entities_zotero_key ON entities(zotero_item_key);
CREATE INDEX idx_entities_node_source ON entities(node_source);
CREATE INDEX idx_entities_last_synced ON entities(last_synced_at);
```

**Query Examples**:
```sql
-- Find all entities from Zotero
SELECT * FROM entities WHERE node_source = 'zotero';

-- Find entities not yet synced to Zotero
SELECT * FROM entities
WHERE node_source = 'pdf_llm'
  AND zotero_item_key IS NULL;

-- Find merged entities (multiple sources)
SELECT * FROM entities WHERE node_source = 'merged';
```

### 3. Extended `paper_metadata` Table

#### New Columns

| Column | Type | Purpose | Example |
|--------|------|---------|---------|
| `zotero_item_key` | VARCHAR(20) | Zotero paper identifier | `"PAPER123"` |
| `zotero_version` | INTEGER | Version tracking | `5` |
| `zotero_collection_keys` | VARCHAR(20)[] | Collections | `{REVIEW2024}` |
| `zotero_date_added` | TIMESTAMP | When added to Zotero | `2024-01-10` |
| `zotero_date_modified` | TIMESTAMP | Last modified in Zotero | `2024-01-14` |
| `zotero_tags` | JSONB | Zotero tags | `[{"tag": "meta-analysis"}]` |
| `zotero_notes` | TEXT | Concatenated notes | `"Important finding..."` |
| `zotero_extra` | TEXT | Extra field content | `"PMID: 12345678"` |

#### Unique Constraint
```sql
CREATE UNIQUE INDEX idx_paper_meta_project_zotero
ON paper_metadata(project_id, zotero_item_key);
```

**Prevents duplicate imports** of the same Zotero item into a project.

### 4. `zotero_collections` Table

Preserves Zotero collection hierarchy for organizational context.

```sql
CREATE TABLE zotero_collections (
    id UUID PRIMARY KEY,
    project_id UUID REFERENCES projects(id),
    collection_key VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(500) NOT NULL,
    parent_collection_key VARCHAR(20),
    collection_version INTEGER NOT NULL,
    item_count INTEGER DEFAULT 0,
    subcollection_count INTEGER DEFAULT 0,
    last_synced_at TIMESTAMP DEFAULT NOW()
);
```

**Features**:
- Hierarchical collections via `parent_collection_key`
- Statistics (`item_count`, `subcollection_count`)
- Version tracking for incremental sync

**Recursive View** for hierarchy:
```sql
CREATE VIEW zotero_collection_tree AS
WITH RECURSIVE coll_tree AS (
    -- Top-level collections
    SELECT collection_key, name, name AS path, 0 AS depth
    FROM zotero_collections
    WHERE parent_collection_key IS NULL

    UNION ALL

    -- Subcollections
    SELECT zc.collection_key, zc.name,
           ct.path || ' > ' || zc.name AS path,
           ct.depth + 1 AS depth
    FROM zotero_collections zc
    JOIN coll_tree ct ON zc.parent_collection_key = ct.collection_key
)
SELECT * FROM coll_tree;
```

**Query Example**:
```sql
-- Find all papers in "Meta-Analysis 2024" collection and subcollections
SELECT pm.*
FROM paper_metadata pm
WHERE 'COLL_META' = ANY(pm.zotero_collection_keys)
   OR EXISTS (
       SELECT 1 FROM zotero_collection_tree zct
       WHERE zct.collection_key = ANY(pm.zotero_collection_keys)
         AND zct.path LIKE 'Meta-Analysis 2024%'
   );
```

### 5. `zotero_sync_state` Table

Per-project sync state for incremental updates.

```sql
CREATE TABLE zotero_sync_state (
    id UUID PRIMARY KEY,
    project_id UUID UNIQUE REFERENCES projects(id),
    library_id VARCHAR(20) NOT NULL,
    library_type VARCHAR(10) CHECK (library_type IN ('user', 'group')),
    library_version INTEGER NOT NULL DEFAULT 0,
    last_sync_at TIMESTAMP,
    last_successful_sync_at TIMESTAMP,
    sync_status VARCHAR(50) DEFAULT 'never_synced',
    sync_error TEXT,
    items_synced INTEGER DEFAULT 0,
    items_added INTEGER DEFAULT 0,
    items_updated INTEGER DEFAULT 0,
    items_deleted INTEGER DEFAULT 0
);
```

**Workflow**:
1. **Initial Import**: `library_version = 0`, `sync_status = 'never_synced'`
2. **After First Sync**: `library_version = 123`, `sync_status = 'up_to_date'`
3. **Changes Detected**: `sync_status = 'pending_changes'`
4. **Sync Running**: `sync_status = 'syncing'`
5. **Sync Complete**: `library_version = 130`, `sync_status = 'up_to_date'`

**Incremental Sync Query**:
```sql
-- Get items modified since last sync
SELECT * FROM zotero_items
WHERE version > (
    SELECT library_version
    FROM zotero_sync_state
    WHERE project_id = $1
);
```

### 6. `zotero_sync_history` Table

Complete audit log of all sync operations.

```sql
CREATE TABLE zotero_sync_history (
    id UUID PRIMARY KEY,
    project_id UUID REFERENCES projects(id),
    sync_type VARCHAR(50) NOT NULL,  -- 'full', 'incremental', 'manual'
    sync_direction VARCHAR(50) NOT NULL,  -- 'import', 'export', 'bidirectional'
    started_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP,
    duration_seconds FLOAT,
    from_version INTEGER,
    to_version INTEGER,
    status VARCHAR(50) NOT NULL,  -- 'success', 'failed', 'partial'
    items_processed INTEGER DEFAULT 0,
    items_added INTEGER DEFAULT 0,
    items_updated INTEGER DEFAULT 0,
    items_deleted INTEGER DEFAULT 0,
    errors_encountered INTEGER DEFAULT 0,
    error_details JSONB,
    initiated_by VARCHAR(255)
);
```

**Use Cases**:
- **Debugging**: "Why did the sync fail?"
- **Analytics**: "How many papers were imported per day?"
- **Audit**: "Who triggered the export to Zotero?"

**Query Examples**:
```sql
-- Recent sync operations
SELECT sync_type, status, items_added, duration_seconds
FROM zotero_sync_history
WHERE project_id = $1
ORDER BY started_at DESC
LIMIT 10;

-- Failed syncs requiring attention
SELECT * FROM zotero_sync_history
WHERE status = 'failed'
  AND started_at > NOW() - INTERVAL '7 days';
```

### 7. `entity_merge_history` Table

Tracks how entities were merged from multiple sources.

```sql
CREATE TABLE entity_merge_history (
    id UUID PRIMARY KEY,
    entity_id UUID REFERENCES entities(id),
    source_type node_source NOT NULL,
    source_entity_id VARCHAR(255),
    source_confidence FLOAT,
    merged_at TIMESTAMP DEFAULT NOW(),
    merged_by VARCHAR(255),
    merge_strategy VARCHAR(50),  -- 'manual', 'auto_title_match', 'auto_doi_match'
    changes_applied JSONB
);
```

**Merge Strategies**:

| Strategy | Description | Example |
|----------|-------------|---------|
| `auto_title_match` | Title similarity > 85% | "Transfer Learning" ≈ "transfer learning" |
| `auto_doi_match` | DOI exact match | `10.1234/example` |
| `auto_semantic_match` | Embedding similarity > 0.90 | Similar definitions |
| `llm_suggested` | LLM identified as duplicate | "These concepts are equivalent" |
| `manual` | User manually merged | Researcher's judgment |

**Example Merge Record**:
```json
{
  "entity_id": "uuid-1234",
  "source_type": "zotero",
  "source_entity_id": "ABC123XY",
  "source_confidence": 1.0,
  "merge_strategy": "auto_doi_match",
  "changes_applied": {
    "authors": "updated",
    "abstract": "kept_existing",
    "tags": "merged"
  }
}
```

**Query Example**:
```sql
-- Find all sources merged into an entity
SELECT
    source_type,
    source_entity_id,
    merge_strategy,
    merged_at
FROM entity_merge_history
WHERE entity_id = $1
ORDER BY merged_at;
```

### 8. `zotero_sync_conflicts` Table

Handles conflicts during bidirectional sync.

```sql
CREATE TABLE zotero_sync_conflicts (
    id UUID PRIMARY KEY,
    project_id UUID REFERENCES projects(id),
    entity_id UUID REFERENCES entities(id),
    paper_metadata_id UUID REFERENCES paper_metadata(id),
    conflict_type VARCHAR(50) NOT NULL,  -- 'field_mismatch', 'deletion_conflict'
    local_data JSONB NOT NULL,
    remote_data JSONB NOT NULL,
    conflicting_fields TEXT[] NOT NULL,
    resolution_status VARCHAR(50) DEFAULT 'pending',
    resolved_at TIMESTAMP,
    resolved_by VARCHAR(255),
    resolution_notes TEXT,
    detected_at TIMESTAMP DEFAULT NOW()
);
```

**Conflict Types**:

| Type | Description | Resolution |
|------|-------------|------------|
| `field_mismatch` | Same field modified in both places | User chooses version |
| `deletion_conflict` | Deleted in Zotero, modified locally | Restore or confirm delete |
| `merge_conflict` | Entity split in one system | LLM suggests merge |

**Resolution Strategies**:

```sql
-- Auto-resolve: Always prefer Zotero for bibliographic data
UPDATE zotero_sync_conflicts
SET resolution_status = 'resolved_remote',
    resolved_by = 'system',
    resolved_at = NOW()
WHERE conflict_type = 'field_mismatch'
  AND conflicting_fields <@ ARRAY['title', 'authors', 'year', 'doi'];

-- Auto-resolve: Always prefer local for extracted concepts
UPDATE zotero_sync_conflicts
SET resolution_status = 'resolved_local',
    resolved_by = 'system',
    resolved_at = NOW()
WHERE conflict_type = 'field_mismatch'
  AND conflicting_fields && ARRAY['extracted_concept_ids', 'definition'];
```

## Utility Functions

### 1. Get Entities by Zotero Collection
```sql
SELECT * FROM get_entities_by_zotero_collection('COLL_KEY');
```

Returns all entities (Concepts, Methods, etc.) associated with a Zotero collection.

### 2. Get Papers Pending Sync
```sql
SELECT * FROM get_papers_pending_zotero_sync('project-uuid');
```

Returns papers created/modified locally but not yet exported to Zotero.

### 3. Find Duplicate Entities for Merge
```sql
SELECT * FROM find_duplicate_entities_for_merge('project-uuid', 0.85);
```

Uses PostgreSQL `similarity()` function to find potential duplicates across sources.

### 4. Get Sync Statistics
```sql
SELECT * FROM get_zotero_sync_stats('project-uuid');
```

Returns comprehensive sync statistics:
```
total_papers | zotero_synced_papers | pdf_llm_papers | pending_sync | last_sync_time
-------------|----------------------|----------------|--------------|----------------
      150    |         120          |       30       |      10      | 2024-01-15 14:30
```

## Views

### 1. `papers_with_zotero_status`
```sql
SELECT * FROM papers_with_zotero_status
WHERE sync_status = 'not_synced';
```

Shows sync status for all papers with version comparison.

### 2. `entity_source_distribution`
```sql
SELECT * FROM entity_source_distribution
WHERE project_id = 'project-uuid';
```

Aggregates entity counts by type and source:
```
project_id | entity_type | node_source | entity_count | avg_confidence
-----------|-------------|-------------|--------------|---------------
  uuid-1   |   Concept   |   zotero    |      50      |     1.0
  uuid-1   |   Concept   |   pdf_llm   |     120      |     0.87
  uuid-1   |   Method    |   merged    |      15      |     0.92
```

### 3. `zotero_collection_tree`
```sql
SELECT * FROM zotero_collection_tree;
```

Hierarchical view of collections:
```
collection_key | name                | path                            | depth
---------------|---------------------|----------------------------------|------
   COLL1       | Meta-Analysis 2024  | Meta-Analysis 2024               |  0
   COLL2       | Education Studies   | Meta-Analysis 2024 > Education   |  1
   COLL3       | Psychology Studies  | Meta-Analysis 2024 > Psychology  |  1
```

## Triggers

### Automatic Sync State Update
```sql
CREATE TRIGGER trigger_entity_zotero_change
    AFTER UPDATE ON entities
    FOR EACH ROW
    WHEN (OLD.zotero_item_key IS NOT NULL)
    EXECUTE FUNCTION update_zotero_sync_state_on_change();
```

**Behavior**: When any entity with `zotero_item_key` is modified:
1. Sets `zotero_sync_state.sync_status = 'pending_changes'`
2. Updates `zotero_sync_state.updated_at`
3. Triggers background sync notification

## Workflow Examples

### Workflow 1: Initial Import from Zotero

```sql
-- 1. Create sync state
INSERT INTO zotero_sync_state (project_id, library_id, library_type, library_version)
VALUES ('proj-uuid', '12345', 'user', 0);

-- 2. Import papers
INSERT INTO paper_metadata (
    project_id, title, authors, year, doi,
    zotero_item_key, zotero_version, zotero_date_added
)
VALUES (
    'proj-uuid', 'Example Paper', '["Author 1"]', 2024, '10.1234/ex',
    'ABC123XY', 1, '2024-01-10'
);

-- 3. Extract concepts from papers (LLM)
INSERT INTO entities (
    project_id, entity_type, name, definition,
    node_source, source_metadata
)
VALUES (
    'proj-uuid', 'Concept', 'Transfer Learning', 'Application of...',
    'pdf_llm', '{"confidence": 0.92, "extracted_from": "ABC123XY"}'
);

-- 4. Update sync state
UPDATE zotero_sync_state
SET library_version = 123,
    last_sync_at = NOW(),
    last_successful_sync_at = NOW(),
    sync_status = 'up_to_date',
    items_synced = 150
WHERE project_id = 'proj-uuid';

-- 5. Log sync history
INSERT INTO zotero_sync_history (
    project_id, sync_type, sync_direction,
    started_at, completed_at, status,
    from_version, to_version,
    items_processed, items_added
)
VALUES (
    'proj-uuid', 'full', 'import',
    '2024-01-15 14:00:00', '2024-01-15 14:15:00', 'success',
    0, 123,
    150, 150
);
```

### Workflow 2: Incremental Sync (Zotero → ScholaRAG)

```sql
-- 1. Check current version
SELECT library_version FROM zotero_sync_state WHERE project_id = 'proj-uuid';
-- Returns: 123

-- 2. Fetch modified items from Zotero API
-- (Done in Python using ZoteroClient.get_items(since_version=123))

-- 3. Update existing papers
UPDATE paper_metadata
SET title = $1, zotero_version = $2, zotero_date_modified = NOW()
WHERE project_id = $3 AND zotero_item_key = $4;

-- 4. Insert new papers
INSERT INTO paper_metadata (...) VALUES (...);

-- 5. Update sync state
UPDATE zotero_sync_state
SET library_version = 130,
    last_sync_at = NOW(),
    last_successful_sync_at = NOW(),
    items_updated = 5,
    items_added = 2
WHERE project_id = 'proj-uuid';
```

### Workflow 3: Export to Zotero (ScholaRAG → Zotero)

```sql
-- 1. Find papers not yet in Zotero
SELECT * FROM get_papers_pending_zotero_sync('proj-uuid');

-- 2. Create items in Zotero via API
-- (Done in Python using ZoteroClient.create_items())

-- 3. Update paper_metadata with Zotero keys
UPDATE paper_metadata
SET zotero_item_key = $1,
    zotero_version = 1,
    zotero_date_added = NOW()
WHERE id = $2;

-- 4. Update sync state
UPDATE zotero_sync_state
SET items_added = items_added + $1
WHERE project_id = 'proj-uuid';
```

### Workflow 4: Merge Duplicate Entities

```sql
-- 1. Find duplicates
SELECT * FROM find_duplicate_entities_for_merge('proj-uuid', 0.85);

-- Result:
-- entity_1_id (zotero) | entity_2_id (pdf_llm) | similarity_score
-- uuid-1               | uuid-2                | 0.92

-- 2. Review and decide on merge strategy
-- Option A: Keep Zotero version (better metadata)
-- Option B: Keep PDF LLM version (better definition)
-- Option C: Merge both

-- 3. Merge entities
UPDATE entities
SET node_source = 'merged',
    source_metadata = jsonb_build_object(
        'merged_from', ARRAY['zotero', 'pdf_llm'],
        'confidence', 0.95
    ),
    definition = 'Combined definition from both sources'
WHERE id = 'uuid-1';

-- 4. Record merge history
INSERT INTO entity_merge_history (
    entity_id, source_type, source_entity_id,
    merge_strategy, changes_applied
)
VALUES (
    'uuid-1', 'pdf_llm', 'uuid-2',
    'auto_title_match', '{"definition": "merged", "confidence": "averaged"}'
);

-- 5. Delete duplicate
DELETE FROM entities WHERE id = 'uuid-2';
```

### Workflow 5: Resolve Sync Conflict

```sql
-- 1. Detect conflict
INSERT INTO zotero_sync_conflicts (
    project_id, entity_id, conflict_type,
    local_data, remote_data, conflicting_fields
)
VALUES (
    'proj-uuid', 'uuid-1', 'field_mismatch',
    '{"title": "Local Title", "year": 2024}',
    '{"title": "Remote Title", "year": 2024}',
    ARRAY['title']
);

-- 2. User reviews conflict in UI

-- 3. Resolve conflict (prefer remote)
UPDATE zotero_sync_conflicts
SET resolution_status = 'resolved_remote',
    resolved_by = 'user-123',
    resolved_at = NOW(),
    resolution_notes = 'Zotero version is more accurate'
WHERE id = 'conflict-uuid';

-- 4. Apply resolution
UPDATE paper_metadata
SET title = (
    SELECT remote_data->>'title'
    FROM zotero_sync_conflicts
    WHERE id = 'conflict-uuid'
)
WHERE id = 'paper-uuid';
```

## Index Recommendations

### Performance-Critical Indexes

```sql
-- Fast lookup by Zotero key
CREATE INDEX idx_entities_zotero_key ON entities(zotero_item_key)
    WHERE zotero_item_key IS NOT NULL;

-- Find entities by source
CREATE INDEX idx_entities_node_source ON entities(node_source);

-- Incremental sync queries
CREATE INDEX idx_paper_meta_zotero_version ON paper_metadata(zotero_version)
    WHERE zotero_version IS NOT NULL;

-- Collection membership queries
CREATE INDEX idx_entities_zotero_collections ON entities
    USING gin (zotero_collection_keys);

-- Conflict resolution queries
CREATE INDEX idx_zotero_conflicts_status ON zotero_sync_conflicts(resolution_status)
    WHERE resolution_status = 'pending';

-- Merge suggestion queries
CREATE INDEX idx_entities_source_similarity ON entities(project_id, entity_type, node_source);
```

### Composite Indexes

```sql
-- Find papers needing sync
CREATE INDEX idx_paper_meta_sync_pending ON paper_metadata(project_id, created_at)
    WHERE zotero_item_key IS NULL;

-- Entity deduplication
CREATE INDEX idx_entities_project_type_name ON entities(project_id, entity_type, name);
```

## Best Practices

### 1. Incremental Sync
- Always use `library_version` for incremental sync
- Store version in `zotero_sync_state` after each sync
- Use Zotero's `since` parameter to fetch only modified items

### 2. Conflict Resolution
- **Bibliographic fields** (title, authors, year): Prefer Zotero
- **Extracted concepts**: Prefer PDF LLM
- **Manual edits**: Always prefer local
- **Deletions**: Always ask user

### 3. Merge Strategies
- **Automatic merge** when similarity > 0.95 and same DOI
- **LLM suggestion** when similarity 0.85-0.95
- **Manual review** when similarity < 0.85
- Always log merge history

### 4. Performance
- Use batch operations for large imports
- Generate embeddings in parallel
- Defer relationship building until after import
- Use JSONB indexes for metadata queries

### 5. Data Integrity
- Never delete entities with `zotero_item_key` without user confirmation
- Always update `zotero_version` after changes
- Log all sync operations in `zotero_sync_history`
- Use transactions for multi-table updates

## Migration Checklist

- [ ] Run `005_zotero_hybrid_import.sql` migration
- [ ] Verify 5 new tables created
- [ ] Check `node_source` enum exists
- [ ] Test utility functions
- [ ] Verify triggers fire on entity updates
- [ ] Test views return correct data
- [ ] Update application code to use new fields
- [ ] Update Zotero integration to use new schema
- [ ] Test incremental sync workflow
- [ ] Test conflict resolution workflow
- [ ] Test merge workflow
- [ ] Update API documentation

## Future Enhancements

### Phase 2 Features
- [ ] Real-time sync using Zotero webhooks
- [ ] Automatic conflict resolution using LLM
- [ ] Bulk export of concept clusters to Zotero tags
- [ ] Collection-based project organization
- [ ] Zotero annotation import (PDF highlights)

### Phase 3 Features
- [ ] Multi-library sync (personal + group libraries)
- [ ] Selective sync (specific collections only)
- [ ] Version control for entities (git-like diffs)
- [ ] Collaborative editing with conflict detection

## References

- [Zotero Web API v3 Documentation](https://www.zotero.org/support/dev/web_api/v3/start)
- [ScholaRAG_Graph Concept-Centric Architecture](./migrations/004_concept_centric.sql)
- [AGENTiGraph Paper](https://arxiv.org/abs/2410.11531)
- [PostgreSQL Recursive Queries](https://www.postgresql.org/docs/current/queries-with.html)
