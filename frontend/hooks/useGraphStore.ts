import { create } from 'zustand';
import { api } from '@/lib/api';

interface GraphData {
  nodes: any[];
  edges: any[];
}

interface GraphStore {
  // State
  graphData: GraphData | null;
  selectedNode: any | null;
  highlightedNodes: string[];
  highlightedEdges: string[];
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchGraphData: (projectId: string) => Promise<void>;
  setSelectedNode: (node: any | null) => void;
  setHighlightedNodes: (nodeIds: string[]) => void;
  setHighlightedEdges: (edgeIds: string[]) => void;
  clearHighlights: () => void;
  expandNode: (nodeId: string) => Promise<void>;
}

export const useGraphStore = create<GraphStore>((set, get) => ({
  // Initial state
  graphData: null,
  selectedNode: null,
  highlightedNodes: [],
  highlightedEdges: [],
  isLoading: false,
  error: null,

  // Actions
  fetchGraphData: async (projectId: string) => {
    set({ isLoading: true, error: null });
    try {
      const data = await api.getVisualizationData(projectId);
      set({ graphData: data, isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch graph data',
        isLoading: false,
      });
    }
  },

  setSelectedNode: (node) => {
    set({ selectedNode: node });
  },

  setHighlightedNodes: (nodeIds) => {
    set({ highlightedNodes: nodeIds });
  },

  setHighlightedEdges: (edgeIds) => {
    set({ highlightedEdges: edgeIds });
  },

  clearHighlights: () => {
    set({ highlightedNodes: [], highlightedEdges: [] });
  },

  expandNode: async (nodeId: string) => {
    const { graphData } = get();
    if (!graphData) return;

    try {
      const subgraph = await api.getSubgraph(nodeId, 1);

      // Merge subgraph with existing data
      const existingNodeIds = new Set(graphData.nodes.map((n) => n.id));
      const newNodes = subgraph.nodes.filter((n: any) => !existingNodeIds.has(n.id));

      const existingEdgeIds = new Set(graphData.edges.map((e) => e.id));
      const newEdges = subgraph.edges.filter((e: any) => !existingEdgeIds.has(e.id));

      set({
        graphData: {
          nodes: [...graphData.nodes, ...newNodes],
          edges: [...graphData.edges, ...newEdges],
        },
      });
    } catch (error) {
      console.error('Failed to expand node:', error);
    }
  },
}));
