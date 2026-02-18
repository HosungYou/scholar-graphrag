# CLAUDE.md - ScholaRAG_Graph Project Instructions

> **Last Updated**: 2026-02-18
> **Version**: 6.7.0 (v0.32.0 Production Hardening + International UI)

## Project Overview

ScholaRAG_Graph is an AGENTiGraph-style **Concept-Centric Knowledge Graph** platform. It visualizes systematic literature review data as a Knowledge Graph with Multi-Agent conversational exploration.

### Key Features
- **Concept-Centric Graph**: Papers/Authors as metadata only; Concepts/Methods/Findings visualized
- **Multi-Agent RAG**: 6-Agent pipeline for query processing
- **Zotero Integration**: Hybrid Import (Local API + Web API)
- **Team Collaboration**: Project sharing and collaboration
- **PRISMA 2020**: Automatic systematic review diagram generation

---

## Architecture

### Backend (FastAPI + Python 3.11+)
```
backend/
├── agents/           # 6-Agent pipeline
├── graph/            # Knowledge Graph processing
├── importers/        # Data importers
├── integrations/     # External APIs (Zotero, Semantic Scholar, OpenAlex)
├── auth/             # Supabase authentication
├── jobs/             # Background tasks
├── llm/              # Multi-Provider LLM
└── routers/          # API endpoints
```

### Frontend (Next.js 14 + React Flow)
```
frontend/
├── app/              # Pages (projects, import, auth)
├── components/       # UI components (graph, chat, auth, teams)
└── lib/              # API client, auth context
```

### Database (PostgreSQL + pgvector + Supabase)
Key Tables: `projects`, `paper_metadata`, `entities`, `relationships`, `zotero_sync_state`, `teams`

---

## Documentation Structure

```
DOCS/
├── .meta/                    # Agent tracking system
│   ├── sessions/             # Session logs
│   ├── decisions/            # ADRs
│   ├── templates/            # Templates
│   └── agent-registry.json   # Statistics
├── features/                 # Feature docs
├── architecture/             # System design
├── development/              # Developer specs
└── project-management/       # Roadmap, action items
```

---

## Development Commands

### Backend
```bash
cd backend && python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
pytest tests/ -v
```

### Frontend
```bash
cd frontend && npm install
npm run dev
```

### Database Migrations
Run in order: `001_init.sql` → `002_pgvector.sql` → `003_graph_tables.sql` → `004_concept_centric.sql` → `005_zotero_hybrid_import.sql` → `006_teams.sql` → ... → `021_cross_paper_links.sql` → `022_entity_deduplication.sql` → `023_lexical_graph_schema.sql` → `024_community_trace.sql` → `025_p0_comprehensive_fix.sql`

---

## Key Architectural Decisions

| ADR | Decision | Location |
|-----|----------|----------|
| ADR-001 | Papers/Authors as metadata only, not visualized | `DOCS/.meta/decisions/001-concept-centric-graph.md` |
| ADR-002 | Local API first, Web API fallback for Zotero | `DOCS/.meta/decisions/002-zotero-hybrid-import.md` |

---

## Entity & Relationship Types

| Entity | Visualized | Description |
|--------|------------|-------------|
| Paper | ❌ Metadata | Academic paper |
| Author | ❌ Metadata | Author |
| **Concept** | ✅ Node | Key concept/keyword |
| **Method** | ✅ Node | Research methodology |
| **Finding** | ✅ Node | Research finding |

| Relationship | Source → Target |
|--------------|-----------------|
| DISCUSSES_CONCEPT | Paper → Concept |
| USES_METHOD | Paper → Method |
| SUPPORTS/CONTRADICTS | Paper → Finding |
| RELATED_TO | Concept ↔ Concept |

---

## Environment Variables

### Backend (Render Docker: scholarag-graph-docker)

```env
# Required
DATABASE_URL=postgresql://...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...

# LLM Provider (Groq - Default Configuration)
GROQ_API_KEY=gsk_...
DEFAULT_LLM_PROVIDER=groq
DEFAULT_LLM_MODEL=llama-3.3-70b-versatile

# Embedding Provider (OpenAI)
OPENAI_API_KEY=sk-...  # Used for embeddings only

# Optional LLM Providers
ANTHROPIC_API_KEY=sk-ant-...  # Optional: Claude models

# CORS (CRITICAL - must include actual frontend URL)
CORS_ORIGINS=https://schola-rag-graph.vercel.app,https://scholarag-graph.vercel.app,http://localhost:3000

# Environment
ENVIRONMENT=production
```

### Frontend (Vercel: schola-rag-graph)

```env
NEXT_PUBLIC_API_URL=https://scholarag-graph-docker.onrender.com
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

### Supabase Connection (CRITICAL)

> **INFRA-015 (2026-02-16)**: Supabase 프로젝트 ref 불일치 발견. 반드시 올바른 ref 사용할 것.

| Field | Value |
|-------|-------|
| Project Ref | `arxntrtipkakbvhcpfqj` |
| Region | `aws-0-us-west-2` |
| Session Pooler Host | `aws-0-us-west-2.pooler.supabase.com` |
| Session Pooler Port | `5432` |
| Transaction Pooler Port | `6543` (사용 금지 — prepared statements 미지원) |
| Direct Connection | IPv6 only (IPv4 네트워크에서 접속 불가) |
| DB User | `postgres.arxntrtipkakbvhcpfqj` |

**Dead/Invalid Refs (절대 사용 금지):**
- `uxcpissmcrzflfdpxgxs` (aws-1-us-east-2) — "Tenant or user not found" 에러 발생

**DATABASE_URL 형식:**
```
postgresql://postgres.arxntrtipkakbvhcpfqj:[PASSWORD]@aws-0-us-west-2.pooler.supabase.com:5432/postgres
```

### Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| CORS error | Frontend URL not in CORS_ORIGINS | Add URL to Render env vars |
| 503 error | DB connection pool exhaustion | Reduce pool size, enable retries |
| Auth failure | Missing Supabase keys | Check both backend & frontend env vars |
| "Tenant or user not found" | 잘못된 Supabase project ref 사용 | `arxntrtipkakbvhcpfqj` ref 사용 확인 (위 표 참조) |
| DB password auth failed | 비밀번호 변경 후 전파 지연 또는 특수문자 이슈 | 비밀번호에 `!` 등 특수문자 피하기, 변경 후 1-2분 대기 |

---

## Deployment

> ⚠️ **INFRA-004 (2026-01-20)**: Backend migrated from Python service to Docker service.
> ⚠️ **INFRA-006 (2026-01-21)**: Auto-Deploy disabled to prevent import interruption (BUG-028).

| Service | Platform | Type | URL |
|---------|----------|------|-----|
| Frontend | Vercel | Next.js | `https://schola-rag-graph.vercel.app` |
| Backend | Render | **Docker** | `https://scholarag-graph-docker.onrender.com` |
| Database | Supabase | PostgreSQL+pgvector | - |

### Git Remote Configuration

> **INFRA-016 (2026-02-17)**: Consolidated to single remote. `ScholaRAG_Graph` repo deleted.

```
origin  → https://github.com/HosungYou/scholar-graphrag.git   # Production (Vercel + Render)
```

| Remote | Purpose | Connected Services |
|--------|---------|-------------------|
| `origin` (scholar-graphrag) | **Production deployment** | **Vercel + Render** |

**To deploy ANY change (frontend or backend):**
```bash
git push origin main    # Triggers Vercel (frontend) + Render (backend)
```

### ⚠️ Deprecated Services
| Service | Status | Notes |
|---------|--------|-------|
| `scholarag-graph-api` | ❌ Deleted | Replaced by `scholarag-graph-docker` |

### CORS Configuration (Critical!)

Backend must include frontend URL in `CORS_ORIGINS` environment variable:
```
CORS_ORIGINS=https://schola-rag-graph.vercel.app,https://scholarag-graph.vercel.app,http://localhost:3000
```

**Render Dashboard Path**: `scholarag-graph-docker` → Settings → Environment Variables

### Auto-Deploy Configuration (INFRA-006 → Updated 2026-02-13)

> ✅ **Auto-Deploy is ON for both Vercel and Render** as of 2026-02-13.

**History**: INFRA-006 (2026-01-21) disabled auto-deploy to prevent import interruption (BUG-028). Re-enabled 2026-02-13 after stabilization.

**To Deploy**:
1. Push to `origin` remote: `git push origin main`
2. Frontend (Vercel): Auto-deploys from push
3. Backend (Render): Auto-deploys from push
4. ⚠️ Still avoid deploying during active import operations if possible

---

## Quick Links

| Document | Location |
|----------|----------|
| Action Items | `DOCS/project-management/action-items.md` |
| Session Logs | `DOCS/.meta/sessions/` |
| ADRs | `DOCS/.meta/decisions/` |
| Session Template | `DOCS/.meta/templates/session-template.md` |
| Agent Registry | `DOCS/.meta/agent-registry.json` |

---

## 📝 Session Documentation Protocol

> **IMPORTANT**: Claude Code MUST automatically generate session documents following this protocol.

### Auto-Documentation Triggers

| Trigger | Generated Document | Location |
|---------|-------------------|----------|
| `/code-reviewer` or code review request | Session log + Action Items | `DOCS/.meta/sessions/` |
| New feature implementation | Session log | `DOCS/.meta/sessions/` |
| Architecture decision | ADR | `DOCS/.meta/decisions/` |
| Bug fix | Action Items update | `DOCS/project-management/action-items.md` |

### Session Log Format

**Filename**: `YYYY-MM-DD_[type]-[description].md`

**Required sections**:
- Session ID, Date, Agent, Type, Duration
- Context (User Request, Related Decisions)
- Summary
- Action Items (if applicable)
- Session Statistics

### Action Item Tracking

All discovered Action Items MUST be:
1. Added to `DOCS/project-management/action-items.md`
2. Labeled by priority (🔴 High / 🟡 Medium / 🟢 Low)
3. Checked off with date when completed
4. Moved to Archive section when done

**ID Prefixes**: `SEC-` (security), `BUG-` (bug), `FUNC-` (feature), `PERF-` (performance), `DOC-` (docs), `TEST-` (test)

### Code Review Rules

On `/code-reviewer`, MUST generate:
1. Session log with Overall Assessment, Security Analysis, Recommendations
2. Action Items update
3. Registry update (`agent-registry.json`)

### Exceptions

Skip documentation for:
- Simple Q&A (no code changes)
- File exploration only
- User explicitly says "don't document"

---

## 🏗️ Infrastructure Change Documentation Protocol

> **CRITICAL**: All infrastructure changes MUST be documented IMMEDIATELY after deployment.

### Mandatory Documentation for Infrastructure Changes

| Change Type | Required Updates | Example |
|-------------|------------------|---------|
| Service migration | CLAUDE.md Deployment section, Release Notes | Python → Docker |
| URL change | CLAUDE.md, Frontend config, CORS settings | New Render URL |
| Database change | CLAUDE.md, Migration scripts | Supabase → RDS |
| Provider change | CLAUDE.md, Environment Variables section | Render → Railway |

### Infrastructure Change Checklist

When making infrastructure changes:
```
□ Update CLAUDE.md Deployment section with new service info
□ Update CORS_ORIGINS in both:
  - backend/config.py (default values)
  - Render/Platform environment variables
□ Update frontend API URL configuration
□ Create Release Notes (RELEASE_NOTES_vX.X.X.md)
□ Mark deprecated services clearly
□ Test health endpoint: curl <new-url>/health
□ Test CORS: browser console should show no CORS errors
```

### INFRA- Prefix for Infrastructure Issues

Use `INFRA-XXX` prefix for infrastructure-related action items:
- `INFRA-001`: Initial deployment setup
- `INFRA-002`: CI/CD configuration
- `INFRA-003`: Environment variables setup
- `INFRA-004`: Service migration (e.g., Python → Docker)
- `INFRA-006`: Auto-Deploy disabled (BUG-028 prevention)

---

## 📚 Continuous Architecture Documentation Protocol (v0.7.0)

> **Purpose**: Keep architecture documentation in sync with code changes through automated triggers and clear ownership.

### Documentation Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│  Level 1: Quick Reference (CLAUDE.md)                          │
│    - Commands, environment vars, deployment                     │
│    - Updated: Every session with relevant changes              │
├─────────────────────────────────────────────────────────────────┤
│  Level 2: Architecture Deep Dive (DOCS/architecture/SDD.md)    │
│    - System design, component specs, data flow                  │
│    - Updated: On architectural changes                          │
├─────────────────────────────────────────────────────────────────┤
│  Level 3: Release History (RELEASE_NOTES_vX.X.X.md)           │
│    - Features, fixes, migration guides                          │
│    - Created: On each release                                   │
├─────────────────────────────────────────────────────────────────┤
│  Level 4: Decision Records (DOCS/.meta/decisions/ADR-XXX.md)   │
│    - Why decisions were made, alternatives considered          │
│    - Created: On significant architectural decisions           │
└─────────────────────────────────────────────────────────────────┘
```

### Auto-Update Triggers

| Change Type | Update Required | Files to Modify |
|-------------|-----------------|-----------------|
| **New Feature** | ✅ | RELEASE_NOTES, SDD.md (if architectural) |
| **Bug Fix** | ⚠️ Conditional | RELEASE_NOTES (if user-facing) |
| **Dependency Change** | ✅ | SDD.md §3.2.3, RELEASE_NOTES |
| **API Endpoint** | ✅ | SDD.md §3.1, DOCS/api/* |
| **Database Schema** | ✅ | SDD.md §3.3, migration scripts |
| **Environment Variable** | ✅ | CLAUDE.md, SDD.md |
| **Deployment Change** | ✅ | CLAUDE.md, INFRA-XXX |

### SDD Update Checklist

When making architectural changes:

```
□ Update SDD.md version number (top of file)
□ Update relevant component section (§3.x)
□ Add to Change Log (bottom of file)
□ Update Mermaid diagrams if flow changes
□ Create ADR if decision was significant
□ Link to release notes
```

### Version Number Convention

| Format | When to Use | Example |
|--------|-------------|---------|
| `MAJOR.MINOR.PATCH` | Standard releases | `0.7.0` |
| `MAJOR.MINOR.PATCH-rc.N` | Release candidates | `0.8.0-rc.1` |

**Increment Rules**:
- **PATCH**: Bug fixes, documentation updates
- **MINOR**: New features, non-breaking changes
- **MAJOR**: Breaking changes, major refactoring

### Dependency Documentation Requirements (v0.7.0)

When modifying dependencies:

1. **Document in SDD.md §3.2.3** (Frontend Dependency Management)
2. **Include rationale** for version pinning
3. **Add webpack config** if build system changes needed
4. **Test build locally** before committing

Example:
```markdown
| Package | Version | Reason for Pin |
|---------|---------|----------------|
| `three` | `0.152.2` | ESM compatibility with webpack |
```

### Diagram Update Requirements

Keep Mermaid diagrams in sync with code:

| Diagram | Location | Update When |
|---------|----------|-------------|
| System Context | `DOCS/architecture/diagrams/system-context.mmd` | External integrations change |
| Agent Pipeline | `DOCS/architecture/diagrams/agent-pipeline.mmd` | Agent flow changes |
| Data Flow | `DOCS/architecture/diagrams/data-flow.mmd` | Import/query flow changes |
| Container | `DOCS/architecture/diagrams/container-diagram.mmd` | Component architecture changes |

---

## ❓ User Confirmation Protocol (AskUserQuestion)

> **CRITICAL**: Claude Code NEVER guesses in uncertain situations.
> MUST call `AskUserQuestion` tool in the following cases.

### Mandatory Confirmation Scenarios

#### 1. Option Selection Required

**Triggers**:
- 2+ implementation approaches exist
- Library/framework choice needed
- Architecture pattern decision
- Performance vs readability trade-off

#### 2. Additional Information Needed

**Triggers**:
- Requirements unclear or ambiguous
- Business logic decision needed
- External service integration info missing
- Environment/deployment info insufficient

#### 3. Conflict with Existing Code/Knowledge

**Triggers**:
- New implementation differs from existing patterns
- Conflicts with existing ADR
- Conflicts with previous session decisions
- Inconsistent with documented architecture

### Question Priority

| Priority | Situation | Ask Immediately? |
|----------|-----------|------------------|
| 🔴 Critical | Conflicts with ADR/decision | ✅ Yes |
| 🔴 Critical | Security-related decision | ✅ Yes |
| 🟡 High | Architecture pattern choice | ✅ Yes |
| 🟡 High | Irreversible change (DB schema) | ✅ Yes |
| 🟢 Medium | Library selection | ⚠️ Context-dependent |
| 🟢 Medium | Implementation details | ⚠️ Context-dependent |
| ⚪ Low | Coding style/format | ❌ Follow existing patterns |

### Conflict Detection Checklist

Before starting work, check:
```
□ Conflicts with ADRs in DOCS/.meta/decisions/?
□ Conflicts with previous sessions in DOCS/.meta/sessions/?
□ Related to items in DOCS/project-management/action-items.md?
□ Different approach from existing code patterns?
□ Contradicts decisions in agent-registry.json?
```

**On conflict detection**:
1. Clearly explain the conflict
2. Present context of existing decision
3. Offer options (minimum 2)
4. Proceed only after user confirmation

### Exceptions (Proceed Without Asking)

- Repetitive work following existing patterns
- Explicitly decided conventions (linting, formatting)
- User explicitly says "use your judgment"
- Simple bug fix (no logic change)

### Decision Recording

After user confirmation, record decisions:
1. **ADR-level**: Create `DOCS/.meta/decisions/NNN-title.md`
2. **Session-level**: Record in current session log
3. **Simple choice**: Add code comment

```python
# User Decision (2026-01-15): Use Zotero Local API first
# Ref: Session 2026-01-15_zotero-implementation
async def connect_zotero():
    ...
```

---

## 🔄 Decision Flow Summary

```
┌──────────────────────────────────────────────────────────────┐
│                 Claude Code Decision Flow                     │
├──────────────────────────────────────────────────────────────┤
│  1. Start Task                                                │
│       ↓                                                       │
│  2. Conflict Check (ADR, Sessions, Code Patterns)            │
│       ↓                                                       │
│  3. Conflict? ──────────────────────┐                        │
│       │ No                          │ Yes                    │
│       ↓                             ↓                        │
│  4. Options needed? ────┐   → AskUserQuestion                │
│       │ No              │ Yes       │                        │
│       ↓                 ↓           │                        │
│  5. Info missing? ──┐  AskUserQuestion                       │
│       │ No          │ Yes   ↓       │                        │
│       ↓             ↓       ↓       │                        │
│   Proceed     AskUserQuestion ←─────┘                        │
│       │              ↓                                        │
│       │        Wait for response                             │
│       │              ↓                                        │
│       └──────→ Record decision & proceed                     │
│                      ↓                                        │
│               Log in session                                  │
└──────────────────────────────────────────────────────────────┘
```

---

## API Endpoints (Quick Reference)

**Base URL**: `https://scholarag-graph-docker.onrender.com`

```
GET  /health                   # Health check (DB + LLM status)
POST /api/import/scholarag     # ScholaRAG folder import
POST /api/import/pdf           # PDF import
POST /api/import/zotero/validate  # Zotero file validation
GET  /api/projects             # Project list
POST /api/chat/query           # Chat (6-Agent RAG query)
GET  /api/graph/{project_id}   # Graph data
GET  /api/graph/visualization/{project_id}  # Graph visualization (InfraNodus style)
GET  /api/integrations/zotero/collections  # Zotero collections

# InfraNodus Integration (v0.4.0)
GET  /api/graph/relationships/{id}/evidence         # Relationship evidence
GET  /api/graph/temporal/{project_id}               # Temporal graph stats
POST /api/graph/temporal/{project_id}/migrate       # Trigger temporal migration
POST /api/graph/gaps/{project_id}/refresh           # Refresh gap analysis
GET  /api/graph/gaps/{project_id}/analysis          # Get gap analysis data
POST /api/graph/gaps/{id}/generate-bridge           # AI bridge hypotheses
GET  /api/graph/gaps/{project_id}/recommendations   # Gap-based paper recommendations (v0.12.1)
GET  /api/graph/gaps/{project_id}/export            # Export gap report as Markdown (v0.12.1)
GET  /api/graph/diversity/{project_id}              # Diversity metrics
GET  /api/graph/compare/{a}/{b}                     # Project comparison

# Reliability Track Extension (v0.15.0)
GET  /api/evaluation/report                         # Gap detection evaluation report
GET  /api/system/query-metrics                      # Query performance + GraphDB recommendation
POST /api/graph/{project_id}/cross-paper-links      # Cross-paper entity linking
GET  /api/graph/gaps/{project_id}/repro/{gap_id}    # Gap reproduction report

# Quality Evaluation (v0.30.0)
POST /api/evaluation/retrieval/{project_id}         # Retrieval quality evaluation (Precision@K, Recall@K, MRR, Hit Rate)
GET  /api/graph/summary/{project_id}                # Aggregated research summary (overview, metrics, entities, gaps)
GET  /api/graph/summary/{project_id}/export         # Export summary as Markdown or HTML (?format=markdown|html)
GET  /api/graph/temporal/{project_id}/trends        # Temporal trends: Emerging / Stable / Declining entities
POST /api/graph/{project_id}/paper-fit              # Paper fit analysis (DOI or title → similarity, community, gaps)
```

> **Full API Documentation**: See `DOCS/api/infranodus-api.md` for detailed schemas.

### Health Check

```bash
curl https://scholarag-graph-docker.onrender.com/health
# Expected: {"status":"healthy","database":"connected","llm_provider":"groq"}
```

---

## View Modes (InfraNodus Style)

ScholaRAG_Graph provides six interactive visualization modes inspired by InfraNodus:

| Mode | Component | Technology | Icon | Theme | Purpose |
|------|-----------|------------|------|-------|---------|
| **3D** | `Graph3D.tsx` | Three.js + Force Graph | Box | Teal | Full knowledge graph exploration with physics simulation |
| **Topic** | `TopicViewMode.tsx` | D3.js force layout | Grid2X2 | Purple | Topic clustering and community detection |
| **Gaps** | `GapsViewMode.tsx` | Three.js + Ghost Edges | AlertTriangle | Amber | Research gap identification with bridge hypotheses |
| **Citations** | `CitationsViewMode.tsx` | Three.js | BookOpen | Blue | Citation network visualization |
| **Temporal** | `TemporalViewMode.tsx` + `TemporalDashboard.tsx` | React | Clock | Orange | Entity lifecycle: Emerging / Stable / Declining (v0.30.0) |
| **Summary** | `ResearchReport.tsx` | React | FileText | Emerald | Executive research report with Markdown/HTML export (v0.30.0) |

### View Mode Details

#### 3D View
- **Physics**: Customizable force simulation (charge, link distance, gravity)
- **Interactions**: Click nodes to highlight connections, drag to reposition
- **Highlighting**: Yellow glow for selected nodes, connected nodes in green
- **Controls**: Orbit controls for 360° rotation and zoom

#### Topic View
- **Communities**: Louvain algorithm for topic clustering
- **Layout**: D3.js force-directed graph with custom forces
- **Zoom**: Semantic zoom levels (0.5-3x)
- **Clusters**: Visual grouping by research theme

#### Gaps View
- **Ghost Edges**: Semi-transparent yellow edges showing potential connections
- **AI Hypotheses**: LLM-generated bridge concepts for unexplored areas
- **High-Impact**: Prioritized gaps based on PageRank and betweenness centrality
- **Interactive**: Click gaps to generate research suggestions

### View Mode Switching

All modes share:
- Same graph data source
- Consistent node/edge filtering
- Search functionality
- Export capabilities

Switch between modes using toolbar icons in the graph interface.

---

## 🏛️ Architecture Review Protocol

> **CRITICAL**: All architectural changes MUST follow this review protocol before implementation.

### Mandatory Review Triggers

| Change Type | Review Required | SDD Section | Documentation |
|-------------|-----------------|-------------|---------------|
| New Agent added | ✅ | 4.1.1 | Update SDD + agent-pipeline.mmd |
| New API Endpoint | ✅ | 6 | Update SDD + API docs |
| Database schema change | ✅ | 4.3 | Update SDD + migrations |
| LLM Provider change | ✅ | 4.1.4 | Update SDD + LLM_CONFIGURATION.md |
| New Import method | ✅ | 4.1.3 | Update SDD + data-flow.mmd |
| New View Mode | ✅ | 4.2.2 | Update SDD + container-diagram.mmd |
| Core algorithm change | ✅ | Varies | Update SDD + relevant docs |

### Architecture Review Checklist

Before committing architectural changes:
```
□ Documented in SDD.md?
□ Mermaid diagrams updated? (DOCS/architecture/diagrams/)
□ Conflicts with existing ADRs? (DOCS/.meta/decisions/)
□ API contract changes documented?
□ Database migration required?
□ Backward compatibility maintained?
□ Performance impact assessed?
```

### Commit Message Conventions (Architecture)

Use these prefixes for architecture-related commits:

| Prefix | Description | Example |
|--------|-------------|---------|
| `arch:` | General architecture change | `arch: add caching layer` |
| `arch(agent):` | Agent system change | `arch(agent): add validation agent` |
| `arch(api):` | API contract change | `arch(api): add /graph/export endpoint` |
| `arch(schema):` | Database schema change | `arch(schema): add temporal_data column` |
| `arch(llm):` | LLM provider/config change | `arch(llm): add Gemini provider` |
| `arch(viz):` | Visualization architecture | `arch(viz): add heatmap view mode` |

### Architecture Decision Records (ADRs)

For significant decisions, create ADR at `DOCS/.meta/decisions/NNN-title.md`:

```markdown
# ADR-NNN: [Title]

## Status
[Proposed | Accepted | Deprecated | Superseded by ADR-XXX]

## Context
[Why is this decision needed?]

## Decision
[What was decided?]

## Consequences
[What are the implications?]

## Alternatives Considered
[What other options were evaluated?]
```

### SDD Update Workflow

When making architectural changes:

1. **Before Implementation**:
   - Check SDD.md for current architecture
   - Identify affected sections
   - Draft changes to SDD

2. **During Implementation**:
   - Keep SDD changes in sync with code
   - Update Mermaid diagrams if flow changes

3. **After Implementation**:
   - Finalize SDD updates
   - Update Change Log section
   - Create ADR if decision was significant

### Key Architecture Documents

| Document | Location | Purpose |
|----------|----------|---------|
| SDD | `DOCS/architecture/SDD.md` | Master design document |
| System Context | `DOCS/architecture/diagrams/system-context.mmd` | External interactions |
| Agent Pipeline | `DOCS/architecture/diagrams/agent-pipeline.mmd` | 6-Agent flow |
| Data Flow | `DOCS/architecture/diagrams/data-flow.mmd` | Import/query flows |
| Container Diagram | `DOCS/architecture/diagrams/container-diagram.mmd` | Internal architecture |
| Overview | `DOCS/architecture/overview.md` | Detailed architecture |
| ADRs | `DOCS/.meta/decisions/` | Decision records |

---

## 📊 v0.32.0 Release Notes

> **Version**: 0.32.0 | **Date**: 2026-02-18
> **Full Notes**: See `RELEASE_NOTES_v0.32.0.md`

### Production Hardening + International UI

**Phase 1: 500 Error Complete Fix**
- **BUG-056**: 13 unsafe Python `float()` casts → `_safe_float()` helper with fallback. Covers centrality metrics, bridge confidence, gap_strength, weight fields
- **BUG-057**: SQL `(properties->>'weight')::float` without regex guard in summary endpoint → added `CASE WHEN regex` pattern
- **BUG-058**: `ARRAY_AGG(name ...)` includes NULLs in timeline queries → added `FILTER (WHERE name IS NOT NULL)`

**Phase 2: Project Isolation**
- **BUG-059**: 5 importer `INSERT INTO projects` missing `owner_id` → added `owner_id` param to all constructors (scholarag, pdf×2, tto_sample, zotero_rdf, entity_dao) + `import_.py` passes `user_id`
- **BUG-060**: `OR p.owner_id IS NULL` in `projects.py` exposed unowned projects → removed from both `check_project_access()` and listing query

**Phase 3: Settings Isolation**
- **BUG-061**: Server API keys (Groq etc.) visible with masked values to all users → now return `is_set=false, source="not_configured"`. Backend fallback unchanged

**Phase 4: English UI**
- 7 frontend files: All Korean labels → English (38+ strings across GapPanel, GapsViewMode, FrontierMatrix, BridgeStoryline, KnowledgeGraph3D, InsightHUD, PaperFitPanel)
- 2 backend files: `centrality_analyzer.py` (강함→Strong, 보통→Moderate, 약함→Weak), `graph.py` (research significance + cluster labels)

**Phase 5: Gap View UX**
- Progress bar inverted: `(1 - gap_strength)` — high opportunity = full amber bar
- FrontierMatrix: 280×220 → 420×340, dots 5/7→7/10, labels 8px→10px
- Score differentiation: 4-factor impact (size^0.5, bridge, centrality, type_diversity) + 5-factor feasibility (sim_ratio, median_sim, bridge_avail, gap_weakness, sim_spread)

**Phase 6: S2 Integration**
- Auto-fetch papers on gap card expansion via `useEffect` (no manual "Find Papers" click needed)
- Research significance: Korean template → English template

### Technical
- 19 files changed (18 modified + tsconfig), +201/-102 lines
- 0 TypeScript errors, 0 Python errors
- No DB migrations, no new env vars
- Breaking: `owner_id IS NULL` projects hidden until owner assigned

---

## 📊 v0.31.0 Release Notes

> **Version**: 0.31.0 | **Date**: 2026-02-18
> **Full Notes**: See `RELEASE_NOTES_v0.31.0.md`

### Temporal/Summary 500 Fix + Research Frontier Redesign

**Phase 1: Backend 500 Error Fixes**
- **BUG-053**: Summary endpoint `node_ids=r["concepts"] or []` — UUID→str conversion missing (BUG-051 parity). Fixed to `[str(c) for c in ...]`
- **BUG-054**: Unsafe `(properties->>'centrality_pagerank')::float` cast in 3 queries — empty string causes cast failure. Added `CASE WHEN regex` guard in summary top entities, emerging concepts, and gap analysis centrality queries
- **BUG-055**: Temporal info section failure crashes entire summary endpoint. Wrapped in try/except so temporal failure degrades gracefully (min_year/max_year=None)

**Phase 2: Research Frontier Redesign**
- **Rebranding**: "Structural Gaps" → "Research Frontiers" across GapsViewMode + GapPanel with Korean labels (연결 개념, AI 연구 질문, 관련 논문, 개념 클러스터)
- **Impact×Feasibility scores**: `impact_score` (cluster size × bridge count), `feasibility_score` (similarity ratio × bridge availability), `quadrant`, `research_significance` fields added to `StructuralGapResponse`
- **FrontierMatrix**: New 2×2 SVG scatter plot component with Korean quadrant labels (⭐ 즉시 착수 / 🔬 도전적 연구 / ✅ 안전한 시작 / ⏳ 낮은 우선순위)
- **BridgeStoryline**: New Cluster A → Bridge → Cluster B horizontal flow visualization with cluster colors and cosine similarity scores
- **Star rating**: Research opportunity level (★★★★★ 매우 높음 ~ ★☆☆☆☆ 매우 낮음) replaces raw percentage
- **Legend redesign**: Added "Established Links" + renamed to "Opportunity Connections"
- **Auto-generated significance**: Each frontier gets Korean research significance text

### Technical
- 7 files changed (5 modified + 2 new), +453/-61 lines
- 0 TypeScript errors, 0 Python errors
- No DB migrations, no new env vars, no breaking changes
- New components: `FrontierMatrix.tsx`, `BridgeStoryline.tsx`

---

## 📊 v0.30.1 Release Notes

> **Version**: 0.30.1 | **Date**: 2026-02-18
> **Full Notes**: See `RELEASE_NOTES_v0.30.1.md`

### Insight HUD Accuracy Fix + First-Entry Race Condition
- **BUG-050**: Paper coverage SQL `pm.id::text = ANY(uuid[])` type error — always showed 0%. Fixed to `pm.id = ANY()` for UUID comparison. Actual: 82.4%
- **BUG-051**: Cluster `concepts` column (UUID[]) compared against string node IDs — modularity, silhouette, coherence, coverage all computed as 0. Added `str()` conversion in both `/metrics/` and `/diversity/` endpoints
- **BUG-052**: Two compounding issues: (1) `useGraphStore` initialized `isLoading: false` — changed to `true`. (2) `rawDisplayData` useMemo missing `graphData` in dependency array — added it so graph re-renders when data arrives

### Technical
- 3 files changed (1 backend + 2 frontend), +5/-4 lines
- 0 TypeScript errors, 0 Python errors
- No DB migrations, no new env vars, no breaking changes

---

## 📊 v0.30.0 Release Notes

> **Version**: 0.30.0 | **Date**: 2026-02-17
> **Full Notes**: See `RELEASE_NOTES_v0.30.0.md`

### Quality Evaluation System + UI Cleanup (Phase 1)
- **Retrieval eval**: `POST /api/evaluation/retrieval/{project_id}` — Precision@K, Recall@K, MRR, Hit Rate via auto-generated ground truth (`auto_ground_truth.py`, 3 query types)
- **Cluster quality**: `GET /api/graph/metrics/{project_id}` now returns raw modularity + Korean interpretation badge (강함/보통/약함), silhouette score, avg cluster coherence, cluster coverage
- **Entity extraction quality**: type diversity, paper coverage, avg entities/paper, cross-paper ratio, type distribution
- **Toolbar cleanup**: 13 → 6 buttons (removed Bloom, Label, SAME_AS, Centrality, Cluster, LOD, ClusterCompare, MainTopics)
- **UI defaults**: `max_nodes` 2000→500, labels default to all visible, weak edges (weight < 0.3) fade
- **InsightHUD**: redesigned with modularity + interpretation badge + entity quality section

### Executive Summary & Research Report (Phase 2)
- `GET /api/graph/summary/{project_id}` — aggregated overview, quality metrics, top entities, communities, gaps, temporal info
- `GET /api/graph/summary/{project_id}/export?format=markdown|html` — StreamingResponse export
- `backend/graph/report_generator.py` — structured Markdown report (연구 지형 리포트)
- `ResearchReport.tsx` — in-app report viewer with export button; accessible via 6th Summary tab (emerald)

### Temporal Dashboard + Paper Fit Analysis (Phase 3)
- `GET /api/graph/temporal/{project_id}/trends` — classifies entities: Emerging (first_seen >= max-2, 2+ papers), Stable (3+ papers), Declining (last_seen <= max-3)
- `TemporalDashboard.tsx` — color-coded entity cards (emerald/blue/coral)
- `POST /api/graph/{project_id}/paper-fit` — pgvector similarity matching, community mapping, gap connection detection; accepts DOI/title (S2 lookup)
- `backend/graph/paper_fit_analyzer.py` — PaperFitAnalyzer with embedding generation, entity search, community mapping, text summary
- `PaperFitPanel.tsx` — DOI/title input + similarity bars + gap connections (purple toolbar button)
- **ViewMode**: extended to `'3d' | 'topic' | 'gaps' | 'citations' | 'temporal' | 'summary'`

### Technical
- 16 files changed (6 new + 10 modified), +3108/-230 lines
- 0 TypeScript errors, 260 pytest passing
- No DB migrations, no new env vars, no breaking changes

---

## 📊 v0.29.1 Release Notes

> **Version**: 0.29.1 | **Date**: 2026-02-17
> **Full Notes**: See `RELEASE_NOTES_v0.29.1.md`

### asyncpg JSONB Codec Fix — Settings & User Preferences
- **BUG-049**: asyncpg default jsonb codec returns raw strings, not Python dicts. Registered `json.loads`/`json.dumps` codec on pool `init` callback — fixes ALL 5 locations reading `user_profiles.preferences`
- **BUG-048**: Settings UPSERT — `INSERT ON CONFLICT DO UPDATE` with email for NOT NULL constraint; `json.dumps` removed (codec handles it)
- **Cascade fix**: Settings save (500→success), API key persistence, per-user LLM provider selection, S2 key lookup for Find Papers

### Technical
- 2 files changed (backend only), +24/-8 lines
- 0 TypeScript errors, 0 Python errors, 23/23 tests passing
- No DB migrations, no new env vars, no frontend changes

---

## 📊 v0.29.0 Release Notes

> **Version**: 0.29.0 | **Date**: 2026-02-17
> **Full Notes**: See `RELEASE_NOTES_v0.29.0.md`

### Auth Enforcement, Settings Fix, Graph Stability & Find Papers
- **SEC-005**: Auth enforcement — `current_user is None` → HTTP 401 in `verify_project_access`, all project CRUD, `search_nodes`. Prevents unauthenticated data access
- **BUG-045**: Settings `fetch_one()` → `fetchrow()` in 4 locations. Fixes API key save/load and per-user LLM provider selection
- **BUG-046**: Graph3D `computeLineDistances()` removed from 3 empty-geometry calls (SAME_AS, BRIDGES_GAP, ghost). Fixes console TypeError
- **BUG-047**: Find Papers UUID filter — `_build_gap_recommendation_query()` regex filters UUID patterns from bridge_candidates; gap INSERT resolves UUIDs to concept names

### Technical
- 5 files changed (4 backend + 1 frontend), +74/-68 lines
- 0 TypeScript errors, 0 Python errors
- No DB migrations, no new env vars, no new endpoints
- Breaking: Unauthenticated requests that previously leaked data now correctly return 401

---

## 📊 v0.28.0 Release Notes

> **Version**: 0.28.0 | **Date**: 2026-02-17
> **Full Notes**: See `RELEASE_NOTES_v0.28.0.md`

### Topic View Stability & Gap UX Improvement
- **Hover jitter fix**: useCallback for `onClusterHover`, ref pattern for D3 callbacks, dead `hoveredNodeId` state removal, tick handler scale preservation
- **Gap cluster A/B colors**: Cluster A = coral (#E63946), Cluster B = teal (#2EC4B6), bridge = gold (#FFD700). Updated legend, navigator dots, highlight rings, labels
- **Cluster label quality**: Shared `cluster_labeler.py` utility, improved LLM prompt (2-4 word academic terms, no slashes), smarter fallback (shortest 2 names joined with " & ")
- **DRY labeling**: Both `gap_detector.py` and `community_detector.py` delegate to shared utility

### Technical
- 8 files changed (1 new + 6 modified + 1 build info), +217/-71 lines
- 0 TypeScript errors, 0 Python errors
- No DB migrations, no new env vars, no new endpoints
- Backward compatible: `clusterANodes`/`clusterBNodes` optional with `[]` defaults

---

## 📊 v0.27.0 Release Notes

> **Version**: 0.27.0 | **Date**: 2026-02-17
> **Full Notes**: See `RELEASE_NOTES_v0.27.0.md`

### Production Stabilization & Relationship Diversity
- **Migrations 022-025**: Entity deduplication, lexical graph schema, community trace, relationship type enums applied to production DB
- **Relationship diversity**: 2 → 6 types (CO_OCCURS_WITH, SUPPORTS, APPLIES_TO, ADDRESSES, RELATED_TO, EVALUATES_WITH), 3,903 → 5,207 total
- **Edge paper_count**: Computed from `source_paper_ids` intersection (was hardcoded to 1)
- **NodeDetails popup**: Viewport boundary detection + `break-words` CSS
- **INFRA-016**: Git remotes consolidated — single `origin` (scholar-graphrag)
- **Community detection**: 11 communities, modularity 0.6025, 55 structural gaps, meaningful cluster labels

### Technical
- 3 files changed (code) + supabase config, +66/-30 lines
- 0 TypeScript errors, 0 Python errors
- 430 entities (7 types), 5,207 relationships (6 types)
- No breaking changes

---

## 📊 v0.26.0 Release Notes

> **Version**: 0.26.0 | **Date**: 2026-02-16
> **Full Notes**: See `RELEASE_NOTES_v0.26.0.md`

### Per-User LLM Provider Selection
- **Problem**: Settings UI saved provider/model/API keys but backend ignored them — always used server Groq
- **Solution**: New `backend/llm/user_provider.py` per-user provider factory with 3-tier fallback (user key → server key → default)
- **Chat**: Replaced global `_orchestrator` singleton with per-user orchestrator cache (5-min TTL)
- **Import**: Replaced local `get_llm_provider()` with `create_llm_provider_for_user(user_id)` at all 4 call sites
- **Settings API**: Added `GET /api/settings/preferences` endpoint + cache invalidation on PUT
- **Frontend**: Loads saved prefs on mount, updated model defaults (gpt-4o-mini, gemini-1.5-flash), missing-key amber warning

### Provider Options
| Provider | Model | RPM | Notes |
|----------|-------|-----|-------|
| Groq (default) | llama-3.3-70b-versatile | 20 | Free tier |
| OpenAI | gpt-4o-mini | 10,000 | Fast imports |
| Anthropic | claude-haiku-4-5-20251001 | 4,000 | High quality |
| Google | gemini-1.5-flash | 1,000 | Alternative |

### Technical
- 8 files changed (1 new + 7 modified), +303/-119 lines
- 0 TypeScript errors, 0 Python compile errors
- No DB migration needed (`user_profiles.preferences` JSONB already exists)
- Backward compatible: unauthenticated requests fall back to server default

---

## 📊 v0.25.0 Release Notes

> **Version**: 0.25.0 | **Date**: 2026-02-16
> **Full Notes**: See `RELEASE_NOTES_v0.25.0.md`

### Deploy Stabilization (M0)
- **M0-3**: Auth race condition fix — `authLoading` guard prevents graph fetch before auth initialized
- **M0-4**: Migration script enhanced with `--verify-only` and `--from/--to` range flags
- **M0-7**: `leidenalg` + `python-igraph` added to Docker build (+ `cmake` in builder)

### GraphRAG Quality (M3)
- **M3-4**: Relative node sizing — density-aware normalization (~70% smaller at 500+ nodes)
  - Density factor: <100→1.0, <500→0.6, 500+→0.35
  - Metrics normalized to 0-1: centrality 40%, connections 30%, frequency 30%

### 3D UX Enhancement (M4 — 6 New Components)
- **LODControlPanel**: 4-step slider (All/Important/Key/Hub) with hidden node badge
- **ReasoningPathOverlay** + **TraversalPathRenderer**: Chat retrieval trace → 3D gold path
- **ClusterComparePanel**: 2-cluster side-by-side diff (concepts, methods, datasets)
- **ClusterDrillDown**: Double-click cluster → internal sub-graph view
- **PerformanceOverlay**: FPS, node/edge count (P-key toggle)

### Tracking System (M5)
- `DOCS/IMPLEMENTATION_STATUS.md`: 49-item status matrix (v0.20.1–v0.25.0)
- `CHANGELOG.md`: Full project changelog (v0.7.0–v0.25.0)

### Technical
- 16 files changed (9 new + 7 modified), +2042/-22 lines
- 0 TypeScript errors, 0 Python errors
- New keyboard shortcut: `P` for Performance Overlay
- New toolbar buttons: LOD Control (Layers), Cluster Compare (GitCompare)
- Migrations 022-025 ready to apply (entity dedup, lexical graph, community, relationship types)

---

## 📊 v0.24.0 Release Notes

> **Version**: 0.24.0 | **Date**: 2026-02-16
> **Full Notes**: See `RELEASE_NOTES_v0.24.0.md`

### Critical Fixes
- **Migration conflicts**: Renamed 004B/005B/006B to 022/023/024; created 025
- **Missing relationship types**: `REPORTS_FINDING`, `ADDRESSES_PROBLEM`, `PROPOSES_INNOVATION`
- **Cluster labels**: LLM timeout 5s→15s, keyword fallback
- **Leiden**: CommunityDetector + CommunitySummarizer connected

### Feature Activation
- Feature flags defaulted True: `lexical_graph_v1`, `hybrid_trace_v1`, `topic_lod_default`
- `paper_count` in visualization API
- Edge opacity floors raised

### Technical
- 20 TDD tests passing (test_p0_p2_fixes.py)
- `max_nodes` default: 1000 → 2000

---

## 📊 v0.18.0 Release Notes

> **Version**: 0.18.0 | **Date**: 2026-02-13
> **Full Notes**: See `RELEASE_NOTES_v0.18.0.md`

### Production Backend Hotfixes
- **P1**: `fetch_one()` → `fetchrow()` in integrations.py (WARNING eliminated)
- **P2**: Missing `project_id` in `search_entities()` call (concept_extraction_agent.py)
- **P3**: Temporal endpoint `first_seen_year` column error → try-except with empty response fallback
- **P5**: Conversation FK violation → defensive `user_id` check before INSERT

### 3D "Central Burst" Root Fix
- **F1**: Removed `centralityPercentileMap` from `nodeThreeObject` deps → ref pattern + scene.traverse
- **F2**: Position preservation on node recreation from `nodePositionsRef`
- **F3**: Removed `onLinkClick` handler (replaced by ConceptExplorer)
- **Q3**: Eigenvector centrality fallback: `degree.copy()` instead of all-zeros

### Researcher-Centric UX
- **U1**: New `ConceptExplorer.tsx` — relationship exploration panel grouped by type with evidence navigation
- **U2**: KnowledgeGraph3D integration — ConceptExplorer replaces direct edge clicking
- **U3**: 3-tier neighbor highlight (selected=gold 1.2x, connected=1.0, non-connected=0.15)
- **U4**: Relationship type edge colors (CO_OCCURS=teal, RELATED_TO=purple, SUPPORTS=green, CONTRADICTS=red)

### Backend Quality
- **Q1**: Cluster label async/sync mismatch documented (LLM labeling needs async refactor)
- **Q2**: Concept name >60 chars reclassified as Finding
- Relationship type normalization in entity_dao.py

### Technical
- 15 files changed, +486/-74 lines (1 new component)
- No database migrations, no new env vars, no new endpoints
- Build: zero TypeScript errors, zero Python compile errors
- Breaking: Edge click removed (replaced by ConceptExplorer panel)

---

## 📊 v0.16.3 Release Notes

> **Version**: 0.16.3 | **Date**: 2026-02-13
> **Full Notes**: See `RELEASE_NOTES_v0.16.3.md`

### Bug Fixes
- **BUG-044**: Invalid API key 401 errors on all auth requests — Render's `SUPABASE_ANON_KEY` environment variable was mismatched with the actual Supabase project key, causing all authentication requests to return 401 "Invalid API key"
  - Fixed by updating Render env var to match correct Supabase project anon key
  - Added diagnostic code in `backend/auth/supabase_client.py`:
    - Pre-validation of anon key at initialization time (lines 51-65)
    - "Invalid API key" specific CRITICAL log branch in verify_jwt() (lines 113-121)

### Infrastructure
- **INFRA-014**: Render SUPABASE_ANON_KEY corrected — Updated environment variable to match Supabase project key

### Technical
- 1 file changed, +47/-21 lines
- No database migrations, no new env vars, no breaking changes
- Build: zero TypeScript errors

---

## 📊 v0.16.2 Release Notes

> **Version**: 0.16.2 | **Date**: 2026-02-12
> **Full Notes**: See `RELEASE_NOTES_v0.16.2.md`

### Bug Fixes
- **BUG-043-EXT**: Comprehensive 6-layer 401 auth error defense
  - Layer 1: ImportProgress polling stops on 401/403 (was looping every 2s)
  - Layer 2: Global QueryClient retry defaults skip auth errors for all queries
  - Layer 3: Token auto-refresh via `supabase.auth.refreshSession()` on 401
  - Layer 4: `authenticatedFetch()` helper guards all 6 direct `fetch()` calls
  - Layer 5: Backend per-IP auth failure rate limiting (20/min → 429)
  - Layer 6: Auto-signout on dead session — clears cached auth state so `enabled:!!user` stops all refetchInterval loops
  - Cleanup: Removed redundant per-query retry overrides (now global)

### Security
- **SEC-004**: Backend AuthMiddleware rate-limits repeated auth failures per IP

### Technical
- 7 files changed, +94/-30 lines
- No database migrations, no new env vars, no breaking changes
- Build: zero TypeScript errors

---

## 📊 v0.16.1 Release Notes

> **Version**: 0.16.1 | **Date**: 2026-02-13
> **Full Notes**: See `RELEASE_NOTES_v0.16.1.md`

### Bug Fixes
- **BUG-043**: 401 Unauthorized polling loop — `InterruptedImportsSection` continued polling with expired auth tokens, flooding logs. Fixed with `enabled: !!user` guard, custom retry that skips 401/403, and API client 401 early-exit.
- **E2-v2**: OpenAI embedding token limit — replaced `MAX_CHARS=30000` (character-based) with **tiktoken-based truncation** (8000 tokens). Previous fix failed for academic/multilingual text where char-to-token ratio is ~2 (30000 chars = ~15000 tokens).

### Technical
- 3 files changed, +55/-5 lines
- No database migrations, no new env vars, no breaking changes
- tiktoken already in requirements.txt (used for `cl100k_base` encoding)

---

## 📊 v0.15.1 Release Notes

> **Version**: 0.15.1 | **Date**: 2026-02-09
> **Full Notes**: See `RELEASE_NOTES_v0.15.1.md`

### Infrastructure Maintenance
- **INFRA-008**: Supabase Free Plan 용량 초과 해결 — 1월 테스트 프로젝트 26개 삭제 (~104만 행)
- **INFRA-009**: VACUUM FULL 공간 회수 — **671 MB → 181 MB** (490 MB 회수, 73% 감소)
- **INFRA-010**: Migration 021_cross_paper_links.sql 적용 — `SAME_AS` enum + 2 indexes
- **INFRA-011**: Render DATABASE_URL — Transaction Pooler (6543) → **Session Pooler (5432)**
- **INFRA-012**: 프로젝트 루트 Supabase MCP `.mcp.json` 설정

### Technical
- No code changes, infrastructure-only release
- No breaking changes, no new env vars
- 4 February projects preserved (2/4, 2/6 x2, 2/7)

---

## 📊 v0.15.0 Release Notes

> **Version**: 0.15.0 | **Date**: 2026-02-08
> **Full Notes**: See `RELEASE_NOTES_v0.15.0.md`

### Backend (Phases 7-10)
- **Provenance Chain**: 3-tier evidence cascade (relationship_evidence → source_chunk_ids → text_search) + AI explanation fallback
- **Search Strategy Routing**: Automatic vector/graph_traversal/hybrid classification in chat responses
- **Embedding-based ER**: Cosine similarity candidate detection + few-shot Groq extraction
- **Table→Graph Pipeline**: TableSourceMetadata for table-sourced entities
- **Gap Evaluation**: Ground truth dataset (AI Education) + Recall/Precision/F1 metrics
- **Query Instrumentation**: QueryMetricsCollector with hop-level latency + GraphDB 500ms threshold
- **Cross-Paper Linking**: SAME_AS relationship type for cross-paper entity identity

### Frontend (Phase 11A-11F)
- **Provenance UI**: 4-tier badges with Korean labels in EdgeContextModal
- **Strategy Badges**: Icon-based search strategy indicators in ChatInterface
- **ER Dashboard**: Embedding/string candidate stats in ImportProgress
- **Table Viz**: Amber ring indicator + EVALUATED_ON metric badges
- **Evaluation Page**: New `/evaluation` route with gap detection metrics grid
- **Query Metrics**: Hop-by-hop latency bars + GraphDB recommendation in Settings
- **SAME_AS Viz**: Dashed purple edges with camera-based LOD + toggle control

### UX Polish (Phase 12A-12D)
- Progressive disclosure (EdgeContextModal, ImportProgress, ChatInterface)
- Responsive layout + ARIA accessibility labels (Korean)
- QA fixture scenarios (provenance-chain, strategy-badge, same-as-edges)
- Codex documentation updated (SDD, TDD, Execution Procedure/Log)

### Technical
- 18 sub-phases, 0 TypeScript errors, 38 tests + 9 snapshots passing
- New endpoints: `/api/evaluation/report`, `/api/system/query-metrics`, `/api/graph/{id}/cross-paper-links`
- New page: `/evaluation`
- Migration: `021_cross_paper_links.sql`
- No breaking changes, no new env vars

---

## 📊 v0.14.1 Release Notes

> **Version**: 0.14.1 | **Date**: 2026-02-07
> **Full Notes**: See `RELEASE_NOTES_v0.14.1.md`

### UX Enhancements
- **DraggablePanel**: Double-click reset, `CollapsibleContent` animation, touch device support, `useDraggablePanelReset()` hook
- **GapPanel**: Arrow key navigation, color chip clusters, gradient progress bar, S2 429 auto-retry with 60s countdown
- **GapsViewMode Minimap**: 160x120 canvas with circular cluster layout, dashed gap lines, selected gap highlighting
- **Settings Page**: Full Editorial Research theme redesign (monospace labels, accent-teal selections)
- **Interrupted Imports**: Clear All button with confirmation, editorial layout, progress display

### New Feature
- **Gap-to-Chat Integration**: MessageSquare button on research questions pre-fills chat input + switches to split view. Threaded via `onAskQuestion` callback through KnowledgeGraph3D → GapPanel

### Technical
- 9 files changed, +607/-159 lines (frontend only)
- `deleteInterruptedJobs()` API client method
- No database migrations, no new env vars

---

## 📊 v0.14.0 Release Notes

> **Version**: 0.14.0 | **Date**: 2026-02-07
> **Full Notes**: See `RELEASE_NOTES_v0.14.0.md`

### Critical Fixes
- **WebGL Crash (A1)**: Three.js resource disposal on unmount + texture/node caching
- **Hover Jitter (A2)**: Decoupled highlight from nodeThreeObject deps, highlight-only material updates
- **Broken Labels (A3)**: Filter empty concept names in backend + frontend (6 files)
- **Panel Overlap (A4)**: Global z-index counter + bring-to-front on click
- **S2 API Key (A5)**: `get_effective_api_key()` for per-user key with server fallback

### UX Improvements
- **Auto-Load Papers**: Recommendations auto-fetch on gap expansion
- **Toast Notifications**: New `Toast.tsx` component with `useToast()` hook
- **Find Papers Promoted**: Accessible in ≤2 clicks from gap list header
- **Topic Labels**: 16px sans-serif, concept preview on hover, scale effect
- **Gaps View**: Wider sidebar (w-72 → w-80), bold badges, gap count, empty state

### Technical
- `frontend/components/ui/Toast.tsx`: New toast notification system
- `backend/routers/integrations.py`: `get_effective_api_key()` helper across 8 S2 endpoints
- `backend/graph/gap_detector.py`: Empty keyword filtering in label generation
- WebGL cleanup: -200MB memory on 3D view remount

---

## 📊 v0.12.1 Release Notes

> **Version**: 0.12.1 | **Date**: 2026-02-07
> **Full Notes**: See `RELEASE_NOTES_v0.12.1.md`

### Added
- **LLM-Summarized Cluster Labels**: `POST /api/graph/gaps/{project_id}/label-clusters` generates human-readable labels from top concepts (Phase 1)
- **Gap-Based Paper Recommendations**: `GET /api/graph/gaps/{project_id}/recommendations` suggests papers bridging structural gaps (Phase 2)
- **Gap Analysis Report Export**: `GET /api/graph/gaps/{project_id}/export` exports Markdown reports with clusters, gaps, and bridge candidates (Phase 3)

### Technical
- `backend/routers/graph.py`: 3 new endpoints with LLM-powered labeling and paper ranking
- `backend/graph/gap_detector.py`: Gap-aware paper scoring using PageRank and embeddings
- Export format: Markdown with cluster tables, gap sections, and research questions

---

## 📊 v0.11.0 Release Notes

> **Version**: 0.11.0 | **Date**: 2026-02-06
> **Full Notes**: See `RELEASE_NOTES_v0.11.0.md`

### Critical
- **Visualization API**: `max_nodes` default 200→1000 (max 5000), ORDER BY prioritizes academic entities
- **Zotero Gap Detection**: Full parity with ScholaRAG importer (clustering + gap analysis + centrality)

### High
- **AI Evidence Explanation**: LLM-generated relationship explanation when no text chunks exist
- **Gap Panel Resize**: Drag-to-resize (256-500px), default 320px
- **Dynamic Chat Questions**: Graph data-based suggested questions (replaces hardcoded)
- **Bridge Ideas UX**: Categorized error messages (LLM/network/not-found) + UUID label detection
- **Cluster Labels**: UUID regex detection with keyword-based fallback names

### Medium
- **Hover Debounce**: 50ms debounce eliminates node jitter (~90% fewer state updates)
- **View Tab UI**: Tab-bar style view mode toggle (3D/Topics/Gaps)
- **Panel Layout**: Flex-based stacking prevents overlap

### Low
- **Korean Tooltips**: All toolbar buttons translated to Korean

### Technical
- `backend/routers/graph.py`: max_nodes, ORDER BY, ai_explanation field
- `backend/importers/zotero_rdf_importer.py`: Phase 6 gap detection
- `frontend/components/graph/*`: GapPanel, Graph3D, KnowledgeGraph3D, EdgeContextModal, GapQueryPanel
- `frontend/components/chat/ChatInterface.tsx`: graphStats prop, useMemo questions
- `frontend/types/graph.ts`: ai_explanation field

---

## 📊 v0.10.1 Release Notes

> **Version**: 0.10.1 | **Date**: 2026-02-06
> **Full Notes**: See `RELEASE_NOTES_v0.10.1.md`

### Fixed
- **Repeated Project Reopen Instability**: Removed duplicate graph fetch on project page re-entry path
- **Health Check DB Churn**: Added cached health snapshot (TTL 15s) and single-query DB/pgvector probe
- **Connection Pressure Reduction**: `/health` now uses cached snapshot instead of repeated DB checks

### Technical
- `backend/database.py`: `get_health_snapshot()` + `asyncio.Lock` + TTL cache
- `backend/main.py`: `/health` now reads snapshot once
- `frontend/app/projects/[id]/page.tsx`: removed redundant `fetchGraphData(projectId)` effect

---

## 📊 v0.10.0 Release Notes

> **Version**: 0.10.0 | **Date**: 2026-02-05
> **Full Notes**: See `RELEASE_NOTES_v0.10.0.md`

### Added
- **Entity Type V2**: Type-specific confidence thresholds (0.6-0.7), enhanced DATASETS/METRICS extraction prompts, metrics parsing pipeline
- **Entity Shape Visualization**: 8 distinct Three.js geometries per entity type (Sphere, Box, Octahedron, Cone, Dodecahedron, Tetrahedron, Cylinder, Torus)
- **EntityTypeLegend Component**: Collapsible legend with SVG shape icons and Korean labels
- **Convex Hull Boundaries**: D3.js `polygonHull` cluster boundaries in Topic View
- **Test Infrastructure**: 3 backend test files (test_chat_router, test_graph_router, test_importer) + 3 frontend test files (Graph3D, useGraphStore, api)
- **Active Mode Indicator**: Pulsing dot animation on view mode badges (teal=3D, purple=Topic)

### Improved
- **Camera Polling**: Bucket-based zoom updates (`Math.round(distance/50)*50`) via `useRef` - ~90% fewer state updates
- **Cluster Labels**: 14px color-matched text with text shadow (was 12px white)
- **Topic Legend**: Shows cluster color swatches with names and counts
- **SDD Document**: Updated from v0.7.0 to v0.9.0 with full architectural alignment

### Technical
- `ENTITY_TYPE_CONFIDENCE_THRESHOLDS` constant in `entity_extractor.py`
- `ENTITY_TYPE_SHAPES` constant in `Graph3D.tsx` with geometry switch in `nodeThreeObject`
- `currentZoomRef` for jitter-free camera polling
- `hullGroup` with `d3.polygonHull` in `TopicViewMode.tsx`

---

## 📊 v0.9.0 Release Notes

> **Version**: 0.9.0 | **Date**: 2026-02-04
> **Full Notes**: See `RELEASE_NOTES_v0.9.0.md`

### Added
- **InfraNodus-Style Labeling**: Centrality-based visibility (top 20% always visible), dynamic font sizing (10-28px), opacity gradient (0.3-1.0)
- **Improved Tooltips**: All 14 toolbar buttons have descriptive Korean tooltips

### Fixed
- **Graph Shrinkage**: Reduced velocity decay 0.9→0.4, increased cooldown 200→1000
- **Node Drag Release**: Nodes now float back naturally after dragging
- **AI Explain UUID**: Uses concept names instead of raw UUIDs
- **No Gaps Detected**: Auto-refresh + stronger min_gaps enforcement
- **Evidence 500 Errors**: SQL escaping + classified error handling

### Removed
- **Particle Effects**: Lightning toggle and particle rendering completely removed

### Planned (v0.10.0) → ✅ Released
- ✅ Entity Extraction V2 (all 8 entity types) → v0.10.0
- AI Chat data-based fallback → moved to v0.11.0
- Semantic diversity metrics → moved to v0.11.0
- Next.js 14.2+ security upgrade → moved to v0.11.0

---

## 📊 v0.8.0 Release Notes

> **Version**: 0.8.0 | **Date**: 2026-02-04
> **Full Notes**: See `RELEASE_NOTES_v0.8.0.md`

### Added
- **Label Visibility Toggle**: Toolbar button cycles none/important/all modes
- **Node Removal Preview**: Visual preview before applying slicing
- **InsightHUD Repositioning**: Moved to right-side (InfraNodus-style)

### Fixed
- **EdgeContextModal Accessibility**: ESC key, focus trap, ARIA attributes
- **Evidence API Stability**: Table existence check prevents 500 errors
- **Cluster Color Stability**: Hash-based assignment for consistent colors

### Technical
- `hashClusterId()` function for deterministic color mapping
- `LabelVisibility` type with `cycleLabelVisibility()` store action
- Dynamic panel stacking for InsightHUD positioning

---

## 📊 v0.7.0 Release Notes

> **Version**: 0.7.0 | **Date**: 2026-02-04
> **Full Notes**: See `RELEASE_NOTES_v0.7.0.md`

### Added
- **Node Pinning**: Click to pin, Shift+click for multi-select
- **Adaptive Labeling**: Zoom-responsive label visibility
- **Graph-to-Prompt**: Export graph context for AI tools
- **Continuous Documentation Protocol**: Auto-update triggers and guidelines
- **SDD §3.2.3**: Frontend Dependency Management section

### Fixed
- `'focused'` diversity rating type error (BUG-041)
- Three.js ESM module resolution for Vercel builds (BUG-042)

### Technical
- Pinned Three.js ecosystem to stable versions
- webpack NormalModuleReplacementPlugin for ESM paths
- npm overrides for transitive dependencies
