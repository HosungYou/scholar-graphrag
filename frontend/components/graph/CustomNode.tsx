'use client';

import { memo, useMemo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { motion } from 'framer-motion';
import { FileText, User, Lightbulb, Beaker, Trophy, ExternalLink, Activity } from 'lucide-react';
import clsx from 'clsx';

interface CustomNodeData {
  label: string;
  entityType: string;
  properties?: Record<string, unknown>;
  isHighlighted?: boolean;
  importance?: number;
  citationCount?: number;
}

const iconMap: Record<string, React.ReactNode> = {
  Paper: <FileText className="w-4 h-4" />,
  Author: <User className="w-4 h-4" />,
  Concept: <Lightbulb className="w-4 h-4" />,
  Method: <Beaker className="w-4 h-4" />,
  Finding: <Trophy className="w-4 h-4" />,
};

const nexusColors: Record<string, string> = {
  Paper: '#3b82f6',
  Author: '#10b981',
  Concept: '#8b5cf6',
  Method: '#f59e0b',
  Finding: '#ef4444',
};

function CustomNodeComponent({ data, selected }: NodeProps<CustomNodeData>) {
  const nodeColor = nexusColors[data.entityType] || nexusColors.Paper;
  const icon = iconMap[data.entityType] || iconMap.Paper;
  
  const scale = useMemo(() => {
    if (data.importance) return 1 + (data.importance * 0.2);
    return 1;
  }, [data.importance]);

  const year = data.properties?.year as string | number | undefined;

  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ 
        scale: data.isHighlighted ? scale * 1.05 : scale, 
        opacity: 1 
      }}
      whileHover={{ scale: scale * 1.05, y: -5 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className={clsx(
        'relative px-5 py-4 rounded-2xl border-2 transition-all duration-500',
        'min-w-[160px] max-w-[240px]',
        'bg-nexus-950/80 backdrop-blur-nexus',
        selected ? 'border-white ring-4 ring-white/20' : 'border-white/10',
        data.isHighlighted ? 'z-50' : 'z-0'
      )}
      style={{
        borderColor: data.isHighlighted || selected ? nodeColor : 'rgba(255,255,255,0.1)',
        boxShadow: data.isHighlighted 
          ? `0 0 30px ${nodeColor}66, inset 0 0 15px ${nodeColor}33`
          : '0 10px 30px -10px rgba(0,0,0,0.5)',
      }}
    >
      {/* Background Glow */}
      <div 
        className="absolute inset-0 rounded-2xl opacity-10 pointer-events-none"
        style={{ background: `radial-gradient(circle at center, ${nodeColor}, transparent)` }}
      />

      {/* Pulsing Core for important nodes */}
      {data.importance && data.importance > 0.7 && (
        <motion.div
          className="absolute -inset-1 rounded-2xl opacity-20 pointer-events-none"
          style={{ border: `2px solid ${nodeColor}` }}
          animate={{ scale: [1, 1.05, 1], opacity: [0.2, 0.5, 0.2] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      )}

      <Handle type="target" position={Position.Top} className="!bg-white/20 !border-none !w-2 !h-2" />
      <Handle type="source" position={Position.Bottom} className="!bg-white/20 !border-none !w-2 !h-2" />

      <div className="relative flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div 
            className="p-1.5 rounded-lg text-white"
            style={{ backgroundColor: `${nodeColor}33`, color: nodeColor }}
          >
            {icon}
          </div>
          {year && (
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">
              {year}
            </span>
          )}
        </div>
        
        <div className="flex flex-col">
          <p className="text-sm font-bold text-slate-100 leading-tight line-clamp-2 font-display">
            {data.label}
          </p>
          <span className="text-[10px] font-bold uppercase tracking-tighter mt-1 opacity-50" style={{ color: nodeColor }}>
            {data.entityType}
          </span>
        </div>

        {data.citationCount && data.citationCount > 0 && (
          <div className="flex items-center gap-1 mt-1">
            <Activity className="w-3 h-3 text-nexus-cyan opacity-70" />
            <span className="text-[10px] text-nexus-cyan/80 font-mono">
              {data.citationCount} CITATIONS
            </span>
          </div>
        )}
      </div>

      {/* Progress Bar (Importance) */}
      {data.importance !== undefined && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-2xl overflow-hidden bg-white/5">
          <motion.div
            className="h-full"
            style={{ backgroundColor: nodeColor }}
            initial={{ width: 0 }}
            animate={{ width: `${data.importance * 100}%` }}
          />
        </div>
      )}
    </motion.div>
  );
}

export const CustomNode = memo(CustomNodeComponent);
