import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const isSiteGroundMode = mode === 'siteground'

  return {
    plugins: [react()],
    // Use relative asset URLs so a single static build can be deployed either
    // at a domain root (https://example.com/) or under a subfolder
    // (https://example.com/shotscribe/).
    base: './',
    server: {
      port: 5173,
      host: true,
    },
    build: {
      outDir: isSiteGroundMode ? 'dist-siteground' : 'dist',
      rollupOptions: {
        // pdfreader and its dependencies use Node.js APIs (fs, events, stream).
        // In Electron's renderer process these are available at runtime via
        // Node integration, so we mark them as external to keep the browser
        // bundle clean.
        external: ['pdfreader', 'pdf2json', 'events', 'fs', 'stream', 'util', 'path', 'buffer'],
      },
    },
    optimizeDeps: {
      // Limit dependency crawling to the desktop entrypoint.
      // Without this, Vite scans /mobile/index.html too, which imports the
      // local @shotscribe/shared package and can crash desktop dev startup
      // before Electron loads the renderer.
      entries: ['index.html', 'src/main.jsx'],
      exclude: ['pdfreader'],
    },
  }
})
