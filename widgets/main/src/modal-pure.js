'use strict';
// Pure helpers for the modal stack / cancel-button lookup logic.
// DOM-free — tested in isolation via tests/unit/modal-pure.test.js.
// Browser bridge: window.__SSP_MODAL_PURE — consumed by widgets/main/src/legacy-monolith.js.

// CSS selector for the "primary cancel/close" button inside an overlay. Used by the
// global Escape handler and by the backdrop click dismiss path.
// Order matters: more specific patterns first. Once one matches the loop stops.
const CANCEL_BUTTON_SELECTOR = [
  'button[id$="Cancel"]',
  'button[id$="CancelBtn"]',
  'button[id$="No"]',
  'button[id$="CloseBtn"]',
  'button[id$="Close"]',
  'button[id^="close"]',
  'button[id="cancelPickBtn"]',
  'button[id="closePickModal"]',
  'button[id="wcMultiTabReadonlyBtn"]'
].join(', ');

// Id-suffix patterns checked in order. The first id that ends with one of these
// (case-sensitive) is considered the cancel target.
const CANCEL_ID_SUFFIXES = ['Cancel', 'CancelBtn', 'No', 'CloseBtn', 'Close'];

// Id-prefix patterns checked in order. Useful for buttons like "closeXxxBtn".
const CANCEL_ID_PREFIXES = ['close'];

// Exact id whitelist for overlays whose cancel button has no recognisable suffix.
const CANCEL_ID_EXACT = ['cancelPickBtn', 'closePickModal', 'wcMultiTabReadonlyBtn'];

// Given a list of button ids inside an overlay, returns the first id that matches a
// known cancel pattern (suffix, prefix, or exact whitelist). Returns null if none match.
// Pure function — used by tests that don't have DOM access.
function findCancelButtonId(ids) {
  if (!Array.isArray(ids)) return null;
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (typeof id !== 'string' || !id) continue;
    if (CANCEL_ID_EXACT.indexOf(id) !== -1) return id;
    for (let s = 0; s < CANCEL_ID_SUFFIXES.length; s++) {
      if (id.endsWith(CANCEL_ID_SUFFIXES[s])) return id;
    }
    for (let p = 0; p < CANCEL_ID_PREFIXES.length; p++) {
      if (id.startsWith(CANCEL_ID_PREFIXES[p])) return id;
    }
  }
  return null;
}

// Returns the topmost (last-pushed) entry in the stack, or null if empty.
function topmostFromStack(stack) {
  if (!Array.isArray(stack) || stack.length === 0) return null;
  return stack[stack.length - 1];
}

// Pushes an item onto the stack if it is not already present. Returns the new length.
// Idempotent — opening the same overlay twice doesn't create duplicate stack entries.
function pushUnique(stack, item) {
  if (!Array.isArray(stack)) return 0;
  if (stack.indexOf(item) === -1) stack.push(item);
  return stack.length;
}

// Removes the first occurrence of `item` from the stack. Returns the new length.
function popItem(stack, item) {
  if (!Array.isArray(stack)) return 0;
  const idx = stack.indexOf(item);
  if (idx >= 0) stack.splice(idx, 1);
  return stack.length;
}

// Backdrop click rule: the event must have target === currentTarget (i.e. the click landed
// on the backdrop itself, not on a child element inside the modal content).
function isBackdropClick(target, currentTarget) {
  if (target == null || currentTarget == null) return false;
  return target === currentTarget;
}

// Parses the value of `data-dismiss-on-backdrop` as a boolean. Default: false (strict).
// Only the exact string 'true' opts in; everything else (missing, empty, "false", "1") is false.
function parseBackdropOptIn(dataValue) {
  return dataValue === 'true';
}

const api = {
  findCancelButtonId,
  topmostFromStack,
  pushUnique,
  popItem,
  isBackdropClick,
  parseBackdropOptIn,
  CANCEL_BUTTON_SELECTOR,
  CANCEL_ID_SUFFIXES,
  CANCEL_ID_PREFIXES,
  CANCEL_ID_EXACT
};

if (typeof window !== 'undefined') {
  try { window.__SSP_MODAL_PURE = api; } catch (_) { /* sandboxed write may throw */ }
}

module.exports = api;
