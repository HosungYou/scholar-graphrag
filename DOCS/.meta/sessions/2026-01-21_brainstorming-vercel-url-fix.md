# Session Log: Brainstorming & Parallel Agent Investigation - BUG-018

> **Session ID**: 2026-01-21_brainstorming-vercel-url-fix
> **Date**: 2026-01-21
> **Agent**: Claude Code (Opus 4.5)
> **Type**: Debugging / Root Cause Analysis
> **Duration**: ~30 minutes
> **Skills Used**: `superpowers:brainstorming`, `superpowers:dispatching-parallel-agents`, `superpowers:systematic-debugging`

---

## Context

### User Request
이전 세션(BUG-015/016/017 수정)에서 배포 완료되었지만 여전히 동일한 에러가 발생. 다른 접근법/방법론을 사용하여 문제 해결 요청.

### Screenshots Provided
1. Mixed Content 에러: `http://scholarag-graph-docker.onrender.com/api/projects`
2. CORS 에러
3. 그래프: Nodes: 18, Edges: 0, Clusters: 0
4. Insight HUD: 0% Diversity, "Bias Detected"

### Previous Session
- `2026-01-21_parallel-agent-debugging-deployment-fix.md` - BUG-015/016/017 수정

---

## Methodology: Superpower Skills 활용

### Phase 1: Brainstorming Skill

`superpowers:brainstorming` 스킬을 사용하여 체계적 문제 탐색 계획 수립:

```
┌─────────────────────────────────────────────────────────────────┐
│                    문제 탐색 계획                                │
├─────────────────────────────────────────────────────────────────┤
│  1. Vercel Preview 환경변수 확인                                 │
│  2. api.ts enforceHttps 로직 재검토                             │
│  3. 그래프 엣지 0개 원인 분석                                    │
│  4. 최근 시각화 커밋 반영 여부 확인                              │
└─────────────────────────────────────────────────────────────────┘
```

### Phase 2: Browser Automation

`claude-in-chrome` MCP를 사용하여 Vercel 환경 변수 직접 확인:

1. Vercel Dashboard 접속: `https://vercel.com/hosung-yous-projects/schola-rag-graph`
2. Settings → Environment Variables 페이지 탐색
3. `NEXT_PUBLIC_API_URL` 값 확인

**발견**: 환경 변수는 `https://scholarag-graph-docker.o...`로 **HTTPS 정상 설정**됨

→ 환경 변수가 원인이 아님을 확인

### Phase 3: Parallel Agent Dispatching

`superpowers:dispatching-parallel-agents` 스킬로 3개 에이전트 병렬 조사:

| Agent | 작업 | 발견 사항 |
|-------|------|----------|
| **Agent 1** | HTTP URL 하드코딩 검색 | 🔴 `vercel.json`에 폐기된 URL 발견! |
| **Agent 2** | 그래프 엣지 0개 분석 | Temporal 필터링 또는 데이터 문제 가능성 |
| **Agent 3** | 시각화 커밋 확인 | 로컬/원격 완전 동기화 확인 |

---

## Root Cause Discovery

### BUG-018: vercel.json 폐기된 Render 서비스 URL

**Agent 1이 발견한 핵심 문제**:

```json
// frontend/vercel.json (버그)
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://scholarag-graph-api.onrender.com/api/:path*"
      // ❌ 삭제된 Python 서비스! (INFRA-004에서 삭제됨)
    }
  ]
}
```

**왜 이전 수정(BUG-015/016/017)이 작동하지 않았는가**:

```
┌─────────────────────────────────────────────────────────────────┐
│                    요청 흐름 분석                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  브라우저 (HTTPS)                                               │
│       ↓                                                         │
│  Vercel Frontend                                                │
│       ↓                                                         │
│  vercel.json rewrite 규칙                                       │
│       ↓                                                         │
│  scholarag-graph-api.onrender.com ← ❌ 존재하지 않는 서비스     │
│                                                                 │
│  api.ts의 enforceHttps는 vercel.json rewrite와 무관!            │
│  환경 변수 NEXT_PUBLIC_API_URL도 rewrite와 무관!                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**INFRA-004와의 연관성**:
- 2026-01-20에 Python 서비스(`scholarag-graph-api`)를 Docker 서비스(`scholarag-graph-docker`)로 마이그레이션
- 환경 변수는 업데이트되었으나 `vercel.json` rewrite 규칙 업데이트 누락

---

## Resolution

### 수정 사항

**1. frontend/vercel.json**
```json
// Before
"destination": "https://scholarag-graph-api.onrender.com/api/:path*"

// After
"destination": "https://scholarag-graph-docker.onrender.com/api/:path*"
```

**2. frontend/.env.local.example**
```bash
# Before
NEXT_PUBLIC_API_URL=https://scholarag-graph-api.onrender.com

# After
NEXT_PUBLIC_API_URL=https://scholarag-graph-docker.onrender.com
```

### Commits

| Commit | Description |
|--------|-------------|
| `3523eb4` | fix(BUG-018): update deprecated Render service URL in vercel.json |
| `659eb28` | docs: add BUG-018 to action-items with detailed discovery method |

---

## Additional Findings

### 그래프 엣지 0개 문제 (Agent 2)

**가능한 원인들**:
1. Temporal Slider가 활성화되어 과거 연도로 설정된 경우
2. 엣지 데이터에 `first_seen_year` 속성 누락
3. 백엔드에서 엣지 데이터가 반환되지 않음

**디버깅 방법**:
```javascript
// 브라우저 DevTools에서 확인
// Network 탭 → /api/graph/visualization/{project_id} 응답 확인
// edges 배열이 비어있는지 확인
```

### 시각화 커밋 현황 (Agent 3)

**확인 결과**: 모든 InfraNodus 시각화 기능이 동기화됨
- InsightHUD (Modularity, Diversity, Density)
- MainTopicsPanel (클러스터 비율)
- TemporalSlider (연도별 애니메이션)
- EdgeContextModal (엣지 원문 표시)
- BridgeHypothesisCard (AI 브릿지 가설)
- GraphComparison (프로젝트 비교)

---

## Session Statistics

| Metric | Value |
|--------|-------|
| Skills Used | 3 (brainstorming, dispatching-parallel-agents, systematic-debugging) |
| Parallel Agents Dispatched | 3 |
| Browser Automation Actions | 8 (navigate, screenshot, click, find) |
| Bugs Fixed | 1 (BUG-018) |
| Commits Made | 2 |
| Files Modified | 2 |
| Files Read | 10+ |

---

## Key Learnings

### 1. Infrastructure Migration Checklist 필요
INFRA-004 마이그레이션 시 다음 항목들을 모두 업데이트해야 함:
- [x] 환경 변수 (NEXT_PUBLIC_API_URL)
- [x] 백엔드 CORS 설정
- [ ] **vercel.json rewrite 규칙** ← 이번에 누락됨

### 2. 환경 변수 vs Rewrite 규칙
- 환경 변수: 클라이언트 사이드 JavaScript에서 사용
- vercel.json rewrite: 서버 사이드에서 요청 라우팅
- 둘 다 업데이트해야 완전한 마이그레이션

### 3. 브라우저 자동화의 효과
- Vercel 환경 변수를 직접 확인하여 문제 영역 축소
- "환경 변수는 정상" → 다른 곳에서 URL 문제 검색

### 4. 병렬 에이전트 디스패칭
- 독립적인 문제 영역을 동시에 조사
- Agent 1이 핵심 문제 발견
- Agent 2, 3은 부가 정보 제공

---

## Related Documents

- `DOCS/project-management/action-items.md` - BUG-018 추가
- `DOCS/.meta/sessions/2026-01-21_parallel-agent-debugging-deployment-fix.md` - 이전 세션
- `frontend/vercel.json` - 수정된 파일
- `frontend/.env.local.example` - 수정된 파일
