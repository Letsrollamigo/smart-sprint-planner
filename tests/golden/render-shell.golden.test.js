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
