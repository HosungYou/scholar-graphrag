'use client';

import { useCallback, useEffect, useMemo } from 'react';
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
} from 'reactflow';
import 'reactflow/dist/style.css';

import { CustomNode } from './CustomNode';
import { useGraphStore } from '@/hooks/useGraphStore';

interface KnowledgeGraphProps {
  projectId: string;
  onNodeClick?: (nodeId: string, nodeData: any) => void;
  highlightedNodes?: string[];
  highlightedEdges?: string[];
}

// Define custom node types
const nodeTypes: NodeTypes = {
  paper: CustomNode,
  author: CustomNode,
  concept: CustomNode,
  method: CustomNode,
  finding: CustomNode,
};

// Color mapping for node types
const nodeColorMap: Record<string, string> = {
  Paper: '#3B82F6',    // Blue
  Author: '#10B981',   // Green
  Concept: '#8B5CF6',  // Purple
  Method: '#F59E0B',   // Amber
  Finding: '#EF4444',  // Red
};

export function KnowledgeGraph({
  projectId,
  onNodeClick,
  highlightedNodes = [],
  highlightedEdges = [],
}: KnowledgeGraphProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const { graphData, fetchGraphData, isLoading, error } = useGraphStore();

  // Fetch graph data on mount
  useEffect(() => {
    fetchGraphData(projectId);
  }, [projectId, fetchGraphData]);

  // Transform API data to React Flow format
  useEffect(() => {
    if (!graphData) return;

    // Transform nodes
    const flowNodes: Node[] = graphData.nodes.map((node: any, index: number) => ({
      id: node.id,
      type: node.entity_type.toLowerCase(),
      position: {
        // Simple grid layout - will be improved with layout algorithms
        x: (index % 10) * 200 + Math.random() * 50,
        y: Math.floor(index / 10) * 150 + Math.random() * 50,
      },
      data: {
        label: node.name,
        entityType: node.entity_type,
        properties: node.properties,
        isHighlighted: highlightedNodes.includes(node.id),
      },
    }));

    // Transform edges
    const flowEdges: Edge[] = graphData.edges.map((edge: any) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.relationship_type.replace(/_/g, ' '),
      animated: highlightedEdges.includes(edge.id),
      style: {
        stroke: highlightedEdges.includes(edge.id) ? '#F59E0B' : '#94A3B8',
        strokeWidth: highlightedEdges.includes(edge.id) ? 2 : 1,
      },
    }));

    setNodes(flowNodes);
    setEdges(flowEdges);
  }, [graphData, highlightedNodes, highlightedEdges, setNodes, setEdges]);

  // Handle node click
  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (onNodeClick) {
        onNodeClick(node.id, node.data);
      }
    },
    [onNodeClick]
  );

  // MiniMap node color
  const miniMapNodeColor = useCallback((node: Node) => {
    return nodeColorMap[node.data?.entityType] || '#94A3B8';
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading knowledge graph...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="text-center text-red-600">
          <p>Failed to load graph data</p>
          <p className="text-sm mt-2">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        connectionMode={ConnectionMode.Loose}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        defaultEdgeOptions={{
          type: 'smoothstep',
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <Controls position="bottom-right" />
        <MiniMap
          nodeColor={miniMapNodeColor}
          nodeStrokeWidth={3}
          zoomable
          pannable
          position="bottom-left"
        />
      </ReactFlow>

      {/* Legend */}
      <div className="absolute top-4 left-4 bg-white rounded-lg shadow-md p-3 text-sm">
        <p className="font-semibold mb-2">Node Types</p>
        <div className="space-y-1">
          {Object.entries(nodeColorMap).map(([type, color]) => (
            <div key={type} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span>{type}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
