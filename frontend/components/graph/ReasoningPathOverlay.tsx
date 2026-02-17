'use client';

import { useMemo, useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { TraversalPathRenderer, type PathNode } from '@/lib/TraversalPathRenderer';
import type { GraphEntity } from '@/types';

interface ReasoningPathOverlayProps {
  traceNodeIds: string[];
  nodes: GraphEntity[];
  onClose: () => void;
  onNodeClick?: (nodeId: string) => void;
}

/**
 * ReasoningPathOverlay - Shows retrieval path from chat query
 *
 * Features:
 * - Gold (#FFD700) highlight ring + sequence number badge on path nodes
 * - Non-path nodes dimmed to opacity 0.15
 * - Bottom timeline bar showing step-by-step traversal
 * - Sequential animation with 300ms delay between nodes
 */
export function ReasoningPathOverlay({
  traceNodeIds,
  nodes,
  onClose,
  onNodeClick,
}: ReasoningPathOverlayProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(true);

  // Compute path data using TraversalPathRenderer
  const pathData = useMemo(() => {
    const renderer = new TraversalPathRenderer(traceNodeIds, nodes, []);
    return renderer.computePathData();
  }, [traceNodeIds, nodes]);

  const { orderedPathNodes } = pathData;

  // Sequential animation effect
  useEffect(() => {
    if (!isAnimating || currentStepIndex >= orderedPathNodes.length - 1) {
      setIsAnimating(false);
      return;
    }

    const timer = setTimeout(() => {
      setCurrentStepIndex(prev => prev + 1);
    }, 300);

    return () => clearTimeout(timer);
  }, [currentStepIndex, isAnimating, orderedPathNodes.length]);

  const handlePrevious = () => {
    setIsAnimating(false);
    setCurrentStepIndex(Math.max(0, currentStepIndex - 1));
  };

  const handleNext = () => {
    setIsAnimating(false);
    setCurrentStepIndex(Math.min(orderedPathNodes.length - 1, currentStepIndex + 1));
  };

  const handleStepClick = (index: number) => {
    setIsAnimating(false);
    setCurrentStepIndex(index);
    if (onNodeClick) {
      onNodeClick(orderedPathNodes[index].id);
    }
  };

  const handleReplay = () => {
    setCurrentStepIndex(0);
    setIsAnimating(true);
  };

  if (orderedPathNodes.length === 0) {
    return null;
  }

  const currentNode = orderedPathNodes[currentStepIndex];
  const visibleSteps = orderedPathNodes.slice(0, currentStepIndex + 1);

  return (
    <>
      {/* Overlay backdrop - semi-transparent */}
      <div className="absolute inset-0 bg-black/20 pointer-events-none z-30" />

      {/* Bottom Timeline Bar */}
      <div className="absolute bottom-0 left-0 right-0 bg-zinc-900/95 backdrop-blur-sm border-t border-zinc-700/50 z-40">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-700/50">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span className="font-mono text-xs uppercase tracking-wider text-zinc-100">
              Reasoning Path
            </span>
            <span className="px-1.5 py-0.5 bg-amber-400/20 text-amber-400 font-mono text-[10px] rounded">
              {currentStepIndex + 1} / {orderedPathNodes.length}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Replay button */}
            {!isAnimating && currentStepIndex === orderedPathNodes.length - 1 && (
              <button
                onClick={handleReplay}
                className="px-2 py-1 bg-amber-400/10 hover:bg-amber-400/20 text-amber-400 font-mono text-xs transition-colors rounded"
              >
                Replay
              </button>
            )}

            {/* Close button */}
            <button
              onClick={onClose}
              className="p-1 hover:bg-zinc-800 rounded transition-colors"
              title="Close path overlay"
            >
              <X className="w-4 h-4 text-zinc-400" />
            </button>
          </div>
        </div>

        {/* Timeline Steps */}
        <div className="px-4 py-3">
          <div className="flex items-center gap-2 mb-3">
            {/* Previous button */}
            <button
              onClick={handlePrevious}
              disabled={currentStepIndex === 0}
              className="p-1 hover:bg-zinc-800 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Previous step"
            >
              <ChevronLeft className="w-4 h-4 text-zinc-400" />
            </button>

            {/* Timeline steps */}
            <div className="flex-1 flex items-center gap-2 overflow-x-auto">
              {orderedPathNodes.map((node, index) => {
                const isActive = index === currentStepIndex;
                const isVisited = index <= currentStepIndex;
                const isClickable = index <= currentStepIndex;

                return (
                  <button
                    key={node.id}
                    onClick={() => isClickable && handleStepClick(index)}
                    disabled={!isClickable}
                    className={`flex-shrink-0 group relative transition-all ${
                      isClickable ? 'cursor-pointer' : 'cursor-default'
                    }`}
                  >
                    {/* Sequence number badge */}
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center font-mono text-xs transition-all ${
                        isActive
                          ? 'bg-amber-400 text-zinc-900 scale-110'
                          : isVisited
                          ? 'bg-amber-400/30 text-amber-400'
                          : 'bg-zinc-800 text-zinc-600'
                      }`}
                    >
                      {node.sequenceIndex}
                    </div>

                    {/* Connecting line */}
                    {index < orderedPathNodes.length - 1 && (
                      <div
                        className={`absolute top-1/2 left-full w-8 h-0.5 -translate-y-1/2 transition-colors ${
                          isVisited ? 'bg-amber-400/30' : 'bg-zinc-800'
                        }`}
                      />
                    )}

                    {/* Tooltip on hover */}
                    {isClickable && (
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                        <p className="text-xs text-zinc-100 font-mono">
                          {node.name}
                        </p>
                        <p className="text-[10px] text-zinc-400">
                          {node.entity_type}
                        </p>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Next button */}
            <button
              onClick={handleNext}
              disabled={currentStepIndex === orderedPathNodes.length - 1}
              className="p-1 hover:bg-zinc-800 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Next step"
            >
              <ChevronRight className="w-4 h-4 text-zinc-400" />
            </button>
          </div>

          {/* Current node details */}
          <div className="px-3 py-2 bg-zinc-800/50 border-l-2 border-amber-400">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-zinc-100 font-medium">
                  {currentNode.name}
                </p>
                <p className="text-xs text-zinc-400 font-mono mt-0.5">
                  {currentNode.entity_type}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-zinc-400 font-mono">
                  Step {currentNode.sequenceIndex}
                </p>
                {currentNode.position && (
                  <p className="text-[10px] text-zinc-500 font-mono">
                    ({currentNode.position.x.toFixed(1)}, {currentNode.position.y.toFixed(1)}, {currentNode.position.z.toFixed(1)})
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CSS for gold highlight rings on path nodes - injected via style tag */}
      <style jsx global>{`
        .reasoning-path-node {
          filter: drop-shadow(0 0 8px rgba(255, 215, 0, 0.6));
        }

        .reasoning-path-node-sequence-badge {
          position: absolute;
          top: -8px;
          right: -8px;
          width: 20px;
          height: 20px;
          background: #FFD700;
          color: #000;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          font-weight: bold;
          font-family: monospace;
          z-index: 10;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
        }

        .reasoning-path-dimmed {
          opacity: 0.15 !important;
        }
      `}</style>
    </>
  );
}

export default ReasoningPathOverlay;
