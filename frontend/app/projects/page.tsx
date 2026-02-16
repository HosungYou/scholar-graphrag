'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Network, Plus, Calendar, FileText, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { Header, Footer } from '@/components/layout';
import {
  ThemeToggle,
  ErrorDisplay,
  ProjectListSkeleton,
  ErrorBoundary,
} from '@/components/ui';
import type { Project } from '@/types';

function ProjectCard({ project }: { project: Project }) {
  return (
    <Link
      href={`/projects/${project.id}`}
      className="group bg-surface-1 border border-border rounded hover:border-border-hover transition-colors p-5 sm:p-6 touch-target"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="p-3 bg-teal-dim rounded">
          <Network className="w-6 h-6 text-teal" />
        </div>
        <span className="text-xs text-text-ghost font-mono flex items-center gap-1">
          <Calendar className="w-4 h-4" />
          {new Date(project.created_at).toLocaleDateString('ko-KR')}
        </span>
      </div>

      <h3 className="text-sm font-medium text-text-primary mb-2 group-hover:text-teal transition-colors line-clamp-1">
        {project.name}
      </h3>

      {project.research_question && (
        <p className="text-sm text-text-tertiary mb-4 line-clamp-2">
          {project.research_question}
        </p>
      )}

      {project.stats && (
        <div className="flex items-center gap-4 text-xs text-text-ghost font-mono">
          {project.stats.total_papers !== undefined && (
            <span className="flex items-center gap-1">
              <FileText className="w-4 h-4" />
              {project.stats.total_papers} papers
            </span>
          )}
          {project.stats.total_authors !== undefined && (
            <span className="flex items-center gap-1">
              <Users className="w-4 h-4" />
              {project.stats.total_authors} authors
            </span>
          )}
        </div>
      )}
    </Link>
  );
}

function ProjectsContent() {
  const { data: projects, isLoading, error, refetch } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.getProjects(),
  });

  if (isLoading) {
    return <ProjectListSkeleton count={6} />;
  }

  if (error) {
    return (
      <ErrorDisplay
        error={error as Error}
        title="프로젝트를 불러올 수 없습니다"
        message="백엔드 서버가 실행 중인지 확인해주세요."
        onRetry={() => refetch()}
      />
    );
  }

  if (!projects || projects.length === 0) {
    return (
      <div className="text-center py-12 bg-surface-1 rounded border border-border">
        <Network className="w-16 h-16 text-text-ghost mx-auto mb-4" />
        <h3 className="text-lg font-medium text-text-primary mb-2">
          프로젝트가 없습니다
        </h3>
        <p className="text-text-secondary mb-6">
          ScholaRAG 폴더를 Import하여 첫 번째 Knowledge Graph를 만들어보세요.
        </p>
        <Link
          href="/import"
          className="btn-primary inline-flex items-center gap-2 touch-target"
        >
          <Plus className="w-5 h-5" />
          Import ScholaRAG Project
        </Link>
      </div>
    );
  }

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
      {projects.map((project) => (
        <ProjectCard key={project.id} project={project} />
      ))}
    </div>
  );
}

export default function ProjectsPage() {
  return (
    <div className="min-h-screen bg-surface-0 flex flex-col">
      <a href="#main-content" className="skip-link">
        메인 콘텐츠로 건너뛰기
      </a>

      <Header
        breadcrumbs={[{ label: 'Projects' }]}
        rightContent={
          <div className="flex items-center gap-2">
            <ThemeToggle variant="dropdown" />
            <Link
              href="/import"
              className="btn-primary flex items-center gap-2 touch-target"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Import</span>
            </Link>
          </div>
        }
      />

      <main id="main-content" className="flex-1 max-w-4xl mx-auto px-4 py-6 sm:py-8 w-full">
        <div className="mb-6">
          <div className="font-mono text-[11px] text-copper tracking-[0.15em] uppercase mb-2">
            Projects
          </div>
          <h2 className="text-lg font-medium text-text-primary">
            Your Projects
          </h2>
        </div>

        <ErrorBoundary>
          <ProjectsContent />
        </ErrorBoundary>
      </main>

      <Footer minimal />
    </div>
  );
}
