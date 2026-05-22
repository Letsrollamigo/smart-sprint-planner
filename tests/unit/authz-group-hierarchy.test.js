'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const path   = require('node:path');

const { userInGroups } = require(path.join(__dirname, '..', '..', 'backend-project.js'));

/* ── helpers ─────────────────────────────────────────────────────────────── */

function makeCtx(groups) {
  return { currentUser: { id: 'u1', login: 'tester', groups: groups } };
}

/* ── direct membership (existing behaviour, must not regress) ────────────── */

test('userInGroups: direct match by id', function () {
  var ctx = makeCtx([{ id: 'gA', name: 'GroupA' }]);
  assert.strictEqual(userInGroups(ctx, ['gA'], []), true);
});

test('userInGroups: direct match by name (case-insensitive)', function () {
  var ctx = makeCtx([{ id: 'gA', name: 'GroupA' }]);
  assert.strictEqual(userInGroups(ctx, [], ['groupa']), true);
});

test('userInGroups: no match — different id and name', function () {
  var ctx = makeCtx([{ id: 'gA', name: 'GroupA' }]);
  assert.strictEqual(userInGroups(ctx, ['gB'], ['groupb']), false);
});

test('userInGroups: empty groups list → false', function () {
  var ctx = makeCtx([]);
  assert.strictEqual(userInGroups(ctx, ['gA'], ['groupa']), false);
});

test('userInGroups: null currentUser → false', function () {
  assert.strictEqual(userInGroups({ currentUser: null }, ['gA'], []), false);
});

/* ── parent-chain traversal (v1.9.10 new behaviour) ─────────────────────── */

test('userInGroups: user in child X.A gets access when settings saved parent X (by id)', function () {
  // User is a member of X.A; X.A.parent = X; settings saved X id.
  var ctx = makeCtx([{
    id: 'xA', name: 'X.A',
    parent: { id: 'x', name: 'X', parent: null }
  }]);
  assert.strictEqual(userInGroups(ctx, ['x'], []), true);
});

test('userInGroups: user in child X.A gets access when settings saved parent X (by name)', function () {
  var ctx = makeCtx([{
    id: 'xA', name: 'X.A',
    parent: { id: 'x', name: 'X', parent: null }
  }]);
  assert.strictEqual(userInGroups(ctx, [], ['x']), true);
});

test('userInGroups: user in grandchild X.A.B gets access when settings saved grandparent X', function () {
  var ctx = makeCtx([{
    id: 'xAB', name: 'X.A.B',
    parent: {
      id: 'xA', name: 'X.A',
      parent: { id: 'x', name: 'X', parent: null }
    }
  }]);
  assert.strictEqual(userInGroups(ctx, ['x'], []), true);
});

test('userInGroups: parent present but id does not match → false', function () {
  var ctx = makeCtx([{
    id: 'yA', name: 'Y.A',
    parent: { id: 'y', name: 'Y', parent: null }
  }]);
  // Settings saved group X — neither Y.A nor its parent Y match
  assert.strictEqual(userInGroups(ctx, ['x'], ['x']), false);
});

test('userInGroups: no parent field (SDK does not populate) → graceful fallback, no error', function () {
  // parent is undefined — should not throw, direct check only
  var ctx = makeCtx([{ id: 'xA', name: 'X.A' }]);
  // Direct match fails, parent traversal skipped safely
  assert.strictEqual(userInGroups(ctx, ['x'], []), false);
  // Direct match still works
  assert.strictEqual(userInGroups(ctx, ['xA'], []), true);
});

test('userInGroups: multiple user groups — access if any direct or parent matches', function () {
  var ctx = makeCtx([
    { id: 'gOther', name: 'Other' },                        // no match
    { id: 'xA', name: 'X.A',
      parent: { id: 'x', name: 'X', parent: null } }        // parent matches
  ]);
  assert.strictEqual(userInGroups(ctx, ['x'], []), true);
});

test('userInGroups: circular parent reference terminates at depth 10', function () {
  // Pathological: circular reference — should not hang
  var circ = { id: 'c1', name: 'C1' };
  circ.parent = { id: 'c2', name: 'C2', parent: circ };
  var ctx = makeCtx([circ]);
  // Should return false without infinite loop (no match for 'x')
  assert.strictEqual(userInGroups(ctx, ['x'], []), false);
});
