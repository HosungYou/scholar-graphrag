'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Network,
  MessageSquare,
  Compass,
  Send,
  X,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { KnowledgeGraph } from '@/components/graph/KnowledgeGraph';
import { useGraphStore } from '@/hooks/useGraphStore';

type ViewMode = 'chat' | 'explore' | 'split';

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [chatInput, setChatInput] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);

  const { highlightedNodes, highlightedEdges, setHighlightedNodes, setHighlightedEdges, setSelectedNode, clearHighlights } = useGraphStore();

  // Fetch project details
  const { data: project, isLoading: projectLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.getProject(projectId),
  });

  // Chat mutation
  const chatMutation = useMutation({
    mutationFn: (message: string) =>
      api.sendChatMessage(projectId, message, conversationId || undefined),
    onSuccess: (data) => {
      setConversationId(data.conversation_id);
      setMessages((prev) => [
        ...prev,
        { role: 'user', content: chatInput },
        data.message,
      ]);
      setChatInput('');

      // Highlight nodes mentioned in the response
      if (data.message.highlighted_nodes) {
        setHighlightedNodes(data.message.highlighted_nodes);
      }
      if (data.message.highlighted_edges) {
        setHighlightedEdges(data.message.highlighted_edges);
      }
    },
  });

  // Handle node click in graph
  const handleNodeClick = useCallback(
    async (nodeId: string, nodeData: any) => {
      setSelectedNode(nodeData);
      setHighlightedNodes([nodeId]);

      // Get AI explanation for the node
      try {
        const explanation = await api.explainNode(nodeId, projectId);
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: explanation.explanation,
            isNodeExplanation: true,
            nodeId,
          },
        ]);
      } catch (error) {
        console.error('Failed to get node explanation:', error);
      }
    },
    [projectId, setSelectedNode, setHighlightedNodes]
  );

  // Handle chat submit
  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || chatMutation.isPending) return;
    clearHighlights();
    chatMutation.mutate(chatInput);
  };

  // Handle citation click
  const handleCitationClick = (citation: string) => {
    setHighlightedNodes([citation]);
    // TODO: Center graph on the cited node
  };

  if (projectLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto" />
          <p className="mt-4 text-gray-600">Loading project...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b flex-shrink-0">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/projects" className="text-gray-500 hover:text-gray-700">
              <ChevronRight className="w-5 h-5 rotate-180" />
            </Link>
            <div className="flex items-center gap-3">
              <Network className="w-6 h-6 text-blue-600" />
              <div>
                <h1 className="text-lg font-semibold text-gray-900">
                  {project?.name || 'Project'}
                </h1>
                {project?.research_question && (
                  <p className="text-sm text-gray-500 truncate max-w-md">
                    {project.research_question}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-lg">
            <button
              onClick={() => setViewMode('chat')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors ${
                viewMode === 'chat'
                  ? 'bg-white shadow-sm text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              Chat
            </button>
            <button
              onClick={() => setViewMode('split')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors ${
                viewMode === 'split'
                  ? 'bg-white shadow-sm text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Split
            </button>
            <button
              onClick={() => setViewMode('explore')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors ${
                viewMode === 'explore'
                  ? 'bg-white shadow-sm text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Compass className="w-4 h-4" />
              Explore
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chat Panel */}
        {(viewMode === 'chat' || viewMode === 'split') && (
          <div
            className={`flex flex-col bg-white border-r ${
              viewMode === 'split' ? 'w-1/2' : 'w-full'
            }`}
          >
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <MessageSquare className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p>Ask a question about your research literature</p>
                  <p className="text-sm mt-2">
                    Try: "What methods are commonly used?" or "Compare papers on topic X"
                  </p>
                </div>
              )}
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`p-4 rounded-lg ${
                    msg.role === 'user'
                      ? 'bg-blue-100 ml-12'
                      : 'bg-gray-100 mr-12'
                  }`}
                >
                  <p className="text-sm font-medium text-gray-500 mb-1">
                    {msg.role === 'user' ? 'You' : 'AI Assistant'}
                  </p>
                  <p className="text-gray-800 whitespace-pre-wrap">{msg.content}</p>

                  {/* Citations */}
                  {msg.citations && msg.citations.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {msg.citations.map((citation: string) => (
                        <button
                          key={citation}
                          onClick={() => handleCitationClick(citation)}
                          className="citation-card text-xs"
                        >
                          {citation}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {chatMutation.isPending && (
                <div className="flex items-center gap-2 text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Thinking...</span>
                </div>
              )}
            </div>

            {/* Input */}
            <form onSubmit={handleChatSubmit} className="p-4 border-t">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ask about your research..."
                  className="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim() || chatMutation.isPending}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Graph Panel */}
        {(viewMode === 'explore' || viewMode === 'split') && (
          <div
            className={`relative ${
              viewMode === 'split' ? 'w-1/2' : 'w-full'
            }`}
          >
            <KnowledgeGraph
              projectId={projectId}
              onNodeClick={handleNodeClick}
              highlightedNodes={highlightedNodes}
              highlightedEdges={highlightedEdges}
            />

            {/* Clear highlights button */}
            {(highlightedNodes.length > 0 || highlightedEdges.length > 0) && (
              <button
                onClick={clearHighlights}
                className="absolute top-4 right-4 flex items-center gap-2 px-3 py-2 bg-white rounded-lg shadow-md text-sm text-gray-600 hover:text-gray-900"
              >
                <X className="w-4 h-4" />
                Clear highlights
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
