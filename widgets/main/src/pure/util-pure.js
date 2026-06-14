'use strict';
// Pure DOM-free utility helpers shared with widgets/main/src/core.js.
// Browser bridge: window.__SSP_UTIL_PURE. Unit-tested in tests/unit/util-pure.test.js.
//
// Faithful extraction — bodies mirror the IIFE originals 1:1 (incl. esc's
// `String(s||'')` falsy-coercion). The monolith keeps thin delegators so all
// call-sites and function-declaration hoisting stay unchanged.

// HTML-escape for safe interpolation into innerHTML. Falsy → '' (matches legacy).
function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Safe URL: only http(s):// pass through (escaped); everything else → '#'.
// Prevents javascript: / data: schemes in href attributes.
function safeUrl(url) {
  if (!url) return '#';
  const s = String(url).trim();
  if (/^https?:\/\//i.test(s)) return esc(s);
  return '#';
}

// RFC-4122-style v4 id seeded from the clock. Local-only (not crypto-grade).
function uid() {
  let d = Date.now();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (d + Math.random() * 16) % 16 | 0;
    d = Math.floor(d / 16);
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// Structured clone via JSON round-trip. null/undefined pass through; on
// serialisation failure (e.g. cyclic) returns the original reference.
function deepClone(obj) {
  if (obj === null || obj === undefined) return obj;
  try { return JSON.parse(JSON.stringify(obj)); } catch (e) { return obj; }
}

// Light hours formatter: round to 2dp, trim trailing zeros; NaN/null → '0'.
function formatHoursLight(n) {
  if (n === null || n === undefined || isNaN(n)) return '0';
  const rounded = Math.round(n * 100) / 100;
  return (rounded === Math.floor(rounded)) ? String(rounded) : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

const api = { esc, safeUrl, uid, deepClone, formatHoursLight };

if (typeof window !== 'undefined') {
  try { window.__SSP_UTIL_PURE = api; } catch (_) { /* sandboxed write may throw */ }
}

module.exports = api;
