'use client';

import { useEffect, useRef, useMemo, useState } from 'react';
import * as d3 from 'd3';
import { Download } from 'lucide-react';
import type { ConceptCluster, StructuralGap, GraphEdge, TopicNode, TopicLink, TopicViewData } from '@/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CLUSTER_COLORS = [
  '#FF6B6B', // Coral Red
  '#4ECDC4', // Turquoise
  '#45B7D1', // Sky Blue
  '#96CEB4', // Sage Green
  '#FFEAA7', // Soft Yellow
  '#DDA0DD', // Plum
  '#98D8C8', // Mint
  '#F7DC6F', // Gold
  '#BB8FCE', // Lavender
  '#85C1E9', // Light Blue
  '#F8B500', // Amber
  '#82E0AA', // Light Green
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** F-6b: Deterministic hash-based color assignment */
function hashStringToIndex(str: string, max: number): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash) % max;
}

/** F-3f: Cluster size scaling -- sqrt instead of linear */
function getNodeDimensions(size: number): { width: number; height: number } {
  const scale = 50 + Math.sqrt(size) * 20;
  return { width: scale, height: scale * 0.6 };
}

/** F-6e: Clone SVG, inline computed styles, trigger download */
function exportSvg(svgEl: SVGSVGElement) {
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  const walk = (original: Element, copy: Element) => {
    const computed = window.getComputedStyle(original);
    const parts: string[] = [];
    for (let i = 0; i < computed.length; i++) {
      const prop = computed[i];
      parts.push(`${prop}:${computed.getPropertyValue(prop)}`);
    }
    copy.setAttribute('style', parts.join(';'));
    for (let i = 0; i < original.children.length; i++) {
      if (copy.children[i]) walk(original.children[i], copy.children[i]);
    }
  };
  walk(svgEl, clone);
  const serializer = new XMLSerializer();
  const blob = new Blob([serializer.serializeToString(clone)], {
    type: 'image/svg+xml;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'topic-view-export.svg';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TopicViewModeProps {
  clusters: ConceptCluster[];
  gaps: StructuralGap[];
  edges: GraphEdge[];
  onClusterClick?: (clusterId: number) => void;
  onClusterHover?: (clusterId: number | null) => void;
  highlightedClusterId?: number | null;
  width?: number;
  height?: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TopicViewMode({
  clusters,
  gaps,
  edges,
  onClusterClick,
  onClusterHover,
  highlightedClusterId,
  width = 800,
  height = 600,
}: TopicViewModeProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const simulationRef = useRef<d3.Simulation<TopicNode, TopicLink> | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // -----------------------------------------------------------------------
  // Convert clusters + gaps + edges --> TopicViewData
  // -----------------------------------------------------------------------
  const topicData = useMemo((): TopicViewData => {
    // Issue C: size fallback
    const nodes: TopicNode[] = clusters.map((cluster) => ({
      id: `cluster-${cluster.cluster_id}`,
      clusterId: cluster.cluster_id,
      label:
        cluster.label && cluster.label.replace(/[\s/,]+/g, '').length > 0
          ? cluster.label
          : `Cluster ${cluster.cluster_id + 1}`,
      size: cluster.size || cluster.concept_names?.length || 0,
      // F-6b: deterministic color from label hash
      color:
        CLUSTER_COLORS[
          hashStringToIndex(
            cluster.label || `cluster-${cluster.cluster_id}`,
            CLUSTER_COLORS.length,
          )
        ],
      conceptIds: cluster.concepts,
      conceptNames: cluster.concept_names,
      density: cluster.density,
    }));

    // Count inter-cluster connections
    const connectionMap = new Map<string, number>();
    edges.forEach((edge) => {
      const sourceCluster = clusters.find((c) => c.concepts.includes(edge.source));
      const targetCluster = clusters.find((c) => c.concepts.includes(edge.target));
      if (sourceCluster && targetCluster && sourceCluster.cluster_id !== targetCluster.cluster_id) {
        const key = [
          Math.min(sourceCluster.cluster_id, targetCluster.cluster_id),
          Math.max(sourceCluster.cluster_id, targetCluster.cluster_id),
        ].join('-');
        connectionMap.set(key, (connectionMap.get(key) || 0) + 1);
      }
    });

    const validNodeIds = new Set(nodes.map((n) => n.id));
    const links: TopicLink[] = [];

    connectionMap.forEach((count, key) => {
      const [a, b] = key.split('-').map(Number);
      const sourceId = `cluster-${a}`;
      const targetId = `cluster-${b}`;
      if (validNodeIds.has(sourceId) && validNodeIds.has(targetId)) {
        links.push({
          id: `connection-${key}`,
          source: sourceId,
          target: targetId,
          type: 'connection',
          weight: count,
          connectionCount: count,
        });
      }
    });

    gaps.forEach((gap) => {
      const key = [
        Math.min(gap.cluster_a_id, gap.cluster_b_id),
        Math.max(gap.cluster_a_id, gap.cluster_b_id),
      ].join('-');
      const sourceId = `cluster-${gap.cluster_a_id}`;
      const targetId = `cluster-${gap.cluster_b_id}`;
      const existingLink = links.find((l) => l.id === `connection-${key}`);
      if (!existingLink && validNodeIds.has(sourceId) && validNodeIds.has(targetId)) {
        links.push({
          id: `gap-${gap.id}`,
          source: sourceId,
          target: targetId,
          type: 'gap',
          weight: gap.gap_strength,
          gapId: gap.id,
        });
      }
    });

    return { nodes, links };
  }, [clusters, gaps, edges]);

  // -----------------------------------------------------------------------
  // F-2: Adjacency map for bidirectional highlight
  // -----------------------------------------------------------------------
  const adjacencyMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    topicData.links.forEach((link) => {
      const s = typeof link.source === 'string' ? link.source : link.source.id;
      const t = typeof link.target === 'string' ? link.target : link.target.id;
      if (!map.has(s)) map.set(s, new Set());
      if (!map.has(t)) map.set(t, new Set());
      map.get(s)!.add(t);
      map.get(t)!.add(s);
    });
    return map;
  }, [topicData.links]);

  // -----------------------------------------------------------------------
  // F-5: Analytics summary stats
  // -----------------------------------------------------------------------
  const analytics = useMemo(() => {
    const totalConcepts = clusters.reduce(
      (sum, c) => sum + (c.size || c.concept_names?.length || 0),
      0,
    );
    const totalConnections = topicData.links.filter((l) => l.type === 'connection').length;
    const totalGaps = topicData.links.filter((l) => l.type === 'gap').length;
    const avgDensity =
      clusters.length > 0
        ? clusters.reduce((sum, c) => sum + c.density, 0) / clusters.length
        : 0;
    const sizes = clusters.map((c) => c.size || c.concept_names?.length || 0);
    const largestIdx = sizes.indexOf(Math.max(...sizes, 0));
    const largestLabel =
      largestIdx >= 0
        ? clusters[largestIdx].label &&
          clusters[largestIdx].label!.replace(/[\s/,]+/g, '').length > 0
          ? clusters[largestIdx].label!
          : `Cluster ${clusters[largestIdx].cluster_id + 1}`
        : '-';
    return { clusterCount: clusters.length, totalConcepts, totalConnections, totalGaps, avgDensity, largestLabel, sizes };
  }, [clusters, topicData.links]);

  // -----------------------------------------------------------------------
  // D3 force simulation
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!svgRef.current || topicData.nodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ---- SVG defs ----
    const defs = svg.append('defs');

    // Gap glow filter
    const glowFilter = defs.append('filter').attr('id', 'gap-glow');
    glowFilter.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'coloredBlur');
    const feMerge = glowFilter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    // Drop shadow for focused node
    const dropShadow = defs.append('filter').attr('id', 'node-shadow');
    dropShadow
      .append('feDropShadow')
      .attr('dx', 0)
      .attr('dy', 0)
      .attr('stdDeviation', 4)
      .attr('flood-color', 'rgba(255,255,255,0.3)');

    // Dash animation
    svg.append('style').text(`
      @keyframes dash-flow {
        to { stroke-dashoffset: -24; }
      }
      .dash-flow {
        animation: dash-flow 1s linear infinite;
      }
    `);

    // Container for zoom
    const container = svg.append('g').attr('class', 'container');

    // F-6a: Fade-in animation
    if (!prefersReducedMotion) {
      container.attr('opacity', 0);
      container.transition().duration(400).attr('opacity', 1);
    }

    // Zoom behavior
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on('zoom', (event) => {
        container.attr('transform', event.transform);
      });
    svg.call(zoom);

    // Copy data for simulation
    const nodes = topicData.nodes.map((d) => ({ ...d }));
    const links = topicData.links.map((d) => ({
      ...d,
      source: d.source as string,
      target: d.target as string,
    }));

    // F-6a: Initialize all nodes near center
    if (!prefersReducedMotion) {
      nodes.forEach((n) => {
        n.x = width / 2 + (Math.random() - 0.5) * 40;
        n.y = height / 2 + (Math.random() - 0.5) * 40;
      });
    }

    const maxSize = Math.max(...nodes.map((n) => n.size), 1);
    const maxWeight = Math.max(...links.map((l) => l.weight || 1), 1);

    // F-1: Per-link gradient defs
    const nodeColorMap = new Map<string, string>();
    nodes.forEach((n) => nodeColorMap.set(n.id, n.color));

    links.forEach((lnk, i) => {
      if (lnk.type !== 'gap') {
        const sId = typeof lnk.source === 'string' ? lnk.source : (lnk.source as TopicNode).id;
        const tId = typeof lnk.target === 'string' ? lnk.target : (lnk.target as TopicNode).id;
        const grad = defs
          .append('linearGradient')
          .attr('id', `link-grad-${i}`)
          .attr('gradientUnits', 'userSpaceOnUse');
        grad.append('stop').attr('offset', '0%').attr('stop-color', nodeColorMap.get(sId) || '#888');
        grad.append('stop').attr('offset', '100%').attr('stop-color', nodeColorMap.get(tId) || '#888');
      }
    });

    // ---- F-3: ForceAtlas2-style simulation ----
    const simulation = d3
      .forceSimulation<TopicNode>(nodes)
      .force(
        'link',
        d3
          .forceLink<TopicNode, TopicLink>(links)
          .id((d) => d.id)
          .distance((d) => {
            const link = d as TopicLink;
            if (link.type === 'gap') return 300;
            const normalized = (link.weight || 1) / maxWeight;
            return 300 - normalized * 200;
          })
          .strength((d) => {
            const link = d as TopicLink;
            const normalized = (link.weight || 1) / maxWeight;
            return link.type === 'gap' ? 0.05 : 0.3 + normalized * 0.4;
          }),
      )
      .force('gravity', d3.forceRadial(0, width / 2, height / 2).strength(0.05))
      .force(
        'charge',
        d3.forceManyBody().strength((d) => {
          const sizeRatio = (d as TopicNode).size / maxSize;
          return -300 - sizeRatio * 700;
        }),
      )
      .force(
        'collision',
        d3
          .forceCollide()
          .radius((d) => {
            const dims = getNodeDimensions((d as TopicNode).size);
            return Math.max(dims.width, dims.height) / 2 + 30;
          })
          .strength(0.8)
          .iterations(3),
      );
    // No default center force -- gravity radial handles centering

    simulationRef.current = simulation;

    // Custom boundary force: clamp nodes within viewport with 50px padding
    simulation.on('tick.boundary', () => {
      const pad = 50;
      nodes.forEach((n) => {
        if (n.x !== undefined) n.x = Math.max(pad, Math.min(width - pad, n.x));
        if (n.y !== undefined) n.y = Math.max(pad, Math.min(height - pad, n.y));
      });
    });

    // ---- Render layers ----
    const hullGroup = container.append('g').attr('class', 'hulls');
    const linkGroup = container.append('g').attr('class', 'links');
    const edgeLabelGroup = container.append('g').attr('class', 'link-labels');
    const nodeGroup = container.append('g').attr('class', 'nodes');
    const tooltipGroup = container.append('g').attr('class', 'tooltips');

    // ---- F-1: Links with gradient + log-scale width ----
    const weightThreshold =
      d3.quantile(
        links
          .filter((l) => l.type === 'connection')
          .map((l) => l.weight || 0)
          .sort(d3.ascending),
        0.75,
      ) || 0;

    const link = linkGroup
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', (d, i) => {
        if (d.type === 'gap') return '#FFD700';
        if (d.type === 'connection' && (d.connectionCount || 0) > 5) {
          // Strong connection: use cluster avg color via gradient
          return `url(#link-grad-${i})`;
        }
        // Weak connection
        return '#666';
      })
      .attr('stroke-width', (d) => {
        if (d.type === 'gap') return 2;
        if (d.type === 'connection' && (d.connectionCount || 0) > 5) return 3;
        return 1;
      })
      .attr('stroke-dasharray', (d) => (d.type === 'gap' ? '8,4' : 'none'))
      .attr('opacity', (d) => {
        if (d.type === 'gap') return 0.8;
        if (d.type === 'connection' && (d.connectionCount || 0) > 5) return 0.7;
        return 0.3;
      })
      .attr('filter', (d) => (d.type === 'gap' ? 'url(#gap-glow)' : 'none'))
      .classed('dash-flow', (d) => d.type === 'gap');

    // F-1: Edge labels on top 25% weight connections
    const edgeLabelData = links.filter(
      (l) => l.type === 'connection' && (l.weight || 0) >= weightThreshold && weightThreshold > 0,
    );

    const edgeLabel = edgeLabelGroup
      .selectAll('text')
      .data(edgeLabelData)
      .join('text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('fill', 'rgba(255,255,255,0.55)')
      .attr('font-size', '9px')
      .attr('font-family', 'monospace')
      .text((d) => `${d.weight} links`);

    // F-1b: Edge count badge at link midpoints
    const edgeBadgeGroup = container.append('g').attr('class', 'edge-badges');
    const edgeBadgeData = links.filter(
      (l) => l.type === 'connection' && (l.connectionCount || 0) > 0,
    );
    const edgeBadge = edgeBadgeGroup
      .selectAll('g')
      .data(edgeBadgeData)
      .join('g')
      .attr('class', 'edge-badge');
    edgeBadge
      .append('circle')
      .attr('r', 9)
      .attr('fill', '#161b22')
      .attr('stroke', (d) => (d.connectionCount || 0) > 5 ? '#4ECDC4' : '#30363d')
      .attr('stroke-width', 1);
    edgeBadge
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('fill', (d) => (d.connectionCount || 0) > 5 ? '#4ECDC4' : '#8b949e')
      .attr('font-size', '8px')
      .attr('font-weight', 'bold')
      .attr('font-family', 'monospace')
      .text((d) => `${d.connectionCount || d.weight || 0}`);

    // ---- Node groups ----
    // F-4: Connection count per node
    const edgeCountMap = new Map<string, number>();
    links.forEach((l) => {
      const sId = typeof l.source === 'string' ? l.source : (l.source as TopicNode).id;
      const tId = typeof l.target === 'string' ? l.target : (l.target as TopicNode).id;
      edgeCountMap.set(sId, (edgeCountMap.get(sId) || 0) + 1);
      edgeCountMap.set(tId, (edgeCountMap.get(tId) || 0) + 1);
    });

    const node = nodeGroup
      .selectAll<SVGGElement, TopicNode>('g')
      .data(nodes)
      .join('g')
      .attr('class', 'topic-node')
      .style('cursor', 'pointer')
      .attr('role', 'button')
      .attr('aria-label', (d) =>
        `Cluster: ${d.label}, ${d.size} concepts, density ${d.density.toFixed(2)}`,
      );

    // Drag
    const dragBehavior = d3
      .drag<SVGGElement, TopicNode>()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });
    (node as d3.Selection<SVGGElement, TopicNode, SVGGElement, unknown>).call(dragBehavior);

    // Rectangles
    node
      .append('rect')
      .attr('width', (d) => getNodeDimensions(d.size).width)
      .attr('height', (d) => getNodeDimensions(d.size).height)
      .attr('x', (d) => -getNodeDimensions(d.size).width / 2)
      .attr('y', (d) => -getNodeDimensions(d.size).height / 2)
      .attr('rx', 8)
      .attr('ry', 8)
      .attr('fill', (d) => d.color)
      .attr('fill-opacity', 0.15)
      .attr('stroke', (d) => d.color)
      .attr('stroke-width', 2);

    // F-4: Density bar at bottom of each node
    node
      .append('rect')
      .attr('class', 'density-bar')
      .attr('x', (d) => -getNodeDimensions(d.size).width / 2 + 4)
      .attr('y', (d) => getNodeDimensions(d.size).height / 2 - 5)
      .attr('width', (d) => {
        const maxW = getNodeDimensions(d.size).width - 8;
        return maxW * Math.min(d.density, 1);
      })
      .attr('height', 3)
      .attr('rx', 1.5)
      .attr('fill', (d) => d.color)
      .attr('fill-opacity', 0.6);

    // Cluster label
    node
      .append('text')
      .attr('class', 'node-label')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('y', -6)
      .attr('fill', (d) => d.color)
      .attr('font-size', '14px')
      .attr('font-weight', 'bold')
      .attr('font-family', 'system-ui, -apple-system, sans-serif')
      .style(
        'text-shadow',
        '0 1px 4px rgba(0,0,0,0.9), 0 0 12px rgba(0,0,0,0.7), 0 0 2px rgba(0,0,0,1)',
      )
      .text((d) => (d.label.length > 25 ? d.label.slice(0, 25) + '...' : d.label));

    // Size indicator
    node
      .append('text')
      .attr('class', 'node-size')
      .attr('text-anchor', 'middle')
      .attr('y', 10)
      .attr('fill', 'rgba(255, 255, 255, 0.6)')
      .attr('font-size', '11px')
      .attr('font-family', 'monospace')
      .text((d) => `${d.size} concepts`);

    // F-4: Connection count badge (top-right)
    const badgeG = node.append('g').attr('class', 'badge');
    badgeG
      .append('circle')
      .attr('cx', (d) => getNodeDimensions(d.size).width / 2 - 4)
      .attr('cy', (d) => -getNodeDimensions(d.size).height / 2 + 4)
      .attr('r', 10)
      .attr('fill', (d) => ((edgeCountMap.get(d.id) || 0) >= 3 ? '#2DD4BF' : '#6B7280'))
      .attr('stroke', '#0d1117')
      .attr('stroke-width', 1.5);
    badgeG
      .append('text')
      .attr('x', (d) => getNodeDimensions(d.size).width / 2 - 4)
      .attr('y', (d) => -getNodeDimensions(d.size).height / 2 + 4)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('fill', '#fff')
      .attr('font-size', '9px')
      .attr('font-weight', 'bold')
      .attr('font-family', 'monospace')
      .text((d) => `${edgeCountMap.get(d.id) || 0}`);

    // ---- F-2: Bidirectional highlight interactions ----
    node
      .on('click', (event, d) => {
        event.stopPropagation();
        onClusterClick?.(d.clusterId);
      })
      .on('mouseenter', function (_event, d) {
        onClusterHover?.(d.clusterId);
        setHoveredNodeId(d.id);

        const connected = adjacencyMap.get(d.id) || new Set<string>();

        // 3-tier node opacity
        nodeGroup.selectAll<SVGGElement, TopicNode>('.topic-node').each(function (nd) {
          const el = d3.select(this);
          if (nd.id === d.id) {
            // Focused
            el.transition()
              .duration(200)
              .style('opacity', 1)
              .attr('transform', `translate(${nd.x ?? 0},${nd.y ?? 0}) scale(1.05)`);
            el.select('rect')
              .transition()
              .duration(200)
              .attr('stroke-width', 4)
              .attr('filter', 'url(#node-shadow)');
          } else if (connected.has(nd.id)) {
            // Connected
            el.transition()
              .duration(200)
              .style('opacity', 0.85)
              .attr('transform', `translate(${nd.x ?? 0},${nd.y ?? 0}) scale(1)`);
            el.select('rect').transition().duration(200).attr('stroke-width', 2.5);
          } else {
            // Faded
            el.transition()
              .duration(200)
              .style('opacity', 0.15)
              .attr('transform', `translate(${nd.x ?? 0},${nd.y ?? 0}) scale(0.98)`);
            el.selectAll('.node-label, .node-size')
              .transition()
              .duration(200)
              .style('opacity', 0);
          }
        });

        // Edge opacity
        linkGroup.selectAll('line').each(function (ld: unknown) {
          const linkDatum = ld as TopicLink;
          const sId =
            typeof linkDatum.source === 'string'
              ? linkDatum.source
              : (linkDatum.source as TopicNode).id;
          const tId =
            typeof linkDatum.target === 'string'
              ? linkDatum.target
              : (linkDatum.target as TopicNode).id;
          const isConn = sId === d.id || tId === d.id;
          d3.select(this)
            .transition()
            .duration(200)
            .attr('opacity', isConn ? 0.9 : 0.05);
        });

        // F-4: Enhanced tooltip via foreignObject
        tooltipGroup.selectAll('*').remove();
        const names = d.conceptNames?.filter((n: string) => n && n.trim()).slice(0, 5) || [];
        const remaining = (d.conceptNames?.length || 0) - names.length;
        if (names.length > 0) {
          const ttWidth = 200;
          const lineHeight = 16;
          const ttHeight = 30 + names.length * lineHeight + (remaining > 0 ? lineHeight : 0);
          tooltipGroup
            .append('foreignObject')
            .attr('x', (d.x ?? 0) + getNodeDimensions(d.size).width / 2 + 10)
            .attr('y', (d.y ?? 0) - ttHeight / 2)
            .attr('width', ttWidth)
            .attr('height', ttHeight)
            .append('xhtml:div')
            .style('background', 'rgba(22,27,34,0.95)')
            .style('border', '1px solid rgba(255,255,255,0.1)')
            .style('border-radius', '6px')
            .style('padding', '8px 10px')
            .style('font-family', 'monospace')
            .style('font-size', '10px')
            .style('color', '#c9d1d9')
            .style('max-width', `${ttWidth}px`)
            .style('line-height', '1.4')
            .html(
              names
                .map(
                  (n: string) =>
                    `<div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${n}</div>`,
                )
                .join('') +
                (remaining > 0
                  ? `<div style="color:#8b949e;margin-top:2px;">+${remaining} more</div>`
                  : ''),
            );
        }
      })
      .on('mouseleave', function () {
        onClusterHover?.(null);
        setHoveredNodeId(null);

        // Reset all nodes
        nodeGroup.selectAll<SVGGElement, TopicNode>('.topic-node').each(function (nd) {
          const el = d3.select(this);
          el.transition()
            .duration(300)
            .style('opacity', 1)
            .attr('transform', `translate(${nd.x ?? 0},${nd.y ?? 0}) scale(1)`);
          el.select('rect')
            .transition()
            .duration(300)
            .attr('stroke-width', 2)
            .attr('filter', 'none');
          el.selectAll('.node-label, .node-size')
            .transition()
            .duration(300)
            .style('opacity', 1);
        });

        // Reset edges
        linkGroup.selectAll('line').each(function (ld: unknown) {
          const linkDatum = ld as TopicLink;
          d3.select(this)
            .transition()
            .duration(300)
            .attr('opacity', () => {
              if (linkDatum.type === 'gap') return 0.8;
              return 0.3 + Math.min((linkDatum.weight || 1) / maxWeight, 0.5);
            });
        });

        tooltipGroup.selectAll('*').remove();
      });

    // ---- Tick handler ----
    simulation.on('tick', () => {
      link
        .attr('x1', (d) => ((d.source as unknown) as TopicNode).x ?? 0)
        .attr('y1', (d) => ((d.source as unknown) as TopicNode).y ?? 0)
        .attr('x2', (d) => ((d.target as unknown) as TopicNode).x ?? 0)
        .attr('y2', (d) => ((d.target as unknown) as TopicNode).y ?? 0);

      // Update gradient endpoints
      links.forEach((l, i) => {
        if (l.type !== 'gap') {
          const s = (l.source as unknown) as TopicNode;
          const t = (l.target as unknown) as TopicNode;
          const grad = defs.select(`#link-grad-${i}`);
          if (!grad.empty()) {
            grad
              .attr('x1', s.x ?? 0)
              .attr('y1', s.y ?? 0)
              .attr('x2', t.x ?? 0)
              .attr('y2', t.y ?? 0);
          }
        }
      });

      // Edge labels at midpoint
      edgeLabel
        .attr('x', (d) => {
          const s = (d.source as unknown) as TopicNode;
          const t = (d.target as unknown) as TopicNode;
          return ((s.x ?? 0) + (t.x ?? 0)) / 2;
        })
        .attr('y', (d) => {
          const s = (d.source as unknown) as TopicNode;
          const t = (d.target as unknown) as TopicNode;
          return ((s.y ?? 0) + (t.y ?? 0)) / 2 - 6;
        });

      node.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);

      // Position edge badges at midpoints
      edgeBadge.attr('transform', (d) => {
        const s = (d.source as unknown) as TopicNode;
        const t = (d.target as unknown) as TopicNode;
        const mx = ((s.x ?? 0) + (t.x ?? 0)) / 2;
        const my = ((s.y ?? 0) + (t.y ?? 0)) / 2;
        return `translate(${mx},${my})`;
      });

      // Convex hull boundaries
      hullGroup.selectAll('path').remove();
      const clusterGroups = new Map<number, Array<[number, number]>>();
      nodes.forEach((n) => {
        if (n.x !== undefined && n.y !== undefined) {
          const points = clusterGroups.get(n.clusterId) || [];
          const dims = getNodeDimensions(n.size);
          const pad = Math.max(dims.width, dims.height) / 2 + 15;
          points.push([n.x - pad, n.y - pad]);
          points.push([n.x + pad, n.y - pad]);
          points.push([n.x - pad, n.y + pad]);
          points.push([n.x + pad, n.y + pad]);
          clusterGroups.set(n.clusterId, points);
        }
      });

      clusterGroups.forEach((points, clusterId) => {
        if (points.length < 6) return;
        const hull = d3.polygonHull(points);
        if (hull) {
          const cn = nodes.find((n) => n.clusterId === clusterId);
          const color = cn?.color || '#888';
          hullGroup
            .append('path')
            .attr('d', `M${hull.join('L')}Z`)
            .attr('fill', color)
            .attr('fill-opacity', 0.04)
            .attr('stroke', color)
            .attr('stroke-opacity', 0.15)
            .attr('stroke-width', 1)
            .attr('stroke-linejoin', 'round');
        }
      });
    });

    return () => {
      simulation.stop();
    };
  }, [topicData, width, height, onClusterClick, onClusterHover, adjacencyMap]);

  // -----------------------------------------------------------------------
  // External highlight from parent
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    svg
      .selectAll('.topic-node rect')
      .transition()
      .duration(150)
      .attr('fill-opacity', (d) => {
        const nd = d as TopicNode;
        if (highlightedClusterId === null || highlightedClusterId === undefined) return 0.15;
        return nd.clusterId === highlightedClusterId ? 0.4 : 0.05;
      })
      .attr('stroke-opacity', (d) => {
        const nd = d as TopicNode;
        if (highlightedClusterId === null || highlightedClusterId === undefined) return 1;
        return nd.clusterId === highlightedClusterId ? 1 : 0.3;
      });
  }, [highlightedClusterId]);

  // -----------------------------------------------------------------------
  // Empty state (Issue C)
  // -----------------------------------------------------------------------
  if (clusters.length === 0) {
    return (
      <div className="flex items-center justify-center h-full bg-[#0d1117]">
        <div className="text-center">
          <p className="font-mono text-xs uppercase tracking-wider text-muted">
            Run Gap Analysis first to generate cluster visualization
          </p>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <div className="w-full h-full bg-[#0d1117] relative">
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ background: '#0d1117' }}
      />

      {/* Badge + F-6e: SVG Export button */}
      <div className="absolute top-4 left-4 flex items-center gap-2">
        <div className="bg-paper dark:bg-ink border border-ink/10 dark:border-paper/10 px-3 py-1.5">
          <div className="flex items-center gap-2">
            <svg
              className="w-4 h-4 text-accent-violet"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
            <span className="font-mono text-xs uppercase tracking-wider text-muted">
              Topic View
            </span>
            <span className="text-xs text-muted">&bull; {clusters.length} clusters</span>
          </div>
        </div>
        <button
          onClick={() => svgRef.current && exportSvg(svgRef.current)}
          className="bg-[#161b22]/90 backdrop-blur-sm border border-[#30363d] rounded p-1.5 hover:bg-[#21262d] transition-colors"
          title="Export SVG"
          aria-label="Export topic view as SVG"
        >
          <Download className="w-4 h-4 text-[#8b949e]" />
        </button>
      </div>

      {/* F-4: Enhanced Legend */}
      <div className="absolute bottom-16 right-4 bg-[#161b22]/90 backdrop-blur-sm border border-[#30363d] rounded-lg p-3 max-w-[220px]">
        <div className="text-xs font-mono text-[#8b949e] mb-2 uppercase tracking-wider">
          Topic Clusters
        </div>
        {/* Cluster colors */}
        <div className="mb-2 space-y-1">
          {clusters.slice(0, 8).map((cluster) => {
            const cColor =
              CLUSTER_COLORS[
                hashStringToIndex(
                  cluster.label || `cluster-${cluster.cluster_id}`,
                  CLUSTER_COLORS.length,
                )
              ];
            return (
              <div key={cluster.cluster_id} className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: cColor }}
                />
                <span className="text-xs text-[#c9d1d9] truncate">
                  {cluster.label && cluster.label.replace(/[\s/,]+/g, '').length > 0
                    ? cluster.label
                    : `Cluster ${cluster.cluster_id + 1}`}
                </span>
                <span className="text-xs text-[#484f58] flex-shrink-0">
                  ({cluster.size || cluster.concept_names?.length || 0})
                </span>
              </div>
            );
          })}
          {clusters.length > 8 && (
            <span className="text-xs text-[#484f58]">+{clusters.length - 8} more</span>
          )}
        </div>
        {/* Edge types */}
        <div className="border-t border-[#30363d] pt-2 space-y-1">
          <div className="text-xs font-mono text-[#8b949e] mb-1 uppercase tracking-wider">
            Edges
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-[3px] bg-[#4ECDC4] rounded" />
            <span className="text-xs text-[#8b949e]">Strong (&gt;5 links)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-[1px] bg-[#666] rounded" />
            <span className="text-xs text-[#8b949e]">Weak connection</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-0.5 border-t-2 border-dashed" style={{ borderColor: '#FFD700' }} />
            <span className="text-xs text-[#8b949e]">Structural gap</span>
          </div>
        </div>
        {/* Indicators */}
        <div className="border-t border-[#30363d] pt-2 mt-2 space-y-1">
          <div className="text-xs font-mono text-[#8b949e] mb-1 uppercase tracking-wider">
            Indicators
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-3 rounded-sm border border-[#8b949e]/40 flex-shrink-0" />
            <span className="text-xs text-[#8b949e]">Node size = concept count</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-[3px] bg-[#4ECDC4]/60 rounded flex-shrink-0" />
            <span className="text-xs text-[#8b949e]">Bar = cluster density</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[#2DD4BF] flex-shrink-0 flex items-center justify-center">
              <span className="text-[6px] text-white font-bold">3</span>
            </div>
            <span className="text-xs text-[#8b949e]">Badge = edge count</span>
          </div>
        </div>
      </div>

      {/* F-5: Analytics Summary Bar */}
      <div className="absolute bottom-0 left-0 right-0 bg-[#161b22]/95 backdrop-blur-sm border-t border-[#30363d] px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-4 font-mono text-[11px] text-[#8b949e]">
          <span>
            Clusters: <span className="text-[#c9d1d9]">{analytics.clusterCount}</span>
          </span>
          <span>
            Concepts: <span className="text-[#c9d1d9]">{analytics.totalConcepts}</span>
          </span>
          <span>
            Connections: <span className="text-[#c9d1d9]">{analytics.totalConnections}</span>
          </span>
          <span>
            Gaps: <span className="text-[#c9d1d9]">{analytics.totalGaps}</span>
          </span>
          <span>
            Avg Density: <span className="text-[#c9d1d9]">{analytics.avgDensity.toFixed(2)}</span>
          </span>
          <span>
            Largest:{' '}
            <span className="text-[#c9d1d9]">
              {analytics.largestLabel.length > 20
                ? analytics.largestLabel.slice(0, 20) + '...'
                : analytics.largestLabel}
            </span>
          </span>
        </div>
        {/* Mini bar chart of cluster size distribution */}
        <div className="flex items-end gap-[2px] h-4">
          {analytics.sizes.map((size, i) => {
            const maxS = Math.max(...analytics.sizes, 1);
            const barH = Math.max(2, (size / maxS) * 16);
            const cLabel = clusters[i]?.label || `cluster-${clusters[i]?.cluster_id}`;
            const barColor = CLUSTER_COLORS[hashStringToIndex(cLabel, CLUSTER_COLORS.length)];
            return (
              <div
                key={i}
                className="rounded-sm"
                style={{ width: 6, height: barH, backgroundColor: barColor, opacity: 0.8 }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default TopicViewMode;
