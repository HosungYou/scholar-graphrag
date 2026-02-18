'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Search, X, Loader2 } from 'lucide-react';

interface PaperFitPanelProps {
  projectId: string;
  onClose: () => void;
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

type PaperFitResult = Awaited<ReturnType<typeof api.analyzePaperFit>>;

export function PaperFitPanel({ projectId, onClose }: PaperFitPanelProps) {
  const [input, setInput] = useState('');

  const mutation = useMutation({
    mutationFn: (query: string) => {
      // Detect DOI pattern
      const doiMatch = query.match(/10\.\d{4,9}\/[^\s]+/);
      if (doiMatch) {
        return api.analyzePaperFit(projectId, { title: query, doi: doiMatch[0] });
      }
      return api.analyzePaperFit(projectId, { title: query });
    },
  });

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    mutation.mutate(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const result: PaperFitResult | undefined = mutation.data;

  return (
    <div className="w-[380px] max-h-[600px] bg-paper dark:bg-ink border border-ink/10 dark:border-paper/10 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-ink/10 dark:border-paper/10 shrink-0">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-accent-purple" />
          <span className="font-mono text-xs uppercase tracking-wider text-ink dark:text-paper font-medium">
            Paper Fit
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-ink/10 dark:hover:bg-paper/10 rounded transition-colors"
        >
          <X className="w-3.5 h-3.5 text-muted" />
        </button>
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-b border-ink/10 dark:border-paper/10 shrink-0">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="DOI or paper title..."
            className="flex-1 px-3 py-1.5 rounded border border-ink/10 dark:border-paper/10 bg-ink/[0.03] dark:bg-paper/[0.03] font-mono text-xs text-ink dark:text-paper placeholder:text-muted focus:outline-none focus:border-accent-teal/50"
          />
          <button
            onClick={handleSubmit}
            disabled={mutation.isPending || !input.trim()}
            className="px-3 py-1.5 rounded text-xs font-mono font-medium bg-accent-teal text-white hover:bg-accent-teal/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {mutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              'Analyze'
            )}
          </button>
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {mutation.isPending && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="w-6 h-6 border-2 border-accent-teal border-t-transparent rounded-full animate-spin" />
            <span className="font-mono text-xs text-muted">Analyzing paper fit...</span>
          </div>
        )}

        {mutation.isError && (
          <div className="px-4 py-6 text-center">
            <span className="font-mono text-xs text-red-400">
              {(mutation.error as Error)?.message || 'Analysis failed'}
            </span>
          </div>
        )}

        {result && !mutation.isPending && (
          <div className="divide-y divide-ink/5 dark:divide-paper/5">
            {/* Matched Entities */}
            {result.matched_entities.length > 0 && (
              <div className="px-4 py-3">
                <h3 className="font-mono text-[10px] uppercase tracking-wider text-muted mb-2">
                  Matched Entities ({result.matched_entities.length})
                </h3>
                <div className="space-y-1.5">
                  {result.matched_entities.slice(0, 10).map((entity) => (
                    <div key={entity.id} className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <span className="font-mono text-xs text-ink dark:text-paper truncate block">
                          {entity.name}
                        </span>
                      </div>
                      <span
                        className={`shrink-0 inline-block px-1 py-0.5 rounded text-[9px] font-mono uppercase ${ENTITY_TYPE_COLORS[entity.entity_type] ?? 'bg-ink/10 text-muted'}`}
                      >
                        {entity.entity_type}
                      </span>
                      {/* Similarity bar */}
                      <div className="w-16 h-1.5 bg-ink/10 dark:bg-paper/10 rounded-full overflow-hidden shrink-0">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-accent-teal/60 to-accent-teal"
                          style={{ width: `${Math.round(entity.similarity * 100)}%` }}
                        />
                      </div>
                      <span className="font-mono text-[10px] text-muted tabular-nums w-8 text-right shrink-0">
                        {(entity.similarity * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Community Relevance */}
            {result.community_relevance.length > 0 && (
              <div className="px-4 py-3">
                <h3 className="font-mono text-[10px] uppercase tracking-wider text-muted mb-2">
                  Community Relevance ({result.community_relevance.length})
                </h3>
                <div className="space-y-2">
                  {result.community_relevance.map((community) => (
                    <div
                      key={community.cluster_id}
                      className="border border-ink/5 dark:border-paper/5 rounded p-2 bg-ink/[0.02] dark:bg-paper/[0.02]"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs text-ink dark:text-paper truncate">
                          {community.label}
                        </span>
                        <span className="font-mono text-[10px] text-accent-teal tabular-nums shrink-0 ml-2">
                          {community.matched_count} match{community.matched_count !== 1 ? 'es' : ''}
                        </span>
                      </div>
                      <div className="mt-1 w-full h-1 bg-ink/10 dark:bg-paper/10 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-accent-purple/70"
                          style={{ width: `${Math.round(community.relevance_score * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Gap Connections */}
            {result.gap_connections.length > 0 && (
              <div className="px-4 py-3">
                <h3 className="font-mono text-[10px] uppercase tracking-wider text-muted mb-2">
                  Gap Connections ({result.gap_connections.length})
                </h3>
                <div className="space-y-2">
                  {result.gap_connections.map((gap) => (
                    <div
                      key={gap.gap_id}
                      className="border border-amber-500/20 rounded p-2 bg-amber-500/[0.03]"
                    >
                      <div className="flex items-center gap-1.5 text-xs font-mono">
                        <span className="text-amber-400 truncate">{gap.cluster_a_label}</span>
                        <span className="text-muted shrink-0">&harr;</span>
                        <span className="text-amber-400 truncate">{gap.cluster_b_label}</span>
                      </div>
                      <span className="font-mono text-[10px] text-muted mt-1 block">
                        {gap.connection_type}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Summary */}
            {result.fit_summary && (
              <div className="px-4 py-3">
                <h3 className="font-mono text-[10px] uppercase tracking-wider text-muted mb-2">
                  Summary
                </h3>
                <p className="font-mono text-xs text-ink/80 dark:text-paper/80 leading-relaxed">
                  {result.fit_summary}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {!result && !mutation.isPending && !mutation.isError && (
          <div className="flex flex-col items-center justify-center py-12 text-center px-6">
            <Search className="w-8 h-8 text-muted/30 mb-3" />
            <span className="font-mono text-xs text-muted">
              Enter a paper title or DOI to analyze where it fits in your knowledge graph.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
