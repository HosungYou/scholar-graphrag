# Session Log: Database Maintenance & Migration 021

| Field | Value |
|-------|-------|
| **Session ID** | 2026-02-09_db-maintenance-migration-021 |
| **Date** | 2026-02-09 |
| **Agent** | Opus 4.6 |
| **Type** | infrastructure-maintenance |
| **Duration** | ~25 minutes |

---

## Context

### User Request
- Resolve Supabase Free Plan capacity exceeded (671.55 MB / 500 MB limit)
- Delete 26 test projects from January 2026
- Apply Migration 021_cross_paper_links.sql (v0.15.0)
- Replace Render DATABASE_URL with Session Pooler

### Related Decisions
- INFRA-006: Maintain Auto-Deploy OFF policy
- v0.15.0: Cross-paper entity linking (SAME_AS) migration required

---

## Summary

To resolve the Supabase Free Plan capacity exceeded issue, we deleted 26 test projects from January 2026 and related data (~1.04 million rows) in FK order, and reclaimed disk space with VACUUM FULL. Simultaneously, we applied Migration 021 added in v0.15.0 and replaced Render DATABASE_URL from Transaction Pooler to Session Pooler.

### Phase 1: Environment Setup
- psql 설치 (`brew install libpq`)
- Render MCP로 서비스 목록 조회 (scholarag-graph-docker: `srv-d5nen956ubrc73aqko8g`)
- Supabase DB 연결 테스트 성공 (PostgreSQL 17.6)
- 프로젝트 루트에 Supabase MCP `.mcp.json` 설정 추가

### Phase 2: January Data Deletion (FK Order)
| Table | Rows Deleted |
|--------|-----------|
| relationships | 995,787 |
| entities | 42,905 |
| semantic_chunks | 4,779 |
| paper_metadata | 375 |
| messages | 34 |
| projects | 26 |
| structural_gaps | 21 |
| conversations | 16 |
| concept_clusters | 10 |
| **Total** | **~1,043,953** |

### Phase 3: VACUUM & Space Recovery
- `VACUUM ANALYZE` → Update statistics (session pooler, port 5432)
- `VACUUM FULL` → Actual disk space reclamation
  - relationships: 404 MB → 8.4 MB (**395.6 MB reclaimed**)
  - semantic_chunks: 174 MB → 127 MB (47 MB reclaimed)
  - entities: 65 MB → 31 MB (34 MB reclaimed)
- **Total DB: 671 MB → 181 MB (490 MB reclaimed, 73% reduction)**

### Phase 4: Apply Migration 021
- `ALTER TYPE relationship_type ADD VALUE IF NOT EXISTS 'SAME_AS'` → Success
- `CREATE INDEX idx_entities_name_type` → Success
- `CREATE INDEX idx_relationships_same_as` → Success
- Migration marker NOTICE output confirmed

### Phase 5: Render Infrastructure Changes
- DATABASE_URL: Transaction Pooler (port 6543) → **Session Pooler (port 5432)**
- Used Render MCP `update_environment_variables`
- Auto-deployment triggered (`dep-d6533q24d50c73dlrid0`)

---

## Action Items

- [x] INFRA-008: Delete January test data (26 projects, ~1.04M rows)
- [x] INFRA-009: Reclaim space with VACUUM FULL (671 MB → 181 MB)
- [x] INFRA-010: Apply Migration 021_cross_paper_links.sql
- [x] INFRA-011: Replace Render DATABASE_URL with Session Pooler
- [x] INFRA-012: Configure Supabase MCP in project root

---

## Session Statistics

| Metric | Value |
|--------|-------|
| Files created | 1 (`.mcp.json`) |
| Files modified | 0 |
| DB rows deleted | ~1,043,953 |
| Disk space recovered | 490 MB (73%) |
| Migration applied | 021_cross_paper_links.sql |
| Indexes created | 2 |
| Enum values added | 1 (SAME_AS) |
| Infrastructure changes | 1 (DATABASE_URL) |
| Deployments triggered | 1 |
| February projects preserved | 4 |
