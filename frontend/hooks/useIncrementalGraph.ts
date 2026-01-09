import { useState, useCallback, useRef, useEffect } from 'react';
import { api } from '@/lib/api';
import type { GraphData, GraphEntity, GraphEdge } from '@/types';

interface IncrementalLoadOptions {
  projectId: string;
  initialBatchSize?: number;
  batchSize?: number;
  autoLoad?: boolean;
  onProgress?: (loaded: number, total: number) => void;
  onError?: (error: Error) => void;
}

interface IncrementalLoadState {
  nodes: GraphEntity[];
  edges: GraphEdge[];
  isLoading: boolean;
  isInitialLoading: boolean;
  hasMore: boolean;
  loadedCount: number;
  totalCount: number;
  error: Error | null;
}

interface IncrementalLoadReturn extends IncrementalLoadState {
  loadInitial: () => Promise<void>;
  loadMore: () => Promise<void>;
  loadNode: (nodeId: string, depth?: number) => Promise<void>;
  reset: () => void;
  getGraphData: () => GraphData;
}

const DEFAULT_INITIAL_BATCH = 100;
const DEFAULT_BATCH_SIZE = 50;

export function useIncrementalGraph(options: IncrementalLoadOptions): IncrementalLoadReturn {
  const {
    projectId,
    initialBatchSize = DEFAULT_INITIAL_BATCH,
    batchSize = DEFAULT_BATCH_SIZE,
    autoLoad = true,
    onProgress,
    onError,
  } = options;

  const [state, setState] = useState<IncrementalLoadState>({
    nodes: [],
    edges: [],
    isLoading: false,
    isInitialLoading: false,
    hasMore: true,
    loadedCount: 0,
    totalCount: 0,
    error: null,
  });

  const loadedNodeIds = useRef<Set<string>>(new Set());
  const loadedEdgeIds = useRef<Set<string>>(new Set());
  const cursorRef = useRef<string | null>(null);

  const addNodes = useCallback((newNodes: GraphEntity[]) => {
    const uniqueNodes = newNodes.filter(n => !loadedNodeIds.current.has(n.id));
    uniqueNodes.forEach(n => loadedNodeIds.current.add(n.id));
    return uniqueNodes;
  }, []);

  const addEdges = useCallback((newEdges: GraphEdge[]) => {
    const uniqueEdges = newEdges.filter(e => !loadedEdgeIds.current.has(e.id));
    uniqueEdges.forEach(e => loadedEdgeIds.current.add(e.id));
    return uniqueEdges;
  }, []);

  const loadInitial = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, isInitialLoading: true, error: null }));

    try {
      const response = await api.getVisualizationData(projectId, {
        limit: initialBatchSize,
        cursor: null,
      });
      const data = response as GraphData & { cursor?: string; total?: number };
      const nodes = addNodes(data.nodes);
      const edges = addEdges(data.edges);

      cursorRef.current = data.cursor || null;

      setState({
        nodes,
        edges,
        isLoading: false,
        isInitialLoading: false,
        hasMore: !!data.cursor,
        loadedCount: nodes.length,
        totalCount: data.total || nodes.length,
        error: null,
      });

      onProgress?.(nodes.length, data.total || nodes.length);
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Failed to load initial data');
      setState(prev => ({ ...prev, isLoading: false, isInitialLoading: false, error: err }));
      onError?.(err);
    }
  }, [projectId, initialBatchSize, addNodes, addEdges, onProgress, onError]);

  const loadMore = useCallback(async () => {
    if (state.isLoading || !state.hasMore) return;

    setState(prev => ({ ...prev, isLoading: true }));

    try {
      const response = await api.getVisualizationData(projectId, {
        limit: batchSize,
        cursor: cursorRef.current,
      });
      const data = response as GraphData & { cursor?: string; total?: number };
      const newNodes = addNodes(data.nodes);
      const newEdges = addEdges(data.edges);

      cursorRef.current = data.cursor || null;

      setState(prev => ({
        ...prev,
        nodes: [...prev.nodes, ...newNodes],
        edges: [...prev.edges, ...newEdges],
        isLoading: false,
        hasMore: !!data.cursor,
        loadedCount: prev.loadedCount + newNodes.length,
        totalCount: data.total || prev.totalCount,
      }));

      onProgress?.(state.loadedCount + newNodes.length, data.total || state.totalCount);
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Failed to load more data');
      setState(prev => ({ ...prev, isLoading: false, error: err }));
      onError?.(err);
    }
  }, [projectId, batchSize, state.isLoading, state.hasMore, state.loadedCount, state.totalCount, addNodes, addEdges, onProgress, onError]);

  const loadNode = useCallback(async (nodeId: string, depth: number = 1) => {
    setState(prev => ({ ...prev, isLoading: true }));

    try {
      const subgraph = await api.getSubgraph(nodeId, depth);
      const newNodes = addNodes(subgraph.nodes);
      const newEdges = addEdges(subgraph.edges);

      setState(prev => ({
        ...prev,
        nodes: [...prev.nodes, ...newNodes],
        edges: [...prev.edges, ...newEdges],
        isLoading: false,
        loadedCount: prev.loadedCount + newNodes.length,
      }));
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Failed to expand node');
      setState(prev => ({ ...prev, isLoading: false, error: err }));
      onError?.(err);
    }
  }, [addNodes, addEdges, onError]);

  const reset = useCallback(() => {
    loadedNodeIds.current.clear();
    loadedEdgeIds.current.clear();
    cursorRef.current = null;
    setState({
      nodes: [],
      edges: [],
      isLoading: false,
      isInitialLoading: false,
      hasMore: true,
      loadedCount: 0,
      totalCount: 0,
      error: null,
    });
  }, []);

  const getGraphData = useCallback((): GraphData => {
    return {
      nodes: state.nodes,
      edges: state.edges,
    };
  }, [state.nodes, state.edges]);

  useEffect(() => {
    if (autoLoad && projectId) {
      loadInitial();
    }
  }, [projectId, autoLoad, loadInitial]);

  return {
    ...state,
    loadInitial,
    loadMore,
    loadNode,
    reset,
    getGraphData,
  };
}

export function useLoadingProgress(
  isLoading: boolean,
  estimatedDuration: number = 3000
): number {
  const [progress, setProgress] = useState(0);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (isLoading) {
      startTimeRef.current = Date.now();
      setProgress(0);

      const interval = setInterval(() => {
        if (startTimeRef.current) {
          const elapsed = Date.now() - startTimeRef.current;
          const newProgress = Math.min(
            90,
            (elapsed / estimatedDuration) * 100 * (1 - Math.exp(-elapsed / estimatedDuration))
          );
          setProgress(newProgress);
        }
      }, 100);

      return () => clearInterval(interval);
    } else {
      setProgress(100);
      const timeout = setTimeout(() => setProgress(0), 500);
      return () => clearTimeout(timeout);
    }
  }, [isLoading, estimatedDuration]);

  return progress;
}
