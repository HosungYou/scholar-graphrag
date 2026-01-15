# Core Concepts

Understanding the ScholaRAG_Graph data model and terminology.

## Philosophy: Concept-Centric Design

Traditional literature review tools focus on **papers**:

```
Paper → cites → Paper → cites → Paper
```

ScholaRAG_Graph focuses on **concepts**:

```
Concept ←→ relates to ←→ Concept
    ↑                        ↑
  Method                  Finding
    ↑                        ↑
  Paper                   Paper
```

### Why Concept-Centric?

| Paper-Centric | Concept-Centric |
|---------------|-----------------|
| "What papers cite this?" | "What concepts connect these ideas?" |
| Citation networks | Knowledge networks |
| Bibliometric analysis | Semantic analysis |
| Finding more papers | Understanding the field |

Papers become **metadata** - they're the source of concepts, not the focus.

---

## Entity Types

### Concept (Primary Node)

The fundamental unit of knowledge.

```json
{
  "type": "Concept",
  "name": "transfer learning",
  "definition": "Machine learning technique where a model trained on one task is reused as starting point for another task",
  "domain": "machine_learning",
  "centrality_degree": 15,
  "centrality_betweenness": 0.34,
  "source_papers": ["paper_123", "paper_456", "paper_789"]
}
```

**Extraction criteria:**

- Theoretical constructs
- Key terminology
- Domain-specific vocabulary
- Abstract ideas that connect papers

**Visual representation:**

- Shape: Circle
- Size: Based on degree centrality
- Color: Based on cluster assignment
- Opacity: Based on betweenness centrality

### Method (Secondary Node)

Research methodologies and techniques.

```json
{
  "type": "Method",
  "name": "randomized controlled trial",
  "method_type": "quantitative",
  "papers_count": 23,
  "applies_to": ["learning_outcomes", "speaking_skills"]
}
```

**Types:**

- `quantitative` - Statistical methods, experiments
- `qualitative` - Interviews, observations
- `mixed` - Combined approaches
- `computational` - Algorithms, simulations

**Visual representation:**

- Shape: Circle (smaller than Concepts)
- Color: Green shades

### Finding (Secondary Node)

Research results and conclusions.

```json
{
  "type": "Finding",
  "statement": "AI chatbots improved speaking fluency by 23%",
  "effect_size": 0.45,
  "significance": "p < 0.01",
  "supports_concepts": ["ai_chatbot", "speaking_fluency"],
  "contradicts_concepts": []
}
```

**Visual representation:**

- Shape: Circle (smallest)
- Color: Purple shades

---

## Relationship Types

### Concept ↔ Concept

| Relationship | Description | Detection |
|--------------|-------------|-----------|
| `RELATED_TO` | Semantic similarity | Embedding cosine > 0.7 |
| `CO_OCCURS_WITH` | Appear in same paper | Co-occurrence count |
| `PREREQUISITE_OF` | Learning order | LLM inference |
| `BRIDGES_GAP` | AI-suggested connection | Gap detection algorithm |

### Method → Concept

| Relationship | Description |
|--------------|-------------|
| `APPLIES_TO` | Method studies this concept |

### Finding → Concept

| Relationship | Description |
|--------------|-------------|
| `SUPPORTS` | Finding provides evidence for concept |
| `CONTRADICTS` | Finding challenges concept |

---

## Centrality Metrics

### Degree Centrality

**What it measures:** Number of connections

**Interpretation:**

- High degree = Central concept, well-studied
- Low degree = Peripheral concept, specialized

**Visual encoding:** Node size

### Betweenness Centrality

**What it measures:** Bridge role between clusters

**Interpretation:**

- High betweenness = Connects different research areas
- Low betweenness = Within single cluster

**Visual encoding:** Node opacity

### Cluster Assignment

Concepts are grouped using K-means clustering on embeddings.

**Visual encoding:** Node color

---

## The Knowledge Graph

### Structure

```
┌─────────────────────────────────────────────────────┐
│                 Knowledge Graph                      │
├─────────────────────────────────────────────────────┤
│                                                      │
│   [Concept]──RELATED_TO──[Concept]                  │
│       │                       │                      │
│    APPLIES_TO              SUPPORTS                  │
│       │                       │                      │
│   [Method]                [Finding]                  │
│                                                      │
│   ─ ─ ─ ─ BRIDGES_GAP ─ ─ ─ ─  (AI suggested)       │
│                                                      │
└─────────────────────────────────────────────────────┘
```

### Metadata Layer

Papers and authors exist as metadata, not nodes:

```json
{
  "concept": "transfer learning",
  "metadata": {
    "source_papers": [
      {
        "id": "paper_123",
        "title": "BERT: Pre-training of Deep Bidirectional Transformers",
        "authors": ["Devlin, J.", "Chang, M."],
        "year": 2019,
        "doi": "10.18653/v1/N19-1423"
      }
    ]
  }
}
```

Click any concept to see its source papers in the detail panel.

---

## Projects

### Project Structure

```
Project
├── config.yaml          # Project settings
├── papers/              # Source papers
├── entities/            # Extracted entities
├── relationships/       # Graph edges
├── gaps/                # Detected gaps
└── exports/             # Generated outputs
```

### Project Settings

```yaml
name: "AI in Education Review"
description: "Systematic review of AI chatbots"
created_at: "2024-01-15T10:30:00Z"

llm_settings:
  provider: "anthropic"
  model: "claude-3-5-haiku-20241022"
  
extraction_settings:
  min_confidence: 0.7
  max_concepts_per_paper: 15
  
visualization_settings:
  layout: "force-directed"
  cluster_count: "auto"
```

---

## Processing Pipeline

### 1. Entity Extraction

```
Paper (title + abstract)
        │
        ▼
   LLM Extraction
        │
        ▼
┌───────┴───────┬───────────┐
│               │           │
▼               ▼           ▼
Concepts    Methods     Findings
(max 10)    (max 5)     (max 5)
```

### 2. Entity Disambiguation

Merge similar entities:

```
"machine learning" + "ML" + "Machine Learning"
                    │
                    ▼
           "machine_learning"
```

### 3. Embedding Generation

```
"transfer learning" → [0.23, -0.45, 0.12, ...]
                      (1536 dimensions)
```

### 4. Relationship Building

```
For each concept pair:
  - Calculate embedding similarity
  - Count co-occurrences
  - If similarity > 0.7: create RELATED_TO edge
  - If co-occurrence > 0: create CO_OCCURS_WITH edge
```

### 5. Centrality Calculation

```python
degree[node] = len(edges[node])
betweenness[node] = sum(shortest_paths_through(node)) / total_paths
```

### 6. Clustering

```python
kmeans = KMeans(n_clusters=optimal_k)
clusters = kmeans.fit_predict(embeddings)
```

### 7. Gap Detection

```python
for cluster_a, cluster_b in cluster_pairs:
    connection_strength = count_edges_between(cluster_a, cluster_b)
    if connection_strength < threshold:
        gap = StructuralGap(cluster_a, cluster_b)
        gap.bridge_concepts = find_potential_bridges()
        gaps.append(gap)
```

---

## Next Steps

- [Gap Detection](gap-detection.md) - Understanding structural gaps
- [API Reference](../api/overview.md) - Programmatic access
- [Architecture](../architecture/overview.md) - Technical deep dive
