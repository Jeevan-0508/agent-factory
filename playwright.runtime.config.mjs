import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e-runtime',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-runtime-report', open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:8787/dashboard/index.html',
    browserName: 'chromium',
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  projects: [
    { name: 'runtime-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'runtime-mobile', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } }
  ],
  webServer: {
    command: 'node --experimental-sqlite server/index.mjs',
    url: 'http://127.0.0.1:8787/dashboard/index.html',
    timeout: 30_000,
    reuseExistingServer: !process.env.CI
  }
});
