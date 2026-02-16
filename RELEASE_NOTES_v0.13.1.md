# Release Notes - v0.13.1

> **Version**: 0.13.1
> **Release Date**: 2026-02-07
> **Type**: Feature Enhancement
> **Status**: Production-Ready

---

## Overview

v0.13.1 introduces **API Key Settings UI** that enables users to manage their own API keys directly from the frontend. Previously, all API keys were managed exclusively through server environment variables. Users can now set personal API keys for LLM providers (Groq, Claude, GPT-4, Gemini) and external services (Semantic Scholar, Cohere) with per-user storage in the existing `user_profiles.preferences` JSONB column.

---

## What's New

### 1. API Key Management Backend

**Endpoints**:
- `GET /api/settings/api-keys` — List all API key statuses with masking
- `PUT /api/settings/api-keys` — Update user API keys and LLM preferences
- `POST /api/settings/api-keys/validate` — Validate API key format/connectivity

**Key Priority**: User keys (stored in `user_profiles.preferences.api_keys`) take precedence over server environment variable keys. Empty string deletes a user key, falling back to server default.

**Supported Providers**:

| Provider | Display Name | Usage |
|----------|-------------|-------|
| `groq` | Groq | LLM (default) |
| `anthropic` | Anthropic (Claude) | LLM |
| `openai` | OpenAI | LLM + Embeddings |
| `google` | Google (Gemini) | LLM |
| `semantic_scholar` | Semantic Scholar | Citation Network |
| `cohere` | Cohere | Embeddings |

**Key Masking**: API keys are masked in GET responses (e.g., `gsk_****abc`) — first 4 chars + `****` + last 3 chars.

### 2. Functional Settings Page

The Settings page (`/settings`) is now fully functional:

- **AI Model Settings**: Select LLM provider with immediate backend save. Inline API key management for the selected provider with validate/save/delete actions.
- **External API Keys**: Dedicated section for Semantic Scholar and Cohere keys with edit, validate, save, and delete capabilities.
- **Visual Feedback**: Loading spinners, validation indicators (green check / red X), toast notifications, and status badges (설정됨 / 미설정).

### 3. Semantic Scholar API Key Integration

All `SemanticScholarClient` instantiations across the backend now receive the configured `semantic_scholar_api_key` from `config.py`. This enables higher rate limits when an S2 API key is configured (server-level or user-level).

**Affected files**: `backend/routers/integrations.py`, `backend/routers/graph.py`

---

## Technical Changes

### New Files

| File | Lines | Description |
|------|-------|-------------|
| `backend/routers/settings.py` | ~180 | Settings API router with 3 endpoints |

### Modified Files

| File | Change |
|------|--------|
| `backend/main.py` | Added settings router import and registration |
| `backend/routers/__init__.py` | Added settings module export |
| `backend/routers/integrations.py` | Wire S2 API key to all SemanticScholarClient instances |
| `backend/routers/graph.py` | Wire S2 API key to SemanticScholarClient in recommendations |
| `frontend/lib/api.ts` | Added 3 API methods: getApiKeys, updateApiKeys, validateApiKey |
| `frontend/app/settings/page.tsx` | Complete rewrite with functional API key management |

### Database

No migration required — reuses existing `user_profiles.preferences` JSONB column (migration 005).

**Storage format**:
```json
{
  "api_keys": {
    "semantic_scholar": "au65...",
    "groq": "gsk_..."
  },
  "llm_provider": "groq",
  "llm_model": "llama-3.3-70b-versatile"
}
```

---

## Deployment Notes

1. **No migration needed** — uses existing `user_profiles.preferences` column
2. **Optional**: Add `S2_API_KEY` / `SEMANTIC_SCHOLAR_API_KEY` to Render environment variables for server-level Semantic Scholar access
3. **Auto-Deploy is OFF** (INFRA-006) — manual deploy required via Render Dashboard

---

## API Reference

### GET /api/settings/api-keys

**Response**:
```json
[
  {
    "provider": "groq",
    "display_name": "Groq",
    "is_set": true,
    "masked_key": "gsk_****abc",
    "source": "server",
    "usage": "LLM (기본 provider)"
  }
]
```

### PUT /api/settings/api-keys

**Request** (flat format):
```json
{
  "semantic_scholar": "au65...",
  "llm_provider": "groq",
  "llm_model": "llama-3.3-70b-versatile"
}
```

### POST /api/settings/api-keys/validate

**Request**:
```json
{"provider": "semantic_scholar", "key": "au65..."}
```

**Response**:
```json
{"valid": true, "message": "Semantic Scholar API key is valid"}
```
