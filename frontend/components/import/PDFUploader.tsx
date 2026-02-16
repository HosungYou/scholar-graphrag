'use client';

import { useState, useRef, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FileText,
  Upload,
  X,
  CheckCircle,
  XCircle,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { api } from '@/lib/api';

interface PDFUploaderProps {
  projectId: string;
  onUploadComplete?: (jobId: string) => void;
  onError?: (error: string) => void;
}

interface FileUploadState {
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  message?: string;
  jobId?: string;
}

export function PDFUploader({ projectId, onUploadComplete, onError }: PDFUploaderProps) {
  const [files, setFiles] = useState<FileUploadState[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      return api.uploadPDF(file, { projectId });
    },
    onSuccess: (data, file) => {
      setFiles((prev) =>
        prev.map((f) =>
          f.file === file
            ? { ...f, status: 'success', message: data.message, jobId: data.job_id }
            : f
        )
      );
      queryClient.invalidateQueries({ queryKey: ['importJobs'] });
      onUploadComplete?.(data.job_id);
    },
    onError: (error: Error, file) => {
      setFiles((prev) =>
        prev.map((f) =>
          f.file === file
            ? { ...f, status: 'error', message: error.message }
            : f
        )
      );
      onError?.(error.message);
    },
  });

  const handleFiles = useCallback(
    (selectedFiles: FileList | null) => {
      if (!selectedFiles) return;

      const pdfFiles = Array.from(selectedFiles).filter(
        (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
      );

      if (pdfFiles.length === 0) {
        onError?.('PDF 파일만 업로드할 수 있습니다');
        return;
      }

      const newFiles: FileUploadState[] = pdfFiles.map((file) => ({
        file,
        status: 'uploading' as const,
      }));

      setFiles((prev) => [...prev, ...newFiles]);

      // Start uploading each file
      pdfFiles.forEach((file) => {
        uploadMutation.mutate(file);
      });
    },
    [uploadMutation, onError]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const removeFile = useCallback((file: File) => {
    setFiles((prev) => prev.filter((f) => f.file !== file));
  }, []);

  const clearCompleted = useCallback(() => {
    setFiles((prev) => prev.filter((f) => f.status === 'uploading' || f.status === 'pending'));
  }, []);

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <div
        onClick={() => fileInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`relative border-2 border-dashed rounded p-8 text-center cursor-pointer transition-all ${
          isDragging
            ? 'border-teal bg-teal-dim'
            : 'border-border hover:border-teal/50 hover:bg-surface-2'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          multiple
          onChange={(e) => handleFiles(e.target.files)}
          className="hidden"
        />

        <Upload className={`w-10 h-10 mx-auto mb-3 ${isDragging ? 'text-teal' : 'text-text-tertiary'}`} />
        <p className="text-base font-medium text-text-primary">
          {isDragging ? 'PDF 파일을 여기에 놓으세요' : 'PDF 파일을 드래그하거나 클릭하여 업로드'}
        </p>
        <p className="text-sm text-text-secondary mt-1">
          여러 파일을 동시에 업로드할 수 있습니다
        </p>
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-text-primary">
              업로드 파일 ({files.length}개)
            </p>
            {files.some((f) => f.status === 'success' || f.status === 'error') && (
              <button
                onClick={clearCompleted}
                className="text-xs text-text-tertiary hover:text-text-secondary"
              >
                완료된 항목 지우기
              </button>
            )}
          </div>

          <div className="space-y-2">
            {files.map((fileState, index) => (
              <div
                key={`${fileState.file.name}-${index}`}
                className={`flex items-center gap-3 p-3 rounded border ${
                  fileState.status === 'success'
                    ? 'bg-teal-dim border-teal/30'
                    : fileState.status === 'error'
                    ? 'bg-surface-2 border-node-finding/30'
                    : 'bg-surface-2 border-border'
                }`}
              >
                {/* Icon */}
                <div className="flex-shrink-0">
                  {fileState.status === 'uploading' ? (
                    <Loader2 className="w-5 h-5 text-teal animate-spin" />
                  ) : fileState.status === 'success' ? (
                    <CheckCircle className="w-5 h-5 text-teal" />
                  ) : fileState.status === 'error' ? (
                    <XCircle className="w-5 h-5 text-node-finding" />
                  ) : (
                    <FileText className="w-5 h-5 text-text-tertiary" />
                  )}
                </div>

                {/* File Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">
                    {fileState.file.name}
                  </p>
                  <p className="text-xs text-text-tertiary">
                    {fileState.message || `${(fileState.file.size / 1024 / 1024).toFixed(2)} MB`}
                  </p>
                </div>

                {/* Remove Button */}
                {fileState.status !== 'uploading' && (
                  <button
                    onClick={() => removeFile(fileState.file)}
                    className="p-1 text-text-tertiary hover:text-text-secondary"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Help Text */}
      <div className="flex items-start gap-2 p-3 bg-surface-2 rounded">
        <AlertCircle className="w-4 h-4 text-text-tertiary mt-0.5 flex-shrink-0" />
        <div className="text-xs text-text-tertiary">
          <p className="font-medium">PDF에서 자동 추출되는 정보:</p>
          <ul className="mt-1 space-y-0.5">
            <li>- 제목, 저자, 출판 연도</li>
            <li>- 초록 및 전체 텍스트</li>
            <li>- 주요 개념 (AI 추출)</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
