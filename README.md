# ScholaRAG_Graph

AGENTiGraph 스타일의 커스텀 GraphRAG 플랫폼 - ScholaRAG 데이터를 Knowledge Graph로 시각화하고 LLM과 대화하며 탐색

## Features

- **Dual-Mode Interface**: Chatbot Mode + Exploration Mode
- **ScholaRAG Integration**: 기존 ScholaRAG 프로젝트 폴더 직접 Import
- **Multi-Agent System**: 6개 에이전트 파이프라인 (Intent → Concept → Task → Query → Reasoning → Response)
- **Interactive Graph**: React Flow 기반 인터랙티브 Knowledge Graph
- **Multi-Provider LLM**: Claude, GPT-4, Gemini 선택 가능

## Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | Next.js 14, React 18, React Flow, Tailwind CSS |
| Backend | FastAPI, Python 3.11+ |
| Database | PostgreSQL + pgvector |
| LLM | Anthropic Claude, OpenAI GPT-4, Google Gemini |
| Deployment | Vercel (Frontend), Render (Backend) |

## Quick Start

### Prerequisites

- Node.js 18+
- Python 3.11+
- PostgreSQL 15+ with pgvector extension

### Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Set environment variables
cp ../.env.example ../.env
# Edit .env with your API keys

# Run server
uvicorn main:app --reload --port 8000
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

### Database Setup

```bash
# Create PostgreSQL database
createdb scholarag_graph

# Run migrations
psql scholarag_graph < database/migrations/001_init.sql
psql scholarag_graph < database/migrations/002_pgvector.sql
psql scholarag_graph < database/migrations/003_graph_tables.sql
```

## Project Structure

```
ScholaRAG_Graph/
├── backend/                 # FastAPI Backend
│   ├── agents/             # Multi-Agent System
│   ├── graph/              # Graph Storage & Processing
│   ├── importers/          # Data Import (ScholaRAG, PDF, CSV)
│   ├── llm/                # Multi-Provider LLM
│   ├── routers/            # API Routes
│   └── models/             # Pydantic Models
├── frontend/               # Next.js Frontend
│   ├── app/                # App Router Pages
│   └── components/         # React Components
├── database/               # PostgreSQL Schema
│   └── migrations/         # SQL Migrations
└── scripts/                # Utility Scripts
```

## API Endpoints

### Projects
- `GET /api/projects` - List all projects
- `POST /api/projects` - Create project
- `GET /api/projects/{id}` - Get project details

### Graph
- `GET /api/graph/nodes` - Get all nodes
- `GET /api/graph/edges` - Get all edges
- `GET /api/graph/subgraph/{node_id}` - Get subgraph around node
- `POST /api/graph/search` - Search nodes by query

### Chat
- `POST /api/chat/query` - Send query to multi-agent system
- `GET /api/chat/history/{project_id}` - Get chat history

### Import
- `POST /api/import/scholarag` - Import ScholaRAG folder
- `POST /api/import/pdf` - Import individual PDF
- `GET /api/import/status/{job_id}` - Check import progress

## Environment Variables

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/scholarag_graph

# LLM Providers
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...

# Default LLM
DEFAULT_LLM_PROVIDER=anthropic
DEFAULT_LLM_MODEL=claude-3-5-haiku-20241022
```

## License

MIT License - See [LICENSE](LICENSE) for details.

## Related Projects

- [ScholaRAG](https://github.com/HosungYou/ScholaRAG) - Systematic Literature Review Automation
- [AGENTiGraph](https://arxiv.org/abs/2410.11531) - Interactive Knowledge Graph Platform (Inspiration)
