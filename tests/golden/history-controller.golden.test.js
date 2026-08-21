/**
 * Golden-master: история-импорт контроллер (Фаза 5, зачистка «прочих» — слайс 10).
 *
 * Характеризация ДО выноса в history-controller.js (__SSP_HISTORY_CTRL) тел
 * пяти функций-контроллеров (HISTORY_IO IO-слой и modal-specs уже вынесены —
 * здесь только UI-оркестровка):
 *   • editHistorySprint(rec, idx) — гейт прав (checkValidatorNow, async),
 *     запрет правки FINISHED, поиск роли в ALL_ROLES, ветвление по working copy:
 *     чужая (lock-toast) / своя в другой вкладке (multi-tab модал) / своя или
 *     отсутствует (resume / create+resume);
 *   • finishHistorySprint(rec, idx) — confirm-модал → гейт _isValidator →
 *     openConfirmGoalDialog → запись FINISHED + apiPost('history') + renderHistory;
 *   • exportPerSprintJson(rec) — фильтр истории по базовому sprintId, конверт
 *     (_buildHistEnvelope), имя файла (fork-литерал префикса), download;
 *   • _submitHistImport(sel, mode, recs) — merge overwrite/skip + apiPost;
 *   • _doImportReplaceAll() — гард pending + apiPost(import-replace) + _history.
 *
 * Контракты — только через выживающие entry-points (урок слайса 3): все пять
 * остаются делегаторами ядра (editHistorySprint/finishHistorySprint/
 * exportPerSprintJson — потребители history-view + golden; _submitHistImport —
 * коллбек HISTORY_IO через _histIoDeps; _doImportReplaceAll — коллбек
 * _openImportReplaceConfirm). Внешние deps стабятся через gm.set по closure-vars
 * (per-call deps-фабрика подхватит стабы и после выноса). _triggerJsonDownload
 * (DOM-util) и _openImportReplaceConfirm (wiring к MODAL_SPECS) остаются в ядре —
 * их контракты в history-io.golden / modal-specs.golden, здесь не дублируются.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { createHost } = require('./monolith-host');
const { checkJsonSnapshot } = require('./snap');
const fx = require('./fixtures/state');

/** Прогон микро/макро-очереди (.then-цепочки checkValidatorNow/openConfirmGoalDialog/apiPost). */
async function settle(n) {
  for (let i = 0; i < (n || 3); i++) await new Promise(function (r) { setTimeout(r, 0); });
}

function recordToasts(gm) {
  const toasts = [];
  gm.set({ toast: function (msg, type) { toasts.push({ msg: String(msg), type: type || null }); } });
  return toasts;
}

/** Recording-стаб apiPost: лог {path, bodyKeys, recordsCount, query}; резолв {success:true}. */
function stubApiPost(gm, opts) {
  opts = opts || {};
  const log = [];
  gm.set({
    apiPost: function (path, body, query) {
      log.push({
        path: path,
        bodyKeys: Object.keys(body || {}).sort(),
        historyLen: body && Array.isArray(body.history) ? body.history.length : null,
        query: query === undefined ? null : query,
      });
      if (opts.reject) return Promise.reject(new Error('gm-api-reject'));
      return Promise.resolve(opts.response !== undefined ? opts.response : { success: true });
    },
  });
  return log;
}

/** Стабы WC-механики editHistorySprint (closure-vars; per-call deps подхватят после выноса). */
function stubWcDeps(gm) {
  const log = { create: [], resume: [], multitab: [], flush: 0 };
  gm.set({
    createWorkingDraftFromSnapshot: function (snap, idx) { log.create.push({ sprintId: snap && snap.sprintId, idx: idx }); },
    resumeWorkingDraft: function (key, idx) { log.resume.push({ key: key, idx: idx }); },
    showMultiTabConflictModal: function (key, cb) { log.multitab.push({ key: key, hasCb: typeof cb === 'function' }); },
    _workingDraftsScheduleFlush: function () { log.flush += 1; },
  });
  return log;
}

/* ═══════════════════════ editHistorySprint ═══════════════════════ */

test('golden: editHistorySprint — нет прав на правку (checkValidatorNow=false → toast, без WC)', async () => {
  const { gm } = createHost();
  fx.applyBaseState(gm);
  const toasts = recordToasts(gm);
  const wc = stubWcDeps(gm);
  gm.set({ checkValidatorNow: function () { return Promise.resolve(false); } });

  gm.call('editHistorySprint', { sprintId: 'gm-x_analysis', roleKey: 'analysis', status: 'ALLOCATED' }, 0);
  await settle();

  checkJsonSnapshot('histctrl-edit-no-rights', { toasts: toasts, wc: wc });
});

test('golden: editHistorySprint — запрет правки завершённого спринта (FINISHED → warn-toast)', async () => {
  const { gm } = createHost();
  fx.applyBaseState(gm);
  const toasts = recordToasts(gm);
  const wc = stubWcDeps(gm);
  const STATUS = gm.get('STATUS');
  gm.set({ checkValidatorNow: function () { return Promise.resolve(true); } });

  gm.call('editHistorySprint', { sprintId: 'gm-x_analysis', roleKey: 'analysis', status: STATUS.FINISHED }, 0);
  await settle();

  checkJsonSnapshot('histctrl-edit-finished', { toasts: toasts, wc: wc });
});

test('golden: editHistorySprint — нет working copy → create + resume', async () => {
  const { gm } = createHost();
  fx.applyBaseState(gm);
  recordToasts(gm);
  const wc = stubWcDeps(gm);
  gm.set({
    checkValidatorNow: function () { return Promise.resolve(true); },
    _workingDrafts: {},
    _currentUser: { login: 'gm_me' },
  });

  gm.call('editHistorySprint', { sprintId: 'gm-hist-2026-05_analysis', roleKey: 'analysis', status: 'ALLOCATED' }, 3);
  await settle();

  checkJsonSnapshot('histctrl-edit-create-new', { wc: wc });
});

test('golden: editHistorySprint — своя working copy (та же вкладка) → resume без create', async () => {
  const { gm } = createHost();
  fx.applyBaseState(gm);
  const wc = stubWcDeps(gm);
  const tabToken = gm.get('_thisTabToken');
  gm.set({
    checkValidatorNow: function () { return Promise.resolve(true); },
    _workingDrafts: { 'gm-hist-2026-05_analysis': { editorLogin: 'gm_me', editorTabToken: tabToken } },
    _currentUser: { login: 'gm_me' },
  });

  gm.call('editHistorySprint', { sprintId: 'gm-hist-2026-05_analysis', roleKey: 'analysis', status: 'ALLOCATED' }, 0);
  await settle();

  checkJsonSnapshot('histctrl-edit-resume-existing', { wc: wc });
});

test('golden: editHistorySprint — чужая working copy → lock-toast, без resume', async () => {
  const { gm } = createHost();
  fx.applyBaseState(gm);
  const toasts = recordToasts(gm);
  const wc = stubWcDeps(gm);
  gm.set({
    checkValidatorNow: function () { return Promise.resolve(true); },
    _workingDrafts: { 'gm-hist-2026-05_analysis': { editorLogin: 'gm_other', editorTabToken: 'tok-other' } },
    _currentUser: { login: 'gm_me' },
  });

  gm.call('editHistorySprint', { sprintId: 'gm-hist-2026-05_analysis', roleKey: 'analysis', status: 'ALLOCATED' }, 0);
  await settle();

  checkJsonSnapshot('histctrl-edit-locked-other', { toasts: toasts, wc: wc });
});

test('golden: editHistorySprint — своя working copy в другой вкладке → multi-tab модал', async () => {
  const { gm } = createHost();
  fx.applyBaseState(gm);
  const wc = stubWcDeps(gm);
  gm.set({
    checkValidatorNow: function () { return Promise.resolve(true); },
    _workingDrafts: { 'gm-hist-2026-05_analysis': { editorLogin: 'gm_me', editorTabToken: 'tok-other-tab' } },
    _currentUser: { login: 'gm_me' },
  });

  gm.call('editHistorySprint', { sprintId: 'gm-hist-2026-05_analysis', roleKey: 'analysis', status: 'ALLOCATED' }, 0);
  await settle();

  checkJsonSnapshot('histctrl-edit-multitab', { wc: wc });
});

/* ═══════════════════════ finishHistorySprint ═══════════════════════ */

test('golden: finishHistorySprint — спек confirm-модалки', () => {
  const host = createHost();
  fx.applyBaseState(host.gm);
  host.gm.call('finishHistorySprint', host.gm.get('_history')[0], 0);

  const spec = host.modalLog[host.modalLog.length - 1];
  const snap = JSON.parse(JSON.stringify(spec, function (k, v) { return typeof v === 'function' ? '<fn>' : v; }));
  checkJsonSnapshot('histctrl-finish-spec', snap);
});

test('golden: finishHistorySprint — confirm без прав валидатора (toast warn, без apiPost)', async () => {
  const host = createHost();
  fx.applyBaseState(host.gm);
  const toasts = recordToasts(host.gm);
  const api = stubApiPost(host.gm);
  host.gm.set({ _isValidator: false });

  host.gm.call('finishHistorySprint', host.gm.get('_history')[0], 0);
  const spec = host.modalLog[host.modalLog.length - 1];
  spec.buttons.filter(function (b) { return b.id === 'confirm'; })[0].onClick({ close: function () {} });
  await settle();

  checkJsonSnapshot('histctrl-finish-not-validator', { toasts: toasts, api: api });
});

test('golden: finishHistorySprint — confirm + валидатор + goalFields → FINISHED + persist', async () => {
  const host = createHost();
  fx.applyBaseState(host.gm);
  const toasts = recordToasts(host.gm);
  const api = stubApiPost(host.gm);
  const renders = [];
  host.gm.set({
    _isValidator: true,
    renderHistory: function () { renders.push('render'); },
    openConfirmGoalDialog: function (goal, outcome) {
      return Promise.resolve({ goalOutcome: 'Цель достигнута', goalRetroNote: 'Ретро-заметка' });
    },
  });

  host.gm.call('finishHistorySprint', host.gm.get('_history')[0], 0);
  const spec = host.modalLog[host.modalLog.length - 1];
  spec.buttons.filter(function (b) { return b.id === 'confirm'; })[0].onClick({ close: function () {} });
  await settle();

  const rec = host.gm.get('_history')[0];
  const STATUS = host.gm.get('STATUS');
  checkJsonSnapshot('histctrl-finish-validator-ok', {
    recStatus: rec.status === STATUS.FINISHED ? '<FINISHED>' : rec.status,
    finishedAtFrozen: rec.finishedAt === 1780315200000,
    goalOutcome: rec.goalOutcome,
    goalRetroNote: rec.goalRetroNote,
    renders: renders,
    toasts: toasts,
    api: api,
  });
});

test('golden: finishHistorySprint — валидатор отменил goal-диалог (null → без записи/persist)', async () => {
  const host = createHost();
  fx.applyBaseState(host.gm);
  const api = stubApiPost(host.gm);
  host.gm.set({
    _isValidator: true,
    openConfirmGoalDialog: function () { return Promise.resolve(null); },
  });

  host.gm.call('finishHistorySprint', host.gm.get('_history')[1], 1);
  const spec = host.modalLog[host.modalLog.length - 1];
  spec.buttons.filter(function (b) { return b.id === 'confirm'; })[0].onClick({ close: function () {} });
  await settle();

  checkJsonSnapshot('histctrl-finish-goal-cancelled', { api: api });
});

/* #69 R1 (строка 5) — групповой финиш + префилл исхода/ретро из FINISHED-сестры */
test('golden: finishHistoryGroup — только не-FINISHED записи группы, префилл из FINISHED-сестры, один persist', async () => {
  const host = createHost();
  fx.applyBaseState(host.gm);
  const toasts = recordToasts(host.gm);
  const api = stubApiPost(host.gm);
  const dialogArgs = [];
  host.gm.set({
    _isValidator: true,
    renderHistory: function () {},
    _history: [
      { sprintId: 'S9_analysis', name: 'S9', status: 'FINISHED', sprintGoal: 'Цель S9', goalOutcome: 'partial', goalRetroNote: 'Ретро сестры', items: [] },
      { sprintId: 'S9_testing',  name: 'S9', status: 'ALLOCATED', sprintGoal: 'Цель S9', items: [] },
      { sprintId: 'S9_devBack',  name: 'S9', status: 'PLANNING',  sprintGoal: 'Цель S9', items: [] },
      { sprintId: 'S8_testing',  name: 'S8', status: 'ALLOCATED', items: [] },
    ],
    openConfirmGoalDialog: function (goal, outcome, retro) {
      dialogArgs.push({ goal: goal, outcome: outcome, retro: retro });
      return Promise.resolve({ goalOutcome: 'achieved', goalRetroNote: undefined });
    },
  });

  host.gm.call('finishHistoryGroup', 'S9');
  const spec = host.modalLog[host.modalLog.length - 1];
  spec.buttons.filter(function (b) { return b.id === 'confirm'; })[0].onClick({ close: function () {} });
  await settle();

  checkJsonSnapshot('histctrl-finish-group', {
    modalId: spec.id,
    dialogArgs: dialogArgs,
    records: host.gm.get('_history').map(function (r) {
      return { sprintId: r.sprintId, status: r.status, goalOutcome: r.goalOutcome || null, goalRetroNote: r.goalRetroNote || null, finished: !!r.finishedAt };
    }),
    toasts: toasts,
    apiCalls: api.length,
  });
});

/* ═══════════════════════ exportPerSprintJson ═══════════════════════ */

test('golden: exportPerSprintJson — фильтр по базовому sprintId + имя файла + download', () => {
  const { gm } = createHost();
  fx.applyBaseState(gm);
  const toasts = recordToasts(gm);
  const downloads = [];
  gm.set({ _triggerJsonDownload: function (obj, name) { downloads.push({ name: name, format: obj && obj.format, records: (obj && obj.records || []).map(function (r) { return r.sprintId; }) }); } });

  gm.call('exportPerSprintJson', { sprintId: 'gm-hist-2026-05_analysis', name: 'GM Hist May 2026', dateStart: 1776556800000 });

  checkJsonSnapshot('histctrl-export-per-sprint', { downloads: downloads, toasts: toasts });
});

/* ═══════════════════════ _submitHistImport ═══════════════════════ */

test('golden: _submitHistImport — overwrite-режим (замена по sprintId + merge + persist)', async () => {
  const { gm } = createHost();
  fx.applyBaseState(gm);
  const toasts = recordToasts(gm);
  const api = stubApiPost(gm);
  gm.set({ renderHistory: function () {} });

  const fileRecords = [
    { sprintId: 'gm-hist-2026-05_analysis', roleKey: 'analysis', name: 'imported' },
    { sprintId: 'gm-new-2026-06_devBack', roleKey: 'devBack', name: 'imported-new' },
  ];
  gm.call('_submitHistImport', ['gm-hist-2026-05', 'gm-new-2026-06'], 'overwrite', fileRecords);
  await settle();

  const hist = gm.get('_history').map(function (h) { return h.sprintId; }).sort();
  checkJsonSnapshot('histctrl-submit-overwrite', { historyIds: hist, toasts: toasts, api: api });
});

test('golden: _submitHistImport — skip-режим (существующие по sprintId не дублируются)', async () => {
  const { gm } = createHost();
  fx.applyBaseState(gm);
  const toasts = recordToasts(gm);
  const api = stubApiPost(gm);
  gm.set({ renderHistory: function () {} });

  const fileRecords = [
    { sprintId: 'gm-hist-2026-05_analysis', roleKey: 'analysis', name: 'dup' },
    { sprintId: 'gm-new-2026-06_devBack', roleKey: 'devBack', name: 'fresh' },
  ];
  gm.call('_submitHistImport', ['gm-hist-2026-05', 'gm-new-2026-06'], 'skip', fileRecords);
  await settle();

  const hist = gm.get('_history').map(function (h) { return h.sprintId; }).sort();
  checkJsonSnapshot('histctrl-submit-skip', { historyIds: hist, toasts: toasts, api: api });
});

/* ═══════════════════════ _doImportReplaceAll ═══════════════════════ */

test('golden: _doImportReplaceAll — гард пустого pending (no-op)', async () => {
  const { gm } = createHost();
  fx.applyBaseState(gm);
  const api = stubApiPost(gm);
  gm.set({ _importHistPending: null });

  gm.call('_doImportReplaceAll');
  await settle();

  checkJsonSnapshot('histctrl-replace-guard', { api: api, pending: gm.get('_importHistPending') });
});

test('golden: _doImportReplaceAll — happy (apiPost import-replace + _history заменён + pending сброшен)', async () => {
  const { gm } = createHost();
  fx.applyBaseState(gm);
  const toasts = recordToasts(gm);
  const api = stubApiPost(gm);
  gm.set({
    renderHistory: function () {},
    _importHistPending: { records: [{ sprintId: 'gm-r1_analysis' }, { sprintId: 'gm-r2_testing' }] },
  });

  gm.call('_doImportReplaceAll');
  await settle();

  checkJsonSnapshot('histctrl-replace-happy', {
    historyIds: gm.get('_history').map(function (h) { return h.sprintId; }),
    pendingCleared: gm.get('_importHistPending') === null,
    toasts: toasts,
    api: api,
  });
});
