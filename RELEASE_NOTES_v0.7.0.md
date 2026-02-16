# Release Notes - v0.7.0 Advanced Graph Interaction & Build Stability

**Release Date**: 2026-02-04
**Type**: Feature / Bug Fix / Infrastructure
**Commits**: `ca81941`, `5d3ef86`, `3f301ca`, `4f15c2f`, `8889f0d`

---

## Overview

This release introduces **three major graph interaction features** (Node Pinning, Adaptive Labeling, Graph-to-Prompt) and resolves **critical build issues** that were blocking Vercel deployments since v0.5.0.

---

## New Features

### 1. Node Pinning with Multi-Select (FUNC-008)

**Commit**: `ca81941`

Pin important nodes in place to maintain mental map during exploration.

| Feature | Description |
|---------|-------------|
| **Single Pin** | Click node → Pin in current position |
| **Multi-Select** | `Shift + Click` to select multiple nodes |
| **Bulk Pin** | Pin all selected nodes at once |
| **Visual Indicator** | 📌 icon on pinned nodes |
| **Unpin** | Click pinned node again to release |

**Implementation**:
```typescript
// frontend/components/graph/Graph3D.tsx
const [pinnedNodes, setPinnedNodes] = useState<Set<string>>(new Set());
const [selectedNodes, setSelectedNodes] = useState<Set<string>>(new Set());

// Shift+click for multi-select
const handleNodeClick = useCallback((node, event) => {
  if (event.shiftKey) {
    setSelectedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(node.id)) newSet.delete(node.id);
      else newSet.add(node.id);
      return newSet;
    });
  } else {
    // Pin/unpin single node
    setPinnedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(node.id)) {
        newSet.delete(node.id);
        node.fx = node.fy = node.fz = undefined; // Release
      } else {
        newSet.add(node.id);
        node.fx = node.x; node.fy = node.y; node.fz = node.z; // Fix position
      }
      return newSet;
    });
  }
}, []);
```

---

### 2. Adaptive Labeling (FUNC-009)

**Commit**: `5d3ef86`

Zoom-responsive labels that show/hide based on current zoom level.

| Zoom Level | Label Visibility |
|------------|------------------|
| < 0.5x | Hub nodes only (top 10% by degree) |
| 0.5x - 1.5x | Important nodes (top 30%) |
| 1.5x - 3x | Most nodes visible |
| > 3x | All labels visible |

**Implementation**:
```typescript
// Calculate node importance
const nodeImportance = useMemo(() => {
  const degrees = new Map<string, number>();
  graphData.links.forEach(link => {
    degrees.set(link.source, (degrees.get(link.source) || 0) + 1);
    degrees.set(link.target, (degrees.get(link.target) || 0) + 1);
  });
  return degrees;
}, [graphData]);

// Zoom-responsive visibility
const shouldShowLabel = useCallback((nodeId: string, zoom: number) => {
  const importance = nodeImportance.get(nodeId) || 0;
  const threshold = zoom < 0.5 ? 0.9 : zoom < 1.5 ? 0.7 : zoom < 3 ? 0.3 : 0;
  return importance >= threshold * maxImportance;
}, [nodeImportance]);
```

---

### 3. Graph-to-Prompt (FUNC-010)

**Commit**: `3f301ca`

Export current graph context as structured prompt for external AI tools.

**Export Format**:
```markdown
## Research Context Export

### Selected Concepts (5 nodes)
- Machine Learning (CONCEPT, 23 connections)
- Neural Networks (METHOD, 18 connections)
- Transfer Learning (CONCEPT, 15 connections)
...

### Key Relationships (12 edges)
- Machine Learning --USES--> Neural Networks
- Transfer Learning --RELATED_TO--> Machine Learning
...

### Research Statistics
- Total Nodes: 641
- Total Edges: 8295
- Diversity: Focused (specialized research area)

### Suggested Questions
1. How do these concepts relate to your research question?
2. What gaps exist between these areas?
```

**UI**:
- Export button in toolbar
- Copy to clipboard functionality
- Markdown format for easy pasting

---

## Bug Fixes

### 1. 'focused' Diversity Rating Type Error (BUG-041)

**Commit**: `4f15c2f`

**Problem**:
Backend v0.6.0 changed `diversity_rating` from `'low'` to `'focused'`, but frontend TypeScript types weren't updated.

```
TypeError: Cannot read properties of undefined (reading 'primary')
  at DiversityGauge (InsightHUD.tsx:75)
```

**Solution**:
```typescript
// Before
diversity_rating: 'high' | 'medium' | 'low';

// After (3 files updated)
diversity_rating: 'high' | 'medium' | 'low' | 'focused';

// Added to colors object
const colors = {
  high: { primary: '#10B981', ... },
  medium: { primary: '#F59E0B', ... },
  low: { primary: '#6366F1', ... },      // Legacy compatibility
  focused: { primary: '#6366F1', ... },  // v0.6.0 new rating
};
```

**Files Changed**:
- `frontend/components/graph/InsightHUD.tsx`
- `frontend/types/graph.ts`
- `frontend/lib/api.ts`

---

### 2. Three.js ESM Module Resolution (BUG-042)

**Commit**: `8889f0d`

**Problem**:
Vercel builds failing since v0.5.0 due to webpack unable to resolve Three.js ESM imports.

```
Module not found: Can't resolve 'three/examples/jsm/postprocessing/EffectComposer.js'
```

**Root Cause Analysis**:
```
react-force-graph-3d@1.29.0
  └── 3d-force-graph@1.79.0
      └── three-render-objects@1.40.4
          └── imports from 'three/examples/jsm/...'
              └── webpack can't resolve ESM subpath exports
```

**Solution** (3-part fix):

1. **Downgrade to stable versions**:
```json
{
  "dependencies": {
    "react-force-graph-3d": "1.21.3",
    "three": "0.152.2"
  },
  "overrides": {
    "three": "0.152.2",
    "three-render-objects": "1.26.5",
    "three-forcegraph": "1.38.0",
    "3d-force-graph": "1.70.0"
  }
}
```

2. **webpack NormalModuleReplacementPlugin**:
```javascript
// next.config.js
webpack: (config) => {
  const threePackageRoot = path.join(
    path.dirname(require.resolve('three')), '..'
  );

  config.plugins.push(
    new webpack.NormalModuleReplacementPlugin(
      /^three\/examples\/jsm\/.+/,
      (resource) => {
        const subPath = resource.request.replace(/^three\//, '');
        resource.request = path.join(threePackageRoot, subPath);
      }
    )
  );
  return config;
}
```

3. **Single Three.js instance alias**:
```javascript
config.resolve.alias = {
  ...config.resolve.alias,
  three: require.resolve('three'),
};
```

---

## Infrastructure Changes

### Vercel Build Recovery

| Metric | Before | After |
|--------|--------|-------|
| Build Status | ❌ Error | ✅ Ready |
| Build Time | N/A | 1m 6s |
| Deployment | Blocked since Jan 25 | Active |

### Dependency Management Strategy

**New Policy**: Pin critical 3D visualization dependencies to prevent breaking changes.

```
┌─────────────────────────────────────────────────────────────┐
│  Three.js Dependency Pinning Strategy                       │
├─────────────────────────────────────────────────────────────┤
│  Level 1: Direct Dependencies                               │
│    react-force-graph-3d: 1.21.3 (exact)                    │
│    three: 0.152.2 (exact)                                  │
│                                                             │
│  Level 2: npm overrides (transitive)                       │
│    3d-force-graph: 1.70.0                                  │
│    three-render-objects: 1.26.5                            │
│    three-forcegraph: 1.38.0                                │
│                                                             │
│  Level 3: webpack resolution                               │
│    NormalModuleReplacementPlugin for ESM paths             │
│    Single instance alias                                    │
└─────────────────────────────────────────────────────────────┘
```

---

## Migration Guide

### From v0.6.x to v0.7.0

1. **No breaking changes** - All existing features continue to work
2. **New keyboard shortcuts**:
   - `Shift + Click` - Multi-select nodes
3. **Graph export** - New toolbar button for Graph-to-Prompt

### For Developers

If you modify Three.js related dependencies:

1. **Always test locally first**: `npm run build`
2. **Check resolved versions**: `npm ls three three-render-objects`
3. **Don't use `^` for three packages** - Use exact versions
4. **Monitor Vercel builds** after dependency changes

---

## Known Issues

| Issue | Status | Workaround |
|-------|--------|------------|
| Next.js security warning | ⚠️ Advisory | Upgrade planned for v0.8.0 |
| ESLint deprecation warning | ⚠️ Advisory | Upgrade planned for v0.8.0 |

---

## Files Changed

```
frontend/
├── components/graph/
│   ├── Graph3D.tsx         # Node pinning, adaptive labels
│   ├── InsightHUD.tsx      # 'focused' rating support
│   └── GraphToolbar.tsx    # Graph-to-Prompt export
├── types/graph.ts          # Type definitions
├── lib/api.ts              # API types
├── package.json            # Dependency pinning
├── package-lock.json       # Locked versions
└── next.config.js          # webpack plugin
```

---

## Acknowledgments

- Three.js ESM resolution issue diagnosed through webpack plugin debugging
- Dependency version analysis via `npm ls` tree inspection
- Build recovery tested on Vercel production environment

---

## Next Steps (v0.8.0 Roadmap)

- [ ] Entity Extraction V2 (all 8 entity types)
- [ ] AI Chat data-based fallback
- [ ] Adaptive gap detection threshold
- [ ] Semantic diversity metrics
- [ ] Next.js 14.2+ security upgrade
- [ ] ESLint 9.x migration

