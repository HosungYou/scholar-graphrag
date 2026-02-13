# Release Notes v0.16.2

> **Version**: 0.16.2 | **Date**: 2026-02-12
> **Type**: Bug Fix (Security/Reliability)
> **Commit**: aacd765

## Summary

Comprehensive 5-layer defense against 401 authentication errors that continued appearing in production logs despite v0.16.1 fixes. The previous per-query guards addressed symptoms (React Query retries) while missing root causes (unguarded polling loops, stale tokens, no global defense).

**Evidence from production** (02:18:59, 3 seconds after deploy):
```
GET /api/import/jobs?status=interrupted&limit=10 → 401 Unauthorized
```

## Root Cause Analysis

| # | Root Cause | Impact | Fix |
|---|-----------|--------|-----|
| 1 | ImportProgress.tsx polling ignores 401 | 2s polling loop floods logs | Layer 1 |
| 2 | No global QueryClient 401 handling | Every new useQuery needs manual retry guard | Layer 2 |
| 3 | `getSession()` returns cached/stale tokens | Expired token → 401 → no refresh | Layer 3 |
| 4 | Direct `fetch()` calls bypass 401 handling | 6 upload/export endpoints unprotected | Layer 4 |
| 5 | Backend: 401s bypass rate limiter | Unlimited 401s from same IP | Layer 5 |

## Changes

### Layer 1: ImportProgress.tsx — Stop Polling on 401 (Critical)
- **File**: `frontend/components/import/ImportProgress.tsx`
- Detect 401/403 in the polling catch block
- Set `stopped = true` and show "Session expired" error
- **Impact**: Eliminates highest-frequency 401 source (every 2s → 0)

### Layer 2: Global QueryClient Retry Defaults (High)
- **File**: `frontend/app/providers.tsx`
- Added global `retry` function that skips 401/403 for all queries
- Added `mutations.retry: false` (mutations should not auto-retry)
- **Impact**: All current AND future `useQuery` calls are protected

### Layer 3: Token Refresh on 401 in API Client (High)
- **File**: `frontend/lib/api.ts`
- On first 401, attempt `supabase.auth.refreshSession()` then retry
- If refresh fails, throw 401 as before
- **Impact**: Silently recovers from expired tokens without user action

### Layer 4: Guard Direct `fetch()` Calls (Medium)
- **File**: `frontend/lib/api.ts`
- New `authenticatedFetch()` helper with refresh-on-401 logic
- Replaced 6 direct `fetch()` calls: `uploadPDF`, `uploadMultiplePDFs`, `validateZotero`, `importZotero`, `exportGapReproReport`, `exportGapReport`
- **Impact**: Consistent auth handling across all API calls

### Layer 5: Backend Auth-Failure Rate Limiting (Medium)
- **File**: `backend/auth/middleware.py`
- Per-IP auth failure counter (20 failures/60s window)
- Returns 429 Too Many Requests after limit exceeded
- Applied to all three 401-return paths (REQUIRED, OPTIONAL, OWNER)
- **Impact**: Prevents log flooding from stale clients or misbehaving bots

### Cleanup: Remove Per-Query Retry Duplication
- Removed redundant per-query `retry` functions from 3 files (now handled globally)
- Kept `enabled: !!user` guards (serve different purpose — prevent pre-login queries)
- **Files**: `projects/page.tsx`, `projects/[id]/page.tsx`, `projects/compare/page.tsx`

## Files Modified

| File | Change | Lines |
|------|--------|-------|
| `frontend/components/import/ImportProgress.tsx` | 401 detection in polling catch block | +8 |
| `frontend/app/providers.tsx` | Global QueryClient retry config | +11 |
| `frontend/lib/api.ts` | Token refresh + `authenticatedFetch()` helper | +40, 6 methods refactored |
| `frontend/app/projects/page.tsx` | Remove per-query retry (now global) | -16 |
| `frontend/app/projects/[id]/page.tsx` | Remove per-query retry (now global) | -7 |
| `frontend/app/projects/compare/page.tsx` | Remove per-query retry (now global) | -7 |
| `backend/auth/middleware.py` | Auth-failure rate limiting (20/min per IP) | +35 |
| **Total** | | **+94, -30** |

## Verification

1. **Build**: `npm run build` — zero TypeScript errors
2. **Token expiry test**: Log in → wait for token expiry → navigate → should auto-refresh (no 401)
3. **Import polling test**: Start import → auth failure → polling stops (not loop)
4. **Backend rate limit test**: 25 requests with bad token in 60s → first 20 return 401, last 5 return 429
5. **Render logs**: No repeated 401s from same IP within seconds

## Technical Notes

- No database migrations required
- No new environment variables
- No breaking changes
- `supabase` export added to `frontend/lib/supabase.ts` import in `api.ts`
- Backend rate limiter uses class-level dict (shared across requests in same process)
