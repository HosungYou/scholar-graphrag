'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Network, Plus, Calendar, FileText, Users } from 'lucide-react';
import { api } from '@/lib/api';

interface Project {
  id: string;
  name: string;
  research_question: string | null;
  source_path: string | null;
  created_at: string;
  stats?: {
    total_papers: number;
    total_authors: number;
    total_concepts: number;
  };
}

export default function ProjectsPage() {
  const { data: projects, isLoading, error } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: () => api.getProjects(),
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-3">
              <Network className="w-8 h-8 text-blue-600" />
              <h1 className="text-2xl font-bold text-gray-900">ScholaRAG Graph</h1>
            </Link>
          </div>
          <Link
            href="/import"
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Import Project
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Your Projects</h2>

        {isLoading && (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading projects...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
            Failed to load projects. Make sure the backend is running.
          </div>
        )}

        {projects && projects.length === 0 && (
          <div className="text-center py-12 bg-white rounded-xl border">
            <Network className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No projects yet</h3>
            <p className="text-gray-600 mb-6">
              Import a ScholaRAG folder to create your first knowledge graph.
            </p>
            <Link
              href="/import"
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-5 h-5" />
              Import ScholaRAG Project
            </Link>
          </div>
        )}

        {projects && projects.length > 0 && (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="group bg-white rounded-xl border shadow-sm hover:shadow-md transition-all p-6"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="p-3 bg-blue-100 rounded-lg group-hover:bg-blue-200 transition-colors">
                    <Network className="w-6 h-6 text-blue-600" />
                  </div>
                  <span className="text-sm text-gray-500 flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    {new Date(project.created_at).toLocaleDateString()}
                  </span>
                </div>

                <h3 className="text-lg font-semibold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">
                  {project.name}
                </h3>

                {project.research_question && (
                  <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                    {project.research_question}
                  </p>
                )}

                {project.stats && (
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <FileText className="w-4 h-4" />
                      {project.stats.total_papers} papers
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="w-4 h-4" />
                      {project.stats.total_authors} authors
                    </span>
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
