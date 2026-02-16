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
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'monospace'],
      },
      colors: {
        // Deep observatory navy — single solid color, NO gradients
        surface: {
          0: '#080c16',
          1: '#0c1120',
          2: '#111729',
          3: '#161d33',
          4: '#1c243d',
          5: '#232c48',
        },
        // Text with blue undertone — like ink on chart paper
        text: {
          primary: '#d4dae8',
          secondary: '#8892aa',
          tertiary: '#566178',
          ghost: '#3a4257',
        },
        // Accent 1: muted teal — right ascension lines on star charts
        teal: {
          DEFAULT: '#5b9a8b',
          dim: 'rgba(91, 154, 139, 0.12)',
          line: 'rgba(91, 154, 139, 0.08)',
        },
        // Accent 2: dim copper — brass instrument, observation labels
        copper: {
          DEFAULT: '#a07d5a',
          dim: 'rgba(160, 125, 90, 0.12)',
        },
        // Borders — very subtle, chart-line style
        border: {
          DEFAULT: 'rgba(212, 218, 232, 0.06)',
          hover: 'rgba(212, 218, 232, 0.12)',
          dotted: 'rgba(212, 218, 232, 0.08)',
        },
        // Node types — desaturated, scholarly
        node: {
          paper: '#6b8ccc',
          author: '#6ba396',
          concept: '#8b7cb8',
          method: '#b8976b',
          finding: '#b87b8b',
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.6s ease-out',
        'slide-up': 'slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
