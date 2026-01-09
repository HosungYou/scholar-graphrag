import type { GraphEntity, EntityType } from '@/types';
import { Node } from 'reactflow';

interface ClusterEdge {
  id: string;
  source: string;
  target: string;
  relationship_type: string;
  properties: Record<string, unknown>;
}

interface SimpleEdge {
  id: string;
  source: string;
  target: string;
  relationship_type: string;
  properties?: Record<string, unknown>;
}

export interface ClusterNode {
  id: string;
  name: string;
  entity_type: 'Cluster';
  properties: {
    nodeCount: number;
    nodeIds: string[];
    entityTypes: Record<EntityType, number>;
    representative: string;
  };
}

export interface ClusterConfig {
  enabled: boolean;
  threshold: number;
  gridSize: number;
  minZoom: number;
}

const DEFAULT_CLUSTER_CONFIG: ClusterConfig = {
  enabled: true,
  threshold: 500,
  gridSize: 150,
  minZoom: 0.5,
};

const CLUSTER_COLORS: Record<EntityType, string> = {
  Paper: '#3b82f6',
  Author: '#10b981',
  Concept: '#8b5cf6',
  Method: '#f59e0b',
  Finding: '#ef4444',
};

export function shouldCluster(nodeCount: number, zoom: number, config: ClusterConfig = DEFAULT_CLUSTER_CONFIG): boolean {
  return config.enabled && nodeCount > config.threshold && zoom < config.minZoom;
}

export function clusterNodes(
  nodes: GraphEntity[],
  edges: SimpleEdge[],
  positions: Map<string, { x: number; y: number }>,
  config: ClusterConfig = DEFAULT_CLUSTER_CONFIG
): {
  clusteredNodes: (GraphEntity | ClusterNode)[];
  clusteredEdges: ClusterEdge[];
  clusterMap: Map<string, string>;
} {
  const { gridSize } = config;
  
  const grid = new Map<string, GraphEntity[]>();
  
  for (const node of nodes) {
    const pos = positions.get(node.id);
    if (!pos) continue;
    
    const gridX = Math.floor(pos.x / gridSize);
    const gridY = Math.floor(pos.y / gridSize);
    const key = `${gridX},${gridY}`;
    
    const cell = grid.get(key) || [];
    cell.push(node);
    grid.set(key, cell);
  }
  
  const clusteredNodes: (GraphEntity | ClusterNode)[] = [];
  const clusterMap = new Map<string, string>();
  
  for (const [cellKey, cellNodes] of Array.from(grid.entries())) {
    if (cellNodes.length === 1) {
      clusteredNodes.push(cellNodes[0]);
      clusterMap.set(cellNodes[0].id, cellNodes[0].id);
    } else {
      const entityTypeCounts: Record<EntityType, number> = {
        Paper: 0,
        Author: 0,
        Concept: 0,
        Method: 0,
        Finding: 0,
      };
      
      for (const node of cellNodes) {
        entityTypeCounts[node.entity_type]++;
      }
      
      const dominantType = (Object.entries(entityTypeCounts)
        .sort((a, b) => b[1] - a[1])[0][0]) as EntityType;
      
      const clusterId = `cluster-${cellKey}`;
      const cluster: ClusterNode = {
        id: clusterId,
        name: `${cellNodes.length} nodes`,
        entity_type: 'Cluster',
        properties: {
          nodeCount: cellNodes.length,
          nodeIds: cellNodes.map(n => n.id),
          entityTypes: entityTypeCounts,
          representative: dominantType,
        },
      };
      
      clusteredNodes.push(cluster);
      
      for (const node of cellNodes) {
        clusterMap.set(node.id, clusterId);
      }
    }
  }
  
  const edgeSet = new Set<string>();
  const clusteredEdges: ClusterEdge[] = [];
  
  for (const edge of edges) {
    const sourceCluster = clusterMap.get(edge.source);
    const targetCluster = clusterMap.get(edge.target);
    
    if (!sourceCluster || !targetCluster) continue;
    if (sourceCluster === targetCluster) continue;
    
    const edgeKey = `${sourceCluster}-${targetCluster}`;
    if (edgeSet.has(edgeKey)) continue;
    
    edgeSet.add(edgeKey);
    clusteredEdges.push({
      id: edgeKey,
      source: sourceCluster,
      target: targetCluster,
      relationship_type: 'CLUSTER_LINK',
      properties: {},
    });
  }
  
  return { clusteredNodes, clusteredEdges, clusterMap };
}

export function createClusterFlowNode(
  cluster: ClusterNode,
  position: { x: number; y: number }
): Node {
  const dominantType = cluster.properties.representative as EntityType;
  const baseColor = CLUSTER_COLORS[dominantType] || '#94a3b8';
  
  return {
    id: cluster.id,
    type: 'cluster',
    position,
    data: {
      label: cluster.name,
      entityType: 'Cluster',
      nodeCount: cluster.properties.nodeCount,
      entityTypes: cluster.properties.entityTypes,
      dominantType,
      baseColor,
      nodeIds: cluster.properties.nodeIds,
    },
  };
}

export function getVisibleNodes<T extends { id: string }>(
  nodes: T[],
  positions: Map<string, { x: number; y: number }>,
  viewport: { x: number; y: number; zoom: number },
  containerSize: { width: number; height: number },
  padding: number = 100
): T[] {
  const { x: vpX, y: vpY, zoom } = viewport;
  const { width, height } = containerSize;
  
  const visibleMinX = -vpX / zoom - padding;
  const visibleMaxX = (-vpX + width) / zoom + padding;
  const visibleMinY = -vpY / zoom - padding;
  const visibleMaxY = (-vpY + height) / zoom + padding;
  
  return nodes.filter(node => {
    const pos = positions.get(node.id);
    if (!pos) return true;
    
    return (
      pos.x >= visibleMinX &&
      pos.x <= visibleMaxX &&
      pos.y >= visibleMinY &&
      pos.y <= visibleMaxY
    );
  });
}

export function optimizedForceLayout(
  nodes: GraphEntity[],
  edges: SimpleEdge[],
  options: {
    width?: number;
    height?: number;
    iterations?: number;
  } = {}
): Map<string, { x: number; y: number }> {
  const nodeCount = nodes.length;
  const { width = 1200, height = 800 } = options;
  
  let iterations: number;
  if (nodeCount < 100) iterations = 100;
  else if (nodeCount < 500) iterations = 50;
  else if (nodeCount < 2000) iterations = 30;
  else iterations = 15;
  
  if (options.iterations) iterations = options.iterations;
  
  const centerX = width / 2;
  const centerY = height / 2;
  
  const positions = new Map<string, { x: number; y: number; vx: number; vy: number }>();
  
  const entityAngles: Record<EntityType, number> = {
    Paper: 0,
    Author: Math.PI * 0.4,
    Concept: Math.PI * 0.8,
    Method: Math.PI * 1.2,
    Finding: Math.PI * 1.6,
  };
  
  const scale = Math.min(width, height) * 0.35;
  
  for (const node of nodes) {
    const angle = entityAngles[node.entity_type] + (Math.random() - 0.5) * 0.8;
    const radius = scale * (0.3 + Math.random() * 0.7);
    
    positions.set(node.id, {
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
      vx: 0,
      vy: 0,
    });
  }
  
  const adjacency = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, new Set());
    if (!adjacency.has(edge.target)) adjacency.set(edge.target, new Set());
    adjacency.get(edge.source)!.add(edge.target);
    adjacency.get(edge.target)!.add(edge.source);
  }
  
  const chargeStrength = nodeCount > 1000 ? -100 : nodeCount > 500 ? -200 : -300;
  const linkStrength = 0.3;
  
  for (let iter = 0; iter < iterations; iter++) {
    const alpha = 1 - iter / iterations;
    const alphaDecay = alpha * 0.1;
    
    const nodeList = Array.from(positions.entries());
    
    for (let i = 0; i < nodeList.length; i++) {
      const [idA, posA] = nodeList[i];
      
      const sampleSize = nodeCount > 2000 ? Math.min(50, nodeList.length) : nodeList.length;
      const step = Math.max(1, Math.floor(nodeList.length / sampleSize));
      
      for (let j = i + step; j < nodeList.length; j += step) {
        const [idB, posB] = nodeList[j];
        
        const dx = posB.x - posA.x;
        const dy = posB.y - posA.y;
        const distSq = dx * dx + dy * dy;
        const dist = Math.sqrt(distSq) || 1;
        
        if (dist > 500) continue;
        
        const force = (chargeStrength * alphaDecay) / distSq;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        
        posA.vx -= fx;
        posA.vy -= fy;
        posB.vx += fx;
        posB.vy += fy;
      }
    }
    
    for (const edge of edges) {
      const posA = positions.get(edge.source);
      const posB = positions.get(edge.target);
      if (!posA || !posB) continue;
      
      const dx = posB.x - posA.x;
      const dy = posB.y - posA.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      
      const idealDist = 120;
      const diff = (dist - idealDist) * linkStrength * alphaDecay;
      
      const fx = (dx / dist) * diff;
      const fy = (dy / dist) * diff;
      
      posA.vx += fx;
      posA.vy += fy;
      posB.vx -= fx;
      posB.vy -= fy;
    }
    
    positions.forEach((pos) => {
      const dx = centerX - pos.x;
      const dy = centerY - pos.y;
      pos.vx += dx * 0.005 * alphaDecay;
      pos.vy += dy * 0.005 * alphaDecay;
      
      pos.x += pos.vx;
      pos.y += pos.vy;
      
      pos.vx *= 0.9;
      pos.vy *= 0.9;
      
      pos.x = Math.max(50, Math.min(width - 50, pos.x));
      pos.y = Math.max(50, Math.min(height - 50, pos.y));
    });
  }
  
  const result = new Map<string, { x: number; y: number }>();
  positions.forEach((pos, id) => {
    result.set(id, { x: pos.x, y: pos.y });
  });
  
  return result;
}
