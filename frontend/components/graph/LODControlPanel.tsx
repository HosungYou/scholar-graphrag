'use client';

import { useState } from 'react';
import { useGraph3DStore } from '@/hooks/useGraph3DStore';
import { useGraphStore } from '@/hooks/useGraphStore';
import { Layers, ChevronDown, ChevronUp, Eye, EyeOff } from 'lucide-react';

const LOD_LEVELS = [
  { label: 'All', threshold: 0, percentile: 0 },
  { label: 'Important', threshold: 0.25, percentile: 25 },
  { label: 'Key', threshold: 0.50, percentile: 50 },
  { label: 'Hub', threshold: 0.75, percentile: 75 },
] as const;

interface LODControlPanelProps {
  onClose?: () => void;
}

export function LODControlPanel({ onClose }: LODControlPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [paperCountThreshold, setPaperCountThreshold] = useState(0);
  const [showPaperCountFilter, setShowPaperCountFilter] = useState(false);

  const { view3D, lodConfig, centrality, getVisiblePercentage } = useGraph3DStore();
  const { graphData } = useGraphStore();

  // Calculate current LOD level based on visible percentage
  const visiblePercentage = getVisiblePercentage();
  const currentLevelIndex = LOD_LEVELS.findIndex(
    (level) => visiblePercentage >= 1.0 - level.threshold
  );
  const currentLevel = currentLevelIndex >= 0 ? currentLevelIndex : 0;

  // Calculate hidden nodes count
  const totalNodes = graphData?.nodes.length || 0;
  const visibleNodes = Math.ceil(totalNodes * visiblePercentage);
  const hiddenNodes = totalNodes - visibleNodes;

  // Calculate nodes filtered by paper_count
  const paperCountFilteredNodes = graphData?.nodes.filter((node) => {
    const paperCount = (node.properties as { paper_count?: number }).paper_count;
    return paperCount && paperCount < paperCountThreshold;
  }).length || 0;

  const handleLevelChange = (levelIndex: number) => {
    const level = LOD_LEVELS[levelIndex];
    // Update LOD config threshold
    useGraph3DStore.setState((state) => ({
      lodConfig: {
        ...state.lodConfig,
        thresholds: {
          ...state.lodConfig.thresholds,
          high: level.threshold,
        },
      },
      view3D: {
        ...state.view3D,
        lodEnabled: levelIndex > 0,
      },
    }));
  };

  const handlePaperCountChange = (value: number) => {
    setPaperCountThreshold(value);
    // Apply filter to graph store
    if (value > 0) {
      useGraphStore.setState((state) => ({
        filters: {
          ...state.filters,
          // Custom filter for paper_count (would need backend support for full implementation)
        },
      }));
    }
  };

  return (
    <div className="bg-zinc-900/90 backdrop-blur-sm border border-zinc-700/50 w-80">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3 py-2.5 flex items-center justify-between hover:bg-zinc-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-accent-teal" />
          <span className="font-mono text-xs uppercase tracking-wider text-zinc-100">
            LOD Control
          </span>
          {hiddenNodes > 0 && (
            <span className="px-1.5 py-0.5 bg-accent-amber/20 text-accent-amber font-mono text-[10px] rounded">
              {hiddenNodes} hidden
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-zinc-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-zinc-400" />
        )}
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-4">
          {/* LOD Level Slider */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">
                Detail Level
              </p>
              <span className="font-mono text-sm text-accent-teal">
                {LOD_LEVELS[currentLevel].label}
              </span>
            </div>

            {/* 4-step slider */}
            <div className="relative">
              <input
                type="range"
                min={0}
                max={3}
                step={1}
                value={currentLevel}
                onChange={(e) => handleLevelChange(parseInt(e.target.value))}
                className="w-full h-2 bg-zinc-800 rounded-none appearance-none cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                  [&::-webkit-slider-thumb]:bg-accent-teal [&::-webkit-slider-thumb]:rounded-none
                  [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:cursor-pointer"
              />
              {/* Step markers */}
              <div className="flex justify-between mt-1">
                {LOD_LEVELS.map((level, index) => (
                  <button
                    key={level.label}
                    onClick={() => handleLevelChange(index)}
                    className={`flex flex-col items-center cursor-pointer group`}
                  >
                    <div
                      className={`w-1 h-1 rounded-full transition-colors ${
                        index <= currentLevel ? 'bg-accent-teal' : 'bg-zinc-600'
                      }`}
                    />
                    <span
                      className={`text-[9px] font-mono mt-0.5 transition-colors ${
                        index === currentLevel
                          ? 'text-accent-teal'
                          : 'text-zinc-500 group-hover:text-zinc-400'
                      }`}
                    >
                      {level.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Description */}
            <p className="text-[10px] text-zinc-400 mt-2">
              {currentLevel === 0 && 'Show all nodes in the graph'}
              {currentLevel === 1 && 'Show nodes with centrality > 25th percentile'}
              {currentLevel === 2 && 'Show nodes with centrality > 50th percentile'}
              {currentLevel === 3 && 'Show only hub nodes (centrality > 75th percentile)'}
            </p>
          </div>

          {/* Node Count Badge */}
          <div className="px-2 py-1.5 bg-zinc-800/50 border-l-2 border-accent-teal">
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-400 font-mono">Visible Nodes</span>
              <span className="text-sm text-zinc-100 font-mono">
                {visibleNodes} / {totalNodes}
              </span>
            </div>
            {hiddenNodes > 0 && (
              <p className="text-[10px] text-zinc-500 mt-0.5">
                {((visibleNodes / totalNodes) * 100).toFixed(0)}% shown
              </p>
            )}
          </div>

          {/* Optional paper_count threshold */}
          <div className="pt-3 border-t border-zinc-700/50">
            <div className="flex items-center justify-between mb-2">
              <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">
                Paper Count Filter
              </p>
              <button
                onClick={() => setShowPaperCountFilter(!showPaperCountFilter)}
                className="p-1 hover:bg-zinc-800/50 rounded transition-colors"
                title={showPaperCountFilter ? 'Hide filter' : 'Show filter'}
              >
                {showPaperCountFilter ? (
                  <Eye className="w-3 h-3 text-accent-teal" />
                ) : (
                  <EyeOff className="w-3 h-3 text-zinc-500" />
                )}
              </button>
            </div>

            {showPaperCountFilter && (
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs text-zinc-400 font-mono">Min Papers</span>
                  <span className="text-sm text-accent-teal font-mono">
                    {paperCountThreshold}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={20}
                  step={1}
                  value={paperCountThreshold}
                  onChange={(e) => handlePaperCountChange(parseInt(e.target.value))}
                  className="w-full h-2 bg-zinc-800 rounded-none appearance-none cursor-pointer
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                    [&::-webkit-slider-thumb]:bg-accent-teal [&::-webkit-slider-thumb]:rounded-none
                    [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-zinc-500 mt-1">
                  <span>0</span>
                  <span>20</span>
                </div>
                {paperCountFilteredNodes > 0 && paperCountThreshold > 0 && (
                  <p className="text-[10px] text-zinc-500 mt-2">
                    Would hide {paperCountFilteredNodes} low-frequency concepts
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default LODControlPanel;
