# CLAUDE.md - ScholaRAG_Graph Project Instructions

> **Last Updated**: 2025-01-15
> **Version**: 2.0.0

## Project Overview

ScholaRAG_Graph는 AGENTiGraph 스타일의 **Concept-Centric Knowledge Graph** 플랫폼입니다. ScholaRAG에서 생성된 체계적 문헌 리뷰 데이터를 Knowledge Graph로 시각화하고, Multi-Agent 시스템을 통해 대화형 탐색이 가능합니다.

### Key Features
- **Concept-Centric Graph**: Papers/Authors는 메타데이터, Concepts/Methods/Findings만 시각화
- **Multi-Agent RAG**: 6-Agent 파이프라인으로 질문 처리
- **Zotero Integration**: Hybrid Import (Local API + Web API)
- **Team Collaboration**: 프로젝트 공유 및 협업
- **PRISMA 2020**: 체계적 문헌 리뷰 다이어그램 자동 생성

---

## Architecture

### Backend (FastAPI + Python 3.11+)

```
backend/
├── agents/              # 6-Agent 파이프라인
│   ├── orchestrator.py          # 에이전트 오케스트레이션
│   ├── intent_agent.py          # 의도 분류
│   ├── concept_extraction_agent.py  # 개념 추출
│   ├── task_planning_agent.py   # 태스크 분해
│   ├── query_execution_agent.py # 쿼리 실행
│   ├── reasoning_agent.py       # CoT 추론
│   └── response_agent.py        # 응답 생성
│
├── graph/               # Knowledge Graph 처리
│   ├── entity_extractor.py      # LLM 기반 엔티티 추출
│   ├── relationship_builder.py  # 관계 구축
│   ├── gap_detector.py          # 연구 갭 탐지
│   ├── graph_store.py           # PostgreSQL 저장
│   └── prisma_generator.py      # PRISMA 다이어그램
│
├── importers/           # 데이터 Import
│   ├── scholarag_importer.py    # ScholaRAG 폴더 Import
│   ├── pdf_importer.py          # PDF 직접 Import
│   └── [TODO] hybrid_zotero_importer.py  # Zotero Hybrid Import
│
├── integrations/        # 외부 API 통합
│   ├── zotero.py               # Zotero Web API (876줄)
│   ├── semantic_scholar.py     # Semantic Scholar API
│   └── openalex.py             # OpenAlex API
│
├── auth/                # Supabase 인증
├── jobs/                # 백그라운드 작업
├── llm/                 # Multi-Provider LLM
└── routers/             # API 엔드포인트
```

### Frontend (Next.js 14 + React Flow)

```
frontend/
├── app/
│   ├── projects/[id]/   # 프로젝트 페이지
│   ├── import/          # Import UI
│   └── auth/            # 로그인/회원가입
│
├── components/
│   ├── graph/           # 그래프 시각화
│   ├── chat/            # 채팅 인터페이스
│   ├── auth/            # 인증 컴포넌트
│   └── teams/           # 팀 협업 UI
│
└── lib/
    ├── api.ts           # API 클라이언트
    └── auth-context.tsx # 인증 상태 관리
```

### Database (PostgreSQL + pgvector + Supabase)

**Key Tables:**
- `projects` - 프로젝트 메타데이터
- `paper_metadata` - 논문 정보 (시각화 안함)
- `entities` - Concept/Method/Finding 노드
- `relationships` - 노드 간 관계
- `zotero_sync_state` - Zotero 동기화 상태
- `teams`, `team_members` - 팀 협업

---

## Documentation Structure

```
DOCS/
├── .meta/                      # 🤖 에이전트 추적 시스템
│   ├── sessions/               # 세션 로그
│   ├── decisions/              # ADR (Architecture Decision Records)
│   ├── templates/              # 템플릿
│   └── agent-registry.json     # 통계
│
├── features/
│   └── zotero-integration/     # Zotero 통합 문서 (8개)
│
├── architecture/               # 시스템 설계
├── development/                # 개발자 스펙
├── project-management/         # 로드맵, 진행 상황
└── SUB_AGENTS_PLAN.md          # 개발 자동화 에이전트 계획
```

### Agent Tracking System

에이전트 세션 추적을 위해 `DOCS/.meta/` 사용:
- **Session Log**: `sessions/YYYY-MM-DD_feature-name.md`
- **ADR**: `decisions/NNN-decision-title.md`
- **Registry**: `agent-registry.json`

---

## Development Commands

### Backend
```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt

# Development
uvicorn main:app --reload --port 8000

# Testing
pytest tests/ -v
pytest tests/test_integrations.py -v  # Zotero 테스트
```

### Frontend
```bash
cd frontend
npm install

# Development
npm run dev

# Production
npm run build && npm run start
```

### Database Migrations
```bash
# Supabase SQL Editor에서 실행
# 순서대로: 001 → 002 → 003 → 004 → 005 → 006
database/migrations/001_init.sql
database/migrations/002_pgvector.sql
database/migrations/003_graph_tables.sql
database/migrations/004_concept_centric.sql
database/migrations/005_zotero_hybrid_import.sql
database/migrations/006_teams.sql
```

---

## Key Architectural Decisions

### ADR-001: Concept-Centric Graph
- **Decision**: Papers/Authors는 메타데이터로만 저장, 시각화하지 않음
- **Reasoning**: Hub-and-spoke 그래프 방지, 개념 관계에 집중
- **Location**: `DOCS/.meta/decisions/001-concept-centric-graph.md`

### ADR-002: Zotero Hybrid Import
- **Decision**: Local API (port 23119) 우선, Web API 폴백
- **Modes**: `zotero_only` ($0), `selective` (~$0.01), `full` (~$0.02)
- **Coverage**: 49% → 88%+ (Hybrid)
- **Location**: `DOCS/.meta/decisions/002-zotero-hybrid-import.md`

---

## Entity & Relationship Types

### Entity Types
| Type | Visualized | Description |
|------|------------|-------------|
| Paper | ❌ Metadata | 학술 논문 |
| Author | ❌ Metadata | 저자 |
| **Concept** | ✅ Node | 핵심 개념/키워드 |
| **Method** | ✅ Node | 연구 방법론 |
| **Finding** | ✅ Node | 연구 결과 |

### Relationship Types
| Type | Source → Target |
|------|-----------------|
| DISCUSSES_CONCEPT | Paper → Concept |
| USES_METHOD | Paper → Method |
| SUPPORTS | Paper → Finding |
| CONTRADICTS | Paper → Finding |
| RELATED_TO | Concept ↔ Concept |

---

## Environment Variables

```env
# Required
DATABASE_URL=postgresql://...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
ANTHROPIC_API_KEY=sk-ant-...

# Optional
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...
ZOTERO_API_KEY=...          # Zotero Web API
ZOTERO_USER_ID=...          # Zotero User/Group ID

# Defaults
DEFAULT_LLM_PROVIDER=anthropic
DEFAULT_LLM_MODEL=claude-3-5-haiku-20241022
```

---

## Deployment

| Service | Platform | Branch |
|---------|----------|--------|
| Frontend | Vercel | `main` |
| Backend | Render | `main` |
| Database | Supabase | - |

---

## Current Implementation Status

| Feature | Status | Location |
|---------|--------|----------|
| 6-Agent Pipeline | ✅ 완료 | `backend/agents/` |
| Graph Visualization | ✅ 완료 | `frontend/components/graph/` |
| ScholaRAG Import | ✅ 완료 | `backend/importers/scholarag_importer.py` |
| PDF Import | ✅ 완료 | `backend/importers/pdf_importer.py` |
| Zotero Web API | ✅ 완료 | `backend/integrations/zotero.py` |
| **Zotero Hybrid Import** | 📋 계획됨 | `DOCS/features/zotero-integration/` |
| Auth (Supabase) | ✅ 완료 | `backend/auth/`, `frontend/app/auth/` |
| Team Collaboration | ✅ 완료 | `backend/routers/teams.py` |
| Gap Detection | ✅ 완료 | `backend/graph/gap_detector.py` |
| PRISMA Generator | ✅ 완료 | `backend/graph/prisma_generator.py` |

---

## Related Documentation

- **SUB_AGENTS_PLAN**: `DOCS/SUB_AGENTS_PLAN.md` - 개발 자동화 에이전트 시스템
- **Zotero Integration**: `DOCS/features/zotero-integration/` - 8개 문서
- **Agent Sessions**: `DOCS/.meta/sessions/` - 에이전트 세션 기록
- **ADRs**: `DOCS/.meta/decisions/` - 아키텍처 결정 기록

---

## Quick Reference

### API Endpoints (주요)
```
POST /api/import/scholarag     # ScholaRAG 폴더 Import
POST /api/import/pdf           # PDF Import
GET  /api/projects             # 프로젝트 목록
POST /api/chat                 # 채팅 (6-Agent)
GET  /api/graph/{project_id}   # 그래프 데이터
GET  /api/integrations/zotero/collections  # Zotero 컬렉션
```

### Graph Query Example
```python
# 특정 개념과 관련된 논문 찾기
SELECT p.* FROM paper_metadata p
JOIN relationships r ON r.source_id = (
  SELECT id FROM entities WHERE name = 'Machine Learning'
)
WHERE r.relationship_type = 'DISCUSSES_CONCEPT';
```
