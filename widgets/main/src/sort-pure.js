'use strict';
// Pure helpers for multi-key task sort logic. Unit-tested in isolation via tests/unit/sort-pure.test.js.
// Browser bridge: window.__SSP_SORT_PURE — consumed by widgets/main/src/legacy-monolith.js.
//
// Mirrors the implementation in legacy-monolith.js (multiKeySort) so the same
// comparators can be validated end-to-end without DOM. When the IIFE-side gets a
// new sort key, mirror it here too and add tests.

// Valid sort keys in cycle order (matches SORT_KEYS_CYCLE in legacy-monolith.js).
const SORT_KEYS_CYCLE = Object.freeze([
  'off', 'xpriority', 'priority', 'id', 'system', 'externalTicketId', 'assignee'
]);

const PRIORITY_RANK_MAP = Object.freeze({
  'Show-stopper': 0, 'Critical': 1, 'Major': 2, 'Normal': 3, 'Minor': 4
});

function xpRank(xp) {
  const m = String(xp == null ? '' : xp).match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 1e6;
}

function prRank(p) {
  const k = String(p == null ? '' : p);
  return Object.prototype.hasOwnProperty.call(PRIORITY_RANK_MAP, k) ? PRIORITY_RANK_MAP[k] : 1e6;
}

function idCmp(a, b) {
  return String(a == null ? '' : a).localeCompare(
    String(b == null ? '' : b),
    undefined,
    { numeric: true }
  );
}

// Comparator for the 'assignee' sort key. Pure — testable without DOM.
// Rule:
//   1. Empty/null/undefined assignee always sorts to the end (regardless of direction).
//   2. Non-empty values compare lexicographically (lowercase).
//   3. Tie-breaker: xpriority asc, then priority asc, then id asc (natural sort).
function compareAssignee(a, b) {
  const asA = String(a && a.assignee != null ? a.assignee : '').toLowerCase();
  const asB = String(b && b.assignee != null ? b.assignee : '').toLowerCase();
  if (asA === '' && asB !== '') return 1;
  if (asB === '' && asA !== '') return -1;
  if (asA < asB) return -1;
  if (asA > asB) return 1;
  return (xpRank(a && a.xpriority) - xpRank(b && b.xpriority))
      || (prRank(a && a.priority) - prRank(b && b.priority))
      || idCmp(a && a.issueId, b && b.issueId);
}

// Returns the next sort key when the user clicks a column header.
// Mirrors the IIFE-side rule: `setSortKey(cur === k ? 'off' : k)`.
// Clicking the active key turns sort off; clicking any other key activates it.
function nextSortKey(currentKey, clickedKey) {
  if (SORT_KEYS_CYCLE.indexOf(clickedKey) < 0) return currentKey || 'off';
  return currentKey === clickedKey ? 'off' : clickedKey;
}

// Validates a sort key against the allowed cycle.
function isValidSortKey(key) {
  return SORT_KEYS_CYCLE.indexOf(key) >= 0;
}

const api = {
  SORT_KEYS_CYCLE,
  PRIORITY_RANK_MAP,
  xpRank,
  prRank,
  idCmp,
  compareAssignee,
  nextSortKey,
  isValidSortKey
};

if (typeof window !== 'undefined') {
  try { window.__SSP_SORT_PURE = api; } catch (_) { /* sandboxed write may throw */ }
}

module.exports = api;
