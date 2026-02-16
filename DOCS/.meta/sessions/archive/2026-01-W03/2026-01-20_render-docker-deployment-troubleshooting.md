# Session Log: Render Docker Deployment Troubleshooting

## Session Metadata
| Field | Value |
|-------|-------|
| **Session ID** | 2026-01-20_render-docker-deployment |
| **Date** | 2026-01-20 |
| **Agent** | Claude Code (Opus 4.5) |
| **Type** | Troubleshooting / Optimization |
| **Duration** | ~3 hours |

---

## Context

### User Request
- Render Starter 플랜에서 배포 시간 최적화 (기존 15-25분)
- DATABASE_URL 연결 문제 해결
- 코드 리뷰 실행 및 품질 분석

### Related Decisions
- ADR-003: Render Docker 서비스 사용 결정
- Previous Session: `2026-01-19_render-starter-optimization.md`

---

## Issues Encountered & Resolutions

### Issue #1: DATABASE_URL 연결 실패

#### Symptom
```
ERROR:database:Failed to connect to database (check DATABASE_URL configuration)
Health endpoint: {"status":"unhealthy","database":"disconnected"}
```

#### Root Cause Analysis
1. **초기 가설**: Supabase pgbouncer 호환성 문제
2. **실제 원인**: Supabase 비밀번호에 **특수문자 `!!!!`** 포함

URL 인코딩 문제:
```
# 문제가 되는 URL (특수문자 미인코딩)
postgresql://postgres.xxx:MyPass!!!!@aws-0-us-west-1.pooler.supabase.com:6543/postgres

# URL에서 !는 %21로 인코딩되어야 하지만,
# 일부 드라이버/환경에서 인코딩 처리가 일관되지 않음
```

#### Resolution
**Supabase 비밀번호 변경**: `!!!!` 포함 → `ScholaRAG2026` (특수문자 없음)

```bash
# Render Environment Variable 업데이트
DATABASE_URL=postgresql://postgres.rbmfkjkwwjrmjghmqlna:ScholaRAG2026@aws-0-us-west-1.pooler.supabase.com:6543/postgres
```

#### Verification
```bash
curl https://scholarag-graph-docker.onrender.com/health
# Response: {"status":"healthy","database":"connected","pgvector":true}
```

#### Lesson Learned
> **Best Practice**: 데이터베이스 비밀번호에는 URL-safe 문자만 사용하거나,
> 특수문자 사용 시 반드시 URL 인코딩 확인 필요.
> 특히 `!`, `@`, `#`, `$`, `%`, `&` 등은 URL에서 특별한 의미를 가짐.

---

### Issue #2: Slow Docker Build Time (15-25분)

#### Symptom
- Docker 빌드 시간: 15-25분
- 주요 원인: PyTorch + sentence-transformers 설치 (~700MB)

#### Root Cause Analysis
기존 `requirements.txt`에 SPECTER2 관련 무거운 패키지 포함:
```
sentence-transformers>=2.3.0  # PyTorch 의존성 (~700MB)
torch>=2.0.0
```

현재 프로젝트에서 SPECTER2는 **선택적 기능**이며, 기본 운영에는 불필요.

#### Resolution
Requirements 파일 분리:

**1. `requirements-base.txt`** (경량, ~200MB 절약)
```txt
# Core dependencies only
fastapi>=0.109.0
uvicorn[standard]>=0.27.0
asyncpg>=0.29.0
anthropic>=0.18.0
openai>=1.12.0
cohere>=5.0.0
# ... (SPECTER2 제외)
```

**2. `requirements-specter.txt`** (선택적)
```txt
# SPECTER2 Support (Optional - adds ~700MB)
sentence-transformers>=2.3.0,<4.0.0
```

**3. Dockerfile 수정**
```dockerfile
# Build argument for optional SPECTER2
ARG ENABLE_SPECTER2=false

COPY backend/requirements-base.txt .
COPY backend/requirements-specter.txt .

RUN pip install --no-cache-dir -r requirements-base.txt && \
    if [ "$ENABLE_SPECTER2" = "true" ]; then \
        pip install --no-cache-dir -r requirements-specter.txt; \
    fi
```

#### Expected Improvement
| Metric | Before | After (Expected) |
|--------|--------|------------------|
| Image Size | ~2.5GB | ~1.8GB |
| Build Time | 15-25분 | 8-12분 |
| PyTorch | Included | Optional |

#### Status
- ✅ 코드 커밋됨 (`866b23c`)
- ⏳ 배포 대기 중 (Pipeline minutes 소진으로 차단)

---

### Issue #3: Build Failed - Pipeline Minutes Exhausted

#### Symptom
```
Deploy failed for 866b23c
Build blocked for 866b23c
"Your workspace has run out of pipeline minutes."
```

#### Root Cause Analysis
Render Starter 플랜의 월별 빌드 시간 한도 초과.

**배포 타임라인 분석**:
```
15:39:38  dep-d5nq3ea9mqds73bcgngg (48ca645) 빌드 시작
16:12:43  dep-d5nqiugqo81c73e0eo5g (866b23c) 빌드 시작 ← 새 커밋
16:19:45  48ca645 빌드 완료 → live 전환 ✅
16:19:47  866b23c 빌드 차단 (pipeline minutes 소진) ❌
```

#### Resolution Options
| Option | Description | Cost |
|--------|-------------|------|
| 기다리기 | 다음 달 1일 리셋 | Free |
| Spend Limit 증가 | Billing 설정 변경 | Variable |
| 플랜 업그레이드 | Individual/Team | $19+/month |

#### Current Status
- 서비스 정상 동작 중 (48ca645 커밋)
- 새 최적화(866b23c)는 다음 달 자동 적용 예정

---

### Issue #4: Error Logging Insufficient

#### Symptom
초기 DB 연결 실패 시 로그가 불명확:
```python
# Before
logger.error("Failed to connect to database (check DATABASE_URL configuration)")
```

#### Resolution
상세 예외 정보 로깅 추가:
```python
# After
except Exception as e:
    logger.error(f"Failed to connect to database: {type(e).__name__}: {e}")
    raise RuntimeError("Database connection failed") from e
```

이제 실제 에러 원인 파악 가능:
```
ERROR:database:Failed to connect to database: InvalidPasswordError: password authentication failed
```

---

## Code Review Summary

### Execution
```bash
codex exec -m gpt-5.2-codex -C "$(pwd)" "Conduct comprehensive code review..."
```

### Overall Scores
| Area | Score | Status |
|------|-------|--------|
| Code Quality | 7/10 | 🟡 |
| Architecture | 7/10 | 🟡 |
| Security | 6/10 | 🟡 |
| Performance | 6/10 | 🟡 |
| Maintainability | 6/10 | 🟡 |

### Critical Findings

#### 🔴 High Priority
1. **CORS Security** (`main.py:116`)
   - Issue: `*.vercel.app` 와일드카드 + credentials 허용
   - Risk: Cross-origin 공격 가능성
   - Fix: 명시적 origin 목록 사용

2. **Chat Access Control** (`chat.py:81`)
   - Issue: DB 연결 실패 시 인증 우회 가능
   - Risk: 무단 채팅 접근
   - Fix: DB 불가 시 채팅 비활성화

#### 🟡 Medium Priority
3. **SQL Injection Risk** (`graph_store.py:1381`)
   - `search_chunks` 함수에서 사용자 입력 검증 부족

4. **Batch Processing** (`graph_store.py:1311`)
   - 청크 임베딩 업데이트가 개별 쿼리로 실행됨
   - 대량 처리 시 성능 저하

5. **Import Path Validation** (`import_.py:139`)
   - `ALLOWED_IMPORT_ROOTS` 비어있을 때 모든 경로 허용

6. **Transaction Missing** (`chat.py:160`)
   - 채팅 메시지 삽입이 트랜잭션 없이 실행

---

## Changes Made

### Files Modified
| File | Changes |
|------|---------|
| `Dockerfile` | requirements 분리, ENABLE_SPECTER2 빌드 인자 추가 |
| `backend/database.py` | 상세 예외 로깅 추가 |

### Files Created
| File | Purpose |
|------|---------|
| `backend/requirements-base.txt` | 경량 의존성 (SPECTER2 제외) |
| `backend/requirements-specter.txt` | 선택적 SPECTER2 지원 |

### Git Commit
```
866b23c fix(docker): optimize build with split requirements and improved error logging

- Split requirements.txt into requirements-base.txt (lightweight) and
  requirements-specter.txt (optional SPECTER2 with PyTorch)
- Dockerfile now uses requirements-base.txt by default (~200MB smaller)
- Add ENABLE_SPECTER2 build arg for optional SPECTER2 support
- Improve database.py error logging to show actual exception details
```

---

## Action Items Generated

### Immediate (Blocked by Pipeline Minutes)
- [ ] **SEC-007**: CORS 보안 강화 - 명시적 origin 목록 사용 (`main.py:116`)
- [ ] **SEC-008**: DB 불가 시 chat 액세스 비활성화 (`chat.py:81`)

### Short-term
- [ ] **SEC-009**: SQL injection 방어 추가 (`graph_store.py:1381`)
- [ ] **PERF-004**: 청크 임베딩 배치 업데이트 구현 (`graph_store.py:1311`)
- [ ] **SEC-010**: Import path validation 강화 (`import_.py:139`)
- [ ] **BUG-012**: 채팅 메시지 트랜잭션 적용 (`chat.py:160`)

### Pending
- [ ] **INFRA-003**: Render Docker 캐시 활성화 (Dashboard에서 수동 변경)
- [ ] **INFRA-004**: 기존 Python 서비스 삭제 (`srv-d5n4aesoud1c739ot8a0`)

---

## Environment Configuration

### Render Docker Service
| Setting | Value |
|---------|-------|
| Service ID | `srv-d5nen956ubrc73aqko8g` |
| Name | `scholarag-graph-docker` |
| Region | Oregon |
| Plan | Starter |
| Docker Cache | `no-cache` (비활성화) |
| Health Check | `/health` |
| Port | 10000 |

### Environment Variables
```env
DATABASE_URL=postgresql://postgres.xxx:ScholaRAG2026@aws-0-us-west-1.pooler.supabase.com:6543/postgres
SUPABASE_URL=https://rbmfkjkwwjrmjghmqlna.supabase.co
SUPABASE_ANON_KEY=eyJ...
ANTHROPIC_API_KEY=sk-ant-...
DEFAULT_LLM_PROVIDER=anthropic
DEFAULT_LLM_MODEL=claude-3-5-haiku-20241022
ENVIRONMENT=production
LOG_LEVEL=INFO
```

---

## Session Statistics
| Metric | Value |
|--------|-------|
| Issues Resolved | 3 (DB 연결, 에러 로깅, Any import) |
| Issues Identified | 6 (코드 리뷰) |
| Files Modified | 3 |
| Files Created | 2 |
| Commits | 4 |
| Deployment Status | ✅ Live |

---

## Additional Issues (2026-01-20 Afternoon Session)

### Issue #5: semantic_chunker `Any` 타입 임포트 누락

#### Symptom
```
POST /api/import/zotero/validate → 500 Internal Server Error
CORS error (secondary effect of 500)
```

#### Error Log (Render)
```
NameError: name 'Any' is not defined
  File "/app/importers/semantic_chunker.py", line 461, in SemanticChunker
    ) -> Dict[str, Any]:
```

#### Root Cause Analysis
`semantic_chunker.py`에서 `Dict[str, Any]` 타입 힌트 사용하지만 `Any`가 임포트되지 않음:
```python
# Line 15 (before)
from typing import List, Optional, Dict, Tuple
# Missing: Any
```

#### Resolution
```python
# Line 15 (after)
from typing import List, Optional, Dict, Tuple, Any
```

#### Commit
- **Hash**: `d2dd6d6`
- **Message**: `fix(import): add missing 'Any' type import in semantic_chunker`

#### Lesson Learned
> 타입 힌트 추가 시 해당 타입이 `typing` 모듈에서 임포트되었는지 확인 필요.
> CI/CD에 타입 체크(`mypy` 또는 `pyright`) 추가 권장.

---

### Issue #6: Frontend API URL 구 서비스 참조

#### Symptom
```
CORS error: scholarag-graph-api.onrender.com (deleted service)
```

#### Root Cause
1. `frontend/lib/api.ts`의 fallback URL이 삭제된 Python 서비스 참조
2. Vercel 환경변수 `NEXT_PUBLIC_API_URL` 미설정

#### Resolution
1. `api.ts` fallback URL 변경: `scholarag-graph-docker.onrender.com`
2. Vercel Dashboard에서 `NEXT_PUBLIC_API_URL` 환경변수 설정

#### Commits
- `1709972`: `fix(frontend): update API URL to Docker service`
- `1ca4f4b`: `fix(cors): add production frontend URL to default CORS origins`

---

### Issue #7: Vercel Preview URL CORS 에러

#### Symptom
```
CORS error: schola-rag-graph-hjzeqohk-hosung-yous-projects.vercel.app
No 'Access-Control-Allow-Origin' header present
```

#### Root Cause Analysis
1. Vercel Preview 배포는 동적 URL 생성 (`{project}-{hash}-{team}.vercel.app`)
2. 정적 CORS origin 목록에 포함될 수 없음
3. 기존 `allow_origin_regex`가 보안상 제거되어 있었음

#### Resolution
`main.py`에 프로젝트/팀 스코프 regex 패턴 추가:
```python
_vercel_preview_regex = r"^https://schola-rag-graph-[a-z0-9]+-hosung-yous-projects\.vercel\.app$"

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=_vercel_preview_regex,
    ...
)
```

#### Commit
- **Hash**: `ac11672`
- **Message**: `fix(cors): add regex pattern for Vercel Preview URLs`

#### Security Considerations
- 광범위한 `*.vercel.app` 대신 **프로젝트/팀 스코프 패턴** 사용
- `schola-rag-graph-*-hosung-yous-projects.vercel.app`만 허용
- 무작위 Vercel 앱은 차단됨

---

### Issue #8: Rate Limiter 429 응답에 CORS 헤더 누락

#### Symptom
```
429 Too Many Requests
CORS error: No 'Access-Control-Allow-Origin' header present
```

Import 진행 중 status 폴링이 rate limit(5/min)에 걸리면:
1. Rate limiter가 429 응답 직접 반환
2. CORS middleware가 우회됨
3. 브라우저에서 CORS 에러로 표시됨

#### Root Cause Analysis
`rate_limiter.py`에서 `JSONResponse`를 직접 반환하면 CORS middleware를 거치지 않음:
```python
# Line 330-342 (before)
return JSONResponse(
    status_code=429,
    content={...},
    headers={...},  # CORS 헤더 없음!
)
```

#### Resolution
1. **Rate limiter 429 응답에 CORS 헤더 추가**
2. **`/api/import/status/*` 폴링 엔드포인트 rate limit 완화** (60/min)

---

## Recommendations

### Immediate
1. 다음 달 Pipeline Minutes 리셋 후 자동 배포 확인
2. 보안 이슈(CORS, Chat Access) 우선 수정

### Long-term
1. Render 플랜 업그레이드 검토 (빌드 시간 제한 해소)
2. Docker 캐시 활성화로 빌드 시간 추가 단축
3. CI/CD 파이프라인에 보안 스캔 추가

---

## References
- [Render Docker Deployment](https://render.com/docs/docker)
- [Supabase Connection Pooling](https://supabase.com/docs/guides/database/connecting-to-postgres#connection-pooler)
- [asyncpg pgbouncer compatibility](https://magicstack.github.io/asyncpg/current/usage.html#connection-pools)
- Previous Session: `2026-01-19_render-starter-optimization.md`
