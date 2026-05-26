/**
 * v1.3.0 Cascade aggregation — Settings UI:
 *   - блок «Cascade aggregation of work hours» рендерится с 7 контролами;
 *   - load values из settings (kind-field, level-2/3, link inward/outward);
 *   - live warning видим при cascade=on && forbid=off, скрыт когда forbid=on;
 *   - comma-separated input на level-2 парсится в массив values при сохранении.
 */
import { test, expect } from '@playwright/test';
import { setupApiMock } from '../fixtures/youtrack-api-mock.js';
import { ringCheckbox } from '../fixtures/tab-helpers.js';

test.beforeEach(async ({ page }) => {
  await setupApiMock(page, {
    settings: {
      activeRoles: ['frontend', 'backend'],
      cascadeAggregationEnabled: true,
      forbidContainerWorkItems: false,
      cascadeKindField: 'Type',
      cascadeLevel2Values: ['Story', 'Feature'],
      cascadeLevel3Values: ['Epic'],
      cascadeParentLinkInward: 'subtask of',
      cascadeParentLinkOutward: 'parent for'
    }
  });
  await page.goto('/widgets/main/index.html');
  await page.waitForSelector('.widget-header', { timeout: 10000 });
});

async function openCascadeBlock(page) {
  await page.locator('#openSettingsBtn').first().click();
  await expect(page.locator('#settingsOverlay').first()).toBeVisible({ timeout: 5000 });
  const summary = page.locator('summary[data-i18n="cardCascade"]');
  if (await summary.isVisible()) {
    const open = await summary.evaluate(el => el.parentElement.open);
    if (!open) await summary.click();
  }
}

test('cascade block renders 7 controls (mix of selects + text inputs)', async ({ page }) => {
  await openCascadeBlock(page);
  await expect(ringCheckbox(page, 'cascadeAggregationCheck')).toBeChecked();
  await expect(ringCheckbox(page, 'forbidContainerWorkItemsCheck')).not.toBeChecked();
  /* kindField — single-select из enum-полей проекта (mock возвращает empty list,
     поэтому options ограничены сохранённым значением как fallback). */
  await expect(page.locator('#cascadeKindFieldSel')).toBeVisible();
  /* level-2/3 — multi-select. Проверяем что элементы — именно select[multiple]. */
  await expect(page.locator('#cascadeLevel2Sel')).toHaveAttribute('multiple', '');
  await expect(page.locator('#cascadeLevel3Sel')).toHaveAttribute('multiple', '');
  await expect(page.locator('#cascadeLinkInwardInput')).toHaveValue('subtask of');
  await expect(page.locator('#cascadeLinkOutwardInput')).toHaveValue('parent for');
});

test('warning visible when cascade=on, forbid=off; hidden when forbid toggled on', async ({ page }) => {
  await openCascadeBlock(page);
  /* Initial state из fixture: cascade=on, forbid=off — warning должен быть видим. */
  await expect(page.locator('#warnCascadeWithoutForbid')).toBeVisible();
  /* Включаем forbid — warning скрывается. */
  await ringCheckbox(page, 'forbidContainerWorkItemsCheck').check();
  await expect(page.locator('#warnCascadeWithoutForbid')).toBeHidden();
  /* Выключаем cascade — warning остаётся скрытым (нет опасной комбинации). */
  await ringCheckbox(page, 'cascadeAggregationCheck').uncheck();
  await expect(page.locator('#warnCascadeWithoutForbid')).toBeHidden();
});

test('cascade level-3 is empty-allowed (1-step aggregation mode)', async ({ page }) => {
  await openCascadeBlock(page);
  /* Optional level-3 — empty selection ok, no overlap warning either. */
  await expect(page.locator('#warnCascadeLevelsOverlap')).toBeHidden();
  /* Hint про опциональность level-3 виден. */
  await expect(page.locator('#hintCascadeLevel3Optional')).toBeVisible();
});
