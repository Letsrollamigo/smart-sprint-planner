/* reporting-rollup.js — #50 B0 «Свод» (контур B, управленческий roll-up). Чистые примитивы
   ПОМЕСЯЧНОЙ реконструкции + (далее B0-c) агрегатор рядов свода. Отдельный leaf-модуль:
   reporting-pure.js на потолке (640, «жирный»), reporting-ttm.js — своя тема (TTM/поток).

   B0 = 4 метрики × N месяцев (monthlyWindows) × система/агрегат → медиана/скаляр за месяц →
   Recharts LineChart. Оконные метрики (TTM/План-факт) фильтруют популяцию окном месяца напрямую.
   СНИМКИ (Бэклог/Bottleneck) исторического значения в данных НЕ имеют → реконструкция AS-OF конца
   месяца (owner: полная, не приблизительная):
     - Bottleneck — обрезка таймлайна < конца месяца + nowTs=конец → computeBottleneck клипает dwell
       сам (Case-C «ещё не двинулась» не даёт dwell). Реконструкция состояния НЕ нужна.
     - Бэклог — as-of open-set: состояние задачи на конец месяца ∈ backlog-состояния? Свежая «To do»,
       ушедшая ПОЗЖЕ, обязана попасть в бэклог ПРОШЛОГО месяца → нужно начальное состояние (.from
       первого перехода). Отсюда stateAsOf.

   БЕЗ I/O. Публикует __SSP_REPORTING_ROLLUP ДО IIFE core.js; node-тестируемо (module.exports). */
'use strict';

/* truncateTimelineAsOf(timeline, asOfTs) → подмассив переходов строго ДО asOfTs (ts < asOfTs).
   Полуоткрыто: переход РОВНО в asOfTs (= начало следующего месяца) относится к следующему месяцу →
   исключён. Нефинитный ts (sanitize) отбрасывается — его нельзя разместить во времени. Порядок
   сохранён. Для Bottleneck as-of: этот выход + computeBottleneck(nowTs=asOfTs) даёт dwell на конец
   месяца (открытый последний интервал клипается в asOfTs). Битый вход → []. */
function truncateTimelineAsOf(timeline, asOfTs) {
  if (!Array.isArray(timeline) || typeof asOfTs !== 'number' || !isFinite(asOfTs)) return [];
  var out = [];
  for (var i = 0; i < timeline.length; i++) {
    var e = timeline[i];
    if (e && typeof e.ts === 'number' && isFinite(e.ts) && e.ts < asOfTs) out.push(e);
  }
  return out;
}

/* stateAsOf(timeline, createdTs, currentState, asOfTs) → имя состояния задачи НА МОМЕНТ asOfTs,
   или null (ещё не создана / неизвестно). timeline: [{ts,from,to}] хронологически (parseAnchorsChunk).
   Ступенчатая функция состояния: [created, t1) = from(t1) [начальное]; [t1, t2) = to(t1); …;
   [tLast, now) = to(tLast) = current. Алгоритм для asOfTs:
     1. createdTs > asOfTs (если известно) → null (задачи ещё нет).
     2. есть переход с ts < asOfTs → .to последнего такого (состояние держится до asOfTs). [Case B]
     3. переходы есть, но ВСЕ ts ≥ asOfTs → .from ПЕРВОГО (начальное, держалось от создания). [Case C]
        .from===null («впервые установлено», нет removed) → null (значения ещё не было).
     4. переходов нет вовсе → currentState (не менялось). [Case D]
   Полуоткрыто (ts < asOfTs): переход РОВНО в asOfTs ещё не применён на конец текущего месяца.
   СИММЕТРИЧНО — createdTs >= asOfTs → null: задача, созданная РОВНО на границе месяца (asOfTs =
   начало следующего), принадлежит СЛЕДУЮЩЕМУ месяцу, не текущему (та же полуоткрытость, что у
   переходов; иначе off-by-one — засчитали бы будущую задачу в бэклог прошлого месяца). Нефинитный
   ts игнорируется. Битый asOfTs → null. */
function stateAsOf(timeline, createdTs, currentState, asOfTs) {
  if (typeof asOfTs !== 'number' || !isFinite(asOfTs)) return null;
  if (typeof createdTs === 'number' && isFinite(createdTs) && createdTs >= asOfTs) return null;
  var tl = Array.isArray(timeline) ? timeline : [];
  var lastBefore = null, firstEver = null;
  for (var i = 0; i < tl.length; i++) {
    var e = tl[i];
    if (!e || typeof e.ts !== 'number' || !isFinite(e.ts)) continue;
    if (firstEver === null || e.ts < firstEver.ts) firstEver = e;              /* самый ранний (ties → первый) */
    if (e.ts < asOfTs && (lastBefore === null || e.ts >= lastBefore.ts)) lastBefore = e; /* последний ДО asOfTs */
  }
  if (lastBefore) return (lastBefore.to != null && lastBefore.to !== '') ? lastBefore.to : null;
  if (firstEver) return (firstEver.from != null && firstEver.from !== '') ? firstEver.from : null;
  return (currentState != null && currentState !== '') ? currentState : null;
}

/* ── B0-c · computeRollupSeries — помесячный свод 4 метрик × система/агрегат ─────────────
   Реконструирует ВСЁ из КОНСТАНТНО-фетченных сырых данных (окна месяцев фильтруют популяцию /
   as-of конец месяца для снимков). Движки ИНЪЕКТИРУЮТСЯ (deps) — pure→pure запрещён. Скаляр на
   (месяц × система):
     ttm        — медиана Lead (окно по входу в lead.end; реюз computeTtm)
     planfact   — task-weighted ср. ЗНАКОВОЕ расхождение % (популяция lead.end∈месяц; computePlanFact)
     bottleneck — max медиана dwell (as-of конец месяца: обрезка таймлайна; computeBottleneck)
     backlog    — Σ ЧЧ И max «месяцев» по ролям (as-of open-set stateAsOf + as-of оценки; buildBacklogRows)
   Система '__all__' = агрегат-проект (владелец: система + агрегат). Светофор — реюз нормативов. */
var ALL_SYS = '__all__';

/* Нормализация incomplete (D7) в null-proto lookup {id:true}. Принимает Array | ES6 Set | {id:true}
   — консистентно с _incLookup движков (reporting-ttm.js), иначе Set молча не исключался бы (индексный
   доступ inc[id] на Set = undefined → тихая порча, адверс-баг C). */
function _incSet(inc) {
  var s = Object.create(null);
  if (!inc) return s;
  if (Array.isArray(inc)) { for (var i = 0; i < inc.length; i++) if (inc[i]) s[inc[i]] = true; return s; }
  if (typeof inc.forEach === 'function') { inc.forEach(function (id) { if (id) s[id] = true; }); return s; }  /* Set */
  if (typeof inc === 'object') { for (var k in inc) if (inc[k]) s[k] = true; return s; }                     /* {id:true} */
  return s;
}
function _distinctSystems(issues, systemOf) {
  var seen = Object.create(null), out = [{ key: ALL_SYS }];
  (Array.isArray(issues) ? issues : []).forEach(function (u) {
    var s = u && u.id ? (systemOf || {})[u.id] : null;
    if (s != null && s !== '' && !seen[s]) { seen[s] = true; out.push({ key: s }); }
  });
  return out;
}
/* Членство в системе. Сравнение СТРОГОЕ (без `||null` — иначе falsy-значение системы 0/false
   роняется в null и не матчит собственный раздел = фантом, адверс-баг D). */
function _inSys(id, systemOf, sysKey) {
  if (sysKey === ALL_SYS) return true;
  return (systemOf || {})[id] === sysKey;
}
/* As-of инстант окна для СНИМОК-метрик (Bottleneck/Бэклог): прошлый месяц → его конец (w.toTs);
   ТЕКУЩИЙ (неполный) месяц → now, а НЕ будущий конец (иначе открытый интервал dwell мерится до
   будущего = раздутая новейшая точка, адверс-баг B). now невалиден → w.toTs (fail-safe). */
function _asOfMs(w, nowTs) {
  return (typeof nowTs === 'number' && isFinite(nowTs)) ? Math.min(w.toTs, nowTs) : w.toTs;
}
function _findLead(tiles) {
  var arr = Array.isArray(tiles) ? tiles : [];
  for (var i = 0; i < arr.length; i++) if (arr[i] && arr[i].metric === 'lead') return arr[i];
  return null;
}

function _ttmSeries(input, deps, months, systems) {
  var t = input.ttm || {}, cfg = t.config || {}, norms = cfg.norms || {};
  var norm = (norms.lead != null) ? norms.lead : null;
  var eng = { workdaysBetween: deps.workdaysBetween, agingLevel: deps.agingLevel };
  /* O2 (ревью #50): своду нужна только lead-медиана — rows/buckets/risk не считаем месяцы×системы раз. */
  var liteCfg = Object.assign({}, cfg, { liteLeadOnly: true });
  /* timelines пробрасываем ТОЛЬКО при last-stable-close (v3.2.0): под first-close lite-режим
     реплей не читает — не гоняем его месяцы×системы вхолостую. */
  var tls = (cfg.terminalPolicy === 'last-stable-close') ? t.timelines : undefined;
  var lines = {};
  systems.forEach(function (sys) {
    /* фильтр по системе месяц-инвариантен — hoist из цикла месяцев (O2) */
    var units = (t.units || []).filter(function (u) { return u && u.id && _inSys(u.id, input.systemOf, sys.key); });
    lines[sys.key] = months.map(function (w) {
      var res = deps.computeTtm(units, t.anchorEntries, t.pauses, t.incompleteSet, liteCfg, w, input.nowTs, eng, tls);
      var tile = _findLead(res.tiles), val = tile ? tile.median : null;
      return { value: val, level: (norm != null && val != null) ? deps.agingLevel(val, { red: norm }) : 'none' };
    });
  });
  return { unit: 'days', norm: norm, lines: lines };
}

function _planfactSeries(input, deps, months, systems) {
  var p = input.planfact || {}, thr = (typeof p.threshold === 'number' && p.threshold > 0) ? p.threshold : 20;
  var leadEnd = p.leadEndBy || {}, lines = {};
  systems.forEach(function (sys) {
    /* система месяц-инвариантна — предфильтр до цикла месяцев (O2, ревью #50) */
    var sysIssues = (p.issues || []).filter(function (iss) {
      return iss && iss.id && _inSys(iss.id, input.systemOf, sys.key) && typeof leadEnd[iss.id] === 'number';
    });
    lines[sys.key] = months.map(function (w) {
      var issues = sysIssues.filter(function (iss) {
        var le = leadEnd[iss.id];                                  /* популяция = вход в lead.end ∈ окно (как A5/A2) */
        return le >= w.fromTs && le < w.toTs;
      });
      var res = deps.computePlanFact({ issues: issues, asOf: p.asOf, workItems: p.workItems,
        roleExecutors: p.roleExecutors, roles: p.roles, threshold: thr, incomplete: p.incomplete });
      /* портфель = взвешенное по taskCount среднее ролевых средних: вес задачи = число её
         укомплектованных ролей (пары роль×задача), НЕ строго per-task (уточнено, ревью #50) */
      var sum = 0, n = 0;
      (res.rollups || []).forEach(function (r) {
        if (typeof r.avgVariancePct === 'number' && r.taskCount > 0) { sum += r.avgVariancePct * r.taskCount; n += r.taskCount; }
      });
      var val = n > 0 ? sum / n : null;
      return { value: val, level: (val != null) ? deps.agingLevel(Math.abs(val), { yellow: thr / 2, red: thr }) : 'none' };
    });
  });
  return { unit: 'pct', norm: thr, lines: lines };
}

function _bottleneckSeries(input, deps, months, systems) {
  var b = input.bottleneck || {}, cfg = b.config || {};
  var eng = { workdaysBetween: deps.workdaysBetween, agingLevel: deps.agingLevel };
  var lines = {};
  systems.forEach(function (sys) {
    /* принадлежность системе месяц-инвариантна — список id один раз на систему (O2, ревью #50) */
    var sysIds = [], sid;
    for (sid in (b.timelines || {})) {
      if (Object.prototype.hasOwnProperty.call(b.timelines, sid) && _inSys(sid, input.systemOf, sys.key)) sysIds.push(sid);
    }
    lines[sys.key] = months.map(function (w) {
      var asOf = _asOfMs(w, input.nowTs);                          /* текущий месяц → now, не будущий конец */
      var trunc = Object.create(null), id;
      for (var ix = 0; ix < sysIds.length; ix++) {
        id = sysIds[ix];
        trunc[id] = truncateTimelineAsOf(b.timelines[id], asOf);   /* as-of конец месяца / now */
      }
      var res = deps.computeBottleneck(trunc, b.pauses, b.incompleteSet, cfg, asOf, eng);
      var best = null;                                            /* «узкое место» = состояние с max медианой dwell */
      (res.states || []).forEach(function (s) { if (typeof s.median === 'number' && (best === null || s.median > best.median)) best = s; });
      return { value: best ? best.median : null, level: best ? best.level : 'none' };
    });
  });
  return { unit: 'days', norm: null, lines: lines };
}

function _backlogSeries(input, deps, months, systems) {
  var bl = input.backlog || {}, norm = (typeof bl.normMonths === 'number' && bl.normMonths > 0) ? bl.normMonths : 6;
  var inc = _incSet(bl.incompleteSet), backlogStates = bl.backlogStates || {};
  var roles = Array.isArray(bl.roles) ? bl.roles : [];
  var rolesLite = roles.map(function (r) { return { key: r.key, label: r.label }; });
  var linesMonths = {}, linesHours = {};
  systems.forEach(function (sys) {
    linesMonths[sys.key] = []; linesHours[sys.key] = [];
    months.forEach(function (w) {
      var asOf = _asOfMs(w, input.nowTs);                          /* текущий месяц → now, не будущий конец */
      var perIssue = [];
      (bl.issues || []).forEach(function (iss) {
        if (!iss || !iss.id || inc[iss.id] || !_inSys(iss.id, input.systemOf, sys.key)) return;   /* D7 */
        var st = stateAsOf((bl.stateTimelines || {})[iss.id] || [], iss.created,
          (bl.currentStates || {})[iss.id], asOf);                 /* строгий < asOf */
        if (st == null || !backlogStates[st]) return;             /* не в бэклоге на конец месяца */
        var est = Object.create(null);
        roles.forEach(function (role) {
          var tl = ((bl.estTimelines || {})[iss.id] || {})[role.fieldId] || [];
          var cur = ((bl.currentEst || {})[iss.id] || {})[role.fieldId];
          est[role.key] = deps.asOfPeriodMinutes(tl, cur, asOf - 1);   /* <= asOf-1 = < asOf: согласовано со stateAsOf (баг A) */
        });
        perIssue.push({ est: est });
      });
      var res = deps.buildBacklogRows(perIssue, rolesLite, bl.monthlyCapHours, norm);
      var totalHours = 0, maxMonths = null;
      (res.rows || []).forEach(function (r) {
        totalHours += r.sumHours || 0;
        if (typeof r.months === 'number' && (maxMonths === null || r.months > maxMonths)) maxMonths = r.months;
      });
      linesHours[sys.key].push({ value: totalHours, level: 'none' });   /* ЧЧ — объём, без светофора */
      linesMonths[sys.key].push({ value: maxMonths,
        level: (maxMonths == null) ? 'none' : (maxMonths >= norm ? 'over' : (maxMonths >= norm * 0.85 ? 'warn' : 'ok')) });
    });
  });
  return { months: { unit: 'months', norm: norm, lines: linesMonths }, hours: { unit: 'hours', norm: null, lines: linesHours } };
}

function computeRollupSeries(input, deps) {
  input = input || {}; deps = deps || {};
  var months = (typeof deps.monthlyWindows === 'function') ? deps.monthlyWindows(input.N || 6, input.nowTs) : [];
  var systems = _distinctSystems(input.issues, input.systemOf);
  var bl = _backlogSeries(input, deps, months, systems);
  return {
    months: months,
    systems: systems.map(function (s) { return s.key; }),
    metrics: {
      ttm: _ttmSeries(input, deps, months, systems),
      planfact: _planfactSeries(input, deps, months, systems),
      bottleneck: _bottleneckSeries(input, deps, months, systems),
      backlogMonths: bl.months,
      backlogHours: bl.hours
    }
  };
}

var _api = { truncateTimelineAsOf: truncateTimelineAsOf, stateAsOf: stateAsOf,
  computeRollupSeries: computeRollupSeries, ALL_SYS: ALL_SYS };

if (typeof window !== 'undefined') {
  try { window.__SSP_REPORTING_ROLLUP = _api; } catch (_) { /* sandboxed write may throw */ }
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = _api;
}
