import tailwindcssAnimate from 'tailwindcss-animate'

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Legacy aliases
        cream: '#FAF8F4',
        'cream-dark': '#EDE9E1',
        // Brand palette
        black: '#1A1A1A',
        slate: '#4A5568',
        'slate-light': '#718096',
        burgundy: '#6B2737',
        cherry: '#E84040',
        royal: '#5265EA',
        mustard: '#F2C250',
        lavender: '#E489F6',
        // Surface tints
        canvas: '#F5F2EC',
        'canvas-dark': '#EDE9E1',
        paper: '#FAF8F4',
        ink: '#2C2C2C',
        // Chrome
        chrome: '#1C1C1E',
        'chrome-mid': '#2C2C2E',
        'chrome-border': '#3A3A3C',
      },
      fontFamily: {
        sans: ['Sora', 'system-ui', '-apple-system', 'Segoe UI', 'Helvetica', 'Arial', 'sans-serif'],
        sora: ['Sora', 'sans-serif'],
      },
      borderWidth: {
        3: '3px',
      },
    },
  },
  plugins: [tailwindcssAnimate],
}
