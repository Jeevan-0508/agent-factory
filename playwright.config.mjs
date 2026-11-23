import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4173/dashboard/index.html';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  snapshotPathTemplate: '{testDir}/visual.spec.mjs-snapshots/{arg}{ext}',
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    browserName: 'chromium',
    colorScheme: 'dark',
    locale: 'en-US',
    reducedMotion: 'reduce',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure'
  },
  webServer: {
    command: 'node tests/e2e/server.mjs',
    url: baseURL,
    timeout: 30_000,
    reuseExistingServer: !process.env.CI
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: '**/visual.spec.mjs',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }
    },
    {
      name: 'visual-desktop',
      testMatch: '**/visual.spec.mjs',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }
    },
    {
      name: 'visual-tablet',
      testMatch: '**/visual.spec.mjs',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 900 } }
    },
    {
      name: 'visual-mobile',
      testMatch: '**/visual.spec.mjs',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } }
    },
    {
      name: 'visual-wide',
      testMatch: '**/visual.spec.mjs',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } }
    }
  ]
});
