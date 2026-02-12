# Release Notes — v0.13.3: Auth Flow Completion

**Date**: 2026-02-12

## Overview

v0.13.3 completes the authentication flow with two critical fixes: removing the non-functional GitHub OAuth button and ensuring pre-auth projects remain visible to authenticated users.

## Bug Fixes

### 1. Remove GitHub OAuth (Google-Only Sign In)

**Problem**: LoginForm and SignupForm displayed a "Sign in with GitHub" button, but GitHub OAuth was disabled in Supabase. Clicking it produced a silent failure with no feedback to the user.

**Fix** (`frontend/components/auth/LoginForm.tsx`, `SignupForm.tsx`):
- Remove GitHub OAuth buttons from both forms
- Make Google OAuth button full-width for cleaner layout
- Login page now shows: email/password fields + "Sign in with Google" button

**Before**: Two OAuth buttons (Google + GitHub), GitHub silently fails
**After**: Single Google OAuth button, clean layout

### 2. Orphaned Projects Visible to Authenticated Users

**Problem**: Projects created before authentication was added had `owner_id = NULL`. The authenticated project listing query only returned projects where `owner_id = current_user.id`, collaborator, team member, or public. Authenticated users saw an **empty project list** despite existing projects in the database.

**Fix** (`backend/routers/projects.py`):
- Added `OR p.owner_id IS NULL` clause to the project listing SQL query
- Orphaned projects (created before auth) are now visible to all authenticated users
- No data migration needed — fix is purely in the query logic

**Before**: Authenticated users see 0 projects (all existing projects have NULL owner)
**After**: All pre-auth projects visible to any authenticated user

## Files Changed

| File | Lines Changed | Description |
|------|---------------|-------------|
| `frontend/components/auth/LoginForm.tsx` | +3 / -12 | Remove GitHub button, full-width Google |
| `frontend/components/auth/SignupForm.tsx` | +3 / -12 | Remove GitHub button, full-width Google |
| `backend/routers/projects.py` | +3 / -1 | Add `owner_id IS NULL` to listing query |

## Deployment

| Service | Platform | Commit | Status |
|---------|----------|--------|--------|
| Frontend | Vercel | `7d4225b` | Live (auto-deploy) |
| Backend | Render (Docker) | `ecf3568` | Live (auto-deploy) |

## Auth Flow (Complete End-to-End)

```
User visits /projects (unauthenticated)
  -> ProtectedRoute detects no session         (v0.13.2)
  -> Redirect to /auth/login                   (v0.13.2)
  -> User signs in with Google or email        (v0.13.3: GitHub removed)
  -> Supabase OAuth -> redirect with token
  -> AuthProvider picks up session
  -> ProtectedRoute allows access              (v0.13.2)
  -> GET /api/projects with Bearer token
  -> Backend validates JWT via Supabase
  -> Query returns owned + collaborated + team + public + orphaned projects (v0.13.3)
  -> Project list renders
```

## Verification Checklist

- [x] Login page shows email/password + Google only (no GitHub)
- [x] Signup page shows email/password + Google only (no GitHub)
- [x] Backend returns 401 for unauthenticated /api/projects requests
- [x] Backend returns projects (including orphaned) for authenticated requests
- [x] ProtectedRoute redirects to /auth/login when not authenticated
- [x] After login, /projects page shows all accessible projects
