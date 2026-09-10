/**
 * Smart Sprint Planner — Reminders backend (#112 «Напоминания», v3.40.0).
 *
 * Per-feature backend-модуль (§11 «фича бэка = свой модуль»). Require-ится в backend-project.js
 * И backend-global.js ВЫШЕ чтения core.ENDPOINTS; endpoint-объекты дописывает в общий
 * core.ENDPOINTS (иначе глобальный режим — то есть весь планер — 404, gotcha #7).
 *
 * POST reminders { action:'sync' } — один запрос при загрузке виджета: читает настройки и пять
 * свойств проекта, зовёт чистый вычислитель backend-reminders-calc.js, применяет права адресатов
 * НА СЕРВЕРЕ (предикаты ядра isValidator / isSettingsManager / isPlanningManager — не authzGuard:
 * тот при отказе сам шлёт 403), идемпотентно сверяет журнал ssp_reminders и отдаёт список + счётчик.
 * GET reminders — тот же ответ БЕЗ сверки журнала (чистое чтение для внешних потребителей).
 * Почему POST (3.41.0): YouTrack исполняет GET extension-endpoint в read-only транзакции —
 * setProp из GET кидает ReadonlyTransactionException, журнал в 3.40.0 не писался вовсе.
 *
 * Журнал — { journal: [record…], pluginVersion }; запись = «появился / погас» по ключу
 * «модуль + сущность + день», id детерминирован. reconcile — чистая функция состояния (журнал,
 * активное множество, today): повтор запроса обязан дать тот же журнал. Ошибка записи журнала
 * ответ не валит (журнал вторичен) — одна строка warn с cid.
 *
 * S5 (v3.41.0): журнал наружу — GET reminders-journal (весь журнал проекта: firedDay убыв.,
 * открытые впереди при равном дне; отдаётся и при выключенном мастере — данные сохраняются, ⚖9)
 * и POST reminders-journal { action:'delete', id }: удалять запись может только её адресат (§4.2 —
 * спринты: валидатор; ёмкость: settingsOrPlanning; релизы: валидатор ∨ представитель релиза из
 * актива или архива, релиза нет → только валидатор). Удаление активной записи напоминание НЕ гасит:
 * следующий POST reminders sync заведёт её заново с firedDay = today (⚖8, У2). Read-modify-write без
 * baseRev (⚖ «не усложнять»): удаление по id идемпотентно, потеря гонки восстанавливается сверкой.
 *
 * ИНВАРИАНТЫ БЕЗОПАСНОСТИ — см. шапку backend-core.js: authzGuard первым; ошибки только
 * core.forbidden/badRequest/internalError (кладут cid); размер-чек до setProp; в ответ не
 * попадают чужие логины (roleReps релизов остаются на сервере).
 */

var core = require('./backend-core.js');
var calc = require('./backend-reminders-calc.js');

var PROP = 'ssp_reminders';
var MAX_JOURNAL = 50;                 /* кольцо (⚖8) */
var MAX_REMINDERS_SIZE = 64 * 1024;   /* запас ×5 к 50 × ≈250 байт */
var PARAM_KEYS = ['sprint', 'role', 'release', 'status'];

function isStrOrNull(v, max) { return v === undefined || v === null || (typeof v === 'string' && v.length <= max); }

/* Копия записи только с разрешёнными ключами (и params — только с известными подстановками):
   вход reconcile не мутируется, чужие ключи на чтении молча срезаются (блоб пишет только сервер). */
function sanitizeRecord(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
  var out = {}, keys = core.ALLOWED_REMINDERS_RECORD_KEYS, i;
  for (i = 0; i < keys.length; i++) if (r[keys[i]] !== undefined) out[keys[i]] = r[keys[i]];
  out.params = copyParams(r.params);
  return out;
}

function copyParams(p) {
  var out = {};
  if (!p || typeof p !== 'object') return out;
  for (var i = 0; i < PARAM_KEYS.length; i++) {
    var v = p[PARAM_KEYS[i]];
    if (v === undefined) continue;
    out[PARAM_KEYS[i]] = (typeof v === 'string') ? v : null;
  }
  return out;
}

function validateRemindersRecord(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return false;
  var keys = Object.keys(r), i;
  for (i = 0; i < keys.length; i++) if (core.ALLOWED_REMINDERS_RECORD_KEYS.indexOf(keys[i]) < 0) return false;
  if (typeof r.id !== 'string' || !r.id || r.id.length > 300) return false;
  if (calc.MODULES.indexOf(r.module) < 0) return false;
  if (calc.KINDS.indexOf(r.kind) < 0) return false;
  if (typeof r.entityId !== 'string' || !r.entityId || r.entityId.length > 200) return false;
  if (r.params !== undefined && r.params !== null) {
    if (typeof r.params !== 'object' || Array.isArray(r.params)) return false;
    var pk = Object.keys(r.params);
    for (i = 0; i < pk.length; i++) {
      if (PARAM_KEYS.indexOf(pk[i]) < 0 || !isStrOrNull(r.params[pk[i]], 500)) return false;
    }
  }
  if (typeof r.firedDay !== 'number' || !isFinite(r.firedDay)) return false;
  if (r.resolvedDay !== undefined && r.resolvedDay !== null && (typeof r.resolvedDay !== 'number' || !isFinite(r.resolvedDay))) return false;
  if (r.resolvedHow !== undefined && r.resolvedHow !== null && calc.RESOLVED_HOW.indexOf(r.resolvedHow) < 0) return false;
  if (!isStrOrNull(r.resolvedBy, 200)) return false;
  return true;
}

/* Блоб { journal: [record…], pluginVersion }: whitelist ключей, кольцо, уникальность id. */
function validateRemindersBlob(blob) {
  if (!blob || typeof blob !== 'object' || Array.isArray(blob)) return false;
  var keys = Object.keys(blob), i;
  for (i = 0; i < keys.length; i++) if (core.ALLOWED_REMINDERS_KEYS.indexOf(keys[i]) < 0) return false;
  if (!isStrOrNull(blob.pluginVersion, 40)) return false;
  var list = blob.journal;
  if (list === undefined || list === null) return true;
  if (!Array.isArray(list) || list.length > MAX_JOURNAL) return false;
  var seen = {};
  for (i = 0; i < list.length; i++) {
    if (!validateRemindersRecord(list[i])) return false;
    if (seen[list[i].id]) return false;
    seen[list[i].id] = true;
  }
  return true;
}

/* Чужие ключи срезаются молча; запись с невалидным ЗНАЧЕНИЕМ выкидывается — иначе она дожила бы
   до validateRemindersBlob на записи и журнал молча перестал бы писаться навсегда. */
function readJournal(ctx) {
  var blob = core.parseJson(core.getProp(ctx, PROP, null), null);
  var list = (blob && Array.isArray(blob.journal)) ? blob.journal : [];
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var r = sanitizeRecord(list[i]);
    if (r && validateRemindersRecord(r)) out.push(r);
  }
  return out;
}

function serializeBlob(list) {
  return JSON.stringify({ journal: list, pluginVersion: core.CURRENT_PLUGIN_VERSION });
}

function byFiredDay(a, b) { return a.firedDay - b.firedDay; }

/* Индекс старейшей записи (список отсортирован по firedDay возр.): среди погасших или любой. */
function oldestIndex(list, resolvedOnly) {
  if (!resolvedOnly) return list.length ? 0 : -1;
  for (var i = 0; i < list.length; i++) if (list[i].resolvedDay !== null) return i;
  return -1;
}

/* Кольцо 50 (старейшие погасшие, иначе старейшие открытые) + размер (дообрезка погасших). */
function trimJournal(list) {
  while (list.length > MAX_JOURNAL) {
    var idx = oldestIndex(list, true);
    list.splice(idx < 0 ? 0 : idx, 1);
  }
  while (serializeBlob(list).length > MAX_REMINDERS_SIZE) {
    var j = oldestIndex(list, true);
    if (j < 0) break;
    list.splice(j, 1);
  }
  return list;
}

/**
 * reconcile(journal, activeItems, today, explain) → новый массив (вход не мутируется).
 *   1. дедуп по id (гонка двух открытий — остаётся первая);
 *   2. активный пункт без открытой записи по ключу module:entityId → новая запись
 *      { id: module:entityId:today, firedDay: today }. Если такой id уже есть (пункт появился,
 *      погас и снова появился В ОДИН день) — новой записи нет до завтра: id детерминирован,
 *      дублей не бывает, ретрай GET даёт тот же журнал;
 *   3. открытая запись без активного пункта → resolvedDay = today, {how, by} = explain(record);
 *   4. порядок по firedDay возр., кольцо и размер (trimJournal).
 */
function reconcile(journal, activeItems, today, explain) {
  var seen = {}, next = [], openByKey = {}, activeKeys = {}, i, r, key;
  for (i = 0; i < (journal || []).length; i++) {
    r = sanitizeRecord(journal[i]);
    if (!r || typeof r.id !== 'string' || !r.id || seen[r.id]) continue;
    seen[r.id] = true;
    if (r.resolvedDay === undefined) r.resolvedDay = null;
    if (r.resolvedHow === undefined) r.resolvedHow = null;
    if (r.resolvedBy === undefined) r.resolvedBy = null;
    next.push(r);
    if (r.resolvedDay === null) openByKey[r.module + ':' + r.entityId] = r;
  }
  for (i = 0; i < (activeItems || []).length; i++) {
    var it = activeItems[i];
    key = it.module + ':' + it.entityId;
    activeKeys[key] = true;
    if (openByKey[key]) continue;
    var id = key + ':' + today;
    if (seen[id]) continue;
    seen[id] = true;
    next.push({ id: id, module: it.module, kind: it.kind, entityId: it.entityId, params: copyParams(it.params),
      firedDay: today, resolvedDay: null, resolvedHow: null, resolvedBy: null });
  }
  for (i = 0; i < next.length; i++) {
    r = next[i];
    if (r.resolvedDay !== null || activeKeys[r.module + ':' + r.entityId]) continue;
    var ex = (explain && explain(r)) || {};
    r.resolvedDay = today;
    r.resolvedHow = calc.RESOLVED_HOW.indexOf(ex.how) >= 0 ? ex.how : 'gone';
    r.resolvedBy = (typeof ex.by === 'string' && ex.by) ? ex.by : null;
  }
  next.sort(byFiredDay);
  return trimJournal(next);
}

function warn(ctx, what) {
  try { console.warn('[smart-sprint-planner] ' + core.cid(ctx) + ' reminders journal skipped: ' + what); } catch (e) { /* never throw */ }
}

/* Запись журнала — только при изменении; отказ валидации/размера/setProp ответ не валит. */
function writeJournalIfChanged(ctx, journal, next) {
  if (JSON.stringify(next) === JSON.stringify(journal)) return false;
  var blob = { journal: next, pluginVersion: core.CURRENT_PLUGIN_VERSION };
  if (!validateRemindersBlob(blob)) { warn(ctx, 'invalid_reminders_structure'); return false; }
  var str = JSON.stringify(blob);
  if (str.length > MAX_REMINDERS_SIZE) { warn(ctx, 'reminders_too_large'); return false; }
  try { core.setProp(ctx, PROP, str); } catch (e) { warn(ctx, 'set_prop_failed'); return false; }
  return true;
}

/* Один батч прав на запрос (§4.2). Логин — как stampAudit backend-release.js. */
function whoAmI(ctx) {
  var u = ctx.currentUser || {};
  return {
    login: (u.login || u.id) || '',
    validator: core.isValidator(ctx),
    planning: core.isSettingsManager(ctx) || core.isPlanningManager(ctx)
  };
}

function isAddressee(rule, me) {
  if (rule === 'validator') return !!me.validator;
  if (rule === 'settingsOrPlanning') return !!me.planning;
  if (rule && typeof rule === 'object') {
    if (rule.orValidator && me.validator) return true;
    return !!me.login && Array.isArray(rule.logins) && rule.logins.indexOf(me.login) >= 0;
  }
  return false;
}

function isReleaseRep(releases, login) {
  if (!login) return false;
  for (var i = 0; i < releases.length; i++) {
    var reps = releases[i] && releases[i].roleReps;
    if (reps && (reps.manager === login || reps.engineer === login)) return true;
  }
  return false;
}

function releasesOf(blob) { return (blob && Array.isArray(blob.releases)) ? blob.releases : []; }

/* Архив релизов нужен explainResolved только когда есть открытая запись журнала по релизу,
   которого нет среди активных пунктов — блоб до 250 КБ на каждый GET иначе. */
function withReleasesArchive(ctx, data, journal, items) {
  var active = {}, i;
  for (i = 0; i < items.length; i++) active[items[i].module + ':' + items[i].entityId] = true;
  for (i = 0; i < journal.length; i++) {
    var r = journal[i];
    if (r.module === 'releases' && r.resolvedDay === null && !active['releases:' + r.entityId]) {
      var out = {}, k;
      for (k in data) if (Object.prototype.hasOwnProperty.call(data, k)) out[k] = data[k];
      out.releases = data.releases.concat(releasesOf(core.parseJson(core.getProp(ctx, 'ssp_releases_archive', null), null)));
      return out;
    }
  }
  return data;
}

function publicItem(it) {
  return { id: it.id, module: it.module, kind: it.kind, entityId: it.entityId, params: it.params, days: it.days, ref: it.ref };
}

/* Общий хвост GET/POST: расчёт, (sync) сверка журнала, фильтр по адресату, ответ. */
function respondReminders(ctx, sync) {
  var settings = core.parseJson(core.getProp(ctx, 'ssp_settings', null), null) || {};
  if (settings.remindersEnabled !== true) {
    ctx.response.json({ success: true, enabled: false, count: 0, items: [], modules: {} });
    return;
  }
  var today = calc.todayOf(Date.now());
  var history = core.parseJson(core.getProp(ctx, 'ssp_history', null), null);
  var capacity = core.parseJson(core.getProp(ctx, 'ssp_capacity', null), null);
  var data = {
    settings: settings,
    sprint: core.parseJson(core.getProp(ctx, 'ssp_sprint', null), null),
    history: Array.isArray(history) ? history : [],
    capacity: (capacity && typeof capacity === 'object' && !Array.isArray(capacity)) ? capacity : {},
    releases: releasesOf(core.parseJson(core.getProp(ctx, 'ssp_releases', null), null)),
    today: today
  };
  var all = calc.compute(data);
  if (sync) {
    var journal = readJournal(ctx);
    var explainData = withReleasesArchive(ctx, data, journal, all.items);
    var next = reconcile(journal, all.items, today, function (rec) { return calc.explainResolved(rec, explainData); });
    writeJournalIfChanged(ctx, journal, next);
  }
  var me = whoAmI(ctx), mine = [];
  for (var i = 0; i < all.items.length; i++) {
    if (isAddressee(all.items[i].addressee, me)) mine.push(publicItem(all.items[i]));
  }
  ctx.response.json({
    success: true, enabled: true, today: today, count: mine.length, items: mine,
    modules: {
      sprints:  { on: all.modules.sprints.on,  addressee: !!me.validator },
      capacity: { on: all.modules.capacity.on, addressee: !!me.planning },
      releases: { on: all.modules.releases.on, addressee: !!me.validator || isReleaseRep(data.releases, me.login) }
    }
  });
}

function handleGetReminders(ctx) {
  if (!core.authzGuard(ctx, 'viewer')) return;
  respondReminders(ctx, false);
}

function handlePostReminders(ctx) {
  if (!core.authzGuard(ctx, 'viewer')) return;
  var body = core.parseBodyOrReject(ctx, ['action']);
  if (!body) return;
  if (body.action !== 'sync') { core.badRequest(ctx, 'invalid_action'); return; }
  respondReminders(ctx, true);
}

/* ── S5: журнал наружу ─────────────────────────────────────────────────────── */

/* Порядок показа (§4.5): firedDay убыв., при равном дне открытые впереди. Хранение — по firedDay возр. */
function byViewOrder(a, b) {
  if (b.firedDay !== a.firedDay) return b.firedDay - a.firedDay;
  return (a.resolvedDay === null ? 0 : 1) - (b.resolvedDay === null ? 0 : 1);
}
function viewJournal(list) { return list.slice().sort(byViewOrder); }

function findRelease(ctx, id) {
  var stores = ['ssp_releases', 'ssp_releases_archive'];
  for (var s = 0; s < stores.length; s++) {
    var list = releasesOf(core.parseJson(core.getProp(ctx, stores[s], null), null));
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return list[i];
  }
  return null;
}

/* Право удалить запись = адресат её модуля (§4.2, колонка «удаление»). */
function canDeleteRecord(ctx, rec, me) {
  if (rec.module === 'sprints') return !!me.validator;
  if (rec.module === 'capacity') return !!me.planning;
  if (rec.module === 'releases') {
    if (me.validator) return true;
    var rel = findRelease(ctx, rec.entityId), reps = rel && rel.roleReps;
    return !!(reps && me.login && (reps.manager === me.login || reps.engineer === me.login));
  }
  return false;
}

function handleGetJournal(ctx) {
  if (!core.authzGuard(ctx, 'viewer')) return;
  ctx.response.json({ success: true, today: calc.todayOf(Date.now()), journal: viewJournal(readJournal(ctx)) });
}

function handlePostJournal(ctx) {
  if (!core.authzGuard(ctx, 'viewer')) return;
  var body = core.parseBodyOrReject(ctx, ['action', 'id']);   /* тело читается один раз */
  if (!body) return;
  if (body.action !== 'delete') { core.badRequest(ctx, 'invalid_journal_action'); return; }
  if (typeof body.id !== 'string' || !body.id) { core.badRequest(ctx, 'invalid_journal_id'); return; }
  var journal = readJournal(ctx), idx = -1;
  for (var i = 0; i < journal.length; i++) if (journal[i].id === body.id) { idx = i; break; }
  if (idx < 0) { core.badRequest(ctx, 'journal_record_not_found'); return; }
  if (!canDeleteRecord(ctx, journal[idx], whoAmI(ctx))) { core.forbidden(ctx, 'not_addressee'); return; }
  var next = journal.slice(0, idx).concat(journal.slice(idx + 1));
  var blob = { journal: next, pluginVersion: core.CURRENT_PLUGIN_VERSION };
  if (!validateRemindersBlob(blob)) { core.badRequest(ctx, 'invalid_reminders_structure'); return; }
  try { core.setProp(ctx, PROP, JSON.stringify(blob)); } catch (e) { core.internalError(ctx, 'reminders_journal_write_failed'); return; }
  ctx.response.json({ success: true, today: calc.todayOf(Date.now()), journal: viewJournal(next) });
}

var REMINDERS_ENDPOINTS = [
  { scope: 'project', method: 'GET',  path: 'reminders',         handle: handleGetReminders },
  { scope: 'project', method: 'POST', path: 'reminders',         handle: handlePostReminders },
  { scope: 'project', method: 'GET',  path: 'reminders-journal', handle: handleGetJournal },
  { scope: 'project', method: 'POST', path: 'reminders-journal', handle: handlePostJournal }
];

/* Самрегистрация в ОБЩИЙ core.ENDPOINTS (оба handler-файла читают его — gotcha #7).
   Идемпотентно: guard на core-объекте защищает от двойного push в shared-контексте. */
if (core && core.ENDPOINTS && !core.__remindersEndpointsRegistered) {
  for (var ei = 0; ei < REMINDERS_ENDPOINTS.length; ei++) core.ENDPOINTS.push(REMINDERS_ENDPOINTS[ei]);
  core.__remindersEndpointsRegistered = true;
}

/* Runtime + test-only exports. */
exports.REMINDERS_ENDPOINTS = REMINDERS_ENDPOINTS;
if (typeof module !== 'undefined' && module.exports) {
  Object.assign(exports, {
    reconcile: reconcile,
    validateRemindersBlob: validateRemindersBlob,
    validateRemindersRecord: validateRemindersRecord,
    readJournal: readJournal,
    isAddressee: isAddressee,
    MAX_JOURNAL: MAX_JOURNAL,
    MAX_REMINDERS_SIZE: MAX_REMINDERS_SIZE
  });
}
