'use client';

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  MiniMap,
  Background,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  NodeTypes,
  ConnectionMode,
  Panel,
  useReactFlow,
  ReactFlowProvider,
  Viewport,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';

import { CustomNode } from './CustomNode';
import { ClusterNode } from './ClusterNode';
import { HUD } from '../ui/HUD';
import { useGraphStore, ViewMode } from '@/hooks/useGraphStore';
import { applyLayout, updateNodeHighlights, updateEdgeHighlights, LayoutType } from '@/lib/layout';
import {
  shouldCluster,
  type ClusterConfig
} from '@/lib/clustering';
import type { GraphEntity } from '@/types';
import {
  Grid,
  Workflow,
  Circle,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Layers,
  Zap,
  Lightbulb,
  FileText,
  Eye,
  X
} from 'lucide-react';
import { useGraphKeyboard, KEYBOARD_SHORTCUTS } from '@/hooks/useGraphKeyboard';

interface KnowledgeGraphProps {
  projectId: string;
  onNodeClick?: (nodeId: string, nodeData: GraphEntity) => void;
  highlightedNodes?: string[];
  highlightedEdges?: string[];
}

const nodeTypes: NodeTypes = {
  paper: CustomNode,
  author: CustomNode,
  concept: CustomNode,
  method: CustomNode,
  finding: CustomNode,
  cluster: ClusterNode,
};

const layoutOptions: { type: LayoutType; icon: any; label: string }[] = [
  { type: 'conceptCentric', icon: Lightbulb, label: 'Concepts' },
  { type: 'force', icon: Grid, label: 'Neural' },
  { type: 'hierarchical', icon: Workflow, label: 'Tree' },
  { type: 'radial', icon: Circle, label: 'Orbit' },
];

const viewModeOptions: { mode: ViewMode; icon: any; label: string }[] = [
  { mode: 'concepts', icon: Lightbulb, label: 'Concepts' },
  { mode: 'papers', icon: FileText, label: 'Papers' },
  { mode: 'full', icon: Eye, label: 'All' },
];

const CLUSTER_CONFIG: ClusterConfig = {
  enabled: true,
  threshold: 150, // Lowered for better performance
  gridSize: 120,
  minZoom: 0.5, // Higher min zoom for better performance
};

function KnowledgeGraphInner({
  projectId,
  onNodeClick,
  highlightedNodes = [],
  highlightedEdges = [],
}: KnowledgeGraphProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [layoutType, setLayoutType] = useState<LayoutType>('conceptCentric'); // Default to concept-centric
  const [isLayouting, setIsLayouting] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [currentZoom, setCurrentZoom] = useState(1);
  const [isClustered, setIsClustered] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const { fitView, zoomIn, zoomOut } = useReactFlow();
  const [showFilters, setShowFilters] = useState(false);
  const { showShortcuts, setShowShortcuts } = useGraphKeyboard({
    onFitView: () => fitView({ duration: 800 }),
    onToggleFilter: () => setShowFilters(prev => !prev),
  });

  const {
    graphData,
    getFilteredData,
    getConceptCentricData,
    fetchGraphData,
    isLoading,
    viewMode,
    setViewMode
  } = useGraphStore();

  useEffect(() => {
    fetchGraphData(projectId);
  }, [projectId, fetchGraphData]);

  useEffect(() => {
    // Use concept-centric data when in concepts view mode
    const filteredData = viewMode === 'concepts' || viewMode === 'papers'
      ? getConceptCentricData()
      : getFilteredData();

    if (!filteredData || filteredData.nodes.length === 0) return;

    setIsLayouting(true);
    const width = containerRef.current?.clientWidth || 1200;
    const height = containerRef.current?.clientHeight || 800;

    // Use conceptCentric layout when in concepts mode
    const effectiveLayoutType = viewMode === 'concepts' && layoutType === 'conceptCentric'
      ? 'conceptCentric'
      : layoutType;

    const { nodes: layoutNodes, edges: layoutEdges } = applyLayout(
      filteredData.nodes,
      filteredData.edges,
      effectiveLayoutType,
      { width, height }
    );

    setNodes(layoutNodes);
    setEdges(layoutEdges);

    setTimeout(() => {
      fitView({ padding: 0.2, duration: 800 });
      setIsLayouting(false);
    }, 100);
  }, [graphData, layoutType, viewMode, getFilteredData, getConceptCentricData, setNodes, setEdges, fitView]);

  useEffect(() => {
    if (highlightedNodes.length > 0 || highlightedEdges.length > 0) {
      setNodes(nds => updateNodeHighlights(nds, highlightedNodes));
      setEdges(eds => updateEdgeHighlights(eds, highlightedEdges));
    }
  }, [highlightedNodes, highlightedEdges, setNodes, setEdges]);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (onNodeClick) {
        const entity = graphData?.nodes.find(n => n.id === node.id);
        if (entity) onNodeClick(node.id, entity);
      }
    },
    [onNodeClick, graphData]
  );

  return (
    <div ref={containerRef} className="w-full h-full relative bg-surface-0 overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute inset-0 pointer-events-none opacity-40">
        <div className="absolute top-0 left-0 w-full h-full bg-mesh-nexus" />
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        connectionMode={ConnectionMode.Loose}
        fitView
        minZoom={0.02}
        maxZoom={4}
        defaultEdgeOptions={{
          type: 'smoothstep',
          style: { stroke: 'rgba(255,255,255,0.08)', strokeWidth: 1.5 },
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background 
          variant={BackgroundVariant.Lines} 
          gap={40} 
          size={0.5}
          color="rgba(99, 102, 241, 0.03)"
        />
        
        {/* HUD Layer */}
        <HUD projectId={projectId} nodeCount={nodes.length} edgeCount={edges.length} />

        {/* View Controls Panel */}
        <Panel position="bottom-right" className="flex flex-col gap-3 mr-4 mb-4">
          <div className="bg-surface-2 flex flex-col gap-2 p-2 rounded border border-border">
            <button onClick={() => zoomIn()} className="p-2 hover:bg-surface-2 rounded text-text-secondary transition-colors">
              <ZoomIn className="w-4 h-4" />
            </button>
            <button onClick={() => zoomOut()} className="p-2 hover:bg-surface-2 rounded text-text-secondary transition-colors">
              <ZoomOut className="w-4 h-4" />
            </button>
            <div className="h-px bg-border mx-1" />
            <button onClick={() => fitView({ duration: 800 })} className="p-2 hover:bg-surface-2 rounded text-text-secondary transition-colors">
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </Panel>

        {/* View Mode Switcher Panel */}
        <Panel position="top-left" className="ml-4 mt-4">
          <div className="flex flex-col gap-2">
            {/* View Mode Toggle */}
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="bg-surface-2 p-1.5 flex gap-1.5 rounded border border-border"
            >
              {viewModeOptions.map((option) => (
                <button
                  key={option.mode}
                  onClick={() => setViewMode(option.mode)}
                  className={clsx(
                    'px-3 py-2 rounded transition-all duration-300 flex items-center gap-2 group',
                    viewMode === option.mode
                      ? 'bg-teal text-text-primary'
                      : 'hover:bg-surface-2 text-text-tertiary'
                  )}
                >
                  <option.icon className={clsx('w-4 h-4', viewMode === option.mode ? '' : '')} />
                  <span className="text-[10px] font-medium tracking-tight uppercase">{option.label}</span>
                </button>
              ))}
            </motion.div>

            {/* Layout Switcher */}
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="bg-surface-2 p-1.5 flex gap-1.5 rounded border border-border"
            >
              {layoutOptions.map((option) => (
                <button
                  key={option.type}
                  onClick={() => setLayoutType(option.type)}
                  className={clsx(
                    'px-3 py-2 rounded transition-all duration-300 flex items-center gap-2 group',
                    layoutType === option.type
                      ? 'bg-node-concept text-text-primary'
                      : 'hover:bg-surface-2 text-text-tertiary'
                  )}
                >
                  <option.icon className={clsx('w-4 h-4', layoutType === option.type ? '' : '')} />
                  <span className="text-[10px] font-medium tracking-tight uppercase">{option.label}</span>
                </button>
              ))}
            </motion.div>
          </div>
        </Panel>

        <Panel position="top-right" className="mr-4 mt-4 pointer-events-none">
           <div className="flex items-center gap-2 bg-surface-2 px-4 py-2 rounded border border-border">
             <Zap className="w-4 h-4 text-teal animate-pulse" />
             <span className="text-[10px] font-medium text-text-secondary uppercase tracking-widest">Neural Nexus Engine v1.0</span>
           </div>
        </Panel>

        {/* Keyboard Shortcuts Overlay */}
        {showShortcuts && (
          <Panel position="bottom-left" className="ml-4 mb-4">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-surface-2 border border-border rounded p-4 w-56"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-mono text-copper tracking-[0.15em] uppercase">Shortcuts</span>
                <button onClick={() => setShowShortcuts(false)} className="text-text-ghost hover:text-text-primary">
                  <X className="w-3 h-3" />
                </button>
              </div>
              <div className="space-y-1.5">
                {KEYBOARD_SHORTCUTS.map((s) => (
                  <div key={s.key} className="flex items-center justify-between text-xs">
                    <span className="text-text-secondary">{s.description}</span>
                    <kbd className="px-1.5 py-0.5 bg-surface-0 border border-border rounded font-mono text-text-tertiary">{s.key}</kbd>
                  </div>
                ))}
              </div>
            </motion.div>
          </Panel>
        )}
      </ReactFlow>

      {/* Cinematic Loading Overlay */}
      <AnimatePresence>
        {(isLoading || isLayouting) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-surface-0 flex flex-col items-center justify-center z-50"
          >
            <div className="relative">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                className="w-24 h-24 rounded-full border-b-2 border-node-concept"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-text-primary animate-ping" />
              </div>
            </div>
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-8 text-sm font-medium tracking-[0.2em] uppercase text-node-concept animate-pulse"
            >
              Constructing Neural Network
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function KnowledgeGraph(props: KnowledgeGraphProps) {
  return (
    <ReactFlowProvider>
      <KnowledgeGraphInner {...props} />
    </ReactFlowProvider>
  );
}
