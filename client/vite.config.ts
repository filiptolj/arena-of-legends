import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5173, open: false },
  // three.js alone is ~500 kB minified.
  build: { chunkSizeWarningLimit: 800 },
});
