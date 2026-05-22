'use strict';
// Pure helpers for toast queue logic. Testable in isolation via tests/unit/toast-pure.test.js.
// Bridge to browser IIFE: window.__SSP_TOAST_PURE — read in widgets/main/src/legacy-monolith.js.

// Default durations (ms) per toast type. duration=0 means persistent (no auto-dismiss).
const TOAST_DEFAULTS = Object.freeze({
  info:    4000,
  warn:    6000,
  success: 4000,
  error:   0
});

const TOAST_LIMIT = 3;

// Returns dismissAfter (ms) for a given toast type.
// If customDuration is a number, it overrides the default.
// 0 means persistent — no auto-dismiss.
function computeToastDuration(type, customDuration) {
  if (typeof customDuration === 'number') return customDuration;
  return TOAST_DEFAULTS[type] != null ? TOAST_DEFAULTS[type] : TOAST_DEFAULTS.info;
}

// FIFO eviction strategy: when the queue is at or over `limit`, return the index of the
// oldest non-error toast to drop. Returns -1 if no eviction needed or if all entries are
// persistent error toasts (those are never auto-evicted — user must dismiss explicitly).
function selectToastToEvict(queue, limit) {
  if (!Array.isArray(queue) || queue.length < limit) return -1;
  for (let i = 0; i < queue.length; i++) {
    if (queue[i] && queue[i].type !== 'error') return i;
  }
  return -1;
}

// Normalises an arbitrary message to a single-line-friendly string.
// Used to collapse multi-newline payloads (e.g. server stack traces) for compact display.
function normaliseToastText(msg) {
  return String(msg == null ? '' : msg).replace(/\n+/g, ' · ');
}

const api = {
  computeToastDuration,
  selectToastToEvict,
  normaliseToastText,
  TOAST_DEFAULTS,
  TOAST_LIMIT
};

// Browser bridge — same pattern as icons.generated.js and i18n-bridge.js.
if (typeof window !== 'undefined') {
  try { window.__SSP_TOAST_PURE = api; } catch (_) { /* sandboxed write may throw */ }
}

module.exports = api;
