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

test('golden: renderStandupView — бакеты текущей роли (devBack)', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  /* done-состояния заданы явно (копия настроек теста — общая фикстура не мутируется) */
  const settings = fx.buildSettings();
  settings.standupDoneStates = ['Fixed'];
  gm.set({ _settings: settings, _activeSubtab: 'devBack' });
  gm.call('renderStandupView');
  const out = {
    buckets: document.getElementById('standupBuckets').innerHTML,
    goalBannerVisible: document.getElementById('standupGoalBanner').style.display !== 'none',
    goalText: document.getElementById('standupGoalText').textContent,
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
    bucketsHidden: document.getElementById('standupBuckets').style.display === 'none',
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
    buckets: document.getElementById('standupBuckets').innerHTML,
    noDoneHintHidden: document.getElementById('standupNoDoneStatesHint').style.display === 'none',
  });
});

test('golden: renderStandupView — done-состояния не настроены вовсе (hint + классификация по факту)', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  /* Ни standupDoneStates, ни stateRollupOrder → doneStates пуст: hint виден,
     GM-3 (fact>0) уезжает в inflight вместо done. */
  gm.call('renderStandupView');
  checkJsonSnapshot('standup-no-done-states', {
    buckets: document.getElementById('standupBuckets').innerHTML,
    noDoneHintVisible: document.getElementById('standupNoDoneStatesHint').style.display !== 'none',
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
    bucketsHidden: document.getElementById('standupBuckets').style.display === 'none',
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
  const bucketsDevBack = document.getElementById('standupBuckets').innerHTML;
  /* Смена роли в селекте перерисовывает бакеты (контракт onchange). */
  sel.value = 'analysis';
  sel.dispatchEvent(new window.Event('change'));
  checkJsonSnapshot('standup-rolesel-pp', {
    selOptions: sel.innerHTML,
    selValueAfterPopulate: 'devBack',
    bucketsDevBack: bucketsDevBack,
    bucketsAfterChange: document.getElementById('standupBuckets').innerHTML,
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
