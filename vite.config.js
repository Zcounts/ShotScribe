import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5173,
    host: true
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      // pdfreader and its dependencies use Node.js APIs (fs, events, stream).
      // In Electron's renderer process these are available at runtime via
      // Node integration, so we mark them as external to keep the browser
      // bundle clean.
      external: ['pdfreader', 'pdf2json', 'events', 'fs', 'stream', 'util', 'path', 'buffer'],
    },
  },
  optimizeDeps: {
    exclude: ['pdfreader'],
  },
})
