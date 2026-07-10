'use strict';

/* #50 S6b — A6 Бэклог в ЧЧ по ролям: pure-агрегатор buildBacklogRows.
   Покрытие: Σ оценок роли (мин→ч) + счётчик задач + «месяцев» = Σч ÷ ёмкость(ч/мес) + бэнды
   уровня (ok/warn/over/none) + null-ёмкость + нулевой бэклог + отсев невалидных оценок. */

const test = require('node:test');
const assert = require('node:assert');
const pure = require('../../widgets/main/src/pure/reporting-pure.js');

const roles = [{ key: 'analysis', label: 'Аналитик' }, { key: 'dev', label: 'Разработчик' }];

test('A6: Σ ЧЧ по роли + счётчик задач (мин→ч, отсев null/0/невалид)', () => {
  const perIssue = [
    { est: { analysis: 120, dev: null } },   // 2ч аналитик
    { est: { analysis: 60, dev: 600 } },     // 1ч аналитик, 10ч dev
    { est: { analysis: 0, dev: 'x' } },      // 0 и невалид — отсев
    { est: {} },                              // пусто
  ];
  const { rows } = pure.buildBacklogRows(perIssue, roles, { analysis: 145, dev: 145 }, 6);
  const a = rows.find((r) => r.roleKey === 'analysis');
  const d = rows.find((r) => r.roleKey === 'dev');
  assert.strictEqual(a.sumMinutes, 180);
  assert.strictEqual(a.taskCount, 2);        // 0 не считается задачей роли
  assert.strictEqual(a.sumHours, 3);
  assert.strictEqual(d.sumMinutes, 600);
  assert.strictEqual(d.taskCount, 1);
});

test('A6: «месяцев» = Σч ÷ ёмкость(ч/мес); бэнды ok/warn/over по норме 6', () => {
  // analysis: Σ = 145*2.6 ч? проще: задаём минуты прямо. 6*145=870ч=52200мин над нормой.
  const cap = { ok: 145, warn: 145, over: 145 };
  const rs = [{ key: 'ok' }, { key: 'warn' }, { key: 'over' }];
  const perIssue = [
    { est: { ok: 145 * 60 * 2, warn: 145 * 60 * 5.5, over: 145 * 60 * 7 } }, // 2 / 5.5 / 7 мес
  ];
  const { rows, norm } = pure.buildBacklogRows(perIssue, rs, cap, 6);
  assert.strictEqual(norm, 6);
  const m = (k) => rows.find((r) => r.roleKey === k);
  assert.ok(Math.abs(m('ok').months - 2) < 1e-9);
  assert.strictEqual(m('ok').level, 'ok');       // 2 < 6*0.85=5.1
  assert.strictEqual(m('warn').level, 'warn');   // 5.5 ∈ [5.1, 6)
  assert.strictEqual(m('over').level, 'over');   // 7 >= 6
});

test('A6: нет ёмкости роли → months=null, level=none, гейдж «—»', () => {
  const { rows } = pure.buildBacklogRows([{ est: { analysis: 6000 } }], roles, { analysis: 0 }, 6);
  const a = rows.find((r) => r.roleKey === 'analysis');
  assert.strictEqual(a.months, null);
  assert.strictEqual(a.level, 'none');
  assert.strictEqual(a.capacityHours, null);
});

test('A6: строка на КАЖДУЮ роль даже при нулевом бэклоге (0ч/0мес, ok)', () => {
  const { rows } = pure.buildBacklogRows([], roles, { analysis: 145, dev: 145 }, 6);
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0].sumMinutes, 0);
  assert.strictEqual(rows[0].months, 0);
  assert.strictEqual(rows[0].level, 'ok');
});

test('A6: дефолт нормы 6 при мусорном normMonths; null-safe входы', () => {
  const { norm, rows } = pure.buildBacklogRows(null, roles, null, -3);
  assert.strictEqual(norm, 6);
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0].months, null);      // нет ёмкости
});
