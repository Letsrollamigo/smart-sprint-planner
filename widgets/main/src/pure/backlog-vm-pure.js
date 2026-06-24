'use strict';
/* widgets/main/src/pure/backlog-vm-pure.js
   #21 слайс 2 — ЧИСТЫЙ VM-builder пула бэклога. Детерминированно из уже-полученных
   задач + настроек (Слайс 1), БЕЗ сети и без хранения (§4 спеки «вычисляемо»).
   Публикует window.__SSP_BACKLOG_VM_PURE.

   carry-over (E1 «Перенос» vs «Продолжение», E2) — НЕ здесь: требует activities API +
   целевой роли спринта, живёт в слайсе 3/5 (R4 разведки). Здесь — только §4/§6.1/§8.

   Вход task (контракт, который отдаёт async-loader слайса 2b после маппинга customFields):
     { issueId, idReadable, summary, stateName, isResolved, system, priority,
       tags:[name], estByRole:{roleKey:minutes|null}, factByRole:{roleKey:minutes|null} }
   stateName = value.name состояния (НЕ локализованное) — матчится с backlogZones[].state.

   Выход — buildBacklogVm: { customerPool, zones:[{stateName,roles:[{roleKey,tasks}],unassigned}],
                             otherBucket, counts }. */

function _min(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }

function _baseTaskVm(t, paused) {
  return {
    issueId: t.issueId,
    idReadable: t.idReadable || t.issueId || '',
    summary: t.summary || '',
    stateName: t.stateName || '',
    system: t.system || null,
    priority: t.priority || null,
    isPaused: !!paused,
  };
}

/* Роле-контекстный taskVM: остаток/нужна-оценка контекстны роли под-секции (§6.2). */
function _roleTaskVm(t, rk, paused) {
  var est = _min(t.estByRole && t.estByRole[rk]);
  var fact = _min(t.factByRole && t.factByRole[rk]) || 0;
  var vm = _baseTaskVm(t, paused);
  vm.roleKey = rk;
  vm.est = est;
  vm.fact = fact;
  vm.rem = (est == null) ? null : Math.max(0, est - fact);   // §6.3 остаток = план − факт
  vm.needsPoker = (est == null);                             // §6.2 «нужна покер-оценка» (контекстна роли)
  return vm;
}

/* tasks + settings → доменный VM пула. Чистая функция: вход не мутируется. */
function buildBacklogVm(tasks, settings) {
  var s = settings || {};
  var zonesCfg = Array.isArray(s.backlogZones) ? s.backlogZones : [];
  var startStates = Array.isArray(s.backlogStartStates) ? s.backlogStartStates : [];
  var pauseTags = Array.isArray(s.backlogPauseTags) ? s.backlogPauseTags : [];
  var pauseStates = Array.isArray(s.backlogPauseStates) ? s.backlogPauseStates : [];
  var activeRoles = Array.isArray(s.activeRoles) ? s.activeRoles : [];

  var startSet = {}; startStates.forEach(function (x) { startSet[x] = true; });
  var pauseTagSet = {}; pauseTags.forEach(function (x) { pauseTagSet[x] = true; });
  var pauseStateSet = {}; pauseStates.forEach(function (x) { pauseStateSet[x] = true; });
  var activeSet = {}; activeRoles.forEach(function (x) { activeSet[x] = true; });

  /* state → индекс зоны (first-match; backend гарантирует unique state). Под-роли —
     только активные роли зоны (§6.1: показываем только активные роли проекта). */
  var zoneByState = {};
  var zones = zonesCfg.map(function (z, i) {
    var st = z && z.state;
    var roleKeys = (z && Array.isArray(z.roles) ? z.roles : []).filter(function (rk) { return activeSet[rk] === true; });
    if (st && zoneByState[st] === undefined) zoneByState[st] = i;
    return {
      stateName: st || '',
      roles: roleKeys.map(function (rk) { return { roleKey: rk, tasks: [] }; }),
      unassigned: [],
    };
  });

  var customerPool = [], otherBucket = [];
  var counts = { pool: 0, zoneTasks: 0, other: 0, hidden: 0, paused: 0 };

  (tasks || []).forEach(function (t) {
    if (!t) return;
    if (t.isResolved) { counts.hidden++; return; }              // §8 resolved → авто-скрыт (не теряем молча — счётчик)
    var st = t.stateName || '';
    /* пауза (§8): тег ∈ backlogPauseTags ИЛИ состояние ∈ backlogPauseStates. Висяк
       помечаем флагом (отдельная группа — v2 B5), не прячем. */
    var paused = pauseStateSet[st] === true
      || (Array.isArray(t.tags) && t.tags.some(function (tag) { return pauseTagSet[tag] === true; }));
    if (paused) counts.paused++;

    if (startSet[st] === true) {                                // §4 пул заказчика (стартовая зона; приоритет над зонами)
      customerPool.push(_baseTaskVm(t, paused)); counts.pool++; return;
    }
    var zi = zoneByState[st];
    if (zi !== undefined) {                                     // §6.1 зона по маппингу состояние → роль(и) (MANY)
      var zone = zones[zi];
      if (zone.roles.length) {
        zone.roles.forEach(function (r) { r.tasks.push(_roleTaskVm(t, r.roleKey, paused)); });
      } else {
        zone.unassigned.push(_baseTaskVm(t, paused));           // зона замаплена только на неактивные роли (misconfig) — не теряем
      }
      counts.zoneTasks++; return;
    }
    otherBucket.push(_baseTaskVm(t, paused)); counts.other++;   // §8 незамапленное (не resolved, не start) → «Прочие» (fail-loud)
  });

  return { customerPool: customerPool, zones: zones, otherBucket: otherBucket, counts: counts };
}

var _api = { buildBacklogVm: buildBacklogVm };

if (typeof window !== 'undefined') {
  try { window.__SSP_BACKLOG_VM_PURE = _api; } catch (_) { /* sandboxed write may throw */ }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = _api;
}
