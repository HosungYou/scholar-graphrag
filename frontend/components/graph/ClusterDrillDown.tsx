'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { ArrowLeft, Maximize2 } from 'lucide-react';
import ForceGraph3D from 'react-force-graph-3d';
import type { GraphEntity, GraphEdge, ConceptCluster } from '@/types';
import * as THREE from 'three';

interface ClusterDrillDownProps {
  cluster: ConceptCluster;
  allNodes: GraphEntity[];
  allEdges: GraphEdge[];
  onBack: () => void;
  onNodeClick?: (node: GraphEntity) => void;
}

/**
 * ClusterDrillDown - Shows only internal nodes of a selected cluster
 *
 * Features:
 * - Activated by double-clicking a cluster in TopicViewMode
 * - Shows only nodes within the cluster
 * - Internal force layout for the sub-graph
 * - "Back to full view" button
 * - Mini breadcrumb: "All Clusters > Cluster: [name]"
 */
export function ClusterDrillDown({
  cluster,
  allNodes,
  allEdges,
  onBack,
  onNodeClick,
}: ClusterDrillDownProps) {
  const graphRef = useRef<any>();
  const [selectedNode, setSelectedNode] = useState<GraphEntity | null>(null);

  // Filter nodes to only those in this cluster
  const clusterNodes = useMemo(() => {
    const clusterConceptIds = new Set(cluster.concepts);
    return allNodes.filter(node => clusterConceptIds.has(node.id));
  }, [cluster, allNodes]);

  // Filter edges to only internal cluster edges
  const clusterEdges = useMemo(() => {
    const clusterNodeIds = new Set(clusterNodes.map(n => n.id));
    return allEdges.filter(
      edge => clusterNodeIds.has(edge.source) && clusterNodeIds.has(edge.target)
    );
  }, [clusterNodes, allEdges]);

  // Convert to force-graph format
  const graphData = useMemo(() => {
    return {
      nodes: clusterNodes.map(node => ({
        id: node.id,
        name: node.name,
        entity_type: node.entity_type,
        val: 10, // Node size
      })),
      links: clusterEdges.map(edge => ({
        source: edge.source,
        target: edge.target,
        relationship_type: edge.relationship_type,
      })),
    };
  }, [clusterNodes, clusterEdges]);

  useEffect(() => {
    if (graphRef.current) {
      // Fit camera to show all nodes
      graphRef.current.zoomToFit(400);
    }
  }, [cluster.cluster_id]);

  const handleNodeClick = (node: any) => {
    const fullNode = clusterNodes.find(n => n.id === node.id);
    if (fullNode) {
      setSelectedNode(fullNode);
      onNodeClick?.(fullNode);
    }
  };

  const handleBackgroundClick = () => {
    setSelectedNode(null);
  };

  return (
    <div className="absolute inset-0 bg-[#0d1117] z-50">
      {/* Header with breadcrumb and back button */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-2 bg-zinc-900/90 backdrop-blur-sm border border-zinc-700/50 px-3 py-2">
          <span className="text-xs text-zinc-400 font-mono">All Clusters</span>
          <span className="text-xs text-zinc-600">&gt;</span>
          <span className="text-xs text-zinc-100 font-mono">
            Cluster {cluster.cluster_id}
            {cluster.label && `: ${cluster.label}`}
          </span>
          <span className="px-1.5 py-0.5 bg-accent-teal/20 text-accent-teal font-mono text-[10px] rounded ml-2">
            {clusterNodes.length} nodes
          </span>
        </div>

        <button
          onClick={onBack}
          className="flex items-center gap-2 bg-zinc-900/90 backdrop-blur-sm border border-zinc-700/50 px-3 py-2 hover:bg-zinc-800/90 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-zinc-400" />
          <span className="text-xs text-zinc-100 font-mono uppercase tracking-wider">
            Back to Full View
          </span>
        </button>
      </div>

      {/* 3D Force Graph */}
      <ForceGraph3D
        ref={graphRef}
        graphData={graphData}
        nodeLabel="name"
        nodeColor={(node: any) => {
          return cluster.color || '#14B8A6';
        }}
        nodeOpacity={0.9}
        linkColor={() => '#ffffff'}
        linkOpacity={0.2}
        linkWidth={1}
        onNodeClick={handleNodeClick}
        onBackgroundClick={handleBackgroundClick}
        backgroundColor="#0d1117"
        warmupTicks={100}
        cooldownTicks={200}
      />

      {/* Stats overlay */}
      <div className="absolute bottom-4 left-4 bg-zinc-900/90 backdrop-blur-sm border border-zinc-700/50 px-3 py-2">
        <div className="flex items-center gap-4">
          <div>
            <p className="text-xs text-zinc-400 font-mono">Nodes</p>
            <p className="text-sm text-zinc-100 font-mono">{clusterNodes.length}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-400 font-mono">Edges</p>
            <p className="text-sm text-zinc-100 font-mono">{clusterEdges.length}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-400 font-mono">Density</p>
            <p className="text-sm text-zinc-100 font-mono">
              {cluster.density.toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      {/* Selected node info */}
      {selectedNode && (
        <div className="absolute bottom-4 right-4 bg-zinc-900/90 backdrop-blur-sm border border-zinc-700/50 px-3 py-2 w-64">
          <p className="text-sm text-zinc-100 font-medium mb-1">
            {selectedNode.name}
          </p>
          <p className="text-xs text-zinc-400 font-mono">
            {selectedNode.entity_type}
          </p>
          {(selectedNode.properties as any).paper_count && (
            <p className="text-xs text-zinc-500 font-mono mt-1">
              {(selectedNode.properties as any).paper_count} papers
            </p>
          )}
        </div>
      )}

      {/* Top-right controls */}
      <div className="absolute top-4 right-4 flex gap-2">
        <button
          onClick={() => graphRef.current?.zoomToFit(400)}
          className="p-2 bg-zinc-900/90 backdrop-blur-sm border border-zinc-700/50 hover:bg-zinc-800/90 transition-colors"
          title="Fit to view"
        >
          <Maximize2 className="w-4 h-4 text-zinc-400" />
        </button>
      </div>
    </div>
  );
}

export default ClusterDrillDown;
