'use strict';

const test = require('node:test');
const assert = require('node:assert');

const pure = require('../../widgets/main/src/pure/planning-model-pure.js');
const { planningModelToFlags, planningModelFromSettings, isLegacyHybrid, PLANNING_MODELS } = pure;

/* ── Каноническая таблица §2: model + lightSub → derived флаги ── */

test('toFlags: simple → персональный расчёт выключен', function () {
  assert.deepStrictEqual(planningModelToFlags('simple'), {
    personalPlanningEnabled: false, usePersonalForResource: false, manualPersonalResource: false,
  });
});

test('toFlags: light + auto → PP on, useRes on, manual off', function () {
  assert.deepStrictEqual(planningModelToFlags('light', 'auto'), {
    personalPlanningEnabled: true, usePersonalForResource: true, manualPersonalResource: false,
  });
});

test('toFlags: light + manual → PP on, useRes on, manual on', function () {
  assert.deepStrictEqual(planningModelToFlags('light', 'manual'), {
    personalPlanningEnabled: true, usePersonalForResource: true, manualPersonalResource: true,
  });
});

test('toFlags: full → PP+useRes (ресурс из ёмкости, #45 R4)', function () {
  assert.deepStrictEqual(planningModelToFlags('full'), {
    personalPlanningEnabled: true, usePersonalForResource: true, manualPersonalResource: false,
  });
});

/* ── sticky-legacy: light + legacyHybrid → useRes остаётся false ── */

test('toFlags: light + legacyHybrid → useRes=false (sticky-legacy)', function () {
  assert.deepStrictEqual(planningModelToFlags('light', 'auto', { legacyHybrid: true }), {
    personalPlanningEnabled: true, usePersonalForResource: false, manualPersonalResource: false,
  });
  assert.deepStrictEqual(planningModelToFlags('light', 'manual', { legacyHybrid: true }), {
    personalPlanningEnabled: true, usePersonalForResource: false, manualPersonalResource: true,
  });
});

test('isLegacyHybrid: PP on + useRes off → true; иначе false', function () {
  assert.strictEqual(isLegacyHybrid({ personalPlanningEnabled: true, usePersonalForResource: false }), true);
  assert.strictEqual(isLegacyHybrid({ personalPlanningEnabled: true, usePersonalForResource: true }), false);
  assert.strictEqual(isLegacyHybrid({ personalPlanningEnabled: false, usePersonalForResource: false }), false);
  assert.strictEqual(isLegacyHybrid({}), false);
  assert.strictEqual(isLegacyHybrid(null), false);
});

/* ── fromSettings: источник planningModel, fallback на legacy-флаги ── */

test('fromSettings: planningModel задан → берём его', function () {
  assert.deepStrictEqual(planningModelFromSettings({ planningModel: 'light', manualPersonalResource: true }), {
    model: 'light', lightSub: 'manual',
  });
  assert.deepStrictEqual(planningModelFromSettings({ planningModel: 'simple' }), {
    model: 'simple', lightSub: 'auto',
  });
});

test('fromSettings: нет planningModel → дериват из флагов (PLANNING_MODEL_SHIM)', function () {
  assert.deepStrictEqual(planningModelFromSettings({ personalPlanningEnabled: true, manualPersonalResource: false }), {
    model: 'light', lightSub: 'auto',
  });
  assert.deepStrictEqual(planningModelFromSettings({ personalPlanningEnabled: false }), {
    model: 'simple', lightSub: 'auto',
  });
});

test('fromSettings: невалидный planningModel → дериват из флагов', function () {
  assert.strictEqual(planningModelFromSettings({ planningModel: 'garbage', personalPlanningEnabled: true }).model, 'light');
});

test('fromSettings: full сохраняется на чтении (#45 R4 — функционал реализован)', function () {
  assert.strictEqual(planningModelFromSettings({ planningModel: 'full' }).model, 'full');
});

test('round-trip: fromSettings → toFlags восстанавливает флаги (не-legacy)', function () {
  const settings = { personalPlanningEnabled: true, usePersonalForResource: true, manualPersonalResource: true };
  const { model, lightSub } = planningModelFromSettings(settings);
  assert.deepStrictEqual(planningModelToFlags(model, lightSub, { legacyHybrid: isLegacyHybrid(settings) }), {
    personalPlanningEnabled: true, usePersonalForResource: true, manualPersonalResource: true,
  });
});

test('round-trip: legacy-гибрид сохраняется (useRes=false не теряется)', function () {
  const settings = { personalPlanningEnabled: true, usePersonalForResource: false, manualPersonalResource: false };
  const { model, lightSub } = planningModelFromSettings(settings);
  assert.deepStrictEqual(planningModelToFlags(model, lightSub, { legacyHybrid: isLegacyHybrid(settings) }), settings);
});

test('PLANNING_MODELS — три режима', function () {
  assert.deepStrictEqual(PLANNING_MODELS, ['simple', 'light', 'full']);
});
