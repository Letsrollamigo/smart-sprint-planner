/**
 * Golden-master: dash-shell (#25 Ф2) — global-рельс/дерево навигации + dashNode-стейт.
 * Добор ДО выноса (Фаза 5 слайс 13, домен E6 — подкластер dash-shell):
 *   _buildDashTree / _deriveDashNodeFromTabLevel / _setDashNode / _buildGlobalDashShell.
 *
 * Все тесты идут через стабильные точки входа (делегаторы после выноса) + gm.set
 * стейта/стабов кросс-кластерных хуков (_setDashNode/_onShareClick/_syncStateToUrl
 * приходят в модуль через core-делегаторы → gm.set-стабы их перехватывают).
 * init-IIFE заморожен в host (YTApp.register — вечный промис), поэтому функции,
 * достижимые в проде только из init, характеризуются ИЗОЛИРОВАННО через gm.call.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { createHost } = require('./monolith-host');
const { checkJsonSnapshot } = require('./snap');
const fx = require('./fixtures/state');

/** Структурный дайджест кнопки дерева (узел/класс/i18n-ключ/текст). */
function nodeDigest(b) {
  const lbl = b.querySelector('[data-i18n]');
  return {
    node: b.dataset.node,
    tag: b.tagName,
    cls: b.className,
    i18n: lbl ? lbl.getAttribute('data-i18n') : null,
    text: b.textContent,
  };
}

test('golden: _buildDashTree — структура узлов + делегация клика на _setDashNode/_onShareClick', () => {
  const { gm, document, window } = createHost();
  fx.applyBaseState(gm);
  const calls = [];
  gm.set({
    _setDashNode: function (id) { calls.push({ setDashNode: id }); },
    _onShareClick: function () { calls.push({ shareClick: true }); },
  });
  const tree = gm.call('_buildDashTree');
  document.body.appendChild(tree);

  /* структурный дайджест ДО манипуляций с share-кнопкой */
  const digest = Array.prototype.map.call(tree.querySelectorAll('[data-node]'), nodeDigest);
  const grp = tree.querySelector('.ssp-tree__group');
  const groupSummaryI18n = grp.querySelector('.ssp-tree__group-summary [data-i18n]').getAttribute('data-i18n');
  const groupOpen = grp.open;

  /* клики: item (с guard'ом disabled) + child (без guard'а) + share (после снятия disabled) */
  const click = function (sel) { tree.querySelector(sel).dispatchEvent(new window.Event('click')); };
  click('[data-node="sprint-params"]');   /* mkItem → setDashNode('sprint-params') */
  click('[data-node="planning-people"]'); /* mkChild → setDashNode('planning-people') */
  const share = tree.querySelector('[data-node="share"]');
  share.dispatchEvent(new window.Event('click'));               /* disabled → no-op */
  const callsWhileDisabled = calls.slice();
  share.classList.remove('ssp-tree__item--disabled');
  share.dispatchEvent(new window.Event('click'));               /* → setDashNode('share') + onShareClick */

  checkJsonSnapshot('dash-tree-structure', {
    digest: digest,
    groupSummaryI18n: groupSummaryI18n,
    groupOpen: groupOpen,
    callsWhileShareDisabled: callsWhileDisabled,
    callsAfterEnableShare: calls,
  });
});

/* #45 — регресс 2.16.1: узел «Ёмкость» в global-дереве гейтится по
   _settings.capacityMode==='full' (dash-shell _buildDashTree). Баг 2.16.0:
   _dashDeps().state не отдавал getSettings → _capS=null → узел НИКОГДА не строился
   (Full недостижим в проде). Гард: при Full узел есть и стоит сразу после
   «Параметры спринта»; при Light/прочем — узла нет (Light byte-identical). */
test('golden: _buildDashTree — узел «Ёмкость» только при capacityMode==="full" (регресс 2.16.1)', () => {
  const { gm } = createHost();
  fx.applyBaseState(gm);

  gm.set({ _settings: { capacityMode: 'light' } });
  const hasLight = !!gm.call('_buildDashTree').querySelector('[data-node="capacity"]');

  gm.set({ _settings: { capacityMode: 'full' } });
  const treeFull = gm.call('_buildDashTree');
  const nodesFull = Array.prototype.map.call(treeFull.querySelectorAll('[data-node]'), function (b) { return b.dataset.node; });

  assert.strictEqual(hasLight, false, 'Light: узла «Ёмкость» быть не должно');
  assert.ok(nodesFull.indexOf('capacity') >= 0, 'Full: узел «Ёмкость» должен присутствовать');
  assert.strictEqual(nodesFull[0], 'sprint-params');
  assert.strictEqual(nodesFull[1], 'capacity', 'Ёмкость — сразу после «Параметры спринта»');
});

test('golden: _deriveDashNodeFromTabLevel — маппинг activeTab/planningLevel → dashNode', () => {
  const { gm } = createHost();
  fx.applyBaseState(gm);
  const derive = function () { return gm.call('_deriveDashNodeFromTabLevel'); };
  const setUi = function (ui) { gm.call('_draftSet', 'ui', ui); };
  const out = {};

  setUi({ activeTab: 'gantt' });                                out.gantt = derive();
  setUi({ activeTab: 'history' });                              out.history = derive();
  setUi({ activeTab: 'planning', planningLevel: 'people' });    out.people = derive();
  setUi({ activeTab: 'planning', planningLevel: 'standup' });   out.standup = derive();
  setUi({ activeTab: 'planning', planningLevel: 'roles' });     out.roles = derive();
  /* нет ui.planningLevel → fallback на _planningLevel-var ядра */
  setUi({ activeTab: 'planning' }); gm.set({ _planningLevel: 'people' });  out.fallbackVarPeople = derive();
  /* нет ui вовсе + _planningLevel дефолтный → planning-roles */
  setUi({}); gm.set({ _planningLevel: 'roles' });               out.defaultRoles = derive();

  checkJsonSnapshot('dash-derive-node', out);
});

test('golden: _setDashNode — подсветка дерева/body-класс/делегация tracker-узлам/persist + reject не-члена', () => {
  const { gm, document, window } = createHost();
  fx.applyBaseState(gm);
  /* дерево в DOM — иначе нечего подсвечивать */
  const tree = gm.call('_buildDashTree');
  document.body.appendChild(tree);

  let syncCalls = 0;
  gm.set({ _syncStateToUrl: function () { syncCalls++; } });

  /* spy на скрытые tracker-узлы + сброс active, чтобы клик-делегация всегда стреляла */
  const clicks = [];
  const wire = function () {
    document.querySelectorAll('.tab-btn').forEach(function (b) {
      b.classList.remove('active');
      b.addEventListener('click', function () { clicks.push('tab:' + b.dataset.tab); });
    });
    document.querySelectorAll('.planning-level-btn').forEach(function (b) {
      b.classList.remove('active');
      b.addEventListener('click', function () { clicks.push('level:' + b.dataset.level); });
    });
  };
  wire();

  const dashnodeClass = function () {
    const m = document.body.className.match(/ssp-dashnode-\S+/);
    return m ? m[0] : null;
  };
  const activeTreeNode = function () {
    const el = tree.querySelector('[data-node].active');
    return el ? el.dataset.node : null;
  };
  const persisted = function () { return (gm.call('_draftGet', 'ui') || {}).dashNode; };

  const out = {};

  gm.call('_setDashNode', 'planning-people');
  out.people = { dashnodeClass: dashnodeClass(), activeNode: activeTreeNode(), persisted: persisted(), clicks: clicks.slice() };

  clicks.length = 0;
  document.querySelectorAll('.tab-btn,.planning-level-btn').forEach(function (b) { b.classList.remove('active'); });
  gm.call('_setDashNode', 'gantt');
  out.gantt = { dashnodeClass: dashnodeClass(), activeNode: activeTreeNode(), persisted: persisted(), clicks: clicks.slice() };

  /* reject: 'share' не в SSP_DASH_NODES → ранний выход, ничего не меняется */
  clicks.length = 0;
  const bodyBefore = document.body.className;
  const persistBefore = persisted();
  gm.call('_setDashNode', 'share');
  out.rejectShare = {
    bodyClassUnchanged: document.body.className === bodyBefore,
    persistUnchanged: persisted() === persistBefore,
    clicks: clicks.slice(),
  };

  out.syncCalls = syncCalls;
  checkJsonSnapshot('dash-set-node', out);
});

test('golden: _buildGlobalDashShell — захват chrome/контекста/навигации в рельс + идемпотентность (#25 Ф2)', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  gm.set({ _mode: 'global' });

  gm.call('_buildGlobalDashShell');
  const rail = document.getElementById('sspRail');
  const has = function (sel) { return !!(rail && rail.querySelector(sel)); };
  const digest = {
    dashExists: !!document.querySelector('.ssp-dash'),
    railChildren: rail ? Array.prototype.map.call(rail.children, function (c) { return c.className; }) : null,
    paneExists: !!document.getElementById('sspPane'),
    toggleExists: !!document.getElementById('sspRailToggle'),
    navHasTree: has('.ssp-rail__nav .ssp-tree'),
    navHasTabs: has('.ssp-rail__nav .tabs'),
    pickerInContext: has('.ssp-rail__context #globalProjectPicker'),
    widgetHeaderInContext: has('.ssp-rail__context #widgetHeader'),
    linksInUtils: has('.ssp-rail__utils .page-header__links'),
    statusBarInUtils: has('.ssp-rail__utils #widgetStatusBarSpoiler'),
    railSprintNameNode: has('#sspRailSprintName'),
  };

  /* идемпотентность — повторный вызов не плодит второй .ssp-dash */
  gm.call('_buildGlobalDashShell');
  digest.dashCountAfterSecond = document.querySelectorAll('.ssp-dash').length;

  assert.ok(digest.dashExists, 'shell must build .ssp-dash');
  checkJsonSnapshot('dash-global-shell', digest);
});
