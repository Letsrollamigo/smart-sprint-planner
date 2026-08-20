/**
 * Golden-master: sprint-контроллер (Фаза 5 слайс 6, домен E1-sprint — последний подслайс E1).
 *
 * Характеризация ДО выноса в sprint-controller.js (__SSP_SPRINT_CTRL):
 *   • markSavedAndCleanup — снятие dirty + обновление _serverSnapshot* + draftSet
 *     по секциям (sprint / roleItems / currentRole) + revHash + ре-рендер состава;
 *   • saveCurrentRoleState — guard (нет rec), normal-editor флоу (history + sprint-data
 *     активной записи) и assigner-only ветка (assignerSync POST'ы);
 *   • refreshPlanningPeopleForCurrentSprint — 3 ветки: нет спринта / нет PP (empty) /
 *     полный рендер; state-сеттеры _currentSprintRoleRec/_currentRolePP/_currentRoleGantt/
 *     _activeSubtab;
 *   • doSaveRoleHeader / doSaveSprintIntro — гарды (name/start/end/order) + happy-флоу
 *     (persist sprint-data, поля _sprint, sync _currentSprintId, soft-warn цели);
 *   • doNewSprint — создание нового спринта и переиспользование активного черновика;
 *   • setCurrentSprintId — same-id guard, D28-каскад (planning), WC-модалка (cancel/confirm)
 *     через recording RING_MODAL + onClick кнопок спеки.
 *
 * Контракты — только через выживающие entry-points (урок слайсов 3–5): все 7 функций
 * остаются делегаторами (макс. внешних callers всего E1); внутренние хелперы
 * _clearFieldErrors/_showFieldError станут приватны модулю. Стейт зоны
 * (_currentSprintId, _sprint, _roleItems, _currentRole-стейт, _activeSubtab,
 * _activeWorkingDraftKey, _history) остаётся в стейт-ядре; конфликт-канон
 * (_serverSnapshot-снимки/_baseRevHash/_slotRev) — в sprint-store.js (ADR-001, store-API)
 * за get/set-аксессорами (его трогают gm.get/gm.set голденов и другие контроллеры).
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { createHost } = require('./monolith-host');
const { checkJsonSnapshot } = require('./snap');
const fx = require('./fixtures/state');

/** Управляемый планировщик: очередь таймеров + ручной прогон (паттерн draft-store/validation). */
function stubScheduler(window) {
  const timers = [];
  let seq = 0;
  window.setTimeout = function (fn, delay) {
    seq += 1;
    timers.push({ id: seq, fn: fn, delay: delay });
    return seq;
  };
  window.clearTimeout = function (id) {
    if (id == null) return;
    for (let i = 0; i < timers.length; i++) {
      if (timers[i].id === id) { timers.splice(i, 1); return; }
    }
  };
  return {
    timers: timers,
    delays: function () { return timers.map(function (t) { return t.delay; }); },
    runNext: function () { const t = timers.shift(); if (t) t.fn(); },
    runAll: function () { while (timers.length) { const t = timers.shift(); t.fn(); } },
  };
}

/** Recording-стаб apiPost: лог {path, bodyKeys, query} (тела sprint-data огромны —
 *  контракту достаточно структуры). reject=true → Promise.reject (catch-ветки). */
function stubApiPost(gm, opts) {
  opts = opts || {};
  const log = [];
  gm.set({
    apiPost: function (path, body, query) {
      log.push({
        path: path,
        bodyKeys: Object.keys(body || {}).sort(),
        query: query === undefined ? null : query,
      });
      if (opts.reject) return Promise.reject(new Error('gm-api-reject'));
      return Promise.resolve(opts.response !== undefined ? opts.response : { success: true });
    },
  });
  return log;
}

function recordToasts(gm) {
  const toasts = [];
  gm.set({ toast: function (msg, type) { toasts.push({ msg: msg, type: type || null }); } });
  return toasts;
}

/** Стаб draft-механики: запись секций + meta (markSavedAndCleanup, do-сейвы, saveCurrentRoleState). */
function stubDraft(gm) {
  const calls = { dirty: [], clean: [], set: [], debounced: [] };
  gm.set({
    _markDirty: function (s) { calls.dirty.push(s); },
    _markClean: function (s) { calls.clean.push(s); },
    _draftSet: function (k, v) { calls.set.push(k); },
    _draftGet: function () { return {}; },
    _draftSaveDebounced: function (k, fn) {
      calls.debounced.push({ key: k, keys: Object.keys((fn && fn()) || {}).sort() });
    },
    refreshDirtyIndicator: function () {},
  });
  return calls;
}

/** Стаб рендер-каскада зоны (do-сейвы, refresh, setCurrentSprintId, markSavedAndCleanup). */
function stubRenders(gm) {
  const calls = {
    roleComp: [], plannerHeader: [], roleRemaining: [], statusBadge: [], widgetHeader: 0,
    planningLevel: [], introExtras: 0, hybrid: [], syncUrl: 0, shareBtn: 0, history: 0,
    assigneeTable: 0, taskTable: 0, roleTotals: 0, accordionStats: [], resMode: [],
    orphanBanner: 0, editorRights: 0, ganttRefresh: [], applyPersonalRes: 0,
  };
  gm.set({
    renderRoleComposition: function (rk) { calls.roleComp.push(rk); },
    renderRolePlannerHeader: function (rk) { calls.plannerHeader.push(rk); },
    updateRoleRemaining: function (rk) { calls.roleRemaining.push(rk); },
    renderRoleStatusBadge: function (rk) { calls.statusBadge.push(rk); },
    renderWidgetHeader: function () { calls.widgetHeader += 1; },
    _renderPlanningLevel: function (lvl) { calls.planningLevel.push(lvl); },
    renderSprintIntroExtras: function () { calls.introExtras += 1; },
    _applyHybridSprintMode: function (id) { calls.hybrid.push(id); },
    _syncStateToUrl: function () { calls.syncUrl += 1; },
    _updateShareBtnState: function () { calls.shareBtn += 1; },
    renderHistory: function () { calls.history += 1; },
    renderCurrentRoleAssigneeTable: function () { calls.assigneeTable += 1; },
    renderCurrentRoleTaskTable: function () { calls.taskTable += 1; },
    updateCurrentRoleTotals: function () { calls.roleTotals += 1; },
    _updateRoleAccordionStats: function (rk) { calls.accordionStats.push(rk); },
    _renderResourceModeIndicator: function (rk) { calls.resMode.push(rk); },
    _renderOrphanGanttBanner: function () { calls.orphanBanner += 1; },
    applyEditorRightsToUI: function () { calls.editorRights += 1; },
    refreshGanttForCurrentSprint: function (rk) { calls.ganttRefresh.push(rk); },
    applyPersonalResourceToInputs: function () { calls.applyPersonalRes += 1; },
  });
  return calls;
}

/** Прокрутить N микротасков (fire-and-forget apiPost-цепочки do*-флоу). */
async function flush(n) {
  for (let i = 0; i < (n || 6); i++) await Promise.resolve();
}

/** Заполнить intro-поля карточки спринта (общие для doSaveRoleHeader/doSaveSprintIntro). */
function fillIntro(document, vals) {
  vals = vals || {};
  function setv(id, v) {
    const el = document.getElementById(id);
    if (!el) return;
    /* <select> поля (sprintFieldVal/versionFieldVal) — добавить опцию, иначе value не прижмётся */
    if (el.tagName === 'SELECT' && v && !Array.prototype.some.call(el.options, function (o) { return o.value === v; })) {
      const opt = document.createElement('option');
      opt.value = v; opt.textContent = v; el.appendChild(opt);
    }
    el.value = v;
  }
  setv('sprintName', 'name' in vals ? vals.name : 'GM Updated Sprint');
  setv('dateStart', 'start' in vals ? vals.start : '2026-06-01');
  setv('dateEnd', 'end' in vals ? vals.end : '2026-06-30');
  setv('sprintGoal', 'goal' in vals ? vals.goal : 'GM goal');
  setv('sprintFieldVal', 'sprintFv' in vals ? vals.sprintFv : 'GM Sprint');
  setv('versionFieldVal', 'versionFv' in vals ? vals.versionFv : 'v2026.06');
}

/** Per-role DOM doSaveRoleHeader: res_<rk> + sprintStatus_<rk> + saveHeaderBtn_<rk>. */
function ensureRoleHeaderDom(document, rk) {
  document.body.insertAdjacentHTML(
    'beforeend',
    '<input id="res_' + rk + '" value="40ч">' +
      '<select id="sprintStatus_' + rk + '"><option value="PLANNING">PLANNING</option>' +
      '<option value="ALLOCATED" selected>ALLOCATED</option></select>' +
      '<button id="saveHeaderBtn_' + rk + '"></button>'
  );
}

/* ═══════════════════ markSavedAndCleanup ═══════════════════ */

test('golden: markSavedAndCleanup — матрица секций (snapshot + draftSet + revHash)', () => {
  const { gm } = createHost();
  fx.applyBaseState(gm);
  fx.applyPeopleState(gm);
  const draft = stubDraft(gm);
  const renders = stubRenders(gm);

  /* конфликт-канон — в sprint-store (ADR-001): стейт ставится через store-API, оракулы не меняются */
  gm.call('SPRINT_STORE.setServerSnapshotSprint', null);
  gm.call('SPRINT_STORE.setServerSnapshotRoleItems', null);
  gm.call('SPRINT_STORE.setServerSnapshotCurrentRolePP', null);
  gm.call('SPRINT_STORE.setServerSnapshotCurrentRoleGantt', null);
  gm.set({ _activeSubtab: 'devBack' });

  gm.call('markSavedAndCleanup', 'sprint');
  const afterSprint = {
    snapSprintSet: gm.call('SPRINT_STORE.getServerSnapshotSprint') !== null,
    snapSprintMatches: JSON.stringify(gm.call('SPRINT_STORE.getServerSnapshotSprint')) === JSON.stringify(gm.get('_sprint')),
  };
  gm.call('markSavedAndCleanup', 'roleItems');
  const afterRoleItems = { snapRoleItemsSet: gm.call('SPRINT_STORE.getServerSnapshotRoleItems') !== null };
  gm.call('markSavedAndCleanup', 'currentRole');
  const afterCurrentRole = {
    snapPPSet: gm.call('SPRINT_STORE.getServerSnapshotCurrentRolePP') !== null,
    snapGanttSet: gm.call('SPRINT_STORE.getServerSnapshotCurrentRoleGantt') !== null,
  };

  checkJsonSnapshot('mark-saved-cleanup-matrix', {
    afterSprint: afterSprint,
    afterRoleItems: afterRoleItems,
    afterCurrentRole: afterCurrentRole,
    cleanSections: draft.clean,
    draftSetKeys: draft.set,
    baseRevHashSet: typeof gm.call('SPRINT_STORE.getBaseRevHash') === 'string' && gm.call('SPRINT_STORE.getBaseRevHash').length > 0,
    roleCompRerender: renders.roleComp,
  });
});

/* ═══════════════════ saveCurrentRoleState ═══════════════════ */

test('golden: saveCurrentRoleState — guard без _currentSprintRoleRec (тихий выход)', () => {
  const { gm } = createHost();
  fx.applyBaseState(gm);
  const draft = stubDraft(gm);
  stubRenders(gm);
  const api = stubApiPost(gm);
  gm.set({ _currentSprintRoleRec: null });

  gm.call('saveCurrentRoleState');

  checkJsonSnapshot('save-current-role-guard', {
    dirty: draft.dirty, debounced: draft.debounced, apiCalls: api.length,
  });
});

test('golden: saveCurrentRoleState — normal editor (history + sprint-data активной записи)', async () => {
  const { gm } = createHost();
  fx.applyBaseState(gm);
  fx.applyPeopleState(gm);
  const draft = stubDraft(gm);
  const renders = stubRenders(gm);
  const api = stubApiPost(gm);
  gm.set({ _isEditor: true, _isAssigner: false });

  gm.call('saveCurrentRoleState');
  await flush();

  checkJsonSnapshot('save-current-role-editor', {
    dirty: draft.dirty,
    debounced: draft.debounced,
    apiLog: api,
    roleTotals: renders.roleTotals,
    accordionStats: renders.accordionStats,
    sprintPPSet: !!gm.get('_sprint').personalPlanning,
    applyPersonalRes: renders.applyPersonalRes,
  });
});

test('golden: saveCurrentRoleState — assigner-only (assignerSync POST-ы)', async () => {
  const { gm } = createHost();
  fx.applyBaseState(gm);
  fx.applyPeopleState(gm);
  stubDraft(gm);
  stubRenders(gm);
  const api = stubApiPost(gm);
  gm.set({ _isEditor: false, _isAssigner: true });

  gm.call('saveCurrentRoleState');
  await flush();

  checkJsonSnapshot('save-current-role-assigner', { apiLog: api });
});

/* ═══════════════════ refreshPlanningPeopleForCurrentSprint ═══════════════════ */

test('golden: refreshPlanningPeople — нет спринта (noSprint + сброс _currentRole*)', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  fx.applyPeopleState(gm);
  stubRenders(gm);
  gm.set({ _currentSprintId: null });

  gm.call('refreshPlanningPeopleForCurrentSprint', 'devBack');

  checkJsonSnapshot('refresh-people-no-sprint', {
    noSprintHidden: document.getElementById('planningPeopleNoSprint').classList.contains('hidden'),
    emptyHidden: document.getElementById('planningPeopleEmpty').classList.contains('hidden'),
    contentHidden: document.getElementById('planningPeopleContent').classList.contains('hidden'),
    roleRecNull: gm.get('_currentSprintRoleRec') === null,
    rolePPNull: gm.get('_currentRolePP') === null,
    roleGanttNull: gm.get('_currentRoleGantt') === null,
  });
});

test('golden: refreshPlanningPeople — нет PP (empty-state + fallback hist-rec)', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  const renders = stubRenders(gm);
  /* роль без personalPlanning в активном спринте → hasPP=false */
  gm.set({ _currentSprintRoleRec: null, _currentRolePP: null, _currentRoleGantt: null });

  gm.call('refreshPlanningPeopleForCurrentSprint', 'analysis');

  checkJsonSnapshot('refresh-people-empty', {
    emptyHidden: document.getElementById('planningPeopleEmpty').classList.contains('hidden'),
    contentHidden: document.getElementById('planningPeopleContent').classList.contains('hidden'),
    activeSubtab: gm.get('_activeSubtab'),
    rolePPSet: gm.get('_currentRolePP') !== null,
    roleGanttSet: gm.get('_currentRoleGantt') !== null,
    orphanBanner: renders.orphanBanner,
  });
});

test('golden: refreshPlanningPeople — полный рендер (PP есть → таблицы + state)', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  const renders = stubRenders(gm);
  /* #49 — активный спринт хранит PP devBack в КАНОНЕ (per-role hist-запись) resourcesByAssignee
     → hasPP=true → full-ветка. Ранее тест клал PP в кэш _sprint.personalPlanning и опирался на
     getPP-fallback; fallback снят (источник только канон), фикстура переведена на канон-запись. */
  const canonRec = Object.assign(fx.buildCurrentRoleRec(), { personalPlanning: fx.buildCurrentRolePP() });
  gm.set({ _history: fx.buildHistory().concat([canonRec]),
           _currentSprintRoleRec: null, _currentRolePP: null, _currentRoleGantt: null, _activeSubtab: null });

  gm.call('refreshPlanningPeopleForCurrentSprint', 'devBack');

  checkJsonSnapshot('refresh-people-full', {
    emptyHidden: document.getElementById('planningPeopleEmpty').classList.contains('hidden'),
    contentHidden: document.getElementById('planningPeopleContent').classList.contains('hidden'),
    activeSubtab: gm.get('_activeSubtab'),
    rolePPSet: gm.get('_currentRolePP') !== null,
    assigneeTable: renders.assigneeTable,
    taskTable: renders.taskTable,
    roleTotals: renders.roleTotals,
    resMode: renders.resMode,
    orphanBanner: renders.orphanBanner,
    editorRights: renders.editorRights,
  });
});

/* ═══════════════════ doSaveRoleHeader ═══════════════════ */

test('golden: doSaveRoleHeader — гарды (name/start/end/order → toast, без POST)', async () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  ensureRoleHeaderDom(document, 'analysis');
  const toasts = recordToasts(gm);
  const api = stubApiPost(gm);
  stubDraft(gm);
  stubRenders(gm);
  gm.set({ _currentUser: { login: 'gm_user_1', fullName: 'GM User' } });

  /* пустое имя */
  fillIntro(document, { name: '' });
  await gm.call('doSaveRoleHeader', 'analysis');
  /* нет даты старта */
  fillIntro(document, { start: '' });
  await gm.call('doSaveRoleHeader', 'analysis');
  /* нет даты конца */
  fillIntro(document, { end: '' });
  await gm.call('doSaveRoleHeader', 'analysis');
  /* конец < начала */
  fillIntro(document, { start: '2026-06-30', end: '2026-06-01' });
  await gm.call('doSaveRoleHeader', 'analysis');

  checkJsonSnapshot('save-role-header-guards', { toasts: toasts, apiCalls: api.length });
});

test('golden: doSaveRoleHeader — happy-флоу (persist + поля _sprint + sync currentSprintId)', async () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  ensureRoleHeaderDom(document, 'analysis');
  const toasts = recordToasts(gm);
  const api = stubApiPost(gm);
  stubDraft(gm);
  const renders = stubRenders(gm);
  /* #70 — было _currentSprintId:'stale-id': расхождение селектора со слотом теперь
     блокируется гейтом (порча идентичности спринта). null = реальное состояние до
     выбора — гейт пропускает, а v1.8.1-синк currentSprintId остаётся покрыт. */
  gm.set({ _currentUser: { login: 'gm_user_1', fullName: 'GM User' }, _currentSprintId: null });
  fillIntro(document);

  await gm.call('doSaveRoleHeader', 'analysis');
  await flush();

  const sp = gm.get('_sprint');
  checkJsonSnapshot('save-role-header-happy', {
    apiLog: api,
    toasts: toasts,
    sprintName: sp.name,
    sprintFieldVal: sp.sprintFieldVal,
    versionFieldVal: sp.versionFieldVal,
    sprintGoal: sp.sprintGoal,
    roleRemaining: renders.roleRemaining,
    statusBadge: renders.statusBadge,
    widgetHeader: renders.widgetHeader,
    currentSprintIdSynced: gm.get('_currentSprintId'),
  });
});

/* ═══════════════════ doSaveSprintIntro ═══════════════════ */

test('golden: doSaveSprintIntro — гарды (name/start/end/order → toast, без POST)', async () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  const toasts = recordToasts(gm);
  const api = stubApiPost(gm);
  stubDraft(gm);
  stubRenders(gm);
  gm.set({ _currentUser: { login: 'gm_user_1', fullName: 'GM User' } });

  fillIntro(document, { name: '' });
  await gm.call('doSaveSprintIntro');
  fillIntro(document, { start: '' });
  await gm.call('doSaveSprintIntro');
  fillIntro(document, { start: '2026-06-30', end: '2026-06-01' });
  await gm.call('doSaveSprintIntro');

  checkJsonSnapshot('save-sprint-intro-guards', { toasts: toasts, apiCalls: api.length });
});

test('golden: doSaveSprintIntro — happy + soft-warn пустой цели (setTimeout 400)', async () => {
  const { gm, document, window } = createHost();
  const sched = stubScheduler(window);
  fx.applyBaseState(gm);
  const toasts = recordToasts(gm);
  const api = stubApiPost(gm);
  stubDraft(gm);
  const renders = stubRenders(gm);
  gm.set({ _currentUser: { login: 'gm_user_1', fullName: 'GM User' } });
  fillIntro(document, { goal: '' });

  await gm.call('doSaveSprintIntro');
  await flush();
  const delaysAfterPost = sched.delays();
  sched.runAll(); /* soft-warn цели */

  checkJsonSnapshot('save-sprint-intro-happy', {
    apiLog: api,
    toasts: toasts,
    softWarnDelays: delaysAfterPost,
    widgetHeader: renders.widgetHeader,
  });
});

/* ═══════════════════ doNewSprint ═══════════════════ */

test('golden: doNewSprint — новый спринт (reset _roleItems + sync currentSprintId + POST)', async () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  const toasts = recordToasts(gm);
  const api = stubApiPost(gm);
  stubDraft(gm);
  const renders = stubRenders(gm);
  gm.set({ getActiveRoles: function () { return [{ key: 'analysis' }]; } });
  /* активный _sprint не черновик (status ALLOCATED) → новая ветка создания */

  await gm.call('doNewSprint', 'analysis');
  await flush();

  const sp = gm.get('_sprint');
  checkJsonSnapshot('new-sprint-create', {
    apiLog: api,
    toasts: toasts,
    sprintName: sp.name,
    statusPlanning: sp.status,
    roleItemsEmpty: Object.keys(gm.get('_roleItems')).length === 0,
    currentSprintIdSynced: gm.get('_currentSprintId') === sp.sprintId,
    plannerHeader: renders.plannerHeader,
    widgetHeader: renders.widgetHeader,
  });
});

test('golden: doNewSprint — переиспользование активного черновика (тот же sprintId)', async () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  const api = stubApiPost(gm);
  stubDraft(gm);
  stubRenders(gm);
  recordToasts(gm);
  gm.set({ getActiveRoles: function () { return [{ key: 'analysis' }]; } });
  /* спринт = активный черновик: PLANNING + имя = draftName */
  const draftSprint = fx.buildSprint();
  draftSprint.status = 'PLANNING';
  draftSprint.name = gm.call('T', 'newSprintDraftName');
  const prevId = draftSprint.sprintId;
  gm.set({ _sprint: draftSprint });

  await gm.call('doNewSprint', 'analysis');
  await flush();

  checkJsonSnapshot('new-sprint-reuse-draft', {
    sameSprintId: gm.get('_sprint').sprintId === prevId,
    datesReset: gm.get('_sprint').dateStart === null && gm.get('_sprint').dateEnd === null,
    apiPaths: api.map(function (c) { return c.path; }),
  });
});

/* ═══════════════════ setCurrentSprintId ═══════════════════ */

test('golden: setCurrentSprintId — same-id guard (return true, без side-effects)', () => {
  const { gm } = createHost();
  fx.applyBaseState(gm);
  const renders = stubRenders(gm);
  stubDraft(gm);

  const ret = gm.call('setCurrentSprintId', fx.SPRINT_ID);

  checkJsonSnapshot('set-sprint-same-id', {
    ret: ret,
    widgetHeader: renders.widgetHeader,
    hybrid: renders.hybrid,
    syncUrl: renders.syncUrl,
  });
});

test('golden: setCurrentSprintId — D28-каскад (planning tab → re-render + hybrid + url + share)', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  const renders = stubRenders(gm);
  stubDraft(gm);
  /* пометить вкладку planning активной */
  const tab = document.querySelector('.tab-btn[data-tab="planning"]');
  if (tab) tab.classList.add('active');
  gm.set({ _activeWorkingDraftKey: null, _planningLevel: 'roles' });

  const ret = gm.call('setCurrentSprintId', 'gm-other-sprint');

  checkJsonSnapshot('set-sprint-cascade', {
    ret: ret,
    currentSprintId: gm.get('_currentSprintId'),
    widgetHeader: renders.widgetHeader,
    planningLevel: renders.planningLevel,
    hybrid: renders.hybrid,
    syncUrl: renders.syncUrl,
    shareBtn: renders.shareBtn,
  });
});

test('golden: setCurrentSprintId — активная WC → модалка cancel/confirm', () => {
  const { gm, document, modalLog } = createHost();
  fx.applyBaseState(gm);
  stubRenders(gm);
  stubDraft(gm);
  gm.set({ _activeWorkingDraftKey: 'gm-wc-key' });

  /* первый вызов: WC активна, !confirmed → модалка, return false, id не меняется */
  const ret1 = gm.call('setCurrentSprintId', 'gm-other-sprint');
  const idAfterModal = gm.get('_currentSprintId');
  const spec = modalLog[modalLog.length - 1];

  /* cancel → cb(false): id не меняется */
  spec.buttons.find(function (b) { return b.id === 'cancel'; }).onClick({ close: function () {} });
  const idAfterCancel = gm.get('_currentSprintId');

  /* повторный вызов → новая модалка → confirm → cb(true): WC сброшена + рекурсия confirmed */
  gm.call('setCurrentSprintId', 'gm-other-sprint');
  const spec2 = modalLog[modalLog.length - 1];
  spec2.buttons.find(function (b) { return b.id === 'confirm'; }).onClick({ close: function () {} });

  checkJsonSnapshot('set-sprint-wc-modal', {
    ret1: ret1,
    idAfterModal: idAfterModal,
    idAfterCancel: idAfterCancel,
    modalId: spec.id,
    modalButtons: spec.buttons.map(function (b) { return b.id; }),
    wcKeyAfterConfirm: gm.get('_activeWorkingDraftKey'),
    idAfterConfirm: gm.get('_currentSprintId'),
  });
});
