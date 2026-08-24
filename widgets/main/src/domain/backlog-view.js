'use strict';
/* widgets/main/src/domain/backlog-view.js
   #21 слайс 3 — render-делегатор вида «по зонам». Берёт transient _backlogPool
   (loader, слайс 2b) + настройки, собирает доменный VM (buildBacklogVm, слайс 2a),
   обогащает презентационными лейблами/спросом и зовёт мост mountAt(container, vm).
   Вся render-логика — здесь; React-компонент (react/backlog-view.jsx) тупой.
   Empty/no-config — vanilla-баннеры (как empty-ветка gantt-view.js).

   Deps приходят АРГУМЕНТОМ на каждый вызов (фабрика _backlogViewDeps() в монолите):
     { t, diag, buildBacklogVm, getActiveRoles, roleLabel, fmtHoursOnly, pageSize,
       onToSprint, onFilterApply, onAssist, userFilter, getApprovedCapacity,
       targetSprint, targetSprintName,
       state:{ getSettings, getBacklogPool, getYtBase } }.
   Мост window.__SSP_BACKLOG_VIEW. Golden — render-shell.golden.test.js
   (контракт «модуль → __SSP_BACKLOG_MOUNT»; React-сторона — живьём). */

function renderBacklog(deps) {
  var container = document.getElementById('backlogContainer');
  if (!container) return;
  var emptyEl = document.getElementById('backlogEmpty');
  var loadingEl = document.getElementById('backlogLoading');
  var mount = (typeof window !== 'undefined' && window.__SSP_BACKLOG_MOUNT) || null;
  if (loadingEl) loadingEl.classList.add('hidden');

  var settings = deps.state.getSettings() || {};
  var zonesCfg = Array.isArray(settings.backlogZones) ? settings.backlogZones : [];
  /* §8 fail-loud — РЕАЛИЗОВАН на уровне ДАННЫХ: незамапленные состояния → бакет
     «Прочие» (otherBucket, vm-pure), resolved → counts.hidden. Schema-level warning
     «новое состояние бандла не замаплено — донастройте» (сверка fieldState-бандла с
     маппингом) — ОТЛОЖЕН: требует loadProjectFields-бандла; данных-уровень уже не
     теряет задачи молча. ponytail: добрать при стабилизации вида (до bump'а эпика). */
  /* нет маппинга зон → не угадываем: баннер «донастройте», демонтаж вида. */
  if (!zonesCfg.length) {
    if (mount && typeof mount.unmountAt === 'function') mount.unmountAt(container);
    if (emptyEl) emptyEl.classList.remove('hidden');
    return;
  }
  if (emptyEl) emptyEl.classList.add('hidden');

  var activeRoles = (typeof deps.getActiveRoles === 'function') ? (deps.getActiveRoles() || []) : [];
  var activeKeys = activeRoles.map(function (r) { return r.key; });
  var roleLabels = {};
  activeRoles.forEach(function (r) { roleLabels[r.key] = deps.roleLabel(r); });

  /* vm-pure читает settings.activeRoles (КЛЮЧИ ролей) — прокидываем, не мутируя _settings.
     __sprintStart — дата старта целевого спринта для carry-over (§7, эвристика в vm-pure). */
  var vmSettings = Object.assign({}, settings, {
    activeRoles: activeKeys,
    __sprintStart: (deps.targetSprint && deps.targetSprint.dateStart) || null,
  });
  var pool = deps.state.getBacklogPool() || [];
  var dom = deps.buildBacklogVm(pool, vmSettings);
  /* §5 слайс 6 — дерево строим только в tree-режиме (на том же пуле; связи уже в пуле). */
  var viewMode = (deps.viewMode === 'tree') ? 'tree' : 'zones';
  var tree = (viewMode === 'tree' && typeof deps.buildTreeVm === 'function') ? deps.buildTreeVm(pool, vmSettings) : null;

  /* Спрос по ролям (§6.3): Σ остатков. rem в МИНУТАХ (vm-pure: est − fact). Источник —
     roleGroups (#3 — уже перегруппировано по роли; задача мульти-роли учтена в каждой). */
  var demand = {};
  (dom.roleGroups || []).forEach(function (g) {
    g.tasks.forEach(function (t) {
      if (t.rem != null) demand[g.roleKey] = (demand[g.roleKey] || 0) + t.rem;
    });
  });
  /* §6.3 ёмкость (слайс 5): спрос vs предложение (ресурс роли целевого спринта через
     адаптер-розетку; null → деградация «только спрос»). Перелимит = спрос > ёмкость. */
  var target = deps.targetSprint || null;
  var capFn = (typeof deps.getApprovedCapacity === 'function') ? deps.getApprovedCapacity : function () { return null; };
  var capacityStrip = activeKeys
    .filter(function (k) { return demand[k] != null; })
    .map(function (k) {
      var cap = capFn(k, target);
      return {
        roleKey: k, label: roleLabels[k] || k, demand: demand[k] || 0,
        capacity: (typeof cap === 'number') ? cap : null,
        over: (typeof cap === 'number') && (demand[k] || 0) > cap,
      };
    });

  var vm = {
    capacityStrip: capacityStrip,
    customerPool: dom.customerPool,
    zones: dom.zones.map(function (z) {
      return {
        stateName: z.stateName,
        multiRole: z.roles.length > 1,
        roles: z.roles.map(function (rr) {
          return { roleKey: rr.roleKey, label: roleLabels[rr.roleKey] || rr.roleKey, tasks: rr.tasks };
        }),
        unassigned: z.unassigned,
      };
    }),
    /* #3 — вид «по ролям»: спойлер = роль, состояние — колонка строки. */
    roleGroups: (dom.roleGroups || []).map(function (g) {
      return { roleKey: g.roleKey, label: roleLabels[g.roleKey] || g.roleKey, tasks: g.tasks };
    }),
    unassignedTasks: dom.unassignedTasks || [],
    otherBucket: dom.otherBucket,
    counts: dom.counts,
    ytBase: (typeof deps.state.getYtBase === 'function' ? deps.state.getYtBase() : '') || '',
    pageSize: deps.pageSize || 25,
    fmt: deps.fmtHoursOnly,
    onToSprint: (typeof deps.onToSprint === 'function') ? deps.onToSprint : null, /* слайс 4 — раскладка «→ в спринт» */
    /* слайс 5 — шапка вкладки: заголовок, целевой спринт, query-assist фильтр (§7/§10). */
    title: deps.t('tabBacklog'),
    targetSprintName: deps.targetSprintName || null,
    userFilter: deps.userFilter || '',
    onFilterApply: (typeof deps.onFilterApply === 'function') ? deps.onFilterApply : null,
    onAssist: (typeof deps.onAssist === 'function') ? deps.onAssist : null,
    /* §10 слайс 6 — переключатель вида + дерево */
    viewMode: viewMode,
    onViewMode: (typeof deps.onViewMode === 'function') ? deps.onViewMode : null,
    tree: tree,
    unmappedStates: Array.isArray(deps.unmappedStates) ? deps.unmappedStates : null, /* §8 schema-warn */
    onError: function (e) { try { deps.diag('backlog render error: ' + (e && e.message ? e.message : e), 'err'); } catch (_) {} },
    i18n: {
      empty: deps.t('backlogNoTasks'),
      customerPool: deps.t('backlogCustomerPool'),
      other: deps.t('backlogOther'),
      showMore: deps.t('backlogShowMore'),
      needsPoker: deps.t('backlogNeedsPoker'),
      paused: deps.t('backlogPaused'),
      toSprint: deps.t('backlogToSprint'),
      targetSprintLabel: deps.t('backlogTargetSprintLabel'),
      noTarget: deps.t('backlogNoTarget'),
      filterPlaceholder: deps.t('phPickQuery'),
      viewZones: deps.t('backlogViewZones'),
      viewTree: deps.t('backlogViewTree'),
      noParent: deps.t('backlogNoParent'),
      unmappedWarn: deps.t('backlogUnmappedWarn'),
      unmappedSchema: deps.t('backlogUnmappedSchema'),
      carryover: deps.t('backlogCarryover'),
      continuation: deps.t('backlogContinuation'),
      inSprint: deps.t('backlogInSprint'),          /* #polish — задача уже в составе любого спринта */
      inSprintHint: deps.t('backlogInSprintHint'),
      infoLinksTitle: deps.t('backlogInfoLinks'),   /* #74 ⚖4 — заголовок тултипа бейджа связей */
      colKey: deps.t('thId'),
      colSystem: deps.t('thSystem'),
      colSummary: deps.t('thTitle'),
      colEstimate: deps.t('thEstimate'),
      colState: deps.t('thState'),       /* #3 — колонка «Состояние» в виде «по ролям» */
      colPriority: deps.t('thPriority'),  /* #3 — кликабельная сортировка по приоритету */
    },
  };
  if (mount && typeof mount.mountAt === 'function') mount.mountAt(container, vm);
}

var api = { renderBacklog: renderBacklog };

if (typeof window !== 'undefined') {
  try { window.__SSP_BACKLOG_VIEW = api; } catch (_) { /* sandboxed write may throw */ }
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
