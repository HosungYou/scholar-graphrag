'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Network, FolderOpen, Upload, CheckCircle, XCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface ValidationResult {
  valid: boolean;
  folder_path: string;
  config_found: boolean;
  scholarag_metadata_found: boolean;
  papers_csv_found: boolean;
  papers_count: number;
  pdfs_count: number;
  chroma_db_found: boolean;
  errors: string[];
  warnings: string[];
}

export default function ImportPage() {
  const [folderPath, setFolderPath] = useState('');
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [importJobId, setImportJobId] = useState<string | null>(null);

  const validateMutation = useMutation({
    mutationFn: (path: string) => api.validateScholarag(path),
    onSuccess: (data) => setValidation(data),
  });

  const importMutation = useMutation({
    mutationFn: (path: string) => api.importScholarag(path),
    onSuccess: (data) => setImportJobId(data.job_id),
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link href="/" className="flex items-center gap-3">
            <Network className="w-8 h-8 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">ScholaRAG Graph</h1>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="bg-white rounded-xl shadow-sm border p-8">
          <div className="flex items-center gap-4 mb-6">
            <div className="p-3 bg-blue-100 rounded-lg">
              <FolderOpen className="w-8 h-8 text-blue-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Import ScholaRAG Project</h2>
              <p className="text-gray-600">
                Import an existing ScholaRAG project folder to build a knowledge graph.
              </p>
            </div>
          </div>

          {/* Folder Path Input */}
          <div className="mb-6">
            <label htmlFor="folderPath" className="block text-sm font-medium text-gray-700 mb-2">
              ScholaRAG Project Folder Path
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                id="folderPath"
                value={folderPath}
                onChange={(e) => setFolderPath(e.target.value)}
                placeholder="/path/to/projects/2025-01-01_ProjectName"
                className="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <button
                onClick={handleValidate}
                disabled={!folderPath.trim() || validateMutation.isPending}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {validateMutation.isPending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  'Validate'
                )}
              </button>
            </div>
            <p className="text-sm text-gray-500 mt-2">
              Enter the full path to your ScholaRAG project folder (e.g., projects/2025-12-05_GenAI-Learning-Effects-Meta)
            </p>
          </div>

          {/* Validation Results */}
          {validation && (
            <div className={`rounded-lg p-4 mb-6 ${validation.valid ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              <div className="flex items-center gap-2 mb-4">
                {validation.valid ? (
                  <>
                    <CheckCircle className="w-6 h-6 text-green-600" />
                    <span className="font-semibold text-green-700">Validation Passed</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-6 h-6 text-red-600" />
                    <span className="font-semibold text-red-700">Validation Failed</span>
                  </>
                )}
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  {validation.config_found ? (
                    <CheckCircle className="w-4 h-4 text-green-600" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-600" />
                  )}
                  <span>config.yaml</span>
                </div>
                <div className="flex items-center gap-2">
                  {validation.scholarag_metadata_found ? (
                    <CheckCircle className="w-4 h-4 text-green-600" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-yellow-600" />
                  )}
                  <span>.scholarag metadata</span>
                </div>
                <div className="flex items-center gap-2">
                  {validation.papers_csv_found ? (
                    <CheckCircle className="w-4 h-4 text-green-600" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-600" />
                  )}
                  <span>Papers CSV ({validation.papers_count} papers)</span>
                </div>
                <div className="flex items-center gap-2">
                  {validation.pdfs_count > 0 ? (
                    <CheckCircle className="w-4 h-4 text-green-600" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-yellow-600" />
                  )}
                  <span>PDFs ({validation.pdfs_count} files)</span>
                </div>
                <div className="flex items-center gap-2">
                  {validation.chroma_db_found ? (
                    <CheckCircle className="w-4 h-4 text-green-600" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-yellow-600" />
                  )}
                  <span>ChromaDB embeddings</span>
                </div>
              </div>

              {validation.errors.length > 0 && (
                <div className="mt-4 p-3 bg-red-100 rounded">
                  <p className="font-medium text-red-700 mb-1">Errors:</p>
                  <ul className="list-disc list-inside text-red-600 text-sm">
                    {validation.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {validation.warnings.length > 0 && (
                <div className="mt-4 p-3 bg-yellow-100 rounded">
                  <p className="font-medium text-yellow-700 mb-1">Warnings:</p>
                  <ul className="list-disc list-inside text-yellow-600 text-sm">
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
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {importMutation.isPending ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Upload className="w-5 h-5" />
                Start Import
              </>
            )}
          </button>

          {/* Import Job Status */}
          {importJobId && (
            <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-blue-700">
                Import job started! Job ID: <code className="bg-blue-100 px-1 rounded">{importJobId}</code>
              </p>
              <p className="text-sm text-blue-600 mt-2">
                Check the status at <code>/api/import/status/{importJobId}</code>
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
