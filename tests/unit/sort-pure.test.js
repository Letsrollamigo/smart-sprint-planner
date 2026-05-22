'use strict';
// Unit tests for widgets/main/src/sort-pure.js
// Pure helpers — no DOM, no browser globals.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  SORT_KEYS_CYCLE,
  PRIORITY_RANK_MAP,
  xpRank,
  prRank,
  idCmp,
  compareAssignee,
  nextSortKey,
  isValidSortKey
} = require('../../widgets/main/src/sort-pure.js');

// ── compareAssignee ────────────────────────────────────────────────────────

describe('compareAssignee', () => {
  it('alphabetises non-empty values (case-insensitive)', () => {
    const a = { assignee: 'Anna',  xpriority: 'XP3', priority: 'Normal', issueId: 'X-1' };
    const b = { assignee: 'borya', xpriority: 'XP3', priority: 'Normal', issueId: 'X-2' };
    assert.ok(compareAssignee(a, b) < 0);
    assert.ok(compareAssignee(b, a) > 0);
  });

  it('treats different cases as equal letters (lowercase compare)', () => {
    const a = { assignee: 'ALICE' };
    const b = { assignee: 'alice' };
    // Both have empty xpriority/priority/id → tied beyond name
    assert.strictEqual(compareAssignee(a, b), 0);
  });

  it('pushes empty assignee to the end regardless of order', () => {
    const filled = { assignee: 'Anna' };
    const empty  = { assignee: '' };
    assert.ok(compareAssignee(filled, empty) < 0);
    assert.ok(compareAssignee(empty, filled) > 0);
  });

  it('treats null and undefined assignee as empty', () => {
    const a = { assignee: 'Anna' };
    const nullAs = { assignee: null };
    const undefAs = {};
    assert.ok(compareAssignee(a, nullAs) < 0);
    assert.ok(compareAssignee(nullAs, a) > 0);
    assert.ok(compareAssignee(a, undefAs) < 0);
    assert.ok(compareAssignee(undefAs, a) > 0);
  });

  it('two empty assignees stay equal in primary key, tie-break by xpriority', () => {
    const a = { assignee: '', xpriority: 'XP1' };
    const b = { assignee: '', xpriority: 'XP5' };
    assert.ok(compareAssignee(a, b) < 0); // XP1 ranks lower (= higher priority)
  });

  it('falls back to priority when xpriority is tied', () => {
    const a = { assignee: 'Same', xpriority: 'XP3', priority: 'Critical' };
    const b = { assignee: 'Same', xpriority: 'XP3', priority: 'Normal' };
    assert.ok(compareAssignee(a, b) < 0);
  });

  it('falls back to issueId when assignee + xpriority + priority all tie', () => {
    const a = { assignee: 'Same', issueId: 'PRJ-2' };
    const b = { assignee: 'Same', issueId: 'PRJ-10' };
    // numeric sort: PRJ-2 < PRJ-10
    assert.ok(compareAssignee(a, b) < 0);
  });

  it('handles full sort over an array', () => {
    const arr = [
      { assignee: 'Charlie' },
      { assignee: '' },
      { assignee: 'Alice' },
      { assignee: null },
      { assignee: 'Bob' }
    ];
    arr.sort(compareAssignee);
    const names = arr.map(x => x.assignee || '∅');
    assert.deepStrictEqual(names, ['Alice', 'Bob', 'Charlie', '∅', '∅']);
  });
});

// ── nextSortKey ────────────────────────────────────────────────────────────

describe('nextSortKey', () => {
  it('activates the clicked key when it differs from current', () => {
    assert.strictEqual(nextSortKey('off',       'assignee'), 'assignee');
    assert.strictEqual(nextSortKey('xpriority', 'assignee'), 'assignee');
    assert.strictEqual(nextSortKey('id',        'priority'), 'priority');
  });

  it('toggles off when clicking the currently-active key', () => {
    assert.strictEqual(nextSortKey('assignee',  'assignee'),  'off');
    assert.strictEqual(nextSortKey('priority',  'priority'),  'off');
    assert.strictEqual(nextSortKey('id',        'id'),        'off');
  });

  it('ignores unknown clicked keys (returns current)', () => {
    assert.strictEqual(nextSortKey('assignee', 'mystery'),   'assignee');
    assert.strictEqual(nextSortKey('off',      'gibberish'), 'off');
  });

  it('falls back to "off" when current is undefined and clicked is unknown', () => {
    assert.strictEqual(nextSortKey(undefined, 'mystery'), 'off');
  });
});

// ── isValidSortKey ─────────────────────────────────────────────────────────

describe('isValidSortKey', () => {
  it('accepts all keys in the cycle', () => {
    SORT_KEYS_CYCLE.forEach(k => assert.strictEqual(isValidSortKey(k), true, k));
  });

  it('rejects unknown keys', () => {
    assert.strictEqual(isValidSortKey('mystery'),       false);
    assert.strictEqual(isValidSortKey('xPriorityCAPS'), false);
    assert.strictEqual(isValidSortKey(''),              false);
    assert.strictEqual(isValidSortKey(undefined),       false);
    assert.strictEqual(isValidSortKey(null),            false);
  });
});

// ── SORT_KEYS_CYCLE / PRIORITY_RANK_MAP ────────────────────────────────────

describe('exported constants', () => {
  it('SORT_KEYS_CYCLE includes assignee (the v1.10.0 addition)', () => {
    assert.ok(SORT_KEYS_CYCLE.includes('assignee'));
  });

  it('SORT_KEYS_CYCLE is frozen', () => {
    assert.ok(Object.isFrozen(SORT_KEYS_CYCLE));
  });

  it('PRIORITY_RANK_MAP has expected order (Show-stopper < Critical < ... < Minor)', () => {
    assert.ok(PRIORITY_RANK_MAP['Show-stopper'] < PRIORITY_RANK_MAP['Critical']);
    assert.ok(PRIORITY_RANK_MAP['Critical']     < PRIORITY_RANK_MAP['Major']);
    assert.ok(PRIORITY_RANK_MAP['Major']        < PRIORITY_RANK_MAP['Normal']);
    assert.ok(PRIORITY_RANK_MAP['Normal']       < PRIORITY_RANK_MAP['Minor']);
  });

  it('PRIORITY_RANK_MAP is frozen', () => {
    assert.ok(Object.isFrozen(PRIORITY_RANK_MAP));
  });
});

// ── xpRank / prRank / idCmp (sanity for the helpers compareAssignee depends on) ──

describe('xpRank', () => {
  it('extracts numeric part from xpriority code', () => {
    assert.strictEqual(xpRank('XP1'),  1);
    assert.strictEqual(xpRank('XP42'), 42);
  });

  it('returns large fallback for missing/invalid xpriority', () => {
    assert.strictEqual(xpRank(''),         1e6);
    assert.strictEqual(xpRank(null),       1e6);
    assert.strictEqual(xpRank(undefined),  1e6);
    assert.strictEqual(xpRank('no-num'),   1e6);
  });
});

describe('prRank', () => {
  it('looks up known priorities', () => {
    assert.strictEqual(prRank('Show-stopper'), 0);
    assert.strictEqual(prRank('Normal'),       3);
  });

  it('returns large fallback for unknown priorities', () => {
    assert.strictEqual(prRank('NeverHeardOf'), 1e6);
    assert.strictEqual(prRank(''),             1e6);
    assert.strictEqual(prRank(null),           1e6);
  });
});

describe('idCmp', () => {
  it('compares natural-style (PRJ-2 < PRJ-10)', () => {
    assert.ok(idCmp('PRJ-2', 'PRJ-10') < 0);
    assert.ok(idCmp('PRJ-10', 'PRJ-2') > 0);
  });

  it('handles null/undefined as empty', () => {
    assert.ok(idCmp('PRJ-1', null) > 0);
    assert.ok(idCmp(null, 'PRJ-1') < 0);
    assert.strictEqual(idCmp(null, undefined), 0);
  });
});
