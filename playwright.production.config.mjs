import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e-production',
  timeout: 60_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list'], ['html', { outputFolder: 'playwright-production-report', open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173/agent-factory/',
    browserName: 'chromium',
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  projects: [
    { name: 'production-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'production-mobile', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } }
  ],
  webServer: {
    command: 'node tests/e2e-production/server.mjs',
    url: 'http://127.0.0.1:4173/agent-factory/',
    timeout: 30_000,
    reuseExistingServer: false
  }
});
