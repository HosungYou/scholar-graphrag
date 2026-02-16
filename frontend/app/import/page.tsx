'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Network,
  FolderOpen,
  Upload,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  FolderSearch,
  ClipboardPaste,
  FileText,
  Database,
  BookOpen,
  Info,
  MousePointerClick,
} from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Header } from '@/components/layout';
import { ThemeToggle, ErrorBoundary, ErrorDisplay } from '@/components/ui';
import { ImportProgress } from '@/components/import/ImportProgress';
import { FolderBrowser } from '@/components/import/FolderBrowser';
import { ImportDashboard } from '@/components/import/ImportDashboard';
import { PDFUploader } from '@/components/import/PDFUploader';
import type { ImportValidationResult, Project } from '@/types';

/**
 * Normalize ScholaRAG project folder path.
 */
function normalizeScholarAGPath(inputPath: string): { path: string; wasNormalized: boolean; originalPath: string } {
  const trimmedPath = inputPath.trim();
  const originalPath = trimmedPath;

  const subfolderPatterns = [
    /\/data\/0[1-7]_[^/]+.*$/,
    /\/data\/04_rag\/.*$/,
    /\/\.scholarag.*$/,
    /\/output.*$/,
    /\/logs.*$/,
  ];

  let normalizedPath = trimmedPath;
  let wasNormalized = false;

  for (const pattern of subfolderPatterns) {
    if (pattern.test(normalizedPath)) {
      normalizedPath = normalizedPath.replace(pattern, '');
      wasNormalized = true;
      break;
    }
  }

  if (normalizedPath.endsWith('/data')) {
    normalizedPath = normalizedPath.replace(/\/data$/, '');
    wasNormalized = true;
  }

  return { path: normalizedPath, wasNormalized, originalPath };
}

const RECENT_PATHS_KEY = 'scholarag_recent_paths';
const MAX_RECENT_PATHS = 5;

function getRecentPaths(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(RECENT_PATHS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveRecentPath(path: string): void {
  if (typeof window === 'undefined') return;
  try {
    const existing = getRecentPaths();
    const filtered = existing.filter((p) => p !== path);
    const updated = [path, ...filtered].slice(0, MAX_RECENT_PATHS);
    localStorage.setItem(RECENT_PATHS_KEY, JSON.stringify(updated));
  } catch {
    // Ignore localStorage errors
  }
}

type ImportTab = 'folder' | 'pdf';

export default function ImportPage() {
  const [folderPath, setFolderPath] = useState('');
  const [validation, setValidation] = useState<ImportValidationResult | null>(null);
  const [importJobId, setImportJobId] = useState<string | null>(null);
  const [pathNormalized, setPathNormalized] = useState<{ wasNormalized: boolean; originalPath: string } | null>(null);
  const [showBrowser, setShowBrowser] = useState(false);
  const [recentPaths, setRecentPaths] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<ImportTab>('folder');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Fetch existing projects for PDF upload
  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.getProjects(),
    staleTime: 30000,
  });

  // Load recent paths on mount
  useEffect(() => {
    setRecentPaths(getRecentPaths());
  }, []);

  const handlePathChange = useCallback((newPath: string) => {
    const { path, wasNormalized, originalPath } = normalizeScholarAGPath(newPath);
    setFolderPath(path);
    setValidation(null);
    if (wasNormalized) {
      setPathNormalized({ wasNormalized, originalPath });
    } else {
      setPathNormalized(null);
    }
  }, []);

  const validateMutation = useMutation({
    mutationFn: (path: string) => api.validateScholarag(path),
    onSuccess: (data) => setValidation(data),
  });

  const importMutation = useMutation({
    mutationFn: (path: string) => api.importScholarag(path),
    onSuccess: (data) => {
      // Save to recent paths for future use
      saveRecentPath(folderPath);
      setRecentPaths(getRecentPaths());
      setImportJobId(data.job_id);
    },
  });

  const handleValidate = () => {
    if (!folderPath.trim()) return;
    setValidation(null);
    validateMutation.mutate(folderPath);
  };

  const handleImport = () => {
    if (!folderPath.trim() || !validation?.valid) return;
    importMutation.mutate(folderPath);
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        handlePathChange(text);
      }
    } catch (err) {
      console.error('Failed to read clipboard:', err);
      alert('클립보드를 읽을 수 없습니다. 브라우저 권한을 확인해주세요.');
    }
  };


  if (importJobId) {
    return (
      <div className="min-h-screen bg-surface-0 flex flex-col">
        <Header
          breadcrumbs={[{ label: 'Import', href: '/import' }, { label: 'Progress' }]}
          rightContent={<ThemeToggle />}
        />

        <main className="flex-1 max-w-2xl mx-auto px-4 py-8 w-full">
          <ErrorBoundary>
            <ImportProgress
              jobId={importJobId}
              onComplete={(projectId) => {
                setTimeout(() => {
                  router.push(`/projects/${projectId}`);
                }, 2000);
              }}
            />
          </ErrorBoundary>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-0 flex flex-col">
      <a href="#main-content" className="skip-link">
        메인 콘텐츠로 건너뛰기
      </a>

      <Header
        breadcrumbs={[{ label: 'Import' }]}
        rightContent={<ThemeToggle />}
      />

      <main id="main-content" className="flex-1 max-w-3xl mx-auto px-4 py-6 sm:py-8 w-full">
        <ErrorBoundary>
          {/* Tab Navigation */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setActiveTab('folder')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded font-medium transition-all ${
                activeTab === 'folder'
                  ? 'bg-teal text-surface-0'
                  : 'bg-surface-1 text-text-tertiary border border-border hover:bg-surface-2'
              }`}
            >
              <FolderOpen className="w-4 h-4" />
              ScholaRAG 프로젝트
            </button>
            <button
              onClick={() => setActiveTab('pdf')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded font-medium transition-all ${
                activeTab === 'pdf'
                  ? 'bg-teal text-surface-0'
                  : 'bg-surface-1 text-text-tertiary border border-border hover:bg-surface-2'
              }`}
            >
              <FileText className="w-4 h-4" />
              PDF 추가
            </button>
          </div>

          {activeTab === 'folder' ? (
          <div className="bg-surface-1 rounded border border-border p-5 sm:p-8">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
              <div className="p-3 bg-teal-dim rounded w-fit">
                <FolderOpen className="w-8 h-8 text-teal" />
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl font-medium text-text-primary">
                  Import ScholaRAG Project
                </h2>
                <p className="text-text-secondary text-sm sm:text-base">
                  Import an existing ScholaRAG project folder to build a knowledge graph.
                </p>
              </div>
            </div>

            {/* What will be imported */}
            <div className="mb-6 p-4 bg-surface-2 rounded">
              <p className="text-sm font-medium text-text-secondary mb-3">
                Import 과정에서 생성되는 것:
              </p>
              <div className="grid grid-cols-3 gap-2 sm:gap-4 text-center">
                <div className="p-2 sm:p-3 bg-surface-1 rounded border border-border">
                  <FileText className="w-5 sm:w-6 h-5 sm:h-6 text-teal mx-auto mb-1" />
                  <p className="text-xs text-text-secondary">Papers & Authors</p>
                </div>
                <div className="p-2 sm:p-3 bg-surface-1 rounded border border-border">
                  <BookOpen className="w-5 sm:w-6 h-5 sm:h-6 text-node-concept mx-auto mb-1" />
                  <p className="text-xs text-text-secondary">Concepts & Methods</p>
                </div>
                <div className="p-2 sm:p-3 bg-surface-1 rounded border border-border">
                  <Database className="w-5 sm:w-6 h-5 sm:h-6 text-teal mx-auto mb-1" />
                  <p className="text-xs text-text-secondary">Knowledge Graph</p>
                </div>
              </div>
            </div>

            {/* Folder Selection Area */}
            <div
              className="border border-dashed border-border rounded p-6 sm:p-8 mb-6 text-center transition-colors hover:border-border-hover hover:bg-surface-1"
            >
              <FolderSearch
                className="w-10 sm:w-12 h-10 sm:h-12 mx-auto mb-3 sm:mb-4 text-text-ghost"
              />
              <p className="text-base sm:text-lg font-medium text-text-secondary">
                ScholaRAG 프로젝트 폴더를 선택하세요
              </p>
              <p className="text-xs sm:text-sm text-text-tertiary mt-2 mb-4">
                아래 버튼을 클릭하여 폴더를 찾거나, 경로를 직접 입력하세요
              </p>

              {/* Browse Button */}
              <button
                onClick={() => setShowBrowser(true)}
                className="btn-primary inline-flex items-center gap-2 px-6 py-3 rounded transition-colors font-medium"
              >
                <MousePointerClick className="w-5 h-5" />
                폴더 찾기
              </button>
            </div>

            {/* Folder Path Input */}
            <div className="mb-6">
              <label
                htmlFor="folderPath"
                className="block text-sm font-medium text-text-secondary mb-2"
              >
                프로젝트 폴더 경로
              </label>
              <div className="flex gap-2">
                <div className="flex-1 relative group">
                  <input
                    ref={inputRef}
                    type="text"
                    id="folderPath"
                    value={folderPath}
                    onChange={(e) => handlePathChange(e.target.value)}
                    placeholder="/path/to/ScholaRAG/projects/2025-01-01_ProjectName"
                    className="w-full px-3 sm:px-4 py-3 pr-12 border border-border rounded focus:ring-1 focus:ring-teal focus:border-teal font-mono text-xs sm:text-sm bg-surface-2 text-text-primary placeholder-text-ghost"
                    title={folderPath || '프로젝트 폴더 경로를 입력하세요'}
                  />
                  {folderPath && (
                    <div className="absolute left-0 right-0 -bottom-1 translate-y-full z-10 hidden group-hover:block">
                      <div className="bg-surface-4 text-text-primary text-xs p-2 rounded font-mono break-all max-w-full">
                        {folderPath}
                      </div>
                    </div>
                  )}
                  <button
                    onClick={handlePaste}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-text-ghost hover:text-text-secondary transition-colors touch-target"
                    title="클립보드에서 붙여넣기"
                    aria-label="클립보드에서 붙여넣기"
                  >
                    <ClipboardPaste className="w-5 h-5" />
                  </button>
                </div>
                <button
                  onClick={handleValidate}
                  disabled={!folderPath.trim() || validateMutation.isPending}
                  className="px-4 sm:px-6 py-3 bg-surface-3 text-text-primary rounded hover:bg-surface-4 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium touch-target"
                >
                  {validateMutation.isPending ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    '검증'
                  )}
                </button>
              </div>

              {folderPath && folderPath.length > 60 && (
                <div className="mt-2 p-2 bg-surface-2 rounded border border-border text-xs font-mono text-text-secondary break-all">
                  <span className="text-text-ghost">전체 경로: </span>
                  {folderPath}
                </div>
              )}

              {pathNormalized?.wasNormalized && (
                <div className="mt-3 p-3 bg-teal-dim border border-teal/30 rounded">
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 text-teal mt-0.5 flex-shrink-0" />
                    <div className="text-sm">
                      <p className="text-teal font-medium">
                        경로가 자동 수정되었습니다
                      </p>
                      <p className="text-teal mt-1 text-xs sm:text-sm">
                        하위 폴더 대신 프로젝트 루트 폴더로 경로를 수정했습니다.
                      </p>
                      <p className="text-xs text-teal mt-1 font-mono break-all">
                        원래 경로: {pathNormalized.originalPath}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {recentPaths.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs text-text-tertiary mb-2">최근 사용한 경로:</p>
                  <div className="flex flex-wrap gap-2">
                    {recentPaths.map((path, i) => (
                      <button
                        key={i}
                        onClick={() => handlePathChange(path)}
                        className="text-xs px-3 py-1.5 bg-surface-2 text-text-tertiary rounded-full hover:bg-surface-3 transition-colors font-mono touch-target"
                      >
                        {path.length > 40 ? '...' + path.slice(-37) : path}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Validation Error */}
            {validateMutation.isError && (
              <ErrorDisplay
                error={validateMutation.error as Error}
                title="검증 실패"
                message="폴더 경로를 확인할 수 없습니다. 경로가 올바른지 확인해주세요."
                onRetry={handleValidate}
                compact
              />
            )}

            {/* Validation Results */}
            {validation && (
              <div
                className={`rounded p-4 mb-6 ${
                  validation.valid
                    ? 'bg-teal-dim border border-teal/30'
                    : 'bg-surface-2 border border-node-finding/30'
                }`}
              >
                <div className="flex items-center gap-2 mb-4">
                  {validation.valid ? (
                    <>
                      <CheckCircle className="w-6 h-6 text-teal" />
                      <span className="font-medium text-teal">검증 성공</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-6 h-6 text-node-finding" />
                      <span className="font-medium text-node-finding">검증 실패</span>
                    </>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 sm:gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    {validation.config_found ? (
                      <CheckCircle className="w-4 h-4 text-teal flex-shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-node-finding flex-shrink-0" />
                    )}
                    <span className="text-text-secondary text-xs sm:text-sm">config.yaml</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {validation.scholarag_metadata_found ? (
                      <CheckCircle className="w-4 h-4 text-teal flex-shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-copper flex-shrink-0" />
                    )}
                    <span className="text-text-secondary text-xs sm:text-sm">.scholarag</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {validation.papers_csv_found ? (
                      <CheckCircle className="w-4 h-4 text-teal flex-shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-node-finding flex-shrink-0" />
                    )}
                    <span className="text-text-secondary text-xs sm:text-sm">
                      Papers ({validation.papers_count})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {validation.pdfs_count > 0 ? (
                      <CheckCircle className="w-4 h-4 text-teal flex-shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-copper flex-shrink-0" />
                    )}
                    <span className="text-text-secondary text-xs sm:text-sm">
                      PDFs ({validation.pdfs_count})
                    </span>
                  </div>
                  <div className="flex items-center gap-2 col-span-2">
                    {validation.chroma_db_found ? (
                      <CheckCircle className="w-4 h-4 text-teal flex-shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-copper flex-shrink-0" />
                    )}
                    <span className="text-text-secondary text-xs sm:text-sm">ChromaDB embeddings</span>
                  </div>
                </div>

                {validation.errors.length > 0 && (
                  <div className="mt-4 p-3 bg-surface-2 rounded">
                    <p className="font-medium text-node-finding mb-1 text-sm">오류:</p>
                    <ul className="list-disc list-inside text-node-finding text-xs sm:text-sm">
                      {validation.errors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {validation.warnings.length > 0 && (
                  <div className="mt-4 p-3 bg-surface-2 border border-copper rounded">
                    <p className="font-medium text-copper mb-1 text-sm">경고:</p>
                    <ul className="list-disc list-inside text-copper text-xs sm:text-sm">
                      {validation.warnings.map((warn, i) => (
                        <li key={i}>{warn}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Import Button */}
            <button
              onClick={handleImport}
              disabled={!validation?.valid || importMutation.isPending}
              className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-teal hover:bg-teal/90 text-surface-0 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-mono font-medium text-sm touch-target"
            >
              {importMutation.isPending ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Starting Import...
                </>
              ) : (
                <>
                  <Upload className="w-5 h-5" />
                  Import & Build Knowledge Graph
                </>
              )}
            </button>

            {/* Help Section */}
            <div className="mt-8 p-4 bg-surface-2 rounded">
              <h3 className="font-medium text-text-secondary mb-2">폴더 경로 찾는 방법</h3>
              <ol className="text-xs sm:text-sm text-text-tertiary space-y-2">
                <li>1. 위의 <strong>"폴더 찾기"</strong> 버튼을 클릭하여 폴더 탐색기 열기</li>
                <li>2. ScholaRAG 프로젝트 폴더로 이동 (녹색으로 표시됨)</li>
                <li>3. 프로젝트 폴더 클릭하여 선택</li>
              </ol>
              <p className="text-xs text-text-tertiary mt-3">
                또는 직접 경로 입력: Finder에서 폴더 우클릭 → "경로명 복사" (Option 키 누름)
              </p>
            </div>
          </div>
          ) : (
          <div className="bg-surface-1 rounded border border-border p-5 sm:p-8">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
              <div className="p-3 bg-teal-dim rounded w-fit">
                <FileText className="w-8 h-8 text-teal" />
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl font-medium text-text-primary">
                  PDF 파일 추가
                </h2>
                <p className="text-text-secondary text-sm sm:text-base">
                  기존 프로젝트에 PDF 논문을 추가하여 Knowledge Graph를 확장합니다.
                </p>
              </div>
            </div>

            {/* Project Selection */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-text-secondary mb-2">
                프로젝트 선택
              </label>
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="w-full px-4 py-3 border border-border rounded focus:ring-1 focus:ring-teal focus:border-teal bg-surface-2 text-text-primary"
              >
                <option value="">프로젝트를 선택하세요...</option>
                {projects?.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
              {!projects || projects.length === 0 ? (
                <p className="text-sm text-text-tertiary mt-2">
                  먼저 ScholaRAG 프로젝트를 Import하세요.
                </p>
              ) : null}
            </div>

            {/* PDF Uploader */}
            {selectedProjectId ? (
              <PDFUploader
                projectId={selectedProjectId}
                onUploadComplete={(jobId) => {
                  console.log('PDF upload started:', jobId);
                }}
                onError={(error) => {
                  console.error('PDF upload error:', error);
                }}
              />
            ) : (
              <div className="text-center py-12 text-text-tertiary border border-dashed border-border rounded">
                <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>프로젝트를 선택하면 PDF를 업로드할 수 있습니다</p>
              </div>
            )}
          </div>
          )}

          {/* Import Jobs Dashboard */}
          <div className="mt-6">
            <ImportDashboard maxItems={5} />
          </div>
        </ErrorBoundary>

        {/* Folder Browser Modal */}
        {showBrowser && (
          <FolderBrowser
            onSelectPath={(path) => {
              handlePathChange(path);
              setShowBrowser(false);
              // Auto-validate after selection
              setTimeout(() => {
                validateMutation.mutate(path);
              }, 100);
            }}
            onClose={() => setShowBrowser(false)}
          />
        )}
      </main>
    </div>
  );
}
