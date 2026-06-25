'use strict';
/* #21 слайс 4 — unit на раскладку «→ в спринт» (domain/backlog-assign.js).
   Покрывает: форму item (whitelist + динамические ключи), INC_PLANNED, мульти-роль,
   идемпотентность (дубль роли пропускается), пустой выбор, персист (markDirty/draftSet/
   apiPost) + render-хуки после сохранения, и построение props модалки (преселект по зоне,
   остаток/«нужна оценка»). */

const test = require('node:test');
const assert = require('node:assert');
const ASSIGN = require('../../widgets/main/src/domain/backlog-assign.js');

function makeDeps(over) {
  const calls = { toast: [], markDirty: [], draftSet: [], apiPost: [], render: [], updateRem: [], refreshEst: [], openModal: [], diag: [] };
  const roleItems = (over && over.roleItems) || {};
  const deps = {
    t: (k) => k,
    toast: (m) => calls.toast.push(m),
    diag: (m) => calls.diag.push(m),
    inc: { PLANNED: 'INC_PLANNED' },
    ytBase: 'https://yt.example',
    currentUser: { login: 'olear' },
    draftVersion: 9,
    baseRevHash: 'HASH',
    sprint: { sprintId: 'S1' },
    roleItems: roleItems,
    settings: (over && over.settings) || { backlogZones: [] },
    backlogPool: (over && over.backlogPool) || [],
    getActiveRoles: (over && over.getActiveRoles) || (() => []),
    roleLabel: (r) => 'L:' + r.key,
    fmt: (m) => String(m),
    getRoleItemsArr: (rk) => { if (!roleItems[rk]) roleItems[rk] = []; return roleItems[rk]; },
    openModal: (spec) => { calls.openModal.push(spec); return { close() {} }; },
    apiPost: (path, body) => { calls.apiPost.push({ path, body }); return Promise.resolve(); },
    markDirty: (w) => calls.markDirty.push(w),
    draftSet: (k, v) => calls.draftSet.push({ k, v }),
    renderRoleComposition: (rk) => calls.render.push(rk),
    updateRoleRemaining: (rk) => calls.updateRem.push(rk),
    refreshRoleEstimates: (rk) => calls.refreshEst.push(rk),
  };
  return { deps, calls, roleItems };
}

const TASK = { issueId: 'TST-1', idReadable: 'TST-1', summary: 'Do thing', system: 'УТ', priority: 'High', stateName: 'В разработке' };

test('assignToSprint: один item с верной формой + INC_PLANNED + динамические ключи', () => {
  const { deps, roleItems } = makeDeps();
  const n = ASSIGN.assignToSprint(TASK, ['devBack'], deps);
  assert.strictEqual(n, 1);
  const arr = roleItems.devBack;
  assert.strictEqual(arr.length, 1);
  const it = arr[0];
  assert.strictEqual(it.issueId, 'TST-1');
  assert.strictEqual(it.url, 'https://yt.example/issue/TST-1');
  assert.strictEqual(it.title, 'Do thing');
  assert.strictEqual(it.state, 'В разработке');
  assert.strictEqual(it.system, 'УТ');
  assert.strictEqual(it.priority, 'High');
  assert.strictEqual(it.inclusionStatus, 'INC_PLANNED');
  assert.strictEqual(it.addedBy, 'olear');
  assert.strictEqual(typeof it.addedAt, 'number');
  assert.ok('estimate_devBack' in it && it.estimate_devBack === null);
  assert.ok('fact_devBack' in it && it.fact_devBack === null);
  assert.ok('alloc_devBack' in it && it.alloc_devBack === null);
});

test('assignToSprint: мульти-роль — item в каждую роль, возвращает кол-во ролей', () => {
  const { deps, roleItems } = makeDeps();
  const n = ASSIGN.assignToSprint(TASK, ['devBack', 'testing'], deps);
  assert.strictEqual(n, 2);
  assert.strictEqual(roleItems.devBack.length, 1);
  assert.strictEqual(roleItems.testing.length, 1);
});

test('assignToSprint: идемпотентность — задача уже в роли пропускается', () => {
  const { deps, roleItems, calls } = makeDeps({ roleItems: { devBack: [{ issueId: 'TST-1' }] } });
  const n = ASSIGN.assignToSprint(TASK, ['devBack'], deps);
  assert.strictEqual(n, 0);
  assert.strictEqual(roleItems.devBack.length, 1); // не задвоилось
  assert.deepStrictEqual(calls.toast, ['backlogAssignAlready']);
  assert.deepStrictEqual(calls.apiPost, []); // нет добавлений → не сохраняем
});

test('assignToSprint: частичный дубль — добавляется только новая роль', () => {
  const { deps, roleItems } = makeDeps({ roleItems: { devBack: [{ issueId: 'TST-1' }] } });
  const n = ASSIGN.assignToSprint(TASK, ['devBack', 'testing'], deps);
  assert.strictEqual(n, 1);
  assert.strictEqual(roleItems.devBack.length, 1);
  assert.strictEqual(roleItems.testing.length, 1);
});

test('assignToSprint: пустой выбор ролей → 0 + тост needRole', () => {
  const { deps, calls } = makeDeps();
  const n = ASSIGN.assignToSprint(TASK, [], deps);
  assert.strictEqual(n, 0);
  assert.deepStrictEqual(calls.toast, ['backlogAssignNeedRole']);
});

test('assignToSprint: персист + render-хуки после сохранения', async () => {
  const { deps, calls } = makeDeps();
  ASSIGN.assignToSprint(TASK, ['devBack'], deps);
  assert.deepStrictEqual(calls.markDirty, ['roleItems']);
  assert.strictEqual(calls.draftSet.length, 2); // roleItems + meta
  assert.strictEqual(calls.apiPost.length, 1);
  assert.strictEqual(calls.apiPost[0].path, 'sprint-data');
  await Promise.resolve(); await Promise.resolve(); // дать .then() отработать
  assert.deepStrictEqual(calls.render, ['devBack']);
  assert.deepStrictEqual(calls.updateRem, ['devBack']);
  assert.deepStrictEqual(calls.refreshEst, ['devBack']);
  assert.ok(calls.toast.some((m) => m.indexOf('backlogAssignDone') === 0));
});

test('openAssignModal: нет спринта → блок + тост, модалка не открывается', () => {
  const { deps, calls } = makeDeps({ backlogPool: [TASK] });
  deps.sprint = null;
  ASSIGN.openAssignModal('TST-1', deps);
  assert.deepStrictEqual(calls.toast, ['backlogAssignNoSprint']);
  assert.strictEqual(calls.openModal.length, 0);
});

test('openAssignModal: задачи нет в пуле → diag, модалка не открывается', () => {
  const { deps, calls } = makeDeps({ backlogPool: [] });
  ASSIGN.openAssignModal('NOPE-1', deps);
  assert.strictEqual(calls.openModal.length, 0);
  assert.strictEqual(calls.diag.length, 1);
});

test('openAssignModal: преселект по зоне + остаток/нужна-оценка в props', () => {
  const { deps, calls } = makeDeps({
    backlogPool: [Object.assign({}, TASK, { estByRole: { devBack: 480, testing: null }, factByRole: { devBack: 180 } })],
    settings: { backlogZones: [{ state: 'В разработке', roles: ['devBack'] }] },
    getActiveRoles: () => [{ key: 'devBack' }, { key: 'testing' }],
  });
  ASSIGN.openAssignModal('TST-1', deps);
  assert.strictEqual(calls.openModal.length, 1);
  const props = calls.openModal[0].body.props;
  assert.strictEqual(calls.openModal[0].body.name, 'backlogAssign');
  const byKey = {}; props.roles.forEach((r) => { byKey[r.key] = r; });
  assert.strictEqual(byKey.devBack.preselected, true);  // роль зоны
  assert.strictEqual(byKey.devBack.rem, 300);           // 480 − 180
  assert.strictEqual(byKey.devBack.needsPoker, false);
  assert.strictEqual(byKey.testing.preselected, false); // не в зоне
  assert.strictEqual(byKey.testing.needsPoker, true);   // нет оценки
  assert.strictEqual(byKey.testing.rem, null);
});
