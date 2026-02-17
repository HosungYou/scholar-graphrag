# ScholaRAG_Graph v0.29.1 Release Notes

> **Version**: 0.29.1 | **Date**: 2026-02-17
> **Type**: Critical Bug Fix Release (Settings & User Preferences)

## Summary

Fixes a systemic asyncpg jsonb codec issue that silently broke all user preferences functionality: Settings save (500 error), API key persistence, per-user LLM provider selection, and Semantic Scholar key lookup for Find Papers.

---

## Root Cause Analysis

### asyncpg JSONB Codec (BUG-049)

- **Problem**: asyncpg's default jsonb codec returns raw JSON **strings**, not Python **dicts**. All 5 code locations reading `user_profiles.preferences` expected dicts, causing:
  - **Settings PUT**: `{**current_prefs}` on a string → `TypeError: 'str' object is not a mapping` → **500 Internal Server Error**
  - **Settings GET /api-keys**: `.get("api_keys")` on a string → silent failure → all user keys shown as "Not Set"
  - **Settings GET /preferences**: `.get("llm_provider")` on a string → silent failure → user LLM selection ignored
  - **User Provider**: `.get("llm_provider")` on a string → silent failure → always falls back to server default Groq
  - **Integrations (S2 key)**: `.get("api_keys")` on a string → silent failure → no user S2 key → 429 Rate Limit on Find Papers
- **Why undetected**: All GET endpoints wrapped reads in `try/except` that silently returned defaults. PUT only failed on 2nd+ save (1st save has no existing row to read).
- **Fix**: Register `json.loads`/`json.dumps` codec on asyncpg pool `init` callback — ALL jsonb columns across the entire app now return Python dicts automatically.

### Settings UPSERT (BUG-048)

- **BUG-048a**: `asyncpg` with `::jsonb` cast expects JSON string, not Python dict → `json.dumps()` needed (now handled by codec)
- **BUG-048b**: `user_profiles` row may not exist for a user → `UPDATE` affects 0 rows → changed to `INSERT ... ON CONFLICT DO UPDATE` (UPSERT)
- **BUG-048c**: UPSERT `INSERT` requires `email` column (NOT NULL constraint) → added `current_user.email`

---

## Files Changed

| File | Changes | Lines |
|------|---------|-------|
| `backend/database.py` | jsonb/json codec registration on pool init | +14 |
| `backend/routers/settings.py` | UPSERT with email, remove manual json.dumps/::jsonb | +10/-8 |

**Total**: 2 files, 24 insertions, 8 deletions

---

## Cascade Fix Impact

| Feature | Before | After |
|---------|--------|-------|
| Settings Save (PUT) | 500 `'str' object is not a mapping` | Success |
| Settings Load (GET) | Always "Not Set" for user keys | Shows saved keys |
| Per-user LLM Provider | Ignored, always server Groq | Respects user selection |
| Find Papers (S2) | 429 Rate Limit (no user key) | Uses saved S2 API key |
| Groq/Cohere display | Showed "Configured" (from server env) | Correctly shows source |

---

## Verification

| Check | Method | Expected |
|-------|--------|----------|
| Settings save | Settings → S2 key → Save | No 500, shows "Configured" |
| Settings persist | Save → refresh page | Key still shows "Configured" |
| LLM provider | Change to OpenAI → refresh | Selection persists |
| Find Papers | Gap → Find Papers | Papers returned (S2 key used) |
| Auth still works | Unauthenticated GET /api/projects | HTTP 401 |
| Tests | `pytest tests/test_v029_fixes.py` | 23/23 passing |

---

## Commits

| Hash | Description |
|------|-------------|
| `b4658a3` | fix: settings API key save — json.dumps for asyncpg JSONB parameter (BUG-048a) |
| `2091419` | fix: settings UPSERT — INSERT ON CONFLICT for new user_profiles rows (BUG-048b) |
| `75dd98d` | fix: settings UPSERT include email for NOT NULL constraint (BUG-048c) |
| `efcc053` | fix: asyncpg jsonb codec — preferences now returns dict, not str (BUG-049) |

---

## Deployment

- **Backend**: Auto-deploys via Render (push to `origin main`)
- **Frontend**: No changes required
- **Database**: No migrations required
- **Environment**: No new env vars
- **Breaking Changes**: None
