'use client';

import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { FileText, User, Lightbulb, Beaker, Trophy } from 'lucide-react';
import clsx from 'clsx';

interface CustomNodeData {
  label: string;
  entityType: string;
  properties?: Record<string, any>;
  isHighlighted?: boolean;
}

const iconMap: Record<string, React.ReactNode> = {
  Paper: <FileText className="w-4 h-4" />,
  Author: <User className="w-4 h-4" />,
  Concept: <Lightbulb className="w-4 h-4" />,
  Method: <Beaker className="w-4 h-4" />,
  Finding: <Trophy className="w-4 h-4" />,
};

const colorMap: Record<string, { bg: string; border: string; text: string }> = {
  Paper: {
    bg: 'bg-blue-50',
    border: 'border-blue-400',
    text: 'text-blue-700',
  },
  Author: {
    bg: 'bg-green-50',
    border: 'border-green-400',
    text: 'text-green-700',
  },
  Concept: {
    bg: 'bg-purple-50',
    border: 'border-purple-400',
    text: 'text-purple-700',
  },
  Method: {
    bg: 'bg-amber-50',
    border: 'border-amber-400',
    text: 'text-amber-700',
  },
  Finding: {
    bg: 'bg-red-50',
    border: 'border-red-400',
    text: 'text-red-700',
  },
};

function CustomNodeComponent({ data, selected }: NodeProps<CustomNodeData>) {
  const colors = colorMap[data.entityType] || colorMap.Paper;
  const icon = iconMap[data.entityType] || iconMap.Paper;

  return (
    <div
      className={clsx(
        'px-4 py-3 rounded-lg border-2 shadow-sm transition-all duration-200 min-w-[120px] max-w-[200px]',
        colors.bg,
        colors.border,
        selected && 'ring-2 ring-blue-500 ring-offset-2',
        data.isHighlighted && 'ring-4 ring-yellow-400 ring-opacity-75 animate-pulse'
      )}
    >
      {/* Handles for connections */}
      <Handle
        type="target"
        position={Position.Top}
        className="w-2 h-2 !bg-gray-400"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="w-2 h-2 !bg-gray-400"
      />

      {/* Node content */}
      <div className="flex items-start gap-2">
        <div className={clsx('flex-shrink-0 mt-0.5', colors.text)}>{icon}</div>
        <div className="min-w-0 flex-1">
          <p
            className={clsx(
              'text-sm font-medium truncate',
              colors.text
            )}
            title={data.label}
          >
            {data.label}
          </p>
          <p className="text-xs text-gray-500">{data.entityType}</p>
          {data.properties?.year && (
            <p className="text-xs text-gray-400">{data.properties.year}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export const CustomNode = memo(CustomNodeComponent);
