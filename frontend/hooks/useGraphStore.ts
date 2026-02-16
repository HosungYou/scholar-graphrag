import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '@/lib/api';
import type { GraphData, GraphEntity, EntityType } from '@/types';

// View modes for different graph perspectives
export type ViewMode = 'concepts' | 'papers' | 'full';

interface FilterState {
  entityTypes: EntityType[];
  yearRange: [number, number] | null;
  searchQuery: string;
}

interface GraphStore {
  // State
  graphData: GraphData | null;
  selectedNode: GraphEntity | null;
  highlightedNodes: string[];
  highlightedEdges: string[];
  isLoading: boolean;
  error: string | null;
  filters: FilterState;
  viewMode: ViewMode;

  // Actions
  fetchGraphData: (projectId: string) => Promise<void>;
  setSelectedNode: (node: GraphEntity | null) => void;
  setHighlightedNodes: (nodeIds: string[]) => void;
  setHighlightedEdges: (edgeIds: string[]) => void;
  clearHighlights: () => void;
  expandNode: (nodeId: string) => Promise<void>;
  setFilters: (filters: Partial<FilterState>) => void;
  resetFilters: () => void;
  getFilteredData: () => GraphData | null;
  setViewMode: (mode: ViewMode) => void;
  getConceptCentricData: () => GraphData | null;
}

const defaultFilters: FilterState = {
  entityTypes: ['Paper', 'Author', 'Concept', 'Method', 'Finding'],
  yearRange: null,
  searchQuery: '',
};

export const useGraphStore = create<GraphStore>()(
  persist(
    (set, get) => ({
  // Initial state
  graphData: null,
  selectedNode: null,
  highlightedNodes: [],
  highlightedEdges: [],
  isLoading: false,
  error: null,
  filters: { ...defaultFilters },
  viewMode: 'concepts' as ViewMode, // Default to concept-centric view

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
      const newNodes = subgraph.nodes.filter((n: GraphEntity) => !existingNodeIds.has(n.id));

      const existingEdgeIds = new Set(graphData.edges.map((e) => e.id));
      const newEdges = subgraph.edges.filter((e: { id: string }) => !existingEdgeIds.has(e.id));

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

  setFilters: (newFilters) => {
    set((state) => ({
      filters: { ...state.filters, ...newFilters },
    }));
  },

  resetFilters: () => {
    set({ filters: { ...defaultFilters } });
  },

  getFilteredData: () => {
    const { graphData, filters } = get();
    if (!graphData) return null;

    // Filter nodes
    const filteredNodes = graphData.nodes.filter((node) => {
      // Filter by entity type
      if (!filters.entityTypes.includes(node.entity_type)) {
        return false;
      }

      // Filter by year range (only for Papers)
      if (filters.yearRange && node.entity_type === 'Paper') {
        const year = (node.properties as { year?: number }).year;
        if (year && (year < filters.yearRange[0] || year > filters.yearRange[1])) {
          return false;
        }
      }

      // Filter by search query
      if (filters.searchQuery) {
        const query = filters.searchQuery.toLowerCase();
        const nameMatch = node.name.toLowerCase().includes(query);
        const propsMatch = Object.values(node.properties || {}).some(
          (v) => typeof v === 'string' && v.toLowerCase().includes(query)
        );
        if (!nameMatch && !propsMatch) {
          return false;
        }
      }

      return true;
    });

    // Get IDs of filtered nodes
    const filteredNodeIds = new Set(filteredNodes.map((n) => n.id));

    // Filter edges to only include those connecting filtered nodes
    const filteredEdges = graphData.edges.filter(
      (edge) => filteredNodeIds.has(edge.source) && filteredNodeIds.has(edge.target)
    );

    return { nodes: filteredNodes, edges: filteredEdges };
  },

  setViewMode: (mode: ViewMode) => {
    set({ viewMode: mode });
  },

  // Get concept-centric view of the graph
  // In this view, Concepts are primary nodes, and Papers/Authors are shown as metadata
  getConceptCentricData: () => {
    const { graphData, filters, viewMode } = get();
    if (!graphData) return null;

    if (viewMode === 'full') {
      // Full view - show all entity types
      return get().getFilteredData();
    }

    if (viewMode === 'papers') {
      // Paper-centric view - show Papers as primary, with connected Authors
      const paperNodes = graphData.nodes.filter(
        (n) => n.entity_type === 'Paper' || n.entity_type === 'Author'
      );
      const paperNodeIds = new Set(paperNodes.map((n) => n.id));
      const paperEdges = graphData.edges.filter(
        (e) => paperNodeIds.has(e.source) && paperNodeIds.has(e.target)
      );
      return { nodes: paperNodes, edges: paperEdges };
    }

    // Concept-centric view (default)
    // Primary nodes: Concept, Method, Finding
    // Secondary nodes: Papers that discuss these concepts
    const conceptTypes = ['Concept', 'Method', 'Finding'];
    const conceptNodes = graphData.nodes.filter((n) =>
      conceptTypes.includes(n.entity_type)
    );
    const conceptNodeIds = new Set(conceptNodes.map((n) => n.id));

    // Find Papers connected to concepts via DISCUSSES_CONCEPT, USES_METHOD, SUPPORTS
    const relevantRelTypes = ['DISCUSSES_CONCEPT', 'USES_METHOD', 'SUPPORTS', 'CONTRADICTS'];
    const connectedPaperIds = new Set<string>();

    graphData.edges.forEach((edge) => {
      if (relevantRelTypes.includes(edge.relationship_type)) {
        // If target is a concept, source is likely a paper
        if (conceptNodeIds.has(edge.target)) {
          connectedPaperIds.add(edge.source);
        }
        // If source is a concept, target might be a paper
        if (conceptNodeIds.has(edge.source)) {
          connectedPaperIds.add(edge.target);
        }
      }
    });

    // Add connected Papers to the view
    const paperNodes = graphData.nodes.filter(
      (n) => n.entity_type === 'Paper' && connectedPaperIds.has(n.id)
    );

    const allNodes = [...conceptNodes, ...paperNodes];
    const allNodeIds = new Set(allNodes.map((n) => n.id));

    // Filter edges to only those between visible nodes
    const filteredEdges = graphData.edges.filter(
      (e) => allNodeIds.has(e.source) && allNodeIds.has(e.target)
    );

    // Also include RELATED_TO edges between concepts
    const conceptRelEdges = graphData.edges.filter(
      (e) =>
        e.relationship_type === 'RELATED_TO' &&
        conceptNodeIds.has(e.source) &&
        conceptNodeIds.has(e.target)
    );

    // Merge edges, avoiding duplicates
    const edgeIds = new Set(filteredEdges.map((e) => e.id));
    const mergedEdges = [
      ...filteredEdges,
      ...conceptRelEdges.filter((e) => !edgeIds.has(e.id)),
    ];

    return { nodes: allNodes, edges: mergedEdges };
  },
    }),
    {
      name: 'scholarag-graph-settings',
      partialize: (state) => ({
        viewMode: state.viewMode,
        filters: { entityTypes: state.filters.entityTypes },
      }),
    }
  )
);
