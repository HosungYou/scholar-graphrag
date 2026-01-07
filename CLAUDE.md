# CLAUDE.md - ScholaRAG_Graph Project Instructions

## Project Overview

ScholaRAG_Graph는 AGENTiGraph 스타일의 커스텀 GraphRAG 플랫폼입니다. ScholaRAG에서 생성된 문헌 리뷰 데이터를 Knowledge Graph로 시각화하고, LLM과 대화하며 탐색할 수 있습니다.

## Architecture

### Backend (FastAPI + Python)
- **agents/**: AGENTiGraph 스타일 6-Agent 파이프라인
  - `intent_agent.py`: 사용자 의도 분류 (search, explore, explain, compare, create)
  - `concept_extraction_agent.py`: NER/RE로 엔티티 추출
  - `task_planning_agent.py`: 복잡한 쿼리를 서브태스크로 분해
  - `query_execution_agent.py`: SQL + Vector 검색 실행
  - `reasoning_agent.py`: Chain-of-Thought 추론
  - `response_agent.py`: 응답 생성 + 그래프 하이라이트

- **graph/**: 그래프 핵심 모듈
  - `entity_extractor.py`: LLM 기반 엔티티 추출
  - `relationship_builder.py`: 관계 추론
  - `graph_store.py`: PostgreSQL 그래프 저장
  - `vector_store.py`: pgvector 벡터 저장

- **importers/**: 데이터 Import
  - `scholarag_importer.py`: ScholaRAG 폴더 Import (핵심 기능)
  - `pdf_importer.py`: 개별 PDF Import
  - `csv_importer.py`: CSV 데이터 Import

- **llm/**: Multi-Provider LLM
  - `base.py`: 추상 LLM 인터페이스
  - `claude_provider.py`: Anthropic Claude
  - `openai_provider.py`: OpenAI GPT-4
  - `gemini_provider.py`: Google Gemini

### Frontend (Next.js 14 + React Flow)
- **app/**: Next.js App Router
  - `projects/[id]/chat/`: Chatbot Mode
  - `projects/[id]/explore/`: Exploration Mode (React Flow)
  - `import/`: ScholaRAG 폴더 Import UI

- **components/graph/**: 그래프 시각화
  - `KnowledgeGraph.tsx`: React Flow 메인 컴포넌트
  - `CustomNode.tsx`: 커스텀 노드 (Paper, Concept, Author, Method, Finding)
  - `NodeDetails.tsx`: 노드 상세 정보 패널

- **components/chat/**: 채팅 UI
  - `ChatInterface.tsx`: 채팅 인터페이스
  - `CitationCard.tsx`: 인용 카드 (클릭 시 그래프 노드로 이동)

### Database (PostgreSQL + pgvector)
- **entities**: 모든 노드 타입 통합 (Paper, Author, Concept, Method, Finding)
- **relationships**: 엣지/관계 저장
- **projects**: 프로젝트 메타데이터

## Development Commands

### Backend
```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload --port 8000

# Run tests
pytest tests/

# Type checking
mypy .
```

### Frontend
```bash
cd frontend
npm run dev          # Development server
npm run build        # Production build
npm run lint         # Linting
npm run type-check   # TypeScript check
```

### Database
```bash
# Run migrations
psql scholarag_graph < database/migrations/001_init.sql

# Reset database
dropdb scholarag_graph && createdb scholarag_graph
```

## Key Patterns

### 1. ScholaRAG Folder Import
ScholaRAG 프로젝트 폴더를 Import할 때:
1. `config.yaml` 파싱 → Project 생성
2. `data/02_screening/relevant_papers.csv` → Paper + Author 엔티티
3. `data/04_rag/chroma_db/` → 기존 임베딩 재사용 (가능한 경우)
4. LLM으로 Concept, Method, Finding 추출
5. 관계 자동 생성 (AUTHORED_BY, DISCUSSES_CONCEPT 등)

### 2. Dual-Mode Interface
- **Chatbot Mode**: 질문 → 6-Agent 파이프라인 → 응답 + `highlighted_nodes` 반환
- **Exploration Mode**: 노드 클릭 → 상세 정보 + AI 설명 생성

### 3. Graph-Grounded Conversation
LLM 응답에는 항상 `highlighted_nodes`와 `highlighted_edges`가 포함됨:
```json
{
  "answer": "...",
  "citations": ["paper_1", "paper_2"],
  "highlighted_nodes": ["uuid-1", "uuid-2"],
  "highlighted_edges": ["edge-uuid-1"]
}
```

## Entity Types

| Type | Description | Properties |
|------|-------------|------------|
| Paper | 학술 논문 | title, abstract, year, doi, authors, citation_count |
| Author | 저자 | name, affiliation, orcid |
| Concept | 개념/키워드 | name, description, domain |
| Method | 연구 방법론 | name, type (quantitative/qualitative/mixed) |
| Finding | 연구 결과 | statement, effect_size, significance |

## Relationship Types

| Type | Source → Target | Description |
|------|-----------------|-------------|
| AUTHORED_BY | Paper → Author | 저자 관계 |
| CITES | Paper → Paper | 인용 관계 |
| DISCUSSES_CONCEPT | Paper → Concept | 개념 논의 |
| USES_METHOD | Paper → Method | 방법론 사용 |
| SUPPORTS | Paper → Finding | 결과 지지 |
| CONTRADICTS | Paper → Finding | 결과 반박 |
| RELATED_TO | Concept → Concept | 개념 간 관련성 |

## Environment Variables

```env
# Required
DATABASE_URL=postgresql://...
ANTHROPIC_API_KEY=sk-ant-...

# Optional
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...
DEFAULT_LLM_PROVIDER=anthropic
DEFAULT_LLM_MODEL=claude-3-5-haiku-20241022
```

## Deployment

- **Frontend**: Vercel (자동 배포 from `main` branch)
- **Backend**: Render (자동 배포 from `main` branch)
- **Database**: Render PostgreSQL (pgvector 확장 포함)

## Related Files

- ScholaRAG 원본: `/Volumes/External SSD/Projects/Research/GenAI_Effectiveness/ScholaRAG/`
- 계획 문서: `/Users/hosung/.claude/plans/squishy-knitting-tide.md`
