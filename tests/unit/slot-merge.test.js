'use strict';

/* #84 — трёхстороннее слияние слота (pure/slot-merge-pure.js): база / моё / чужое.
 * Контракт: правку берёт сторона, которая её сделала; одно и то же место с разными
 * значениями → conflict (наверху остаётся отказ #100); одинаковое значение с двух
 * сторон конфликтом не считается; отсутствие ключа у чужой стороны — удаление
 * только если ключ был в базе (ожог #102).
 * Запуск: node --test 'tests/unit/slot-merge.test.js'. */

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const M = require(path.join(__dirname, '..', '..', 'widgets', 'main', 'src', 'pure', 'slot-merge-pure.js'));

const rec = (id, extra) => Object.assign({ sprintId: id, status: 'PLANNING' }, extra || {});

/* ── непересекающиеся правки ─────────────────────────────────────────────── */

test('разные записи истории: обе правки выживают', () => {
  const base   = [rec('s1'), rec('s2')];
  const mine   = [rec('s1', { goal: 'моя' }), rec('s2')];
  const theirs = [rec('s1'), rec('s2', { goal: 'их' })];
  const r = M.merge(base, mine, theirs);
  assert.ok(r.ok, 'слияние должно пройти: правили разные записи');
  const byId = Object.fromEntries(r.result.map((x) => [x.sprintId, x]));
  assert.strictEqual(byId.s1.goal, 'моя');
  assert.strictEqual(byId.s2.goal, 'их');
});

test('разные роли состава: обе правки выживают', () => {
  const base   = { ba: [{ issueId: 'A-1' }], dev: [{ issueId: 'D-1' }] };
  const mine   = { ba: [{ issueId: 'A-1', estimate_ba: 5 }], dev: [{ issueId: 'D-1' }] };
  const theirs = { ba: [{ issueId: 'A-1' }], dev: [{ issueId: 'D-1', estimate_dev: 8 }] };
  const r = M.merge(base, mine, theirs);
  assert.ok(r.ok);
  assert.strictEqual(r.result.ba[0].estimate_ba, 5);
  assert.strictEqual(r.result.dev[0].estimate_dev, 8);
});

test('разные исполнители внутри одной записи: сливается по логину', () => {
  const pp = (m) => [rec('s1', { personalPlanning: { resourcesByAssignee: m } })];
  const r = M.merge(pp({ ivan: 10, petr: 10 }), pp({ ivan: 12, petr: 10 }), pp({ ivan: 10, petr: 7 }));
  assert.ok(r.ok);
  assert.deepStrictEqual(r.result[0].personalPlanning.resourcesByAssignee, { ivan: 12, petr: 7 });
});

test('новые записи с обеих сторон: обе в результате, мои — в голове', () => {
  const base   = [rec('s1')];
  const mine   = [rec('m1'), rec('s1')];
  const theirs = [rec('t1'), rec('s1')];
  const r = M.merge(base, mine, theirs);
  assert.ok(r.ok);
  assert.deepStrictEqual(r.result.map((x) => x.sprintId), ['m1', 't1', 's1']);
});

/* ── пересечение = честный отказ ─────────────────────────────────────────── */

test('одно поле одной записи, разные значения → conflict', () => {
  const r = M.merge([rec('s1')], [rec('s1', { goal: 'моя' })], [rec('s1', { goal: 'их' })]);
  assert.strictEqual(r.ok, false);
  assert.ok(r.conflicts.some((c) => c.indexOf('goal') >= 0), 'путь конфликта называет поле: ' + r.conflicts);
});

test('они удалили запись, которую я правил → conflict', () => {
  const r = M.merge([rec('s1'), rec('s2')], [rec('s1'), rec('s2', { goal: 'моя' })], [rec('s1')]);
  assert.strictEqual(r.ok, false);
});

test('я удалил запись, которую они правили → conflict', () => {
  const r = M.merge([rec('s1'), rec('s2')], [rec('s1')], [rec('s1'), rec('s2', { goal: 'их' })]);
  assert.strictEqual(r.ok, false);
});

/* ── удаления, которые сливаются ──────────────────────────────────────────── */

test('они удалили запись, которую я не трогал → удаление принимается', () => {
  const r = M.merge([rec('s1'), rec('s2')], [rec('s1'), rec('s2')], [rec('s1')]);
  assert.ok(r.ok);
  assert.deepStrictEqual(r.result.map((x) => x.sprintId), ['s1']);
});

test('пустая карта отсутствий у них при непустой базе — удаление, а не «нет факта»', () => {
  const r = M.merge({ ivan: [{ from: 1, to: 2 }] }, { ivan: [{ from: 1, to: 2 }] }, {});
  assert.ok(r.ok);
  assert.deepStrictEqual(r.result, {});
});

test('я добавил человека, они очистили остальное — мой добавленный выживает', () => {
  const r = M.merge({ ivan: [{ from: 1, to: 2 }] },
                    { ivan: [{ from: 1, to: 2 }], petr: [{ from: 3, to: 4 }] },
                    {});
  assert.ok(r.ok);
  assert.deepStrictEqual(Object.keys(r.result), ['petr']);
});

/* ── штампы сервера и повторное слияние ──────────────────────────────────── */

test('серверные штампы не считаются правкой', () => {
  const base   = [rec('s1', { pluginVersion: '3.0.0', updatedAt: 1, updatedBy: 'a' })];
  const mine   = [rec('s1', { pluginVersion: '3.0.0', updatedAt: 1, updatedBy: 'a', goal: 'моя' })];
  const theirs = [rec('s1', { pluginVersion: '3.33.0', updatedAt: 999, updatedBy: 'b' })];
  const r = M.merge(base, mine, theirs);
  assert.ok(r.ok, 'разошлись только штампы + моё новое поле');
  assert.strictEqual(r.result[0].goal, 'моя');
});

test('повторное слияние: моя прошлая merge-запись уже у них — не конфликт', () => {
  /* Вкладка после слияния намеренно остаётся на доконфликтных rev+базе, поэтому
     следующая запись сравнивается с той же базой, а чужая сторона уже несёт мою
     прошлую правку. Это должно сливаться, а не отказывать. */
  const base   = [rec('s1')];
  const mine   = [rec('s1', { goal: 'моя', notes: 'вторая правка' })];
  const theirs = [rec('s1', { goal: 'моя', status: 'ALLOCATED' })];
  const r = M.merge(base, mine, theirs);
  assert.ok(r.ok, String(r.conflicts));
  assert.strictEqual(r.result[0].goal, 'моя');
  assert.strictEqual(r.result[0].notes, 'вторая правка');
  assert.strictEqual(r.result[0].status, 'ALLOCATED');
});

/* ── вырожденные входы ───────────────────────────────────────────────────── */

test('я ничего не менял → берём чужое целиком', () => {
  const base = [rec('s1')];
  const r = M.merge(base, [rec('s1')], [rec('s1', { goal: 'их' })]);
  assert.ok(r.ok);
  assert.strictEqual(r.result[0].goal, 'их');
});

test('массив без общего идентификатора сравнивается целиком → conflict', () => {
  const r = M.merge([1, 2], [1, 2, 3], [1, 2, 4]);
  assert.strictEqual(r.ok, false);
});

test('id вида __proto__ не уводит в прототип', () => {
  const base   = [{ id: 'a' }];
  const mine   = [{ id: 'a' }, { id: '__proto__', name: 'моя' }];
  const theirs = [{ id: 'a', name: 'их' }];
  const r = M.merge(base, mine, theirs);
  assert.ok(r.ok, String(r.conflicts));
  assert.deepStrictEqual(r.result.map((x) => x.id).sort(), ['__proto__', 'a']);
  assert.strictEqual({}.name, undefined, 'прототип Object не должен быть загрязнён');
});

test('база отсутствует у ключа, значения разные → conflict (обе стороны добавили своё)', () => {
  const r = M.merge({}, { ivan: [{ from: 1, to: 2 }] }, { ivan: [{ from: 5, to: 6 }] });
  assert.strictEqual(r.ok, false);
});
