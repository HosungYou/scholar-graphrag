# Zotero Hybrid Import Test Suite - Implementation Guide
## Step-by-Step Setup Instructions

---

## Phase 1: Environment Setup (Day 1)

### 1.1 Install Test Dependencies

```bash
cd /Volumes/External\ SSD/Projects/Research/ScholaRAG_Graph_Review/backend

# Activate virtual environment
source venv/bin/activate

# Install testing packages
pip install pytest==7.4.3
pip install pytest-asyncio==0.21.1
pip install pytest-cov==4.1.0
pip install pytest-mock==3.12.0
pip install httpx==0.25.2

# Optional: Performance testing
pip install pytest-benchmark==4.0.0
pip install memory-profiler==0.61.0

# Update requirements.txt
pip freeze > requirements-test.txt
```

### 1.2 Update pytest.ini

```bash
# Copy the extended pytest.ini configuration
cp tests/ZOTERO_HYBRID_IMPORT_TEST_DESIGN.md tests/pytest.ini

# Or manually update existing pytest.ini with new markers
```

### 1.3 Create Test Directory Structure

```bash
cd tests/

# Create new directories
mkdir -p fixtures
mkdir -p unit
mkdir -p integration
mkdir -p e2e
mkdir -p mocks

# Create __init__.py files
touch fixtures/__init__.py
touch unit/__init__.py
touch integration/__init__.py
touch e2e/__init__.py
touch mocks/__init__.py
```

---

## Phase 2: Fixtures Implementation (Day 2)

### 2.1 Extend conftest.py

```bash
# Edit tests/conftest.py
# Add Zotero-specific fixtures from ZOTERO_HYBRID_IMPORT_TEST_DESIGN.md
```

**Key fixtures to add:**
- `sample_zotero_collection`
- `sample_zotero_items`
- `sample_zotero_attachments`
- `mock_zotero_local_client`
- `temp_pdf_directory`
- `sample_pdf_content`
- `mock_graph_store`
- `mock_llm_provider`

### 2.2 Create fixtures/zotero_fixtures.py

```bash
touch tests/fixtures/zotero_fixtures.py
```

Implement helper functions:
- `generate_zotero_item()`
- `generate_zotero_collection()`
- `large_zotero_collection()` (fixture)

### 2.3 Create mocks/mock_zotero_responses.py

```python
# tests/mocks/mock_zotero_responses.py

"""Mock HTTP responses for Zotero API."""

def get_mock_connection_response():
    """Mock successful connection response."""
    return {"version": "6.0.30", "api_version": "3"}

def get_mock_collections_response():
    """Mock collections list response."""
    return [
        {
            "key": "ABCD1234",
            "version": 100,
            "data": {"name": "Test Collection"},
            "meta": {"numItems": 15}
        }
    ]

# Add more mock responses...
```

---

## Phase 3: Unit Tests Implementation (Days 3-4)

### 3.1 Create test_zotero_local_client.py

```bash
touch tests/unit/test_zotero_local_client.py
```

**Implementation checklist:**
- [ ] `TestZoteroLocalClientConnection` class
  - [ ] `test_connection_success`
  - [ ] `test_connection_failure_timeout`
  - [ ] `test_connection_failure_refused`
- [ ] `TestZoteroLocalClientCollections` class
  - [ ] `test_get_collections_success`
  - [ ] `test_get_collections_empty`
- [ ] `TestZoteroLocalClientItems` class
  - [ ] `test_get_items_in_collection`
  - [ ] `test_get_items_filters_non_papers`
- [ ] `TestZoteroLocalClientAttachments` class
  - [ ] `test_get_attachments_for_item`
  - [ ] `test_get_attachments_no_pdfs`

**Verify tests pass:**
```bash
pytest tests/unit/test_zotero_local_client.py -v
```

### 3.2 Create test_hybrid_importer.py

```bash
touch tests/unit/test_hybrid_importer.py
```

**Implementation checklist:**
- [ ] `TestHybridImporterPhase1` (Zotero fetch)
- [ ] `TestHybridImporterPhase2` (PDF extraction)
- [ ] `TestHybridImporterPhase3` (Merge logic)
- [ ] `TestHybridImporterPhase4` (Entity extraction)
- [ ] `TestHybridImporterPhase5` (Graph building)
- [ ] `TestHybridImporterFullPipeline` (E2E unit test)

**Verify tests pass:**
```bash
pytest tests/unit/test_hybrid_importer.py -v
```

### 3.3 Create test_merge_logic.py

```bash
touch tests/unit/test_merge_logic.py
```

**Implementation checklist:**
- [ ] `TestTitleMerge` class
  - [ ] `test_identical_titles`
  - [ ] `test_similar_titles_with_punctuation`
  - [ ] `test_case_insensitive_matching`
- [ ] `TestAbstractMerge` class
  - [ ] `test_prefer_longer_abstract`
  - [ ] `test_abstract_truncation_detection`
- [ ] `TestAuthorsMerge` class
  - [ ] `test_merge_identical_authors`
  - [ ] `test_merge_with_name_variations`
  - [ ] `test_merge_with_extra_pdf_authors`
- [ ] `TestMergeStrategies` class
- [ ] `TestConflictResolution` class

**Verify tests pass:**
```bash
pytest tests/unit/test_merge_logic.py -v
```

---

## Phase 4: Integration Tests (Day 5)

### 4.1 Setup Test Database

```bash
# Create test database
createdb scholarag_test

# Install pgvector extension
psql scholarag_test -c "CREATE EXTENSION IF NOT EXISTS vector;"

# Run migrations (if applicable)
psql scholarag_test < database/migrations/001_init.sql
```

### 4.2 Create test_zotero_desktop_integration.py

```bash
touch tests/integration/test_zotero_desktop_integration.py
```

**Implementation checklist:**
- [ ] `TestZoteroDesktopIntegration` class (requires Zotero Desktop)
  - [ ] `test_fetch_real_collection`
  - [ ] `test_fetch_real_pdf_attachments`
- [ ] `TestFullHybridImportIntegration` class
  - [ ] `test_complete_import_workflow`

**Manual test with Zotero Desktop:**
```bash
# Ensure Zotero Desktop is running with test data
pytest tests/integration/ -v -m "requires_zotero"
```

### 4.3 Create test_database_integration.py

```bash
touch tests/integration/test_database_integration.py
```

**Implementation checklist:**
- [ ] `TestGraphStoreIntegration` class
  - [ ] `test_create_project`
  - [ ] `test_add_node_and_retrieve`
  - [ ] `test_add_edge_and_retrieve`
  - [ ] `test_deduplication_logic`

**Run with test database:**
```bash
export DATABASE_URL=postgresql://test:test@localhost:5432/scholarag_test
pytest tests/integration/test_database_integration.py -v
```

### 4.4 Create test_end_to_end_pipeline.py

```bash
touch tests/integration/test_end_to_end_pipeline.py
```

**Implementation checklist:**
- [ ] `TestEndToEndPipeline` class
  - [ ] `test_pipeline_with_mock_data`
  - [ ] `test_error_recovery`

---

## Phase 5: E2E Tests (Day 6)

### 5.1 Create test_api_endpoints.py

```bash
touch tests/e2e/test_api_endpoints.py
```

**Implementation checklist:**
- [ ] `TestZoteroImportAPIEndpoints` class
  - [ ] `test_check_zotero_status_endpoint`
  - [ ] `test_get_collections_endpoint`
  - [ ] `test_start_import_endpoint`
  - [ ] `test_get_import_status_endpoint`
- [ ] `TestZoteroImportJobPolling` class
  - [ ] `test_job_lifecycle`

**Run E2E tests:**
```bash
# Start backend server in background
uvicorn main:app --port 8000 &

# Run E2E tests
pytest tests/e2e/test_api_endpoints.py -v

# Cleanup
pkill -f uvicorn
```

### 5.2 Create test_full_import_workflow.py

```bash
touch tests/e2e/test_full_import_workflow.py
```

**Implementation checklist:**
- [ ] Test complete workflow from API call to graph visualization
- [ ] Test concurrent import jobs
- [ ] Test error handling in API layer

---

## Phase 6: CI/CD Integration (Day 7)

### 6.1 Create GitHub Actions Workflow

```bash
mkdir -p .github/workflows
touch .github/workflows/backend-tests.yml
```

Copy the workflow configuration from `ZOTERO_HYBRID_IMPORT_TEST_DESIGN.md` Section 8.

### 6.2 Test Locally with Act (Optional)

```bash
# Install act (GitHub Actions local runner)
brew install act

# Run workflow locally
act -j unit-tests
act -j integration-tests
```

### 6.3 Configure Codecov

```bash
# Add codecov.yml to project root
cat > codecov.yml << EOF
coverage:
  status:
    project:
      default:
        target: 80%
        threshold: 2%
    patch:
      default:
        target: 75%
EOF
```

---

## Verification Checklist

### Unit Tests
```bash
# Run all unit tests
pytest tests/unit/ -v

# Expected output:
# tests/unit/test_zotero_local_client.py::TestZoteroLocalClientConnection::test_connection_success PASSED
# tests/unit/test_zotero_local_client.py::TestZoteroLocalClientConnection::test_connection_failure_timeout PASSED
# ... (50+ tests)
# ======================== 50 passed in 25.00s ========================
```

### Integration Tests
```bash
# Start test database
docker-compose up -d postgres

# Run integration tests
pytest tests/integration/ -v -m "not requires_zotero"

# Expected output:
# tests/integration/test_database_integration.py::TestGraphStoreIntegration::test_create_project PASSED
# ... (15 tests)
# ======================== 15 passed in 120.00s ========================
```

### E2E Tests
```bash
# Start backend server
uvicorn main:app --port 8000 &

# Run E2E tests
pytest tests/e2e/ -v

# Expected output:
# tests/e2e/test_api_endpoints.py::TestZoteroImportAPIEndpoints::test_check_zotero_status_endpoint PASSED
# ... (5 tests)
# ======================== 5 passed in 60.00s ========================

# Cleanup
pkill -f uvicorn
```

### Coverage Report
```bash
# Generate coverage report
pytest --cov=importers --cov=integrations --cov-report=html

# Open report
open htmlcov/index.html

# Expected coverage:
# integrations/zotero_local.py          85%
# importers/hybrid_zotero_importer.py   90%
# importers/merge_logic.py              95%
# TOTAL                                 80%
```

---

## Common Issues & Solutions

### Issue 1: Import Errors
**Problem:** `ImportError: cannot import name 'ZoteroLocalClient'`

**Solution:**
```bash
# Ensure PYTHONPATH includes project root
export PYTHONPATH="${PYTHONPATH}:/Volumes/External SSD/Projects/Research/ScholaRAG_Graph_Review/backend"

# Or add to pytest.ini:
# pythonpath = .
```

### Issue 2: Async Tests Fail
**Problem:** `RuntimeError: Event loop is closed`

**Solution:**
```bash
# Ensure pytest-asyncio is installed
pip install pytest-asyncio

# Verify pytest.ini has:
# asyncio_mode = auto
```

### Issue 3: Database Connection Fails
**Problem:** `psycopg2.OperationalError: could not connect to server`

**Solution:**
```bash
# Start PostgreSQL
brew services start postgresql

# Or use Docker:
docker-compose up -d postgres

# Verify connection:
psql -h localhost -U test -d scholarag_test -c "SELECT 1;"
```

### Issue 4: Zotero Tests Skipped
**Problem:** All `requires_zotero` tests skipped

**Solution:**
```bash
# This is expected if Zotero Desktop is not running
# To run these tests:
# 1. Open Zotero Desktop
# 2. Enable "Allow other applications to communicate" in Preferences
# 3. Run: pytest -m "requires_zotero" -v
```

---

## Test Execution Summary

| Command | Duration | When to Use |
|---------|----------|-------------|
| `pytest tests/unit/ -v` | ~30 sec | During development (every save) |
| `pytest tests/integration/ -v` | ~2 min | Before committing changes |
| `pytest tests/e2e/ -v` | ~5 min | Before pushing to remote |
| `pytest -m "requires_zotero"` | Varies | Manual QA with real Zotero |
| `pytest --cov` | ~3 min | Before PR submission |

---

## Next Steps After Implementation

1. **Run Full Test Suite:**
   ```bash
   pytest -v --cov=importers --cov=integrations --cov-report=html
   ```

2. **Review Coverage Report:**
   - Identify uncovered code paths
   - Add tests for edge cases
   - Target 80%+ coverage

3. **Set Up Pre-commit Hooks:**
   ```bash
   pip install pre-commit
   pre-commit install
   ```

4. **Configure IDE Test Runner:**
   - VSCode: Python Test Explorer
   - PyCharm: Built-in pytest integration

5. **Document Test Patterns:**
   - Add examples to team wiki
   - Share best practices
   - Update onboarding docs

---

## Resources

- **pytest Documentation**: https://docs.pytest.org
- **pytest-asyncio**: https://pytest-asyncio.readthedocs.io
- **Coverage.py**: https://coverage.readthedocs.io
- **GitHub Actions**: https://docs.github.com/en/actions
- **Codecov**: https://docs.codecov.com

---

## Contact & Support

For questions or issues during implementation:
- Check existing tests in `tests/test_integrations.py` for patterns
- Review pytest documentation for specific features
- Consult team members for domain-specific logic

**Expected Total Implementation Time:** 7 days (1 developer)

**Maintenance Effort:** ~2 hours/week for new features
