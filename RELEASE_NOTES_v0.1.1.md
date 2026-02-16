# Release Notes - v0.1.1 Security Patch

**Release Date**: 2026-01-16
**PR**: [#13](https://github.com/HosungYou/ScholaRAG_Graph/pull/13)
**Commit**: `f97ffd7`

---

## Overview

This release addresses 8 security vulnerabilities identified during a comprehensive code review using OpenAI Codex CLI. All patches have been validated with 139 passing tests.

---

## Security Fixes

### Critical Severity

#### 1. Graph API - Missing Project Access Control
**File**: `backend/routers/graph.py`

**Vulnerability**: Graph API endpoints allowed access to any project's data without verifying user permissions, enabling unauthorized data access.

**Fix**: Added `verify_project_access()` function that checks:
- Project existence (returns 404 if not found)
- User ownership or collaborator status (returns 403 if unauthorized)

**Affected Endpoints**:
- `GET /api/graph/nodes`
- `GET /api/graph/edges`
- `GET /api/graph/visualization/{project_id}`
- `GET /api/graph/subgraph/{node_id}`
- `POST /api/graph/search`
- `GET /api/graph/similar/{node_id}`
- `GET /api/graph/gaps/{project_id}`

---

#### 2. Chat API - Missing Project Access Control
**File**: `backend/routers/chat.py`

**Vulnerability**: Chat endpoints allowed querying any project without authorization, potentially exposing sensitive research data.

**Fix**: Added project and conversation-level access verification:
- `verify_project_access()` for project-based endpoints
- `_db_check_conversation_project_access()` for conversation-based endpoints

**Affected Endpoints**:
- `POST /api/chat/query`
- `GET /api/chat/history/{project_id}`
- `POST /api/chat/explain/{node_id}`
- `POST /api/chat/ask-about/{node_id}`

---

### High Severity

#### 3. Rate Limiting Disabled in Production
**Files**: `backend/config.py`, `backend/main.py`

**Vulnerability**: Rate limiting was hardcoded as disabled, leaving the API vulnerable to brute-force and DoS attacks.

**Fix**:
- Added `rate_limit_enabled` configuration setting (default: `true`)
- Rate limiting automatically enabled in production/staging environments
- Can be disabled for local development via `RATE_LIMIT_ENABLED=false`

```python
# Production: enabled by default
# Development: disabled automatically when ENVIRONMENT=development
_rate_limit_enabled = settings.rate_limit_enabled and settings.environment != "development"
```

---

#### 4. Import Path Restriction Bypass
**Files**: `backend/routers/import_.py`, `docker-compose.yml`

**Vulnerability**:
- Relative paths could bypass import directory restrictions
- Environment variable name mismatch between Docker and config

**Fix**:
- Added explicit `Path.is_absolute()` check rejecting relative paths with 400 error
- Aligned Docker environment variables with config.py settings:
  - `SCHOLARAG_IMPORT_ROOT` (was `ALLOWED_IMPORT_ROOTS`)
  - `SCHOLARAG_IMPORT_ROOT_2`

---

### Medium Severity

#### 5. PRISMA SVG/HTML Injection (XSS)
**File**: `backend/graph/prisma_generator.py`

**Vulnerability**: User-provided title, database source names, and exclusion reasons were embedded directly into SVG/HTML output without sanitization.

**Fix**: Added `_sanitize()` function using `html.escape()`:
```python
def _sanitize(value: str) -> str:
    """Sanitize user input for safe embedding in SVG/HTML."""
    if not isinstance(value, str):
        return str(value)
    return html.escape(value, quote=True)
```

**Sanitized Fields**:
- Diagram title
- Database source names
- Exclusion reason text

---

#### 6. Unpinned Dependency Versions
**File**: `backend/requirements.txt`

**Vulnerability**: Dependencies used only minimum version constraints (`>=`), allowing potentially vulnerable newer versions to be installed.

**Fix**: Added upper version bounds to all packages:
```
# Before
fastapi>=0.109.0

# After
fastapi>=0.109.0,<1.0.0
```

All 50 dependencies now have major version caps to prevent unexpected breaking changes and security regressions.

---

### Low Severity

#### 7. Docker Compose Security Hardening
**File**: `docker-compose.yml`

**Vulnerabilities**:
- Default credentials in compose file
- Ports bound to all interfaces (0.0.0.0)
- No container privilege restrictions
- Single flat network topology

**Fixes**:
- Required environment variables (fails if not set):
  ```yaml
  POSTGRES_USER: ${POSTGRES_USER:?POSTGRES_USER must be set}
  POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?POSTGRES_PASSWORD must be set}
  ```
- Localhost-only port binding by default:
  ```yaml
  ports:
    - "${DB_HOST:-127.0.0.1}:${DB_PORT:-5432}:5432"
  ```
- Container hardening:
  ```yaml
  security_opt:
    - no-new-privileges:true
  read_only: true
  tmpfs:
    - /tmp:size=100M,mode=1777
  ```
- Network isolation:
  - `scholarag_internal`: Backend-DB only (not exposed)
  - `scholarag_frontend`: Frontend-Backend only

---

#### 8. Absolute Path Enforcement
**File**: `backend/routers/import_.py`

**Note**: Addressed as part of High #4 (Import Path Restriction).

---

## Files Changed

| File | Lines Changed |
|------|---------------|
| `backend/routers/graph.py` | +167 |
| `backend/routers/chat.py` | +109 |
| `docker-compose.yml` | +88 |
| `backend/graph/prisma_generator.py` | +42 |
| `backend/routers/import_.py` | +8 |
| `backend/main.py` | +7 |
| `backend/config.py` | +5 |
| `backend/requirements.txt` | modified |
| `backend/tests/test_api_integration.py` | +4 |

**Total**: +417 lines, -78 lines (9 files)

---

## Testing

All security patches validated:

```
================= 139 passed, 4 skipped, 21 warnings in 1.66s ==================
```

### Key Test Validations
- `test_import_path_traversal_blocked` - Confirms relative path rejection
- `test_get_nodes`, `test_get_edges` - Confirms project access verification
- `test_chat_requires_project_id` - Confirms chat authorization
- `test_sanitized_error_messages` - Confirms no sensitive data leakage

---

## Upgrade Notes

### Breaking Changes
None. All changes are backward-compatible.

### Configuration Changes

#### Required for Docker Deployment
Create a `.env` file with required credentials:
```bash
POSTGRES_USER=your_secure_user
POSTGRES_PASSWORD=$(openssl rand -base64 32)
```

#### Optional Settings
```bash
# Disable rate limiting for development
RATE_LIMIT_ENABLED=false
ENVIRONMENT=development

# Configure import directories
SCHOLARAG_IMPORT_ROOT=/path/to/imports
SCHOLARAG_IMPORT_ROOT_2=/path/to/secondary
```

---

## Recommendations

1. **Rotate credentials** if default passwords were ever used in production
2. **Review access logs** for any unauthorized project access attempts
3. **Update dependencies** regularly and monitor for CVEs
4. **Enable rate limiting** in all non-development environments

---

## Credits

Security review performed using OpenAI Codex CLI (`gpt-5.2-codex`).
