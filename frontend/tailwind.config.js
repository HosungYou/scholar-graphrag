/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-outfit)', 'IBM Plex Sans', 'Inter', 'system-ui', 'sans-serif'],
        display: ['var(--font-outfit)', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'monospace'],
      },
      
      colors: {
        // The Neural Nexus Palette
        nexus: {
          950: '#020617',
          900: '#0f172a',
          800: '#1e293b',
          indigo: '#6366f1',
          violet: '#8b5cf6',
          cyan: '#22d3ee',
          pink: '#ec4899',
        },
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
          950: '#172554',
        },
        // Node type colors
        'node-paper': { from: '#3b82f6', to: '#1d4ed8', DEFAULT: '#3b82f6' },
        'node-author': { from: '#10b981', to: '#059669', DEFAULT: '#10b981' },
        'node-concept': { from: '#8b5cf6', to: '#7c3aed', DEFAULT: '#8b5cf6' },
        'node-method': { from: '#f59e0b', to: '#d97706', DEFAULT: '#f59e0b' },
        'node-finding': { from: '#ef4444', to: '#dc2626', DEFAULT: '#ef4444' },
      },
      
      backgroundImage: {
        'mesh-nexus': `
          radial-gradient(at 0% 0%, rgba(99, 102, 241, 0.15) 0px, transparent 50%),
          radial-gradient(at 100% 0%, rgba(139, 92, 246, 0.15) 0px, transparent 50%),
          radial-gradient(at 100% 100%, rgba(34, 211, 238, 0.1) 0px, transparent 50%),
          radial-gradient(at 0% 100%, rgba(236, 72, 153, 0.1) 0px, transparent 50%)
        `,
      },
      
      boxShadow: {
        'nexus-glow': '0 0 40px -10px rgba(99, 102, 241, 0.5)',
        'node-glow': '0 0 20px rgba(var(--node-color-rgb), 0.4)',
      },
      
      animation: {
        'orbit': 'orbit 20s linear infinite',
        'pulse-glow': 'pulse-glow 4s ease-in-out infinite',
        'float-nexus': 'float-nexus 6s ease-in-out infinite',
        'scanline': 'scanline 8s linear infinite',
      },
      
      keyframes: {
        orbit: {
          '0%': { transform: 'rotate(0deg) translateX(10px) rotate(0deg)' },
          '100%': { transform: 'rotate(360deg) translateX(10px) rotate(-360deg)' },
        },
        'pulse-glow': {
          '0%, 100%': { opacity: '0.5', filter: 'blur(10px)' },
          '50%': { opacity: '0.8', filter: 'blur(15px)' },
        },
        'float-nexus': {
          '0%, 100%': { transform: 'translateY(0) scale(1)' },
          '50%': { transform: 'translateY(-20px) scale(1.02)' },
        },
        scanline: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
      },

      backdropBlur: {
        'nexus': '24px',
      },
    },
  },
  plugins: [],
};
