/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        bangers: ['Bangers', 'cursive'],
        nunito: ['Nunito', 'sans-serif'],
      },
      colors: {
        pitch: {
          dark: '#1a4731',
          mid: '#2d7a50',
          light: '#3a9960',
        },
        game: {
          bg: '#0b0f1e',
          card: '#131929',
          border: '#1e2d4a',
          'border-bright': '#2a4070',
          neon: '#00ff87',
          fire: '#ff6b35',
          gold: '#ffd60a',
          sky: '#38bdf8',
          purple: '#a855f7',
          red: '#f43f5e',
        },
      },
      boxShadow: {
        neon: '0 0 20px rgba(0,255,135,0.4)',
        fire: '0 0 20px rgba(255,107,53,0.4)',
        gold: '0 0 20px rgba(255,214,10,0.5)',
        card: '0 4px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)',
        btn: '0 4px 0 rgba(0,0,0,0.5)',
        'btn-press': '0 1px 0 rgba(0,0,0,0.5)',
      },
      animation: {
        'pulse-neon': 'pulse-neon 2s ease-in-out infinite',
        float: 'float 3s ease-in-out infinite',
        'slide-up': 'slideUp 0.3s ease-out',
        pop: 'pop 0.25s ease-out',
        shimmer: 'shimmer 2s linear infinite',
        'spin-slow': 'spin 4s linear infinite',
      },
      keyframes: {
        'pulse-neon': {
          '0%, 100%': { opacity: '1', boxShadow: '0 0 20px rgba(0,255,135,0.4)' },
          '50%': { opacity: '0.8', boxShadow: '0 0 40px rgba(0,255,135,0.8)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        pop: {
          '0%': { transform: 'scale(0.85)', opacity: '0' },
          '70%': { transform: 'scale(1.05)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
}
