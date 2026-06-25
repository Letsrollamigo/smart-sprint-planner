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

/* ── слайс 6 — вид «Дерево» (buildTreeVm) ── */
const { buildTreeVm } = require(path.join(__dirname, '..', '..', 'widgets', 'main', 'src', 'pure', 'backlog-vm-pure.js'));

const TREE_SETTINGS = Object.assign({}, SETTINGS, {
  cascadeLevel2Values: ['Story', 'Стори'],
  cascadeLevel3Values: ['Epic', 'Эпик'],
});
function treeTask(over) { return task(Object.assign({ parent: null }, over)); }

test('buildTreeVm: группировка по родителю-контейнеру + уровень из cascadeLevel (epic=3/story=2)', function () {
  const tree = buildTreeVm([
    treeTask({ issueId: 'T-1', stateName: 'Analysis', parent: { issueId: 'E-1', summary: 'Эпик A', kind: 'Epic' } }),
    treeTask({ issueId: 'T-2', stateName: 'Testing', parent: { issueId: 'E-1', summary: 'Эпик A', kind: 'Epic' } }),
    treeTask({ issueId: 'T-3', stateName: 'In Dev', parent: { issueId: 'S-1', summary: 'Стори B', kind: 'Story' } }),
  ], TREE_SETTINGS);
  assert.strictEqual(tree.roots.length, 2);
  const e1 = tree.roots.find((c) => c.issueId === 'E-1');
  assert.strictEqual(e1.kind, 'Epic');
  assert.strictEqual(e1.level, 3);                       // epic-like
  assert.strictEqual(e1.tasks.length, 2);
  assert.strictEqual(e1.agg.count, 2);
  const s1 = tree.roots.find((c) => c.issueId === 'S-1');
  assert.strictEqual(s1.level, 2);                       // story-like
  assert.strictEqual(tree.counts.tasks, 3);
});

test('buildTreeVm: задача без родителя → orphans', function () {
  const tree = buildTreeVm([treeTask({ issueId: 'T-9', parent: null })], TREE_SETTINGS);
  assert.strictEqual(tree.roots.length, 0);
  assert.strictEqual(tree.orphans.length, 1);
  assert.strictEqual(tree.orphans[0].issueId, 'T-9');
});

test('buildTreeVm: resolved скрыт (§8), не в дереве и не в счётчике задач', function () {
  const tree = buildTreeVm([
    treeTask({ issueId: 'T-1', isResolved: true, parent: { issueId: 'E-1', summary: 'E', kind: 'Epic' } }),
    treeTask({ issueId: 'T-2', stateName: 'Analysis', parent: { issueId: 'E-1', summary: 'E', kind: 'Epic' } }),
  ], TREE_SETTINGS);
  assert.strictEqual(tree.counts.hidden, 1);
  assert.strictEqual(tree.counts.tasks, 1);
  assert.strictEqual(tree.roots[0].agg.count, 1);
});

test('buildTreeVm: зона листа — пул/маппинг/прочие (§5 точка зоны) + агрегат zones', function () {
  const tree = buildTreeVm([
    treeTask({ issueId: 'T-1', stateName: 'Open',     parent: { issueId: 'E-1', summary: 'E', kind: 'Epic' } }),   // __pool
    treeTask({ issueId: 'T-2', stateName: 'Analysis', parent: { issueId: 'E-1', summary: 'E', kind: 'Epic' } }),   // зона
    treeTask({ issueId: 'T-3', stateName: 'Limbo',    parent: { issueId: 'E-1', summary: 'E', kind: 'Epic' } }),   // __other
  ], TREE_SETTINGS);
  const c = tree.roots[0];
  const zones = {}; c.agg.zones.forEach((z) => { zones[z.zone] = z.count; });
  assert.strictEqual(zones.__pool, 1);
  assert.strictEqual(zones.Analysis, 1);
  assert.strictEqual(zones.__other, 1);
  assert.strictEqual(c.tasks.find((t) => t.issueId === 'T-2').zone, 'Analysis');
});

test('buildTreeVm: неизвестный kind → level null (не контейнер-уровень, но всё равно группирует)', function () {
  const tree = buildTreeVm([treeTask({ parent: { issueId: 'X-1', summary: 'X', kind: 'Whatever' } })], TREE_SETTINGS);
  assert.strictEqual(tree.roots[0].level, null);
  assert.strictEqual(tree.roots[0].kind, 'Whatever');
});

test('buildTreeVm: вложенность Эпик▸Стори▸Таск из parentChain + агрегат снизу вверх', function () {
  const chain = [{ issueId: 'ST-1', summary: 'Стори', kind: 'Story' }, { issueId: 'EP-1', summary: 'Эпик', kind: 'Epic' }];
  const tree = buildTreeVm([
    treeTask({ issueId: 'T-1', stateName: 'Analysis', parentChain: chain }),
    treeTask({ issueId: 'T-2', stateName: 'Testing', parentChain: chain }),
  ], TREE_SETTINGS);
  assert.strictEqual(tree.roots.length, 1);              // корень = Эпик (дальний предок)
  const epic = tree.roots[0];
  assert.strictEqual(epic.issueId, 'EP-1');
  assert.strictEqual(epic.level, 3);
  assert.strictEqual(epic.tasks.length, 0);             // у эпика нет прямых листьев
  assert.strictEqual(epic.children.length, 1);          // Стори
  const story = epic.children[0];
  assert.strictEqual(story.issueId, 'ST-1');
  assert.strictEqual(story.level, 2);
  assert.strictEqual(story.tasks.length, 2);            // оба листа — у прямого родителя (Стори)
  assert.strictEqual(epic.agg.count, 2);                // агрегат прокатился снизу вверх
  assert.strictEqual(story.agg.count, 2);
});

test('buildTreeVm: parentChain имеет приоритет; контейнер-ребёнок не дублируется в корнях', function () {
  const tree = buildTreeVm([
    treeTask({ issueId: 'T-1', stateName: 'Analysis', parentChain: [{ issueId: 'ST-1', summary: 'S', kind: 'Story' }, { issueId: 'EP-1', summary: 'E', kind: 'Epic' }] }),
    treeTask({ issueId: 'T-2', stateName: 'Analysis', parentChain: [{ issueId: 'EP-1', summary: 'E', kind: 'Epic' }] }), // прямо под эпиком
  ], TREE_SETTINGS);
  assert.strictEqual(tree.roots.length, 1);             // только Эпик-корень (Стори вложена)
  assert.strictEqual(tree.roots[0].issueId, 'EP-1');
  assert.strictEqual(tree.roots[0].tasks.length, 1);    // T-2 прямой лист эпика
  assert.strictEqual(tree.roots[0].children.length, 1); // Стори
  assert.strictEqual(tree.roots[0].agg.count, 2);       // T-1 (через стори) + T-2
});

/* ── слайс 7 — carry-over метка (carryoverLabel) ── */
const { carryoverLabel } = require(path.join(__dirname, '..', '..', 'widgets', 'main', 'src', 'pure', 'backlog-vm-pure.js'));

test('carryoverLabel: вошёл в состояние ДО старта спринта → carryover (Перенос)', function () {
  assert.strictEqual(carryoverLabel(1000, 'Dev', 5000), 'carryover');
});
test('carryoverLabel: вошёл В спринте из другого состояния → continuation (Продолжение)', function () {
  assert.strictEqual(carryoverLabel(6000, 'Dev', 5000), 'continuation');
});
test('carryoverLabel: вошёл В спринте без prev (создан) → null', function () {
  assert.strictEqual(carryoverLabel(6000, '', 5000), null);
});
test('carryoverLabel: нет sinceTs или нет даты старта → null', function () {
  assert.strictEqual(carryoverLabel(null, 'Dev', 5000), null);
  assert.strictEqual(carryoverLabel(6000, 'Dev', null), null);
});
test('buildTreeVm/buildBacklogVm: carry прокидывается в лист (через __sprintStart)', function () {
  const s = Object.assign({}, TREE_SETTINGS, { __sprintStart: 5000 });
  const t = treeTask({ issueId: 'C-1', stateName: 'Analysis', _sinceTs: 1000, _prevState: 'Open', parentChain: [{ issueId: 'EP', summary: 'E', kind: 'Epic' }] });
  const tree = buildTreeVm([t], s);
  assert.strictEqual(tree.roots[0].tasks[0].carry, 'carryover');
  const z = buildBacklogVm([task({ stateName: 'Analysis', _sinceTs: 6000, _prevState: 'Open' })], s);
  assert.strictEqual(z.zones.find((x) => x.stateName === 'Analysis').roles[0].tasks[0].carry, 'continuation');
});
