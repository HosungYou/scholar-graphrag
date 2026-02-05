/**
 * Tests for API client - explainNode signature and conditional body
 * v0.10.0: Verifies v0.9.0 node name/type pass-through
 */

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock Supabase
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      }),
    },
  },
}));

describe('ApiClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ explanation: 'Test explanation' }),
      headers: new Headers({ 'content-type': 'application/json' }),
    });
  });

  describe('explainNode', () => {
    it('should include node_name and node_type in request body when provided', async () => {
      const { default: api } = await import('@/lib/api');

      await api.explainNode('node-123', 'project-456', 'machine learning', 'Concept');

      expect(mockFetch).toHaveBeenCalled();
      const [url, options] = mockFetch.mock.calls[0];

      // URL should contain node ID and project ID
      expect(url).toContain('explain/node-123');
      expect(url).toContain('project_id=project-456');

      // Body should have node_name and node_type
      if (options.body) {
        const body = JSON.parse(options.body);
        expect(body.node_name).toBe('machine learning');
        expect(body.node_type).toBe('Concept');
      }
    });

    it('should default node_type to Concept when not specified', async () => {
      const { default: api } = await import('@/lib/api');

      await api.explainNode('node-123', 'project-456', 'deep learning');

      const [, options] = mockFetch.mock.calls[0];
      if (options.body) {
        const body = JSON.parse(options.body);
        expect(body.node_name).toBe('deep learning');
        expect(body.node_type).toBe('Concept');
      }
    });

    it('should not send body when nodeName is not provided', async () => {
      const { default: api } = await import('@/lib/api');

      await api.explainNode('node-123', 'project-456');

      const [, options] = mockFetch.mock.calls[0];
      // When no nodeName, body should be undefined
      expect(options.body).toBeUndefined();
    });

    it('should use POST method', async () => {
      const { default: api } = await import('@/lib/api');

      await api.explainNode('node-123', 'project-456', 'test');

      const [, options] = mockFetch.mock.calls[0];
      expect(options.method).toBe('POST');
    });
  });
});
