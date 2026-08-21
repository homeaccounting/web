import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173/app/',
    trace: 'retain-on-failure',
    // Pin the browser locale so the app renders in English by default (the UI is
    // now language-aware via browser Accept-Language — an unpinned locale would
    // follow the CI/dev machine's locale and break English-selector specs).
    // Specs that need another language opt in with `test.use({ locale: '…' })`.
    locale: 'en-US',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173/app/',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
