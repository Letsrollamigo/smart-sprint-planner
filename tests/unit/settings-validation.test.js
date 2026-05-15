'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const path   = require('node:path');

const backend = require(path.join(__dirname, '..', '..', 'backend-project.js'));
const { validateSettings, ALLOWED_KPE_KEYS } = backend;

/* v1.7.1 — KPE whitelist accepts both legacy Russian and canonical English keys.
   Pre-existing bug: frontend wrote English keys (Intern/Junior/Middle/Senior)
   since v1.4.1 D128 but backend whitelist allowed only Russian (Стажёр/Джун/Мидл/Синьор).
   Result: any settings POST failed invalid_settings_structure. */

test('KPE whitelist accepts canonical English keys (v1.4.1+ frontend storage layer)', function() {
  var s = { kpe: { Intern: 0, Junior: 0.5, Middle: 0.65, Senior: 0.75 } };
  assert.strictEqual(validateSettings(s), true);
});

test('KPE whitelist accepts legacy Russian keys (backward compat with old installs)', function() {
  var s = { kpe: { 'Стажёр': 0, 'Джун': 0.5, 'Мидл': 0.65, 'Синьор': 0.75 } };
  assert.strictEqual(validateSettings(s), true);
});

test('KPE whitelist rejects unknown grade keys', function() {
  var s = { kpe: { Lead: 1.5 } };
  assert.strictEqual(validateSettings(s), false);
});

test('KPE whitelist accepts mixed Russian+English (during legacy migration window)', function() {
  var s = { kpe: { Intern: 0, 'Джун': 0.5, Middle: 0.65 } };
  assert.strictEqual(validateSettings(s), true);
});

test('ALLOWED_KPE_KEYS contains both alphabets', function() {
  assert.ok(ALLOWED_KPE_KEYS.indexOf('Intern')  >= 0, 'missing Intern');
  assert.ok(ALLOWED_KPE_KEYS.indexOf('Junior')  >= 0, 'missing Junior');
  assert.ok(ALLOWED_KPE_KEYS.indexOf('Middle')  >= 0, 'missing Middle');
  assert.ok(ALLOWED_KPE_KEYS.indexOf('Senior')  >= 0, 'missing Senior');
  assert.ok(ALLOWED_KPE_KEYS.indexOf('Стажёр')  >= 0, 'missing Стажёр');
  assert.ok(ALLOWED_KPE_KEYS.indexOf('Джун')    >= 0, 'missing Джун');
  assert.ok(ALLOWED_KPE_KEYS.indexOf('Мидл')    >= 0, 'missing Мидл');
  assert.ok(ALLOWED_KPE_KEYS.indexOf('Синьор')  >= 0, 'missing Синьор');
});

test('Repro of pre-existing v1.7.0 bug: full settings POST with English KPE keys', function() {
  // Repro the exact scenario from acceptance smoke test 2026-05-15:
  // frontend collects ~70 keys including kpe with English grades.
  var s = {
    activeRoles: ['analysis', 'devFront'],
    fieldState: 'State',
    cascadeAggregationEnabled: false,
    forbidContainerWorkItems: false,
    cascadeKindField: 'Type',
    cascadeLevel2Values: ['Story'],
    cascadeLevel3Values: [],
    cascadeParentLinkInward: 'subtask of',
    cascadeParentLinkOutward: 'parent for',
    nkcJanuary: 105,
    nkcMay: 119,
    nkcOther: 145,
    rate: 1,
    participation: 1,
    kpe: { Intern: 0, Junior: 0.5, Middle: 0.65, Senior: 0.75 },
    stateRollupEnabled: true,
    stateRollupOrder: ['To Do', 'In Progress', 'Done'],
    stateRollupResolvedStates: ['Done'],
    stateRollupFloor: null,
    stateRollupStrategy: 'min'
  };
  assert.strictEqual(validateSettings(s), true,
    'pre-existing kpe bug should be fixed: full settings with English KPE keys must validate');
});
