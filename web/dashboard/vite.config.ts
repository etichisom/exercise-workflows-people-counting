import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// The build lands inside the Go package, which embeds it into the worker
// binary, so the dashboard ships without Node at runtime.
export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    outDir: '../../internal/app/dashboard',
    emptyOutDir: true,
    assetsInlineLimit: 0,
    sourcemap: false,
  },
  server: {
    // `npm run dev` talks to a running worker for live data.
    proxy: {
      '/api': 'http://127.0.0.1:8090',
      '/snapshots': 'http://127.0.0.1:8090',
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
