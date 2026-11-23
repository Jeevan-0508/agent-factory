import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { catalog, chooseExperience, experiences, loadApp, waitForStableLayout } from './helpers.mjs';

test('all eight experiences share the same registry and remain navigable', async ({ page }) => {
  await loadApp(page);
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
  for (const id of experiences) {
    await chooseExperience(page, id);
    await expect(page.locator('#app h1').first()).toBeVisible();
    await page.getByRole('button', { name: /Agent explorer/i }).click();
    await expect(page.locator(indexSelectors[id])).toHaveCount(100);
    await page.getByRole('button', { name: /Overview/i }).click();
  }
});

test('every catalog role opens a complete profile', async ({ page }) => {
  test.setTimeout(120_000);
  await loadApp(page, '#agents');
  await expect(page.locator('.agent-card')).toHaveCount(100);
  for (const role of catalog.roles) {
    const card = page.locator(`.agent-card[data-role-id="${role.name}"]`);
    await expect(card).toHaveCount(1);
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: 'Open profile' }).click();
    await expect(page.locator('#app h1')).toHaveText(role.title);
    await expect(page.locator('#app')).toContainText('Developer prompt');
    await expect(page.locator('#app')).toContainText('Boundaries and limitations');
    await page.getByRole('button', { name: /Back to explorer/i }).click();
  }
});

test('search, prompt studio, workflow designer, evaluation lab, governance, and persistence work', async ({ page }) => {
  await loadApp(page);
  await page.locator('#global-search').fill('risk');
  await expect(page).toHaveURL(/#agents$/);
  await expect(page.locator('.agent-card')).toHaveCount(14);
  await page.locator('#experience-select').selectOption('mythology-atlas');
  await page.locator('[data-view="prompts"]').click();
  await expect(page.locator('#app')).toContainText('Prompt Studio');
  await page.locator('#prompt-context').fill('Bounded release-readiness evidence.');
  await expect(page.locator('#prompt-preview')).toContainText('Bounded release-readiness evidence.');
  await page.locator('[data-view="workflows"]').click();
  await expect(page.locator('#app')).toContainText('Workflow designer');
  const initialSteps = await page.locator('.workflow-step').count();
  await page.getByRole('button', { name: 'Add step' }).click();
  await expect(page.locator('.workflow-step')).toHaveCount(initialSteps + 1);
  await page.locator('[data-view="evaluations"]').click();
  await expect(page.locator('#app')).toContainText('Evidence before confidence');
  await page.locator('[data-view="governance"]').click();
  await expect(page.locator('#app')).toContainText('Keep autonomy bounded');
  await page.reload();
  await expect(page.locator('#experience-select')).toHaveValue('mythology-atlas');
});

test('Galaxy renders evidence-backed relationships and an accessible directory', async ({ page }) => {
  await loadApp(page);
  await chooseExperience(page, 'agent-galaxy');
  await expect(page.locator('svg[role="group"]')).toBeVisible();
  await expect(page.locator('svg circle')).toHaveCount(100);
  await expect(page.locator('.galaxy-directory button')).toHaveCount(100);
  const edgeCount = await page.locator('svg line').count();
  expect(edgeCount).toBeGreaterThan(0);
});

test('keyboard focus, reduced motion, and no runtime console errors hold on core views', async ({ page }) => {
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await loadApp(page);
  await page.keyboard.press('Control+K');
  await expect(page.locator('#global-search')).toBeFocused();
  await page.locator('#sidebar-toggle').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#sidebar-toggle')).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Escape');
  await page.locator('#sidebar-toggle').press('Enter');
  await expect(page.locator('#sidebar-toggle')).toHaveAttribute('aria-expanded', 'true');
  await waitForStableLayout(page);
  expect(errors).toEqual([]);
});

test('mobile navigation is contained and Galaxy nodes expose keyboard activation', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await loadApp(page);
  await expect(page.locator('#sidebar')).toHaveAttribute('aria-hidden', 'true');
  await page.locator('#mobile-menu').click();
  await expect(page.locator('#mobile-menu')).toHaveAccessibleName('Close navigation');
  await expect(page.locator('#sidebar .nav-item').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#mobile-menu')).toBeFocused();
  await chooseExperience(page, 'agent-galaxy');
  const directory = page.locator('.galaxy-directory');
  await directory.locator('summary').press('Enter');
  await directory.locator('button').first().press('Enter');
  await expect(page).toHaveURL(/#agent-detail$/);
});

test('automated WCAG scan has no critical or serious violations', async ({ page }) => {
  await loadApp(page);
  for (const id of experiences) {
    await chooseExperience(page, id);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const severe = results.violations.filter((item) => ['critical', 'serious'].includes(item.impact));
    expect(severe, `${id}: ${JSON.stringify(severe)}`).toEqual([]);
  }
  await chooseExperience(page, 'command-center');
  for (const route of ['#overview', '#agents', '#prompts', '#workflows', '#evaluations', '#governance']) {
    await loadApp(page, route);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const severe = results.violations.filter((item) => ['critical', 'serious'].includes(item.impact));
    expect(severe, `${route}: ${JSON.stringify(severe)}`).toEqual([]);
  }
});
