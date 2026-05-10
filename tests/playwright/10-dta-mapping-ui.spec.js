/**
 * v1.2.0 DTA — Settings UI: чекбокс + таблица маппинга workItem type → role.
 * Покрывает RP §3.4-3.5: render mapping rows, +Add row, role select, delete row,
 * duplicate-type detection блокирует save.
 */
import { test, expect } from '@playwright/test';
import { setupApiMock } from '../fixtures/youtrack-api-mock.js';

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

test('DTA section renders existing mapping rows from settings', async ({ page }) => {
  await page.locator('#openSettingsBtn').first().click();
  await expect(page.locator('#settingsOverlay').first()).toBeVisible({ timeout: 5000 });
  // Раскрываем DTA-блок если свёрнут (details может быть закрыт по умолчанию).
  const dtaSummary = page.locator('summary[data-i18n="cardDta"]');
  if (await dtaSummary.isVisible()) {
    const expanded = await dtaSummary.evaluate(el => el.parentElement.open);
    if (!expanded) await dtaSummary.click();
  }
  const rows = page.locator('#dtaMappingBody tr[data-dta-idx]');
  await expect(rows).toHaveCount(2, { timeout: 3000 });
  await expect(rows.nth(0).locator('.dta-type-input')).toHaveValue('Development');
  await expect(rows.nth(1).locator('.dta-type-input')).toHaveValue('QA');
});

test('+ Add mapping appends a new empty row', async ({ page }) => {
  await page.locator('#openSettingsBtn').first().click();
  await expect(page.locator('#settingsOverlay').first()).toBeVisible({ timeout: 5000 });
  const dtaSummary = page.locator('summary[data-i18n="cardDta"]');
  if (await dtaSummary.isVisible()) {
    const expanded = await dtaSummary.evaluate(el => el.parentElement.open);
    if (!expanded) await dtaSummary.click();
  }
  const before = await page.locator('#dtaMappingBody tr[data-dta-idx]').count();
  await page.locator('#dtaAddRowBtn').click();
  const after = await page.locator('#dtaMappingBody tr[data-dta-idx]').count();
  expect(after).toBe(before + 1);
});

test('duplicate type-name disables save button and shows hint', async ({ page }) => {
  await page.locator('#openSettingsBtn').first().click();
  await expect(page.locator('#settingsOverlay').first()).toBeVisible({ timeout: 5000 });
  const dtaSummary = page.locator('summary[data-i18n="cardDta"]');
  if (await dtaSummary.isVisible()) {
    const expanded = await dtaSummary.evaluate(el => el.parentElement.open);
    if (!expanded) await dtaSummary.click();
  }
  // Делаем второй ряд дубликатом первого.
  const rows = page.locator('#dtaMappingBody tr[data-dta-idx]');
  await rows.nth(1).locator('.dta-type-input').fill('Development'); // совпадает с rows[0]
  await expect(page.locator('#dtaErrHint')).toBeVisible({ timeout: 2000 });
  await expect(page.locator('#saveSettingsBtn')).toBeDisabled();
});

test('delete row removes mapping and re-enables save', async ({ page }) => {
  await page.locator('#openSettingsBtn').first().click();
  await expect(page.locator('#settingsOverlay').first()).toBeVisible({ timeout: 5000 });
  const dtaSummary = page.locator('summary[data-i18n="cardDta"]');
  if (await dtaSummary.isVisible()) {
    const expanded = await dtaSummary.evaluate(el => el.parentElement.open);
    if (!expanded) await dtaSummary.click();
  }
  // Сначала создаём дубль чтобы save был disabled.
  const rows = page.locator('#dtaMappingBody tr[data-dta-idx]');
  await rows.nth(1).locator('.dta-type-input').fill('Development');
  await expect(page.locator('#saveSettingsBtn')).toBeDisabled();
  // Удаляем второй ряд → дубликата нет → save enabled.
  await page.locator('#dtaMappingBody tr[data-dta-idx]').nth(1).locator('.dta-del-row').click();
  await expect(page.locator('#dtaMappingBody tr[data-dta-idx]')).toHaveCount(1);
  await expect(page.locator('#saveSettingsBtn')).toBeEnabled();
});
