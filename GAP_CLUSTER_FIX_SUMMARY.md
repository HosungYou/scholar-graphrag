# Gap Analysis Cluster Data Fix

## Problem
The gap analysis API was returning clusters with `size=0` and no labels ("Cluster N" fallback). The GapPanel showed "0 concepts in 5 clusters".

## Root Cause Analysis

### What Was Working
1. **GapDetector** (`backend/graph/gap_detector.py`):
   - Line 186: `clusters[cluster_id].concept_ids.append(concept["id"])` ✅
   - Line 199: `cluster.name = " / ".join(cluster.keywords[:3])` ✅
   - Correctly populates `ConceptCluster.concept_ids` and generates cluster names

2. **Database Storage** (`backend/routers/graph.py`):
   - Lines 1258-1261: Builds `cluster_concept_names` from `concept_ids` ✅
   - Line 1270: Stores `concept_ids` as TEXT[] ✅
   - Line 1271: Stores `concept_names` ✅
   - Line 1272: Stores `size` correctly ✅

3. **Query** (`backend/routers/graph.py`):
   - Lines 957-977: Fetches `size`, `label`, `concept_names` ✅

### What Was Broken
**Label Generation Logic** (Line 1274):
```python
# OLD CODE (BROKEN):
cluster.name or f"Cluster {cluster.id + 1}"
```

**Problem**: When `cluster.name` is `None` or empty string, this always falls back to generic "Cluster N" label, even though `cluster_concept_names` is already populated with actual concept names.

## Fix Applied

### File: `backend/routers/graph.py` (Lines 1263-1287)

**Before**:
```python
await database.execute(
    """...""",
    cluster.name or f"Cluster {cluster.id + 1}",  # ❌ No concept name fallback
)
```

**After**:
```python
# Generate meaningful label from concept names
if cluster.name:
    label = cluster.name
elif cluster_concept_names:
    # Use top 3 concept names
    label = ", ".join(cluster_concept_names[:3])
    if len(cluster_concept_names) > 3:
        label += f" (+{len(cluster_concept_names) - 3} more)"
else:
    label = f"Cluster {cluster.id + 1}"

logger.info(f"Storing cluster {cluster.id}: {len(cluster.concept_ids)} concepts, name={cluster.name}, label={label}")

await database.execute(
    """...""",
    label,  # ✅ Uses concept names when cluster.name is None
)
```

## Changes Made

1. **Improved Label Generation**: 3-tier fallback system
   - Priority 1: Use `cluster.name` if provided by GapDetector
   - Priority 2: Use top 3 concept names from `cluster_concept_names`
   - Priority 3: Generic "Cluster N" only if no concept names available

2. **Added Logging**: Track cluster storage with size and label for debugging

## Expected Behavior After Fix

### API Response (`/api/graph/gaps/{project_id}/analysis`)
```json
{
  "clusters": [
    {
      "cluster_id": 0,
      "concepts": ["uuid1", "uuid2", "uuid3"],
      "concept_names": ["neural networks", "deep learning", "transformers"],
      "size": 3,
      "label": "neural networks, deep learning, transformers"
    }
  ]
}
```

### GapPanel Display
- Shows "15 concepts in 5 clusters" (instead of "0 concepts")
- Cluster labels show actual concept names (instead of "Cluster 1", "Cluster 2")

## Testing

### Manual Test
1. Navigate to project with existing data
2. Click "Gaps" view mode
3. Click "🔄 Refresh Gap Analysis" button
4. Check backend logs: Should show `Storing cluster 0: 15 concepts, name=None, label=concept1, concept2, concept3 (+12 more)`
5. Verify GapPanel shows non-zero concept count

### API Test
```bash
curl https://scholarag-graph-docker.onrender.com/api/graph/gaps/{project_id}/refresh \
  -H "Authorization: Bearer $TOKEN" \
  -X POST
```

Check response includes clusters with `size > 0` and meaningful `label` values.

## Files Modified
- `backend/routers/graph.py` (Lines 1263-1287)

## Related Issues
- Initial import may have used old code that didn't populate these fields
- This fix ensures future gap refreshes generate correct labels
- Existing projects need to click "Refresh Gap Analysis" to regenerate data
