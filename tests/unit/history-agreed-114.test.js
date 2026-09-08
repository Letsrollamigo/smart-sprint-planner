'use strict';
/* #114 — ключ снимка истории `agreed` (слепок согласованного состава роли): строгая валидация
   на записи, терпимость на чтении. Каждый негативный кейс отличается от валидного ровно одним
   полем, чтобы отказ нельзя было получить «за компанию». */

const test   = require('node:test');
const assert = require('node:assert');
const path   = require('node:path');
const fs     = require('node:fs');
const backend = require(path.join(__dirname, '..', '..', 'backend-project.js'));
const { validateHistoryForWrite, validateHistoryForRead, CURRENT_PLUGIN_VERSION } = backend;

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'snapshots', CURRENT_PLUGIN_VERSION, 'history.json');

function confirmedRec(overrides) {
  const h = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  const rec = h.find((r) => r.status === 'CONFIRMED');
  assert.ok(rec && rec.agreed, 'фикстура ' + CURRENT_PLUGIN_VERSION + ' обязана нести agreed на CONFIRMED-записи');
  return Object.assign(rec, overrides || {});
}
function withAgreed(agreed) { return [confirmedRec({ agreed })]; }

test('#114 фикстура: agreed валиден на записи и на чтении, форма компактная', () => {
  const rec = confirmedRec();
  assert.deepStrictEqual(Object.keys(rec.agreed).sort(), ['at', 'by', 'items']);
  assert.strictEqual(validateHistoryForWrite([rec]), true);
  assert.notStrictEqual(validateHistoryForRead([rec]), false);
  assert.ok(rec.agreed, 'на чтении валидный agreed остаётся');
});

test('#114 write: agreed без by и с пустым items допустим; null/отсутствие — тоже', () => {
  assert.strictEqual(validateHistoryForWrite(withAgreed({ at: 1, items: {} })), true);
  assert.strictEqual(validateHistoryForWrite(withAgreed({ at: 1, by: null, items: { 'A-1': {} } })), true);
  assert.strictEqual(validateHistoryForWrite(withAgreed(null)), true);
  assert.strictEqual(validateHistoryForWrite([confirmedRec({ agreed: undefined })]), true);
});

test('#114 write: каждое отклонение формы — отказ', () => {
  const bad = [
    ['массив вместо объекта', [1]],
    ['лишний ключ верхнего уровня', { at: 1, items: {}, note: 'x' }],
    ['at не число', { at: '1', items: {} }],
    ['at отсутствует', { items: {} }],
    ['by длиннее 200', { at: 1, by: 'x'.repeat(201), items: {} }],
    ['items массив', { at: 1, items: [] }],
    ['items отсутствует', { at: 1 }],
    ['запись задачи не объект', { at: 1, items: { 'A-1': 5 } }],
    ['лишний ключ в записи задачи', { at: 1, items: { 'A-1': { e: 1, title: 'x' } } }],
    ['e строка', { at: 1, items: { 'A-1': { e: '60' } } }],
    ['x не единица', { at: 1, items: { 'A-1': { x: 2 } } }],
    ['issueId длиннее 64', { at: 1, items: { ['I'.repeat(65)]: {} } }],
  ];
  bad.forEach(([label, agreed]) => {
    assert.strictEqual(validateHistoryForWrite(withAgreed(agreed)), false, 'должен отказать: ' + label);
  });
});

test('#114 read: битый agreed снимается с пометкой в migrationLog, запись остаётся читаемой', () => {
  const arr = withAgreed({ at: 'нечисло', items: {} });
  const res = validateHistoryForRead(arr);
  assert.notStrictEqual(res, false, 'на чтении запись не отвергается');
  assert.strictEqual(arr[0].agreed, undefined, 'битый слепок снят');
  const warn = (arr[0].migrationLog || []).find((e) => e.level === 'WARN_AGREED_DROPPED');
  assert.ok(warn && /agreed:at_invalid/.test(warn.key), 'пометка с причиной: ' + JSON.stringify(arr[0].migrationLog));
});
