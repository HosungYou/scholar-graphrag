# Playwright E2E + Visual Regression Guide

## 목적

코어 기능을 유지하면서 프론트 핵심 흐름(그래프 상호작용/갭 패널/임포트 상태)의 브라우저 회귀를 자동 검증한다.

## 테스트 구성

1. 상호작용 회귀
   - 파일: `frontend/e2e/graph-interactions.spec.ts`
   - 시나리오:
     - pin/unpin (drag 시뮬레이션)
     - camera reset
     - gap focus

2. 시각 회귀
   - 파일: `frontend/e2e/visual-regression.spec.ts`
   - baseline:
     - `gap-panel-expanded.png`
     - `import-progress-completed.png`
     - `import-progress-interrupted.png`
     - `graph3d-shell.png`
     - `knowledge-graph3d-shell.png`

3. QA 라우트
   - 경로: `frontend/app/qa/e2e/page.tsx`
   - 목적: 백엔드 의존성 없이 결정론적 fixture를 렌더링
   - 시나리오 파라미터:
     - `?scenario=knowledge`
     - `?scenario=graph3d`
     - `?scenario=gap-panel`
     - `?scenario=import-completed`
     - `?scenario=import-interrupted`

## 실행 명령

```bash
make test-frontend-e2e
make test-frontend-visual
```

## baseline 갱신

```bash
cd frontend
npx playwright test -c playwright.config.ts e2e/visual-regression.spec.ts --update-snapshots
```

## CI 연동

CI는 핵심 테스트·인증/권한 검사, 그래프 상호작용 E2E, 운영 Render 백엔드 이미지 빌드, 보안 검사를 실행한다. 프론트 빌드는 Vercel 배포 검사에서 확인한다. 스냅샷 라벨·체크박스·별도 실행 로그는 통과 요건이 아니다.

Linux 기준 이미지가 없는 픽셀 비교는 기본 CI에서 제외한다. 기존 macOS 기준 이미지와 `make test-frontend-visual` 명령은 관련 디자인 변경을 확인할 때 사용할 수 있다.

전체 백엔드 테스트는 `make test-backend-full`로 수동 실행한다. 기존 인증 fixture·HTTPX/DB 인터페이스·예전 기대값에서 실패가 남아 있으며, 핵심 CI 통과는 전체 테스트 통과를 의미하지 않는다.
