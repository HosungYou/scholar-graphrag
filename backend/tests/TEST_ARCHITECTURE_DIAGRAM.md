# Test Architecture Visual Diagram
## Zotero Hybrid Import Test Suite

---

## 1. Test Pyramid Structure

```
                        ▲
                       / \
                      /   \
                     /     \
                    /  E2E  \          5 tests (Slow, Full workflow)
                   /  Tests  \         Duration: 5-10 min
                  /-----------\
                 /             \
                / Integration   \     15 tests (Real services)
               /     Tests       \    Duration: 2-5 min
              /-------------------\
             /                     \
            /      Unit Tests       \   50+ tests (Fast, Isolated)
           /                         \  Duration: 10-30 sec
          /___________________________\

         ← Confidence                Speed →
         ← Slower                    Faster →
         ← Fewer Tests               More Tests →
```

---

## 2. Test Flow Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         TEST SUITE LAYERS                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  [1] UNIT TESTS (Backend Logic Only)                                │
│      ┌──────────────────────────────────────────────────────────┐  │
│      │  test_zotero_local_client.py                             │  │
│      │  ├─ Connection tests (mocked HTTP)                       │  │
│      │  ├─ Collection fetching (mocked responses)               │  │
│      │  └─ Item/Attachment parsing                              │  │
│      │                                                           │  │
│      │  test_hybrid_importer.py                                 │  │
│      │  ├─ Phase 1: Zotero fetch (mocked client)                │  │
│      │  ├─ Phase 2: PDF extraction (mocked files)               │  │
│      │  ├─ Phase 3: Merge logic (pure algorithms)               │  │
│      │  ├─ Phase 4: Entity extraction (mocked LLM)              │  │
│      │  └─ Phase 5: Graph building (mocked store)               │  │
│      │                                                           │  │
│      │  test_merge_logic.py                                     │  │
│      │  ├─ Title merging algorithms                             │  │
│      │  ├─ Abstract conflict resolution                         │  │
│      │  └─ Author name normalization                            │  │
│      └──────────────────────────────────────────────────────────┘  │
│                             ↓                                        │
│  [2] INTEGRATION TESTS (Real Components)                            │
│      ┌──────────────────────────────────────────────────────────┐  │
│      │  test_zotero_desktop_integration.py                      │  │
│      │  ├─ Real Zotero Desktop connection                       │  │
│      │  ├─ Real collection fetching                             │  │
│      │  └─ Real PDF file reading                                │  │
│      │     (Requires: Zotero Desktop + Test Data)               │  │
│      │                                                           │  │
│      │  test_database_integration.py                            │  │
│      │  ├─ Real PostgreSQL + pgvector                           │  │
│      │  ├─ GraphStore CRUD operations                           │  │
│      │  └─ Node/Edge persistence                                │  │
│      │     (Requires: Test Database)                            │  │
│      │                                                           │  │
│      │  test_end_to_end_pipeline.py                             │  │
│      │  ├─ Full pipeline with mocks                             │  │
│      │  ├─ Error recovery testing                               │  │
│      │  └─ Performance benchmarking                             │  │
│      └──────────────────────────────────────────────────────────┘  │
│                             ↓                                        │
│  [3] E2E TESTS (Full API + Frontend)                                │
│      ┌──────────────────────────────────────────────────────────┐  │
│      │  test_api_endpoints.py                                   │  │
│      │  ├─ GET /api/import/zotero/status                        │  │
│      │  ├─ GET /api/import/zotero/collections                   │  │
│      │  ├─ POST /api/import/zotero/import                       │  │
│      │  └─ GET /api/import/status/{job_id}                      │  │
│      │                                                           │  │
│      │  test_full_import_workflow.py                            │  │
│      │  ├─ Start import → Poll status → Verify result           │  │
│      │  ├─ Error handling (disconnection, timeout)              │  │
│      │  └─ Concurrent import jobs                               │  │
│      └──────────────────────────────────────────────────────────┘  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Mock vs Real Dependencies

```
Component                   Unit Tests         Integration Tests    E2E Tests
─────────────────────────────────────────────────────────────────────────────
Zotero Desktop              MOCKED             REAL*                REAL*
PDF Files                   MOCKED             REAL (fixtures)      REAL
PostgreSQL                  MOCKED             REAL (test DB)       REAL (test DB)
LLM API (Claude)            MOCKED             MOCKED               MOCKED**
GraphStore                  MOCKED             REAL                 REAL
FastAPI Server              N/A                N/A                  REAL

* Optional: Can run with mocks if Zotero not available
** Avoid API costs in CI/CD
```

---

## 4. Test Data Flow

```
┌────────────────────────────────────────────────────────────────────────┐
│                     FIXTURES & MOCK DATA SOURCES                       │
├────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  conftest.py (Global Fixtures)                                         │
│  ├─ mock_db                   → Mocked PostgreSQL connection           │
│  ├─ mock_graph_store          → Mocked GraphStore methods              │
│  ├─ mock_llm_provider         → Mocked entity extraction               │
│  └─ async_client              → FastAPI TestClient                     │
│                                                                         │
│  fixtures/zotero_fixtures.py (Domain-Specific)                         │
│  ├─ sample_zotero_collection  → {"key": "ABC", "name": "Test"}        │
│  ├─ sample_zotero_items       → [{"key": "ITEM001", "title": ...}]   │
│  ├─ sample_zotero_attachments → PDF file metadata                      │
│  └─ large_zotero_collection   → 100+ items for performance tests      │
│                                                                         │
│  fixtures/pdf_fixtures.py                                              │
│  ├─ sample_pdf_content        → Extracted text content                 │
│  ├─ temp_pdf_directory        → tmpfs directory for test PDFs          │
│  └─ generate_test_pdf()       → Creates fake PDF files                 │
│                                                                         │
│  mocks/mock_zotero_responses.py                                        │
│  ├─ HTTP response mocks       → Simulates Zotero API responses         │
│  └─ Connection failure mocks  → Timeout/refused scenarios              │
│                                                                         │
└────────────────────────────────────────────────────────────────────────┘
                                   ↓
                    ┌──────────────────────────────┐
                    │    Tests Consume Fixtures    │
                    └──────────────────────────────┘
                                   ↓
┌────────────────────────────────────────────────────────────────────────┐
│  Test File                 Fixtures Used                                │
├────────────────────────────────────────────────────────────────────────┤
│  test_zotero_local_client  mock_zotero_responses, sample_collections   │
│  test_hybrid_importer      mock_zotero_client, sample_items, mock_llm  │
│  test_merge_logic          merge_test_scenarios                        │
│  test_e2e_pipeline         async_client, mock_db, sample_items         │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Test Execution Flow (CI/CD)

```
┌────────────────────────────────────────────────────────────────────────┐
│                    GitHub Actions Workflow                              │
├────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  on: push / pull_request                                               │
│      ↓                                                                  │
│  [Job 1: Unit Tests]                ← Runs on every commit             │
│      ├─ Setup Python 3.11                                              │
│      ├─ Install dependencies                                           │
│      ├─ pytest tests/unit/ -v -m "not requires_zotero"                 │
│      ├─ Generate coverage report                                       │
│      └─ Upload to Codecov                                              │
│         Duration: ~30 seconds                                          │
│         Status: ✅ PASS → Proceed                                      │
│                 ❌ FAIL → Block PR merge                               │
│                                                                         │
│      ↓ (only if unit tests pass)                                       │
│                                                                         │
│  [Job 2: Integration Tests]         ← Runs after unit tests pass       │
│      ├─ Setup Python 3.11                                              │
│      ├─ Start PostgreSQL service (Docker)                              │
│      ├─ Install dependencies                                           │
│      ├─ pytest tests/integration/ -v -m "not requires_zotero"          │
│      └─ Cleanup test database                                          │
│         Duration: ~2 minutes                                           │
│         Status: ✅ PASS → Proceed                                      │
│                 ❌ FAIL → Block PR merge                               │
│                                                                         │
│      ↓ (only if integration tests pass)                                │
│                                                                         │
│  [Job 3: E2E Tests]                 ← Runs after integration tests     │
│      ├─ Setup Python 3.11                                              │
│      ├─ Start PostgreSQL service                                       │
│      ├─ Start FastAPI server (background)                              │
│      ├─ pytest tests/e2e/ -v                                           │
│      └─ Shutdown services                                              │
│         Duration: ~5 minutes                                           │
│         Status: ✅ PASS → Allow PR merge                               │
│                 ❌ FAIL → Block PR merge                               │
│                                                                         │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Coverage Tracking

```
┌────────────────────────────────────────────────────────────────────────┐
│                    Coverage Requirements by Module                      │
├────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Module                                Target    Current   Status      │
│  ───────────────────────────────────────────────────────────────────  │
│  integrations/zotero_local.py          85%       -         🆕 NEW     │
│  importers/hybrid_zotero_importer.py   90%       -         🆕 NEW     │
│  importers/merge_logic.py              95%       -         🆕 NEW     │
│  routers/import_routes.py (Zotero)     80%       -         🆕 NEW     │
│  ───────────────────────────────────────────────────────────────────  │
│  OVERALL TARGET                        80%       -                    │
│                                                                         │
│  Coverage Report Locations:                                            │
│  ├─ Terminal: pytest --cov-report=term-missing                         │
│  ├─ HTML: htmlcov/index.html                                           │
│  └─ CI: Codecov dashboard (uploaded automatically)                     │
│                                                                         │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Test Markers (pytest -m)

```
Marker                 Description                           Skip if...
─────────────────────────────────────────────────────────────────────────
unit                   Fast, isolated unit tests             N/A
integration            Requires real services                CI environment
e2e                    Full workflow tests                   CI environment
slow                   Takes >30 seconds                     Local dev
requires_zotero        Needs Zotero Desktop running          No Zotero
requires_pdf           Needs PDF processing libraries        Minimal install
contract               API contract validation               N/A

Usage Examples:
  pytest -m "unit"                     # Run only unit tests (fast)
  pytest -m "not requires_zotero"      # Skip Zotero Desktop tests
  pytest -m "integration and not slow" # Integration tests, exclude slow
  pytest -m "unit or integration"      # Run unit + integration
```

---

## 8. Test Dependencies Graph

```
                    ┌──────────────────┐
                    │   conftest.py    │
                    │  (Base Fixtures) │
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              ↓              ↓              ↓
     ┌────────────┐  ┌─────────────┐  ┌──────────────┐
     │  Zotero    │  │    PDF      │  │   Database   │
     │  Fixtures  │  │  Fixtures   │  │   Fixtures   │
     └─────┬──────┘  └──────┬──────┘  └──────┬───────┘
           │                │                 │
           └────────────────┼─────────────────┘
                            ↓
              ┌─────────────────────────────┐
              │    Test Files Import All     │
              ├─────────────────────────────┤
              │  - test_zotero_local_client │
              │  - test_hybrid_importer     │
              │  - test_merge_logic         │
              │  - test_e2e_pipeline        │
              └─────────────────────────────┘
```

---

## 9. Performance Testing Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                    Performance Benchmarks                               │
├────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Test Scenario                      Target Duration    Max Papers      │
│  ─────────────────────────────────────────────────────────────────────│
│  Phase 1: Fetch 100 items           < 5 seconds        100             │
│  Phase 2: Extract 50 PDFs           < 2 min            50              │
│  Phase 3: Merge 100 papers          < 10 seconds       100             │
│  Phase 4: Extract entities (50)     < 2 min*           50              │
│  Phase 5: Build graph (100 papers)  < 15 seconds       100             │
│  ─────────────────────────────────────────────────────────────────────│
│  FULL PIPELINE: 100 papers          < 5 min            100             │
│                                                                         │
│  * With mocked LLM (real LLM would be ~10-15 min due to API limits)   │
│                                                                         │
│  Performance Tests Use:                                                │
│  ├─ large_zotero_collection fixture (100+ items)                       │
│  ├─ pytest-benchmark for timing                                        │
│  └─ Memory profiling with memory_profiler                              │
│                                                                         │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 10. Error Scenarios Coverage

```
┌────────────────────────────────────────────────────────────────────────┐
│                    Error Handling Test Matrix                           │
├────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Error Type                Test Coverage              Expected Behavior│
│  ─────────────────────────────────────────────────────────────────────│
│  Zotero disconnected       ✅ test_connection_failure  Retry + error msg│
│  Empty collection          ✅ test_empty_collection    Graceful skip   │
│  Missing PDFs              ✅ test_missing_pdf         Continue w/o PDF│
│  Corrupted PDF             ✅ test_pdf_corruption      Skip + log error│
│  LLM API timeout           ✅ test_llm_timeout         Retry 3x + fail │
│  Database connection lost  ✅ test_db_disconnect       Rollback + error│
│  Merge conflicts           ✅ test_merge_conflicts     Smart resolution│
│  Partial import failure    ✅ test_partial_failure     Save progress   │
│  Concurrent imports        ✅ test_concurrent_jobs     Job isolation   │
│                                                                         │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 11. Test Execution Cheat Sheet

```bash
# Quick Reference for Common Test Commands

# Development (Local)
pytest tests/unit/ -v                          # Fast unit tests only
pytest tests/unit/ -v --cov=importers          # With coverage
pytest -k "test_merge" -v                      # Run specific test name
pytest --lf                                    # Run only last failed tests
pytest --maxfail=3                             # Stop after 3 failures

# Integration (Requires Services)
docker-compose up -d postgres                  # Start test database
pytest tests/integration/ -v                   # Run integration tests
docker-compose down                            # Cleanup

# Pre-commit (Before Push)
pytest -m "unit or integration" --cov=importers --cov-fail-under=75

# CI/CD (Automated)
pytest -v --cov=importers --cov=integrations --cov-report=xml

# Performance Testing
pytest -m slow --benchmark-only                # Benchmarks only
pytest --durations=10                          # Show 10 slowest tests

# Debug Mode
pytest -v -s                                   # Show print statements
pytest -v --pdb                                # Drop into debugger on failure
pytest -v --log-cli-level=DEBUG                # Verbose logging
```

---

## Summary

This test architecture provides:

1. **Layered Testing**: Unit → Integration → E2E for comprehensive coverage
2. **Fast Feedback**: Unit tests complete in 30 seconds for rapid iteration
3. **Isolation**: Mocks allow testing without external dependencies
4. **Flexibility**: Can run with/without Zotero Desktop, LLM API, etc.
5. **CI/CD Ready**: Automated pipeline with clear pass/fail gates
6. **Performance Aware**: Benchmarks ensure scalability
7. **Error Resilience**: Comprehensive error scenario coverage
8. **Maintainable**: Clear structure, fixtures, and documentation

**Recommended Test Execution Order**:
1. **During Development**: `pytest tests/unit/ -v` (fast iteration)
2. **Before Commit**: `pytest -m "unit or integration"` (verify changes)
3. **In CI/CD**: Full suite with coverage reporting
4. **Manual QA**: `pytest -m requires_zotero` (with real Zotero Desktop)
