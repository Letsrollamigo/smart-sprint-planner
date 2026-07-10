'use strict';
/* widgets/main/src/domain/backlog-loader.js
   #21 слайс 2b — async-загрузчик пула бэклога. FRONTEND-DIRECT: host.fetchYouTrack('issues')
   (backend issue-search НЕ существует — R1 разведки). Постранично грузит задачи по зонам +
   стартовым состояниям + базовому фильтру по типу, мапит сырой issue → task-контракт,
   кладёт в transient _backlogPool (§4 спеки: НЕ храним — спрашиваем трекер при открытии вкладки).
   pure VM собирается из этого пула через backlog-vm-pure.buildBacklogVm (рендер — слайс 3).
   carry-over (activities) — НЕ здесь (слайс 3/5). Публикует window.__SSP_BACKLOG_LOADER.

   deps: { t, toast, diag, ctx, settings, host, roles(ALL_ROLES), getActiveRoles,
           backlogPage, maxBacklogTotal, userFilter (слайс 5 — query-assist фильтр),
           state:{ getSettings, setBacklogPool, getBacklogPool } } */

/* YT issue-поля: customFields покрывают State/Type/System/Priority + ролевые est/fact
   (value.minutes); value.isResolved — §8 resolved auto-hide; tags(name) — §8 пауза по тегу. */
var BACKLOG_ISSUE_FIELDS = 'id,idReadable,summary,'
  /* field(name,id): id поля State нужен слайсу 7 (carry-over) — надёжный fieldId для
     activities-детекта смены состояния (без localized-mismatch; project-fields id не отдаёт). */
  + 'customFields(name,projectCustomField(field(name,id)),value(name,localizedName,presentation,minutes,isResolved)),'
  + 'tags(name),'
  /* §5 дерево: связи для цепочки родителей. REST IssueLink: {direction:OUTWARD|INWARD|BOTH,
     linkType(name,sourceToTarget=outward,targetToSource=inward), issues:[…на другом конце]}.
     Родитель = link где фраза-с-моей-стороны === cascadeParentLinkInward («subtask of»).
     ВЛОЖЕННОСТЬ 2 уровня (Задача→Стори→Эпик) одним fetch — поле-селектор YT допускает
     рекурсивное раскрытие links внутри issues. Kind — inline в customFields. Сверено по докам YT. */
  + 'links(direction,linkType(name,sourceToTarget,targetToSource),'
  + 'issues(idReadable,summary,customFields(name,projectCustomField(field(name)),value(name)),'
  + 'links(direction,linkType(name,sourceToTarget,targetToSource),'
  + 'issues(idReadable,summary,customFields(name,projectCustomField(field(name)),value(name))))))';

/* Уникальные непустые состояния стартового пула + всех зон — для query 'State: ...'. */
function _poolStates(settings) {
  var s = settings || {};
  var out = [], seen = {};
  (Array.isArray(s.backlogStartStates) ? s.backlogStartStates : []).forEach(function (st) {
    if (st && !seen[st]) { seen[st] = true; out.push(st); }
  });
  (Array.isArray(s.backlogZones) ? s.backlogZones : []).forEach(function (z) {
    var st = z && z.state;
    if (st && !seen[st]) { seen[st] = true; out.push(st); }
  });
  return out;
}

/* §8 schema-level fail-loud: состояния бандла fieldState, которые НЕ замаплены (не зона,
   не старт, не пауза) и НЕ resolved → «донастройте». Чистая set-разность. values/resolved —
   из backend field-values (resolved отдаётся аддитивно; старый backend без него → resolved=[],
   тогда resolved-состояния попали бы в unmapped — вызывающий зовёт только при наличии resolved). */
function computeUnmappedStates(values, resolved, s) {
  if (!Array.isArray(values)) return [];
  s = s || {};
  var mapped = {};
  (Array.isArray(s.backlogStartStates) ? s.backlogStartStates : []).forEach(function (x) { mapped[x] = true; });
  (Array.isArray(s.backlogZones) ? s.backlogZones : []).forEach(function (z) { if (z && z.state) mapped[z.state] = true; });
  (Array.isArray(s.backlogPauseStates) ? s.backlogPauseStates : []).forEach(function (x) { mapped[x] = true; });
  (Array.isArray(resolved) ? resolved : []).forEach(function (x) { mapped[x] = true; });
  return values.filter(function (v) { return v && !mapped[v]; });
}

/* YT-query пула: 'project: <short> <stateAttr>: {A},{B} <typeAttr>: {X},{Y}'.
   Значения атрибутов с пробелами ('In Progress', 'To Do', 'Под уточнение') ОБЯЗАНЫ быть
   в брейсах {…} — иначе YT парсит первое слово как значение, остальные как свободный текст
   (дока YouTrack attribute search). Брейсим значения безусловно (для односложных безвредно).
   Имя атрибута — из настроек (fieldState/fieldType, НЕ литерал, §9 спеки) + брейс при пробеле.
   Запятая внутри атрибута = OR. */
function _bv(v) { return '{' + v + '}'; }
function _battr(name) { return /\s/.test(name) ? '{' + name + '}' : name; }
/* #21-fix — НАДЁЖНЫЙ ключ активного проекта: resolved activeProjectKey (entity/picker) в
   приоритете, ctx.project — только legacy-fallback (на YT 2026.1 / в global-режиме пусто). */
function _activeProj(deps) {
  if (deps.activeProjectKey) return String(deps.activeProjectKey);
  var p = deps.ctx && deps.ctx.project;
  return p ? String(p.shortName || p.id || '') : '';
}
function _buildPoolQuery(deps) {
  var s = deps.settings || {};
  var proj = _activeProj(deps);
  var parts = [];
  if (proj) parts.push('project: ' + proj);
  var states = _poolStates(s);
  if (states.length) parts.push(_battr(s.fieldState || 'State') + ': ' + states.map(_bv).join(','));
  var types = Array.isArray(s.backlogTypeFilter) ? s.backlogTypeFilter.filter(Boolean) : [];
  if (types.length) parts.push(_battr(s.fieldType || 'Type') + ': ' + types.map(_bv).join(','));
  /* §2 ось «Фильтр» (слайс 5): пользовательский query-assist фильтр AND-ится к базовому
     (YT AND по пробелу). Сырой ввод пользователя — не брейсим (он сам пишет синтаксис YT). */
  var userQ = (deps.userFilter || '').trim();
  if (userQ) parts.push(userQ);
  return parts.join(' ');
}

/* §2/§10 слайс 5 — data-source подсказок Ring QueryAssist для фильтра пула в шапке вкладки.
   1:1 с pick.js _pickAssist (POST /api/search/assist, scope = текущий проект). Ошибка →
   пустые подсказки (поле продолжает работать). */
/* const (не var) — C1 arch-fitness: module-level var/let = «новое состояние»; const иммутабелен и исключён. */
const ASSIST_FIELDS = '$type,id,suggestions($type,caret,completionStart,completionEnd,'
  + 'matchingStart,matchingEnd,description,group,icon,option,prefix,suffix)';
function _backlogAssist(req, deps) {
  var query = (req && req.query) || '';
  var caret = (req && typeof req.caret === 'number') ? req.caret : query.length;
  /* folders-скоуп подсказок → активный проект (activeProjectId; ctx.project пусто в global). */
  var pid = deps.activeProjectId || (deps.ctx && deps.ctx.project && deps.ctx.project.id) || null;
  var body = { query: query, caret: caret, ignoreUnresolvedSetting: true };
  if (pid) body.folders = [{ $type: 'Project', id: pid }];
  return deps.host.fetchYouTrack('search/assist', {
    method: 'POST', query: { fields: ASSIST_FIELDS }, body: body,
    headers: { 'Content-Type': 'application/json' },
  }).then(function (res) {
    return { query: query, caret: caret, suggestions: (res && res.suggestions) || [] };
  }).catch(function (err) {
    if (deps.diag) deps.diag('_backlogAssist: search/assist failed — ' + (err && err.message ? err.message : err), 'warn');
    return { query: query, caret: caret, suggestions: [] };
  });
}

/* customField issue по ИМЕНИ поля (projectCustomField.field.name | cf.name).
   ponytail: cf-резолвинг уже живёт 3 раза (pick.js cfValPres, refresh-controller cfOf/
   getMin/getStr) — здесь 4-я локальная копия (~15 строк). Вынести в pure/cf-access.js и
   переиспустить из loader+pick+refresh — при слайсе 3 (когда рендер уже трогает этот тракт),
   а не отдельным cross-module рефактором сейчас (минимальный дифф). */
function _cfByName(iss, fieldName) {
  if (!fieldName) return null;
  var cfs = iss.customFields || [];
  for (var i = 0; i < cfs.length; i++) {
    var cf = cfs[i];
    var fn = (cf.projectCustomField && cf.projectCustomField.field && cf.projectCustomField.field.name) || cf.name || '';
    if (fn === fieldName) return cf;
  }
  return null;
}
function _cfPres(iss, fieldName) {
  var cf = _cfByName(iss, fieldName);
  var v = cf && cf.value;
  if (!v) return null;
  return v.localizedName || v.presentation || v.name || null;
}
function _cfMinutes(iss, fieldName) {
  var cf = _cfByName(iss, fieldName);
  var v = cf && cf.value;
  return (v && typeof v.minutes === 'number') ? v.minutes : null;
}
/* Каноническое имя enum-значения (value.name) — для стабильной сортировки (не локализованное). */
function _cfName(iss, fieldName) {
  var cf = _cfByName(iss, fieldName);
  var v = cf && cf.value;
  return (v && v.name) || null;
}

/* §5 — родитель-issue (raw, с вложенными links для рекурсии). Ищем link, у которого фраза со
   стороны ЭТОГО issue (OUTWARD→sourceToTarget, INWARD→targetToSource) == cascadeParentLinkInward
   (дефолт «subtask of»). Возвращает issue-объект родителя (или null). */
function _parentRaw(iss, s) {
  var inward = (s.cascadeParentLinkInward && String(s.cascadeParentLinkInward)) || 'subtask of';
  var links = (iss && iss.links) || [];
  for (var i = 0; i < links.length; i++) {
    var l = links[i];
    if (!l || !l.linkType) continue;
    var phrase = (l.direction === 'OUTWARD') ? l.linkType.sourceToTarget
      : (l.direction === 'INWARD') ? l.linkType.targetToSource : null;
    if (phrase === inward && Array.isArray(l.issues) && l.issues.length) return l.issues[0];
  }
  return null;
}
function _toContainer(p, s) {
  return {
    issueId: p.idReadable || p.id,
    summary: (p.summary && p.summary.trim()) || '',
    kind: s.cascadeKindField ? _cfPres(p, s.cascadeKindField) : null,
  };
}
/* §5 — цепочка родителей (ближний→дальний), depth хопов (вложенность links). Для
   Эпик▸Стори▸Таск depth=2 (Стори, Эпик). Один issue-fetch с вложенными links. */
function _parentChain(iss, s, depth) {
  var chain = [], cur = iss, d = depth || 2;
  for (var i = 0; i < d; i++) {
    var p = _parentRaw(cur, s);
    if (!p) break;
    chain.push(_toContainer(p, s));
    cur = p;
  }
  return chain;
}

/* Сырой issue → task-контракт для pure buildBacklogVm. stateName = value.name (НЕ
   локализованное) — матчится с backlogZones[].state. */
function _mapPoolIssue(iss, deps) {
  var s = deps.settings || {};
  var stateCf = _cfByName(iss, s.fieldState || 'State');
  var stateVal = stateCf && stateCf.value;
  var roleList = deps.getActiveRoles ? deps.getActiveRoles(s) : (deps.roles || []);
  var estByRole = {}, factByRole = {};
  roleList.forEach(function (r) {
    estByRole[r.key] = _cfMinutes(iss, s[r.fieldEst]);
    factByRole[r.key] = _cfMinutes(iss, s[r.fieldFact]);
  });
  return {
    issueId: iss.idReadable || iss.id,
    idReadable: iss.idReadable || iss.id,
    summary: (iss.summary && iss.summary.trim()) || '',
    stateName: (stateVal && stateVal.name) || '',
    isResolved: !!(stateVal && stateVal.isResolved),
    system: s.fieldSystem ? _cfPres(iss, s.fieldSystem) : null,
    priority: s.fieldPriority ? _cfPres(iss, s.fieldPriority) : null,
    /* #3 — канон priority (value.name) для сортировки по приоритету (presentation локализован). */
    priorityName: s.fieldPriority ? _cfName(iss, s.fieldPriority) : null,
    tags: (iss.tags || []).map(function (t) { return t && t.name; }).filter(Boolean),
    estByRole: estByRole,
    factByRole: factByRole,
    parentChain: _parentChain(iss, s, 2),   /* §5 — цепочка родителей (Стори→Эпик) для дерева */
  };
}

/* §7 — id поля State из пула (project-fields id не отдаёт; берём из projectCustomField.field.id). */
function _stateFieldId(iss, s) {
  var cf = _cfByName(iss, (s && s.fieldState) || 'State');
  return (cf && cf.projectCustomField && cf.projectCustomField.field && cf.projectCustomField.field.id) || '';
}

/* §7 carry-over (E2) — обогатить пул историей входа в текущее состояние. Activities API
   (как Гант #20), chunks по 25 ПАРАЛЛЕЛЬНО. reverse:true → первая запись на issue =
   свежайшая смена состояния: _sinceTs (когда вошёл), _prevState (откуда). Эвристика
   «Перенос/Продолжение» (vs дата старта спринта) — pure (vm). Cap по размеру пула (перф);
   нет id поля State → пропуск (детект ненадёжен без fieldId). Best-effort: ошибка чанка не
   роняет загрузку (бейджа просто не будет). */
/* const — C1 arch-fitness: var/let = module-state; эти иммутабельны (как ASSIST_FIELDS). */
const MAX_CARRYOVER_POOL = 300, CARRYOVER_CHUNK = 25;
function _loadCarryover(acc, deps, stateFieldId) {
  if (!acc.length || !stateFieldId || acc.length > MAX_CARRYOVER_POOL) {
    if (acc.length > MAX_CARRYOVER_POOL && deps.diag) deps.diag('carryover: пул ' + acc.length + ' > ' + MAX_CARRYOVER_POOL + ' — пропуск (перф)', 'info');
    return Promise.resolve();
  }
  var byId = {}; acc.forEach(function (t) { byId[t.idReadable] = t; });
  var ids = acc.map(function (t) { return t.idReadable; }), chunks = [];
  for (var i = 0; i < ids.length; i += CARRYOVER_CHUNK) chunks.push(ids.slice(i, i + CARRYOVER_CHUNK));
  return Promise.all(chunks.map(function (chunk) {
    return deps.host.fetchYouTrack('activities', { query: {
      categories: 'CustomFieldCategory',
      issueQuery: 'issue id: ' + chunk.join(', '),
      fields: 'timestamp,target(idReadable),field(id),added(name),removed(name,localizedName)',
      reverse: 'true', $top: 300,
    } }).then(function (acts) {
      if (!Array.isArray(acts)) return;
      acts.forEach(function (act) {
        if (!act || !act.target) return;
        var t = byId[act.target.idReadable];
        if (!t || t._sinceTs != null) return;                 // первая (свежайшая) — оставляем
        if (((act.field && act.field.id) || '') !== stateFieldId) return;
        var removedArr = Array.isArray(act.removed) ? act.removed : (act.removed ? [act.removed] : []);
        var rv = removedArr[0] || null;
        t._sinceTs = act.timestamp || null;
        t._prevState = rv ? (rv.name || rv.localizedName || '') : '';
      });
    }).catch(function (e) { if (deps.diag) deps.diag('carryover chunk err: ' + (e && e.message ? e.message : e), 'warn'); });
  }));
}

/* #polish — множество idReadable задач, состоящих в СОСТАВЕ любого спринта: текущий состав
   (roleItems) ∪ все снимки истории (ssp_history). Из стейта, БЕЗ доп. фетча (история и
   roleItems уже загружены ядром). null-proto lookup. Best-effort: нет аксессора → пустой set. */
function _inSprintIdSet(deps) {
  var set = Object.create(null);
  var st = (deps && deps.state) || {};
  var hist = (typeof st.getHistory === 'function' && st.getHistory()) || [];
  for (var i = 0; i < hist.length; i++) {
    var items = hist[i] && hist[i].items;
    if (Array.isArray(items)) for (var j = 0; j < items.length; j++) { var id = items[j] && items[j].issueId; if (id) set[id] = true; }
  }
  var ri = (typeof st.getRoleItems === 'function' && st.getRoleItems()) || {};
  for (var rk in ri) {
    if (!Object.prototype.hasOwnProperty.call(ri, rk) || !Array.isArray(ri[rk])) continue;
    for (var k = 0; k < ri[rk].length; k++) { var id2 = ri[rk][k] && ri[rk][k].issueId; if (id2) set[id2] = true; }
  }
  return set;
}

/* Постранично выгрести пул (cap maxBacklogTotal), смапить, положить в transient _backlogPool.
   Возвращает Promise<{ count, capped }>; ошибка → reject (вызывающий ловит). */
function loadBacklogPool(deps) {
  /* #21-fix — изоляция проекта обязательна: без resolved-ключа НЕ шлём кросс-проектный
     запрос (раньше тянул задачи по всем доступным проектам). Пустой пул + diag. */
  if (!_activeProj(deps)) {
    if (deps.diag) deps.diag('loadBacklogPool: активный проект не определён — пул не загружаем (изоляция)', 'warn');
    deps.state.setBacklogPool([]);
    return Promise.resolve({ count: 0, capped: false, noProject: true });
  }
  var query = _buildPoolQuery(deps);
  var page = deps.backlogPage || 50;
  var cap = deps.maxBacklogTotal || 1000;
  var acc = [], skip = 0, capped = false, stateFieldId = '';
  function loop() {
    if (acc.length >= cap) { capped = true; return Promise.resolve(); }
    return deps.host.fetchYouTrack('issues', {
      query: { fields: BACKLOG_ISSUE_FIELDS, query: query, $skip: skip, $top: page + 1 },
    }).then(function (issues) {
      if (!Array.isArray(issues) || !issues.length) return undefined;
      var hasMore = issues.length > page;
      if (hasMore) issues = issues.slice(0, page);
      issues.forEach(function (iss) {
        if (!stateFieldId) stateFieldId = _stateFieldId(iss, deps.settings);
        acc.push(_mapPoolIssue(iss, deps));
      });
      skip += page;
      if (hasMore) return loop();
      return undefined;
    });
  }
  return loop()
    .then(function () { return _loadCarryover(acc, deps, stateFieldId); })   /* §7 — обогащение историей */
    .then(function () {
      var inSet = _inSprintIdSet(deps);   /* #polish — пометить задачи уже в составе любого спринта */
      acc.forEach(function (t) { if (inSet[t.idReadable]) t._inSprint = true; });
      deps.state.setBacklogPool(acc);
      if (capped && deps.diag) deps.diag('loadBacklogPool: capped at ' + cap + ' (' + acc.length + ' loaded)', 'warn');
      return { count: acc.length, capped: capped };
    });
}

var _api = {
  _poolStates: _poolStates,
  _buildPoolQuery: _buildPoolQuery,
  _backlogAssist: _backlogAssist,
  computeUnmappedStates: computeUnmappedStates,
  _mapPoolIssue: _mapPoolIssue,
  loadBacklogPool: loadBacklogPool,
};

if (typeof window !== 'undefined') {
  try { window.__SSP_BACKLOG_LOADER = _api; } catch (_) { /* sandboxed write may throw */ }
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = _api;
}
