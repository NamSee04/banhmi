/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          void:     '#06060a',
          deep:     '#0a0a10',
          surface:  '#101018',
          elevated: '#16161f',
          hover:    '#1c1c28',
        },
        border: {
          subtle:  '#1e1e2a',
          DEFAULT: '#2a2a3a',
          strong:  '#3a3a4e',
        },
        fg: {
          primary:   '#e4e4ed',
          secondary: '#8888a0',
          muted:     '#5a5a70',
        },
        accent: {
          DEFAULT: '#7c3aed',
          dim:     '#5b21b6',
          soft:    '#a78bfa',
        },
      },
      fontFamily: {
        sans: ['Outfit', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        glow:       '0 0 16px 2px rgba(124,58,237,0.45)',
        'glow-soft': '0 0 10px 1px rgba(124,58,237,0.25)',
        'glow-red':  '0 0 12px 2px rgba(239,68,68,0.40)',
        'inner-soft': 'inset 0 1px 0 0 rgba(255,255,255,0.05)',
      },
      backgroundImage: {
        'graph-radial': 'radial-gradient(ellipse at 50% 40%, #12103a 0%, #06060a 70%)',
        'panel-sheen':  'linear-gradient(135deg, rgba(124,58,237,0.04) 0%, transparent 60%)',
      },
      keyframes: {
        breathe: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.55' },
        },
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 6px 1px rgba(124,58,237,0.3)' },
          '50%':      { boxShadow: '0 0 18px 4px rgba(124,58,237,0.6)' },
        },
        'slide-in': {
          from: { opacity: '0', transform: 'translateX(12px)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        breathe:     'breathe 2.4s ease-in-out infinite',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'slide-in':  'slide-in 0.22s ease-out both',
        'slide-up':  'slide-up 0.22s ease-out both',
        'fade-in':   'fade-in 0.18s ease-out both',
        shimmer:     'shimmer 1.8s linear infinite',
      },
    },
  },
  plugins: [],
}
