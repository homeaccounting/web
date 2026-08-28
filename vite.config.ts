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
    // analytics.ts injects a real <script src=gc.zgo.at/count.js>; without this,
    // happy-dom network-fetches it, flaking the suite and tripping MSW's
    // onUnhandledRequest:'error'. No test relies on loading external scripts.
    environmentOptions: {
      happyDOM: { settings: { disableJavaScriptFileLoading: true } },
    },
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'vite/**/*.{test,spec}.ts'],
    exclude: ['node_modules', 'dist', '.direnv', '.git', 'e2e'],
  },
});
