# API Reference

ScholaRAG_Graph provides a RESTful API for programmatic access.

## Base URL

```
http://localhost:8000/api
```

Production deployments should use HTTPS.

## Authentication

Currently, the API does not require authentication. Future versions will support:

- API keys
- JWT tokens
- OAuth 2.0

## Response Format

All responses are JSON:

```json
{
  "success": true,
  "data": { ... },
  "error": null
}
```

Error responses:

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid project ID",
    "details": { ... }
  }
}
```

---

## Projects

### List Projects

```http
GET /api/projects
```

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "proj_abc123",
      "name": "AI in Education Review",
      "description": "Systematic review of AI chatbots",
      "paper_count": 150,
      "concept_count": 487,
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-16T14:20:00Z"
    }
  ]
}
```

### Create Project

```http
POST /api/projects
Content-Type: application/json

{
  "name": "My Review Project",
  "description": "Optional description"
}
```

### Get Project

```http
GET /api/projects/{project_id}
```

### Delete Project

```http
DELETE /api/projects/{project_id}
```

---

## Graph

### Get Nodes

```http
GET /api/graph/nodes?project_id={project_id}
```

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `project_id` | string | required | Project ID |
| `entity_type` | string | all | Filter: `Concept`, `Method`, `Finding` |
| `min_degree` | int | 0 | Minimum connections |
| `cluster` | int | all | Specific cluster ID |
| `limit` | int | 1000 | Max nodes returned |
| `offset` | int | 0 | Pagination offset |

**Response:**

```json
{
  "success": true,
  "data": {
    "nodes": [
      {
        "id": "node_123",
        "entity_type": "Concept",
        "name": "transfer learning",
        "definition": "ML technique where...",
        "properties": {
          "centrality_degree": 15,
          "centrality_betweenness": 0.34,
          "cluster": 2,
          "embedding": [0.23, -0.45, ...]
        },
        "source_papers": ["paper_1", "paper_2"]
      }
    ],
    "total": 487,
    "limit": 1000,
    "offset": 0
  }
}
```

### Get Edges

```http
GET /api/graph/edges?project_id={project_id}
```

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `project_id` | string | required | Project ID |
| `relationship_type` | string | all | Filter: `RELATED_TO`, `CO_OCCURS_WITH`, etc. |
| `min_weight` | float | 0 | Minimum edge weight |
| `source_id` | string | - | Filter by source node |
| `target_id` | string | - | Filter by target node |

**Response:**

```json
{
  "success": true,
  "data": {
    "edges": [
      {
        "id": "edge_456",
        "source_id": "node_123",
        "target_id": "node_789",
        "relationship_type": "RELATED_TO",
        "weight": 0.85,
        "properties": {
          "co_occurrence_count": 5,
          "semantic_similarity": 0.82
        }
      }
    ],
    "total": 1523
  }
}
```

### Get Full Graph

```http
GET /api/graph/full?project_id={project_id}
```

Returns nodes and edges in one response (for visualization).

---

## Entities

### Extract Entities from Paper

```http
POST /api/entities/extract
Content-Type: application/json

{
  "project_id": "proj_abc123",
  "paper": {
    "title": "BERT: Pre-training of Deep Bidirectional Transformers",
    "abstract": "We introduce a new language representation model...",
    "doi": "10.18653/v1/N19-1423"
  }
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "concepts": [
      {
        "name": "bidirectional transformer",
        "definition": "Transformer architecture that processes text in both directions",
        "confidence": 0.95
      }
    ],
    "methods": [
      {
        "name": "masked language modeling",
        "type": "computational",
        "confidence": 0.92
      }
    ],
    "findings": [
      {
        "statement": "BERT achieves state-of-the-art results on 11 NLP tasks",
        "confidence": 0.88
      }
    ]
  }
}
```

### Get Entity by ID

```http
GET /api/entities/{entity_id}
```

### Search Entities

```http
GET /api/entities/search?q={query}&project_id={project_id}
```

---

## Gaps

### List Gaps

```http
GET /api/gaps?project_id={project_id}
```

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `project_id` | string | required | Project ID |
| `min_strength` | float | 0.5 | Minimum gap strength |
| `limit` | int | 10 | Max gaps returned |

**Response:**

```json
{
  "success": true,
  "data": {
    "gaps": [
      {
        "id": "gap_001",
        "cluster_a": {
          "id": 1,
          "name": "Deep Learning",
          "concepts": ["transformer", "attention", "fine-tuning"]
        },
        "cluster_b": {
          "id": 3,
          "name": "Language Assessment",
          "concepts": ["proficiency testing", "error analysis"]
        },
        "gap_strength": 0.85,
        "semantic_distance": 0.67,
        "bridge_concepts": [
          {
            "id": "node_567",
            "name": "automated scoring",
            "betweenness": 0.42
          }
        ],
        "research_questions": [
          "How can transformer attention mechanisms improve automated essay scoring?"
        ]
      }
    ]
  }
}
```

### Get Gap Details

```http
GET /api/gaps/{gap_id}
```

### Regenerate Gap Analysis

```http
POST /api/gaps/regenerate?project_id={project_id}
```

Triggers re-clustering and gap detection.

---

## Import

### Start ScholaRAG Import

```http
POST /api/import/scholarag/start
Content-Type: application/json

{
  "folder_path": "/path/to/scholarag/project",
  "extract_concepts": true,
  "options": {
    "llm_provider": "anthropic",
    "llm_model": "claude-3-5-haiku-20241022"
  }
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "job_id": "import_xyz789",
    "status": "processing",
    "progress": {
      "current": 0,
      "total": 150,
      "stage": "extracting_entities"
    }
  }
}
```

### Check Import Status

```http
GET /api/import/status/{job_id}
```

### Import BibTeX

```http
POST /api/import/bibtex
Content-Type: multipart/form-data

file: [bibtex file]
project_id: proj_abc123
```

---

## Chat

### Send Message

```http
POST /api/chat/message
Content-Type: application/json

{
  "project_id": "proj_abc123",
  "message": "What are the most studied methods in this field?",
  "conversation_id": "conv_456"  // optional, for context
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "response": "Based on the knowledge graph, the most prevalent methods are...",
    "conversation_id": "conv_456",
    "sources": [
      {
        "entity_id": "node_123",
        "entity_name": "randomized controlled trial",
        "relevance": 0.92
      }
    ],
    "agent_trace": {
      "intent": "method_analysis",
      "concepts_queried": ["methods", "prevalence"],
      "reasoning_steps": [...]
    }
  }
}
```

### Get Conversation History

```http
GET /api/chat/history/{conversation_id}
```

---

## Export

### Export Graph as JSON

```http
GET /api/export/graph?project_id={project_id}&format=json
```

### Export as BibTeX

```http
GET /api/export/bibtex?project_id={project_id}
```

### Generate PRISMA Diagram

```http
POST /api/export/prisma
Content-Type: application/json

{
  "project_id": "proj_abc123",
  "format": "svg",  // or "pdf", "png"
  "statistics": {
    "identification": 500,
    "duplicates_removed": 50,
    "screened": 450,
    "excluded_screening": 300,
    "full_text": 150,
    "excluded_full_text": 25,
    "included": 125
  }
}
```

---

## Webhooks (Planned)

Future versions will support webhooks for:

- Import completion
- Gap detection completion
- New entity extraction

---

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| Entity extraction | 100/min |
| Chat messages | 60/min |
| Graph queries | 1000/min |
| Import | 5 concurrent |

---

## SDKs

### Python

```python
from scholarag_graph import Client

client = Client(base_url="http://localhost:8000")

# Create project
project = client.projects.create(name="My Review")

# Import papers
job = client.import_scholarag(
    project_id=project.id,
    folder_path="/path/to/scholarag"
)
job.wait()

# Get gaps
gaps = client.gaps.list(project_id=project.id)
for gap in gaps:
    print(f"Gap: {gap.cluster_a.name} ↔ {gap.cluster_b.name}")
    print(f"Questions: {gap.research_questions}")
```

### JavaScript/TypeScript

```typescript
import { ScholaRAGClient } from '@scholarag/graph-client';

const client = new ScholaRAGClient({
  baseUrl: 'http://localhost:8000'
});

// Get graph data
const { nodes, edges } = await client.graph.getFull('proj_abc123');

// Chat
const response = await client.chat.send({
  projectId: 'proj_abc123',
  message: 'What are the key findings?'
});
```

---

## OpenAPI Specification

Full OpenAPI 3.0 spec available at:

```
http://localhost:8000/openapi.json
```

Interactive docs (Swagger UI):

```
http://localhost:8000/docs
```

Alternative docs (ReDoc):

```
http://localhost:8000/redoc
```
