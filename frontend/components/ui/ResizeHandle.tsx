'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { GripVertical } from 'lucide-react';

interface ResizeHandleProps {
  onResize: (width: number) => void;
  minWidth?: number;
  maxWidth?: number;
  currentWidth: number;
  containerRef?: React.RefObject<HTMLElement | null>;
}

export function ResizeHandle({
  onResize,
  minWidth = 300,
  maxWidth = 800,
  currentWidth,
  containerRef,
}: ResizeHandleProps) {
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(currentWidth);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    startXRef.current = e.clientX;
    startWidthRef.current = currentWidth;
  }, [currentWidth]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;

    const container = containerRef?.current || document.body;
    const containerRect = container.getBoundingClientRect();
    const deltaX = e.clientX - startXRef.current;
    let newWidth = startWidthRef.current + deltaX;

    // Clamp to min/max
    newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));

    // Also clamp to percentage of container (max 70%)
    const maxPercentage = containerRect.width * 0.7;
    newWidth = Math.min(newWidth, maxPercentage);

    onResize(newWidth);
  }, [isDragging, minWidth, maxWidth, onResize, containerRef]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  return (
    <div
      onMouseDown={handleMouseDown}
      className={`
        w-1.5 flex-shrink-0 cursor-col-resize
        flex items-center justify-center
        bg-ink/5 dark:bg-paper/5
        hover:bg-accent-teal/20 dark:hover:bg-accent-teal/20
        transition-colors group
        ${isDragging ? 'bg-accent-teal/30' : ''}
      `}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panel"
    >
      <GripVertical
        className={`
          w-3 h-6 text-muted/40
          group-hover:text-accent-teal
          transition-colors
          ${isDragging ? 'text-accent-teal' : ''}
        `}
      />
    </div>
  );
}
