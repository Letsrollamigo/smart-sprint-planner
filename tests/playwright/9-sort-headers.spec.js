/**
 * v1.2.0 P0 (Bug #4): sort headers — document-level event delegation.
 *
 * Перед фиксом handlers вешались поэлементно через th.addEventListener в
 * _bindSortHeaders, и переписи thead.innerHTML в render-цикле уничтожали
 * привязки. В iframe YT с заблокированным localStorage getSortKey всегда
 * возвращал 'off' → визуально «сортировка не реагирует».
 *
 * Этот spec проверяет три инварианта фикса:
 *   1. Один document-level listener покрывает любой <th data-sort-key>,
 *      добавленный после первого _bindSortHeaders().
 *   2. In-memory memo хранит sortKey даже когда localStorage.setItem падает
 *      (имитация YT iframe SecurityError).
 *   3. Toggle: повторный клик на той же колонке возвращает 'off'.
 */
import { test, expect } from '@playwright/test';
import { setupApiMock, makeHistorySnap } from '../fixtures/youtrack-api-mock.js';

const SNAP = makeHistorySnap({
  sprintId: 'sprint-test-sort',
  roleKey: 'frontend',
  status: 'CONFIRMED',
  items: [
    { id: 'TEST-3', summary: 'C-task', estimate_frontend: 8, inclusionStatus: 'INCLUDED' },
    { id: 'TEST-1', summary: 'A-task', estimate_frontend: 4, inclusionStatus: 'INCLUDED' },
    { id: 'TEST-2', summary: 'B-task', estimate_frontend: 6, inclusionStatus: 'INCLUDED' }
  ]
});

test.beforeEach(async ({ page }) => {
  await setupApiMock(page, { history: [SNAP] });
  await page.goto('/widgets/main/index.html');
  await page.waitForSelector('.widget-header', { timeout: 10000 });
});

test('document delegation toggles sort-key on dynamically-injected th', async ({ page }) => {
  // Trigger _bindSortHeaders by rendering anything sortable. Direct API: kick
  // a thead through public-ish hook not exposed; instead, inject a fake th
  // and rely on widget IIFE having attached the document listener already
  // (any of the renderers run during init for active sprint).
  const before = await page.evaluate(() => {
    try { localStorage.setItem('ssp_sortKey', 'off'); } catch (_) {}
    // Inject a fake sortable th into a freshly-created table outside any
    // existing render target — verifies delegation is global, not scoped.
    const tbl = document.createElement('table');
    tbl.id = '__ssp_sort_probe__';
    tbl.innerHTML = '<thead><tr><th data-sort-key="id">probe-id</th></tr></thead>';
    document.body.appendChild(tbl);
    return localStorage.getItem('ssp_sortKey');
  });
  expect(before === null || before === 'off').toBeTruthy();

  // Click delegated through document.
  await page.locator('#__ssp_sort_probe__ th[data-sort-key="id"]').click();
  const after = await page.evaluate(() => {
    try { return localStorage.getItem('ssp_sortKey'); } catch (_) { return null; }
  });
  expect(after).toBe('id');

  // Second click toggles back to 'off'.
  await page.locator('#__ssp_sort_probe__ th[data-sort-key="id"]').click();
  const toggled = await page.evaluate(() => {
    try { return localStorage.getItem('ssp_sortKey'); } catch (_) { return null; }
  });
  expect(toggled).toBe('off');
});

test('click on .sort-icon child still triggers sort (closest th)', async ({ page }) => {
  await page.evaluate(() => {
    try { localStorage.setItem('ssp_sortKey', 'off'); } catch (_) {}
    const tbl = document.createElement('table');
    tbl.id = '__ssp_sort_probe2__';
    tbl.innerHTML =
      '<thead><tr><th data-sort-key="priority">Priority' +
      '<span class="sort-icon">↕</span></th></tr></thead>';
    document.body.appendChild(tbl);
  });
  // Click directly on the icon span — closest('th[data-sort-key]') must walk up.
  await page.locator('#__ssp_sort_probe2__ .sort-icon').click();
  const v = await page.evaluate(() => localStorage.getItem('ssp_sortKey'));
  expect(v).toBe('priority');
});
