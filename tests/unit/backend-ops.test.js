'use strict';

/* #113 1в — мелкие операции внешнего REST (backend-ops.js).
 * Дельты — чистые функции (создание, слияние, «не найдено», пустой блоб). Сквозные тесты идут
 * через НАСТОЯЩИЙ обработчик пути из core.ENDPOINTS: делегация → дельта → адаптер ctx →
 * штатная полная запись. Проверяется записанный блоб, applied, 409 на чужом baseRev,
 * 403 без прав, наследование cid.
 * Запуск: node --test 'tests/unit/backend-ops.test.js'. */

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const core = require(path.join(__dirname, '..', '..', 'backend-project.js'));
const ops = require(path.join(__dirname, '..', '..', 'backend-ops.js'));

function ep(p) { return core.ENDPOINTS.find((e) => e.method === 'POST' && e.path === p); }
function withWarn(fn) {
  const lines = []; const orig = console.warn; console.warn = (m) => lines.push(String(m));
  try { fn(); } finally { console.warn = orig; }
  return lines;
}

const SETTINGS = JSON.stringify({ editGroups: ['g-admin'], validationGroups: ['g-admin'], activeRoles: ['analysis'] });
const SPRINT = { sprintId: 'S-1', name: 'Спринт', status: 'PLANNING', dateStart: 1779148800000, dateEnd: 1780358400000,
  updatedBy: 'user1', updatedAt: 1779148800000, personalPlanning: {}, _rev: 4 };
const ITEM = { issueId: 'SCBT-1', title: 'Задача', inclusionStatus: 'INC_PLANNED', estimate_analysis: 8 };
const REL = { id: 'R-1', name: 'v1.0', kind: 'release', source: 'internal', status: 'planned', plannedDate: 1750000000000,
  freezeLocked: false, roleReps: { manager: '1-1', engineer: '1-2' }, issues: ['DEMO-1'] };
const ABS = { from: '2026-07-01', to: '2026-07-05', type: 'vacation' };
/* Канон персонального распределения — записи ролей в истории (`<sprintId>_<roleKey>`). */
function histRec(rk, pp) {
  return { sprintId: 'S-1_' + rk, roleKey: rk, name: 'Спринт', status: 'PLANNING', dateStart: SPRINT.dateStart, dateEnd: SPRINT.dateEnd,
    personalPlanning: pp };
}
const PP_ANALYSIS = { resourcesByAssignee: { ivanov: { assigneeName: 'Иванов И.' } },
  taskAssignments: { 'SCBT-1': { assignee: 'petrov', assigneeName: 'petrov', ganttColor: '#fff', dateStart: 1779148800000 } } };
const HISTORY = [histRec('analysis', PP_ANALYSIS), histRec('testing', { taskAssignments: { 'SCBT-9': { assignee: 'sidorov' } } }),
  { sprintId: 'S-0_analysis', roleKey: 'analysis', name: 'Прошлый', status: 'FINISHED', dateStart: 1, dateEnd: 2, personalPlanning: { taskAssignments: { 'SCBT-1': { assignee: 'old' } } } }];

/* admin: группа администраторов настроек (⊃ editor, планирование, релиз-менеджер); иначе — наблюдатель. */
function mkCtx(props, body, params, admin) {
  return {
    settings: { settingsManagerGroup: { id: 'g-admin', name: 'Admins' } },
    currentUser: { id: 'u-1', login: 'user1', groups: admin === false ? [] : [{ id: 'g-admin', name: 'Admins' }], hasPermission: () => false },
    project: { key: 'SCBT', extensionProperties: props },
    request: { body: JSON.stringify(body), getParameter: (k) => (params[k] || '') },
    response: { status: 200, body: null, json(v) { this.body = v; } },
  };
}
function baseProps(over) {
  return Object.assign({
    ssp_settings: SETTINGS, ssp_sprint: JSON.stringify(SPRINT), ssp_roleitems: JSON.stringify({ analysis: [ITEM] }),
    ssp_releases: JSON.stringify({ releases: [REL] }), ssp_releases_rev: '3',
    ssp_absences: JSON.stringify({ user1: [ABS] }), ssp_absences_rev: '2',
    ssp_history: JSON.stringify(HISTORY), ssp_history_rev: '7',
  }, over || {});
}
function call(p, action, body, props, admin, extraParams) {
  const ctx = mkCtx(props, body, Object.assign({ action: action }, extraParams || {}), admin);
  ctx.lines = withWarn(() => ep(p).handle(ctx));
  return ctx;
}

/* ── Дельты ─────────────────────────────────────────────────────────────────── */

test('applyUpsertItem: создание в пустом блобе, слияние существующего, отказы полей', () => {
  const created = ops.applyUpsertItem(null, { roleKey: 'analysis', item: ITEM });
  assert.deepStrictEqual(created.next, { analysis: [ITEM] });
  assert.deepStrictEqual(created.applied, { roleKey: 'analysis', issueId: 'SCBT-1', created: true });

  const stored = { analysis: [ITEM], testing: [{ issueId: 'SCBT-9', title: 'Чужая' }] };
  const merged = ops.applyUpsertItem(stored, { roleKey: 'analysis', item: { issueId: 'SCBT-1', estimate_analysis: 13 } });
  assert.strictEqual(merged.applied.created, false);
  assert.deepStrictEqual(merged.next.analysis, [Object.assign({}, ITEM, { estimate_analysis: 13 })], 'отсутствующие ключи сохранены');
  assert.deepStrictEqual(merged.next.testing, stored.testing, 'чужая роль цела');
  assert.strictEqual(stored.analysis[0].estimate_analysis, 8, 'хранимое не мутируется');

  assert.strictEqual(ops.applyUpsertItem({}, { item: ITEM }).refuse, 'ops_field_required:roleKey');
  assert.strictEqual(ops.applyUpsertItem({}, { roleKey: 'nope', item: ITEM }).refuse, 'ops_field_invalid:roleKey');
  assert.strictEqual(ops.applyUpsertItem({}, { roleKey: '__proto__', item: ITEM }).refuse, 'ops_field_invalid:roleKey');
  assert.strictEqual(ops.applyUpsertItem({}, { roleKey: 'analysis' }).refuse, 'ops_field_required:item');
  assert.strictEqual(ops.applyUpsertItem({}, { roleKey: 'analysis', item: {} }).refuse, 'ops_field_required:issueId');
  assert.strictEqual(ops.applyUpsertItem({}, { roleKey: 'analysis', item: { issueId: '1-bad' } }).refuse, 'ops_field_invalid:issueId');
});

test('applyRemoveItem: удаление, item_not_found, пустой блоб', () => {
  const r = ops.applyRemoveItem({ analysis: [ITEM, { issueId: 'SCBT-2' }] }, { roleKey: 'analysis', issueId: 'SCBT-1' });
  assert.deepStrictEqual(r.next.analysis, [{ issueId: 'SCBT-2' }]);
  assert.deepStrictEqual(r.applied, { roleKey: 'analysis', issueId: 'SCBT-1' });
  assert.strictEqual(ops.applyRemoveItem({ analysis: [ITEM] }, { roleKey: 'analysis', issueId: 'SCBT-7' }).refuse, 'item_not_found');
  assert.strictEqual(ops.applyRemoveItem(null, { roleKey: 'analysis', issueId: 'SCBT-1' }).refuse, 'item_not_found');
  assert.strictEqual(ops.applyRemoveItem({}, { roleKey: 'analysis' }).refuse, 'ops_field_required:issueId');
});

test('applyPatchSprint: слияние части ключей, серверные ключи отброшены, чужой sprintId и пустой слот', () => {
  const r = ops.applyPatchSprint(SPRINT, { sprint: { name: 'Новое имя', sprintGoal: 'Цель', _rev: 99, updatedBy: 'x', personalPlanning: { a: 1 }, phasesEnabled: true, sprintId: 'S-1' } });
  assert.strictEqual(r.next.name, 'Новое имя');
  assert.strictEqual(r.next.sprintGoal, 'Цель');
  assert.strictEqual(r.next._rev, 4);
  assert.strictEqual(r.next.updatedBy, 'user1');
  assert.deepStrictEqual(r.next.personalPlanning, {});
  assert.ok(!('phasesEnabled' in r.next));
  assert.strictEqual(r.next.status, 'PLANNING', 'отсутствующие ключи сохранены');
  assert.deepStrictEqual(r.applied, { sprintId: 'S-1', keys: ['name', 'sprintGoal'] });
  assert.strictEqual(ops.applyPatchSprint(SPRINT, { sprint: { sprintId: 'S-2' } }).refuse, 'ops_field_invalid:sprintId');
  assert.strictEqual(ops.applyPatchSprint(null, { sprint: { name: 'x' } }).refuse, 'sprint_not_found');
  assert.strictEqual(ops.applyPatchSprint(SPRINT, {}).refuse, 'ops_field_required:sprint');
});

test('applyUpsertAbsence / applyRemoveAbsence: замена по паре from+to, пустой список логина удаляется', () => {
  const add = ops.applyUpsertAbsence(null, { login: 'user2', entry: ABS });
  assert.deepStrictEqual(add.next, { user2: [ABS] });
  assert.strictEqual(add.applied.created, true);
  const repl = ops.applyUpsertAbsence({ user1: [ABS] }, { login: 'user1', entry: Object.assign({}, ABS, { type: 'sick' }) });
  assert.strictEqual(repl.applied.created, false);
  assert.deepStrictEqual(repl.next.user1, [Object.assign({}, ABS, { type: 'sick' })]);
  assert.strictEqual(ops.applyUpsertAbsence({}, { entry: ABS }).refuse, 'ops_field_required:login');
  assert.strictEqual(ops.applyUpsertAbsence({}, { login: '__proto__', entry: ABS }).refuse, 'ops_field_invalid:login');
  assert.strictEqual(ops.applyUpsertAbsence({}, { login: 'user1' }).refuse, 'ops_field_required:entry');

  const rem = ops.applyRemoveAbsence({ user1: [ABS], user2: [ABS] }, { login: 'user1', from: ABS.from, to: ABS.to });
  assert.deepStrictEqual(rem.next, { user2: [ABS] });
  assert.strictEqual(ops.applyRemoveAbsence({ user1: [ABS] }, { login: 'user1', from: ABS.from, to: '2026-07-09' }).refuse, 'absence_not_found');
  assert.strictEqual(ops.applyRemoveAbsence(null, { login: 'user1', from: ABS.from, to: ABS.to }).refuse, 'absence_not_found');
});

test('applyUpsertPerson: в полную запись уходят только примитивы; слияние и первое сохранение', () => {
  const rec = { status: 'draft', persons: { a: { grade: 'Senior', rate: 1, participation: 1, alloc: { analysis: 1 }, base: 40, absencesApplied: [] } } };
  const r = ops.applyUpsertPerson(rec, { login: 'a', person: { rate: 0.5 } });
  assert.deepStrictEqual(r.next, { a: { grade: 'Senior', rate: 0.5, participation: 1, alloc: { analysis: 1 } } });
  assert.strictEqual(r.applied.created, false);
  const first = ops.applyUpsertPerson(null, { login: 'b', person: { grade: 'Middle' } });
  assert.deepStrictEqual(first.next, { b: { grade: 'Middle' } });
  assert.strictEqual(first.applied.created, true);
  assert.strictEqual(ops.applyUpsertPerson(null, { person: {} }).refuse, 'ops_field_required:login');
  assert.strictEqual(ops.applyUpsertPerson(null, { login: 'constructor', person: {} }).refuse, 'ops_field_invalid:login');
  assert.strictEqual(ops.applyUpsertPerson(null, { login: 'a' }).refuse, 'ops_field_required:person');
});

test('релизы: upsert по id, статус, состав — слияние, порядок без дублей, release_not_found', () => {
  const up = ops.applyUpsertRelease([REL], { release: { id: 'R-1', name: 'v1.1' } });
  assert.strictEqual(up.next[0].name, 'v1.1');
  assert.deepStrictEqual(up.next[0].issues, ['DEMO-1'], 'отсутствующие ключи сохранены');
  assert.strictEqual(up.applied.created, false);
  assert.strictEqual(ops.applyUpsertRelease(null, { release: Object.assign({}, REL, { id: 'R-2' }) }).applied.created, true);
  assert.strictEqual(ops.applyUpsertRelease([], {}).refuse, 'ops_field_required:release');
  assert.strictEqual(ops.applyUpsertRelease([], { release: { name: 'x' } }).refuse, 'ops_field_required:id');

  const st = ops.applySetReleaseStatus([REL], { id: 'R-1', status: 'released', snapshot: { closedAt: 1 } });
  assert.strictEqual(st.next[0].status, 'released');
  assert.deepStrictEqual(st.next[0].snapshot, { closedAt: 1 });
  assert.strictEqual(ops.applySetReleaseStatus([REL], { id: 'R-1', status: 'overdue' }).refuse, 'ops_field_invalid:status');
  assert.strictEqual(ops.applySetReleaseStatus([REL], { id: 'R-1' }).refuse, 'ops_field_required:status');
  assert.strictEqual(ops.applySetReleaseStatus([REL], { id: 'R-9', status: 'prep' }).refuse, 'release_not_found');

  const add = ops.applyReleaseIssues([REL], { id: 'R-1', issues: ['DEMO-2', 'DEMO-1', 'DEMO-2'] }, true);
  assert.deepStrictEqual(add.next[0].issues, ['DEMO-1', 'DEMO-2']);
  assert.deepStrictEqual(add.applied, { id: 'R-1', added: ['DEMO-2'] });
  const rem = ops.applyReleaseIssues([REL], { id: 'R-1', issues: ['DEMO-1', 'DEMO-5'] }, false);
  assert.deepStrictEqual(rem.next[0].issues, []);
  assert.deepStrictEqual(rem.applied, { id: 'R-1', removed: ['DEMO-1'] });
  assert.strictEqual(ops.applyReleaseIssues([REL], { id: 'R-1', issues: 'DEMO-1' }, true).refuse, 'ops_field_invalid:issues');
  assert.strictEqual(ops.applyReleaseIssues([REL], { id: 'R-1' }, true).refuse, 'ops_field_required:issues');
  assert.strictEqual(ops.applyReleaseIssues([REL], { id: 'R-9', issues: [] }, true).refuse, 'release_not_found');
});

test('applyAssignPerson: канон роли + зеркало по ролям спринта; ключи записи как у виджета; снятие; отказы', () => {
  const r = ops.applyAssignPerson(SPRINT, HISTORY, { roleKey: 'analysis', issueId: 'SCBT-1', login: 'ivanov', dateEnd: 1780000000000 });
  assert.strictEqual(r.recId, 'S-1_analysis');
  assert.deepStrictEqual(r.pp.taskAssignments['SCBT-1'],
    { assignee: 'ivanov', assigneeName: 'Иванов И.', dateStart: 1779148800000, dateEnd: 1780000000000 }, 'имя — из ресурсов роли, ganttColor сброшен, прежняя дата цела');
  assert.deepStrictEqual(Object.keys(r.mirror).sort(), ['analysis', 'testing'], 'зеркало — только роли ЭТОГО спринта');
  assert.strictEqual(r.mirror.analysis, r.pp);
  assert.deepStrictEqual(r.applied, { roleKey: 'analysis', issueId: 'SCBT-1', assignee: 'ivanov' });
  assert.strictEqual(HISTORY[0].personalPlanning.taskAssignments['SCBT-1'].assignee, 'petrov', 'хранимое не мутируется');

  const fresh = ops.applyAssignPerson(SPRINT, HISTORY, { roleKey: 'analysis', issueId: 'SCBT-2', login: 'newbie' });
  assert.deepStrictEqual(fresh.pp.taskAssignments['SCBT-2'], { assignee: 'newbie', assigneeName: 'newbie' });

  const off = ops.applyAssignPerson(SPRINT, HISTORY, { roleKey: 'testing', issueId: 'SCBT-9', login: null });
  assert.ok(!('SCBT-9' in off.pp.taskAssignments), 'пустая запись назначения удаляется');
  assert.deepStrictEqual(off.pp.taskAssignments, {});
  const offKeepDate = ops.applyAssignPerson(SPRINT, HISTORY, { roleKey: 'analysis', issueId: 'SCBT-1', login: null });
  assert.deepStrictEqual(offKeepDate.pp.taskAssignments['SCBT-1'], { dateStart: 1779148800000 });
  const dropDate = ops.applyAssignPerson(SPRINT, HISTORY, { roleKey: 'analysis', issueId: 'SCBT-1', login: 'petrov', dateStart: null });
  assert.ok(!('dateStart' in dropDate.pp.taskAssignments['SCBT-1']));

  const A = (b) => ops.applyAssignPerson(SPRINT, HISTORY, b).refuse;
  assert.strictEqual(A({ issueId: 'SCBT-1', login: 'a' }), 'ops_field_required:roleKey');
  assert.strictEqual(A({ roleKey: 'nope', issueId: 'SCBT-1', login: 'a' }), 'ops_field_invalid:roleKey');
  assert.strictEqual(A({ roleKey: 'analysis', login: 'a' }), 'ops_field_required:issueId');
  assert.strictEqual(A({ roleKey: 'analysis', issueId: '__proto__', login: 'a' }), 'ops_field_invalid:issueId');
  assert.strictEqual(A({ roleKey: 'analysis', issueId: 'SCBT-1' }), 'ops_field_invalid:login');
  assert.strictEqual(A({ roleKey: 'analysis', issueId: 'SCBT-1', login: '' }), 'ops_field_invalid:login');
  assert.strictEqual(A({ roleKey: 'analysis', issueId: 'SCBT-1', login: 'a', dateStart: '2026-01-01' }), 'ops_field_invalid:dateStart');
  assert.strictEqual(A({ roleKey: 'devBack', issueId: 'SCBT-1', login: 'a' }), 'role_record_not_found');
  assert.strictEqual(ops.applyAssignPerson(null, HISTORY, { roleKey: 'analysis', issueId: 'SCBT-1', login: 'a' }).refuse, 'sprint_not_found');
});

/* ── Сквозные: через настоящую полную запись ─────────────────────────────────── */

test('upsertItem: успех — блоб записан полной записью, rev вырос, applied в ответе', () => {
  const props = baseProps();
  const ctx = call('sprint-data', 'upsertItem', { roleKey: 'analysis', item: { issueId: 'SCBT-2', title: 'Вторая' }, baseRev: 4 }, props);
  assert.strictEqual(ctx.response.body.success, true, JSON.stringify(ctx.response.body));
  assert.strictEqual(ctx.response.body.action, 'upsertItem');
  assert.deepStrictEqual(ctx.response.body.applied, { roleKey: 'analysis', issueId: 'SCBT-2', created: true });
  assert.strictEqual(ctx.response.body.rev, 5);
  assert.deepStrictEqual(JSON.parse(props.ssp_roleitems).analysis.map((i) => i.issueId), ['SCBT-1', 'SCBT-2']);
  assert.strictEqual(JSON.parse(props.ssp_sprint)._rev, 5);

  const merged = call('sprint-data', 'upsertItem', { roleKey: 'analysis', item: { issueId: 'SCBT-1', estimate_analysis: 13 }, baseRev: 5 }, props);
  assert.strictEqual(merged.response.body.applied.created, false);
  const first = JSON.parse(props.ssp_roleitems).analysis[0];
  assert.strictEqual(first.estimate_analysis, 13);
  assert.strictEqual(first.title, 'Задача', 'слияние: прежние ключи задачи целы');
});

test('upsertItem: правила полной записи наследуются — невалидный ключ задачи отклоняет её валидатор', () => {
  const props = baseProps();
  const before = props.ssp_roleitems;
  const ctx = call('sprint-data', 'upsertItem', { roleKey: 'analysis', item: { issueId: 'SCBT-2', title: 'x', hacked: 1 }, baseRev: 4 }, props);
  assert.strictEqual(ctx.response.status, 400);
  assert.strictEqual(ctx.response.body.reason, 'invalid_role_items_structure');
  assert.strictEqual(props.ssp_roleitems, before);
});

test('каждая операция слота: чужой baseRev → 409 rev_conflict с текущим rev, блоб цел; без числа → base_rev_required', () => {
  const cases = [
    ['sprint-data', 'upsertItem', { roleKey: 'analysis', item: ITEM }, 4],
    ['sprint-data', 'removeItem', { roleKey: 'analysis', issueId: 'SCBT-1' }, 4],
    ['sprint-data', 'patchSprint', { sprint: { name: 'x' } }, 4],
    ['sprint-data', 'assignPerson', { roleKey: 'analysis', issueId: 'SCBT-1', login: 'ivanov' }, 4],
    ['absences', 'upsertAbsence', { login: 'user1', entry: ABS }, 2],
    ['absences', 'removeAbsence', { login: 'user1', from: ABS.from, to: ABS.to }, 2],
    ['releases', 'upsertRelease', { release: REL }, 3],
    ['releases', 'setReleaseStatus', { id: 'R-1', status: 'prep' }, 3],
    ['releases', 'addReleaseIssues', { id: 'R-1', issues: ['DEMO-2'] }, 3],
    ['releases', 'removeReleaseIssues', { id: 'R-1', issues: ['DEMO-1'] }, 3],
  ];
  for (const [p, action, body, rev] of cases) {
    const props = baseProps();
    const before = JSON.stringify(props);
    const stale = call(p, action, Object.assign({ baseRev: rev - 1 }, body), props);
    assert.strictEqual(stale.response.status, 409, action);
    assert.strictEqual(stale.response.body.error, 'rev_conflict', action);
    assert.strictEqual(stale.response.body.rev, rev, action);
    assert.strictEqual(stale.lines.length, 1, action + ': одна строка лога отказа');
    const noRev = call(p, action, body, props);
    assert.strictEqual(noRev.response.body.reason, 'base_rev_required', action);
    assert.strictEqual(JSON.stringify(props), before, action + ': блобы не тронуты');
  }
});

test('каждая операция: без прав → 403 до чтения блоба (даже «не найдено» не раскрывается)', () => {
  const cases = [
    ['sprint-data', 'upsertItem', { roleKey: 'analysis', item: ITEM, baseRev: 4 }, 'editor_rights_required'],
    ['sprint-data', 'removeItem', { roleKey: 'analysis', issueId: 'SCBT-404', baseRev: 4 }, 'editor_rights_required'],
    ['sprint-data', 'patchSprint', { sprint: { name: 'x' }, baseRev: 4 }, 'editor_rights_required'],
    ['sprint-data', 'assignPerson', { roleKey: 'devBack', issueId: 'SCBT-1', login: 'ivanov', baseRev: 4 }, null],
    ['absences', 'upsertAbsence', { login: 'user1', entry: ABS, baseRev: 2 }, null],
    ['absences', 'removeAbsence', { login: 'nobody', from: ABS.from, to: ABS.to, baseRev: 2 }, null],
    ['capacity', 'upsertPerson', { login: 'user1', person: { rate: 1 } }, null],
    ['releases', 'upsertRelease', { release: REL, baseRev: 3 }, 'release_rights_required'],
    ['releases', 'setReleaseStatus', { id: 'R-404', status: 'prep', baseRev: 3 }, 'release_rights_required'],
    ['releases', 'addReleaseIssues', { id: 'R-1', issues: ['DEMO-2'], baseRev: 3 }, 'release_rights_required'],
    ['releases', 'removeReleaseIssues', { id: 'R-1', issues: ['DEMO-1'], baseRev: 3 }, 'release_rights_required'],
  ];
  for (const [p, action, body, reason] of cases) {
    const props = baseProps();
    const before = JSON.stringify(props);
    const ctx = call(p, action, body, props, false, { sprintId: 'S-1' });
    assert.strictEqual(ctx.response.status, 403, action);
    assert.strictEqual(ctx.response.body.error, 'Forbidden', action);
    if (reason) assert.strictEqual(ctx.response.body.reason, reason, action);
    assert.strictEqual(JSON.stringify(props), before, action);
  }
});

test('cid отказа внутри полной записи = cid исходного запроса, строка лога одна', () => {
  const props = baseProps();
  const ctx = mkCtx(props, { roleKey: 'analysis', item: ITEM, baseRev: 1 }, { action: 'upsertItem' });
  const cid = core.cid(ctx);
  const lines = withWarn(() => ep('sprint-data').handle(ctx));
  assert.strictEqual(ctx.response.body.cid, cid);
  assert.strictEqual(lines.length, 1);
  assert.ok(lines[0].indexOf(cid + ' 409 rev_conflict') > 0, lines[0]);
});

test('removeItem / patchSprint: успех и свои отказы', () => {
  const props = baseProps();
  const miss = call('sprint-data', 'removeItem', { roleKey: 'analysis', issueId: 'SCBT-404', baseRev: 4 }, props);
  assert.strictEqual(miss.response.body.reason, 'item_not_found');
  const rm = call('sprint-data', 'removeItem', { roleKey: 'analysis', issueId: 'SCBT-1', baseRev: 4 }, props);
  assert.strictEqual(rm.response.body.success, true, JSON.stringify(rm.response.body));
  assert.deepStrictEqual(rm.response.body.applied, { roleKey: 'analysis', issueId: 'SCBT-1' });
  assert.deepStrictEqual(JSON.parse(props.ssp_roleitems).analysis, []);

  const patch = call('sprint-data', 'patchSprint', { sprint: { name: 'Переименован', updatedBy: 'хакер' }, baseRev: 5 }, props);
  assert.strictEqual(patch.response.body.success, true, JSON.stringify(patch.response.body));
  assert.deepStrictEqual(patch.response.body.applied, { sprintId: 'S-1', keys: ['name'] });
  const stored = JSON.parse(props.ssp_sprint);
  assert.strictEqual(stored.name, 'Переименован');
  assert.strictEqual(stored.status, 'PLANNING');
  assert.strictEqual(stored.updatedBy, 'user1', 'штамп автора ставит сервер');
  assert.strictEqual(stored._rev, 6);

  const empty = call('sprint-data', 'patchSprint', { sprint: { name: 'x' }, baseRev: 0 }, baseProps({ ssp_sprint: '' }));
  assert.strictEqual(empty.response.body.reason, 'sprint_not_found');
});

test('assignPerson: пишет канон (запись роли в истории) И зеркало в спринте; оба rev растут; отказы', () => {
  const props = baseProps();
  const ok = call('sprint-data', 'assignPerson', { roleKey: 'analysis', issueId: 'SCBT-1', login: 'ivanov', baseRev: 4 }, props);
  assert.strictEqual(ok.response.body.success, true, JSON.stringify(ok.response.body));
  assert.strictEqual(ok.response.body.action, 'assignPerson');
  assert.deepStrictEqual(ok.response.body.applied, { roleKey: 'analysis', issueId: 'SCBT-1', assignee: 'ivanov' });
  assert.strictEqual(ok.response.body.rev, 5);
  assert.strictEqual(ok.response.body.historyRev, 8);
  const hist = JSON.parse(props.ssp_history);
  assert.strictEqual(hist[0].personalPlanning.taskAssignments['SCBT-1'].assignee, 'ivanov', 'канон: запись роли в истории');
  assert.strictEqual(hist[0].personalPlanning.taskAssignments['SCBT-1'].assigneeName, 'Иванов И.');
  assert.strictEqual(hist[1].personalPlanning.taskAssignments['SCBT-9'].assignee, 'sidorov', 'чужая роль цела');
  assert.strictEqual(hist[2].personalPlanning.taskAssignments['SCBT-1'].assignee, 'old', 'прошлый спринт цел');
  const slot = JSON.parse(props.ssp_sprint);
  assert.strictEqual(slot.personalPlanning.analysis.taskAssignments['SCBT-1'].assignee, 'ivanov', 'зеркало в спринте');
  assert.strictEqual(slot.personalPlanning.testing.taskAssignments['SCBT-9'].assignee, 'sidorov');
  assert.strictEqual(slot.name, 'Спринт', 'прочие поля спринта не тронуты');

  const stale = call('sprint-data', 'assignPerson', { roleKey: 'analysis', issueId: 'SCBT-1', login: 'petrov', baseRev: 4 }, props);
  assert.strictEqual(stale.response.status, 409);
  assert.strictEqual(JSON.parse(props.ssp_history)[0].personalPlanning.taskAssignments['SCBT-1'].assignee, 'ivanov', '409 приходит ДО записи канона');
  assert.strictEqual(props.ssp_history_rev, '8');

  const noRec = call('sprint-data', 'assignPerson', { roleKey: 'devBack', issueId: 'SCBT-1', login: 'ivanov', baseRev: 5 }, props);
  assert.strictEqual(noRec.response.body.reason, 'role_record_not_found');
  const noSprint = call('sprint-data', 'assignPerson', { roleKey: 'analysis', issueId: 'SCBT-1', login: 'ivanov', baseRev: 0 }, baseProps({ ssp_sprint: '' }));
  assert.strictEqual(noSprint.response.body.reason, 'sprint_not_found');
});

test('absences: upsertAbsence → removeAbsence, rev растёт на 1 за операцию, форму записи проверяет полная запись', () => {
  const props = baseProps();
  const entry = { from: '2026-08-01', to: '2026-08-02', type: 'sick' };
  const up = call('absences', 'upsertAbsence', { login: 'user2', entry: entry, baseRev: 2 }, props);
  assert.strictEqual(up.response.body.success, true, JSON.stringify(up.response.body));
  assert.strictEqual(up.response.body.rev, 3);
  assert.deepStrictEqual(up.response.body.applied, { login: 'user2', from: entry.from, to: entry.to, created: true });
  assert.strictEqual(JSON.parse(props.ssp_absences).user2.length, 1);
  assert.strictEqual(JSON.parse(props.ssp_absences).user1.length, 1, 'чужие записи целы');

  const rm = call('absences', 'removeAbsence', { login: 'user2', from: entry.from, to: entry.to, baseRev: 3 }, props);
  assert.strictEqual(rm.response.body.rev, 4);
  assert.ok(!('user2' in JSON.parse(props.ssp_absences)));
  const miss = call('absences', 'removeAbsence', { login: 'user2', from: entry.from, to: entry.to, baseRev: 4 }, props);
  assert.strictEqual(miss.response.body.reason, 'absence_not_found');

  const bad = call('absences', 'upsertAbsence', { login: 'user2', entry: { from: 'вчера', to: entry.to, type: 'sick' }, baseRev: 4 }, props);
  assert.strictEqual(bad.response.body.reason, 'absences_invalid');
  assert.ok(Array.isArray(bad.response.body.errors) && bad.response.body.errors.length > 0);
});

test('capacity upsertPerson: первое сохранение и слияние через action=save; отказы пути наследуются', () => {
  const props = baseProps();
  const first = call('capacity', 'upsertPerson', { login: 'user1', person: { grade: 'Middle', rate: 1, alloc: { analysis: 1 } } }, props, true, { sprintId: 'S-1' });
  assert.strictEqual(first.response.body.success, true, JSON.stringify(first.response.body));
  assert.deepStrictEqual(first.response.body.applied, { sprintId: 'S-1', login: 'user1', created: true });
  const second = call('capacity', 'upsertPerson', { login: 'user1', person: { rate: 0.5 } }, props, true, { sprintId: 'S-1' });
  assert.strictEqual(second.response.body.applied.created, false);
  const person = JSON.parse(props.ssp_capacity)['S-1'].persons.user1;
  assert.strictEqual(person.rate, 0.5);
  assert.strictEqual(person.grade, 'Middle', 'слияние: прежние ключи человека целы');

  const other = call('capacity', 'upsertPerson', { login: 'user1', person: { rate: 1 } }, props, true, { sprintId: 'S-2' });
  assert.strictEqual(other.response.body.reason, 'sprint_not_current');
  const noSid = call('capacity', 'upsertPerson', { login: 'user1', person: { rate: 1 } }, props);
  assert.strictEqual(noSid.response.body.reason, 'sprint_id_required');
});

test('releases: upsertRelease → addReleaseIssues → setReleaseStatus → removeReleaseIssues', () => {
  const props = baseProps();
  const up = call('releases', 'upsertRelease', { release: Object.assign({}, REL, { id: 'R-2', name: 'v2.0', issues: [] }), baseRev: 3 }, props);
  assert.strictEqual(up.response.body.success, true, JSON.stringify(up.response.body));
  assert.deepStrictEqual(up.response.body.applied, { id: 'R-2', created: true });
  assert.strictEqual(up.response.body.rev, 4);
  const add = call('releases', 'addReleaseIssues', { id: 'R-2', issues: ['DEMO-5', 'DEMO-6'], baseRev: 4 }, props);
  assert.deepStrictEqual(add.response.body.applied, { id: 'R-2', added: ['DEMO-5', 'DEMO-6'] });
  const st = call('releases', 'setReleaseStatus', { id: 'R-2', status: 'prep', baseRev: 5 }, props);
  assert.deepStrictEqual(st.response.body.applied, { id: 'R-2', status: 'prep' });
  const rm = call('releases', 'removeReleaseIssues', { id: 'R-2', issues: ['DEMO-5'], baseRev: 6 }, props);
  assert.deepStrictEqual(rm.response.body.applied, { id: 'R-2', removed: ['DEMO-5'] });
  const stored = JSON.parse(props.ssp_releases).releases.find((r) => r.id === 'R-2');
  assert.strictEqual(stored.status, 'prep');
  assert.deepStrictEqual(stored.issues, ['DEMO-6']);
  assert.strictEqual(stored.updatedBy, 'user1', 'аудит штампует полная запись');
  assert.strictEqual(props.ssp_releases_rev, '7');
  const miss = call('releases', 'setReleaseStatus', { id: 'R-404', status: 'prep', baseRev: 7 }, props);
  assert.strictEqual(miss.response.body.reason, 'release_not_found');
});

test('неизвестное действие по-прежнему invalid_action на всех четырёх путях', () => {
  for (const p of ['sprint-data', 'capacity', 'releases', 'absences']) {
    const ctx = call(p, 'noSuchAction', { baseRev: 1 }, baseProps(), true, { sprintId: 'S-1' });
    assert.strictEqual(ctx.response.body.reason, 'invalid_action', p);
  }
  assert.strictEqual(ops.has('sprint-data', 'upsertItem'), true);
  assert.strictEqual(ops.has('sprint-data', 'validate'), false);
  assert.strictEqual(ops.has('history', 'upsertItem'), false);
  assert.strictEqual(ops.has('sprint-data', 'constructor'), false);
});
