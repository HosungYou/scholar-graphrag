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
  Zap,
  Activity
} from 'lucide-react';
import clsx from 'clsx';
import ReactMarkdown from 'react-markdown';
import type { Citation } from '@/types/graph';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[] | string[];
  highlighted_nodes?: string[];
  highlighted_edges?: string[];
  timestamp: Date;
  isStreaming?: boolean;
  retrieval_trace?: {
    strategy: string;
    steps: Array<{ action: string; duration_ms: number; node_ids: string[] }>;
    metrics: { total_steps: number; total_latency_ms: number };
  };
}

interface ChatInterfaceProps {
  projectId: string;
  onSendMessage: (message: string) => Promise<{
    content: string;
    citations?: Citation[] | string[];
    highlighted_nodes?: string[];
    highlighted_edges?: string[];
  }>;
  onCitationClick?: (citation: Citation | string) => void;
  onHighlightNodes?: (nodeIds: string[]) => void;
  initialMessages?: Message[];
}

const messageVariants = {
  hidden: { opacity: 0, x: -20, filter: 'blur(10px)' },
  visible: {
    opacity: 1,
    x: 0,
    filter: 'blur(0px)',
    transition: { type: 'spring' as const, stiffness: 260, damping: 20 }
  }
};

export function ChatInterface({
  projectId,
  onSendMessage,
  onCitationClick,
  onHighlightNodes,
  initialMessages = [],
}: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>(() => {
    if (initialMessages.length > 0) return initialMessages;
    try {
      const stored = localStorage.getItem(`chat_history_${projectId}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        return parsed.map((m: Record<string, unknown>) => ({
          ...m,
          timestamp: new Date(m.timestamp as string),
        }));
      }
    } catch (e) {
      // Ignore parse errors
    }
    return [];
  });
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    if (messages.length > 0) {
      try {
        const serializable = messages.map(m => ({
          ...m,
          timestamp: m.timestamp.toISOString(),
        }));
        localStorage.setItem(`chat_history_${projectId}`, JSON.stringify(serializable));
      } catch (e) {
        // Ignore storage errors
      }
    }
  }, [messages, projectId]);

  const adjustTextareaHeight = useCallback(() => {
    const textarea = inputRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`; // max ~6 lines
    }
  }, []);

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

    // Reset textarea height after send
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }

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
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: '죄송합니다. 응답 생성 중 오류가 발생했습니다. 다시 시도해 주세요.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-surface-1 border-l border-border">
      {/* Header */}
      <div className="p-6 border-b border-border flex items-center gap-3">
        <div className="w-10 h-10 rounded bg-teal-dim flex items-center justify-center border border-border">
          <Bot className="w-5 h-5 text-teal" />
        </div>
        <div>
          <h2 className="text-sm font-medium text-text-primary tracking-tight">Nexus AI Assistant</h2>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-medium text-text-ghost uppercase tracking-widest">Neural Link Active</span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-hide">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-6">
            <div className="relative">
               <Sparkles className="w-12 h-12 text-teal relative" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-medium text-text-primary">Initiate Knowledge Scan</h3>
              <p className="text-sm text-text-tertiary max-w-[240px]">Explore the literature through the Neural Nexus interface.</p>
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
                'max-w-[90%] p-4 rounded text-sm leading-relaxed',
                msg.role === 'user'
                  ? 'bg-teal text-text-primary'
                  : msg.id.startsWith('error-')
                  ? 'bg-red-500/10 border-red-500/30 text-red-400'
                  : 'bg-surface-2 border border-border text-text-primary'
              )}>
                {msg.role === 'assistant' && !msg.id.startsWith('error-') ? (
                  <div className="prose prose-sm prose-invert max-w-none
                    prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1
                    prose-code:bg-surface-3 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs
                    prose-pre:bg-surface-3 prose-pre:p-3 prose-pre:rounded
                    prose-a:text-teal prose-a:no-underline hover:prose-a:underline
                    prose-strong:text-text-primary prose-em:text-text-secondary">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  msg.content
                )}
                {msg.retrieval_trace && (
                  <details className="mt-2 border-t border-border/50 pt-2">
                    <summary className="text-[10px] text-text-ghost cursor-pointer hover:text-text-tertiary flex items-center gap-1">
                      <Activity className="w-3 h-3" />
                      {msg.retrieval_trace.strategy} search • {msg.retrieval_trace.metrics.total_steps} steps • {msg.retrieval_trace.metrics.total_latency_ms}ms
                    </summary>
                    <div className="mt-1 space-y-1">
                      {msg.retrieval_trace.steps.map((step, idx) => (
                        <div key={idx} className="text-[10px] text-text-ghost font-mono flex justify-between">
                          <span>{step.action}</span>
                          <span>{step.duration_ms}ms • {step.node_ids.length} nodes</span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
              <span className="text-[10px] font-mono text-text-ghost uppercase tracking-tighter">
                {msg.role === 'user' ? 'User' : 'Nexus AI'} • {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-6 bg-surface-2 border-t border-border">
        <div className="relative group">
          <div className="relative bg-surface-2 rounded flex items-end gap-2 p-2 border border-border">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                adjustTextareaHeight();
              }}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
              placeholder="Query the nexus..."
              className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-text-primary placeholder-text-tertiary min-h-[44px] py-3 px-2 resize-none"
              rows={1}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="p-3 rounded bg-surface-2 hover:bg-teal text-text-tertiary hover:text-text-primary transition-all duration-300 disabled:opacity-30"
            >
              <Zap className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
