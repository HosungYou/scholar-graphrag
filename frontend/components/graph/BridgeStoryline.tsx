'use client';

import { useMemo, useCallback } from 'react';
import { ArrowRight, Hexagon, Sparkles, GitBranch } from 'lucide-react';
import type { StructuralGap, ConceptCluster, GraphEntity } from '@/types';

const clusterColors = [
  '#E63946', '#2EC4B6', '#F4A261', '#457B9D', '#A8DADC',
  '#9D4EDD', '#06D6A0', '#118AB2', '#EF476F', '#FFD166',
  '#073B4C', '#7209B7',
];

interface BridgeStorylineProps {
  gap: StructuralGap;
  clusters: ConceptCluster[];
  nodes?: GraphEntity[];
}

export function BridgeStoryline({ gap, clusters, nodes = [] }: BridgeStorylineProps) {
  const getClusterColor = useCallback((clusterId: number) => {
    return clusterColors[clusterId % clusterColors.length];
  }, []);

  const getClusterLabel = useCallback((clusterId: number) => {
    const cluster = clusters.find(c => c.cluster_id === clusterId);
    if (cluster?.label && !/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(cluster.label)) {
      return cluster.label;
    }
    if (cluster?.concept_names && cluster.concept_names.length > 0) {
      const filtered = cluster.concept_names.filter((n: string) => n && n.trim());
      if (filtered.length > 0) return filtered.slice(0, 2).join(' & ');
    }
    return `Cluster ${clusterId + 1}`;
  }, [clusters]);

  const getNodeName = useCallback((nodeId: string): string => {
    const node = nodes.find(n => n.id === nodeId);
    return node?.name || nodeId.slice(0, 8) + '...';
  }, [nodes]);

  const clusterAColor = getClusterColor(gap.cluster_a_id);
  const clusterBColor = getClusterColor(gap.cluster_b_id);

  // Get top bridge candidates with names
  const bridgeCandidates = useMemo(() => {
    return gap.bridge_candidates.slice(0, 3).map(id => ({
      id,
      name: getNodeName(id),
    }));
  }, [gap.bridge_candidates, getNodeName]);

  // Get similarity from potential edges if available
  const avgSimilarity = useMemo(() => {
    if (!gap.potential_edges || gap.potential_edges.length === 0) return null;
    const sum = gap.potential_edges.reduce((acc, pe) => acc + pe.similarity, 0);
    return (sum / gap.potential_edges.length).toFixed(2);
  }, [gap.potential_edges]);

  if (bridgeCandidates.length === 0) return null;

  return (
    <div className="border border-ink/10 dark:border-paper/10 bg-paper dark:bg-ink">
      <div className="flex items-center gap-2 p-3 border-b border-ink/10 dark:border-paper/10">
        <GitBranch className="w-3 h-3 text-accent-teal" />
        <span className="font-mono text-xs uppercase tracking-wider text-ink dark:text-paper">
          Bridge Storyline
        </span>
      </div>
      <div className="p-3">
        <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-stretch gap-1">
          {/* Cluster A Card */}
          <div className="p-2 border border-ink/10 dark:border-paper/10" style={{ borderLeftColor: clusterAColor, borderLeftWidth: 3 }}>
            <div className="flex items-center gap-1 mb-1.5">
              <Hexagon className="w-3 h-3 flex-shrink-0" style={{ color: clusterAColor }} />
              <span className="font-mono text-[10px] uppercase tracking-wider text-ink dark:text-paper truncate" title={getClusterLabel(gap.cluster_a_id)}>
                {getClusterLabel(gap.cluster_a_id)}
              </span>
            </div>
            <div className="space-y-0.5">
              {(gap.cluster_a_names || []).slice(0, 3).map((name, idx) => (
                <div key={idx} className="font-mono text-[10px] text-muted truncate" title={name}>
                  {name}
                </div>
              ))}
              {(gap.cluster_a_names?.length || 0) > 3 && (
                <div className="font-mono text-[10px] text-muted/50">
                  +{(gap.cluster_a_names?.length || 0) - 3} more
                </div>
              )}
            </div>
          </div>

          {/* Arrow */}
          <div className="flex items-center justify-center px-0.5">
            <ArrowRight className="w-3 h-3 text-accent-amber/50" />
          </div>

          {/* Bridge Card */}
          <div className="p-2 border border-accent-amber/30 bg-accent-amber/5">
            <div className="flex items-center gap-1 mb-1.5">
              <Sparkles className="w-3 h-3 text-accent-amber flex-shrink-0" />
              <span className="font-mono text-[10px] uppercase tracking-wider text-accent-amber">
                Bridge
              </span>
            </div>
            <div className="space-y-0.5">
              {bridgeCandidates.map((bc, idx) => (
                <div key={idx} className="font-mono text-[10px] text-ink dark:text-paper truncate" title={bc.name}>
                  {bc.name}
                </div>
              ))}
            </div>
            {avgSimilarity && (
              <div className="mt-1.5 pt-1 border-t border-accent-amber/20">
                <span className="font-mono text-[9px] text-accent-amber/70">
                  유사도: {avgSimilarity}
                </span>
              </div>
            )}
          </div>

          {/* Arrow */}
          <div className="flex items-center justify-center px-0.5">
            <ArrowRight className="w-3 h-3 text-accent-amber/50" />
          </div>

          {/* Cluster B Card */}
          <div className="p-2 border border-ink/10 dark:border-paper/10" style={{ borderLeftColor: clusterBColor, borderLeftWidth: 3 }}>
            <div className="flex items-center gap-1 mb-1.5">
              <Hexagon className="w-3 h-3 flex-shrink-0" style={{ color: clusterBColor }} />
              <span className="font-mono text-[10px] uppercase tracking-wider text-ink dark:text-paper truncate" title={getClusterLabel(gap.cluster_b_id)}>
                {getClusterLabel(gap.cluster_b_id)}
              </span>
            </div>
            <div className="space-y-0.5">
              {(gap.cluster_b_names || []).slice(0, 3).map((name, idx) => (
                <div key={idx} className="font-mono text-[10px] text-muted truncate" title={name}>
                  {name}
                </div>
              ))}
              {(gap.cluster_b_names?.length || 0) > 3 && (
                <div className="font-mono text-[10px] text-muted/50">
                  +{(gap.cluster_b_names?.length || 0) - 3} more
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
