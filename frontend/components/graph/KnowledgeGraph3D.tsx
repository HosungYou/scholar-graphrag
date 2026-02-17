'use client';

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { Graph3D, Graph3DRef } from './Graph3D';
import { GapPanel } from './GapPanel';
import { DraggablePanel } from '../ui/DraggablePanel';
import { GraphLegend } from './GraphLegend';
import { StatusBar } from './StatusBar';
import { NodeDetails } from './NodeDetails';
import { ConceptExplorer } from './ConceptExplorer';  // v0.18.0: Relationship exploration panel
import { InsightHUD } from './InsightHUD';
import { TopicViewMode } from './TopicViewMode';
import { GapsViewMode } from './GapsViewMode';  // UI-010: Gaps View Mode
import { TemporalView } from './TemporalView';  // v0.12.1: Temporal Timeline
import { EdgeContextModal } from './EdgeContextModal';  // UI-011: Relationship Evidence
import EntityTypeLegend from './EntityTypeLegend';  // v0.10.0: Entity type legend
import { ReasoningPathOverlay } from './ReasoningPathOverlay';  // v0.25: Reasoning Path Visualization
import { ClusterDrillDown } from './ClusterDrillDown';  // v0.25: Cluster DrillDown
import { PerformanceOverlay } from './PerformanceOverlay';  // v0.25: Performance Monitor
import { ResearchReport } from './ResearchReport';  // v0.30.0: Research Summary Report
import { PaperFitPanel } from './PaperFitPanel';  // v0.30.0: Paper Fit Analysis
import { TemporalDashboard } from './TemporalDashboard';  // v0.30.0: Temporal Trends Dashboard
import { useGraphStore } from '@/hooks/useGraphStore';
import { useGraph3DStore, applyLOD } from '@/hooks/useGraph3DStore';
import { useGraphKeyboard, KEYBOARD_SHORTCUTS } from '@/hooks/useGraphKeyboard';
import type { GraphData, GraphEntity, EntityType, StructuralGap, GraphEdge, ViewMode, ConceptCluster } from '@/types';
import {
  Box,
  Grid3X3,
  Grid2X2,
  Sparkles,
  Info,
  RotateCcw,
  BarChart3,
  Calendar,
  FileText,
  Search,
} from 'lucide-react';

interface KnowledgeGraph3DProps {
  projectId: string;
  onNodeClick?: (nodeId: string, nodeData: GraphEntity) => void;
  onAskQuestion?: (question: string) => void;
  onDebugCameraReset?: () => void;
  onDebugGapFocus?: (gapId: string) => void;
  // v0.25: Reasoning path trace from chat retrieval
  traceNodeIds?: string[];
}

export function KnowledgeGraph3D({
  projectId,
  onNodeClick,
  onAskQuestion,
  onDebugCameraReset,
  onDebugGapFocus,
  traceNodeIds,
}: KnowledgeGraph3DProps) {
  const graph3DRef = useRef<Graph3DRef>(null);
  const [selectedNode, setSelectedNode] = useState<GraphEntity | null>(null);
  const [showLegend, setShowLegend] = useState(true);
  const [showGapPanel, setShowGapPanel] = useState(true);
  const [showInsightHUD, setShowInsightHUD] = useState(true);
  const [isGapPanelMinimized, setIsGapPanelMinimized] = useState(false);
  // UI-011: Edge context modal state for Relationship Evidence
  const [selectedEdge, setSelectedEdge] = useState<GraphEdge | null>(null);
  const [edgeModalOpen, setEdgeModalOpen] = useState(false);
  // v0.25: Reasoning Path Overlay state
  const showReasoningPath = traceNodeIds && traceNodeIds.length > 0;
  // v0.25: Cluster DrillDown state
  const [drillDownCluster, setDrillDownCluster] = useState<ConceptCluster | null>(null);
  // v0.25: Performance Overlay state
  const [showPerformance, setShowPerformance] = useState(false);
  // v0.30.0: Paper Fit panel state
  const [showPaperFit, setShowPaperFit] = useState(false);

  // Graph store (existing)
  const {
    graphData,
    getFilteredData,
    fetchGraphData,
    isLoading,
    error,
    gaps,
    clusters,
    centralityMetrics,
    isGapLoading,
    fetchGapAnalysis,
    setHighlightedNodes,
    setHighlightedEdges,
    highlightedNodes,
    highlightedEdges,
    clearHighlights,
    selectedGap,
    setSelectedGap,
    viewMode,
    setViewMode,
    filters,  // Phase 4 FIX: Subscribe to filters for reactive filtering
    // v0.7.0: Node pinning
    pinnedNodes,
    addPinnedNode,
    removePinnedNode,
    clearPinnedNodes,
  } = useGraphStore();

  // 3D-specific store
  const {
    view3D,
    centrality,
    fetchCentrality,
    getVisiblePercentage,
  } = useGraph3DStore();

  // Fetch data on mount
  useEffect(() => {
    const viewContext =
      viewMode === 'topic' || viewMode === 'gaps' || viewMode === 'temporal' || viewMode === 'summary'
        ? 'concept'
        : 'hybrid';

    fetchGraphData(projectId, { viewContext });
    fetchGapAnalysis(projectId);
    fetchCentrality(projectId);
  }, [projectId, fetchGraphData, fetchGapAnalysis, fetchCentrality, viewMode]);

  // Get filtered data with LOD applied
  const rawDisplayData = useMemo(() => {
    const filteredData = getFilteredData();
    if (!filteredData) return null;

    if (!view3D.lodEnabled) {
      return filteredData;
    }

    const visiblePercentage = getVisiblePercentage();
    const visibleNodes = applyLOD(filteredData.nodes, centrality, visiblePercentage);
    const visibleNodeIds = new Set(visibleNodes.map(n => n.id));

    return {
      nodes: visibleNodes,
      edges: filteredData.edges.filter(
        e => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target)
      ),
    };
  }, [getFilteredData, view3D.lodEnabled, centrality, getVisiblePercentage, filters]);

  const displayDataRef = useRef<GraphData | null>(null);

  const displayData = useMemo<GraphData | null>(() => {
    if (!rawDisplayData) {
      displayDataRef.current = null;
      return null;
    }

    const prev = displayDataRef.current;
    const sameNodeCount = prev?.nodes.length === rawDisplayData.nodes.length;
    const sameEdgeCount = prev?.edges.length === rawDisplayData.edges.length;

    const sameNodes = sameNodeCount && rawDisplayData.nodes.every((node, index) => (
      prev?.nodes[index]?.id === node.id &&
      prev?.nodes[index]?.entity_type === node.entity_type &&
      prev?.nodes[index]?.name === node.name
    ));

    const sameEdges = sameEdgeCount && rawDisplayData.edges.every((edge, index) => (
      prev?.edges[index]?.id === edge.id &&
      prev?.edges[index]?.source === edge.source &&
      prev?.edges[index]?.target === edge.target &&
      prev?.edges[index]?.relationship_type === edge.relationship_type
    ));

    if (prev && sameNodes && sameEdges) {
      return prev;
    }

    displayDataRef.current = rawDisplayData;
    return rawDisplayData;
  }, [rawDisplayData]);

  // Phase 4 FIX: Added `filters` to re-render when filter state changes
  const displayNodes = displayData?.nodes ?? [];

  // Handle node click
  const handleNodeClick = useCallback((node: GraphEntity) => {
    setSelectedNode(node);

    // Find connected edges
    const filteredData = getFilteredData();
    if (!filteredData) return;

    const connectedEdges = filteredData.edges.filter(
      e => e.source === node.id || e.target === node.id
    );

    // Collect connected node IDs
    const connectedNodeIds = new Set<string>();
    connectedNodeIds.add(node.id);
    connectedEdges.forEach(e => {
      connectedNodeIds.add(e.source);
      connectedNodeIds.add(e.target);
    });

    setHighlightedNodes(Array.from(connectedNodeIds));
    setHighlightedEdges(connectedEdges.map(e => e.id));

    onNodeClick?.(node.id, node);
  }, [getFilteredData, setHighlightedNodes, setHighlightedEdges, onNodeClick]);

  // Handle gap selection
  const handleGapSelect = useCallback((gap: StructuralGap) => {
    setSelectedGap(gap);
    onDebugGapFocus?.(gap.id);

    // Highlight gap nodes
    const allNodes = [
      ...gap.cluster_a_concepts,
      ...gap.cluster_b_concepts,
      ...gap.bridge_candidates,
    ];
    setHighlightedNodes(allNodes);

    // Focus camera on gap
    graph3DRef.current?.focusOnGap(gap);
  }, [setSelectedGap, setHighlightedNodes, onDebugGapFocus]);

  // Handle gap highlight
  const handleGapHighlight = useCallback((nodeIds: string[]) => {
    setHighlightedNodes(nodeIds);
  }, [setHighlightedNodes]);

  // Handle clear highlights
  const handleClearGapHighlights = useCallback(() => {
    clearHighlights();
    setSelectedGap(null);
  }, [clearHighlights, setSelectedGap]);

  // Handle gap refresh
  const handleRefreshGaps = useCallback(async () => {
    await fetchGapAnalysis(projectId);
  }, [projectId, fetchGapAnalysis]);

  // Handle reset camera
  const handleResetCamera = useCallback(() => {
    graph3DRef.current?.resetCamera();
    onDebugCameraReset?.();
  }, [onDebugCameraReset]);

  // Phase 0-3: Keyboard shortcuts
  const { showShortcuts, setShowShortcuts } = useGraphKeyboard({
    enabled: true,
    onFitView: handleResetCamera,
  });

  // v0.25: P key handler for Performance Overlay
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'p' || e.key === 'P') {
        // Don't toggle if user is typing in an input
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
          return;
        }
        setShowPerformance(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  // Handle background click
  const handleBackgroundClick = useCallback(() => {
    setSelectedNode(null);
    clearHighlights();
  }, [clearHighlights]);

  // v0.18.0: Handle relationship click from ConceptExplorer (opens EdgeContextModal)
  const handleRelationshipClick = useCallback((edge: GraphEdge) => {
    setSelectedEdge(edge);
    setEdgeModalOpen(true);
  }, []);

  // UI-011: Handle close edge modal
  const handleCloseEdgeModal = useCallback(() => {
    setEdgeModalOpen(false);
    setSelectedEdge(null);
  }, []);

  const selectedEdgeConfidence = useMemo(() => {
    if (!selectedEdge) return undefined;
    const propConfidence = selectedEdge.properties?.confidence;
    if (typeof propConfidence === 'number') return propConfidence;
    if (typeof selectedEdge.weight === 'number') return selectedEdge.weight;
    return undefined;
  }, [selectedEdge]);

  const selectedEdgeIsLowTrust = useMemo(() => {
    if (typeof selectedEdgeConfidence !== 'number') return false;
    return selectedEdgeConfidence < 0.6;
  }, [selectedEdgeConfidence]);

  const selectedEdgeSourceName = useMemo(() => {
    if (!selectedEdge) return undefined;
    return displayNodes.find((node) => node.id === selectedEdge.source)?.name;
  }, [selectedEdge, displayNodes]);

  const selectedEdgeTargetName = useMemo(() => {
    if (!selectedEdge) return undefined;
    return displayNodes.find((node) => node.id === selectedEdge.target)?.name;
  }, [selectedEdge, displayNodes]);

  // Handle close node details
  const handleCloseNodeDetails = useCallback(() => {
    setSelectedNode(null);
  }, []);

  // v0.18.0: Navigate to another node from ConceptExplorer
  const handleNodeNavigate = useCallback((nodeId: string) => {
    const node = displayNodes.find(n => n.id === nodeId);
    if (node) {
      handleNodeClick(node);
      graph3DRef.current?.focusOnNode(nodeId);
    }
  }, [displayNodes, handleNodeClick]);

  // v0.18.0: Compute centrality percentile for selected node
  const selectedNodeCentrality = useMemo(() => {
    if (!selectedNode || !centralityMetrics?.length) return undefined;
    const sorted = [...centralityMetrics].sort(
      (a, b) => a.betweenness_centrality - b.betweenness_centrality
    );
    const idx = sorted.findIndex(m => m.concept_id === selectedNode.id);
    return idx >= 0 ? idx / (sorted.length - 1 || 1) : undefined;
  }, [selectedNode, centralityMetrics]);

  // Handle cluster focus from ClusterPanel
  const handleFocusCluster = useCallback((clusterId: number) => {
    graph3DRef.current?.focusOnCluster(clusterId);
  }, []);

  // Handle cluster hover from TopicViewMode — stable reference via useCallback
  const handleClusterHover = useCallback((clusterId: number | null) => {
    if (clusterId !== null) {
      const cluster = clusters.find((c) => c.cluster_id === clusterId);
      if (cluster) {
        setHighlightedNodes(cluster.concepts);
      }
    } else {
      clearHighlights();
    }
  }, [clusters, setHighlightedNodes, clearHighlights]);

  // Count nodes by type for legend
  const nodeCounts = useMemo(() => {
    const filteredData = getFilteredData();
    if (!filteredData) return {};

    const counts: Record<string, number> = {};
    for (const node of filteredData.nodes) {
      counts[node.entity_type] = (counts[node.entity_type] || 0) + 1;
    }
    return counts;
  }, [getFilteredData]);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-[#0d1117]">
        <div className="text-center">
          <div className="w-16 h-16 flex items-center justify-center mx-auto mb-4">
            <Box className="w-10 h-10 text-accent-teal animate-pulse" />
          </div>
          <p className="font-mono text-xs uppercase tracking-wider text-muted">
            Loading 3D knowledge graph...
          </p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-[#0d1117]">
        <div className="text-center">
          <div className="w-16 h-16 flex items-center justify-center bg-accent-red/10 mx-auto mb-4">
            <span className="text-accent-red text-3xl">!</span>
          </div>
          <p className="font-mono text-xs uppercase tracking-wider text-accent-red mb-2">
            Failed to load graph
          </p>
          <p className="text-sm text-muted">{error}</p>
        </div>
      </div>
    );
  }

  // No data state
  if (!displayData || displayData.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full bg-[#0d1117]">
        <div className="text-center">
          <div className="w-16 h-16 flex items-center justify-center bg-muted/10 mx-auto mb-4">
            <Grid3X3 className="w-8 h-8 text-muted" />
          </div>
          <p className="font-mono text-xs uppercase tracking-wider text-muted">
            No graph data available
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      {/* Graph View (3D, Topic, or Gaps) */}
      {viewMode === '3d' && (
        <>
          <EntityTypeLegend visibleTypes={Object.keys(nodeCounts)} />
          <Graph3D
            key={`graph3d-${viewMode}-${projectId}`}
            ref={graph3DRef}
            nodes={displayData.nodes}
            edges={displayData.edges}
            clusters={clusters}
            centralityMetrics={centralityMetrics}
            highlightedNodes={highlightedNodes}
            highlightedEdges={highlightedEdges}
            selectedGap={selectedGap}
            onNodeClick={handleNodeClick}
            onBackgroundClick={handleBackgroundClick}
            bloomEnabled={view3D.bloom.enabled}
            bloomIntensity={view3D.bloom.intensity}
            glowSize={view3D.bloom.glowSize}
            // v0.7.0: Node pinning
            pinnedNodes={pinnedNodes}
            onNodePin={addPinnedNode}
            onNodeUnpin={removePinnedNode}
            onClearPinnedNodes={clearPinnedNodes}
            // v0.8.0: Adaptive label visibility
            labelVisibility={view3D.labelVisibility}
          />
        </>
      )}
      {viewMode === 'topic' && (
        <TopicViewMode
          clusters={clusters}
          gaps={gaps}
          edges={displayData.edges}
          onClusterClick={handleFocusCluster}
          onClusterHover={handleClusterHover}
        />
      )}
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
          projectId={projectId}
          bloomEnabled={view3D.bloom.enabled}
          bloomIntensity={view3D.bloom.intensity}
          glowSize={view3D.bloom.glowSize}
          // v0.7.0: Node pinning
          pinnedNodes={pinnedNodes}
          onNodePin={addPinnedNode}
          onNodeUnpin={removePinnedNode}
          onClearPinnedNodes={clearPinnedNodes}
        />
      )}
      {viewMode === 'temporal' && (
        <>
          <TemporalView projectId={projectId} />
          <div className="absolute bottom-4 left-4 right-4 z-30 max-h-[40vh] overflow-y-auto">
            <TemporalDashboard projectId={projectId} />
          </div>
        </>
      )}
      {viewMode === 'summary' && (
        <ResearchReport projectId={projectId} />
      )}

      {/* Top Controls */}
      <div className="absolute top-4 right-4 flex gap-2 z-40">
        <div className="bg-paper dark:bg-ink border border-ink/10 dark:border-paper/10 p-1 flex gap-1">
          {/* 3D Mode Indicator */}
          <div className="p-2 bg-accent-teal text-white relative" title="3D Graph View - Drag nodes to explore, scroll to zoom">
            <Box className="w-4 h-4" />
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white" />
          </div>

          <div className="w-px bg-ink/10 dark:bg-paper/10" />

          {/* Reset Camera */}
          <button
            onClick={handleResetCamera}
            data-testid="kg-reset-camera"
            className="p-2 hover:bg-surface/10 text-muted hover:text-ink dark:hover:text-paper transition-colors"
            title="Reset Camera"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Toggle Legend */}
          <button
            onClick={() => setShowLegend(!showLegend)}
            className={`p-2 transition-colors ${
              showLegend
                ? 'bg-accent-teal/10 text-accent-teal'
                : 'hover:bg-surface/10 text-muted hover:text-ink dark:hover:text-paper'
            }`}
            title="Toggle Entity Type Legend"
          >
            <Info className="w-4 h-4" />
          </button>

          {/* Toggle Gap Panel */}
          <button
            onClick={() => setShowGapPanel(!showGapPanel)}
            className={`p-2 transition-colors ${
              showGapPanel
                ? 'bg-accent-amber/10 text-accent-amber'
                : 'hover:bg-surface/10 text-muted hover:text-ink dark:hover:text-paper'
            }`}
            title="Toggle Research Gaps Panel"
          >
            <Sparkles className="w-4 h-4" />
          </button>

          {/* Toggle Insight HUD */}
          <button
            onClick={() => setShowInsightHUD(!showInsightHUD)}
            className={`p-2 transition-colors ${
              showInsightHUD
                ? 'bg-accent-teal/10 text-accent-teal'
                : 'hover:bg-surface/10 text-muted hover:text-ink dark:hover:text-paper'
            }`}
            title="Toggle Analysis HUD"
          >
            <BarChart3 className="w-4 h-4" />
          </button>

          {/* Paper Fit - v0.30.0 */}
          <button
            onClick={() => setShowPaperFit(!showPaperFit)}
            className={`p-2 transition-colors ${
              showPaperFit
                ? 'bg-accent-purple/10 text-accent-purple'
                : 'hover:bg-surface/10 text-muted hover:text-ink dark:hover:text-paper'
            }`}
            title="내 논문 위치 분석 (Paper Fit)"
          >
            <Search className="w-4 h-4" />
          </button>

          <div className="w-px bg-ink/10 dark:bg-paper/10" />

          {/* UI-012: View Mode Toggle - 3 modes: 3D, Topic, Gaps */}
          <div className="flex items-center bg-ink/15 dark:bg-paper/15 rounded-lg p-1 gap-1 border border-ink/20 dark:border-paper/20">
            {/* 3D Mode */}
            <button
              onClick={() => setViewMode('3d')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-all ${
                viewMode === '3d'
                  ? 'bg-accent-teal text-white shadow-sm'
                  : 'text-ink/70 dark:text-paper/70 hover:text-ink dark:hover:text-paper hover:bg-ink/10 dark:hover:bg-paper/10'
              }`}
              title="3D Graph View - Physics-based knowledge graph"
            >
              <Box className="w-4 h-4" />
              <span className="font-mono text-xs uppercase tracking-wider">3D</span>
            </button>

            {/* Topic Mode */}
            <button
              onClick={() => setViewMode('topic')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-all ${
                viewMode === 'topic'
                  ? 'bg-accent-purple text-white shadow-sm'
                  : 'text-ink/70 dark:text-paper/70 hover:text-ink dark:hover:text-paper hover:bg-ink/10 dark:hover:bg-paper/10'
              }`}
              title="Topic View - Cluster and community visualization"
            >
              <Grid2X2 className="w-4 h-4" />
              <span className="font-mono text-xs uppercase tracking-wider">Topics</span>
            </button>

            {/* Gaps Mode */}
            <button
              onClick={() => setViewMode('gaps')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-all ${
                viewMode === 'gaps'
                  ? 'bg-accent-amber text-white shadow-sm'
                  : 'text-ink/70 dark:text-paper/70 hover:text-ink dark:hover:text-paper hover:bg-ink/10 dark:hover:bg-paper/10'
              }`}
              title="Gaps View - Research gaps and bridge hypothesis exploration"
            >
              <Sparkles className="w-4 h-4" />
              <span className="font-mono text-xs uppercase tracking-wider">Gaps</span>
            </button>

            {/* Temporal Mode - v0.12.1 */}
            <button
              onClick={() => setViewMode('temporal')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-all ${
                viewMode === 'temporal'
                  ? 'bg-accent-orange text-white shadow-sm'
                  : 'text-ink/70 dark:text-paper/70 hover:text-ink dark:hover:text-paper hover:bg-ink/10 dark:hover:bg-paper/10'
              }`}
              title="시간축 시각화 (Temporal)"
            >
              <Calendar className="w-4 h-4" />
              <span className="font-mono text-xs uppercase tracking-wider">Temporal</span>
            </button>

            {/* Summary Mode - v0.30.0 */}
            <button
              onClick={() => setViewMode('summary')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-all ${
                viewMode === 'summary'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-ink/70 dark:text-paper/70 hover:text-ink dark:hover:text-paper hover:bg-ink/10 dark:hover:bg-paper/10'
              }`}
              title="연구 요약 리포트 (Research Summary)"
            >
              <FileText className="w-4 h-4" />
              <span className="font-mono text-xs uppercase tracking-wider">Summary</span>
            </button>
          </div>
        </div>
      </div>

      {/* Gap Panel - Hidden in Gaps mode (GapsViewMode has integrated gap list) */}
      {showGapPanel && viewMode !== 'gaps' && (
        <DraggablePanel panelId="gap" projectId={projectId} defaultPosition={{ x: 16, y: 16 }}>
        <GapPanel
          projectId={projectId}
          gaps={gaps}
          clusters={clusters}
          nodes={displayData.nodes}
          edges={displayData.edges}
          onGapSelect={handleGapSelect}
          onHighlightNodes={handleGapHighlight}
          onClearHighlights={handleClearGapHighlights}
          isLoading={isGapLoading}
          onRefresh={handleRefreshGaps}
          isMinimized={isGapPanelMinimized}
          onToggleMinimize={() => setIsGapPanelMinimized(!isGapPanelMinimized)}
          onAskQuestion={onAskQuestion}
        />
        </DraggablePanel>
      )}

      {/* Legend */}
      {showLegend && (
        <GraphLegend
          visibleTypes={Object.keys(nodeCounts) as EntityType[]}
          nodeCountsByType={nodeCounts as Record<EntityType, number>}
        />
      )}

      {/* Node Details Panel */}
      {selectedNode && (
        <NodeDetails
          node={selectedNode}
          onClose={handleCloseNodeDetails}
          projectId={projectId}
        />
      )}

      {/* Status Bar */}
      <StatusBar projectId={projectId} />

      {/* Insight HUD - v0.8.0: Repositioned to right side (InfraNodus-style Analytics) */}
      {showInsightHUD && (
        <DraggablePanel
          panelId="insight-hud"
          projectId={projectId}
          defaultPosition={{ x: window?.innerWidth ? window.innerWidth - 220 : 900, y: 80 }}
          zIndex={20}
        >
        <InsightHUD
          projectId={projectId}
        />
        </DraggablePanel>
      )}

      {/* Paper Fit Panel - v0.30.0 */}
      {showPaperFit && (
        <DraggablePanel
          panelId="paper-fit"
          projectId={projectId}
          defaultPosition={{ x: typeof window !== 'undefined' && window.innerWidth ? window.innerWidth - 420 : 700, y: 80 }}
          zIndex={25}
        >
          <PaperFitPanel
            projectId={projectId}
            onClose={() => setShowPaperFit(false)}
          />
        </DraggablePanel>
      )}

      {/* v0.10.0: View Mode Badge with Active Indicator - Hidden in Gaps mode */}
      {viewMode !== 'gaps' && (
        <div className="absolute top-4 left-4 bg-paper dark:bg-ink border border-ink/10 dark:border-paper/10 px-3 py-1.5">
          <div className="flex items-center gap-2">
            {viewMode === '3d' && (
              <>
                {/* Pulsing active indicator */}
                <div className="relative flex items-center justify-center">
                  <div className="absolute w-2 h-2 bg-accent-teal rounded-full animate-ping opacity-75" />
                  <div className="w-2 h-2 bg-accent-teal rounded-full" />
                </div>
                <Box className="w-4 h-4 text-accent-teal" />
                <span className="font-mono text-xs uppercase tracking-wider text-muted">
                  3D Mode
                </span>
                <span className="text-xs text-muted">
                  • {displayData.nodes.length} nodes
                </span>
              </>
            )}
            {viewMode === 'topic' && (
              <>
                {/* Pulsing active indicator */}
                <div className="relative flex items-center justify-center">
                  <div className="absolute w-2 h-2 bg-accent-purple rounded-full animate-ping opacity-75" />
                  <div className="w-2 h-2 bg-accent-purple rounded-full" />
                </div>
                <Grid2X2 className="w-4 h-4 text-accent-purple" />
                <span className="font-mono text-xs uppercase tracking-wider text-muted">
                  Topic View
                </span>
                <span className="text-xs text-muted">
                  • {clusters.length} clusters
                </span>
              </>
            )}
            {viewMode === 'temporal' && (
              <>
                <div className="relative flex items-center justify-center">
                  <div className="absolute w-2 h-2 bg-accent-orange rounded-full animate-ping opacity-75" />
                  <div className="w-2 h-2 bg-accent-orange rounded-full" />
                </div>
                <Calendar className="w-4 h-4 text-accent-orange" />
                <span className="font-mono text-xs uppercase tracking-wider text-muted">
                  Temporal
                </span>
              </>
            )}
            {viewMode === 'summary' && (
              <>
                <div className="relative flex items-center justify-center">
                  <div className="absolute w-2 h-2 bg-emerald-500 rounded-full animate-ping opacity-75" />
                  <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                </div>
                <FileText className="w-4 h-4 text-emerald-500" />
                <span className="font-mono text-xs uppercase tracking-wider text-muted">
                  Summary
                </span>
              </>
            )}
          </div>
        </div>
      )}

      {/* v0.18.0: ConceptExplorer - relationship exploration panel */}
      {selectedNode && displayData && (
        <ConceptExplorer
          node={selectedNode}
          edges={displayData.edges}
          nodes={displayData.nodes}
          centralityPercentile={selectedNodeCentrality}
          onRelationshipClick={handleRelationshipClick}
          onClose={handleCloseNodeDetails}
          onNodeNavigate={handleNodeNavigate}
        />
      )}

      {/* Phase 0-3: Keyboard Shortcuts Overlay */}
      {showShortcuts && (
        <div className="absolute bottom-4 left-4 z-50 bg-paper dark:bg-ink border border-ink/10 dark:border-paper/10 p-4 w-56">
          <div className="flex items-center justify-between mb-3">
            <span className="font-mono text-xs uppercase tracking-wider text-muted">
              Keyboard Shortcuts
            </span>
            <button
              onClick={() => setShowShortcuts(false)}
              className="text-muted hover:text-ink dark:hover:text-paper text-xs"
            >
              ESC
            </button>
          </div>
          <div className="space-y-1.5">
            {KEYBOARD_SHORTCUTS.map((shortcut) => (
              <div key={shortcut.key} className="flex items-center justify-between">
                <span className="text-xs text-muted">{shortcut.description}</span>
                <kbd className="font-mono text-xs px-1.5 py-0.5 bg-ink/5 dark:bg-paper/5 border border-ink/10 dark:border-paper/10 text-ink dark:text-paper">
                  {shortcut.key}
                </kbd>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* UI-011: Edge Context Modal - Relationship Evidence */}
      <EdgeContextModal
        isOpen={edgeModalOpen}
        onClose={handleCloseEdgeModal}
        relationshipId={selectedEdge?.id || null}
        sourceName={selectedEdgeSourceName}
        targetName={selectedEdgeTargetName}
        relationshipType={selectedEdge?.relationship_type}
        relationshipConfidence={selectedEdgeConfidence}
        isLowTrust={selectedEdgeIsLowTrust}
        relationshipProperties={selectedEdge?.properties}
      />

      {/* v0.25: Reasoning Path Overlay */}
      {showReasoningPath && displayData && (
        <ReasoningPathOverlay
          traceNodeIds={traceNodeIds!}
          nodes={displayData.nodes}
          onClose={() => {
            // Signal parent to clear trace (would need callback prop)
          }}
          onNodeClick={(nodeId) => {
            const node = displayData.nodes.find(n => n.id === nodeId);
            if (node) {
              handleNodeClick(node);
              graph3DRef.current?.focusOnNode(nodeId);
            }
          }}
        />
      )}

      {/* v0.25: Cluster DrillDown */}
      {drillDownCluster && displayData && (
        <ClusterDrillDown
          cluster={drillDownCluster}
          allNodes={displayData.nodes}
          allEdges={displayData.edges}
          onBack={() => setDrillDownCluster(null)}
          onNodeClick={handleNodeClick}
        />
      )}

      {/* v0.25: Performance Overlay */}
      {showPerformance && displayData && (
        <PerformanceOverlay
          nodeCount={displayData.nodes.length}
          edgeCount={displayData.edges.length}
        />
      )}
    </div>
  );
}

export default KnowledgeGraph3D;
