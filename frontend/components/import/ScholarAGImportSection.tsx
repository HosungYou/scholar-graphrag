'use client';

import React from 'react';
import { FolderOpen } from 'lucide-react';

interface ScholarAGImportSectionProps {
  onSelectFolder: () => void;
  selectedPath: string | null;
  translations: {
    title: string;
    description: string;
    selectFolder: string;
  };
}

export function ScholarAGImportSection({
  onSelectFolder,
  selectedPath,
  translations,
}: ScholarAGImportSectionProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium text-ink">{translations.title}</h3>
      <p className="text-muted">{translations.description}</p>

      <div className="flex items-center gap-4">
        <button
          onClick={onSelectFolder}
          className="flex items-center gap-2 px-4 py-2 bg-surface border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          <FolderOpen className="w-5 h-5" />
          {translations.selectFolder}
        </button>

        {selectedPath && (
          <span className="text-sm text-muted truncate max-w-xs">
            {selectedPath}
          </span>
        )}
      </div>
    </div>
  );
}
