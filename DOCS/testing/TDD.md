# Test Design Document (TDD)

**Project**: ScholaRAG_Graph
**Version**: 0.13.1
**Last Updated**: 2026-02-07
**Status**: Active
**Related**: [SDD](../architecture/SDD.md)

---

## 1. Test Strategy

### 1.1 Overview

ScholaRAG_Graph employs a multi-layer testing strategy covering unit tests, integration tests, and API contract tests across both backend (Python/FastAPI) and frontend (TypeScript/Next.js).

### 1.2 Test Pyramid

| Layer | Framework | Scope | Count Target |
|-------|-----------|-------|-------------|
| **Unit** | pytest / Jest | Individual functions, utilities, models | 60% of tests |
| **Integration** | pytest-asyncio + httpx | API endpoints, database operations | 30% of tests |
| **E2E** | (planned) | Critical user flows | 10% of tests |

### 1.3 Coverage Targets

| Component | Target | Current |
|-----------|--------|---------|
| Backend utilities | 90%+ | ~85% |
| Backend routers | 80%+ | ~70% |
| Frontend API client | 80%+ | ~60% |
| Frontend components | 60%+ | ~30% |

---

## 2. Test Infrastructure

### 2.1 Backend (Python)

**Framework**: pytest 8.0+ with pytest-asyncio

**Configuration**: `backend/tests/conftest.py`

**Key Fixtures**:

| Fixture | Type | Purpose |
|---------|------|---------|
| `app` | sync | FastAPI app instance |
| `async_client` | async | httpx.AsyncClient with ASGI transport |
| `mock_db` | sync | Mocked database with AsyncMock methods |
| `sample_project` | sync | Sample project data |
| `sample_node` | sync | Sample graph node |
| `sample_edge` | sync | Sample graph edge |

**Run Command**:
```bash
cd backend && python -m pytest tests/ -v
```

### 2.2 Frontend (TypeScript)

**Framework**: Jest with @testing-library/react

**Pattern**: Mock `global.fetch` and `@/lib/supabase` for API client tests

**Run Command**:
```bash
cd frontend && npm test
```

---

## 3. Test File Index

### 3.1 Backend Tests

| File | Module Under Test | Test Count | Coverage |
|------|-------------------|------------|----------|
| `test_settings.py` | `routers/settings.py` | 20+ | Unit + Integration |
| `test_chat_router.py` | `routers/chat.py` | 10+ | Unit + Integration |
| `test_graph_router.py` | `routers/graph.py` | 10+ | Integration |
| `test_importer.py` | `importers/` | 10+ | Integration |
| `test_agents.py` | `agents/` | 5+ | Unit |
| `test_auth.py` | `auth/` | 10+ | Unit + Integration |
| `test_auth_policies.py` | `auth/policies.py` | 5+ | Unit |
| `test_entity_extractor.py` | `graph/entity_extractor.py` | 5+ | Unit |
| `test_gap_detector.py` | `graph/gap_detector.py` | 5+ | Unit |
| `test_integrations.py` | `integrations/` | 5+ | Integration |
| `test_api_contracts.py` | API contracts | 10+ | Contract |
| `test_api_integration.py` | Full API flow | 5+ | Integration |
| `test_zotero_api.py` | `integrations/zotero/` | 5+ | Integration |
| `test_zotero_rdf_importer.py` | `importers/zotero_rdf/` | 5+ | Integration |
| `test_infranodus_api.py` | InfraNodus endpoints | 5+ | Integration |
| `test_infranodus_migrations.py` | DB migrations | 3+ | Migration |

### 3.2 Frontend Tests

| File | Module Under Test | Test Count | Coverage |
|------|-------------------|------------|----------|
| `__tests__/lib/api.test.ts` | `lib/api.ts` (explainNode) | 4 | Unit |
| `__tests__/lib/settings-api.test.ts` | `lib/api.ts` (settings methods) | 10+ | Unit |
| `__tests__/components/graph/Graph3D.test.tsx` | `Graph3D` component | 3+ | Component |
| `__tests__/hooks/useGraphStore.test.ts` | `useGraphStore` hook | 3+ | Unit |
| `__tests__/components/ui/ErrorDisplay.test.tsx` | `ErrorDisplay` | 2+ | Component |
| `__tests__/components/ui/Skeleton.test.tsx` | `Skeleton` | 2+ | Component |
| `__tests__/components/auth/LoginForm.test.tsx` | `LoginForm` | 3+ | Component |

---

## 4. Test Specifications by Feature

### 4.1 API Key Settings (v0.13.1)

**Backend** (`test_settings.py`):

| Test Class | Test Case | Type |
|------------|-----------|------|
| `TestMaskApiKey` | Normal key masking (>8 chars) | Unit |
| `TestMaskApiKey` | Short key masking (<8 chars) | Unit |
| `TestMaskApiKey` | Empty string | Unit |
| `TestMaskApiKey` | Boundary (exactly 8 chars) | Unit |
| `TestGetServerApiKey` | Known provider returns value | Unit |
| `TestGetServerApiKey` | Unknown provider returns empty | Unit |
| `TestGetApiKeys` | Returns all 6 providers | Integration |
| `TestGetApiKeys` | User key priority over server key | Integration |
| `TestGetApiKeys` | No key shows is_set=False | Integration |
| `TestUpdateApiKeys` | Sets new API key | Integration |
| `TestUpdateApiKeys` | Empty string deletes key | Integration |
| `TestUpdateApiKeys` | Updates LLM provider/model | Integration |
| `TestUpdateApiKeys` | 401 without authentication | Integration |
| `TestValidateApiKey` | Groq format validation | Unit |
| `TestValidateApiKey` | Anthropic format validation | Unit |
| `TestValidateApiKey` | OpenAI format validation | Unit |
| `TestValidateApiKey` | S2 live API validation | Integration |
| `TestValidateApiKey` | Empty key returns invalid | Unit |
| `TestValidateApiKey` | Unknown provider | Unit |
| `TestValidateApiKey` | Timeout handling | Integration |

**Frontend** (`settings-api.test.ts`):

| Test Case | Type |
|-----------|------|
| getApiKeys sends GET to correct URL | Unit |
| getApiKeys includes auth header | Unit |
| updateApiKeys sends PUT with flat JSON | Unit |
| updateApiKeys merges keys and options | Unit |
| updateApiKeys works with keys only | Unit |
| validateApiKey sends POST with provider/key | Unit |
| validateApiKey returns validation result | Unit |

### 4.2 Chat/Explain (v0.9.0-v0.10.0)

Tests for UUID fallback in explain endpoint — see `test_chat_router.py`.

### 4.3 Graph Router

Graph visualization, gap analysis, temporal timeline — see `test_graph_router.py`, `test_infranodus_api.py`.

---

## 5. Mocking Strategy

### 5.1 Database Mocking

```python
# Backend: Use conftest.py mock_db fixture
@pytest.fixture
def mock_db():
    db = MagicMock()
    db.fetch_one = AsyncMock(return_value={"preferences": {"api_keys": {}}})
    db.execute = AsyncMock(return_value="UPDATE 1")
    return db
```

### 5.2 External API Mocking

```python
# Backend: Mock httpx for S2 validation
with patch("routers.settings.httpx.AsyncClient") as mock_client:
    mock_response = MagicMock(status_code=200)
    mock_client.return_value.__aenter__.return_value.get = AsyncMock(return_value=mock_response)
```

### 5.3 Auth Mocking

```python
# Backend: Override require_auth_if_configured dependency
app.dependency_overrides[require_auth_if_configured] = lambda: mock_user
```

### 5.4 Frontend Mocking

```typescript
// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock Supabase auth
jest.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: jest.fn().mockResolvedValue({...}) } }
}));
```

---

## 6. CI/CD Integration

### 6.1 Current Status

- **Backend**: Manual `pytest` execution
- **Frontend**: Manual `npm test` execution
- **CI Pipeline**: Not yet configured (planned)

### 6.2 Planned

| Stage | Tool | Trigger |
|-------|------|---------|
| Lint | flake8 + ESLint | Pre-commit |
| Unit Tests | pytest + Jest | PR creation |
| Integration Tests | pytest-asyncio | PR creation |
| Coverage Report | coverage.py + jest --coverage | PR merge |

---

## Change Log

| Date | Version | Changes |
|------|---------|---------|
| 2026-02-07 | 1.0.0 | Initial TDD document for v0.13.1 |

