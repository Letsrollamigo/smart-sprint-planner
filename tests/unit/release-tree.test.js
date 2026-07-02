/* release-tree-pure.buildReleaseTree — self-check дерева состава релиза (#48 R3.2, US-R3-04).
 * Иерархия/orphans/циклы/мульти-родитель/агрегат по листьям/легаси-плоско.
 * Запуск: node --test 'tests/unit/release-tree.test.js'. */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { buildReleaseTree } = require('../../widgets/main/src/pure/release-tree-pure.js');

const it = (id, over) => Object.assign({ id, summary: 's ' + id, state: 'In Progress', zone: 'yellow', type: '', parents: [] }, over);

test('иерархия: DFS-порядок эпик→стори→таски, depth/ancestors/hasChildren; orphan-хвост', () => {
  const { rows, hasHierarchy } = buildReleaseTree([
    it('E-1', { type: 'Epic' }),
    it('S-1', { parents: ['E-1'], type: 'User Story' }),
    it('T-1', { parents: ['S-1'], zone: 'green' }),
    it('T-2', { parents: ['S-1'], zone: 'green' }),
    it('T-9'), // без родителя в составе → orphan
  ]);
  assert.strictEqual(hasHierarchy, true);
  assert.deepStrictEqual(rows.map((r) => r.id), ['E-1', 'S-1', 'T-1', 'T-2', 'T-9']);
  assert.deepStrictEqual(rows.map((r) => r.depth), [0, 1, 2, 2, 0]);
  assert.deepStrictEqual(rows.map((r) => r.orphan), [false, false, false, false, true]);
  assert.deepStrictEqual(rows[2].ancestors, ['E-1', 'S-1']);
  assert.strictEqual(rows[0].hasChildren, true);
  assert.strictEqual(rows[4].hasChildren, false);
});

test('агрегат — по ЛИСТЬЯМ поддерева (промежуточная стори не считается), у листьев agg=null', () => {
  const { rows } = buildReleaseTree([
    it('E-1'),
    it('S-1', { parents: ['E-1'] }),
    it('T-1', { parents: ['S-1'], zone: 'green' }),
    it('T-2', { parents: ['S-1'], zone: 'green' }),
    it('T-3', { parents: ['E-1'], zone: 'yellow' }), // лист прямо под эпиком
  ]);
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.deepStrictEqual(byId['E-1'].agg, { green: 2, yellow: 1, red: 0, grey: 0, total: 3 });
  assert.deepStrictEqual(byId['S-1'].agg, { green: 2, yellow: 0, red: 0, grey: 0, total: 2 });
  assert.strictEqual(byId['T-1'].agg, null);
});

test('родитель ВНЕ состава игнорируется; мульти-родитель — первый, который в составе', () => {
  const { rows, hasHierarchy } = buildReleaseTree([
    it('A', { parents: ['OUTSIDE-1'] }),          // родитель вне состава → orphan
    it('B'),
    it('C', { parents: ['OUTSIDE-1', 'B'] }),     // первый в составе — B
  ]);
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.strictEqual(hasHierarchy, true);
  assert.deepStrictEqual(byId['C'].ancestors, ['B']);
  assert.strictEqual(byId['A'].orphan, true);
  assert.strictEqual(byId['A'].depth, 0);
});

test('цикл parent-ссылок рвётся (все узлы отрисованы ровно один раз)', () => {
  const { rows } = buildReleaseTree([
    it('A', { parents: ['B'] }),
    it('B', { parents: ['A'] }),
    it('C', { parents: ['B'] }),
  ]);
  assert.deepStrictEqual(rows.map((r) => r.id).sort(), ['A', 'B', 'C']);
  // ребро A→B порвано (A первым детектит цикл) → A корень, B под A, C под B
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.strictEqual(byId['A'].depth, 0);
  assert.deepStrictEqual(byId['B'].ancestors, ['A']);
});

test('легаси/плоский состав (никто никому не родитель): hasHierarchy=false, orphan=false у всех', () => {
  const { rows, hasHierarchy } = buildReleaseTree([it('X-1'), it('X-2', { parents: ['OUT-9'] })]);
  assert.strictEqual(hasHierarchy, false);
  assert.deepStrictEqual(rows.map((r) => r.orphan), [false, false]);
  assert.deepStrictEqual(rows.map((r) => r.depth), [0, 0]);
});

test('битые/пустые входы: null, элементы без id — не падает', () => {
  assert.deepStrictEqual(buildReleaseTree(null), { rows: [], hasHierarchy: false });
  assert.deepStrictEqual(buildReleaseTree([null, { summary: 'no id' }]).rows, []);
  const one = buildReleaseTree([{ id: 'A' }]).rows[0]; // дефолты полей
  assert.deepStrictEqual(one, { id: 'A', summary: '', state: '', zone: 'grey', type: '', depth: 0, hasChildren: false, ancestors: [], orphan: false, agg: null });
});

test('самоссылка (id в своих parents) игнорируется', () => {
  const { rows, hasHierarchy } = buildReleaseTree([it('A', { parents: ['A'] })]);
  assert.strictEqual(hasHierarchy, false);
  assert.strictEqual(rows[0].depth, 0);
});
