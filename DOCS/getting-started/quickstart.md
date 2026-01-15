# Quick Start Guide

Get your first knowledge graph running in 5 minutes.

## Prerequisites

- ScholaRAG_Graph installed ([Installation Guide](installation.md))
- API key configured (Anthropic recommended)

## Step 1: Create a Project

1. Open [http://localhost:3000](http://localhost:3000)
2. Click **"New Project"**
3. Enter project details:
   - **Name**: "AI in Education Review"
   - **Description**: "Systematic review of AI chatbots in language learning"

![Create Project](../assets/create-project.png)

## Step 2: Import Papers

### Option A: Import from ScholaRAG

If you have a [ScholaRAG](https://github.com/HosungYou/ScholaRAG) project:

1. Click **"Import"** → **"From ScholaRAG"**
2. Select your ScholaRAG project folder
3. Click **"Start Import"**

The importer will:

- ✅ Load paper metadata
- ✅ Extract concepts, methods, and findings using AI
- ✅ Build the knowledge graph
- ✅ Calculate centrality metrics
- ✅ Detect structural gaps

### Option B: Upload BibTeX

1. Click **"Import"** → **"BibTeX"**
2. Upload your `.bib` file
3. Click **"Process"**

### Option C: Add Manually

1. Click **"Add Paper"**
2. Enter DOI or paste paper details
3. Click **"Extract Entities"**

## Step 3: Explore the Graph

Once import completes, you'll see the knowledge graph:

![Knowledge Graph](../assets/knowledge-graph.png)

### Navigation

| Action | How |
|--------|-----|
| **Pan** | Click and drag background |
| **Zoom** | Mouse wheel or pinch |
| **Select node** | Click on node |
| **Multi-select** | Shift + click |
| **View details** | Click node → side panel |

### Node Types

| Shape | Color | Type |
|-------|-------|------|
| Circle (large) | Blue | Concept |
| Circle (medium) | Green | Method |
| Circle (small) | Purple | Finding |
| Dashed border | Gold | Gap Bridge |

### Node Size

Node size indicates **degree centrality** (connection count):

- Larger nodes = more connections = more central concepts

### Node Opacity

Opacity indicates **betweenness centrality**:

- More opaque = more "bridge" role = connects different clusters

## Step 4: Discover Gaps

Click the **"Gaps"** tab in the right panel to see:

### Structural Gaps

Research areas with weak connections between concept clusters:

```
Gap #1: "Transfer Learning" ↔ "Language Assessment"
Strength: 0.85 (high opportunity)
Bridge concepts: ["Automated Scoring", "Adaptive Testing"]
```

### AI-Generated Research Questions

Based on detected gaps:

> "How might transfer learning techniques improve automated 
> language assessment systems for non-native speakers?"

Click a gap to highlight related nodes in the graph.

## Step 5: Filter and Focus

### By Entity Type

Toggle visibility:

- ☑️ Concepts
- ☑️ Methods
- ☐ Findings (hide to simplify)

### By Cluster

Click a cluster color in the legend to isolate it.

### By Centrality

Use the slider to show only high-centrality nodes:

```
Minimum Degree: 3+ connections
```

## Step 6: Chat with Your Literature

Click **"Chat"** to open the AI assistant:

```
You: What methods are most commonly used to study 
     AI chatbot effectiveness?

AI: Based on the knowledge graph, the most prevalent 
    methods are:
    
    1. **Randomized Controlled Trials (RCT)** 
       - 23 papers, high centrality
       - Connected to: learning outcomes, speaking skills
    
    2. **Pre-post Quasi-experimental Design**
       - 18 papers
       - Connected to: vocabulary acquisition, motivation
    
    3. **Mixed Methods**
       - 12 papers
       - Connected to: user experience, engagement
    
    The gap analysis suggests RCTs are underutilized 
    for studying long-term retention effects.
```

## Step 7: Export Results

### Export Graph

- **PNG/SVG**: Click "Export" → "Image"
- **JSON**: Click "Export" → "Graph Data"

### Export PRISMA Diagram

For systematic reviews:

1. Click **"PRISMA"** tab
2. Review flow statistics
3. Click **"Generate Diagram"**
4. Download as SVG/PDF

### Export Bibliography

- **BibTeX**: Click "Export" → "BibTeX"
- **RIS**: Click "Export" → "RIS"

---

## Example Workflow

### Systematic Literature Review

```
1. Import → ScholaRAG project with 150 screened papers
2. Wait → AI extracts ~500 concepts, ~100 methods, ~200 findings
3. Explore → Identify 3 main concept clusters
4. Gaps → Find 5 structural gaps with research questions
5. Chat → Deep dive into specific findings
6. Export → PRISMA diagram + concept map for paper
```

### Exploratory Literature Mapping

```
1. Import → BibTeX from Zotero (50 papers)
2. Explore → See how concepts connect
3. Filter → Focus on "deep learning" cluster
4. Chat → "What are the controversies in this field?"
5. Export → Visualization for presentation
```

---

## Next Steps

- [Core Concepts](../user-guide/concepts.md) - Understand the data model
- [Gap Detection](../user-guide/gap-detection.md) - Master gap analysis
- [API Reference](../api/overview.md) - Automate with the API

## Troubleshooting

### Import is slow

Entity extraction uses LLM calls. For 100 papers:

- Claude Haiku: ~5 minutes
- GPT-4: ~15 minutes

### No gaps detected

Gaps require sufficient concept density:

- Minimum: 50+ unique concepts
- Recommended: 100+ concepts from 30+ papers

### Graph is cluttered

Use filters:

1. Hide Findings (show only Concepts/Methods)
2. Increase minimum degree to 3+
3. Focus on single cluster
