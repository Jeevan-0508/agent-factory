import { test, expect } from '@playwright/test';
import { chooseExperience, experiences, loadApp, waitForStableLayout } from './helpers.mjs';

test('approved overview screenshot for every experience', async ({ page }, testInfo) => {
  await loadApp(page);
  for (const id of experiences) {
    await chooseExperience(page, id);
    await waitForStableLayout(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
    await expect(page).toHaveScreenshot(`${id}-${testInfo.project.name}.png`, { fullPage: true, animations: 'disabled', caret: 'hide', scale: 'css' });
  }
});
