'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ExternalLink, MessageSquare, Share2, Loader2, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import type { GraphEntity, EntityType, PaperProperties, AuthorProperties, ConceptProperties, MethodProperties, FindingProperties, ResultProperties, ClaimProperties } from '@/types';
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
}> = {
  Paper: {
    bg: 'bg-teal-dim',
    border: 'border-teal',
    text: 'text-teal',
    gradient: 'from-teal to-teal-dim'
  },
  Author: {
    bg: 'bg-surface-2',
    border: 'border-node-author',
    text: 'text-node-author',
    gradient: 'from-node-author to-node-author'
  },
  Concept: {
    bg: 'bg-surface-2',
    border: 'border-node-concept',
    text: 'text-node-concept',
    gradient: 'from-node-concept to-node-concept'
  },
  Method: {
    bg: 'bg-surface-2',
    border: 'border-copper',
    text: 'text-copper',
    gradient: 'from-copper to-copper'
  },
  Finding: {
    bg: 'bg-surface-2',
    border: 'border-node-finding',
    text: 'text-node-finding',
    gradient: 'from-node-finding to-node-finding'
  },
  Result: {
    bg: 'bg-surface-2',
    border: 'border-node-finding',
    text: 'text-node-finding',
    gradient: 'from-node-finding to-node-finding'
  },
  Claim: {
    bg: 'bg-surface-2',
    border: 'border-pink-500',
    text: 'text-pink-500',
    gradient: 'from-pink-500 to-pink-500'
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
    bg: 'bg-surface-2',
    border: 'border-border',
    text: 'text-text-primary',
    gradient: 'from-surface-3 to-surface-3',
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
          <p className="text-sm font-medium text-text-primary mb-1">Abstract</p>
          <p className={clsx(
            "text-sm text-text-secondary leading-relaxed",
            !showFullAbstract && "line-clamp-4"
          )}>
            {props.abstract}
          </p>
          {props.abstract.length > 200 && (
            <button
              onClick={() => setShowFullAbstract(!showFullAbstract)}
              className="text-xs text-teal hover:text-teal mt-1 flex items-center gap-1 font-medium"
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
            <span className="text-text-secondary">Year:</span>{' '}
            <span className="text-text-primary font-medium">{props.year}</span>
          </div>
        )}
        {props.citation_count !== undefined && (
          <div>
            <span className="text-text-secondary">Citations:</span>{' '}
            <span className="text-text-primary font-medium">{props.citation_count}</span>
          </div>
        )}
        {props.source && (
          <div>
            <span className="text-text-secondary">Source:</span>{' '}
            <span className="text-text-primary">{props.source}</span>
          </div>
        )}
        {props.authors && props.authors.length > 0 && (
          <div className="col-span-2">
            <span className="text-text-secondary">Authors:</span>{' '}
            <span className="text-text-primary">{props.authors.slice(0, 3).join(', ')}{props.authors.length > 3 ? ` +${props.authors.length - 3}` : ''}</span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 pt-2">
        {props.doi && (
          <a
            href={`https://doi.org/${props.doi}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-teal hover:text-teal px-2.5 py-1.5 bg-teal-dim rounded font-medium transition-colors"
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
            className="inline-flex items-center gap-1.5 text-sm text-copper hover:text-copper px-2.5 py-1.5 bg-surface-3 rounded font-medium transition-colors"
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
            className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary px-2.5 py-1.5 bg-surface-2 rounded font-medium transition-colors"
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
          <p className="text-sm text-text-secondary mb-0.5">Affiliation</p>
          <p className="text-sm text-text-primary">{props.affiliation}</p>
        </div>
      )}
      {props.orcid && (
        <div>
          <p className="text-sm text-text-secondary mb-0.5">ORCID</p>
          <a
            href={`https://orcid.org/${props.orcid}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-node-author hover:text-node-author flex items-center gap-1 font-medium"
          >
            {props.orcid}
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}
      {props.paper_count !== undefined && (
        <div>
          <p className="text-sm text-text-secondary mb-0.5">Papers in this collection</p>
          <p className="text-sm text-text-primary font-medium">{props.paper_count}</p>
        </div>
      )}
    </div>
  );

  const renderConceptDetails = (props: ConceptProperties) => (
    <div className="space-y-3">
      {props.description && (
        <div>
          <p className="text-sm text-text-secondary mb-0.5">Description</p>
          <p className="text-sm text-text-primary leading-relaxed">{props.description}</p>
        </div>
      )}
      {props.domain && (
        <div>
          <p className="text-sm text-text-secondary mb-0.5">Domain</p>
          <p className="text-sm text-text-primary">{props.domain}</p>
        </div>
      )}
      {props.synonyms && props.synonyms.length > 0 && (
        <div>
          <p className="text-sm text-text-secondary mb-1">Related terms</p>
          <div className="flex flex-wrap gap-1.5">
            {props.synonyms.map((s, i) => (
              <span key={i} className="text-xs bg-surface-3 text-node-concept px-2.5 py-1 rounded-full font-medium">
                {s}
              </span>
            ))}
          </div>
        </div>
      )}
      {props.paper_count !== undefined && (
        <div>
          <p className="text-sm text-text-secondary mb-0.5">Mentioned in</p>
          <p className="text-sm text-text-primary font-medium">{props.paper_count} papers</p>
        </div>
      )}
    </div>
  );

  const renderMethodDetails = (props: MethodProperties) => (
    <div className="space-y-3">
      {props.description && (
        <div>
          <p className="text-sm text-text-secondary mb-0.5">Description</p>
          <p className="text-sm text-text-primary leading-relaxed">{props.description}</p>
        </div>
      )}
      {props.type && (
        <div>
          <p className="text-sm text-text-secondary mb-1">Type</p>
          <span className={clsx(
            "text-xs px-2.5 py-1 rounded-full font-medium",
            props.type === 'quantitative' && 'bg-teal-dim text-teal',
            props.type === 'qualitative' && 'bg-surface-3 text-node-author',
            props.type === 'mixed' && 'bg-surface-3 text-node-concept'
          )}>
            {props.type}
          </span>
        </div>
      )}
      {props.paper_count !== undefined && (
        <div>
          <p className="text-sm text-text-secondary mb-0.5">Used in</p>
          <p className="text-sm text-text-primary font-medium">{props.paper_count} papers</p>
        </div>
      )}
    </div>
  );

  const renderFindingDetails = (props: FindingProperties) => (
    <div className="space-y-3">
      {props.statement && (
        <div>
          <p className="text-sm text-text-secondary mb-0.5">Statement</p>
          <p className="text-sm text-text-primary leading-relaxed">{props.statement}</p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 text-sm">
        {props.effect_size && (
          <div>
            <span className="text-text-secondary">Effect Size:</span>{' '}
            <span className="text-text-primary font-medium">{props.effect_size}</span>
          </div>
        )}
        {props.significance && (
          <div>
            <span className="text-text-secondary">Significance:</span>{' '}
            <span className="text-text-primary">{props.significance}</span>
          </div>
        )}
        {props.confidence !== undefined && (
          <div>
            <span className="text-text-secondary">Confidence:</span>{' '}
            <span className="text-text-primary font-medium">{Math.round(props.confidence * 100)}%</span>
          </div>
        )}
      </div>
      {props.paper_count !== undefined && (
        <div>
          <p className="text-sm text-text-secondary mb-0.5">Supported by</p>
          <p className="text-sm text-text-primary font-medium">{props.paper_count} papers</p>
        </div>
      )}
    </div>
  );

  const renderResultDetails = (props: ResultProperties) => (
    <div className="space-y-3">
      {props.statement && (
        <div>
          <p className="text-sm text-text-secondary mb-0.5">Statement</p>
          <p className="text-sm text-text-primary leading-relaxed">{props.statement}</p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 text-sm">
        {props.metrics && (
          <div>
            <span className="text-text-secondary">Metrics:</span>{' '}
            <span className="text-text-primary font-medium">{props.metrics}</span>
          </div>
        )}
        {props.significance && (
          <div>
            <span className="text-text-secondary">Significance:</span>{' '}
            <span className="text-text-primary">{props.significance}</span>
          </div>
        )}
        {props.confidence !== undefined && (
          <div>
            <span className="text-text-secondary">Confidence:</span>{' '}
            <span className="text-text-primary font-medium">{Math.round(props.confidence * 100)}%</span>
          </div>
        )}
        {props.extraction_section && (
          <div>
            <span className="text-text-secondary">Section:</span>{' '}
            <span className="text-text-primary">{props.extraction_section}</span>
          </div>
        )}
      </div>
      {props.paper_count !== undefined && (
        <div>
          <p className="text-sm text-text-secondary mb-0.5">Reported in</p>
          <p className="text-sm text-text-primary font-medium">{props.paper_count} papers</p>
        </div>
      )}
    </div>
  );

  const renderClaimDetails = (props: ClaimProperties) => (
    <div className="space-y-3">
      {props.statement && (
        <div>
          <p className="text-sm text-text-secondary mb-0.5">Statement</p>
          <p className="text-sm text-text-primary leading-relaxed">{props.statement}</p>
        </div>
      )}
      {props.evidence && (
        <div>
          <p className="text-sm text-text-secondary mb-0.5">Evidence</p>
          <p className="text-sm text-text-primary leading-relaxed">{props.evidence}</p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 text-sm">
        {props.confidence !== undefined && (
          <div>
            <span className="text-text-secondary">Confidence:</span>{' '}
            <span className="text-text-primary font-medium">{Math.round(props.confidence * 100)}%</span>
          </div>
        )}
        {props.extraction_section && (
          <div>
            <span className="text-text-secondary">Section:</span>{' '}
            <span className="text-text-primary">{props.extraction_section}</span>
          </div>
        )}
      </div>
      {props.paper_count !== undefined && (
        <div>
          <p className="text-sm text-text-secondary mb-0.5">Found in</p>
          <p className="text-sm text-text-primary font-medium">{props.paper_count} papers</p>
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
    if (entityType === 'Result') {
      return renderResultDetails(node.properties as ResultProperties);
    }
    if (entityType === 'Claim') {
      return renderClaimDetails(node.properties as ClaimProperties);
    }

    const props = node.properties as Record<string, unknown>;
    return (
      <div className="space-y-3">
        {Object.entries(props).map(([key, value]) => (
          <div key={key}>
            <p className="text-sm text-text-secondary capitalize mb-0.5">
              {key.replace(/_/g, ' ')}
            </p>
            <p className="text-sm text-text-primary">
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
          "bg-surface-1 rounded overflow-hidden z-10",
          "border border-border"
        )}
      >
        <div className={clsx(
          config.bg,
          "px-4 py-3 border-b border-border"
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
                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
                  "bg-gradient-to-r text-text-primary",
                  config.gradient
                )}>
                  <span className="w-1.5 h-1.5 rounded-full bg-text-primary animate-pulse" />
                  {node.entity_type}
                </span>
                {(() => {
                  const props = node.properties as Record<string, unknown>;
                  const paperCount = props?.paper_count;
                  if (node.entity_type !== 'Paper' && paperCount && Number(paperCount) > 0) {
                    return (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-surface-3 text-text-secondary">
                        {String(paperCount)} papers
                      </span>
                    );
                  }
                  return null;
                })()}
              </motion.div>
              <motion.h3
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="font-medium text-text-primary truncate text-lg"
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
                "p-1.5 rounded transition-colors",
                "hover:bg-surface-2"
              )}
              aria-label="Close"
            >
              <X className="w-5 h-5 text-text-tertiary" />
            </motion.button>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="p-4 max-h-64 overflow-y-auto bg-surface-2"
        >
          {renderDetails()}

          <AnimatePresence>
            {aiExplanation && (
              <motion.div
                initial={{ opacity: 0, y: 10, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -10, height: 0 }}
                className="mt-4 p-3 bg-gradient-to-r from-teal-dim to-surface-3 rounded border border-teal"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-teal" />
                  <p className="text-xs font-medium text-teal">AI Analysis</p>
                </div>
                <p className="text-sm text-text-primary leading-relaxed">{aiExplanation}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="px-4 py-3 border-t border-border bg-surface-2 flex gap-2"
        >
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleGetExplanation}
            disabled={isLoadingExplanation}
            className={clsx(
              "flex-1 flex items-center justify-center gap-2 px-4 py-2.5",
              "bg-gradient-to-r from-teal to-node-concept",
              "text-text-primary text-sm font-medium rounded",
              "hover:from-teal hover:to-node-concept",
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
                "bg-surface-1 border border-border",
                "text-text-secondary text-sm font-medium rounded",
                "hover:bg-surface-2 transition-colors"
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
                "bg-surface-1 border border-border",
                "text-text-secondary text-sm font-medium rounded",
                "hover:bg-surface-2 transition-colors"
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
