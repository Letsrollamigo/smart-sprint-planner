/**
 * v1.3.0 Cascade aggregation workflow-rule unit tests (node:test).
 *
 * Stub'ит `@jetbrains/youtrack-scripting-api/*` через Module._resolveFilename
 * hack — позволяет require workflow-cascade-aggregation.js без YT runtime.
 * Покрытие:
 *   - guard: false когда cascadeAggregationEnabled выключен;
 *   - guard: false когда _activeFieldList пуст;
 *   - guard: true когда изменилось одно из cascade-полей;
 *   - aggregateToParent: task → story (sum, write to parent);
 *   - aggregateToParent: story → epic (cascade through 2 levels);
 *   - idempotency: cur === target → no write, no message;
 *   - multi-children-sum: sum across N siblings;
 *   - missing parent link → no-op.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const Module = require('node:module');

/* ── YT scripting-api stubs ─────────────────────────────────────────────── */

const messageLog = [];

const ytStubs = {
  '@jetbrains/youtrack-scripting-api/entities': {
    Issue: { onChange: function(spec) { return { __isOnChange: true, spec: spec }; } }
  },
  '@jetbrains/youtrack-scripting-api/workflow': {
    message: function(s) { messageLog.push(s); },
    check: function(cond, msg) {
      if (!cond) {
        const e = new Error(msg || 'workflow.check failed');
        e.name = 'WorkflowCheckException';
        throw e;
      }
    }
  },
  '@jetbrains/youtrack-scripting-api/date-time': {
    toPeriod: function(ms) {
      const minutes = Math.floor(ms / 60000);
      return {
        getWeeks: function() { return 0; },
        getDays: function() { return 0; },
        getHours: function() { return Math.floor(minutes / 60); },
        getMinutes: function() { return minutes % 60; },
        __mins: minutes
      };
    }
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

const wfPath = path.resolve(__dirname, '../../workflow-cascade-aggregation.js');
const wfModule = require(wfPath);

function resetLogs() { messageLog.length = 0; }

/* ── Helpers ────────────────────────────────────────────────────────────── */

function periodOfMinutes(m) {
  return {
    getWeeks: () => 0,
    getDays: () => 0,
    getHours: () => Math.floor((m || 0) / 60),
    getMinutes: () => (m || 0) % 60,
    __mins: (m || 0)
  };
}

function _coll(items) {
  const arr = (items || []).slice();
  arr.first = function() { return arr[0] || null; };
  arr.forEach = Array.prototype.forEach.bind(arr);
  return arr;
}

/* makeIssue — issue с fields/links/kind. opts:
   { id, kindField='Type', kind, fields, parents:{linkName:[issue,...]},
     children:{linkName:[issue,...]}, settings, changedFields:[...], tags:['name',...] }
   isChanged() — стаб: возвращает true если name ∈ changedFields.
   tags — стаб YT Set<IssueTag>: массив {name} (у Array есть .find, как у Set в scripting API). */
function makeIssue(opts) {
  opts = opts || {};
  const fields = Object.assign({}, opts.fields || {});
  const kindField = opts.kindField || 'Type';
  if (opts.kind !== undefined) fields[kindField] = opts.kind ? { name: opts.kind } : null;
  fields.isChanged = function(name) {
    return Array.isArray(opts.changedFields) && opts.changedFields.indexOf(name) >= 0;
  };
  const links = {};
  const parents = opts.parents || {};
  Object.keys(parents).forEach(function(ln) { links[ln] = _coll(parents[ln]); });
  const children = opts.children || {};
  Object.keys(children).forEach(function(ln) { links[ln] = _coll(children[ln]); });
  return {
    id: opts.id || 'TEST-1',
    fields: fields,
    links: links,
    tags: (opts.tags || []).map(function(n) { return { name: n }; }),
    project: { extensionProperties: { ssp_settings: opts.settings || null } }
  };
}

function makeCtx(issue, currentLang) {
  return {
    issue: issue,
    currentUser: { profile: { locale: currentLang ? { language: currentLang } : null } }
  };
}

function settingsCascade(extra) {
  return Object.assign({
    cascadeAggregationEnabled: true,
    defaultLang: 'en',
    activeRoles: ['devFront'],
    fieldDevFront: 'Plan FE',
    fieldFactDevFront: 'Fact FE',
    cascadeKindField: 'Type',
    cascadeLevel2Values: ['Story'],
    cascadeLevel3Values: ['Epic'],
    cascadeParentLinkInward: 'subtask of',
    cascadeParentLinkOutward: 'parent for'
  }, extra || {});
}

/* ── Tests ──────────────────────────────────────────────────────────────── */

test('cascade: exports a single canonical `rule` (YT spec — exports.rule)', () => {
  assert.ok(wfModule.rule && wfModule.rule.spec,
    'workflow must expose exports.rule for YT to register on-change rule');
  assert.strictEqual(typeof wfModule.rule.spec.guard, 'function');
  assert.strictEqual(typeof wfModule.rule.spec.action, 'function');
});

test('cascade guard: false when cascadeAggregationEnabled is missing', () => {
  resetLogs();
  const issue = makeIssue({
    settings: { activeRoles: ['devFront'], fieldFactDevFront: 'Fact FE' },
    changedFields: ['Fact FE']
  });
  assert.strictEqual(wfModule.rule.spec.guard(makeCtx(issue)), false);
});

test('cascade guard: false when no active roles configured', () => {
  resetLogs();
  const issue = makeIssue({
    settings: { cascadeAggregationEnabled: true, activeRoles: [] },
    changedFields: ['Fact FE']
  });
  assert.strictEqual(wfModule.rule.spec.guard(makeCtx(issue)), false);
});

test('cascade guard: true when a fact-field changed and cascade is enabled', () => {
  resetLogs();
  const issue = makeIssue({
    settings: settingsCascade(),
    changedFields: ['Fact FE']
  });
  assert.strictEqual(wfModule.rule.spec.guard(makeCtx(issue)), true);
});

test('cascade guard: false when changed field is unrelated to cascade list', () => {
  resetLogs();
  const issue = makeIssue({
    settings: settingsCascade(),
    changedFields: ['summary']
  });
  assert.strictEqual(wfModule.rule.spec.guard(makeCtx(issue)), false);
});

test('cascade action: task → story aggregates Fact FE from siblings', () => {
  resetLogs();
  const settings = settingsCascade();
  const sibling = makeIssue({
    id: 'P-2', settings: settings,
    fields: { 'Fact FE': periodOfMinutes(30) }
  });
  const story = makeIssue({
    id: 'P-S', settings: settings, kind: 'Story',
    fields: { 'Fact FE': null }
  });
  const task = makeIssue({
    id: 'P-1', settings: settings,
    fields: { 'Fact FE': periodOfMinutes(60) },
    parents: { 'subtask of': [story] },
    changedFields: ['Fact FE']
  });
  /* Story.children includes both task and sibling. */
  story.links['parent for'] = _coll([task, sibling]);
  wfModule.rule.spec.action(makeCtx(task));
  assert.ok(story.fields['Fact FE'], 'story Fact FE was set');
  assert.strictEqual(story.fields['Fact FE'].__mins, 90,
    'story Fact FE = sum(60 + 30) = 90');
  assert.ok(messageLog.some(s => /Cascade-updated work hours in P-S/.test(s)),
    'cascadeUpdated message emitted for parent story');
});

test('cascade action: task → story → epic propagates 2 levels up', () => {
  resetLogs();
  const settings = settingsCascade();
  const epic = makeIssue({
    id: 'P-E', settings: settings, kind: 'Epic',
    fields: { 'Fact FE': null }
  });
  const story = makeIssue({
    id: 'P-S', settings: settings, kind: 'Story',
    fields: { 'Fact FE': periodOfMinutes(20) },
    parents: { 'subtask of': [epic] }
  });
  const task = makeIssue({
    id: 'P-1', settings: settings,
    fields: { 'Fact FE': periodOfMinutes(60) },
    parents: { 'subtask of': [story] },
    changedFields: ['Fact FE']
  });
  story.links['parent for'] = _coll([task]);
  epic.links['parent for'] = _coll([story]);
  wfModule.rule.spec.action(makeCtx(task));
  assert.strictEqual(story.fields['Fact FE'].__mins, 60,
    'story aggregated from one child task: 60');
  assert.strictEqual(epic.fields['Fact FE'].__mins, 60,
    'epic aggregated from story (recomputed): 60');
});

test('cascade action: direct level-2 (story) change recomputes its level-3 (epic) parent', () => {
  resetLogs();
  const settings = settingsCascade();
  const epic = makeIssue({
    id: 'P-E', settings: settings, kind: 'Epic',
    fields: { 'Fact FE': null }
  });
  const story = makeIssue({
    id: 'P-S', settings: settings, kind: 'Story',
    fields: { 'Fact FE': periodOfMinutes(120) },
    parents: { 'subtask of': [epic] },
    changedFields: ['Fact FE']
  });
  epic.links['parent for'] = _coll([story]);
  wfModule.rule.spec.action(makeCtx(story));
  assert.strictEqual(epic.fields['Fact FE'].__mins, 120,
    'epic recomputed from changed story directly');
});

test('cascade action: idempotent — no write when parent already matches sum', () => {
  resetLogs();
  const settings = settingsCascade();
  const story = makeIssue({
    id: 'P-S', settings: settings, kind: 'Story',
    fields: { 'Fact FE': periodOfMinutes(60) }
  });
  const task = makeIssue({
    id: 'P-1', settings: settings,
    fields: { 'Fact FE': periodOfMinutes(60) },
    parents: { 'subtask of': [story] },
    changedFields: ['Fact FE']
  });
  story.links['parent for'] = _coll([task]);
  /* Snapshot original period object to detect rewrite. */
  const origPeriod = story.fields['Fact FE'];
  wfModule.rule.spec.action(makeCtx(task));
  assert.strictEqual(story.fields['Fact FE'], origPeriod,
    'parent field object untouched when cur === target');
  assert.ok(!messageLog.some(s => /Cascade-updated/.test(s)),
    'no message emitted when nothing changed');
});

test('cascade action: no-op when issue has no parent link', () => {
  resetLogs();
  const settings = settingsCascade();
  const orphan = makeIssue({
    id: 'P-1', settings: settings,
    fields: { 'Fact FE': periodOfMinutes(60) },
    changedFields: ['Fact FE']
  });
  /* No parents in links. */
  wfModule.rule.spec.action(makeCtx(orphan));
  assert.ok(!messageLog.some(s => /Cascade-updated/.test(s)),
    'no aggregation possible without parent — no message');
});

test('cascade action: emits separate est message when plan field changes', () => {
  resetLogs();
  const settings = settingsCascade();
  const story = makeIssue({
    id: 'P-S', settings: settings, kind: 'Story',
    fields: { 'Plan FE': null, 'Fact FE': null }
  });
  const task = makeIssue({
    id: 'P-1', settings: settings,
    fields: { 'Plan FE': periodOfMinutes(120), 'Fact FE': null },
    parents: { 'subtask of': [story] },
    changedFields: ['Plan FE']
  });
  story.links['parent for'] = _coll([task]);
  wfModule.rule.spec.action(makeCtx(task));
  /* В ru/en сообщения для est отличаются — проверим что en есть «estimates». */
  assert.ok(messageLog.some(s => /Cascade-updated estimates in P-S/.test(s)),
    'est-only change → cascadeUpdatedEst message; got: ' + JSON.stringify(messageLog));
  assert.ok(!messageLog.some(s => /Cascade-updated work hours/.test(s)),
    'no fact-message when nothing fact changed');
});

test('cascade action: emits both est and fact messages when both change', () => {
  resetLogs();
  const settings = settingsCascade();
  const story = makeIssue({
    id: 'P-S', settings: settings, kind: 'Story',
    fields: { 'Plan FE': null, 'Fact FE': null }
  });
  const task = makeIssue({
    id: 'P-1', settings: settings,
    fields: { 'Plan FE': periodOfMinutes(120), 'Fact FE': periodOfMinutes(60) },
    parents: { 'subtask of': [story] },
    changedFields: ['Fact FE']
  });
  story.links['parent for'] = _coll([task]);
  wfModule.rule.spec.action(makeCtx(task));
  assert.ok(messageLog.some(s => /Cascade-updated estimates/.test(s)),
    'est message present');
  assert.ok(messageLog.some(s => /Cascade-updated work hours/.test(s)),
    'fact message present');
});

/* ── v3.12.0 — тег-маркер защиты ручных оценок (cascadeManualEstTag) ────────── */

test('cascade tag-protect: tagged parent is skipped — no write, no message', () => {
  resetLogs();
  const settings = settingsCascade({ cascadeManualEstTag: 'manual-est' });
  const story = makeIssue({
    id: 'P-S', settings: settings, kind: 'Story',
    fields: { 'Fact FE': periodOfMinutes(500) },
    tags: ['manual-est']
  });
  const task = makeIssue({
    id: 'P-1', settings: settings,
    fields: { 'Fact FE': periodOfMinutes(60) },
    parents: { 'subtask of': [story] },
    changedFields: ['Fact FE']
  });
  story.links['parent for'] = _coll([task]);
  const orig = story.fields['Fact FE'];
  wfModule.rule.spec.action(makeCtx(task));
  assert.strictEqual(story.fields['Fact FE'], orig,
    'tagged story keeps its manual value untouched (500m, not overwritten by 60m sum)');
  assert.strictEqual(messageLog.length, 0, 'no message for skipped node');
});

test('cascade tag-protect: tagged grandparent — parent aggregated, grand skipped', () => {
  resetLogs();
  const settings = settingsCascade({ cascadeManualEstTag: 'manual-est' });
  const epic = makeIssue({
    id: 'P-E', settings: settings, kind: 'Epic',
    fields: { 'Fact FE': periodOfMinutes(999) },
    tags: ['manual-est']
  });
  const story = makeIssue({
    id: 'P-S', settings: settings, kind: 'Story',
    fields: { 'Fact FE': null },
    parents: { 'subtask of': [epic] }
  });
  const task = makeIssue({
    id: 'P-1', settings: settings,
    fields: { 'Fact FE': periodOfMinutes(60) },
    parents: { 'subtask of': [story] },
    changedFields: ['Fact FE']
  });
  story.links['parent for'] = _coll([task]);
  epic.links['parent for'] = _coll([story]);
  const origEpic = epic.fields['Fact FE'];
  wfModule.rule.spec.action(makeCtx(task));
  assert.strictEqual(story.fields['Fact FE'].__mins, 60, 'untagged story aggregated normally');
  assert.strictEqual(epic.fields['Fact FE'], origEpic, 'tagged epic keeps manual value (999m)');
});

test('cascade tag-protect: tagged story skipped, untagged epic still recomputed', () => {
  resetLogs();
  const settings = settingsCascade({ cascadeManualEstTag: 'manual-est' });
  const epic = makeIssue({
    id: 'P-E', settings: settings, kind: 'Epic',
    fields: { 'Fact FE': null }
  });
  const story = makeIssue({
    id: 'P-S', settings: settings, kind: 'Story',
    fields: { 'Fact FE': periodOfMinutes(500) },
    parents: { 'subtask of': [epic] },
    tags: ['manual-est']
  });
  const task = makeIssue({
    id: 'P-1', settings: settings,
    fields: { 'Fact FE': periodOfMinutes(60) },
    parents: { 'subtask of': [story] },
    changedFields: ['Fact FE']
  });
  story.links['parent for'] = _coll([task]);
  epic.links['parent for'] = _coll([story]);
  wfModule.rule.spec.action(makeCtx(task));
  assert.strictEqual(story.fields['Fact FE'].__mins, 500, 'tagged story untouched');
  assert.strictEqual(epic.fields['Fact FE'].__mins, 500,
    'epic recomputed from story manual value (skip is per-node, not per-branch)');
});

test('cascade tag-protect: empty setting → prior behavior even with tag on parent', () => {
  resetLogs();
  const settings = settingsCascade(); /* cascadeManualEstTag не задан */
  const story = makeIssue({
    id: 'P-S', settings: settings, kind: 'Story',
    fields: { 'Fact FE': periodOfMinutes(500) },
    tags: ['manual-est']
  });
  const task = makeIssue({
    id: 'P-1', settings: settings,
    fields: { 'Fact FE': periodOfMinutes(60) },
    parents: { 'subtask of': [story] },
    changedFields: ['Fact FE']
  });
  story.links['parent for'] = _coll([task]);
  wfModule.rule.spec.action(makeCtx(task));
  assert.strictEqual(story.fields['Fact FE'].__mins, 60,
    'no setting → tag ignored, story overwritten by sum as before');
});

test('cascade action: aggregates BOTH plan (Plan FE) and fact (Fact FE) fields', () => {
  resetLogs();
  const settings = settingsCascade();
  const story = makeIssue({
    id: 'P-S', settings: settings, kind: 'Story',
    fields: { 'Plan FE': null, 'Fact FE': null }
  });
  const t1 = makeIssue({
    id: 'P-1', settings: settings,
    fields: { 'Plan FE': periodOfMinutes(120), 'Fact FE': periodOfMinutes(60) },
    parents: { 'subtask of': [story] },
    changedFields: ['Fact FE']
  });
  const t2 = makeIssue({
    id: 'P-2', settings: settings,
    fields: { 'Plan FE': periodOfMinutes(180), 'Fact FE': periodOfMinutes(30) }
  });
  story.links['parent for'] = _coll([t1, t2]);
  wfModule.rule.spec.action(makeCtx(t1));
  assert.strictEqual(story.fields['Plan FE'].__mins, 300,
    'plan aggregated alongside fact (both DTA fields included)');
  assert.strictEqual(story.fields['Fact FE'].__mins, 90, 'fact aggregated');
});
