/**
 * Smoke test 5: Settings entry-point + demolition invariants + Gantt loads.
 * v2.2.0 Phase 6 #32 — vanilla #settingsOverlay демонтирован; настройки теперь рендерятся
 * React-компонентом settings-form.jsx через openSettingsModal() → Ring Dialog (runtime mount).
 *
 * Сам React-модал настроек верифицируется live-smoke'ом (как в Phase 5) — он монтируется
 * в рантайме через __SSP_RING_MODAL и не воспроизводится надёжно в static-HTML mock-харнессе.
 * Здесь проверяем то, что детерминированно: кнопка-вход существует, старый overlay физически
 * удалён, клик не роняет виджет, Гант грузится.
 */
import { test, expect } from '@playwright/test';
import { setupApiMock } from '../fixtures/youtrack-api-mock.js';
import { clickTab } from '../fixtures/tab-helpers.js';

test.beforeEach(async ({ page }) => {
  await setupApiMock(page);
  await page.goto('/widgets/main/index.html');
  await page.waitForSelector('.widget-header', { timeout: 10000 });
});

test('legacy #settingsOverlay demolished (Phase 6)', async ({ page }) => {
  // Старый vanilla-оверлей формы настроек удалён из DOM целиком.
  await expect(page.locator('#settingsOverlay')).toHaveCount(0);
  await expect(page.locator('.settings-overlay')).toHaveCount(0);
});

test('settings button present and click does not crash widget', async ({ page }) => {
  const settingsBtn = page.locator('#openSettingsBtn').first();
  await expect(settingsBtn).toBeVisible({ timeout: 8000 });
  await settingsBtn.click();
  // Никаких runtime-исключений: виджет остаётся функциональным после клика.
  await expect(page.locator('#sspTabsHost')).toBeVisible();
});

test('Gantt tab loads without crash', async ({ page }) => {
  await clickTab(page, 'gantt');
  await expect(page.locator('#tab-gantt')).toBeVisible({ timeout: 5000 });
});
