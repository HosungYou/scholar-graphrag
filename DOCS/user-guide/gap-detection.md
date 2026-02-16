# Gap Detection

ScholaRAG_Graph's signature feature: automatically discovering research opportunities.

## What is Gap Detection?

Gap detection identifies **structural holes** in the knowledge graph - areas where concept clusters have weak connections, suggesting under-explored research opportunities.

```
┌─────────────┐                    ┌─────────────┐
│  Cluster A  │                    │  Cluster B  │
│             │    ← GAP →         │             │
│ • NLP       │   (weak link)      │ • Education │
│ • BERT      │                    │ • Learning  │
│ • GPT       │                    │ • Assessment│
└─────────────┘                    └─────────────┘

Research Opportunity: How can NLP/transformers 
improve educational assessment?
```

## Algorithm Overview

### Step 1: Concept Clustering

Concepts are grouped using K-means on their embeddings:

```python
# Simplified algorithm
embeddings = [concept.embedding for concept in concepts]
n_clusters = determine_optimal_k(embeddings)  # Silhouette method
clusters = KMeans(n_clusters).fit_predict(embeddings)
```

**Optimal K selection:**

- Uses silhouette score
- Range: 3 to √(n_concepts)
- Balances cluster cohesion and separation

### Step 2: Inter-Cluster Connection Analysis

For each pair of clusters, calculate connection strength:

```python
def connection_strength(cluster_a, cluster_b, edges):
    cross_edges = count_edges_between(cluster_a, cluster_b)
    max_possible = len(cluster_a) * len(cluster_b)
    return cross_edges / max_possible
```

**Metrics:**

| Metric | Description |
|--------|-------------|
| `edge_count` | Number of direct connections |
| `normalized_strength` | Edges / max possible edges |
| `semantic_distance` | Average embedding distance |

### Step 3: Gap Identification

Gaps are cluster pairs with:

- Low normalized connection strength (< 0.1)
- High semantic distance (> 0.5)
- Sufficient size (both clusters > 3 concepts)

```python
gaps = []
for cluster_a, cluster_b in cluster_pairs:
    strength = connection_strength(cluster_a, cluster_b)
    distance = semantic_distance(cluster_a, cluster_b)
    
    if strength < 0.1 and distance > 0.5:
        gap = StructuralGap(
            cluster_a=cluster_a,
            cluster_b=cluster_b,
            gap_strength=1 - strength,
            semantic_distance=distance
        )
        gaps.append(gap)
```

### Step 4: Bridge Concept Identification

For each gap, find concepts that could bridge it:

```python
def find_bridge_concepts(gap):
    bridges = []
    for concept in all_concepts:
        dist_to_a = distance_to_cluster(concept, gap.cluster_a)
        dist_to_b = distance_to_cluster(concept, gap.cluster_b)
        
        # Good bridges are equidistant from both clusters
        if abs(dist_to_a - dist_to_b) < 0.2:
            bridges.append(concept)
    
    return sorted(bridges, key=lambda c: c.betweenness, reverse=True)
```

### Step 5: Research Question Generation

LLM generates questions based on gap context:

```python
prompt = f"""
Given these two research clusters:

Cluster A ({gap.cluster_a.name}):
- Key concepts: {gap.cluster_a.top_concepts}
- Common methods: {gap.cluster_a.methods}

Cluster B ({gap.cluster_b.name}):
- Key concepts: {gap.cluster_b.top_concepts}
- Common methods: {gap.cluster_b.methods}

Potential bridges: {gap.bridge_concepts}

Generate 3 research questions that could connect these clusters.
"""
```

---

## Gap Panel Interface

### Gap List

The right panel shows detected gaps ranked by strength:

```
┌─────────────────────────────────────────┐
│ 🔍 Research Gaps (5 detected)           │
├─────────────────────────────────────────┤
│                                         │
│ Gap #1 ████████████░░ 0.85             │
│ "Deep Learning" ↔ "Language Assessment" │
│ Bridge: Automated Scoring               │
│                                         │
│ Gap #2 ██████████░░░░ 0.72             │
│ "NLP Models" ↔ "Classroom Practice"     │
│ Bridge: Teacher Support Tools           │
│                                         │
│ Gap #3 ████████░░░░░░ 0.61             │
│ ...                                     │
└─────────────────────────────────────────┘
```

### Gap Details

Click a gap to see:

```
┌─────────────────────────────────────────┐
│ Gap: Deep Learning ↔ Language Assessment│
├─────────────────────────────────────────┤
│ Strength: 0.85 (high opportunity)       │
│ Semantic Distance: 0.67                 │
│ Edge Count: 2 / 45 possible             │
│                                         │
│ 📊 Cluster A: Deep Learning             │
│    • transformer (12 papers)            │
│    • attention mechanism (8 papers)     │
│    • fine-tuning (6 papers)             │
│                                         │
│ 📊 Cluster B: Language Assessment       │
│    • proficiency testing (9 papers)     │
│    • error analysis (7 papers)          │
│    • feedback generation (5 papers)     │
│                                         │
│ 🌉 Bridge Concepts                      │
│    • automated scoring                  │
│    • neural scoring models              │
│                                         │
│ 💡 AI Research Questions                │
│    1. How can transformer attention     │
│       mechanisms improve automated      │
│       essay scoring accuracy?           │
│    2. What role can fine-tuning play    │
│       in adapting NLP models for        │
│       language proficiency assessment?  │
│    3. How might error analysis benefit  │
│       from attention visualization      │
│       techniques?                       │
└─────────────────────────────────────────┘
```

### Graph Highlighting

When a gap is selected:

- Cluster A nodes: Highlighted with color A
- Cluster B nodes: Highlighted with color B
- Bridge concepts: Gold dashed border
- Cross-cluster edges: Emphasized
- Other nodes: Dimmed

---

## Interpreting Gaps

### Gap Strength

| Strength | Interpretation | Action |
|----------|----------------|--------|
| 0.9+ | Very strong gap | High-priority research opportunity |
| 0.7-0.9 | Strong gap | Good opportunity, some prior work |
| 0.5-0.7 | Moderate gap | Emerging connection, explore further |
| < 0.5 | Weak gap | May be well-studied already |

### Semantic Distance

| Distance | Interpretation |
|----------|----------------|
| > 0.7 | Very different domains |
| 0.5-0.7 | Related but distinct |
| 0.3-0.5 | Closely related |
| < 0.3 | Very similar (may be same topic) |

### Bridge Concepts

Good bridges have:

- High betweenness centrality
- Connections to both clusters
- Clear semantic relationship to gap

---

## Use Cases

### 1. Finding Novel Research Directions

**Scenario:** PhD student looking for dissertation topic

**Process:**

1. Import papers from your literature review
2. Check gap panel for high-strength gaps
3. Evaluate bridge concepts - which align with your skills?
4. Use AI questions as starting points

**Example output:**

```
Gap: "Reinforcement Learning" ↔ "Second Language Acquisition"
Bridge: "Adaptive Learning Systems"
Question: "How can RL-based adaptive tutoring systems 
          optimize vocabulary learning sequences?"
```

### 2. Identifying Review Paper Topics

**Scenario:** Senior researcher planning review article

**Process:**

1. Import broad literature from the field
2. Look for moderate-strength gaps (0.5-0.7)
3. These represent areas needing synthesis
4. Bridge concepts suggest review themes

### 3. Validating Research Novelty

**Scenario:** Researcher with idea, checking if novel

**Process:**

1. Import relevant literature
2. Check if your topic appears as a gap
3. If yes → novel contribution
4. If no → need different angle

---

## Advanced Configuration

### Clustering Parameters

```yaml
# In project config.yaml
gap_detection:
  clustering:
    algorithm: "kmeans"  # or "hierarchical", "dbscan"
    n_clusters: "auto"   # or specific number
    min_cluster_size: 3
    
  thresholds:
    min_gap_strength: 0.5
    min_semantic_distance: 0.3
    max_gaps_displayed: 10
    
  bridge_detection:
    max_bridges_per_gap: 5
    min_betweenness: 0.1
```

### Custom Gap Filters

In the UI, filter gaps by:

- Minimum strength
- Specific clusters
- Concept keywords

---

## Comparison with InfraNodus

| Feature | ScholaRAG_Graph | InfraNodus |
|---------|-----------------|------------|
| Entity level | Academic concepts | Keywords |
| Clustering | Embedding-based | Co-occurrence |
| Bridge detection | Betweenness + semantic | Betweenness only |
| Question generation | Context-aware LLM | Template-based |
| Domain | Academic literature | General text |
| Data limit | Unlimited | 3MB max |

---

## Limitations

### When Gap Detection May Fail

1. **Too few papers** (< 30)
   - Not enough concepts for meaningful clustering
   
2. **Narrow topic**
   - All concepts in one cluster = no gaps
   
3. **Unrelated papers**
   - Random papers don't form coherent clusters

### False Positives

Gaps may not be true research opportunities if:

- Clusters are actually unrelated fields
- Gap is well-studied but missing from your corpus
- Connection exists but through different terminology

**Mitigation:** Always validate gaps with domain expertise.

---

## Next Steps

- [Chat Interface](chat.md) - Explore gaps conversationally
- [API: Gap Endpoints](../api/gaps.md) - Programmatic access
- [Architecture: Gap Detector](../architecture/gap-detector.md) - Technical details
