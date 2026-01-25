# View Modes Quick Reference

**Last Updated**: 2026-01-25
**Implementation Status**: 100% Complete ✅

## At a Glance

Three complementary visualization modes for knowledge graph exploration:

```
┌──────────────┬──────────────┬──────────────┐
│   3D Mode    │  Topic Mode  │  Gaps Mode   │
├──────────────┼──────────────┼──────────────┤
│ Full network │  Clusters    │ Research    │
│ structure    │  relationships│ opportunities│
│              │              │              │
│ Three.js     │ D3.js        │ Three.js +  │
│ Force Layout │ Force Layout │ AI (Groq)   │
│              │              │              │
│ 50-500 nodes │ 10-100 clust │ 20-1000     │
│              │ 30-500 nodes │ nodes       │
└──────────────┴──────────────┴──────────────┘

User Question:
  "What does this knowledge domain look like?"
         ↓
  [3D Mode] → Network topology, density, structure

  "What are the main research themes?"
         ↓
  [Topic Mode] → Clusters, theme relationships, trends

  "Where should I research next?"
         ↓
  [Gaps Mode] → Undiscovered areas, AI suggestions, opportunities
```

## Component Files

| Mode | Component | File | Tech Stack |
|------|-----------|------|-----------|
| 3D | Graph3D | `frontend/components/graph/Graph3D.tsx` | Three.js + react-force-graph-3d |
| Topic | TopicViewMode | `frontend/components/graph/TopicViewMode.tsx` | D3.js Force |
| Gaps | GapsViewMode | `frontend/components/graph/GapsViewMode.tsx` | Three.js + Groq LLM |
| Root | KnowledgeGraph3D | `frontend/components/graph/KnowledgeGraph3D.tsx` | React + Zustand |

## 3D Mode (Graph3D)

**Component**: `KnowledgeGraph3D.tsx` (line 287-305)

```typescript
{viewMode === '3d' && (
  <Graph3D
    nodes={displayData.nodes}
    edges={displayData.edges}
    clusters={clusters}
    centralityMetrics={centralityMetrics}
    highlightedNodes={highlightedNodes}
    highlightedEdges={highlightedEdges}
    selectedGap={selectedGap}
    onNodeClick={handleNodeClick}
    onBackgroundClick={handleBackgroundClick}
    onEdgeClick={handleEdgeClick}
    showParticles={view3D.showParticles}
    particleSpeed={view3D.particleSpeed}
    bloomEnabled={view3D.bloom.enabled}
    bloomIntensity={view3D.bloom.intensity}
    glowSize={view3D.bloom.glowSize}
  />
)}
```

**Key Features**:
- ✅ Force-directed 3D layout
- ✅ Camera controls (mouse drag, scroll zoom)
- ✅ Node sizing by centrality
- ✅ Edge weighting visualization
- ✅ Particle effects (toggle with Zap icon)
- ✅ Bloom/glow effect (toggle with Sun icon)
- ✅ Level of Detail (LOD) optimization
- ✅ Node/edge highlighting

**Perfect For**:
- Understanding overall network structure
- Finding highly connected hubs
- Visual exploration of semantic space
- Cluster identification at a glance

**Controls**:
- **Mouse Drag**: Orbit camera
- **Scroll**: Zoom in/out
- **Click Node**: Show details
- **Particle Toggle**: Zap button (top right)
- **Bloom Toggle**: Sun button (top right)
- **Reset Camera**: Rotate icon (top right)

---

## Topic Mode (TopicViewMode)

**Component**: `KnowledgeGraph3D.tsx` (line 307-323)

```typescript
{viewMode === 'topic' && (
  <TopicViewMode
    clusters={clusters}
    gaps={gaps}
    edges={displayData.edges}
    onClusterClick={handleFocusCluster}
    onClusterHover={(clusterId) => {
      if (clusterId !== null) {
        const cluster = clusters.find(c => c.cluster_id === clusterId);
        if (cluster) {
          setHighlightedNodes(cluster.concepts);
        }
      } else {
        clearHighlights();
      }
    }}
  />
)}
```

**Key Features**:
- ✅ D3.js force-based cluster layout
- ✅ Main topic identification
- ✅ Cluster relationship visualization
- ✅ InfraNodus-style bridge detection
- ✅ Cluster statistics panel
- ✅ Research direction indicators
- ✅ Hover-based highlighting

**Perfect For**:
- Identifying main research themes
- Understanding theme relationships
- Spotting dominant vs. peripheral topics
- Finding natural research divisions

**Interactions**:
- **Hover Cluster**: Highlight all concepts in that cluster
- **Click Cluster**: Focus camera on cluster in 3D space
- **View Cluster Details**: See statistics (paper count, keywords)
- **Check Gap Bridges**: See which topics connect

---

## Gaps Mode (GapsViewMode)

**Component**: `KnowledgeGraph3D.tsx` (line 325-342)

```typescript
{viewMode === 'gaps' && (
  <GapsViewMode
    ref={graph3DRef}
    nodes={displayData.nodes}
    edges={displayData.edges}
    clusters={clusters}
    centralityMetrics={centralityMetrics}
    gaps={gaps}
    selectedGap={selectedGap}
    onGapSelect={setSelectedGap}
    onNodeClick={handleNodeClick}
    onBackgroundClick={handleBackgroundClick}
    onEdgeClick={handleEdgeClick}
    projectId={projectId}
    bloomEnabled={view3D.bloom.enabled}
    bloomIntensity={view3D.bloom.intensity}
    glowSize={view3D.bloom.glowSize}
  />
)}
```

**Key Features**:
- ✅ 3D visualization with actual edges
- ✅ **Ghost edges** (dotted) for potential relationships
- ✅ **Structural gap detection** (cluster pairs with few connections)
- ✅ **Bridge candidates** highlighted
- ✅ **AI-generated hypotheses** using Groq llama-3.3-70b
- ✅ Gap statistics (size, impact, related papers)
- ✅ Gap query interface

**Perfect For**:
- Discovering undiscovered research intersections
- Finding novel research directions
- Academic gap analysis for literature reviews
- Interdisciplinary opportunity identification

**The AI Hypothesis**:
```
AI Pipeline (Using Groq):
1. Identify two clusters with few connections
2. Find bridge candidate nodes
3. Prompt Groq:
   "How could [Cluster A concepts] and [Cluster B concepts]
    be connected through [bridge candidates]?"
4. Groq generates creative hypothesis
5. Display with confidence score

Example Output:
"Cluster A (Machine Learning) and Cluster B (Education)
 could be connected through 'Adaptive Learning Systems'
 research" [Confidence: 0.87]
```

**Interactions**:
- **Select Gap**: Click gap in list → highlights in 3D
- **View Gap Details**: Statistics, bridge nodes, AI hypothesis
- **Explore Gap**: 3D rotate/zoom to see gap structure
- **Generate New Hypotheses**: Use GapQueryPanel to refine AI search

---

## View Mode Switching

**Location**: Top-right corner control panel

```typescript
// UI-012: View Mode Toggle (KnowledgeGraph3D.tsx lines 481-524)

<div className="flex items-center gap-1">
  {/* 3D Mode Button */}
  <button onClick={() => setViewMode('3d')} className={...}>
    <Box className="w-4 h-4" />
    <span>3D</span>
  </button>

  {/* Topic Mode Button */}
  <button onClick={() => setViewMode('topic')} className={...}>
    <Grid2X2 className="w-4 h-4" />
    <span>Topics</span>
  </button>

  {/* Gaps Mode Button */}
  <button onClick={() => setViewMode('gaps')} className={...}>
    <Sparkles className="w-4 h-4" />
    <span>Gaps</span>
  </button>
</div>
```

**Switching Behavior**:
- Mode change is instant (no data reload)
- Node/edge highlighting is preserved
- Selected node details panel closes on mode switch
- Gaps Mode has its own gap list sidebar (hidden in other modes)

---

## Side Panels & Controls

### Always Available

| Panel | Purpose | Icon | Toggle |
|-------|---------|------|--------|
| **GapPanel** | Gap analysis | Sparkles ✨ | Top-right button |
| **CentralityPanel** | Node slicing/filtering | Scissors ✂️ | Top-right button |
| **ClusterPanel** | Cluster statistics | Layers 📚 | Top-right button |
| **GraphLegend** | Color/size legend | Info ℹ️ | Top-right button |
| **NodeDetails** | Selected node info | (Auto-shown on click) | Click background to close |
| **InsightHUD** | Graph statistics | Bar Chart 📊 | Top-right button |
| **MainTopicsPanel** | Top 5-10 topics | Pie Chart 🥧 | Top-right button |

### Mode-Specific

| Panel | Mode | Purpose |
|-------|------|---------|
| **GapsViewMode sidebar** | Gaps | List of detected gaps with AI hypotheses |
| **GapQueryPanel** | Gaps | Refine gap search with custom queries |
| **EdgeContextModal** | All | Relationship evidence (when edge clicked) |

---

## Data Flow & State Management

### Store Integration

```typescript
// frontend/hooks/useGraphStore.ts
const graphStore = useGraphStore();

// Global state for all modes
graphStore.graphData          // Full node/edge data
graphStore.clusters           // Cluster groupings
graphStore.gaps               // Structural gaps
graphStore.centralityMetrics  // Node importance
graphStore.highlightedNodes   // Current highlights
graphStore.viewMode           // '3d' | 'topic' | 'gaps'
```

### Store Mutations

```typescript
// Switching view modes
graphStore.setViewMode('gaps');

// Selecting a gap
graphStore.setSelectedGap(gap);

// Highlighting nodes/edges
graphStore.setHighlightedNodes(['node1', 'node2']);
graphStore.setHighlightedEdges(['edge1', 'edge2']);

// Clearing all
graphStore.clearHighlights();
```

---

## Performance Tips

### For Large Graphs (500+ nodes)

**3D Mode**:
- ✅ Auto-enables LOD (Level of Detail)
- ✅ Hides distant nodes automatically
- ✅ Reduces particle effects at zoom level < 0.5
- ⚠️ May need WebGL acceleration
- Recommended: Disable particles for <500 FPS

**Topic Mode**:
- ✅ Most efficient (D3.js culling)
- ✅ Handles 100+ clusters easily
- ✅ Better for slower devices
- Recommended: Use for overview on mobile

**Gaps Mode**:
- ✅ Same as 3D + ghost edges
- ⚠️ AI hypothesis generation takes 1-3 seconds
- ⚠️ Groq rate limits at 10 req/min
- Recommended: Cache hypotheses for re-used gaps

---

## Common Tasks

### "I want to explore the overall network"
→ Start in **3D Mode**
- Rotate to understand structure
- Toggle particles to see energy
- Click interesting nodes

### "I want to understand research themes"
→ Switch to **Topic Mode**
- See main clusters
- Identify dominant themes
- Check cluster relationships

### "I want to find new research opportunities"
→ Switch to **Gaps Mode**
- Review AI suggestions
- Explore bridge nodes
- Refine with GapQueryPanel

### "I want to focus on a specific area"
→ Use **CentralityPanel**
- Slice by minimum degree/betweenness
- Filter nodes
- Works in all modes

### "I want to check a relationship"
→ Click edge in **any mode**
- EdgeContextModal shows evidence
- Lists supporting papers
- Shows relationship strength

---

## Troubleshooting

### "Graph is blank in 3D Mode"
- Check if nodes data is loaded: `graphStore.graphData.nodes.length`
- Try resetting camera: Rotate icon (top-right)
- Check browser console for WebGL errors
- Switch to Topic Mode to verify data

### "Gaps Mode doesn't show AI hypotheses"
- Check `GROQ_API_KEY` environment variable
- Verify Groq rate limit: `/health` endpoint
- Check browser console for API errors
- Fallback: Groq → Anthropic → (keyword-based)

### "3D Mode is slow/laggy"
- Toggle particles off (Zap icon)
- Toggle bloom off (Sun icon)
- Use Topic Mode instead (more efficient)
- Reduce graph size with CentralityPanel

### "Switching modes causes lag"
- Graphs are usually pre-rendered
- First switch might be slower
- Check CPU/GPU usage in DevTools
- Clear browser cache if persists

---

## Integration Points

### Adding New Features

**To add visualization to all 3 modes**:
```typescript
// 1. Update GraphEntity type
interface GraphEntity {
  // ... existing fields
  newField?: string;
}

// 2. Add to Graph3D.tsx
// 3. Add to TopicViewMode.tsx
// 4. Add to GapsViewMode.tsx

// 5. Update KnowledgeGraph3D.tsx if mode-specific
```

**To add a new side panel**:
```typescript
// 1. Create component in frontend/components/graph/NewPanel.tsx
// 2. Import in KnowledgeGraph3D.tsx
// 3. Add toggle state: const [showNewPanel, setShowNewPanel] = useState(false);
// 4. Add control button in top-right panel
// 5. Render conditionally: {showNewPanel && <NewPanel />}
```

---

## Related Documentation

- **Architecture**: `DOCS/architecture/graph-visualization.md`
- **Full Component Details**: Each TSX file header comments
- **LLM (for Gaps Mode)**: `DOCS/development/LLM_CONFIGURATION.md`
- **Backend APIs**: `DOCS/api/overview.md`
- **Sessions**: Check `DOCS/.meta/sessions/2026-01-19_infranodus-visualization.md`

---

## API Endpoints for View Modes

### 3D Mode
- `GET /api/graph/{project_id}` - Full graph data
- `GET /api/graph/centrality/{project_id}` - Node importance metrics
- `GET /api/graph/relationships/{id}/evidence` - Edge evidence

### Topic Mode
- `GET /api/graph/{project_id}` - Full graph data
- `GET /api/graph/clusters/{project_id}` - Cluster groupings
- `GET /api/graph/temporal/{project_id}` - Temporal statistics

### Gaps Mode
- `GET /api/graph/gaps/{project_id}` - Structural gaps
- `POST /api/graph/gaps/{id}/generate-bridge` - Groq AI hypothesis
- `GET /api/graph/diversity/{project_id}` - Diversity metrics

---

**Version**: 3.1.0
**Last Updated**: 2026-01-25
**Status**: Complete & Verified ✅
