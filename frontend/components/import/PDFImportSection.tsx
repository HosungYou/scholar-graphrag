'use client';

import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload } from 'lucide-react';

interface PDFImportSectionProps {
  onFilesSelected: (files: File[]) => void;
  translations: {
    title: string;
    description: string;
    dropzone: string;
  };
}

export function PDFImportSection({
  onFilesSelected,
  translations,
}: PDFImportSectionProps) {
  const onDrop = useCallback((acceptedFiles: File[]) => {
    const pdfFiles = acceptedFiles.filter(
      file => file.type === 'application/pdf'
    );
    if (pdfFiles.length > 0) {
      onFilesSelected(pdfFiles);
    }
  }, [onFilesSelected]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    multiple: true,
  });

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium text-ink">{translations.title}</h3>
      <p className="text-muted">{translations.description}</p>

      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-lg p-12 text-center cursor-pointer
          transition-colors
          ${isDragActive
            ? 'border-accent-teal bg-accent-teal/5'
            : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'
          }
        `}
        role="button"
        aria-label={translations.dropzone}
      >
        <input {...getInputProps()} />
        <Upload className="w-12 h-12 mx-auto mb-4 text-muted" />
        <p className="text-muted">{translations.dropzone}</p>
      </div>
    </div>
  );
}
