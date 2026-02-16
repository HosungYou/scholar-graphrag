# Test Design Document (TDD)

**Project**: ScholaRAG_Graph
**Version**: 0.17.0
**Last Updated**: 2026-02-13
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

### 4.4 DraggablePanel Enhancements (v0.14.1)

**Frontend** (planned):

| Test Case | Type |
|-----------|------|
| Double-click drag handle resets position to default | Unit |
| Reset clears localStorage entry | Unit |
| CollapsibleContent animates height on open/close | Component |
| Touch events trigger drag on mobile | Component |
| useDraggablePanelReset returns reset function | Unit |

### 4.5 GapPanel Enhancements (v0.14.1)

**Frontend** (planned):

| Test Case | Type |
|-----------|------|
| ArrowDown moves focus to next gap | Unit |
| ArrowUp moves focus to previous gap | Unit |
| Enter key selects focused gap | Unit |
| Escape key clears selection and focus | Unit |
| Color chip renders with correct cluster color | Component |
| Gradient bar reflects gap_strength value | Component |
| S2 429 response starts 60s countdown | Integration |
| Auto-retry fires after countdown reaches 0 | Integration |
| MessageSquare button calls onAskQuestion with question text | Unit |

### 4.6 GapsViewMode Minimap (v0.14.1)

**Frontend** (planned):

| Test Case | Type |
|-----------|------|
| Canvas renders with correct dimensions (160x120) | Component |
| Nodes are positioned by cluster in circular layout | Component |
| Selected gap nodes highlighted in gold | Component |
| Dashed lines drawn between gap clusters | Component |
| Stats footer shows correct node and gap counts | Component |

### 4.7 Gap-to-Chat Integration (v0.14.1)

**Frontend** (planned):

| Test Case | Type |
|-----------|------|
| onAskQuestion prop threaded from page to GapPanel | Integration |
| Clicking MessageSquare calls onAskQuestion | Unit |
| handleAskAboutGap sets chatInput to question | Unit |
| handleAskAboutGap switches viewMode to split | Unit |
| handleAskAboutGap sets mobileView to chat | Unit |

### 4.8 Interrupted Imports Clear All (v0.14.1)

**Frontend** (planned):

| Test Case | Type |
|-----------|------|
| Clear All button shows confirmation dialog | Component |
| Confirming clear calls deleteInterruptedJobs API | Integration |
| Successful clear refreshes interrupted jobs query | Integration |
| deleteInterruptedJobs sends DELETE to correct URL | Unit |

### 4.9 3D Hover Jitter Fix (v0.17.0)

**Frontend** (`Graph3D.test.tsx` — extend existing):

| Test Case | Type |
|-----------|------|
| nodesRef.current syncs when nodes prop changes | Unit |
| handleNodeHover uses nodesRef instead of stale nodes closure | Unit |
| scene.traverse casts material as MeshPhongMaterial | Unit |
| Hover callback deps do not include `nodes` | Unit |
| Hover does not trigger nodeThreeObject recreation | Integration |

### 4.10 Intent Agent Pattern Matching (v0.17.0)

**Backend** (`test_agents.py` — extend existing):

| Test Case | Type |
|-----------|------|
| "Can you help me find papers?" classified as non-CONVERSATIONAL | Unit |
| "gaps" (4 chars) classified as non-CONVERSATIONAL | Unit |
| "hi" (2 chars) classified as CONVERSATIONAL | Unit |
| "hello" exact match classified as CONVERSATIONAL | Unit |
| "hello world" (contains "hello") NOT classified as CONVERSATIONAL (exact match only) | Unit |
| len(q) < 3 returns CONVERSATIONAL | Unit |
| len(q) == 3 proceeds to keyword matching | Unit |

### 4.11 Orchestrator Full Pipeline (v0.17.0)

**Backend** (`test_agents.py` — extend existing):

| Test Case | Type |
|-----------|------|
| CONVERSATIONAL intent flows through full 6-agent pipeline (no early-return) | Integration |
| Greeting query "hello" receives project-contextual response via RAG | Integration |
| All intent types reach reasoning agent | Integration |

### 4.12 NULL Concept TF-IDF Uniqueness (v0.17.0)

**Backend** (`test_graph_router.py` — extend existing):

| Test Case | Type |
|-----------|------|
| NULL concept names get UUID-prefix fallback | Unit |
| Each NULL concept produces unique TF-IDF vector | Unit |
| Clustering with mixed NULL/named concepts produces distinct clusters | Integration |

### 4.13 Topic View InfraNodus Redesign (v0.17.0)

**Frontend** (planned — `TopicViewMode.test.tsx`):

| Test Case | Type |
|-----------|------|
| Empty clusters array renders empty state message | Component |
| Size fallback uses concept_names.length when cluster.size is 0/null | Unit |
| hashStringToIndex returns same index for same label | Unit |
| hashStringToIndex returns different index for different labels | Unit |
| adjacencyMap correctly maps bidirectional connections | Unit |
| Hover on cluster sets hoveredNode state | Component |
| Hover highlights only adjacent clusters (3-tier opacity) | Component |
| Non-adjacent clusters fade to opacity 0.15 | Component |
| Analytics bar shows correct cluster count | Component |
| Analytics bar shows correct total concept count | Component |
| SVG export creates valid Blob download | Integration |
| Entry animation starts nodes at center position | Component |
| prefers-reduced-motion skips entry animation | Component |
| ForceAtlas2 layout: gap links have distance 300 | Unit |
| ForceAtlas2 layout: strong connections have shorter distance | Unit |
| Gradient edge uses source and target cluster colors | Component |
| Top 25% weight edges show link count badge | Component |
| Gap edges render with amber glow filter | Component |
| Density bar width proportional to cluster density | Component |
| Tooltip shows top 5 concepts + "+N more" | Component |
| Connection count badge shows correct edge count | Component |
| Legend displays edge type samples | Component |

### 4.14 Filter Panel Overlap Fix (v0.17.0)

**Frontend** (planned):

| Test Case | Type |
|-----------|------|
| FilterPanel has className containing "top-16" | Component |
| Toolbar div has className containing "z-40" | Component |
| FilterPanel renders below toolbar in DOM order | Component |

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
| 2026-02-07 | 1.1.0 | Add v0.14.1 test specs (DraggablePanel, GapPanel, Minimap, Gap-to-Chat, Clear All) |
| 2026-02-13 | 1.2.0 | Add v0.17.0 test specs (Hover Jitter, Intent Agent, Orchestrator, NULL Concept, TopicView InfraNodus, FilterPanel) |

