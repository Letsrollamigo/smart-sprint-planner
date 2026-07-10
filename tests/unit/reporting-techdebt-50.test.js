'use strict';

/* #50 S8b — B1 Техдолг (контур B): чистый buildTechDebtRows.
   Per-система×роль: Σ оценок техдолга + Σ всех оценок роли + % по ЧЧ; сигнал «неоценённый долг». */

const test = require('node:test');
const assert = require('node:assert');
const pure = require('../../widgets/main/src/pure/reporting-pure.js');

const ROLES = [{ key: 'a', label: 'Аналитик' }, { key: 'b', label: 'Разработчик' }];

test('buildTechDebtRows: % по ЧЧ = долг роли ÷ все ЧЧ роли, сегментация по системе', () => {
  const perIssue = [
    { est: { a: 100 }, isTechDebt: true, system: 'S1' },   // долг роли a
    { est: { a: 300 }, isTechDebt: false, system: 'S1' },  // не долг, но в знаменатель роли a
    { est: { b: 60 }, isTechDebt: true, system: 'S2' },    // долг роли b (др. система)
    { est: {}, isTechDebt: true, system: 'S1' },           // долг без оценки → unestimated
  ];
  const out = pure.buildTechDebtRows(perIssue, ROLES);

  // две системы
  const s1 = out.groups.find((g) => g.system === 'S1');
  const s2 = out.groups.find((g) => g.system === 'S2');
  assert.ok(s1 && s2);

  // S1: роль a debt=100, all=400, pct=0.25; роль b без данных → пропущена
  const s1a = s1.rows.find((r) => r.roleKey === 'a');
  assert.strictEqual(s1a.debtMinutes, 100);
  assert.strictEqual(s1a.allMinutes, 400);
  assert.ok(Math.abs(s1a.pct - 0.25) < 1e-9);
  assert.strictEqual(s1.rows.find((r) => r.roleKey === 'b'), undefined);

  // S2: роль b debt=60, all=60, pct=1
  const s2b = s2.rows.find((r) => r.roleKey === 'b');
  assert.strictEqual(s2b.debtMinutes, 60);
  assert.strictEqual(s2b.pct, 1);

  // сигналы + тоталы
  assert.strictEqual(out.debtTasks, 3);
  assert.strictEqual(out.estimated, 2);
  assert.strictEqual(out.unestimated, 1);   // задача без единой валидной оценки
  assert.strictEqual(out.totalDebtMinutes, 160);
  assert.strictEqual(out.totalAllMinutes, 460);
  assert.ok(Math.abs(out.totalPct - 160 / 460) < 1e-9);
});

test('buildTechDebtRows: пустая/невалидная оценка не идёт в суммы, 0 и null игнор', () => {
  const perIssue = [
    { est: { a: 0 }, isTechDebt: true, system: '' },       // 0 → невалид → unestimated
    { est: { a: null }, isTechDebt: true, system: '' },    // null → невалид → unestimated
    { est: { a: 50 }, isTechDebt: true, system: '' },      // валид
  ];
  const out = pure.buildTechDebtRows(perIssue, ROLES);
  assert.strictEqual(out.groups.length, 1);                // одна система ''
  assert.strictEqual(out.groups[0].rows[0].debtMinutes, 50);
  assert.strictEqual(out.unestimated, 2);
  assert.strictEqual(out.estimated, 1);
});

test('buildTechDebtRows: нет техдолга → % 0, unestimated 0, но знаменатель считается', () => {
  const perIssue = [{ est: { a: 200 }, isTechDebt: false, system: 'S1' }];
  const out = pure.buildTechDebtRows(perIssue, ROLES);
  assert.strictEqual(out.totalDebtMinutes, 0);
  assert.strictEqual(out.totalAllMinutes, 200);
  assert.strictEqual(out.totalPct, 0);
  assert.strictEqual(out.debtTasks, 0);
  assert.strictEqual(out.groups[0].rows[0].pct, 0);
});

test('buildTechDebtRows: пустые аргументы не падают', () => {
  const out = pure.buildTechDebtRows(null, null);
  assert.deepStrictEqual(out.groups, []);
  assert.strictEqual(out.totalPct, 0);
  assert.strictEqual(out.unestimated, 0);
});
