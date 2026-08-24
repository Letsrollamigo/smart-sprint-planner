'use strict';
/* #71 — матрица «группа × полномочие» (pure/permissions-matrix-pure.js).
   Инварианты SPEC §2: I1 (строки из сохранённых слотов, живой список только обогащает),
   I2 (round-trip без правок byte-identical), I3 (хранимые имена не освежаются),
   I5 (добавление в конец / снятие splice'ом по индексу), плюс дедуп пикера,
   счётчик прав для модалки, удаление строки из всех слотов и пустые обязательные колонки. */

const test = require('node:test');
const assert = require('node:assert');
const PURE = require('../../widgets/main/src/pure/permissions-matrix-pure.js');

/* Стейт формы в том виде, в каком его держит settings-form.jsx: три независимых
   useState-бакета, в каждом слоты {ids,names}. */
function makeState() {
  const g = (ids, names) => ({ ids: ids.slice(), names: names.slice() });
  return {
    groups: {
      planning:   g(['g1'], ['Аналитики']),
      val:        g(['g2', 'g1'], ['Разработчики', 'Аналитики']),
      edit:       g(['g2'], ['Разработчики']),
      histClear:  g([], []),
      assigner:   g(['g3'], ['Руководители']),
      sprintLock: g([], []),
    },
    release: {
      candMgr:   g(['g3'], ['Руководители']),
      candEng:   g([], []),
      rightsMgr: g(['g9'], ['Удалённая в YT']),
      rightsEng: g([], []),
    },
    reporting: {
      groupsA: g(['g1'], ['Аналитики']),
      groupsB: g([], []),
    },
  };
}

const LIVE = [
  { id: 'g1', name: 'Аналитики' },
  { id: 'g2', name: 'Разработчики (переименованы)' },
  { id: 'g3', name: 'Руководители' },
  { id: 'g4', name: 'Все пользователи', allUsersGroup: true },
];

/* Сериализация всех 24 массивов — эталон round-trip'а I2. */
function serialize(state) {
  return PURE.PERMISSION_COLUMNS.map((c) => {
    const s = state[c.bucket][c.key];
    return c.id + '|' + s.ids.join(',') + '|' + s.names.join(',');
  }).join('\n');
}

/* Применение патча одного слота — так же, как это делает JSX (setGroup/setRel/setRep). */
function applySlot(state, colId, slot) {
  const c = PURE.columnById(colId);
  const next = Object.assign({}, state);
  next[c.bucket] = Object.assign({}, state[c.bucket], { [c.key]: slot });
  return next;
}

test('I1: строки строятся из сохранённых слотов — живой список не фильтрует', () => {
  const rows = PURE.buildRows(makeState(), LIVE);
  assert.deepStrictEqual(rows.map((r) => r.id), ['g1', 'g2', 'g3', 'g9']);
  /* g9 удалена в YouTrack — строка на месте, помечена сиротой, права не потеряны. */
  const orphan = rows.find((r) => r.id === 'g9');
  assert.strictEqual(orphan.orphan, true);
  assert.strictEqual(PURE.isChecked(makeState(), orphan, 'rightsMgr'), true);
  /* g4 живёт в YouTrack, но ни в одном слоте — строкой не становится. */
  assert.strictEqual(rows.some((r) => r.id === 'g4'), false);
});

test('I1: порядок строк — первое появление при обходе колонок', () => {
  const st = makeState();
  /* g3 впервые встречается в assigner (5-я колонка), g9 — в rightsMgr (9-я). */
  const rows = PURE.buildRows(st, LIVE);
  assert.ok(rows.findIndex((r) => r.id === 'g1') < rows.findIndex((r) => r.id === 'g2'));
  assert.ok(rows.findIndex((r) => r.id === 'g3') < rows.findIndex((r) => r.id === 'g9'));
});

test('I1: маркеров нет, пока список групп не загружен (пустой = мог упасть запрос)', () => {
  const rows = PURE.buildRows(makeState(), []);
  assert.strictEqual(rows.length, 4);
  assert.strictEqual(rows.every((r) => r.orphan === false), true);
  assert.strictEqual(rows.every((r) => r.allUsers === false), true);
});

test('I2: round-trip без правок — все 24 массива byte-identical', () => {
  const st = makeState();
  const before = serialize(st);
  /* Полный цикл представления: построить строки, прочитать каждую ячейку. */
  const rows = PURE.buildRows(st, LIVE);
  rows.forEach((r) => PURE.PERMISSION_COLUMNS.forEach((c) => PURE.isChecked(st, r, c.id)));
  assert.strictEqual(serialize(st), before);
  assert.strictEqual(serialize(makeState()), before);
});

test('I3: хранимые имена не освежаются из живого списка', () => {
  const st = makeState();
  const rows = PURE.buildRows(st, LIVE);
  const g2 = rows.find((r) => r.id === 'g2');
  /* В YT группа переименована — показываем свежее, храним прежнее. */
  assert.strictEqual(g2.display, 'Разработчики (переименованы)');
  assert.strictEqual(g2.name, 'Разработчики');
  /* Простановка галки в другой слот пишет ХРАНИМОЕ имя, не свежее. */
  const res = PURE.toggleCell(st, g2, 'histClear');
  assert.deepStrictEqual(res.slot, { ids: ['g2'], names: ['Разработчики'] });
});

test('I5: галка ставится в конец слота, снимается splice по индексу', () => {
  let st = makeState();
  const rows = PURE.buildRows(st, LIVE);
  const g3 = rows.find((r) => r.id === 'g3');
  /* Добавление — в конец (val уже содержит g2, g1). */
  const add = PURE.toggleCell(st, g3, 'val');
  assert.deepStrictEqual(add.slot.ids, ['g2', 'g1', 'g3']);
  assert.deepStrictEqual(add.slot.names, ['Разработчики', 'Аналитики', 'Руководители']);
  /* Снятие середины — парный splice в ids и names. */
  st = applySlot(st, 'val', add.slot);
  const g1 = rows.find((r) => r.id === 'g1');
  const rm = PURE.toggleCell(st, g1, 'val');
  assert.deepStrictEqual(rm.slot.ids, ['g2', 'g3']);
  assert.deepStrictEqual(rm.slot.names, ['Разработчики', 'Руководители']);
});

test('I5: лимит слота — overflow без изменения значения', () => {
  const ids = []; const names = [];
  for (let i = 0; i < PURE.MAX_GROUPS_PER_SLOT; i++) { ids.push('x' + i); names.push('Группа ' + i); }
  const st = makeState();
  st.groups.histClear = { ids: ids, names: names };
  const row = PURE.makeNewRow({ id: 'gNew', name: 'Новая' });
  const res = PURE.toggleCell(st, row, 'histClear');
  assert.strictEqual(res.overflow, true);
  assert.deepStrictEqual(res.slot.ids, ids);
});

test('пикер: уже добавленные группы в списке не предлагаются', () => {
  const rows = PURE.buildRows(makeState(), LIVE);
  const avail = PURE.availableGroups(LIVE, rows);
  assert.deepStrictEqual(avail.map((g) => g.id), ['g4']);
  /* Новая строка без единой галки тоже занимает слот пикера. */
  const withNew = rows.concat([PURE.makeNewRow({ id: 'g4', name: 'Все пользователи' })]);
  assert.deepStrictEqual(PURE.availableGroups(LIVE, withNew), []);
});

test('удаление строки: группа уходит из всех слотов, остальные не трогаются', () => {
  const st = makeState();
  const rows = PURE.buildRows(st, LIVE);
  const g1 = rows.find((r) => r.id === 'g1');
  assert.strictEqual(PURE.countRights(st, g1), 3); /* planning, val, repA */
  const patch = PURE.removeRow(st, g1);
  assert.deepStrictEqual(Object.keys(patch).sort(), ['groups', 'reporting']);
  assert.deepStrictEqual(Object.keys(patch.groups).sort(), ['planning', 'val']);
  assert.deepStrictEqual(patch.groups.val, { ids: ['g2'], names: ['Разработчики'] });
  assert.deepStrictEqual(patch.reporting.groupsA, { ids: [], names: [] });
  /* release не затронут — в патче его нет, ссылки на слоты остаются прежними. */
  assert.strictEqual(patch.release, undefined);
});

test('пустые обязательные колонки: только val/edit, только при пустом слоте', () => {
  const st = makeState();
  assert.deepStrictEqual(PURE.emptyRequiredColumns(st), []);
  st.groups.edit = { ids: [], names: [] };
  assert.deepStrictEqual(PURE.emptyRequiredColumns(st), ['edit']);
  st.groups.val = { ids: [], names: [] };
  assert.deepStrictEqual(PURE.emptyRequiredColumns(st), ['val', 'edit']);
  /* histClear пуст изначально — обязательной не считается. */
  assert.strictEqual(PURE.emptyRequiredColumns(st).indexOf('histClear'), -1);
});

test('legacy-запись без id живёт строкой и матчится по имени', () => {
  const st = makeState();
  st.groups.sprintLock = { ids: [''], names: ['Легаси по имени'] };
  const rows = PURE.buildRows(st, LIVE);
  const legacy = rows.find((r) => r.name === 'Легаси по имени');
  assert.ok(legacy);
  assert.strictEqual(legacy.id, '');
  assert.strictEqual(legacy.key, 'n:Легаси по имени');
  assert.strictEqual(PURE.isChecked(st, legacy, 'sprintLock'), true);
  assert.strictEqual(PURE.isChecked(st, legacy, 'val'), false);
  /* Снятие галки находит запись по имени, а не по пустому id. */
  const rm = PURE.toggleCell(st, legacy, 'sprintLock');
  assert.deepStrictEqual(rm.slot, { ids: [], names: [] });
});

test('12 колонок в трёх группах шапки — раскладка контракта', () => {
  assert.strictEqual(PURE.PERMISSION_COLUMNS.length, 12);
  const byGroup = {};
  PURE.PERMISSION_COLUMNS.forEach((c) => { byGroup[c.group] = (byGroup[c.group] || 0) + 1; });
  assert.deepStrictEqual(byGroup, { planning: 6, release: 4, reporting: 2 });
  assert.deepStrictEqual(PURE.COLUMN_GROUPS, ['planning', 'release', 'reporting']);
});
