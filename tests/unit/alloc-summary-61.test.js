'use strict';
/* #61 — сводная таблица мультиролевого планирования (pure/allocsummary-pure.js).
   Покрывает: дедуп по issueId и порядок первого вхождения, first-non-empty для
   общих полей, семантику estByRole (null «в роли без оценки» vs отсутствие ключа
   «не в роли»), сумму строки (0 — валидная оценка, все пустые → null) и
   перелимит-раскраску «красная, если хотя бы одна её роль перегружена». */

const test = require('node:test');
const assert = require('node:assert');
const PURE = require('../../widgets/main/src/pure/allocsummary-pure.js');

function makeItems() {
  return {
    back: [
      { issueId: 'A-1', title: 'Первая', priority: 'P1', url: 'https://yt/A-1', estimate_back: 120 },
      { issueId: 'A-2', title: 'Вторая', estimate_back: null },
    ],
    front: [
      { issueId: 'A-3', title: 'Третья', estimate_front: 60 },
      { issueId: 'A-1', title: '', xpriority: 'X1', estimate_front: 30 },
    ],
    qa: [
      { issueId: 'A-1', estimate_qa: 0 },
    ],
  };
}

test('#61 rows: дедуп по issueId, порядок первого вхождения, inRoles по ролям', () => {
  const rows = PURE.buildAllocSummaryRows(makeItems(), ['back', 'front', 'qa']);
  assert.deepStrictEqual(rows.map((r) => r.issueId), ['A-1', 'A-2', 'A-3']);
  assert.deepStrictEqual(rows[0].inRoles, ['back', 'front', 'qa']);
  assert.deepStrictEqual(rows[1].inRoles, ['back']);
  assert.deepStrictEqual(rows[2].inRoles, ['front']);
});

test('#61 rows: общие поля — первое непустое значение по ролям', () => {
  const rows = PURE.buildAllocSummaryRows(makeItems(), ['back', 'front', 'qa']);
  const a1 = rows[0];
  assert.strictEqual(a1.title, 'Первая');       // '' из front не затирает
  assert.strictEqual(a1.priority, 'P1');
  assert.strictEqual(a1.xpriority, 'X1');       // дозаполнено из front
  assert.strictEqual(a1.url, 'https://yt/A-1');
});

test('#61 rows: estByRole различает «в роли без оценки» и «не в роли»; сумма с нулём', () => {
  const rows = PURE.buildAllocSummaryRows(makeItems(), ['back', 'front', 'qa']);
  const a1 = rows[0], a2 = rows[1];
  assert.deepStrictEqual(a1.estByRole, { back: 120, front: 30, qa: 0 });
  assert.strictEqual(a1.estSum, 150);           // 0 от qa суммы не ломает
  assert.deepStrictEqual(a2.estByRole, { back: null });
  assert.strictEqual('front' in a2.estByRole, false);
  assert.strictEqual(a2.estSum, null);          // ни одной оценки → null, не 0
});

test('#61 rows: неактивные роли и мусор игнорируются', () => {
  const items = makeItems();
  items.ghost = [{ issueId: 'A-9' }];
  items.broken = 'not-an-array';
  items.back.push(null, { noIssueId: true });
  const rows = PURE.buildAllocSummaryRows(items, ['back', 'front']);
  assert.deepStrictEqual(rows.map((r) => r.issueId), ['A-1', 'A-2', 'A-3']);
  assert.strictEqual(rows[0].estByRole.qa, undefined);   // qa не активна → колонки нет
});

test('#61 overlimit: красная, если хотя бы одна роль строки перегружена', () => {
  const rows = PURE.buildAllocSummaryRows(makeItems(), ['back', 'front', 'qa']);
  PURE.markOverlimitRows(rows, { front: true });
  assert.strictEqual(rows[0].isOver, true);     // A-1 есть во front
  assert.strictEqual(rows[1].isOver, false);    // A-2 только back
  assert.strictEqual(rows[2].isOver, true);     // A-3 только front
  PURE.markOverlimitRows(rows, {});
  assert.deepStrictEqual(rows.map((r) => r.isOver), [false, false, false]);
});
