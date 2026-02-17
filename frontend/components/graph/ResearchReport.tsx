'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { FileText, Download, RefreshCw } from 'lucide-react';

interface ResearchReportProps {
  projectId: string;
}

// Entity type badge colors matching existing patterns
const ENTITY_TYPE_COLORS: Record<string, string> = {
  Concept: 'bg-accent-teal/20 text-accent-teal',
  Method: 'bg-blue-500/20 text-blue-400',
  Finding: 'bg-emerald-500/20 text-emerald-400',
  Problem: 'bg-red-500/20 text-red-400',
  Dataset: 'bg-amber-500/20 text-amber-400',
  Metric: 'bg-purple-500/20 text-purple-400',
  Innovation: 'bg-pink-500/20 text-pink-400',
  Limitation: 'bg-orange-500/20 text-orange-400',
};

// Quality metric interpretation
function interpretMetric(key: string, value: number | null | undefined): string {
  if (value == null) return 'N/A';
  switch (key) {
    case 'modularity_raw':
      if (value > 0.6) return 'Strong community structure';
      if (value > 0.3) return 'Moderate clustering';
      return 'Weak community separation';
    case 'diversity':
      if (value > 0.7) return 'High diversity';
      if (value > 0.4) return 'Moderate diversity';
      return 'Low diversity';
    case 'density':
      if (value > 0.3) return 'Dense connections';
      if (value > 0.1) return 'Moderate density';
      return 'Sparse graph';
    case 'silhouette':
      if (value > 0.5) return 'Well-separated clusters';
      if (value > 0.25) return 'Reasonable clustering';
      return 'Overlapping clusters';
    case 'entity_diversity':
      if (value > 0.6) return 'Rich type variety';
      if (value > 0.3) return 'Moderate type mix';
      return 'Narrow extraction';
    case 'coherence':
      if (value > 0.7) return 'Highly coherent';
      if (value > 0.4) return 'Moderately coherent';
      return 'Low coherence';
    case 'paper_coverage':
      if (value > 0.8) return 'Excellent coverage';
      if (value > 0.5) return 'Good coverage';
      return 'Limited coverage';
    default:
      return '';
  }
}

function formatMetricName(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function ResearchReport({ projectId }: ResearchReportProps) {
  const { data, isLoading, error, refetch } = useQuery<Record<string, unknown>>({
    queryKey: ['projectSummary', projectId],
    queryFn: () => api.getProjectSummary(projectId),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const handleExport = async () => {
    try {
      const blob = await api.exportProjectSummary(projectId, 'markdown');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `research_report_${projectId.slice(0, 8)}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // silent fail
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-[#0d1117]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-accent-teal border-t-transparent rounded-full animate-spin" />
          <span className="font-mono text-xs text-muted uppercase tracking-wider">
            Generating summary...
          </span>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-[#0d1117]">
        <div className="flex flex-col items-center gap-3 text-center px-8">
          <span className="text-red-400 text-lg">!</span>
          <span className="font-mono text-xs text-muted">
            {(error as Error)?.message || 'Failed to load summary'}
          </span>
          <button
            onClick={() => refetch()}
            className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono text-accent-teal border border-accent-teal/30 hover:bg-accent-teal/10 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const overview = data.overview as Record<string, unknown> | undefined;
  const qualityMetrics = data.quality_metrics as Record<string, number | null> | undefined;
  const topEntities = data.top_entities as Array<{ name: string; entity_type: string; pagerank: number }> | undefined;
  const communities = data.communities as Array<{ cluster_id: number; label: string; size: number; concept_names: string[] }> | undefined;
  const structuralGaps = data.structural_gaps as Array<{
    cluster_a_label: string;
    cluster_b_label: string;
    gap_strength: number;
    research_questions: string[];
  }> | undefined;
  const temporalInfo = data.temporal_info as Record<string, unknown> | undefined;
  const projectName = data.project_name as string | undefined;

  return (
    <div className="absolute inset-0 bg-[#0d1117] overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-5 h-5 text-emerald-500" />
              <span className="font-mono text-xs uppercase tracking-wider text-emerald-500">
                Research Summary
              </span>
            </div>
            <h1 className="text-xl font-semibold text-ink dark:text-paper">
              {projectName || 'Project Report'}
            </h1>
          </div>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono text-accent-teal border border-accent-teal/30 hover:bg-accent-teal/10 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export MD
          </button>
        </div>

        {/* Overview Stats */}
        {overview && (
          <section className="mb-8">
            <h2 className="font-mono text-xs uppercase tracking-wider text-muted mb-3 border-b border-ink/10 dark:border-paper/10 pb-2">
              Overview
            </h2>
            <div className="grid grid-cols-3 gap-4">
              <div className="border border-ink/10 dark:border-paper/10 p-4 bg-ink/[0.02] dark:bg-paper/[0.02]">
                <div className="font-mono text-2xl font-bold text-accent-teal tabular-nums">
                  {String(overview.total_papers ?? 0)}
                </div>
                <div className="font-mono text-xs text-muted uppercase tracking-wider mt-1">Papers</div>
              </div>
              <div className="border border-ink/10 dark:border-paper/10 p-4 bg-ink/[0.02] dark:bg-paper/[0.02]">
                <div className="font-mono text-2xl font-bold text-accent-purple tabular-nums">
                  {String(overview.total_entities ?? 0)}
                </div>
                <div className="font-mono text-xs text-muted uppercase tracking-wider mt-1">Entities</div>
              </div>
              <div className="border border-ink/10 dark:border-paper/10 p-4 bg-ink/[0.02] dark:bg-paper/[0.02]">
                <div className="font-mono text-2xl font-bold text-blue-400 tabular-nums">
                  {String(overview.total_relationships ?? 0)}
                </div>
                <div className="font-mono text-xs text-muted uppercase tracking-wider mt-1">Relationships</div>
              </div>
            </div>
            {overview.entity_type_distribution != null && (
              <div className="mt-3 flex flex-wrap gap-2">
                {Object.entries(overview.entity_type_distribution as Record<string, number>).map(([type, count]) => (
                  <span
                    key={type}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono ${ENTITY_TYPE_COLORS[type] ?? 'bg-ink/10 text-muted'}`}
                  >
                    {type}: {String(count)}
                  </span>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Quality Metrics */}
        {qualityMetrics && Object.keys(qualityMetrics).length > 0 && (
          <section className="mb-8">
            <h2 className="font-mono text-xs uppercase tracking-wider text-muted mb-3 border-b border-ink/10 dark:border-paper/10 pb-2">
              Quality Metrics
            </h2>
            <div className="border border-ink/10 dark:border-paper/10 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-ink/[0.04] dark:bg-paper/[0.04]">
                    <th className="text-left px-4 py-2 font-mono text-xs uppercase tracking-wider text-muted">Metric</th>
                    <th className="text-right px-4 py-2 font-mono text-xs uppercase tracking-wider text-muted">Value</th>
                    <th className="text-left px-4 py-2 font-mono text-xs uppercase tracking-wider text-muted">Interpretation</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(qualityMetrics).map(([key, value]) => (
                    <tr key={key} className="border-t border-ink/5 dark:border-paper/5">
                      <td className="px-4 py-2 font-mono text-xs text-ink dark:text-paper">
                        {formatMetricName(key)}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-xs tabular-nums text-accent-teal">
                        {value != null ? value.toFixed(4) : 'N/A'}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-muted">
                        {interpretMetric(key, value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Top Entities */}
        {topEntities && topEntities.length > 0 && (
          <section className="mb-8">
            <h2 className="font-mono text-xs uppercase tracking-wider text-muted mb-3 border-b border-ink/10 dark:border-paper/10 pb-2">
              Top Entities by PageRank
            </h2>
            <div className="space-y-1.5">
              {topEntities.map((entity, idx) => (
                <div
                  key={entity.name}
                  className="flex items-center gap-3 px-4 py-2 border border-ink/5 dark:border-paper/5 bg-ink/[0.02] dark:bg-paper/[0.02]"
                >
                  <span className="font-mono text-xs text-muted w-6 text-right tabular-nums">
                    {idx + 1}.
                  </span>
                  <span className="font-mono text-sm text-ink dark:text-paper flex-1 truncate">
                    {entity.name}
                  </span>
                  <span
                    className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider ${ENTITY_TYPE_COLORS[entity.entity_type] ?? 'bg-ink/10 text-muted'}`}
                  >
                    {entity.entity_type}
                  </span>
                  <span className="font-mono text-xs tabular-nums text-accent-teal w-16 text-right">
                    {entity.pagerank.toFixed(4)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Communities */}
        {communities && communities.length > 0 && (
          <section className="mb-8">
            <h2 className="font-mono text-xs uppercase tracking-wider text-muted mb-3 border-b border-ink/10 dark:border-paper/10 pb-2">
              Communities ({communities.length})
            </h2>
            <div className="grid grid-cols-2 gap-3">
              {communities.map((community) => (
                <div
                  key={community.cluster_id}
                  className="border border-ink/10 dark:border-paper/10 p-4 bg-ink/[0.02] dark:bg-paper/[0.02]"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-sm font-medium text-ink dark:text-paper truncate">
                      {community.label || `Cluster ${community.cluster_id}`}
                    </span>
                    <span className="font-mono text-xs text-muted tabular-nums shrink-0 ml-2">
                      {community.size} nodes
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {community.concept_names.map((name) => (
                      <span
                        key={name}
                        className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono bg-accent-teal/10 text-accent-teal/80"
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Structural Gaps */}
        {structuralGaps && structuralGaps.length > 0 && (
          <section className="mb-8">
            <h2 className="font-mono text-xs uppercase tracking-wider text-muted mb-3 border-b border-ink/10 dark:border-paper/10 pb-2">
              Structural Gaps ({structuralGaps.length})
            </h2>
            <div className="space-y-3">
              {structuralGaps.map((gap, idx) => (
                <div
                  key={idx}
                  className="border border-amber-500/20 p-4 bg-amber-500/[0.03]"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-mono text-xs text-amber-400 px-1.5 py-0.5 bg-amber-500/10 rounded">
                      {gap.cluster_a_label}
                    </span>
                    <span className="font-mono text-xs text-muted">&harr;</span>
                    <span className="font-mono text-xs text-amber-400 px-1.5 py-0.5 bg-amber-500/10 rounded">
                      {gap.cluster_b_label}
                    </span>
                    <span className="ml-auto font-mono text-xs text-muted tabular-nums">
                      strength: {gap.gap_strength.toFixed(3)}
                    </span>
                  </div>
                  {gap.research_questions.length > 0 && (
                    <ul className="space-y-1 mt-2">
                      {gap.research_questions.slice(0, 2).map((q, qi) => (
                        <li key={qi} className="font-mono text-xs text-muted pl-3 border-l-2 border-amber-500/30">
                          {q}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Temporal */}
        {temporalInfo && (temporalInfo.min_year != null || temporalInfo.max_year != null) && (
          <section className="mb-8">
            <h2 className="font-mono text-xs uppercase tracking-wider text-muted mb-3 border-b border-ink/10 dark:border-paper/10 pb-2">
              Temporal Coverage
            </h2>
            <div className="border border-ink/10 dark:border-paper/10 p-4 bg-ink/[0.02] dark:bg-paper/[0.02]">
              <div className="flex items-center gap-4 mb-3">
                <span className="font-mono text-sm text-ink dark:text-paper">
                  {String(temporalInfo.min_year ?? '?')} &mdash; {String(temporalInfo.max_year ?? '?')}
                </span>
              </div>
              {Array.isArray(temporalInfo.emerging_concepts) && temporalInfo.emerging_concepts.length > 0 && (
                <div>
                  <span className="font-mono text-xs text-emerald-400 uppercase tracking-wider">
                    Emerging Concepts
                  </span>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {(temporalInfo.emerging_concepts as string[]).map((name) => (
                      <span
                        key={name}
                        className="inline-block px-2 py-0.5 rounded text-xs font-mono bg-emerald-500/10 text-emerald-400"
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
