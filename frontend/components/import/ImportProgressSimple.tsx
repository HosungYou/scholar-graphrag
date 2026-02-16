'use client';

import React from 'react';
import { Loader2, Check } from 'lucide-react';

export type ImportStage = 'analyzing' | 'extracting' | 'building' | 'complete';

interface ImportProgressSimpleProps {
  stage: ImportStage;
  progress: number; // 0-100
  translations: {
    analyzing: string;
    extracting: string;
    building: string;
    complete: string;
  };
}

const stages: ImportStage[] = ['analyzing', 'extracting', 'building', 'complete'];

export function ImportProgressSimple({
  stage,
  progress,
  translations,
}: ImportProgressSimpleProps) {
  const currentIndex = stages.indexOf(stage);

  return (
    <div className="space-y-6" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
      {/* Progress bar */}
      <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-accent-teal transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Stage indicators */}
      <div className="flex justify-between">
        {stages.map((s, index) => {
          const isComplete = index < currentIndex || (index === currentIndex && stage === 'complete');
          const isCurrent = index === currentIndex && stage !== 'complete';

          return (
            <div key={s} className="flex flex-col items-center gap-2">
              <div
                className={`
                  w-8 h-8 rounded-full flex items-center justify-center
                  ${isComplete
                    ? 'bg-green-500 text-white'
                    : isCurrent
                    ? 'bg-accent-teal text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-muted'
                  }
                `}
              >
                {isComplete ? (
                  <Check className="w-5 h-5" />
                ) : isCurrent ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <span className="text-sm">{index + 1}</span>
                )}
              </div>
              <span className={`text-xs ${isCurrent ? 'text-ink font-medium' : 'text-muted'}`}>
                {translations[s]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
