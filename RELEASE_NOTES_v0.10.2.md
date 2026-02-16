# ScholaRAG Graph v0.10.2 Release Notes

**Release Date**: 2026-02-06  
**Type**: Patch Release (Stability + Memory + Observability)  
**Previous**: `v0.10.1` (2026-02-06)

---

## Summary

v0.10.2는 반복 재진입/장시간 사용 시 누적되던 메모리와 백그라운드 작업 부하를 줄이는 안정화 릴리즈입니다.

핵심 목표:
1. Import 진행 콜백의 task 폭증 방지
2. Legacy in-memory import 상태 누적 정리
3. 백엔드 주기 유지보수(캐시/quota/job cleanup) 강화
4. 프론트 폴링/인터벌 경량화

---

## Problem

재진입과 import 진행이 반복되는 조건에서 다음 패턴이 관찰되었습니다.
- 진행 콜백마다 `create_task()`가 생성되어 순간 task 수가 증가
- legacy `_import_jobs` 상태가 누적
- quota 버퍼가 주기적으로 flush되지 않음
- 프론트 폴링이 탭 비활성 상태에서도 지속

---

## Root Cause

### 1) Import 진행 업데이트의 무제한 비동기 fan-out
- `backend/routers/import_.py`에서 progress callback마다 `loop.create_task(job_store.update_job(...))` 실행
- high-frequency 콜백에서 task 생성량이 처리량을 초과할 수 있음

### 2) Legacy in-memory 상태 정리 루틴 부재
- `_import_jobs`는 호환성 용도로 유지되지만 terminal job 정리 정책이 없었음

### 3) 운영성 maintenance 루프의 커버리지 부족
- cache cleanup은 있으나 quota flush/old job cleanup 연계가 약했음

### 4) 프론트 폴링의 visibility 미인지
- hidden tab에서도 동일 주기로 polling/interval이 계속 실행됨

---

## Changes

### A. Import progress backpressure/coalescing 적용

**파일**: `backend/routers/import_.py`

- `_CoalescedJobProgressUpdater` 추가
  - 최신 progress/message만 유지하는 단일 worker 패턴
  - unbounded `create_task()` fan-out 제거
- `_QueuedCheckpointSaver` 추가
  - checkpoint 저장을 단일 queue worker로 직렬화
- 적용 경로:
  - `_run_pdf_import`
  - `_run_multiple_pdf_import`
  - `_run_zotero_import`

### B. Legacy import 메모리 정리 유틸 추가

**파일**: `backend/routers/import_.py`

- `cleanup_legacy_import_jobs(max_age_hours=24)` 추가
- terminal 상태(`completed`, `failed`, `interrupted`) + 시간 기준 정리

### C. 백엔드 maintenance 루프 강화

**파일**: `backend/main.py`

- 5분 주기 루프에 `quota_service.flush_buffer()` 통합
- 1시간 주기로
  - legacy import job cleanup
  - `JobStore.cleanup_old_jobs(days=7)` 실행
- shutdown 시
  - quota buffer flush + cache clear
  - legacy import cleanup + old jobs cleanup

### D. 프론트 폴링/인터벌 경량화

**파일**:
- `frontend/components/import/ImportProgress.tsx`
- `frontend/components/graph/StatusBar.tsx`
- `frontend/components/graph/Graph3D.tsx`

변경:
- `setInterval` 기반 polling을 단일 `setTimeout` 루프로 전환
- in-flight 중복 요청 방지
- `document.visibilityState === 'hidden'`일 때 polling 감속/스킵
- Graph3D 주기 완화:
  - 위치 저장 500ms → 2000ms
  - 카메라 체크 200ms → 750ms

---

## Files Changed

| File | Type | Description |
|------|------|-------------|
| `backend/routers/import_.py` | Updated | Coalesced progress updates, queued checkpoint saver, legacy cleanup |
| `backend/main.py` | Updated | Periodic maintenance + shutdown cleanup hardening |
| `frontend/components/import/ImportProgress.tsx` | Updated | Visibility-aware polling loop |
| `frontend/components/graph/StatusBar.tsx` | Updated | Visibility-aware status polling loop |
| `frontend/components/graph/Graph3D.tsx` | Updated | Reduced interval frequency and hidden-tab skip |

---

## Expected Impact

- Import 중 task burst 감소
- 재진입/장시간 실행 시 메모리 누적 완화
- Starter-tier 환경에서 CPU/메모리 압박 완화
- hidden tab에서 불필요한 네트워크 호출 감소

---

## Compatibility

- Breaking change 없음
- API contract 변경 없음
- 데이터 마이그레이션 불필요

---

## Validation

- Python syntax:
  - `python3 -m py_compile backend/routers/import_.py backend/main.py` ✅
- Backend tests:
  - `pytest -q backend/tests/test_importer.py` ✅
- Frontend lint (changed files):
  - `npm run -s lint -- --file components/import/ImportProgress.tsx --file components/graph/StatusBar.tsx --file components/graph/Graph3D.tsx` ✅

Known environment/test gaps:
- 일부 backend 테스트는 `email-validator` 미설치로 실패 가능
- frontend `type-check`는 기존 Jest 타입 설정 이슈가 남아 있음 (이번 릴리즈 변경과 직접 무관)

