# ScholaRAG_Graph Action Items

> 이 문서는 코드 리뷰, 기능 구현, 버그 수정 등에서 발견된 액션 아이템을 추적합니다.
>
> **마지막 업데이트**: 2026-01-15
> **관리자**: Claude Code

---

## 📊 Status Overview

| Priority | Total | Completed | In Progress | Pending |
|----------|-------|-----------|-------------|---------|
| 🔴 High | 3 | 0 | 0 | 3 |
| 🟡 Medium | 3 | 0 | 0 | 3 |
| 🟢 Low | 3 | 0 | 0 | 3 |
| **Total** | **9** | **0** | **0** | **9** |

---

## 🔴 High Priority (Immediate Action Required)

### SEC-001: Graph/Chat 엔드포인트 인증 강제
- **Source**: Code Review 2026-01-15
- **Status**: ⬜ Pending
- **Assignee**: Backend Team
- **Files**:
  - `backend/routers/graph.py:302, 467, 542, 596`
  - `backend/routers/chat.py:410-555`
- **Description**: 모든 graph/chat 엔드포인트에 인증 및 프로젝트 접근 검사를 강제해야 함
- **Acceptance Criteria**:
  - [ ] 모든 graph 엔드포인트에 `Depends(get_current_user)` 추가
  - [ ] 프로젝트 소유권/협업자 접근 검증 로직 추가
  - [ ] 단위 테스트 작성
- **Created**: 2026-01-15
- **Completed**: -

---

### SEC-002: AuthMiddleware 중앙화
- **Source**: Code Review 2026-01-15
- **Status**: ⬜ Pending
- **Assignee**: Backend Team
- **Files**:
  - `backend/main.py:93-105`
- **Description**: AuthMiddleware를 미들웨어로 설치하거나 모든 라우트에서 정책 기반 dependency를 명시적으로 사용
- **Acceptance Criteria**:
  - [ ] 중앙 집중식 인증 미들웨어 구현
  - [ ] 또는 모든 라우트에 명시적 auth dependency 추가
  - [ ] 인증 우회 테스트 작성
- **Created**: 2026-01-15
- **Completed**: -

---

### SEC-003: Supabase RLS 정책 활성화
- **Source**: Code Review 2026-01-15
- **Status**: ⬜ Pending
- **Assignee**: Database Team
- **Files**:
  - `database/migrations/005_user_profiles.sql:98-127`
- **Description**: 주석 처리된 Supabase RLS 정책을 활성화하거나 비활성화 이유를 명시적으로 문서화
- **Acceptance Criteria**:
  - [ ] RLS 정책 활성화 또는
  - [ ] 비활성화 이유 문서화 (보안 검토 포함)
  - [ ] RLS 테스트 케이스 작성
- **Created**: 2026-01-15
- **Completed**: -

---

## 🟡 Medium Priority (Short-term)

### FUNC-001: Orchestrator DB/GraphStore 연결
- **Source**: Code Review 2026-01-15
- **Status**: ⬜ Pending
- **Assignee**: Backend Team
- **Files**:
  - `backend/routers/chat.py:389-403`
- **Description**: `AgentOrchestrator`를 `db`와 `GraphStore`로 초기화하여 쿼리가 실제 데이터에 기반하도록 함
- **Acceptance Criteria**:
  - [ ] Orchestrator 초기화 시 DB 연결 전달
  - [ ] GraphStore 인스턴스 전달
  - [ ] 통합 테스트 작성
- **Created**: 2026-01-15
- **Completed**: -

---

### BUG-001: datetime import 누락 수정
- **Source**: Code Review 2026-01-15
- **Status**: ⬜ Pending
- **Assignee**: Backend Team
- **Files**:
  - `backend/routers/teams.py:59-66`
- **Description**: `datetime` import가 누락되어 런타임 에러 발생 가능
- **Acceptance Criteria**:
  - [ ] `from datetime import datetime` 추가
  - [ ] 단위 테스트로 검증
- **Created**: 2026-01-15
- **Completed**: -

---

### FUNC-002: Frontend API Authorization 헤더
- **Source**: Code Review 2026-01-15
- **Status**: ⬜ Pending
- **Assignee**: Frontend Team
- **Files**:
  - `frontend/lib/api.ts:27-44`
- **Description**: API 클라이언트에 Supabase 액세스 토큰을 Authorization 헤더로 첨부
- **Acceptance Criteria**:
  - [ ] Supabase 세션에서 토큰 추출
  - [ ] API 요청에 Bearer 토큰 첨부
  - [ ] 토큰 갱신 로직 구현
- **Created**: 2026-01-15
- **Completed**: -

---

## 🟢 Low Priority (Long-term)

### PERF-001: LLM 결과 캐싱
- **Source**: Code Review 2026-01-15
- **Status**: ⬜ Pending
- **Assignee**: Backend Team
- **Description**: LLM 결과 및 그래프 쿼리에 캐싱 추가
- **Acceptance Criteria**:
  - [ ] Redis 또는 인메모리 캐시 구현
  - [ ] 캐시 무효화 전략 정의
  - [ ] 성능 벤치마크 수행
- **Created**: 2026-01-15
- **Completed**: -

---

### PERF-002: Redis Rate Limiting
- **Source**: Code Review 2026-01-15
- **Status**: ⬜ Pending
- **Assignee**: DevOps Team
- **Description**: In-memory Rate Limiting을 Redis로 교체 (다중 인스턴스 배포용)
- **Acceptance Criteria**:
  - [ ] Redis 기반 Rate Limiter 구현
  - [ ] 환경별 설정 지원
  - [ ] 부하 테스트 수행
- **Created**: 2026-01-15
- **Completed**: -

---

### PERF-003: N+1 쿼리 최적화
- **Source**: Code Review 2026-01-15
- **Status**: ⬜ Pending
- **Assignee**: Backend Team
- **Files**:
  - `backend/routers/projects.py`
  - `backend/routers/chat.py`
- **Description**: 프로젝트 통계 및 채팅 기록에 쿼리 배칭 또는 사전 집계 추가
- **Acceptance Criteria**:
  - [ ] N+1 쿼리 패턴 식별 및 수정
  - [ ] JOIN 또는 서브쿼리로 최적화
  - [ ] 쿼리 성능 측정
- **Created**: 2026-01-15
- **Completed**: -

---

## 📝 Completed Items Archive

<!--
완료된 항목은 아래로 이동합니다.
형식:
### [ID]: 제목
- **Completed**: YYYY-MM-DD
- **Verified By**: [Name/Agent]
- **Notes**: 완료 시 특이사항
-->

*아직 완료된 항목이 없습니다.*

---

## 📋 How to Use This Document

### Adding New Items
```markdown
### [TYPE]-[NUMBER]: 제목
- **Source**: [리뷰/기능/버그 출처]
- **Status**: ⬜ Pending | 🔄 In Progress | ✅ Completed
- **Assignee**: [담당자/팀]
- **Files**: [관련 파일 목록]
- **Description**: [상세 설명]
- **Acceptance Criteria**:
  - [ ] 조건 1
  - [ ] 조건 2
- **Created**: YYYY-MM-DD
- **Completed**: -
```

### Status Legend
- ⬜ **Pending**: 아직 시작되지 않음
- 🔄 **In Progress**: 진행 중
- ✅ **Completed**: 완료됨
- ❌ **Won't Fix**: 수정하지 않기로 결정

### Type Prefixes
- `SEC`: Security (보안)
- `BUG`: Bug Fix (버그 수정)
- `FUNC`: Functionality (기능)
- `PERF`: Performance (성능)
- `DOC`: Documentation (문서)
- `TEST`: Testing (테스트)

---

*이 문서는 Claude Code에 의해 자동으로 관리됩니다.*
