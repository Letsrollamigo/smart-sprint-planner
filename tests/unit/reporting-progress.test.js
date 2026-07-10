'use strict';

/* #50 S2 — A1 Прогресс: buildProgressRows (pure/reporting-pure.js). Задачи в целевых статусах +
 * вывод примитива + окно периода → строки «перешло в целевой статус за период». Проверяет фильтр
 * окна [from,to) (полуоткрыто), ярлык-fallback, исключение incomplete (D7), сортировку по дате ↓. */

const test = require('node:test');
const assert = require('node:assert');
const { buildProgressRows } = require('../../widgets/main/src/pure/reporting-pure.js');

const WIN = { fromTs: 1000, toTs: 2000 };
const LABELS = { 'In Progress': 'Начата разработка', 'Done': 'Выполнен релиз' };

/* Хелпер: примитив с явными transitions/noTransition/incomplete. */
function prim(transitions, noTransition, incomplete) {
  return { transitions: transitions || {}, noTransition: noTransition || [], incomplete: incomplete || [] };
}

test('переход в окне → строка с ярлыком из настроек', () => {
  const issues = [{ id: 'A-1', summary: 'x', state: 'In Progress', created: 100 }];
  const out = buildProgressRows(issues, prim({ 'A-1': { enteredAt: 1500, toState: 'In Progress' } }), [], LABELS, WIN);
  assert.strictEqual(out.rows.length, 1);
  assert.deepStrictEqual(out.rows[0], { id: 'A-1', summary: 'x', state: 'In Progress', enteredAt: 1500, label: 'Начата разработка' });
  assert.deepStrictEqual(out.incomplete, []);
});

test('переход ДО окна (enteredAt < from) → исключён', () => {
  const issues = [{ id: 'A-1', summary: 'x', state: 'Done', created: 100 }];
  const out = buildProgressRows(issues, prim({ 'A-1': { enteredAt: 500 } }), [], LABELS, WIN);
  assert.strictEqual(out.rows.length, 0);
});

test('граница окна: enteredAt == from → включён; enteredAt == to → исключён (полуоткрыто)', () => {
  const atFrom = buildProgressRows([{ id: 'F', summary: '', state: 'Done', created: 0 }],
    prim({ F: { enteredAt: 1000 } }), [], LABELS, WIN);
  assert.strictEqual(atFrom.rows.length, 1, 'from включена');
  const atTo = buildProgressRows([{ id: 'T', summary: '', state: 'Done', created: 0 }],
    prim({ T: { enteredAt: 2000 } }), [], LABELS, WIN);
  assert.strictEqual(atTo.rows.length, 0, 'to исключена');
});

test('нет перехода, но created в окне → строка (created как дата входа)', () => {
  const issues = [{ id: 'A-2', summary: 'y', state: 'Done', created: 1200 }];
  const out = buildProgressRows(issues, prim({}, ['A-2']), [], LABELS, WIN);
  assert.strictEqual(out.rows.length, 1);
  assert.strictEqual(out.rows[0].enteredAt, 1200);
  assert.strictEqual(out.rows[0].label, 'Выполнен релиз');
});

test('ярлык-fallback: статус без записи в statusLabels → имя статуса', () => {
  const issues = [{ id: 'A-3', summary: '', state: 'Ready for test', created: 0 }];
  const out = buildProgressRows(issues, prim({ 'A-3': { enteredAt: 1500 } }), [], {}, WIN);
  assert.strictEqual(out.rows[0].label, 'Ready for test');
});

test('incomplete (D7) → исключён из строк, в списке incomplete', () => {
  const issues = [{ id: 'A-4', summary: '', state: 'Done', created: 1500 }];
  const out = buildProgressRows(issues, prim({}, [], ['A-4']), ['A-4'], LABELS, WIN);
  assert.strictEqual(out.rows.length, 0);
  assert.deepStrictEqual(out.incomplete, ['A-4']);
});

test('нет честной даты (нет перехода И нет created) → incomplete', () => {
  const issues = [{ id: 'A-5', summary: '', state: 'Done', created: null }];
  const out = buildProgressRows(issues, prim({}, [], []), [], LABELS, WIN);
  assert.strictEqual(out.rows.length, 0);
  assert.deepStrictEqual(out.incomplete, ['A-5']);
});

test('сортировка по дате перехода ↓ (свежие сверху)', () => {
  const issues = [
    { id: 'old', summary: '', state: 'Done', created: 0 },
    { id: 'new', summary: '', state: 'Done', created: 0 },
    { id: 'mid', summary: '', state: 'Done', created: 0 },
  ];
  const out = buildProgressRows(issues, prim({ old: { enteredAt: 1100 }, new: { enteredAt: 1900 }, mid: { enteredAt: 1500 } }), [], LABELS, WIN);
  assert.deepStrictEqual(out.rows.map((r) => r.id), ['new', 'mid', 'old']);
});

test('пустой вход → пустой результат', () => {
  const out = buildProgressRows([], prim({}), [], LABELS, WIN);
  assert.deepStrictEqual(out, { rows: [], incomplete: [] });
});
