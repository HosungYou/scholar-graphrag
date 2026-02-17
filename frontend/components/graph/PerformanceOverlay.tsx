'use client';

import { useState, useEffect, useRef } from 'react';
import { Activity } from 'lucide-react';

interface PerformanceOverlayProps {
  nodeCount: number;
  edgeCount: number;
}

/**
 * PerformanceOverlay - FPS counter and graph stats
 *
 * Features:
 * - FPS counter using requestAnimationFrame timing
 * - Node and edge counts from graph data
 * - Semi-transparent dark background, monospace font
 * - Position: bottom-right corner
 * - Toggle: P key keyboard shortcut (handled by parent)
 */
export function PerformanceOverlay({ nodeCount, edgeCount }: PerformanceOverlayProps) {
  const [fps, setFps] = useState(60);
  const frameCountRef = useRef(0);
  const lastTimeRef = useRef(performance.now());
  const animationFrameRef = useRef<number>();

  useEffect(() => {
    // FPS calculation using requestAnimationFrame
    const calculateFPS = () => {
      frameCountRef.current++;
      const currentTime = performance.now();
      const elapsed = currentTime - lastTimeRef.current;

      // Update FPS every second
      if (elapsed >= 1000) {
        const currentFPS = Math.round((frameCountRef.current * 1000) / elapsed);
        setFps(currentFPS);
        frameCountRef.current = 0;
        lastTimeRef.current = currentTime;
      }

      animationFrameRef.current = requestAnimationFrame(calculateFPS);
    };

    animationFrameRef.current = requestAnimationFrame(calculateFPS);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // FPS color coding
  const fpsColor = fps >= 55 ? 'text-green-400' : fps >= 30 ? 'text-amber-400' : 'text-red-400';

  return (
    <div className="absolute bottom-4 right-4 bg-zinc-900/80 backdrop-blur-sm border border-zinc-700/50 px-3 py-2 z-20">
      <div className="flex items-center gap-2 mb-2">
        <Activity className="w-4 h-4 text-accent-teal" />
        <span className="font-mono text-xs uppercase tracking-wider text-zinc-100">
          Performance
        </span>
      </div>

      <div className="space-y-1.5">
        {/* FPS */}
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs text-zinc-400 font-mono">FPS</span>
          <span className={`text-sm font-mono font-bold ${fpsColor}`}>
            {fps}
          </span>
        </div>

        {/* Node Count */}
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs text-zinc-400 font-mono">Nodes</span>
          <span className="text-sm text-zinc-100 font-mono">
            {nodeCount.toLocaleString()}
          </span>
        </div>

        {/* Edge Count */}
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs text-zinc-400 font-mono">Edges</span>
          <span className="text-sm text-zinc-100 font-mono">
            {edgeCount.toLocaleString()}
          </span>
        </div>

        {/* Ratio */}
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs text-zinc-400 font-mono">Ratio</span>
          <span className="text-xs text-zinc-500 font-mono">
            {nodeCount > 0 ? (edgeCount / nodeCount).toFixed(2) : '0.00'}
          </span>
        </div>
      </div>

      {/* Hint */}
      <div className="mt-2 pt-2 border-t border-zinc-700/50">
        <p className="text-[10px] text-zinc-500 font-mono">
          Press <kbd className="px-1 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-zinc-400">P</kbd> to toggle
        </p>
      </div>
    </div>
  );
}

export default PerformanceOverlay;
