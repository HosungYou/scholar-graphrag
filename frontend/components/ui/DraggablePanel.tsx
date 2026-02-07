'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

interface DraggablePanelProps {
  /** Unique key for localStorage persistence */
  panelId: string;
  /** Optional project ID for per-project position persistence */
  projectId?: string;
  /** Default position if no saved position exists */
  defaultPosition: { x: number; y: number };
  /** Panel content */
  children: ReactNode;
  /** Additional className for the outer wrapper */
  className?: string;
  /** z-index for layering */
  zIndex?: number;
}

// v0.14.0: Global z-index counter for bring-to-front behavior
let globalMaxZ = 20;

function getStorageKey(panelId: string, projectId?: string): string {
  return projectId ? `panel-pos-${projectId}-${panelId}` : `panel-pos-${panelId}`;
}

export function DraggablePanel({
  panelId,
  projectId,
  defaultPosition,
  children,
  className = '',
  zIndex = 20,
}: DraggablePanelProps) {
  const [position, setPosition] = useState(defaultPosition);
  const [isDragging, setIsDragging] = useState(false);
  const [currentZ, setCurrentZ] = useState(zIndex);
  const dragOffset = useRef({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  const bringToFront = useCallback(() => {
    globalMaxZ += 1;
    setCurrentZ(globalMaxZ);
  }, []);

  // Load saved position from localStorage
  useEffect(() => {
    try {
      const key = getStorageKey(panelId, projectId);
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
          // Validate position is within viewport
          const maxX = window.innerWidth - 100;
          const maxY = window.innerHeight - 50;
          setPosition({
            x: Math.max(0, Math.min(parsed.x, maxX)),
            y: Math.max(0, Math.min(parsed.y, maxY)),
          });
        }
      }
    } catch {
      // Ignore localStorage errors
    }
  }, [panelId, projectId]);

  // Save position to localStorage
  const savePosition = useCallback(
    (pos: { x: number; y: number }) => {
      try {
        const key = getStorageKey(panelId, projectId);
        localStorage.setItem(key, JSON.stringify(pos));
      } catch {
        // Ignore localStorage errors
      }
    },
    [panelId, projectId]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Drag from handle or any header element (data-drag-handle or data-drag-header)
      const target = e.target as HTMLElement;
      if (!target.closest('[data-drag-handle]') && !target.closest('[data-drag-header]')) return;

      e.preventDefault();
      setIsDragging(true);
      dragOffset.current = {
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      };
    },
    [position]
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newX = e.clientX - dragOffset.current.x;
      const newY = e.clientY - dragOffset.current.y;

      // Clamp to viewport bounds
      const maxX = window.innerWidth - (panelRef.current?.offsetWidth || 200);
      const maxY = window.innerHeight - 50;

      const clampedPos = {
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY)),
      };

      setPosition(clampedPos);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      savePosition(position);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, savePosition, position]);

  return (
    <div
      ref={panelRef}
      className={`absolute ${className}`}
      onMouseDown={(e) => {
        bringToFront();
        handleMouseDown(e);
      }}
      style={{
        left: position.x,
        top: position.y,
        zIndex: currentZ,
        cursor: isDragging ? 'grabbing' : undefined,
        userSelect: isDragging ? 'none' : undefined,
      }}
    >
      {children}
    </div>
  );
}

/** Drag handle bar to add at the top of panels */
export function DragHandle({ className = '' }: { className?: string }) {
  return (
    <div
      data-drag-handle
      className={`flex items-center justify-center py-1.5 cursor-grab active:cursor-grabbing hover:bg-ink/5 dark:hover:bg-paper/5 transition-colors ${className}`}
      title="Drag to move panel"
    >
      <div className="w-12 h-1.5 rounded-full bg-ink/30 dark:bg-paper/30 hover:bg-ink/50 dark:hover:bg-paper/50 transition-colors" />
    </div>
  );
}
