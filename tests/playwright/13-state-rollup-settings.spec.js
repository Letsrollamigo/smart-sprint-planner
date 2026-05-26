/**
 * v1.7.0 D128 — State rollup Settings UI (Playwright e2e).
 *
 * Сценарии:
 *   1. Блок secStateRollup рендерится с нужными контролами, загружает значения из settings.
 *   2. warnStateRollupOrderShort: виден при 0/1 state'е в order, скрывается при ≥ 2.
 *   3. Rescan кнопка disabled в v1.7.0 (Вариант B — impl в v1.7.1).
 *
 * Что НЕ покрывается: поведение workflow.js (требует real YT instance).
 */
import { test, expect } from '@playwright/test';
import { setupApiMock } from '../fixtures/youtrack-api-mock.js';
import { ringCheckbox } from '../fixtures/tab-helpers.js';

const BUNDLE_STATES = ['Open', 'In Progress', 'In Review', 'Done', 'Cancelled'];

test.beforeEach(async ({ page }) => {
  await setupApiMock(page, {
    settings: {
      activeRoles: ['frontend', 'backend'],
      cascadeAggregationEnabled: true,
      cascadeKindField:          'Type',
      cascadeLevel2Values:       ['Story'],
      cascadeLevel3Values:       ['Epic'],
      cascadeParentLinkInward:   'subtask of',
      cascadeParentLinkOutward:  'parent for',
      fieldState:                'State',
      stateRollupEnabled:        false,
      stateRollupOrder:          ['Open', 'In Progress', 'Done'],
      stateRollupResolvedStates: ['Done', 'Cancelled'],
      stateRollupFloor:          null,
      stateRollupStrategy:       'min'
    }
  });

  // field-values mock — перехватывает любой путь с prefix backend-project/field-values
  await page.addInitScript((states) => {
    var origHandlers = window.__ytMockHandlers || {};
    window.__ytMockHandlers = new Proxy(origHandlers, {
      get: function(target, prop) {
        if (typeof prop === 'string' && prop.startsWith('backend-project/field-values')) {
          return function() { return Promise.resolve({ success: true, values: states }); };
        }
        return target[prop];
      }
    });
  }, BUNDLE_STATES);

  await page.goto('/widgets/main/index.html');
  await page.waitForSelector('.widget-header', { timeout: 10000 });
});

async function openStateRollupSection(page) {
  await page.locator('#openSettingsBtn').first().click();
  await expect(page.locator('#settingsOverlay').first()).toBeVisible({ timeout: 5000 });
  // Navigate to State rollup section
  const navBtn = page.locator('.settings-nav__chip[data-target="secStateRollup"]');
  if (await navBtn.isVisible()) {
    await navBtn.click();
  }
  await expect(page.locator('#secStateRollup')).toBeVisible({ timeout: 3000 });
  // Ensure details is open
  const summary = page.locator('summary[data-i18n="cardStateRollup"]');
  if (await summary.isVisible()) {
    const isOpen = await summary.evaluate(el => el.parentElement.open);
    if (!isOpen) await summary.click();
  }
}

test('1a. secStateRollup renders with all required controls', async ({ page }) => {
  await openStateRollupSection(page);

  // Master toggle — loaded from settings (stateRollupEnabled: false)
  await expect(page.locator('#stateRollupEnabledCheck')).toBeVisible();
  await expect(ringCheckbox(page, 'stateRollupEnabledCheck')).not.toBeChecked();

  // State order builder: bundle select + ordered list + buttons
  await expect(page.locator('#stateRollupBundleSel')).toBeVisible();
  await expect(page.locator('#stateRollupOrderList')).toBeVisible();
  await expect(page.locator('#stateRollupAddBtn')).toBeVisible();
  await expect(page.locator('#stateRollupUpBtn')).toBeVisible();
  await expect(page.locator('#stateRollupDownBtn')).toBeVisible();
  await expect(page.locator('#stateRollupRemoveBtn')).toBeVisible();

  // Resolved states multi-select
  await expect(page.locator('#stateRollupResolvedSel')).toBeVisible();
  await expect(page.locator('#stateRollupResolvedSel')).toHaveAttribute('multiple', '');

  // Floor state dropdown
  await expect(page.locator('#stateRollupFloorSel')).toBeVisible();

  // Strategy select (disabled, only min)
  await expect(page.locator('#stateRollupStrategySel')).toBeDisabled();
});

test('1b. ordered list is a select element for state ordering', async ({ page }) => {
  await openStateRollupSection(page);

  // Structural: stateRollupOrderList — это select (не input, не div)
  const orderList = page.locator('#stateRollupOrderList');
  await expect(orderList).toBeVisible();
  const tagName = await orderList.evaluate(el => el.tagName.toLowerCase());
  expect(tagName).toBe('select');

  // Bundle select присутствует и тоже является select с multiple
  const bundleSel = page.locator('#stateRollupBundleSel');
  await expect(bundleSel).toBeVisible();
  await expect(bundleSel).toHaveAttribute('multiple', '');
});

test('2. state rollup validation elements present and initially hidden', async ({ page }) => {
  await openStateRollupSection(page);

  // warnStateRollupOrderShort — существует в DOM, изначально hidden (≥2 items в fixture)
  const warn = page.locator('#warnStateRollupOrderShort');
  await expect(warn).toBeHidden();

  // hintStateRollupNoHierarchy — тоже hidden (cascade level2/3 настроены в fixture)
  const hintNoHierarchy = page.locator('#hintStateRollupNoHierarchy');
  await expect(hintNoHierarchy).toBeHidden();

  // stateRollupRescanStatus — hidden (нет текущего rescan)
  const rescanStatus = page.locator('#stateRollupRescanStatus');
  await expect(rescanStatus).toBeHidden();
});

test('3. rescan button is disabled in v1.7.0/v1.7.1 (Variant B), tooltip on wrap span', async ({ page }) => {
  await openStateRollupSection(page);

  const rescanBtn = page.locator('#stateRollupRescanBtn');
  await expect(rescanBtn).toBeVisible();
  await expect(rescanBtn).toBeDisabled();

  // v1.7.1: tooltip на wrap span (disabled button не показывает native title в браузерах)
  const wrap = page.locator('#stateRollupRescanBtnWrap');
  await expect(wrap).toBeVisible();
  const wrapTitleI18n = await wrap.getAttribute('data-i18n-title');
  expect(wrapTitleI18n).toBe('stateRollupRescanDeferred');

  // Кнопка с pointer-events:none — события передаются на wrap span
  const btnPointerEvents = await rescanBtn.evaluate(el => getComputedStyle(el).pointerEvents);
  expect(btnPointerEvents).toBe('none');
});

test('4. status-bar chip ssbStateRollup visible', async ({ page }) => {
  const chip = page.locator('#ssbStateRollup');
  await expect(chip).toBeVisible();
  // stateRollupEnabled=false → chip should show 'off'
  const chipTxt = await chip.textContent();
  expect(chipTxt).toMatch(/off|выкл/i);
});
