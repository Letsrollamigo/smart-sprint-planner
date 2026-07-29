/* reporting-data.js — #50 S1b. Примитив bulkStateTransitions: фронтовое чтение переходов
   состояний из Activities API чанками по 25 задач (deps.host.fetchYouTrack — исполняется в
   YT-сессии юзера ⇒ native rights-scoping, D8: юзер не получит данные задач вне доступа),
   reverse=true, $top=300. Для A7 Aging — «последний вход в текущий статус».

   Разбор + детект обрезки/недобора + starvation (D7) — в pure/reporting-pure.js. Здесь —
   оркестровка: чанкинг + фетч + агрегация transitions/incomplete + сводный диагностический
   ридаут лимитов (§12: chunks/response-size/starvation/ms — фиксируется на прод-пилоте S1c).
   БЕЗ пагинации: докрутка activities — гипотеза до замера §12.3, НЕ строим; путь D7 =
   детект+сигнал неполноты. Публикует __SSP_REPORTING_DATA; node-тест инжектит pure-мост
   через global.window. */

const CHUNK_SIZE = 25;
const TOP_LIMIT = 300;
const STATE_ACT_FIELDS = 'timestamp,target(idReadable),field(id,name),' +
  'added(name,localizedName,$type),removed(name,localizedName,$type)';
/* Union-проекция anchors∪period (ревью #50, O1): fields= — ПРОЕКЦИЯ сериализации ответа, НЕ
   серверный фильтр — окно $top при любом fields одно и то же. Один фетч кормит parseAnchorsChunk
   И parseAsOfPeriodChunk → вдвое меньше activities-запросов прогона A5/B0. */
const STATE_EST_ACT_FIELDS = 'timestamp,target(idReadable),field(id,name),' +
  'added(name,localizedName,minutes,$type),removed(name,localizedName,minutes,$type)';

/* #50 S3b — категория tag-активностей для пауз-ПО-ТЕГУ. ⚠ Категория подтверждена по
   документированному enum YouTrack Activities API (TagsCategory), НО точная форма
   added/removed (IssueTag.name) на живом инстансе — ПОД СМОУК S3d (в кодовой базе
   tag-активности до сих пор не читались; логика паринга покрыта unit-тестом на синтетике). */
const PAUSE_TAG_CATEGORY = 'TagsCategory';
const TAG_ACT_FIELDS = 'timestamp,target(idReadable),added(name),removed(name)';
/* #50 S5a — workItems (net-new data-path D12). Плоский список: часы/автор/дата/задача. */
const WORKITEM_FIELDS = 'date,duration(minutes),author(login),issue(idReadable)';
const _WI_DAY_MS = 86400000;
const MAX_WI_PAGES = 40;   /* guard бесконечной пагинации (40×300=12000 workitems/чанк — недостижимо) */

/* #50 D10 — прерывание отчёта. Примитивы проверяют opts.shouldAbort() МЕЖДУ чанками/страницами;
   истинно (свитч вида/период/таймаут/ручная отмена → бамп gen на host) → бросают REPORT_ABORTED,
   останавливая поток запросов (последовательная цепочка ⇒ ≤1 запрос в полёте; host.fetchYouTrack
   не принимает AbortSignal — реальный in-flight HTTP не отменить, глушим ПОСЛЕ него + отбрасываем
   результат). Loaders ловят e.__reportAborted → откат без error-mount. shouldAbort отсутствует
   (обычный вызов) → примитив работает как раньше (аддитивно). */
var REPORT_ABORTED = { __reportAborted: true };
function _aborted(opts) { return !!(opts && typeof opts.shouldAbort === 'function' && opts.shouldAbort()); }

function _pure() {
  return (typeof window !== 'undefined' && window.__SSP_REPORTING_PURE) || null;
}

/* bulkStateTransitions(deps, issueIds, opts):
     deps.host.fetchYouTrack — фронтовый YT-фетч (rights-scoped, D8); deps.diag — лог (опц).
     issueIds — idReadable активных задач; opts: { fieldId } (id поля состояния из настроек).
   Promise<{ transitions:{id→{enteredAt,toState,fromState}}, incomplete:[id…], noTransition:[id…],
     complete:bool, diag:{chunks,activitiesTotal,hitTopChunks,perIssueMax,issuesIncomplete,ms} }>.
   complete=false ⇒ по incomplete-задачам метрику считать НЕЛЬЗЯ (D7 — фронт покажет сигнал
   неполноты). Диагностика — для фиксации констант §12 на прод-пилоте (S1c). */
function bulkStateTransitions(deps, issueIds, opts) {
  opts = opts || {};
  var pure = _pure();
  var ids = Array.isArray(issueIds) ? issueIds.filter(Boolean) : [];
  var out = { transitions: {}, incomplete: [], noTransition: [], complete: true,
    diag: { chunks: 0, activitiesTotal: 0, hitTopChunks: 0, perIssueMax: 0, issuesIncomplete: 0, ms: 0 } };
  if (!ids.length || !deps || !deps.host || !pure) return Promise.resolve(out);
  var started = (typeof Date !== 'undefined' && Date.now) ? Date.now() : 0;

  function fetchChunk(chunkIds) {
    return deps.host.fetchYouTrack('activities', { query: {
      categories: 'CustomFieldCategory',
      issueQuery: 'issue id: ' + chunkIds.join(', '),
      fields: STATE_ACT_FIELDS,
      reverse: 'true',
      $top: TOP_LIMIT
    } }).then(function (activities) {
      var r = pure.parseStateChunk(activities, chunkIds, { fieldId: opts.fieldId || '', topLimit: TOP_LIMIT, preferCanon: !!opts.preferCanon });
      var k, i;
      for (k in r.transitions) out.transitions[k] = r.transitions[k];
      for (i = 0; i < r.incomplete.length; i++) out.incomplete.push(r.incomplete[i]);
      for (i = 0; i < r.noTransition.length; i++) out.noTransition.push(r.noTransition[i]);
      out.diag.chunks++;
      out.diag.activitiesTotal += r.diag.activitiesReturned;
      if (r.diag.hitTop) out.diag.hitTopChunks++;
      if (r.diag.perIssueMax > out.diag.perIssueMax) out.diag.perIssueMax = r.diag.perIssueMax;
    }).catch(function (e) {
      /* Сетевой сбой чанка = неполнота по всем его задачам (fail-loud, D7), не молчание. */
      for (var i = 0; i < chunkIds.length; i++) out.incomplete.push(chunkIds[i]);
      if (deps.diag) deps.diag('bulkStateTransitions chunk err: ' + String(e && e.message ? e.message : e), 'warn');
    });
  }

  var p = Promise.resolve();
  for (var ci = 0; ci < ids.length; ci += CHUNK_SIZE) {
    (function (chunk) { p = p.then(function () { if (_aborted(opts)) throw REPORT_ABORTED; return fetchChunk(chunk); }); })(ids.slice(ci, ci + CHUNK_SIZE));
  }
  return p.then(function () {
    out.diag.issuesIncomplete = out.incomplete.length;
    out.diag.ms = (started && typeof Date !== 'undefined' && Date.now) ? (Date.now() - started) : 0;
    out.complete = out.incomplete.length === 0;
    if (deps.diag) deps.diag('bulkStateTransitions: ids=' + ids.length + ' chunks=' + out.diag.chunks +
      ' acts=' + out.diag.activitiesTotal + ' hitTop=' + out.diag.hitTopChunks +
      ' perIssueMax=' + out.diag.perIssueMax + ' incomplete=' + out.diag.issuesIncomplete +
      ' ms=' + out.diag.ms, out.complete ? 'ok' : 'warn');
    return out;
  });
}

/* bulkAnchorTransitions(deps, issueIds, opts) — #50 S3b A2 TTM. Как bulkStateTransitions, но
   собирает per-issue ПЕРВЫЙ (хронологически) вход в КАЖДОЕ якорное состояние (opts.anchorStates)
   + полный хронологический таймлайн переходов (для интервалов пауз-состояний). Фетч байт-в-байт
   идентичен bulkStateTransitions (та же категория/поля/reverse/$top). Разбор + anchor-aware D7
   (hitTop ⇒ весь чанк incomplete: старт-якорь мог быть срезан хвостом истории) — в
   pure.parseAnchorsChunk. opts: { fieldId, anchorStates:[имена], estFieldIds:[ID period-полей] }.
   estFieldIds (ревью #50, O1): тот же ответ дополнительно кормит parseAsOfPeriodChunk (union-
   проекция) → out.estTimelines {id→{fieldId→[…]}} — отдельный bulkAsOfEstimates-фетч не нужен.
   Promise<{ anchors:{id→{state→firstTs}}, timelines:{id→[{ts,to}]}, estTimelines?, incomplete:[id…],
     complete:bool, diag:{chunks,activitiesTotal,hitTopChunks,perIssueMax,issuesIncomplete,ms} }>. */
function bulkAnchorTransitions(deps, issueIds, opts) {
  opts = opts || {};
  var pure = _pure();
  var ids = Array.isArray(issueIds) ? issueIds.filter(Boolean) : [];
  var estFids = Array.isArray(opts.estFieldIds) ? opts.estFieldIds.filter(Boolean) : [];
  var out = { anchors: {}, timelines: {}, incomplete: [], complete: true,
    diag: { chunks: 0, activitiesTotal: 0, hitTopChunks: 0, perIssueMax: 0, issuesIncomplete: 0, ms: 0 } };
  if (estFids.length) out.estTimelines = {};
  if (!ids.length || !deps || !deps.host || !pure) return Promise.resolve(out);
  var started = (typeof Date !== 'undefined' && Date.now) ? Date.now() : 0;

  function fetchChunk(chunkIds) {
    return deps.host.fetchYouTrack('activities', { query: {
      categories: 'CustomFieldCategory',
      issueQuery: 'issue id: ' + chunkIds.join(', '),
      fields: estFids.length ? STATE_EST_ACT_FIELDS : STATE_ACT_FIELDS,
      reverse: 'true',
      $top: TOP_LIMIT
    } }).then(function (activities) {
      var r = pure.parseAnchorsChunk(activities, chunkIds, {
        fieldId: opts.fieldId || '', topLimit: TOP_LIMIT, anchorStates: opts.anchorStates || [] });
      var k, i;
      for (k in r.anchors) out.anchors[k] = r.anchors[k];
      for (k in r.timelines) out.timelines[k] = r.timelines[k];
      for (i = 0; i < r.incomplete.length; i++) out.incomplete.push(r.incomplete[i]);
      out.diag.chunks++;
      out.diag.activitiesTotal += r.diag.activitiesReturned;
      if (r.diag.hitTop) out.diag.hitTopChunks++;
      if (r.diag.perIssueMax > out.diag.perIssueMax) out.diag.perIssueMax = r.diag.perIssueMax;
      if (estFids.length) {
        var r2 = pure.parseAsOfPeriodChunk(activities, chunkIds, { fieldIds: estFids, topLimit: TOP_LIMIT });
        for (k in r2.timelines) out.estTimelines[k] = r2.timelines[k];
        for (i = 0; i < r2.incomplete.length; i++) out.incomplete.push(r2.incomplete[i]);
      }
    }).catch(function (e) {
      /* Сетевой сбой чанка = неполнота по всем его задачам (fail-loud, D7). */
      for (var i = 0; i < chunkIds.length; i++) out.incomplete.push(chunkIds[i]);
      if (deps.diag) deps.diag('bulkAnchorTransitions chunk err: ' + String(e && e.message ? e.message : e), 'warn');
    });
  }

  var p = Promise.resolve();
  for (var ci = 0; ci < ids.length; ci += CHUNK_SIZE) {
    (function (chunk) { p = p.then(function () { if (_aborted(opts)) throw REPORT_ABORTED; return fetchChunk(chunk); }); })(ids.slice(ci, ci + CHUNK_SIZE));
  }
  return p.then(function () {
    /* дедуп: hitTop-чанк мог попасть в incomplete от ОБОИХ парсеров (anchors + est). */
    if (estFids.length && out.incomplete.length) {
      var seen = {}, uniq = [];
      for (var ui = 0; ui < out.incomplete.length; ui++) { var uid = out.incomplete[ui]; if (!seen[uid]) { seen[uid] = 1; uniq.push(uid); } }
      out.incomplete = uniq;
    }
    out.diag.issuesIncomplete = out.incomplete.length;
    out.diag.ms = (started && typeof Date !== 'undefined' && Date.now) ? (Date.now() - started) : 0;
    out.complete = out.incomplete.length === 0;
    if (deps.diag) deps.diag('bulkAnchorTransitions: ids=' + ids.length + ' chunks=' + out.diag.chunks +
      ' acts=' + out.diag.activitiesTotal + ' hitTop=' + out.diag.hitTopChunks +
      ' perIssueMax=' + out.diag.perIssueMax + ' incomplete=' + out.diag.issuesIncomplete +
      ' ms=' + out.diag.ms, out.complete ? 'ok' : 'warn');
    return out;
  });
}

/* PERIOD_ACT_FIELDS — проекция period-изменений (минуты) для as-of реплея оценки (S5b). Поле
   идентифицируем по id (имя локализуется на RU-инстансе); значение = added/removed .minutes. */
const PERIOD_ACT_FIELDS = 'timestamp,target(idReadable),field(id),added(minutes,$type),removed(minutes,$type)';

/* bulkAsOfEstimates(deps, issueIds, opts) — #50 S5b A5 План-факт (D12 net-new). As-of значение
   period-полей оценки на момент старт-якоря (lead.start). Фетч байт-в-байт как bulkAnchorTransitions
   (та же категория CustomFieldCategory / reverse=true / $top=300 / чанки по 25), но проекция
   period-значения + фильтр по field.id. Разбор + anchor-aware D7 → pure.parseAsOfPeriodChunk;
   реконструкция значения назад-от-текущего → pure.asOfPeriodMinutes.
   ⚠ Ревью #50 (O1): «отдельный $top-бюджет» был иллюзией — fields= лишь проекция ответа, окно
   $top идентично при любой проекции. A5/B0 больше НЕ зовут этот фетч (bulkAnchorTransitions с
   estFieldIds отдаёт estTimelines из ТОГО ЖЕ ответа); функция оставлена как standalone-примитив.
   Роль-атрибуция (какое поле у какой роли) — во
   вью-слое (примитив отдаёт per-fieldId). ⚠ Живая форма period added/removed — под смоук S5b.
   opts: { fieldIds:[ID полей — НЕ имена: name→id резолвит вью], asOfById:{id→ts}, currentById:{id→{fieldId→minutes}} }.
   Promise<{ asOf:{id→{fieldId→minutes|null}}, incomplete:[id…], complete, diag:{…} }>. */
function bulkAsOfEstimates(deps, issueIds, opts) {
  opts = opts || {};
  var pure = _pure();
  var ids = Array.isArray(issueIds) ? issueIds.filter(Boolean) : [];
  var fieldIds = Array.isArray(opts.fieldIds) ? opts.fieldIds.filter(Boolean) : [];
  var asOfById = opts.asOfById || {};
  var currentById = opts.currentById || {};
  var out = { asOf: {}, timelines: {}, incomplete: [], complete: true,   /* timelines — #50 B0: сырые хронологии оценок для помесячной as-of реконструкции (константный фетч) */
    diag: { chunks: 0, activitiesTotal: 0, hitTopChunks: 0, perIssueMax: 0, issuesIncomplete: 0, ms: 0, needsSmokeVerify: true } };
  if (!ids.length || !fieldIds.length || !deps || !deps.host || !pure) return Promise.resolve(out);
  var started = (typeof Date !== 'undefined' && Date.now) ? Date.now() : 0;

  function fetchChunk(chunkIds) {
    return deps.host.fetchYouTrack('activities', { query: {
      categories: 'CustomFieldCategory',
      issueQuery: 'issue id: ' + chunkIds.join(', '),
      fields: PERIOD_ACT_FIELDS,
      reverse: 'true',
      $top: TOP_LIMIT
    } }).then(function (activities) {
      var r = pure.parseAsOfPeriodChunk(activities, chunkIds, { fieldIds: fieldIds, topLimit: TOP_LIMIT });
      for (var ix = 0; ix < chunkIds.length; ix++) {
        var id = chunkIds[ix];
        var tls = r.timelines[id] || {};
        var cur = currentById[id] || {};
        var asOfTs = (typeof asOfById[id] === 'number') ? asOfById[id] : null;
        var perField = {};
        for (var fi = 0; fi < fieldIds.length; fi++) {
          var fid = fieldIds[fi];
          perField[fid] = pure.asOfPeriodMinutes(tls[fid] || [], cur[fid], asOfTs);
        }
        out.asOf[id] = perField;
        out.timelines[id] = tls;   /* #50 B0 — сырые per-field хронологии (as-of на конец каждого месяца свода) */
      }
      for (var i = 0; i < r.incomplete.length; i++) out.incomplete.push(r.incomplete[i]);
      out.diag.chunks++;
      out.diag.activitiesTotal += r.diag.activitiesReturned;
      if (r.diag.hitTop) out.diag.hitTopChunks++;
      if (r.diag.perIssueMax > out.diag.perIssueMax) out.diag.perIssueMax = r.diag.perIssueMax;
    }).catch(function (e) {
      /* Сетевой сбой чанка = неполнота по всем его задачам (fail-loud, D7). */
      for (var i = 0; i < chunkIds.length; i++) out.incomplete.push(chunkIds[i]);
      if (deps.diag) deps.diag('bulkAsOfEstimates chunk err: ' + String(e && e.message ? e.message : e), 'warn');
    });
  }

  var p = Promise.resolve();
  for (var ci = 0; ci < ids.length; ci += CHUNK_SIZE) {
    (function (chunk) { p = p.then(function () { if (_aborted(opts)) throw REPORT_ABORTED; return fetchChunk(chunk); }); })(ids.slice(ci, ci + CHUNK_SIZE));
  }
  return p.then(function () {
    out.diag.issuesIncomplete = out.incomplete.length;
    out.diag.ms = (started && typeof Date !== 'undefined' && Date.now) ? (Date.now() - started) : 0;
    out.complete = out.incomplete.length === 0;
    if (deps.diag) deps.diag('bulkAsOfEstimates: ids=' + ids.length + ' chunks=' + out.diag.chunks +
      ' acts=' + out.diag.activitiesTotal + ' hitTop=' + out.diag.hitTopChunks +
      ' incomplete=' + out.diag.issuesIncomplete + ' ms=' + out.diag.ms, out.complete ? 'ok' : 'warn');
    return out;
  });
}

/* pauseIntervalsFromTimeline(timeline, pauseStates) — интервалы «в пауза-СТАТУСЕ» из
   хронологического таймлайна переходов ([{ts,to}…] от parseAnchorsChunk). БЕЗ доп. фетча:
   вход в пауза-статус на ts → интервал [ts, ts_следующего_перехода); последний (не покинут)
   → toTs=null (открытый, клампится к endTs при расчёте pauseWorkdays). → [{fromTs,toTs}]. */
function pauseIntervalsFromTimeline(timeline, pauseStates) {
  var tl = Array.isArray(timeline) ? timeline : [];
  var set = {};
  (Array.isArray(pauseStates) ? pauseStates : []).forEach(function (s) { if (s) set[s] = true; });
  var out = [];
  for (var i = 0; i < tl.length; i++) {
    var e = tl[i];
    if (!e || typeof e.ts !== 'number' || !set[e.to]) continue;
    var next = tl[i + 1];
    out.push({ fromTs: e.ts, toTs: (next && typeof next.ts === 'number') ? next.ts : null });
  }
  return out;
}

function _tagName(v) { return v ? (v.name || '') : ''; }

/* _pairTagIntervals(activities, tagSet) — pure. Из activities категории тегов (любой порядок
   прихода) собирает per-issue интервалы «тег висел» для отслеживаемых тегов: пары add(ts)→
   remove(ts). События сортируются по ts asc (при равенстве add раньше remove), паримся;
   открытый (без remove) → toTs=null. → { id → [{fromTs,toTs}] }. */
function _pairTagIntervals(activities, tagSet) {
  var acts = Array.isArray(activities) ? activities : [];
  var events = {};
  for (var i = 0; i < acts.length; i++) {
    var a = acts[i];
    if (!a || !a.target) continue;
    var id = a.target.idReadable;
    if (!id || typeof a.timestamp !== 'number') continue;
    var addedArr = Array.isArray(a.added) ? a.added : (a.added ? [a.added] : []);
    var removedArr = Array.isArray(a.removed) ? a.removed : (a.removed ? [a.removed] : []);
    var j, nm;
    for (j = 0; j < addedArr.length; j++) { nm = _tagName(addedArr[j]); if (tagSet[nm]) { (events[id] = events[id] || []).push({ ts: a.timestamp, tag: nm, kind: 'add' }); } }
    for (j = 0; j < removedArr.length; j++) { nm = _tagName(removedArr[j]); if (tagSet[nm]) { (events[id] = events[id] || []).push({ ts: a.timestamp, tag: nm, kind: 'remove' }); } }
  }
  var intervals = {};
  for (var eid in events) {
    var evs = events[eid].slice().sort(function (x, y) { return x.ts - y.ts || (x.kind === 'add' ? -1 : 1); });
    var openByTag = {}, list = [];
    for (var k = 0; k < evs.length; k++) {
      var ev = evs[k];
      if (ev.kind === 'add') { if (openByTag[ev.tag] == null) openByTag[ev.tag] = ev.ts; }
      else if (openByTag[ev.tag] != null) { list.push({ fromTs: openByTag[ev.tag], toTs: ev.ts }); openByTag[ev.tag] = null; }
    }
    for (var t in openByTag) { if (openByTag[t] != null) list.push({ fromTs: openByTag[t], toTs: null }); }
    list.sort(function (x, y) { return x.fromTs - y.fromTs; });
    intervals[eid] = list;
  }
  return intervals;
}

/* bulkPauseTagIntervals(deps, issueIds, opts) — #50 S3b. Интервалы пауз-ПО-ТЕГУ из tag-
   активностей (категория ОТЛИЧНА от состояний — PAUSE_TAG_CATEGORY). opts: { tags:[имена] }.
   Паринг add→remove — в _pairTagIntervals (unit-тест на синтетике). ⚠ diag.needsSmokeVerify:
   живую категорию/форму added(name) подтвердить на S3d-смоуке (в коде до сих пор не читались).
   Promise<{ intervals:{id→[{fromTs,toTs}]}, incomplete:[id…], complete:bool, diag:{…} }>. */
function bulkPauseTagIntervals(deps, issueIds, opts) {
  opts = opts || {};
  var ids = Array.isArray(issueIds) ? issueIds.filter(Boolean) : [];
  var tags = Array.isArray(opts.tags) ? opts.tags.filter(Boolean) : [];
  var out = { intervals: {}, incomplete: [], complete: true,
    diag: { chunks: 0, activitiesTotal: 0, hitTopChunks: 0, ms: 0, category: PAUSE_TAG_CATEGORY, needsSmokeVerify: true } };
  if (!ids.length || !tags.length || !deps || !deps.host) return Promise.resolve(out);
  var tagSet = {}; tags.forEach(function (t) { tagSet[t] = true; });
  var started = (typeof Date !== 'undefined' && Date.now) ? Date.now() : 0;

  function fetchChunk(chunkIds) {
    return deps.host.fetchYouTrack('activities', { query: {
      categories: PAUSE_TAG_CATEGORY,
      issueQuery: 'issue id: ' + chunkIds.join(', '),
      fields: TAG_ACT_FIELDS,
      reverse: 'true',
      $top: TOP_LIMIT
    } }).then(function (activities) {
      var acts = Array.isArray(activities) ? activities : [];
      var iv = _pairTagIntervals(acts, tagSet);
      for (var k in iv) out.intervals[k] = iv[k];
      out.diag.chunks++;
      out.diag.activitiesTotal += acts.length;
      /* D7 hitTop (ревью #50): окно $top обрезано → старые add могли пропасть (remove без add =
         потерянная пауза → молча завышенный TTM/dwell). Паттерн parseStateChunk: чанк → incomplete. */
      if (acts.length >= TOP_LIMIT) {
        out.diag.hitTopChunks++;
        for (var hx = 0; hx < chunkIds.length; hx++) out.incomplete.push(chunkIds[hx]);
      }
    }).catch(function (e) {
      for (var i = 0; i < chunkIds.length; i++) out.incomplete.push(chunkIds[i]);
      if (deps.diag) deps.diag('bulkPauseTagIntervals chunk err: ' + String(e && e.message ? e.message : e), 'warn');
    });
  }

  var p = Promise.resolve();
  for (var ci = 0; ci < ids.length; ci += CHUNK_SIZE) {
    (function (chunk) { p = p.then(function () { if (_aborted(opts)) throw REPORT_ABORTED; return fetchChunk(chunk); }); })(ids.slice(ci, ci + CHUNK_SIZE));
  }
  return p.then(function () {
    out.diag.ms = (started && typeof Date !== 'undefined' && Date.now) ? (Date.now() - started) : 0;
    out.complete = out.incomplete.length === 0;
    if (deps.diag) deps.diag('bulkPauseTagIntervals: ids=' + ids.length + ' tags=' + tags.length +
      ' chunks=' + out.diag.chunks + ' acts=' + out.diag.activitiesTotal +
      ' incomplete=' + out.incomplete.length + ' ms=' + out.diag.ms, out.complete ? 'ok' : 'warn');
    return out;
  });
}

/* UTC-дата YYYY-MM-DD из epoch-ms (для YT-фильтра `work date:`). */
function _fmtWorkDate(ts) {
  var d = new Date(ts);
  var m = d.getUTCMonth() + 1, day = d.getUTCDate();
  return d.getUTCFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
}

/* Разбор страницы workItems → [{issueId,author,dateTs,minutes}]. Невалидные (нет задачи/автора/
   даты/длительности) отбрасываются. author = login (стабильный ключ), fallback name. */
function _parseWorkItems(items) {
  var out = [];
  (Array.isArray(items) ? items : []).forEach(function (w) {
    if (!w) return;
    var issueId = w.issue && w.issue.idReadable;
    var author = w.author && (w.author.login || w.author.name);
    var dateTs = (typeof w.date === 'number') ? w.date : null;
    var minutes = (w.duration && typeof w.duration.minutes === 'number') ? w.duration.minutes : null;
    if (!issueId || !author || dateTs === null || minutes === null) return;
    out.push({ issueId: issueId, author: author, dateTs: dateTs, minutes: minutes });
  });
  return out;
}

/* bulkWorkItems(deps, issueIds, opts) — #50 S5a. НОВЫЙ data-path: нативные workItems (часы/автор/
   дата) по задачам отбора за окно. opts: { window:{fromTs,toTs} }. Чанки по 25 + СЕРВЕРНЫЙ фильтр
   `work date:` (окно, date-granular — D9-окна выровнены по дням; toTs-1 = последний включённый день)
   + ПАГИНАЦИЯ-до-полноты ($skip, поддержан для workItems — D7 без гипотез, в отличие от activities).
   Роль-атрибуция (автор→исполнитель роли задачи) — в движке A4 (примитив отдаёт сырьё). Guard
   MAX_WI_PAGES → чанк incomplete. Сетевой сбой чанка → incomplete (fail-loud, D7).
   Promise<{ items:[{issueId,author,dateTs,minutes}], incomplete:[id…], complete, diag:{…} }>. */
function bulkWorkItems(deps, issueIds, opts) {
  opts = opts || {};
  var ids = Array.isArray(issueIds) ? issueIds.filter(Boolean) : [];
  var win = opts.window || {};
  var out = { items: [], incomplete: [], complete: true,
    diag: { chunks: 0, pages: 0, itemsTotal: 0, hitPageCap: 0, outOfWindow: 0, ms: 0 } };
  if (!ids.length || !deps || !deps.host) return Promise.resolve(out);
  var dateClause = '', winFrom = null, winTo = null;
  if (typeof win.fromTs === 'number' && typeof win.toTs === 'number' && win.toTs > win.fromTs) {
    dateClause = ' and work date: ' + _fmtWorkDate(win.fromTs) + ' .. ' + _fmtWorkDate(win.toTs - 1);
    winFrom = win.fromTs; winTo = win.toTs;   /* #58-2 — окно режем клиентски (см. ниже) */
  }
  var started = (typeof Date !== 'undefined' && Date.now) ? Date.now() : 0;

  function fetchChunk(chunkIds) {
    var query = 'issue id: ' + chunkIds.join(', ') + dateClause;
    /* Пагинация до полноты: страница < $top ⇒ конец. */
    function page(skip) {
      if (_aborted(opts)) throw REPORT_ABORTED;                /* D10 — прерывание между страницами workItems */
      return deps.host.fetchYouTrack('workItems', { query: {
        query: query, fields: WORKITEM_FIELDS, $top: TOP_LIMIT, $skip: skip
      } }).then(function (items) {
        var arr = Array.isArray(items) ? items : [];
        out.diag.pages++;
        out.diag.itemsTotal += arr.length;
        var parsed = _parseWorkItems(arr);
        /* #58-2: `work date:` — фильтр ЗАДАЧИ, не записи: если у задачи есть хоть одно
           списание в окне, YT отдаёт ВСЮ её историю (проверено на стенде 2025.3: 50 из 135
           записей вне 30-дневного окна). Серверная клауза остаётся дешёвым пре-фильтром,
           окно режем здесь — полуоткрытым [fromTs, toTs), как весь reporting-period. */
        for (var i = 0; i < parsed.length; i++) {
          if (winFrom !== null && !(parsed[i].dateTs >= winFrom && parsed[i].dateTs < winTo)) {
            out.diag.outOfWindow++; continue;
          }
          out.items.push(parsed[i]);
        }
        if (arr.length >= TOP_LIMIT) {
          if ((skip / TOP_LIMIT) + 1 >= MAX_WI_PAGES) {   /* page-cap → чанк неполон (D7) */
            out.diag.hitPageCap++;
            for (var j = 0; j < chunkIds.length; j++) out.incomplete.push(chunkIds[j]);
            return;
          }
          return page(skip + TOP_LIMIT);                  /* докрутка следующей страницы */
        }
      });
    }
    return page(0).then(function () { out.diag.chunks++; }).catch(function (e) {
      if (e && e.__reportAborted) throw e;                     /* прерывание пробрасываем, не глушим как chunk-error */
      for (var i = 0; i < chunkIds.length; i++) out.incomplete.push(chunkIds[i]);
      if (deps.diag) deps.diag('bulkWorkItems chunk err: ' + String(e && e.message ? e.message : e), 'warn');
    });
  }

  var p = Promise.resolve();
  for (var ci = 0; ci < ids.length; ci += CHUNK_SIZE) {
    (function (chunk) { p = p.then(function () { if (_aborted(opts)) throw REPORT_ABORTED; return fetchChunk(chunk); }); })(ids.slice(ci, ci + CHUNK_SIZE));
  }
  return p.then(function () {
    out.diag.ms = (started && typeof Date !== 'undefined' && Date.now) ? (Date.now() - started) : 0;
    out.complete = out.incomplete.length === 0;
    if (deps.diag) deps.diag('bulkWorkItems: ids=' + ids.length + ' chunks=' + out.diag.chunks +
      ' pages=' + out.diag.pages + ' items=' + out.items.length +
      ' incomplete=' + out.incomplete.length + ' ms=' + out.diag.ms, out.complete ? 'ok' : 'warn');
    return out;
  });
}

/* combinePauses(timelines, pauseStates, tagIntervalsById) — объединяет per-issue паузы:
   интервалы пауз-СТАТУСОВ (из таймлайна) ++ интервалы пауз-ТЕГОВ. → { id → [{fromTs,toTs}] }
   (для computeTtm; слияние перекрытий — в pauseWorkdays.mergeIntervals). */
function combinePauses(timelines, pauseStates, tagIntervalsById) {
  timelines = timelines || {};
  tagIntervalsById = tagIntervalsById || {};
  var out = {}, id;
  for (id in timelines) out[id] = pauseIntervalsFromTimeline(timelines[id], pauseStates);
  for (id in tagIntervalsById) {
    if (!out[id]) out[id] = [];
    out[id] = out[id].concat(tagIntervalsById[id] || []);
  }
  return out;
}

/* ASSIST_FIELDS — проекция подсказок RingUI QueryAssist (search/assist). */
const ASSIST_FIELDS = '$type,id,suggestions($type,caret,completionStart,completionEnd,matchingStart,matchingEnd,description,group,icon,option,prefix,suffix)';

/* searchAssist(deps, req) — #50 data-source RingUI QueryAssist для «Отбор задач» ВСЕХ отчётов.
   POST /api/search/assist (query+caret+folders project-scope в ТЕЛЕ; `$type:'Project'` обязателен —
   иначе 500, подтверждено #33). fail-soft: ошибка → пустые suggestions (поле остаётся рабочим).
   → {query,caret,suggestions} (контракт RingUI QueryAssistResponse). pid из deps.activeProjectId
   (ctx.project пуст в global-дашбордах). ⚠ ponytail: 3-я копия ассиста (pick._pickAssist /
   backlog-loader._backlogAssist / здесь) — общий экстракт = отдельный техдолг (репо уже флагает
   дубликат в backlog-loader), не в скоупе задачи «QueryAssist в отбор». */
function searchAssist(deps, req) {
  var query = (req && req.query) || '';
  var caret = (req && typeof req.caret === 'number') ? req.caret : query.length;
  if (!deps || !deps.host) return Promise.resolve({ query: query, caret: caret, suggestions: [] });
  var pid = deps.activeProjectId || (deps.ctx && deps.ctx.project && deps.ctx.project.id) || null;
  var body = { query: query, caret: caret, ignoreUnresolvedSetting: true };
  if (pid) body.folders = [{ $type: 'Project', id: pid }];
  return deps.host.fetchYouTrack('search/assist', {
    method: 'POST', query: { fields: ASSIST_FIELDS }, body: body, headers: { 'Content-Type': 'application/json' }
  }).then(function (res) {
    return { query: query, caret: caret, suggestions: (res && res.suggestions) || [] };
  }).catch(function (e) {
    if (deps.diag) deps.diag('reporting searchAssist err: ' + String(e && e.message ? e.message : e), 'warn');
    return { query: query, caret: caret, suggestions: [] };
  });
}

/* #50 S7b — fetchHistory(deps): свежий GET /history для A10 Spillover.
   А10 — планер-нативный отчёт из ssp_history (снимки соседних FINISHED-спринтов), НЕ activities.
   На reporting-пути планерный _history не доступен (планер-scoped); фетчим свой поверх того же
   GET, что уже безопасно (viewer authzGuard + миграция + orphan-детект в backend-core.js).
   ⚠ Отчётность живёт в ГЛОБАЛЬНОМ дашборде (ssp-main-global) → project-scoped endpoint зовём
   через backend-global + ?projectKey= (как _backendCall в global-режиме, youtrack-api.js:51);
   backend-project scope:true в global-контуре НЕ резолвит проект (промис виснет — S7c смоук).
   → Promise<{history:[…записей], orphanGanttBySprintId:{…}} | {history:[]}> (fail-soft). */
function fetchHistory(deps) {
  if (!deps || !deps.host || typeof deps.host.fetchApp !== 'function') return Promise.resolve({ history: [] });
  var pk = deps.activeProjectKey || (deps.ctx && deps.ctx.project && deps.ctx.project.key) || null;
  var opts = pk ? { query: { projectKey: pk } } : {};
  return deps.host.fetchApp('backend-global/history', opts).then(function (r) {
    if (!r || !Array.isArray(r.history)) return { history: [] };
    return { history: r.history, orphanGanttBySprintId: r.orphanGanttBySprintId || {} };
  }).catch(function (e) {
    if (deps.diag) deps.diag('fetchHistory err: ' + String(e && e.message ? e.message : e), 'warn');
    return { history: [] };
  });
}

var _api = { bulkStateTransitions: bulkStateTransitions, bulkAnchorTransitions: bulkAnchorTransitions,
  bulkAsOfEstimates: bulkAsOfEstimates, searchAssist: searchAssist,
  bulkPauseTagIntervals: bulkPauseTagIntervals, pauseIntervalsFromTimeline: pauseIntervalsFromTimeline,
  combinePauses: combinePauses, _pairTagIntervals: _pairTagIntervals,
  bulkWorkItems: bulkWorkItems, _parseWorkItems: _parseWorkItems, _fmtWorkDate: _fmtWorkDate,
  fetchHistory: fetchHistory,
  CHUNK_SIZE: CHUNK_SIZE, TOP_LIMIT: TOP_LIMIT, PAUSE_TAG_CATEGORY: PAUSE_TAG_CATEGORY };

if (typeof window !== 'undefined') {
  try { window.__SSP_REPORTING_DATA = _api; } catch (_) { /* sandboxed write may throw */ }
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = _api;
}
