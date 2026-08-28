import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/demo',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: { baseURL: 'http://localhost:5174/app/', locale: 'en-US', trace: 'retain-on-failure' },
  projects: [
    // Static screenshots (committed baselines). Ignores the clip specs.
    {
      name: 'demo-chromium',
      testIgnore: /clips\//,
      use: { ...devices['Desktop Chrome'] },
    },
    // Flow clips: record video of each walkthrough. Not pixel-gated.
    {
      name: 'demo-clips',
      testMatch: /clips\/.*\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'], video: 'on' },
    },
  ],
  webServer: {
    command: 'pnpm demo',
    url: 'http://localhost:5174/app/',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
