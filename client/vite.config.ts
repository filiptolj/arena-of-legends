import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    open: false,
    // Multiplayer: forward WebSocket traffic to the game server (npm run dev:server).
    proxy: { '/ws': { target: 'ws://localhost:3001', ws: true } },
  },
  // three.js alone is ~500 kB minified.
  build: { chunkSizeWarningLimit: 800 },
});
