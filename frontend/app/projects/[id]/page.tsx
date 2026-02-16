'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Network,
  MessageSquare,
  Compass,
  Send,
  X,
  ChevronRight,
  Loader2,
  Menu,
  ChevronLeft,
  Wifi,
  WifiOff,
  Zap,
  LayoutGrid,
  Search
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/lib/api';
import { KnowledgeGraph } from '@/components/graph/KnowledgeGraph';
import { NodeDetails } from '@/components/graph/NodeDetails';
import { FilterPanel } from '@/components/graph/FilterPanel';
import { SearchBar } from '@/components/graph/SearchBar';
import { ChatInterface } from '@/components/chat/ChatInterface';
import { useGraphStore } from '@/hooks/useGraphStore';
import { useWebSocketChat } from '@/hooks/useWebSocketChat';
import { Header } from '@/components/layout';
import {
  ThemeToggle,
  ErrorDisplay,
  ErrorBoundary,
  ChatMessageSkeleton,
  GraphSkeleton,
} from '@/components/ui';
import type { GraphEntity, EntityType, SearchResult, Citation } from '@/types';

type ViewMode = 'chat' | 'explore' | 'split';

const ALL_ENTITY_TYPES: EntityType[] = ['Paper', 'Author', 'Concept', 'Method', 'Finding', 'Result', 'Claim'];

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [chatInput, setChatInput] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [traceNodeIds, setTraceNodeIds] = useState<string[]>([]);

  const {
    graphData,
    highlightedNodes,
    highlightedEdges,
    selectedNode,
    filters,
    setHighlightedNodes,
    setHighlightedEdges,
    setSelectedNode,
    setFilters,
    resetFilters,
    clearHighlights,
    expandNode,
  } = useGraphStore();

  const {
    messages,
    isConnected,
    isStreaming,
    sendMessage,
    connect,
    disconnect,
  } = useWebSocketChat({
    projectId,
    conversationId,
    onStreamEnd: (_messageId, message) => {
      if (message.highlighted_nodes && message.highlighted_nodes.length > 0) {
        setHighlightedNodes(message.highlighted_nodes);
      }
      // Extract trace node IDs from retrieval_trace if available
      const trace = (message as any).retrieval_trace;
      if (trace?.steps) {
        const nodeIds = trace.steps.flatMap((s: any) => s.node_ids || []);
        if (nodeIds.length > 0) {
          setTraceNodeIds(nodeIds);
        }
      }
    },
  });

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  const { data: project, isLoading: projectLoading, error: projectError } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.getProject(projectId),
  });

  const handleNodeClick = useCallback(
    (nodeId: string, nodeData: GraphEntity) => {
      setSelectedNode(nodeData);
      setHighlightedNodes([nodeId]);
    },
    [setSelectedNode, setHighlightedNodes]
  );

  const handleSendMessage = async (message: string) => {
    sendMessage(message);
    return { content: "" }; // Handled by WS streaming
  };

  if (projectLoading) return <div className="h-screen bg-surface-0 flex items-center justify-center"><Loader2 className="w-10 h-10 text-teal animate-spin" /></div>;

  return (
    <div className="h-screen flex flex-col bg-surface-0 text-text-primary overflow-hidden font-sans">
      {/* Cinematic Header */}
      <header className="h-16 border-b border-border flex items-center justify-between px-6 bg-surface-0/95 z-50">
        <div className="flex items-center gap-6">
          <Link href="/projects" className="p-2 hover:bg-surface-2 rounded transition-colors">
            <ChevronLeft className="w-5 h-5 text-text-tertiary" />
          </Link>
          <div className="flex flex-col">
            <h1 className="text-sm font-medium tracking-tight text-text-primary">{project?.name || 'Project'}</h1>
            <div className="flex items-center gap-2">
               <span className="text-[10px] font-mono text-copper tracking-[0.15em] uppercase">S·G v1.0</span>
               <div className={isConnected ? "w-1 h-1 rounded-full bg-teal" : "w-1 h-1 rounded-full bg-node-finding"} />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-surface-2 p-1 rounded border border-border">
            <button
              onClick={() => setViewMode('split')}
              className={`p-2 rounded transition-all ${viewMode === 'split' ? 'bg-teal text-surface-0' : 'text-text-ghost hover:text-text-secondary'}`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('explore')}
              className={`p-2 rounded transition-all ${viewMode === 'explore' ? 'bg-teal text-surface-0' : 'text-text-ghost hover:text-text-secondary'}`}
            >
              <Compass className="w-4 h-4" />
            </button>
          </div>
          <div className="w-px h-6 bg-border" />
          <ThemeToggle />
          {traceNodeIds.length > 0 && (
            <button
              onClick={() => {
                setHighlightedNodes(traceNodeIds);
                setTraceNodeIds([]);
              }}
              className="ml-2 px-3 py-1.5 bg-amber-500/20 text-amber-400 text-xs font-medium rounded border border-amber-500/30 hover:bg-amber-500/30 transition-colors flex items-center gap-1.5"
            >
              <Zap className="w-3 h-3" />
              Show path ({traceNodeIds.length})
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden relative">
        {/* Main Graph Area */}
        <div className="flex-1 relative">
           <KnowledgeGraph
             projectId={projectId}
             onNodeClick={handleNodeClick}
             highlightedNodes={highlightedNodes}
             highlightedEdges={highlightedEdges}
           />

           {/* Floating Filter Overlay */}
           <div className="absolute bottom-6 left-6 z-10">
              <div className="bg-surface-2 rounded border border-border p-2">
                 <button onClick={() => setFilters({ entityTypes: ALL_ENTITY_TYPES })} className="p-3 hover:bg-surface-3 rounded text-text-tertiary hover:text-text-primary transition-colors">
                   <LayoutGrid className="w-5 h-5" />
                 </button>
              </div>
           </div>
        </div>

        {/* Cinematic Side Panel (Chat/Details) */}
        <AnimatePresence>
          {isChatOpen && (
            <motion.div
              initial={{ x: 400 }}
              animate={{ x: 0 }}
              exit={{ x: 400 }}
              className="w-[400px] border-l border-border bg-surface-1 z-40"
            >
              {selectedNode ? (
                <div className="h-full flex flex-col">
                  <div className="p-6 border-b border-border flex items-center justify-between">
                    <h2 className="text-xs font-mono text-copper tracking-[0.15em] uppercase">Entity Details</h2>
                    <button onClick={() => setSelectedNode(null)} className="p-2 hover:bg-surface-2 rounded transition-colors">
                      <X className="w-4 h-4 text-text-ghost" />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
                    <NodeDetails
                      node={selectedNode}
                      projectId={projectId}
                      onClose={() => setSelectedNode(null)}
                      onAskAbout={(id, name) => sendMessage(`Explain the significance of "${name}" in this research context.`)}
                      onShowConnections={(id) => expandNode(id)}
                    />
                  </div>
                </div>
              ) : (
                <ChatInterface
                  projectId={projectId}
                  onSendMessage={handleSendMessage}
                  initialMessages={messages}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Chat Toggle Button */}
        {!isChatOpen && (
           <button
             onClick={() => setIsChatOpen(true)}
             className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-teal text-surface-0 flex items-center justify-center z-50"
           >
             <MessageSquare className="w-6 h-6" />
           </button>
        )}
      </main>
    </div>
  );
}
