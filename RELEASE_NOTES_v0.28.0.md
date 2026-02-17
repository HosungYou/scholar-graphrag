# Release Notes v0.28.0 — Topic View Stability & Gap UX Improvement

> **Version**: 0.28.0 | **Date**: 2026-02-17
> **Codename**: Topic View Stability & Gap UX Improvement

## Summary

Frontend-focused release fixing three key UX issues: Topics view hover jitter (full graph shake on mouseover), indistinguishable Gap cluster colors (both A/B were gold), and low-quality cluster labels. Also introduces a shared cluster labeling utility for consistent label generation across gap detection and community detection.

---

## Topics View Hover Jitter Fix

### Root Causes Identified & Fixed

| # | Cause | Fix | File |
|---|-------|-----|------|
| 1 | Inline `onClusterHover` callback caused useEffect deps change → D3 full recreation every hover | Extracted to `useCallback` with stable deps | `KnowledgeGraph3D.tsx` |
| 2 | D3 tick handler overwrote hover `scale(1.05)` transform every tick | Tick handler now checks `hoveredNodeIdRef` and preserves scale | `TopicViewMode.tsx` |
| 3 | `hoveredNodeId` useState triggered React re-renders but was never read outside D3 | Replaced with `useRef` (dead state elimination) | `TopicViewMode.tsx` |

### Callback Ref Pattern

Applied ref pattern to decouple React prop changes from D3 lifecycle:

```tsx
const onClusterHoverRef = useRef(onClusterHover);
useEffect(() => { onClusterHoverRef.current = onClusterHover; }, [onClusterHover]);
// D3 event handlers use onClusterHoverRef.current?.() instead of direct props
```

D3 useEffect deps reduced from `[topicData, width, height, adjacencyMap, onClusterClick, onClusterHover]` to `[topicData, width, height, adjacencyMap]`.

---

## Gap Cluster A/B Color Distinction

### Problem

When selecting a gap, all highlighted nodes (both cluster A and cluster B) were rendered in identical gold (#FFD700), making it impossible to distinguish which concepts belonged to which cluster.

### Solution

| Element | Cluster A | Cluster B | Bridge |
|---------|-----------|-----------|--------|
| Node color | Coral `#E63946` | Teal `#2EC4B6` | Gold `#FFD700` |
| Highlight ring | Coral | Teal | Gold |
| Label color | Coral | Teal | Gold |
| Navigator dot | Coral | Teal | - |
| Legend entry | Named + colored | Named + colored | Gold |

### Props Added (Backward Compatible)

```tsx
// Graph3D.tsx — optional, defaults to []
clusterANodes?: string[]
clusterBNodes?: string[]
```

When not provided, falls back to existing gold highlight behavior.

---

## Cluster Label Quality Improvement

### LLM Prompt (Before → After)

**Before**: `"Summarize these academic concepts into a concise 3-5 word topic label"`

**After**:
- 2-4 word academic topic labels (was 3-5)
- Explicit rules: no slashes, no listing multiple topics, broad academic terms only
- Output validation: rejects labels containing "/" character

### Fallback Strategy (Before → After)

**Before**: `" / ".join(filtered[:3])` → "linkedin profiles / untested psychometric foundations"

**After**: Sort by length, join 2 shortest with " & " → "AI Ethics & Psychometrics"
- Filters names >40 characters (phrases, not concepts)
- Selects shortest names (= most likely to be core concepts)

### Shared Utility

New `backend/graph/cluster_labeler.py`:
- `fallback_label(keywords)` — sync, deterministic
- `generate_cluster_label(llm_provider, keywords)` — async, LLM with fallback

Used by both `gap_detector.py` and `community_detector.py` (DRY).

---

## Files Changed

| File | Action | Changes |
|------|--------|---------|
| `frontend/components/graph/KnowledgeGraph3D.tsx` | Modified | useCallback for onClusterHover |
| `frontend/components/graph/TopicViewMode.tsx` | Modified | Ref pattern, dead state removal, tick fix |
| `frontend/components/graph/GapsViewMode.tsx` | Modified | Cluster A/B props, legend, navigator dots |
| `frontend/components/graph/Graph3D.tsx` | Modified | clusterRole colors in nodes/rings/labels |
| `backend/graph/cluster_labeler.py` | **New** | Shared cluster labeling utility |
| `backend/graph/gap_detector.py` | Modified | Delegates to cluster_labeler |
| `backend/graph/community_detector.py` | Modified | Delegates to cluster_labeler, accepts llm_provider |

**Total**: 8 files changed (1 new + 6 modified + 1 build info), +217/-71 lines

---

## Technical Details

### Quality Metrics

- TypeScript: 0 errors
- Python: 0 syntax errors (all 3 backend files verified)
- Backward compatible: `clusterANodes`/`clusterBNodes` optional with `[]` defaults
- No database migrations required
- No new environment variables
- No new API endpoints

### Re-labeling Existing Projects

Existing cluster labels can be refreshed with the improved prompt:
```
POST /api/graph/gaps/{project_id}/label-clusters
```

---

## Verification Checklist

- [x] Topics view: hover does not cause graph jitter
- [x] Topics view: D3 useEffect does not re-run on hover
- [x] Gaps view: Cluster A shows coral (#E63946)
- [x] Gaps view: Cluster B shows teal (#2EC4B6)
- [x] Gaps view: Bridge candidates remain gold (#FFD700)
- [x] Gaps view: Legend shows cluster names with colors
- [x] Gaps view: Navigator shows colored dots
- [x] Cluster labels: 2-4 word academic terms
- [x] Cluster labels: No slash-separated raw entity names
- [x] tsc --noEmit: 0 errors
- [x] Python py_compile: 0 errors
- [x] Backward compatible: Graph3D without cluster props works as before
