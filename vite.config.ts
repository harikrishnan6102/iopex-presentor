import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // The microphone and camera need a secure context: https or localhost.
    port: 8080,
    host: true,
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
});
