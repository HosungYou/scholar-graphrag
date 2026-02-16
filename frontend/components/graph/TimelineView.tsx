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
      <div className="flex items-center justify-center h-64 bg-surface-1 rounded">
        <div className="text-center">
          <Calendar className="w-12 h-12 mx-auto mb-3 text-text-tertiary" />
          <p className="text-sm font-medium text-text-secondary">
            No timeline data available
          </p>
          <p className="text-xs text-text-ghost mt-1">
            Papers need year information to display timeline
          </p>
        </div>
      </div>
    );
  }

  const yearWidth = 80 * zoomLevel;

  return (
    <div className="bg-surface-1 rounded overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-teal" />
          <span className="font-medium text-text-primary">
            Publication Timeline
          </span>
          <span className="text-xs text-text-secondary ml-2">
            {timelineData.minYear} — {timelineData.maxYear}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleScrollLeft}
            className="p-1.5 rounded hover:bg-surface-2 transition-colors"
          >
            <ChevronLeft className="w-4 h-4 text-text-ghost" />
          </button>
          <button
            onClick={handleScrollRight}
            className="p-1.5 rounded hover:bg-surface-2 transition-colors"
          >
            <ChevronRight className="w-4 h-4 text-text-ghost" />
          </button>
          <div className="w-px h-4 bg-border mx-1" />
          <button
            onClick={handleZoomOut}
            className="p-1.5 rounded hover:bg-surface-2 transition-colors"
          >
            <ZoomOut className="w-4 h-4 text-text-ghost" />
          </button>
          <button
            onClick={handleZoomIn}
            className="p-1.5 rounded hover:bg-surface-2 transition-colors"
          >
            <ZoomIn className="w-4 h-4 text-text-ghost" />
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
                          "absolute inset-0 rounded-t",
                          "bg-gradient-to-t from-teal to-teal-dim"
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
                          "bg-surface-2 p-2 rounded whitespace-nowrap z-10 border border-border",
                          "opacity-0 group-hover:opacity-100 transition-opacity"
                        )}
                      >
                        <p className="text-xs font-medium text-text-primary">
                          {yearData.count} paper{yearData.count !== 1 ? 's' : ''}
                        </p>
                        <div className="mt-1 max-h-20 overflow-y-auto">
                          {yearData.papers.slice(0, 3).map((paper) => (
                            <p
                              key={paper.id}
                              className="text-xs text-text-secondary truncate max-w-[150px]"
                            >
                              {paper.name}
                            </p>
                          ))}
                          {yearData.papers.length > 3 && (
                            <p className="text-xs text-text-ghost">
                              +{yearData.papers.length - 3} more
                            </p>
                          )}
                        </div>
                      </motion.div>

                      <div className={clsx(
                        "absolute -top-6 left-1/2 -translate-x-1/2",
                        "flex items-center justify-center",
                        "w-6 h-6 rounded-full",
                        "bg-teal-dim",
                        "text-teal",
                        "text-xs font-medium"
                      )}>
                        {yearData.count}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className={clsx(
                  "h-px w-full my-2",
                  hasItems
                    ? "bg-teal"
                    : "bg-border"
                )} />

                <span className={clsx(
                  "text-xs font-mono",
                  hasItems
                    ? "text-text-primary font-medium"
                    : "text-text-ghost"
                )}>
                  {yearData.year}
                </span>
              </motion.div>
            );
          })}
        </motion.div>
      </div>

      <div className="px-4 py-3 border-t border-border flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-gradient-to-t from-teal to-teal-dim" />
            <span className="text-xs text-text-secondary">Papers</span>
          </div>
        </div>
        <p className="text-xs text-text-ghost">
          Total: {nodes.filter(n => n.entity_type === 'Paper').length} papers
        </p>
      </div>
    </div>
  );
}
