'use client';

import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Lightbulb, Beaker, Trophy, AlertCircle, Database, Target, Sparkles, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';

interface CircularNodeData {
  label: string;
  entityType: string;
  properties?: Record<string, any>;
  isHighlighted?: boolean;
  // Centrality metrics for sizing
  centralityDegree?: number;
  centralityBetweenness?: number;
  centralityPagerank?: number;
  // Cluster info for coloring
  clusterId?: number;
  clusterColor?: string;
  // Gap bridge indicator
  isGapBridge?: boolean;
  // Definition for tooltip
  definition?: string;
  // Paper count
  paperCount?: number;
}

// Entity type icons - only for concept-centric types
const iconMap: Record<string, React.ReactNode> = {
  Concept: <Lightbulb className="w-full h-full p-1" />,
  Method: <Beaker className="w-full h-full p-1" />,
  Finding: <Trophy className="w-full h-full p-1" />,
  Problem: <AlertCircle className="w-full h-full p-1" />,
  Dataset: <Database className="w-full h-full p-1" />,
  Metric: <Target className="w-full h-full p-1" />,
  Innovation: <Sparkles className="w-full h-full p-1" />,
  Limitation: <AlertTriangle className="w-full h-full p-1" />,
};

// Default colors by entity type (used when no cluster color)
const entityColors: Record<string, string> = {
  Concept: '#8B5CF6',    // Purple
  Method: '#F59E0B',     // Amber
  Finding: '#10B981',    // Emerald
  Problem: '#EF4444',    // Red
  Dataset: '#3B82F6',    // Blue
  Metric: '#EC4899',     // Pink
  Innovation: '#14B8A6', // Teal
  Limitation: '#F97316', // Orange
};

// Cluster colors - visually distinct palette
const clusterColors = [
  '#FF6B6B', // Red
  '#4ECDC4', // Teal
  '#45B7D1', // Sky Blue
  '#96CEB4', // Sage Green
  '#FFEAA7', // Yellow
  '#DDA0DD', // Plum
  '#98D8C8', // Mint
  '#F7DC6F', // Gold
  '#BB8FCE', // Lavender
  '#85C1E9', // Light Blue
  '#F8B500', // Orange
  '#82E0AA', // Light Green
];

/**
 * Calculate node size based on centrality metrics
 * Returns a value between MIN_SIZE and MAX_SIZE
 */
function calculateSize(data: CircularNodeData): number {
  const MIN_SIZE = 40;
  const MAX_SIZE = 100;

  // Use PageRank as primary sizing metric (0-1 normalized)
  const pagerank = data.centralityPagerank ?? 0;

  // Add bonus for high betweenness (bridge nodes)
  const betweennessBonus = (data.centralityBetweenness ?? 0) * 10;

  // Calculate size
  const size = MIN_SIZE + (MAX_SIZE - MIN_SIZE) * (pagerank + betweennessBonus * 0.3);

  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, size));
}

/**
 * Calculate opacity based on centrality (more important = more opaque)
 */
function calculateOpacity(data: CircularNodeData): number {
  const MIN_OPACITY = 0.6;
  const MAX_OPACITY = 1.0;

  const centrality = Math.max(
    data.centralityPagerank ?? 0,
    data.centralityDegree ?? 0
  );

  return MIN_OPACITY + (MAX_OPACITY - MIN_OPACITY) * centrality;
}

/**
 * Get node color based on cluster or entity type
 */
function getNodeColor(data: CircularNodeData): string {
  // Use cluster color if available
  if (data.clusterColor) {
    return data.clusterColor;
  }

  // Use cluster ID to select from palette
  if (data.clusterId !== undefined && data.clusterId !== null) {
    return clusterColors[data.clusterId % clusterColors.length];
  }

  // Fall back to entity type color
  return entityColors[data.entityType] ?? '#94A3B8';
}

function CircularNodeComponent({ data, selected }: NodeProps<CircularNodeData>) {
  const size = calculateSize(data);
  const opacity = calculateOpacity(data);
  const color = getNodeColor(data);
  const icon = iconMap[data.entityType];

  // Calculate icon size relative to node
  const iconSize = Math.max(16, size * 0.35);

  // Truncate label for display
  const displayLabel = data.label.length > 20
    ? data.label.substring(0, 18) + '...'
    : data.label;

  return (
    <div
      className="relative group cursor-pointer"
      style={{
        width: size,
        height: size,
      }}
      title={`${data.label}${data.definition ? `\n\n${data.definition}` : ''}`}
    >
      {/* Handles for connections - positioned at edges */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2 !h-2 !bg-gray-400 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ top: -4 }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2 !h-2 !bg-gray-400 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ bottom: -4 }}
      />
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !bg-gray-400 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ left: -4 }}
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !bg-gray-400 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ right: -4 }}
      />

      {/* Main circular node */}
      <div
        className={clsx(
          'rounded-full flex flex-col items-center justify-center transition-all duration-300',
          'shadow-md hover:shadow-lg',
          selected && 'ring-4 ring-blue-500 ring-offset-2',
          data.isHighlighted && 'ring-4 ring-yellow-400 ring-opacity-75 animate-pulse',
          data.isGapBridge && 'border-dashed'
        )}
        style={{
          width: size,
          height: size,
          backgroundColor: color,
          opacity: opacity,
          borderWidth: data.isGapBridge ? 3 : 2,
          borderColor: data.isGapBridge ? '#FFD700' : 'rgba(255,255,255,0.5)',
          borderStyle: data.isGapBridge ? 'dashed' : 'solid',
        }}
      >
        {/* Icon */}
        {icon && (
          <div
            className="text-white opacity-80"
            style={{ width: iconSize, height: iconSize }}
          >
            {icon}
          </div>
        )}

        {/* Label - only show if size is large enough */}
        {size >= 60 && (
          <span
            className="text-white text-center px-1 leading-tight font-medium"
            style={{
              fontSize: Math.max(8, size * 0.12),
              maxWidth: size - 8,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {displayLabel}
          </span>
        )}
      </div>

      {/* External label for smaller nodes */}
      {size < 60 && (
        <div
          className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-center pointer-events-none"
          style={{
            top: size + 4,
            fontSize: 10,
            color: '#374151',
            textShadow: '0 0 3px white, 0 0 3px white',
            maxWidth: 100,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {displayLabel}
        </div>
      )}

      {/* Paper count badge */}
      {data.paperCount && data.paperCount > 0 && (
        <div
          className="absolute -top-1 -right-1 bg-blue-600 text-white text-xs rounded-full flex items-center justify-center font-bold shadow-sm"
          style={{
            width: Math.max(16, size * 0.25),
            height: Math.max(16, size * 0.25),
            fontSize: Math.max(8, size * 0.1),
          }}
        >
          {data.paperCount}
        </div>
      )}

      {/* Gap bridge indicator */}
      {data.isGapBridge && (
        <div
          className="absolute -bottom-1 -right-1 bg-yellow-500 text-black text-xs rounded-full flex items-center justify-center shadow-sm"
          style={{
            width: 18,
            height: 18,
          }}
          title="Bridge Concept - Connects Research Gaps"
        >
          <Sparkles className="w-3 h-3" />
        </div>
      )}

      {/* Hover tooltip with more details */}
      <div
        className="absolute left-1/2 -translate-x-1/2 -translate-y-full opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50"
        style={{ top: -8 }}
      >
        <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg max-w-xs">
          <div className="font-semibold">{data.label}</div>
          <div className="text-gray-400">{data.entityType}</div>
          {data.definition && (
            <div className="mt-1 text-gray-300 text-xs line-clamp-2">
              {data.definition}
            </div>
          )}
          {data.paperCount !== undefined && (
            <div className="mt-1 text-blue-300">
              {data.paperCount} paper{data.paperCount !== 1 ? 's' : ''}
            </div>
          )}
          {data.centralityPagerank !== undefined && (
            <div className="mt-1 text-purple-300">
              Importance: {(data.centralityPagerank * 100).toFixed(1)}%
            </div>
          )}
        </div>
        {/* Arrow */}
        <div className="absolute left-1/2 -translate-x-1/2 border-8 border-transparent border-t-gray-900" />
      </div>
    </div>
  );
}

export const CircularNode = memo(CircularNodeComponent);
