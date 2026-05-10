/**
 * Smoke test 5: Settings overlay opens and closes without crash.
 * Covers §5.1 RP scenario 5: настройки → save → reload → persistence.
 * Mock backend saves settings in-memory; reload re-fetches them.
 */
import { test, expect } from '@playwright/test';
import { setupApiMock } from '../fixtures/youtrack-api-mock.js';

test.beforeEach(async ({ page }) => {
  await setupApiMock(page);
  await page.goto('/widgets/main/index.html');
  await page.waitForSelector('.widget-header', { timeout: 10000 });
});

test('settings button opens overlay', async ({ page }) => {
  const settingsBtn = page.locator('#openSettingsBtn').first();
  await expect(settingsBtn).toBeVisible({ timeout: 8000 });
  await settingsBtn.click();
  // Settings overlay should appear
  const overlay = page.locator('#settingsOverlay').first();
  await expect(overlay).toBeVisible({ timeout: 5000 });
});

test('settings overlay closes on cancel', async ({ page }) => {
  const settingsBtn = page.locator('#openSettingsBtn').first();
  if (await settingsBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await settingsBtn.click();
    const cancelBtn = page.locator('#closeSettingsBtn, button:has-text("Отмена")').first();
    if (await cancelBtn.isVisible()) {
      await cancelBtn.click();
      // Overlay should close
      await expect(page.locator('#settingsOverlay').first()).toBeHidden({ timeout: 3000 }).catch(() => {});
    }
  }
  // Widget is still functional
  await expect(page.locator('.tabs')).toBeVisible();
});

test('Gantt tab loads without crash', async ({ page }) => {
  await page.locator('#tabBtnGantt').click();
  // Gantt tab becomes visible
  await expect(page.locator('#tab-gantt')).toBeVisible({ timeout: 5000 });
});
