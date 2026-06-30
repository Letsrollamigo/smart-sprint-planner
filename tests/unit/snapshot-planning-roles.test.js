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
    apiPost: (p, body) => { posts.push({ path: p, body: JSON.parse(JSON.stringify(body)) }); return Promise.resolve(); },
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
  assert.strictEqual(posts.length, 1);                   // ровно один POST history (батч)
  assert.strictEqual(posts[0].path, 'history');
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
