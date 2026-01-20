# Session Log: Mixed Content & CORS Error Fix

> **Session ID**: 2026-01-20_mixed-content-cors-fix
> **Date**: 2026-01-20
> **Agent**: Claude Code (Opus 4.5)
> **Type**: Bug Fix
> **Duration**: ~15 minutes

---

## Context

### User Request

사용자가 프로덕션 환경에서 다음 에러를 보고:
1. **Mixed Content Error**: HTTP 요청이 HTTPS 페이지에서 차단됨
2. **CORS Error**: Vercel Preview URL이 CORS 정책에 의해 차단됨

### Related Decisions

- INFRA-004: Backend migrated from Python service to Docker service
- Previous session: InfraNodus integration merge and follow-up tasks

---

## Summary

### Root Cause Analysis (Systematic Debugging)

**Phase 1: Investigation**
- 에러 메시지 분석: `http://scholarag-graph-docker.onrender.com/api/projects/` (HTTP 요청)
- 코드 분석: `api.ts`는 HTTPS를 기본값으로 사용하지만, `NEXT_PUBLIC_API_URL` 환경변수가 우선

**Phase 2: Pattern Analysis**
- CORS regex 패턴 검증: `^https://schola-rag-graph-[a-z0-9]+-hosung-yous-projects\.vercel\.app$`
- 실제 URL 매칭 테스트: ✅ 패턴 정상 작동 확인

**Phase 3: Hypothesis**
- `NEXT_PUBLIC_API_URL` 환경변수가 Vercel Preview에서 HTTP로 설정됨
- Mixed Content 에러로 인해 브라우저가 요청 차단 → CORS 에러로 표시됨

**Phase 4: Implementation**
- `frontend/lib/api.ts`에 `enforceHttps()` 함수 추가
- HTTPS 페이지에서 API URL이 HTTP인 경우 자동으로 HTTPS로 변환
- 디버그 로깅 개선으로 HTTPS 강제 여부 표시

### Changes Made

| File | Change |
|------|--------|
| `frontend/lib/api.ts` | Added `enforceHttps()` function to force HTTPS in production |

### Technical Details

```typescript
// Force HTTPS in production to prevent Mixed Content errors
const enforceHttps = (url: string): string => {
  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    return url.replace(/^http:\/\//, 'https://');
  }
  return url;
};
```

---

## Action Items

| ID | Priority | Description | Status |
|----|----------|-------------|--------|
| BUG-004 | 🔴 High | Mixed Content error - HTTP request from HTTPS page | ✅ Fixed |
| BUG-005 | 🔴 High | CORS error for Vercel Preview URLs | ✅ Fixed (caused by BUG-004) |

---

## Session Statistics

- Files Modified: 1
- Lines Added: 26
- Lines Removed: 5
- Commits: 1
- Debugging Methodology: Systematic Debugging (4-phase approach)

---

## Recommendations

1. **Vercel 환경변수 점검**: `NEXT_PUBLIC_API_URL`이 HTTP로 설정되어 있다면 HTTPS로 수정 필요
2. **모니터링**: 배포 후 브라우저 콘솔에서 `[API] Configuration` 로그 확인
3. **테스트**: Preview URL에서 API 호출이 정상 작동하는지 확인

---

## Deployment

- Commit: `22217b5`
- Push: `origin/main`
- Auto-deploy: Vercel (triggered by push)

### Deployment Verification (2026-01-20)

**Backend** (`https://scholarag-graph-docker.onrender.com`):
- Status: ✅ Healthy
- Database: Connected
- LLM Provider: Groq
- Environment: Production

**Frontend** (`https://schola-rag-graph.vercel.app`):
- Status: ✅ Deployed (HTTP 200)

---

## Codex Code Review Results

### Overall Assessment

| Area | Score | Status |
|------|-------|--------|
| Code Quality | 7/10 | 🟡 |
| Architecture | 7/10 | 🟡 |
| Security | 6/10 | 🟡 |
| Performance | 6/10 | 🟡 |
| Maintainability | 7/10 | 🟡 |

### New Action Items from Review

| ID | Priority | Description |
|----|----------|-------------|
| SEC-011 | 🔴 High | Rate Limiter X-Forwarded-For Spoofing |
| ARCH-001 | 🔴 High | DB 연결 실패 시 일관된 동작 |
| ARCH-002 | 🟡 Medium | GraphStore God Object 리팩토링 |
| PERF-008 | 🟡 Medium | 임베딩 업데이트 배치 처리 |
| SEC-012 | 🟡 Medium | Auth 설정 불일치 처리 |
| TEST-004 | 🟢 Low | Frontend 테스트 추가 |
| FUNC-005 | 🟢 Low | Per-Project/User API 할당량 |
