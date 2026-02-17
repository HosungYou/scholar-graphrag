'use client';

import { useQuery } from '@tanstack/react-query';
import { api, TemporalTrend, TemporalTrendsData } from '@/lib/api';

interface TemporalDashboardProps {
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

function EntityTypeBadge({ type }: { type: string }) {
  const colorClass = ENTITY_TYPE_COLORS[type] ?? 'bg-ink/20 text-muted';
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider ${colorClass}`}>
      {type}
    </span>
  );
}

function YearRange({ first, last }: { first: number; last: number | null }) {
  if (last && last !== first) {
    return (
      <span className="font-mono text-xs text-muted tabular-nums">
        {first}–{last}
      </span>
    );
  }
  return (
    <span className="font-mono text-xs text-muted tabular-nums">{first}</span>
  );
}

function TrendRow({ trend }: { trend: TemporalTrend }) {
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-ink/5 dark:border-paper/5 last:border-b-0 group">
      <div className="flex-1 min-w-0">
        <span
          className="font-mono text-xs text-ink dark:text-paper truncate block group-hover:text-accent-teal transition-colors"
          title={trend.name}
        >
          {trend.name}
        </span>
      </div>
      <EntityTypeBadge type={trend.entity_type} />
      <YearRange first={trend.first_seen_year} last={trend.last_seen_year} />
      <span className="font-mono text-xs text-muted tabular-nums w-12 text-right shrink-0">
        {trend.paper_count}p
      </span>
    </div>
  );
}

interface SectionProps {
  title: string;
  count: number;
  trends: TemporalTrend[];
  accentClass: string;
  dotClass: string;
  emptyLabel: string;
}

function TrendSection({ title, count, trends, accentClass, dotClass, emptyLabel }: SectionProps) {
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Section header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-ink/10 dark:border-paper/10 bg-ink/[0.02] dark:bg-paper/[0.02] shrink-0">
        <div className={`w-2 h-2 rounded-full ${dotClass}`} />
        <span className={`font-mono text-xs uppercase tracking-wider font-medium ${accentClass}`}>
          {title}
        </span>
        <span className={`font-mono text-xs px-1.5 py-0.5 rounded ${accentClass} bg-current/10 opacity-80`}>
          {count}
        </span>
      </div>

      {/* Entity list */}
      <div className="flex-1 overflow-y-auto min-h-0 px-4">
        {trends.length === 0 ? (
          <div className="py-4 text-center">
            <span className="font-mono text-xs text-muted">{emptyLabel}</span>
          </div>
        ) : (
          <div className="divide-y-0">
            {trends.map((trend) => (
              <TrendRow key={trend.id} trend={trend} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function TemporalDashboard({ projectId }: TemporalDashboardProps) {
  const { data, isLoading, error } = useQuery<TemporalTrendsData>({
    queryKey: ['temporalTrends', projectId],
    queryFn: () => api.getTemporalTrends(projectId),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  });

  // Loading state
  if (isLoading) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-paper dark:bg-ink">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-accent-teal border-t-transparent rounded-full animate-spin" />
          <span className="font-mono text-xs text-muted uppercase tracking-wider">Loading trends...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-paper dark:bg-ink">
        <div className="flex flex-col items-center gap-3 text-center px-8">
          <span className="text-red-400 text-lg">!</span>
          <span className="font-mono text-xs text-muted">
            {(error as Error)?.message || 'Failed to load trends'}
          </span>
        </div>
      </div>
    );
  }

  // Empty state
  if (!data || data.summary.total_classified === 0) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-paper dark:bg-ink">
        <div className="flex flex-col items-center gap-3 text-center px-8">
          <span className="text-muted text-2xl">📊</span>
          <span className="font-mono text-sm text-ink dark:text-paper">No trend data available</span>
          <span className="font-mono text-xs text-muted max-w-sm">
            Entities need year information for trend classification.
          </span>
        </div>
      </div>
    );
  }

  const { year_range, emerging, stable, declining, summary } = data;

  return (
    <div className="absolute inset-0 bg-paper dark:bg-ink overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex-none px-4 pt-3 pb-2 border-b border-ink/10 dark:border-paper/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="font-mono text-sm font-medium text-ink dark:text-paper uppercase tracking-wider">
              Temporal Trends
            </h3>
            {year_range.min != null && year_range.max != null && (
              <span className="font-mono text-xs text-muted">
                {year_range.min} — {year_range.max}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs font-mono text-muted">
            <span>{summary.total_classified} classified</span>
          </div>
        </div>

        {/* Summary bar */}
        <div className="flex items-center gap-4 mt-2">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="font-mono text-xs text-emerald-400">{summary.emerging_count} emerging</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-blue-400" />
            <span className="font-mono text-xs text-blue-400">{summary.stable_count} stable</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-red-400" />
            <span className="font-mono text-xs text-red-400">{summary.declining_count} declining</span>
          </div>
        </div>
      </div>

      {/* Column headers */}
      <div className="flex-none grid grid-cols-3 divide-x divide-ink/10 dark:divide-paper/10 text-[10px] font-mono text-muted uppercase tracking-wider px-0">
        {/* per-section headers rendered inside TrendSection */}
      </div>

      {/* Three column layout */}
      <div className="flex-1 min-h-0 grid grid-cols-3 divide-x divide-ink/10 dark:divide-paper/10 overflow-hidden">
        <TrendSection
          title="Emerging"
          count={summary.emerging_count}
          trends={emerging}
          accentClass="text-emerald-400"
          dotClass="bg-emerald-400"
          emptyLabel="No emerging entities"
        />
        <TrendSection
          title="Stable"
          count={summary.stable_count}
          trends={stable}
          accentClass="text-blue-400"
          dotClass="bg-blue-400"
          emptyLabel="No stable entities"
        />
        <TrendSection
          title="Declining"
          count={summary.declining_count}
          trends={declining}
          accentClass="text-red-400"
          dotClass="bg-red-400"
          emptyLabel="No declining entities"
        />
      </div>

      {/* Footer: column label row */}
      <div className="flex-none px-4 py-1.5 border-t border-ink/10 dark:border-paper/10 bg-ink/[0.02] dark:bg-paper/[0.02]">
        <div className="flex items-center gap-2 font-mono text-[10px] text-muted uppercase tracking-wider">
          <span className="flex-1">Name</span>
          <span className="w-16 text-center">Type</span>
          <span className="w-16 text-center">Years</span>
          <span className="w-12 text-right">Papers</span>
        </div>
      </div>
    </div>
  );
}
