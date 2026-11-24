import { test, expect } from '@playwright/test';

const experiences = ['command-center', 'minimal-studio', 'cyberpunk-neon', 'glass-universe', 'agent-galaxy', 'mythology-atlas', 'retro-terminal', 'neo-brutalist-lab'];
const indexSelectors = {
  'command-center': '.agent-card',
  'minimal-studio': '.minimal-agent-list .minimal-row',
  'cyberpunk-neon': '.cyber-agent-index .cyber-row',
  'glass-universe': '.glass-agent-deck .glass-agent-card',
  'agent-galaxy': '.galaxy-directory-list .experience-role-chip',
  'mythology-atlas': '.atlas-agent-grid .experience-role-chip',
  'retro-terminal': '.full-terminal-list .terminal-line',
  'neo-brutalist-lab': '.brutalist-agent-grid .brutalist-role'
};

async function openView(page, view) {
  const mobileMenu = page.locator('#mobile-menu');
  if (await mobileMenu.isVisible() && await mobileMenu.getAttribute('aria-expanded') !== 'true') await mobileMenu.click();
  await page.locator(`[data-view="${view}"]`).click();
}

test('production subpath loads all catalog and dashboard capabilities', async ({ page }) => {
  test.setTimeout(120_000);
  const failedRequests = [];
  const pageErrors = [];
  page.on('requestfailed', (request) => failedRequests.push(`${request.url()} — ${request.failure()?.errorText || 'failed'}`));
  page.on('response', (response) => { if (response.url().startsWith('http://127.0.0.1:4173') && response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`); });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  const response = await page.goto('#agents', { waitUntil: 'networkidle' });
  expect(response?.status()).toBe(200);
  await expect(page.locator('.agent-card')).toHaveCount(100);
  await expect(page.locator('#nav-agent-count')).toHaveText('100');

  for (const experience of experiences) {
    await page.locator('#experience-select').selectOption(experience);
    await expect(page.locator('html')).toHaveAttribute('data-experience', experience);
    await expect(page.locator('[data-view="agents"]')).toBeVisible();
    await expect(page.locator(indexSelectors[experience])).toHaveCount(100);
    await page.screenshot({ path: test.info().outputPath(`${experience}.png`), fullPage: true });
  }

  await page.locator('#experience-select').selectOption('command-center');
  await page.locator('.toolbar .search-field').fill('risk');
  await expect(page.locator('.agent-card')).toHaveCount(14);
  await page.locator('.agent-card').first().getByRole('button', { name: 'Open profile' }).click();
  await expect(page.locator('#app')).toContainText('Developer prompt');
  await expect(page.locator('#app')).toContainText('Boundaries and limitations');
  await page.getByRole('button', { name: /Back to explorer/i }).click();

  await openView(page, 'prompts');
  await expect(page.locator('#app')).toContainText('Prompt Studio');
  await page.locator('#prompt-context').fill('Production subpath regression evidence.');
  await expect(page.locator('#prompt-preview')).toContainText('Production subpath regression evidence.');
  await openView(page, 'workflows');
  await expect(page.locator('#app')).toContainText('Workflow designer');
  const initialSteps = await page.locator('.workflow-step').count();
  await page.getByRole('button', { name: 'Add step' }).click();
  await expect(page.locator('.workflow-step')).toHaveCount(initialSteps + 1);
  await openView(page, 'evaluations');
  await expect(page.locator('#app')).toContainText('Evidence before confidence');
  await openView(page, 'governance');
  await expect(page.locator('#app')).toContainText('Keep autonomy bounded');

  await openView(page, 'olympus');
  await expect(page.locator('#app')).toContainText('public dashboard intentionally does not expose SQLite');
  await openView(page, 'council');
  await expect(page.locator('#app')).toContainText('Showcase mode.');
  await openView(page, 'god-loop');
  await expect(page.locator('#app')).toContainText('public dashboard does not create or run local loops');
  await openView(page, 'execution');
  await expect(page.locator('#app')).toContainText('Local runtime required for execution');

  expect(failedRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
});
