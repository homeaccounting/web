import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import infoEndpoint from './vite/plugins/info-endpoint';

export default defineConfig({
  base: '/app/',
  plugins: [react(), infoEndpoint()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  server: { port: 5173 },
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'vite/**/*.{test,spec}.ts'],
    exclude: ['node_modules', 'dist', '.direnv', '.git', 'e2e'],
  },
});
