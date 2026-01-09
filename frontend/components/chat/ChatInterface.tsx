'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Send, 
  Sparkles, 
  Copy, 
  Check, 
  Bot, 
  User,
  ExternalLink,
  MessageSquare,
  Lightbulb,
  Zap
} from 'lucide-react';
import clsx from 'clsx';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: string[];
  highlighted_nodes?: string[];
  highlighted_edges?: string[];
  timestamp: Date;
  isStreaming?: boolean;
}

interface ChatInterfaceProps {
  projectId: string;
  onSendMessage: (message: string) => Promise<{
    content: string;
    citations?: string[];
    highlighted_nodes?: string[];
    highlighted_edges?: string[];
  }>;
  onCitationClick?: (citation: string) => void;
  onHighlightNodes?: (nodeIds: string[]) => void;
  initialMessages?: Message[];
}

const messageVariants = {
  hidden: { opacity: 0, x: -20, filter: 'blur(10px)' },
  visible: { 
    opacity: 1, 
    x: 0, 
    filter: 'blur(0px)',
    transition: { type: 'spring', stiffness: 260, damping: 20 }
  }
};

export function ChatInterface({
  projectId,
  onSendMessage,
  onCitationClick,
  onHighlightNodes,
  initialMessages = [],
}: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await onSendMessage(input.trim());
      const messageId = `assistant-${Date.now()}`;

      const assistantMessage: Message = {
        id: messageId,
        role: 'assistant',
        content: response.content,
        citations: response.citations,
        timestamp: new Date(),
        isStreaming: true,
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setStreamingMessageId(messageId);

      if (response.highlighted_nodes && onHighlightNodes) {
        onHighlightNodes(response.highlighted_nodes);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-nexus-950/40 backdrop-blur-nexus border-l border-white/5">
      {/* Header */}
      <div className="p-6 border-b border-white/5 flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-nexus-indigo/20 flex items-center justify-center border border-nexus-indigo/30">
          <Bot className="w-5 h-5 text-nexus-indigo" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-white tracking-tight">Nexus AI Assistant</h2>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Neural Link Active</span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-hide">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-6">
            <div className="relative">
               <div className="absolute inset-0 bg-nexus-indigo blur-3xl opacity-20" />
               <Sparkles className="w-12 h-12 text-nexus-indigo relative" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-white">Initiate Knowledge Scan</h3>
              <p className="text-sm text-slate-400 max-w-[240px]">Explore the literature through the Neural Nexus interface.</p>
            </div>
          </div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              variants={messageVariants}
              initial="hidden"
              animate="visible"
              className={clsx(
                'flex flex-col gap-3',
                msg.role === 'user' ? 'items-end' : 'items-start'
              )}
            >
              <div className={clsx(
                'max-w-[90%] p-4 rounded-2xl text-sm leading-relaxed',
                msg.role === 'user' 
                  ? 'bg-nexus-indigo text-white shadow-lg shadow-nexus-indigo/20' 
                  : 'glass-nexus border-white/5 text-slate-200'
              )}>
                {msg.content}
              </div>
              <span className="text-[10px] font-mono text-slate-500 uppercase tracking-tighter">
                {msg.role === 'user' ? 'User' : 'Nexus AI'} • {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-6 bg-nexus-900/40 border-t border-white/5">
        <div className="relative group">
          <div className="absolute -inset-1 bg-gradient-to-r from-nexus-indigo to-nexus-violet rounded-2xl blur opacity-10 group-focus-within:opacity-30 transition duration-1000" />
          <div className="relative glass-nexus rounded-2xl flex items-end gap-2 p-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
              placeholder="Query the nexus..."
              className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-slate-200 placeholder-slate-500 min-h-[44px] py-3 px-2 resize-none"
              rows={1}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="p-3 rounded-xl bg-white/5 hover:bg-nexus-indigo text-slate-400 hover:text-white transition-all duration-300 disabled:opacity-30"
            >
              <Zap className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
