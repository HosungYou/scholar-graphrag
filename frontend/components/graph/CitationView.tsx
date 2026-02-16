'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { GitBranch, Loader2, AlertCircle, Network } from 'lucide-react';
import { api } from '@/lib/api';

interface CitationViewProps {
  projectId: string;
}

interface CitationNode {
  paper_id: string;
  local_id: string | null;
  title: string;
  year: number | null;
  citation_count: number;
  doi: string | null;
  is_local: boolean;
}

interface CitationEdge {
  source_id: string;
  target_id: string;
}

export function CitationView({ projectId }: CitationViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [nodes, setNodes] = useState<CitationNode[]>([]);
  const [edges, setEdges] = useState<CitationEdge[]>([]);
  const [building, setBuilding] = useState(false);
  const [buildProgress, setBuildProgress] = useState({ progress: 0, total: 0, phase: '' });
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{ matched: number; total: number; buildTime: number } | null>(null);
  const [hasNetwork, setHasNetwork] = useState(false);

  // Check for existing network on mount
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const status = await api.getCitationBuildStatus(projectId);
        if (status.state === 'building') {
          setBuilding(true);
          pollStatus();
          return;
        }
        const network = await api.getCitationNetwork(projectId);
        if (!cancelled) {
          setNodes(network.nodes);
          setEdges(network.edges);
          setStats({
            matched: network.papers_matched,
            total: network.papers_total,
            buildTime: network.build_time_seconds,
          });
          setHasNetwork(true);
        }
      } catch {
        // No network yet — that's fine
      }
    };
    check();
    return () => { cancelled = true; };
  }, [projectId]);

  // Poll build status
  const pollStatus = useCallback(async () => {
    const poll = async () => {
      try {
        const status = await api.getCitationBuildStatus(projectId);
        setBuildProgress({
          progress: status.progress,
          total: status.total,
          phase: status.phase,
        });

        if (status.state === 'completed') {
          setBuilding(false);
          // Fetch the completed network
          try {
            const network = await api.getCitationNetwork(projectId);
            setNodes(network.nodes);
            setEdges(network.edges);
            setStats({
              matched: network.papers_matched,
              total: network.papers_total,
              buildTime: network.build_time_seconds,
            });
            setHasNetwork(true);
          } catch (e) {
            setError('Failed to load completed network');
          }
          return;
        }

        if (status.state === 'failed') {
          setBuilding(false);
          setError(status.error || 'Build failed');
          return;
        }

        // Continue polling
        setTimeout(poll, 2000);
      } catch {
        setTimeout(poll, 5000);
      }
    };
    poll();
  }, [projectId]);

  // Start build
  const handleBuild = async () => {
    setError(null);
    setBuilding(true);
    setBuildProgress({ progress: 0, total: 0, phase: 'matching' });
    try {
      await api.buildCitationNetwork(projectId);
      pollStatus();
    } catch (e: any) {
      setBuilding(false);
      setError(e.message || 'Failed to start build');
    }
  };

  // D3 scatter plot
  useEffect(() => {
    if (!svgRef.current || !containerRef.current || nodes.length === 0) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;
    const margin = { top: 40, right: 40, bottom: 60, left: 70 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    // Filter nodes with valid year
    const plotNodes = nodes.filter(n => n.year != null);
    if (plotNodes.length === 0) return;

    // Build node map for edge lookups
    const nodeMap = new Map(plotNodes.map(n => [n.paper_id, n]));

    const years = plotNodes.map(n => n.year!);
    const minYear = d3.min(years)!;
    const maxYear = d3.max(years)!;
    const maxCitations = d3.max(plotNodes, d => d.citation_count) || 1;

    // Scales
    const x = d3.scaleLinear()
      .domain([minYear - 1, maxYear + 1])
      .range([0, innerW]);

    const y = d3.scaleLog()
      .domain([1, maxCitations + 1])
      .range([innerH, 0])
      .clamp(true);

    // Clear and setup SVG
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('width', width).attr('height', height);

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Grid lines
    g.append('g')
      .attr('class', 'grid')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(x)
        .ticks(10)
        .tickSize(-innerH)
        .tickFormat(() => '')
      )
      .selectAll('line')
      .attr('stroke', '#e5e7eb')
      .attr('stroke-opacity', 0.3);

    g.append('g')
      .attr('class', 'grid')
      .call(d3.axisLeft(y)
        .ticks(5)
        .tickSize(-innerW)
        .tickFormat(() => '')
      )
      .selectAll('line')
      .attr('stroke', '#e5e7eb')
      .attr('stroke-opacity', 0.3);

    // Axes
    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(x).ticks(10).tickFormat(d3.format('d')))
      .selectAll('text')
      .attr('fill', '#6b7280')
      .style('font-family', 'monospace')
      .style('font-size', '11px');

    g.append('g')
      .call(d3.axisLeft(y).ticks(5, '~s'))
      .selectAll('text')
      .attr('fill', '#6b7280')
      .style('font-family', 'monospace')
      .style('font-size', '11px');

    // Axis labels
    g.append('text')
      .attr('x', innerW / 2)
      .attr('y', innerH + 45)
      .attr('text-anchor', 'middle')
      .attr('fill', '#9ca3af')
      .style('font-family', 'monospace')
      .style('font-size', '12px')
      .text('Publication Year');

    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -innerH / 2)
      .attr('y', -55)
      .attr('text-anchor', 'middle')
      .attr('fill', '#9ca3af')
      .style('font-family', 'monospace')
      .style('font-size', '12px')
      .text('Citation Count (log)');

    // Edges (draw before nodes so nodes are on top)
    const plotEdges = edges.filter(e => nodeMap.has(e.source_id) && nodeMap.has(e.target_id));
    g.selectAll('.edge')
      .data(plotEdges)
      .enter()
      .append('line')
      .attr('class', 'edge')
      .attr('x1', d => x(nodeMap.get(d.source_id)!.year!))
      .attr('y1', d => y(Math.max(1, nodeMap.get(d.source_id)!.citation_count)))
      .attr('x2', d => x(nodeMap.get(d.target_id)!.year!))
      .attr('y2', d => y(Math.max(1, nodeMap.get(d.target_id)!.citation_count)))
      .attr('stroke', '#e5e7eb')
      .attr('stroke-opacity', 0.15)
      .attr('stroke-width', 0.5);

    // Tooltip
    const tooltip = d3.select(container)
      .append('div')
      .attr('class', 'citation-tooltip')
      .style('position', 'absolute')
      .style('pointer-events', 'none')
      .style('opacity', '0')
      .style('background', 'rgba(0,0,0,0.85)')
      .style('color', 'white')
      .style('padding', '8px 12px')
      .style('border-radius', '4px')
      .style('font-size', '12px')
      .style('font-family', 'monospace')
      .style('max-width', '300px')
      .style('z-index', '50')
      .style('line-height', '1.4');

    // Nodes
    g.selectAll('.node')
      .data(plotNodes)
      .enter()
      .append('circle')
      .attr('class', 'node')
      .attr('cx', d => x(d.year!))
      .attr('cy', d => y(Math.max(1, d.citation_count)))
      .attr('r', d => d.is_local ? 6 : 3.5)
      .attr('fill', d => d.is_local ? '#457B9D' : '#93c5fd')
      .attr('fill-opacity', d => d.is_local ? 0.9 : 0.5)
      .attr('stroke', d => d.is_local ? '#1d3557' : '#60a5fa')
      .attr('stroke-width', d => d.is_local ? 1.5 : 0.5)
      .style('cursor', 'pointer')
      .on('mouseover', function (event, d) {
        d3.select(this)
          .transition().duration(150)
          .attr('r', d.is_local ? 9 : 6)
          .attr('fill-opacity', 1);

        // Highlight connected edges
        g.selectAll('.edge')
          .attr('stroke-opacity', (e: any) =>
            e.source_id === d.paper_id || e.target_id === d.paper_id ? 0.6 : 0.05
          )
          .attr('stroke', (e: any) =>
            e.source_id === d.paper_id || e.target_id === d.paper_id ? '#457B9D' : '#e5e7eb'
          )
          .attr('stroke-width', (e: any) =>
            e.source_id === d.paper_id || e.target_id === d.paper_id ? 1.5 : 0.5
          );

        const doiLink = d.doi ? `\nDOI: ${d.doi}` : '';
        tooltip
          .html(`<strong>${d.title}</strong>\nYear: ${d.year} · Citations: ${d.citation_count}${doiLink}\n${d.is_local ? '📄 Local paper' : '🔗 Referenced paper'}`.replace(/\n/g, '<br/>'))
          .style('opacity', '1')
          .style('left', `${event.offsetX + 15}px`)
          .style('top', `${event.offsetY - 10}px`);
      })
      .on('mousemove', function (event) {
        tooltip
          .style('left', `${event.offsetX + 15}px`)
          .style('top', `${event.offsetY - 10}px`);
      })
      .on('mouseout', function (_, d) {
        d3.select(this)
          .transition().duration(150)
          .attr('r', d.is_local ? 6 : 3.5)
          .attr('fill-opacity', d.is_local ? 0.9 : 0.5);

        g.selectAll('.edge')
          .attr('stroke-opacity', 0.15)
          .attr('stroke', '#e5e7eb')
          .attr('stroke-width', 0.5);

        tooltip.style('opacity', '0');
      })
      .on('click', (_, d) => {
        if (d.doi) {
          window.open(`https://doi.org/${d.doi}`, '_blank');
        } else {
          window.open(`https://www.semanticscholar.org/paper/${d.paper_id}`, '_blank');
        }
      });

    // Cleanup tooltip on unmount
    return () => {
      tooltip.remove();
    };
  }, [nodes, edges]);

  // Error state
  if (error) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-4">
        <AlertCircle className="w-8 h-8 text-red-400" />
        <p className="text-sm text-red-400">{error}</p>
        <button
          onClick={handleBuild}
          className="px-4 py-2 bg-[#457B9D] text-white text-sm font-mono uppercase tracking-wider hover:bg-[#1d3557] transition-colors"
        >
          Retry Build
        </button>
      </div>
    );
  }

  // Building state
  if (building) {
    const pct = buildProgress.total
      ? (buildProgress.progress / buildProgress.total) * 100
      : 0;
    const phaseLabel = buildProgress.phase === 'matching'
      ? 'Matching papers on Semantic Scholar...'
      : buildProgress.phase === 'references'
      ? 'Fetching citation references...'
      : 'Building...';

    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-[#457B9D]" />
        <p className="font-mono text-xs text-[#457B9D] uppercase tracking-wider">
          {phaseLabel}
        </p>
        <p className="text-sm text-muted">
          {buildProgress.progress} / {buildProgress.total}
        </p>
        <div className="w-64 h-2 bg-ink/5 dark:bg-paper/5 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#457B9D] transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  }

  // No network — show build button
  if (!hasNetwork) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-6">
        <div className="flex flex-col items-center gap-2">
          <Network className="w-12 h-12 text-[#457B9D]/40" />
          <h3 className="font-mono text-sm uppercase tracking-wider text-muted">
            Citation Network
          </h3>
          <p className="text-xs text-muted max-w-md text-center">
            Build a citation network from your project papers using Semantic Scholar.
            Papers are matched by DOI and their references are fetched to create a Litmaps-style visualization.
          </p>
        </div>
        <button
          onClick={handleBuild}
          className="flex items-center gap-2 px-6 py-3 bg-[#457B9D] text-white font-mono text-sm uppercase tracking-wider hover:bg-[#1d3557] transition-colors"
        >
          <GitBranch className="w-4 h-4" />
          Build Citation Network
        </button>
      </div>
    );
  }

  // Network loaded — show scatter plot
  const localCount = nodes.filter(n => n.is_local).length;
  const refCount = nodes.filter(n => !n.is_local).length;

  return (
    <div ref={containerRef} className="relative w-full h-full">
      <svg ref={svgRef} className="w-full h-full" />

      {/* Legend */}
      <div className="absolute bottom-4 right-4 bg-paper dark:bg-ink border border-ink/10 dark:border-paper/10 p-3">
        <div className="flex flex-col gap-2 text-xs font-mono">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[#457B9D]" />
            <span className="text-muted">Local papers ({localCount})</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-[#93c5fd] opacity-60" />
            <span className="text-muted">Referenced ({refCount})</span>
          </div>
          <div className="w-full h-px bg-ink/10 dark:bg-paper/10" />
          <div className="text-muted">
            {edges.length} citations · {stats?.buildTime}s build
          </div>
        </div>
      </div>

      {/* Stats badge */}
      {stats && (
        <div className="absolute top-4 left-4 bg-paper dark:bg-ink border border-ink/10 dark:border-paper/10 px-3 py-1.5">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-[#457B9D]" />
            <span className="font-mono text-xs text-muted">
              {stats.matched}/{stats.total} papers matched
            </span>
          </div>
        </div>
      )}

      {/* Rebuild button */}
      <button
        onClick={handleBuild}
        className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1.5 bg-paper dark:bg-ink border border-ink/10 dark:border-paper/10 text-muted hover:text-ink dark:hover:text-paper transition-colors"
        title="Rebuild citation network"
      >
        <GitBranch className="w-3.5 h-3.5" />
        <span className="font-mono text-xs uppercase tracking-wider">Rebuild</span>
      </button>
    </div>
  );
}
