'use client';

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';
import clsx from 'clsx';
import type { GraphEntity } from '@/types';

interface TimelineViewProps {
  nodes: GraphEntity[];
  onNodeClick?: (node: GraphEntity) => void;
  selectedNodeId?: string;
}

interface YearData {
  year: number;
  papers: GraphEntity[];
  count: number;
}



export function TimelineView({ nodes, onNodeClick, selectedNodeId }: TimelineViewProps) {
  const [zoomLevel, setZoomLevel] = useState(1);
  const [scrollOffset, setScrollOffset] = useState(0);

  const timelineData = useMemo(() => {
    const papers = nodes.filter(n => n.entity_type === 'Paper');
    const yearMap = new Map<number, GraphEntity[]>();

    for (const paper of papers) {
      const year = (paper.properties as { year?: number })?.year;
      if (year && year >= 1990 && year <= 2030) {
        const existing = yearMap.get(year) || [];
        existing.push(paper);
        yearMap.set(year, existing);
      }
    }

    const sortedYears: YearData[] = [];
    const allYears = Array.from(yearMap.keys()).sort();
    
    if (allYears.length === 0) return { years: [], minYear: 2020, maxYear: 2025 };

    const minYear = Math.min(...allYears);
    const maxYear = Math.max(...allYears);

    for (let year = minYear; year <= maxYear; year++) {
      const papers = yearMap.get(year) || [];
      sortedYears.push({ year, papers, count: papers.length });
    }

    return { years: sortedYears, minYear, maxYear };
  }, [nodes]);

  const maxCount = useMemo(() => {
    return Math.max(...timelineData.years.map(y => y.count), 1);
  }, [timelineData]);

  const handleZoomIn = () => setZoomLevel(prev => Math.min(prev * 1.5, 4));
  const handleZoomOut = () => setZoomLevel(prev => Math.max(prev / 1.5, 0.5));
  const handleScrollLeft = () => setScrollOffset(prev => prev - 200);
  const handleScrollRight = () => setScrollOffset(prev => prev + 200);

  if (timelineData.years.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 glass rounded-xl">
        <div className="text-center">
          <Calendar className="w-12 h-12 mx-auto mb-3 text-slate-400" />
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
            No timeline data available
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            Papers need year information to display timeline
          </p>
        </div>
      </div>
    );
  }

  const yearWidth = 80 * zoomLevel;

  return (
    <div className="glass rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-primary-500" />
          <span className="font-semibold text-slate-900 dark:text-white">
            Publication Timeline
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400 ml-2">
            {timelineData.minYear} — {timelineData.maxYear}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleScrollLeft}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <ChevronLeft className="w-4 h-4 text-slate-500" />
          </button>
          <button
            onClick={handleScrollRight}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <ChevronRight className="w-4 h-4 text-slate-500" />
          </button>
          <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-1" />
          <button
            onClick={handleZoomOut}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <ZoomOut className="w-4 h-4 text-slate-500" />
          </button>
          <button
            onClick={handleZoomIn}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <ZoomIn className="w-4 h-4 text-slate-500" />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <motion.div
          animate={{ x: -scrollOffset }}
          transition={{ type: 'spring' as const, stiffness: 300, damping: 30 }}
          className="flex items-end gap-1 px-4 py-6 min-h-[200px]"
          style={{ paddingLeft: 20, paddingRight: 100 }}
        >
          {timelineData.years.map((yearData, index) => {
            const barHeight = (yearData.count / maxCount) * 120 + 20;
            const hasItems = yearData.count > 0;

            return (
              <motion.div
                key={yearData.year}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.02 }}
                className="flex flex-col items-center"
                style={{ width: yearWidth }}
              >
                <AnimatePresence>
                  {hasItems && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: barHeight, opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.02 }}
                      className="relative group cursor-pointer"
                      style={{ width: Math.max(yearWidth * 0.6, 30) }}
                    >
                      <motion.div
                        whileHover={{ scale: 1.05 }}
                        className={clsx(
                          "absolute inset-0 rounded-t-lg",
                          "bg-gradient-to-t from-primary-600 to-primary-400",
                          "shadow-lg shadow-primary-500/20"
                        )}
                        onClick={() => {
                          if (yearData.papers[0] && onNodeClick) {
                            onNodeClick(yearData.papers[0]);
                          }
                        }}
                      />
                      
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        whileHover={{ opacity: 1, y: 0 }}
                        className={clsx(
                          "absolute -top-16 left-1/2 -translate-x-1/2",
                          "glass-panel !p-2 !rounded-lg whitespace-nowrap z-10",
                          "opacity-0 group-hover:opacity-100 transition-opacity"
                        )}
                      >
                        <p className="text-xs font-semibold text-slate-900 dark:text-white">
                          {yearData.count} paper{yearData.count !== 1 ? 's' : ''}
                        </p>
                        <div className="mt-1 max-h-20 overflow-y-auto">
                          {yearData.papers.slice(0, 3).map((paper) => (
                            <p 
                              key={paper.id}
                              className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[150px]"
                            >
                              {paper.name}
                            </p>
                          ))}
                          {yearData.papers.length > 3 && (
                            <p className="text-xs text-slate-400 dark:text-slate-500">
                              +{yearData.papers.length - 3} more
                            </p>
                          )}
                        </div>
                      </motion.div>

                      <div className={clsx(
                        "absolute -top-6 left-1/2 -translate-x-1/2",
                        "flex items-center justify-center",
                        "w-6 h-6 rounded-full",
                        "bg-primary-100 dark:bg-primary-900/50",
                        "text-primary-600 dark:text-primary-400",
                        "text-xs font-bold"
                      )}>
                        {yearData.count}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className={clsx(
                  "h-px w-full my-2",
                  hasItems 
                    ? "bg-primary-300 dark:bg-primary-700" 
                    : "bg-slate-200 dark:bg-slate-700"
                )} />

                <span className={clsx(
                  "text-xs font-mono",
                  hasItems 
                    ? "text-slate-700 dark:text-slate-300 font-semibold" 
                    : "text-slate-400 dark:text-slate-600"
                )}>
                  {yearData.year}
                </span>
              </motion.div>
            );
          })}
        </motion.div>
      </div>

      <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-gradient-to-t from-primary-600 to-primary-400" />
            <span className="text-xs text-slate-500 dark:text-slate-400">Papers</span>
          </div>
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Total: {nodes.filter(n => n.entity_type === 'Paper').length} papers
        </p>
      </div>
    </div>
  );
}
