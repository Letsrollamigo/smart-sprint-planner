/**
 * Smoke test 2: Personal distribution (Люди) — basic tab navigation.
 * Covers §5.1 RP scenario 2: режим «Люди» доступен, empty-state CTA видна.
 */
import { test, expect } from '@playwright/test';
import { setupApiMock, makeHistorySnap } from '../fixtures/youtrack-api-mock.js';

const CONFIRMED_SNAP = makeHistorySnap({
  sprintId: 'sprint-jun-2026',
  roleKey: 'frontend',
  status: 'CONFIRMED',
  items: [
    { id: 'TEST-1', summary: 'Task One',  estimate_frontend: 8,  inclusionStatus: 'INCLUDED' },
    { id: 'TEST-2', summary: 'Task Two',  estimate_frontend: 4,  inclusionStatus: 'INCLUDED' }
  ]
});

test.beforeEach(async ({ page }) => {
  await setupApiMock(page, { history: [CONFIRMED_SNAP] });
  await page.goto('/widgets/main/index.html');
  await page.waitForSelector('.widget-header', { timeout: 10000 });
});

test('Planning tab shows Roles and People segmented control', async ({ page }) => {
  await page.locator('#tabBtnPlanning').click();
  const rolesBtn = page.locator('.planning-level-btn[data-level="roles"]');
  const peopleBtn = page.locator('.planning-level-btn[data-level="people"]');
  await expect(rolesBtn).toBeVisible();
  await expect(peopleBtn).toBeVisible();
});

test('switching to People level shows role selector', async ({ page }) => {
  await page.locator('#tabBtnPlanning').click();
  await page.locator('.planning-level-btn[data-level="people"]').click();
  await expect(page.locator('#planningRoleSel')).toBeVisible({ timeout: 5000 });
});
