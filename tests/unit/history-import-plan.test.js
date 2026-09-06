/* #89.2 — план слияния импорта истории: один источник для записи и предпросмотра.
   Выбор по базовому sprintId, дедуп по полному; skip и overwrite обязаны давать
   РАЗНЫЕ счётчики на одной фикстуре — иначе assert не способен упасть. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { planHistImport } = require('../../widgets/main/src/domain/history-io.js');

const current = [
  { sprintId: 'S1_analysis', name: 'old S1 analysis' },
  { sprintId: 'S1_testing',  name: 'old S1 testing' },
  null,                                             /* дырка в истории не роняет план */
  { sprintId: 'S9_devBack',  name: 'untouched' },
];
const file = [
  { sprintId: 'S1_analysis', name: 'new S1 analysis' },   /* дубль по полному id */
  { sprintId: 'S1_devBack',  name: 'new S1 devBack' },    /* тот же спринт, новая роль */
  { sprintId: 'S2_analysis', name: 'new S2' },            /* новый спринт */
  { sprintId: 'S3_analysis', name: 'not selected' },
  { name: 'без sprintId — мимо' },
];

test('#89.2 skip: дубль по полному sprintId пропускается, новая роль того же спринта — применяется', () => {
  const p = planHistImport(['S1', 'S2'], 'skip', file, current);
  assert.deepEqual(p.toAdd.map(r => r.sprintId), ['S1_devBack', 'S2_analysis']);
  assert.equal(p.skipped, 1);
  assert.equal(p.replaced, 0);
  assert.deepEqual(p.merged.map(r => r.sprintId), ['S1_analysis', 'S1_testing', 'S9_devBack', 'S1_devBack', 'S2_analysis']);
  assert.equal(p.merged.find(r => r.sprintId === 'S1_analysis').name, 'old S1 analysis', 'skip не трогает существующий снимок');
});

test('#89.2 overwrite: дубль заменяется, остальная история цела', () => {
  const p = planHistImport(['S1', 'S2'], 'overwrite', file, current);
  assert.deepEqual(p.toAdd.map(r => r.sprintId), ['S1_analysis', 'S1_devBack', 'S2_analysis']);
  assert.equal(p.replaced, 1);
  assert.equal(p.skipped, 0);
  assert.deepEqual(p.merged.map(r => r.sprintId), ['S1_testing', 'S9_devBack', 'S1_analysis', 'S1_devBack', 'S2_analysis']);
  assert.equal(p.merged.find(r => r.sprintId === 'S1_analysis').name, 'new S1 analysis');
});

test('#89.2 ничего не выбрано → пустой план, история как была (без null)', () => {
  const p = planHistImport([], 'skip', file, current);
  assert.equal(p.toAdd.length, 0);
  assert.deepEqual(p.merged.map(r => r.sprintId), ['S1_analysis', 'S1_testing', 'S9_devBack']);
});
