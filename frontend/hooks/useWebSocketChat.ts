import { useState, useCallback, useRef, useEffect } from 'react';
import type { Citation } from '@/types';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  highlighted_nodes?: string[];
  highlighted_edges?: string[];
  timestamp: Date;
  isStreaming?: boolean;
}

interface WebSocketChatOptions {
  projectId: string;
  conversationId?: string | null;
  onMessage?: (message: ChatMessage) => void;
  onStreamStart?: (messageId: string) => void;
  onStreamChunk?: (messageId: string, chunk: string) => void;
  onStreamEnd?: (messageId: string, fullMessage: ChatMessage) => void;
  onError?: (error: Error) => void;
  onConnectionChange?: (connected: boolean) => void;
}

interface WebSocketChatReturn {
  messages: ChatMessage[];
  isConnected: boolean;
  isStreaming: boolean;
  streamingMessageId: string | null;
  sendMessage: (content: string) => void;
  connect: () => void;
  disconnect: () => void;
  clearMessages: () => void;
}

const WS_RECONNECT_DELAY = 3000;
const WS_MAX_RETRIES = 5;

export function useWebSocketChat(options: WebSocketChatOptions): WebSocketChatReturn {
  const {
    projectId,
    conversationId,
    onMessage,
    onStreamStart,
    onStreamChunk,
    onStreamEnd,
    onError,
    onConnectionChange,
  } = options;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const retriesRef = useRef(0);
  const streamBufferRef = useRef<string>('');

  const getWebSocketUrl = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = process.env.NEXT_PUBLIC_WS_HOST || window.location.host;
    return `${protocol}//${host}/api/chat/ws/${projectId}`;
  }, [projectId]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(getWebSocketUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        retriesRef.current = 0;
        onConnectionChange?.(true);
      };

      ws.onclose = () => {
        setIsConnected(false);
        onConnectionChange?.(false);
        
        if (retriesRef.current < WS_MAX_RETRIES) {
          retriesRef.current++;
          setTimeout(connect, WS_RECONNECT_DELAY);
        }
      };

      ws.onerror = (event) => {
        onError?.(new Error('WebSocket connection error'));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleWebSocketMessage(data);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error('Failed to connect'));
    }
  }, [getWebSocketUrl, onConnectionChange, onError]);

  const handleWebSocketMessage = useCallback((data: {
    type: string;
    message_id?: string;
    content?: string;
    chunk?: string;
    citations?: string[];
    highlighted_nodes?: string[];
    highlighted_edges?: string[];
    error?: string;
  }) => {
    switch (data.type) {
      case 'stream_start': {
        const messageId = data.message_id || `msg-${Date.now()}`;
        setIsStreaming(true);
        setStreamingMessageId(messageId);
        streamBufferRef.current = '';
        
        const newMessage: ChatMessage = {
          id: messageId,
          role: 'assistant',
          content: '',
          timestamp: new Date(),
          isStreaming: true,
        };
        
        setMessages(prev => [...prev, newMessage]);
        onStreamStart?.(messageId);
        break;
      }

      case 'stream_chunk': {
        const chunk = data.chunk || '';
        streamBufferRef.current += chunk;
        
        setMessages(prev => prev.map(msg =>
          msg.id === streamingMessageId
            ? { ...msg, content: streamBufferRef.current }
            : msg
        ));
        
        if (streamingMessageId) {
          onStreamChunk?.(streamingMessageId, chunk);
        }
        break;
      }

      case 'stream_end': {
        const fullContent = data.content || streamBufferRef.current;
        
        const completedMessage: ChatMessage = {
          id: streamingMessageId || `msg-${Date.now()}`,
          role: 'assistant',
          content: fullContent,
          citations: data.citations as Citation[] | undefined,
          highlighted_nodes: data.highlighted_nodes,
          highlighted_edges: data.highlighted_edges,
          timestamp: new Date(),
          isStreaming: false,
        };
        
        setMessages(prev => prev.map(msg =>
          msg.id === streamingMessageId
            ? completedMessage
            : msg
        ));
        
        setIsStreaming(false);
        setStreamingMessageId(null);
        streamBufferRef.current = '';
        
        onStreamEnd?.(completedMessage.id, completedMessage);
        onMessage?.(completedMessage);
        break;
      }

      case 'message': {
        const message: ChatMessage = {
          id: data.message_id || `msg-${Date.now()}`,
          role: 'assistant',
          content: data.content || '',
          citations: data.citations as Citation[] | undefined,
          highlighted_nodes: data.highlighted_nodes,
          highlighted_edges: data.highlighted_edges,
          timestamp: new Date(),
          isStreaming: false,
        };
        
        setMessages(prev => [...prev, message]);
        onMessage?.(message);
        break;
      }

      case 'error': {
        onError?.(new Error(data.error || 'Unknown error'));
        setIsStreaming(false);
        setStreamingMessageId(null);
        break;
      }
    }
  }, [streamingMessageId, onMessage, onStreamStart, onStreamChunk, onStreamEnd, onError]);

  const sendMessage = useCallback((content: string) => {
    if (!content.trim()) return;

    const messageId = `user-${Date.now()}`;
    const userMessage: ChatMessage = {
      id: messageId,
      role: 'user',
      content: content.trim(),
      timestamp: new Date(),
    };
    
    setMessages(prev => [...prev, userMessage]);

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'message',
        message_id: messageId,
        content: content.trim(),
        project_id: projectId,
        conversation_id: conversationId || undefined,
      }));
    } else {
      onError?.(new Error('WebSocket not connected'));
    }
  }, [projectId, conversationId, onError]);

  const disconnect = useCallback(() => {
    retriesRef.current = WS_MAX_RETRIES;
    wsRef.current?.close();
    wsRef.current = null;
    setIsConnected(false);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    messages,
    isConnected,
    isStreaming,
    streamingMessageId,
    sendMessage,
    connect,
    disconnect,
    clearMessages,
  };
}

export function useStreamingText(
  text: string,
  speed: number = 20,
  onComplete?: () => void
): string {
  const [displayedText, setDisplayedText] = useState('');
  const indexRef = useRef(0);
  const completedRef = useRef(false);

  useEffect(() => {
    if (!text) {
      setDisplayedText('');
      indexRef.current = 0;
      completedRef.current = false;
      return;
    }

    if (indexRef.current >= text.length) {
      if (!completedRef.current) {
        completedRef.current = true;
        onComplete?.();
      }
      return;
    }

    const timer = setInterval(() => {
      if (indexRef.current < text.length) {
        setDisplayedText(text.slice(0, indexRef.current + 1));
        indexRef.current++;
      } else {
        clearInterval(timer);
        if (!completedRef.current) {
          completedRef.current = true;
          onComplete?.();
        }
      }
    }, speed);

    return () => clearInterval(timer);
  }, [text, speed, onComplete]);

  useEffect(() => {
    indexRef.current = 0;
    completedRef.current = false;
    setDisplayedText('');
  }, [text]);

  return displayedText;
}
