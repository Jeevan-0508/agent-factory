import { test, expect } from '@playwright/test';
import { loadApp } from './helpers.mjs';

test('local dashboard stays within release performance budgets', async ({ page }) => {
  const started = Date.now();
  await loadApp(page);
  const wallClockMs = Date.now() - started;
  const navigation = await page.evaluate(() => {
    const entry = performance.getEntriesByType('navigation')[0];
    return { domContentLoaded: entry.domContentLoadedEventEnd, loadEvent: entry.loadEventEnd, responseEnd: entry.responseEnd, transferSize: entry.transferSize };
  });
  expect(wallClockMs).toBeLessThan(5_000);
  expect(navigation.domContentLoaded).toBeLessThan(2_500);
  expect(navigation.responseEnd).toBeLessThan(2_500);
  const interactionStarted = Date.now();
  await page.locator('#global-search').fill('governance');
  await expect(page.locator('.agent-card')).not.toHaveCount(100);
  expect(Date.now() - interactionStarted).toBeLessThan(500);
  expect(navigation.transferSize).toBeLessThan(1_000_000);
});
