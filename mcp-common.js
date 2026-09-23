/**
 * MCP-инструменты планера во встроенном MCP YouTrack (#113 1б-2, «Custom MCP Tools», YouTrack ≥ 2025.3).
 *
 * Клиент подключает {baseUrl}/mcp?customToolPackages=<id приложения> со своим токеном; инструмент
 * исполняется под ctx.currentUser. YouTrack требует файл на инструмент и подхватывает только корень
 * пакета, поэтому каждый mcp-tool-<имя>.js — одна строка: exports.aiTool = require('./mcp-common.js').tool('<имя>').
 * Префикс planner_ даёт manifest.aiToolPrefix.
 *
 * ПРИНЦИП — ОДИН ПУТЬ К ДАННЫМ. Инструмент сам в хранилище не ходит: зовёт обработчик внешнего REST
 * главного меню (backend-global.js) на подставном запросе и перехватывает ответ. Формат ключа,
 * существование проекта и право чтения, отключение планера, роли, валидаторы, белые списки и
 * ревизии наследуются по построению; HTTP нет, контракт REST не меняется.
 *
 * YouTrack сверяет со схемой входа только required — остальное проверяет check() до любого вызова.
 * Отказ — throw: клиент получает isError и текст (первая строка — смысл, вторая — JSON отказа).
 * Чтение ревизии и запись идут одним вызовом инструмента (одна транзакция) — повтора при
 * rev_conflict нет; baseRev агента передаётся как есть. Дизайн — Spec/INTEGRATIONS_113_1B2_INAPP_DESIGN.md.
 */

var core = require('./backend-core.js');
var ENDPOINTS = require('./backend-global.js').httpHandler.endpoints;
var t = require('./mcp-i18n.js').t;

var ROLE_KEYS = core.ROLE_KEYS;
var SPRINT_STATUSES = ['PLANNING', 'CONFIRMED', 'ALLOCATED', 'FINISHED'];
var INCLUSION_STATUSES = ['INC_PENDING', 'INC_PLANNED', 'INC_UNPLANNED', 'INC_EXCLUDED'];
var ABSENCE_TYPES = ['vacation', 'sick', 'out_of_membership', 'regional_holiday', 'training', 'teamleading', 'other'];
var RELEASE_STATUSES = ['planned', 'prep', 'work', 'released', 'cancelled'];
/* Лимиты списков в ответах чтения — как у отдельного сервера. */
var LIMITS = { itemsPerRole: 200, history: 20, releases: 100, journal: 50, capacityArchive: 20 };

/* ── Общие помощники ─────────────────────────────────────────────────────────── */

function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
function merge(a, b) {
  var out = {};
  Object.keys(a || {}).forEach(function (k) { out[k] = a[k]; });
  Object.keys(b || {}).forEach(function (k) { out[k] = b[k]; });
  return out;
}
function val(o, k) { return o[k] === undefined ? null : o[k]; }

/* ── Отказы ──────────────────────────────────────────────────────────────────── */

function fail(info, text) {
  var e = new Error(text + '\n' + JSON.stringify(info));
  e.info = info;
  throw e;
}
function guard(code, details) {
  fail(merge({ ok: false, kind: 'tool', reason: code }, details), t('errors.guard.' + code, details));
}
function refuse(b, status) {
  var reason = typeof b.reason === 'string' ? b.reason : (typeof b.error === 'string' ? b.error : 'unknown');
  var hintKey = 'errors.hint.' + reason.split(':')[0];
  var hint = t(hintKey);
  var text = t('errors.refusal', { reason: reason, status: status, hint: hint === hintKey ? '' : hint + ' ', cid: b.cid || '—' });
  if (reason === 'rev_conflict' && typeof b.rev === 'number') text += ' ' + t('errors.revConflictTail', { rev: b.rev });
  if (Array.isArray(b.errors)) text += ' ' + t('errors.errorsTail', { errors: JSON.stringify(b.errors) });
  fail({ ok: false, kind: 'planner', reason: reason, status: status, cid: b.cid || null,
    rev: typeof b.rev === 'number' ? b.rev : null, errors: Array.isArray(b.errors) ? b.errors : null }, text);
}

/* ── Адаптер: обработчик главного меню на подставном запросе ─────────────────── */

function call(c, method, path, params, body) {
  var ep = null;
  for (var i = 0; i < ENDPOINTS.length; i++) if (ENDPOINTS[i].method === method && ENDPOINTS[i].path === path) { ep = ENDPOINTS[i]; break; }
  var q = merge({ projectKey: c.key }, params);
  var cap = { status: 200, body: null };
  var response = { json: function (b) { cap.body = b; } };
  Object.defineProperty(response, 'status', {
    get: function () { return cap.status; },
    set: function (v) { cap.status = v; }
  });
  ep.handle({
    currentUser: c.user,
    request: {
      body: body === undefined ? '' : JSON.stringify(body),
      getParameter: function (k) { return has(q, k) && q[k] !== undefined && q[k] !== null ? String(q[k]) : null; }
    },
    response: response
  });
  var b = isObj(cap.body) ? cap.body : {};
  if (b.success === false || cap.status >= 400) refuse(b, cap.status);
  return b;
}
function get(c, path, params) { return call(c, 'GET', path, params); }
function post(c, path, body, params) { return call(c, 'POST', path, params, body); }

function slotRev(sd) { return isObj(sd.sprint) && typeof sd.sprint._rev === 'number' ? sd.sprint._rev : 0; }
function bodyRev(b) { return typeof b.rev === 'number' ? b.rev : 0; }
/* baseRev агента — как есть; иначе текущая ревизия тем же вызовом инструмента. */
function revOf(baseRev, read) { return typeof baseRev === 'number' ? baseRev : read(); }
function slotSprintId(c) {
  var sd = get(c, 'sprint-data');
  return isObj(sd.sprint) && typeof sd.sprint.sprintId === 'string' ? sd.sprint.sprintId : null;
}

/* ── Проверка входа: подмножество JSON Schema, которое используют схемы ниже ──── */

function typeOk(ty, v) {
  if (ty === 'null') return v === null;
  if (ty === 'integer') return typeof v === 'number' && isFinite(v) && Math.floor(v) === v;
  if (ty === 'number') return typeof v === 'number' && isFinite(v);
  if (ty === 'array') return Array.isArray(v);
  if (ty === 'object') return isObj(v);
  return typeof v === ty;
}
/* Первая ошибка {field, problem} либо null; недостающим полям объектов проставляет default. */
function check(s, v, path) {
  var types = [].concat(s.type || []);
  var bad = function (problem) { return { field: path || '(root)', problem: problem }; };
  if (types.length && !types.some(function (ty) { return typeOk(ty, v); })) return bad('type ' + types.join('|'));
  if (v === null) return null;
  if (s.enum && s.enum.indexOf(v) < 0) return bad('enum ' + s.enum.join(', '));
  if (typeof v === 'string') {
    if (s.minLength !== undefined && v.length < s.minLength) return bad('minLength ' + s.minLength);
    if (s.maxLength !== undefined && v.length > s.maxLength) return bad('maxLength ' + s.maxLength);
    if (s.pattern && !new RegExp(s.pattern).test(v)) return bad('pattern ' + s.pattern);
  }
  if (typeof v === 'number') {
    if (s.minimum !== undefined && v < s.minimum) return bad('minimum ' + s.minimum);
    if (s.maximum !== undefined && v > s.maximum) return bad('maximum ' + s.maximum);
  }
  if (Array.isArray(v)) {
    if (s.maxItems !== undefined && v.length > s.maxItems) return bad('maxItems ' + s.maxItems);
    for (var i = 0; s.items && i < v.length; i++) { var e = check(s.items, v[i], path + '[' + i + ']'); if (e) return e; }
  }
  if (isObj(v)) {
    var props = s.properties || {};
    var req = s.required || [];
    for (var r = 0; r < req.length; r++) if (v[req[r]] === undefined) return { field: (path ? path + '.' : '') + req[r], problem: 'required' };
    var keys = Object.keys(v);
    for (var k = 0; k < keys.length; k++) {
      var kp = (path ? path + '.' : '') + keys[k];
      var ks = has(props, keys[k]) ? props[keys[k]] : s.additionalProperties;
      if (ks === false || (ks === undefined && s.propertyNames)) return { field: kp, problem: 'unknown key' };
      if (s.propertyNames && !has(props, keys[k])) { var pe = check(s.propertyNames, keys[k], kp); if (pe) return pe; }
      if (isObj(ks)) { var ve = check(ks, v[keys[k]], kp); if (ve) return ve; }
    }
    Object.keys(props).forEach(function (p) { if (v[p] === undefined && props[p].default !== undefined) v[p] = props[p].default; });
  }
  return null;
}

/* ── Схемы входа ─────────────────────────────────────────────────────────────── */

function d(key, schema) { if (key) schema.description = t('fields.' + key); return schema; }
function obj(props, required, key) { return d(key, { type: 'object', properties: props, required: required || [], additionalProperties: false }); }
function byRole(value, key) { return d(key, { type: 'object', propertyNames: { enum: ROLE_KEYS }, additionalProperties: value }); }
function nul(schema) { schema.type = [schema.type, 'null']; return schema; }
function str(key, max, min) { return d(key, { type: 'string', minLength: min || 0, maxLength: max }); }
function flag(key, def) { return d(key, { type: 'boolean', default: def }); }
function oneOf(values, key) { return d(key, { type: 'string', enum: values }); }

var PROJECT_KEY = str('projectKey', 100, 1);
function roleKey() { return oneOf(ROLE_KEYS, 'roleKey'); }
function issueId() { return d('issueId', { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9_]*-\\d+$' }); }
function login(key) { return str(key, 200, 1); }
function minutes(key) { return d(key, { type: 'integer', minimum: 0, maximum: 100000000 }); }
function epochMs(key) { return d(key, { type: 'integer', minimum: 0 }); }
function isoDate(key) { return d(key, { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }); }
function share(key) { return d(key, { type: 'number', minimum: 0, maximum: 1 }); }
function baseRev() { return d('baseRev', { type: 'integer', minimum: 0 }); }
function issues(key) { return d(key, { type: 'array', maxItems: 2000, items: { type: 'string', minLength: 1, maxLength: 64 } }); }
function limit(key, max, def) { return d(key, { type: 'integer', minimum: 1, maximum: max, default: def }); }
function input(props, required) { return obj(merge({ projectKey: PROJECT_KEY }, props), ['projectKey'].concat(required || [])); }

function item(key) {
  return obj({
    issueId: issueId(), title: str('title', 500), inclusionStatus: oneOf(INCLUSION_STATUSES, 'inclusionStatus'),
    estimate: minutes('estimate'), fact: minutes('fact'), alloc: minutes('alloc'), excludeReason: str('excludeReason', 500),
    assignee: nul(login('assignee')), externalTicketId: str(null, 200)
  }, ['issueId'], key);
}
function sprintCore() {
  return {
    name: str('sprintName', 500, 1), dateStart: epochMs('dateStart'), dateEnd: epochMs('dateEnd'), sprintGoal: str('sprintGoal', 500),
    sprintFieldVal: str('sprintFieldVal', 500), versionFieldVal: str('versionFieldVal', 500), resources: byRole(minutes(), 'resources')
  };
}
var SPRINT_IN = obj(merge({ sprintId: str('sprintId', 100, 1), roles: d('roles', { type: 'array', maxItems: 9, items: { type: 'string', enum: ROLE_KEYS } }) }, sprintCore()),
  ['sprintId', 'name', 'dateStart', 'dateEnd'], 'sprint');
var ABSENCE_IN = obj({
  from: isoDate('absenceFrom'), to: isoDate('absenceTo'), type: oneOf(ABSENCE_TYPES, 'absenceType'),
  hoursDelta: nul(d('hoursDelta', { type: 'number', minimum: 0.5, maximum: 24 }))
}, ['from', 'to', 'type'], 'entry');
var PERSON_IN = obj({
  grade: nul(str('grade', 64)), rate: nul(share('rate')), participation: nul(share('participation')),
  alloc: nul(byRole(share(), 'personAlloc'))
}, [], 'person');
var RELEASE_IN = obj({
  id: str('releaseId', 64, 1), name: nul(str(null, 200)), kind: nul(oneOf(['release', 'hotfix'], 'releaseKind')),
  source: nul(oneOf(['internal', 'vendor'], 'releaseSource')), status: nul(oneOf(RELEASE_STATUSES, 'releaseStatus')),
  plannedDate: nul(epochMs('plannedDate')), freezeDate: nul(epochMs('freezeDate')), freezeLocked: { type: ['boolean', 'null'] },
  patchNote: nul(str(null, 20000)), notes: nul(str(null, 20000)), taskUrl: nul(str(null, 2000)),
  roleReps: nul(byRole({ type: ['string', 'null'], maxLength: 128 }, 'roleReps'))
}, ['id'], 'release');

/* ── Проекции: компактные ответы и развёртка ключей ролей (порт shape.js отдельного сервера) ── */

function resourceKey(r) { return 'resource' + r.charAt(0).toUpperCase() + r.slice(1); }
function sprintHeader(s) {
  if (!isObj(s)) return null;
  var res = {};
  ROLE_KEYS.forEach(function (r) { if (typeof s[resourceKey(r)] === 'number') res[r] = s[resourceKey(r)]; });
  return {
    sprintId: val(s, 'sprintId'), name: val(s, 'name'), status: val(s, 'status'), dateStart: val(s, 'dateStart'), dateEnd: val(s, 'dateEnd'),
    sprintGoal: val(s, 'sprintGoal'), roles: val(s, 'roles'), sprintFieldVal: val(s, 'sprintFieldVal'), versionFieldVal: val(s, 'versionFieldVal'),
    resources: res, updatedBy: val(s, 'updatedBy'), updatedAt: val(s, 'updatedAt'), rev: typeof s._rev === 'number' ? s._rev : 0
  };
}
function sprintBody(input) {
  var out = {};
  Object.keys(input).forEach(function (k) {
    if (k !== 'resources') out[k] = input[k];
    else Object.keys(input.resources).forEach(function (r) { out[resourceKey(r)] = input.resources[r]; });
  });
  return out;
}
function itemView(it, r) {
  function num(fam) { var v = it[fam + '_' + r]; return typeof v === 'number' ? v : null; }
  return {
    issueId: val(it, 'issueId'), title: val(it, 'title'), state: val(it, 'state'), priority: val(it, 'priority'),
    inclusionStatus: val(it, 'inclusionStatus'), assignee: val(it, 'assignee'), estimate: num('estimate'), fact: num('fact'),
    alloc: num('alloc'), excludeReason: val(it, 'excludeReason'), externalTicketId: val(it, 'externalTicketId')
  };
}
function itemBody(input, r) {
  var out = {};
  Object.keys(input).forEach(function (k) {
    out[(k === 'estimate' || k === 'fact' || k === 'alloc') ? k + '_' + r : k] = input[k];
  });
  return out;
}
function itemsByRole(roleItems, o) {
  var out = {};
  if (!isObj(roleItems)) return out;
  ROLE_KEYS.forEach(function (r) {
    if ((o.roleKey && r !== o.roleKey) || !Array.isArray(roleItems[r])) return;
    var kept = roleItems[r].filter(function (it) { return isObj(it) && (o.includeExcluded || it.inclusionStatus !== 'INC_EXCLUDED'); });
    var slice = kept.slice(0, o.limit);
    out[r] = { total: kept.length, count: slice.length, hasMore: kept.length > slice.length, items: slice.map(function (it) { return itemView(it, r); }) };
  });
  return out;
}
function itemCounts(roleItems) {
  var out = {};
  if (isObj(roleItems)) ROLE_KEYS.forEach(function (r) { if (Array.isArray(roleItems[r])) out[r] = roleItems[r].length; });
  return out;
}
function historyView(rec, withItems) {
  var r = typeof rec.roleKey === 'string' ? rec.roleKey : null;
  var items = Array.isArray(rec.items) ? rec.items : [];
  var out = {
    sprintId: val(rec, 'sprintId'), name: val(rec, 'name'), status: val(rec, 'status'), roleKey: r, roleLabel: val(rec, 'roleLabel'),
    dateStart: val(rec, 'dateStart'), dateEnd: val(rec, 'dateEnd'), confirmedBy: val(rec, 'confirmedBy'), confirmedAt: val(rec, 'confirmedAt'),
    finishedBy: val(rec, 'finishedBy'), finishedAt: val(rec, 'finishedAt'), isOverLimit: val(rec, 'isOverLimit'), agreed: val(rec, 'agreed'),
    sprintGoal: val(rec, 'sprintGoal'), goalOutcome: val(rec, 'goalOutcome'), itemCount: items.length
  };
  if (withItems && r) out.items = items.filter(isObj).map(function (it) { return itemView(it, r); });
  return out;
}
function capacityView(rec) {
  if (!isObj(rec)) return null;
  var p = {};
  var persons = isObj(rec.persons) ? rec.persons : {};
  Object.keys(persons).forEach(function (l) {
    var v = persons[l];
    if (isObj(v)) p[l] = { grade: val(v, 'grade'), rate: val(v, 'rate'), participation: val(v, 'participation'), alloc: val(v, 'alloc'), base: val(v, 'base') };
  });
  return { sprintId: val(rec, 'sprintId'), mode: val(rec, 'mode'), status: val(rec, 'status'), dirty: val(rec, 'dirty'),
    approvedBy: val(rec, 'approvedBy'), approvedAt: val(rec, 'approvedAt'), dateEnd: val(rec, 'dateEnd'), persons: p };
}
function releaseView(r) {
  return {
    id: val(r, 'id'), name: val(r, 'name'), kind: val(r, 'kind'), source: val(r, 'source'), status: val(r, 'status'),
    plannedDate: val(r, 'plannedDate'), freezeDate: val(r, 'freezeDate'), freezeLocked: val(r, 'freezeLocked'),
    issues: Array.isArray(r.issues) ? r.issues : [], roleReps: val(r, 'roleReps'), taskUrl: val(r, 'taskUrl'),
    updatedBy: val(r, 'updatedBy'), updatedAt: val(r, 'updatedAt')
  };
}
function releasesOf(b) { return (Array.isArray(b.releases) ? b.releases : []).filter(isObj); }
function activeRolesOf(sd) { return isObj(sd.settings) && Array.isArray(sd.settings.activeRoles) ? sd.settings.activeRoles : null; }
function written(action, res) {
  var data = { rev: val(res, 'rev'), applied: val(res, 'applied') };
  if (res.historyRev !== undefined) data.historyRev = res.historyRev;
  return { summary: t('result.written', { action: action, rev: res.rev === undefined ? '—' : res.rev }), data: data };
}

/* ── Определения инструментов ─────────────────────────────────────────────────
   input — схема входа; ann — аннотации MCP; run(c, a) → {summary, data}. c = {user, key}. */

var R = { readOnlyHint: true, destructiveHint: false, idempotentHint: true };
var W = { readOnlyHint: false, destructiveHint: false, idempotentHint: true };
var D = { readOnlyHint: false, destructiveHint: true, idempotentHint: true };

var DEFS = {
  get_project_overview: { ann: R, input: input({}), run: function (c) {
    var ver = get(c, 'app-version'), sd = get(c, 'sprint-data'), lock = get(c, 'sprint-lock'), rel = get(c, 'releases');
    var sprint = sprintHeader(sd.sprint);
    var data = {
      version: val(ver, 'version'), configured: val(sd, 'configured'), activeRoles: activeRolesOf(sd),
      sprint: sprint ? merge(sprint, { itemCounts: itemCounts(sd.roleItems) }) : null,
      sprintCreationLocked: lock.locked === true, releases: { count: releasesOf(rel).length, rev: bodyRev(rel) }
    };
    return { data: data, summary: t('result.overview', { projectKey: c.key, version: data.version || '?', releases: data.releases.count,
      sprint: sprint ? sprint.name + ' (' + sprint.status + ', rev ' + sprint.rev + ')' : t('result.slotEmpty') }) };
  } },

  get_sprint: { ann: R, input: input({ roleKey: roleKey(), includeExcluded: flag('includeExcluded', true), includeSettings: flag('includeSettings', false),
    limit: limit('limitPerRole', 1000, LIMITS.itemsPerRole) }), run: function (c, a) {
    var sd = get(c, 'sprint-data');
    var sprint = sprintHeader(sd.sprint);
    var items = itemsByRole(sd.roleItems, a);
    var data = { sprint: sprint, activeRoles: activeRolesOf(sd), items: items, configured: val(sd, 'configured') };
    if (a.includeSettings) data.settings = val(sd, 'settings');
    var counts = Object.keys(items).map(function (r) { return r + ': ' + items[r].total; }).join(', ');
    return { data: data, summary: sprint ? t('result.sprint', { name: sprint.name, status: sprint.status, rev: sprint.rev, counts: counts || '—' }) : t('result.slotEmpty') };
  } },

  get_history: { ann: R, input: input({ sprintId: str('sprintIdFilter', 100), roleKey: roleKey(), status: oneOf(SPRINT_STATUSES, 'sprintStatus'),
    limit: limit('limit', 500, LIMITS.history), includeItems: flag('includeItems', false) }), run: function (c, a) {
    var h = get(c, 'history');
    var all = (Array.isArray(h.history) ? h.history : []).filter(isObj).filter(function (r) {
      return (!a.sprintId || r.sprintId === a.sprintId || (typeof r.sprintId === 'string' && r.sprintId.indexOf(a.sprintId + '_') === 0))
        && (!a.roleKey || r.roleKey === a.roleKey) && (!a.status || r.status === a.status);
    });
    var slice = all.slice(0, a.limit);
    var withItems = a.includeItems && !!a.sprintId;
    return { data: { rev: bodyRev(h), total: all.length, count: slice.length, hasMore: all.length > slice.length,
      records: slice.map(function (r) { return historyView(r, withItems); }) },
    summary: t('result.history', { count: slice.length, total: all.length }) + (a.includeItems && !a.sprintId ? ' ' + t('result.itemsNeedSprintId') : '') };
  } },

  get_capacity: { ann: R, input: input({ sprintId: str('sprintIdDefault', 100), includeArchive: flag('includeArchive', false) }), run: function (c, a) {
    var sid = a.sprintId || slotSprintId(c);
    var cap = sid ? get(c, 'capacity', { sprintId: sid }) : null;
    var data = { sprintId: sid, capacity: cap ? capacityView(cap.capacity) : null, archivedCount: cap && typeof cap.archivedCount === 'number' ? cap.archivedCount : null };
    if (a.includeArchive) {
      var arc = get(c, 'capacity-archive');
      data.archive = (Array.isArray(arc.archive) ? arc.archive : (Array.isArray(arc.records) ? arc.records : [])).slice(0, LIMITS.capacityArchive).map(capacityView);
    }
    return { data: data, summary: data.capacity
      ? t('result.capacity', { sprintId: sid, persons: Object.keys(data.capacity.persons).length, status: data.capacity.status })
      : t('result.capacityNone', { sprintId: sid || '—' }) };
  } },

  get_calendar: { ann: R, input: input({ year: d('year', { type: 'integer', minimum: 2000, maximum: 2100 }) }), run: function (c, a) {
    var b = get(c, 'calendar');
    var cal = isObj(b.calendar) ? b.calendar : {};
    var years = isObj(cal.years) ? cal.years : {};
    var picked = years;
    if (a.year) { picked = {}; if (years[String(a.year)] !== undefined) picked[String(a.year)] = years[String(a.year)]; }
    return { data: { years: picked, uploadedBy: val(cal, 'uploadedBy'), uploadedAt: val(cal, 'uploadedAt') },
      summary: t('result.calendar', { years: Object.keys(picked).join(', ') || '—' }) };
  } },

  get_absences: { ann: R, input: input({ login: login('loginFilter'), from: isoDate('periodFrom'), to: isoDate('periodTo') }), run: function (c, a) {
    var b = get(c, 'absences');
    var src = isObj(b.absences) ? b.absences : {};
    var out = {}, n = 0;
    Object.keys(src).forEach(function (l) {
      if ((a.login && l !== a.login) || !Array.isArray(src[l])) return;
      var kept = src[l].filter(isObj).filter(function (e) { return (!a.to || String(e.from) <= a.to) && (!a.from || String(e.to) >= a.from); });
      if (kept.length) { out[l] = kept; n += kept.length; }
    });
    return { data: { rev: bodyRev(b), absences: out }, summary: t('result.absences', { people: Object.keys(out).length, entries: n }) };
  } },

  get_releases: { ann: R, input: input({ status: oneOf(RELEASE_STATUSES, 'releaseStatusFilter'), includeArchive: flag('includeArchive', false) }), run: function (c, a) {
    var b = get(c, 'releases');
    var list = releasesOf(b).filter(function (x) { return !a.status || x.status === a.status; });
    var data = { rev: bodyRev(b), perms: val(b, 'perms'), total: list.length, releases: list.slice(0, LIMITS.releases).map(releaseView) };
    if (a.includeArchive) data.archive = releasesOf(get(c, 'releases-archive')).slice(0, LIMITS.releases).map(releaseView);
    return { data: data, summary: t('result.releases', { count: list.length, rev: data.rev }) };
  } },

  get_reminders: { ann: R, input: input({ includeJournal: flag('includeJournal', false) }), run: function (c, a) {
    var b = get(c, 'reminders');
    var data = { enabled: b.enabled === true, today: val(b, 'today'), count: typeof b.count === 'number' ? b.count : 0,
      items: Array.isArray(b.items) ? b.items : [], modules: val(b, 'modules') };
    if (a.includeJournal) { var j = get(c, 'reminders-journal'); data.journal = (Array.isArray(j.journal) ? j.journal : []).slice(0, LIMITS.journal); }
    return { data: data, summary: data.enabled ? t('result.reminders', { count: data.count }) : t('result.remindersOff') };
  } },

  upload_draft: { ann: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    input: input({ sprint: SPRINT_IN, roleItems: byRole(d(null, { type: 'array', maxItems: 1000, items: item() }), 'roleItems'),
      overwrite: flag('overwrite', false), baseRev: baseRev() }, ['sprint', 'roleItems']), run: function (c, a) {
    var sd = get(c, 'sprint-data');
    var active = activeRolesOf(sd);
    Object.keys(a.roleItems).forEach(function (r) {
      if (active && active.indexOf(r) < 0) guard('role_not_active', { roleKey: r, activeRoles: active.join(', ') });
    });
    var cur = sprintHeader(sd.sprint);
    var occupied = !!cur && cur.status !== 'FINISHED' && !(cur.status === 'PLANNING' && cur.sprintId === a.sprint.sprintId);
    if (occupied && !a.overwrite) guard('slot_occupied', { sprintId: String(cur.sprintId), status: String(cur.status), rev: cur.rev });
    var items = {};
    Object.keys(a.roleItems).forEach(function (r) { items[r] = a.roleItems[r].map(function (it) { return itemBody(it, r); }); });
    var res = post(c, 'sprint-data', { sprint: merge(sprintBody(a.sprint), { status: 'PLANNING' }), roleItems: items, baseRev: revOf(a.baseRev, function () { return slotRev(sd); }) });
    var data = { rev: val(res, 'rev'), enriched: val(res, 'enriched'), warnings: Array.isArray(res.warnings) ? res.warnings : [], overwrote: occupied };
    return { data: data, summary: t('result.uploaded', { sprintId: a.sprint.sprintId, rev: data.rev === null ? '—' : data.rev, warnings: data.warnings.length }) };
  } },

  upsert_item: { ann: W, input: input({ roleKey: roleKey(), item: item('item'), baseRev: baseRev() }, ['roleKey', 'item']), run: function (c, a) {
    return written('upsertItem', post(c, 'sprint-data', { roleKey: a.roleKey, item: itemBody(a.item, a.roleKey), baseRev: revOf(a.baseRev, function () { return slotRev(get(c, 'sprint-data')); }) }, { action: 'upsertItem' }));
  } },

  remove_item: { ann: D, input: input({ roleKey: roleKey(), issueId: issueId(), baseRev: baseRev() }, ['roleKey', 'issueId']), run: function (c, a) {
    return written('removeItem', post(c, 'sprint-data', { roleKey: a.roleKey, issueId: a.issueId, baseRev: revOf(a.baseRev, function () { return slotRev(get(c, 'sprint-data')); }) }, { action: 'removeItem' }));
  } },

  patch_sprint: { ann: W, input: input({ sprint: obj(sprintCore(), [], 'sprintPatch'), baseRev: baseRev() }, ['sprint']), run: function (c, a) {
    var body = sprintBody(a.sprint);
    if (!Object.keys(body).length) guard('nothing_to_do', {});
    return written('patchSprint', post(c, 'sprint-data', { sprint: body, baseRev: revOf(a.baseRev, function () { return slotRev(get(c, 'sprint-data')); }) }, { action: 'patchSprint' }));
  } },

  assign_person: { ann: W, input: input({ roleKey: roleKey(), issueId: issueId(), login: nul(login('assignLogin')),
    dateStart: nul(epochMs('assignDateStart')), dateEnd: nul(epochMs('assignDateEnd')), baseRev: baseRev() }, ['roleKey', 'issueId', 'login']), run: function (c, a) {
    var body = { roleKey: a.roleKey, issueId: a.issueId, login: a.login, baseRev: revOf(a.baseRev, function () { return slotRev(get(c, 'sprint-data')); }) };
    if (a.dateStart !== undefined) body.dateStart = a.dateStart;
    if (a.dateEnd !== undefined) body.dateEnd = a.dateEnd;
    return written('assignPerson', post(c, 'sprint-data', body, { action: 'assignPerson' }));
  } },

  upsert_absence: { ann: W, input: input({ login: login('login'), entry: ABSENCE_IN, baseRev: baseRev() }, ['login', 'entry']), run: function (c, a) {
    return written('upsertAbsence', post(c, 'absences', { login: a.login, entry: a.entry, baseRev: revOf(a.baseRev, function () { return bodyRev(get(c, 'absences')); }) }, { action: 'upsertAbsence' }));
  } },

  remove_absence: { ann: D, input: input({ login: login('login'), from: isoDate('absenceFrom'), to: isoDate('absenceTo'), baseRev: baseRev() }, ['login', 'from', 'to']), run: function (c, a) {
    return written('removeAbsence', post(c, 'absences', { login: a.login, from: a.from, to: a.to, baseRev: revOf(a.baseRev, function () { return bodyRev(get(c, 'absences')); }) }, { action: 'removeAbsence' }));
  } },

  upsert_capacity_person: { ann: W, input: input({ sprintId: str('sprintIdDefault', 100), login: login('login'), person: PERSON_IN }, ['login', 'person']), run: function (c, a) {
    var sid = a.sprintId || slotSprintId(c);
    if (!sid) guard('sprint_not_found', {});
    var res = post(c, 'capacity', { login: a.login, person: a.person }, { action: 'upsertPerson', sprintId: sid });
    return { data: { sprintId: sid, applied: val(res, 'applied'), allocOk: val(res, 'allocOk') }, summary: t('result.written', { action: 'upsertPerson', rev: '—' }) };
  } },

  upsert_release: { ann: W, input: input({ release: RELEASE_IN, baseRev: baseRev() }, ['release']), run: function (c, a) {
    return written('upsertRelease', post(c, 'releases', { release: a.release, baseRev: revOf(a.baseRev, function () { return bodyRev(get(c, 'releases')); }) }, { action: 'upsertRelease' }));
  } },

  set_release_status: { ann: W, input: input({ id: str('releaseId', 64, 1), status: oneOf(RELEASE_STATUSES, 'releaseStatus'),
    snapshot: d('snapshot', { type: 'object' }), baseRev: baseRev() }, ['id', 'status']), run: function (c, a) {
    var body = { id: a.id, status: a.status, baseRev: revOf(a.baseRev, function () { return bodyRev(get(c, 'releases')); }) };
    if (a.snapshot !== undefined) body.snapshot = a.snapshot;
    return written('setReleaseStatus', post(c, 'releases', body, { action: 'setReleaseStatus' }));
  } },

  update_release_issues: { ann: D, input: input({ id: str('releaseId', 64, 1), add: issues('issuesAdd'), remove: issues('issuesRemove'), baseRev: baseRev() }, ['id']), run: function (c, a) {
    var add = a.add || [], remove = a.remove || [];
    if (!add.length && !remove.length) guard('nothing_to_do', {});
    var rev = revOf(a.baseRev, function () { return bodyRev(get(c, 'releases')); });
    var added = [], removed = [];
    if (add.length) {
      var r1 = post(c, 'releases', { id: a.id, issues: add, baseRev: rev }, { action: 'addReleaseIssues' });
      added = isObj(r1.applied) && Array.isArray(r1.applied.added) ? r1.applied.added : [];
      if (typeof r1.rev === 'number') rev = r1.rev;
    }
    if (remove.length) {
      var r2 = post(c, 'releases', { id: a.id, issues: remove, baseRev: rev }, { action: 'removeReleaseIssues' });
      removed = isObj(r2.applied) && Array.isArray(r2.applied.removed) ? r2.applied.removed : [];
      if (typeof r2.rev === 'number') rev = r2.rev;
    }
    return { data: { rev: rev, added: added, removed: removed }, summary: t('result.releaseIssues', { id: a.id, added: added.length, removed: removed.length, rev: rev }) };
  } }
};

/* ── Точка входа модулей mcp-tool-<имя>.js ───────────────────────────────────── */

function execute(name, ctx) {
  var def = DEFS[name];
  var a = JSON.parse(JSON.stringify(ctx.arguments || {}));
  var bad = check(def.input, a, '');
  if (bad) fail({ ok: false, kind: 'tool', reason: 'invalid_argument:' + bad.field, problem: bad.problem }, t('errors.invalid_argument', bad));
  try {
    var out = def.run({ user: ctx.currentUser, key: a.projectKey }, a);
    return merge({ summary: out.summary }, out.data);
  } catch (e) {
    if (e && e.info) throw e;
    fail({ ok: false, kind: 'tool', reason: 'unexpected' }, t('errors.unexpected', { message: String(e && e.message || e).slice(0, 300) }));
  }
}

function tool(name) {
  var def = DEFS[name];
  return {
    name: name,
    description: t('tools.' + name + '.description'),
    inputSchema: def.input,
    annotations: merge({ title: t('tools.' + name + '.title'), openWorldHint: false }, def.ann),
    execute: function (ctx) { return execute(name, ctx); }
  };
}

exports.tool = tool;
exports.NAMES = Object.keys(DEFS);
exports.check = check;   // test-only
