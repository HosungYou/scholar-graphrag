/**
 * API client for ScholaRAG Graph backend
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || `API Error: ${response.status}`);
    }

    return response.json();
  }

  // Projects
  async getProjects() {
    return this.request<any[]>('/api/projects');
  }

  async getProject(id: string) {
    return this.request<any>(`/api/projects/${id}`);
  }

  async createProject(data: { name: string; research_question?: string }) {
    return this.request<any>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteProject(id: string) {
    return this.request<any>(`/api/projects/${id}`, {
      method: 'DELETE',
    });
  }

  // Graph
  async getNodes(projectId: string, params?: { entity_type?: string; limit?: number }) {
    const searchParams = new URLSearchParams({ project_id: projectId });
    if (params?.entity_type) searchParams.set('entity_type', params.entity_type);
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    return this.request<any[]>(`/api/graph/nodes?${searchParams}`);
  }

  async getEdges(projectId: string) {
    return this.request<any[]>(`/api/graph/edges?project_id=${projectId}`);
  }

  async getVisualizationData(projectId: string) {
    return this.request<{ nodes: any[]; edges: any[] }>(
      `/api/graph/visualization/${projectId}`
    );
  }

  async getSubgraph(nodeId: string, depth: number = 1) {
    return this.request<{ nodes: any[]; edges: any[] }>(
      `/api/graph/subgraph/${nodeId}?depth=${depth}`
    );
  }

  async searchNodes(query: string, entityTypes?: string[]) {
    return this.request<any[]>('/api/graph/search', {
      method: 'POST',
      body: JSON.stringify({ query, entity_types: entityTypes }),
    });
  }

  // Chat
  async sendChatMessage(projectId: string, message: string, conversationId?: string) {
    return this.request<any>('/api/chat/query', {
      method: 'POST',
      body: JSON.stringify({
        project_id: projectId,
        message,
        conversation_id: conversationId,
      }),
    });
  }

  async getChatHistory(projectId: string) {
    return this.request<any[]>(`/api/chat/history/${projectId}`);
  }

  async explainNode(nodeId: string, projectId: string) {
    return this.request<any>(`/api/chat/explain/${nodeId}?project_id=${projectId}`, {
      method: 'POST',
    });
  }

  // Import
  async validateScholarag(folderPath: string) {
    return this.request<any>('/api/import/scholarag/validate', {
      method: 'POST',
      body: JSON.stringify({ folder_path: folderPath }),
    });
  }

  async importScholarag(folderPath: string, projectName?: string) {
    return this.request<any>('/api/import/scholarag', {
      method: 'POST',
      body: JSON.stringify({
        folder_path: folderPath,
        project_name: projectName,
        extract_entities: true,
      }),
    });
  }

  async getImportStatus(jobId: string) {
    return this.request<any>(`/api/import/status/${jobId}`);
  }
}

export const api = new ApiClient(API_URL);
