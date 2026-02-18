'use client';

import { useMemo, useCallback } from 'react';
import { Target } from 'lucide-react';
import type { StructuralGap, ConceptCluster } from '@/types';

const clusterColors = [
  '#E63946', '#2EC4B6', '#F4A261', '#457B9D', '#A8DADC',
  '#9D4EDD', '#06D6A0', '#118AB2', '#EF476F', '#FFD166',
  '#073B4C', '#7209B7',
];

interface FrontierMatrixProps {
  gaps: StructuralGap[];
  selectedGapId: string | null;
  onGapSelect: (gap: StructuralGap) => void;
  clusters: ConceptCluster[];
}

export function FrontierMatrix({ gaps, selectedGapId, onGapSelect, clusters }: FrontierMatrixProps) {
  const getClusterColor = useCallback((clusterId: number) => {
    return clusterColors[clusterId % clusterColors.length];
  }, []);

  // Only show matrix if any gap has scores
  const hasScores = useMemo(() => gaps.some(g => (g.impact_score ?? 0) > 0 || (g.feasibility_score ?? 0) > 0), [gaps]);

  const padding = 40;
  const width = 420;
  const height = 340;
  const plotW = width - padding * 2;
  const plotH = height - padding * 2;

  if (!hasScores || gaps.length === 0) return null;

  return (
    <div className="border border-ink/10 dark:border-paper/10 bg-paper dark:bg-ink">
      <div className="flex items-center gap-2 p-3 border-b border-ink/10 dark:border-paper/10">
        <Target className="w-3 h-3 text-accent-amber" />
        <span className="font-mono text-xs uppercase tracking-wider text-ink dark:text-paper">
          Frontier Matrix
        </span>
      </div>
      <div className="p-2">
        <svg width={width} height={height} className="w-full" viewBox={`0 0 ${width} ${height}`}>
          {/* Background quadrants */}
          <rect x={padding} y={padding} width={plotW / 2} height={plotH / 2}
            fill="rgba(139, 92, 246, 0.05)" />
          <rect x={padding + plotW / 2} y={padding} width={plotW / 2} height={plotH / 2}
            fill="rgba(245, 158, 11, 0.08)" />
          <rect x={padding} y={padding + plotH / 2} width={plotW / 2} height={plotH / 2}
            fill="rgba(107, 114, 128, 0.03)" />
          <rect x={padding + plotW / 2} y={padding + plotH / 2} width={plotW / 2} height={plotH / 2}
            fill="rgba(20, 184, 166, 0.05)" />

          {/* Quadrant labels */}
          <text x={padding + plotW * 0.75} y={padding + 14} textAnchor="middle"
            className="fill-amber-500/60 text-[10px] font-mono">⭐ Quick Win</text>
          <text x={padding + plotW * 0.25} y={padding + 14} textAnchor="middle"
            className="fill-purple-400/60 text-[10px] font-mono">🔬 Ambitious</text>
          <text x={padding + plotW * 0.75} y={padding + plotH - 4} textAnchor="middle"
            className="fill-teal-400/60 text-[10px] font-mono">✅ Safe Start</text>
          <text x={padding + plotW * 0.25} y={padding + plotH - 4} textAnchor="middle"
            className="fill-gray-400/40 text-[10px] font-mono">⏳ Low Priority</text>

          {/* Axes */}
          <line x1={padding} y1={padding} x2={padding} y2={padding + plotH}
            stroke="currentColor" strokeOpacity={0.2} />
          <line x1={padding} y1={padding + plotH} x2={padding + plotW} y2={padding + plotH}
            stroke="currentColor" strokeOpacity={0.2} />

          {/* Midpoint dashed lines */}
          <line x1={padding + plotW / 2} y1={padding} x2={padding + plotW / 2} y2={padding + plotH}
            stroke="currentColor" strokeOpacity={0.1} strokeDasharray="4 4" />
          <line x1={padding} y1={padding + plotH / 2} x2={padding + plotW} y2={padding + plotH / 2}
            stroke="currentColor" strokeOpacity={0.1} strokeDasharray="4 4" />

          {/* Axis labels */}
          <text x={padding + plotW / 2} y={height - 4} textAnchor="middle"
            className="fill-current opacity-40 text-[10px] font-mono">Feasibility →</text>
          <text x={8} y={padding + plotH / 2} textAnchor="middle"
            className="fill-current opacity-40 text-[10px] font-mono"
            transform={`rotate(-90, 8, ${padding + plotH / 2})`}>Impact →</text>

          {/* Data points */}
          {gaps.map((gap, idx) => {
            const fx = gap.feasibility_score ?? 0;
            const iy = gap.impact_score ?? 0;
            const cx = padding + fx * plotW;
            const cy = padding + (1 - iy) * plotH;
            const isSelected = gap.id === selectedGapId;
            const color = getClusterColor(gap.cluster_a_id);

            return (
              <g key={gap.id} onClick={() => onGapSelect(gap)} style={{ cursor: 'pointer' }}>
                {isSelected && (
                  <circle cx={cx} cy={cy} r={14}
                    fill="none" stroke="#F59E0B" strokeWidth={2} strokeOpacity={0.6} />
                )}
                <circle cx={cx} cy={cy} r={isSelected ? 10 : 7}
                  fill={color} fillOpacity={isSelected ? 1 : 0.7}
                  stroke={isSelected ? '#F59E0B' : 'white'} strokeWidth={isSelected ? 2 : 0.5} />
                <text x={cx} y={cy - 10} textAnchor="middle"
                  className="fill-current opacity-50 text-[9px] font-mono">
                  {idx + 1}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
