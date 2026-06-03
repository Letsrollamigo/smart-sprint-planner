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
// taMap: optional { [issueId]: { assignee: string } } — used when assignee is stored
//   in a separate task-assignments map rather than directly on the item (e.g. people tab).
function compareAssignee(a, b, taMap) {
  const rawA = (taMap && taMap[a && a.issueId] && taMap[a.issueId].assignee) != null
    ? taMap[a.issueId].assignee : (a && a.assignee != null ? a.assignee : '');
  const rawB = (taMap && taMap[b && b.issueId] && taMap[b.issueId].assignee) != null
    ? taMap[b.issueId].assignee : (b && b.assignee != null ? b.assignee : '');
  const asA = String(rawA).toLowerCase();
  const asB = String(rawB).toLowerCase();
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

// Full multi-key task sort. `primary` MUST be resolved by the caller — the IIFE
// delegator passes getSortKey() when it is omitted, so this pure function never
// reads sort state. Faithful port of multiKeySort in legacy-monolith.js: the
// secondary keys always order by descending priority, and an unrecognised
// primary falls through to the 'xpriority' default branch.
function multiKeySort(items, primary, taMap) {
  if (!Array.isArray(items)) return items;
  if (!primary || primary === 'off') return items;
  const arr = items.slice();
  arr.sort(function (a, b) {
    if (primary === 'id') {
      const c0 = idCmp(a.issueId, b.issueId);
      if (c0 !== 0) return c0;
      return (xpRank(a.xpriority) - xpRank(b.xpriority)) || (prRank(a.priority) - prRank(b.priority));
    }
    if (primary === 'priority') {
      const c1 = prRank(a.priority) - prRank(b.priority);
      if (c1 !== 0) return c1;
      return (xpRank(a.xpriority) - xpRank(b.xpriority)) || idCmp(a.issueId, b.issueId);
    }
    if (primary === 'system') {
      const sysA = String(a.system || '').toLowerCase();
      const sysB = String(b.system || '').toLowerCase();
      const cs = sysA < sysB ? -1 : (sysA > sysB ? 1 : 0);
      if (cs !== 0) return cs;
      return (xpRank(a.xpriority) - xpRank(b.xpriority)) || idCmp(a.issueId, b.issueId);
    }
    if (primary === 'externalTicketId') {
      const extA = String(a.externalTicketId || '').toLowerCase();
      const extB = String(b.externalTicketId || '').toLowerCase();
      const ce = extA < extB ? -1 : (extA > extB ? 1 : 0);
      if (ce !== 0) return ce;
      return idCmp(a.issueId, b.issueId);
    }
    if (primary === 'assignee') {
      const asA = String((taMap && taMap[a.issueId] && taMap[a.issueId].assignee) || '').toLowerCase();
      const asB = String((taMap && taMap[b.issueId] && taMap[b.issueId].assignee) || '').toLowerCase();
      if (asA === '' && asB !== '') return 1;
      if (asB === '' && asA !== '') return -1;
      const ca = asA < asB ? -1 : (asA > asB ? 1 : 0);
      if (ca !== 0) return ca;
      return (xpRank(a.xpriority) - xpRank(b.xpriority))
          || (prRank(a.priority) - prRank(b.priority))
          || idCmp(a.issueId, b.issueId);
    }
    // 'xpriority' (default)
    const c2 = xpRank(a.xpriority) - xpRank(b.xpriority);
    if (c2 !== 0) return c2;
    return (prRank(a.priority) - prRank(b.priority)) || idCmp(a.issueId, b.issueId);
  });
  return arr;
}

const api = {
  SORT_KEYS_CYCLE,
  PRIORITY_RANK_MAP,
  xpRank,
  prRank,
  idCmp,
  compareAssignee,
  multiKeySort,
  nextSortKey,
  isValidSortKey
};

if (typeof window !== 'undefined') {
  try { window.__SSP_SORT_PURE = api; } catch (_) { /* sandboxed write may throw */ }
}

module.exports = api;
