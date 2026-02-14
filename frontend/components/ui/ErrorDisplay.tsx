'use client';

import { AlertCircle, RefreshCw, WifiOff, ServerCrash, FileQuestion } from 'lucide-react';
import { useCallback } from 'react';

type ErrorType = 'network' | 'server' | 'notFound' | 'generic';

interface ErrorDisplayProps {
  error?: Error | string | null;
  title?: string;
  message?: string;
  type?: ErrorType;
  onRetry?: () => void;
  compact?: boolean;
}

const errorConfig: Record<ErrorType, { icon: typeof AlertCircle; defaultTitle: string; defaultMessage: string }> = {
  network: {
    icon: WifiOff,
    defaultTitle: 'Network Error',
    defaultMessage: 'Unable to connect to the server. Please check your internet connection and try again.',
  },
  server: {
    icon: ServerCrash,
    defaultTitle: 'Server Error',
    defaultMessage: 'A server error occurred. Please try again later.',
  },
  notFound: {
    icon: FileQuestion,
    defaultTitle: 'Not Found',
    defaultMessage: 'The requested resource could not be found.',
  },
  generic: {
    icon: AlertCircle,
    defaultTitle: 'An Error Occurred',
    defaultMessage: 'An unexpected error occurred. Please try again.',
  },
};

function getErrorType(error?: Error | string | null): ErrorType {
  if (!error) return 'generic';

  const errorMessage = typeof error === 'string' ? error : error.message;

  if (errorMessage.includes('fetch') || errorMessage.includes('network') || errorMessage.includes('Network')) {
    return 'network';
  }
  if (errorMessage.includes('500') || errorMessage.includes('server')) {
    return 'server';
  }
  if (errorMessage.includes('404') || errorMessage.includes('not found')) {
    return 'notFound';
  }

  return 'generic';
}

export function ErrorDisplay({
  error,
  title,
  message,
  type,
  onRetry,
  compact = false,
}: ErrorDisplayProps) {
  const errorType = type || getErrorType(error);
  const config = errorConfig[errorType];
  const Icon = config.icon;

  const displayTitle = title || config.defaultTitle;
  const displayMessage = message || (typeof error === 'string' ? error : error?.message) || config.defaultMessage;

  const handleRetry = useCallback(() => {
    if (onRetry) {
      onRetry();
    }
  }, [onRetry]);

  if (compact) {
    return (
      <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
        <Icon className="w-5 h-5 text-red-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-red-700 truncate">{displayMessage}</p>
        </div>
        {onRetry && (
          <button
            onClick={handleRetry}
            className="flex-shrink-0 p-1.5 text-red-600 hover:bg-red-100 rounded transition-colors"
            aria-label="Retry"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <div className="p-4 bg-red-100 rounded-full mb-4">
        <Icon className="w-8 h-8 text-red-500" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{displayTitle}</h3>
      <p className="text-gray-600 mb-6 max-w-md">{displayMessage}</p>
      {onRetry && (
        <button
          onClick={handleRetry}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      )}
    </div>
  );
}
