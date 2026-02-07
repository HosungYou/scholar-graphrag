/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      /* ============================================================
         ScholaRAG Graph - "Editorial Research" Design System
         VS Design Diverge: Direction B (T-Score 0.4)
         ============================================================ */

      /* Color System - Precision Research Palette */
      colors: {
        // Primary
        ink: 'rgb(var(--color-ink) / <alpha-value>)',
        paper: 'rgb(var(--color-paper) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',

        // Accents
        'accent-red': 'rgb(var(--color-accent-red) / <alpha-value>)',
        'accent-teal': 'rgb(var(--color-accent-teal) / <alpha-value>)',
        'accent-amber': 'rgb(var(--color-accent-amber) / <alpha-value>)',
        'accent-purple': 'rgb(var(--color-accent-purple) / <alpha-value>)',
        'accent-orange': 'rgb(var(--color-accent-orange) / <alpha-value>)',

        // Semantic
        muted: 'rgb(var(--color-muted) / <alpha-value>)',
        border: 'rgb(var(--color-border) / <alpha-value>)',
        'border-light': 'rgb(var(--color-border-light) / <alpha-value>)',

        // Entity Node Colors (Polygonal Shapes)
        'node-concept': '#8B5CF6',    // Purple - Hexagon
        'node-method': '#F59E0B',     // Amber - Diamond
        'node-finding': '#10B981',    // Emerald - Square
        'node-problem': '#EF4444',    // Red - Pentagon
        'node-dataset': '#3B82F6',    // Blue - Octagon
        'node-metric': '#EC4899',     // Pink - Circle
        'node-innovation': '#14B8A6', // Teal - Star
        'node-limitation': '#F97316', // Orange - Triangle

        // Cluster Colors (12-color palette)
        'cluster-1': '#E63946',
        'cluster-2': '#2EC4B6',
        'cluster-3': '#F4A261',
        'cluster-4': '#457B9D',
        'cluster-5': '#A8DADC',
        'cluster-6': '#9D4EDD',
        'cluster-7': '#06D6A0',
        'cluster-8': '#118AB2',
        'cluster-9': '#EF476F',
        'cluster-10': '#FFD166',
        'cluster-11': '#073B4C',
        'cluster-12': '#7209B7',
      },

      /* Typography - Editorial Scale */
      fontFamily: {
        display: ['var(--font-instrument)', 'Georgia', 'serif'],
        body: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains)', 'Fira Code', 'monospace'],
      },

      fontSize: {
        'xs': ['0.64rem', { lineHeight: '1.4' }],    // 10px
        'sm': ['0.8rem', { lineHeight: '1.5' }],     // 13px
        'base': ['1rem', { lineHeight: '1.6' }],    // 16px
        'lg': ['1.25rem', { lineHeight: '1.5' }],   // 20px
        'xl': ['1.563rem', { lineHeight: '1.3' }],  // 25px
        '2xl': ['1.953rem', { lineHeight: '1.2' }], // 31px
        '3xl': ['2.441rem', { lineHeight: '1.1' }], // 39px
        '4xl': ['3.052rem', { lineHeight: '1.1' }], // 49px
      },

      letterSpacing: {
        'tighter': '-0.03em',
        'tight': '-0.02em',
        'normal': '-0.01em',
        'wide': '0.01em',
      },

      /* Spacing - Asymmetric Scale */
      spacing: {
        'micro': '2px',
        'xs': '6px',
        'sm': '12px',
        'md': '20px',
        'lg': '36px',
        'xl': '64px',
        '2xl': '100px',
        // Additional values for flexibility
        '18': '4.5rem',
        '22': '5.5rem',
        '30': '7.5rem',
      },

      /* Border Radius - Minimal */
      borderRadius: {
        'none': '0',
        'sm': '2px',
        'md': '4px',
        'lg': '8px',
        // Remove excessive rounding
        'DEFAULT': '4px',
      },

      /* Box Shadow - Editorial Subtle */
      boxShadow: {
        'sm': '0 1px 2px rgba(13, 13, 13, 0.04)',
        'md': '0 4px 12px rgba(13, 13, 13, 0.08)',
        'lg': '0 8px 24px rgba(13, 13, 13, 0.12)',
        'glow-teal': '0 0 20px rgba(46, 196, 182, 0.3)',
        'glow-white': '0 0 20px rgba(255, 255, 255, 0.2)',
        'glow-amber': '0 0 20px rgba(244, 162, 97, 0.4)',
      },

      /* Animation - Editorial Refined */
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'pulse-subtle': 'pulse-subtle 2s ease-in-out infinite',
        'shimmer': 'shimmer 1.5s ease-in-out infinite',
        'dash-flow': 'dash-flow 1s linear infinite',
        'node-pulse': 'node-pulse 2s ease-in-out infinite',
        'bridge-pulse': 'bridge-pulse 1.5s ease-in-out infinite',
        'fade-in': 'fade-in 0.3s ease-out',
        'slide-up': 'slide-up 0.4s ease-out',
        'scale-in': 'scale-in 0.2s ease-out',
      },

      keyframes: {
        'pulse-subtle': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.85' },
        },
        'shimmer': {
          '0%': { opacity: '0.5' },
          '50%': { opacity: '0.8' },
          '100%': { opacity: '0.5' },
        },
        'dash-flow': {
          'to': { strokeDashoffset: '-12' },
        },
        'node-pulse': {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.03)' },
        },
        'bridge-pulse': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.6', transform: 'scale(1.2)' },
        },
        'fade-in': {
          'from': { opacity: '0' },
          'to': { opacity: '1' },
        },
        'slide-up': {
          'from': { opacity: '0', transform: 'translateY(10px)' },
          'to': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          'from': { opacity: '0', transform: 'scale(0.95)' },
          'to': { opacity: '1', transform: 'scale(1)' },
        },
      },

      /* Transition Timing */
      transitionTimingFunction: {
        'smooth': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },

      transitionDuration: {
        'fast': '150ms',
        'base': '250ms',
        'slow': '400ms',
      },

      /* Grid - Editorial Asymmetric */
      gridTemplateColumns: {
        // Asymmetric layouts
        '70-30': '70% 30%',
        '60-40': '60% 40%',
        '30-70': '30% 70%',
        '40-60': '40% 60%',
        // Project list
        'project-row': '3rem 1fr 6rem 6rem 2rem',
      },

      /* Z-Index Scale */
      zIndex: {
        'dropdown': '100',
        'modal': '200',
        'tooltip': '300',
        'toast': '400',
      },

      /* Backdrop Blur */
      backdropBlur: {
        'xs': '2px',
      },
    },
  },
  plugins: [],
};
