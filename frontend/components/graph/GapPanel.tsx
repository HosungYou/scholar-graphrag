'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Sparkles,
  Lightbulb,
  ArrowRight,
  Eye,
  EyeOff,
  RefreshCw,
  HelpCircle,
  Loader2,
  Copy,
  Check,
} from 'lucide-react';
import type { StructuralGap, ConceptCluster, CentralityMetrics } from '@/types';

// Cluster colors matching layout.ts
const clusterColors = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
  '#BB8FCE', '#85C1E9', '#F8B500', '#82E0AA',
];

interface GapPanelProps {
  projectId: string;
  gaps: StructuralGap[];
  clusters: ConceptCluster[];
  onGapSelect: (gap: StructuralGap) => void;
  onHighlightNodes: (nodeIds: string[]) => void;
  onClearHighlights: () => void;
  isLoading?: boolean;
  onRefresh?: () => Promise<void>;
}

export function GapPanel({
  projectId,
  gaps,
  clusters,
  onGapSelect,
  onHighlightNodes,
  onClearHighlights,
  isLoading = false,
  onRefresh,
}: GapPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [selectedGap, setSelectedGap] = useState<StructuralGap | null>(null);
  const [expandedGapId, setExpandedGapId] = useState<string | null>(null);
  const [copiedQuestionId, setCopiedQuestionId] = useState<string | null>(null);
  const [showAllGaps, setShowAllGaps] = useState(false);

  // Sort gaps by strength (highest first)
  const sortedGaps = [...gaps].sort((a, b) => b.gap_strength - a.gap_strength);
  const displayedGaps = showAllGaps ? sortedGaps : sortedGaps.slice(0, 5);

  // Get cluster label or generate one
  const getClusterLabel = useCallback((clusterId: number) => {
    const cluster = clusters.find(c => c.cluster_id === clusterId);
    if (cluster?.label) return cluster.label;
    if (cluster?.concept_names && cluster.concept_names.length > 0) {
      return cluster.concept_names.slice(0, 2).join(', ');
    }
    return `Cluster ${clusterId + 1}`;
  }, [clusters]);

  // Get cluster color
  const getClusterColor = useCallback((clusterId: number) => {
    return clusterColors[clusterId % clusterColors.length];
  }, []);

  // Handle gap click
  const handleGapClick = useCallback((gap: StructuralGap) => {
    setSelectedGap(gap);
    setExpandedGapId(gap.id === expandedGapId ? null : gap.id);
    onGapSelect(gap);

    // Highlight all concepts in both clusters
    const allConceptIds = [
      ...gap.cluster_a_concepts,
      ...gap.cluster_b_concepts,
      ...gap.bridge_candidates,
    ];
    onHighlightNodes(allConceptIds);
  }, [expandedGapId, onGapSelect, onHighlightNodes]);

  // Handle clear highlights
  const handleClearHighlights = useCallback(() => {
    setSelectedGap(null);
    setExpandedGapId(null);
    onClearHighlights();
  }, [onClearHighlights]);

  // Handle copy question
  const handleCopyQuestion = useCallback(async (question: string, gapId: string, qIndex: number) => {
    try {
      await navigator.clipboard.writeText(question);
      setCopiedQuestionId(`${gapId}-${qIndex}`);
      setTimeout(() => setCopiedQuestionId(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, []);

  // Format gap strength as percentage
  const formatGapStrength = useCallback((strength: number) => {
    return `${Math.round(strength * 100)}%`;
  }, []);

  return (
    <div className="absolute top-4 left-4 bg-gray-800/95 rounded-lg shadow-xl border border-gray-700 w-80 max-h-[80vh] overflow-hidden z-20">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-gray-700/50 transition-colors border-b border-gray-700"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-yellow-400" />
          <span className="font-medium text-gray-100">Research Gaps</span>
          {gaps.length > 0 && (
            <span className="px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs rounded-full">
              {gaps.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isLoading && <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />}
          {onRefresh && !isLoading && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRefresh();
              }}
              className="p-1 hover:bg-gray-600 rounded transition-colors"
              title="Refresh gap analysis"
            >
              <RefreshCw className="w-3 h-3 text-gray-400" />
            </button>
          )}
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="overflow-y-auto max-h-[calc(80vh-60px)]">
          {/* Description */}
          <div className="p-3 bg-gray-700/30 border-b border-gray-700">
            <div className="flex items-start gap-2">
              <HelpCircle className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-gray-400">
                Research gaps are areas where concept clusters have weak connections.
                Click a gap to see AI-suggested research questions.
              </p>
            </div>
          </div>

          {/* Gaps List */}
          {gaps.length === 0 ? (
            <div className="p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center mx-auto mb-3">
                <Sparkles className="w-6 h-6 text-gray-500" />
              </div>
              <p className="text-gray-400 text-sm">No research gaps detected</p>
              <p className="text-gray-500 text-xs mt-1">
                Import more papers to discover potential research opportunities
              </p>
            </div>
          ) : (
            <div className="p-2 space-y-2">
              {displayedGaps.map((gap) => {
                const isSelected = selectedGap?.id === gap.id;
                const isExpandedItem = expandedGapId === gap.id;

                return (
                  <div
                    key={gap.id}
                    className={`rounded-lg border transition-all ${
                      isSelected
                        ? 'border-yellow-500/50 bg-yellow-500/10'
                        : 'border-gray-600 bg-gray-700/30 hover:border-gray-500'
                    }`}
                  >
                    {/* Gap Header */}
                    <button
                      onClick={() => handleGapClick(gap)}
                      className="w-full p-3 text-left"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: getClusterColor(gap.cluster_a_id) }}
                          />
                          <span className="text-xs text-gray-300 truncate max-w-[80px]">
                            {getClusterLabel(gap.cluster_a_id)}
                          </span>
                          <ArrowRight className="w-3 h-3 text-gray-500" />
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: getClusterColor(gap.cluster_b_id) }}
                          />
                          <span className="text-xs text-gray-300 truncate max-w-[80px]">
                            {getClusterLabel(gap.cluster_b_id)}
                          </span>
                        </div>
                        <span className={`text-xs font-medium ${
                          gap.gap_strength > 0.7
                            ? 'text-red-400'
                            : gap.gap_strength > 0.4
                            ? 'text-yellow-400'
                            : 'text-green-400'
                        }`}>
                          {formatGapStrength(gap.gap_strength)}
                        </span>
                      </div>

                      {/* Gap Preview */}
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-gray-400">
                          {gap.cluster_a_names.slice(0, 2).join(', ')} ↔ {gap.cluster_b_names.slice(0, 2).join(', ')}
                        </p>
                        {isExpandedItem ? (
                          <ChevronUp className="w-3 h-3 text-gray-500" />
                        ) : (
                          <ChevronDown className="w-3 h-3 text-gray-500" />
                        )}
                      </div>
                    </button>

                    {/* Expanded Content */}
                    {isExpandedItem && (
                      <div className="px-3 pb-3 space-y-3 border-t border-gray-600 pt-3">
                        {/* Bridge Candidates */}
                        {gap.bridge_candidates.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-gray-300 mb-1 flex items-center gap-1">
                              <Sparkles className="w-3 h-3 text-yellow-400" />
                              Bridge Concepts
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {gap.bridge_candidates.slice(0, 5).map((candidate, idx) => (
                                <span
                                  key={idx}
                                  className="px-2 py-0.5 bg-yellow-500/20 text-yellow-300 text-xs rounded border border-yellow-500/30"
                                >
                                  {candidate}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Research Questions */}
                        {gap.research_questions.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-gray-300 mb-2 flex items-center gap-1">
                              <Lightbulb className="w-3 h-3 text-purple-400" />
                              AI Research Questions
                            </p>
                            <div className="space-y-2">
                              {gap.research_questions.map((question, qIdx) => (
                                <div
                                  key={qIdx}
                                  className="bg-gray-800 rounded p-2 group"
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <p className="text-xs text-gray-300 leading-relaxed">
                                      {question}
                                    </p>
                                    <button
                                      onClick={() => handleCopyQuestion(question, gap.id, qIdx)}
                                      className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                                      title="Copy question"
                                    >
                                      {copiedQuestionId === `${gap.id}-${qIdx}` ? (
                                        <Check className="w-3 h-3 text-green-400" />
                                      ) : (
                                        <Copy className="w-3 h-3 text-gray-500 hover:text-gray-300" />
                                      )}
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Concepts in each cluster */}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <p className="text-xs text-gray-500 mb-1">
                              <span
                                className="inline-block w-2 h-2 rounded-full mr-1"
                                style={{ backgroundColor: getClusterColor(gap.cluster_a_id) }}
                              />
                              Cluster A ({gap.cluster_a_names.length})
                            </p>
                            <div className="text-xs text-gray-400 space-y-0.5 max-h-24 overflow-y-auto">
                              {gap.cluster_a_names.slice(0, 5).map((name, idx) => (
                                <div key={idx} className="truncate">{name}</div>
                              ))}
                              {gap.cluster_a_names.length > 5 && (
                                <div className="text-gray-500">
                                  +{gap.cluster_a_names.length - 5} more
                                </div>
                              )}
                            </div>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 mb-1">
                              <span
                                className="inline-block w-2 h-2 rounded-full mr-1"
                                style={{ backgroundColor: getClusterColor(gap.cluster_b_id) }}
                              />
                              Cluster B ({gap.cluster_b_names.length})
                            </p>
                            <div className="text-xs text-gray-400 space-y-0.5 max-h-24 overflow-y-auto">
                              {gap.cluster_b_names.slice(0, 5).map((name, idx) => (
                                <div key={idx} className="truncate">{name}</div>
                              ))}
                              {gap.cluster_b_names.length > 5 && (
                                <div className="text-gray-500">
                                  +{gap.cluster_b_names.length - 5} more
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Show More/Less */}
              {gaps.length > 5 && (
                <button
                  onClick={() => setShowAllGaps(!showAllGaps)}
                  className="w-full py-2 text-xs text-gray-400 hover:text-gray-300 transition-colors flex items-center justify-center gap-1"
                >
                  {showAllGaps ? (
                    <>
                      <EyeOff className="w-3 h-3" />
                      Show fewer gaps
                    </>
                  ) : (
                    <>
                      <Eye className="w-3 h-3" />
                      Show all {gaps.length} gaps
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {/* Clear Highlights Button */}
          {selectedGap && (
            <div className="p-3 border-t border-gray-700">
              <button
                onClick={handleClearHighlights}
                className="w-full py-2 px-3 bg-gray-700 hover:bg-gray-600 rounded text-sm text-gray-300 transition-colors flex items-center justify-center gap-2"
              >
                <EyeOff className="w-4 h-4" />
                Clear Highlights
              </button>
            </div>
          )}

          {/* Cluster Overview */}
          {clusters.length > 0 && (
            <div className="p-3 border-t border-gray-700">
              <p className="text-xs font-medium text-gray-300 mb-2">Concept Clusters</p>
              <div className="grid grid-cols-3 gap-1">
                {clusters.slice(0, 12).map((cluster) => (
                  <div
                    key={cluster.cluster_id}
                    className="flex items-center gap-1 p-1 rounded bg-gray-700/50"
                  >
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: getClusterColor(cluster.cluster_id) }}
                    />
                    <span className="text-xs text-gray-400 truncate">
                      {cluster.size}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {clusters.reduce((sum, c) => sum + c.size, 0)} concepts in {clusters.length} clusters
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
