/**
 * Golden-master: refresh-контроллер #35 (Фаза 5 слайс 5, домен E1-refresh).
 *
 * Характеризация ДО выноса в refresh-controller.js (__SSP_REFRESH_CTRL):
 *   • refreshFromYouTrack — гарды (sprint/historical/WC/inline-editor S7/roles/ids),
 *     чанкованный REST-батч ×100 id + busy-стейт кнопок (finally-ветка),
 *     cf-парсеры (getMin/getStr/getStateObj/getUser: localizedName-precedence),
 *     тихие updates через resolveRefreshMerge + каскад _persistAndRerenderRefresh,
 *     no-change путь, catch-ветка (diag + toast + busy=false);
 *   • конфликт-ветки S4/S5 — модалка-сводка (distinct-счёт задач, кнопки
 *     all/skip/diff), applyAndFinish 'all'/'skip', отмена без применения,
 *     diff-подмодалка поверх wcDiffView (группировка по задаче, fmtPeriod/—)
 *     с возвратом в сводку;
 *   • refreshRoleEstimates — legacy per-role путь: последовательные фетчи,
 *     null-затирание getMin (сознательное отличие от resolveRefreshMerge),
 *     state-комплекс + url/title-фиксы, busy-стейт кнопки роли, per-issue
 *     reject проглатывается.
 *
 * Контракты — только через выживающие entry-points (урок слайсов 3–4):
 * refreshFromYouTrack / refreshRoleEstimates остаются делегаторами; все
 * apply/modal/busy-хелперы зоны будут приватны модулю — вход через них.
 * Модалки — recording RING_MODAL (modalLog) + вызов onClick кнопок спеки
 * с фейковым handle и ручным spec.onClose() (семантика Ring: close → onClose).
 * Таймеров в зоне нет (только промисы) — settle макротиками setTimeout(0).
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { createHost } = require('./monolith-host');
const { checkJsonSnapshot } = require('./snap');
const fx = require('./fixtures/state');

/** Settle: refreshFromYouTrack не возвращает свой промис-чейн — ждём макротиками. */
async function settle(n) {
  for (let i = 0; i < (n || 3); i++) await new Promise(function (r) { setTimeout(r, 0); });
}

/** 4 вида refresh-кнопок зоны _setRefreshBtnsBusy. */
function ensureRefreshButtons(document) {
  document.body.insertAdjacentHTML(
    'beforeend',
    '<button id="currentRoleSyncFromYtBtn"></button>' +
      '<button id="ganttSyncFromYtBtn"></button>' +
      '<button id="refreshBtn_analysis"></button>' +
      '<button id="refreshFromTaskBtn_analysis"></button>'
  );
}

function busyStates(document) {
  return ['currentRoleSyncFromYtBtn', 'ganttSyncFromYtBtn', 'refreshBtn_analysis', 'refreshFromTaskBtn_analysis']
    .map(function (id) { return document.getElementById(id).disabled; });
}

/** Фикстурная YT-задача для REST-батча. */
function ytIssue(id, summary, cfs) {
  return { id: 'yt-' + id, idReadable: id, summary: summary || ('Summary ' + id), customFields: cfs || [] };
}
function cf(name, value) {
  return { name: name, projectCustomField: { field: { name: name, id: 'fld-' + name } }, value: value };
}

/** Recording-стаб _host.fetchYouTrack для батч-пути 'issues' (структурный лог:
 *  $top + число id в query — сами query-строки огромны). issues отдаются целиком,
 *  фильтрация по issueId — на стороне зоны (issuesById). */
function stubFetchBatch(gm, document, issues, opts) {
  opts = opts || {};
  const log = [];
  gm.set({
    _host: {
      fetchYouTrack: function (p, o) {
        const q = (o && o.query) || {};
        log.push({
          path: p,
          top: q['$top'],
          idsInQuery: q.query ? q.query.replace('issue id: ', '').split(', ').length : 0,
          hasFields: !!q.fields,
          busyAtCall: busyStates(document),
        });
        if (opts.reject) return Promise.reject(new Error('gm-net-down'));
        return Promise.resolve(issues || []);
      },
      fetchApp: function () { return Promise.resolve({}); },
    },
  });
  return log;
}

/** Recording-стаб apiPost: структурный лог (паттерн draft-store/validation). */
function stubApiPost(gm) {
  const log = [];
  gm.set({
    apiPost: function (path, body, query) {
      log.push({ path: path, bodyKeys: Object.keys(body || {}).sort(), query: query === undefined ? null : query });
      return Promise.resolve({ success: true });
    },
  });
  return log;
}

function recordToasts(gm) {
  const toasts = [];
  gm.set({ toast: function (msg, type) { toasts.push({ msg: msg, type: type || null }); } });
  return toasts;
}

/** Стабы рендер-каскада _persistAndRerenderRefresh + saveCurrentRoleState (sprint-домен). */
function stubPersistHooks(gm) {
  const calls = {
    markDirty: [], planningRoles: 0, roleComposition: [], assigneeTable: 0,
    taskTable: 0, totals: 0, gantt: 0, saveCurrentRole: 0,
  };
  gm.set({
    _markDirty: function (section) { calls.markDirty.push(section); },
    renderPlanningRoles: function () { calls.planningRoles += 1; },
    renderRoleComposition: function (rk) { calls.roleComposition.push(rk); },
    renderCurrentRoleAssigneeTable: function () { calls.assigneeTable += 1; },
    renderCurrentRoleTaskTable: function () { calls.taskTable += 1; },
    updateCurrentRoleTotals: function () { calls.totals += 1; },
    renderGanttChart: function () { calls.gantt += 1; },
    saveCurrentRoleState: function () { calls.saveCurrentRole += 1; },
  });
  return calls;
}

/** Settings с настроенными YT-полями ролей analysis/devBack (ключи из ALL_ROLES). */
function buildRefreshSettings() {
  const s = fx.buildSettings();
  s.activeRoles = ['analysis', 'devBack'];
  s.fieldAnalysis = 'Оценка Анализ';
  s.fieldFactAnalysis = 'Факт Анализ';
  s.fieldDevBack = 'Оценка Back';
  s.fieldFactDevBack = 'Факт Back';
  s.userFieldDevBack = 'Исполнитель Back';
  s.fieldXPriority = 'XPriority';
  s.fieldSystem = 'Система';
  s.fieldExternalTicketId = 'ExtId';
  return s;
}

/** База merge-сценария: baseline == local (не dirty), текущая роль devBack. */
function applyMergeState(gm) {
  fx.applyBaseState(gm);
  gm.call('SPRINT_STORE.setServerSnapshotRoleItems', fx.buildRoleItems());
  gm.call('SPRINT_STORE.setServerSnapshotCurrentRolePP', fx.buildCurrentRolePP());
  gm.set({
    _settings: buildRefreshSettings(),
    _currentSprintRoleRec: fx.buildCurrentRoleRec(),
    _currentRolePP: fx.buildCurrentRolePP(),
    _ganttStateHist: { _fetchedAt: 999 },
  });
}

function devBackItems(gm) {
  return gm.get('_roleItems').devBack.map(function (i) {
    return {
      issueId: i.issueId,
      estimate: i.estimate_devBack,
      state: i.state, stateLocalized: i.stateLocalized === undefined ? '<undefined>' : i.stateLocalized,
      stateColor: i.stateColor === undefined ? '<undefined>' : i.stateColor,
      priority: i.priority, system: i.system === undefined ? '<undefined>' : i.system,
      externalTicketId: i.externalTicketId === undefined ? '<undefined>' : i.externalTicketId,
    };
  });
}

/* ═══════════════════ refreshFromYouTrack — гарды ═══════════════════ */

test('golden: refreshFromYouTrack — гарды (sprint/historical/WC/inline/roles/ids) без фетча и busy', async () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  ensureRefreshButtons(document);
  const toasts = recordToasts(gm);
  const fetchLog = stubFetchBatch(gm, document, []);

  /* нет выбранного спринта */
  gm.set({ _currentSprintId: null });
  gm.call('refreshFromYouTrack');

  /* исторический просмотр: выбран не _sprint.sprintId */
  gm.set({ _currentSprintId: 'gm-hist-2026-05' });
  gm.call('refreshFromYouTrack');
  gm.set({ _currentSprintId: fx.SPRINT_ID });

  /* активная working copy */
  gm.set({ _activeWorkingDraftKey: 'gm-wc-key' });
  gm.call('refreshFromYouTrack');
  gm.set({ _activeWorkingDraftKey: null });

  /* S7: незакоммиченный inline-редактор ячейки */
  document.body.insertAdjacentHTML('beforeend', '<input class="alloc-input" id="gmInlineInp">');
  document.getElementById('gmInlineInp').focus();
  gm.call('refreshFromYouTrack');
  document.getElementById('gmInlineInp').blur();

  /* нет активных ролей */
  const noRoles = fx.buildSettings();
  noRoles.activeRoles = [];
  gm.set({ _settings: noRoles });
  gm.call('refreshFromYouTrack');
  gm.set({ _settings: fx.buildSettings() });

  /* нет активных задач (все EXCLUDED) */
  gm.set({
    _roleItems: {
      analysis: [{ issueId: 'GM-X', inclusionStatus: 'INC_EXCLUDED' }],
      testing: [], devBack: [], devFront: [],
    },
  });
  gm.call('refreshFromYouTrack');

  await settle();
  checkJsonSnapshot('refresh-guards', {
    toasts: toasts,
    fetchCalls: fetchLog.length,
    busyAfter: busyStates(document),
  });
});

/* ═══════════════════ чанкинг + busy + отсутствие задач в ответе ═══════════════════ */

test('golden: refreshFromYouTrack — чанкинг ×100 id, busy-стейт кнопок, пустой ответ → no-change', async () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  ensureRefreshButtons(document);
  const items = [];
  for (let i = 1; i <= 120; i++) items.push({ issueId: 'GM-C' + i, inclusionStatus: 'INC_PLANNED' });
  const s = buildRefreshSettings();
  s.activeRoles = ['analysis'];
  gm.set({ _settings: s, _roleItems: { analysis: items, testing: [], devBack: [], devFront: [] } });
  const toasts = recordToasts(gm);
  const api = stubApiPost(gm);
  const fetchLog = stubFetchBatch(gm, document, []); /* ни одна задача не найдена в YT */

  gm.call('refreshFromYouTrack');
  await settle();

  checkJsonSnapshot('refresh-chunking-busy', {
    fetchLog: fetchLog,
    toasts: toasts,
    apiCalls: api.length,
    busyAfter: busyStates(document),
  });
});

/* ═══════════════════ merge-флоу без конфликтов ═══════════════════ */

test('golden: refreshFromYouTrack — тихие updates (cf-парсеры) + каскад персиста', async () => {
  const { gm, document } = createHost();
  applyMergeState(gm);
  ensureRefreshButtons(document);
  /* ganttColor обязан сброситься при apply assignee */
  gm.get('_currentRolePP').taskAssignments['GM-11'].ganttColor = '#ff0000';
  const toasts = recordToasts(gm);
  const api = stubApiPost(gm);
  const hooks = stubPersistHooks(gm);
  const fetchLog = stubFetchBatch(gm, document, [
    /* GM-1 (analysis): всё совпадает с локальным → вклад нулевой */
    ytIssue('GM-1', 'Анализ требований платёжного модуля', [
      cf('Оценка Анализ', { minutes: 600 }),
      cf('Priority', { name: 'Major' }),
    ]),
    /* GM-2 (analysis): оценка 900 → 960 (локально не трогали) */
    ytIssue('GM-2', 'Обследование интеграции с 1С', [cf('Оценка Анализ', { minutes: 960 })]),
    /* GM-3 в ответе отсутствует → пропуск */
    /* GM-10 (devBack, текущая роль): est + state-комплекс + system + extId; assignee тот же */
    ytIssue('GM-10', 'Бэкенд расчёта ёмкости', [
      cf('Оценка Back', { minutes: 1500 }),
      cf('State', { name: 'Done', localizedName: 'Готово', color: { background: '#e6ffe6', foreground: null } }),
      cf('Система', 'CRM'),
      cf('ExtId', 'EXT-77'),
      cf('Исполнитель Back', { login: 'gm_user_1', fullName: 'GM User 1' }),
    ]),
    /* GM-11 (devBack): priority локализованный + смена исполнителя (не dirty → тихо) */
    ytIssue('GM-11', 'Эндпоинт истории спринтов', [
      cf('Priority', { name: 'Critical', localizedName: 'Критическая' }),
      cf('Исполнитель Back', { login: 'gm_user_3', fullName: 'GM User 3' }),
    ]),
  ]);

  gm.call('refreshFromYouTrack');
  await settle();

  const analysisItems = gm.get('_roleItems').analysis.map(function (i) {
    return { issueId: i.issueId, estimate: i.estimate_analysis };
  });
  checkJsonSnapshot('refresh-merge-success', {
    fetchLog: fetchLog,
    analysisItems: analysisItems,
    devBackItems: devBackItems(gm),
    taskAssignments: gm.get('_currentRolePP').taskAssignments,
    persist: { apiLog: api, hooks: hooks, ganttHistFetchedAt: gm.get('_ganttStateHist')._fetchedAt },
    toasts: toasts,
    busyAfter: busyStates(document),
  });
});

/* ═══════════════════ равенство после парсинга → no-change без персиста ═══════════════════ */

test('golden: refreshFromYouTrack — YT вернул локальные значения → no-change, без персиста', async () => {
  const { gm, document } = createHost();
  applyMergeState(gm);
  ensureRefreshButtons(document);
  const toasts = recordToasts(gm);
  const api = stubApiPost(gm);
  const hooks = stubPersistHooks(gm);
  stubFetchBatch(gm, document, [
    ytIssue('GM-2', 'Обследование интеграции с 1С', [cf('Оценка Анализ', { minutes: 900 })]),
    ytIssue('GM-10', 'Бэкенд расчёта ёмкости', [
      cf('Оценка Back', { minutes: 1200 }),
      cf('State', { name: 'In Progress', localizedName: 'In Progress' }),
      cf('Priority', { localizedName: 'Major' }),
      cf('Исполнитель Back', { login: 'gm_user_1' }),
    ]),
    ytIssue('GM-11', 'Эндпоинт истории спринтов', [
      cf('Priority', { name: 'Normal' }),
      cf('Исполнитель Back', { login: 'gm_user_2' }),
    ]),
  ]);

  gm.call('refreshFromYouTrack');
  await settle();

  checkJsonSnapshot('refresh-no-change', {
    toasts: toasts,
    apiCalls: api.length,
    saveCurrentRole: hooks.saveCurrentRole,
    markDirty: hooks.markDirty,
    busyAfter: busyStates(document),
  });
});

/* ═══════════════════ конфликты S4: сводка + applyAndFinish ═══════════════════ */

/** Конфликт-сценарий: GM-2 silent-update; GM-10 estimate dirty (snap 900 ≠ local 1200);
 *  GM-11 assignee dirty (snapTA gm_user_1 ≠ local gm_user_2). curRk — fallback _activeSubtab. */
function applyConflictState(gm, document) {
  applyMergeState(gm);
  const snapItems = fx.buildRoleItems();
  snapItems.devBack[0].estimate_devBack = 900; /* local 1200 → dirty */
  const snapPP = fx.buildCurrentRolePP();
  snapPP.taskAssignments['GM-11'] = { assignee: 'gm_user_1' }; /* local gm_user_2 → dirty */
  gm.call('SPRINT_STORE.setServerSnapshotRoleItems', snapItems);
  gm.call('SPRINT_STORE.setServerSnapshotCurrentRolePP', snapPP);
  gm.set({
    _currentSprintRoleRec: null, /* curRk берётся из _activeSubtab */
    _activeSubtab: 'devBack',
  });
  return stubFetchBatch(gm, document, [
    ytIssue('GM-2', 'Обследование интеграции с 1С', [cf('Оценка Анализ', { minutes: 960 })]),
    /* user-cf совпадает с локальным: пустое поле YT означало бы «снятие исполнителя» */
    ytIssue('GM-10', 'Бэкенд расчёта ёмкости', [
      cf('Оценка Back', { minutes: 1500 }),
      cf('Исполнитель Back', { login: 'gm_user_1' }),
    ]),
    ytIssue('GM-11', 'Эндпоинт истории спринтов', [cf('Исполнитель Back', { login: 'gm_user_3', fullName: 'GM User 3' })]),
  ]);
}

function conflictModalContract(spec) {
  return {
    id: spec.id,
    type: spec.type,
    title: spec.title,
    bodyText: spec.body && spec.body.text,
    buttons: spec.buttons.map(function (b) { return b.id + ':' + b.variant; }),
    dismissOnBackdrop: spec.dismissOnBackdrop,
    blockEscape: spec.blockEscape,
    showCloseButton: spec.showCloseButton,
  };
}

test('golden: refreshFromYouTrack — конфликты → модалка S4, [Обновить всё] применяет вкл. конфликтные', async () => {
  const { gm, document, modalLog } = createHost();
  applyConflictState(gm, document);
  ensureRefreshButtons(document);
  const toasts = recordToasts(gm);
  const api = stubApiPost(gm);
  const hooks = stubPersistHooks(gm);

  gm.call('refreshFromYouTrack');
  await settle();
  assert.strictEqual(modalLog.length, 1, 'модалка-сводка S4 обязана открыться');
  const spec = modalLog[0];
  const busyAtModal = busyStates(document);

  let closes = 0;
  spec.buttons.find(function (b) { return b.id === 'all'; }).onClick({ close: function () { closes += 1; } });
  spec.onClose(); /* Ring: close → onClose */
  await settle();

  checkJsonSnapshot('refresh-conflict-all', {
    modal: conflictModalContract(spec),
    busyAtModal: busyAtModal,
    closes: closes,
    analysisGm2Estimate: gm.get('_roleItems').analysis[1].estimate_analysis,
    devBackGm10Estimate: gm.get('_roleItems').devBack[0].estimate_devBack,
    taskAssignments: gm.get('_currentRolePP').taskAssignments,
    apiLog: api,
    saveCurrentRole: hooks.saveCurrentRole,
    toasts: toasts,
  });
});

test('golden: refreshFromYouTrack — [Сохранить мои правки]: конфликтные поля нетронуты', async () => {
  const { gm, document, modalLog } = createHost();
  applyConflictState(gm, document);
  ensureRefreshButtons(document);
  const toasts = recordToasts(gm);
  const api = stubApiPost(gm);
  stubPersistHooks(gm);

  gm.call('refreshFromYouTrack');
  await settle();
  const spec = modalLog[0];
  spec.buttons.find(function (b) { return b.id === 'skip'; }).onClick({ close: function () {} });
  spec.onClose();
  await settle();

  checkJsonSnapshot('refresh-conflict-skip', {
    analysisGm2Estimate: gm.get('_roleItems').analysis[1].estimate_analysis,
    devBackGm10Estimate: gm.get('_roleItems').devBack[0].estimate_devBack,
    taskAssignments: gm.get('_currentRolePP').taskAssignments,
    apiCalls: api.length,
    toasts: toasts,
  });
});

test('golden: refreshFromYouTrack — отмена сводки (Escape/X): ничего не применяем', async () => {
  const { gm, document, modalLog } = createHost();
  applyConflictState(gm, document);
  ensureRefreshButtons(document);
  const toasts = recordToasts(gm);
  const api = stubApiPost(gm);
  stubPersistHooks(gm);

  gm.call('refreshFromYouTrack');
  await settle();
  modalLog[0].onClose(); /* закрытие без выбора (decided === null) */
  await settle();

  checkJsonSnapshot('refresh-conflict-cancel', {
    analysisGm2Estimate: gm.get('_roleItems').analysis[1].estimate_analysis,
    devBackGm10Estimate: gm.get('_roleItems').devBack[0].estimate_devBack,
    taskAssignments: gm.get('_currentRolePP').taskAssignments,
    apiCalls: api.length,
    toasts: toasts,
    busyAfter: busyStates(document),
  });
});

test('golden: refreshFromYouTrack — [Показать различия]: diff S5 (wcDiffView) + возврат в сводку', async () => {
  const { gm, document, modalLog } = createHost();
  applyConflictState(gm, document);
  ensureRefreshButtons(document);
  recordToasts(gm);
  stubApiPost(gm);
  stubPersistHooks(gm);

  gm.call('refreshFromYouTrack');
  await settle();
  const summary = modalLog[0];
  summary.buttons.find(function (b) { return b.id === 'diff'; }).onClick({ close: function () {} });
  summary.onClose();
  assert.strictEqual(modalLog.length, 2, 'diff-подмодалка обязана открыться');
  const diff = modalLog[1];
  diff.onClose(); /* закрытие diff → reopen() сводки */

  const props = diff.body && diff.body.props;
  checkJsonSnapshot('refresh-conflict-diff', {
    modalIds: modalLog.map(function (s) { return s.id; }),
    diffContract: {
      id: diff.id,
      type: diff.type,
      title: diff.title,
      bodyComponent: diff.body && diff.body.name,
      buttonsCount: (diff.buttons || []).length,
      dismissOnBackdrop: diff.dismissOnBackdrop,
      props: { added: props.added, removed: props.removed, changed: props.changed, labels: props.labels },
    },
  });
});

/* ═══════════════════ catch-ветка ═══════════════════ */

test('golden: refreshFromYouTrack — reject батча → diag + toast ошибки + busy=false (finally)', async () => {
  const { gm, document } = createHost();
  applyMergeState(gm);
  ensureRefreshButtons(document);
  const toasts = recordToasts(gm);
  const api = stubApiPost(gm);
  const diagLines = [];
  gm.set({ diag: function (msg, type) { diagLines.push({ msg: msg, type: type || null }); } });
  stubFetchBatch(gm, document, null, { reject: true });

  gm.call('refreshFromYouTrack');
  await settle();

  checkJsonSnapshot('refresh-fetch-reject', {
    toasts: toasts,
    diag: diagLines,
    apiCalls: api.length,
    busyAfter: busyStates(document),
  });
});

/* ═══════════════════ refreshRoleEstimates (legacy per-role путь) ═══════════════════ */

/** Recording-стаб последовательных фетчей 'issues/<id>' (per-id карта; reject по списку). */
function stubFetchPerIssue(gm, document, byId, rejectIds) {
  const log = [];
  gm.set({
    _host: {
      fetchYouTrack: function (p, o) {
        const btn = document.getElementById('refreshBtn_analysis');
        log.push({
          path: p,
          hasFields: !!(o && o.query && o.query.fields),
          btnBusy: btn ? { disabled: btn.disabled, html: btn.innerHTML } : null,
        });
        const id = p.replace('issues/', '');
        if (rejectIds && rejectIds.indexOf(id) >= 0) return Promise.reject(new Error('gm-issue-err'));
        return Promise.resolve(byId[id] || null);
      },
      fetchApp: function () { return Promise.resolve({}); },
    },
  });
  return log;
}

test('golden: refreshRoleEstimates — мутации полей (null-затирание getMin), url/title-фиксы, busy, per-issue reject проглатывается', async () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  gm.set({ _settings: buildRefreshSettings(), _ytBase: 'http://gm-base' });
  ensureRefreshButtons(document);
  /* title === issueId → обязан замениться summary из YT */
  gm.get('_roleItems').analysis[1].title = 'GM-2';
  const toasts = recordToasts(gm);
  const api = stubApiPost(gm);
  const renders = { roleComposition: [], updateRemaining: [] };
  gm.set({
    renderRoleComposition: function (rk) { renders.roleComposition.push(rk); },
    updateRoleRemaining: function (rk) { renders.updateRemaining.push(rk); },
  });
  const fetchLog = stubFetchPerIssue(gm, document, {
    /* GM-1: НЕТ est-поля → getMin null затирает 600 (сознательное отличие от
       resolveRefreshMerge); state-комплекс + priority/system/extId */
    'GM-1': ytIssue('GM-1', 'Анализ требований платёжного модуля', [
      cf('Факт Анализ', { minutes: 60 }),
      cf('State', { name: 'Open', localizedName: 'Открыта', color: { background: '#ffffff', foreground: null } }),
      cf('Priority', { localizedName: 'Высокий' }),
      cf('XPriority', { name: 'X1' }),
      cf('Система', 'CRM'),
      cf('ExtId', 'EXT-1'),
    ]),
    'GM-2': ytIssue('GM-2', 'Обследование интеграции с 1С (YT)', [cf('Оценка Анализ', { minutes: 999 })]),
    /* GM-3 — reject (проглатывается per-issue catch, остальные применяются) */
    'GM-4': ytIssue('GM-4', 'Исключённая задача', [cf('Оценка Анализ', { minutes: 11 })]),
  }, ['GM-3']);

  gm.call('refreshRoleEstimates', 'analysis');
  await settle(6); /* последовательный чейн: по тику на задачу + персист */

  const btn = document.getElementById('refreshBtn_analysis');
  const items = gm.get('_roleItems').analysis.map(function (i) {
    return {
      issueId: i.issueId, estimate: i.estimate_analysis, fact: i.fact_analysis,
      priority: i.priority, xpriority: i.xpriority === undefined ? '<undefined>' : i.xpriority,
      state: i.state, stateLocalized: i.stateLocalized === undefined ? '<undefined>' : i.stateLocalized,
      stateColor: i.stateColor === undefined ? '<undefined>' : i.stateColor,
      stateFieldId: i.stateFieldId === undefined ? '<undefined>' : i.stateFieldId,
      system: i.system === undefined ? '<undefined>' : i.system,
      externalTicketId: i.externalTicketId === undefined ? '<undefined>' : i.externalTicketId,
      url: i.url === undefined ? '<undefined>' : i.url,
      title: i.title,
    };
  });
  checkJsonSnapshot('est-refresh-flow', {
    fetchLog: fetchLog,
    items: items,
    apiLog: api,
    renders: renders,
    btnAfter: { disabled: btn.disabled, text: btn.textContent },
    toasts: toasts,
  });
});

test('golden: refreshRoleEstimates — пустая роль/неизвестная роль → ранний выход без фетча', async () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  gm.set({ _settings: buildRefreshSettings() });
  ensureRefreshButtons(document);
  const toasts = recordToasts(gm);
  const api = stubApiPost(gm);
  const fetchLog = stubFetchPerIssue(gm, document, {});

  gm.get('_roleItems').analysis = [];
  gm.call('refreshRoleEstimates', 'analysis');

  /* роль вне ALL_ROLES — тоже ранний выход (после непустых items) */
  gm.get('_roleItems').ghost = [{ issueId: 'GM-G1' }];
  gm.call('refreshRoleEstimates', 'ghost');

  await settle();
  checkJsonSnapshot('est-refresh-early-exit', {
    fetchCalls: fetchLog.length,
    apiCalls: api.length,
    toasts: toasts,
    btnUntouched: !document.getElementById('refreshBtn_analysis').disabled,
  });
});
