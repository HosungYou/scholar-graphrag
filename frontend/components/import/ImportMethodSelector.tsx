'use client';

import React from 'react';
import { FileText, BookOpen, FolderOpen } from 'lucide-react';

export type ImportMethod = 'pdf' | 'zotero' | 'scholarag' | null;

interface ImportMethodSelectorProps {
  selectedMethod: ImportMethod;
  onSelectMethod: (method: ImportMethod) => void;
  translations: {
    selectMethod: string;
    pdf: { title: string; description: string };
    zotero: { title: string; description: string };
    scholarag: { title: string; description: string };
  };
}

const methods = [
  { id: 'pdf' as const, Icon: FileText },
  { id: 'zotero' as const, Icon: BookOpen },
  { id: 'scholarag' as const, Icon: FolderOpen },
];

export function ImportMethodSelector({
  selectedMethod,
  onSelectMethod,
  translations,
}: ImportMethodSelectorProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-ink">
        {translations.selectMethod}
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {methods.map(({ id, Icon }) => (
          <button
            key={id}
            onClick={() => onSelectMethod(id)}
            className={`
              p-6 rounded-lg border-2 transition-all
              ${selectedMethod === id
                ? 'border-accent-teal bg-accent-teal/10'
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
              }
            `}
            aria-pressed={selectedMethod === id}
          >
            <Icon className="w-8 h-8 mb-3 text-accent-teal" />
            <h3 className="font-medium text-ink">
              {translations[id].title}
            </h3>
            <p className="text-sm text-muted mt-1">
              {translations[id].description}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
