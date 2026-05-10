/**
 * v1.1.0 i18n smoke #2: plural-engine через Intl.PluralRules.
 * Проверяем, что formatPlural выбирает корректную форму для русских slavic-плюралей
 * (1 → one, 2..4 → few, 5..20 → many) — типичная категоризация CLDR для ru.
 */
import { test, expect } from '@playwright/test';
import { setupApiMock } from '../fixtures/youtrack-api-mock.js';

test.beforeEach(async ({ page }) => {
  await setupApiMock(page);
  await page.goto('/widgets/main/index.html');
  await page.waitForSelector('.widget-header', { timeout: 10000 });
});

test('Intl.PluralRules picks one/few/many for Russian counts', async ({ page }) => {
  const select = await page.evaluate(() => {
    const f = window.__SSP_I18N_PLURAL__ && window.__SSP_I18N_PLURAL__.formatPlural;
    if (!f) return null;
    const forms = { one: '{n} файл', few: '{n} файла', many: '{n} файлов', other: '{n} файлов' };
    return {
      one:  f(forms, 1, 'ru'),    // 1 → one
      few:  f(forms, 3, 'ru'),    // 3 → few
      many: f(forms, 7, 'ru'),    // 7 → many
      teen: f(forms, 11, 'ru')    // 11 → many (славянский edge-case)
    };
  });
  expect(select).not.toBeNull();
  expect(select.one).toBe('1 файл');
  expect(select.few).toBe('3 файла');
  expect(select.many).toBe('7 файлов');
  expect(select.teen).toBe('11 файлов');
});

test('Polish plural categories are distinct from Russian', async ({ page }) => {
  const result = await page.evaluate(() => {
    const f = window.__SSP_I18N_PLURAL__ && window.__SSP_I18N_PLURAL__.formatPlural;
    if (!f) return null;
    const forms = { one: '{n} plik', few: '{n} pliki', many: '{n} plików', other: '{n} pliku' };
    return {
      one:  f(forms, 1, 'pl'),
      few:  f(forms, 3, 'pl'),
      many: f(forms, 7, 'pl')
    };
  });
  expect(result).not.toBeNull();
  expect(result.one).toBe('1 plik');
  expect(result.few).toBe('3 pliki');
  expect(result.many).toBe('7 plików');
});
