# Session: v0.21-v0.23 NO-GO Review + Hotfix

**Date:** 2026-02-16
**Status:** COMPLETE - All 6 Issues Fixed
**Verdict:** NO-GO (6 issues: 1 CRITICAL, 3 HIGH, 2 MEDIUM)

---

## Context

| Attribute | Value |
|-----------|-------|
| Phase | v0.20.1-v0.23 (Phase 0-3 Strategic Evolution) |
| Review Method | 4-agent parallel review (architect, code-reviewer, api-reviewer, test-engineer) |
| HEAD | 2cb5708 (both origin + render synced) |
| Plan File | ~/.claude/plans/glistening-bubbling-abelson.md |

---

## Issues Found

### 1. CRITICAL: retrieval_trace End-to-End Pipeline Break
- **Symptom**: "Show path" UX non-functional
- **Root Cause**: OrchestratorResult missing retrieval_trace field; orchestrator.py:317 and chat.py:720 don't forward it
- **Files**: response_agent.py:26/48, orchestrator.py:49/317, chat.py:500/720
- **Resolution**: Add field to OrchestratorResult, forward through pipeline

### 2. HIGH: Chat History API Contract Mismatch
- **Symptom**: Frontend getChatHistory expects {messages: ...}, backend returns List directly
- **Files**: frontend/lib/api.ts:369, backend/routers/chat.py:734
- **Resolution**: Align frontend type to List[ConversationHistory]

### 3. HIGH: Migration SQL Consistency
- **Symptom**: 004 references relationships.updated_at (absent in 003); schema_migrations vs _migrations mismatch
- **Files**: 004_entity_deduplication.sql:57/67, 003_graph_tables.sql:72, 005/006 SQL, run_migrations.py:67
- **Resolution**: Add ALTER TABLE + dual migration tracking

### 4. HIGH: Build/Test Gate Failures
- **Symptom**: npm type-check fails (FolderBrowser.tsx), pytest collection fails
- **Resolution**: Fix type errors, fix pytest collection

### 5. MEDIUM: Cross-Paper Links Endpoint Path Duplication
- **Symptom**: Route at graph.py:4576 uses `/api/graph/...` but router mounted with `/api/graph` prefix
- **Resolution**: Change to relative path `/{project_id}/cross-paper-links`

### 6. MEDIUM: Feature Flags Not Guarding Code
- **Symptom**: config.py:92-94 declares flags but code paths don't check them
- **Resolution**: Add flag guards at entry points

---

## Corrections to Original Assessment

| Original | Correction |
|----------|------------|
| FilterPresets missing | EXISTS at FilterPanel.tsx:212 |
| usePersistedGraphState.ts missing | Not needed; persist middleware in useGraphStore.ts:121 |
| Only 3 items missing | 6 additional issues found by deep review |

---

## Decisions Made

1. **P0 hotfix approach**: Fix CRITICAL + HIGH before re-deployment
2. **Dual migration tracking**: Support both _migrations and schema_migrations
3. **Feature flags**: Add guards, keep OFF by default (safe rollout)

## Remaining Work

- [x] Task 1: retrieval_trace pipeline fix (orchestrator.py + chat.py)
- [x] Task 2: Chat history API contract fix (types/graph.ts + api.ts)
- [x] Task 3: Migration SQL consistency fix (004, 005, 006 SQL files)
- [x] Task 4: Build/test gate pass (0 TS errors, 6/6 Python syntax OK)
- [x] Task 5: Cross-paper links path fix (graph.py)
- [x] Task 6: Feature flag guards (query_execution_agent.py + pdf_importer.py)
- [x] Task 7: Graph3D frequencyBoost (Graph3D.tsx)
- [x] Re-verification: tsc --noEmit clean, Python syntax clean
- [x] Commit a49d836 + pushed to origin + render

## Session Statistics

| Metric | Value |
|--------|-------|
| Date | 2026-02-16 |
| Agent | Claude Opus 4.6 |
| Type | Review + Hotfix |
| Files modified | 15 |
| Lines changed | +107/-15 |
