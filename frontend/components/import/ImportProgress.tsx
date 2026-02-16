'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, Circle, Loader2, XCircle, ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import type { ImportJob } from '@/types';

interface ImportProgressProps {
  jobId: string;
  onComplete?: (projectId: string) => void;
  onError?: (error: string) => void;
}

interface StepInfo {
  id: string;
  label: string;
  description: string;
}

const IMPORT_STEPS: StepInfo[] = [
  { id: 'validating', label: 'Validation', description: 'Validating project structure' },
  { id: 'extracting', label: 'Parse Config', description: 'Reading config.yaml' },
  { id: 'processing', label: 'Import Papers', description: 'Importing papers from CSV' },
  { id: 'building_graph', label: 'Build Graph', description: 'Creating entities and relationships' },
  { id: 'completed', label: 'Complete', description: 'Finalizing import' },
];

// Map backend status to step index
function getStepIndexFromStatus(status: string): number {
  const statusToStepMap: Record<string, number> = {
    'pending': 0,
    'validating': 0,
    'extracting': 1,
    'processing': 2,
    'building_graph': 3,
    'completed': 4,
    'failed': -1,
  };
  return statusToStepMap[status] ?? 0;
}

export function ImportProgress({ jobId, onComplete, onError }: ImportProgressProps) {
  const [job, setJob] = useState<ImportJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!jobId) return;

    let intervalId: NodeJS.Timeout;

    const pollStatus = async () => {
      try {
        const status = await api.getImportStatus(jobId);
        setJob(status);

        if (status.status === 'completed' && status.project_id) {
          clearInterval(intervalId);
          onComplete?.(status.project_id);
        } else if (status.status === 'failed') {
          clearInterval(intervalId);
          setError(status.message || 'Import failed');
          onError?.(status.message || 'Import failed');
        }
      } catch (err) {
        console.error('Failed to fetch import status:', err);
      }
    };

    // Initial fetch
    pollStatus();

    // Poll every 2 seconds
    intervalId = setInterval(pollStatus, 2000);

    return () => clearInterval(intervalId);
  }, [jobId, onComplete, onError]);

  if (error) {
    return (
      <div className="bg-surface-2 border border-node-finding/30 rounded p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-surface-2 rounded-full">
            <XCircle className="w-6 h-6 text-node-finding" />
          </div>
          <div>
            <h3 className="font-medium text-node-finding">Import Failed</h3>
            <p className="text-sm text-node-finding">{error}</p>
          </div>
        </div>
        <button
          onClick={() => router.back()}
          className="px-4 py-2 bg-surface-2 text-node-finding rounded hover:bg-surface-3 transition-colors text-sm font-medium"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="bg-surface-1 border border-border rounded p-6">
        <div className="flex items-center justify-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-teal" />
          <span className="text-text-secondary">Initializing import...</span>
        </div>
      </div>
    );
  }

  const currentStepIndex = getStepIndexFromStatus(job.status);
  const isComplete = job.status === 'completed';

  return (
    <div className="bg-surface-1 border border-border rounded overflow-hidden">
      {/* Header */}
      <div className="bg-teal px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium text-white">
              {isComplete ? 'Import Complete!' : 'Importing Project...'}
            </h3>
            <p className="text-white/80 text-sm">
              {isComplete
                ? `Created ${job.stats?.total_entities || 0} entities and ${job.stats?.total_relationships || 0} relationships`
                : job.message || `Step ${currentStepIndex + 1} of ${IMPORT_STEPS.length}`}
            </p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-medium text-white">
              {Math.round(job.progress)}%
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4 h-2 bg-surface-2 rounded-full overflow-hidden">
          <div
            className="h-full bg-white transition-all duration-500 ease-out rounded-full"
            style={{ width: `${job.progress}%` }}
          />
        </div>
      </div>

      {/* Steps */}
      <div className="p-6">
        <div className="space-y-3">
          {IMPORT_STEPS.map((step, index) => {
            const isCurrentStep = index === currentStepIndex && !isComplete;
            const isPastStep = index < currentStepIndex || isComplete;
            const isFutureStep = index > currentStepIndex && !isComplete;

            return (
              <div
                key={step.id}
                className={`flex items-center gap-4 p-3 rounded transition-all ${
                  isCurrentStep
                    ? 'bg-teal-dim border border-teal/30'
                    : isPastStep
                    ? 'bg-teal-dim/50'
                    : 'opacity-50'
                }`}
              >
                {/* Icon */}
                <div className="flex-shrink-0">
                  {isPastStep ? (
                    <div className="w-8 h-8 bg-teal-dim rounded-full flex items-center justify-center">
                      <CheckCircle className="w-5 h-5 text-teal" />
                    </div>
                  ) : isCurrentStep ? (
                    <div className="w-8 h-8 bg-teal-dim rounded-full flex items-center justify-center">
                      <Loader2 className="w-5 h-5 text-teal animate-spin" />
                    </div>
                  ) : (
                    <div className="w-8 h-8 bg-surface-2 rounded-full flex items-center justify-center">
                      <Circle className="w-5 h-5 text-text-tertiary" />
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p
                    className={`font-medium ${
                      isPastStep
                        ? 'text-teal'
                        : isCurrentStep
                        ? 'text-teal'
                        : 'text-text-tertiary'
                    }`}
                  >
                    {step.label}
                  </p>
                  <p
                    className={`text-sm ${
                      isPastStep
                        ? 'text-teal'
                        : isCurrentStep
                        ? 'text-teal'
                        : 'text-text-tertiary'
                    }`}
                  >
                    {step.description}
                  </p>
                </div>

                {/* Status indicator */}
                {isCurrentStep && (
                  <div className="flex-shrink-0">
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-teal-dim text-teal text-xs rounded-full">
                      <span className="w-1.5 h-1.5 bg-teal rounded-full animate-pulse" />
                      In Progress
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Complete action */}
        {isComplete && job.project_id && (
          <div className="mt-6 pt-4 border-t border-border">
            <button
              onClick={() => router.push(`/projects/${job.project_id}`)}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-teal text-white rounded hover:bg-teal/90 transition-all font-medium"
            >
              Open Project
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
