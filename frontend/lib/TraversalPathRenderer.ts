import type { GraphEntity, GraphEdge, EntityType } from '@/types';

export interface PathNode {
  id: string;
  name: string;
  entity_type: EntityType;
  sequenceIndex: number;
  position?: { x: number; y: number; z: number };
}

export interface PathEdge {
  id: string;
  source: string;
  target: string;
  relationship_type: string;
}

export interface TraversalPathData {
  orderedPathNodes: PathNode[];
  pathEdges: PathEdge[];
  dimmedNodeIds: Set<string>;
  pathNodeIds: Set<string>;
  pathEdgeIds: Set<string>;
}

/**
 * TraversalPathRenderer - Pure logic class for computing reasoning path rendering data
 *
 * Takes trace node IDs from chat retrieval and graph nodes/edges, returns:
 * - orderedPathNodes: Nodes in sequence order with position data
 * - pathEdges: Edges connecting path nodes
 * - dimmedNodeIds: All nodes NOT in the path (to be dimmed to 0.15 opacity)
 * - pathNodeIds/pathEdgeIds: Sets for quick lookup
 */
export class TraversalPathRenderer {
  private traceNodeIds: string[];
  private allNodes: GraphEntity[];
  private allEdges: GraphEdge[];

  constructor(traceNodeIds: string[], nodes: GraphEntity[], edges: GraphEdge[]) {
    this.traceNodeIds = traceNodeIds;
    this.allNodes = nodes;
    this.allEdges = edges;
  }

  /**
   * Compute full path rendering data
   */
  public computePathData(): TraversalPathData {
    const pathNodeIds = new Set(this.traceNodeIds);

    // Build ordered path nodes with sequence indices
    const orderedPathNodes: PathNode[] = [];

    for (let index = 0; index < this.traceNodeIds.length; index++) {
      const nodeId = this.traceNodeIds[index];
      const node = this.allNodes.find(n => n.id === nodeId);
      if (!node) continue;

      orderedPathNodes.push({
        id: node.id,
        name: node.name,
        entity_type: node.entity_type,
        sequenceIndex: index + 1, // 1-indexed for display
        position: (node as any).x !== undefined ? {
          x: (node as any).x,
          y: (node as any).y,
          z: (node as any).z,
        } : undefined,
      });
    }

    // Find edges connecting path nodes
    const pathEdges: PathEdge[] = [];
    const pathEdgeIds = new Set<string>();

    for (let i = 0; i < this.traceNodeIds.length - 1; i++) {
      const sourceId = this.traceNodeIds[i];
      const targetId = this.traceNodeIds[i + 1];

      // Find edge connecting consecutive nodes in path
      const edge = this.allEdges.find(
        e =>
          (e.source === sourceId && e.target === targetId) ||
          (e.source === targetId && e.target === sourceId)
      );

      if (edge) {
        pathEdges.push({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          relationship_type: edge.relationship_type,
        });
        pathEdgeIds.add(edge.id);
      }
    }

    // Compute dimmed nodes (all nodes NOT in path)
    const dimmedNodeIds = new Set<string>();
    for (const node of this.allNodes) {
      if (!pathNodeIds.has(node.id)) {
        dimmedNodeIds.add(node.id);
      }
    }

    return {
      orderedPathNodes,
      pathEdges,
      dimmedNodeIds,
      pathNodeIds,
      pathEdgeIds,
    };
  }

  /**
   * Get node by ID with sequence index
   */
  public getPathNodeInfo(nodeId: string): { sequenceIndex: number } | null {
    const index = this.traceNodeIds.indexOf(nodeId);
    if (index === -1) return null;

    return {
      sequenceIndex: index + 1, // 1-indexed
    };
  }

  /**
   * Check if an edge is part of the path
   */
  public isPathEdge(edgeId: string): boolean {
    const pathData = this.computePathData();
    return pathData.pathEdgeIds.has(edgeId);
  }

  /**
   * Get total path length
   */
  public getPathLength(): number {
    return this.traceNodeIds.length;
  }

  /**
   * Get path as node names for display
   */
  public getPathAsNames(): string[] {
    return this.traceNodeIds
      .map(nodeId => {
        const node = this.allNodes.find(n => n.id === nodeId);
        return node?.name || nodeId;
      });
  }
}

export default TraversalPathRenderer;
