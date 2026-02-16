# Session: v0.21 Lexical Graph Phase 1 Implementation

## Context
- Phase: v0.21
- Tasks: 1-1 (Schema), 1-2 (Entity Types), 1-3 (Migration), 1-4 (Feature Flag), UI P1 items
- Date: 2026-02-16

## Files Created
| File | Purpose |
|------|---------|
| `database/migrations/005_lexical_graph_schema.sql` | New entity/relationship types, extraction metadata columns |
| `backend/routers/settings.py` | API key validation + provider status endpoints |

## Files Modified
| File | Changes |
|------|---------|
| `backend/config.py` | Added `lexical_graph_v1: bool = False` feature flag |
| `backend/graph/entity_extractor.py` | Added RESULT/CLAIM EntityTypes, SECTION_PROMPTS dict, `extract_from_sections()`, `extract_from_full_text()`, `_split_into_sections()`, `_parse_section_response()` |
| `backend/importers/scholarag_importer.py` | Added full-text extraction path gated by `lexical_graph_v1` flag, new entity caches (result/claim/dataset), updated `_get_relationship_type()` mapping |
| `backend/importers/pdf_importer.py` | Added EntityExtractor integration, full-text extraction when flag enabled, falls back to abstract-only extraction |
| `backend/routers/graph.py` | Added RESULT/CLAIM to EntityType enum, USED_IN/EVALUATED_ON/REPORTS to RelationshipType enum |
| `backend/main.py` | Registered settings_router at `/api/settings` |
| `frontend/types/graph.ts` | Added Result/Claim to EntityType, USED_IN/EVALUATED_ON/REPORTS to RelationshipType, ResultProperties/ClaimProperties interfaces |
| `frontend/components/graph/CustomNode.tsx` | Added Result (Trophy icon, red) and Claim (MessageSquare icon, pink) visual mappings |
| `frontend/components/chat/ChatInterface.tsx` | ReactMarkdown rendering for assistant messages, auto-expanding textarea, localStorage chat persistence, error message styling |
| `frontend/app/settings/page.tsx` | API key management UI with show/hide, test validation, provider status badges |
| `frontend/app/projects/[id]/page.tsx` | Added Result/Claim to ALL_ENTITY_TYPES array |

## Decisions Made
- Migration 005 placed in `database/migrations/` (main migration dir, consistent with Phase 0)
- Feature flag uses pydantic-settings `lexical_graph_v1: bool = False` (env var `LEXICAL_GRAPH_V1`)
- Full-text extraction uses abstract length > 500 chars as proxy for full-text availability in scholarag_importer
- PDF importer uses actual full_text field from PyMuPDF extraction
- Settings router validates API keys by making minimal test calls to each provider
- Section-aware prompts cover: methodology, results, discussion, introduction
- New relationship mappings: Result->REPORTS, Claim->REPORTS, Dataset->USES_DATASET

## Schema Changes (Migration 005)
- entity_type enum: added 'Result', 'Claim'
- relationship_type enum: added 'USED_IN', 'EVALUATED_ON', 'REPORTS'
- entities table: +extraction_section VARCHAR(50), +evidence_spans TEXT[], +has_full_text BOOLEAN, +full_text_sections TEXT[]
- relationships table: +evidence_spans TEXT[]

## Issues Encountered
- None significant. All agents completed successfully.

## Acceptance Criteria Status
- [x] Feature flag `lexical_graph_v1` in config.py
- [x] DB migration with new entity/relationship types
- [x] Section-aware entity extraction (methodology, results, discussion, introduction)
- [x] Full-text extraction path in both importers (gated by flag)
- [x] Frontend types and visual mappings for Result/Claim
- [x] Chat markdown rendering + auto-expanding textarea
- [x] Settings page API key management
- [x] Flag OFF preserves existing behavior (zero regression by design)

## Remaining Work for Phase 1 Completion
- [ ] Run migration against actual database
- [ ] Test with sample papers (flag ON vs OFF)
- [ ] Golden set 20 papers precision/recall measurement
- [ ] Frontend build verification (`npm run build`)
- [ ] Backend type check (`mypy .`)
