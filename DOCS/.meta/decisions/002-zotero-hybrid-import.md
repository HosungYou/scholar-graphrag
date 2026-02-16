# ADR-002: Zotero Hybrid Import Strategy

**Status**: Accepted
**Date**: 2025-01-15
**Deciders**: Opus 4.5 (Architecture), Sonnet 4.5 (Backend/Frontend/Database Agents)
**Related Sessions**: [2025-01-15_zotero-documentation-restructure](../sessions/2025-01-15_zotero-documentation-restructure.md)

---

## Context

ScholaRAG_Graph needs to import bibliographic metadata from Zotero reference manager. Users have two Zotero interfaces:
1. **Zotero Web API**: Cloud-synced libraries (rate-limited, requires API key)
2. **Zotero Local Connector**: Desktop app on localhost:23119 (no rate limits, direct PDF access)

Traditional approaches only support one or the other, limiting accessibility and data richness.

---

## Decision Drivers

1. **Coverage Maximization**: Need 88%+ entity extraction vs 49% (Zotero-only) or 74% (PDF-only)
2. **Cost Control**: LLM extraction is expensive; Zotero metadata is free
3. **User Experience**: Should work whether Zotero Desktop is running or not
4. **Data Quality**: Zotero has authoritative metadata; LLM extracts semantic concepts

---

## Considered Options

### Option 1: Zotero Web API Only
**Description**: Use official Zotero Web API for all imports

| Pros | Cons |
|------|------|
| Always accessible | 1000 req/hour rate limit |
| No desktop required | No direct PDF access |
| Simple implementation | Slower (network latency) |

### Option 2: Zotero Local Connector Only
**Description**: Use localhost:23119 for all imports

| Pros | Cons |
|------|------|
| Fastest performance | Requires desktop app running |
| Direct PDF access | Fails for cloud-only users |
| No rate limits | Additional setup for users |

### Option 3: Hybrid Import Strategy (Selected)
**Description**: Try local first, fallback to web; combine Zotero metadata with LLM extraction

| Pros | Cons |
|------|------|
| Maximum accessibility | More complex code |
| Best of both sources | Two clients to maintain |
| 88%+ coverage | Higher initial development cost |

---

## Decision

We will implement **Hybrid Import Strategy** with three import modes:

### Import Modes

| Mode | Cost/Paper | Coverage | Use Case |
|------|------------|----------|----------|
| `zotero_only` | $0 | 49% | Quick metadata import |
| `selective` | ~$0.01 | 85% | **Default** - Methods/Findings extraction |
| `full` | ~$0.02 | 88%+ | Complete semantic analysis |

### Technical Approach

```python
class HybridZoteroImporter:
    def __init__(self):
        self.local_client = ZoteroLocalClient(port=23119)
        self.web_client = ZoteroWebAPIClient()

    async def import_collection(
        self,
        collection_key: str,
        mode: ImportMode = ImportMode.SELECTIVE
    ) -> ImportResult:
        # Phase 1: Zotero metadata (free, authoritative)
        zotero_nodes = await self._extract_from_zotero(collection_key)

        if mode == ImportMode.ZOTERO_ONLY:
            return zotero_nodes

        # Phase 2: LLM extraction from PDFs (paid, semantic)
        pdf_nodes = await self._extract_from_pdfs(mode)

        # Phase 3: Merge with Zotero priority
        return await self._merge_nodes(zotero_nodes, pdf_nodes)
```

### Source Priority (Conflict Resolution)

| Data Type | Primary Source | Reasoning |
|-----------|----------------|-----------|
| Title, DOI, Year | Zotero | Authoritative metadata |
| Authors | Zotero | Structured data |
| Abstract | Zotero | Often cleaner than PDF |
| Concepts | LLM | Semantic extraction |
| Methods | LLM | Not in Zotero metadata |
| Findings | LLM | Not in Zotero metadata |
| Tags | Merge | Combine both sources |

---

## Consequences

### Positive
- Users can import without Zotero Desktop running
- Local access is faster (no network latency)
- Supports offline work (when web API unavailable)
- Four-tier source tracking enables intelligent conflict resolution
- Cost-effective: free metadata + selective paid extraction

### Negative
- More complex implementation (two API clients) - Mitigation: Shared interface
- Requires handling connection failures - Mitigation: Graceful degradation
- Testing requires mocking both APIs - Mitigation: Comprehensive test suite

### Neutral
- Adds `HybridZoteroImporter` class (~700 lines estimated)
- Frontend needs import mode selector UI
- Database needs source tracking columns

---

## Implementation Notes

### Files Affected

**New Files:**
- `backend/integrations/zotero_local.py` - Local API client
- `backend/importers/hybrid_zotero_importer.py` - Hybrid importer
- `database/migrations/005_zotero_hybrid_import.sql` - Schema extensions
- `frontend/components/import/ZoteroImporter.tsx` - Import UI

**Modified Files:**
- `backend/graph/entity_extractor.py` - Add source tracking
- `backend/routers/integrations.py` - Add new endpoints
- `backend/config.py` - Add Zotero settings

### Database Schema Changes

```sql
-- Add to entities table
ALTER TABLE entities ADD COLUMN node_source node_source_enum;
ALTER TABLE entities ADD COLUMN zotero_item_key TEXT;
ALTER TABLE entities ADD COLUMN source_metadata JSONB;

-- New sync tracking
CREATE TABLE zotero_sync_state (
    project_id UUID PRIMARY KEY,
    library_version INTEGER,
    last_synced_at TIMESTAMP
);
```

### API Endpoints

```
GET  /api/import/zotero/status       # Check connection
GET  /api/import/zotero/collections  # List collections
POST /api/import/zotero/import       # Start hybrid import
```

---

## Validation Criteria

- [ ] Local API connection detection works
- [ ] Fallback to Web API when local unavailable
- [ ] Three import modes function correctly
- [ ] Source tracking recorded for all entities
- [ ] Merge logic preserves Zotero authority
- [ ] Incremental sync uses library_version
- [ ] Cost estimates displayed in UI

---

## References

- [Zotero Web API Docs](https://www.zotero.org/support/dev/web_api/v3/start)
- [Zotero Connector Protocol](https://github.com/zotero/zotero-connectors)
- [DOCS/features/zotero-integration/overview.md](../../features/zotero-integration/overview.md)
- [IMPROVEMENT_PLAN.md Section 8.9](../../project-management/improvement-plan.md)

---

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2025-01-15 | Initial design | Opus 4.5 |
| 2025-01-15 | Accepted after multi-agent review | Team |
