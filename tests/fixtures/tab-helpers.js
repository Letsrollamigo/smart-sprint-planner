/**
 * Tab switching helpers for Playwright tests.
 *
 * After Ring UI tier 3 (v2.0.0 D6), visible tabs are React Ring components
 * mounted inside #sspTabsHost. The original #tabBtnX buttons remain in DOM
 * as hidden state-trackers (display:none, aria-hidden=true) — they cannot be
 * clicked via Playwright's normal .click(). Programmatic evaluate() click is
 * correct here: it's exactly what the Ring Tabs onSelect callback does internally.
 */

export async function clickTab(page, tabId) {
  await page.evaluate((id) => {
    const btn = document.querySelector(`.tab-btn.tab-state-tracker[data-tab="${id}"]`);
    if (btn) btn.click();
  }, tabId);
  await page.waitForSelector(`#tab-${tabId}.active`, { timeout: 5000 });
}

/** Assert the tabs container (Ring mount point) is visible. */
export async function expectTabsVisible(page, expect) {
  await expect(page.locator('#sspTabsHost')).toBeVisible();
}

/**
 * Returns a locator for the native <input type="checkbox"> inside a Ring Checkbox host.
 * Ring Checkbox mounts React inside a <span data-ssp-checkbox-host> — the native input
 * is in the rendered React subtree. Use this instead of the host span for .toBeChecked(),
 * .check(), .uncheck() assertions.
 */
export function ringCheckbox(page, hostId) {
  return page.locator(`#${hostId} input[type="checkbox"]`);
}

/**
 * Returns a locator for DTA mapping rows after Ring Table migration (v2.1.0 E2).
 * Ring Table replaced the native <tbody id="dtaMappingBody"> — rows are now
 * identified by the input elements rendered inside Ring Table cells.
 */
export function dtaMappingInputs(page) {
  return page.locator('#dtaMappingHost input.dta-type-input[data-dta-idx]');
}

export function dtaMappingDeleteBtns(page) {
  return page.locator('#dtaMappingHost button.dta-del-row[data-dta-idx]');
}

/**
 * Click DTA delete button by row index via evaluate().
 * Ring Table swallows click events at cell level (lesson #27), so Playwright's
 * normal .click() doesn't reach the Level-0 onclick handler. Direct JS click does.
 */
export async function clickDtaDeleteBtn(page, idx) {
  await page.evaluate((i) => {
    const btns = document.querySelectorAll('#dtaMappingHost button.dta-del-row[data-dta-idx]');
    if (btns[i]) btns[i].click();
  }, idx);
}

/**
 * Fill a DTA type input by index and explicitly dispatch an input event so the
 * delegated handler on #dtaMappingHost fires _validateDtaMapping().
 * Playwright's fill() dispatches input events, but the explicit evaluate()
 * guarantees the event bubbles through Ring Table's rendered DOM reliably.
 */
export async function fillDtaTypeInput(page, idx, value) {
  await page.evaluate(({ i, v }) => {
    const inputs = document.querySelectorAll('#dtaMappingHost input.dta-type-input[data-dta-idx]');
    const inp = inputs[i];
    if (!inp) return;
    inp.value = v;
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  }, { i: idx, v: value });
}
