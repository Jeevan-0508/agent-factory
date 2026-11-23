import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const catalog = JSON.parse(fs.readFileSync(path.join(root, 'catalog', 'roles.json'), 'utf8'));
export const experiences = ['command-center', 'minimal-studio', 'cyberpunk-neon', 'glass-universe', 'agent-galaxy', 'mythology-atlas', 'retro-terminal', 'neo-brutalist-lab'];

export async function loadApp(page, hash = '#overview') {
  await page.goto(`${hash}`);
  await expect(page.locator('#app')).not.toContainText('Loading command center');
  await expect(page.locator('#experience-select')).toHaveValue(/-/);
}

export async function chooseExperience(page, id) {
  await page.locator('#experience-select').selectOption(id);
  await expect(page.locator('html')).toHaveAttribute('data-experience', id);
}

export async function waitForStableLayout(page) {
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForTimeout(80);
}
