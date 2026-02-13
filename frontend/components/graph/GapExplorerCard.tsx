'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { api } from '@/lib/api';
import type { StructuralGap } from '@/types';

interface GapExplorerCardProps {
  gap: StructuralGap;
  position: { x: number; y: number };
  onClose: () => void;
  onDeepDive: (gapId: string) => void;
  projectId: string;
}

export function GapExplorerCard({ gap, position, onClose, onDeepDive, projectId }: GapExplorerCardProps) {
  const [papers, setPapers] = useState<Array<{ title: string; year?: number; url?: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch recommendations for this gap
    api.getGapRecommendations(projectId, gap.id)
      .then((data: any) => {
        setPapers(data.papers?.slice(0, 3) || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [projectId, gap.id]);

  // Clamp position to stay within viewport
  const left = Math.min(position.x, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 340);
  const top = Math.min(position.y, (typeof window !== 'undefined' ? window.innerHeight : 800) - 300);

  return (
    <div
      className="absolute z-50 bg-[#161b22] border border-white/10 rounded-lg shadow-2xl p-4 w-80"
      style={{ left, top }}
    >
      <div className="flex justify-between items-start mb-3">
        <h3 className="text-sm font-semibold text-white">Research Gap</h3>
        <button onClick={onClose} className="text-muted hover:text-white transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex gap-1 flex-wrap mb-2">
        {(gap.cluster_a_names || []).slice(0, 3).map((n: string) => (
          <span key={n} className="px-2 py-0.5 bg-[#FF6B6B]/20 text-[#FF6B6B] text-xs rounded-full">{n}</span>
        ))}
        <span className="text-muted text-xs self-center">-</span>
        {(gap.cluster_b_names || []).slice(0, 3).map((n: string) => (
          <span key={n} className="px-2 py-0.5 bg-[#4ECDC4]/20 text-[#4ECDC4] text-xs rounded-full">{n}</span>
        ))}
      </div>

      {gap.research_questions?.[0] && (
        <p className="text-xs text-muted italic mb-3">&quot;{gap.research_questions[0]}&quot;</p>
      )}

      <div className="space-y-2 mb-3">
        <p className="text-xs font-mono text-muted">Related Papers</p>
        {loading ? (
          <div className="text-xs text-muted animate-pulse">Loading...</div>
        ) : papers.length > 0 ? (
          papers.map((p, i) => (
            <a
              key={i}
              href={p.url || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-xs text-accent-teal hover:underline truncate"
            >
              {p.title} {p.year ? `(${p.year})` : ''}
            </a>
          ))
        ) : (
          <div className="text-xs text-muted">No papers found</div>
        )}
      </div>

      <button
        onClick={() => onDeepDive(gap.id)}
        className="w-full py-1.5 bg-accent-teal/20 hover:bg-accent-teal/30 text-accent-teal text-xs rounded transition-colors font-mono uppercase tracking-wider"
      >
        Deep Dive
      </button>
    </div>
  );
}

export default GapExplorerCard;
