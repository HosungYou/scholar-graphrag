'use client';

import { useId } from 'react';

/* ============================================================
   ScholaRAG Logo - VS Design Diverge Style

   Design Concept:
   - Hexagon represents "Concept" nodes (the core entity type)
   - Interconnected lines show knowledge connections
   - Teal accent color from design system
   - No generic rounded circles or blue colors
   ============================================================ */

interface ScholaRAGLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  className?: string;
}

export function ScholaRAGLogo({ size = 'md', showText = true, className = '' }: ScholaRAGLogoProps) {
  const id = useId();

  const sizes = {
    sm: { icon: 24, text: 'text-lg' },
    md: { icon: 32, text: 'text-xl' },
    lg: { icon: 40, text: 'text-2xl' },
  };

  const { icon: iconSize, text: textSize } = sizes[size];

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Custom SVG Logo - Hexagon with internal connections */}
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="flex-shrink-0"
        aria-hidden="true"
      >
        <defs>
          {/* Gradient for the hexagon fill */}
          <linearGradient id={`${id}-grad`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--color-accent-teal)" stopOpacity="0.2" />
            <stop offset="100%" stopColor="var(--color-accent-teal)" stopOpacity="0.05" />
          </linearGradient>
        </defs>

        {/* Outer Hexagon */}
        <path
          d="M20 2 L36 11 L36 29 L20 38 L4 29 L4 11 Z"
          fill={`url(#${id}-grad)`}
          stroke="var(--color-accent-teal)"
          strokeWidth="1.5"
        />

        {/* Internal connection lines forming a knowledge graph pattern */}
        <g stroke="var(--color-accent-teal)" strokeWidth="0.75" opacity="0.6">
          {/* Central node to corners */}
          <line x1="20" y1="20" x2="20" y2="8" />
          <line x1="20" y1="20" x2="30" y2="14" />
          <line x1="20" y1="20" x2="30" y2="26" />
          <line x1="20" y1="20" x2="20" y2="32" />
          <line x1="20" y1="20" x2="10" y2="26" />
          <line x1="20" y1="20" x2="10" y2="14" />
        </g>

        {/* Corner nodes (small diamonds for Method entity type) */}
        <g fill="var(--color-accent-teal)">
          <rect x="18" y="6" width="4" height="4" transform="rotate(45 20 8)" />
          <rect x="28" y="12" width="3" height="3" transform="rotate(45 29.5 13.5)" />
          <rect x="28" y="24" width="3" height="3" transform="rotate(45 29.5 25.5)" />
          <rect x="18" y="30" width="4" height="4" transform="rotate(45 20 32)" />
          <rect x="8" y="24" width="3" height="3" transform="rotate(45 9.5 25.5)" />
          <rect x="8" y="12" width="3" height="3" transform="rotate(45 9.5 13.5)" />
        </g>

        {/* Central node (larger, represents core concept) */}
        <circle cx="20" cy="20" r="4" fill="var(--color-accent-teal)" />
        <circle cx="20" cy="20" r="2" fill="var(--color-paper)" className="dark:fill-ink" />
      </svg>

      {/* Logo Text */}
      {showText && (
        <div className="flex flex-col leading-none">
          <span className={`font-display ${textSize} text-ink dark:text-paper tracking-tight`}>
            ScholaRAG
          </span>
          <span className="font-mono text-[10px] text-accent-teal tracking-widest uppercase">
            Graph
          </span>
        </div>
      )}
    </div>
  );
}
