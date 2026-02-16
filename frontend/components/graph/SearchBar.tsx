'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, Loader2, FileText, User, Lightbulb, Beaker, Trophy, Command } from 'lucide-react';
import clsx from 'clsx';
import { debounce } from '@/lib/utils';
import type { SearchResult, EntityType } from '@/types';

interface SearchBarProps {
  onSearch: (query: string) => Promise<SearchResult[]>;
  onSelectResult: (result: SearchResult) => void;
  placeholder?: string;
}

const entityTypeConfig: Record<EntityType, { color: string; icon: any }> = {
  Paper: { color: 'text-teal', icon: <FileText className="w-3.5 h-3.5" /> },
  Author: { color: 'text-node-author', icon: <User className="w-3.5 h-3.5" /> },
  Concept: { color: 'text-node-concept', icon: <Lightbulb className="w-3.5 h-3.5" /> },
  Method: { color: 'text-copper', icon: <Beaker className="w-3.5 h-3.5" /> },
  Finding: { color: 'text-node-finding', icon: <Trophy className="w-3.5 h-3.5" /> },
};

export function SearchBar({
  onSearch,
  onSelectResult,
  placeholder = 'Query the Nexus...',
}: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const debouncedSearch = useCallback(
    debounce(async (searchQuery: string) => {
      if (!searchQuery.trim()) {
        setResults([]);
        setIsLoading(false);
        return;
      }
      try {
        const searchResults = await onSearch(searchQuery);
        setResults(searchResults);
      } catch (error) {
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 300),
    [onSearch]
  );

  return (
    <div className="relative group w-full max-w-md">
      <div className="relative bg-surface-2 rounded overflow-hidden border border-border">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-ghost" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsLoading(true);
            setIsOpen(true);
            debouncedSearch(e.target.value);
          }}
          placeholder={placeholder}
          className="w-full pl-12 pr-12 py-3 bg-transparent border-none focus:ring-0 text-sm text-text-primary placeholder-text-ghost font-medium"
        />
        <div className="absolute right-4 top-1/2 -translate-y-1/2">
           {isLoading ? (
             <Loader2 className="w-4 h-4 text-node-concept animate-spin" />
           ) : (
             <div className="flex items-center gap-1 px-2 py-1 rounded bg-surface-3 text-[10px] font-medium text-text-ghost border border-border uppercase tracking-tighter">
               <Command className="w-2.5 h-2.5" />
               <span>K</span>
             </div>
           )}
        </div>
      </div>

      <AnimatePresence>
        {isOpen && query && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute top-full left-0 right-0 mt-2 z-50 bg-surface-2 rounded overflow-hidden border border-border"
          >
            <div className="max-h-[400px] overflow-y-auto scrollbar-hide py-2">
              {results.length > 0 ? (
                results.map((result) => (
                  <button
                    key={result.id}
                    onClick={() => {
                      onSelectResult(result);
                      setIsOpen(false);
                      setQuery('');
                    }}
                    className="w-full px-6 py-4 text-left hover:bg-surface-2 flex items-center gap-4 transition-colors group"
                  >
                    <div className={clsx(
                      "w-10 h-10 rounded bg-surface-3 flex items-center justify-center transition-colors group-hover:scale-110",
                      entityTypeConfig[result.entity_type]?.color || 'text-text-tertiary'
                    )}>
                      {entityTypeConfig[result.entity_type]?.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">{result.name}</p>
                      <p className={clsx("text-[10px] font-medium uppercase tracking-widest mt-0.5 opacity-50", entityTypeConfig[result.entity_type]?.color)}>
                        {result.entity_type}
                      </p>
                    </div>
                  </button>
                ))
              ) : !isLoading && (
                <div className="px-6 py-8 text-center">
                  <p className="text-sm text-text-ghost">No signals detected in the nexus.</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
