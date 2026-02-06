# Test Design Document (TDD)

**Project**: ScholaRAG_Graph  
**Version**: 0.10.2  
**Last Updated**: 2026-02-06  
**Status**: Active  
**Document Type**: Test Design & Verification Specification

---

## 1. Purpose

본 문서는 ScholaRAG_Graph의 테스트 설계 기준을 정의합니다.
핵심 목적은 다음과 같습니다.

1. SDD(Software Design Document)와 테스트 전략의 추적 가능성 확보
2. Unit → Integration → E2E 3계층 검증 체계 표준화
3. 안정성 이슈(재진입, 메모리, 백그라운드 작업) 회귀 테스트 강화

---

## 2. Scope

### In Scope
- Backend API/Service/Importer 테스트
- Frontend component/store/API client 테스트
- 운영 안정성 회귀 테스트 (reopen, polling, background jobs)
- CI/CD 게이팅 기준

### Out of Scope
- 성능 벤치마크의 절대 수치 보장
- 외부 인프라(Render/Vercel/Supabase) 내부 상태의 완전 재현
- 프로덕션 실데이터 기반 카나리 테스트

---

## 3. Test Architecture

본 프로젝트는 3계층 테스트 구조를 기본으로 사용합니다.

1. Unit
- 목적: 비즈니스 로직/헬퍼 함수의 빠른 검증
- 특징: 외부 I/O 최소화, mocking 기반
- 예시: `backend/tests/test_importer.py`, `frontend/__tests__/hooks/useGraphStore.test.ts`

2. Integration
- 목적: DB/라우터/서비스 간 경계 통합 검증
- 특징: async DB, API route, importer 흐름 검증
- 예시: `backend/tests/test_api_integration.py`, `backend/tests/test_graph_router.py`

3. E2E
- 목적: 사용자 워크플로우 관점의 종단 검증
- 특징: API-UI-상태 전이 포함
- 예시: `DOCS/testing/infranodus-e2e-test-cases.md` (manual E2E 기준)

---

## 4. SDD-TDD Traceability

| SDD 영역 | 설계 포인트 | 테스트 유형 | 테스트 자산 |
|---|---|---|---|
| Multi-Agent Pipeline | 의도 분류/응답 생성 | Unit/Integration | `backend/tests/test_agents.py` |
| Graph Router | 탐색/분석/evidence 조회 | Integration | `backend/tests/test_graph_router.py` |
| Import Pipeline | PDF/Zotero import 상태 전이 | Unit/Integration | `backend/tests/test_importer.py`, `backend/tests/test_zotero_rdf_importer.py` |
| Frontend Graph UX | 3D 렌더/상태 갱신 | Unit (component) | `frontend/__tests__/components/graph/Graph3D.test.tsx` |
| Auth/Policy | 접근 제어 | Unit/Integration | `backend/tests/test_auth.py`, `backend/tests/test_auth_policies.py` |
| InfraNodus Features | Gap/Evidence/Temporal UX | E2E | `DOCS/testing/infranodus-e2e-test-cases.md` |

---

## 5. v0.10.2 Regression Design

### 5.1 Backend Stability

1. Import progress update backpressure
- 대상: `backend/routers/import_.py`
- 목적: progress callback 폭주 시 task 누적 방지
- 전략:
  - 콜백 1000회 burst를 모의하고 update 호출 수가 bounded/coalesced 되는지 검증
  - terminal transition 시 `flush_and_close()`가 final progress를 반영하는지 확인

2. Checkpoint write serialization
- 대상: `backend/routers/import_.py`
- 목적: Zotero resume checkpoint 저장이 순차적으로 반영되는지 검증
- 전략:
  - paper_id 순서가 뒤섞인 이벤트 입력 시 queue 기반 직렬 처리 보장 확인

3. Maintenance lifecycle
- 대상: `backend/main.py`
- 목적: 주기 정리 및 shutdown cleanup 동작 검증
- 전략:
  - quota flush, legacy job cleanup, old job cleanup 호출 여부 검증
  - 예외 발생 시 앱 종료가 중단되지 않는지 검증

### 5.2 Frontend Stability

1. Import polling single-flight
- 대상: `frontend/components/import/ImportProgress.tsx`
- 목적: 중복 polling 및 hidden-tab 불필요 호출 감소
- 전략:
  - in-flight 동안 추가 요청 미발생
  - `document.visibilityState='hidden'`에서 polling 지연 확인

2. Status polling single-flight
- 대상: `frontend/components/graph/StatusBar.tsx`
- 목적: 상태 조회의 interval 폭주/중복 호출 방지
- 전략:
  - 루프 기반 polling에서 한 번에 1요청만 진행되는지 검증

3. Graph3D interval budget
- 대상: `frontend/components/graph/Graph3D.tsx`
- 목적: 고빈도 interval 완화로 CPU/메모리 부담 감소
- 전략:
  - 위치 저장/카메라 체크 주기 및 hidden-tab skip 동작 검증

---

## 6. Test Execution Policy

### Required Local Checks (for release candidates)

```bash
# Backend syntax
python3 -m py_compile backend/main.py backend/routers/import_.py

# Targeted backend regression tests
pytest -q backend/tests/test_importer.py

# Frontend changed-file lint
cd frontend
npm run -s lint -- --file components/import/ImportProgress.tsx --file components/graph/StatusBar.tsx --file components/graph/Graph3D.tsx
```

### Recommended Extended Checks

```bash
# Backend router regression
pytest -q backend/tests/test_graph_router.py

# Frontend related tests
npm run -s test -- --runInBand __tests__/components/graph/Graph3D.test.tsx __tests__/hooks/useGraphStore.test.ts
```

---

## 7. Known Test Environment Gaps

1. Python dependency gap
- 증상: 일부 backend 테스트 실행 시 `email-validator` 누락 오류
- 영향: `backend/tests/test_graph_router.py` 일부 케이스

2. Frontend type environment gap
- 증상: `npm run type-check`에서 Jest global type 미설정 오류
- 영향: `frontend/__tests__/*` 전반

3. Existing test expectation drift
- 증상: 일부 기존 테스트는 현재 코드 동작과 기대값이 불일치
- 영향: 컴포넌트 테스트 일부 케이스 재정렬 필요

---

## 8. Quality Gates

Release note 작성 전 최소 충족 조건:

1. 변경 파일 lint/syntax 통과
2. 해당 기능의 핵심 회귀 테스트 1개 이상 통과
3. known gap을 릴리즈 노트에 명시

---

## 9. Ownership

| Area | Owner | Review Cycle |
|---|---|---|
| Backend test design | Backend Team | 매 릴리즈 |
| Frontend test design | Frontend Team | 매 릴리즈 |
| E2E/Operations test | Platform Team | 월간 |
| TDD 문서 유지보수 | Core Maintainers | 매 릴리즈 |

---

## 10. Related Documents

- `DOCS/architecture/SDD.md`
- `backend/tests/README.md`
- `DOCS/testing/infranodus-e2e-test-cases.md`
- `RELEASE_NOTES_v0.10.2.md`

