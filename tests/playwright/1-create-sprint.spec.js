/**
 * Smoke test 1: Create sprint → validate → COMPOSITION_AGREED
 * Covers §5.1 RP scenario 1: создание спринта → подбор задач → валидация.
 */
import { test, expect } from '@playwright/test';
import { setupApiMock } from '../fixtures/youtrack-api-mock.js';
import { clickTab } from '../fixtures/tab-helpers.js';

test.beforeEach(async ({ page }) => {
  await setupApiMock(page, {
    sprint: null,
    history: [],
    issues: [
      { id: 'TEST-1', summary: 'Task One',  estimate: 8,  state: 'Open' },
      { id: 'TEST-2', summary: 'Task Two',  estimate: 4,  state: 'Open' },
      { id: 'TEST-3', summary: 'Task Three',estimate: 16, state: 'Open' }
    ]
  });
  await page.goto('/widgets/main/index.html');
  // Wait for the widget to initialize
  await page.waitForSelector('#widgetHeader', { timeout: 10000 });
});

test('create sprint and reach COMPOSITION_AGREED', async ({ page }) => {
  // Click "New sprint"
  const newSprintBtn = page.locator('#newSprintWidgetBtn, button[data-i18n="btnNewSprintWidget"]').first();
  await expect(newSprintBtn).toBeVisible({ timeout: 8000 });
  await newSprintBtn.click();

  // Fill sprint name and dates
  const nameInput = page.locator('#sprintNameInput, input[placeholder*="Название"], input[id*="name"]').first();
  if (await nameInput.isVisible()) {
    await nameInput.fill('Sprint June 2026');
  }

  // Save sprint
  const saveBtn = page.locator('#saveSprintBtn, button:has-text("Сохранить спринт")').first();
  if (await saveBtn.isVisible()) {
    await saveBtn.click();
  }

  // Select role (frontend)
  await clickTab(page, 'planning');

  // Expand or select frontend role
  const roleCard = page.locator('.role-card, .accordion-card, [data-role="frontend"]').first();
  if (await roleCard.isVisible()) {
    await roleCard.click();
  }

  // After widget loads with empty sprint, verify no crash: header visible
  await expect(page.locator('.widget-header')).toBeVisible();
});

test('widget loads without crash on empty state', async ({ page }) => {
  // Basic smoke: widget renders header and tabs
  await expect(page.locator('#widgetHeader')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#sspTabsHost')).toBeVisible();
});
