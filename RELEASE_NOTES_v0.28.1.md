# Release Notes v0.28.1 — SSR Fix & StatusBar Auth

> **Version**: 0.28.1 | **Date**: 2026-02-17
> **Codename**: SSR Fix & StatusBar Auth

## Summary

Hotfix release resolving two production issues: Next.js SSR crash on project pages (`window is not defined`) and StatusBar 401 polling loop.

---

## SSR Crash Fix (Critical)

### Problem

The project page (`/projects/[id]`) returned **500 errors** on initial load due to `ReferenceError: window is not defined` during server-side rendering. Three.js and react-force-graph-3d access browser-only `window` object, causing SSR to crash. Users saw "NO GRAPH DATA AVAILABLE" on first visit, sometimes recoverable by manual refresh.

### Root Cause

`KnowledgeGraph3D` was statically imported in `page.tsx`. Even with `'use client'` directive, Next.js App Router still SSR-renders client components before hydration. Libraries requiring `window` must be loaded client-side only.

### Fix

Replaced static import with `next/dynamic({ ssr: false })`:

```tsx
const KnowledgeGraph3D = dynamic(
  () => import('@/components/graph/KnowledgeGraph3D').then(mod => ({ default: mod.KnowledgeGraph3D })),
  { ssr: false, loading: () => <LoadingPlaceholder /> }
);
```

### Impact

| Metric | Before | After |
|--------|--------|-------|
| SSR status | 500 error | 200 OK |
| Initial load | "NO GRAPH DATA" | Graph renders correctly |
| Vercel logs | `ReferenceError: window is not defined` | Clean |

---

## StatusBar 401 Auth Fix

### Problem

`StatusBar` component called `/api/system/status` using bare `fetch()` without authentication headers. The backend endpoint requires auth (`require_auth_if_configured`), so every request returned **401 Unauthorized**. The component retried every 30 seconds, flooding browser console with errors.

### Fix

Added Supabase session token to the fetch request:

```tsx
import { getSession } from '@/lib/supabase';
// ...
const session = await getSession();
if (session?.access_token) {
  headers['Authorization'] = `Bearer ${session.access_token}`;
}
```

### Impact

- Eliminates repeated 401 errors in browser console
- StatusBar now correctly displays LLM provider, vector count, and data source info
- No more unnecessary retry loops on auth failure

---

## Files Changed

| File | Action | Changes |
|------|--------|---------|
| `frontend/app/projects/[id]/page.tsx` | Modified | `next/dynamic({ ssr: false })` for KnowledgeGraph3D |
| `frontend/components/graph/StatusBar.tsx` | Modified | Auth headers added to `/api/system/status` fetch |

**Total**: 2 files changed, ~15 lines modified

---

## Technical Details

### Quality Metrics

- TypeScript: 0 errors
- No database migrations required
- No new environment variables
- No new API endpoints
- Backward compatible

### Remaining Console Warnings (Cosmetic, Non-Breaking)

| Warning | Source | Impact |
|---------|--------|--------|
| `THREE.CylinderBufferGeometry renamed` | Three.js deprecation | None — automatic fallback |
| `metadata.metadataBase not set` | Next.js metadata | None — social OG tags only |

---

## Verification Checklist

- [x] Project page loads graph on initial visit (no "NO GRAPH DATA")
- [x] Vercel logs show 200 OK for `/projects/[id]` (no 500 errors)
- [x] Browser console: no 401 errors from `/api/system/status`
- [x] StatusBar displays correct system status
- [x] tsc --noEmit: 0 errors
