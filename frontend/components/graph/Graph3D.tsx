'use client';

import { useCallback, useRef, useMemo, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import dynamic from 'next/dynamic';
import * as THREE from 'three';
import type { GraphEntity, GraphEdge, ConceptCluster, CentralityMetrics, StructuralGap, PotentialEdge } from '@/types';

// Dynamic import to avoid SSR issues with Three.js
const ForceGraph3D = dynamic(() => import('react-force-graph-3d'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-[#0d1117]">
      <div className="text-center">
        <div className="w-12 h-12 border-2 border-accent-teal border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="font-mono text-xs text-muted">Loading 3D visualization...</p>
      </div>
    </div>
  ),
});

// Node data structure for ForceGraph
interface ForceGraphNode {
  id: string;
  name: string;
  val: number;
  color: string;
  entityType: string;
  clusterId?: number;
  centrality?: number;
  isHighlighted?: boolean;
  isBridge?: boolean;
  properties?: Record<string, unknown>;
  // Position props added by force graph
  x?: number;
  y?: number;
  z?: number;
  fx?: number;
  fy?: number;
  fz?: number;
}

// Link data structure for ForceGraph
interface ForceGraphLink {
  id: string;
  source: string | ForceGraphNode;
  target: string | ForceGraphNode;
  weight: number;
  confidence?: number;
  relationshipType: string;
  isHighlighted?: boolean;
  isGhost?: boolean;  // Ghost edge (potential edge) for InfraNodus-style visualization
  isLowTrust?: boolean;
  similarity?: number;  // Similarity score for ghost edges
}

// Graph data for ForceGraph
interface ForceGraphData {
  nodes: ForceGraphNode[];
  links: ForceGraphLink[];
}

// Cluster color palette (InfraNodus style - vibrant, distinguishable)
const CLUSTER_COLORS = [
  '#FF6B6B', // Coral Red
  '#4ECDC4', // Turquoise
  '#45B7D1', // Sky Blue
  '#96CEB4', // Sage Green
  '#FFEAA7', // Soft Yellow
  '#DDA0DD', // Plum
  '#98D8C8', // Mint
  '#F7DC6F', // Gold
  '#BB8FCE', // Lavender
  '#85C1E9', // Light Blue
  '#F8B500', // Amber
  '#82E0AA', // Light Green
];

// v0.18.0: Relationship type-based edge coloring (semantic meaning)
const RELATIONSHIP_COLORS: Record<string, string> = {
  'CO_OCCURS_WITH': '#4ECDC4',    // Teal
  'RELATED_TO': '#9D4EDD',         // Purple
  'SUPPORTS': '#10B981',           // Green
  'CONTRADICTS': '#EF4444',        // Red
  'BRIDGES_GAP': '#FFD700',        // Gold
  'DISCUSSES_CONCEPT': '#45B7D1',  // Sky Blue
  'USES_METHOD': '#F59E0B',        // Amber
  'SAME_AS': '#9D4EDD',            // Purple
};

// Entity type colors (fallback when no cluster assigned)
const ENTITY_TYPE_COLORS: Record<string, string> = {
  Paper: '#6366F1',
  Author: '#A855F7',
  Concept: '#8B5CF6',
  Method: '#F59E0B',
  Finding: '#10B981',
  Problem: '#EF4444',
  Dataset: '#3B82F6',
  Metric: '#EC4899',
  Innovation: '#14B8A6',
  Limitation: '#F97316',
};

// v0.10.0: Entity type shape mapping for visual differentiation
// Each type gets a distinct Three.js geometry for at-a-glance recognition
type EntityShape = 'sphere' | 'box' | 'octahedron' | 'cone' | 'dodecahedron' | 'cylinder' | 'torus' | 'tetrahedron';

const ENTITY_TYPE_SHAPES: Record<string, EntityShape> = {
  Concept: 'sphere',          // Default - round, fundamental
  Method: 'box',              // Structured, systematic
  Finding: 'octahedron',      // Diamond-like, valuable
  Problem: 'cone',            // Pointed, directional
  Innovation: 'dodecahedron', // Complex, multifaceted
  Limitation: 'tetrahedron',  // Simple, constrained
  Dataset: 'cylinder',        // Container-like
  Metric: 'torus',            // Measurement, cyclical
  Paper: 'sphere',            // Fallback
  Author: 'sphere',           // Fallback
};

// v0.9.0: InfraNodus-style labeling configuration
const LABEL_CONFIG = {
  minFontSize: 10,
  maxFontSize: 28,
  minOpacity: 0.3,
  maxOpacity: 1.0,
  alwaysVisiblePercentile: 0.8,  // Top 20% always show labels
  hoverRevealPercentile: 0.5,     // Top 50% on hover
};

const E2E_MOCK_3D = process.env.NEXT_PUBLIC_E2E_MOCK_3D === '1';

/** v0.19.0: 2D Convex hull using Andrew's monotone chain algorithm */
function computeConvexHull2D(points: THREE.Vector2[]): THREE.Vector2[] {
  if (points.length < 3) return points;
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (O: THREE.Vector2, A: THREE.Vector2, B: THREE.Vector2) =>
    (A.x - O.x) * (B.y - O.y) - (A.y - O.y) * (B.x - O.x);
  const lower: THREE.Vector2[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: THREE.Vector2[] = [];
  for (const p of sorted.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

export interface Graph3DProps {
  nodes: GraphEntity[];
  edges: GraphEdge[];
  clusters?: ConceptCluster[];
  centralityMetrics?: CentralityMetrics[];
  highlightedNodes?: string[];
  highlightedEdges?: string[];
  selectedGap?: StructuralGap | null;
  onNodeClick?: (node: GraphEntity) => void;
  onNodeHover?: (node: GraphEntity | null) => void;
  onBackgroundClick?: () => void;
  // UI-011: Edge click handler for Relationship Evidence (deprecated in v0.18.0 — use ConceptExplorer panel instead)
  onEdgeClick?: (edge: GraphEdge) => void;
  // Ghost Edge props (InfraNodus-style)
  showGhostEdges?: boolean;
  potentialEdges?: PotentialEdge[];
  // Bloom/Glow effect props
  bloomEnabled?: boolean;
  bloomIntensity?: number;
  glowSize?: number;
  // Phase 11F: SAME_AS edge filter
  showSameAsEdges?: boolean;
  // v0.7.0: Adaptive labeling props
  labelVisibility?: 'none' | 'important' | 'all';
  onLabelVisibilityChange?: (mode: 'none' | 'important' | 'all') => void;
  // v0.7.0: Node pinning props
  pinnedNodes?: string[];
  onNodePin?: (nodeId: string) => void;
  onNodeUnpin?: (nodeId: string) => void;
  onClearPinnedNodes?: () => void;
  // v0.19.0: Cluster overlay props
  showClusterOverlay?: boolean;
  gaps?: import('@/types').StructuralGap[];
}

export interface Graph3DRef {
  focusOnNode: (nodeId: string) => void;
  focusOnCluster: (clusterId: number) => void;
  focusOnGap: (gap: StructuralGap) => void;
  resetCamera: () => void;
  getCamera: () => THREE.Camera | undefined;
  clearPinnedNodes: () => void;
}

export const Graph3D = forwardRef<Graph3DRef, Graph3DProps>(({
  nodes,
  edges,
  clusters = [],
  centralityMetrics = [],
  highlightedNodes = [],
  highlightedEdges = [],
  selectedGap,
  onNodeClick,
  onNodeHover,
  onBackgroundClick,
  onEdgeClick,  // UI-011: Edge click handler for Relationship Evidence
  showGhostEdges = false,
  potentialEdges = [],
  bloomEnabled = false,
  bloomIntensity = 0.5,
  glowSize = 1.3,
  labelVisibility: labelVisibilityProp = 'important',
  showSameAsEdges = true,
  onLabelVisibilityChange,
  pinnedNodes = [],
  onNodePin,
  onNodeUnpin,
  onClearPinnedNodes,
  // v0.19.0: Cluster overlay
  showClusterOverlay = false,
  gaps: gapsProp = [],
}, ref) => {
  // All hooks must be called unconditionally at the top (React rules)
  const fgRef = useRef<any>(null);
  const textureCache = useRef(new Map<string, THREE.CanvasTexture>());
  // v0.14.1: nodeObjectCache removed — it cached grey nodes before cluster colors arrived
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  // v0.11.0: Debounced hover to prevent jitter
  const hoveredNodeRef = useRef<string | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Use a ref for cursor updates so hover does not trigger React re-renders.
  const graphContainerRef = useRef<HTMLDivElement>(null);

  // v0.17.0: Stable nodes ref for hover callback (prevents stale closure)
  const nodesRef = useRef(nodes);

  // v0.7.0: Adaptive labeling state
  const [labelVisibility, setLabelVisibility] = useState<'none' | 'important' | 'all'>('important');
  const [currentZoom, setCurrentZoom] = useState<number>(500);
  const currentZoomRef = useRef<number>(500);

  // v0.7.0: Calculate label threshold based on zoom level
  const calculateLabelThreshold = useCallback((zoomLevel: number): number => {
    // zoomLevel: 100 (close) to 800 (far)
    // Returns size threshold: higher = fewer labels shown
    if (zoomLevel < 200) return 2;      // Very close: show most labels
    if (zoomLevel < 350) return 4;      // Medium close: show important
    if (zoomLevel < 500) return 5;      // Medium: show main topics
    if (zoomLevel < 650) return 6;      // Far: show only major nodes
    return 8;                           // Very far: show only largest nodes
  }, []);

  // v0.7.0: Sync label visibility with external prop
  useEffect(() => {
    setLabelVisibility(labelVisibilityProp);
  }, [labelVisibilityProp]);

  // v0.17.0: Keep nodesRef in sync
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  // UI-010 FIX: Store node positions to persist across re-renders
  // This prevents the simulation from restarting when graphData is recreated
  const nodePositionsRef = useRef<Map<string, { x: number; y: number; z: number; fx?: number; fy?: number; fz?: number }>>(new Map());

  // UI-010 FIX: Track if this is the initial render
  const isInitialRenderRef = useRef(true);

  // Double-click detection state
  const lastClickRef = useRef<{ nodeId: string; timestamp: number } | null>(null);
  const DOUBLE_CLICK_THRESHOLD = 300; // ms

  // v0.8.0: Hash function for stable cluster color assignment
  // Using cluster_id ensures same cluster always gets same color across refreshes
  const hashClusterId = useCallback((clusterId: number): number => {
    let hash = 0;
    const str = `cluster_${clusterId}`;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }, []);

  // Build cluster color map with hash-based color assignment for stability
  const clusterColorMap = useMemo(() => {
    const colorMap = new Map<number, string>();
    clusters.forEach((cluster) => {
      // v0.8.0: Use hash-based color selection instead of array index
      // This ensures same cluster_id always gets same color regardless of array order
      const colorIndex = hashClusterId(cluster.cluster_id) % CLUSTER_COLORS.length;
      colorMap.set(cluster.cluster_id, CLUSTER_COLORS[colorIndex]);
    });
    return colorMap;
  }, [clusters, hashClusterId]);

  // Build centrality map
  const centralityMap = useMemo(() => {
    const map = new Map<string, number>();
    centralityMetrics.forEach(metric => {
      map.set(metric.concept_id, metric.betweenness_centrality);
    });
    return map;
  }, [centralityMetrics]);

  // Calculate top 20% centrality threshold for label display
  const labelCentralityThreshold = useMemo(() => {
    if (centralityMetrics.length === 0) {
      // No centrality data - show labels for all nodes
      return 0;
    }
    const sortedCentralities = [...centralityMetrics]
      .map(m => m.betweenness_centrality)
      .sort((a, b) => b - a);
    const top20Index = Math.floor(sortedCentralities.length * 0.2);
    return sortedCentralities[top20Index] || 0;
  }, [centralityMetrics]);

  // v0.9.0: Centrality percentile map for InfraNodus-style labeling
  const centralityPercentileMap = useMemo(() => {
    const map = new Map<string, number>();
    if (centralityMetrics.length === 0) {
      // No centrality data - assign default percentile
      nodes.forEach(n => map.set(n.id, 0.5));
      return map;
    }
    const sorted = [...centralityMetrics].sort(
      (a, b) => a.betweenness_centrality - b.betweenness_centrality
    );
    sorted.forEach((m, i) => {
      map.set(m.concept_id, i / (sorted.length - 1 || 1));
    });
    return map;
  }, [centralityMetrics, nodes]);

  // v0.18.0: Ref to track centralityPercentileMap without triggering nodeThreeObject recreation
  const centralityPercentileMapRef = useRef(centralityPercentileMap);

  useEffect(() => {
    centralityPercentileMapRef.current = centralityPercentileMap;
  }, [centralityPercentileMap]);

  // Helper function: Create text sprite for node labels (InfraNodus-style)
  const createTextSprite = useCallback((text: string, color: string, fontSize: number = 14, opacity: number = 1.0) => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return null;

    // Set canvas size for high resolution
    const scale = 2;
    canvas.width = 256 * scale;
    canvas.height = 64 * scale;
    context.scale(scale, scale);

    // v0.9.0: Text styling with shadow (no background box - InfraNodus style)
    context.font = `bold ${fontSize}px Arial, sans-serif`;

    // Shadow for readability (instead of background box)
    context.shadowColor = 'rgba(0, 0, 0, 0.9)';
    context.shadowBlur = 6;
    context.shadowOffsetX = 1;
    context.shadowOffsetY = 2;

    // Draw text with opacity
    context.fillStyle = color;
    context.globalAlpha = opacity;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, canvas.width / scale / 2, canvas.height / scale / 2);

    // Create sprite
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    const spriteMaterial = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    });

    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(40, 10, 1);

    return sprite;
  }, []);

  // Build highlighted sets for O(1) lookup
  const highlightedNodeSet = useMemo(() => new Set(highlightedNodes), [highlightedNodes]);
  const highlightedEdgeSet = useMemo(() => new Set(highlightedEdges), [highlightedEdges]);

  // v0.7.0: Pinned nodes set for O(1) lookup
  const pinnedNodeSet = useMemo(() => new Set(pinnedNodes), [pinnedNodes]);

  // Build node -> cluster mapping for edge coloring
  const nodeClusterMap = useMemo(() => {
    const map = new Map<string, number>();
    nodes.forEach(node => {
      const clusterId = (node.properties as { cluster_id?: number })?.cluster_id;
      if (clusterId !== undefined) {
        map.set(node.id, clusterId);
      }
    });
    return map;
  }, [nodes]);

  // Helper function: Convert hex to rgba
  const hexToRgba = useCallback((hex: string, alpha: number): string => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }, []);

  // Helper function: Blend two hex colors
  const blendColors = useCallback((color1: string, color2: string, ratio: number = 0.5): string => {
    const r1 = parseInt(color1.slice(1, 3), 16);
    const g1 = parseInt(color1.slice(3, 5), 16);
    const b1 = parseInt(color1.slice(5, 7), 16);
    const r2 = parseInt(color2.slice(1, 3), 16);
    const g2 = parseInt(color2.slice(3, 5), 16);
    const b2 = parseInt(color2.slice(5, 7), 16);

    const r = Math.round(r1 * (1 - ratio) + r2 * ratio);
    const g = Math.round(g1 * (1 - ratio) + g2 * ratio);
    const b = Math.round(b1 * (1 - ratio) + b2 * ratio);

    return `rgba(${r}, ${g}, ${b}, 0.35)`;
  }, []);

  // UI-010 FIX: Separate base graph data from styling to prevent simulation reset
  // KEY INSIGHT: ForceGraph3D resets physics when graphData reference changes
  // Solution: Keep graphData stable, apply styles through separate maps
  const baseGraphData = useMemo<ForceGraphData>(() => {
    const orderedNodes = [...nodes].sort((a, b) => a.id.localeCompare(b.id));
    const orderedEdges = [...edges].sort((a, b) => {
      const edgeCmp = `${a.source}::${a.target}`.localeCompare(`${b.source}::${b.target}`);
      if (edgeCmp !== 0) {
        return edgeCmp;
      }
      return a.id.localeCompare(b.id);
    });

    // v0.20.0: Build edge count map for connection-based node sizing
    const edgeCountMap = new Map<string, number>();
    orderedEdges.forEach(edge => {
      edgeCountMap.set(edge.source, (edgeCountMap.get(edge.source) || 0) + 1);
      edgeCountMap.set(edge.target, (edgeCountMap.get(edge.target) || 0) + 1);
    });

    const forceNodes: ForceGraphNode[] = orderedNodes.map(node => {
      const clusterId = (node.properties as { cluster_id?: number })?.cluster_id;
      const centrality = centralityMap.get(node.id) || 0;
      const isBridge = (node.properties as { is_gap_bridge?: boolean })?.is_gap_bridge || false;

      // Base color (NO highlight logic here - handled in nodeStyleMap)
      let color: string;
      if (clusterId !== undefined && clusterColorMap.has(clusterId)) {
        color = clusterColorMap.get(clusterId)!;
      } else {
        color = ENTITY_TYPE_COLORS[node.entity_type] || '#888888';
      }

      // v0.20.0: Size based on centrality AND edge count (logarithmic scaling for balance)
      const connectionCount = edgeCountMap.get(node.id) || 0;
      const paperCount = (node.properties as { paper_count?: number })?.paper_count || 1;
      const baseSize = 3;
      const centralityBoost = Math.sqrt(centrality * 100) * 2;
      const connectionBoost = Math.log(1 + connectionCount) * 1.5;
      const frequencyBoost = Math.min(Math.log2(paperCount + 1) * 1.5, 4);
      const bridgeBoost = isBridge ? 2 : 0;
      const nodeSize = baseSize + centralityBoost + connectionBoost + frequencyBoost + bridgeBoost;

      // UI-010 FIX: Restore position from ref if available
      const savedPosition = nodePositionsRef.current.get(node.id);

      const forceNode: ForceGraphNode = {
        id: node.id,
        name: node.name,
        val: nodeSize,
        color,
        entityType: node.entity_type,
        clusterId,
        centrality,
        isHighlighted: false, // Always false here - use nodeStyleMap for actual state
        isBridge,
        properties: node.properties,
      };

      // Restore saved positions to prevent simulation restart
      if (savedPosition) {
        forceNode.x = savedPosition.x;
        forceNode.y = savedPosition.y;
        forceNode.z = savedPosition.z;
        // Restore pinned positions (fx, fy, fz) if they were set
        if (savedPosition.fx !== undefined) forceNode.fx = savedPosition.fx;
        if (savedPosition.fy !== undefined) forceNode.fy = savedPosition.fy;
        if (savedPosition.fz !== undefined) forceNode.fz = savedPosition.fz;
      }

      return forceNode;
    });

    // Phase 11F: Filter SAME_AS edges based on showSameAsEdges flag
    const filteredEdges = showSameAsEdges
      ? orderedEdges
      : orderedEdges.filter(edge => edge.relationship_type !== 'SAME_AS');

    const forceLinks: ForceGraphLink[] = filteredEdges.map(edge => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      weight: edge.weight || 1,
      confidence: typeof edge.properties?.confidence === 'number'
        ? edge.properties.confidence
        : (edge.weight || 1),
      relationshipType: edge.relationship_type,
      isHighlighted: false, // Always false here - use edgeStyleMap for actual state
      isGhost: false,
      isLowTrust: (
        (typeof edge.properties?.confidence === 'number' && edge.properties.confidence < 0.6) ||
        ((edge.weight || 1) < 0.6)
      ),
    }));

    // Add ghost edges (potential edges) if enabled
    if (showGhostEdges && potentialEdges.length > 0) {
      const ghostLinks: ForceGraphLink[] = potentialEdges.map((pe, index) => ({
        id: `ghost-${pe.source_id}-${pe.target_id}-${index}`,
        source: pe.source_id,
        target: pe.target_id,
        weight: pe.similarity,
        relationshipType: 'POTENTIAL',
        isHighlighted: true,  // Ghost edges are always highlighted
        isGhost: true,
        similarity: pe.similarity,
      }));
      forceLinks.push(...ghostLinks);
    }

    return { nodes: forceNodes, links: forceLinks };
  }, [nodes, edges, clusterColorMap, centralityMap, showGhostEdges, potentialEdges, showSameAsEdges]);
  // ⚠️ CRITICAL: highlightedNodeSet and highlightedEdgeSet REMOVED from dependencies!

  // UI-010 FIX: Separate style maps for highlighting (changes without triggering graph rebuild)
  const nodeStyleMap = useMemo(() => {
    const styleMap = new Map<string, { isHighlighted: boolean; isPinned: boolean; baseColor: string }>();
    // Pre-populate with all nodes to ensure consistent lookup
    baseGraphData.nodes.forEach(node => {
      styleMap.set(node.id, {
        isHighlighted: highlightedNodeSet.has(node.id),
        isPinned: pinnedNodeSet.has(node.id),
        baseColor: node.color,
      });
    });
    return styleMap;
  }, [baseGraphData.nodes, highlightedNodeSet, pinnedNodeSet]);

  const edgeStyleMap = useMemo(() => {
    const styleMap = new Map<string, { isHighlighted: boolean; isPinnedEdge: boolean; isLowTrust: boolean }>();
    baseGraphData.links.forEach(link => {
      const sourceId = typeof link.source === 'string' ? link.source : (link.source as ForceGraphNode).id;
      const targetId = typeof link.target === 'string' ? link.target : (link.target as ForceGraphNode).id;

      // v0.7.0: Edge is pinned if both source and target are pinned
      const isPinnedEdge = pinnedNodeSet.has(sourceId) && pinnedNodeSet.has(targetId);

      styleMap.set(link.id, {
        isHighlighted: highlightedEdgeSet.has(link.id) || link.isGhost === true,
        isPinnedEdge,
        isLowTrust: link.isLowTrust === true,
      });
    });
    return styleMap;
  }, [baseGraphData.links, highlightedEdgeSet, pinnedNodeSet]);

  // Backward compatibility: graphData reference for ForceGraph3D
  // This is now stable - only changes when nodes/edges/clusters change, NOT when highlights change
  const graphData = baseGraphData;

  // UI-010 FIX: Save node positions periodically to preserve across re-renders
  useEffect(() => {
    const savePositions = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      if (fgRef.current) {
        const currentNodes = fgRef.current.graphData()?.nodes;
        if (currentNodes) {
          currentNodes.forEach((node: ForceGraphNode) => {
            if (node.x !== undefined && node.y !== undefined && node.z !== undefined) {
              nodePositionsRef.current.set(node.id, {
                x: node.x,
                y: node.y,
                z: node.z,
                fx: node.fx,
                fy: node.fy,
                fz: node.fz,
              });
            }
          });
        }
      }
    };

    // Save positions less aggressively to reduce CPU/memory pressure.
    const intervalId = setInterval(savePositions, 2000);
    return () => clearInterval(intervalId);
  }, []);

  // Custom node rendering with glow effect and bloom support
  // UI-010 FIX: Uses nodeStyleMap instead of node.isHighlighted to prevent stale renders
  const nodeThreeObject = useCallback((nodeData: unknown) => {
    const node = nodeData as ForceGraphNode;

    const group = new THREE.Group();
    // v0.18.0: Restore saved position to prevent central burst on node recreation
    const savedPos = nodePositionsRef.current.get(node.id);
    if (savedPos) {
      group.position.set(savedPos.x, savedPos.y, savedPos.z);
    }
    group.userData.nodeId = node.id;
    const nodeSize = node.val || 5;

    // UI-010 FIX: Get highlight state from style map, not from node object
    const nodeStyle = nodeStyleMap.get(node.id);
    const isHighlighted = nodeStyle?.isHighlighted || false;
    const isPinned = nodeStyle?.isPinned || false;

    // v0.7.0: Color priority: highlighted > pinned > normal
    let displayColor: string;
    if (isHighlighted) {
      displayColor = '#FFD700'; // Gold for highlighted
    } else if (isPinned) {
      displayColor = '#00E5FF'; // Cyan for pinned
    } else {
      displayColor = node.color || '#888888';
    }

    // Calculate emissive intensity based on bloom settings
    let emissiveIntensity = isHighlighted ? 0.6 : 0.2;
    if (bloomEnabled) {
      // Boost emissive intensity when bloom is enabled
      emissiveIntensity = isHighlighted
        ? 0.4 + bloomIntensity * 0.6
        : 0.15 + bloomIntensity * 0.45;
    }

    // v0.10.0: Entity type-based geometry
    const entityShape = ENTITY_TYPE_SHAPES[node.entityType] || 'sphere';
    let geometry: THREE.BufferGeometry;

    switch (entityShape) {
      case 'box':
        geometry = new THREE.BoxGeometry(nodeSize * 1.6, nodeSize * 1.6, nodeSize * 1.6);
        break;
      case 'octahedron':
        geometry = new THREE.OctahedronGeometry(nodeSize * 1.1);
        break;
      case 'cone':
        geometry = new THREE.ConeGeometry(nodeSize, nodeSize * 2, 8);
        break;
      case 'dodecahedron':
        geometry = new THREE.DodecahedronGeometry(nodeSize * 1.1);
        break;
      case 'tetrahedron':
        geometry = new THREE.TetrahedronGeometry(nodeSize * 1.2);
        break;
      case 'cylinder':
        geometry = new THREE.CylinderGeometry(nodeSize * 0.8, nodeSize * 0.8, nodeSize * 1.6, 8);
        break;
      case 'torus':
        geometry = new THREE.TorusGeometry(nodeSize * 0.8, nodeSize * 0.35, 8, 16);
        break;
      default:
        geometry = new THREE.SphereGeometry(nodeSize, 16, 16);
    }

    const material = new THREE.MeshPhongMaterial({
      color: displayColor,
      emissive: displayColor,
      emissiveIntensity,
      transparent: true,
      opacity: isHighlighted ? 1 : 0.85,
      shininess: bloomEnabled ? 50 : 30,
    });
    const mainMesh = new THREE.Mesh(geometry, material);
    group.add(mainMesh);

    // Bloom outer glow sphere (always show when bloom is enabled)
    if (bloomEnabled) {
      const glowGeometry = new THREE.SphereGeometry(nodeSize * glowSize, 16, 16);
      const glowOpacity = 0.08 + bloomIntensity * 0.12;
      const glowMaterial = new THREE.MeshBasicMaterial({
        color: displayColor,
        transparent: true,
        opacity: glowOpacity,
      });
      const glow = new THREE.Mesh(glowGeometry, glowMaterial);
      group.add(glow);
    }

    // Bridge nodes: additional gold glow
    if (node.isBridge) {
      const bridgeGlowSize = bloomEnabled ? nodeSize * glowSize * 1.2 : nodeSize * 1.4;
      const bridgeOpacity = bloomEnabled ? 0.15 + bloomIntensity * 0.15 : 0.2;
      const bridgeGlowGeometry = new THREE.SphereGeometry(bridgeGlowSize, 16, 16);
      const bridgeGlowMaterial = new THREE.MeshBasicMaterial({
        color: '#FFD700',
        transparent: true,
        opacity: bridgeOpacity,
      });
      const bridgeGlow = new THREE.Mesh(bridgeGlowGeometry, bridgeGlowMaterial);
      group.add(bridgeGlow);
    }

    // Phase 11D: Table-sourced entity indicator (subtle border ring)
    const isTableSourced = (node.properties as any)?.source_type === 'table';
    if (isTableSourced && !isHighlighted) {
      const tableRingSize = bloomEnabled ? nodeSize * glowSize * 0.95 : nodeSize * 1.25;
      const tableRingGeometry = new THREE.RingGeometry(tableRingSize, tableRingSize + nodeSize * 0.1, 32);
      const tableRingMaterial = new THREE.MeshBasicMaterial({
        color: '#F59E0B', // Amber - indicates table extraction
        transparent: true,
        opacity: bloomEnabled ? 0.3 + bloomIntensity * 0.15 : 0.4,
        side: THREE.DoubleSide,
      });
      const tableRing = new THREE.Mesh(tableRingGeometry, tableRingMaterial);
      tableRing.rotation.x = Math.PI / 2;
      group.add(tableRing);
    }

    // Highlight ring for selected nodes
    if (isHighlighted) {
      const ringSize = bloomEnabled ? nodeSize * glowSize * 0.95 : nodeSize * 1.3;
      const ringGeometry = new THREE.RingGeometry(ringSize, ringSize + nodeSize * 0.2, 32);
      const ringOpacity = bloomEnabled ? 0.4 + bloomIntensity * 0.3 : 0.6;
      const ringMaterial = new THREE.MeshBasicMaterial({
        color: '#FFD700',
        transparent: true,
        opacity: ringOpacity,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.rotation.x = Math.PI / 2;
      group.add(ring);
    }

    // v0.7.0: Pinned node indicator (cyan ring)
    if (isPinned && !isHighlighted) {
      const pinnedRingSize = bloomEnabled ? nodeSize * glowSize * 0.9 : nodeSize * 1.25;
      const pinnedRingGeometry = new THREE.RingGeometry(pinnedRingSize, pinnedRingSize + nodeSize * 0.15, 32);
      const pinnedRingMaterial = new THREE.MeshBasicMaterial({
        color: '#00E5FF',
        transparent: true,
        opacity: bloomEnabled ? 0.5 + bloomIntensity * 0.2 : 0.6,
        side: THREE.DoubleSide,
      });
      const pinnedRing = new THREE.Mesh(pinnedRingGeometry, pinnedRingMaterial);
      pinnedRing.rotation.x = Math.PI / 2;
      group.add(pinnedRing);
    }

    // v0.9.0: InfraNodus-style labeling based on centrality percentile
    const nodePercentile = centralityPercentileMapRef.current.get(node.id) || 0.3;
    const isTopPercentile = nodePercentile >= LABEL_CONFIG.alwaysVisiblePercentile;

    const shouldShowLabel = node.name && (
      labelVisibility === 'all' ||
      (labelVisibility === 'important' && (isTopPercentile || isHighlighted || isPinned || node.isBridge)) ||
      (labelVisibility === 'none' && (isHighlighted || isPinned))
    );

    if (shouldShowLabel) {
      // Truncate long names
      const maxLabelLength = 15;
      const displayName = node.name.length > maxLabelLength
        ? node.name.substring(0, maxLabelLength - 2) + '..'
        : node.name;

      // v0.9.0: Font size proportional to centrality percentile (InfraNodus style)
      const fontSize = Math.round(
        LABEL_CONFIG.minFontSize +
        (LABEL_CONFIG.maxFontSize - LABEL_CONFIG.minFontSize) * nodePercentile
      );

      // v0.9.0: Opacity proportional to centrality (highlighted/pinned override to 1.0)
      const labelOpacity = isHighlighted || isPinned ? 1.0 :
        LABEL_CONFIG.minOpacity +
        (LABEL_CONFIG.maxOpacity - LABEL_CONFIG.minOpacity) * nodePercentile;

      // InfraNodus style: Label color matches cluster color
      // Highlighted nodes get gold, pinned nodes get cyan
      const labelColor = isHighlighted ? '#FFD700' : isPinned ? '#00E5FF' : (node.color || '#FFFFFF');
      const labelSprite = createTextSprite(displayName, labelColor, fontSize, labelOpacity);

      if (labelSprite) {
        // Position label above the node - scale position with font size
        const labelOffset = nodeSize + 4 + (fontSize - LABEL_CONFIG.minFontSize) * 0.2;
        labelSprite.position.set(0, labelOffset, 0);
        group.add(labelSprite);
      }
    }

    return group;
  }, [bloomEnabled, bloomIntensity, glowSize, createTextSprite, labelVisibility]);
  // ⚠️ CRITICAL FIX: hoveredNode state removed to avoid hover-driven re-renders.
  // v0.9.0: Replaced currentZoom/calculateLabelThreshold with centralityPercentileMap for InfraNodus-style labeling

  // v0.14.0: Update highlights without recreating node objects (prevents simulation reheat)
  useEffect(() => {
    if (!fgRef.current) return;
    const scene = fgRef.current.scene();
    if (!scene) return;

    // v0.18.0: Determine if any node is currently selected (for 3-tier dimming)
    const hasSelection = highlightedNodes && highlightedNodes.length > 0;
    const selectedNodeId = hasSelection ? highlightedNodes[0] : null;

    scene.traverse((obj: THREE.Object3D) => {
      // Handle meshes (node shapes)
      if (obj instanceof THREE.Mesh && obj.parent?.userData?.nodeId) {
        const nodeId = obj.parent.userData.nodeId;
        const style = nodeStyleMap.get(nodeId);
        if (!style) return;

        const mat = obj.material as THREE.MeshPhongMaterial;
        if (!mat || !mat.color) return;

        const isSelected = nodeId === selectedNodeId;
        const isConnected = style.isHighlighted;

        let targetColor: string;
        if (isSelected) {
          targetColor = '#FFD700';
        } else if (style.isPinned) {
          targetColor = '#00E5FF';
        } else {
          targetColor = style.baseColor || '#888888';
        }

        mat.color.set(targetColor);
        mat.emissive.set(targetColor);

        // v0.18.0: 3-tier opacity dimming
        if (isSelected) {
          mat.opacity = 1.0;
          mat.emissiveIntensity = 0.6;
          obj.parent.scale.setScalar(1.2);
        } else if (isConnected) {
          mat.opacity = 1.0;
          mat.emissiveIntensity = 0.4;
          obj.parent.scale.setScalar(1.0);
        } else if (hasSelection) {
          mat.opacity = 0.15;
          mat.transparent = true;
          mat.emissiveIntensity = 0.05;
          obj.parent.scale.setScalar(1.0);
        } else {
          mat.opacity = 0.85;
          mat.emissiveIntensity = 0.2;
          obj.parent.scale.setScalar(1.0);
        }
      }

      // v0.18.0: Handle sprites (labels) — dim non-connected labels
      if (obj.type === 'Sprite' && obj.parent?.userData?.nodeId) {
        const nodeId = obj.parent.userData.nodeId;
        const style = nodeStyleMap.get(nodeId);
        const sprite = obj as THREE.Sprite;
        if (!sprite.material) return;

        const isSelected = nodeId === selectedNodeId;
        const isConnected = style?.isHighlighted || false;

        if (isSelected || isConnected || style?.isPinned) {
          sprite.material.opacity = 1.0;
        } else if (hasSelection) {
          sprite.material.opacity = 0.05;
        }
        // else: keep existing opacity (centrality-based)
      }
    });
  }, [nodeStyleMap, highlightedNodes]);

  // v0.18.0: Update label visibility/size when centrality data changes (without recreating nodes)
  useEffect(() => {
    if (!fgRef.current) return;
    const scene = fgRef.current.scene();
    if (!scene) return;

    scene.traverse((obj: THREE.Object3D) => {
      if (obj.type === 'Sprite' && obj.parent?.userData?.nodeId) {
        const nodeId = obj.parent.userData.nodeId;
        const percentile = centralityPercentileMap.get(nodeId) ?? 0.5;
        // Update sprite opacity based on new centrality
        const sprite = obj as THREE.Sprite;
        if (sprite.material) {
          const isHighlighted = nodeStyleMap.get(nodeId)?.isHighlighted || false;
          const isPinned = nodeStyleMap.get(nodeId)?.isPinned || false;
          const opacity = isHighlighted || isPinned ? 1.0 :
            0.3 + (1.0 - 0.3) * percentile;
          sprite.material.opacity = opacity;
        }
      }
    });
  }, [centralityPercentileMap, nodeStyleMap]);

  // Link width based on weight with strength-tier differentiation
  // UI-010 FIX: Uses edgeStyleMap for highlight state
  // v0.20.0: Weight-based visual tiers: strong (>0.7), medium (0.3-0.7), weak (<0.3)
  const linkWidth = useCallback((linkData: unknown) => {
    const link = linkData as ForceGraphLink;
    if (link.isGhost) {
      // Ghost edges are thinner with dashed appearance feel
      return 1.5;
    }

    const weight = link.weight || 0.5;

    // Weight-tier base widths
    let baseWidth: number;
    if (weight > 0.7) {
      baseWidth = 1.2;  // Strong: thick
    } else if (weight >= 0.3) {
      baseWidth = 0.6;  // Medium: normal
    } else {
      baseWidth = 0.3;  // Weak: thin
    }

    // BRIDGES_GAP edges get a distinct width
    if (link.relationshipType === 'BRIDGES_GAP') {
      baseWidth = 1.0;
    }

    // Get highlight state from style map
    const edgeStyle = edgeStyleMap.get(link.id);
    const isHighlighted = edgeStyle?.isHighlighted || false;
    const isPinnedEdge = edgeStyle?.isPinnedEdge || false;
    const isLowTrust = edgeStyle?.isLowTrust || false;

    // v0.7.0: Pinned edges are thicker
    if (isHighlighted) return baseWidth * 2;
    if (isPinnedEdge) return baseWidth * 1.5;
    if (isLowTrust) return Math.max(0.25, baseWidth * 0.75);
    return baseWidth;
  }, [edgeStyleMap]);

  // Link color - Cluster-based coloring (InfraNodus-style)
  // UI-010 FIX: Uses edgeStyleMap for highlight state
  // Phase 12B: SAME_AS edge LOD (hide when camera distance > 800)
  const linkColor = useCallback((linkData: unknown) => {
    const link = linkData as ForceGraphLink;

    // Phase 12B: Hide SAME_AS edges when zoomed out (camera distance > 800)
    if (link.relationshipType === 'SAME_AS' && showSameAsEdges && currentZoomRef.current > 800) {
      return 'rgba(0, 0, 0, 0)'; // Fully transparent when LOD threshold exceeded
    }

    // Ghost edges: amber/orange with transparency based on similarity
    if (link.isGhost) {
      const alpha = 0.4 + (link.similarity || 0.5) * 0.4;
      return `rgba(255, 170, 0, ${alpha})`;
    }

    // UI-010 FIX: Get highlight state from style map
    const edgeStyle = edgeStyleMap.get(link.id);
    const isHighlighted = edgeStyle?.isHighlighted || false;

    // Highlighted edges: gold
    if (isHighlighted) {
      return 'rgba(255, 215, 0, 0.8)';
    }

    // v0.7.0: Pinned edges (between pinned nodes) - cyan
    if (edgeStyle?.isPinnedEdge) {
      return 'rgba(0, 229, 255, 0.7)';  // Cyan for pinned edges
    }

    // Low-trust edges: subdued amber for caution visibility.
    if (edgeStyle?.isLowTrust) {
      return 'rgba(245, 158, 11, 0.28)';
    }

    // Get source and target node IDs
    const sourceId = typeof link.source === 'string' ? link.source : (link.source as ForceGraphNode).id;
    const targetId = typeof link.target === 'string' ? link.target : (link.target as ForceGraphNode).id;

    // v0.18.0: 3-tier edge dimming — dim edges not connected to selected node
    if (highlightedNodes && highlightedNodes.length > 0) {
      const sourceStyle = nodeStyleMap.get(sourceId);
      const targetStyle = nodeStyleMap.get(targetId);
      const sourceConnected = sourceStyle?.isHighlighted || sourceStyle?.isPinned || false;
      const targetConnected = targetStyle?.isHighlighted || targetStyle?.isPinned || false;
      if (!sourceConnected && !targetConnected) {
        return 'rgba(255, 255, 255, 0.15)';
      }
    }

    // v0.20.0: Weight-based opacity tiers for visual differentiation
    const weight = link.weight || 0.5;
    let weightOpacity: number;
    if (weight > 0.7) {
      weightOpacity = 0.7;   // Strong: full visibility
    } else if (weight >= 0.3) {
      weightOpacity = 0.55;  // Medium: clear visibility
    } else {
      weightOpacity = 0.35;  // Weak: still visible
    }

    // v0.18.0: Semantic edge coloring by relationship type
    const relColor = RELATIONSHIP_COLORS[link.relationshipType];
    if (relColor) {
      // BRIDGES_GAP uses its own gold color at higher opacity
      if (link.relationshipType === 'BRIDGES_GAP') {
        return hexToRgba(relColor, 0.7);
      }
      return hexToRgba(relColor, weightOpacity);
    }

    // Get cluster IDs for source and target
    const sourceCluster = nodeClusterMap.get(sourceId);
    const targetCluster = nodeClusterMap.get(targetId);

    // Same cluster: use cluster color with weight-scaled opacity
    if (sourceCluster !== undefined && sourceCluster === targetCluster) {
      const clusterColor = clusterColorMap.get(sourceCluster);
      if (clusterColor) {
        return hexToRgba(clusterColor, weightOpacity);
      }
    }

    // Cross-cluster: blend colors if both have cluster assignments
    if (sourceCluster !== undefined && targetCluster !== undefined && sourceCluster !== targetCluster) {
      const sourceColor = clusterColorMap.get(sourceCluster);
      const targetColor = clusterColorMap.get(targetCluster);
      if (sourceColor && targetColor) {
        // blendColors already uses 0.35 opacity; scale by weight tier
        const blendAlpha = weight > 0.7 ? 0.6 : weight >= 0.3 ? 0.4 : 0.25;
        const r1 = parseInt(sourceColor.slice(1, 3), 16);
        const g1 = parseInt(sourceColor.slice(3, 5), 16);
        const b1 = parseInt(sourceColor.slice(5, 7), 16);
        const r2 = parseInt(targetColor.slice(1, 3), 16);
        const g2 = parseInt(targetColor.slice(3, 5), 16);
        const b2 = parseInt(targetColor.slice(5, 7), 16);
        const r = Math.round((r1 + r2) / 2);
        const g = Math.round((g1 + g2) / 2);
        const b = Math.round((b1 + b2) / 2);
        return `rgba(${r}, ${g}, ${b}, ${blendAlpha})`;
      }
    }

    // Default: white with weight-scaled opacity
    return `rgba(255, 255, 255, ${Math.max(0.2, weightOpacity * 0.6)})`;
  }, [edgeStyleMap, nodeClusterMap, clusterColorMap, hexToRgba, showSameAsEdges, highlightedNodes, nodeStyleMap]);

  // Custom link rendering for ghost edges, SAME_AS edges, and BRIDGES_GAP edges (dashed lines)
  const linkThreeObject = useCallback((linkData: unknown) => {
    const link = linkData as ForceGraphLink;

    // Phase 11F: Render SAME_AS edges as dashed purple lines
    if (link.relationshipType === 'SAME_AS') {
      const geometry = new THREE.BufferGeometry();
      const material = new THREE.LineDashedMaterial({
        color: 0x9D4EDD, // Purple (accent-violet)
        dashSize: 2,
        gapSize: 1.5,
        opacity: 0.7,
        transparent: true,
      });

      const line = new THREE.Line(geometry, material);
      line.computeLineDistances();

      return line;
    }

    // v0.20.0: Render BRIDGES_GAP edges as dashed gold lines
    if (link.relationshipType === 'BRIDGES_GAP') {
      const geometry = new THREE.BufferGeometry();
      const material = new THREE.LineDashedMaterial({
        color: 0xFFD700, // Gold
        dashSize: 4,
        gapSize: 2.5,
        opacity: 0.8,
        transparent: true,
      });

      const line = new THREE.Line(geometry, material);
      line.computeLineDistances();

      return line;
    }

    if (!link.isGhost) {
      return null; // Use default rendering for regular edges
    }

    // Create dashed line for ghost edges
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.LineDashedMaterial({
      color: 0xffaa00,
      dashSize: 3,
      gapSize: 2,
      opacity: 0.6,
      transparent: true,
    });

    const line = new THREE.Line(geometry, material);
    line.computeLineDistances();

    return line;
  }, []);

  // Update ghost edge and SAME_AS edge positions
  const linkPositionUpdate = useCallback((line: THREE.Object3D, coords: { start: { x: number; y: number; z: number }; end: { x: number; y: number; z: number } }, linkData: unknown) => {
    const link = linkData as ForceGraphLink;

    // Phase 11F + v0.20.0: Handle SAME_AS, BRIDGES_GAP, and ghost edges (dashed lines)
    if ((link.isGhost || link.relationshipType === 'SAME_AS' || link.relationshipType === 'BRIDGES_GAP') && line instanceof THREE.Line) {
      const positions = new Float32Array([
        coords.start.x, coords.start.y, coords.start.z,
        coords.end.x, coords.end.y, coords.end.z
      ]);
      line.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      line.computeLineDistances();
      return true;
    }
    return false;
  }, []);

  // Focus camera on node helper function
  const focusCameraOnNode = useCallback((node: ForceGraphNode) => {
    if (fgRef.current && node.x !== undefined && node.y !== undefined && node.z !== undefined) {
      const distance = 200;
      fgRef.current.cameraPosition(
        { x: node.x, y: node.y, z: node.z + distance },
        { x: node.x, y: node.y, z: node.z },
        1000
      );
    }
  }, []);

  // Node click handler - selects node, double-click focuses camera
  const handleNodeClick = useCallback((nodeData: unknown, event: MouseEvent) => {
    const node = nodeData as ForceGraphNode;
    const now = Date.now();

    // v0.7.0: Shift+click to toggle pin
    if (event.shiftKey) {
      if (pinnedNodeSet.has(node.id)) {
        onNodeUnpin?.(node.id);
      } else {
        onNodePin?.(node.id);
      }
      return; // Don't proceed with normal click behavior
    }

    // Check for double-click
    if (
      lastClickRef.current &&
      lastClickRef.current.nodeId === node.id &&
      now - lastClickRef.current.timestamp < DOUBLE_CLICK_THRESHOLD
    ) {
      // Double-click detected - focus camera on node AND unpin it
      focusCameraOnNode(node);
      // UI-010: Unpin node on double-click (allows user to release pinned nodes)
      node.fx = undefined;
      node.fy = undefined;
      node.fz = undefined;
      lastClickRef.current = null; // Reset after double-click
      return;
    }

    // Single click - update last click reference and trigger selection
    lastClickRef.current = { nodeId: node.id, timestamp: now };

    if (onNodeClick) {
      const originalNode = nodes.find(n => n.id === node.id);
      if (originalNode) {
        onNodeClick(originalNode);
      }
    }
    // Note: Camera focus only happens on double-click for stable UX
  }, [nodes, onNodeClick, focusCameraOnNode, pinnedNodeSet, onNodePin, onNodeUnpin]);

  // Node right-click handler - alternative way to focus camera on node
  const handleNodeRightClick = useCallback((nodeData: unknown) => {
    const node = nodeData as ForceGraphNode;
    focusCameraOnNode(node);
  }, [focusCameraOnNode]);

  // Node hover handler - v0.11.0: debounced to prevent jitter
  // v0.17.0: Uses nodesRef.current to avoid nodes dependency causing callback recreation
  const handleNodeHover = useCallback((nodeData: unknown) => {
    const node = nodeData as ForceGraphNode | null;
    const newId = node?.id || null;

    // Only process if actually changed
    if (newId !== hoveredNodeRef.current) {
      hoveredNodeRef.current = newId;
      if (graphContainerRef.current) {
        graphContainerRef.current.style.cursor = newId ? 'pointer' : 'default';
      }

      // If no consumer callback, skip scheduling work and only update cursor.
      if (!onNodeHover) {
        return;
      }

      // Debounce the state update to prevent jitter
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = setTimeout(() => {
        if (onNodeHover) {
          if (node) {
            const originalNode = nodesRef.current.find(n => n.id === node.id);
            onNodeHover(originalNode || null);
          } else {
            onNodeHover(null);
          }
        }
      }, 50);
    }
  }, [onNodeHover]);

  // Background click handler
  const handleBackgroundClick = useCallback(() => {
    onBackgroundClick?.();
  }, [onBackgroundClick]);

  // Expose ref methods
  useImperativeHandle(ref, () => ({
    focusOnNode: (nodeId: string) => {
      if (!fgRef.current) return;
      const node = graphData.nodes.find(n => n.id === nodeId);
      if (node && node.x !== undefined && node.y !== undefined && node.z !== undefined) {
        fgRef.current.cameraPosition(
          { x: node.x, y: node.y, z: node.z + 200 },
          { x: node.x, y: node.y, z: node.z },
          1000
        );
      }
    },
    focusOnCluster: (clusterId: number) => {
      if (!fgRef.current) return;
      const clusterNodes = graphData.nodes.filter(n => n.clusterId === clusterId);
      if (clusterNodes.length === 0) return;

      // Calculate cluster centroid
      let sumX = 0, sumY = 0, sumZ = 0;
      clusterNodes.forEach(n => {
        sumX += n.x || 0;
        sumY += n.y || 0;
        sumZ += n.z || 0;
      });
      const centroid = {
        x: sumX / clusterNodes.length,
        y: sumY / clusterNodes.length,
        z: sumZ / clusterNodes.length,
      };

      fgRef.current.cameraPosition(
        { x: centroid.x, y: centroid.y, z: centroid.z + 400 },
        centroid,
        1000
      );
    },
    focusOnGap: (gap: StructuralGap) => {
      if (!fgRef.current) return;

      // Find nodes in both clusters
      const clusterANodes = graphData.nodes.filter(n =>
        gap.cluster_a_concepts.includes(n.id)
      );
      const clusterBNodes = graphData.nodes.filter(n =>
        gap.cluster_b_concepts.includes(n.id)
      );

      const allNodes = [...clusterANodes, ...clusterBNodes];
      if (allNodes.length === 0) return;

      // Calculate midpoint between clusters
      let sumX = 0, sumY = 0, sumZ = 0;
      allNodes.forEach(n => {
        sumX += n.x || 0;
        sumY += n.y || 0;
        sumZ += n.z || 0;
      });
      const midpoint = {
        x: sumX / allNodes.length,
        y: sumY / allNodes.length,
        z: sumZ / allNodes.length,
      };

      fgRef.current.cameraPosition(
        { x: midpoint.x, y: midpoint.y, z: midpoint.z + 350 },
        midpoint,
        1000
      );
    },
    resetCamera: () => {
      if (fgRef.current) {
        fgRef.current.cameraPosition({ x: 0, y: 0, z: 500 }, { x: 0, y: 0, z: 0 }, 1000);
      }
    },
    getCamera: () => fgRef.current?.camera(),
    clearPinnedNodes: () => {
      onClearPinnedNodes?.();
    },
  }), [graphData, onClearPinnedNodes]);

  // Auto-focus on gap when selected
  useEffect(() => {
    if (selectedGap && fgRef.current) {
      // Small delay to ensure graph is rendered
      setTimeout(() => {
        const allGapNodes = [
          ...selectedGap.cluster_a_concepts,
          ...selectedGap.cluster_b_concepts,
          ...selectedGap.bridge_candidates,
        ];

        const gapNodes = graphData.nodes.filter(n => allGapNodes.includes(n.id));
        if (gapNodes.length === 0) return;

        let sumX = 0, sumY = 0, sumZ = 0;
        gapNodes.forEach(n => {
          sumX += n.x || 0;
          sumY += n.y || 0;
          sumZ += n.z || 0;
        });
        const center = {
          x: sumX / gapNodes.length,
          y: sumY / gapNodes.length,
          z: sumZ / gapNodes.length,
        };

        fgRef.current.cameraPosition(
          { x: center.x, y: center.y, z: center.z + 300 },
          center,
          1000
        );
      }, 100);
    }
  }, [selectedGap, graphData.nodes]);

  // Initial camera setup
  useEffect(() => {
    if (fgRef.current) {
      // Set initial camera distance
      setTimeout(() => {
        fgRef.current?.cameraPosition({ x: 0, y: 0, z: 500 });
      }, 500);
    }
  }, []);

  // v0.7.0: Track camera zoom level for adaptive labels
  // v0.10.0: Bucket-based updates to prevent jitter (only update state on threshold change)
  useEffect(() => {
    if (!fgRef.current) return;

    const checkCameraDistance = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      const camera = fgRef.current?.camera();
      if (camera) {
        const distance = camera.position.length();
        // Only update React state when zoom crosses a 50-unit bucket boundary
        const bucket = Math.round(distance / 50) * 50;
        if (bucket !== currentZoomRef.current) {
          currentZoomRef.current = bucket;
          setCurrentZoom(bucket);
        }
      }
    };

    // Check periodically (controls event listener may not be accessible)
    const intervalId = setInterval(checkCameraDistance, 750);

    return () => clearInterval(intervalId);
  }, []);

  // Cleanup hover timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    };
  }, []);

  // v0.14.1: Hardened WebGL cleanup — try-catch prevents INVALID_OPERATION on context change
  useEffect(() => {
    return () => {
      // 1. Dispose all cached textures
      textureCache.current.forEach((texture) => {
        try { texture.dispose(); } catch { /* context changed */ }
      });
      textureCache.current.clear();

      // 2. Dispose scene resources
      if (fgRef.current) {
        try {
          const scene = fgRef.current.scene();
          if (scene) {
            scene.traverse((obj: THREE.Object3D) => {
              try {
                if (obj instanceof THREE.Mesh) {
                  obj.geometry?.dispose();
                  if (obj.material instanceof THREE.Material) {
                    (obj.material as any).map?.dispose();
                    obj.material.dispose();
                  } else if (Array.isArray(obj.material)) {
                    obj.material.forEach((m) => {
                      try { (m as any).map?.dispose(); m.dispose(); } catch { /* already disposed */ }
                    });
                  }
                }
                if (obj instanceof THREE.Sprite) {
                  obj.material.map?.dispose();
                  obj.material.dispose();
                }
              } catch { /* disposed or wrong context */ }
            });
          }
        } catch { /* scene unavailable */ }

        // 3. Renderer explicit disposal
        try {
          const renderer = fgRef.current.renderer();
          if (renderer) {
            renderer.dispose();
            renderer.forceContextLoss();
          }
        } catch { /* already disposed */ }
      }

      // 4. Clear position cache
      nodePositionsRef.current.clear();
    };
  }, []);

  // v0.19.0: Cluster overlay - convex hulls + gap lines
  // SEPARATE useEffect to avoid nodeThreeObject dependency contamination
  const clusterOverlayRef = useRef<THREE.Group | null>(null);
  const frameCountRef = useRef(0);

  useEffect(() => {
    if (!fgRef.current || !showClusterOverlay || !clusters?.length) {
      // Clean up existing overlay
      if (clusterOverlayRef.current && fgRef.current) {
        try {
          fgRef.current.scene().remove(clusterOverlayRef.current);
        } catch { /* scene unavailable */ }
        clusterOverlayRef.current = null;
      }
      return;
    }

    const scene = fgRef.current.scene();
    if (!scene) return;

    // Create overlay group
    if (clusterOverlayRef.current) {
      scene.remove(clusterOverlayRef.current);
    }
    const overlayGroup = new THREE.Group();
    overlayGroup.name = 'cluster-overlay-v019';
    clusterOverlayRef.current = overlayGroup;
    scene.add(overlayGroup);

    // Build cluster position map from current node positions
    const updateOverlay = () => {
      frameCountRef.current++;
      if (frameCountRef.current % 30 !== 0) return; // Update every 30 frames

      // Clear previous overlay children
      while (overlayGroup.children.length > 0) {
        const child = overlayGroup.children[0];
        overlayGroup.remove(child);
        if ((child as any).geometry) (child as any).geometry.dispose();
        if ((child as any).material) (child as any).material.dispose();
      }

      const graphDataCurrent = fgRef.current?.graphData();
      if (!graphDataCurrent?.nodes) return;

      const nodePositions = new Map<string, { x: number; y: number; z: number }>();
      (graphDataCurrent.nodes as ForceGraphNode[]).forEach((n) => {
        if (n.x !== undefined && n.y !== undefined && n.z !== undefined) {
          nodePositions.set(n.id, { x: n.x, y: n.y, z: n.z });
        }
      });

      // For each cluster, compute centroid and hull
      const clusterCentroids = new Map<number, THREE.Vector3>();

      clusters.forEach((cluster, idx) => {
        const positions = cluster.concepts
          .map((id: string) => nodePositions.get(id))
          .filter(Boolean) as { x: number; y: number; z: number }[];

        if (positions.length < 2) return;

        // Compute centroid
        const centroid = new THREE.Vector3(
          positions.reduce((s, p) => s + p.x, 0) / positions.length,
          positions.reduce((s, p) => s + p.y, 0) / positions.length,
          positions.reduce((s, p) => s + p.z, 0) / positions.length,
        );
        clusterCentroids.set(cluster.cluster_id, centroid);

        // Convex hull on XY plane (simplified 2D projection)
        const points2D = positions.map(p => new THREE.Vector2(p.x, p.y));
        const hull = computeConvexHull2D(points2D);
        if (hull.length < 3) return;

        // Create Catmull-Rom smoothed shape (6A: organic blobs)
        const curve = new THREE.CatmullRomCurve3(
          hull.map(p => new THREE.Vector3(p.x, p.y, centroid.z - 5)),
          true, // closed
          'catmullrom',
          0.5
        );
        const curvePoints = curve.getPoints(hull.length * 8);
        const shape = new THREE.Shape(curvePoints.map(p => new THREE.Vector2(p.x, p.y)));

        const color = clusterColorMap.get(cluster.cluster_id) || CLUSTER_COLORS[idx % CLUSTER_COLORS.length];
        // Density-based opacity (6A: denser = more saturated)
        const opacity = 0.08 + (cluster.density || 0) * 0.12;

        const geometry = new THREE.ShapeGeometry(shape);
        const material = new THREE.MeshBasicMaterial({
          color: new THREE.Color(color),
          transparent: true,
          opacity,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.z = centroid.z - 5;
        mesh.userData = {
          type: 'cluster-hull',
          clusterId: cluster.cluster_id,
          conceptNames: cluster.concept_names?.slice(0, 5) || [],
          label: cluster.label || `Cluster ${cluster.cluster_id + 1}`,
        };
        overlayGroup.add(mesh);
      });

      // Gap lines between cluster centroids
      if (gapsProp?.length) {
        gapsProp.forEach(gap => {
          const centroidA = clusterCentroids.get(gap.cluster_a_id);
          const centroidB = clusterCentroids.get(gap.cluster_b_id);
          if (!centroidA || !centroidB) return;

          // 6C: Gap strength color gradient
          const strength = gap.gap_strength;
          let gapColor: THREE.Color;
          if (strength < 0.05) {
            gapColor = new THREE.Color('#FF4444'); // Strong gap = red = high opportunity
          } else if (strength < 0.15) {
            gapColor = new THREE.Color('#FFD700'); // Moderate = amber
          } else {
            gapColor = new THREE.Color('#44FF44'); // Weak gap = green
          }

          const lineGeometry = new THREE.BufferGeometry().setFromPoints([centroidA, centroidB]);
          const lineMaterial = new THREE.LineDashedMaterial({
            color: gapColor,
            dashSize: 3,
            gapSize: 2,
            linewidth: 1,
            transparent: true,
            opacity: 0.7,
          });
          const line = new THREE.Line(lineGeometry, lineMaterial);
          line.computeLineDistances();
          overlayGroup.add(line);

          // Gap hotspot at midpoint (pulsing sphere)
          const midpoint = new THREE.Vector3().lerpVectors(centroidA, centroidB, 0.5);
          const sphereGeo = new THREE.SphereGeometry(2, 16, 16);
          const sphereMat = new THREE.MeshBasicMaterial({
            color: gapColor,
            transparent: true,
            opacity: 0.6,
          });
          const sphere = new THREE.Mesh(sphereGeo, sphereMat);
          sphere.position.copy(midpoint);
          sphere.userData = { type: 'gap-hotspot', gapId: gap.id, pulse: strength < 0.05 };
          overlayGroup.add(sphere);
        });
      }
    };

    // Register frame callback
    const interval = setInterval(updateOverlay, 500); // Update every 500ms as fallback
    updateOverlay(); // Initial render

    return () => {
      clearInterval(interval);
      if (clusterOverlayRef.current && fgRef.current?.scene()) {
        try {
          fgRef.current.scene().remove(clusterOverlayRef.current);
        } catch { /* scene unavailable */ }
        clusterOverlayRef.current = null;
      }
    };
  }, [showClusterOverlay, clusters, gapsProp, clusterColorMap]);

  // v0.19.0: Pulse animation for strongest gap hotspots
  useEffect(() => {
    if (!clusterOverlayRef.current) return;
    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      clusterOverlayRef.current?.traverse(child => {
        if (child.userData?.pulse && child instanceof THREE.Mesh) {
          const scale = 1 + Math.sin(Date.now() * 0.003) * 0.3;
          child.scale.setScalar(scale);
        }
      });
    };
    if (showClusterOverlay) animate();
    return () => cancelAnimationFrame(animId);
  }, [showClusterOverlay]);

  // E2E Mock Mode - Early return AFTER all hooks have been called
  if (E2E_MOCK_3D) {
    const lowTrustEdgeCount = edges.filter((edge) => {
      const confidence = typeof edge.properties?.confidence === 'number'
        ? edge.properties.confidence
        : (edge.weight || 1);
      return confidence < 0.6;
    }).length;

    const ghostEdgeCount = showGhostEdges ? potentialEdges.length : 0;

    return (
      <div className="w-full h-full bg-[#0d1117] p-4 border border-white/10" data-testid="graph3d-e2e-mock">
        <div className="font-mono text-xs text-accent-teal uppercase tracking-wide mb-2">
          Graph3D E2E Mock Mode
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs text-muted">
          <div data-testid="graph3d-node-count">nodes: {nodes.length}</div>
          <div data-testid="graph3d-edge-count">edges: {edges.length}</div>
          <div data-testid="graph3d-low-trust-count">low_trust_edges: {lowTrustEdgeCount}</div>
          <div data-testid="graph3d-ghost-edge-count">ghost_edges: {ghostEdgeCount}</div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={graphContainerRef}
      className="w-full h-full bg-[#0d1117]"
    >
      <ForceGraph3D
        ref={fgRef}
        graphData={graphData}
        // UI-010 FIX: Explicit node ID prop for stable tracking
        nodeId="id"
        nodeThreeObject={nodeThreeObject}
        nodeLabel={(nodeData: unknown) => {
          const node = nodeData as ForceGraphNode;
          const isTableSourced = (node.properties as any)?.source_type === 'table';
          const tablePage = (node.properties as any)?.table_page;
          const tableIndex = (node.properties as any)?.table_index;

          // Phase 11F: Check for SAME_AS connections (cross-paper entities)
          const sameAsEdges = graphData.links.filter(link =>
            link.relationshipType === 'SAME_AS' &&
            (link.source === node.id || (typeof link.source === 'object' && (link.source as ForceGraphNode).id === node.id) ||
             link.target === node.id || (typeof link.target === 'object' && (link.target as ForceGraphNode).id === node.id))
          );
          const crossPaperCount = sameAsEdges.length > 0 ? sameAsEdges.length + 1 : 0;

          return `
            <div style="background: rgba(0,0,0,0.8); padding: 8px 12px; border-radius: 4px; font-family: monospace; font-size: 12px;">
              <div style="font-weight: bold; color: ${node.color || '#888'};">${node.name || 'Unknown'}</div>
              <div style="color: #888; margin-top: 4px;">${node.entityType || 'Entity'}</div>
              ${node.centrality ? `<div style="color: #4ECDC4; margin-top: 2px;">Centrality: ${(node.centrality * 100).toFixed(1)}%</div>` : ''}
              ${node.isBridge ? '<div style="color: #FFD700; margin-top: 2px;">Bridge Node</div>' : ''}
              ${crossPaperCount > 0 ? `<div style="color: #9D4EDD; margin-top: 2px;">🔗 This concept is mentioned in ${crossPaperCount} papers</div>` : ''}
              ${isTableSourced ? `<div style="color: #F59E0B; margin-top: 2px;">📊 From Table${tablePage ? ` (p.${tablePage})` : ''}${tableIndex !== undefined ? ` #${tableIndex + 1}` : ''}</div>` : ''}
            </div>
          `;
        }}
        linkWidth={linkWidth}
        linkColor={linkColor}
        linkOpacity={0.6}
        linkThreeObject={linkThreeObject as never}
        linkPositionUpdate={linkPositionUpdate as never}
        backgroundColor="#0d1117"
        onNodeClick={handleNodeClick}
        onNodeRightClick={handleNodeRightClick}  // Right-click also focuses camera on node
        onNodeHover={handleNodeHover}
        onBackgroundClick={handleBackgroundClick}
        // UI-010 COMPREHENSIVE FIX: Drag handlers with proper simulation control
        // Key insight: The node object must have fx/fy/fz set to prevent physics from moving it
        onNodeDrag={(node) => {
          // Pin node to cursor position during drag
          // This is crucial - fx/fy/fz tells the physics engine "don't touch this node"
          node.fx = node.x;
          node.fy = node.y;
          node.fz = node.z;
          // Save to ref for persistence across re-renders
          const nodeId = String(node.id);
          if (nodeId && node.x !== undefined && node.y !== undefined && node.z !== undefined) {
            nodePositionsRef.current.set(nodeId, {
              x: node.x,
              y: node.y,
              z: node.z,
              fx: node.fx,
              fy: node.fy,
              fz: node.fz,
            });
          }
        }}
        onNodeDragEnd={(node) => {
          // v0.9.0: Release node to physics after drag (user can re-drag to reposition)
          node.fx = undefined;
          node.fy = undefined;
          node.fz = undefined;
          // Save position but don't pin
          const nodeId = String(node.id);
          if (nodeId && node.x !== undefined && node.y !== undefined && node.z !== undefined) {
            nodePositionsRef.current.set(nodeId, {
              x: node.x,
              y: node.y,
              z: node.z,
              fx: undefined,
              fy: undefined,
              fz: undefined,
            });
          }
        }}
        // UI-010 ENHANCED: Force simulation parameters for smooth, stable interaction
        // Problem: Nodes vibrate rapidly, rubber-banding effect, struggling to settle
        // Solution: HIGH damping + MODERATE cooling = stable without being sluggish
        //
        // v0.9.0: Physics parameters optimized for natural floating feel
        warmupTicks={50}
        cooldownTicks={200}            // Fast stabilization, freeze after
        d3AlphaDecay={0.0228}          // D3 default
        d3VelocityDecay={0.75}         // Strong damping, minimal drift
        d3AlphaMin={0.001}             // Lower threshold for finer settling
        // CRITICAL: Disable auto-refresh of simulation when data changes
        // This prevents the "explosion" effect when highlighting changes
        enableNodeDrag={true}
        onEngineStop={() => {
          // Mark initial render as complete
          isInitialRenderRef.current = false;
          // Freeze all nodes in place to prevent micro-drift
        if (fgRef.current) {
            const currentNodes = fgRef.current.graphData()?.nodes;
            if (currentNodes) {
              currentNodes.forEach((n: ForceGraphNode) => {
                if (n.x !== undefined && n.y !== undefined && n.z !== undefined) {
                  // Preserve explicit user pins, release everything else.
                  if (pinnedNodeSet.has(n.id)) {
                    n.fx = n.x;
                    n.fy = n.y;
                    n.fz = n.z;
                  } else {
                    n.fx = undefined;
                    n.fy = undefined;
                    n.fz = undefined;
                    (n as any).vx = 0;
                    (n as any).vy = 0;
                    (n as any).vz = 0;
                  }
                  nodePositionsRef.current.set(n.id, {
                    x: n.x, y: n.y, z: n.z,
                    fx: pinnedNodeSet.has(n.id) ? n.x : undefined,
                    fy: pinnedNodeSet.has(n.id) ? n.y : undefined,
                    fz: pinnedNodeSet.has(n.id) ? n.z : undefined,
                  });
                }
              });
            }
          }
        }}
      />
    </div>
  );
});

Graph3D.displayName = 'Graph3D';

export default Graph3D;
