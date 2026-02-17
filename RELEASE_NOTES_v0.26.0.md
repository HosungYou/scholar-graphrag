# Release Notes v0.26.0 — Per-User LLM Provider Selection

> **Version**: 0.26.0 | **Date**: 2026-02-16
> **Codename**: Per-User LLM Provider Selection
> **Commit**: `ff2f839`

## Summary

Settings UI now actually controls which LLM provider is used for Chat and Import. Previously, the Settings page saved provider/model/API key preferences to `user_profiles.preferences` but the backend completely ignored them — all requests used the server's Groq environment variable. This release wires Settings to the backend so users can switch between Groq, OpenAI, Anthropic, and Google Gemini with their own API keys.

---

## New Feature: Per-User LLM Provider Selection

### Problem

- Settings UI saved `llm_provider`, `llm_model`, API keys to `user_profiles.preferences` JSONB
- Backend Chat (`chat.py`) used a global singleton orchestrator with server env vars
- Backend Import (`import_.py`) used a local `get_llm_provider()` reading only server env vars
- Result: Groq (20 RPM, free) was always used regardless of user settings

### Solution

**3-tier fallback chain**: User API key → Server key for chosen provider → Server default provider

| Component | Before | After |
|-----------|--------|-------|
| Chat | Global `_orchestrator` singleton | Per-user orchestrator cache (5-min TTL) |
| Import | Local `get_llm_provider()` (env vars only) | `create_llm_provider_for_user(user_id)` |
| Settings API | No GET /preferences endpoint | `GET /api/settings/preferences` added |
| Settings UI | Inferred provider from first set key | Loads saved preferences on mount |

### Provider Options

| Provider | Model | RPM | Use Case |
|----------|-------|-----|----------|
| Groq (default) | llama-3.3-70b-versatile | 20 | Free tier, slower imports |
| OpenAI | gpt-4o-mini | 10,000 | Fast imports, good quality |
| Anthropic | claude-haiku-4-5-20251001 | 4,000 | High quality, moderate speed |
| Google | gemini-1.5-flash | 1,000 | Alternative option |

### Cache Strategy

- **Provider cache**: `{user_id: (provider, timestamp)}` with 300s TTL
- **Orchestrator cache**: `{user_id: (orchestrator, timestamp)}` with 300s TTL
- **Invalidation**: Automatic on `PUT /api/settings/api-keys` — next request creates fresh provider

---

## API Changes

### New Endpoint

```
GET /api/settings/preferences
```

Returns user's saved LLM provider and model, falling back to server defaults:

```json
{
  "llm_provider": "openai",
  "llm_model": "gpt-4o-mini"
}
```

### Modified Endpoint

```
PUT /api/settings/api-keys
```

Now invalidates the user's cached LLM provider after saving, ensuring the next Chat/Import request uses the updated settings.

---

## Frontend Changes

### Settings Page (`/settings`)

- **Load preferences on mount**: Calls `GET /api/settings/preferences` to restore saved provider selection
- **Updated model defaults**: OpenAI `gpt-4o` → `gpt-4o-mini`, Google `gemini-pro` → `gemini-1.5-flash`
- **RPM info in descriptions**: Each provider shows requests-per-minute for informed selection
- **Missing key warning**: Amber banner when selected provider has no API key configured
- **Updated scope description**: "chat, entity extraction, and paper import"

---

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `backend/llm/user_provider.py` | **NEW** | +169 |
| `backend/llm/__init__.py` | Modified | +4 |
| `backend/routers/chat.py` | Modified | +49/-68 |
| `backend/routers/import_.py` | Modified | +33/-42 |
| `backend/routers/settings.py` | Modified | +32 |
| `frontend/app/settings/page.tsx` | Modified | +28/-12 |
| `frontend/lib/api.ts` | Modified | +7 |

**Total**: 8 files changed, +303/-119 lines

---

## Technical Details

### `backend/llm/user_provider.py` (NEW)

Core per-user provider factory module:

- `create_llm_provider_for_user(user_id)` — Main factory with 3-tier fallback
- `invalidate_user_provider_cache(user_id)` — Called on settings change
- `get_user_llm_model(user_id)` — Returns user's model or server default
- `get_user_llm_preferences(user_id)` — Reads from `user_profiles.preferences`
- `_create_server_default_provider()` — Backward-compatible server env var provider

### `backend/routers/chat.py`

- Replaced module-level `_orchestrator: Optional[AgentOrchestrator]` global singleton
- New `_orchestrator_cache: dict[str, Tuple]` with per-user entries
- `get_orchestrator_for_user(user_id)` replaces `get_orchestrator()`
- 3 call sites updated to pass `current_user.id`

### `backend/routers/import_.py`

- Removed local `get_llm_provider()` function (62-103)
- All 5 background task functions accept `user_id: Optional[str]` parameter
- 4 `get_llm_provider()` calls → `create_llm_provider_for_user(user_id)`
- 4 `settings.default_llm_model` → `get_user_llm_model(user_id)`
- `import_multiple_pdfs` and `import_zotero_folder` now accept `current_user` dependency

---

## Backward Compatibility

- **Unauthenticated requests**: Fall back to server env var provider (Groq)
- **Users without settings**: Fall back to server default (same as before)
- **No DB migration needed**: `user_profiles.preferences` JSONB already exists
- **No new environment variables**: Uses existing provider API key env vars

---

## Verification Checklist

| # | Test | Expected |
|---|------|----------|
| 1 | Settings save/load round-trip | Select OpenAI → refresh → OpenAI still selected |
| 2 | Chat uses user's provider | Set OpenAI → chat → backend logs show OpenAI API call |
| 3 | Import uses user's provider | Set OpenAI → import → logs show OpenAI, faster speed |
| 4 | Fallback for no settings | User without prefs → server default (Groq) used |
| 5 | Cache invalidation | Change API key → next request uses new key immediately |
| 6 | Backward compat | Unauthenticated request → server provider works |
| 7 | Missing key warning | Select OpenAI without key → amber warning shown |
