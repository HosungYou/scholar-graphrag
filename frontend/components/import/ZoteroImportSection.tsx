'use client';

import React from 'react';
import { BookOpen } from 'lucide-react';

interface ZoteroImportSectionProps {
  onConnect: () => void;
  isConnected: boolean;
  translations: {
    title: string;
    description: string;
    connect: string;
  };
}

export function ZoteroImportSection({
  onConnect,
  isConnected,
  translations,
}: ZoteroImportSectionProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium text-ink">{translations.title}</h3>
      <p className="text-muted">{translations.description}</p>

      <button
        onClick={onConnect}
        disabled={isConnected}
        className={`
          flex items-center gap-2 px-4 py-2 rounded-lg
          ${isConnected
            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
            : 'bg-accent-teal text-white hover:bg-accent-teal/90'
          }
        `}
      >
        <BookOpen className="w-5 h-5" />
        {isConnected ? '✓ Connected' : translations.connect}
      </button>
    </div>
  );
}
