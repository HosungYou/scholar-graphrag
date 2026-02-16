'use client';

import { useEffect, useCallback, useState } from 'react';
import { useGraphStore, ViewMode } from './useGraphStore';

interface UseGraphKeyboardOptions {
  enabled?: boolean;
  onFitView?: () => void;
  onToggleFilter?: () => void;
}

export function useGraphKeyboard({
  enabled = true,
  onFitView,
  onToggleFilter,
}: UseGraphKeyboardOptions = {}) {
  const [showShortcuts, setShowShortcuts] = useState(false);
  const { setViewMode, clearHighlights, setSelectedNode } = useGraphStore();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;

      // Don't handle shortcuts when typing in inputs
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      switch (e.key) {
        case '1':
          setViewMode('concepts');
          break;
        case '2':
          setViewMode('papers');
          break;
        case '3':
          setViewMode('full');
          break;
        case 'r':
        case 'R':
          if (!e.metaKey && !e.ctrlKey) {
            onFitView?.();
          }
          break;
        case 'Escape':
          clearHighlights();
          setSelectedNode(null);
          break;
        case 'f':
        case 'F':
          if (!e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            onToggleFilter?.();
          }
          break;
        case '?':
          setShowShortcuts((prev) => !prev);
          break;
      }
    },
    [enabled, setViewMode, clearHighlights, setSelectedNode, onFitView, onToggleFilter]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return { showShortcuts, setShowShortcuts };
}

export const KEYBOARD_SHORTCUTS = [
  { key: '1', description: 'Concepts view' },
  { key: '2', description: 'Papers view' },
  { key: '3', description: 'All nodes view' },
  { key: 'R', description: 'Reset camera' },
  { key: 'Esc', description: 'Clear selection' },
  { key: 'F', description: 'Toggle filters' },
  { key: '?', description: 'Toggle shortcuts' },
];
