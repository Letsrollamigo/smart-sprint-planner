/**
 * Navigation helpers for live smoke tests against youtrack.example.com.
 *
 * YouTrack widget topology:
 *   Project settings page → widget rendered in <iframe srcdoc="..."> → index.html
 *
 * The outer page URL pattern:
 *   /projects/{project}/settings?tabId=extensions  (or similar)
 *
 * The widget iframe is identified via the appResources URL injected into srcdoc.
 */

const BASE_URL  = process.env.YOUTRACK_URL     || 'https://youtrack.example.com';
const PROJECT   = process.env.YOUTRACK_PROJECT  || 'DEMO';
const APP_ID    = process.env.SSP_APP_ID        || '145-463';

/**
 * Navigate to the YouTrack project page that hosts the SSP widget.
 * Returns the outer page — use getWidgetFrame() to enter the iframe.
 */
export async function navigateToWidget(page) {
  // YouTrack 2024.3 project settings with extensions
  await page.goto(`${BASE_URL}/projects/${PROJECT}/settings`);
  // Wait for project page to load
  await page.waitForLoadState('networkidle', { timeout: 20_000 });
}

/**
 * Returns a FrameLocator pointing to the SSP widget iframe.
 * Ring UI tier 3 renders into an about:srcdoc iframe — Playwright handles
 * this natively via frameLocator (unlike chrome-devtools CDP which blocks
 * cross-origin access to about:srcdoc contentDocument).
 */
export function getWidgetFrame(page) {
  // Widget iframe is identified by the appResources URL in its src/srcdoc
  return page.frameLocator(`iframe[src*="${APP_ID}"], iframe[srcdoc*="${APP_ID}"]`);
}

/**
 * Full setup: navigate to widget page + return frame locator.
 * Waits for the widget header to confirm the widget is loaded.
 */
export async function openWidget(page) {
  await navigateToWidget(page);

  // Find and click the extension link if needed
  const extLink = page.locator(`a[href*="${APP_ID}"], [data-app-id="${APP_ID}"]`).first();
  if (await extLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await extLink.click();
    await page.waitForLoadState('networkidle', { timeout: 15_000 });
  }

  const frame = getWidgetFrame(page);

  // Wait for widget header — confirms widget JS has initialized
  await frame.locator('#widgetHeader, .widget-header').waitFor({ timeout: 20_000 });

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

export { BASE_URL, PROJECT, APP_ID };
