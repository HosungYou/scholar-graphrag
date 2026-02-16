# Architecture Overview

Technical deep-dive into ScholaRAG_Graph's architecture.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           Frontend                                   │
│                      (Next.js 14 + React)                           │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │
│  │   Project   │  │   Graph     │  │    Chat     │  │    Gap     │ │
│  │   Manager   │  │   Canvas    │  │  Interface  │  │   Panel    │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └────────────┘ │
│         │               │               │                │          │
│  ┌──────┴───────────────┴───────────────┴────────────────┴───────┐ │
│  │                    State Management                            │ │
│  │               (Zustand + TanStack Query)                       │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ REST API
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                           Backend                                    │
│                         (FastAPI)                                    │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    API Layer (Routers)                       │   │
│  │  /projects  /graph  /entities  /gaps  /chat  /import        │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                       │
│  ┌───────────────────────────┴───────────────────────────────────┐ │
│  │                   Service Layer                                │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │ │
│  │  │  Graph   │  │  Entity  │  │   Gap    │  │    Import    │  │ │
│  │  │ Service  │  │ Service  │  │ Service  │  │   Service    │  │ │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────────┘  │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                              │                                       │
│  ┌───────────────────────────┴───────────────────────────────────┐ │
│  │                   Multi-Agent System                           │ │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────────┐  │ │
│  │  │ Intent │→│Concept │→│  Task  │→│ Query  │→│  Reasoning │  │ │
│  │  │ Agent  │ │ Agent  │ │ Agent  │ │ Agent  │ │   Agent    │  │ │
│  │  └────────┘ └────────┘ └────────┘ └────────┘ └────────────┘  │ │
│  │                                              ↓                 │ │
│  │                                        ┌────────────┐         │ │
│  │                                        │  Response  │         │ │
│  │                                        │   Agent    │         │ │
│  │                                        └────────────┘         │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                              │                                       │
│  ┌───────────────────────────┴───────────────────────────────────┐ │
│  │                   Core Components                              │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐│ │
│  │  │   Entity     │  │     Gap      │  │    LLM Provider      ││ │
│  │  │  Extractor   │  │   Detector   │  │  (Claude/GPT/etc)    ││ │
│  │  └──────────────┘  └──────────────┘  └──────────────────────┘│ │
│  └───────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ asyncpg
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       PostgreSQL + pgvector                          │
├─────────────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐    │
│  │ projects │  │ entities │  │  edges   │  │ structural_gaps  │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘    │
│                     │                                                │
│              vector column                                           │
│            (1536 dimensions)                                         │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Frontend Architecture

### Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Framework | Next.js 14 (App Router) | SSR, routing |
| UI Library | React 18 | Component framework |
| State | Zustand | Global state |
| Server State | TanStack Query | API caching |
| Styling | Tailwind CSS | Utility-first CSS |
| Graph | React Flow | Node-based canvas |
| Charts | Recharts | Data visualization |

### Directory Structure

```
frontend/
├── app/                    # Next.js App Router
│   ├── layout.tsx          # Root layout
│   ├── page.tsx            # Home page
│   └── projects/
│       └── [id]/
│           └── page.tsx    # Project detail
├── components/
│   ├── graph/
│   │   ├── KnowledgeGraph.tsx
│   │   ├── CircularNode.tsx
│   │   └── GapPanel.tsx
│   ├── chat/
│   │   └── ChatInterface.tsx
│   └── ui/                 # shadcn/ui components
├── lib/
│   ├── api.ts              # API client
│   ├── store.ts            # Zustand stores
│   └── forceLayout.ts      # D3-force integration
└── types/
    └── index.ts            # TypeScript types
```

### State Management

```typescript
// lib/store.ts
interface GraphStore {
  nodes: Node[];
  edges: Edge[];
  selectedNode: Node | null;
  filters: FilterState;
  
  // Actions
  setNodes: (nodes: Node[]) => void;
  selectNode: (node: Node) => void;
  updateFilters: (filters: Partial<FilterState>) => void;
}

const useGraphStore = create<GraphStore>((set) => ({
  nodes: [],
  edges: [],
  selectedNode: null,
  filters: defaultFilters,
  
  setNodes: (nodes) => set({ nodes }),
  selectNode: (node) => set({ selectedNode: node }),
  updateFilters: (filters) => set((state) => ({
    filters: { ...state.filters, ...filters }
  }))
}));
```

### Custom Nodes

```tsx
// components/graph/CircularNode.tsx
export const CircularNode: React.FC<NodeProps> = ({ data }) => {
  const size = 20 + data.degree * 5;
  const opacity = 0.3 + data.betweenness * 0.7;
  
  return (
    <div
      className="rounded-full flex items-center justify-center cursor-pointer"
      style={{
        width: size,
        height: size,
        backgroundColor: `rgba(${clusterColors[data.cluster]}, ${opacity})`,
        border: data.isGapBridge ? '3px dashed gold' : 'none'
      }}
    >
      <span className="text-xs truncate max-w-[80px]">
        {data.label}
      </span>
    </div>
  );
};
```

---

## Backend Architecture

### Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Framework | FastAPI | Async web framework |
| Database | PostgreSQL 16 | Relational storage |
| Vector DB | pgvector | Embedding storage |
| ORM | Raw SQL (asyncpg) | Performance |
| Validation | Pydantic | Schema validation |
| Testing | pytest + pytest-asyncio | Test framework |

### Directory Structure

```
backend/
├── main.py                 # FastAPI app entry
├── config.py               # Configuration
├── database/
│   ├── __init__.py
│   ├── connection.py       # Connection pool
│   └── migrations/
│       ├── 001_initial.sql
│       └── 004_concept_centric.sql
├── routers/
│   ├── projects.py
│   ├── graph.py
│   ├── entities.py
│   ├── gaps.py
│   └── chat.py
├── services/
│   ├── graph_service.py
│   ├── entity_service.py
│   └── gap_service.py
├── graph/
│   ├── entity_extractor.py
│   ├── entity_disambiguator.py
│   ├── relationship_builder.py
│   └── gap_detector.py
├── agents/
│   ├── orchestrator.py
│   ├── intent_agent.py
│   ├── concept_agent.py
│   ├── task_agent.py
│   ├── query_agent.py
│   ├── reasoning_agent.py
│   └── response_agent.py
├── importers/
│   └── scholarag_importer.py
└── tests/
    ├── test_entity_extractor.py
    ├── test_gap_detector.py
    └── test_agents.py
```

### API Design

```python
# routers/gaps.py
from fastapi import APIRouter, Depends
from services.gap_service import GapService

router = APIRouter(prefix="/api/gaps", tags=["gaps"])

@router.get("")
async def list_gaps(
    project_id: str,
    min_strength: float = 0.5,
    limit: int = 10,
    gap_service: GapService = Depends()
):
    """List structural gaps for a project."""
    gaps = await gap_service.get_gaps(
        project_id=project_id,
        min_strength=min_strength,
        limit=limit
    )
    return {"success": True, "data": {"gaps": gaps}}
```

---

## Multi-Agent System

### Agent Pipeline

```
User Query: "What methods are used to study chatbot effectiveness?"
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Intent Agent                              │
│  Input: Raw query                                                │
│  Output: {intent: "method_analysis", domain: "effectiveness"}   │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Concept Agent                              │
│  Input: Intent + query                                           │
│  Output: {concepts: ["chatbot", "effectiveness", "methods"]}    │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Task Agent                               │
│  Input: Concepts + intent                                        │
│  Output: {tasks: ["find_methods", "rank_by_usage"]}             │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Query Agent                               │
│  Input: Tasks + concepts                                         │
│  Output: {sql: "SELECT...", vector_query: [...]}                │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Reasoning Agent                             │
│  Input: Query results + context                                  │
│  Output: {analysis: "RCT is most common (23 papers)..."}        │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Response Agent                             │
│  Input: Analysis + user preferences                              │
│  Output: Natural language response with citations                │
└─────────────────────────────────────────────────────────────────┘
```

### Agent Implementation

```python
# agents/reasoning_agent.py
class ReasoningAgent:
    """Performs analysis on retrieved data using chain-of-thought."""
    
    def __init__(self, llm_provider: LLMProvider):
        self.llm = llm_provider
        
    async def analyze(
        self,
        query_results: QueryResults,
        context: ConversationContext
    ) -> ReasoningOutput:
        prompt = self._build_prompt(query_results, context)
        
        response = await self.llm.generate(
            prompt=prompt,
            system=REASONING_SYSTEM_PROMPT,
            temperature=0.3  # Low temp for analytical tasks
        )
        
        return self._parse_response(response)
    
    def _build_prompt(self, results: QueryResults, ctx: ConversationContext) -> str:
        return f"""
        Query Results:
        {json.dumps(results.to_dict(), indent=2)}
        
        Conversation Context:
        - Previous topics: {ctx.topics}
        - User expertise level: {ctx.expertise}
        
        Task: Analyze these results and identify:
        1. Key patterns
        2. Notable findings
        3. Connections to previous discussion
        4. Potential gaps or contradictions
        
        Use chain-of-thought reasoning. Show your work.
        """
```

---

## Database Schema

### Core Tables

```sql
-- Projects
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    config JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Entities (Concepts, Methods, Findings)
CREATE TABLE entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    entity_type VARCHAR(50) NOT NULL,  -- 'Concept', 'Method', 'Finding'
    name VARCHAR(500) NOT NULL,
    name_normalized VARCHAR(500),
    definition TEXT,
    properties JSONB DEFAULT '{}',
    embedding vector(1536),
    centrality_degree FLOAT DEFAULT 0,
    centrality_betweenness FLOAT DEFAULT 0,
    cluster_id INTEGER,
    source_papers JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Edges (Relationships)
CREATE TABLE edges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    source_id UUID REFERENCES entities(id) ON DELETE CASCADE,
    target_id UUID REFERENCES entities(id) ON DELETE CASCADE,
    relationship_type VARCHAR(50) NOT NULL,
    weight FLOAT DEFAULT 1.0,
    properties JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Structural Gaps
CREATE TABLE structural_gaps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    cluster_a_id INTEGER NOT NULL,
    cluster_b_id INTEGER NOT NULL,
    gap_strength FLOAT NOT NULL,
    semantic_distance FLOAT,
    bridge_concepts JSONB DEFAULT '[]',
    research_questions JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_entities_project ON entities(project_id);
CREATE INDEX idx_entities_type ON entities(entity_type);
CREATE INDEX idx_entities_embedding ON entities USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX idx_edges_project ON edges(project_id);
CREATE INDEX idx_edges_source ON edges(source_id);
CREATE INDEX idx_edges_target ON edges(target_id);
```

### Vector Search

```python
# database/connection.py
async def vector_search(
    project_id: str,
    query_embedding: list[float],
    limit: int = 10,
    threshold: float = 0.7
) -> list[Entity]:
    sql = """
    SELECT *,
           1 - (embedding <=> $1) as similarity
    FROM entities
    WHERE project_id = $2
      AND embedding IS NOT NULL
      AND 1 - (embedding <=> $1) > $3
    ORDER BY embedding <=> $1
    LIMIT $4
    """
    return await pool.fetch(sql, query_embedding, project_id, threshold, limit)
```

---

## Entity Extraction

### Pipeline

```python
# graph/entity_extractor.py
class EntityExtractor:
    EXTRACTION_PROMPT = """
    Analyze this academic paper and extract structured knowledge:
    
    Title: {title}
    Abstract: {abstract}
    
    Extract:
    1. concepts: Key theoretical concepts (max 10)
    2. methods: Research methodologies (max 5)
    3. findings: Key findings with effect sizes (max 5)
    
    For each entity:
    - name: Canonical name (lowercase, singular)
    - definition: Brief definition in context
    - confidence: 0.0-1.0 extraction confidence
    
    Return ONLY valid JSON.
    """
    
    async def extract(self, paper: Paper) -> ExtractedEntities:
        prompt = self.EXTRACTION_PROMPT.format(
            title=paper.title,
            abstract=paper.abstract
        )
        
        response = await self.llm.generate(
            prompt=prompt,
            response_format={"type": "json_object"}
        )
        
        entities = json.loads(response)
        return self._post_process(entities)
```

### Disambiguation

```python
# graph/entity_disambiguator.py
class EntityDisambiguator:
    """Merge similar entities using embedding similarity."""
    
    async def disambiguate(
        self,
        entities: list[Entity],
        threshold: float = 0.9
    ) -> list[Entity]:
        # Group by embedding similarity
        clusters = self._cluster_by_similarity(entities, threshold)
        
        # Merge each cluster
        merged = []
        for cluster in clusters:
            canonical = self._select_canonical(cluster)
            canonical.aliases = [e.name for e in cluster if e != canonical]
            canonical.source_papers = self._merge_sources(cluster)
            merged.append(canonical)
        
        return merged
```

---

## Gap Detection

### Algorithm

```python
# graph/gap_detector.py
class GapDetector:
    def __init__(self, n_clusters: int = None):
        self.n_clusters = n_clusters
        
    async def detect_gaps(
        self,
        project_id: str
    ) -> list[StructuralGap]:
        # 1. Get concepts with embeddings
        concepts = await self.get_concepts(project_id)
        
        # 2. Cluster concepts
        n_clusters = self.n_clusters or self._optimal_k(concepts)
        clusters = self._cluster_concepts(concepts, n_clusters)
        
        # 3. Calculate inter-cluster connections
        edges = await self.get_edges(project_id)
        connection_matrix = self._build_connection_matrix(clusters, edges)
        
        # 4. Identify gaps
        gaps = []
        for i, j in combinations(range(n_clusters), 2):
            strength = connection_matrix[i, j]
            if strength < 0.1:  # Weak connection
                gap = StructuralGap(
                    cluster_a_id=i,
                    cluster_b_id=j,
                    gap_strength=1 - strength,
                    semantic_distance=self._semantic_distance(clusters[i], clusters[j])
                )
                gap.bridge_concepts = self._find_bridges(clusters[i], clusters[j], concepts)
                gaps.append(gap)
        
        # 5. Generate research questions
        for gap in gaps:
            gap.research_questions = await self._generate_questions(gap)
        
        return sorted(gaps, key=lambda g: g.gap_strength, reverse=True)
```

---

## Deployment

### Docker Compose Production

```yaml
# docker-compose.prod.yml
version: '3.9'

services:
  db:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    deploy:
      resources:
        limits:
          memory: 2G

  backend:
    build:
      context: .
      dockerfile: Dockerfile
    environment:
      DATABASE_URL: postgresql://postgres:${DB_PASSWORD}@db:5432/scholarag_graph
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
    depends_on:
      - db
    deploy:
      replicas: 2
      resources:
        limits:
          memory: 1G

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    depends_on:
      - backend
    deploy:
      resources:
        limits:
          memory: 512M

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./certs:/etc/nginx/certs
    depends_on:
      - frontend
      - backend

volumes:
  pgdata:
```

### Render Deployment

```yaml
# render.yaml
services:
  - type: web
    name: scholarag-graph-backend
    env: python
    buildCommand: pip install -r requirements.txt
    startCommand: uvicorn main:app --host 0.0.0.0 --port $PORT
    envVars:
      - key: DATABASE_URL
        fromDatabase:
          name: scholarag-db
          property: connectionString
      - key: ANTHROPIC_API_KEY
        sync: false

  - type: web
    name: scholarag-graph-frontend
    env: node
    buildCommand: cd frontend && pnpm install && pnpm build
    startCommand: cd frontend && pnpm start
    envVars:
      - key: NEXT_PUBLIC_API_URL
        value: https://scholarag-graph-backend.onrender.com

databases:
  - name: scholarag-db
    plan: starter
    postgresMajorVersion: 16
```

---

## Performance Considerations

### Database Optimization

- **Connection pooling:** max 20 connections via asyncpg
- **Index strategy:** B-tree for lookups, IVFFlat for vectors
- **Query optimization:** Prepared statements, batch operations

### Caching Strategy

- **API responses:** TanStack Query client-side caching
- **Embeddings:** Pre-computed and stored in DB
- **Graph layout:** Computed once per filter change

### Scaling Considerations

| Load | Strategy |
|------|----------|
| 100 users | Single instance, 2GB RAM |
| 500 users | Horizontal scaling (2 backend replicas) |
| 1000+ users | Read replicas, Redis caching, CDN |

---

## Security

### API Security (Planned)

- JWT authentication
- Rate limiting per user
- Input validation via Pydantic
- SQL injection prevention (parameterized queries)

### Data Security

- Environment variables for secrets
- No credentials in version control
- Database encryption at rest (provider-managed)

---

## Next Steps

- [Entity Extraction Details](entity-extractor.md)
- [Gap Detection Algorithm](gap-detector.md)
- [Agent System Design](agents.md)
