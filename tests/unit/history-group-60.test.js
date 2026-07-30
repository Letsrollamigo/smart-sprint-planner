'use strict';
/* #60 — группировка истории по спринту (domain/history-view.js).
   Покрывает: схлопывание ролевых записей одного спринта в одну группу, порядок групп
   по первому вхождению (= по свежести, вход уже отсортирован), сохранение исходного
   idx (его потребляют editHistorySprint/finishHistorySprint) и рез по ПОСЛЕДНЕМУ '_'
   (легаси-sprintId с подчёркиванием не должен склеивать разные спринты). */

const test = require('node:test');
const assert = require('node:assert');
const VIEW = require('../../widgets/main/src/domain/history-view.js');

test('#60 записи одного спринта схлопываются в группу, порядок — по первому вхождению', () => {
  const sorted = [
    { sprintId: 'b_analysis',    name: 'B' },
    { sprintId: 'a_analysis',    name: 'A' },
    { sprintId: 'a_devPlatform', name: 'A' },
    { sprintId: 'b_testing',     name: 'B' },
  ];
  const groups = VIEW.groupHistoryBySprint(sorted);

  assert.deepStrictEqual(groups.map(g => g.baseId), ['b', 'a']);
  assert.deepStrictEqual(groups[0].recs.map(e => e.rec.sprintId), ['b_analysis', 'b_testing']);
  assert.deepStrictEqual(groups[1].recs.map(e => e.rec.sprintId), ['a_analysis', 'a_devPlatform']);
});

test('#60 idx = позиция в исходном отсортированном списке, не позиция в группе', () => {
  const sorted = [
    { sprintId: 'b_analysis' },
    { sprintId: 'a_analysis' },
    { sprintId: 'a_devPlatform' },
    { sprintId: 'b_testing' },
  ];
  const groups = VIEW.groupHistoryBySprint(sorted);
  assert.deepStrictEqual(groups[0].recs.map(e => e.idx), [0, 3]);
  assert.deepStrictEqual(groups[1].recs.map(e => e.idx), [1, 2]);
});

test('#60 baseId режется по ПОСЛЕДНЕМУ подчёркиванию — легаси-id не склеиваются', () => {
  const groups = VIEW.groupHistoryBySprint([
    { sprintId: 'sprint_2026_q3_analysis' },
    { sprintId: 'sprint_2026_q4_analysis' },
    { sprintId: 'sprint_2026_q3_testing' },
  ]);
  assert.deepStrictEqual(groups.map(g => g.baseId), ['sprint_2026_q3', 'sprint_2026_q4']);
  assert.strictEqual(groups[0].recs.length, 2);
  assert.strictEqual(groups[1].recs.length, 1);
});

test('#60 деградация: пустой вход, null-записи, sprintId без суффикса', () => {
  assert.deepStrictEqual(VIEW.groupHistoryBySprint([]), []);
  assert.deepStrictEqual(VIEW.groupHistoryBySprint(null), []);
  const groups = VIEW.groupHistoryBySprint([null, { sprintId: 'lone' }, undefined]);
  assert.deepStrictEqual(groups.map(g => g.baseId), ['lone']);
});
