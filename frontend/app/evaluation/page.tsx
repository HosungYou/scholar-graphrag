'use client';

import { useEffect, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { api } from '@/lib/api';
import type { GapEvaluationReport } from '@/types';
import { Loader2 } from 'lucide-react';

export default function EvaluationPage() {
  const [report, setReport] = useState<GapEvaluationReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchReport() {
      try {
        setLoading(true);
        const data = await api.getEvaluationReport();
        setReport(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : '평가 리포트를 불러올 수 없습니다');
      } finally {
        setLoading(false);
      }
    }

    fetchReport();
  }, []);

  return (
    <ErrorBoundary>
      <div className="min-h-screen flex flex-col bg-paper dark:bg-ink">
        <Header />

        <main className="flex-1 container mx-auto px-4 py-8">
          <div className="max-w-6xl mx-auto space-y-6">
            {/* Page Header */}
            <div className="border-l-2 border-accent-teal pl-4">
              <h1 className="font-display text-2xl text-ink dark:text-paper">
                갭 검출 평가 리포트
              </h1>
              <p className="font-mono text-sm text-muted mt-1">
                Ground Truth 데이터셋 기반 검출 정확도 측정
              </p>
            </div>

            {loading && (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-accent-teal" />
              </div>
            )}

            {error && (
              <div className="bg-accent-red/10 border border-accent-red p-4">
                <p className="font-mono text-sm text-accent-red">{error}</p>
              </div>
            )}

            {!loading && !error && !report && (
              <div className="bg-surface/5 border border-muted/20 p-8 text-center">
                <p className="font-mono text-sm text-muted">
                  평가 데이터셋을 구축하면 갭 검출 정확도를 측정할 수 있습니다
                </p>
              </div>
            )}

            {report && (
              <>
                {/* Main Metrics */}
                <div className="grid grid-cols-3 gap-4">
                  <MetricCard
                    label="Recall"
                    value={report.recall}
                    description={`${report.true_positives}/${report.ground_truth_count} 검출`}
                    color="accent-teal"
                  />
                  <MetricCard
                    label="Precision"
                    value={report.precision}
                    description={`${report.true_positives}/${report.detected_count} 정확`}
                    color="accent-violet"
                  />
                  <MetricCard
                    label="F1 Score"
                    value={report.f1}
                    description="조화 평균"
                    color="accent-amber"
                  />
                </div>

                {/* Matched Gaps */}
                {report.matched_gaps.length > 0 && (
                  <div className="space-y-3">
                    <div className="border-l-2 border-accent-teal pl-4">
                      <h2 className="font-display text-lg text-ink dark:text-paper">
                        매칭된 갭 ({report.matched_gaps.length})
                      </h2>
                      <p className="font-mono text-xs text-muted">
                        True Positives - 정확히 검출된 연구 갭
                      </p>
                    </div>
                    <div className="space-y-2">
                      {report.matched_gaps.map((match, idx) => (
                        <GapMatchCard key={idx} match={match} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Unmatched Ground Truth */}
                {report.unmatched_gaps.length > 0 && (
                  <div className="space-y-3">
                    <div className="border-l-2 border-accent-amber pl-4">
                      <h2 className="font-display text-lg text-ink dark:text-paper">
                        미검출 갭 ({report.unmatched_gaps.length})
                      </h2>
                      <p className="font-mono text-xs text-muted">
                        False Negatives - 놓친 연구 갭
                      </p>
                    </div>
                    <div className="space-y-2">
                      {report.unmatched_gaps.map((gap, idx) => (
                        <UnmatchedGapCard key={idx} gap={gap} />
                      ))}
                    </div>
                  </div>
                )}

                {/* False Positives */}
                {report.false_positives_list.length > 0 && (
                  <div className="space-y-3">
                    <div className="border-l-2 border-accent-red pl-4">
                      <h2 className="font-display text-lg text-ink dark:text-paper">
                        잘못 검출된 갭 ({report.false_positives_list.length})
                      </h2>
                      <p className="font-mono text-xs text-muted">
                        False Positives - Ground Truth에 없는 검출 결과
                      </p>
                    </div>
                    <div className="space-y-2">
                      {report.false_positives_list.map((fp, idx) => (
                        <FalsePositiveCard key={idx} fp={fp} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </main>

        <Footer />
      </div>
    </ErrorBoundary>
  );
}

function MetricCard({
  label,
  value,
  description,
  color,
}: {
  label: string;
  value: number;
  description: string;
  color: string;
}) {
  const percentage = (value * 100).toFixed(1);

  return (
    <div className="bg-surface/5 border border-muted/20 p-4 space-y-2">
      <div className="font-mono text-xs text-muted">{label}</div>
      <div className={`font-display text-3xl text-${color}`}>
        {percentage}%
      </div>
      <div className="font-mono text-xs text-muted">{description}</div>
      <div className="h-1 bg-surface/10">
        <div
          className={`h-full bg-${color}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function GapMatchCard({ match }: { match: any }) {
  return (
    <div className="bg-surface/5 border border-accent-teal/30 p-4 space-y-2">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-1">
          <div className="font-mono text-xs text-accent-teal">
            Ground Truth: {match.ground_truth_id}
          </div>
          <div className="font-mono text-sm text-ink dark:text-paper">
            {match.ground_truth_description}
          </div>
        </div>
        <div className="font-mono text-xs text-muted">
          강도: {match.gap_strength.toFixed(2)}
        </div>
      </div>
      <div className="flex gap-4 text-xs">
        <div className="flex-1">
          <div className="font-mono text-muted mb-1">Cluster A</div>
          <div className="font-mono text-ink dark:text-paper">
            {match.cluster_a_concepts.join(', ')}
          </div>
        </div>
        <div className="flex-1">
          <div className="font-mono text-muted mb-1">Cluster B</div>
          <div className="font-mono text-ink dark:text-paper">
            {match.cluster_b_concepts.join(', ')}
          </div>
        </div>
      </div>
    </div>
  );
}

function UnmatchedGapCard({ gap }: { gap: any }) {
  return (
    <div className="bg-surface/5 border border-accent-amber/30 p-4 space-y-2">
      <div className="font-mono text-xs text-accent-amber">
        {gap.gap_id}
      </div>
      <div className="font-mono text-sm text-ink dark:text-paper">
        {gap.description}
      </div>
      <div className="flex gap-4 text-xs">
        <div className="flex-1">
          <div className="font-mono text-muted mb-1">Cluster A</div>
          <div className="font-mono text-ink dark:text-paper">
            {gap.cluster_a_concepts.join(', ')}
          </div>
        </div>
        <div className="flex-1">
          <div className="font-mono text-muted mb-1">Cluster B</div>
          <div className="font-mono text-ink dark:text-paper">
            {gap.cluster_b_concepts.join(', ')}
          </div>
        </div>
      </div>
    </div>
  );
}

function FalsePositiveCard({ fp }: { fp: any }) {
  return (
    <div className="bg-surface/5 border border-accent-red/30 p-4 space-y-2">
      <div className="flex items-start justify-between gap-4">
        <div className="font-mono text-xs text-accent-red">
          검출 ID: {fp.id}
        </div>
        <div className="font-mono text-xs text-muted">
          강도: {fp.gap_strength.toFixed(2)}
        </div>
      </div>
      <div className="flex gap-4 text-xs">
        <div className="flex-1">
          <div className="font-mono text-muted mb-1">Cluster A</div>
          <div className="font-mono text-ink dark:text-paper">
            {fp.cluster_a_concepts.join(', ')}
          </div>
        </div>
        <div className="flex-1">
          <div className="font-mono text-muted mb-1">Cluster B</div>
          <div className="font-mono text-ink dark:text-paper">
            {fp.cluster_b_concepts.join(', ')}
          </div>
        </div>
      </div>
    </div>
  );
}
