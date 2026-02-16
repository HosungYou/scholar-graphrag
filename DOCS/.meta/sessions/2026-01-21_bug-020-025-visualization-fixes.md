# Session Log: BUG-020~025 Visualization Pipeline Fixes

> **Session ID**: 2026-01-21_bug-020-025-visualization-fixes
> **Date**: 2026-01-21
> **Agent**: Claude Code (Opus 4.5)
> **Type**: Bug Fixes / Parallel Agent Development
> **Skills Used**: `superpowers:dispatching-parallel-agents`, `superpowers:brainstorming`

---

## Context

### User Request
BUG-015~019 수정 후에도 시각화 문제가 지속됨:
- 18개 노드만 표시 (16개 논문에서)
- 0개 엣지 (관계 없음)
- Paper/Author가 필터에 표시됨 (ADR-001 위반)
- 줌 불안정
- Three.js 다중 인스턴스 경고

### Parallel Agent Audit Results
4개의 병렬 에이전트가 각 영역을 조사:
1. **Agent 1 (Import Pipeline)**: 4000자 PDF 텍스트 절단, Cohere API 키 누락
2. **Agent 2 (Visualization)**: Three.js 버전 충돌, 자동 카메라 포커스 문제
3. **Agent 3 (Filter UI)**: ADR-001 위반 - Paper/Author가 필터에 표시
4. **Agent 4 (Edge Generation)**: 임베딩 → 관계 의존성 체인 깨짐

---

## Bugs Documented

| Bug ID | Priority | Description |
|--------|----------|-------------|
| BUG-020 | P0 | PDF 전문 4000자 절단 → 엔티티 추출 불완전 |
| BUG-021 | P0 | Co-occurrence 관계 생성 안됨 → 0개 엣지 |
| BUG-022 | P0 | Cohere API 키 없을 때 임베딩 폴백 없음 |
| BUG-023 | P1 | Three.js 버전 충돌 (0.160.1 vs 0.182.0) |
| BUG-024 | P1 | 노드 클릭 시 자동 줌으로 불안정 |
| BUG-025 | P2 | Paper/Author가 필터에 표시됨 (ADR-001 위반) |

---

## Environment Setup

### Render Environment Variables Configured
- `COHERE_API_KEY`: Configured in Render Dashboard
- `GROQ_API_KEY`: Configured in Render Dashboard

---

## Fixes Implemented

### BUG-020: PDF Full-Text Chunking (P0)
**File**: `backend/importers/zotero_rdf_importer.py`

Added intelligent text chunking:
```python
def _chunk_text_for_extraction(self, text: str, chunk_size: int = 4000, overlap: int = 500) -> List[str]:
    """Chunk text with overlap for better entity extraction coverage."""
    if len(text) <= chunk_size:
        return [text]

    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunk = text[start:end]
        # Find sentence boundary for cleaner breaks
        if end < len(text):
            last_period = chunk.rfind('.')
            if last_period > chunk_size * 0.7:
                chunk = chunk[:last_period + 1]
                end = start + last_period + 1
        chunks.append(chunk)
        start = end - overlap
    return chunks
```

### BUG-021: Co-occurrence Relationships (P0)
**File**: `backend/importers/zotero_rdf_importer.py`

Added co-occurrence relationship building:
```python
@dataclass
class PaperEntities:
    """Track entities extracted from a single paper."""
    paper_id: str
    concept_ids: List[str] = field(default_factory=list)
    method_ids: List[str] = field(default_factory=list)
    finding_ids: List[str] = field(default_factory=list)

def _build_cooccurrence_relationships(self, paper_entities_list: List[PaperEntities]) -> List[Dict]:
    """Build relationships based on entity co-occurrence within papers."""
    relationships = []
    for pe in paper_entities_list:
        all_entity_ids = pe.concept_ids + pe.method_ids + pe.finding_ids
        for i, source_id in enumerate(all_entity_ids):
            for target_id in all_entity_ids[i+1:]:
                relationships.append({
                    'source_id': source_id,
                    'target_id': target_id,
                    'relationship_type': 'CO_OCCURS_WITH',
                    'properties': {'paper_id': pe.paper_id, 'weight': 1.0}
                })
    return relationships
```

### BUG-022: Embedding Provider Fallback (P0)
**File**: `backend/llm/openai_embeddings.py` (NEW)

Created OpenAI embedding fallback:
```python
class OpenAIEmbeddingProvider:
    """OpenAI embedding provider as fallback when Cohere unavailable."""

    def __init__(self, api_key: str, model: str = "text-embedding-3-small"):
        self.client = openai.OpenAI(api_key=api_key)
        self.model = model
        self.dimensions = 1536

    async def embed_texts(self, texts: List[str]) -> List[List[float]]:
        embeddings = []
        for batch in self._batch(texts, 50):
            response = self.client.embeddings.create(input=batch, model=self.model)
            embeddings.extend([e.embedding for e in response.data])
        return embeddings
```

**File**: `backend/graph/embedding/embedding_pipeline.py`

Added fallback logic:
```python
def _get_embedding_provider():
    # Priority: Cohere -> OpenAI -> None
    if settings.cohere_api_key:
        return CohereEmbeddingProvider(api_key=settings.cohere_api_key)
    elif settings.openai_api_key:
        return OpenAIEmbeddingProvider(api_key=settings.openai_api_key)
    else:
        logger.warning("No embedding provider available")
        return None
```

### BUG-023: Three.js Version Conflict (P1)
**File**: `frontend/package.json`

Added version override:
```json
"overrides": {
  "three": "^0.160.0"
}
```

### BUG-024: Auto Zoom Removal (P1)
**File**: `frontend/components/graph/Graph3D.tsx`

Added double-click detection:
```typescript
const lastClickRef = useRef<{ nodeId: string; timestamp: number } | null>(null);
const DOUBLE_CLICK_THRESHOLD = 300;

// Single click: select only (no camera movement)
// Double click: focus camera on node
// Right click: focus camera on node
```

### BUG-025: Dynamic Entity Type Filtering (P2)
**File**: `frontend/app/projects/[id]/page.tsx`

Added dynamic filtering:
```typescript
const actualEntityTypes = useMemo(() => {
  const counts = nodeCounts || {};
  return ENTITY_TYPES.filter(type => {
    // Always hide Paper and Author (ADR-001)
    if (type.id === 'paper' || type.id === 'author') {
      return (counts[type.id] || 0) > 0 ? false : false; // Always hide
    }
    return true; // Show other types
  });
}, [nodeCounts]);
```

---

## Commits

| Commit | Description |
|--------|-------------|
| `7f69a41` | fix(BUG-020~025): visualization pipeline comprehensive fixes |

---

## Deployment Status

| Service | Platform | Status | Time |
|---------|----------|--------|------|
| Backend | Render | ✅ Live | 12:38 AM |
| Frontend | Vercel | ✅ Live | 12:51 AM |

---

## Verification Results

| Bug | Status | Notes |
|-----|--------|-------|
| BUG-020 | ⏳ Pending | Requires new import |
| BUG-021 | ⏳ Pending | Requires new import |
| BUG-022 | ⏳ Pending | Requires new import |
| BUG-023 | ⚠️ Partial | Warning still present |
| BUG-024 | ✅ Verified | Single-click no zoom |
| BUG-025 | ✅ Verified | Filter shows only Concept/Method/Finding |

---

## Session Statistics

| Metric | Value |
|--------|-------|
| Bugs Documented | 6 |
| Files Modified | 8 |
| New Files Created | 1 (openai_embeddings.py) |
| Parallel Agents Used | 6 |
| Commits | 1 |

---

## Next Issue: BUG-026 CORS Preview URL

New import attempt failed with CORS error on Vercel preview URL.
See session: `2026-01-21_bug-026-cors-preview-url.md`

