'use strict';
/* widgets/main/src/domain/backlog-view.js
   #21 слайс 3 — render-делегатор вида «по зонам». Берёт transient _backlogPool
   (loader, слайс 2b) + настройки, собирает доменный VM (buildBacklogVm, слайс 2a),
   обогащает презентационными лейблами/спросом и зовёт мост mountAt(container, vm).
   Вся render-логика — здесь; React-компонент (react/backlog-view.jsx) тупой.
   Empty/no-config — vanilla-баннеры (как empty-ветка gantt-view.js).

   Deps приходят АРГУМЕНТОМ на каждый вызов (фабрика _backlogViewDeps() в монолите):
     { t, diag, buildBacklogVm, getActiveRoles, roleLabel, fmtHoursOnly, pageSize,
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

  /* vm-pure читает settings.activeRoles (КЛЮЧИ ролей) — прокидываем, не мутируя _settings. */
  var vmSettings = Object.assign({}, settings, { activeRoles: activeKeys });
  var pool = deps.state.getBacklogPool() || [];
  var dom = deps.buildBacklogVm(pool, vmSettings);

  /* Спрос по ролям (§6.3, СТАБ слайса 3: Σ остатков, без потолка — ёмкость = слайс 5).
     rem в МИНУТАХ (vm-pure: est − fact); потребитель форматирует fmtHoursOnly. */
  var demand = {};
  dom.zones.forEach(function (z) {
    z.roles.forEach(function (rr) {
      rr.tasks.forEach(function (t) {
        if (t.rem != null) demand[rr.roleKey] = (demand[rr.roleKey] || 0) + t.rem;
      });
    });
  });
  var capacityStrip = activeKeys
    .filter(function (k) { return demand[k] != null; })
    .map(function (k) { return { roleKey: k, label: roleLabels[k] || k, demand: demand[k] || 0 }; });

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
    otherBucket: dom.otherBucket,
    counts: dom.counts,
    ytBase: (typeof deps.state.getYtBase === 'function' ? deps.state.getYtBase() : '') || '',
    pageSize: deps.pageSize || 25,
    fmt: deps.fmtHoursOnly,
    onError: function (e) { try { deps.diag('backlog render error: ' + (e && e.message ? e.message : e), 'err'); } catch (_) {} },
    i18n: {
      empty: deps.t('backlogNoTasks'),
      customerPool: deps.t('backlogCustomerPool'),
      other: deps.t('backlogOther'),
      showMore: deps.t('backlogShowMore'),
      needsPoker: deps.t('backlogNeedsPoker'),
      paused: deps.t('backlogPaused'),
      toSprint: deps.t('backlogToSprint'),
      colKey: deps.t('thId'),
      colSystem: deps.t('thSystem'),
      colSummary: deps.t('thTitle'),
      colEstimate: deps.t('thEstimate'),
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
