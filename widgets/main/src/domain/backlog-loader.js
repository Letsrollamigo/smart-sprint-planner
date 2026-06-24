'use strict';
/* widgets/main/src/domain/backlog-loader.js
   #21 слайс 2b — async-загрузчик пула бэклога. FRONTEND-DIRECT: host.fetchYouTrack('issues')
   (backend issue-search НЕ существует — R1 разведки). Постранично грузит задачи по зонам +
   стартовым состояниям + базовому фильтру по типу, мапит сырой issue → task-контракт,
   кладёт в transient _backlogPool (§4 спеки: НЕ храним — спрашиваем трекер при открытии вкладки).
   pure VM собирается из этого пула через backlog-vm-pure.buildBacklogVm (рендер — слайс 3).
   carry-over (activities) — НЕ здесь (слайс 3/5). Публикует window.__SSP_BACKLOG_LOADER.

   deps: { t, toast, diag, ctx, settings, host, roles(ALL_ROLES), getActiveRoles,
           backlogPage, maxBacklogTotal,
           state:{ getSettings, setBacklogPool, getBacklogPool } } */

/* YT issue-поля: customFields покрывают State/Type/System/Priority + ролевые est/fact
   (value.minutes); value.isResolved — §8 resolved auto-hide; tags(name) — §8 пауза по тегу. */
var BACKLOG_ISSUE_FIELDS = 'id,idReadable,summary,'
  + 'customFields(name,projectCustomField(field(name)),value(name,localizedName,presentation,minutes,isResolved)),'
  + 'tags(name)';

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

/* YT-query пула: 'project: <short> <stateAttr>: {A},{B} <typeAttr>: {X},{Y}'.
   Значения атрибутов с пробелами ('In Progress', 'To Do', 'Под уточнение') ОБЯЗАНЫ быть
   в брейсах {…} — иначе YT парсит первое слово как значение, остальные как свободный текст
   (дока YouTrack attribute search). Брейсим значения безусловно (для односложных безвредно).
   Имя атрибута — из настроек (fieldState/fieldType, НЕ литерал, §9 спеки) + брейс при пробеле.
   Запятая внутри атрибута = OR. */
function _bv(v) { return '{' + v + '}'; }
function _battr(name) { return /\s/.test(name) ? '{' + name + '}' : name; }
function _buildPoolQuery(deps) {
  var s = deps.settings || {};
  var proj = (deps.ctx && deps.ctx.project) ? (deps.ctx.project.shortName || deps.ctx.project.id) : null;
  var parts = [];
  if (proj) parts.push('project: ' + proj);
  var states = _poolStates(s);
  if (states.length) parts.push(_battr(s.fieldState || 'State') + ': ' + states.map(_bv).join(','));
  var types = Array.isArray(s.backlogTypeFilter) ? s.backlogTypeFilter.filter(Boolean) : [];
  if (types.length) parts.push(_battr(s.fieldType || 'Type') + ': ' + types.map(_bv).join(','));
  return parts.join(' ');
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
    tags: (iss.tags || []).map(function (t) { return t && t.name; }).filter(Boolean),
    estByRole: estByRole,
    factByRole: factByRole,
  };
}

/* Постранично выгрести пул (cap maxBacklogTotal), смапить, положить в transient _backlogPool.
   Возвращает Promise<{ count, capped }>; ошибка → reject (вызывающий ловит). */
function loadBacklogPool(deps) {
  var query = _buildPoolQuery(deps);
  var page = deps.backlogPage || 50;
  var cap = deps.maxBacklogTotal || 1000;
  var acc = [], skip = 0, capped = false;
  function loop() {
    if (acc.length >= cap) { capped = true; return Promise.resolve(); }
    return deps.host.fetchYouTrack('issues', {
      query: { fields: BACKLOG_ISSUE_FIELDS, query: query, $skip: skip, $top: page + 1 },
    }).then(function (issues) {
      if (!Array.isArray(issues) || !issues.length) return undefined;
      var hasMore = issues.length > page;
      if (hasMore) issues = issues.slice(0, page);
      issues.forEach(function (iss) { acc.push(_mapPoolIssue(iss, deps)); });
      skip += page;
      if (hasMore) return loop();
      return undefined;
    });
  }
  return loop().then(function () {
    deps.state.setBacklogPool(acc);
    if (capped && deps.diag) deps.diag('loadBacklogPool: capped at ' + cap + ' (' + acc.length + ' loaded)', 'warn');
    return { count: acc.length, capped: capped };
  });
}

var _api = {
  _poolStates: _poolStates,
  _buildPoolQuery: _buildPoolQuery,
  _mapPoolIssue: _mapPoolIssue,
  loadBacklogPool: loadBacklogPool,
};

if (typeof window !== 'undefined') {
  try { window.__SSP_BACKLOG_LOADER = _api; } catch (_) { /* sandboxed write may throw */ }
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = _api;
}
