import { test, expect } from '@playwright/test';

test.describe('V4 execution console', () => {
  test('loads the real local runtime and completes an offline scenario', async ({ page }) => {
    await page.goto('#execution');
    await expect(page.getByText('Backend connected')).toBeVisible();
    await expect(page.getByText('Five offline proofs')).toBeVisible();
    await page.getByRole('button', { name: 'Run offline scenario' }).first().click();
    await expect(page.locator('.timeline-card h2')).toContainText('COMPLETED', { timeout: 15_000 });
    await expect(page.locator('.evidence-json')).not.toContainText('Select a completed task');
  });

  test('preserves the execution surface on mobile and exposes keyboard controls', async ({ page }) => {
    await page.goto('#execution');
    await expect(page.getByRole('button', { name: /Enable kill switch|Clear kill switch/ })).toBeVisible();
    await page.getByRole('button', { name: 'Enable kill switch' }).focus();
    await expect(page.getByRole('button', { name: 'Enable kill switch' })).toBeFocused();
    await expect(page.locator('.execution-surface')).toBeVisible();
  });
});
