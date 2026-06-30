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

/* §7/§12 carry-over (E1) — эвристика метки из истории (loader: _sinceTs вход в текущее
   состояние, _prevState откуда) vs дата старта целевого спринта:
   - 'carryover'    («Перенос»)     — вошёл в состояние ДО старта спринта (роль не доделала);
   - 'continuation' («Продолжение») — вошёл В этом спринте из другого состояния (плановый подхват);
   - null — создан в спринте без перехода / нет истории / нет даты старта. */
function carryoverLabel(sinceTs, prev, sprintStart) {
  if (!sinceTs || !sprintStart) return null;
  if (sinceTs < sprintStart) return 'carryover';
  if (prev) return 'continuation';
  return null;
}

function _baseTaskVm(t, paused, sprintStart) {
  return {
    issueId: t.issueId,
    idReadable: t.idReadable || t.issueId || '',
    summary: t.summary || '',
    stateName: t.stateName || '',
    system: t.system || null,
    priority: t.priority || null,
    priorityName: t.priorityName || t.priority || null,   /* #3 — канон для сортировки (value.name) */
    isPaused: !!paused,
    carry: carryoverLabel(t._sinceTs, t._prevState, sprintStart),
  };
}

/* Роле-контекстный taskVM: остаток/нужна-оценка контекстны роли под-секции (§6.2). */
function _roleTaskVm(t, rk, paused, sprintStart) {
  var est = _min(t.estByRole && t.estByRole[rk]);
  var fact = _min(t.factByRole && t.factByRole[rk]) || 0;
  var vm = _baseTaskVm(t, paused, sprintStart);
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
  var ss = s.__sprintStart || null;   /* §7 carry-over — дата старта целевого спринта (домен) */

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
      customerPool.push(_baseTaskVm(t, paused, ss)); counts.pool++; return;
    }
    var zi = zoneByState[st];
    if (zi !== undefined) {                                     // §6.1 зона по маппингу состояние → роль(и) (MANY)
      var zone = zones[zi];
      if (zone.roles.length) {
        zone.roles.forEach(function (r) { r.tasks.push(_roleTaskVm(t, r.roleKey, paused, ss)); });
      } else {
        zone.unassigned.push(_baseTaskVm(t, paused, ss));       // зона замаплена только на неактивные роли (misconfig) — не теряем
      }
      counts.zoneTasks++; return;
    }
    otherBucket.push(_baseTaskVm(t, paused, ss)); counts.other++; // §8 незамапленное (не resolved, не start) → «Прочие» (fail-loud)
  });

  /* #3 — проекция «по ролям»: те же роле-контекстные taskVM из зон, перегруппированные по
     РОЛИ (спойлер = роль, состояние — поле строки). Задача из мульти-ролевой зоны попадает в
     группу КАЖДОЙ своей роли (контракт владельца). Порядок ролей = activeRoles. unassignedTasks —
     задачи зон, замапленных только на неактивные роли (показываем отдельной «—»-группой). */
  var rgMap = {}, roleOrder = [];
  activeRoles.forEach(function (rk) { rgMap[rk] = []; roleOrder.push(rk); });
  var unassignedTasks = [];
  zones.forEach(function (z) {
    z.roles.forEach(function (r) {
      if (!rgMap[r.roleKey]) { rgMap[r.roleKey] = []; roleOrder.push(r.roleKey); }
      r.tasks.forEach(function (t) { rgMap[r.roleKey].push(t); });
    });
    z.unassigned.forEach(function (t) { unassignedTasks.push(t); });
  });
  var roleGroups = roleOrder.map(function (rk) { return { roleKey: rk, tasks: rgMap[rk] || [] }; });

  return {
    customerPool: customerPool, zones: zones,
    roleGroups: roleGroups, unassignedTasks: unassignedTasks,   /* #3 — вид «по ролям» */
    otherBucket: otherBucket, counts: counts,
  };
}

/* #21 слайсы 6/7 — ЧИСТЫЙ VM-builder вида «Дерево» (§5). Вкладывает листья-задачи в ЦЕПОЧКУ
   родителей-контейнеров (task.parentChain ближний→дальний, проставлен loader'ом из вложенных
   cascadeParentLink-связей: Эпик▸Стори▸Таск). Уровень контейнера — из cascadeKindField через
   cascadeLevel3Values (epic-like) / cascadeLevel2Values (story-like). Зона листа точкой (§5):
   пул заказчика / зона по маппингу / прочие. Сироты (нет цепочки) — бакет «Без родителя».
   Агрегат (count + зоны) считается снизу вверх. НЕ зависит от «паровозика» (§5: состояние
   контейнера игнорируем). Глубина гуляет (таск под эпиком без стори — норма).

   Вход task — контракт loader'а: { …, parentChain:[{issueId,summary,kind}, …]|[] } (fallback
   на одиночный parent). Выход: { roots:[node], orphans:[leaf], counts }, где
   node = { issueId,summary,kind,level, tasks:[leaf], children:[node], agg:{count,zones:[{zone,count}]} },
   leaf = { issueId,idReadable,summary,system,priority,isPaused,zone }. */
function _leafVm(t, paused, zone, sprintStart) {
  return {
    issueId: t.issueId, idReadable: t.idReadable || t.issueId || '',
    summary: t.summary || '', system: t.system || null, priority: t.priority || null,
    isPaused: !!paused, zone: zone,
    carry: carryoverLabel(t._sinceTs, t._prevState, sprintStart),
  };
}
function buildTreeVm(tasks, settings) {
  var s = settings || {};
  var zonesCfg = Array.isArray(s.backlogZones) ? s.backlogZones : [];
  var startStates = Array.isArray(s.backlogStartStates) ? s.backlogStartStates : [];
  var pauseTags = Array.isArray(s.backlogPauseTags) ? s.backlogPauseTags : [];
  var pauseStates = Array.isArray(s.backlogPauseStates) ? s.backlogPauseStates : [];
  var lvl2 = Array.isArray(s.cascadeLevel2Values) ? s.cascadeLevel2Values : [];
  var lvl3 = Array.isArray(s.cascadeLevel3Values) ? s.cascadeLevel3Values : [];

  var startSet = {}; startStates.forEach(function (x) { startSet[x] = true; });
  var zoneSet = {}; zonesCfg.forEach(function (z) { if (z && z.state) zoneSet[z.state] = true; });
  var pauseTagSet = {}; pauseTags.forEach(function (x) { pauseTagSet[x] = true; });
  var pauseStateSet = {}; pauseStates.forEach(function (x) { pauseStateSet[x] = true; });
  var ss = s.__sprintStart || null;   /* §7 carry-over — дата старта целевого спринта */

  function zoneOf(st) {
    if (startSet[st]) return '__pool';                 // пул заказчика
    if (zoneSet[st]) return st;                        // зона по маппингу (= имя состояния)
    return '__other';                                  // §8 незамапленное
  }
  function levelOf(kind) {
    if (!kind) return null;
    if (lvl3.indexOf(kind) >= 0) return 3;             // epic-like
    if (lvl2.indexOf(kind) >= 0) return 2;             // story-like
    return null;
  }

  var nodes = {}, order = [], orphans = [], hasParent = {};
  var counts = { containers: 0, tasks: 0, hidden: 0, paused: 0 };

  function ensureNode(c) {
    var n = nodes[c.issueId];
    if (!n) {
      n = nodes[c.issueId] = { issueId: c.issueId, summary: c.summary || c.issueId, kind: c.kind || null,
                               level: levelOf(c.kind), tasks: [], children: [], childSet: {}, zoneCount: {} };
      order.push(c.issueId); counts.containers++;
    } else {
      if ((!n.summary || n.summary === n.issueId) && c.summary) n.summary = c.summary;
      if (!n.kind && c.kind) { n.kind = c.kind; n.level = levelOf(c.kind); }
    }
    return n;
  }

  (tasks || []).forEach(function (t) {
    if (!t) return;
    if (t.isResolved) { counts.hidden++; return; }     // §8 resolved → скрыт
    var st = t.stateName || '';
    var paused = pauseStateSet[st] === true
      || (Array.isArray(t.tags) && t.tags.some(function (tag) { return pauseTagSet[tag] === true; }));
    if (paused) counts.paused++;
    var leaf = _leafVm(t, paused, zoneOf(st), ss);
    counts.tasks++;

    /* §5 — цепочка родителей ближний→дальний (parentChain); fallback на одиночный parent. */
    var chain = Array.isArray(t.parentChain) ? t.parentChain
      : (t.parent && t.parent.issueId ? [t.parent] : []);
    if (!chain.length) { orphans.push(leaf); return; }

    for (var i = 0; i < chain.length; i++) {
      var node = ensureNode(chain[i]);
      if (i + 1 < chain.length) {
        var parentNode = ensureNode(chain[i + 1]);
        if (!parentNode.childSet[node.issueId]) { parentNode.childSet[node.issueId] = true; parentNode.children.push(node.issueId); }
        hasParent[node.issueId] = true;
      }
    }
    var dp = nodes[chain[0].issueId];   // лист — к ПРЯМОМУ родителю
    dp.tasks.push(leaf);
    dp.zoneCount[leaf.zone] = (dp.zoneCount[leaf.zone] || 0) + 1;
  });

  /* финализация снизу вверх: агрегат count + зоны контейнера = свои листья ⊕ потомки. */
  function finalize(id) {
    var n = nodes[id];
    var zones = {}; Object.keys(n.zoneCount).forEach(function (z) { zones[z] = n.zoneCount[z]; });
    var count = n.tasks.length;
    var children = n.children.map(function (cid) {
      var fc = finalize(cid);
      count += fc.agg.count;
      fc.agg.zones.forEach(function (zc) { zones[zc.zone] = (zones[zc.zone] || 0) + zc.count; });
      return fc;
    });
    return {
      issueId: n.issueId, summary: n.summary, kind: n.kind, level: n.level,
      tasks: n.tasks, children: children,
      agg: { count: count, zones: Object.keys(zones).map(function (z) { return { zone: z, count: zones[z] }; }) },
    };
  }
  var roots = order.filter(function (id) { return !hasParent[id]; }).map(finalize);

  return { roots: roots, orphans: orphans, counts: counts };
}

var _api = { buildBacklogVm: buildBacklogVm, buildTreeVm: buildTreeVm, carryoverLabel: carryoverLabel };

if (typeof window !== 'undefined') {
  try { window.__SSP_BACKLOG_VM_PURE = _api; } catch (_) { /* sandboxed write may throw */ }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = _api;
}
