import { test, expect } from '@playwright/test';

const seenKey = 'agent-factory-divine-council-seen';

async function clearCouncilPreference(page) {
  await page.addInitScript((key) => localStorage.removeItem(key), seenKey);
}

async function useDeterministicTimeline(page, milliseconds = 2300) {
  await page.addInitScript((duration) => { window.__DIVINE_COUNCIL_TIMELINE_MS__ = duration; }, milliseconds);
}

async function enterFactory(page) {
  const enter = page.getByRole('button', { name: 'ENTER THE FACTORY' });
  await expect(enter).toBeVisible();
  await enter.click();
  await expect(page.locator('#divine-council-overlay')).toHaveCount(0);
  await expect(page.locator('#app')).toContainText('A governed team for ambitious work.');
}

test('first visit opens the optional cinematic and Enter the Factory returns to the dashboard', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await clearCouncilPreference(page);
  const failedRequests = [];
  const pageErrors = [];
  page.on('requestfailed', (request) => failedRequests.push(request.url()));
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('', { waitUntil: 'networkidle' });
  const overlay = page.locator('#divine-council-overlay');
  await expect(overlay).toBeVisible();
  await expect(overlay.locator('.divine-council-reading-rule')).toBeVisible();
  await expect(overlay).toHaveAttribute('aria-label', 'Agent Factory Council of Entities opening');
  await expect(overlay.locator('.divine-entity-ribbon span')).toHaveCount(10);
  await expect(overlay.locator('img[src*="shiva"], img[src*="zeus"], img[src*="odin"], img[src*="ra"]')).toHaveCount(0);
  await expect(overlay.locator('img[src*="council-clean"]')).toHaveCount(1);
  await expect(overlay.locator('.divine-council-skip')).toHaveText('Skip intro');
  await page.screenshot({ path: testInfo.outputPath('divine-council-desktop.png'), fullPage: false });
  await overlay.locator('.divine-council-skip').click();
  await expect(overlay).toHaveAttribute('data-scene', 'chamber');
  await enterFactory(page);
  expect(await page.evaluate((key) => localStorage.getItem(key), seenKey)).toBe('true');
  expect(failedRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('direct dashboard links bypass the intro and navigation can replay it', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('#agents', { waitUntil: 'networkidle' });
  await expect(page.locator('#divine-council-overlay')).toHaveCount(0);
  await page.goto('#council-of-entities', { waitUntil: 'networkidle' });
  await expect(page.locator('#divine-council-overlay')).toBeVisible();
  await expect(page.locator('#divine-council-overlay')).toHaveAttribute('data-council', 'entities');
  await page.locator('#divine-council-overlay .divine-council-skip').click();
  await page.locator('#divine-council-overlay [data-control="replay"]').click();
  await expect(page.locator('#divine-council-overlay')).toHaveAttribute('data-scene', 'awakening');
  await page.locator('#divine-council-overlay .divine-council-skip').click();
  await expect(page.locator('#divine-council-overlay')).toHaveAttribute('data-scene', 'chamber');
  await page.getByRole('button', { name: 'ENTER THE FACTORY' }).click();
  await expect(page.locator('#divine-council-overlay')).toHaveCount(0);
  await page.locator('[data-view="divine-council"]').click();
  const overlay = page.locator('#divine-council-overlay');
  await expect(overlay).toBeVisible();
  await overlay.locator('.divine-council-skip').click();
  await expect(overlay).toHaveAttribute('data-scene', 'chamber');
  await overlay.locator('[data-control="replay"]').click();
  await expect(overlay).toHaveAttribute('data-scene', 'awakening');
  await overlay.locator('.divine-council-skip').click();
  await enterFactory(page);
});

test('reduced motion, mobile layout, and non-WebGL fallback remain usable', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await clearCouncilPreference(page);
  await page.goto('', { waitUntil: 'networkidle' });
  const overlay = page.locator('#divine-council-overlay');
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveAttribute('data-scene', 'chamber');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.screenshot({ path: testInfo.outputPath('divine-council-mobile.png'), fullPage: false });
  await enterFactory(page);

  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function getContext(type, ...args) {
      if (type === 'webgl') return null;
      return original.call(this, type, ...args);
    };
  });
  await page.evaluate((key) => localStorage.removeItem(key), seenKey);
  await page.goto('', { waitUntil: 'networkidle' });
  const fallback = page.locator('#divine-council-overlay');
  await expect(fallback).toHaveClass(/is-fallback/);
  await expect(fallback.locator('.divine-council-fallback')).toBeVisible();
  await enterFactory(page);
});

test('director cut captures distinct scenes at deterministic timeline checkpoints', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await clearCouncilPreference(page);
  await useDeterministicTimeline(page, 23000);
  await page.goto('', { waitUntil: 'commit' });
  const overlay = page.locator('#divine-council-overlay');
  const capture = async (scene, filename) => {
    await expect(overlay).toHaveAttribute('data-scene', scene);
    await page.screenshot({ path: testInfo.outputPath(filename), fullPage: false });
  };
  await capture('awakening', 'scene-01-cosmic-awakening.png');
  await expect(overlay).toHaveAttribute('data-scene', 'approach');
  await capture('approach', 'scene-02-approach-to-chamber.png');
  await expect(overlay).toHaveAttribute('data-scene', 'closeups');
  await capture('closeups', 'scene-03-entity-signals.png');
  await expect(overlay).toHaveAttribute('data-scene', 'assembly');
  await capture('assembly', 'scene-04-assembled-council.png');
  await expect(overlay).toHaveAttribute('data-scene', 'convergence');
  await capture('convergence', 'scene-05-convergence.png');
  await expect(overlay).toHaveAttribute('data-scene', 'title');
  await capture('title', 'scene-06-title-reveal.png');
  await expect(overlay).toHaveAttribute('data-scene', 'chamber');
  await capture('chamber', 'scene-07-interactive-chamber.png');
  expect(await page.evaluate(() => ({ width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth }))).toEqual({ width: 1440, height: 900, scrollWidth: 1440 });
});
