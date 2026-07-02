/* release-view.assembleSnapshot + computeZone — self-check pure-билдера слепка закрытого
 * релиза (#48 R1.5c/R3.1, US-R1-14/US-R3-03). Проверяет shape снимка, резолв представителей,
 * признак «был просрочен» и зоны/readiness светофора (авто по State + якорь mapping.planned).
 * Запуск: node --test 'tests/unit/release-snapshot.test.js'. */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const view = require('../../widgets/main/src/domain/release-view.js');

const CLOSED = Date.UTC(2026, 5, 30, 18, 42); // 30.06.2026 18:42 UTC — момент закрытия
const day = (y, m, d) => Date.UTC(y, m, d);    // UTC-полночь (как пишет release-controller)

test('shape: issues → issueId/idReadable/summary/state/zone; reps резолвятся с именами', () => {
  const rel = {
    status: 'released', plannedDate: day(2026, 5, 28), issues: ['ZUP-101', 'ZUP-104'],
    roleReps: { manager: 'ivanov', engineer: 'petrov' },
  };
  const issueData = { 'ZUP-101': { summary: 'Печатные формы', state: 'Закрыта', resolved: true }, 'ZUP-104': { summary: 'Ночные смены', state: 'Тестирование' } };
  const snap = view.assembleSnapshot(rel, issueData, { ivanov: 'Иванов А. А.', petrov: 'Петров И. С.' }, CLOSED, 'To do');

  assert.deepStrictEqual(snap.issues[0], { issueId: 'ZUP-101', idReadable: 'ZUP-101', summary: 'Печатные формы', state: 'Закрыта', zone: 'green', parentId: null, type: '' });
  assert.strictEqual(snap.issues[1].state, 'Тестирование');
  assert.strictEqual(snap.issues[1].zone, 'yellow'); // не resolved, не якорь → в работе
  assert.deepStrictEqual(snap.reps.manager, { login: 'ivanov', name: 'Иванов А. А.' });
  assert.deepStrictEqual(snap.reps.engineer, { login: 'petrov', name: 'Петров И. С.' });
  assert.strictEqual(snap.closedStatus, 'released');
  assert.strictEqual(snap.closedAt, CLOSED);
  assert.deepStrictEqual(snap.readiness, { green: 1, yellow: 1, red: 0, grey: 0 });
});

/* R3.1 — зоны в слепке замораживаются реальными (US-R3-03): resolved → green,
   якорь (mapping.planned) → red, прочее → yellow, нет данных/State → grey. */
test('R3.1 зоны слепка: green/red/yellow/grey + readiness-счётчики', () => {
  const rel = { status: 'released', issues: ['A-1', 'A-2', 'A-3', 'A-4'], roleReps: {} };
  const issueData = {
    'A-1': { summary: 'done', state: 'Готово', resolved: true },
    'A-2': { summary: 'anchor', state: 'To do', resolved: false },
    'A-3': { summary: 'wip', state: 'In Progress', resolved: false },
    // A-4 — нет данных (упавший чанк) → grey
  };
  const snap = view.assembleSnapshot(rel, issueData, {}, CLOSED, 'To do');
  assert.deepStrictEqual(snap.issues.map((t) => t.zone), ['green', 'red', 'yellow', 'grey']);
  assert.deepStrictEqual(snap.readiness, { green: 1, yellow: 1, red: 1, grey: 1 });
});

test('computeZone: приоритет resolved над якорем; пустой якорь не даёт red; нет State → grey', () => {
  assert.strictEqual(view.computeZone('To do', true, 'To do'), 'green');  // resolved бьёт якорь
  assert.strictEqual(view.computeZone('To do', false, 'To do'), 'red');
  assert.strictEqual(view.computeZone('To do', false, ''), 'yellow');     // якорь не настроен → красной зоны нет
  assert.strictEqual(view.computeZone('In Progress', false, 'To do'), 'yellow');
  assert.strictEqual(view.computeZone('', false, 'To do'), 'grey');
  assert.strictEqual(view.computeZone(null, true, 'To do'), 'grey');      // без State resolved не важен
});

test('wasOverdue: плановая ДО дня закрытия → true; в день/после → false', () => {
  const base = { status: 'released', issues: [], roleReps: {} };
  assert.strictEqual(view.assembleSnapshot(Object.assign({}, base, { plannedDate: day(2026, 5, 28) }), {}, {}, CLOSED).wasOverdue, true);
  assert.strictEqual(view.assembleSnapshot(Object.assign({}, base, { plannedDate: day(2026, 5, 30) }), {}, {}, CLOSED).wasOverdue, false); // в день закрытия — не просрочен
  assert.strictEqual(view.assembleSnapshot(Object.assign({}, base, { plannedDate: day(2026, 6, 1) }), {}, {}, CLOSED).wasOverdue, false);
  assert.strictEqual(view.assembleSnapshot(base, {}, {}, CLOSED).wasOverdue, false); // нет плановой даты
});

test('пустой состав + отсутствующие представители → пустые issues, reps=null', () => {
  const snap = view.assembleSnapshot({ status: 'cancelled', issues: [], roleReps: {} }, {}, {}, CLOSED);
  assert.deepStrictEqual(snap.issues, []);
  assert.strictEqual(snap.reps.manager, null);
  assert.strictEqual(snap.reps.engineer, null);
  assert.strictEqual(snap.closedStatus, 'cancelled');
  assert.deepStrictEqual(snap.readiness, { green: 0, yellow: 0, red: 0, grey: 0 });
});

test('осиротевшее имя (нет в repNames) → name = login', () => {
  const snap = view.assembleSnapshot({ status: 'released', issues: [], roleReps: { manager: 'ghost' } }, {}, {}, CLOSED);
  assert.deepStrictEqual(snap.reps.manager, { login: 'ghost', name: 'ghost' });
});

/* R3.2 (US-R3-04) — структура дерева замораживается: parentId = первый родитель В СОСТАВЕ;
   родитель вне состава / самоссылка → null; type — из данных задачи. */
test('R3.2 parentId слепка: только родитель из состава, self-parent игнорируется, type пишется', () => {
  const rel = { status: 'released', issues: ['E-1', 'T-1', 'T-2', 'T-3'], roleReps: {} };
  const issueData = {
    'E-1': { summary: 'epic', state: 'In Progress', type: 'Epic', parents: [] },
    'T-1': { summary: 'in-tree', state: 'Готово', resolved: true, parents: ['OUT-9', 'E-1'] }, // вне состава пропускается → E-1
    'T-2': { summary: 'orphan', state: 'In Progress', parents: ['OUT-9'] },                     // родитель вне состава → null
    'T-3': { summary: 'self', state: 'In Progress', parents: ['T-3'] },                         // самоссылка → null
  };
  const snap = view.assembleSnapshot(rel, issueData, {}, CLOSED, 'To do');
  assert.deepStrictEqual(snap.issues.map((t) => t.parentId), [null, 'E-1', null, null]);
  assert.strictEqual(snap.issues[0].type, 'Epic');
});
