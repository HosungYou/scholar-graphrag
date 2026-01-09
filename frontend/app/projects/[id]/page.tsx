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

const ALL_ENTITY_TYPES: EntityType[] = ['Paper', 'Author', 'Concept', 'Method', 'Finding'];

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [chatInput, setChatInput] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(null);

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

  if (projectLoading) return <div className="h-screen bg-nexus-950 flex items-center justify-center"><Loader2 className="w-10 h-10 text-nexus-indigo animate-spin" /></div>;

  return (
    <div className="h-screen flex flex-col bg-nexus-950 text-slate-200 overflow-hidden font-sans">
      {/* Cinematic Header */}
      <header className="h-16 border-b border-white/5 flex items-center justify-between px-6 backdrop-blur-nexus bg-nexus-950/50 z-50">
        <div className="flex items-center gap-6">
          <Link href="/projects" className="p-2 hover:bg-white/5 rounded-xl transition-colors">
            <ChevronLeft className="w-5 h-5 text-slate-400" />
          </Link>
          <div className="flex flex-col">
            <h1 className="text-sm font-bold tracking-tight text-white uppercase">{project?.name || 'Project'}</h1>
            <div className="flex items-center gap-2">
               <span className="text-[10px] font-bold text-nexus-indigo uppercase tracking-widest">Neural Link v1.0</span>
               <div className={isConnected ? "w-1 h-1 rounded-full bg-emerald-500" : "w-1 h-1 rounded-full bg-rose-500"} />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-white/5 p-1 rounded-xl border border-white/5">
            <button 
              onClick={() => setViewMode('split')}
              className={`p-2 rounded-lg transition-all ${viewMode === 'split' ? 'bg-nexus-indigo text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setViewMode('explore')}
              className={`p-2 rounded-lg transition-all ${viewMode === 'explore' ? 'bg-nexus-indigo text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
            >
              <Compass className="w-4 h-4" />
            </button>
          </div>
          <div className="w-px h-6 bg-white/10 mx-2" />
          <ThemeToggle />
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
           <Panel position="bottom-left" className="ml-6 mb-6">
              <div className="glass-nexus rounded-2xl p-2">
                 <button onClick={() => setFilters({ entityTypes: ALL_ENTITY_TYPES })} className="p-3 hover:bg-white/5 rounded-xl text-slate-400 hover:text-white transition-colors">
                   <LayoutGrid className="w-5 h-5" />
                 </button>
              </div>
           </Panel>
        </div>

        {/* Cinematic Side Panel (Chat/Details) */}
        <AnimatePresence>
          {isChatOpen && (
            <motion.div 
              initial={{ x: 400 }}
              animate={{ x: 0 }}
              exit={{ x: 400 }}
              className="w-[400px] border-l border-white/5 bg-nexus-950/40 backdrop-blur-nexus z-40"
            >
              {selectedNode ? (
                <div className="h-full flex flex-col">
                  <div className="p-6 border-b border-white/5 flex items-center justify-between">
                    <h2 className="text-sm font-bold text-white uppercase tracking-widest">Entity Details</h2>
                    <button onClick={() => setSelectedNode(null)} className="p-2 hover:bg-white/5 rounded-lg transition-colors">
                      <X className="w-4 h-4 text-slate-500" />
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
             className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-nexus-indigo text-white shadow-2xl shadow-nexus-indigo/40 flex items-center justify-center z-50 hover:scale-110 transition-transform"
           >
             <MessageSquare className="w-6 h-6" />
           </button>
        )}
      </main>
    </div>
  );
}
