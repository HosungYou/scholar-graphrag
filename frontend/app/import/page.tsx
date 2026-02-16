'use client';

import { useState, useRef, DragEvent, useCallback, ChangeEvent } from 'react';
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
  File,
  X,
  Plus,
  Library,
  ArrowRight,
} from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Header } from '@/components/layout';
import { ThemeToggle, ErrorBoundary, ErrorDisplay } from '@/components/ui';
import { ImportProgress } from '@/components/import/ImportProgress';
import type { ImportValidationResult } from '@/types';

/* ============================================================
   ScholaRAG Graph - Import Page
   VS Design Diverge: Direction B (T-Score 0.4) "Editorial Research"

   Design Principles:
   - Step indicators (1→2→3) instead of tabs
   - Solid backgrounds (no gradients)
   - Line-based design
   - Number indicators
   - Minimal border-radius
   ============================================================ */

type ImportMethod = 'pdf' | 'scholarag' | 'zotero';

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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// Import method configuration
const importMethods = [
  { id: 'pdf' as const, label: 'PDF Upload', icon: FileText, recommended: true },
  { id: 'zotero' as const, label: 'Zotero', icon: Library, recommended: false },
  { id: 'scholarag' as const, label: 'ScholaRAG', icon: FolderOpen, recommended: false },
];

export default function ImportPage() {
  const [importMethod, setImportMethod] = useState<ImportMethod>('pdf');
  const [folderPath, setFolderPath] = useState('');
  const [validation, setValidation] = useState<ImportValidationResult | null>(null);
  const [importJobId, setImportJobId] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [pathNormalized, setPathNormalized] = useState<{ wasNormalized: boolean; originalPath: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // PDF upload state
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [projectName, setProjectName] = useState('');
  const [researchQuestion, setResearchQuestion] = useState('');
  const [extractConcepts, setExtractConcepts] = useState(true);

  // Zotero import state
  const [zoteroFiles, setZoteroFiles] = useState<File[]>([]);
  const [zoteroValidation, setZoteroValidation] = useState<{
    valid: boolean;
    items_count: number;
    pdfs_available: number;
    errors: string[];
    warnings: string[];
  } | null>(null);
  const zoteroFileInputRef = useRef<HTMLInputElement>(null);

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

  const importScholarAGMutation = useMutation({
    mutationFn: (path: string) => api.importScholarag(path),
    onSuccess: (data) => setImportJobId(data.job_id),
  });

  const uploadPDFMutation = useMutation({
    mutationFn: async () => {
      if (selectedFiles.length === 0) throw new Error('No files selected');

      if (selectedFiles.length === 1) {
        return api.uploadPDF(selectedFiles[0], {
          projectName: projectName || undefined,
          researchQuestion: researchQuestion || undefined,
          extractConcepts,
        });
      } else {
        return api.uploadMultiplePDFs(selectedFiles, {
          projectName: projectName || 'Uploaded PDFs',
          researchQuestion: researchQuestion || undefined,
          extractConcepts,
        });
      }
    },
    onSuccess: (data) => setImportJobId(data.job_id),
  });

  // Zotero mutations
  const validateZoteroMutation = useMutation({
    mutationFn: (files: File[]) => api.validateZotero(files),
    onSuccess: (data) => setZoteroValidation(data),
  });

  const importZoteroMutation = useMutation({
    mutationFn: async () => {
      if (zoteroFiles.length === 0) throw new Error('No files selected');
      return api.importZotero(zoteroFiles, {
        projectName: projectName || undefined,
        researchQuestion: researchQuestion || undefined,
        extractConcepts,
      });
    },
    onSuccess: (data) => setImportJobId(data.job_id),
  });

  const handleValidate = () => {
    if (!folderPath.trim()) return;
    setValidation(null);
    validateMutation.mutate(folderPath);
  };

  const handleImportScholarAG = () => {
    if (!folderPath.trim() || !validation?.valid) return;
    importScholarAGMutation.mutate(folderPath);
  };

  const handleUploadPDF = () => {
    if (selectedFiles.length === 0) return;
    uploadPDFMutation.mutate();
  };

  // Zotero handlers
  const handleZoteroFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(
      (file) =>
        file.name.toLowerCase().endsWith('.rdf') ||
        file.name.toLowerCase().endsWith('.pdf')
    );
    if (files.length > 0) {
      setZoteroFiles((prev) => [...prev, ...files]);
      setZoteroValidation(null);
    }
    if (zoteroFileInputRef.current) {
      zoteroFileInputRef.current.value = '';
    }
  };

  const handleZoteroValidate = () => {
    if (zoteroFiles.length === 0) return;
    const rdfFiles = zoteroFiles.filter((f) => f.name.toLowerCase().endsWith('.rdf'));
    if (rdfFiles.length === 0) {
      alert('RDF file required. Please export from Zotero in RDF format.');
      return;
    }
    validateZoteroMutation.mutate(zoteroFiles);
  };

  const handleImportZotero = () => {
    if (zoteroFiles.length === 0 || !zoteroValidation?.valid) return;
    importZoteroMutation.mutate();
  };

  const removeZoteroFile = (index: number) => {
    setZoteroFiles((prev) => prev.filter((_, i) => i !== index));
    setZoteroValidation(null);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);

    if (importMethod === 'pdf') {
      const files = Array.from(e.dataTransfer.files).filter(
        (file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
      );
      if (files.length > 0) {
        setSelectedFiles((prev) => [...prev, ...files]);
      } else {
        alert('Only PDF files are allowed.');
      }
    } else if (importMethod === 'zotero') {
      const files = Array.from(e.dataTransfer.files).filter(
        (file) =>
          file.name.toLowerCase().endsWith('.rdf') ||
          file.name.toLowerCase().endsWith('.pdf')
      );
      if (files.length > 0) {
        setZoteroFiles((prev) => [...prev, ...files]);
        setZoteroValidation(null);
      } else {
        alert('Only RDF or PDF files are allowed.');
      }
    } else {
      if (e.dataTransfer.items.length > 0) {
        alert(
          'Due to browser security, folder paths cannot be obtained via drag and drop.\n\nRight-click folder in Finder → "Get Info" → Copy path, or use pwd in terminal.'
        );
      }
    }
  };

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(
      (file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    );
    if (files.length > 0) {
      setSelectedFiles((prev) => [...prev, ...files]);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        handlePathChange(text);
      }
    } catch (err) {
      console.error('Failed to read clipboard:', err);
      alert('Cannot read clipboard. Please check browser permissions.');
    }
  };

  const commonPaths = [
    '/Volumes/External SSD/Projects/Research/ScholaRAG/projects',
    '~/Documents/ScholaRAG/projects',
  ];

  // Progress view
  if (importJobId) {
    return (
      <div className="min-h-screen bg-paper dark:bg-ink flex flex-col">
        <Header
          breadcrumbs={[{ label: 'Import', href: '/import' }, { label: 'Progress' }]}
          rightContent={<ThemeToggle />}
        />

        <main className="flex-1 max-w-2xl mx-auto px-6 py-12 w-full">
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
    <div className="min-h-screen bg-paper dark:bg-ink flex flex-col">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <Header
        breadcrumbs={[{ label: 'Import' }]}
        rightContent={<ThemeToggle />}
      />

      <main id="main-content" className="flex-1 max-w-3xl mx-auto px-6 py-8 md:py-12 w-full">
        <ErrorBoundary>
          {/* Page Header */}
          <div className="mb-8 md:mb-12">
            <span className="text-accent-teal font-mono text-sm tracking-widest uppercase">
              Data Ingestion
            </span>
            <h1 className="font-display text-3xl md:text-4xl text-ink dark:text-paper mt-2">
              Import to Knowledge Graph
            </h1>
            <p className="text-muted mt-3">
              Upload PDFs or import existing projects to build your knowledge graph.
            </p>
          </div>

          {/* Import Method Selection - Step Style */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <span className="font-mono text-2xl text-accent-teal/30">01</span>
              <span className="text-sm text-muted uppercase tracking-wider">Select Method</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {importMethods.map((method) => {
                const Icon = method.icon;
                const isActive = importMethod === method.id;
                return (
                  <button
                    key={method.id}
                    onClick={() => setImportMethod(method.id)}
                    className={`
                      step-indicator relative p-4 border transition-all text-left
                      ${isActive
                        ? 'border-accent-teal bg-accent-teal/5'
                        : 'border-ink/10 dark:border-paper/10 hover:border-ink/20 dark:hover:border-paper/20'
                      }
                    `}
                  >
                    <Icon className={`w-5 h-5 mb-2 ${isActive ? 'text-accent-teal' : 'text-muted'}`} />
                    <div className={`font-medium text-sm ${isActive ? 'text-ink dark:text-paper' : 'text-muted'}`}>
                      {method.label}
                    </div>
                    {method.recommended && (
                      <span className="absolute top-2 right-2 text-[10px] font-mono text-accent-teal">
                        REC
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* What will be created */}
          <div className="mb-8 py-4 border-y border-ink/10 dark:border-paper/10">
            <div className="flex items-center gap-2 mb-4">
              <span className="font-mono text-2xl text-accent-amber/30">02</span>
              <span className="text-sm text-muted uppercase tracking-wider">Output Preview</span>
            </div>
            <div className="grid grid-cols-3 gap-6">
              <div className="text-center">
                <FileText className="w-6 h-6 text-accent-teal mx-auto mb-2" />
                <p className="text-xs text-muted">Papers & Authors</p>
              </div>
              <div className="text-center">
                <BookOpen className="w-6 h-6 text-accent-amber mx-auto mb-2" />
                <p className="text-xs text-muted">Concepts & Methods</p>
              </div>
              <div className="text-center">
                <Database className="w-6 h-6 text-accent-red mx-auto mb-2" />
                <p className="text-xs text-muted">Knowledge Graph</p>
              </div>
            </div>
          </div>

          {/* Upload Section Header */}
          <div className="flex items-center gap-2 mb-6">
            <span className="font-mono text-2xl text-accent-red/30">03</span>
            <span className="text-sm text-muted uppercase tracking-wider">Upload Files</span>
          </div>

          {/* PDF Upload Section */}
          {importMethod === 'pdf' && (
            <div className="space-y-6">
              {/* Drop Zone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`
                  drop-zone border-2 border-dashed p-8 text-center cursor-pointer transition-all
                  ${isDragOver
                    ? 'border-accent-teal bg-accent-teal/5'
                    : 'border-ink/20 dark:border-paper/20 hover:border-accent-teal/50'
                  }
                `}
                role="button"
                tabIndex={0}
                aria-label="Upload PDF files"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <File className={`w-12 h-12 mx-auto mb-4 ${isDragOver ? 'text-accent-teal' : 'text-muted'}`} />
                <p className={`font-display text-lg ${isDragOver ? 'text-accent-teal' : 'text-ink dark:text-paper'}`}>
                  Drop PDF files or click to select
                </p>
                <p className="text-xs text-muted mt-2 font-mono">
                  Max 50MB per file / 200MB total
                </p>
              </div>

              {/* Selected Files */}
              {selectedFiles.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-muted">
                      {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} selected
                    </span>
                    <button
                      onClick={() => setSelectedFiles([])}
                      className="text-xs text-accent-red hover:underline"
                    >
                      Clear all
                    </button>
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {selectedFiles.map((file, index) => (
                      <div
                        key={`${file.name}-${index}`}
                        className="flex items-center justify-between p-3 border border-ink/10 dark:border-paper/10"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <FileText className="w-4 h-4 text-accent-red flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm text-ink dark:text-paper truncate">{file.name}</p>
                            <p className="text-xs text-muted font-mono">{formatFileSize(file.size)}</p>
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFile(index);
                          }}
                          className="p-1 text-muted hover:text-accent-red transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Project Options */}
              <div className="space-y-4">
                <div>
                  <label htmlFor="projectName" className="block text-sm text-muted mb-2">
                    Project Name <span className="text-xs">(optional)</span>
                  </label>
                  <input
                    type="text"
                    id="projectName"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="Auto-extracted from PDF title"
                    className="import-input w-full"
                  />
                </div>
                <div>
                  <label htmlFor="researchQuestion" className="block text-sm text-muted mb-2">
                    Research Question <span className="text-xs">(optional)</span>
                  </label>
                  <input
                    type="text"
                    id="researchQuestion"
                    value={researchQuestion}
                    onChange={(e) => setResearchQuestion(e.target.value)}
                    placeholder="e.g., What are the effects of AI on learning?"
                    className="import-input w-full"
                  />
                </div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={extractConcepts}
                    onChange={(e) => setExtractConcepts(e.target.checked)}
                    className="w-4 h-4 accent-accent-teal"
                  />
                  <span className="text-sm text-muted">
                    AI-extract concepts, methods, and findings (recommended)
                  </span>
                </label>
              </div>

              {/* Error */}
              {uploadPDFMutation.isError && (
                <ErrorDisplay
                  error={uploadPDFMutation.error as Error}
                  title="Upload failed"
                  message="An error occurred while uploading PDFs."
                  onRetry={handleUploadPDF}
                  compact
                />
              )}

              {/* Upload Button */}
              <button
                onClick={handleUploadPDF}
                disabled={selectedFiles.length === 0 || uploadPDFMutation.isPending}
                className="btn btn--primary w-full justify-center py-4"
              >
                {uploadPDFMutation.isPending ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5 mr-2" />
                    Upload & Build Knowledge Graph
                  </>
                )}
              </button>
            </div>
          )}

          {/* Zotero Import Section */}
          {importMethod === 'zotero' && (
            <div className="space-y-6">
              {/* Info Banner */}
              <div className="p-4 border-l-2 border-accent-teal bg-accent-teal/5">
                <p className="font-medium text-ink dark:text-paper mb-2">Export from Zotero</p>
                <ol className="text-sm text-muted space-y-1 list-decimal list-inside">
                  <li>Select collection or items in Zotero</li>
                  <li>File → Export... (or right-click → Export)</li>
                  <li>Format: <strong>Zotero RDF</strong></li>
                  <li>Check <strong>&quot;Export Files&quot;</strong></li>
                  <li>Save and upload the folder below</li>
                </ol>
              </div>

              {/* Drop Zone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`
                  drop-zone border-2 border-dashed p-8 text-center transition-all
                  ${isDragOver
                    ? 'border-accent-teal bg-accent-teal/5'
                    : 'border-ink/20 dark:border-paper/20'
                  }
                `}
              >
                <input
                  ref={zoteroFileInputRef}
                  type="file"
                  accept=".rdf,.pdf,application/pdf"
                  multiple
                  onChange={handleZoteroFileSelect}
                  className="hidden"
                />
                <input
                  id="zoteroFolderInput"
                  type="file"
                  // @ts-expect-error webkitdirectory is not in standard types
                  webkitdirectory=""
                  onChange={handleZoteroFileSelect}
                  className="hidden"
                />
                <Library className={`w-12 h-12 mx-auto mb-4 ${isDragOver ? 'text-accent-teal' : 'text-muted'}`} />
                <p className={`font-display text-lg ${isDragOver ? 'text-accent-teal' : 'text-ink dark:text-paper'}`}>
                  Drop Zotero export files
                </p>
                <p className="text-xs text-muted mt-2 font-mono">
                  .rdf (required) + .pdf files (optional)
                </p>
                <div className="flex gap-3 mt-6 justify-center">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      zoteroFileInputRef.current?.click();
                    }}
                    className="btn btn--secondary text-sm"
                  >
                    Select Files
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      document.getElementById('zoteroFolderInput')?.click();
                    }}
                    className="btn btn--primary text-sm"
                  >
                    Select Folder
                  </button>
                </div>
              </div>

              {/* Selected Files */}
              {zoteroFiles.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-muted">{zoteroFiles.length} files selected</span>
                    <button
                      onClick={() => {
                        setZoteroFiles([]);
                        setZoteroValidation(null);
                      }}
                      className="text-xs text-accent-red hover:underline"
                    >
                      Clear all
                    </button>
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {zoteroFiles.map((file, index) => (
                      <div
                        key={index}
                        className={`flex items-center gap-3 p-3 border ${
                          file.name.endsWith('.rdf')
                            ? 'border-accent-amber bg-accent-amber/5'
                            : 'border-ink/10 dark:border-paper/10'
                        }`}
                      >
                        {file.name.endsWith('.rdf') ? (
                          <Database className="w-4 h-4 text-accent-amber flex-shrink-0" />
                        ) : (
                          <FileText className="w-4 h-4 text-accent-teal flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-ink dark:text-paper truncate">{file.name}</p>
                          <p className="text-xs text-muted font-mono">
                            {formatFileSize(file.size)}
                            {file.name.endsWith('.rdf') && ' - metadata'}
                          </p>
                        </div>
                        <button
                          onClick={() => removeZoteroFile(index)}
                          className="p-1 text-muted hover:text-accent-red"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  {!zoteroFiles.some((f) => f.name.endsWith('.rdf')) && (
                    <p className="mt-2 text-sm text-accent-red">
                      RDF file required
                    </p>
                  )}
                </div>
              )}

              {/* Validate Button */}
              <button
                onClick={handleZoteroValidate}
                disabled={
                  zoteroFiles.length === 0 ||
                  !zoteroFiles.some((f) => f.name.endsWith('.rdf')) ||
                  validateZoteroMutation.isPending
                }
                className="btn btn--secondary w-full justify-center"
              >
                {validateZoteroMutation.isPending ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    Validating...
                  </>
                ) : (
                  'Validate Files'
                )}
              </button>

              {/* Validation Error */}
              {validateZoteroMutation.isError && (
                <div className="p-4 border-l-2 border-accent-red bg-accent-red/5">
                  <p className="text-sm text-accent-red">
                    Validation failed: {(validateZoteroMutation.error as Error).message}
                  </p>
                </div>
              )}

              {/* Validation Results */}
              {zoteroValidation && (
                <div className={`p-4 border-l-2 ${
                  zoteroValidation.valid
                    ? 'border-accent-teal bg-accent-teal/5'
                    : 'border-accent-red bg-accent-red/5'
                }`}>
                  <div className="flex items-center gap-2 mb-4">
                    {zoteroValidation.valid ? (
                      <>
                        <CheckCircle className="w-5 h-5 text-accent-teal" />
                        <span className="font-medium text-ink dark:text-paper">Validation passed</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-5 h-5 text-accent-red" />
                        <span className="font-medium text-ink dark:text-paper">Validation failed</span>
                      </>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-muted uppercase tracking-wider">Items</p>
                      <p className="font-mono text-2xl text-ink dark:text-paper">
                        {zoteroValidation.items_count}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted uppercase tracking-wider">PDFs</p>
                      <p className="font-mono text-2xl text-ink dark:text-paper">
                        {zoteroValidation.pdfs_available}
                      </p>
                    </div>
                  </div>

                  {zoteroValidation.errors.length > 0 && (
                    <div className="mt-4 text-sm text-accent-red">
                      <p className="font-medium mb-1">Errors:</p>
                      <ul className="list-disc list-inside">
                        {zoteroValidation.errors.map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {zoteroValidation.warnings.length > 0 && (
                    <div className="mt-4 text-sm text-accent-amber">
                      <p className="font-medium mb-1">Warnings:</p>
                      <ul className="list-disc list-inside">
                        {zoteroValidation.warnings.map((warn, i) => (
                          <li key={i}>{warn}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Project Options */}
              <div className="space-y-4">
                <div>
                  <label htmlFor="zoteroProjectName" className="block text-sm text-muted mb-2">
                    Project Name <span className="text-xs">(optional)</span>
                  </label>
                  <input
                    type="text"
                    id="zoteroProjectName"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="Zotero Import YYYY-MM-DD"
                    className="import-input w-full"
                  />
                </div>
                <div>
                  <label htmlFor="zoteroResearchQuestion" className="block text-sm text-muted mb-2">
                    Research Question <span className="text-xs">(optional)</span>
                  </label>
                  <input
                    type="text"
                    id="zoteroResearchQuestion"
                    value={researchQuestion}
                    onChange={(e) => setResearchQuestion(e.target.value)}
                    placeholder="What do you want to research with these papers?"
                    className="import-input w-full"
                  />
                </div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={extractConcepts}
                    onChange={(e) => setExtractConcepts(e.target.checked)}
                    className="w-4 h-4 accent-accent-teal"
                  />
                  <span className="text-sm text-muted">
                    AI-extract concepts, methods, and findings (recommended)
                  </span>
                </label>
              </div>

              {/* Import Button */}
              <button
                onClick={handleImportZotero}
                disabled={!zoteroValidation?.valid || importZoteroMutation.isPending}
                className="btn btn--primary w-full justify-center py-4"
              >
                {importZoteroMutation.isPending ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5 mr-2" />
                    Import & Build Knowledge Graph
                  </>
                )}
              </button>
            </div>
          )}

          {/* ScholaRAG Import Section */}
          {importMethod === 'scholarag' && (
            <div className="space-y-6">
              {/* Drop Zone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.focus()}
                className={`
                  drop-zone border-2 border-dashed p-8 text-center cursor-pointer transition-all
                  ${isDragOver
                    ? 'border-accent-teal bg-accent-teal/5'
                    : 'border-ink/20 dark:border-paper/20 hover:border-accent-teal/50'
                  }
                `}
                role="button"
                tabIndex={0}
              >
                <FolderSearch className={`w-12 h-12 mx-auto mb-4 ${isDragOver ? 'text-accent-teal' : 'text-muted'}`} />
                <p className={`font-display text-lg ${isDragOver ? 'text-accent-teal' : 'text-ink dark:text-paper'}`}>
                  Enter ScholaRAG project folder path
                </p>
                <p className="text-xs text-muted mt-2">
                  Right-click folder in Finder → "Copy Path"
                </p>
              </div>

              {/* Path Input */}
              <div>
                <label htmlFor="folderPath" className="block text-sm text-muted mb-2">
                  Project Folder Path
                </label>
                <div className="flex gap-3">
                  <div className="flex-1 relative">
                    <input
                      ref={inputRef}
                      type="text"
                      id="folderPath"
                      value={folderPath}
                      onChange={(e) => handlePathChange(e.target.value)}
                      placeholder="/path/to/ScholaRAG/projects/2025-01-01_ProjectName"
                      className="import-input w-full pr-10 font-mono text-sm"
                    />
                    <button
                      onClick={handlePaste}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-muted hover:text-accent-teal transition-colors"
                      title="Paste from clipboard"
                    >
                      <ClipboardPaste className="w-4 h-4" />
                    </button>
                  </div>
                  <button
                    onClick={handleValidate}
                    disabled={!folderPath.trim() || validateMutation.isPending}
                    className="btn btn--secondary"
                  >
                    {validateMutation.isPending ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      'Validate'
                    )}
                  </button>
                </div>

                {/* Full path display */}
                {folderPath && folderPath.length > 60 && (
                  <div className="mt-2 p-2 bg-surface/30 text-xs font-mono text-muted break-all">
                    {folderPath}
                  </div>
                )}

                {/* Path normalized notice */}
                {pathNormalized?.wasNormalized && (
                  <div className="mt-3 p-3 border-l-2 border-accent-teal bg-accent-teal/5">
                    <p className="font-medium text-ink dark:text-paper text-sm">Path auto-corrected</p>
                    <p className="text-xs text-muted mt-1">
                      Adjusted to project root from subfolder.
                    </p>
                  </div>
                )}

                {/* Quick paths */}
                <div className="mt-3">
                  <p className="text-xs text-muted mb-2">Quick paths:</p>
                  <div className="flex flex-wrap gap-2">
                    {commonPaths.map((path, i) => (
                      <button
                        key={i}
                        onClick={() => handlePathChange(path)}
                        className="text-xs px-3 py-1.5 border border-ink/10 dark:border-paper/10 text-muted hover:border-accent-teal hover:text-accent-teal transition-colors font-mono"
                      >
                        {path.length > 40 ? '...' + path.slice(-37) : path}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Validation Error */}
              {validateMutation.isError && (
                <ErrorDisplay
                  error={validateMutation.error as Error}
                  title="Validation failed"
                  message="Could not validate folder path. Please check the path."
                  onRetry={handleValidate}
                  compact
                />
              )}

              {/* Validation Results */}
              {validation && (
                <div className={`p-4 border-l-2 ${
                  validation.valid
                    ? 'border-accent-teal bg-accent-teal/5'
                    : 'border-accent-red bg-accent-red/5'
                }`}>
                  <div className="flex items-center gap-2 mb-4">
                    {validation.valid ? (
                      <>
                        <CheckCircle className="w-5 h-5 text-accent-teal" />
                        <span className="font-medium text-ink dark:text-paper">Validation passed</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-5 h-5 text-accent-red" />
                        <span className="font-medium text-ink dark:text-paper">Validation failed</span>
                      </>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="flex items-center gap-2">
                      {validation.config_found ? (
                        <CheckCircle className="w-4 h-4 text-accent-teal" />
                      ) : (
                        <XCircle className="w-4 h-4 text-accent-red" />
                      )}
                      <span className="text-muted">config.yaml</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {validation.scholarag_metadata_found ? (
                        <CheckCircle className="w-4 h-4 text-accent-teal" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-accent-amber" />
                      )}
                      <span className="text-muted">.scholarag</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {validation.papers_csv_found ? (
                        <CheckCircle className="w-4 h-4 text-accent-teal" />
                      ) : (
                        <XCircle className="w-4 h-4 text-accent-red" />
                      )}
                      <span className="text-muted">Papers ({validation.papers_count})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {validation.pdfs_count > 0 ? (
                        <CheckCircle className="w-4 h-4 text-accent-teal" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-accent-amber" />
                      )}
                      <span className="text-muted">PDFs ({validation.pdfs_count})</span>
                    </div>
                  </div>

                  {validation.errors.length > 0 && (
                    <div className="mt-4 text-sm text-accent-red">
                      <p className="font-medium mb-1">Errors:</p>
                      <ul className="list-disc list-inside">
                        {validation.errors.map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {validation.warnings.length > 0 && (
                    <div className="mt-4 text-sm text-accent-amber">
                      <p className="font-medium mb-1">Warnings:</p>
                      <ul className="list-disc list-inside">
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
                onClick={handleImportScholarAG}
                disabled={!validation?.valid || importScholarAGMutation.isPending}
                className="btn btn--primary w-full justify-center py-4"
              >
                {importScholarAGMutation.isPending ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    Starting Import...
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5 mr-2" />
                    Import & Build Knowledge Graph
                  </>
                )}
              </button>

              {/* Help Section */}
              <div className="p-4 border border-ink/10 dark:border-paper/10">
                <h3 className="font-medium text-ink dark:text-paper mb-2">How to find folder path</h3>
                <ol className="text-sm text-muted space-y-2">
                  <li>1. Navigate to ScholaRAG project folder in Finder</li>
                  <li>2. Right-click → Hold Option → <strong>&quot;Copy Path&quot;</strong></li>
                  <li>3. Paste into the input above (Cmd+V)</li>
                </ol>
                <p className="text-xs text-muted mt-3 font-mono">
                  Or in terminal: cd [folder] && pwd
                </p>
              </div>
            </div>
          )}
        </ErrorBoundary>
      </main>
    </div>
  );
}
