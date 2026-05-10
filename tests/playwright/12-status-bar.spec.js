/**
 * v1.3.1 Status-bar активных функциональных модулей.
 *   - все 4 chip'а (inline/personal/dta/cascade) рендерятся в шапке;
 *   - on/off-классы соответствуют значениям _settings;
 *   - text-state локализован.
 */
import { test, expect } from '@playwright/test';
import { setupApiMock } from '../fixtures/youtrack-api-mock.js';

test.beforeEach(async ({ page }) => {
  await setupApiMock(page, {
    settings: {
      activeRoles: ['frontend'],
      dynEditEnabled: true,
      personalPlanningEnabled: false,
      dtaEnabled: true,
      cascadeAggregationEnabled: false
    }
  });
  await page.goto('/widgets/main/index.html');
  await page.waitForSelector('.widget-header', { timeout: 10000 });
});

test('status-bar renders all 4 module chips', async ({ page }) => {
  await expect(page.locator('#widgetStatusBar')).toBeVisible();
  for (const id of ['ssbInline', 'ssbPersonal', 'ssbDta', 'ssbCascade']) {
    await expect(page.locator('#' + id)).toBeVisible();
  }
});

test('status-bar reflects _settings flags via ssb-on / ssb-off classes', async ({ page }) => {
  /* fixture: dynEditEnabled=true, personalPlanningEnabled=false,
     dtaEnabled=true, cascadeAggregationEnabled=false */
  await expect(page.locator('#ssbInline')).toHaveClass(/ssb-on/);
  await expect(page.locator('#ssbInline')).not.toHaveClass(/ssb-off/);
  await expect(page.locator('#ssbPersonal')).toHaveClass(/ssb-off/);
  await expect(page.locator('#ssbDta')).toHaveClass(/ssb-on/);
  await expect(page.locator('#ssbCascade')).toHaveClass(/ssb-off/);
});

test('status-bar state labels are localized (en fixture default)', async ({ page }) => {
  /* По умолчанию в фикстуре язык интерфейса не задан → fallback на ru
     (см. _lang init). Проверяем что состояние текстом отрендерилось. */
  const inlineState = await page.locator('#ssbInline .ssb-chip__state').textContent();
  expect(inlineState).toMatch(/(on|off|вкл|выкл)/i);
});
