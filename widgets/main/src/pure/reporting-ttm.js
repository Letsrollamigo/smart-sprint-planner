/* reporting-ttm.js — #50 S3b/S4b. Чистые движки отчётности: A2 «TTM» + потоковые A8/A9 (см. §S4 ниже).
   A2 «TTM» (Lead/Team/Cycle Time):
   медианы длительностей по парам якорных состояний, вычет пауз (состояния+теги), бакеты
   распределения, риск-счётчик «застряло дольше нормы». БЕЗ I/O — оркестровка фетча в
   data/reporting-data.js, разбор activities — в pure/reporting-pure.js.

   Зависимости (workdaysBetween/agingLevel из reporting-pure) ИНЖЕКТЯТСЯ параметром deps —
   модуль остаётся чистым и node-тестируемым, не тянет чужой мост (leaf-слой, B2). Публикует
   __SSP_REPORTING_TTM ДО исполнения IIFE core.js; node-тестируемо (module.exports).

   Терминальная политика = first-close (естественно: первый вход в конец-якорь; reopen не
   продлевает метрику) — отдельной логики не требует, следует из «первого входа» примитива. */

/* Медиана: только конечные числа, копия+сорт asc. Пусто→null; нечётное→середина;
   чётное→среднее двух средних (дробное допустимо — округляет UI). */
function median(nums) {
  var arr = (Array.isArray(nums) ? nums : []).filter(function (n) { return typeof n === 'number' && isFinite(n); });
  if (!arr.length) return null;
  arr = arr.slice().sort(function (a, b) { return a - b; });
  var mid = Math.floor(arr.length / 2);
  return (arr.length % 2) ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
}

/* Раскладка значений по трём корзинам по краям edges=[lo,hi]: v<=lo → le40, lo<v<=hi → mid,
   v>hi → gt120. Имена корзин фиксированы (le40/mid/gt120) — edges параметризованы (дефолт 40/120). */
function bucketize(values, edges) {
  var e = (Array.isArray(edges) && edges.length === 2) ? edges : [40, 120];
  var lo = e[0], hi = e[1];
  var out = { le40: 0, mid: 0, gt120: 0 };
  (Array.isArray(values) ? values : []).forEach(function (v) {
    if (typeof v !== 'number' || !isFinite(v)) return;
    if (v <= lo) out.le40++;
    else if (v <= hi) out.mid++;
    else out.gt120++;
  });
  return out;
}

/* Слияние интервалов [{fromTs,toTs}]: отбрасываем невалидные (toTs<=fromTs / не число),
   сортируем по началу, склеиваем перекрытия/касания. Нужно, чтобы перекрывающиеся паузы
   (состояние+тег в один период) НЕ вычитались дважды. */
function mergeIntervals(intervals) {
  var arr = (Array.isArray(intervals) ? intervals : []).filter(function (iv) {
    return iv && typeof iv.fromTs === 'number' && typeof iv.toTs === 'number' && iv.toTs > iv.fromTs;
  }).map(function (iv) { return { fromTs: iv.fromTs, toTs: iv.toTs }; });
  arr.sort(function (a, b) { return a.fromTs - b.fromTs; });
  var out = [];
  for (var i = 0; i < arr.length; i++) {
    var last = out.length ? out[out.length - 1] : null;
    if (last && arr[i].fromTs <= last.toTs) {
      if (arr[i].toTs > last.toTs) last.toTs = arr[i].toTs;
    } else {
      out.push({ fromTs: arr[i].fromTs, toTs: arr[i].toTs });
    }
  }
  return out;
}

/* Рабочих дней пауз внутри [startTs,endTs]: открытая пауза (toTs=null, ещё в паузе) → до
   endTs; сливаем; клампим каждый интервал к [startTs,endTs]; Σ workdaysBetween по валидным.
   workdaysBetween инжектится (тот же примитив, что и в расчёте брутто) — модуль чист. */
function pauseWorkdays(pauses, startTs, endTs, workdaysBetween) {
  if (typeof startTs !== 'number' || typeof endTs !== 'number' || endTs <= startTs) return 0;
  if (typeof workdaysBetween !== 'function') return 0;
  var resolved = (Array.isArray(pauses) ? pauses : []).map(function (iv) {
    if (!iv || typeof iv.fromTs !== 'number') return null;
    var toTs = (typeof iv.toTs === 'number') ? iv.toTs : endTs;  /* открытая пауза → до конца окна метрики */
    return { fromTs: iv.fromTs, toTs: toTs };
  }).filter(Boolean);
  var merged = mergeIntervals(resolved);
  var total = 0;
  for (var i = 0; i < merged.length; i++) {
    var from = merged[i].fromTs > startTs ? merged[i].fromTs : startTs;
    var to = merged[i].toTs < endTs ? merged[i].toTs : endTs;
    if (to > from) total += workdaysBetween(from, to);
  }
  return total;
}

/* Свёртка единиц счёта: держим эпики + одиночные стори (parent НЕ эпик); стори-детей эпика
   отбрасываем (учитываются внутри эпика). Дедуп по id. issues: [{id,type,parentIsEpic}]. */
function foldChildUnits(issues) {
  var out = [], seen = {};
  (Array.isArray(issues) ? issues : []).forEach(function (u) {
    if (!u || !u.id || seen[u.id]) return;
    var keep = u.type === 'epic' || (u.type === 'story' && !u.parentIsEpic);
    if (keep) { seen[u.id] = true; out.push(u); }
  });
  return out;
}

/* Нормализация incompleteSet (Set|Array) → lookup. У обоих есть forEach(value…). */
function _incLookup(incompleteSet) {
  var m = {};
  if (incompleteSet && typeof incompleteSet.forEach === 'function') {
    incompleteSet.forEach(function (id) { if (id) m[id] = true; });
  }
  return m;
}

/* computeTtm — главный расчёт A2. Чисто; deps={workdaysBetween,agingLevel} инжектятся.
   units          — свёрнутые единицы [{id,type}] (после foldChildUnits).
   anchorEntries  — { id → { stateName → firstTs } } (bulkAnchorTransitions.anchors).
   pauses         — { id → [{fromTs,toTs}] } (состояния+теги, toTs=null = открытая).
   incompleteSet  — Set|Array id с неполной историей (D7) — ИСКЛЮЧАЮТСЯ из медиан.
   config         — { anchors:{lead|team|cycle:{start,end}}, norms:{lead,team,cycle?},
                      buckets:[lo,hi], riskDays, populationMetric }.
   win            — окно ПОПУЛЯЦИИ [fromTs,toTs) (период НЕ режет глубину истории).
   nowTs          — «сейчас» для риск-счётчика (инжектится ⇒ тест детерминирован).
   Возврат { tiles:[{metric,median,n,norm,level}], rows:[{unitType,count,lead,team,cycle}],
     buckets:{le40,mid,gt120}, riskCount, populationCount, incomplete:[id…] }. */
function computeTtm(units, anchorEntries, pauses, incompleteSet, config, win, nowTs, deps) {
  units = Array.isArray(units) ? units : [];
  anchorEntries = anchorEntries || {};
  pauses = pauses || {};
  config = config || {};
  var anchors = config.anchors || {};
  var norms = config.norms || {};
  var buckets = (Array.isArray(config.buckets) && config.buckets.length === 2) ? config.buckets : [40, 120];
  var riskDays = (typeof config.riskDays === 'number') ? config.riskDays : 80;
  var popMetric = config.populationMetric || 'lead';
  var w = win || {};
  var fromTs = (typeof w.fromTs === 'number') ? w.fromTs : -Infinity;
  var toTs = (typeof w.toTs === 'number') ? w.toTs : Infinity;
  var wb = (deps && typeof deps.workdaysBetween === 'function') ? deps.workdaysBetween : function () { return 0; };
  var al = (deps && typeof deps.agingLevel === 'function') ? deps.agingLevel : function () { return 'none'; };
  var now = (typeof nowTs === 'number') ? nowTs : Date.now();
  var incSet = _incLookup(incompleteSet);
  /* O2 (ревью #50): lite-режим для свода B0 — нужна только lead-плитка; rows/buckets/риск-счётчик
     (wb до now по ВСЕМ units — O(лет застрявшей задачи)) не пересчитываем месяцы×системы раз. */
  var lite = !!config.liteLeadOnly;

  /* Метрика настроена, только если ОБА конца пары якорей заданы. */
  function configured(metric) {
    var a = anchors[metric];
    return !!(a && a.start != null && a.end != null);
  }
  /* Длительность метрики для задачи в раб.днях (нетто пауз). Нет одного из входов → null;
     конец раньше старта (first-end < first-start) = аномалия → null; иначе max(0, брутто−паузы).
     Кэш per (id,metric): tiles/rows/buckets звали dur до 3× на пару (O2, ревью #50). */
  var durCache = {};
  function dur(id, metric) {
    var ck = id + '|' + metric;
    if (ck in durCache) return durCache[ck];
    var a = anchors[metric] || {};
    var e2 = anchorEntries[id] || {};
    var s = (a.start != null) ? e2[a.start] : undefined;
    var e = (a.end != null) ? e2[a.end] : undefined;
    var net = null;
    if (typeof s === 'number' && typeof e === 'number' && e >= s) {
      net = wb(s, e) - pauseWorkdays(pauses[id] || [], s, e, wb);
      net = net > 0 ? net : 0;
    }
    durCache[ck] = net;
    return net;
  }
  /* Популяция: вход в КОНЕЦ-якорь популяционной метрики попал в окно [from,to). Окно фильтрует
     ТОЛЬКО по этому входу — никогда по старту (старт может быть за месяцы до окна). */
  var popAnchor = anchors[popMetric] || {};
  function inPopulation(id) {
    if (popAnchor.end == null) return false;
    var endTs = (anchorEntries[id] || {})[popAnchor.end];
    return typeof endTs === 'number' && endTs >= fromTs && endTs < toTs;
  }

  /* Разбиение популяции на usable (в медианы) и incomplete (в отчёт incomplete[]). */
  var usable = [], incompleteInPop = [], seenPop = {};
  units.forEach(function (u) {
    if (!u || !u.id || seenPop[u.id]) return;
    if (!inPopulation(u.id)) return;
    seenPop[u.id] = true;
    if (incSet[u.id]) incompleteInPop.push(u.id);
    else usable.push(u);
  });

  function medianOf(list, metric) {
    if (!configured(metric)) return { median: null, n: 0, vals: [] };
    var vals = [];
    list.forEach(function (u) { var d = dur(u.id, metric); if (d != null) vals.push(d); });
    return { median: median(vals), n: vals.length, vals: vals };
  }

  /* Плитки: по одной на настроенную метрику из [lead,team,cycle] — медиана по ВСЕЙ usable-
     популяции (оба типа). level = agingLevel(median,{red:norm}); null-норма/нет данных → none. */
  var tiles = [];
  (lite ? ['lead'] : ['lead', 'team', 'cycle']).forEach(function (metric) {
    if (!configured(metric)) return;
    var mo = medianOf(usable, metric);
    var norm = (norms[metric] != null) ? norms[metric] : null;
    tiles.push({
      metric: metric,
      median: mo.median,
      n: mo.n,
      norm: norm,
      level: (norm != null && mo.median != null) ? al(mo.median, { red: norm }) : 'none'
    });
  });

  /* Строки таблицы — по типу единицы (эпик/стори), присутствующему в usable-популяции. */
  var rows = [];
  (lite ? [] : ['epic', 'story']).forEach(function (tp) {
    var unitsOfType = usable.filter(function (u) { return u.type === tp; });
    if (!unitsOfType.length) return;
    rows.push({
      unitType: tp,
      count: unitsOfType.length,
      lead: medianOf(unitsOfType, 'lead').median,
      team: medianOf(unitsOfType, 'team').median,
      cycle: medianOf(unitsOfType, 'cycle').median
    });
  });

  /* Бакеты — по Lead-длительностям usable-популяции. */
  var leadVals = (!lite && configured('lead')) ? medianOf(usable, 'lead').vals : [];
  var bucketsOut = bucketize(leadVals, buckets);

  /* Риск-счётчик — по ВСЕМ units (не только популяция): вход в старт-якорь team есть,
     раб.дней с него до now > riskDays, входа в конец-якорь team НЕТ (ещё не доехало). */
  var teamAnchor = anchors.team || {};
  var riskCount = 0, seenRisk = {};
  (lite ? [] : units).forEach(function (u) {
    if (!u || !u.id || seenRisk[u.id]) return;
    seenRisk[u.id] = true;
    var e2 = anchorEntries[u.id] || {};
    var start = (teamAnchor.start != null) ? e2[teamAnchor.start] : undefined;
    if (typeof start !== 'number') return;
    var end = (teamAnchor.end != null) ? e2[teamAnchor.end] : undefined;
    if (typeof end === 'number') return;
    if (wb(start, now) > riskDays) riskCount++;
  });

  return {
    tiles: tiles,
    rows: rows,
    buckets: bucketsOut,
    riskCount: riskCount,
    populationCount: usable.length,
    incomplete: incompleteInPop
  };
}

/* ── §S4 · A8 Bottleneck / A9 Rework — потоковые агрегаты на timelines ──────────────────
   Оба движка читают timelines { id → [{ts,to}…хронологически] } (parseAnchorsChunk) — полную
   траекторию переходов. НЕ новый примитив. flowStates (reportingFlowStates) — УПОРЯДОЧЕННЫЙ
   поток: индекс = позиция статуса; вне потока → undefined (игнор). incomplete (D7) исключаются.
   ⚠️ timelines.to = канон name || localized; flowStates должны совпадать с этим представлением —
   смоук S4d проверит на локализованном инстансе (как S3d для якорей, иначе тихий 0). */
function _flowIndex(flowStates) {
  var idx = Object.create(null), arr = Array.isArray(flowStates) ? flowStates : [];  /* null-proto: честный тест членства для любого имени (__proto__/constructor) */
  for (var i = 0; i < arr.length; i++) { if (arr[i] && idx[arr[i]] === undefined) idx[arr[i]] = i; }
  return idx;
}

/* Санитайз таймлайна: только записи с КОНЕЧНЫМ ts и непустым to. Убирает null/NaN-ts переходы
   (parseAnchorsChunk может протолкнуть ts=null при не-числовом act.timestamp) — иначе (а) null-ts
   в середине роняет leave предыдущего интервала в now = double-count хвоста, (б) NaN-ts проходит
   typeof==='number' и даёт фантомный 0-сэмпл. Порядок исходный (parseAnchorsChunk = хронология). */
function _sanitizeTimeline(tl) {
  var out = [], arr = Array.isArray(tl) ? tl : [];
  for (var i = 0; i < arr.length; i++) {
    var e = arr[i];
    if (e && typeof e.ts === 'number' && isFinite(e.ts) && e.to != null) out.push(e);
  }
  return out;
}

/* computeBottleneck — A8: медиана dwell (раб.дн, нетто пауз) + WIP по каждому статусу потока.
   timelines     — { id → [{ts,to}…] } (усечённые incomplete вне агрегатов).
   pauses        — { id → [{fromTs,toTs}] } (toTs=null = открытая); вычет из dwell-интервала.
   incompleteSet — Set|Array id (D7).
   config        — { flowStates:[…], thresholds:{state→{yellow,red}}, currentStates:{id→state} }.
                   currentStates (полное население из фетча) → точный WIP (в т.ч. задачи без
                   переходов, сидящие в стартовом статусе); нет → fallback = последний .to таймлайна.
   nowTs         — «сейчас»: открытый последний интервал (задача ещё в статусе) → dwell до now.
   deps          — { workdaysBetween, agingLevel } инжектятся (leaf НЕ тянет мост).
   dwell на КАЖДЫЙ визит статуса = отдельный сэмпл (повторный заход при откате = ещё сэмпл).
   Возврат { states:[{state,median,n,wip,level}] (порядок flowStates), populationCount, incomplete:[id] }. */
function computeBottleneck(timelines, pauses, incompleteSet, config, nowTs, deps) {
  timelines = timelines || {}; pauses = pauses || {}; config = config || {};
  var flowStates = Array.isArray(config.flowStates) ? config.flowStates : [];
  var thresholds = config.thresholds || {};
  var hasCurrent = config.currentStates && typeof config.currentStates === 'object' && !Array.isArray(config.currentStates);
  var currentStates = hasCurrent ? config.currentStates : {};
  var idx = _flowIndex(flowStates);
  var wb = (deps && typeof deps.workdaysBetween === 'function') ? deps.workdaysBetween : function () { return 0; };
  var al = (deps && typeof deps.agingLevel === 'function') ? deps.agingLevel : function () { return 'none'; };
  var now = (typeof nowTs === 'number') ? nowTs : Date.now();
  var incSet = _incLookup(incompleteSet);

  var samples = Object.create(null);
  for (var si = 0; si < flowStates.length; si++) { if (samples[flowStates[si]] === undefined) samples[flowStates[si]] = []; }
  var lastTo = Object.create(null), id, i;
  for (id in timelines) {
    if (!Object.prototype.hasOwnProperty.call(timelines, id) || incSet[id]) continue;
    var tl = _sanitizeTimeline(timelines[id]);   /* только валидные {ts finite, to}: чинит null/NaN-ts */
    if (!tl.length) continue;
    for (i = 0; i < tl.length; i++) {
      var st = tl[i].to, enter = tl[i].ts;
      if (idx[st] === undefined) continue;         /* статус вне потока — интервал не сэмплируем (соседи бьются по фактическим ts) */
      var leave = (i + 1 < tl.length) ? tl[i + 1].ts : now;   /* открытый последний интервал → до now */
      if (leave < enter) continue;                 /* аномалия (не хронологично); enter==leave = валидный 0-визит (как same-day) */
      var net = wb(enter, leave) - pauseWorkdays(pauses[id] || [], enter, leave, wb);
      samples[st].push(net > 0 ? net : 0);
    }
    lastTo[id] = tl[tl.length - 1].to;
  }

  /* Население + WIP: currentStates (полное) ИЛИ таймлайны (fallback тестов). */
  var popIds = hasCurrent ? Object.keys(currentStates) : Object.keys(timelines);
  var wip = Object.create(null), populationCount = 0, incomplete = [];
  popIds.forEach(function (pid) {
    if (incSet[pid]) { incomplete.push(pid); return; }
    populationCount++;
    var cur = hasCurrent ? currentStates[pid] : lastTo[pid];
    if (cur != null && idx[cur] !== undefined) wip[cur] = (wip[cur] || 0) + 1;
  });

  var states = flowStates.map(function (s) {
    var vals = samples[s] || [], med = median(vals);
    return { state: s, median: med, n: vals.length, wip: wip[s] || 0,
      level: (med != null) ? al(med, thresholds[s]) : 'none' };
  });
  return { states: states, populationCount: populationCount, incomplete: incomplete };
}

/* computeRework — A9: обратные переходы против порядка потока за окно.
   Переход i (i≥1): из tl[i-1].to → в tl[i].to. Обратный, если ОБА в потоке и idx(to) < idx(from).
   Окно [from,to) по ts перехода (как A1 buildProgressRows). incomplete (D7) исключаются целиком
   (усечённая история → ненадёжная последовательность). Терминальные статусы (Done) ловят reopen,
   только если admin включил их в flowStates. config = { flowStates }; win = { fromTs, toTs } (опц.).
   Возврат { totalBack, issuesWithReopen, populationCount, byTransition:[{from,to,count,issueIds}]↓,
     incomplete:[id] }. Роль-источник/система (мокап) — сегментация вью-слоя по issueIds. */
function computeRework(timelines, incompleteSet, config, win) {
  timelines = timelines || {}; config = config || {};
  var flowStates = Array.isArray(config.flowStates) ? config.flowStates : [];
  var idx = _flowIndex(flowStates);
  var incSet = _incLookup(incompleteSet);
  var w = win || {};
  var from = (typeof w.fromTs === 'number') ? w.fromTs : -Infinity;
  var to = (typeof w.toTs === 'number') ? w.toTs : Infinity;

  var pairs = Object.create(null), totalBack = 0, reopenIds = Object.create(null), populationCount = 0, incomplete = [];
  var id, i;
  for (id in timelines) {
    if (!Object.prototype.hasOwnProperty.call(timelines, id)) continue;
    if (incSet[id]) { incomplete.push(id); continue; }
    var tl = _sanitizeTimeline(timelines[id]);   /* валидные {ts finite, to}: NaN-ts не проходит в окно */
    if (!tl.length) continue;
    populationCount++;
    for (i = 1; i < tl.length; i++) {
      var fromSt = tl[i - 1].to, toSt = tl[i].to, ts = tl[i].ts;
      if (idx[fromSt] === undefined || idx[toSt] === undefined) continue;
      if (idx[toSt] >= idx[fromSt]) continue;                             /* не обратный */
      if (ts < from || ts >= to) continue;                               /* вне окна периода [from,to) */
      var key = fromSt + '→' + toSt;
      if (!pairs[key]) pairs[key] = { from: fromSt, to: toSt, count: 0, ids: Object.create(null) };
      pairs[key].count++; pairs[key].ids[id] = true;
      totalBack++; reopenIds[id] = true;
    }
  }
  var byTransition = Object.keys(pairs).map(function (k) {
    return { from: pairs[k].from, to: pairs[k].to, count: pairs[k].count, issueIds: Object.keys(pairs[k].ids) };
  }).sort(function (a, b) { return b.count - a.count; });
  return { totalBack: totalBack, issuesWithReopen: Object.keys(reopenIds).length,
    populationCount: populationCount, byTransition: byTransition, incomplete: incomplete };
}

var _api = { median: median, bucketize: bucketize, mergeIntervals: mergeIntervals,
  pauseWorkdays: pauseWorkdays, foldChildUnits: foldChildUnits, computeTtm: computeTtm,
  computeBottleneck: computeBottleneck, computeRework: computeRework };

if (typeof window !== 'undefined') {
  try { window.__SSP_REPORTING_TTM = _api; } catch (_) { /* sandboxed write may throw */ }
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = _api;
}
