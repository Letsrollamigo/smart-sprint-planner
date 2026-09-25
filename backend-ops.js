/**
 * Smart Sprint Planner — мелкие операции внешнего REST (#113 1в).
 *
 * Per-feature backend-модуль (паттерн backend-phases.js): точечные изменения для внешних
 * клиентов и агентов — «добавь задачу», «смени статус релиза» — без пересылки всего блоба.
 *
 * ПРИНЦИП — ОДНА ЛОГИКА ЗАПИСИ. Операция сама в хранилище не пишет: читает хранимый блоб,
 * применяет одно изменение чистой функцией и прогоняет ПОЛНОЕ тело через штатный обработчик
 * полной записи того же пути (core.ENDPOINTS) на адаптере ctx. Права, валидаторы, лимиты,
 * baseRev/409, серверные штампы, обогащение задач и журнал отказов наследуются по построению.
 *
 * Делегация: обработчики sprint-data / capacity / releases / absences зовут core.__ops ДО
 * разбора тела — ctx.request.body в YT-рантайме читается один раз (см. getBody ядра).
 * Require'ится в backend-project.js И backend-global.js (иначе глобальный режим ответит
 * invalid_action — сателлит не зарегистрируется).
 *
 * ИНВАРИАНТЫ БЕЗОПАСНОСТИ — см. шапку backend-core.js: authz первым (до чтения блоба и
 * ответов «не найдено»); тело — parseBodyOrReject со своим белым списком; коды отказов без
 * эха значений; логины и ключи, становящиеся ключами объектов, — через safeKey.
 */

var core = require('./backend-core.js');

var ISSUE_ID_RE = /^[A-Za-z][A-Za-z0-9_]*-\d+$/;
var RELEASE_STATUS = ['planned', 'prep', 'work', 'released', 'cancelled'];
var PERSON_KEYS = ['grade', 'rate', 'participation', 'alloc'];
/* patchSprint: серверные ключи спринта молча отбрасываются (их ставит полная запись). */
var SPRINT_SERVER_KEYS = ['updatedBy', 'updatedAt', 'pluginVersion', '_rev', 'migrationLog', 'personalPlanning'];

/* ── Общие помощники ─────────────────────────────────────────────────────────── */

function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function merge(a, b) {
  var out = {};
  Object.keys(a || {}).forEach(function (k) { out[k] = a[k]; });
  Object.keys(b || {}).forEach(function (k) { out[k] = b[k]; });
  return out;
}
/* Значение из тела, которое станет КЛЮЧОМ объекта: строка 1..max, не член прототипа. */
function safeKey(v, max) {
  return typeof v === 'string' && v.length >= 1 && v.length <= max
    && v !== '__proto__' && v !== 'constructor' && v !== 'prototype';
}
function required(field) { return { refuse: 'ops_field_required:' + field }; }
function invalid(field) { return { refuse: 'ops_field_invalid:' + field }; }

/* ── Дельты — чистые функции: (хранимое, тело) → {next, applied} | {refuse} ──── */

function applyUpsertItem(roleItems, body) {
  if (body.roleKey === undefined) return required('roleKey');
  if (core.ROLE_KEYS.indexOf(body.roleKey) < 0) return invalid('roleKey');
  if (!isObj(body.item)) return required('item');
  if (body.item.issueId === undefined) return required('issueId');
  if (typeof body.item.issueId !== 'string' || !ISSUE_ID_RE.test(body.item.issueId)) return invalid('issueId');
  var next = isObj(roleItems) ? clone(roleItems) : {};
  var list = Array.isArray(next[body.roleKey]) ? next[body.roleKey] : [];
  var idx = -1;
  for (var i = 0; i < list.length; i++) if (list[i] && list[i].issueId === body.item.issueId) { idx = i; break; }
  if (idx >= 0) list[idx] = merge(list[idx], body.item); else list.push(body.item);
  next[body.roleKey] = list;
  return { next: next, applied: { roleKey: body.roleKey, issueId: body.item.issueId, created: idx < 0 } };
}

function applyRemoveItem(roleItems, body) {
  if (body.roleKey === undefined) return required('roleKey');
  if (core.ROLE_KEYS.indexOf(body.roleKey) < 0) return invalid('roleKey');
  if (body.issueId === undefined) return required('issueId');
  if (typeof body.issueId !== 'string' || !ISSUE_ID_RE.test(body.issueId)) return invalid('issueId');
  var next = isObj(roleItems) ? clone(roleItems) : {};
  var list = Array.isArray(next[body.roleKey]) ? next[body.roleKey] : [];
  var kept = list.filter(function (it) { return !(it && it.issueId === body.issueId); });
  if (kept.length === list.length) return { refuse: 'item_not_found' };
  next[body.roleKey] = kept;
  return { next: next, applied: { roleKey: body.roleKey, issueId: body.issueId } };
}

function applyPatchSprint(sprint, body) {
  if (!isObj(body.sprint)) return required('sprint');
  if (!isObj(sprint)) return { refuse: 'sprint_not_found' };
  if (body.sprint.sprintId !== undefined && body.sprint.sprintId !== sprint.sprintId) return invalid('sprintId');
  var next = clone(sprint);
  var keys = [];
  Object.keys(body.sprint).forEach(function (k) {
    if (k === 'sprintId' || SPRINT_SERVER_KEYS.indexOf(k) >= 0 || k.indexOf('phases') === 0) return;
    next[k] = body.sprint[k];
    keys.push(k);
  });
  return { next: next, applied: { sprintId: sprint.sprintId, keys: keys } };
}

function applyUpsertAbsence(absences, body) {
  if (body.login === undefined) return required('login');
  if (!safeKey(body.login, 200)) return invalid('login');
  if (!isObj(body.entry)) return required('entry');
  var next = isObj(absences) ? clone(absences) : {};
  var list = Array.isArray(next[body.login]) ? next[body.login] : [];
  var idx = -1;
  for (var i = 0; i < list.length; i++) if (list[i] && list[i].from === body.entry.from && list[i].to === body.entry.to) { idx = i; break; }
  if (idx >= 0) list[idx] = body.entry; else list.push(body.entry);
  next[body.login] = list;
  return { next: next, applied: { login: body.login, from: body.entry.from, to: body.entry.to, created: idx < 0 } };
}

function applyRemoveAbsence(absences, body) {
  if (body.login === undefined) return required('login');
  if (!safeKey(body.login, 200)) return invalid('login');
  if (body.from === undefined) return required('from');
  if (body.to === undefined) return required('to');
  var next = isObj(absences) ? clone(absences) : {};
  var list = (has(next, body.login) && Array.isArray(next[body.login])) ? next[body.login] : [];
  var kept = list.filter(function (e) { return !(e && e.from === body.from && e.to === body.to); });
  if (kept.length === list.length) return { refuse: 'absence_not_found' };
  if (kept.length) next[body.login] = kept; else delete next[body.login];
  return { next: next, applied: { login: body.login, from: body.from, to: body.to } };
}

/* record — хранимая запись ёмкости спринта либо null (первое сохранение). В полную запись
   уходят только примитивы человека: base/absencesApplied сервер пересчитывает сам. */
function applyUpsertPerson(record, body) {
  if (body.login === undefined) return required('login');
  if (!safeKey(body.login, 200)) return invalid('login');
  if (!isObj(body.person)) return required('person');
  var stored = (record && isObj(record.persons)) ? record.persons : {};
  var next = {};
  Object.keys(stored).forEach(function (login) {
    var p = {};
    PERSON_KEYS.forEach(function (k) { if (isObj(stored[login]) && stored[login][k] !== undefined) p[k] = stored[login][k]; });
    next[login] = p;
  });
  var created = !has(next, body.login);
  next[body.login] = merge(next[body.login], body.person);
  return { next: next, applied: { login: body.login, created: created } };
}

/* Назначение человека на задачу. КАНОН персонального распределения — запись роли в истории
   (`<sprintId>_<roleKey>`.personalPlanning, её читает виджет); `sprint.personalPlanning` —
   зеркало {roleKey: PP}, которое виджет пересобирает из канона. Поэтому дельта отдаёт оба:
   pp — новый канон записи роли, mirror — зеркало по всем ролям спринта. Ключи записи — как
   пишет виджет: assignee, assigneeName, dateStart, dateEnd; ganttColor сбрасывается (кэш). */
function applyAssignPerson(sprint, history, body) {
  if (body.roleKey === undefined) return required('roleKey');
  if (core.ROLE_KEYS.indexOf(body.roleKey) < 0) return invalid('roleKey');
  if (body.issueId === undefined) return required('issueId');
  if (typeof body.issueId !== 'string' || !ISSUE_ID_RE.test(body.issueId)) return invalid('issueId');
  if (body.login !== null && !(typeof body.login === 'string' && body.login.length >= 1 && body.login.length <= 200)) return invalid('login');
  var dateKeys = ['dateStart', 'dateEnd'];
  for (var d = 0; d < dateKeys.length; d++) {
    var dv = body[dateKeys[d]];
    if (dv !== undefined && dv !== null && !(typeof dv === 'number' && isFinite(dv))) return invalid(dateKeys[d]);
  }
  if (!isObj(sprint)) return { refuse: 'sprint_not_found' };
  var list = Array.isArray(history) ? history : [];
  var recId = sprint.sprintId + '_' + body.roleKey;
  var rec = null;
  for (var i = 0; i < list.length; i++) if (list[i] && list[i].sprintId === recId) { rec = list[i]; break; }
  if (!rec) return { refuse: 'role_record_not_found' };

  var pp = isObj(rec.personalPlanning) ? clone(rec.personalPlanning) : {};
  var ta = isObj(pp.taskAssignments) ? pp.taskAssignments : {};
  var entry = (has(ta, body.issueId) && isObj(ta[body.issueId])) ? ta[body.issueId] : {};
  if (body.login === null) {
    delete entry.assignee;
    delete entry.assigneeName;
  } else {
    var rba = isObj(pp.resourcesByAssignee) ? pp.resourcesByAssignee : {};
    entry.assignee = body.login;
    entry.assigneeName = (has(rba, body.login) && rba[body.login] && rba[body.login].assigneeName) || body.login;
  }
  delete entry.ganttColor;
  dateKeys.forEach(function (k) {
    if (body[k] === null) delete entry[k]; else if (body[k] !== undefined) entry[k] = body[k];
  });
  if (Object.keys(entry).length) ta[body.issueId] = entry; else delete ta[body.issueId];
  pp.taskAssignments = ta;

  var mirror = {};
  var prefix = sprint.sprintId + '_';
  list.forEach(function (r) {
    if (!r || typeof r.sprintId !== 'string' || r.sprintId.indexOf(prefix) !== 0) return;
    var rk = r.roleKey || r.sprintId.slice(prefix.length);
    var p = (r === rec) ? pp : r.personalPlanning;
    if (core.ROLE_KEYS.indexOf(rk) >= 0 && isObj(p) && Object.keys(p).length) mirror[rk] = p;
  });
  return { recId: recId, pp: pp, mirror: mirror, applied: { roleKey: body.roleKey, issueId: body.issueId, assignee: body.login } };
}

function findRelease(list, id) {
  for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return i;
  return -1;
}

function applyUpsertRelease(releases, body) {
  if (!isObj(body.release)) return required('release');
  if (typeof body.release.id !== 'string' || !body.release.id) return required('id');
  var next = Array.isArray(releases) ? clone(releases) : [];
  var idx = findRelease(next, body.release.id);
  if (idx >= 0) next[idx] = merge(next[idx], body.release); else next.push(body.release);
  return { next: next, applied: { id: body.release.id, created: idx < 0 } };
}

function applySetReleaseStatus(releases, body) {
  if (typeof body.id !== 'string' || !body.id) return required('id');
  if (body.status === undefined) return required('status');
  if (RELEASE_STATUS.indexOf(body.status) < 0) return invalid('status');
  var next = Array.isArray(releases) ? clone(releases) : [];
  var idx = findRelease(next, body.id);
  if (idx < 0) return { refuse: 'release_not_found' };
  next[idx].status = body.status;
  if (body.snapshot !== undefined) next[idx].snapshot = body.snapshot;
  return { next: next, applied: { id: body.id, status: body.status } };
}

/* #138 — точечное удаление из активного реестра; архив не трогается. Релиз-инженеру отказывает
   полная запись (правило одного шага статуса: число записей изменилось). */
function applyRemoveRelease(releases, body) {
  if (typeof body.id !== 'string' || !body.id) return required('id');
  var next = Array.isArray(releases) ? clone(releases) : [];
  var idx = findRelease(next, body.id);
  if (idx < 0) return { refuse: 'release_not_found' };
  next.splice(idx, 1);
  return { next: next, applied: { id: body.id } };
}

function issuesOk(list) {
  return Array.isArray(list) && list.length <= 2000
    && list.every(function (s) { return typeof s === 'string' && s.length >= 1 && s.length <= 64; });
}

function applyReleaseIssues(releases, body, add) {
  if (typeof body.id !== 'string' || !body.id) return required('id');
  if (body.issues === undefined) return required('issues');
  if (!issuesOk(body.issues)) return invalid('issues');
  var next = Array.isArray(releases) ? clone(releases) : [];
  var idx = findRelease(next, body.id);
  if (idx < 0) return { refuse: 'release_not_found' };
  var cur = Array.isArray(next[idx].issues) ? next[idx].issues : [];
  var changed = [];
  if (add) {
    body.issues.forEach(function (s) { if (cur.indexOf(s) < 0 && changed.indexOf(s) < 0) changed.push(s); });
    next[idx].issues = cur.concat(changed);
    return { next: next, applied: { id: body.id, added: changed } };
  }
  next[idx].issues = cur.filter(function (s) {
    if (body.issues.indexOf(s) < 0) return true;
    changed.push(s);
    return false;
  });
  return { next: next, applied: { id: body.id, removed: changed } };
}

/* ── Таблица операций ────────────────────────────────────────────────────────────
   keys — белый список тела; rev — слот с ревизией (baseRev обязателен); authz — роль полной
   записи (проверяется ДО чтения блоба; у capacity/releases/absences её уже проверил
   обработчик пути перед делегацией); read — хранимый блоб как его отдаёт GET; full —
   вариант action полной записи и сборка её тела. */

function readRoleItems(ctx) { return core.migrateRoleItemsObj(core.parseJson(core.getProp(ctx, 'ssp_roleitems'), null) || {}); }
function readSprint(ctx) { return core.migrateSprintObj(core.parseJson(core.getProp(ctx, 'ssp_sprint'), null)); }
function readHistory(ctx) {
  var h = core.parseJson(core.getProp(ctx, 'ssp_history'), []);
  return core.stripDeprecatedHistoryKeys(core.migrateHistoryArr(Array.isArray(h) ? h : []));
}
function readAbsences(ctx) { return core.parseJson(core.getProp(ctx, 'ssp_absences'), {}) || {}; }
function readReleases(ctx) {
  var blob = core.parseJson(core.getProp(ctx, 'ssp_releases'), null);
  return (blob && Array.isArray(blob.releases)) ? blob.releases : [];
}
function sprintIdOf(ctx) { return (ctx.request.getParameter('sprintId') || '').trim(); }
function readCapacity(ctx) {
  var store = core.parseJson(core.getProp(ctx, 'ssp_capacity'), {}) || {};
  var sid = sprintIdOf(ctx);
  return (sid && has(store, sid)) ? store[sid] : null;
}
function wrap(key) { return function (next, body) { var o = { baseRev: body.baseRev }; o[key] = next; return o; }; }

var OPS = {
  'sprint-data': {
    upsertItem:  { keys: ['roleKey', 'item', 'baseRev'],    rev: true, authz: 'editor', read: readRoleItems, apply: applyUpsertItem,  fullAction: '', full: wrap('roleItems') },
    removeItem:  { keys: ['roleKey', 'issueId', 'baseRev'], rev: true, authz: 'editor', read: readRoleItems, apply: applyRemoveItem,  fullAction: '', full: wrap('roleItems') },
    patchSprint: { keys: ['sprint', 'baseRev'],             rev: true, authz: 'editor', read: readSprint,    apply: applyPatchSprint, fullAction: '', full: wrap('sprint') },
    /* Две полные записи. Первой — зеркало в слоте спринта: у неё гейт baseRev, отказ (409, права)
       приходит ДО любой записи. Второй — канон в истории. Сбой второй оставляет зеркало впереди
       канона — безвредно: виджет читает канон, а зеркало пересобирает при своём сохранении. */
    assignPerson: { keys: ['roleKey', 'issueId', 'login', 'dateStart', 'dateEnd', 'baseRev'], rev: true, authz: 'assigner',
      read: function (ctx) { return { sprint: readSprint(ctx), history: readHistory(ctx) }; },
      apply: function (st, body) { return applyAssignPerson(st.sprint, st.history, body); },
      write: function (ctx, res, body) {
        var slot = runFullWrite(ctx, 'sprint-data', 'assignerSync', { sprint: { personalPlanning: res.mirror }, baseRev: body.baseRev });
        if (!slot.body || slot.body.success !== true) return slot;
        var canon = runFullWrite(ctx, 'history', 'assignerSync', { history: [{ sprintId: res.recId, personalPlanning: res.pp }] });
        if (!canon.body || canon.body.success !== true) return canon;
        slot.body.historyRev = canon.body.rev;
        return slot;
      } }
  },
  absences: {
    upsertAbsence: { keys: ['login', 'entry', 'baseRev'],      rev: true, read: readAbsences, apply: applyUpsertAbsence, fullAction: '', full: wrap('absences') },
    removeAbsence: { keys: ['login', 'from', 'to', 'baseRev'], rev: true, read: readAbsences, apply: applyRemoveAbsence, fullAction: '', full: wrap('absences') }
  },
  capacity: {
    upsertPerson: { keys: ['login', 'person'], rev: false, read: readCapacity, fullAction: 'save',
      apply: function (record, body, ctx) {
        var r = applyUpsertPerson(record, body);
        if (r.applied) r.applied = { sprintId: sprintIdOf(ctx), login: r.applied.login, created: r.applied.created };
        return r;
      },
      full: function (next) { return { persons: next }; } }
  },
  releases: {
    upsertRelease:       { keys: ['release', 'baseRev'],                  rev: true, read: readReleases, apply: applyUpsertRelease,    fullAction: '', full: wrap('releases') },
    setReleaseStatus:    { keys: ['id', 'status', 'snapshot', 'baseRev'], rev: true, read: readReleases, apply: applySetReleaseStatus, fullAction: '', full: wrap('releases') },
    addReleaseIssues:    { keys: ['id', 'issues', 'baseRev'],             rev: true, read: readReleases, fullAction: '', full: wrap('releases'),
      apply: function (stored, body) { return applyReleaseIssues(stored, body, true); } },
    removeReleaseIssues: { keys: ['id', 'issues', 'baseRev'],             rev: true, read: readReleases, fullAction: '', full: wrap('releases'),
      apply: function (stored, body) { return applyReleaseIssues(stored, body, false); } },
    removeRelease:       { keys: ['id', 'baseRev'],                       rev: true, read: readReleases, apply: applyRemoveRelease,    fullAction: '', full: wrap('releases') }
  }
};

function hasOp(path, action) { return has(OPS, path) && has(OPS[path], action); }

/* Адаптер ctx (образец — buildProjectCtx глобального контура): полная запись читает собранное
   тело и свой вариант action, её ответ перехватывается. cid наследуется — иначе отказ внутри
   полной записи получил бы второй идентификатор и строка лога разошлась бы с конвертом. */
function runFullWrite(ctx, path, fullAction, fullBody) {
  var captured = { status: null, body: null };
  var response = { json: function (b) { captured.body = b; } };
  Object.defineProperty(response, 'status', {
    get: function () { return captured.status; },
    set: function (v) { captured.status = v; }
  });
  var sub = {
    project: ctx.project,
    settings: ctx.settings,
    currentUser: ctx.currentUser,
    request: {
      body: JSON.stringify(fullBody),
      getParameter: function (k) { return k === 'action' ? fullAction : ctx.request.getParameter(k); }
    },
    response: response,
    __sspCid: core.cid(ctx)
  };
  var full = null;
  for (var i = 0; i < core.ENDPOINTS.length; i++) {
    if (core.ENDPOINTS[i].method === 'POST' && core.ENDPOINTS[i].path === path) { full = core.ENDPOINTS[i]; break; }
  }
  full.handle(sub);
  return captured;
}

function handle(ctx, path, action) {
  var op = OPS[path][action];
  if (op.authz && !core.authzGuard(ctx, op.authz)) return;
  var body = core.parseBodyOrReject(ctx, op.keys);
  if (body === null) return;
  if (op.rev && (typeof body.baseRev !== 'number' || !isFinite(body.baseRev))) { core.badRequest(ctx, 'base_rev_required'); return; }
  var res = op.apply(op.read(ctx), body, ctx);
  if (res.refuse) { core.badRequest(ctx, res.refuse); return; }
  var out = op.write ? op.write(ctx, res, body) : runFullWrite(ctx, path, op.fullAction, op.full(res.next, body));
  var envelope = out.body || {};
  if (envelope.success === true) {
    envelope.action = action;
    envelope.applied = res.applied;
  } else if (out.status) {
    ctx.response.status = out.status;
  }
  ctx.response.json(envelope);
}

/* Самрегистрация на объекте ядра (образец core.__phases): ядро не require'ит сателлит (цикл). */
if (core && !core.__ops) core.__ops = { has: hasOp, handle: handle };

/* Runtime + test-only exports. */
exports.has = hasOp;
exports.handle = handle;
if (typeof module !== 'undefined' && module.exports) {
  Object.assign(exports, {
    applyUpsertItem: applyUpsertItem, applyRemoveItem: applyRemoveItem, applyPatchSprint: applyPatchSprint, applyAssignPerson: applyAssignPerson,
    applyUpsertAbsence: applyUpsertAbsence, applyRemoveAbsence: applyRemoveAbsence, applyUpsertPerson: applyUpsertPerson,
    applyUpsertRelease: applyUpsertRelease, applySetReleaseStatus: applySetReleaseStatus, applyReleaseIssues: applyReleaseIssues,
    applyRemoveRelease: applyRemoveRelease
  });
}
