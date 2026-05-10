/**
 * v1.1.0 i18n smoke #1: dropdown в шапке содержит 15 языков, переключение на EN
 * меняет UI-строки. Не проверяет качество переводов — только инфраструктурный
 * round-trip: select.change → loader.setLang → applyI18N → DOM.
 */
import { test, expect } from '@playwright/test';
import { setupApiMock } from '../fixtures/youtrack-api-mock.js';

test.beforeEach(async ({ page }) => {
  await setupApiMock(page);
  // Принудительно стартуем в RU — иначе headless playwright по navigator.language='en-US'
  // подхватит EN, и тесты переключения теряют исходную точку.
  await page.addInitScript(() => {
    try { localStorage.setItem('ssp_lang', 'ru'); } catch (_) {}
  });
  await page.goto('/widgets/main/index.html');
  await page.waitForSelector('.widget-header', { timeout: 10000 });
});

test('language dropdown contains 15 languages', async ({ page }) => {
  const sel = page.locator('#langSel');
  await expect(sel).toBeVisible({ timeout: 5000 });
  // Ждём пока init заполнит select 15 опциями (init происходит после applyI18N).
  await expect.poll(async () => await sel.locator('option').count(), { timeout: 5000 }).toBe(15);
  // Первая опция — English (sort EN → RU → rest).
  await expect(sel.locator('option').first()).toHaveAttribute('value', 'en');
  // Вторая — Russian.
  await expect(sel.locator('option').nth(1)).toHaveAttribute('value', 'ru');
});

test('switching to EN changes Planning tab label', async ({ page }) => {
  const sel = page.locator('#langSel');
  await expect.poll(async () => await sel.locator('option').count(), { timeout: 5000 }).toBe(15);
  // Старт по дефолту: ru → текст вкладки «Планирование».
  const planningTab = page.locator('[data-i18n="tabPlanning"]').first();
  await expect(planningTab).toContainText('Планирование');
  // Переключаем на en.
  await sel.selectOption('en');
  await expect(planningTab).toContainText('Planning');
});

test('switching to a non-inline language (cs) loads dictionary and updates DOM', async ({ page }) => {
  const sel = page.locator('#langSel');
  await expect.poll(async () => await sel.locator('option').count(), { timeout: 5000 }).toBe(15);
  await sel.selectOption('cs');
  // Async loadDictionary, ждём стабилизации.
  const planningTab = page.locator('[data-i18n="tabPlanning"]').first();
  await expect(planningTab).toContainText('Plánování', { timeout: 5000 });
});
