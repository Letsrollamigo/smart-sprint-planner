'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const path   = require('node:path');
const Module = require('node:module');

/* ── YT scripting-api stubs (паттерн из cascade.test.js) ─── */
const messageLog = [];
const ytStubs = {
  '@jetbrains/youtrack-scripting-api/entities': {
    Issue: { onChange: function(spec) { return { __isOnChange: true, spec: spec }; } }
  },
  '@jetbrains/youtrack-scripting-api/workflow': {
    message: function(s) { messageLog.push(s); },
    check: function(cond, msg) { if (!cond) throw new Error(msg || 'workflow.check failed'); }
  }
};
const origResolve = Module._resolveFilename;
Module._resolveFilename = function(req, parent, ...rest) {
  if (Object.prototype.hasOwnProperty.call(ytStubs, req)) return req;
  return origResolve.call(this, req, parent, ...rest);
};
const origLoad = Module._load;
Module._load = function(req, parent, ...rest) {
  if (Object.prototype.hasOwnProperty.call(ytStubs, req)) return ytStubs[req];
  return origLoad.call(this, req, parent, ...rest);
};

const wf = require(path.join(__dirname, '..', '..', 'workflow-state-rollup.js'));
const { computeRollupTarget, _stateOrderIndex, _readIssueStateName, WF_I18N, tWf } = wf;

function resetLogs() { messageLog.length = 0; }

const ORDER = ['Open', 'In Progress', 'In Review', 'Done', 'Cancelled'];

function makeParent(childStates, stateFieldName) {
  var fname = stateFieldName || 'State';
  var children = childStates.map(function(s) {
    var f = {};
    f[fname] = { name: s };
    return { fields: f };
  });
  return {
    id: 'TEST-1',
    links: {
      'parent for': {
        forEach: function(cb) { children.forEach(cb); }
      }
    }
  };
}

function makeSettings(overrides) {
  return Object.assign({
    stateRollupEnabled:      true,
    stateRollupOrder:        ORDER.slice(),
    stateRollupResolvedStates: ['Done', 'Cancelled'],
    stateRollupFloor:        null,
    stateRollupStrategy:     'min'
  }, overrides || {});
}

// 1. min-only-strategy: дочерние в разных state'ах → берётся наименее продвинутый
test('1. min-strategy: selects least-progressed child state', function() {
  var parent = makeParent(['In Review', 'In Progress', 'Done']);
  var s = makeSettings();
  var r = computeRollupTarget(parent, s, 'parent for', 'State', 'en');
  assert.strictEqual(r.target, 'In Progress');
  assert.strictEqual(r.reason, 'ok');
});

// 2. idempotent check: target совпадает с parent state → computeRollupTarget возвращает его,
//    caller (_applyRollupToParent) сравнивает curStateName === res.target и пропускает write.
test('2. idempotent: returns correct target even when parent is already at it', function() {
  var parent = makeParent(['Open', 'Open']);
  var s = makeSettings();
  var r = computeRollupTarget(parent, s, 'parent for', 'State', 'en');
  assert.strictEqual(r.target, 'Open');
  assert.strictEqual(r.reason, 'ok');
});

// 3. floor-clamp: children min (Open idx=0) ниже floor (In Progress idx=1) → target = floor
test('3. floor-clamp: target clamped to floor when min is below', function() {
  var parent = makeParent(['Open', 'In Progress']);
  var s = makeSettings({ stateRollupFloor: 'In Progress' });
  var r = computeRollupTarget(parent, s, 'parent for', 'State', 'en');
  assert.strictEqual(r.target, 'In Progress');
  assert.strictEqual(r.reason, 'ok-floor');
});

// 4. floor-not-hit: children min (In Review idx=2) ≥ floor (In Progress idx=1) → target = min
test('4. floor-not-hit: target = children min when above floor', function() {
  var parent = makeParent(['In Review', 'Done']);
  var s = makeSettings({ stateRollupFloor: 'In Progress' });
  var r = computeRollupTarget(parent, s, 'parent for', 'State', 'en');
  assert.strictEqual(r.target, 'In Review');
  assert.strictEqual(r.reason, 'ok');
});

// 5. unknown-child-state: один child с unknown state игнорируется, остальные учитываются
test('5. unknown-child-state: unknown states skipped, known ones used', function() {
  var parent = makeParent(['UnknownState', 'In Review']);
  var s = makeSettings();
  var r = computeRollupTarget(parent, s, 'parent for', 'State', 'en');
  assert.strictEqual(r.target, 'In Review');
  assert.strictEqual(r.reason, 'ok');
});

// 6. all-unknown-states: все children с unknown states → no target
test('6. all-unknown-states: returns null target with reason unknown-states', function() {
  var parent = makeParent(['Ghost', 'Phantom']);
  var s = makeSettings();
  var r = computeRollupTarget(parent, s, 'parent for', 'State', 'en');
  assert.strictEqual(r.target, null);
  assert.strictEqual(r.reason, 'unknown-states');
});

// 7. empty-children: parent без child'ов → no write
test('7. empty-children: returns null target with reason no-children', function() {
  var parent = makeParent([]);
  var s = makeSettings();
  var r = computeRollupTarget(parent, s, 'parent for', 'State', 'en');
  assert.strictEqual(r.target, null);
  assert.strictEqual(r.reason, 'no-children');
});

// 8. order-too-short (0 elements): reason no-order
test('8. order-too-short (empty): returns null with reason no-order', function() {
  var parent = makeParent(['Open']);
  var s = makeSettings({ stateRollupOrder: [] });
  var r = computeRollupTarget(parent, s, 'parent for', 'State', 'en');
  assert.strictEqual(r.target, null);
  assert.strictEqual(r.reason, 'no-order');
});

// 9. order-too-short (1 element): reason no-order
test('9. order-too-short (1 item): returns null with reason no-order', function() {
  var parent = makeParent(['Open']);
  var s = makeSettings({ stateRollupOrder: ['Open'] });
  var r = computeRollupTarget(parent, s, 'parent for', 'State', 'en');
  assert.strictEqual(r.target, null);
  assert.strictEqual(r.reason, 'no-order');
});

// 10. single-child-min: только один child, выбирается его state
test('10. single-child: returns that child state', function() {
  var parent = makeParent(['In Review']);
  var s = makeSettings();
  var r = computeRollupTarget(parent, s, 'parent for', 'State', 'en');
  assert.strictEqual(r.target, 'In Review');
  assert.strictEqual(r.reason, 'ok');
});

// 11. custom stateFieldName: читаем State из нестандартного поля
test('11. custom stateFieldName: reads from specified field', function() {
  var fname = 'CustomState';
  var children = [{ fields: { CustomState: 'In Progress' } }, { fields: { CustomState: 'Done' } }];
  var parent = {
    id: 'TEST-2',
    links: { 'child of': { forEach: function(cb) { children.forEach(cb); } } }
  };
  var s = makeSettings();
  var r = computeRollupTarget(parent, s, 'child of', fname, 'en');
  assert.strictEqual(r.target, 'In Progress');
});

// 12. version-stamp: migrateSnap from v1.6.3 stamp → v1.7.0
test('12. version-stamp: migrateSnap stamps pluginVersion 1.7.0', function() {
  var backend = require(path.join(__dirname, '..', '..', 'backend-project.js'));
  var snap = { pluginVersion: '1.6.3', sprintId: 'TEST-SPRINT', name: 'S', roles: {} };
  backend.migrateSnap(snap);
  assert.strictEqual(snap.pluginVersion, backend.CURRENT_PLUGIN_VERSION);
});

// Utility: _stateOrderIndex
test('_stateOrderIndex: returns correct index', function() {
  assert.strictEqual(_stateOrderIndex('Open',       ORDER), 0);
  assert.strictEqual(_stateOrderIndex('Done',       ORDER), 3);
  assert.strictEqual(_stateOrderIndex('NotInOrder', ORDER), -1);
  assert.strictEqual(_stateOrderIndex(null,         ORDER), -1);
});

// Utility: _readIssueStateName — handles both string and {name} forms
test('_readIssueStateName: handles string and object state values', function() {
  assert.strictEqual(_readIssueStateName({ fields: { State: 'Open' } }, 'State'), 'Open');
  assert.strictEqual(_readIssueStateName({ fields: { State: { name: 'Done' } } }, 'State'), 'Done');
  assert.strictEqual(_readIssueStateName({ fields: {} }, 'State'), null);
  assert.strictEqual(_readIssueStateName(null, 'State'), null);
});

// WF_I18N: EN and RU keys present and distinct
test('WF_I18N: has 15 locales, EN and RU keys differ', function() {
  var expectedLocales = ['en','ru','cs','de','es','fr','hu','it','ja','ko','nl','pl','pt','tr','zh'];
  expectedLocales.forEach(function(lang) {
    assert.ok(WF_I18N[lang], 'Missing locale: ' + lang);
  });
  var keys = ['rollupUpdated', 'rollupFloorHit', 'rollupResolvedSkipped', 'rollupUnknownState'];
  keys.forEach(function(k) {
    assert.notStrictEqual(WF_I18N.en[k], WF_I18N.ru[k], 'EN===RU for key: ' + k);
  });
});

// tWf: interpolates vars correctly
test('tWf: interpolates template variables', function() {
  var msg = tWf('en', 'rollupUpdated', { issueId: 'T-1', fromState: 'Open', toState: 'Done' });
  assert.ok(msg.includes('T-1'),  'missing issueId');
  assert.ok(msg.includes('Open'), 'missing fromState');
  assert.ok(msg.includes('Done'), 'missing toState');
});
