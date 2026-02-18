'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { DragHandle } from '../ui/DraggablePanel';

interface GraphMetrics {
  modularity: number;
  diversity: number;
  density: number;
  avg_clustering: number;
  num_components: number;
  node_count: number;
  edge_count: number;
  cluster_count: number;
  // v0.30.0: Extended quality metrics
  modularity_raw?: number;
  modularity_interpretation?: string;
  silhouette_score?: number;
  avg_cluster_coherence?: number;
  cluster_coverage?: number;
  // v0.30.0: Entity extraction quality
  entity_type_diversity?: number;
  paper_coverage?: number;
  avg_entities_per_paper?: number;
  cross_paper_ratio?: number;
  type_distribution?: Record<string, number>;
}

interface DiversityMetrics {
  shannon_entropy: number;
  normalized_entropy: number;
  modularity: number;
  bias_score: number;
  diversity_rating: 'high' | 'medium' | 'low' | 'focused';  // v0.6.0: Added 'focused'
  cluster_sizes: number[];
  dominant_cluster_ratio: number;
  gini_coefficient: number;
}

interface MetricBarProps {
  label: string;
  value: number;
  color: string;
  tooltip?: string;
}

function MetricBar({ label, value, color, tooltip }: MetricBarProps) {
  const percentage = Math.round(value * 100);

  return (
    <div className="mb-3" title={tooltip}>
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs font-mono text-muted">{label}</span>
        <span className="text-xs font-mono text-white">{percentage}%</span>
      </div>
      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${percentage}%`,
            backgroundColor: color,
          }}
        />
      </div>
    </div>
  );
}

// Circular Diversity Gauge Component (Phase 4)
interface DiversityGaugeProps {
  rating: 'high' | 'medium' | 'low' | 'focused';  // v0.6.0: Added 'focused'
  entropy: number;
  biasScore: number;
}

function DiversityGauge({ rating, entropy, biasScore }: DiversityGaugeProps) {
  // Determine colors based on rating
  // v0.5.0: Changed "Low Diversity" → "Focused" for research context clarity
  // v0.6.0: Backend now returns 'focused' instead of 'low' - keep both for compatibility
  const colors = {
    high: { primary: '#10B981', bg: '#10B981/20', label: 'Diverse Topics', desc: 'Broad coverage' },
    medium: { primary: '#F59E0B', bg: '#F59E0B/20', label: 'Balanced', desc: 'Mixed focus' },
    low: { primary: '#6366F1', bg: '#6366F1/20', label: 'Focused', desc: 'Specialized' }, // Legacy - kept for compatibility
    focused: { primary: '#6366F1', bg: '#6366F1/20', label: 'Focused', desc: 'Specialized' }, // v0.6.0: New rating from backend
  };

  const { primary, label, desc } = colors[rating];

  // Calculate arc for gauge (based on entropy 0-1)
  const circumference = 2 * Math.PI * 28; // radius = 28
  const strokeDasharray = `${entropy * circumference * 0.75} ${circumference}`;

  return (
    <div className="flex flex-col items-center py-2">
      <div className="relative w-20 h-20">
        {/* Background arc */}
        <svg className="w-full h-full -rotate-90" viewBox="0 0 64 64">
          <circle
            cx="32"
            cy="32"
            r="28"
            fill="none"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="4"
            strokeDasharray={`${0.75 * circumference} ${circumference}`}
            strokeLinecap="round"
          />
          <circle
            cx="32"
            cy="32"
            r="28"
            fill="none"
            stroke={primary}
            strokeWidth="4"
            strokeDasharray={strokeDasharray}
            strokeLinecap="round"
            className="transition-all duration-1000"
          />
        </svg>

        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold" style={{ color: primary }}>
            {Math.round(entropy * 100)}%
          </span>
        </div>
      </div>

      <span className="text-xs font-mono mt-1" style={{ color: primary }}>
        {label}
      </span>
      <span className="text-[10px] text-muted mt-0.5">
        {desc}
      </span>

      {/* Focus indicator - v0.5.0: Changed from "Bias Detected" to "Focused Research" */}
      {biasScore > 0.5 && (
        <div className="mt-2 px-2 py-1 bg-indigo-500/10 text-indigo-400 text-xs font-mono rounded" title="Your research collection is concentrated on specific topics, which is typical for focused systematic reviews">
          Focused Research
        </div>
      )}
    </div>
  );
}

interface InsightHUDProps {
  projectId: string;
  className?: string;
}

export function InsightHUD({ projectId, className = '' }: InsightHUDProps) {
  const [metrics, setMetrics] = useState<GraphMetrics | null>(null);
  const [diversityMetrics, setDiversityMetrics] = useState<DiversityMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showDiversityPanel, setShowDiversityPanel] = useState(false);

  useEffect(() => {
    async function fetchMetrics() {
      if (!projectId) return;

      setIsLoading(true);
      setError(null);

      try {
        // Fetch both metrics in parallel
        const [graphData, diversityData] = await Promise.all([
          api.getGraphMetrics(projectId),
          api.getDiversityMetrics(projectId).catch(() => null), // Graceful fallback
        ]);

        setMetrics(graphData);
        setDiversityMetrics(diversityData);
      } catch (err) {
        console.error('Failed to fetch graph metrics:', err);
        setError(err instanceof Error ? err.message : 'Failed to load metrics');
      } finally {
        setIsLoading(false);
      }
    }

    fetchMetrics();
  }, [projectId]);

  // v0.8.0: Calculate dynamic position based on props or use defaults
  // Changed from bottom-left to right-side for InfraNodus-style analytics placement
  const positionClass = className || 'top-20 right-4';

  if (isLoading) {
    return (
      <div>
        <div className="bg-[#161b22]/90 backdrop-blur-sm border border-white/10 rounded-lg p-3 w-48">
          <div className="animate-pulse space-y-2">
            <div className="h-3 bg-white/10 rounded w-20" />
            <div className="h-1.5 bg-white/10 rounded" />
            <div className="h-3 bg-white/10 rounded w-16 mt-2" />
            <div className="h-1.5 bg-white/10 rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !metrics) {
    return null; // Silently fail - HUD is optional
  }

  return (
    <div>
      <div className="bg-[#161b22]/90 backdrop-blur-sm border border-white/10 rounded-lg overflow-hidden w-52">
        <DragHandle />
        {/* Header - also serves as drag handle for DraggablePanel */}
        <button
          data-drag-header
          className="w-full px-3 py-2 flex items-center justify-between hover:bg-white/5 transition-colors cursor-grab active:cursor-grabbing"
          onClick={() => setIsCollapsed(!isCollapsed)}
        >
          <div className="flex items-center gap-2">
            <svg
              className="w-4 h-4 text-accent-teal"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
            <span className="text-xs font-mono font-medium text-white">Insight HUD</span>
          </div>
          <svg
            className={`w-4 h-4 text-muted transition-transform ${isCollapsed ? '' : 'rotate-180'}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        </button>

        {/* Content */}
        {!isCollapsed && (
          <div className="px-3 pb-3">
            {/* Diversity Gauge (Phase 4) */}
            {diversityMetrics && (
              <div className="mb-4 pb-3 border-b border-white/10">
                <button
                  className="w-full"
                  onClick={() => setShowDiversityPanel(!showDiversityPanel)}
                >
                  <DiversityGauge
                    rating={diversityMetrics.diversity_rating}
                    entropy={diversityMetrics.normalized_entropy}
                    biasScore={diversityMetrics.bias_score}
                  />
                </button>

                {/* Expanded diversity details - v0.5.0: Simplified with explanations */}
                {showDiversityPanel && (
                  <div className="mt-3 pt-3 border-t border-white/5 space-y-2">
                    <div className="text-[10px] text-muted/70 mb-2">
                      📊 Advanced Metrics (click to collapse)
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted" title="Measures topic variety (higher = more topics)">Shannon Entropy</span>
                      <span className="text-white font-mono">{diversityMetrics.shannon_entropy.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted" title="Cluster size inequality (0 = equal, 1 = one dominant)">Gini Coefficient</span>
                      <span className="text-white font-mono">{diversityMetrics.gini_coefficient.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted" title="Largest topic cluster proportion">Main Topic</span>
                      <span className="text-white font-mono">{Math.round(diversityMetrics.dominant_cluster_ratio * 100)}%</span>
                    </div>
                    {/* Cluster size distribution */}
                    {diversityMetrics.cluster_sizes.length > 0 && (
                      <div className="mt-2">
                        <span className="text-xs text-muted block mb-1">Topic Distribution</span>
                        <div className="flex gap-1 h-4">
                          {diversityMetrics.cluster_sizes.map((size, i) => {
                            const maxSize = Math.max(...diversityMetrics.cluster_sizes);
                            const height = maxSize > 0 ? (size / maxSize) * 100 : 0;
                            return (
                              <div
                                key={i}
                                className="flex-1 bg-accent-teal/50 rounded-t"
                                style={{ height: `${height}%` }}
                                title={`Topic ${i + 1}: ${size} concepts`}
                              />
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* v0.30.0: Quality Metrics - Raw values with interpretation */}
            <div className="mb-4 space-y-3">
              {/* Raw Modularity with interpretation badge */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-mono text-muted">Modularity</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-mono text-white font-bold">
                      {metrics.modularity_raw?.toFixed(2) ?? metrics.modularity.toFixed(2)}
                    </span>
                    {metrics.modularity_interpretation && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                        metrics.modularity_interpretation === '강함' || metrics.modularity_interpretation === 'Strong'
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : metrics.modularity_interpretation === '보통' || metrics.modularity_interpretation === 'Moderate'
                          ? 'bg-amber-500/20 text-amber-400'
                          : 'bg-red-500/20 text-red-400'
                      }`}>
                        {metrics.modularity_interpretation === '강함' ? 'Strong'
                          : metrics.modularity_interpretation === '보통' ? 'Moderate'
                          : metrics.modularity_interpretation === '약함' ? 'Weak'
                          : metrics.modularity_interpretation}
                      </span>
                    )}
                  </div>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500 bg-[#4ECDC4]"
                    style={{ width: `${Math.min(100, Math.max(0, (metrics.modularity_raw ?? metrics.modularity) * 100))}%` }}
                  />
                </div>
              </div>

              {/* Silhouette Score */}
              {metrics.silhouette_score !== undefined && metrics.silhouette_score !== null && (
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-mono text-muted" title="Intra-cluster cohesion vs inter-cluster separation (-1~1)">Silhouette</span>
                    <span className="text-xs font-mono text-white">{metrics.silhouette_score.toFixed(2)}</span>
                  </div>
                  <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500 bg-[#96CEB4]"
                      style={{ width: `${Math.max(0, (metrics.silhouette_score + 1) / 2 * 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Cluster Coherence */}
              {metrics.avg_cluster_coherence !== undefined && metrics.avg_cluster_coherence !== null && (
                <MetricBar
                  label="Coherence"
                  value={metrics.avg_cluster_coherence}
                  color="#45B7D1"
                  tooltip="Average semantic similarity between entities within clusters"
                />
              )}

              {/* Coverage */}
              {metrics.cluster_coverage !== undefined && metrics.cluster_coverage !== null && (
                <MetricBar
                  label="Coverage"
                  value={metrics.cluster_coverage}
                  color="#96CEB4"
                  tooltip="Proportion of entities assigned to clusters"
                />
              )}

              {/* Density (keep existing) */}
              <MetricBar
                label="Density"
                value={metrics.density}
                color="#45B7D1"
                tooltip="Connection density (higher = more interconnected)"
              />
            </div>

            {/* v0.30.0: Entity Quality Metrics */}
            {(metrics.entity_type_diversity !== undefined || metrics.paper_coverage !== undefined) && (
              <div className="mb-4 pt-3 border-t border-white/10 space-y-2">
                <span className="text-[10px] font-mono text-muted/70 uppercase tracking-wider">Entity Quality</span>

                {metrics.entity_type_diversity !== undefined && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted" title="Usage ratio among 8 entity types">Type Diversity</span>
                    <span className="text-white font-mono">{Math.round((metrics.entity_type_diversity ?? 0) * 100)}%</span>
                  </div>
                )}

                {metrics.paper_coverage !== undefined && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted" title="Proportion of papers with 1+ extracted entities">Paper Coverage</span>
                    <span className="text-white font-mono">{Math.round((metrics.paper_coverage ?? 0) * 100)}%</span>
                  </div>
                )}

                {metrics.avg_entities_per_paper !== undefined && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted" title="Average entities per paper">Entities/Paper</span>
                    <span className="text-white font-mono">{metrics.avg_entities_per_paper?.toFixed(1)}</span>
                  </div>
                )}

                {metrics.cross_paper_ratio !== undefined && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted" title="Proportion of entities appearing in 3+ papers">Cross-Paper</span>
                    <span className="text-white font-mono">{Math.round((metrics.cross_paper_ratio ?? 0) * 100)}%</span>
                  </div>
                )}

                {/* Type distribution mini chart */}
                {metrics.type_distribution && Object.keys(metrics.type_distribution).length > 0 && (
                  <div className="mt-2">
                    <span className="text-[10px] text-muted block mb-1">Type Distribution</span>
                    <div className="flex gap-0.5 h-4">
                      {Object.entries(metrics.type_distribution)
                        .sort(([, a], [, b]) => b - a)
                        .map(([type, count]) => {
                          const maxCount = Math.max(...Object.values(metrics.type_distribution!));
                          const height = maxCount > 0 ? (count / maxCount) * 100 : 0;
                          const typeColors: Record<string, string> = {
                            Concept: '#4ECDC4',
                            Method: '#FF6B6B',
                            Finding: '#96CEB4',
                            Problem: '#FFEAA7',
                            Dataset: '#DDA0DD',
                            Metric: '#87CEEB',
                            Innovation: '#FFD700',
                            Limitation: '#FF7F50',
                          };
                          return (
                            <div
                              key={type}
                              className="flex-1 rounded-t"
                              style={{
                                height: `${height}%`,
                                backgroundColor: typeColors[type] || '#888',
                                opacity: 0.7,
                              }}
                              title={`${type}: ${count}`}
                            />
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/10">
              <div className="text-center">
                <div className="text-lg font-bold text-white">{metrics.node_count}</div>
                <div className="text-[10px] text-muted uppercase tracking-wider">Nodes</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-white">{metrics.edge_count}</div>
                <div className="text-[10px] text-muted uppercase tracking-wider">Edges</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-accent-teal">{metrics.cluster_count}</div>
                <div className="text-[10px] text-muted uppercase tracking-wider">Clusters</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-accent-purple">{metrics.num_components}</div>
                <div className="text-[10px] text-muted uppercase tracking-wider">Components</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default InsightHUD;
