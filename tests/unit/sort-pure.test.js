'use strict';
// Unit tests for widgets/main/src/pure/sort-pure.js
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
  multiKeySort,
  nextSortKey,
  isValidSortKey
} = require('../../widgets/main/src/pure/sort-pure.js');

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

// ── multiKeySort (full task sort orchestrator) ──────────────────────────────

describe('multiKeySort', () => {
  const ids = (arr) => arr.map((x) => x.issueId);

  it('returns the input unchanged for non-arrays', () => {
    assert.strictEqual(multiKeySort(null, 'priority'), null);
    assert.strictEqual(multiKeySort(undefined, 'priority'), undefined);
    const obj = { not: 'array' };
    assert.strictEqual(multiKeySort(obj, 'priority'), obj);
  });

  it('returns the input unchanged (same reference) when primary is off/empty', () => {
    const items = [{ issueId: 'P-2' }, { issueId: 'P-1' }];
    assert.strictEqual(multiKeySort(items, 'off'), items);
    assert.strictEqual(multiKeySort(items, ''), items);
    assert.strictEqual(multiKeySort(items), items);
  });

  it('does not mutate the input array (sorts a copy)', () => {
    const items = [
      { issueId: 'P-2', priority: 'Normal' },
      { issueId: 'P-1', priority: 'Critical' }
    ];
    const before = ids(items);
    const out = multiKeySort(items, 'priority');
    assert.notStrictEqual(out, items);
    assert.deepStrictEqual(ids(items), before);
  });

  it('primary "priority": high priority (lower rank) first, id as tie-breaker', () => {
    const items = [
      { issueId: 'P-3', priority: 'Normal' },
      { issueId: 'P-1', priority: 'Critical' },
      { issueId: 'P-2', priority: 'Critical' }
    ];
    assert.deepStrictEqual(ids(multiKeySort(items, 'priority')), ['P-1', 'P-2', 'P-3']);
  });

  it('primary "id": natural id order, xpriority then priority as tie-breakers', () => {
    const items = [
      { issueId: 'P-10', xpriority: 'XP2' },
      { issueId: 'P-2',  xpriority: 'XP2' }
    ];
    assert.deepStrictEqual(ids(multiKeySort(items, 'id')), ['P-2', 'P-10']);
  });

  it('default branch (unknown primary) orders by xpriority asc', () => {
    const items = [
      { issueId: 'P-1', xpriority: 'XP5' },
      { issueId: 'P-2', xpriority: 'XP1' }
    ];
    assert.deepStrictEqual(ids(multiKeySort(items, 'xpriority')), ['P-2', 'P-1']);
    assert.deepStrictEqual(ids(multiKeySort(items, 'no-such-key')), ['P-2', 'P-1']);
  });

  it('primary "system": plain lexicographic (case-insensitive); empty string sorts first', () => {
    // The IIFE original does a bare string compare — '' < any value, so blanks lead.
    const items = [
      { issueId: 'P-1', system: 'Zeta' },
      { issueId: 'P-2', system: 'alpha' },
      { issueId: 'P-3', system: '' }
    ];
    assert.deepStrictEqual(ids(multiKeySort(items, 'system')), ['P-3', 'P-2', 'P-1']);
  });

  it('primary "externalTicketId": plain lexicographic; empty string sorts first', () => {
    const items = [
      { issueId: 'P-1', externalTicketId: 'JIRA-9' },
      { issueId: 'P-2', externalTicketId: '' },
      { issueId: 'P-3', externalTicketId: 'JIRA-1' }
    ];
    assert.deepStrictEqual(ids(multiKeySort(items, 'externalTicketId')), ['P-2', 'P-3', 'P-1']);
  });

  it('primary "assignee": reads assignee from taMap, empty sorts to end', () => {
    const items = [{ issueId: 'P-1' }, { issueId: 'P-2' }, { issueId: 'P-3' }];
    const taMap = {
      'P-1': { assignee: 'Zoe' },
      'P-2': { assignee: 'Amy' }
      // P-3 has no taMap entry → treated as empty → last
    };
    assert.deepStrictEqual(ids(multiKeySort(items, 'assignee', taMap)), ['P-2', 'P-1', 'P-3']);
  });
});
