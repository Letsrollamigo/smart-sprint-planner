/**
 * #73 — роли-участницы спринта: резолвер getSprintRolesFor (слоёный фолбэк) +
 * инвариант сохранности §5 спеки на обезличенном прод-слепке (#63).
 *
 * Фикстура — tests/fixtures/prod-snapshots/62-emp-mixed-sprints.json:
 * рабочий слот sprint-jul CONFIRMED (3 роли, все снапы pre-#73 — без `roles`,
 * но с settings эпохи), sprint-aug смешанный, CONFIRMED-хвост jun/may2.
 *
 * Инвариант §5: набор ролей спринта — фильтр планирования, НИКОГДА не команда
 * на удаление. Участок трижды терял данные (v3.2.1, v3.18.0, #70), поэтому:
 *   - создание спринта с усечённым набором не трогает чужие снапы;
 *   - снап уходящего PLANNING-слота идёт по набору САМОГО слота, даже когда
 *     пикер стоит на чужом историческом спринте (советник, сессия 2026-08-24);
 *   - выключение роли в настройках не удаляет записи истории и не меняет
 *     резолв набора существующих спринтов (закрытие замеренного дефекта).
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { createHost } = require('./monolith-host');

const SNAP = require('../fixtures/prod-snapshots/62-emp-mixed-sprints.json');
const EPOCH_ROLES = ['analysis', 'testing', 'devPlatform']; // settings.activeRoles эпохи слепка

function clone(o) { return JSON.parse(JSON.stringify(o)); }

function createSnapHost() {
  const h = createHost();
  const { gm } = h;
  const st = clone(SNAP.state);
  const apiLog = [];
  gm.set({
    _settings: clone(SNAP.settings),
    _settingsLoaded: true,
    _sprint: st.sprint,
    _roleItems: st.roleItems,
    _history: st.history,
    _currentSprintId: st.currentSprintId,
    _activeSubtab: st.activeSubtab,
    _isEditor: true,
    apiGet: function (path) { apiLog.push({ m: 'GET', path }); return Promise.resolve({}); },
    apiPost: function (path, body, query) { apiLog.push({ m: 'POST', path, body, query }); return Promise.resolve({ success: true }); },
    bindResInputDraftListener: function () {},
    bindSprintHeaderDraftListeners: function () {},
  });
  return Object.assign(h, { apiLog });
}

/* jsdom-realm: массивы из VM не проходят deepStrictEqual по прототипу → сравниваем строкой */
function keysOf(roles) { return Array.prototype.map.call(roles, function (r) { return r.key; }).join(','); }

/* Слепок чужих снапов: sprintId → {status, itemsLen} — для проверки «не тронуты». */
function foreignSnapshot(history, excludePrefix) {
  const out = {};
  history.forEach(function (rec) {
    if (excludePrefix && String(rec.sprintId).indexOf(excludePrefix) === 0) return;
    out[rec.sprintId] = { status: rec.status, itemsLen: (rec.items || []).length };
  });
  return out;
}

// ─── Резолвер: 4 ступени фолбэка ─────────────────────────────────────────────

test('#73 резолвер: ступень 1 — sprint.roles (объект и слот по id), канонический порядок ALL_ROLES', () => {
  const { gm } = createSnapHost();
  /* порядок в roles обратный — резолвер обязан вернуть канонический (ALL_ROLES) */
  const obj = { sprintId: 'x-1', roles: ['devPlatform', 'analysis'] };
  assert.strictEqual(keysOf(gm.call('getSprintRolesFor', obj)), 'analysis,devPlatform');

  const sprint = gm.get('_sprint');
  sprint.roles = ['testing'];
  assert.strictEqual(keysOf(gm.call('getSprintRolesFor', 'sprint-jul')), 'testing',
    'резолв по id рабочего слота читает _sprint.roles');
});

test('#73 резолвер: ступень 2а — снап истории с roles', () => {
  const { gm } = createSnapHost();
  const history = gm.get('_history');
  history.find(function (r) { return r.sprintId === 'sprint-aug_devPlatform'; }).roles = ['devPlatform', 'testing'];
  assert.strictEqual(keysOf(gm.call('getSprintRolesFor', 'sprint-aug')), 'testing,devPlatform');
});

test('#73 резолвер: ступень 2б — pre-#73 спринт берёт settings.activeRoles эпохи, не текущие настройки', () => {
  const { gm } = createSnapHost();
  /* ретро-включение 4-й роли в настройках проекта — замеренный дефект 2026-08-24 */
  const settings = gm.get('_settings');
  settings.activeRoles = EPOCH_ROLES.concat(['devBack']);
  assert.strictEqual(keysOf(gm.call('getSprintRolesFor', 'sprint-aug')), EPOCH_ROLES.join(','),
    'фантомная роль не появляется задним числом');
  /* ретро-выключение используемой роли */
  settings.activeRoles = ['analysis', 'devPlatform'];
  assert.strictEqual(keysOf(gm.call('getSprintRolesFor', 'sprint-jul')), EPOCH_ROLES.join(','),
    'роль с данными не прячется задним числом');
});

test('#73 резолвер: ступень 3 — неизвестный id/пустой аргумент → текущие настройки проекта', () => {
  const { gm } = createSnapHost();
  assert.strictEqual(keysOf(gm.call('getSprintRolesFor', 'no-such-sprint')), EPOCH_ROLES.join(','));
  assert.strictEqual(keysOf(gm.call('getSprintRolesFor', null)), EPOCH_ROLES.join(','));
});

// ─── Инвариант §5 ────────────────────────────────────────────────────────────

test('#73 инвариант §5: doNewSprint с усечённым набором — снапы уходящего слота легли по ЕГО набору, чужие целы', async () => {
  const { gm, apiLog } = createSnapHost();
  /* Сценарий советника: пикер на CONFIRMED sprint-jul, а слот — именованный
     PLANNING-черновик с несохранённым подбором (набор слота = ступень 3, 3 роли). */
  gm.set({
    _sprint: {
      sprintId: 'sprint-draft', name: 'Недосохранённый черновик', status: 'PLANNING',
      dateStart: null, dateEnd: null, resourceAnalysis: 100,
    },
    _roleItems: {
      analysis: [{ issueId: 'X-1', title: 'Задача', inclusionStatus: 'INC_PLANNED', estimate_analysis: 60 }],
      testing: [], devPlatform: [],
    },
    _currentSprintId: 'sprint-jul',
  });
  const before = foreignSnapshot(gm.get('_history'), 'sprint-draft');

  gm.call('doNewSprint', 'analysis', ['analysis']);
  await new Promise(function (r) { setTimeout(r, 20); });

  const history = gm.get('_history');
  /* Именованный PLANNING-черновик снапается ЦЕЛИКОМ по набору слота (3 роли эпохи) —
     не по набору выбранного в пикере sprint-jul и не по усечённому набору нового. */
  EPOCH_ROLES.forEach(function (rk) {
    assert.ok(history.some(function (r) { return r.sprintId === 'sprint-draft_' + rk; }),
      'снап уходящего слота есть: sprint-draft_' + rk);
  });
  const draftAnalysis = history.find(function (r) { return r.sprintId === 'sprint-draft_analysis'; });
  assert.strictEqual((draftAnalysis.items || []).length, 1, 'подбор уходящего слота не потерян');

  /* Чужие снапы — байт-в-байт по статусу/составу. */
  assert.deepStrictEqual(foreignSnapshot(history, 'sprint-draft'), before, 'чужие снапы не тронуты');

  /* Новый слот несёт усечённый набор; сейв роли копирует его в снап. */
  const sprint = gm.get('_sprint');
  assert.deepStrictEqual(sprint.roles, ['analysis']);
  assert.notStrictEqual(sprint.sprintId, 'sprint-draft');
  const posted = apiLog.filter(function (e) { return e.m === 'POST' && e.path === 'sprint-data'; }).pop();
  assert.deepStrictEqual(posted.body.sprint.roles, ['analysis'], 'roles уехал в persist');

  gm.call('saveRoleHistorySnapshot', 'analysis');
  await new Promise(function (r) { setTimeout(r, 20); });
  const newSnap = gm.get('_history').find(function (r) {
    return r.sprintId === sprint.sprintId + '_analysis';
  });
  assert.deepStrictEqual(newSnap.roles, ['analysis'], 'buildRoleSnap копирует набор в снап');

  /* §4.3 — повторный «Новый спринт» на живом черновике: sprintId переиспользуется,
     набор ролей ПЕРЕЗАПИСЫВАЕТСЯ новым выбором из диалога. */
  const draftId = sprint.sprintId;
  gm.call('doNewSprint', 'devPlatform', ['devPlatform', 'analysis']);
  await new Promise(function (r) { setTimeout(r, 20); });
  const redraft = gm.get('_sprint');
  assert.strictEqual(redraft.sprintId, draftId, 'active-draft переиспользует sprintId');
  assert.strictEqual(JSON.parse(JSON.stringify(redraft.roles)).join(','), 'devPlatform,analysis',
    'набор черновика перезаписан новым выбором');
});

test('#73 инвариант §5: выключение роли в настройках не удаляет записи истории', async () => {
  const { gm } = createSnapHost();
  const before = foreignSnapshot(gm.get('_history'), null);
  const settings = gm.get('_settings');
  settings.activeRoles = ['analysis', 'devPlatform'];   // testing выключена, у неё 41 задача в jul

  /* Прогоняем рендеры и сейв другой роли — путей удаления быть не должно. */
  try { gm.call('renderHistory'); } catch (_) {}
  try { gm.call('renderWidgetHeader'); } catch (_) {}
  gm.call('saveRoleHistorySnapshot', 'analysis');
  await new Promise(function (r) { setTimeout(r, 20); });

  const after = foreignSnapshot(gm.get('_history'), null);
  Object.keys(before).forEach(function (id) {
    if (id === 'sprint-jul_analysis') return;   // легитимно пересохранён своим сейвом
    assert.deepStrictEqual(after[id], before[id], 'запись цела: ' + id);
  });
  assert.strictEqual(after['sprint-jul_testing'].itemsLen, 41, 'снапы выключенной testing целы');
});
