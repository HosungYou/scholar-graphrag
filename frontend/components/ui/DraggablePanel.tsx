'use client';

import React, { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

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

// v0.14.1: Context for reset functionality
const DraggablePanelContext = React.createContext<{ resetPosition?: () => void }>({});

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
  const latestPosition = useRef(defaultPosition);
  const panelRef = useRef<HTMLDivElement>(null);

  const bringToFront = useCallback(() => {
    globalMaxZ += 1;
    setCurrentZ(globalMaxZ);
  }, []);

  // v0.14.1: Reset position to default
  const resetPosition = useCallback(() => {
    setPosition(defaultPosition);
    latestPosition.current = defaultPosition;
    try {
      const key = getStorageKey(panelId, projectId);
      localStorage.removeItem(key);
    } catch {
      // Ignore localStorage errors
    }
  }, [defaultPosition, panelId, projectId]);

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
          const restored = {
            x: Math.max(0, Math.min(parsed.x, maxX)),
            y: Math.max(0, Math.min(parsed.y, maxY)),
          };
          latestPosition.current = restored;
          setPosition(restored);
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
      bringToFront();
      dragOffset.current = {
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      };
    },
    [position, bringToFront]
  );

  // v0.14.1: Touch device support
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-drag-handle]') && !target.closest('[data-drag-header]')) return;

      const touch = e.touches[0];
      setIsDragging(true);
      bringToFront();
      dragOffset.current = {
        x: touch.clientX - position.x,
        y: touch.clientY - position.y,
      };
    },
    [position, bringToFront]
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

      latestPosition.current = clampedPos;
      setPosition(clampedPos);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      savePosition(latestPosition.current);
    };

    // v0.14.1: Touch event handlers
    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault(); // Prevent scrolling while dragging
      const touch = e.touches[0];
      const newX = touch.clientX - dragOffset.current.x;
      const newY = touch.clientY - dragOffset.current.y;

      // Clamp to viewport bounds
      const maxX = window.innerWidth - (panelRef.current?.offsetWidth || 200);
      const maxY = window.innerHeight - 50;

      const clampedPos = {
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY)),
      };

      latestPosition.current = clampedPos;
      setPosition(clampedPos);
    };

    const handleTouchEnd = () => {
      setIsDragging(false);
      savePosition(latestPosition.current);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isDragging, savePosition]);

  return (
    <DraggablePanelContext.Provider value={{ resetPosition }}>
      <div
        ref={panelRef}
        className={`absolute ${className}`}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
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
    </DraggablePanelContext.Provider>
  );
}

/** Hook to access reset position function from within DraggablePanel children */
export function useDraggablePanelReset() {
  return React.useContext(DraggablePanelContext).resetPosition;
}

/** Drag handle bar to add at the top of panels */
export function DragHandle({ className = '' }: { className?: string }) {
  const resetPosition = useDraggablePanelReset();
  const [flashReset, setFlashReset] = useState(false);

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (resetPosition) {
      resetPosition();
      setFlashReset(true);
      setTimeout(() => setFlashReset(false), 300);
    }
  };

  return (
    <div
      data-drag-handle
      className={`flex items-center justify-center py-1.5 cursor-grab active:cursor-grabbing hover:bg-ink/5 dark:hover:bg-paper/5 transition-colors ${className}`}
      title="Drag to move • Double-click to reset"
      onDoubleClick={handleDoubleClick}
    >
      <div
        className={`w-12 h-1.5 rounded-full transition-colors ${
          flashReset
            ? 'bg-accent-teal'
            : 'bg-ink/30 dark:bg-paper/30 hover:bg-ink/50 dark:hover:bg-paper/50'
        }`}
      />
    </div>
  );
}

/** Collapsible content wrapper with smooth height animation */
export function CollapsibleContent({
  isOpen,
  children,
}: {
  isOpen: boolean;
  children: ReactNode;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | 'auto'>('auto');

  useEffect(() => {
    if (contentRef.current) {
      if (isOpen) {
        const h = contentRef.current.scrollHeight;
        setHeight(h);
        // After transition, set to auto for dynamic content
        const timer = setTimeout(() => setHeight('auto'), 300);
        return () => clearTimeout(timer);
      } else {
        // Set explicit height first, then collapse
        setHeight(contentRef.current.scrollHeight);
        requestAnimationFrame(() => setHeight(0));
      }
    }
  }, [isOpen]);

  return (
    <div
      ref={contentRef}
      className="overflow-hidden transition-[height] duration-300 ease-in-out"
      style={{ height: isOpen ? (height === 'auto' ? 'auto' : height) : 0 }}
    >
      {children}
    </div>
  );
}
