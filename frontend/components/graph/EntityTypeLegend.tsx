'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface EntityTypeLegendProps {
  visibleTypes?: string[];
  className?: string;
}

// Shape icons as simple SVG representations
const SHAPE_ICONS: Record<string, React.ReactNode> = {
  Concept: (
    <svg width="14" height="14" viewBox="0 0 14 14">
      <circle cx="7" cy="7" r="5" fill="currentColor" opacity="0.9" />
    </svg>
  ),
  Method: (
    <svg width="14" height="14" viewBox="0 0 14 14">
      <rect x="2" y="2" width="10" height="10" fill="currentColor" opacity="0.9" />
    </svg>
  ),
  Finding: (
    <svg width="14" height="14" viewBox="0 0 14 14">
      <polygon points="7,1 13,7 7,13 1,7" fill="currentColor" opacity="0.9" />
    </svg>
  ),
  Problem: (
    <svg width="14" height="14" viewBox="0 0 14 14">
      <polygon points="7,1 12,13 2,13" fill="currentColor" opacity="0.9" />
    </svg>
  ),
  Innovation: (
    <svg width="14" height="14" viewBox="0 0 14 14">
      <polygon points="7,0 9,5 14,5 10,8 12,14 7,10 2,14 4,8 0,5 5,5" fill="currentColor" opacity="0.9" />
    </svg>
  ),
  Limitation: (
    <svg width="14" height="14" viewBox="0 0 14 14">
      <polygon points="7,2 12,12 2,12" fill="currentColor" opacity="0.9" />
    </svg>
  ),
  Dataset: (
    <svg width="14" height="14" viewBox="0 0 14 14">
      <rect x="3" y="2" width="8" height="10" rx="1" fill="currentColor" opacity="0.9" />
    </svg>
  ),
  Metric: (
    <svg width="14" height="14" viewBox="0 0 14 14">
      <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="2.5" opacity="0.9" />
    </svg>
  ),
};

const ENTITY_TYPE_COLORS: Record<string, string> = {
  Concept: '#8B5CF6',
  Method: '#F59E0B',
  Finding: '#10B981',
  Problem: '#EF4444',
  Innovation: '#14B8A6',
  Limitation: '#F97316',
  Dataset: '#3B82F6',
  Metric: '#EC4899',
};

const ENTITY_TYPE_LABELS: Record<string, string> = {
  Concept: '개념',
  Method: '방법',
  Finding: '발견',
  Problem: '문제',
  Innovation: '혁신',
  Limitation: '한계',
  Dataset: '데이터',
  Metric: '지표',
};

export default function EntityTypeLegend({ visibleTypes, className = '' }: EntityTypeLegendProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const types = visibleTypes || Object.keys(ENTITY_TYPE_COLORS);

  return (
    <div className={`absolute bottom-4 left-4 z-10 ${className}`}>
      <div className="bg-[#161b22]/90 backdrop-blur-sm border border-[#30363d] rounded-lg overflow-hidden">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="flex items-center justify-between w-full px-3 py-2 text-xs font-mono text-[#8b949e] hover:text-[#c9d1d9] transition-colors"
        >
          <span>Entity Types</span>
          {isCollapsed ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>

        {!isCollapsed && (
          <div className="px-3 pb-2 space-y-1">
            {types.map((type) => (
              <div key={type} className="flex items-center gap-2 text-xs font-mono">
                <span style={{ color: ENTITY_TYPE_COLORS[type] || '#888' }}>
                  {SHAPE_ICONS[type] || SHAPE_ICONS.Concept}
                </span>
                <span className="text-[#c9d1d9]">{type}</span>
                <span className="text-[#484f58]">{ENTITY_TYPE_LABELS[type] || ''}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
