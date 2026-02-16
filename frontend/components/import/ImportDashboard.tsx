'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  CheckCircle,
  XCircle,
  Loader2,
  Clock,
  ArrowRight,
  RefreshCw,
  Inbox,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { ImportJob } from '@/types';

interface ImportDashboardProps {
  showHeader?: boolean;
  maxItems?: number;
  onViewJob?: (jobId: string) => void;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; Icon: React.ElementType }> = {
  pending: { label: '대기 중', color: 'text-text-tertiary', Icon: Clock },
  validating: { label: '검증 중', color: 'text-teal', Icon: Loader2 },
  extracting: { label: '추출 중', color: 'text-teal', Icon: Loader2 },
  processing: { label: '처리 중', color: 'text-teal', Icon: Loader2 },
  building_graph: { label: '그래프 생성 중', color: 'text-node-concept', Icon: Loader2 },
  completed: { label: '완료', color: 'text-teal', Icon: CheckCircle },
  failed: { label: '실패', color: 'text-node-finding', Icon: XCircle },
};

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  // Within last hour
  if (diff < 3600000) {
    const minutes = Math.floor(diff / 60000);
    return minutes <= 1 ? '방금 전' : `${minutes}분 전`;
  }

  // Within last 24 hours
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `${hours}시간 전`;
  }

  // Older
  return date.toLocaleDateString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function JobCard({ job, onNavigate }: { job: ImportJob; onNavigate: (projectId: string) => void }) {
  const config = STATUS_CONFIG[job.status] || STATUS_CONFIG.pending;
  const { Icon } = config;
  const isInProgress = !['completed', 'failed'].includes(job.status);

  return (
    <div
      className={`p-4 rounded border transition-all ${
        isInProgress
          ? 'bg-teal-dim border-teal/30'
          : job.status === 'completed'
          ? 'bg-teal-dim/50 border-teal/30'
          : 'bg-surface-2 border-node-finding/30'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Status Icon */}
        <div
          className={`p-2 rounded-full ${
            isInProgress ? 'bg-teal-dim' : 'bg-surface-2'
          }`}
        >
          <Icon
            className={`w-5 h-5 ${config.color} ${isInProgress ? 'animate-spin' : ''}`}
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium ${config.color}`}>
              {config.label}
            </span>
            {isInProgress && (
              <span className="text-xs text-text-tertiary">
                {Math.round(job.progress)}%
              </span>
            )}
          </div>

          <p className="text-sm text-text-secondary mt-1 truncate">
            {job.message || 'Import 작업'}
          </p>

          {/* Stats */}
          {job.stats && job.status === 'completed' && (
            <div className="flex flex-wrap gap-2 mt-2">
              {job.stats.papers_imported > 0 && (
                <span className="text-xs px-2 py-0.5 bg-surface-2 rounded">
                  논문 {job.stats.papers_imported}개
                </span>
              )}
              {job.stats.total_entities > 0 && (
                <span className="text-xs px-2 py-0.5 bg-surface-2 rounded">
                  엔티티 {job.stats.total_entities}개
                </span>
              )}
              {job.stats.total_relationships > 0 && (
                <span className="text-xs px-2 py-0.5 bg-surface-2 rounded">
                  관계 {job.stats.total_relationships}개
                </span>
              )}
            </div>
          )}

          {/* Progress bar */}
          {isInProgress && (
            <div className="mt-2 h-1.5 bg-surface-2 rounded-full overflow-hidden">
              <div
                className="h-full bg-teal transition-all duration-300"
                style={{ width: `${job.progress}%` }}
              />
            </div>
          )}
        </div>

        {/* Time & Action */}
        <div className="flex flex-col items-end gap-2">
          <span className="text-xs text-text-tertiary">
            {formatDate(job.updated_at || job.created_at || new Date().toISOString())}
          </span>

          {job.status === 'completed' && job.project_id && (
            <button
              onClick={() => onNavigate(job.project_id!)}
              className="flex items-center gap-1 text-xs text-teal hover:text-teal/90"
            >
              프로젝트 열기
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function ImportDashboard({
  showHeader = true,
  maxItems = 10,
  onViewJob,
}: ImportDashboardProps) {
  const router = useRouter();

  const {
    data: jobs,
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['importJobs'],
    queryFn: () => api.getImportJobs({ limit: maxItems }),
    refetchInterval: 5000, // Auto-refresh every 5 seconds
    staleTime: 2000,
  });

  const handleNavigate = (projectId: string) => {
    router.push(`/projects/${projectId}`);
  };

  if (isLoading) {
    return (
      <div className="bg-surface-1 rounded border border-border p-6">
        <div className="flex items-center justify-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-teal" />
          <span className="text-text-tertiary">불러오는 중...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-surface-1 rounded border border-border p-6">
        <div className="text-center text-node-finding">
          <XCircle className="w-8 h-8 mx-auto mb-2" />
          <p>작업 목록을 불러올 수 없습니다</p>
          <button
            onClick={() => refetch()}
            className="mt-2 text-sm text-teal hover:text-teal/90"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface-1 rounded border border-border overflow-hidden">
      {showHeader && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="font-medium text-text-primary">Import 작업 현황</h3>
          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className="p-1.5 hover:bg-surface-2 rounded transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isRefetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
      )}

      <div className="p-4">
        {jobs && jobs.length > 0 ? (
          <div className="space-y-3">
            {jobs.map((job) => (
              <JobCard
                key={job.job_id}
                job={job}
                onNavigate={handleNavigate}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-text-tertiary">
            <Inbox className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>진행 중인 Import 작업이 없습니다</p>
            <p className="text-sm mt-1">
              새로운 프로젝트를 Import하면 여기에 표시됩니다
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
