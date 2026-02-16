/**
 * Graph layout algorithms for Knowledge Graph visualization
 * Enhanced with relationship-type styling and performance optimizations
 */

import type { GraphEntity, GraphEdge, EntityType } from '@/types';
import { Node, Edge, MarkerType } from 'reactflow';

interface LayoutNode {
  id: string;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
  entityType: EntityType;
}

interface LayoutLink {
  source: string | LayoutNode;
  target: string | LayoutNode;
}

interface LayoutOptions {
  width?: number;
  height?: number;
  centerStrength?: number;
  linkStrength?: number;
  chargeStrength?: number;
  iterations?: number;
}

// Entity type grouping for clustered layout
const entityTypeGroups: Record<EntityType, { angle: number; radius: number }> = {
  Paper: { angle: 0, radius: 0.4 },
  Author: { angle: Math.PI * 0.4, radius: 0.7 },
  Concept: { angle: Math.PI * 0.8, radius: 0.6 },
  Method: { angle: Math.PI * 1.2, radius: 0.5 },
  Finding: { angle: Math.PI * 1.6, radius: 0.6 },
};

// Enhanced edge styling by relationship type
const relationshipStyles: Record<string, {
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
  animated?: boolean;
  markerEnd?: boolean;
}> = {
  AUTHORED_BY: {
    stroke: '#10b981', // emerald
    strokeWidth: 2,
    markerEnd: true,
  },
  CITES: {
    stroke: '#3b82f6', // blue
    strokeWidth: 1.5,
    strokeDasharray: '5 3',
    animated: true,
    markerEnd: true,
  },
  DISCUSSES_CONCEPT: {
    stroke: '#8b5cf6', // violet
    strokeWidth: 1.5,
    markerEnd: true,
  },
  USES_METHOD: {
    stroke: '#f59e0b', // amber
    strokeWidth: 2,
    markerEnd: true,
  },
  USES_DATASET: {
    stroke: '#06b6d4', // cyan
    strokeWidth: 1.5,
    markerEnd: true,
  },
  SUPPORTS: {
    stroke: '#22c55e', // green
    strokeWidth: 2.5,
    markerEnd: true,
  },
  CONTRADICTS: {
    stroke: '#ef4444', // red
    strokeWidth: 2.5,
    strokeDasharray: '8 4',
    markerEnd: true,
  },
  RELATED_TO: {
    stroke: '#94a3b8', // slate
    strokeWidth: 1,
    strokeDasharray: '3 3',
  },
  AFFILIATED_WITH: {
    stroke: '#10b981', // emerald
    strokeWidth: 1.5,
    strokeDasharray: '2 2',
  },
  COLLABORATION: {
    stroke: '#14b8a6', // teal
    strokeWidth: 1.5,
  },
};

// Default edge style
const defaultEdgeStyle = {
  stroke: '#94a3b8',
  strokeWidth: 1,
  markerEnd: false,
};

/**
 * Get styled edge configuration based on relationship type
 */
function getEdgeStyle(relationshipType: string): Edge['style'] & { animated?: boolean } {
  const style = relationshipStyles[relationshipType] || defaultEdgeStyle;
  return {
    stroke: style.stroke,
    strokeWidth: style.strokeWidth,
    ...(style.strokeDasharray && { strokeDasharray: style.strokeDasharray }),
  };
}

/**
 * Simple force-directed layout without D3 dependency
 * Uses custom implementation for better bundle size
 */
export function forceDirectedLayout(
  nodes: GraphEntity[],
  edges: GraphEdge[],
  options: LayoutOptions = {}
): { nodes: Node[]; edges: Edge[] } {
  // Dynamic iterations based on node count for performance
  const nodeCount = nodes.length;
  const dynamicIterations = nodeCount > 300 ? 30 : nodeCount > 100 ? 50 : nodeCount > 50 ? 70 : 100;

  const {
    width = 1200,
    height = 800,
    chargeStrength = nodeCount > 200 ? -150 : -300, // Weaker repulsion for large graphs
    linkStrength = 0.3,
    iterations = dynamicIterations,
  } = options;

  const centerX = width / 2;
  const centerY = height / 2;

  // Initialize node positions using entity type clustering
  const layoutNodes: LayoutNode[] = nodes.map((node) => {
    const group = entityTypeGroups[node.entity_type];
    const jitter = Math.random() * 100 - 50;
    const radiusOffset = Math.random() * 100;

    return {
      id: node.id,
      x: centerX + Math.cos(group.angle) * (group.radius * width / 2 + radiusOffset) + jitter,
      y: centerY + Math.sin(group.angle) * (group.radius * height / 2 + radiusOffset) + jitter,
      vx: 0,
      vy: 0,
      entityType: node.entity_type,
    };
  });

  // Create node lookup map
  const nodeMap = new Map(layoutNodes.map(n => [n.id, n]));

  // Create links
  const links: LayoutLink[] = edges
    .filter(e => nodeMap.has(e.source) && nodeMap.has(e.target))
    .map(e => ({
      source: nodeMap.get(e.source)!,
      target: nodeMap.get(e.target)!,
    }));

  // Run simulation
  for (let i = 0; i < iterations; i++) {
    const alpha = 1 - i / iterations;

    // Apply charge force (repulsion between all nodes)
    for (let a = 0; a < layoutNodes.length; a++) {
      for (let b = a + 1; b < layoutNodes.length; b++) {
        const nodeA = layoutNodes[a];
        const nodeB = layoutNodes[b];

        const dx = nodeB.x - nodeA.x;
        const dy = nodeB.y - nodeA.y;
        const distance = Math.sqrt(dx * dx + dy * dy) || 1;

        // Repulsion force inversely proportional to distance
        const force = (chargeStrength * alpha) / (distance * distance);
        const fx = (dx / distance) * force;
        const fy = (dy / distance) * force;

        nodeA.vx! -= fx;
        nodeA.vy! -= fy;
        nodeB.vx! += fx;
        nodeB.vy! += fy;
      }
    }

    // Apply link force (attraction between connected nodes)
    for (const link of links) {
      const source = link.source as LayoutNode;
      const target = link.target as LayoutNode;

      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const distance = Math.sqrt(dx * dx + dy * dy) || 1;

      // Ideal link distance based on entity types
      const idealDistance = getIdealDistance(source.entityType, target.entityType);
      const diff = (distance - idealDistance) * linkStrength * alpha;

      const fx = (dx / distance) * diff;
      const fy = (dy / distance) * diff;

      source.vx! += fx;
      source.vy! += fy;
      target.vx! -= fx;
      target.vy! -= fy;
    }

    // Apply center force
    for (const node of layoutNodes) {
      const dx = centerX - node.x;
      const dy = centerY - node.y;
      node.vx! += dx * 0.01 * alpha;
      node.vy! += dy * 0.01 * alpha;
    }

    // Update positions
    for (const node of layoutNodes) {
      // Apply velocity with damping
      node.x += node.vx! * 0.9;
      node.y += node.vy! * 0.9;

      // Dampen velocity
      node.vx! *= 0.9;
      node.vy! *= 0.9;

      // Keep within bounds
      node.x = Math.max(50, Math.min(width - 50, node.x));
      node.y = Math.max(50, Math.min(height - 50, node.y));
    }
  }

  // Convert to React Flow format with enhanced styling
  const flowNodes: Node[] = nodes.map((node) => {
    const layoutNode = nodeMap.get(node.id)!;
    return {
      id: node.id,
      type: node.entity_type.toLowerCase(),
      position: { x: layoutNode.x, y: layoutNode.y },
      data: {
        label: node.name,
        entityType: node.entity_type,
        properties: node.properties,
        isHighlighted: false,
        importance: calculateImportance(node, edges),
        citationCount: (node.properties as Record<string, unknown>)?.citation_count as number | undefined,
      },
    };
  });

  const flowEdges: Edge[] = edges.map((edge) => {
    const style = relationshipStyles[edge.relationship_type] || defaultEdgeStyle;
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.relationship_type.replace(/_/g, ' '),
      type: 'smoothstep',
      animated: style.animated || false,
      style: getEdgeStyle(edge.relationship_type),
      labelStyle: {
        fontSize: 10,
        fontFamily: 'JetBrains Mono, monospace',
        fill: '#64748b',
      },
      labelBgStyle: {
        fill: 'rgba(255, 255, 255, 0.8)',
        fillOpacity: 0.8,
      },
      markerEnd: style.markerEnd ? {
        type: MarkerType.ArrowClosed,
        color: style.stroke,
        width: 15,
        height: 15,
      } : undefined,
      className: `edge-${edge.relationship_type.toLowerCase().replace(/_/g, '-')}`,
    };
  });

  return { nodes: flowNodes, edges: flowEdges };
}

/**
 * Calculate node importance based on connections
 */
function calculateImportance(node: GraphEntity, edges: GraphEdge[]): number {
  const connections = edges.filter(
    e => e.source === node.id || e.target === node.id
  ).length;
  
  // Normalize to 0-1 scale (assuming max 20 connections)
  return Math.min(connections / 20, 1);
}

/**
 * Get ideal distance between two node types
 */
function getIdealDistance(typeA: EntityType, typeB: EntityType): number {
  // Paper-Paper: further apart
  if (typeA === 'Paper' && typeB === 'Paper') return 200;

  // Paper-Author: medium distance
  if ((typeA === 'Paper' && typeB === 'Author') || (typeA === 'Author' && typeB === 'Paper')) {
    return 150;
  }

  // Paper-Concept/Method/Finding: closer
  if (typeA === 'Paper' || typeB === 'Paper') return 120;

  // Same type clustering
  if (typeA === typeB) return 180;

  // Default
  return 150;
}

/**
 * Hierarchical layout - Papers in center, related entities radiate out
 */
export function hierarchicalLayout(
  nodes: GraphEntity[],
  edges: GraphEdge[],
  options: LayoutOptions = {}
): { nodes: Node[]; edges: Edge[] } {
  const { width = 1200, height = 800 } = options;
  const centerX = width / 2;
  const centerY = height / 2;

  // Separate nodes by type
  const papers = nodes.filter(n => n.entity_type === 'Paper');
  const others = nodes.filter(n => n.entity_type !== 'Paper');

  // Build adjacency list
  const adjacency = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, new Set());
    if (!adjacency.has(edge.target)) adjacency.set(edge.target, new Set());
    adjacency.get(edge.source)!.add(edge.target);
    adjacency.get(edge.target)!.add(edge.source);
  }

  const positions = new Map<string, { x: number; y: number }>();

  // Layout papers in a grid in the center
  const papersPerRow = Math.ceil(Math.sqrt(papers.length));
  const paperSpacing = 250;
  const paperStartX = centerX - ((papersPerRow - 1) * paperSpacing) / 2;
  const paperStartY = centerY - ((Math.ceil(papers.length / papersPerRow) - 1) * paperSpacing) / 2;

  papers.forEach((paper, i) => {
    const row = Math.floor(i / papersPerRow);
    const col = i % papersPerRow;
    positions.set(paper.id, {
      x: paperStartX + col * paperSpacing,
      y: paperStartY + row * paperSpacing,
    });
  });

  // Layout other nodes around their connected papers
  others.forEach((node) => {
    const connectedPapers = papers.filter(p =>
      adjacency.get(node.id)?.has(p.id) || adjacency.get(p.id)?.has(node.id)
    );

    if (connectedPapers.length > 0) {
      // Average position of connected papers
      const avgX = connectedPapers.reduce((sum, p) => sum + positions.get(p.id)!.x, 0) / connectedPapers.length;
      const avgY = connectedPapers.reduce((sum, p) => sum + positions.get(p.id)!.y, 0) / connectedPapers.length;

      // Offset based on entity type
      const group = entityTypeGroups[node.entity_type];
      const radius = 100 + Math.random() * 50;

      positions.set(node.id, {
        x: avgX + Math.cos(group.angle + Math.random() * 0.5) * radius,
        y: avgY + Math.sin(group.angle + Math.random() * 0.5) * radius,
      });
    } else {
      // Orphan nodes go to edges
      const group = entityTypeGroups[node.entity_type];
      positions.set(node.id, {
        x: centerX + Math.cos(group.angle) * (width * 0.4) + Math.random() * 50,
        y: centerY + Math.sin(group.angle) * (height * 0.4) + Math.random() * 50,
      });
    }
  });

  // Convert to React Flow format
  const flowNodes: Node[] = nodes.map((node) => ({
    id: node.id,
    type: node.entity_type.toLowerCase(),
    position: positions.get(node.id) || { x: centerX, y: centerY },
    data: {
      label: node.name,
      entityType: node.entity_type,
      properties: node.properties,
      isHighlighted: false,
      importance: calculateImportance(node, edges),
    },
  }));

  const flowEdges: Edge[] = edges.map((edge) => {
    const style = relationshipStyles[edge.relationship_type] || defaultEdgeStyle;
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.relationship_type.replace(/_/g, ' '),
      type: 'smoothstep',
      animated: style.animated || false,
      style: getEdgeStyle(edge.relationship_type),
      markerEnd: style.markerEnd ? {
        type: MarkerType.ArrowClosed,
        color: style.stroke,
        width: 15,
        height: 15,
      } : undefined,
    };
  });

  return { nodes: flowNodes, edges: flowEdges };
}

/**
 * Radial layout - Central node with others arranged in concentric circles
 */
export function radialLayout(
  nodes: GraphEntity[],
  edges: GraphEdge[],
  options: LayoutOptions = {}
): { nodes: Node[]; edges: Edge[] } {
  const { width = 1200, height = 800 } = options;
  const centerX = width / 2;
  const centerY = height / 2;

  // Group nodes by entity type
  const nodesByType = new Map<EntityType, GraphEntity[]>();
  for (const node of nodes) {
    const group = nodesByType.get(node.entity_type) || [];
    group.push(node);
    nodesByType.set(node.entity_type, group);
  }

  const positions = new Map<string, { x: number; y: number }>();
  const typeOrder: EntityType[] = ['Paper', 'Author', 'Concept', 'Method', 'Finding'];
  
  let currentRadius = 0;
  const radiusIncrement = 150;

  for (const type of typeOrder) {
    const typeNodes = nodesByType.get(type) || [];
    if (typeNodes.length === 0) continue;

    currentRadius += radiusIncrement;
    const angleStep = (2 * Math.PI) / typeNodes.length;

    typeNodes.forEach((node, i) => {
      const angle = i * angleStep - Math.PI / 2; // Start from top
      positions.set(node.id, {
        x: centerX + Math.cos(angle) * currentRadius,
        y: centerY + Math.sin(angle) * currentRadius,
      });
    });
  }

  // Convert to React Flow format
  const flowNodes: Node[] = nodes.map((node) => ({
    id: node.id,
    type: node.entity_type.toLowerCase(),
    position: positions.get(node.id) || { x: centerX, y: centerY },
    data: {
      label: node.name,
      entityType: node.entity_type,
      properties: node.properties,
      isHighlighted: false,
      importance: calculateImportance(node, edges),
    },
  }));

  const flowEdges: Edge[] = edges.map((edge) => {
    const style = relationshipStyles[edge.relationship_type] || defaultEdgeStyle;
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: 'bezier', // Bezier curves work better for radial layout
      animated: style.animated || false,
      style: getEdgeStyle(edge.relationship_type),
      markerEnd: style.markerEnd ? {
        type: MarkerType.ArrowClosed,
        color: style.stroke,
        width: 15,
        height: 15,
      } : undefined,
    };
  });

  return { nodes: flowNodes, edges: flowEdges };
}

/**
 * Update node positions with highlight state
 */
export function updateNodeHighlights(
  nodes: Node[],
  highlightedNodeIds: string[]
): Node[] {
  const highlightSet = new Set(highlightedNodeIds);
  return nodes.map(node => ({
    ...node,
    data: {
      ...node.data,
      isHighlighted: highlightSet.has(node.id),
    },
  }));
}

/**
 * Update edge styles with highlight state
 */
export function updateEdgeHighlights(
  edges: Edge[],
  highlightedEdgeIds: string[]
): Edge[] {
  const highlightSet = new Set(highlightedEdgeIds);
  return edges.map(edge => ({
    ...edge,
    animated: highlightSet.has(edge.id) || edge.animated,
    style: {
      ...edge.style,
      stroke: highlightSet.has(edge.id) ? '#facc15' : edge.style?.stroke,
      strokeWidth: highlightSet.has(edge.id) ? 3 : edge.style?.strokeWidth,
    },
  }));
}

export type LayoutType = 'force' | 'hierarchical' | 'radial' | 'conceptCentric';

/**
 * Concept-centric layout - Concepts in center, Papers/Authors radiate out
 * This is the key differentiator for ScholaRAG_Graph
 */
export function conceptCentricLayout(
  nodes: GraphEntity[],
  edges: GraphEdge[],
  options: LayoutOptions = {}
): { nodes: Node[]; edges: Edge[] } {
  const { width = 1200, height = 800 } = options;
  const centerX = width / 2;
  const centerY = height / 2;

  // Separate nodes by category
  const conceptTypes = ['Concept', 'Method', 'Finding'];
  const conceptNodes = nodes.filter(n => conceptTypes.includes(n.entity_type));
  const paperNodes = nodes.filter(n => n.entity_type === 'Paper');
  const authorNodes = nodes.filter(n => n.entity_type === 'Author');

  // Build adjacency for concept connections
  const conceptConnections = new Map<string, number>();
  for (const edge of edges) {
    if (edge.relationship_type === 'DISCUSSES_CONCEPT' ||
        edge.relationship_type === 'USES_METHOD' ||
        edge.relationship_type === 'SUPPORTS') {
      conceptConnections.set(edge.target, (conceptConnections.get(edge.target) || 0) + 1);
    }
  }

  const positions = new Map<string, { x: number; y: number }>();

  // Sort concepts by connection count (most connected in center)
  const sortedConcepts = [...conceptNodes].sort((a, b) =>
    (conceptConnections.get(b.id) || 0) - (conceptConnections.get(a.id) || 0)
  );

  // Layout concepts in center with radial arrangement
  const conceptCount = sortedConcepts.length;
  const conceptRadius = Math.min(width, height) * 0.25;

  sortedConcepts.forEach((concept, i) => {
    if (i === 0 && conceptCount > 1) {
      // Most connected concept in exact center
      positions.set(concept.id, { x: centerX, y: centerY });
    } else {
      const angle = ((i - 1) / Math.max(conceptCount - 1, 1)) * 2 * Math.PI - Math.PI / 2;
      const radius = conceptRadius * (1 + (i / conceptCount) * 0.3);
      positions.set(concept.id, {
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius,
      });
    }
  });

  // Build concept-paper adjacency
  const paperToConceptsMap = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.relationship_type === 'DISCUSSES_CONCEPT' ||
        edge.relationship_type === 'USES_METHOD' ||
        edge.relationship_type === 'SUPPORTS') {
      const concepts = paperToConceptsMap.get(edge.source) || [];
      concepts.push(edge.target);
      paperToConceptsMap.set(edge.source, concepts);
    }
  }

  // Layout papers around their connected concepts
  const outerRadius = Math.min(width, height) * 0.4;
  paperNodes.forEach((paper, i) => {
    const connectedConcepts = paperToConceptsMap.get(paper.id) || [];

    if (connectedConcepts.length > 0) {
      // Position near the average of connected concepts
      let avgX = 0, avgY = 0;
      for (const conceptId of connectedConcepts) {
        const pos = positions.get(conceptId);
        if (pos) {
          avgX += pos.x;
          avgY += pos.y;
        }
      }
      avgX /= connectedConcepts.length;
      avgY /= connectedConcepts.length;

      // Push outward from center
      const dx = avgX - centerX;
      const dy = avgY - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const pushFactor = outerRadius / dist;

      positions.set(paper.id, {
        x: centerX + dx * pushFactor + (Math.random() - 0.5) * 50,
        y: centerY + dy * pushFactor + (Math.random() - 0.5) * 50,
      });
    } else {
      // Orphan papers go to outer ring
      const angle = (i / paperNodes.length) * 2 * Math.PI;
      positions.set(paper.id, {
        x: centerX + Math.cos(angle) * outerRadius * 1.2,
        y: centerY + Math.sin(angle) * outerRadius * 1.2,
      });
    }
  });

  // Layout authors at outermost ring
  const authorRadius = Math.min(width, height) * 0.45;
  authorNodes.forEach((author, i) => {
    const angle = (i / authorNodes.length) * 2 * Math.PI + Math.PI / 4;
    positions.set(author.id, {
      x: centerX + Math.cos(angle) * authorRadius,
      y: centerY + Math.sin(angle) * authorRadius,
    });
  });

  // Convert to React Flow format
  const flowNodes: Node[] = nodes.map((node) => ({
    id: node.id,
    type: node.entity_type.toLowerCase(),
    position: positions.get(node.id) || { x: centerX, y: centerY },
    data: {
      label: node.name,
      entityType: node.entity_type,
      properties: node.properties,
      isHighlighted: false,
      importance: calculateImportance(node, edges),
      // Mark concepts as primary in this layout
      isPrimary: conceptTypes.includes(node.entity_type),
    },
  }));

  const flowEdges: Edge[] = edges.map((edge) => {
    const style = relationshipStyles[edge.relationship_type] || defaultEdgeStyle;
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: 'smoothstep',
      animated: style.animated || false,
      style: getEdgeStyle(edge.relationship_type),
      markerEnd: style.markerEnd ? {
        type: MarkerType.ArrowClosed,
        color: style.stroke,
        width: 12,
        height: 12,
      } : undefined,
    };
  });

  return { nodes: flowNodes, edges: flowEdges };
}

export function applyLayout(
  nodes: GraphEntity[],
  edges: GraphEdge[],
  layoutType: LayoutType = 'force',
  options?: LayoutOptions
): { nodes: Node[]; edges: Edge[] } {
  switch (layoutType) {
    case 'hierarchical':
      return hierarchicalLayout(nodes, edges, options);
    case 'radial':
      return radialLayout(nodes, edges, options);
    case 'conceptCentric':
      return conceptCentricLayout(nodes, edges, options);
    case 'force':
    default:
      return forceDirectedLayout(nodes, edges, options);
  }
}
