/**
 * Navigation helpers for live smoke tests against local Docker YouTrack (localhost:8080).
 * Legacy: youtrack.example.com (remote, deprecated 2026-05-27 — slow, replaced by local Docker).
 *
 * YouTrack widget URL pattern (discovered 2026-05-26):
 *   /projects/{projectId}?tab={appName}:{appTitle}
 *
 * Examples:
 *   community: /projects/DEMO?tab=smart-sprint-planner:Smart Sprint Planner
 *   corp:      /projects/DEMO?tab=scbt-sprint-planner:Smart Sprint Planner
 *
 * The widget renders in an about:srcdoc iframe (no src attribute).
 * Playwright handles srcdoc frames natively via frameLocator('iframe').
 */

const BASE_URL  = process.env.YOUTRACK_URL    || 'http://localhost:8080';
const PROJECT   = process.env.YOUTRACK_PROJECT || 'DEMO';
const APP_NAME  = process.env.SSP_APP_NAME    || 'smart-sprint-planner';
const APP_TITLE = process.env.SSP_APP_TITLE   || 'Smart Sprint Planner';

/**
 * Navigate directly to the widget tab page.
 */
export async function navigateToWidget(page) {
  const tab = encodeURIComponent(`${APP_NAME}:${APP_TITLE}`);
  await page.goto(`${BASE_URL}/projects/${PROJECT}?tab=${tab}`);
  await page.waitForLoadState('networkidle', { timeout: 20_000 });
}

/**
 * Returns a FrameLocator pointing to the widget iframe.
 * YouTrack renders the widget in an about:srcdoc iframe — no src attribute.
 * We use the first iframe on the page (widget tab has exactly one).
 */
export function getWidgetFrame(page) {
  return page.frameLocator('iframe').first();
}

/**
 * Full setup: navigate to widget page + return frame locator.
 * Waits for the widget header to confirm the widget JS has initialized.
 */
export async function openWidget(page) {
  await navigateToWidget(page);
  const frame = getWidgetFrame(page);
  await frame.locator('#widgetHeader, .widget-header').waitFor({ timeout: 25_000 });
  return frame;
}

/**
 * Click a tab inside the widget iframe.
 * Uses evaluate() on the hidden state-tracker buttons — same mechanism
 * Ring Tabs onSelect callback uses internally (lesson: tab-helpers.js §1).
 */
export async function clickWidgetTab(frame, tabId) {
  await frame.locator('body').evaluate((_, id) => {
    const btn = document.querySelector(`.tab-btn.tab-state-tracker[data-tab="${id}"]`);
    if (btn) btn.click();
  }, tabId);
  await frame.locator(`#tab-${tabId}.active, [data-tab-panel="${tabId}"]`).waitFor({ timeout: 8_000 }).catch(() => {});
}

export { BASE_URL, PROJECT, APP_NAME, APP_TITLE };
