/**
 * Smoke 01 — Widget loads and version matches manifest.
 *
 * Checks:
 * - YouTrack project page is accessible
 * - Widget iframe renders
 * - Widget header visible (JS initialized without crash)
 * - Version marker matches expected (no stale cache)
 * - No console errors on load
 */

import { test, expect } from '@playwright/test';
import { openWidget, clickWidgetTab } from './helpers/widget-nav.js';

const EXPECTED_VERSION = '2.1.9';

test.describe('Widget loads — live smoke', () => {

  test('widget renders and version matches', async ({ page }) => {
    const frame = await openWidget(page);

    // Widget header visible
    await expect(frame.locator('#widgetHeader, .widget-header').first())
      .toBeVisible({ timeout: 15_000 });

    // Version marker — injected as data-attr or text by legacy-monolith.js
    const versionEl = frame.locator('[data-app-version], #appVersionMarker, .app-version');
    if (await versionEl.count() > 0) {
      const v = await versionEl.first().getAttribute('data-app-version')
        ?? await versionEl.first().innerText();
      expect(v.trim()).toContain(EXPECTED_VERSION);
    }

    // Tabs host visible
    await expect(frame.locator('#sspTabsHost')).toBeVisible();
  });

  test('no JS errors on initial load', async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', err => errors.push(err.message));

    await openWidget(page);
    await page.waitForTimeout(2000); // let async init settle

    const critical = errors.filter(e =>
      !e.includes('favicon') &&
      !e.includes('net::ERR_') &&
      !e.includes('ResizeObserver')
    );
    expect(critical, `Console errors: ${critical.join('\n')}`).toHaveLength(0);
  });

  test('Planning tab renders table', async ({ page }) => {
    const frame = await openWidget(page);
    await clickWidgetTab(frame, 'planning');

    // Planning tab content — role cards or task table
    const planningContent = frame.locator(
      '#tab-planning, [data-ssp-table-host], .role-card, .planning-section'
    ).first();
    await expect(planningContent).toBeVisible({ timeout: 10_000 });
  });

  test('History tab renders', async ({ page }) => {
    const frame = await openWidget(page);
    await clickWidgetTab(frame, 'history');

    const historyContent = frame.locator('#tab-history, .history-section, #historyBlock').first();
    await expect(historyContent).toBeVisible({ timeout: 10_000 });
  });

  test('Gantt tab renders', async ({ page }) => {
    const frame = await openWidget(page);
    await clickWidgetTab(frame, 'gantt');

    const ganttContent = frame.locator('#tab-gantt, .gantt-section, #ganttBlock').first();
    await expect(ganttContent).toBeVisible({ timeout: 10_000 });
  });

});
