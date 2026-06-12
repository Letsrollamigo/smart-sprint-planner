/**
 * Golden-master: shell-рендеры — шапка виджета, Stand-up, Гант.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { createHost } = require('./monolith-host');
const { checkHtmlSnapshot, checkJsonSnapshot } = require('./snap');
const fx = require('./fixtures/state');

test('golden: renderWidgetHeader — селектор спринтов, бейдж, WC-индикатор', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  gm.call('renderWidgetHeader');
  const out = {
    select: document.getElementById('widgetSprintSel').innerHTML,
    selectedValue: document.getElementById('widgetSprintSel').value,
    badge: document.getElementById('widgetSprintBadge').outerHTML,
    wcIndicator: document.getElementById('widgetWcIndicator').outerHTML,
  };
  checkJsonSnapshot('widget-header', out);
});

/* ── Stand-up, ступень 2 (React): оракул = vm-контракт «standup-view.js →
   __SSP_STANDUP_MOUNT» (recording-стаб харнесса стэшит vm на
   #standupViewHost.__sspStandupVm). Снапшоты регенерированы со ступени 1
   (innerHTML → структурный vm) с ручным ревью паритета: те же бакеты/тексты/
   каунты/видимость. Статические empty-states (noSprint/emptyRole) — по-прежнему
   реальный DOM (classList), их контракт не менялся. ── */

function standupVm(document) {
  return document.getElementById('standupViewHost').__sspStandupVm;
}

test('golden: renderStandupView — бакеты текущей роли (devBack)', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  /* done-состояния заданы явно (копия настроек теста — общая фикстура не мутируется) */
  const settings = fx.buildSettings();
  settings.standupDoneStates = ['Fixed'];
  gm.set({ _settings: settings, _activeSubtab: 'devBack' });
  gm.call('renderStandupView');
  const vm = standupVm(document);
  const out = {
    buckets: vm.buckets,
    goalBannerVisible: vm.goalBannerVisible,
    goalText: vm.goalText,
    emptyRoleHidden: document.getElementById('standupEmptyRole').classList.contains('hidden'),
  };
  checkJsonSnapshot('standup-devback', out);
});

test('golden: renderStandupView — нет спринта (empty-state)', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  gm.set({ _sprint: null });
  gm.call('renderStandupView');
  checkJsonSnapshot('standup-no-sprint', {
    noSprintVisible: !document.getElementById('standupNoSprint').classList.contains('hidden'),
    bucketsHidden: !standupVm(document).bucketsVisible,
  });
});

/* ── Добор Тира D слайс 1: ветки classify / empty-role / PP / refresh-контракт.
   Все тесты идут только через стабильные точки входа (renderStandupView,
   doStandupRefresh, селектор роли) + gm.set стейта — переживают вынос семейства. ── */

test('golden: renderStandupView — done-состояния из fallback rollup-порядка (без настройки)', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  /* standupDoneStates НЕ задан → доберётся хвост (2) stateRollupOrder:
     In Progress + Fixed → GM-2 и GM-3 в done (отличается от standup-devback). */
  const settings = fx.buildSettings();
  settings.stateRollupOrder = ['Open', 'In Progress', 'Fixed'];
  gm.set({ _settings: settings });
  gm.call('renderStandupView');
  checkJsonSnapshot('standup-fallback-done', {
    buckets: standupVm(document).buckets,
    noDoneHintHidden: !standupVm(document).noDoneHintVisible,
  });
});

test('golden: renderStandupView — done-состояния не настроены вовсе (hint + классификация по факту)', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  /* Ни standupDoneStates, ни stateRollupOrder → doneStates пуст: hint виден,
     GM-3 (fact>0) уезжает в inflight вместо done. */
  gm.call('renderStandupView');
  checkJsonSnapshot('standup-no-done-states', {
    buckets: standupVm(document).buckets,
    noDoneHintVisible: standupVm(document).noDoneHintVisible,
  });
});

test('golden: renderStandupView — пустая роль (empty-state)', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  /* Активна только роль без задач и без PP → empty-state роли. */
  const settings = fx.buildSettings();
  settings.activeRoles = ['devIos'];
  gm.set({ _settings: settings });
  gm.call('renderStandupView');
  checkJsonSnapshot('standup-empty-role', {
    emptyRoleVisible: !document.getElementById('standupEmptyRole').classList.contains('hidden'),
    bucketsHidden: !standupVm(document).bucketsVisible,
    noSprintHidden: document.getElementById('standupNoSprint').classList.contains('hidden'),
  });
});

test('golden: селектор роли Stand-up — populate + PP-обогащение текущей роли + onchange', () => {
  const { gm, document, window } = createHost();
  fx.applyBaseState(gm);
  fx.applyPeopleState(gm);
  const settings = fx.buildSettings();
  settings.standupDoneStates = ['Fixed'];
  gm.set({ _settings: settings, _activeSubtab: 'devBack' });
  gm.call('_populateStandupRoleSel');
  const sel = document.getElementById('standupRoleSel');
  gm.call('renderStandupView');
  const bucketsDevBack = standupVm(document).buckets;
  /* Смена роли в селекте перерисовывает бакеты (контракт onchange). */
  sel.value = 'analysis';
  sel.dispatchEvent(new window.Event('change'));
  checkJsonSnapshot('standup-rolesel-pp', {
    selOptions: sel.innerHTML,
    selValueAfterPopulate: 'devBack',
    bucketsDevBack: bucketsDevBack,
    bucketsAfterChange: standupVm(document).buckets,
  });
});

/* Хост-стаб refresh-контракта: пишет вызовы, отвечает заданными assignees. */
function buildRefreshHost(assignees) {
  const log = [];
  return {
    log: log,
    fetchApp: function (p, o) {
      log.push({ path: p, body: (o && o.body) || null });
      if (p === 'backend-project/refresh-assignees') {
        return Promise.resolve({ success: true, assignees: assignees });
      }
      return Promise.resolve({ success: true });
    },
    fetchYouTrack: function (p) { log.push({ path: p, body: null }); return Promise.resolve({}); },
  };
}

function setupRefreshHost(gm, document, assignees, withUserField) {
  fx.applyBaseState(gm);
  fx.applyPeopleState(gm);
  const settings = fx.buildSettings();
  settings.standupDoneStates = ['Fixed'];
  if (withUserField) settings.userFieldDevBack = 'Backend Dev';
  gm.set({ _settings: settings, _activeSubtab: 'devBack' });
  gm.call('_populateStandupRoleSel');
  const host = buildRefreshHost(assignees);
  const toasts = [];
  gm.set({ _host: host, toast: function (msg, type) { toasts.push([type || 'info', msg]); } });
  return { host, toasts };
}

test('golden: doStandupRefresh — поле роли не настроено (ранний выход)', async () => {
  const { gm, document } = createHost();
  const ctx = setupRefreshHost(gm, document, {}, false);
  await gm.call('doStandupRefresh');
  checkJsonSnapshot('standup-refresh-no-field', {
    hostPaths: ctx.host.log.map(function (e) { return e.path; }),
    toasts: ctx.toasts,
  });
});

test('golden: doStandupRefresh — изменения assignee+state → мутации и персист', async () => {
  const { gm, document } = createHost();
  const ctx = setupRefreshHost(gm, document, {
    /* GM-10: новый исполнитель + новое состояние; GM-11: всё совпадает (без изменений). */
    'GM-10': { login: 'gm_user_3', fullName: 'GM User 3',
               state: { name: 'Fixed', localizedName: 'Fixed', color: { background: '#e6ffe6', foreground: null } } },
    'GM-11': { login: 'gm_user_2' },
  }, true);
  await gm.call('doStandupRefresh');
  await new Promise(function (r) { setTimeout(r, 0); }); /* fire-and-forget персист */
  const items = gm.get('_roleItems').devBack.map(function (i) {
    return { issueId: i.issueId, state: i.state, stateLocalized: i.stateLocalized || null, stateColor: i.stateColor || null };
  });
  checkJsonSnapshot('standup-refresh-changed', {
    hostPaths: ctx.host.log.map(function (e) { return e.path; }),
    refreshBody: ctx.host.log[0].body,
    taskAssignments: gm.get('_currentRolePP').taskAssignments,
    items: items,
    toasts: ctx.toasts,
  });
});

test('golden: doStandupRefresh — нет изменений (без персиста)', async () => {
  const { gm, document } = createHost();
  const ctx = setupRefreshHost(gm, document, {
    'GM-10': { login: 'gm_user_1' },
    'GM-11': { login: 'gm_user_2' },
  }, true);
  await gm.call('doStandupRefresh');
  await new Promise(function (r) { setTimeout(r, 0); });
  checkJsonSnapshot('standup-refresh-nochange', {
    hostPaths: ctx.host.log.map(function (e) { return e.path; }),
    taskAssignments: gm.get('_currentRolePP').taskAssignments,
    toasts: ctx.toasts,
  });
});

test('golden: renderGanttChart — devBack активного спринта', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  fx.applyPeopleState(gm);
  gm.call('renderGanttChart');
  const container = document.getElementById('ganttContainer');
  assert.ok(container.innerHTML.length > 0, 'gantt must render rows');
  checkHtmlSnapshot('gantt-devback', container.innerHTML);
});

test('golden: renderGanttChart — нет данных роли (empty)', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  gm.call('renderGanttChart');
  checkJsonSnapshot('gantt-empty', {
    emptyShown: document.getElementById('ganttEmpty').style.display !== 'none',
    containerHtml: document.getElementById('ganttContainer').innerHTML,
  });
});

/* ════ Тир D слайс 5 — шапка виджета + шелл-хром (добор до выноса) ════
   Ветки renderWidgetHeader / getSprintMeta / getLogicalSprintIds /
   hasWorkingCopyForSprint, WC-баннер, share-кнопка, hybrid D34 и
   event-контракты init-биндов шапки. Тесты идут ТОЛЬКО через выживающие
   entry-points (делегаторы после выноса): renderWidgetHeader,
   getLogicalSprintIds, renderWorkingCopyBanner, hideWorkingCopyBanner,
   _updateRailSprintName, _updateShareBtnState, _applyHybridSprintMode. */

/** Минимальная запись истории для веток шапки (рендер читает только мету). */
function headerRec(over) {
  return Object.assign({
    sprintId: 'gm-x_analysis',
    roleKey: 'analysis',
    roleLabel: 'Анализ',
    name: 'GM X Sprint',
    status: 'PLANNING',
    dateStart: fx.DATE_START,
    dateEnd: fx.DATE_END,
    confirmedAt: 1779000000000,
    items: [],
  }, over || {});
}

function headerOut(document) {
  const sel = document.getElementById('widgetSprintSel');
  return {
    select: sel.innerHTML,
    selectedValue: sel.value,
    selectDisabled: sel.disabled,
    badge: document.getElementById('widgetSprintBadge').outerHTML,
    wcHidden: document.getElementById('widgetWcIndicator').classList.contains('hidden'),
  };
}

test('golden: renderWidgetHeader — нет видимых спринтов (D72: сброс _currentSprintId, disabled-селектор)', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  gm.set({ _sprint: null, _history: [] });
  gm.call('renderWidgetHeader');
  checkJsonSnapshot('widget-header-empty', Object.assign(headerOut(document), {
    currentSprintIdAfter: gm.get('_currentSprintId'),
    uiDraftCurrentSprintId: (gm.call('_draftGet', 'ui') || {}).currentSprintId,
  }));
});

test('golden: renderWidgetHeader — невалидный _currentSprintId → fallback на первый видимый + персист ui', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  gm.set({ _currentSprintId: 'gm-deleted-sprint' });
  gm.call('renderWidgetHeader');
  checkJsonSnapshot('widget-header-fallback-first', Object.assign(headerOut(document), {
    currentSprintIdAfter: gm.get('_currentSprintId'),
    uiDraftCurrentSprintId: (gm.call('_draftGet', 'ui') || {}).currentSprintId,
  }));
});

test('golden: renderWidgetHeader — per-role бейджи v1.8.1 (mix статусов + PLANNING-default + FINISHED)', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  /* Записи активного спринта: analysis CONFIRMED, testing FINISHED;
     devBack/devFront без записей → PLANNING(default). */
  const history = fx.buildHistory().concat([
    headerRec({ sprintId: fx.SPRINT_ID + '_analysis', status: 'CONFIRMED', name: 'GM Sprint June 2026' }),
    headerRec({ sprintId: fx.SPRINT_ID + '_testing', roleKey: 'testing', roleLabel: 'Тестирование',
                status: 'FINISHED', name: 'GM Sprint June 2026' }),
  ]);
  gm.set({ _history: history });
  gm.call('renderWidgetHeader');
  checkJsonSnapshot('widget-header-badge-mixed', headerOut(document));
});

test('golden: renderWidgetHeader — спринт только из истории (meta-fallback имя/даты, сортировка confirmedAt desc, FINISHED-only отфильтрован)', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  /* Нет активного _sprint; история: gm-x (PLANNING, свежее) + gm-y (CONFIRMED, старше)
     + полностью FINISHED gm-hist из фикстуры (фильтруется из селектора). */
  const history = fx.buildHistory().concat([
    headerRec({ sprintId: 'gm-y_analysis', name: 'GM Y Sprint', status: 'CONFIRMED', confirmedAt: 1778000000000 }),
    headerRec(), /* gm-x, PLANNING, confirmedAt 1779000000000 — свежее, должен быть первым */
  ]);
  gm.set({ _sprint: null, _history: history, _currentSprintId: null });
  gm.call('renderWidgetHeader');
  checkJsonSnapshot('widget-header-hist-only', Object.assign(headerOut(document), {
    currentSprintIdAfter: gm.get('_currentSprintId'),
  }));
});

test('golden: renderWidgetHeader — WC-индикатор виден при working copy текущего спринта', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  gm.set({ _workingDrafts: (function () {
    const wd = {}; wd[fx.SPRINT_ID + '_analysis'] = { items: [] }; return wd;
  })() });
  gm.call('renderWidgetHeader');
  checkJsonSnapshot('widget-header-wc-indicator', {
    wcHidden: document.getElementById('widgetWcIndicator').classList.contains('hidden'),
    selectedValue: document.getElementById('widgetSprintSel').value,
  });
});

test('golden: _updateRailSprintName — подпись полного имени спринта в рельсе (#25 Ф2 п.6)', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  /* В jsdom-хосте global-рельс не строится — синтетический узел подписи. */
  const nm = document.createElement('div');
  nm.id = 'sspRailSprintName';
  document.body.appendChild(nm);
  gm.call('renderWidgetHeader'); /* рендер сам зовёт _updateRailSprintName в хвосте */
  const withSprint = nm.textContent;
  gm.set({ _sprint: null, _history: [] });
  gm.call('renderWidgetHeader');
  checkJsonSnapshot('rail-sprint-name', {
    withSprint: withSprint,
    afterEmpty: nm.textContent,
  });
});

test('golden: getLogicalSprintIds — дедуп per-role записей + активный первым + сортировка desc', () => {
  const { gm } = createHost();
  fx.applyBaseState(gm);
  const history = fx.buildHistory().concat([
    headerRec({ sprintId: 'gm-y_analysis', confirmedAt: 1778000000000 }),
    headerRec({ sprintId: 'gm-y_testing', roleKey: 'testing', confirmedAt: 1778100000000 }), /* дубль логического gm-y */
    headerRec(), /* gm-x, свежее gm-y */
  ]);
  gm.set({ _history: history });
  checkJsonSnapshot('logical-sprint-ids', { ids: gm.call('getLogicalSprintIds') });
});

test('golden: renderWorkingCopyBanner — ветки hidden/NONE-meta/CONFIRMED_REVAL + hideWorkingCopyBanner', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  const banner = document.getElementById('wcBanner');
  const out = {};

  /* 1. Нет активного ключа → hidden */
  gm.set({ _activeWorkingDraftKey: null });
  gm.call('renderWorkingCopyBanner');
  out.noKeyHidden = banner.classList.contains('hidden');

  /* 2. Ключ есть, драфта нет → hidden */
  gm.set({ _activeWorkingDraftKey: fx.HIST_SPRINT_ID + '_analysis', _workingDrafts: {} });
  gm.call('renderWorkingCopyBanner');
  out.noDraftHidden = banner.classList.contains('hidden');

  /* 3. Драфт есть, снапа в истории нет → hidden */
  gm.set({ _activeWorkingDraftKey: 'gm-ghost_analysis', _workingDrafts: { 'gm-ghost_analysis': { items: [] } } });
  gm.call('renderWorkingCopyBanner');
  out.noSnapHidden = banner.classList.contains('hidden');

  /* 4. Полный путь: драфт = копия снапа → уровень NONE → meta-pill */
  const key = fx.HIST_SPRINT_ID + '_analysis';
  const snap = gm.get('_history').find(function (r) { return r.sprintId === key; });
  const draftSame = {
    sprint: { name: snap.name, dateStart: snap.dateStart, dateEnd: snap.dateEnd,
              resourceAnalysis: snap.resourceAnalysis },
    items: JSON.parse(JSON.stringify(snap.items)),
    personalPlanning: {},
  };
  gm.set({ _activeWorkingDraftKey: key, _workingDrafts: (function () {
    const wd = {}; wd[key] = draftSame; return wd;
  })() });
  gm.call('renderWorkingCopyBanner');
  out.same = {
    hidden: banner.classList.contains('hidden'),
    text: document.getElementById('wcBannerText').textContent,
    pillClass: document.getElementById('wcBannerLevelPill').className,
    pillText: document.getElementById('wcBannerLevelPill').textContent,
  };

  /* 5. Драфт с добавленной задачей → CONFIRMED_REVAL-pill */
  const draftAdded = JSON.parse(JSON.stringify(draftSame));
  draftAdded.items.push({ issueId: 'GM-NEW', title: 'Новая задача WC', inclusionStatus: 'INC_PLANNED' });
  gm.set({ _workingDrafts: (function () {
    const wd = {}; wd[key] = draftAdded; return wd;
  })() });
  gm.call('renderWorkingCopyBanner');
  out.added = {
    pillClass: document.getElementById('wcBannerLevelPill').className,
    pillText: document.getElementById('wcBannerLevelPill').textContent,
  };

  /* 6. hideWorkingCopyBanner → hidden обратно */
  gm.call('hideWorkingCopyBanner');
  out.hiddenAfterHide = banner.classList.contains('hidden');

  checkJsonSnapshot('wc-banner-states', out);
});

test('golden: _updateShareBtnState — режимы project/без-nav/global±спринт (#36)', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  const btn = document.createElement('button');
  btn.className = 'ssp-tree__item ssp-tree__item--share';
  document.body.appendChild(btn);
  const navHost = {
    fetchApp: function () { return Promise.resolve({}); },
    fetchYouTrack: function () { return Promise.resolve({}); },
    navigation: { getAppLocation: function () { return Promise.resolve({}); } },
  };
  const out = {};
  const state = function () {
    return { display: btn.style.display, disabled: btn.classList.contains('ssp-tree__item--disabled'), title: btn.getAttribute('title') };
  };

  /* 1. project-режим → спрятана целиком */
  gm.set({ _mode: 'project', _host: navHost });
  gm.call('_updateShareBtnState');
  out.projectMode = state();

  /* 2. global без host.navigation (YT < 2026.1) → спрятана */
  gm.set({ _mode: 'global', _host: fx.buildHostStub() });
  gm.call('_updateShareBtnState');
  out.globalNoNav = state();

  /* 3. global + nav + спринт выбран → enabled */
  gm.set({ _host: navHost });
  gm.call('_updateShareBtnState');
  out.globalWithSprint = state();

  /* 4. global + nav + нет спринта → disabled */
  gm.set({ _currentSprintId: null });
  gm.call('_updateShareBtnState');
  out.globalNoSprint = state();

  checkJsonSnapshot('share-btn-state', out);
});

test('golden: _applyHybridSprintMode — D34 readonly-режим исторических спринтов', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  const ro = function () {
    return {
      planning: document.getElementById('tab-planning').classList.contains('readonly-mode'),
      gantt: document.getElementById('tab-gantt').classList.contains('readonly-mode'),
    };
  };
  const out = {};

  /* 1. Активный спринт → readonly снят */
  gm.call('_applyHybridSprintMode', fx.SPRINT_ID);
  out.active = ro();

  /* 2. Исторический без WC → readonly на обеих вкладках */
  gm.call('_applyHybridSprintMode', fx.HIST_SPRINT_ID);
  out.historicalNoWc = ro();

  /* 3. Исторический + моя WC → editable */
  gm.set({ _currentUser: { login: 'gm_user_1' }, _workingDrafts: (function () {
    const wd = {}; wd[fx.HIST_SPRINT_ID + '_analysis'] = { editorLogin: 'gm_user_1' }; return wd;
  })() });
  gm.call('_applyHybridSprintMode', fx.HIST_SPRINT_ID);
  out.historicalMyWc = ro();

  /* 4. Исторический + чужая WC → readonly */
  gm.set({ _workingDrafts: (function () {
    const wd = {}; wd[fx.HIST_SPRINT_ID + '_analysis'] = { editorLogin: 'gm_user_2' }; return wd;
  })() });
  gm.call('_applyHybridSprintMode', fx.HIST_SPRINT_ID);
  out.historicalForeignWc = ro();

  /* 5. _currentUser отсутствует (myLogin null) → любая WC считается своей */
  gm.set({ _currentUser: null });
  gm.call('_applyHybridSprintMode', fx.HIST_SPRINT_ID);
  out.historicalNoUser = ro();

  checkJsonSnapshot('hybrid-mode-contract', out);
});

test('golden: контракт change спринт-селектора — switch + D28-откат при активной WC', () => {
  const { gm, document, window } = createHost();
  fx.applyBaseState(gm);
  const log = [];
  gm.set({
    _renderPlanningLevel: function (lvl) { log.push({ renderPlanningLevel: lvl }); },
    renderSprintIntroExtras: function () { log.push({ introExtras: true }); },
  });
  /* Второй видимый логический спринт из истории. */
  gm.set({ _history: fx.buildHistory().concat([headerRec()]) });
  gm.call('renderWidgetHeader');
  const sel = document.getElementById('widgetSprintSel');

  /* 1. Обычный switch → _currentSprintId обновлён, ui-драфт персистнут */
  sel.value = 'gm-x';
  sel.dispatchEvent(new window.Event('change'));
  log.push({ afterSwitch: gm.get('_currentSprintId'),
             uiDraft: (gm.call('_draftGet', 'ui') || {}).currentSprintId });

  /* 2. D28: активная WC → модал; cb(false) → откат значения селектора */
  let capturedCb = null;
  gm.set({
    _activeWorkingDraftKey: 'gm-x_analysis',
    showCloseWorkingCopyModal: function (cb) { capturedCb = cb; log.push({ modalShown: true }); },
  });
  sel.value = fx.SPRINT_ID;
  sel.dispatchEvent(new window.Event('change'));
  log.push({ afterModalPending: gm.get('_currentSprintId'), selRolledBack: sel.value });
  capturedCb(false);
  log.push({ afterDecline: gm.get('_currentSprintId'), activeWcKey: gm.get('_activeWorkingDraftKey') });

  /* 3. Повторный switch; cb(true) → сброс WC-ключа + подтверждённый switch */
  sel.value = fx.SPRINT_ID;
  sel.dispatchEvent(new window.Event('change'));
  capturedCb(true);
  log.push({ afterConfirm: gm.get('_currentSprintId'), activeWcKey: gm.get('_activeWorkingDraftKey') });

  checkJsonSnapshot('header-selector-change-contract', { log: log });
});

test('golden: контракт кнопки «Создать новый спринт» — роли/без ролей/global-узел', () => {
  const { gm, document, window } = createHost();
  fx.applyBaseState(gm);
  const log = [];
  gm.set({
    doNewSprint: function (rk) { log.push({ doNewSprint: rk }); },
    _setDashNode: function (node) { log.push({ setDashNode: node }); },
    toast: function (msg, kind) { log.push({ toast: kind }); },
  });
  const btn = document.getElementById('widgetNewSprintBtn');
  const click = function () { btn.dispatchEvent(new window.Event('click')); };

  /* 1. project-режим: роли есть → doNewSprint(первая роль), без узла дерева */
  gm.set({ _mode: 'project' });
  click();

  /* 2. global-режим → плюс переход на узел sprint-params (#25 Ф2) */
  gm.set({ _mode: 'global' });
  click();

  /* 3. Нет активных ролей → warn-тост, doNewSprint не зовётся */
  const settings = fx.buildSettings();
  settings.activeRoles = [];
  gm.set({ _settings: settings });
  click();

  checkJsonSnapshot('new-sprint-btn-contract', { log: log });
});
