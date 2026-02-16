'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronUp,
  Home,
  HardDrive,
  FileText,
  CheckCircle,
  Loader2,
  RefreshCw,
  X,
  Sparkles,
} from 'lucide-react';
import { api, FolderItem, QuickAccessPath, DiscoveredProject } from '@/lib/api';

interface FolderBrowserProps {
  onSelectPath: (path: string) => void;
  onClose: () => void;
}

export function FolderBrowser({ onSelectPath, onClose }: FolderBrowserProps) {
  const [currentPath, setCurrentPath] = useState<string>('');
  const [discoveredProjects, setDiscoveredProjects] = useState<DiscoveredProject[]>([]);
  const [isDiscovering, setIsDiscovering] = useState(false);

  // Quick access paths
  const { data: quickAccess } = useQuery({
    queryKey: ['quickAccess'],
    queryFn: () => api.getQuickAccessPaths(),
    staleTime: 60000,
  });

  // Browse folder
  const {
    data: browseData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['browse', currentPath],
    queryFn: () => api.browseFolder(currentPath || undefined),
    enabled: true,
    staleTime: 5000,
    retry: false,
  });

  // Auto-discover projects when browsing
  useEffect(() => {
    if (browseData?.suggested_projects && browseData.suggested_projects.length > 0) {
      setDiscoveredProjects(
        browseData.suggested_projects.map((p) => ({
          name: p.name,
          path: p.path,
          papers_count: 0,
          has_config: true,
        }))
      );
    } else {
      setDiscoveredProjects([]);
    }
  }, [browseData]);

  const handleNavigate = useCallback((path: string) => {
    setCurrentPath(path);
    setDiscoveredProjects([]);
  }, []);

  const handleGoUp = useCallback(() => {
    if (browseData?.parent_path) {
      handleNavigate(browseData.parent_path);
    }
  }, [browseData, handleNavigate]);

  const handleDiscover = useCallback(async () => {
    if (!currentPath) return;
    setIsDiscovering(true);
    try {
      const result = await api.discoverProjects(currentPath);
      setDiscoveredProjects(result.projects);
    } catch (err) {
      console.error('Failed to discover projects:', err);
    } finally {
      setIsDiscovering(false);
    }
  }, [currentPath]);

  const handleSelectProject = useCallback(
    (path: string) => {
      onSelectPath(path);
      onClose();
    },
    [onSelectPath, onClose]
  );

  const getIcon = (iconName?: string) => {
    switch (iconName) {
      case 'hard-drive':
        return <HardDrive className="w-4 h-4" />;
      default:
        return <Folder className="w-4 h-4" />;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface-1 rounded w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-lg font-medium text-text-primary">
            폴더 선택
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-surface-2 rounded transition-colors"
          >
            <X className="w-5 h-5 text-text-tertiary" />
          </button>
        </div>

        {/* Quick Access */}
        {quickAccess?.paths && quickAccess.paths.length > 0 && (
          <div className="px-4 py-3 border-b border-border bg-surface-0">
            <p className="text-xs text-text-tertiary mb-2">빠른 접근</p>
            <div className="flex flex-wrap gap-2">
              {quickAccess.paths.map((p: QuickAccessPath, i: number) => (
                <button
                  key={i}
                  onClick={() => handleNavigate(p.path)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-surface-1 border border-border rounded hover:bg-surface-2 transition-colors"
                >
                  {getIcon(p.icon)}
                  <span>{p.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Current Path */}
        <div className="px-4 py-2 border-b border-border flex items-center gap-2">
          <button
            onClick={handleGoUp}
            disabled={!browseData?.parent_path}
            className="p-1.5 hover:bg-surface-2 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronUp className="w-5 h-5" />
          </button>
          <button
            onClick={() => handleNavigate('')}
            className="p-1.5 hover:bg-surface-2 rounded transition-colors"
          >
            <Home className="w-5 h-5" />
          </button>
          <div className="flex-1 font-mono text-sm text-text-secondary truncate">
            {browseData?.current_path || '...'}
          </div>
          <button
            onClick={() => refetch()}
            className="p-1.5 hover:bg-surface-2 rounded transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Discovered Projects */}
        {discoveredProjects.length > 0 && (
          <div className="px-4 py-3 bg-teal-dim border-b border-border">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-teal" />
              <span className="text-sm font-medium text-teal">
                발견된 ScholaRAG 프로젝트 ({discoveredProjects.length}개)
              </span>
            </div>
            <div className="space-y-1">
              {discoveredProjects.map((project, i) => (
                <button
                  key={i}
                  onClick={() => handleSelectProject(project.path)}
                  className="w-full flex items-center gap-3 px-3 py-2 bg-surface-1 rounded hover:bg-surface-2 transition-colors text-left"
                >
                  <CheckCircle className="w-5 h-5 text-teal flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-text-primary truncate">
                      {project.name}
                    </p>
                    <p className="text-xs text-text-tertiary truncate">
                      {project.path}
                    </p>
                  </div>
                  {project.papers_count > 0 && (
                    <span className="text-xs bg-surface-2 px-2 py-1 rounded">
                      {project.papers_count} 논문
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Folder Contents */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-8 h-8 animate-spin text-teal" />
            </div>
          ) : error ? (
            <div className="text-center text-node-finding py-8">
              <p>폴더를 읽을 수 없습니다</p>
              <p className="text-sm mt-1">{(error as Error).message}</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {browseData?.items.map((item: FolderItem, i: number) => (
                <button
                  key={i}
                  onClick={() => {
                    if (item.is_directory) {
                      if (item.is_scholarag_project) {
                        handleSelectProject(item.path);
                      } else {
                        handleNavigate(item.path);
                      }
                    }
                  }}
                  disabled={!item.is_directory}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded transition-colors text-left ${
                    item.is_scholarag_project
                      ? 'bg-teal-dim hover:bg-surface-2 border border-teal/30'
                      : item.is_directory
                        ? 'hover:bg-surface-2'
                        : 'opacity-50 cursor-not-allowed'
                  }`}
                >
                  {item.is_directory ? (
                    item.is_scholarag_project ? (
                      <FolderOpen className="w-5 h-5 text-teal flex-shrink-0" />
                    ) : (
                      <Folder className="w-5 h-5 text-teal flex-shrink-0" />
                    )
                  ) : (
                    <FileText className="w-5 h-5 text-text-tertiary flex-shrink-0" />
                  )}

                  <span
                    className={`flex-1 truncate ${
                      item.is_scholarag_project
                        ? 'font-medium text-teal'
                        : 'text-text-secondary'
                    }`}
                  >
                    {item.name}
                  </span>

                  {item.is_scholarag_project && (
                    <span className="text-xs bg-teal-dim text-teal px-2 py-0.5 rounded-full">
                      프로젝트
                    </span>
                  )}

                  {item.has_subprojects && (
                    <span className="text-xs bg-teal-dim text-teal px-2 py-0.5 rounded-full">
                      하위 프로젝트 있음
                    </span>
                  )}

                  {item.is_directory && !item.is_scholarag_project && (
                    <ChevronRight className="w-4 h-4 text-text-tertiary" />
                  )}
                </button>
              ))}

              {browseData?.items.length === 0 && (
                <div className="text-center text-text-tertiary py-8">
                  폴더가 비어있습니다
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-4 py-3 border-t border-border flex items-center justify-between gap-3">
          <button
            onClick={handleDiscover}
            disabled={isDiscovering || !currentPath}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-teal-dim text-teal rounded hover:bg-surface-2 transition-colors disabled:opacity-50"
          >
            {isDiscovering ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            프로젝트 자동 탐색
          </button>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-text-secondary hover:bg-surface-2 rounded transition-colors"
            >
              취소
            </button>
            {browseData?.is_scholarag_project && (
              <button
                onClick={() => handleSelectProject(browseData.current_path)}
                className="px-4 py-2 text-sm bg-teal text-white rounded hover:bg-teal/90 transition-colors"
              >
                이 폴더 선택
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
