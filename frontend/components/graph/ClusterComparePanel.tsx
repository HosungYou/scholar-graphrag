'use client';

import { useState, useMemo } from 'react';
import { GitCompare, ChevronDown, ChevronUp, X, TrendingUp } from 'lucide-react';
import { useGraphStore } from '@/hooks/useGraphStore';
import type { ConceptCluster } from '@/types';

interface ClusterComparePanelProps {
  onClose?: () => void;
}

interface ClusterComparisonData {
  clusterA: ConceptCluster;
  clusterB: ConceptCluster;
  uniqueToA: string[];
  uniqueToB: string[];
  common: string[];
}

export function ClusterComparePanel({ onClose }: ClusterComparePanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [selectedClusterA, setSelectedClusterA] = useState<number | null>(null);
  const [selectedClusterB, setSelectedClusterB] = useState<number | null>(null);
  const [showComparison, setShowComparison] = useState(false);

  const { clusters } = useGraphStore();

  // Compute comparison data
  const comparisonData = useMemo<ClusterComparisonData | null>(() => {
    if (selectedClusterA === null || selectedClusterB === null) return null;

    const clusterA = clusters.find(c => c.cluster_id === selectedClusterA);
    const clusterB = clusters.find(c => c.cluster_id === selectedClusterB);

    if (!clusterA || !clusterB) return null;

    const setA = new Set(clusterA.concept_names);
    const setB = new Set(clusterB.concept_names);

    const uniqueToA: string[] = [];
    const uniqueToB: string[] = [];
    const common: string[] = [];

    clusterA.concept_names.forEach(name => {
      if (setB.has(name)) {
        common.push(name);
      } else {
        uniqueToA.push(name);
      }
    });

    clusterB.concept_names.forEach(name => {
      if (!setA.has(name)) {
        uniqueToB.push(name);
      }
    });

    return {
      clusterA,
      clusterB,
      uniqueToA,
      uniqueToB,
      common,
    };
  }, [selectedClusterA, selectedClusterB, clusters]);

  const handleCompare = () => {
    if (selectedClusterA !== null && selectedClusterB !== null) {
      setShowComparison(true);
    }
  };

  const handleReset = () => {
    setSelectedClusterA(null);
    setSelectedClusterB(null);
    setShowComparison(false);
  };

  return (
    <div className="bg-zinc-900/90 backdrop-blur-sm border border-zinc-700/50 w-96">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3 py-2.5 flex items-center justify-between hover:bg-zinc-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <GitCompare className="w-4 h-4 text-accent-teal" />
          <span className="font-mono text-xs uppercase tracking-wider text-zinc-100">
            Compare Clusters
          </span>
          {showComparison && (
            <span className="px-1.5 py-0.5 bg-accent-teal/20 text-accent-teal font-mono text-[10px] rounded">
              ACTIVE
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
        <div className="px-3 pb-3 space-y-3">
          {!showComparison ? (
            <>
              {/* Cluster Selection */}
              <div>
                <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-400 mb-2">
                  Select Two Clusters
                </p>

                {/* Cluster A */}
                <div className="mb-2">
                  <label className="block text-xs text-zinc-400 font-mono mb-1">
                    Cluster A
                  </label>
                  <select
                    value={selectedClusterA ?? ''}
                    onChange={(e) => setSelectedClusterA(e.target.value ? parseInt(e.target.value) : null)}
                    className="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700/50 text-zinc-100 text-sm font-mono rounded focus:outline-none focus:border-accent-teal"
                  >
                    <option value="">-- Select Cluster A --</option>
                    {clusters.map((cluster) => (
                      <option
                        key={cluster.cluster_id}
                        value={cluster.cluster_id}
                        disabled={cluster.cluster_id === selectedClusterB}
                      >
                        Cluster {cluster.cluster_id} ({cluster.size} nodes)
                        {cluster.label ? ` - ${cluster.label}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Cluster B */}
                <div>
                  <label className="block text-xs text-zinc-400 font-mono mb-1">
                    Cluster B
                  </label>
                  <select
                    value={selectedClusterB ?? ''}
                    onChange={(e) => setSelectedClusterB(e.target.value ? parseInt(e.target.value) : null)}
                    className="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700/50 text-zinc-100 text-sm font-mono rounded focus:outline-none focus:border-accent-teal"
                  >
                    <option value="">-- Select Cluster B --</option>
                    {clusters.map((cluster) => (
                      <option
                        key={cluster.cluster_id}
                        value={cluster.cluster_id}
                        disabled={cluster.cluster_id === selectedClusterA}
                      >
                        Cluster {cluster.cluster_id} ({cluster.size} nodes)
                        {cluster.label ? ` - ${cluster.label}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Compare Button */}
              <button
                onClick={handleCompare}
                disabled={selectedClusterA === null || selectedClusterB === null}
                className="w-full px-3 py-2 bg-accent-teal hover:bg-accent-teal/90 disabled:bg-zinc-800 disabled:text-zinc-600 disabled:cursor-not-allowed text-white font-mono text-xs uppercase tracking-wider transition-colors rounded"
              >
                Compare
              </button>
            </>
          ) : comparisonData && (
            <>
              {/* Comparison Results */}
              <div className="space-y-3">
                {/* Summary */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="px-2 py-1.5 bg-zinc-800/50 border-l-2 border-accent-purple">
                    <p className="text-xs text-zinc-400 font-mono">Cluster A</p>
                    <p className="text-sm text-zinc-100 font-mono">
                      {comparisonData.clusterA.size} nodes
                    </p>
                  </div>
                  <div className="px-2 py-1.5 bg-zinc-800/50 border-l-2 border-accent-teal">
                    <p className="text-xs text-zinc-400 font-mono">Cluster B</p>
                    <p className="text-sm text-zinc-100 font-mono">
                      {comparisonData.clusterB.size} nodes
                    </p>
                  </div>
                </div>

                {/* Common Concepts */}
                {comparisonData.common.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <TrendingUp className="w-3 h-3 text-green-400" />
                      <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">
                        Common ({comparisonData.common.length})
                      </p>
                    </div>
                    <div className="max-h-24 overflow-y-auto space-y-1">
                      {comparisonData.common.map((name, idx) => (
                        <div
                          key={idx}
                          className="px-2 py-1 bg-green-400/10 border-l-2 border-green-400 text-xs text-zinc-300"
                        >
                          {name}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Unique to A */}
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <div className="w-2 h-2 rounded-full bg-accent-purple" />
                    <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">
                      Only in A ({comparisonData.uniqueToA.length})
                    </p>
                  </div>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {comparisonData.uniqueToA.length > 0 ? (
                      comparisonData.uniqueToA.map((name, idx) => (
                        <div
                          key={idx}
                          className="px-2 py-1 bg-accent-purple/10 border-l-2 border-accent-purple text-xs text-zinc-300"
                        >
                          {name}
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-zinc-500 italic">No unique concepts</p>
                    )}
                  </div>
                </div>

                {/* Unique to B */}
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <div className="w-2 h-2 rounded-full bg-accent-teal" />
                    <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">
                      Only in B ({comparisonData.uniqueToB.length})
                    </p>
                  </div>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {comparisonData.uniqueToB.length > 0 ? (
                      comparisonData.uniqueToB.map((name, idx) => (
                        <div
                          key={idx}
                          className="px-2 py-1 bg-accent-teal/10 border-l-2 border-accent-teal text-xs text-zinc-300"
                        >
                          {name}
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-zinc-500 italic">No unique concepts</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Reset Button */}
              <button
                onClick={handleReset}
                className="w-full px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-mono text-xs uppercase tracking-wider transition-colors rounded flex items-center justify-center gap-2"
              >
                <X className="w-3 h-3" />
                Reset
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default ClusterComparePanel;
