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
  darkBg: string;
  gradient: string;
}> = {
  Paper: { 
    color: '#3b82f6',
    bg: 'bg-blue-100', 
    darkBg: 'dark:bg-blue-900/30',
    gradient: 'from-blue-500 to-blue-600'
  },
  Author: { 
    color: '#10b981',
    bg: 'bg-emerald-100', 
    darkBg: 'dark:bg-emerald-900/30',
    gradient: 'from-emerald-500 to-emerald-600'
  },
  Concept: { 
    color: '#8b5cf6',
    bg: 'bg-violet-100', 
    darkBg: 'dark:bg-violet-900/30',
    gradient: 'from-violet-500 to-violet-600'
  },
  Method: { 
    color: '#f59e0b',
    bg: 'bg-amber-100', 
    darkBg: 'dark:bg-amber-900/30',
    gradient: 'from-amber-500 to-amber-600'
  },
  Finding: { 
    color: '#ef4444',
    bg: 'bg-rose-100', 
    darkBg: 'dark:bg-rose-900/30',
    gradient: 'from-rose-500 to-rose-600'
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
        "glass rounded-xl shadow-xl overflow-hidden",
        "border border-white/20 dark:border-slate-700/50"
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
            "p-2 rounded-lg",
            hasActiveFilters 
              ? "bg-primary-100 dark:bg-primary-900/30" 
              : "bg-slate-100 dark:bg-slate-800"
          )}>
            <Sliders className={clsx(
              "w-4 h-4",
              hasActiveFilters 
                ? "text-primary-600 dark:text-primary-400" 
                : "text-slate-500 dark:text-slate-400"
            )} />
          </div>
          <div className="text-left">
            <span className="font-semibold text-slate-900 dark:text-white block">
              Filters
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {filteredNodes.toLocaleString()} / {totalNodes.toLocaleString()} nodes
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <motion.span 
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="px-2 py-0.5 bg-primary-500 text-white text-xs font-medium rounded-full"
            >
              Active
            </motion.span>
          )}
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown className="w-5 h-5 text-slate-400" />
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
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Node Types
                  </span>
                  <div className="flex gap-3">
                    <button
                      onClick={selectAll}
                      className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-300 transition-colors"
                    >
                      Select all
                    </button>
                    <button
                      onClick={clearAll}
                      className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                    >
                      Clear
                    </button>
                  </div>
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
                          "w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-all",
                          isSelected
                            ? `${config.bg} ${config.darkBg} border-2`
                            : "bg-slate-50 dark:bg-slate-800/50 border-2 border-transparent hover:bg-slate-100 dark:hover:bg-slate-700/50"
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
                              ? "text-slate-900 dark:text-white" 
                              : "text-slate-500 dark:text-slate-400"
                          )}>
                            {type}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={clsx(
                            "text-xs font-mono",
                            isSelected 
                              ? "text-slate-600 dark:text-slate-300" 
                              : "text-slate-400 dark:text-slate-500"
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
                            <Check className="w-3 h-3 text-white" />
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
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300 block mb-3">
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
                          "w-full px-3 py-2 rounded-lg text-sm font-mono",
                          "bg-slate-50 dark:bg-slate-800",
                          "border border-slate-200 dark:border-slate-700",
                          "focus:ring-2 focus:ring-primary-500 focus:border-transparent",
                          "text-slate-900 dark:text-white",
                          "transition-all"
                        )}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                        from
                      </span>
                    </div>
                    <div className="text-slate-400">—</div>
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
                          "w-full px-3 py-2 rounded-lg text-sm font-mono",
                          "bg-slate-50 dark:bg-slate-800",
                          "border border-slate-200 dark:border-slate-700",
                          "focus:ring-2 focus:ring-primary-500 focus:border-transparent",
                          "text-slate-900 dark:text-white",
                          "transition-all"
                        )}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
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
                  className="pt-3 border-t border-slate-200 dark:border-slate-700"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {selectedTypes.length} of {entityTypes.length} types selected
                    </p>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={onReset}
                      className={clsx(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg",
                        "text-xs font-medium",
                        "bg-slate-100 dark:bg-slate-800",
                        "text-slate-600 dark:text-slate-400",
                        "hover:bg-slate-200 dark:hover:bg-slate-700",
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
