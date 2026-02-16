'use client';

import { useMemo } from 'react';
import { X, ChevronRight } from 'lucide-react';
import type { GraphEntity, GraphEdge, RelationshipType } from '@/types';

/* ============================================================
   ConceptExplorer - v0.18.0
   Direction B (T-Score 0.4) "Editorial Research"

   Relationship exploration panel. Appears when a node is clicked,
   showing its connections grouped by relationship type.
   ============================================================ */

interface ConceptExplorerProps {
  node: GraphEntity;
  edges: GraphEdge[];
  nodes: GraphEntity[];
  centralityPercentile?: number;
  onRelationshipClick: (edge: GraphEdge) => void;
  onClose: () => void;
  onNodeNavigate?: (nodeId: string) => void;
}

const RELATIONSHIP_TYPE_COLORS: Record<string, string> = {
  'CO_OCCURS_WITH': '#4ECDC4',
  'RELATED_TO': '#9D4EDD',
  'SUPPORTS': '#10B981',
  'CONTRADICTS': '#EF4444',
  'BRIDGES_GAP': '#FFD700',
  'DISCUSSES_CONCEPT': '#45B7D1',
  'USES_METHOD': '#F59E0B',
  'SAME_AS': '#9D4EDD',
  'PREREQUISITE_OF': '#3B82F6',
  'APPLIES_TO': '#14B8A6',
  'ADDRESSES': '#EC4899',
  'MENTIONS': '#64748B',
  'AUTHORED_BY': '#A855F7',
  'CITES': '#6366F1',
};

function getRelationshipColor(type: string): string {
  return RELATIONSHIP_TYPE_COLORS[type] || '#64748B';
}

function formatRelationshipType(type: string): string {
  return type.replace(/_/g, ' ');
}

interface GroupedEdge {
  edge: GraphEdge;
  otherNodeId: string;
  otherNodeName: string;
  paperCount: number;
  similarity?: number;
}

interface RelationshipGroup {
  type: string;
  color: string;
  edges: GroupedEdge[];
}

export function ConceptExplorer({
  node,
  edges,
  nodes,
  centralityPercentile,
  onRelationshipClick,
  onClose,
  onNodeNavigate,
}: ConceptExplorerProps) {
  // Build a quick lookup map for node names
  const nodeNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const n of nodes) {
      map.set(n.id, n.name);
    }
    return map;
  }, [nodes]);

  // Filter edges connected to this node and group by relationship type
  const groups = useMemo<RelationshipGroup[]>(() => {
    const connectedEdges = edges.filter(
      e => e.source === node.id || e.target === node.id
    );

    const groupMap = new Map<string, GroupedEdge[]>();

    for (const edge of connectedEdges) {
      const otherNodeId = edge.source === node.id ? edge.target : edge.source;
      const otherNodeName = nodeNameMap.get(otherNodeId) || otherNodeId;
      const paperCount =
        (typeof edge.properties?.paper_count === 'number'
          ? edge.properties.paper_count
          : undefined) ??
        edge.weight ??
        0;
      const similarity =
        typeof edge.properties?.similarity === 'number'
          ? edge.properties.similarity
          : undefined;

      const grouped: GroupedEdge = {
        edge,
        otherNodeId,
        otherNodeName,
        paperCount,
        similarity,
      };

      const type = edge.relationship_type;
      if (!groupMap.has(type)) {
        groupMap.set(type, []);
      }
      groupMap.get(type)!.push(grouped);
    }

    // Sort groups by edge count descending
    return Array.from(groupMap.entries())
      .sort((a, b) => b[1].length - a[1].length)
      .map(([type, groupEdges]) => ({
        type,
        color: getRelationshipColor(type),
        edges: groupEdges.sort((a, b) => b.paperCount - a.paperCount),
      }));
  }, [edges, node.id, nodeNameMap]);

  const totalConnections = groups.reduce((sum, g) => sum + g.edges.length, 0);

  return (
    <div
      className="absolute top-4 right-[340px] w-80 max-h-[60vh] bg-paper dark:bg-ink border border-ink/10 dark:border-paper/10 overflow-hidden z-30 flex flex-col animate-in fade-in slide-in-from-right-2 duration-200"
    >
      {/* Header */}
      <div className="relative border-b border-ink/10 dark:border-paper/10 px-4 py-3 flex-shrink-0">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0 pr-2">
            <h3
              className="font-display text-sm text-ink dark:text-paper truncate"
              title={node.name}
            >
              {node.name}
            </h3>
            <div className="flex items-center gap-2 mt-1">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
                {node.entity_type}
              </span>
              {centralityPercentile !== undefined && (
                <>
                  <span className="text-ink/20 dark:text-paper/20">|</span>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-accent-teal">
                    Centrality: {Math.round(centralityPercentile * 100)}%
                  </span>
                </>
              )}
            </div>
            <span className="font-mono text-[10px] text-muted mt-0.5 block">
              {totalConnections} connection{totalConnections !== 1 ? 's' : ''}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-muted hover:text-accent-red transition-colors flex-shrink-0"
            aria-label="Close concept explorer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Relationship Groups */}
      <div className="overflow-y-auto flex-1">
        {groups.length === 0 && (
          <div className="px-4 py-6 text-center">
            <p className="text-xs text-muted">No connections found</p>
          </div>
        )}

        {groups.map((group) => (
          <div key={group.type} className="border-b border-ink/5 dark:border-paper/5 last:border-b-0">
            {/* Group header */}
            <div
              className="px-4 py-2 flex items-center gap-2"
              style={{ borderLeft: `3px solid ${group.color}` }}
            >
              <span
                className="font-mono text-[10px] uppercase tracking-wider font-medium"
                style={{ color: group.color }}
              >
                {formatRelationshipType(group.type)}
              </span>
              <span className="font-mono text-[10px] text-muted">
                ({group.edges.length})
              </span>
            </div>

            {/* Edge rows */}
            <ul className="pb-1">
              {group.edges.map((item) => (
                <li
                  key={item.edge.id}
                  className="flex items-center justify-between px-4 py-1.5 hover:bg-surface/5 transition-colors group"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {onNodeNavigate ? (
                      <button
                        onClick={() => onNodeNavigate(item.otherNodeId)}
                        className="text-xs text-ink dark:text-paper hover:text-accent-teal transition-colors truncate text-left"
                        title={`Navigate to ${item.otherNodeName}`}
                      >
                        {item.otherNodeName}
                      </button>
                    ) : (
                      <span className="text-xs text-ink dark:text-paper truncate">
                        {item.otherNodeName}
                      </span>
                    )}
                    {item.paperCount > 0 && (
                      <span className="font-mono text-[10px] text-muted flex-shrink-0">
                        {item.paperCount} {item.paperCount === 1 ? 'paper' : 'papers'}
                      </span>
                    )}
                    {item.similarity !== undefined && (
                      <span className="font-mono text-[10px] text-accent-violet flex-shrink-0">
                        sim: {item.similarity.toFixed(2)}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => onRelationshipClick(item.edge)}
                    className="p-1 text-muted hover:text-accent-teal transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                    title="View relationship evidence"
                    aria-label={`View evidence for ${item.otherNodeName}`}
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ConceptExplorer;
