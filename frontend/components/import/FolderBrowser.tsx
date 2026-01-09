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

  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'hard-drive':
        return <HardDrive className="w-4 h-4" />;
      default:
        return <Folder className="w-4 h-4" />;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            폴더 선택
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Quick Access */}
        {quickAccess?.paths && quickAccess.paths.length > 0 && (
          <div className="px-4 py-3 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">빠른 접근</p>
            <div className="flex flex-wrap gap-2">
              {quickAccess.paths.map((p: QuickAccessPath, i: number) => (
                <button
                  key={i}
                  onClick={() => handleNavigate(p.path)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                >
                  {getIcon(p.icon)}
                  <span>{p.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Current Path */}
        <div className="px-4 py-2 border-b dark:border-gray-700 flex items-center gap-2">
          <button
            onClick={handleGoUp}
            disabled={!browseData?.parent_path}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronUp className="w-5 h-5" />
          </button>
          <button
            onClick={() => handleNavigate('')}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <Home className="w-5 h-5" />
          </button>
          <div className="flex-1 font-mono text-sm text-gray-600 dark:text-gray-300 truncate">
            {browseData?.current_path || '...'}
          </div>
          <button
            onClick={() => refetch()}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Discovered Projects */}
        {discoveredProjects.length > 0 && (
          <div className="px-4 py-3 bg-green-50 dark:bg-green-900/20 border-b dark:border-gray-700">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-green-600 dark:text-green-400" />
              <span className="text-sm font-medium text-green-700 dark:text-green-300">
                발견된 ScholaRAG 프로젝트 ({discoveredProjects.length}개)
              </span>
            </div>
            <div className="space-y-1">
              {discoveredProjects.map((project, i) => (
                <button
                  key={i}
                  onClick={() => handleSelectProject(project.path)}
                  className="w-full flex items-center gap-3 px-3 py-2 bg-white dark:bg-gray-700 rounded-lg hover:bg-green-100 dark:hover:bg-green-800/30 transition-colors text-left"
                >
                  <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white truncate">
                      {project.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {project.path}
                    </p>
                  </div>
                  {project.papers_count > 0 && (
                    <span className="text-xs bg-gray-100 dark:bg-gray-600 px-2 py-1 rounded">
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
              <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
          ) : error ? (
            <div className="text-center text-red-500 py-8">
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
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left ${
                    item.is_scholarag_project
                      ? 'bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-800/30 border border-green-200 dark:border-green-800'
                      : item.is_directory
                        ? 'hover:bg-gray-100 dark:hover:bg-gray-700'
                        : 'opacity-50 cursor-not-allowed'
                  }`}
                >
                  {item.is_directory ? (
                    item.is_scholarag_project ? (
                      <FolderOpen className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                    ) : (
                      <Folder className="w-5 h-5 text-blue-500 flex-shrink-0" />
                    )
                  ) : (
                    <FileText className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  )}

                  <span
                    className={`flex-1 truncate ${
                      item.is_scholarag_project
                        ? 'font-medium text-green-700 dark:text-green-300'
                        : 'text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {item.name}
                  </span>

                  {item.is_scholarag_project && (
                    <span className="text-xs bg-green-100 dark:bg-green-800 text-green-700 dark:text-green-300 px-2 py-0.5 rounded-full">
                      프로젝트
                    </span>
                  )}

                  {item.has_subprojects && (
                    <span className="text-xs bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">
                      하위 프로젝트 있음
                    </span>
                  )}

                  {item.is_directory && !item.is_scholarag_project && (
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  )}
                </button>
              ))}

              {browseData?.items.length === 0 && (
                <div className="text-center text-gray-500 py-8">
                  폴더가 비어있습니다
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-4 py-3 border-t dark:border-gray-700 flex items-center justify-between gap-3">
          <button
            onClick={handleDiscover}
            disabled={isDiscovering || !currentPath}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-800/30 transition-colors disabled:opacity-50"
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
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              취소
            </button>
            {browseData?.is_scholarag_project && (
              <button
                onClick={() => handleSelectProject(browseData.current_path)}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
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
