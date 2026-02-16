'use client';

import { memo, useMemo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { FileText, User, Lightbulb, Beaker, Trophy, Activity, MessageSquare } from 'lucide-react';
import clsx from 'clsx';

interface CustomNodeData {
  label: string;
  entityType: string;
  properties?: Record<string, unknown>;
  isHighlighted?: boolean;
  importance?: number;
  citationCount?: number;
  paperCount?: number;
}

const iconMap: Record<string, React.ReactNode> = {
  Paper: <FileText className="w-4 h-4" />,
  Author: <User className="w-4 h-4" />,
  Concept: <Lightbulb className="w-4 h-4" />,
  Method: <Beaker className="w-4 h-4" />,
  Finding: <Trophy className="w-4 h-4" />,
  Result: <Trophy className="w-4 h-4" />,
  Claim: <MessageSquare className="w-4 h-4" />,
};

const nexusColors: Record<string, string> = {
  Paper: '#3b82f6',
  Author: '#10b981',
  Concept: '#8b5cf6',
  Method: '#f59e0b',
  Finding: '#ef4444',
  Result: '#ef4444',
  Claim: '#ec4899',
};

function CustomNodeComponent({ data, selected }: NodeProps<CustomNodeData>) {
  const nodeColor = nexusColors[data.entityType] || nexusColors.Paper;
  const icon = iconMap[data.entityType] || iconMap.Paper;

  const paperCount = useMemo(() => {
    return (data.properties?.paper_count as number) || 0;
  }, [data.properties?.paper_count]);

  const scale = useMemo(() => {
    let baseScale = 1;
    if (data.importance) baseScale += data.importance * 0.15;

    // Add frequency-based boost
    if (paperCount > 0) {
      const frequencyBoost = Math.min(Math.log2(paperCount + 1) * 0.08, 0.3);
      baseScale += frequencyBoost;
    }

    return baseScale;
  }, [data.importance, paperCount]);

  const year = data.properties?.year as string | number | undefined;

  // Use CSS transitions instead of Framer Motion for performance
  return (
    <div
      className={clsx(
        'relative px-5 py-4 rounded border-2',
        'min-w-[160px] max-w-[240px]',
        'bg-surface-2',
        'transition-all duration-200 ease-out',
        'hover:scale-105 hover:-translate-y-1',
        selected ? 'border-text-primary ring-4 ring-teal' : 'border-border',
        data.isHighlighted ? 'z-50 scale-105' : 'z-0'
      )}
      style={{
        transform: `scale(${data.isHighlighted ? scale * 1.05 : scale})`,
        borderColor: data.isHighlighted || selected ? nodeColor : 'rgba(255,255,255,0.1)',
        boxShadow: data.isHighlighted
          ? `0 0 30px ${nodeColor}66, inset 0 0 15px ${nodeColor}33`
          : '0 10px 30px -10px rgba(0,0,0,0.5)',
      }}
    >
      {/* Background Glow - simplified */}
      <div
        className="absolute inset-0 rounded-2xl opacity-10 pointer-events-none"
        style={{ background: `radial-gradient(circle at center, ${nodeColor}, transparent)` }}
      />

      {/* Pulsing indicator for important nodes - CSS animation only */}
      {data.importance && data.importance > 0.7 && (
        <div
          className="absolute -inset-1 rounded-2xl opacity-20 pointer-events-none animate-pulse"
          style={{ border: `2px solid ${nodeColor}` }}
        />
      )}

      <Handle type="target" position={Position.Top} className="!bg-surface-3 !border-none !w-2 !h-2" />
      <Handle type="source" position={Position.Bottom} className="!bg-surface-3 !border-none !w-2 !h-2" />

      <div className="relative flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div
            className="p-1.5 rounded-lg text-white"
            style={{ backgroundColor: `${nodeColor}33`, color: nodeColor }}
          >
            {icon}
          </div>
          {year && (
            <span className="text-[10px] font-mono text-text-ghost uppercase tracking-widest">
              {year}
            </span>
          )}
        </div>

        <div className="flex flex-col">
          <p className="text-sm font-medium text-text-primary leading-tight line-clamp-2 font-display">
            {data.label}
          </p>
          <span className="text-[10px] font-medium uppercase tracking-tighter mt-1 opacity-50" style={{ color: nodeColor }}>
            {data.entityType}
          </span>
        </div>

        {data.citationCount && data.citationCount > 0 && (
          <div className="flex items-center gap-1 mt-1">
            <Activity className="w-3 h-3 text-teal opacity-70" />
            <span className="text-[10px] text-teal font-mono">
              {data.citationCount} CITATIONS
            </span>
          </div>
        )}

        {paperCount > 0 && data.entityType !== 'Paper' && (
          <div className="flex items-center gap-1 mt-1">
            <span className="text-[10px] text-text-ghost font-mono">
              📄 {paperCount} papers
            </span>
          </div>
        )}
      </div>

      {/* Progress Bar (Importance) - CSS transition */}
      {data.importance !== undefined && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b overflow-hidden bg-surface-3">
          <div
            className="h-full transition-all duration-500"
            style={{
              backgroundColor: nodeColor,
              width: `${data.importance * 100}%`
            }}
          />
        </div>
      )}
    </div>
  );
}

export const CustomNode = memo(CustomNodeComponent);
