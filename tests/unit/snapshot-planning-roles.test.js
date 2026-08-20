'use strict';
/**
 * Регресс прод-бага «пропадают задачи из спринта при переключении между двумя PLANNING-спринтами
 * одного проекта». Корень: PLANNING-состав живёт в общем рабочем слоте ssp_roleitems, а switch
 * реконструирует из истории — куда роль попадала только на confirm. Фикс: при уходе с рабочего
 * PLANNING-спринта снимаем весь его состав по ролям в историю (snapshotPlanningRolesToHistory).
 */
const test   = require('node:test');
const assert = require('node:assert');
const path   = require('node:path');

const WC = require(path.join(__dirname, '..', '..', 'widgets', 'main', 'src', 'domain', 'working-copy.js'));

const ROLES = [
  { key: 'analysis',    label: 'Анализ',    resKey: 'resAnalysis',    remKey: 'remAnalysis' },
  { key: 'devPlatform', label: 'Платформа', resKey: 'resDevPlatform', remKey: 'remDevPlatform' },
];

function item(id) { return { issueId: id, title: id, inclusionStatus: 'INCLUDED' }; }

function makeDeps(over) {
  over = over || {};
  const history = over.history || [];
  const roleItems = over.roleItems || { analysis: [item('A-1'), item('A-2')], devPlatform: [item('D-1')] };
  const sprint = over.sprint || { sprintId: 'S1', name: 'Sprint 1', dateStart: 1, dateEnd: 2, status: 'PLANNING' };
  const posts = [];
  const deps = {
    allRoles: ROLES,
    status: { PLANNING: 'PLANNING', CONFIRMED: 'CONFIRMED', ALLOCATED: 'ALLOCATED' },
    activeInc: ['INCLUDED'],
    deepClone: (x) => (x == null ? x : JSON.parse(JSON.stringify(x))),
    apiPost: (p, body, query) => { posts.push({ path: p, body: JSON.parse(JSON.stringify(body)), query: query || null }); return Promise.resolve(); },
    getRoleItemsArr: (rk) => roleItems[rk] || [],
    calcRemForRole: () => 0,
    getActiveRoles: () => ROLES,
    isActiveSprintRecord: () => false,
    renderHistory: () => {},
    state: {
      getSprint: () => sprint, getHistory: () => history, getCurrentUser: () => ({ login: 'u' }),
      getSettings: () => ({}), getCurrentSprintRoleRec: () => null, getCurrentRolePP: () => null,
    },
  };
  return { deps, history, posts };
}

test('snapshot: все активные роли рабочего PLANNING-спринта пишутся в историю по <sprintId>_<rk>', async () => {
  const { deps, history, posts } = makeDeps();
  await WC.snapshotPlanningRolesToHistory(deps, 'S2');   // уходим на другой спринт
  const an = history.find((h) => h.sprintId === 'S1_analysis');
  const dp = history.find((h) => h.sprintId === 'S1_devPlatform');
  assert.ok(an, 'S1_analysis записан');
  assert.strictEqual(an.items.length, 2);                // ← раньше терялись
  assert.strictEqual(dp.items.length, 1);
  /* v3.18.0 (#67 H5-editor) — канон сменился: per-role ?action=snapshot (upsert одной
     записи под editor∨validator) вместо одного full-replace POST под validator. */
  assert.strictEqual(posts.length, 2);                   // по одному снапшоту на роль
  assert.ok(posts.every((pp) => pp.path === 'history'
    && pp.query && pp.query.action === 'snapshot'
    && Array.isArray(pp.body.history) && pp.body.history.length === 1));
});

test('snapshot: существующий per-role статус сохраняется (ALLOCATED не сбрасывается в PLANNING)', async () => {
  const { deps, history } = makeDeps({
    history: [{ sprintId: 'S1_analysis', roleKey: 'analysis', status: 'ALLOCATED', items: [] }],
  });
  await WC.snapshotPlanningRolesToHistory(deps, 'S2');
  assert.strictEqual(history.find((h) => h.sprintId === 'S1_analysis').status, 'ALLOCATED');
});

test('snapshot: тот же спринт (newId === sprintId) → no-op (не уходим)', async () => {
  const { deps, history, posts } = makeDeps();
  await WC.snapshotPlanningRolesToHistory(deps, 'S1');
  assert.strictEqual(history.length, 0);
  assert.strictEqual(posts.length, 0);
});

test('ТРЕБОВАНИЕ: два PLANNING-спринта в ОДНИХ датах сосуществуют независимо (ключ=sprintId, не дата)', async () => {
  // Прод-сценарий: FPS и Факторинг с одинаковыми датами (01.07), разные UUID.
  const DATES = { dateStart: 1782864000000, dateEnd: 1785456000000 };
  const history = [];
  // Собираем FPS: уходим с него → снимок analysis:2 в историю.
  const fps = makeDeps({ history,
    sprint: Object.assign({ sprintId: 'FPS', name: 'ЗК/Факторинг FPS', status: 'PLANNING' }, DATES),
    roleItems: { analysis: [item('A-1'), item('A-2')], devPlatform: [] } });
  await WC.snapshotPlanningRolesToHistory(fps.deps, 'FAKT');
  // Собираем Факторинг (ТЕ ЖЕ даты): уходим → снимок devPlatform:1.
  const fakt = makeDeps({ history,
    sprint: Object.assign({ sprintId: 'FAKT', name: 'ЗК/Факторинг', status: 'PLANNING' }, DATES),
    roleItems: { analysis: [], devPlatform: [item('D-1')] } });
  await WC.snapshotPlanningRolesToHistory(fakt.deps, 'FPS');
  // Оба состава живут в истории независимо — одинаковые даты НЕ слили записи.
  assert.strictEqual(history.find((h) => h.sprintId === 'FPS_analysis').items.length, 2);
  assert.strictEqual(history.find((h) => h.sprintId === 'FAKT_devPlatform').items.length, 1);
});

test('snapshot: не-PLANNING спринт → no-op (ALLOCATED/CONFIRMED идут через working-copy)', async () => {
  const { deps, history, posts } = makeDeps({
    sprint: { sprintId: 'S1', name: 'x', dateStart: 1, dateEnd: 2, status: 'ALLOCATED' },
  });
  await WC.snapshotPlanningRolesToHistory(deps, 'S2');
  assert.strictEqual(history.length, 0);
  assert.strictEqual(posts.length, 0);
});

/* #56-7 — регресс прод-бага «назначения исполнителей переезжают между ролями»:
   buildRoleSnap для ЧУЖОЙ роли брал _currentRolePP текущей подвкладки целиком
   (гейт isActiveSprintRecord не сверял роль) → снап devPlatform получал PP analysis,
   реконструкция из канона затирала назначения крест-накрест (HAR: analysis↔devPlatform). */
test('snapshot: PP текущей роли попадает ТОЛЬКО в снап своей роли, чужая роль сохраняет канон', async () => {
  const curPP = {
    roleKey: 'analysis', nkcKey: 'other',
    taskAssignments: { 'A-1': { assignee: 'udumyanmv' }, 'A-2': { assignee: 'bondarenkoeb' } },
    resourcesByAssignee: {},
  };
  const dpCanonPP = { roleKey: 'devPlatform', nkcKey: 'other', taskAssignments: { 'D-1': { assignee: null } }, resourcesByAssignee: {} };
  const history = [
    { sprintId: 'S1_devPlatform', roleKey: 'devPlatform', status: 'PLANNING', name: 'Sprint 1',
      dateStart: 1, dateEnd: 2, items: [], personalPlanning: dpCanonPP },
  ];
  const { deps } = makeDeps({ history });
  deps.isActiveSprintRecord = () => true;
  deps.state.getCurrentSprintRoleRec = () => ({ sprintId: 'S1_analysis', roleKey: 'analysis' });
  deps.state.getCurrentRolePP = () => curPP;
  await WC.snapshotPlanningRolesToHistory(deps, 'S2');
  const an = history.find((h) => h.sprintId === 'S1_analysis');
  const dp = history.find((h) => h.sprintId === 'S1_devPlatform');
  // Своя роль: снап несёт актуальный _currentRolePP с назначениями.
  assert.strictEqual(an.personalPlanning.taskAssignments['A-1'].assignee, 'udumyanmv');
  // Чужая роль: НЕ заражается текущим PP — сохраняет свою канон-запись.
  assert.strictEqual(dp.personalPlanning.roleKey, 'devPlatform');
  assert.strictEqual(dp.personalPlanning.taskAssignments['A-1'], undefined);
});
