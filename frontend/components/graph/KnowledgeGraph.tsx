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
import { useGraphStore } from '@/hooks/useGraphStore';
import { applyLayout, updateNodeHighlights, updateEdgeHighlights, LayoutType } from '@/lib/layout';
import { 
  shouldCluster, 
  type ClusterConfig 
} from '@/lib/clustering';
import type { GraphEntity } from '@/types';
import { 
  Grid, 
  Workflow, 
  RotateCcw, 
  Circle, 
  ZoomIn, 
  ZoomOut, 
  Maximize2,
  Info,
  Layers,
  Zap
} from 'lucide-react';

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
  { type: 'force', icon: Grid, label: 'Neural' },
  { type: 'hierarchical', icon: Workflow, label: 'Tree' },
  { type: 'radial', icon: Circle, label: 'Orbit' },
];

const CLUSTER_CONFIG: ClusterConfig = {
  enabled: true,
  threshold: 400,
  gridSize: 150,
  minZoom: 0.3,
};

function KnowledgeGraphInner({
  projectId,
  onNodeClick,
  highlightedNodes = [],
  highlightedEdges = [],
}: KnowledgeGraphProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [layoutType, setLayoutType] = useState<LayoutType>('force');
  const [isLayouting, setIsLayouting] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [currentZoom, setCurrentZoom] = useState(1);
  const [isClustered, setIsClustered] = useState(false);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const { fitView, zoomIn, zoomOut } = useReactFlow();

  const { graphData, getFilteredData, fetchGraphData, isLoading } = useGraphStore();

  useEffect(() => {
    fetchGraphData(projectId);
  }, [projectId, fetchGraphData]);

  useEffect(() => {
    const filteredData = getFilteredData();
    if (!filteredData || filteredData.nodes.length === 0) return;

    setIsLayouting(true);
    const width = containerRef.current?.clientWidth || 1200;
    const height = containerRef.current?.clientHeight || 800;

    const { nodes: layoutNodes, edges: layoutEdges } = applyLayout(
      filteredData.nodes,
      filteredData.edges,
      layoutType,
      { width, height }
    );

    setNodes(layoutNodes);
    setEdges(layoutEdges);

    setTimeout(() => {
      fitView({ padding: 0.2, duration: 800 });
      setIsLayouting(false);
    }, 100);
  }, [graphData, layoutType, getFilteredData, setNodes, setEdges, fitView]);

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
    <div ref={containerRef} className="w-full h-full relative bg-nexus-950 overflow-hidden">
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
          <div className="glass-nexus flex flex-col gap-2 p-2 rounded-2xl">
            <button onClick={() => zoomIn()} className="p-2 hover:bg-white/10 rounded-xl text-slate-300 transition-colors">
              <ZoomIn className="w-4 h-4" />
            </button>
            <button onClick={() => zoomOut()} className="p-2 hover:bg-white/10 rounded-xl text-slate-300 transition-colors">
              <ZoomOut className="w-4 h-4" />
            </button>
            <div className="h-px bg-white/5 mx-1" />
            <button onClick={() => fitView({ duration: 800 })} className="p-2 hover:bg-white/10 rounded-xl text-slate-300 transition-colors">
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </Panel>

        {/* Layout Switcher Panel */}
        <Panel position="top-left" className="ml-4 mt-4">
          <motion.div 
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="glass-nexus p-1.5 flex gap-1.5 rounded-2xl"
          >
            {layoutOptions.map((option) => (
              <button
                key={option.type}
                onClick={() => setLayoutType(option.type)}
                className={clsx(
                  'px-4 py-2 rounded-xl transition-all duration-300 flex items-center gap-2 group',
                  layoutType === option.type
                    ? 'bg-nexus-indigo text-white shadow-lg shadow-nexus-indigo/20'
                    : 'hover:bg-white/5 text-slate-400'
                )}
              >
                <option.icon className={clsx('w-4 h-4', layoutType === option.type ? 'animate-pulse' : '')} />
                <span className="text-xs font-bold tracking-tight uppercase">{option.label}</span>
              </button>
            ))}
          </motion.div>
        </Panel>

        <Panel position="top-right" className="mr-4 mt-4 pointer-events-none">
           <div className="flex items-center gap-2 glass-nexus px-4 py-2 rounded-2xl">
             <Zap className="w-4 h-4 text-nexus-cyan animate-pulse" />
             <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Neural Nexus Engine v1.0</span>
           </div>
        </Panel>
      </ReactFlow>

      {/* Cinematic Loading Overlay */}
      <AnimatePresence>
        {(isLoading || isLayouting) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-nexus-950/80 backdrop-blur-xl flex flex-col items-center justify-center z-50"
          >
            <div className="relative">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                className="w-24 h-24 rounded-full border-b-2 border-nexus-indigo shadow-[0_0_40px_-10px_rgba(99,102,241,0.5)]"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-white animate-ping" />
              </div>
            </div>
            <motion.p 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-8 text-sm font-bold tracking-[0.2em] uppercase text-nexus-indigo animate-pulse"
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
