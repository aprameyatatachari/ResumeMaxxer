/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // The backend's CORS allowlist is pinned to this port, so keep it fixed.
    // `strictPort` makes a port clash fail loudly instead of silently moving
    // to 5174 and producing confusing CORS errors.
    port: 5173,
    strictPort: true,
  },
  test: {
    // jsdom for `btoa`, `File`, `FormData` and friends - the units under test
    // are browser code even though they render nothing.
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    coverage: { reporter: ['text', 'lcov'], include: ['src/lib/**', 'src/hooks/**'] },
  },
  optimizeDeps: {
    // @react-pdf/renderer ships CommonJS internals that Vite's dev-time
    // pre-bundler must process, otherwise the first PDF render throws
    // "does not provide an export named default".
    include: ['@react-pdf/renderer'],
  },
})
