'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Filter, ChevronDown, ChevronUp, X, RotateCcw, Check, Sliders } from 'lucide-react';
import clsx from 'clsx';
import type { EntityType } from '@/types';

interface FilterPanelProps {
  entityTypes: EntityType[];
  selectedTypes: EntityType[];
  onTypeChange: (types: EntityType[]) => void;
  yearRange?: [number, number];
  onYearRangeChange?: (range: [number, number]) => void;
  minYear?: number;
  maxYear?: number;
  onReset?: () => void;
  nodeCountsByType?: Record<EntityType, number>;
}

const entityTypeConfig: Record<EntityType, {
  color: string;
  bg: string;
  gradient: string;
}> = {
  Paper: {
    color: '#14b8a6',
    bg: 'bg-teal-dim',
    gradient: 'from-teal to-teal-dim'
  },
  Author: {
    color: '#10b981',
    bg: 'bg-surface-3',
    gradient: 'from-node-author to-node-author'
  },
  Concept: {
    color: '#8b5cf6',
    bg: 'bg-surface-3',
    gradient: 'from-node-concept to-node-concept'
  },
  Method: {
    color: '#d97706',
    bg: 'bg-surface-3',
    gradient: 'from-copper to-copper'
  },
  Finding: {
    color: '#ef4444',
    bg: 'bg-surface-3',
    gradient: 'from-node-finding to-node-finding'
  },
  Result: {
    color: '#ef4444',
    bg: 'bg-surface-3',
    gradient: 'from-red-500 to-red-600'
  },
  Claim: {
    color: '#ec4899',
    bg: 'bg-surface-3',
    gradient: 'from-pink-500 to-pink-600'
  },
};

const panelVariants = {
  collapsed: { height: 'auto' },
  expanded: { height: 'auto' }
};

const contentVariants = {
  hidden: { opacity: 0, height: 0 },
  visible: { 
    opacity: 1, 
    height: 'auto',
    transition: {
      height: { duration: 0.3 },
      opacity: { duration: 0.2, delay: 0.1 }
    }
  },
  exit: { 
    opacity: 0, 
    height: 0,
    transition: {
      height: { duration: 0.2 },
      opacity: { duration: 0.1 }
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, x: 10 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { delay: i * 0.05 }
  })
};

export function FilterPanel({
  entityTypes,
  selectedTypes,
  onTypeChange,
  yearRange,
  onYearRangeChange,
  minYear = 2015,
  maxYear = 2025,
  onReset,
  nodeCountsByType,
}: FilterPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const toggleType = (type: EntityType) => {
    if (selectedTypes.includes(type)) {
      onTypeChange(selectedTypes.filter((t) => t !== type));
    } else {
      onTypeChange([...selectedTypes, type]);
    }
  };

  const selectAll = () => {
    onTypeChange([...entityTypes]);
  };

  const clearAll = () => {
    onTypeChange([]);
  };

  const hasActiveFilters = selectedTypes.length < entityTypes.length || yearRange !== null;
  const totalNodes = nodeCountsByType 
    ? Object.values(nodeCountsByType).reduce((a, b) => a + b, 0)
    : 0;
  const filteredNodes = nodeCountsByType
    ? selectedTypes.reduce((sum, type) => sum + (nodeCountsByType[type] || 0), 0)
    : 0;

  return (
    <motion.div
      variants={panelVariants}
      animate={isExpanded ? 'expanded' : 'collapsed'}
      className={clsx(
        "absolute top-4 right-4 w-80 z-10",
        "bg-surface-1 rounded overflow-hidden",
        "border border-border"
      )}
    >
      <motion.button
        whileHover={{ backgroundColor: 'rgba(0,0,0,0.02)' }}
        onClick={() => setIsExpanded(!isExpanded)}
        className={clsx(
          "w-full flex items-center justify-between p-4",
          "transition-colors"
        )}
      >
        <div className="flex items-center gap-3">
          <div className={clsx(
            "p-2 rounded",
            hasActiveFilters
              ? "bg-teal-dim"
              : "bg-surface-2"
          )}>
            <Sliders className={clsx(
              "w-4 h-4",
              hasActiveFilters
                ? "text-teal"
                : "text-text-tertiary"
            )} />
          </div>
          <div className="text-left">
            <span className="font-medium text-text-primary block">
              Filters
            </span>
            <span className="text-xs text-text-secondary">
              {filteredNodes.toLocaleString()} / {totalNodes.toLocaleString()} nodes
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="px-2 py-0.5 bg-teal text-text-primary text-xs font-medium rounded-full"
            >
              Active
            </motion.span>
          )}
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown className="w-5 h-5 text-text-tertiary" />
          </motion.div>
        </div>
      </motion.button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            variants={contentVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="overflow-hidden"
          >
            <div className="p-4 pt-0 space-y-4">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-text-primary">
                    Node Types
                  </span>
                  <div className="flex gap-3">
                    <button
                      onClick={selectAll}
                      className="text-xs font-medium text-teal hover:text-teal transition-colors"
                    >
                      Select all
                    </button>
                    <button
                      onClick={clearAll}
                      className="text-xs font-medium text-text-ghost hover:text-text-secondary transition-colors"
                    >
                      Clear
                    </button>
                  </div>
                </div>
                {/* Quick Filter Presets */}
                <div className="flex gap-1.5 mb-3">
                  <button
                    onClick={() => onTypeChange(['Concept', 'Method', 'Finding', 'Result', 'Claim'] as EntityType[])}
                    className="px-2 py-1 text-[10px] font-medium bg-surface-2 hover:bg-surface-3 text-text-tertiary rounded border border-border transition-colors"
                  >
                    Concepts
                  </button>
                  <button
                    onClick={() => onTypeChange(['Paper', 'Author'] as EntityType[])}
                    className="px-2 py-1 text-[10px] font-medium bg-surface-2 hover:bg-surface-3 text-text-tertiary rounded border border-border transition-colors"
                  >
                    Papers
                  </button>
                  <button
                    onClick={selectAll}
                    className="px-2 py-1 text-[10px] font-medium bg-surface-2 hover:bg-surface-3 text-text-tertiary rounded border border-border transition-colors"
                  >
                    All
                  </button>
                </div>
                <div className="space-y-2">
                  {entityTypes.map((type, index) => {
                    const config = entityTypeConfig[type];
                    const isSelected = selectedTypes.includes(type);
                    const count = nodeCountsByType?.[type] || 0;

                    return (
                      <motion.button
                        key={type}
                        custom={index}
                        variants={itemVariants}
                        initial="hidden"
                        animate="visible"
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                        onClick={() => toggleType(type)}
                        className={clsx(
                          "w-full flex items-center justify-between px-3 py-2.5 rounded text-sm transition-all",
                          isSelected
                            ? `${config.bg} border-2`
                            : "bg-surface-2 border-2 border-transparent hover:bg-surface-3"
                        )}
                        style={{
                          borderColor: isSelected ? config.color : 'transparent'
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <motion.div
                            animate={{
                              scale: isSelected ? 1 : 0.8,
                              opacity: isSelected ? 1 : 0.5
                            }}
                            className={clsx(
                              "w-3 h-3 rounded-full",
                              "bg-gradient-to-br",
                              config.gradient
                            )}
                          />
                          <span className={clsx(
                            "font-medium",
                            isSelected
                              ? "text-text-primary"
                              : "text-text-ghost"
                          )}>
                            {type}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={clsx(
                            "text-xs font-mono",
                            isSelected
                              ? "text-text-secondary"
                              : "text-text-ghost"
                          )}>
                            {count.toLocaleString()}
                          </span>
                          <motion.div
                            initial={false}
                            animate={{
                              scale: isSelected ? 1 : 0,
                              opacity: isSelected ? 1 : 0
                            }}
                            className={clsx(
                              "w-5 h-5 rounded-full flex items-center justify-center",
                              "bg-gradient-to-br",
                              config.gradient
                            )}
                          >
                            <Check className="w-3 h-3 text-text-primary" />
                          </motion.div>
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              {onYearRangeChange && yearRange && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <span className="text-sm font-medium text-text-primary block mb-3">
                    Year Range
                  </span>
                  <div className="flex items-center gap-3">
                    <div className="relative flex-1">
                      <input
                        type="number"
                        min={minYear}
                        max={yearRange[1]}
                        value={yearRange[0]}
                        onChange={(e) =>
                          onYearRangeChange([parseInt(e.target.value), yearRange[1]])
                        }
                        className={clsx(
                          "w-full px-3 py-2 rounded text-sm font-mono",
                          "bg-surface-2",
                          "border border-border",
                          "focus:ring-2 focus:ring-teal focus:border-transparent",
                          "text-text-primary",
                          "transition-all"
                        )}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-tertiary">
                        from
                      </span>
                    </div>
                    <div className="text-text-tertiary">—</div>
                    <div className="relative flex-1">
                      <input
                        type="number"
                        min={yearRange[0]}
                        max={maxYear}
                        value={yearRange[1]}
                        onChange={(e) =>
                          onYearRangeChange([yearRange[0], parseInt(e.target.value)])
                        }
                        className={clsx(
                          "w-full px-3 py-2 rounded text-sm font-mono",
                          "bg-surface-2",
                          "border border-border",
                          "focus:ring-2 focus:ring-teal focus:border-transparent",
                          "text-text-primary",
                          "transition-all"
                        )}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-tertiary">
                        to
                      </span>
                    </div>
                  </div>
                </motion.div>
              )}

              {hasActiveFilters && onReset && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="pt-3 border-t border-border"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-text-secondary">
                      {selectedTypes.length} of {entityTypes.length} types selected
                    </p>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={onReset}
                      className={clsx(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded",
                        "text-xs font-medium",
                        "bg-surface-2",
                        "text-text-tertiary",
                        "hover:bg-surface-3",
                        "transition-colors"
                      )}
                    >
                      <RotateCcw className="w-3 h-3" />
                      Reset filters
                    </motion.button>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
