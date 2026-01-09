'use client';

import { useCallback } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, RefreshCw, WifiOff, ServerCrash, FileQuestion, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';

type ErrorType = 'network' | 'server' | 'notFound' | 'generic' | 'warning';

interface ErrorDisplayProps {
  error?: Error | string | null;
  title?: string;
  message?: string;
  type?: ErrorType;
  onRetry?: () => void;
  compact?: boolean;
  className?: string;
}

const errorConfig: Record<ErrorType, { 
  icon: typeof AlertCircle; 
  defaultTitle: string; 
  defaultMessage: string;
  colors: {
    bg: string;
    border: string;
    icon: string;
    title: string;
    text: string;
    button: string;
  };
}> = {
  network: {
    icon: WifiOff,
    defaultTitle: 'Connection Error',
    defaultMessage: 'Unable to connect to the server. Please check your internet connection and try again.',
    colors: {
      bg: 'bg-rose-50 dark:bg-rose-950/30',
      border: 'border-rose-200 dark:border-rose-800/50',
      icon: 'text-rose-500 dark:text-rose-400',
      title: 'text-rose-900 dark:text-rose-100',
      text: 'text-rose-700 dark:text-rose-300',
      button: 'bg-rose-600 hover:bg-rose-700',
    },
  },
  server: {
    icon: ServerCrash,
    defaultTitle: 'Server Error',
    defaultMessage: 'Something went wrong on our end. Please try again in a few moments.',
    colors: {
      bg: 'bg-orange-50 dark:bg-orange-950/30',
      border: 'border-orange-200 dark:border-orange-800/50',
      icon: 'text-orange-500 dark:text-orange-400',
      title: 'text-orange-900 dark:text-orange-100',
      text: 'text-orange-700 dark:text-orange-300',
      button: 'bg-orange-600 hover:bg-orange-700',
    },
  },
  notFound: {
    icon: FileQuestion,
    defaultTitle: 'Not Found',
    defaultMessage: 'The requested resource could not be found.',
    colors: {
      bg: 'bg-slate-50 dark:bg-slate-900/50',
      border: 'border-slate-200 dark:border-slate-700',
      icon: 'text-slate-500 dark:text-slate-400',
      title: 'text-slate-900 dark:text-slate-100',
      text: 'text-slate-600 dark:text-slate-400',
      button: 'bg-slate-600 hover:bg-slate-700',
    },
  },
  warning: {
    icon: AlertTriangle,
    defaultTitle: 'Warning',
    defaultMessage: 'Please review the information and try again.',
    colors: {
      bg: 'bg-amber-50 dark:bg-amber-950/30',
      border: 'border-amber-200 dark:border-amber-800/50',
      icon: 'text-amber-500 dark:text-amber-400',
      title: 'text-amber-900 dark:text-amber-100',
      text: 'text-amber-700 dark:text-amber-300',
      button: 'bg-amber-600 hover:bg-amber-700',
    },
  },
  generic: {
    icon: AlertCircle,
    defaultTitle: 'Something Went Wrong',
    defaultMessage: 'An unexpected error occurred. Please try again.',
    colors: {
      bg: 'bg-red-50 dark:bg-red-950/30',
      border: 'border-red-200 dark:border-red-800/50',
      icon: 'text-red-500 dark:text-red-400',
      title: 'text-red-900 dark:text-red-100',
      text: 'text-red-700 dark:text-red-300',
      button: 'bg-red-600 hover:bg-red-700',
    },
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
  className,
}: ErrorDisplayProps) {
  const errorType = type || getErrorType(error);
  const config = errorConfig[errorType];
  const Icon = config.icon;
  const { colors } = config;

  const displayTitle = title || config.defaultTitle;
  const displayMessage = message || (typeof error === 'string' ? error : error?.message) || config.defaultMessage;

  const handleRetry = useCallback(() => {
    if (onRetry) {
      onRetry();
    }
  }, [onRetry]);

  if (compact) {
    return (
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className={clsx(
          "flex items-center gap-3 p-4 rounded-xl border",
          colors.bg,
          colors.border,
          className
        )}
      >
        <div className={clsx("p-2 rounded-lg", colors.bg)}>
          <Icon className={clsx("w-5 h-5", colors.icon)} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={clsx("text-sm font-medium", colors.title)}>{displayTitle}</p>
          <p className={clsx("text-sm truncate", colors.text)}>{displayMessage}</p>
        </div>
        {onRetry && (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleRetry}
            className={clsx(
              "flex-shrink-0 p-2 rounded-lg transition-colors",
              colors.icon,
              "hover:bg-white/50 dark:hover:bg-slate-800/50"
            )}
            aria-label="Retry"
          >
            <RefreshCw className="w-4 h-4" />
          </motion.button>
        )}
      </motion.div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={clsx(
        "flex flex-col items-center justify-center p-8 text-center",
        "glass rounded-2xl",
        className
      )}
    >
      <motion.div 
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring' as const, stiffness: 300, damping: 20, delay: 0.1 }}
        className={clsx(
          "p-4 rounded-2xl mb-4",
          colors.bg
        )}
      >
        <Icon className={clsx("w-10 h-10", colors.icon)} />
      </motion.div>
      <motion.h3 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className={clsx("text-xl font-semibold mb-2", colors.title)}
      >
        {displayTitle}
      </motion.h3>
      <motion.p 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className={clsx("mb-6 max-w-md", colors.text)}
      >
        {displayMessage}
      </motion.p>
      {onRetry && (
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleRetry}
          className={clsx(
            "flex items-center gap-2 px-6 py-3 rounded-xl text-white font-medium",
            "shadow-lg transition-all",
            colors.button
          )}
        >
          <RefreshCw className="w-4 h-4" />
          Try Again
        </motion.button>
      )}
    </motion.div>
  );
}

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
  className?: string;
}

export function LoadingSpinner({ size = 'md', text, className }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-10 h-10',
    lg: 'w-16 h-16',
  };

  return (
    <div className={clsx("flex flex-col items-center justify-center gap-4", className)}>
      <div className="relative">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className={clsx(
            sizeClasses[size],
            "rounded-full border-4 border-primary-200 dark:border-primary-900 border-t-primary-500"
          )}
        />
        <div className={clsx(
          "absolute inset-0 rounded-full",
          "bg-gradient-to-r from-primary-500/20 to-transparent",
          "animate-pulse"
        )} />
      </div>
      {text && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-sm font-medium text-slate-600 dark:text-slate-400"
        >
          {text}
        </motion.p>
      )}
    </div>
  );
}

interface ProgressBarProps {
  progress: number;
  showPercentage?: boolean;
  className?: string;
  label?: string;
}

export function ProgressBar({ progress, showPercentage = true, className, label }: ProgressBarProps) {
  const clampedProgress = Math.min(100, Math.max(0, progress));

  return (
    <div className={clsx("w-full", className)}>
      {(label || showPercentage) && (
        <div className="flex justify-between items-center mb-2">
          {label && (
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {label}
            </span>
          )}
          {showPercentage && (
            <span className="text-sm font-mono text-slate-500 dark:text-slate-400">
              {Math.round(clampedProgress)}%
            </span>
          )}
        </div>
      )}
      <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${clampedProgress}%` }}
          transition={{ duration: 0.3 }}
          className="h-full rounded-full bg-gradient-to-r from-primary-500 to-primary-600"
        />
      </div>
    </div>
  );
}
