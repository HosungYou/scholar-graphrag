'use client';

import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import type { EntityType } from '@/types';

interface ClusterNodeData {
  label: string;
  entityType: 'Cluster';
  nodeCount: number;
  entityTypes: Record<EntityType, number>;
  dominantType: EntityType;
  baseColor: string;
  nodeIds: string[];
  isHighlighted?: boolean;
}

const entityColors: Record<EntityType, string> = {
  Paper: '#3b82f6',
  Author: '#10b981',
  Concept: '#8b5cf6',
  Method: '#f59e0b',
  Finding: '#ef4444',
};

function ClusterNodeComponent({ data, selected }: NodeProps<ClusterNodeData>) {
  const { nodeCount, entityTypes, dominantType, isHighlighted } = data;
  
  const size = Math.min(80, 40 + Math.sqrt(nodeCount) * 3);
  
  const typeEntries = Object.entries(entityTypes)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]) as [EntityType, number][];
  
  let startAngle = 0;
  const total = nodeCount;
  
  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring' as const, stiffness: 400, damping: 25 }}
      className={clsx(
        'relative cursor-pointer transition-all duration-200',
        selected && 'z-10'
      )}
      style={{ width: size, height: size }}
    >
      <Handle type="target" position={Position.Top} className="opacity-0" />
      
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="drop-shadow-lg"
      >
        <defs>
          <filter id={`cluster-glow-${data.label}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        
        <g transform={`translate(${size/2}, ${size/2})`}>
          {typeEntries.map(([type, count]) => {
            const angle = (count / total) * 360;
            const endAngle = startAngle + angle;
            
            const startRad = (startAngle - 90) * Math.PI / 180;
            const endRad = (endAngle - 90) * Math.PI / 180;
            const radius = size / 2 - 4;
            
            const x1 = Math.cos(startRad) * radius;
            const y1 = Math.sin(startRad) * radius;
            const x2 = Math.cos(endRad) * radius;
            const y2 = Math.sin(endRad) * radius;
            
            const largeArc = angle > 180 ? 1 : 0;
            
            const path = angle >= 360 
              ? `M 0 ${-radius} A ${radius} ${radius} 0 1 1 0 ${radius} A ${radius} ${radius} 0 1 1 0 ${-radius}`
              : `M 0 0 L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
            
            const currentStart = startAngle;
            startAngle = endAngle;
            
            return (
              <path
                key={type}
                d={path}
                fill={entityColors[type]}
                opacity={0.8}
                stroke="white"
                strokeWidth={1}
                filter={isHighlighted ? `url(#cluster-glow-${data.label})` : undefined}
              />
            );
          })}
          
          <circle
            r={size / 4}
            fill="white"
            className="dark:fill-slate-800"
          />
          
          <text
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-slate-700 dark:fill-slate-200 font-bold"
            style={{ fontSize: Math.max(10, size / 5) }}
          >
            {nodeCount}
          </text>
        </g>
      </svg>
      
      {selected && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap"
        >
          <div className="glass-panel !py-1 !px-2 text-xs">
            <span className="font-medium text-slate-700 dark:text-slate-300">
              {nodeCount} nodes
            </span>
            <span className="text-slate-400 mx-1">•</span>
            <span className="text-slate-500 dark:text-slate-400">
              Click to expand
            </span>
          </div>
        </motion.div>
      )}
      
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </motion.div>
  );
}

export const ClusterNode = memo(ClusterNodeComponent);
