/**
 * v1.2.0 DTA — Settings UI: чекбокс + таблица маппинга workItem type → role.
 * Покрывает RP §3.4-3.5: render mapping rows, +Add row, role select, delete row,
 * duplicate-type detection блокирует save.
 *
 * Note: после Ring Table миграции (v2.1.0 E2) DTA mapping рендерится через Ring Table
 * в #dtaMappingHost. Нативный <tbody id="dtaMappingBody"> больше не существует.
 * Строки идентифицируются по input.dta-type-input[data-dta-idx] внутри Ring Table cells.
 */
import { test, expect } from '@playwright/test';
import { setupApiMock } from '../fixtures/youtrack-api-mock.js';
import { dtaMappingInputs, fillDtaTypeInput, clickDtaDeleteBtn } from '../fixtures/tab-helpers.js';

test.beforeEach(async ({ page }) => {
  await setupApiMock(page, {
    settings: {
      activeRoles: ['frontend', 'backend', 'qa'],
      dtaEnabled: true,
      workItemTypeMapping: {
        'Development': 'frontend',
        'QA': 'qa'
      }
    }
  });
  await page.goto('/widgets/main/index.html');
  await page.waitForSelector('.widget-header', { timeout: 10000 });
});

async function openDtaBlock(page) {
  await page.locator('#openSettingsBtn').first().click();
  await expect(page.locator('#settingsOverlay').first()).toBeVisible({ timeout: 5000 });
  const dtaSummary = page.locator('summary[data-i18n="cardDta"]');
  if (await dtaSummary.isVisible()) {
    const expanded = await dtaSummary.evaluate(el => el.parentElement.open);
    if (!expanded) await dtaSummary.click();
  }
  // Wait for Ring Table to finish mounting
  await page.waitForSelector('#dtaMappingHost input.dta-type-input', { timeout: 5000 });
}

test('DTA section renders existing mapping rows from settings', async ({ page }) => {
  await openDtaBlock(page);
  const inputs = dtaMappingInputs(page);
  await expect(inputs).toHaveCount(2, { timeout: 3000 });
  await expect(inputs.nth(0)).toHaveValue('Development');
  await expect(inputs.nth(1)).toHaveValue('QA');
});

test('+ Add mapping appends a new empty row', async ({ page }) => {
  await openDtaBlock(page);
  const before = await dtaMappingInputs(page).count();
  await page.locator('#dtaAddRowBtn').click();
  await expect(dtaMappingInputs(page)).toHaveCount(before + 1, { timeout: 3000 });
});

test('duplicate type-name disables save button and shows hint', async ({ page }) => {
  await openDtaBlock(page);
  await fillDtaTypeInput(page, 1, 'Development'); // совпадает с inputs[0]
  await expect(page.locator('#dtaErrHint')).toBeVisible({ timeout: 2000 });
  await expect(page.locator('#saveSettingsBtn')).toBeDisabled();
});

test('delete row removes mapping and re-enables save', async ({ page }) => {
  await openDtaBlock(page);
  // Сначала создаём дубль чтобы save был disabled.
  await fillDtaTypeInput(page, 1, 'Development');
  await expect(page.locator('#saveSettingsBtn')).toBeDisabled();
  // Удаляем второй ряд → дубликата нет → save enabled.
  await clickDtaDeleteBtn(page, 1);
  await expect(dtaMappingInputs(page)).toHaveCount(1, { timeout: 3000 });
  await expect(page.locator('#saveSettingsBtn')).toBeEnabled();
});
