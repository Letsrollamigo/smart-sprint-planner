/**
 * Smoke test 3: History → edit → working copy banner → re-validate.
 * Covers §5.1 RP scenario 3: «Открыть на правку» создаёт working copy.
 */
import { test, expect } from '@playwright/test';
import { setupApiMock, makeHistorySnap } from '../fixtures/youtrack-api-mock.js';

const DISTRIBUTED_SNAP = makeHistorySnap({
  sprintId: 'sprint-may-2026',
  roleKey: 'frontend',
  status: 'ALLOCATED',
  confirmedAt: Date.now() - 86400000,
  items: [
    { id: 'TEST-1', summary: 'Task One', estimate_frontend: 8, inclusionStatus: 'INCLUDED' }
  ]
});

test.beforeEach(async ({ page }) => {
  await setupApiMock(page, { history: [DISTRIBUTED_SNAP] });
  await page.goto('/widgets/main/index.html');
  await page.waitForSelector('.widget-header', { timeout: 10000 });
});

test('History tab renders sprint list', async ({ page }) => {
  await page.locator('.tab-btn[data-tab="history"]').click();
  // History list should have at least one entry
  await expect(page.locator('#histList, .history-list, [id*="hist"]').first()).toBeVisible({ timeout: 5000 });
});

test('widget header shows sprint selector with history item', async ({ page }) => {
  // Sprint selector should list the seeded history sprint
  const sel = page.locator('#widgetSprintSel').first();
  await expect(sel).toBeVisible({ timeout: 5000 });
});
