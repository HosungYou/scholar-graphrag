# ScholaRAG_Graph Documentation

> **Last Updated**: 2026-01-25
> **Version**: 0.4.0

## Quick Navigation

### Getting Started
- [Installation](getting-started/installation.md) - System setup and deployment
- [Quickstart](getting-started/quickstart.md) - Create your first knowledge graph

### Architecture
- [Overview](architecture/overview.md) - System architecture and design principles
- [Multi-Agent System](architecture/multi-agent-system.md) - 6-agent RAG pipeline
- [Graph Visualization](architecture/graph-visualization.md) - Force-directed graph rendering

### Features
- [View Modes (3D/Topic/Gaps)](features/view-modes.md) - Interactive visualization modes
- [InfraNodus Integration](features/infranodus-visualization.md) - Gap detection and topic clustering
- [Zotero Integration](features/zotero-integration/overview.md) - Hybrid import system

### User Guide
- [Concepts](user-guide/concepts.md) - Core concepts and terminology
- [Projects](user-guide/projects.md) - Project management
- [Graph Navigation](user-guide/graph-navigation.md) - Exploring the knowledge graph
- [Chat Interface](user-guide/chat-interface.md) - Conversational literature review

### API Reference
- [API Overview](api/overview.md) - REST API documentation
- [InfraNodus API](api/infranodus-api.md) - Graph analysis endpoints

### Development
- [Agent Architecture](development/agent-architecture.md) - Agent pipeline design
- [Testing](testing/testing-strategy.md) - Testing approach
- [Operations](operations/deployment.md) - Deployment and operations

### Project Management
- [Roadmap](project-management/roadmap.md) - Feature roadmap
- [Action Items](project-management/action-items.md) - Current tasks and bugs

---

## Configuration

### LLM Provider
- **Default**: Groq (llama-3.3-70b-versatile)
- **Supported**: Anthropic (Claude), OpenAI (GPT-4), Google (Gemini)

### Embedding Provider
- **Default**: OpenAI (text-embedding-3-small)

### Database
- **Type**: PostgreSQL + pgvector (Supabase)
- **Tables**: `projects`, `paper_metadata`, `entities`, `relationships`, `teams`

---

## Deployment

| Service | Platform | URL |
|---------|----------|-----|
| Frontend | Vercel | https://schola-rag-graph.vercel.app |
| Backend | Render (Docker) | https://scholarag-graph-docker.onrender.com |
| Database | Supabase | PostgreSQL + pgvector |

---

## Quick Links

| Resource | Location |
|----------|----------|
| Session Logs | `.meta/sessions/` |
| Architectural Decisions | `.meta/decisions/` |
| Agent Registry | `.meta/agent-registry.json` |
| Action Items | `project-management/action-items.md` |

---

## Technology Stack

### Backend
- **Language**: Python 3.11+
- **Framework**: FastAPI
- **Database**: PostgreSQL + pgvector (Supabase)
- **LLM**: Multi-provider (Groq, Anthropic, OpenAI, Google)
- **Background Jobs**: Python asyncio

### Frontend
- **Framework**: Next.js 14 (App Router)
- **UI Library**: React + Shadcn/UI
- **Graph Rendering**: React Flow + Three.js
- **State Management**: React Context API
- **Authentication**: Supabase Auth

---

## Core Concepts

### Concept-Centric Design
Papers and authors are **metadata only**. The knowledge graph visualizes:
- **Concepts**: Key ideas and themes
- **Methods**: Research methodologies
- **Findings**: Research outcomes

### Multi-Agent RAG Pipeline
6 specialized agents process queries:
1. **Query Analyzer**: Parses user intent
2. **Knowledge Retriever**: Retrieves relevant papers/concepts
3. **Contextualizer**: Builds conversation context
4. **Reasoner**: Generates evidence-based responses
5. **Synthesizer**: Formats final answer
6. **Quality Checker**: Validates response accuracy

### InfraNodus Integration
Three visualization modes inspired by InfraNodus:
- **3D View**: Full knowledge graph with physics simulation
- **Topic View**: Community detection and topic clustering
- **Gaps View**: Research gap identification with AI hypotheses

---

## Environment Variables

### Backend (Required)
```env
DATABASE_URL=postgresql://...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
GROQ_API_KEY=gsk_...
OPENAI_API_KEY=sk-...  # For embeddings
CORS_ORIGINS=https://schola-rag-graph.vercel.app,http://localhost:3000
```

### Frontend (Required)
```env
NEXT_PUBLIC_API_URL=https://scholarag-graph-docker.onrender.com
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

---

## Development Commands

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Testing
```bash
# Backend tests
cd backend && pytest tests/ -v

# Frontend tests
cd frontend && npm test
```

---

## Support

- **Issues**: [GitHub Issues](https://github.com/HosungYou/ScholaRAG_Graph/issues)
- **Discussions**: [GitHub Discussions](https://github.com/HosungYou/ScholaRAG_Graph/discussions)
- **Contributing**: See [CONTRIBUTING.md](https://github.com/HosungYou/ScholaRAG_Graph/blob/main/CONTRIBUTING.md)

---

*Built for the research community by [Hosung You](https://github.com/HosungYou)*
