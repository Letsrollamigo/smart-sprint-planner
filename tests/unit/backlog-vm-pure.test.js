'use strict';
/**
 * #21 слайс 2 — чистый VM-builder пула бэклога (pure/backlog-vm-pure.js).
 * Покрывает §4 (пул заказчика, без хранения), §6.1 (зоны состояние→роль(и), MANY,
 * только активные роли), §6.2/§6.3 (нужна-оценка / остаток=план−факт), §8
 * (resolved auto-hide, незамапленное→«Прочие» fail-loud, пауза по тегу/состоянию).
 */
const test   = require('node:test');
const assert = require('node:assert');
const path   = require('node:path');

const { buildBacklogVm } = require(path.join(__dirname, '..', '..', 'widgets', 'main', 'src', 'pure', 'backlog-vm-pure.js'));

const SETTINGS = {
  activeRoles: ['analysis', 'devBack', 'testing'],
  backlogStartStates: ['Open'],
  backlogZones: [
    { state: 'Analysis', roles: ['analysis'] },
    { state: 'In Dev',   roles: ['devBack', 'devFront'] }, // devFront НЕ активна → отфильтруется
    { state: 'Testing',  roles: ['testing'] },
  ],
  backlogPauseTags: ['blocked'],
  backlogPauseStates: ['Paused'],
};

function task(over) {
  return Object.assign({
    issueId: 'T-1', idReadable: 'T-1', summary: 's', stateName: 'Analysis',
    isResolved: false, system: 'Sys', priority: 'Major', tags: [],
    estByRole: {}, factByRole: {},
  }, over);
}

function zoneByState(vm, st) { return vm.zones.find(function (z) { return z.stateName === st; }); }
function roleTasks(vm, st, rk) {
  const z = zoneByState(vm, st); if (!z) return [];
  const r = z.roles.find(function (x) { return x.roleKey === rk; });
  return r ? r.tasks : [];
}

test('resolved-задача авто-скрыта (§8): не в бакетах, считается в counts.hidden', function () {
  const vm = buildBacklogVm([task({ stateName: 'Analysis', isResolved: true })], SETTINGS);
  assert.strictEqual(vm.counts.hidden, 1);
  assert.strictEqual(vm.counts.zoneTasks, 0);
  assert.strictEqual(roleTasks(vm, 'Analysis', 'analysis').length, 0);
});

test('пул заказчика (§4): стартовое состояние → customerPool, не в зонах', function () {
  const vm = buildBacklogVm([task({ stateName: 'Open' })], SETTINGS);
  assert.strictEqual(vm.customerPool.length, 1);
  assert.strictEqual(vm.customerPool[0].issueId, 'T-1');
  assert.strictEqual(vm.counts.pool, 1);
});

test('зона одной активной роли: задача под этой ролью', function () {
  const vm = buildBacklogVm([task({ stateName: 'Analysis', estByRole: { analysis: 120 }, factByRole: { analysis: 30 } })], SETTINGS);
  const rt = roleTasks(vm, 'Analysis', 'analysis');
  assert.strictEqual(rt.length, 1);
  assert.strictEqual(rt[0].est, 120);
  assert.strictEqual(rt[0].fact, 30);
  assert.strictEqual(rt[0].rem, 90);          // §6.3 остаток = план − факт
  assert.strictEqual(rt[0].needsPoker, false);
});

test('зона нескольких ролей (MANY): задача под КАЖДОЙ активной ролью; неактивная роль отфильтрована', function () {
  const vm = buildBacklogVm([task({ stateName: 'In Dev', estByRole: { devBack: 60 } })], SETTINGS);
  const z = zoneByState(vm, 'In Dev');
  assert.deepStrictEqual(z.roles.map(function (r) { return r.roleKey; }), ['devBack']); // devFront неактивна → нет
  assert.strictEqual(roleTasks(vm, 'In Dev', 'devBack').length, 1);
  assert.strictEqual(roleTasks(vm, 'In Dev', 'devFront').length, 0);
});

test('нужна покер-оценка (§6.2): нет est для роли → needsPoker=true, rem=null', function () {
  const vm = buildBacklogVm([task({ stateName: 'Analysis', estByRole: {} })], SETTINGS);
  const rt = roleTasks(vm, 'Analysis', 'analysis');
  assert.strictEqual(rt[0].needsPoker, true);
  assert.strictEqual(rt[0].rem, null);
});

test('остаток не уходит в минус: fact > est → rem = 0', function () {
  const vm = buildBacklogVm([task({ stateName: 'Analysis', estByRole: { analysis: 50 }, factByRole: { analysis: 80 } })], SETTINGS);
  assert.strictEqual(roleTasks(vm, 'Analysis', 'analysis')[0].rem, 0);
});

test('незамапленное состояние (§8 fail-loud): не resolved, не start, не в зонах → «Прочие»', function () {
  const vm = buildBacklogVm([task({ stateName: 'Лимбо' })], SETTINGS);
  assert.strictEqual(vm.otherBucket.length, 1);
  assert.strictEqual(vm.counts.other, 1);
});

test('пауза по тегу (§8): tag ∈ backlogPauseTags → isPaused, counts.paused', function () {
  const vm = buildBacklogVm([task({ stateName: 'Analysis', tags: ['blocked'] })], SETTINGS);
  assert.strictEqual(roleTasks(vm, 'Analysis', 'analysis')[0].isPaused, true);
  assert.strictEqual(vm.counts.paused, 1);
});

test('пауза по состоянию (§8): state ∈ backlogPauseStates → isPaused (и → «Прочие», т.к. не замаплено)', function () {
  const vm = buildBacklogVm([task({ stateName: 'Paused' })], SETTINGS);
  assert.strictEqual(vm.otherBucket.length, 1);
  assert.strictEqual(vm.otherBucket[0].isPaused, true);
});

test('стартовое состояние имеет приоритет над зоной (если состояние и там, и там)', function () {
  const s = Object.assign({}, SETTINGS, { backlogStartStates: ['Analysis'] });
  const vm = buildBacklogVm([task({ stateName: 'Analysis' })], s);
  assert.strictEqual(vm.customerPool.length, 1);
  assert.strictEqual(vm.counts.zoneTasks, 0);
});

test('зона только из неактивных ролей → unassigned (не теряем задачу)', function () {
  const s = Object.assign({}, SETTINGS, { backlogZones: [{ state: 'Analysis', roles: ['devFront'] }] });
  const vm = buildBacklogVm([task({ stateName: 'Analysis' })], s);
  const z = zoneByState(vm, 'Analysis');
  assert.strictEqual(z.roles.length, 0);
  assert.strictEqual(z.unassigned.length, 1);
  assert.strictEqual(vm.counts.zoneTasks, 1);
});

test('пустые/отсутствующие настройки: всё незамапленное → «Прочие», без падения', function () {
  const vm = buildBacklogVm([task({ stateName: 'Whatever' })], {});
  assert.strictEqual(vm.otherBucket.length, 1);
  assert.strictEqual(vm.zones.length, 0);
  assert.deepStrictEqual(buildBacklogVm(null, null).counts, { pool: 0, zoneTasks: 0, other: 0, hidden: 0, paused: 0 });
});

test('вход не мутируется (чистота): task без _paused-полей после вызова', function () {
  const t = task({ stateName: 'Analysis', tags: ['blocked'] });
  buildBacklogVm([t], SETTINGS);
  assert.ok(!('_paused' in t), 'input task must not be mutated');
});
