/**
 * Core entity types for ScholaRAG Graph
 */

// Entity Types
export type EntityType = 'Paper' | 'Author' | 'Concept' | 'Method' | 'Finding' | 'Result' | 'Claim';

// Relationship Types
export type RelationshipType =
  | 'AUTHORED_BY'
  | 'CITES'
  | 'DISCUSSES_CONCEPT'
  | 'USES_METHOD'
  | 'SUPPORTS'
  | 'CONTRADICTS'
  | 'RELATED_TO'
  | 'USED_IN'
  | 'EVALUATED_ON'
  | 'REPORTS';

// Property types
export interface PaperProperties {
  title?: string;
  abstract?: string;
  year?: number;
  doi?: string;
  arxiv_id?: string;
  authors?: string[];
  citation_count?: number;
  source?: string;
  pdf_path?: string;
  url?: string;
  [key: string]: unknown;
}

export interface AuthorProperties {
  affiliation?: string;
  orcid?: string;
  email?: string;
  paper_count?: number;
  [key: string]: unknown;
}

export interface ConceptProperties {
  description?: string;
  domain?: string;
  paper_count?: number;
  synonyms?: string[];
  [key: string]: unknown;
}

export interface MethodProperties {
  description?: string;
  type?: 'quantitative' | 'qualitative' | 'mixed';
  paper_count?: number;
  [key: string]: unknown;
}

export interface FindingProperties {
  statement?: string;
  effect_size?: string;
  significance?: string;
  confidence?: number;
  paper_count?: number;
  [key: string]: unknown;
}

export interface ResultProperties {
  statement?: string;
  metrics?: string;
  significance?: string;
  confidence?: number;
  paper_count?: number;
  extraction_section?: string;
  [key: string]: unknown;
}

export interface ClaimProperties {
  statement?: string;
  evidence?: string;
  confidence?: number;
  paper_count?: number;
  extraction_section?: string;
  [key: string]: unknown;
}

// Base Entity interface
export interface GraphEntity {
  id: string;
  entity_type: EntityType;
  name: string;
  properties: PaperProperties | AuthorProperties | ConceptProperties | MethodProperties | FindingProperties | ResultProperties | ClaimProperties;
  created_at?: string;
  updated_at?: string;
}

// Edge/Relationship
export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relationship_type: RelationshipType;
  properties?: Record<string, unknown>;
  weight?: number;
}

// Graph Data
export interface GraphData {
  nodes: GraphEntity[];
  edges: GraphEdge[];
}

// Project
export interface Project {
  id: string;
  name: string;
  research_question?: string | null;
  description?: string | null;
  source_path?: string | null;
  created_at: string;
  updated_at?: string;
  stats?: ProjectStats;
}

export interface ProjectStats {
  total_nodes?: number;
  total_edges?: number;
  total_papers?: number;
  total_authors?: number;
  total_concepts?: number;
  total_methods?: number;
  total_findings?: number;
}

// Chat
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  citations?: Citation[];
  highlighted_nodes?: string[];
  highlighted_edges?: string[];
}

export interface Citation {
  id: string;
  paper_id: string;
  title: string;
  authors?: string[];
  year?: number;
  relevance_score?: number;
}

// Retrieval Trace
export interface TraceStep {
  step_index: number;
  action: 'vector_search' | 'keyword_search' | 'graph_traverse' | 'gap_analysis' | 'aggregate' | string;
  node_ids: string[];
  edge_ids?: string[];
  thought: string;
  duration_ms: number;
}

export interface RetrievalTrace {
  strategy: 'vector' | 'graph_traversal' | 'hybrid' | string;
  steps: TraceStep[];
  reasoning_path: string[];
  metrics: {
    total_steps: number;
    total_latency_ms: number;
    rerank_applied?: boolean;
  };
}

export interface ChatResponse {
  answer: string;
  citations: Citation[];
  highlighted_nodes: string[];
  highlighted_edges: string[];
  conversation_id: string;
  retrieval_trace?: RetrievalTrace;
}

// Import
export interface ImportValidationResult {
  valid: boolean;
  folder_path: string;
  config_found: boolean;
  scholarag_metadata_found: boolean;
  papers_csv_found: boolean;
  papers_count: number;
  pdfs_count: number;
  chroma_db_found: boolean;
  errors: string[];
  warnings: string[];
}

export interface ImportJob {
  job_id: string;
  status: 'pending' | 'validating' | 'extracting' | 'processing' | 'building_graph' | 'completed' | 'failed';
  progress: number;
  message?: string;
  project_id?: string;
  stats?: {
    papers_imported: number;
    authors_extracted: number;
    concepts_extracted: number;
    total_entities: number;
    total_relationships: number;
  };
  created_at?: string;
  updated_at?: string;
}

// Search
export interface SearchResult {
  id: string;
  entity_type: EntityType;
  name: string;
  properties?: Record<string, unknown>;
  score?: number;
}

// React Flow types
export interface CustomNodeData {
  label: string;
  entityType: EntityType;
  properties?: Record<string, unknown>;
  isHighlighted?: boolean;
}
