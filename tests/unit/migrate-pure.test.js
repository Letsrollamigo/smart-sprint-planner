'use strict';
// Unit tests for widgets/main/src/pure/migrate-pure.js — pure legacy→canonical maps.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { migrateStatus, migrateInc, migrateGrade, migrateKpeObject,
        buildPPMapFromCanon, backfillCanonFromSprintPP } =
  require('../../widgets/main/src/pure/migrate-pure.js');

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

/* #49 — personalPlanning канон-derive + backfill. */
const PP_A = { resourcesByAssignee: { u1: { resource: 8 } }, taskAssignments: { 'T-1': { assignee: 'u1' } } };
const PP_B = { resourcesByAssignee: { u2: { resource: 4 } }, taskAssignments: {} };

describe('buildPPMapFromCanon', () => {
  it('собирает keyed-map {[rk]: PP} из per-role канон-записей спринта', () => {
    const history = [
      { sprintId: 'S1_analysis', roleKey: 'analysis', personalPlanning: PP_A },
      { sprintId: 'S1_devBack',  roleKey: 'devBack',  personalPlanning: PP_B },
      { sprintId: 'S2_analysis', roleKey: 'analysis', personalPlanning: PP_A }, // другой спринт — игнор
      { sprintId: 'S1_testing',  roleKey: 'testing',  personalPlanning: {} },   // пустой — игнор
    ];
    const map = buildPPMapFromCanon('S1', history);
    assert.deepStrictEqual(Object.keys(map).sort(), ['analysis', 'devBack']);
    assert.deepStrictEqual(map.analysis, PP_A);
    assert.deepStrictEqual(map.devBack, PP_B);
  });
  it('roleKey берётся из суффикса sprintId, если поле roleKey отсутствует', () => {
    const map = buildPPMapFromCanon('S1', [{ sprintId: 'S1_devFront', personalPlanning: PP_A }]);
    assert.deepStrictEqual(Object.keys(map), ['devFront']);
  });
  it('deepClone (если дан) изолирует значения от history', () => {
    const dc = (o) => JSON.parse(JSON.stringify(o));
    const history = [{ sprintId: 'S1_a', roleKey: 'a', personalPlanning: PP_A }];
    const map = buildPPMapFromCanon('S1', history, dc);
    assert.notStrictEqual(map.a, PP_A);
    assert.deepStrictEqual(map.a, PP_A);
  });
  it('пустые/невалидные входы → {}', () => {
    assert.deepStrictEqual(buildPPMapFromCanon('', []), {});
    assert.deepStrictEqual(buildPPMapFromCanon('S1', null), {});
    assert.deepStrictEqual(buildPPMapFromCanon(null, [{ sprintId: 'S1_a', personalPlanning: PP_A }]), {});
  });
});

describe('backfillCanonFromSprintPP', () => {
  it('досевает пустые канон-записи из legacy keyed-кэша _sprint.personalPlanning', () => {
    const sprint = { sprintId: 'S1', personalPlanning: { analysis: PP_A, devBack: PP_B } };
    const history = [
      { sprintId: 'S1_analysis', roleKey: 'analysis', personalPlanning: {} },         // пустая → засеять
      { sprintId: 'S1_devBack',  roleKey: 'devBack',  personalPlanning: { resourcesByAssignee: { keep: {} } } }, // непустая → НЕ трогать
    ];
    backfillCanonFromSprintPP(sprint, history);
    assert.deepStrictEqual(history[0].personalPlanning, PP_A);                          // засеяно
    assert.deepStrictEqual(history[1].personalPlanning, { resourcesByAssignee: { keep: {} } }); // сохранено
  });
  it('НЕ создаёт отсутствующие записи (создание = домен saveRoleHistorySnapshot)', () => {
    const sprint = { sprintId: 'S1', personalPlanning: { analysis: PP_A } };
    const history = [];
    backfillCanonFromSprintPP(sprint, history);
    assert.deepStrictEqual(history, []);
  });
  it('игнорирует single-форму кэша (resourcesByAssignee/people/taskAssignments на верхнем уровне)', () => {
    const sprint = { sprintId: 'S1', personalPlanning: PP_A }; // single, не keyed-map
    const history = [{ sprintId: 'S1_analysis', roleKey: 'analysis', personalPlanning: {} }];
    backfillCanonFromSprintPP(sprint, history);
    assert.deepStrictEqual(history[0].personalPlanning, {}); // не тронуто
  });
  it('нет кэша / нет sprintId → history без изменений', () => {
    const history = [{ sprintId: 'S1_a', personalPlanning: {} }];
    assert.strictEqual(backfillCanonFromSprintPP({ sprintId: 'S1' }, history), history);
    assert.strictEqual(backfillCanonFromSprintPP(null, history), history);
    assert.deepStrictEqual(history[0].personalPlanning, {});
  });
});
