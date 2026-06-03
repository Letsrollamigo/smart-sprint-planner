'use strict';
// Unit tests for widgets/main/src/migrate-pure.js — pure legacy→canonical maps.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { migrateStatus, migrateInc, migrateGrade, migrateKpeObject } =
  require('../../widgets/main/src/migrate-pure.js');

describe('migrateStatus', () => {
  it('maps legacy Cyrillic labels to canonical keys', () => {
    assert.strictEqual(migrateStatus('Планируется'), 'PLANNING');
    assert.strictEqual(migrateStatus('Запланирован и подтверждён'), 'CONFIRMED');
    assert.strictEqual(migrateStatus('Аллоцирован'), 'ALLOCATED');
    assert.strictEqual(migrateStatus('Завершен'), 'FINISHED');
  });
  it('migrates retired PLANNED → PLANNING', () => {
    assert.strictEqual(migrateStatus('PLANNED'), 'PLANNING');
  });
  it('is idempotent for already-canonical values', () => {
    assert.strictEqual(migrateStatus('CONFIRMED'), 'CONFIRMED');
    assert.strictEqual(migrateStatus('FINISHED'), 'FINISHED');
  });
  it('passes falsy through', () => {
    assert.strictEqual(migrateStatus(''), '');
    assert.strictEqual(migrateStatus(null), null);
    assert.strictEqual(migrateStatus(undefined), undefined);
  });
});

describe('migrateInc', () => {
  it('maps legacy inclusion labels', () => {
    assert.strictEqual(migrateInc('Ожидает распределения'), 'INC_PENDING');
    assert.strictEqual(migrateInc('Исключена из спринта'), 'INC_EXCLUDED');
  });
  it('passes unknown/canonical/falsy through', () => {
    assert.strictEqual(migrateInc('INC_PLANNED'), 'INC_PLANNED');
    assert.strictEqual(migrateInc(''), '');
    assert.strictEqual(migrateInc(null), null);
  });
});

describe('migrateGrade', () => {
  it('flips Cyrillic grade keys to English', () => {
    assert.strictEqual(migrateGrade('Стажёр'), 'Intern');
    assert.strictEqual(migrateGrade('Джун'), 'Junior');
    assert.strictEqual(migrateGrade('Мидл'), 'Middle');
    assert.strictEqual(migrateGrade('Синьор'), 'Senior');
  });
  it('passes English/unknown/falsy through', () => {
    assert.strictEqual(migrateGrade('Senior'), 'Senior');
    assert.strictEqual(migrateGrade('Unknown'), 'Unknown');
    assert.strictEqual(migrateGrade(''), '');
    assert.strictEqual(migrateGrade(null), null);
  });
});

describe('migrateKpeObject', () => {
  it('re-keys a legacy KPE object to English grade keys', () => {
    const out = migrateKpeObject({ 'Джун': 0.5, 'Синьор': 0.75 });
    assert.deepStrictEqual(out, { Junior: 0.5, Senior: 0.75 });
  });
  it('leaves already-English keys intact', () => {
    assert.deepStrictEqual(migrateKpeObject({ Middle: 0.65 }), { Middle: 0.65 });
  });
  it('passes non-objects through', () => {
    assert.strictEqual(migrateKpeObject(null), null);
    assert.strictEqual(migrateKpeObject(undefined), undefined);
    assert.strictEqual(migrateKpeObject('x'), 'x');
  });
});
