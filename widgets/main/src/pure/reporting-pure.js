/* reporting-pure.js — #50 S1b. Чистый разбор Activities API для примитива
   bulkStateTransitions. Из массива activities одного чанка (до 25 задач, категория
   CustomFieldCategory, reverse=true → новейшие первыми) достаёт per-issue «последний вход в
   ТЕКУЩИЙ статус» (дата+значение) + детектит обрезку/недобор + собирает диагностику лимитов.

   D7 (арх-спека §3) — анти-тихая-порча: «точная цифра ИЛИ явный сигнал неполноты — НИКОГДА
   молча неверная». Гарантированный путь БЕЗ пагинации (она — гипотеза до замера §12.3):
     - hitTop = chunk.length >= $top ⇒ чанк потенциально обрезан.
     - chunk starvation (catch Gemini): при общем $top на 25 задач одна гиперактивная задача
       забьёт лимит, и по остальным история молча вернётся неполной ДАЖЕ при length<$top.
       Поэтому сигнал = per-issue-per-field недобор: не нашли перехода по задаче И чанк упёрся
       в лимит ⇒ её данные НЕПОЛНЫ (incomplete). Не нашли, но всё влезло ⇒ статус с создания.

   БЕЗ I/O — оркестровка фетча/чанкинга в data/reporting-data.js. Публикует
   __SSP_REPORTING_PURE ДО исполнения IIFE core.js; node-тестируемо (module.exports). */

/* Идентификация State-активности: приоритет по field.id (не локализуется, универсально);
   fallback — по $type StateBundleElement добавленного значения (паттерн _fetchGanttStateHistory). */
function _isStateActivity(act, fieldId) {
  var actFieldId = (act && act.field && act.field.id) || '';
  if (fieldId) return actFieldId === fieldId;
  var addedArr = (act && Array.isArray(act.added)) ? act.added : (act && act.added ? [act.added] : []);
  var s = addedArr[0];
  return !!(s && s.$type === 'StateBundleElement');
}

function _valName(v) { return v ? (v.localizedName || v.name || '') : ''; }

/* Разбор одного чанка. activities — массив (reverse=true, новейшие первыми). chunkIds —
   idReadable задач чанка. opts: { fieldId, topLimit } (topLimit=$top для детекта обрезки).
   Возвращает: transitions {id→{enteredAt,toState,fromState}} (новейший вход в текущий статус),
   incomplete [id…] (не найдено + чанк обрезан → неполно), noTransition [id…] (не найдено, чанк
   не обрезан → статус с создания), diag {activitiesReturned,hitTop,perIssueMax,issuesWithTransition}. */
function parseStateChunk(activities, chunkIds, opts) {
  opts = opts || {};
  var fieldId = opts.fieldId || '';
  var topLimit = opts.topLimit || 0;
  var acts = Array.isArray(activities) ? activities : [];
  var hitTop = topLimit > 0 && acts.length >= topLimit;
  var transitions = {};
  var perIssueCount = {};
  var i, act, issueId;
  for (i = 0; i < acts.length; i++) {
    act = acts[i];
    if (!act || !act.target) continue;
    issueId = act.target.idReadable;
    if (!issueId) continue;
    perIssueCount[issueId] = (perIssueCount[issueId] || 0) + 1;
    if (transitions[issueId]) continue;              /* уже взяли новейший (reverse=true) */
    if (!_isStateActivity(act, fieldId)) continue;
    var addedArr   = Array.isArray(act.added)   ? act.added   : (act.added   ? [act.added]   : []);
    var removedArr = Array.isArray(act.removed) ? act.removed : (act.removed ? [act.removed] : []);
    if (!addedArr[0] && !removedArr[0]) continue;
    transitions[issueId] = {
      enteredAt: (typeof act.timestamp === 'number') ? act.timestamp : null,
      toState:   _valName(addedArr[0]),
      fromState: _valName(removedArr[0])
    };
  }
  var incomplete = [], noTransition = [], perIssueMax = 0, withTransition = 0, k;
  for (k in perIssueCount) { if (perIssueCount[k] > perIssueMax) perIssueMax = perIssueCount[k]; }
  for (k in transitions) withTransition++;
  var ids = Array.isArray(chunkIds) ? chunkIds : [];
  for (i = 0; i < ids.length; i++) {
    if (transitions[ids[i]]) continue;
    if (hitTop) incomplete.push(ids[i]);             /* D7: не нашли + упёрлись в лимит → неполно */
    else noTransition.push(ids[i]);                  /* не нашли, но всё влезло → статус с создания */
  }
  return {
    transitions: transitions,
    incomplete: incomplete,
    noTransition: noTransition,
    diag: { activitiesReturned: acts.length, hitTop: hitTop, perIssueMax: perIssueMax, issuesWithTransition: withTransition }
  };
}

/* ── A2 TTM: разбор входов в ЯКОРНЫЕ состояния + таймлайн переходов (S3b) ──────────────
   Как parseStateChunk, но инвертированный: activities — reverse=true (новейшие первыми),
   OVERWRITE на каждом совпадении ⇒ по завершении цикла стоит СТАРЕЙШИЙ вход = ПЕРВЫЙ
   (хронологически) вход в статус («первый вход = последнее совпадение», reopen-safe: задача
   входила в старт-якорь дважды → останется самый ранний). Плюс собираем ПОЛНЫЙ упорядоченный
   таймлайн переходов per-issue (для извлечения интервалов пауз-состояний в data-слое).
   opts: { fieldId, topLimit, anchorStates:[имена целевых состояний-якорей] }.

   ANCHOR-AWARE D7 (арх-спека §3, ИНВЕРСИЯ parseStateChunk): для A2 старейший (старт-якорь)
   вход — ПЕРВАЯ жертва обрезки $top (reverse=true отдаёт новейшие 300, режет ХВОСТ истории).
   Классификатор parseStateChunk (новейший вход, обрезкой не задевается) здесь НЕприменим.
   Правило sound-over-precise: если чанк упёрся в лимит (hitTop) — по КАЖДОЙ задаче чанка мы
   НЕ можем доказать, что видели её историю до начала (более ранний невыбранный вход в
   старт-якорь возможен, в т.ч. при reopen) ⇒ вся задача incomplete. Лучше пометить неполной,
   чем отдать слишком свежий (заниженный) старт. hitTop нет ⇒ вся история влезла ⇒ первые
   входы достоверны, incomplete пуст.
   Возвращает { anchors:{id→{stateName→firstTs}}, timelines:{id→[{ts,to}…хронологически]},
     incomplete:[id…], diag:{activitiesReturned,hitTop,perIssueMax,issuesWithAnchor} }. */
function parseAnchorsChunk(activities, chunkIds, opts) {
  opts = opts || {};
  var fieldId = opts.fieldId || '';
  var topLimit = opts.topLimit || 0;
  var anchorSet = {};
  (Array.isArray(opts.anchorStates) ? opts.anchorStates : []).forEach(function (s) { if (s) anchorSet[s] = true; });
  var acts = Array.isArray(activities) ? activities : [];
  var hitTop = topLimit > 0 && acts.length >= topLimit;
  var anchors = {};        /* id → { stateName → firstTs } (OVERWRITE → по завершении старейший) */
  var timelinesRev = {};   /* id → [{ts,to}…] в порядке обхода (новейшие первыми) */
  var perIssueCount = {};
  var i, act, issueId;
  for (i = 0; i < acts.length; i++) {
    act = acts[i];
    if (!act || !act.target) continue;
    issueId = act.target.idReadable;
    if (!issueId) continue;
    perIssueCount[issueId] = (perIssueCount[issueId] || 0) + 1;
    if (!_isStateActivity(act, fieldId)) continue;
    var addedArr = Array.isArray(act.added) ? act.added : (act.added ? [act.added] : []);
    var av = addedArr[0] || {};
    var nm = av.name || null, loc = _valName(av);     /* канон name + локализованное имя (YT: Done/Готово) */
    var to = nm || loc || null;                       /* null = ОЧИСТКА State-поля (added пуст, removed есть) */
    var remArr = Array.isArray(act.removed) ? act.removed : (act.removed ? [act.removed] : []);
    var rv = remArr[0] || null;                       /* прежнее состояние (removed): для as-of реконструкции B0 */
    var from = rv ? (rv.name || _valName(rv)) : null; /* канон name приоритетно (как .to); null = впервые установлено */
    if (to == null && from == null) continue;         /* ни added, ни removed — не переход State вовсе */
    var ts = (typeof act.timestamp === 'number') ? act.timestamp : null;
    if (!timelinesRev[issueId]) timelinesRev[issueId] = [];
    /* Очистку (to=null) ЭМИТИМ (D7): as-of реконструкция вернёт null, а не сталое состояние; консьюмеры
       (computeBottleneck/Rework idx[to], anchor name-матч) null-safe — переход с to=null они игнорируют. */
    timelinesRev[issueId].push({ ts: ts, from: from, to: to });   /* from/to = канон name приоритетно (pm.states хранят name) */
    /* якорь матчится по name ИЛИ localizedName — на локализованном инстансе YT иначе тихий 0. */
    var akey = (nm && anchorSet[nm]) ? nm : (loc && anchorSet[loc]) ? loc : null;
    if (akey && ts !== null) {
      if (!anchors[issueId]) anchors[issueId] = {};
      var prev = anchors[issueId][akey];              /* min-по-времени: старейший (первый) вход */
      if (prev === undefined || ts < prev) anchors[issueId][akey] = ts;
    }
  }
  /* Таймлайны — в хронологический порядок (обход был новейшие→старейшие). */
  var timelines = {}, k;
  for (k in timelinesRev) timelines[k] = timelinesRev[k].slice().reverse();
  /* D7 anchor-aware: hitTop ⇒ вся задача чанка incomplete (старт-якорь мог быть срезан хвостом). */
  var incomplete = [], perIssueMax = 0, withAnchor = 0;
  for (k in perIssueCount) { if (perIssueCount[k] > perIssueMax) perIssueMax = perIssueCount[k]; }
  for (k in anchors) withAnchor++;
  var ids = Array.isArray(chunkIds) ? chunkIds : [];
  if (hitTop) { for (i = 0; i < ids.length; i++) incomplete.push(ids[i]); }
  return {
    anchors: anchors,
    timelines: timelines,
    incomplete: incomplete,
    diag: { activitiesReturned: acts.length, hitTop: hitTop, perIssueMax: perIssueMax, issuesWithAnchor: withAnchor }
  };
}

/* ── A7 Aging: расчёт «дней в статусе» + флаг порога (S1c) ────────────────────────────
   MVP: рабочие дни = будни (Пн-Пт, UTC). Производственный календарь (праздники/перенесённые
   субботы, ssp_calendar) — refinement. Паузы (reportingPauseMarkers) — отдельный слайс. */
const _DAY_MS = 86400000;
function _isWeekend(ms) { var d = new Date(ms).getUTCDay(); return d === 0 || d === 6; }
function _utcDay(ms) { return Math.floor(ms / _DAY_MS) * _DAY_MS; }

/* Рабочих дней (будни) прошло с fromTs по toTs: считаем будни в (fromDay, toDay]. Вход в
   статус сегодня → 0. null/некорректный вход или toTs<=fromTs → 0. Cap 20000 дней
   (защита от битой даты — ~55 лет, недостижимо на реальных данных).
   O2 (ревью #50): closed-form вместо цикла-по-дням с Date-аллокацией на каждый день — функция
   сидит в мультипликативном горячем пути B0 (задачи × месяцы × системы). Семантика идентична. */
const _WD_TAIL = [0, 1, 2, 2, 2, 3, 4];   /* эпоха (день 0) = четверг: префикс-суммы будней [Чт,Пт,Сб,Вс,Пн,Вт,Ср] */
function _weekdaysUpTo(dayIdx) {        /* будни среди дней [0..dayIdx] от эпохи */
  var n = dayIdx + 1, q = Math.floor(n / 7), r = n - q * 7;
  return q * 5 + _WD_TAIL[r];
}
function workdaysBetween(fromTs, toTs) {
  if (typeof fromTs !== 'number' || typeof toTs !== 'number' || toTs <= fromTs) return 0;
  var fromIdx = Math.floor(fromTs / _DAY_MS), endIdx = Math.floor(toTs / _DAY_MS);
  if (endIdx - fromIdx > 20000) endIdx = fromIdx + 20000;   /* паритет старого guard'а */
  if (endIdx <= fromIdx) return 0;
  return _weekdaysUpTo(endIdx) - _weekdaysUpTo(fromIdx);
}

/* Флаг порога для статуса: band = { yellow, red } (раб.дн, любое поле опц.). days > red →
   'over'; days > yellow → 'warn'; иначе 'ok'. Порога нет (band пуст) → 'none' (не мониторим). */
function agingLevel(days, band) {
  if (!band || typeof band !== 'object') return 'none';
  var hasY = typeof band.yellow === 'number', hasR = typeof band.red === 'number';
  if (!hasY && !hasR) return 'none';
  if (hasR && days > band.red) return 'over';
  if (hasY && days > band.yellow) return 'warn';
  return 'ok';
}

/* Сборка строк A7 из активных задач + вывода примитива + порогов. Чисто (детерминировано).
   activeIssues: [{ id, summary, state, created }]. primitiveOut: { transitions:{id→{enteredAt}},
   noTransition:[id] }. incompleteSet: Set/массив id с неполными данными (D7 — в расчёт НЕ идут).
   thresholds: { state→{yellow,red} }. Возвращает { rows:[{id,summary,state,days,level,enteredAt}]
   ↓ по days, incomplete:[id…] }. enteredAt = дата перехода ИЛИ created (статус с создания). */
function buildAgingRows(activeIssues, primitiveOut, incompleteSet, thresholds, nowTs) {
  var issues = Array.isArray(activeIssues) ? activeIssues : [];
  var po = primitiveOut || {};
  var trans = po.transitions || {};
  var noTrans = {};
  (Array.isArray(po.noTransition) ? po.noTransition : []).forEach(function (id) { noTrans[id] = true; });
  var incSet = {};
  /* Set|Array (ревью #50): у обоих есть forEach — проверка по .length молча игнорировала ES6 Set */
  var incSrc = (incompleteSet && typeof incompleteSet.forEach === 'function') ? incompleteSet : (po.incomplete || []);
  incSrc.forEach(function (id) { if (id) incSet[id] = true; });
  var th = thresholds || {};
  var now = (typeof nowTs === 'number') ? nowTs : Date.now();
  var rows = [], incomplete = [];
  for (var i = 0; i < issues.length; i++) {
    var iss = issues[i]; if (!iss || !iss.id) continue;
    if (incSet[iss.id]) { incomplete.push(iss.id); continue; }
    var t = trans[iss.id];
    var enteredAt = (t && typeof t.enteredAt === 'number') ? t.enteredAt
      : (noTrans[iss.id] && typeof iss.created === 'number' ? iss.created : null);
    if (enteredAt === null) { incomplete.push(iss.id); continue; }  /* нет честной даты → неполно (D7) */
    var days = workdaysBetween(enteredAt, now);
    rows.push({ id: iss.id, summary: iss.summary || '', state: iss.state || '',
      days: days, level: agingLevel(days, th[iss.state]), enteredAt: enteredAt });
  }
  rows.sort(function (a, b) { return b.days - a.days; });
  return { rows: rows, incomplete: incomplete };
}

/* ── A1 Прогресс: строки «перешло в целевой статус за период» (S2) ─────────────────────
   Вход: targetIssues (задачи В целевых статусах) [{id,summary,state,created}] + вывод примитива
   + окно периода win {fromTs,toTs} (полуоткрытое [from,to), D9). enteredAt = дата входа в
   ТЕКУЩИЙ (целевой) статус (примитив) ИЛИ created (вход не найден, но история полна). В окно
   попадают лишь переходы внутри [from,to); incomplete (D7) и переходы вне окна исключаются.
   Ярлык = statusLabels[state] ИЛИ имя статуса. Сорт по дате перехода ↓ (свежие сверху). Чисто. */
function buildProgressRows(targetIssues, primitiveOut, incompleteSet, statusLabels, win) {
  var issues = Array.isArray(targetIssues) ? targetIssues : [];
  var po = primitiveOut || {};
  var trans = po.transitions || {};
  var noTrans = {};
  (Array.isArray(po.noTransition) ? po.noTransition : []).forEach(function (id) { noTrans[id] = true; });
  var incSet = {};
  /* Set|Array (ревью #50): у обоих есть forEach — проверка по .length молча игнорировала ES6 Set */
  var incSrc = (incompleteSet && typeof incompleteSet.forEach === 'function') ? incompleteSet : (po.incomplete || []);
  incSrc.forEach(function (id) { if (id) incSet[id] = true; });
  var labels = statusLabels || {};
  var w = win || {};
  var from = (typeof w.fromTs === 'number') ? w.fromTs : -Infinity;
  var to   = (typeof w.toTs === 'number') ? w.toTs :  Infinity;
  var rows = [], incomplete = [];
  for (var i = 0; i < issues.length; i++) {
    var iss = issues[i]; if (!iss || !iss.id) continue;
    if (incSet[iss.id]) { incomplete.push(iss.id); continue; }
    var t = trans[iss.id];
    var enteredAt = (t && typeof t.enteredAt === 'number') ? t.enteredAt
      : (noTrans[iss.id] && typeof iss.created === 'number' ? iss.created : null);
    if (enteredAt === null) { incomplete.push(iss.id); continue; }  /* нет честной даты → неполно (D7) */
    if (enteredAt < from || enteredAt >= to) continue;              /* переход вне окна периода */
    rows.push({ id: iss.id, summary: iss.summary || '', state: iss.state || '', enteredAt: enteredAt,
      label: (labels[iss.state] != null ? labels[iss.state] : (iss.state || '')) });
  }
  rows.sort(function (a, b) { return b.enteredAt - a.enteredAt; });
  return { rows: rows, incomplete: incomplete };
}

/* ── A4 Трудозатраты: агрегация нативных workItems по (человек, роль) + «кто не списал» (S5a) ──
   items         — [{issueId,author,dateTs,minutes}] (bulkWorkItems).
   roleExecutors — { issueId → { roleKey → executorLogin } } — per-task исполнители из userField*
                   (вью-слой строит из полей отобранных задач). Роль workitem'а = роль, чей
                   исполнитель задачи == автор (ПЕРВОЕ совпадение); нет совпадения → null (не опр.).
   incompleteSet — id задач с неполными данными (D7) — исключаются целиком.
   Возврат { rows:[{author,roleKey,minutes,days}] ↓минуты, noLog:[{author,roleKey}] (исполнители
     отобранных задач без записей), totalMinutes, authorCount, incomplete:[id] }.
   days = число distinct UTC-дней с записью у (человек+роль). Чисто. */
function buildWorkloadRows(items, roleExecutors, incompleteSet) {
  roleExecutors = roleExecutors || {};
  var incSet = {};
  var incArr = (incompleteSet && incompleteSet.length !== undefined) ? incompleteSet : [];
  for (var a = 0; a < incArr.length; a++) { if (incArr[a]) incSet[incArr[a]] = true; }
  var acc = Object.create(null);   /* "author\u0000roleKey" → {author,roleKey,minutes,daySet} */
  var incomplete = [], seenInc = {};
  var arr = Array.isArray(items) ? items : [];
  for (var i = 0; i < arr.length; i++) {
    var it = arr[i];
    if (!it || !it.issueId || !it.author) continue;
    if (incSet[it.issueId]) { if (!seenInc[it.issueId]) { seenInc[it.issueId] = true; incomplete.push(it.issueId); } continue; }
    var roleKey = null, execs = roleExecutors[it.issueId] || {};
    for (var rk in execs) { if (execs[rk] && execs[rk] === it.author) { roleKey = rk; break; } }  /* первое совпадение */
    var key = it.author + '\u0000' + (roleKey || '');
    if (!acc[key]) acc[key] = { author: it.author, roleKey: roleKey, minutes: 0, daySet: Object.create(null) };
    if (typeof it.minutes === 'number' && isFinite(it.minutes) && it.minutes > 0) acc[key].minutes += it.minutes;
    if (typeof it.dateTs === 'number' && isFinite(it.dateTs)) acc[key].daySet[Math.floor(it.dateTs / _DAY_MS)] = true;
  }
  var rows = Object.keys(acc).map(function (k) {
    return { author: acc[k].author, roleKey: acc[k].roleKey, minutes: acc[k].minutes, days: Object.keys(acc[k].daySet).length };
  }).sort(function (x, y) { return y.minutes - x.minutes; });

  /* «Кто не списал»: (исполнитель, роль) на отобранных задачах без записей за период. */
  var logged = Object.create(null);
  rows.forEach(function (r) { if (r.minutes > 0 && r.roleKey) logged[r.author + '\u0000' + r.roleKey] = true; });
  var noLogSet = Object.create(null), noLog = [], id, rk2;
  for (id in roleExecutors) {
    if (incSet[id]) continue;
    var e2 = roleExecutors[id] || {};
    for (rk2 in e2) {
      var who = e2[rk2]; if (!who) continue;
      var nk = who + '\u0000' + rk2;
      if (logged[nk] || noLogSet[nk]) continue;
      noLogSet[nk] = true; noLog.push({ author: who, roleKey: rk2 });
    }
  }
  var totalMinutes = 0, authors = Object.create(null);
  rows.forEach(function (r) { totalMinutes += r.minutes; authors[r.author] = true; });
  return { rows: rows, noLog: noLog, totalMinutes: totalMinutes, authorCount: Object.keys(authors).length, incomplete: incomplete };
}

/* ── #50 S5b: A5 План-факт — as-of реплей значения ПЕРИОД-поля оценки ──────────────────
   Числовые (period, .minutes) изменения полей оценки лежат в ТОЙ ЖЕ категории
   CustomFieldCategory, что и переходы состояний (раньше просто отфильтровывались _isStateActivity).
   parseAsOfPeriodChunk собирает per-issue-per-field хронологию изменений period-значения
   [{ts,from,to}] (минуты; from/to = removed/added .minutes, null = поле было пусто). Поле —
   СТРОГО по field.id (имя локализуется на RU-инстансе); .minutes — скаляр, локализации НЕ имеет
   (в отличие от enum-значений — name-vs-localizedName здесь неприменимо).
   D7 anchor-aware как parseAnchorsChunk, но ИНВЕРСИЯ причины: as-of ts = старт-якорь (старый) ⇒
   реконструкция идёт НАЗАД от текущего значения (нужны переходы ПОСЛЕ ts = новейшие, срез хвоста
   истории их НЕ трогает) — однако общий $top на 25 задач × ВСЕ cf-поля мог обрезать и свежие
   (starvation) ⇒ hitTop ⇒ весь чанк incomplete (sound-over-precise).
   opts: { fieldIds:[id…], topLimit }.
   → { timelines:{id→{fieldId→[{ts,from,to}]}}, incomplete:[id…], diag:{activitiesReturned,hitTop,perIssueMax} }. */
function _periodMin(v) {
  var x = Array.isArray(v) ? v[0] : v;
  if (typeof x === 'number') return isFinite(x) ? x : null;         /* YT: period added/removed = СКАЛЯР-минуты (подтверждено смоуком S5b) */
  return (x && typeof x.minutes === 'number') ? x.minutes : null;   /* defensive: {minutes}-форма (иные версии/presentation-поля) */
}
function parseAsOfPeriodChunk(activities, chunkIds, opts) {
  opts = opts || {};
  var fieldSet = Object.create(null);
  (Array.isArray(opts.fieldIds) ? opts.fieldIds : []).forEach(function (f) { if (f) fieldSet[f] = true; });
  var topLimit = opts.topLimit || 0;
  var acts = Array.isArray(activities) ? activities : [];
  var hitTop = topLimit > 0 && acts.length >= topLimit;
  var revById = Object.create(null);          /* id → {fieldId → [{ts,from,to}] (новейшие первыми)} */
  var perIssueCount = Object.create(null);
  var i, act, issueId, fid;
  for (i = 0; i < acts.length; i++) {
    act = acts[i];
    if (!act || !act.target) continue;
    issueId = act.target.idReadable;
    if (!issueId) continue;
    perIssueCount[issueId] = (perIssueCount[issueId] || 0) + 1;
    fid = (act.field && act.field.id) || '';
    if (!fid || !fieldSet[fid]) continue;     /* только отслеживаемые поля оценки, идентификация по id */
    var ts = (typeof act.timestamp === 'number') ? act.timestamp : null;
    if (ts === null) continue;
    var to = _periodMin(act.added), from = _periodMin(act.removed);
    if (to === null && from === null) continue;   /* не period-изменение (пустые added+removed) */
    if (!revById[issueId]) revById[issueId] = Object.create(null);
    if (!revById[issueId][fid]) revById[issueId][fid] = [];
    revById[issueId][fid].push({ ts: ts, from: from, to: to });
  }
  var timelines = Object.create(null), k, f;
  for (k in revById) {
    timelines[k] = Object.create(null);
    for (f in revById[k]) timelines[k][f] = revById[k][f].slice().reverse();   /* → хронологический */
  }
  var incomplete = [], perIssueMax = 0;
  for (k in perIssueCount) { if (perIssueCount[k] > perIssueMax) perIssueMax = perIssueCount[k]; }
  var ids = Array.isArray(chunkIds) ? chunkIds : [];
  if (hitTop) { for (i = 0; i < ids.length; i++) incomplete.push(ids[i]); }
  return { timelines: timelines, incomplete: incomplete,
    diag: { activitiesReturned: acts.length, hitTop: hitTop, perIssueMax: perIssueMax } };
}

/* asOfPeriodMinutes(timeline, currentMin, asOfTs) — значение period-поля (минуты) на момент asOfTs.
   timeline = [{ts,from,to}] хронологически (from/to = .minutes|null). Реконструкция НАЗАД от
   текущего: значение на asOfTs = `from` САМОГО РАННЕГО перехода с ts > asOfTs (значение ДО первого
   изменения после среза); таких переходов нет ⇒ после asOfTs не менялось ⇒ текущее. asOfTs не
   число ⇒ currentMin. Строгое ts > asOfTs: изменение РОВНО на asOfTs считается уже применённым. */
function asOfPeriodMinutes(timeline, currentMin, asOfTs) {
  var cur = (typeof currentMin === 'number') ? currentMin : null;
  if (typeof asOfTs !== 'number' || !isFinite(asOfTs)) return cur;   /* NaN-ts не проваливает в min-скан (fail-safe) */
  var tl = Array.isArray(timeline) ? timeline : [];
  var best = null;                              /* самый ранний переход с ts > asOfTs */
  for (var i = 0; i < tl.length; i++) {
    var e = tl[i];
    if (!e || typeof e.ts !== 'number' || e.ts <= asOfTs) continue;
    if (best === null || e.ts < best.ts) best = e;
  }
  if (!best) return cur;
  return (typeof best.from === 'number') ? best.from : null;
}

/* computePlanFact(input) — #50 S5b-ii A5 План-факт («точность оценки» = скорость роли). На КАЖДУЮ
   (задача, роль-с-исполнителем): asOf = as-of оценка роли (минуты, bulkAsOfEstimates на lead.start),
   fact = Σ нативных workItems задачи, атрибутированных роли (автор == исполнитель роли, ПЕРВОЕ
   совпадение — как buildWorkloadRows: один человек = одна роль на задаче, без двойного счёта),
   variancePct = (fact−asOf)/asOf×100. Guard asOf<=0|null → задача вне метрики (÷0), учтена в
   noEstimate. incomplete (D7 — вход = ОБЪЕДИНЕНИЕ incomplete всех примитивов: якорь∪asOf∪workItems) —
   вне. Плитка роли: avgVariancePct = ЗНАКОВОЕ среднее по валидным
   задачам (знак = направление недо/переоценки); overCount = |variancePct|>threshold; level =
   светофор по |avg| (бэнды порог/2, порог — owner-locked). Детальные строки — ТОЛЬКО
   |variancePct|>threshold, level по |variancePct| (бэнды порог, 2×порог), сорт ↓|variancePct|.
   null-proto; NaN-safe. Единый источник «скорости роли» — #40 переиспользует (мокап-футнот).
   input: { issues:[{id,summary}], asOf:{id→{fieldId→min|null}}, workItems:[{issueId,author,minutes}],
     roleExecutors:{id→{roleKey→login}}, roles:[{key,label,fieldId}], incomplete:[id…], threshold:num }.
   → { rollups:[{roleKey,label,avgVariancePct,overCount,taskCount,noEstimate,level}],
       rows:[{id,summary,roleKey,roleLabel,asOfMin,factMin,variancePct,level}], incompleteCount, populationCount }. */
function computePlanFact(input) {
  input = input || {};
  var issues = Array.isArray(input.issues) ? input.issues : [];
  var asOf = input.asOf || {};
  var roleExecutors = input.roleExecutors || {};
  var roles = Array.isArray(input.roles) ? input.roles : [];
  var threshold = (typeof input.threshold === 'number' && isFinite(input.threshold) && input.threshold > 0) ? input.threshold : 20;
  var incSet = Object.create(null);
  (Array.isArray(input.incomplete) ? input.incomplete : []).forEach(function (id) { if (id) incSet[id] = true; });

  /* fact per (issueId → roleKey): workItem атрибутируется ПЕРВОЙ роли, чей исполнитель == автор. */
  var factByIssueRole = Object.create(null);
  (Array.isArray(input.workItems) ? input.workItems : []).forEach(function (w) {
    if (!w || !w.issueId || !w.author || incSet[w.issueId]) return;
    if (typeof w.minutes !== 'number' || !isFinite(w.minutes) || w.minutes <= 0) return;
    var execs = roleExecutors[w.issueId] || {}, rk = null, k;
    for (k in execs) { if (execs[k] && execs[k] === w.author) { rk = k; break; } }
    if (!rk) return;
    if (!factByIssueRole[w.issueId]) factByIssueRole[w.issueId] = Object.create(null);
    factByIssueRole[w.issueId][rk] = (factByIssueRole[w.issueId][rk] || 0) + w.minutes;
  });

  var rollups = [], rows = [];
  for (var ri = 0; ri < roles.length; ri++) {
    var role = roles[ri];
    if (!role || !role.key || !role.fieldId) continue;
    var sum = 0, n = 0, over = 0, noEst = 0;
    for (var ii = 0; ii < issues.length; ii++) {
      var iss = issues[ii]; if (!iss || !iss.id || incSet[iss.id]) continue;
      if (!(roleExecutors[iss.id] || {})[role.key]) continue;    /* роль не укомплектована на задаче */
      var asOfMin = (asOf[iss.id] || {})[role.fieldId];
      if (typeof asOfMin !== 'number' || !isFinite(asOfMin) || asOfMin <= 0) { noEst++; continue; }   /* ÷0 guard */
      var fr = factByIssueRole[iss.id];
      var factMin = (fr && typeof fr[role.key] === 'number') ? fr[role.key] : 0;
      var variancePct = (factMin - asOfMin) / asOfMin * 100;
      sum += variancePct; n++;
      if (Math.abs(variancePct) > threshold) {
        over++;
        rows.push({ id: iss.id, summary: iss.summary || '', roleKey: role.key, roleLabel: role.label || role.key,
          asOfMin: asOfMin, factMin: factMin, variancePct: variancePct,
          level: agingLevel(Math.abs(variancePct), { yellow: threshold, red: threshold * 2 }) });
      }
    }
    var avg = (n > 0) ? (sum / n) : null;
    rollups.push({ roleKey: role.key, label: role.label || role.key, avgVariancePct: avg,
      overCount: over, taskCount: n, noEstimate: noEst,
      level: (avg === null) ? 'none' : agingLevel(Math.abs(avg), { yellow: threshold / 2, red: threshold }) });
  }
  rows.sort(function (a, b) { return Math.abs(b.variancePct) - Math.abs(a.variancePct); });
  return { rollups: rollups, rows: rows,
    incompleteCount: Object.keys(incSet).length, populationCount: issues.length };
}

/* #50 S6b — A6 Бэклог в ЧЧ по ролям (СНИМОК). Агрегат текущих оценок бэклога по ролям:
   Σ оценок роли (мин→ч) + «месяцев бэклога» = Σ ЧЧ ÷ месячная ёмкость роли (настройка ч/мес).
   perIssue: [{ est:{roleKey→minutes|null} }] (текущее value.minutes на срезе, как A3).
   roles: [{key,label}] (активные с estField). monthlyCapHours: {roleKey→ч/мес} (может отсутствовать
   → месяцев=null, гейдж «—»). normMonths: норматив-ориентир (константа 6). Строка на КАЖДУЮ роль
   (нулевой бэклог → 0ч/0мес, прозрачно). Уровень: none(нет ёмкости)/ok/warn(у порога)/over(над нормой). */
function buildBacklogRows(perIssue, roles, monthlyCapHours, normMonths) {
  var items = Array.isArray(perIssue) ? perIssue : [];
  var rs = Array.isArray(roles) ? roles : [];
  var caps = (monthlyCapHours && typeof monthlyCapHours === 'object') ? monthlyCapHours : {};
  var norm = (typeof normMonths === 'number' && isFinite(normMonths) && normMonths > 0) ? normMonths : 6;
  var rows = [];
  for (var i = 0; i < rs.length; i++) {
    var r = rs[i]; if (!r || !r.key) continue;
    var sumMin = 0, cnt = 0;
    for (var j = 0; j < items.length; j++) {
      var est = items[j] && items[j].est;
      var m = est ? est[r.key] : null;
      if (typeof m === 'number' && isFinite(m) && m > 0) { sumMin += m; cnt++; }
    }
    var sumHours = sumMin / 60;
    var cap = caps[r.key];
    var capValid = (typeof cap === 'number' && isFinite(cap) && cap > 0);
    var months = capValid ? (sumHours / cap) : null;
    var level = (months == null) ? 'none'
      : (months >= norm ? 'over' : (months >= norm * 0.85 ? 'warn' : 'ok'));
    rows.push({ roleKey: r.key, label: r.label || r.key, taskCount: cnt,
      sumMinutes: sumMin, sumHours: sumHours, capacityHours: capValid ? cap : null,
      months: months, level: level });
  }
  return { rows: rows, norm: norm };
}

/* #50 S7b — A10 Spillover (планер-нативный из ssp_history). Дифф соседних FINISHED-снимков
   ПО РОЛИ (запись = <baseSprintId>_<roleKey>) → carried/dropped + % недовыполнения (не-done-ЧЧ ÷
   закоммичено-ЧЧ) + список хвостов + возраст (цепочка подряд-переносов).
   snapshots: истории записи ({sprintId,roleKey,status,dateStart,items:[{issueId,state,inclusionStatus,
     estimate_<rk>,...}]}). baseSprintId: id БАЗОВОГО спринта N («перенос в СЛЕДУЮЩИЙ» — записи с тем же
     baseSprintId по разным ролям, вторая половина = ближайший FINISHED-снимок ПОЗЖЕ по dateStart).
   opts: { roles:[{key,label,estField}], doneStates:string[], ageBands:{warm:int,hot:int},
           activeInc:string[] } (activeInc = что считается «закоммичено», по умолчанию INC_PLANNED+INC_UNPLANNED).
   → { roleRows:[{roleKey,label,plannedMinutes,notDoneMinutes,carriedMinutes,droppedMinutes,pct,level}],
       tails:[{issueId,title,roleKey,roleLabel,minutes,type:'carried'|'dropped',system}],  // минуты (estimate_<rk>=value.minutes), дисплей ÷60
       ages:[{issueId,title,roleKey,roleLabel,age,level:'ok'|'warm'|'hot',system}],
       hasN1:bool } (hasN1=false если базовый спринт последний → carried не определён; всё=incomplete). */
function computeSpillover(snapshots, opts, baseSprintId) {
  var snaps = Array.isArray(snapshots) ? snapshots.filter(function (s) { return s && s.sprintId && s.status === 'FINISHED'; }) : [];
  opts = opts || {};
  var roles = Array.isArray(opts.roles) ? opts.roles : [];
  var doneSet = {};
  var dsArr = Array.isArray(opts.doneStates) ? opts.doneStates : [];
  for (var di = 0; di < dsArr.length; di++) doneSet[dsArr[di]] = true;
  var inc = Array.isArray(opts.activeInc) ? opts.activeInc : ['INC_PLANNED', 'INC_UNPLANNED'];
  var incSet = {}; for (var ii = 0; ii < inc.length; ii++) incSet[inc[ii]] = true;
  var bands = opts.ageBands || {};
  var warmAt = (typeof bands.warm === 'number' && bands.warm >= 1) ? Math.round(bands.warm) : 2;
  var hotAt = (typeof bands.hot === 'number' && bands.hot >= 1) ? Math.round(bands.hot) : 5;

  /* группируем per-роль → [{recs:[…sorted by dateStart]}] */
  var byRole = {};
  for (var si = 0; si < snaps.length; si++) {
    var s = snaps[si];
    var rk = s.roleKey || ''; if (!rk) continue;
    (byRole[rk] = byRole[rk] || []).push(s);
  }
  for (var rk2 in byRole) byRole[rk2].sort(function (a, b) { return (a.dateStart || 0) - (b.dateStart || 0); });

  function baseId(sid) { var us = String(sid || '').lastIndexOf('_'); return us > 0 ? sid.slice(0, us) : sid; }
  function itemEst(it, rk) { var v = it && it['estimate_' + rk]; return (typeof v === 'number' && isFinite(v)) ? v : 0; }
  function isDone(it) { return !!(it && doneSet[it.state]); }
  function isActive(it) { return !!(it && incSet[it.inclusionStatus]); }

  var roleRows = [], tails = [], ageMap = {};
  var hasN1Any = false;

  for (var ri = 0; ri < roles.length; ri++) {
    var r = roles[ri]; if (!r || !r.key) continue;
    var chain = byRole[r.key] || [];
    /* индексы N (baseSprintId) и N+1 (СЛЕДУЮЩИЙ FINISHED-снимок ЭТОЙ роли, СТРОГО ПОЗЖЕ по dateStart
       и с иным base id — иначе tie/null-dateStart параллельного sibling'а или сам N подсунется как N+1;
       адверс-фикс: пропускаем chain[j] с baseId===N ИЛИ dateStart<=recN.dateStart). */
    var idxN = -1;
    for (var ci = 0; ci < chain.length; ci++) { if (baseId(chain[ci].sprintId) === baseSprintId) { idxN = ci; break; } }
    var recN = idxN >= 0 ? chain[idxN] : null;
    var recN1 = null;
    if (recN) {
      var recNds = (typeof recN.dateStart === 'number' && isFinite(recN.dateStart)) ? recN.dateStart : -Infinity;
      for (var jn = 0; jn < chain.length; jn++) {
        var cand = chain[jn]; if (!cand || cand === recN) continue;
        if (baseId(cand.sprintId) === baseSprintId) continue;
        var cds = (typeof cand.dateStart === 'number' && isFinite(cand.dateStart)) ? cand.dateStart : null;
        if (cds == null || cds <= recNds) continue;
        if (!recN1 || cds < recN1.dateStart) recN1 = cand;
      }
    }
    var hasN1 = !!recN1; if (hasN1) hasN1Any = true;

    var planned = 0, notDone = 0, carriedH = 0, droppedH = 0;
    if (recN && Array.isArray(recN.items)) {
      var itemsN = recN.items;
      var mapN1 = {};
      /* адверс-фикс: carried требует ACTIVE inclusion в N+1 (INC_EXCLUDED в N+1 = «исключена из плана» = dropped,
         симметрично с age-цепью, где prevIt тоже требует isActive). */
      if (hasN1) { for (var m1 = 0; m1 < recN1.items.length; m1++) { var it1 = recN1.items[m1]; if (it1 && it1.issueId && isActive(it1)) mapN1[it1.issueId] = it1; } }
      for (var jj = 0; jj < itemsN.length; jj++) {
        var it = itemsN[jj]; if (!it || !isActive(it)) continue;
        var h = itemEst(it, r.key);
        planned += h;
        if (isDone(it)) continue;
        notDone += h;
        var inNext = hasN1 && !!mapN1[it.issueId];
        var type = inNext ? 'carried' : 'dropped';
        if (inNext) carriedH += h; else droppedH += h;
        tails.push({ issueId: it.issueId, title: it.title || it.issueId, roleKey: r.key,
          roleLabel: r.label || r.key, minutes: h, type: type, system: it.system || null });
      }
    }
    var pct = planned > 0 ? (notDone / planned) : 0;
    var lvl = pct >= 0.5 ? 'over' : (pct >= 0.2 ? 'warn' : 'ok');
    /* минуты (estimate_<rk> = value.minutes, refresh-controller.js:438) — дисплей ÷60 через _fmtHours. */
    roleRows.push({ roleKey: r.key, label: r.label || r.key,
      plannedMinutes: planned, notDoneMinutes: notDone,
      carriedMinutes: carriedH, droppedMinutes: droppedH, pct: pct, level: lvl });

    /* возраст: длина цепочки подряд НЕ-DONE «активных» записей от recN назад по chain,
       по каждой не-done задаче из recN.items. */
    if (recN && Array.isArray(recN.items)) {
      for (var kk = 0; kk < recN.items.length; kk++) {
        var itA = recN.items[kk];
        if (!itA || !itA.issueId || !isActive(itA) || isDone(itA)) continue;
        var age = 1;
        for (var back = idxN - 1; back >= 0; back--) {
          var prev = chain[back];
          if (!prev || !Array.isArray(prev.items)) break;
          var prevIt = null;
          for (var pi = 0; pi < prev.items.length; pi++) { if (prev.items[pi] && prev.items[pi].issueId === itA.issueId) { prevIt = prev.items[pi]; break; } }
          if (prevIt && isActive(prevIt) && !isDone(prevIt)) age++; else break;
        }
        var lv = age >= hotAt ? 'hot' : (age >= warmAt ? 'warm' : 'ok');
        /* per-issue максимум по ролям (одна и та же задача в разных ролях — берём наибольший возраст) */
        var prev2 = ageMap[itA.issueId];
        if (!prev2 || age > prev2.age) {
          ageMap[itA.issueId] = { issueId: itA.issueId, title: itA.title || itA.issueId,
            roleKey: r.key, roleLabel: r.label || r.key, age: age, level: lv, system: itA.system || null };
        }
      }
    }
  }
  var ages = [];
  for (var mk in ageMap) ages.push(ageMap[mk]);
  ages.sort(function (a, b) { return b.age - a.age; });
  tails.sort(function (a, b) { return b.minutes - a.minutes; });   /* хвосты несут minutes (не hours) — иначе NaN-компаратор = no-op */
  return { roleRows: roleRows, tails: tails, ages: ages, hasN1: hasN1Any };
}

/* #50 S8b — B1 Техдолг (СНИМОК оценок, контур B). Из перечня задач с per-role оценками + флагом
   isTechDebt + значением «система» → сегментация система×роль: Σ оценок техдолга (мин) + Σ ВСЕХ
   оценок роли (знаменатель) + % по ЧЧ; + отчёт-сигнал «неоценённый долг» (задачи техдолга без
   единой валидной оценки). perIssue: [{ est:{roleKey→min|null}, isTechDebt:bool, system:str }].
   Оценки, не время → дисплей ÷60. Роль без данных в системе — пропускается (не шум-строка). */
function buildTechDebtRows(perIssue, roles) {
  var items = Array.isArray(perIssue) ? perIssue : [];
  var rs = Array.isArray(roles) ? roles : [];
  var bySys = Object.create(null), sysOrder = [];
  var unestimated = 0, estimated = 0, debtTasks = 0;
  function validMin(m) { return (typeof m === 'number' && isFinite(m) && m > 0); }
  for (var i = 0; i < items.length; i++) {
    var it = items[i]; if (!it) continue;
    var est = (it.est && typeof it.est === 'object') ? it.est : {};
    var sys = (typeof it.system === 'string' && it.system) ? it.system : '';
    if (!bySys[sys]) { bySys[sys] = Object.create(null); sysOrder.push(sys); }
    var g = bySys[sys];
    for (var ri = 0; ri < rs.length; ri++) {
      var rk = rs[ri].key, m = est[rk];
      if (!g[rk]) g[rk] = { debt: 0, all: 0 };
      if (validMin(m)) { g[rk].all += m; if (it.isTechDebt) g[rk].debt += m; }
    }
    if (it.isTechDebt) {
      debtTasks++;
      var anyEst = false;
      for (var rj = 0; rj < rs.length; rj++) { if (validMin(est[rs[rj].key])) { anyEst = true; break; } }
      if (anyEst) estimated++; else unestimated++;   /* «неоценённый долг» = ни одной валидной оценки */
    }
  }
  var groups = [], totalDebt = 0, totalAll = 0;
  for (var si = 0; si < sysOrder.length; si++) {
    var s = sysOrder[si], g2 = bySys[s], rows = [];
    for (var rj2 = 0; rj2 < rs.length; rj2++) {
      var rk2 = rs[rj2].key, cell = g2[rk2];
      if (!cell || (cell.all === 0 && cell.debt === 0)) continue;
      rows.push({ roleKey: rk2, label: rs[rj2].label || rk2, debtMinutes: cell.debt,
        allMinutes: cell.all, pct: cell.all > 0 ? (cell.debt / cell.all) : 0 });
      totalDebt += cell.debt; totalAll += cell.all;
    }
    if (rows.length) groups.push({ system: s, rows: rows });
  }
  return { groups: groups, unestimated: unestimated, estimated: estimated, debtTasks: debtTasks,
    totalDebtMinutes: totalDebt, totalAllMinutes: totalAll, totalPct: totalAll > 0 ? (totalDebt / totalAll) : 0 };
}

/* #50 S8a — B3 «1000 мелочей» (контур B). Из двух YT-подсчётов задач с тегом (за период +
   с начала года) → { countPeriod, countYtd, avgPerMonth }. avgPerMonth = countYtd ÷ прошедших
   месяцев года (номер месяца 0..11 + дробь по дню = честный YTD-темп; клампим к ≥1, чтобы в
   первые дни января не делить на ~0). nowTs — epoch-ms UTC, инжектится (тестируемо, без Date.now
   внутри — консистентно с прочими pure-движками отчётности). Счётчик, не время → не ÷60. */
function computeThousand(countPeriod, countYtd, nowTs) {
  var cp = (typeof countPeriod === 'number' && isFinite(countPeriod) && countPeriod > 0) ? Math.round(countPeriod) : 0;
  var cy = (typeof countYtd === 'number' && isFinite(countYtd) && countYtd > 0) ? Math.round(countYtd) : 0;
  var d = new Date(typeof nowTs === 'number' && isFinite(nowTs) ? nowTs : 0);
  var mo = d.getUTCMonth();                        /* 0..11 */
  var daysInMo = new Date(Date.UTC(d.getUTCFullYear(), mo + 1, 0)).getUTCDate();
  var monthsElapsed = mo + (d.getUTCDate() / daysInMo);  /* напр. 9 июля → 6 + 9/31 ≈ 6.29 */
  if (monthsElapsed < 1) monthsElapsed = 1;        /* защита от делёжа на ~0 в первые дни января */
  return { countPeriod: cp, countYtd: cy, avgPerMonth: cy / monthsElapsed };
}

var _api = { parseStateChunk: parseStateChunk, parseAnchorsChunk: parseAnchorsChunk,
  buildBacklogRows: buildBacklogRows,
  parseAsOfPeriodChunk: parseAsOfPeriodChunk, asOfPeriodMinutes: asOfPeriodMinutes,
  computePlanFact: computePlanFact,
  buildWorkloadRows: buildWorkloadRows,
  computeSpillover: computeSpillover, computeThousand: computeThousand,
  buildTechDebtRows: buildTechDebtRows,
  _isStateActivity: _isStateActivity, workdaysBetween: workdaysBetween, agingLevel: agingLevel,
  buildAgingRows: buildAgingRows, buildProgressRows: buildProgressRows };

if (typeof window !== 'undefined') {
  try { window.__SSP_REPORTING_PURE = _api; } catch (_) { /* sandboxed write may throw */ }
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = _api;
}
