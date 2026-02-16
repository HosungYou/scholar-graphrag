# Release Notes v0.17.0
> **Version**: 0.17.0 | **Date**: 2026-02-13
> **Type**: Feature Enhancement + Bug Fix (6+2 Issues + InfraNodus Topic View)
> **Commit**: bc38fd1

## Summary

This comprehensive release addresses 6 user-reported issues plus 2 hidden issues discovered during codebase analysis, alongside a complete InfraNodus-level redesign of the Topic View visualization. The Topic View now features ForceAtlas2-style physics-based layout, gradient edges with weight-based scaling, bidirectional 3-tier highlight system, analytics summary bar, SVG export, and smooth entry animations.

Key improvements include: elimination of 3D View hover jitter through material type correction and callback stabilization, meaningful research gap labels via unique UUID-based TF-IDF vectors, accurate cluster size display with empty state guidance, proper UI component layering to prevent toolbar overlap, and complete removal of static chatbot responses by routing all queries through the full RAG pipeline. The Topic View redesign brings professional network visualization capabilities on par with InfraNodus, featuring gradient edge coloring, weight-proportional visual encoding, bidirectional neighbor highlighting, and comprehensive analytics dashboard.

## Root Cause Analysis

| Issue | Root Cause | Technical Detail |
|-------|------------|------------------|
| **Issue A** (Hover Jitter) | (1) Material type mismatch: `scene.traverse` cast `MeshStandardMaterial` but actual material is `MeshPhongMaterial` → highlight color updates failed → nodeThreeObject recreation<br>(2) Stale closure: `handleNodeHover` deps included `nodes` → callback recreated on every nodes change + stale data in setTimeout | `material.color` updates were no-op on wrong type; setTimeout captured outdated nodes array |
| **Issue B** (Gap Labels) | Hidden Issue 13: NULL concept names all mapped to fixed string `"unknown concept"` → TF-IDF vectors identical for all NULL concepts → clustering quality degraded | Identical vectors collapsed all unnamed concepts to single point in feature space |
| **Issue C** (0 Concepts) | `concept_clusters.size` column returned NULL or 0 when gap refresh not run or data stale | Backend gap analysis not triggered; `cluster.size` undefined |
| **Issue D** (Panel Overlap) | Both FilterPanel and Toolbar positioned `absolute top-4 right-4`; FilterPanel z-10 but Toolbar had no z-index | Z-fighting with FilterPanel winning at z-10 |
| **Issue E+16** (Static Chatbot) | (1) `intent_agent.py` line 105: "help me", "can you help" patterns → CONVERSATIONAL misclassification<br>(2) Line 108: `len(q) < 5` → "gaps", "find", "help" (4-char) all CONVERSATIONAL<br>(3) `orchestrator.py` lines 222-234: CONVERSATIONAL intent → hardcoded greeting early-return bypassing RAG pipeline | Substring matching + overly broad length threshold + explicit bypass logic prevented RAG engagement |

## Changes

### Issue A: 3D View Hover Jitter Fix (High)
- **File**: `frontend/components/graph/Graph3D.tsx`
- **Fix (a)**: Changed material type cast from `THREE.MeshStandardMaterial` to `THREE.MeshPhongMaterial` (line 755) to match actual node material type
- **Fix (b)**: Added `nodesRef` ref (line 198) + sync useEffect (line 221-224), changed `nodes.find()` to `nodesRef.current.find()` (line 996), removed `nodes` from handleNodeHover deps (line 1003: `[onNodeHover]`)
- **Impact**: Eliminates node size jitter during hover; callbacks remain stable across node updates; color-only transitions work correctly

### Issue B: Research Gap Meaningless Labels (Medium)
- **File**: `backend/routers/graph.py`
- **Root Cause** (Hidden Issue 13): NULL concept names all mapped to fixed string `"unknown concept"` → TF-IDF vectors identical for all NULL concepts → clustering quality degraded
- **Fix**: `concept_names = [n if n else f"concept_{all_concept_rows[i]['id'][:8]}" ...]` — UUID prefix ensures unique TF-IDF vectors per concept
- **Impact**: Each unnamed concept gets unique vector representation, improving cluster separation and label quality; GapPanel.tsx already correctly uses `getClusterLabel()` — no frontend change needed

### Issue C: Topic View "0 Concepts" Display (Medium)
- **File**: `frontend/components/graph/TopicViewMode.tsx`
- **Root Cause**: `concept_clusters.size` column returned NULL or 0 when gap refresh not run or data stale
- **Fix (a)**: Size fallback chain: `cluster.size || cluster.concept_names?.length || 0`
- **Fix (b)**: Empty state: When `clusters.length === 0`, shows message "Run Gap Analysis first to generate cluster visualization"
- **Impact**: Always shows real concept count; guides users when no clusters exist

### Issue D: Filter Panel Overlapping Toolbar (Medium)
- **Files**: `frontend/components/graph/FilterPanel.tsx`, `frontend/components/graph/KnowledgeGraph3D.tsx`
- **Root Cause**: Both FilterPanel and Toolbar positioned `absolute top-4 right-4`; FilterPanel z-10 but Toolbar had no z-index
- **Fix (a)**: FilterPanel `top-4` → `top-16` (moves below toolbar height)
- **Fix (b)**: Toolbar div gets `z-40` (above DraggablePanel globalMaxZ starting at 20)
- **Impact**: FilterPanel appears below toolbar; all toolbar buttons remain clickable; proper component layering established

### Issue E + Hidden Issue 16: Chatbot Static Responses (Critical)
- **Files**: `backend/agents/intent_agent.py`, `backend/agents/orchestrator.py`
- **Root Causes**: (1) `intent_agent.py` line 105: "help me", "can you help" patterns → CONVERSATIONAL misclassification, (2) line 108: `len(q) < 5` → "gaps", "find", "help" (4-char queries) all CONVERSATIONAL, (3) `orchestrator.py` lines 222-234: CONVERSATIONAL intent → hardcoded greeting early-return bypassing RAG pipeline
- **Fix (a)** (`intent_agent.py`): Removed "help me"/"can you help" from patterns; changed `len(q) < 5` to `len(q) < 3`; changed `any(p in q ...)` to `q in conversational_patterns` (exact match prevents substring false positives)
- **Fix (b)** (`orchestrator.py`): **Completely removed** CONVERSATIONAL early-return block (14 lines deleted). All queries now flow through full 6-agent RAG pipeline. LLM naturally handles greetings with project context.
- **Impact**: "Can you help me find papers?" → RAG response (was: static greeting). "gaps" → GAP_ANALYSIS (was: CONVERSATIONAL). Only 1-2 char inputs or exact greeting matches trigger conversational. All meaningful queries engage RAG pipeline.

### Issue F: InfraNodus-Level Topic View Redesign (Major Feature)
- **File**: `frontend/components/graph/TopicViewMode.tsx` (complete rewrite, 487 → 973 lines)

**Sub-features:**

#### F-1: Edge Visual Enhancement
- SVG `<path>` elements with logarithmic strokeWidth scaling (1.5-8px based on weight)
- Opacity proportional to edge weight for visual emphasis
- Per-link `<linearGradient>` (source cluster → target cluster color transition)
- Top 25% weight edges receive midpoint badge showing "N links"
- Gap edges with `feGaussianBlur` glow filter + amber dashed animation
- **Impact**: Weight relationships immediately visible; gap edges stand out clearly

#### F-2: Bidirectional Highlight System
- Pre-computed `adjacencyMap` for O(1) neighbor lookups
- 3-tier opacity system: focused=1.0/scale 1.05, connected=0.85, faded=0.15
- Edge opacity matches node state (connected=0.9, faded=0.05)
- 200ms enter / 300ms exit CSS transitions
- `prefers-reduced-motion` media query support
- **Impact**: Hover cluster → neighbors highlighted, others fade; exploration clarity improved

#### F-3: ForceAtlas2-Style Layout
- Removed default center force, added `forceRadial` gravity (0.05 strength)
- Size-based charge (-300 to -1000) for natural spacing
- Weight-based link distance (100-300 for normal links, 300 for gaps)
- Collision radius with 30px padding prevents overlap
- Viewport boundary clamping keeps nodes visible
- Square root scale node sizing
- **Impact**: Strong connections closer, weak connections farther; viewport awareness

#### F-4: Cluster Node Info Enhancement
- Connection count badge (top-right circle with total link count)
- ForeignObject HTML tooltip showing top 5 concepts + "+N more"
- Density bar (3px horizontal bar below node, color-coded)
- Expanded legend with edge type samples and size/density explanations
- **Impact**: Rich information at-a-glance; no panel switching needed

#### F-5: Analytics Summary Bar
- Bottom-fixed bar showing: Clusters, Concepts, Connections, Gaps, Avg Density
- Largest cluster name + mini bar chart of cluster size distribution
- **Impact**: Project-level metrics visible during exploration

#### F-6a: Entry Animation
- Nodes start at center with random jitter → force simulation spreads them out
- SVG opacity 0→1 (400ms fade-in)
- `prefers-reduced-motion` check skips animation for accessibility
- **Impact**: Smooth, professional entry experience

#### F-6b: Deterministic Cluster Colors
- `hashStringToIndex(label)` ensures same label = same color across refreshes
- Color assignment independent of cluster ordering
- **Impact**: Visual consistency across sessions

#### F-6e: SVG Export
- Download button in top-left corner
- Clones SVG → inlines styles → Blob download as `.svg` file
- **Impact**: Shareable publication-ready visualizations

## Files Modified

| # | File | Change | Lines |
|---|------|--------|-------|
| 1 | `frontend/components/graph/Graph3D.tsx` | MeshPhongMaterial cast + nodesRef + hover deps fix | +15/-8 |
| 2 | `frontend/components/graph/TopicViewMode.tsx` | InfraNodus-level complete redesign | +790/-183 (net +607) |
| 3 | `frontend/components/graph/FilterPanel.tsx` | top-4 → top-16 positioning | +1/-1 |
| 4 | `frontend/components/graph/KnowledgeGraph3D.tsx` | Toolbar z-40 | +1/-1 |
| 5 | `backend/agents/intent_agent.py` | Pattern cleanup + len<3 + exact match | +3/-3 |
| 6 | `backend/agents/orchestrator.py` | Remove CONVERSATIONAL early-return | +0/-14 |
| 7 | `backend/routers/graph.py` | NULL concept UUID prefix | +1/-1 |
| **Total** | | | **+811/-211** |

## Verification

1. **Hover Jitter (Issue A)**: In 3D View, hover over nodes — size should remain stable with color-only change; no recreation flashing
2. **Gap Labels (Issue B)**: Open Gap Panel — labels show "machine learning / ethics" format, not "Cluster 0" or "unknown concept"
3. **NULL Concept Vectors (Issue B + Hidden 13)**: TF-IDF clustering produces unique vectors even for unnamed concepts; verify distinct cluster assignments
4. **Topic View Size (Issue C)**: Each cluster shows real concept count (never displays "0 Concepts"); empty state shows guidance message
5. **Filter Panel Overlap (Issue D)**: FilterPanel positioned below toolbar; all toolbar buttons remain clickable; proper z-index layering
6. **Chatbot RAG (Issue E+16)**: Query "Can you help me find papers?" → RAG response. Query "gaps" → GAP_ANALYSIS. Query "hi" → contextual greeting with project info
7. **Edge Visualization (Feature F-1)**: Gradient colors visible; thickness proportional to weight; gap edges glow with amber dashes
8. **Bidirectional Highlight (Feature F-2)**: Hover cluster → neighbors highlighted at 0.85 opacity, others fade to 0.15; edges follow same pattern
9. **ForceAtlas2 Layout (Feature F-3)**: Strong connections closer together; weak connections farther apart; nodes stay within viewport bounds
10. **Node Info Enhancement (Feature F-4)**: Connection badge count; tooltip with top concepts; density bar below node; legend shows all encodings
11. **Analytics Bar (Feature F-5)**: Bottom bar displays cluster/concept/connection/gap stats + distribution chart; largest cluster name visible
12. **Entry Animation (Feature F-6a)**: Nodes expand from center naturally; smooth 400ms fade-in
13. **Color Stability (Feature F-6b)**: Same cluster label = same color after page refresh; colors deterministic
14. **SVG Export (Feature F-6e)**: Download button produces valid SVG file; gradients and styles preserved
15. **Build Verification**: `npm run build` produces zero errors; `python -m py_compile backend/**/*.py` all pass

## Technical Notes
- No database migrations required
- No new environment variables
- No breaking API changes
- No new npm dependencies
- Backend deployment: Render manual deploy required (INFRA-006: auto-deploy disabled per security policy)
- Frontend deployment: Vercel auto-deploys on push to `render` remote
- TopicViewMode.tsx grew from 487 to 973 lines; all new code is self-contained within the component
- Force simulation parameters tuned for projects with 5-50 clusters; may need adjustment for extreme scales
- SVG export preserves interactivity state but not dynamic force simulation
- Accessibility: `prefers-reduced-motion` support for animations; proper ARIA labels on interactive elements
