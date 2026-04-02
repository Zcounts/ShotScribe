import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const isSiteGroundMode = mode === 'siteground'

  return {
    plugins: [react()],
    // App is served at the domain root (for example app.shot-scribe.com/).
    base: '/',
    server: {
      port: 5173,
      host: true,
    },
    build: {
      outDir: isSiteGroundMode ? 'dist-siteground' : 'dist',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'index.html'),
        },
        // pdfreader and its dependencies use Node.js APIs (fs, events, stream).
        // We keep these external to avoid bundling server-only modules into the web client.
        external: ['pdfreader', 'pdf2json', 'events', 'fs', 'stream', 'util', 'path', 'buffer'],
      },
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
    optimizeDeps: {
      // Limit dependency crawling to the main web entrypoint.
      // Without this, Vite also scans /mobile/index.html, which can pull in
      // mobile-only dependency graphs during web dev startup.
      entries: ['index.html', 'src/main.jsx'],
      exclude: ['pdfreader'],
    },
  }
})
