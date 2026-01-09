'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ExternalLink, MessageSquare, Share2, Loader2, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import type { GraphEntity, EntityType, PaperProperties, AuthorProperties, ConceptProperties, MethodProperties, FindingProperties } from '@/types';
import { api } from '@/lib/api';

interface NodeDetailsProps {
  node: GraphEntity | null;
  projectId: string;
  onClose: () => void;
  onAskAbout?: (nodeId: string, nodeName: string) => void;
  onShowConnections?: (nodeId: string) => void;
}

const entityTypeConfig: Record<EntityType, { 
  bg: string; 
  border: string; 
  text: string; 
  gradient: string;
  darkBg: string;
}> = {
  Paper: { 
    bg: 'bg-blue-50', 
    border: 'border-blue-200', 
    text: 'text-blue-700',
    gradient: 'from-blue-500 to-blue-600',
    darkBg: 'dark:bg-blue-950/30'
  },
  Author: { 
    bg: 'bg-emerald-50', 
    border: 'border-emerald-200', 
    text: 'text-emerald-700',
    gradient: 'from-emerald-500 to-emerald-600',
    darkBg: 'dark:bg-emerald-950/30'
  },
  Concept: { 
    bg: 'bg-violet-50', 
    border: 'border-violet-200', 
    text: 'text-violet-700',
    gradient: 'from-violet-500 to-violet-600',
    darkBg: 'dark:bg-violet-950/30'
  },
  Method: { 
    bg: 'bg-amber-50', 
    border: 'border-amber-200', 
    text: 'text-amber-700',
    gradient: 'from-amber-500 to-amber-600',
    darkBg: 'dark:bg-amber-950/30'
  },
  Finding: { 
    bg: 'bg-rose-50', 
    border: 'border-rose-200', 
    text: 'text-rose-700',
    gradient: 'from-rose-500 to-rose-600',
    darkBg: 'dark:bg-rose-950/30'
  },
};

const slideVariants = {
  hidden: { 
    x: '-100%', 
    opacity: 0,
  },
  visible: { 
    x: 0, 
    opacity: 1,
    transition: {
      type: 'spring' as const,
      stiffness: 300,
      damping: 30,
    }
  },
  exit: { 
    x: '-100%', 
    opacity: 0,
    transition: {
      duration: 0.2,
    }
  }
};

export function NodeDetails({
  node,
  projectId,
  onClose,
  onAskAbout,
  onShowConnections,
}: NodeDetailsProps) {
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [isLoadingExplanation, setIsLoadingExplanation] = useState(false);
  const [showFullAbstract, setShowFullAbstract] = useState(false);

  if (!node) return null;

  const config = entityTypeConfig[node.entity_type] || {
    bg: 'bg-gray-50',
    border: 'border-gray-200',
    text: 'text-gray-700',
    icon: 'fa-circle',
  };

  const handleGetExplanation = async () => {
    setIsLoadingExplanation(true);
    try {
      const result = await api.explainNode(node.id, projectId);
      setAiExplanation(result.explanation);
    } catch (error) {
      console.error('Failed to get AI explanation:', error);
      setAiExplanation('AI 설명을 가져오는데 실패했습니다.');
    } finally {
      setIsLoadingExplanation(false);
    }
  };

  const renderPaperDetails = (props: PaperProperties) => (
    <div className="space-y-3">
      {props.abstract && (
        <div>
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Abstract</p>
          <p className={clsx(
            "text-sm text-slate-600 dark:text-slate-400 leading-relaxed",
            !showFullAbstract && "line-clamp-4"
          )}>
            {props.abstract}
          </p>
          {props.abstract.length > 200 && (
            <button
              onClick={() => setShowFullAbstract(!showFullAbstract)}
              className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-300 mt-1 flex items-center gap-1 font-medium"
            >
              {showFullAbstract ? (
                <>
                  <ChevronUp className="w-3 h-3" /> Show less
                </>
              ) : (
                <>
                  <ChevronDown className="w-3 h-3" /> Show more
                </>
              )}
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 text-sm">
        {props.year && (
          <div>
            <span className="text-slate-500 dark:text-slate-400">Year:</span>{' '}
            <span className="text-slate-900 dark:text-slate-100 font-medium">{props.year}</span>
          </div>
        )}
        {props.citation_count !== undefined && (
          <div>
            <span className="text-slate-500 dark:text-slate-400">Citations:</span>{' '}
            <span className="text-slate-900 dark:text-slate-100 font-medium">{props.citation_count}</span>
          </div>
        )}
        {props.source && (
          <div>
            <span className="text-slate-500 dark:text-slate-400">Source:</span>{' '}
            <span className="text-slate-900 dark:text-slate-100">{props.source}</span>
          </div>
        )}
        {props.authors && props.authors.length > 0 && (
          <div className="col-span-2">
            <span className="text-slate-500 dark:text-slate-400">Authors:</span>{' '}
            <span className="text-slate-900 dark:text-slate-100">{props.authors.slice(0, 3).join(', ')}{props.authors.length > 3 ? ` +${props.authors.length - 3}` : ''}</span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 pt-2">
        {props.doi && (
          <a
            href={`https://doi.org/${props.doi}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 px-2.5 py-1.5 bg-blue-50 dark:bg-blue-950/30 rounded-lg font-medium transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            DOI
          </a>
        )}
        {props.arxiv_id && (
          <a
            href={`https://arxiv.org/abs/${props.arxiv_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-orange-600 dark:text-orange-400 hover:text-orange-800 dark:hover:text-orange-300 px-2.5 py-1.5 bg-orange-50 dark:bg-orange-950/30 rounded-lg font-medium transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            arXiv
          </a>
        )}
        {props.url && !props.doi && !props.arxiv_id && (
          <a
            href={props.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg font-medium transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Link
          </a>
        )}
      </div>
    </div>
  );

  const renderAuthorDetails = (props: AuthorProperties) => (
    <div className="space-y-3">
      {props.affiliation && (
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-0.5">Affiliation</p>
          <p className="text-sm text-slate-900 dark:text-slate-100">{props.affiliation}</p>
        </div>
      )}
      {props.orcid && (
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-0.5">ORCID</p>
          <a
            href={`https://orcid.org/${props.orcid}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-emerald-600 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 flex items-center gap-1 font-medium"
          >
            {props.orcid}
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}
      {props.paper_count !== undefined && (
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-0.5">Papers in this collection</p>
          <p className="text-sm text-slate-900 dark:text-slate-100 font-semibold">{props.paper_count}</p>
        </div>
      )}
    </div>
  );

  const renderConceptDetails = (props: ConceptProperties) => (
    <div className="space-y-3">
      {props.description && (
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-0.5">Description</p>
          <p className="text-sm text-slate-900 dark:text-slate-100 leading-relaxed">{props.description}</p>
        </div>
      )}
      {props.domain && (
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-0.5">Domain</p>
          <p className="text-sm text-slate-900 dark:text-slate-100">{props.domain}</p>
        </div>
      )}
      {props.synonyms && props.synonyms.length > 0 && (
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Related terms</p>
          <div className="flex flex-wrap gap-1.5">
            {props.synonyms.map((s, i) => (
              <span key={i} className="text-xs bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 px-2.5 py-1 rounded-full font-medium">
                {s}
              </span>
            ))}
          </div>
        </div>
      )}
      {props.paper_count !== undefined && (
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-0.5">Mentioned in</p>
          <p className="text-sm text-slate-900 dark:text-slate-100 font-semibold">{props.paper_count} papers</p>
        </div>
      )}
    </div>
  );

  const renderMethodDetails = (props: MethodProperties) => (
    <div className="space-y-3">
      {props.description && (
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-0.5">Description</p>
          <p className="text-sm text-slate-900 dark:text-slate-100 leading-relaxed">{props.description}</p>
        </div>
      )}
      {props.type && (
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Type</p>
          <span className={clsx(
            "text-xs px-2.5 py-1 rounded-full font-medium",
            props.type === 'quantitative' && 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
            props.type === 'qualitative' && 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
            props.type === 'mixed' && 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
          )}>
            {props.type}
          </span>
        </div>
      )}
      {props.paper_count !== undefined && (
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-0.5">Used in</p>
          <p className="text-sm text-slate-900 dark:text-slate-100 font-semibold">{props.paper_count} papers</p>
        </div>
      )}
    </div>
  );

  const renderFindingDetails = (props: FindingProperties) => (
    <div className="space-y-3">
      {props.statement && (
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-0.5">Statement</p>
          <p className="text-sm text-slate-900 dark:text-slate-100 leading-relaxed">{props.statement}</p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 text-sm">
        {props.effect_size && (
          <div>
            <span className="text-slate-500 dark:text-slate-400">Effect Size:</span>{' '}
            <span className="text-slate-900 dark:text-slate-100 font-medium">{props.effect_size}</span>
          </div>
        )}
        {props.significance && (
          <div>
            <span className="text-slate-500 dark:text-slate-400">Significance:</span>{' '}
            <span className="text-slate-900 dark:text-slate-100">{props.significance}</span>
          </div>
        )}
        {props.confidence !== undefined && (
          <div>
            <span className="text-slate-500 dark:text-slate-400">Confidence:</span>{' '}
            <span className="text-slate-900 dark:text-slate-100 font-medium">{Math.round(props.confidence * 100)}%</span>
          </div>
        )}
      </div>
      {props.paper_count !== undefined && (
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-0.5">Supported by</p>
          <p className="text-sm text-slate-900 dark:text-slate-100 font-semibold">{props.paper_count} papers</p>
        </div>
      )}
    </div>
  );

  const renderDetails = () => {
    const entityType = node.entity_type;

    if (entityType === 'Paper') {
      return renderPaperDetails(node.properties as PaperProperties);
    }
    if (entityType === 'Author') {
      return renderAuthorDetails(node.properties as AuthorProperties);
    }
    if (entityType === 'Concept') {
      return renderConceptDetails(node.properties as ConceptProperties);
    }
    if (entityType === 'Method') {
      return renderMethodDetails(node.properties as MethodProperties);
    }
    if (entityType === 'Finding') {
      return renderFindingDetails(node.properties as FindingProperties);
    }

    const props = node.properties as Record<string, unknown>;
    return (
      <div className="space-y-3">
        {Object.entries(props).map(([key, value]) => (
          <div key={key}>
            <p className="text-sm text-slate-500 dark:text-slate-400 capitalize mb-0.5">
              {key.replace(/_/g, ' ')}
            </p>
            <p className="text-sm text-slate-900 dark:text-slate-100">
              {typeof value === 'object' ? JSON.stringify(value) : String(value)}
            </p>
          </div>
        ))}
      </div>
    );
  };

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={node.id}
        variants={slideVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        className={clsx(
          "absolute bottom-4 left-4 max-w-md w-[calc(100%-2rem)] sm:w-96",
          "glass rounded-xl shadow-2xl overflow-hidden z-10",
          "border border-white/20 dark:border-slate-700/50"
        )}
      >
        <div className={clsx(
          config.bg, 
          config.darkBg,
          "px-4 py-3 border-b border-slate-200/50 dark:border-slate-700/50"
        )}>
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="flex items-center gap-2 mb-2"
              >
                <span className={clsx(
                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold",
                  "bg-gradient-to-r text-white shadow-sm",
                  config.gradient
                )}>
                  <span className="w-1.5 h-1.5 rounded-full bg-white/80 animate-pulse" />
                  {node.entity_type}
                </span>
              </motion.div>
              <motion.h3 
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="font-semibold text-slate-900 dark:text-white truncate text-lg" 
                title={node.name}
              >
                {node.name}
              </motion.h3>
            </div>
            <motion.button
              whileHover={{ scale: 1.1, rotate: 90 }}
              whileTap={{ scale: 0.9 }}
              onClick={onClose}
              className={clsx(
                "p-1.5 rounded-lg transition-colors",
                "hover:bg-slate-200/50 dark:hover:bg-slate-700/50"
              )}
              aria-label="Close"
            >
              <X className="w-5 h-5 text-slate-500 dark:text-slate-400" />
            </motion.button>
          </div>
        </div>

        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="p-4 max-h-64 overflow-y-auto bg-white/50 dark:bg-slate-900/50"
        >
          {renderDetails()}

          <AnimatePresence>
            {aiExplanation && (
              <motion.div 
                initial={{ opacity: 0, y: 10, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -10, height: 0 }}
                className="mt-4 p-3 bg-gradient-to-r from-primary-50 to-violet-50 dark:from-primary-950/30 dark:to-violet-950/30 rounded-xl border border-primary-100 dark:border-primary-800/30"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                  <p className="text-xs font-semibold text-primary-700 dark:text-primary-300">AI Analysis</p>
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{aiExplanation}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="px-4 py-3 border-t border-slate-200/50 dark:border-slate-700/50 bg-slate-50/80 dark:bg-slate-800/80 flex gap-2"
        >
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleGetExplanation}
            disabled={isLoadingExplanation}
            className={clsx(
              "flex-1 flex items-center justify-center gap-2 px-4 py-2.5",
              "bg-gradient-to-r from-primary-600 to-violet-600",
              "text-white text-sm font-medium rounded-xl",
              "hover:from-primary-700 hover:to-violet-700",
              "shadow-lg shadow-primary-500/25",
              "transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {isLoadingExplanation ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                AI Explain
              </>
            )}
          </motion.button>
          {onAskAbout && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onAskAbout(node.id, node.name)}
              className={clsx(
                "flex items-center justify-center gap-2 px-3 py-2.5",
                "glass border border-slate-200 dark:border-slate-700",
                "text-slate-700 dark:text-slate-300 text-sm font-medium rounded-xl",
                "hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              )}
            >
              <MessageSquare className="w-4 h-4" />
              Chat
            </motion.button>
          )}
          {onShowConnections && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onShowConnections(node.id)}
              className={clsx(
                "flex items-center justify-center gap-2 px-3 py-2.5",
                "glass border border-slate-200 dark:border-slate-700",
                "text-slate-700 dark:text-slate-300 text-sm font-medium rounded-xl",
                "hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              )}
            >
              <Share2 className="w-4 h-4" />
              Expand
            </motion.button>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
