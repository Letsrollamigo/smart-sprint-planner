/**
 * Smart Sprint Planner — Release Management backend (#48 R1.2 «сущность»).
 *
 * Per-feature backend-модуль (§11 «фича бэка = свой модуль»): держит backend-core.js от
 * роста + изолирует домен релизов. Require-ится в backend-project.js И backend-global.js;
 * свои endpoint-объекты ДОПИСЫВАЕТ в общий core.ENDPOINTS массив (оба handler-файла читают
 * именно его — иначе global-режим 404, gotcha #7). Экспорт через Object.assign(exports,…)
 * для unit-тестов (require('./backend-project.js') ре-экспортит).
 *
 * Стор — project-scoped `ssp_releases` = JSON `{ releases: [record…] }` (как ssp_history).
 * Одна запись — whitelist core.ALLOWED_RELEASES_KEYS (жёсткий: чужой ключ → reject всего
 * write, как validateSettings). Хранимый статус ∈ 5 (planned/prep/work/released/cancelled);
 * «Просрочен» — derived на фронте, НЕ хранится.
 *
 * R1.2 = каркас CRUD (GET список / POST список). R2.4 = authz релиз-ролей (D-C):
 * GET=viewer (+perms в ответе — фронт гейтит контролы тем же словом сервера);
 * POST: РМ (releaseManagerGroups; settings-менеджер ⊃ РМ, канон #22) — всё; РИ
 * (releaseEngineerGroups) — только движение статуса по цепочке (серверная валидация
 * диффа блоба, engineerDiffAllowed); остальные — 403. Аудит-поля updatedBy/At/
 * createdBy/At штампует СЕРВЕР (stampAudit) — клиенту не доверяем.
 *
 * ИНВАРИАНТЫ БЕЗОПАСНОСТИ — см. шапку backend-core.js: authzGuard первым; размер-чек до
 * setProp; reason-коды БЕЗ эха значений.
 */

var core = require('./backend-core.js');

/* Фиксированные таксономии (нейтрально, оба форка). */
var RELEASE_KIND   = ['release', 'hotfix'];
var RELEASE_SOURCE = ['internal', 'vendor'];
var RELEASE_STATUS = ['planned', 'prep', 'work', 'released', 'cancelled']; // хранимые (без derived overdue)

/* ssp_releases копит слепки закрытых релизов → к лимиту MAX_PROP_SIZE (500КБ). */
var MAX_RELEASES_SIZE = 400 * 1024;
var MAX_ISSUES_PER_RELEASE = 2000;
var MAX_RELEASES = 500;

/* R4 (US-R4-02) — авто-архив: активный блоб перерос ARCHIVE_TRIGGER → старейшие ЗАКРЫТЫЕ
   (терминальные) записи целиком переезжают в ssp_releases_archive, пока активный не
   уляжется в ARCHIVE_TARGET. Read-only история: архив отдаёт GET releases-archive,
   POST'а на архив нет. Первая реализация паттерна #53. */
var ARCHIVE_PROP = 'ssp_releases_archive';
var ARCHIVE_TRIGGER = 300 * 1024;
var ARCHIVE_TARGET  = 250 * 1024;

function isStr(v, max) { return v === undefined || v === null || (typeof v === 'string' && v.length <= (max || 200)); }

/* Валидация одной записи релиза: whitelist ключей + типы/энумы. Глубокая валидация
   snapshot/readiness — в R1.5/R3 (там появляется их потребитель); здесь — тип-контейнер. */
function validateReleaseRecord(rec) {
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return false;
  var keys = Object.keys(rec);
  for (var i = 0; i < keys.length; i++) {
    if (core.ALLOWED_RELEASES_KEYS.indexOf(keys[i]) < 0) return false;
  }
  if (typeof rec.id !== 'string' || !rec.id || rec.id.length > 64) return false; // id required
  if (!isStr(rec.name, 200)) return false;
  if (rec.kind   !== undefined && rec.kind   !== null && RELEASE_KIND.indexOf(rec.kind) < 0) return false;
  if (rec.source !== undefined && rec.source !== null && RELEASE_SOURCE.indexOf(rec.source) < 0) return false;
  if (rec.status !== undefined && rec.status !== null && RELEASE_STATUS.indexOf(rec.status) < 0) return false;
  // Даты — epoch-ms (number) или ISO-строка; freezeLocked — bool.
  if (rec.plannedDate !== undefined && rec.plannedDate !== null && typeof rec.plannedDate !== 'number' && typeof rec.plannedDate !== 'string') return false;
  if (rec.freezeDate  !== undefined && rec.freezeDate  !== null && typeof rec.freezeDate  !== 'number' && typeof rec.freezeDate  !== 'string') return false;
  if (rec.freezeLocked !== undefined && rec.freezeLocked !== null && typeof rec.freezeLocked !== 'boolean') return false;
  if (!isStr(rec.patchNote, 20000)) return false;
  if (!isStr(rec.notes, 20000)) return false;
  if (!isStr(rec.taskUrl, 2000)) return false; // #polish — ссылка на внешнюю задачу релиза (опц.); клик-санитайзинг http/https на фронте

  if (!isStr(rec.createdBy, 200) || !isStr(rec.updatedBy, 200) || !isStr(rec.pluginVersion, 40)) return false;
  if (rec.createdAt !== undefined && rec.createdAt !== null && typeof rec.createdAt !== 'number') return false;
  if (rec.updatedAt !== undefined && rec.updatedAt !== null && typeof rec.updatedAt !== 'number') return false;
  // roleReps — { manager?:str, engineer?:str }
  if (rec.roleReps !== undefined && rec.roleReps !== null) {
    if (typeof rec.roleReps !== 'object' || Array.isArray(rec.roleReps)) return false;
    var rk = Object.keys(rec.roleReps);
    for (var r = 0; r < rk.length; r++) {
      if (rk[r] !== 'manager' && rk[r] !== 'engineer') return false;
      if (!isStr(rec.roleReps[rk[r]], 128)) return false;
    }
  }
  // issues — массив issueId (string ≤64)
  if (rec.issues !== undefined && rec.issues !== null) {
    if (!Array.isArray(rec.issues) || rec.issues.length > MAX_ISSUES_PER_RELEASE) return false;
    for (var q = 0; q < rec.issues.length; q++) {
      if (typeof rec.issues[q] !== 'string' || rec.issues[q].length > 64) return false;
    }
  }
  // snapshot / readiness — контейнеры (глубокая схема позже); тип-объект.
  if (rec.snapshot !== undefined && rec.snapshot !== null && typeof rec.snapshot !== 'object') return false;
  if (rec.readiness !== undefined && rec.readiness !== null && typeof rec.readiness !== 'object') return false;
  return true;
}

/* Валидация блоба { releases: [record…] }: массив, лимит, уникальность id, каждая запись. */
function validateReleasesBlob(blob) {
  if (!blob || typeof blob !== 'object' || Array.isArray(blob)) return false;
  var list = blob.releases;
  if (list === undefined || list === null) return true; // пустой стор допустим
  if (!Array.isArray(list) || list.length > MAX_RELEASES) return false;
  var seen = {};
  for (var i = 0; i < list.length; i++) {
    if (!validateReleaseRecord(list[i])) return false;
    if (seen[list[i].id]) return false; // id уникален в проекте
    seen[list[i].id] = true;
  }
  return true;
}

function readReleases(ctx) {
  var raw = core.getProp(ctx, 'ssp_releases', null);
  var blob = core.parseJson(raw, null);
  return (blob && Array.isArray(blob.releases)) ? blob.releases : [];
}

function readArchive(ctx) {
  var blob = core.parseJson(core.getProp(ctx, ARCHIVE_PROP, null), null);
  return (blob && Array.isArray(blob.releases)) ? blob.releases : [];
}

/* Момент закрытия записи для сортировки «старейшие — первыми» (слепок → фолбэк updatedAt). */
function _closedAtOf(r) {
  if (r.snapshot && typeof r.snapshot.closedAt === 'number') return r.snapshot.closedAt;
  return typeof r.updatedAt === 'number' ? r.updatedAt : 0;
}

/* R4 (US-R4-02) — pure-разрез блоба на «активный + архив» (in-memory, БЕЗ записи пропов —
   порядок записи решает handler). Мутирует blob.releases (терминальные-старейшие вынимаются),
   возвращает { moved, archive }. Правила: ниже ARCHIVE_TRIGGER — no-op; кандидаты — только
   терминальные (released/cancelled), старейшие первыми; переносим, пока активный блоб не
   уляжется в ARCHIVE_TARGET; id уже в архиве (split-brain прошлой недописи) → из активного
   вынимается без дубля. Архив упёрся в свой лимит → перенос останавливается — активный POST
   может отклониться releases_too_large, но молчаливой потери данных нет. */
function splitForArchive(blob, archiveList) {
  var moved = 0;
  var archive = (archiveList || []).slice();
  if (JSON.stringify(blob).length <= ARCHIVE_TRIGGER) return { moved: 0, archive: archive };
  var inArch = {};
  for (var a = 0; a < archive.length; a++) inArch[archive[a].id] = true;
  var terminal = blob.releases.filter(function (r) { return r.status === 'released' || r.status === 'cancelled'; })
    .sort(function (x, y) { return _closedAtOf(x) - _closedAtOf(y); });
  for (var i = 0; i < terminal.length; i++) {
    if (JSON.stringify(blob).length <= ARCHIVE_TARGET) break;
    var rec = terminal[i];
    if (!inArch[rec.id]) {
      if (archive.length >= MAX_RELEASES) break;
      if (JSON.stringify({ releases: archive.concat([rec]) }).length > MAX_RELEASES_SIZE) break;
      archive.push(rec);
    }
    blob.releases = blob.releases.filter(function (r) { return r.id !== rec.id; });
    moved++;
  }
  return { moved: moved, archive: archive };
}

/* R2.4 — права релиз-ролей (US-R2-11/12, D-C). settings-менеджер ⊃ РМ (канон
   canManagePlanning #22). canAdvance ⊇ canManage — фронт гейтит контролы этим словом. */
function releasePerms(ctx) {
  var manage = core.isSettingsManager(ctx) || core.isReleaseManager(ctx);
  return { canManage: manage, canAdvance: manage || core.isReleaseEngineer(ctx) };
}

/* Ключи, где JSON-значения записей различаются (undefined-безопасно: у отсутствующего
   ключа stringify → undefined ≠ строка). */
function _diffKeys(a, b) {
  var seen = {}, out = [], k;
  for (k in a) if (Object.prototype.hasOwnProperty.call(a, k)) seen[k] = 1;
  for (k in b) if (Object.prototype.hasOwnProperty.call(b, k)) seen[k] = 1;
  for (k in seen) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out.push(k);
  return out;
}

var STATUS_CHAIN  = ['planned', 'prep', 'work', 'released'];               // рабочая цепочка (без cancelled)
var RE_PATCH_KEYS = { status: 1, snapshot: 1, updatedBy: 1, updatedAt: 1 }; // разрешённый дифф РИ

/* R2.4 — серверная валидация диффа для РИ (D-C): состав блоба неизменен (записи не
   добавляются/не удаляются), в записи меняются только status/snapshot (+аудит, который
   всё равно перештампует сервер), статус — ровно СЛЕДУЮЩИЙ по цепочке (отмена, откат,
   скачок, реанимация терминальной — нет), snapshot — только вместе с закрытием в
   released. null = разрешено, иначе reason-код (без эха значений). */
function engineerDiffAllowed(stored, next) {
  if (next.length !== stored.length) return 'record_count_change';
  var byId = {};
  for (var i = 0; i < stored.length; i++) byId[stored[i].id] = stored[i];
  for (var j = 0; j < next.length; j++) {
    var n = next[j], o = byId[n.id];
    if (!o) return 'record_added';
    var diff = _diffKeys(o, n);
    for (var d = 0; d < diff.length; d++) {
      if (!RE_PATCH_KEYS[diff[d]]) return 'field_change';
    }
    var statusChanged = diff.indexOf('status') >= 0;
    if (statusChanged) {
      var ci = STATUS_CHAIN.indexOf(o.status);
      if (ci < 0 || n.status !== STATUS_CHAIN[ci + 1]) return 'status_transition';
    }
    if (diff.indexOf('snapshot') >= 0 && !(statusChanged && n.status === 'released')) return 'snapshot_change';
  }
  return null;
}

/* R2.4 — серверный стамп аудит-полей: клиентским updatedBy/At/createdBy/At не доверяем.
   Новая запись — все четыре от сервера; изменённая (вне аудита) — updatedBy/At от
   сервера; неизменная — аудит из stored. Мутирует записи next in-place (после validate). */
function stampAudit(ctx, stored, next) {
  var me = (ctx.currentUser && (ctx.currentUser.login || ctx.currentUser.id)) || '';
  var now = Date.now();
  var byId = {};
  for (var i = 0; i < stored.length; i++) byId[stored[i].id] = stored[i];
  for (var j = 0; j < next.length; j++) {
    var n = next[j], o = byId[n.id];
    if (!o) { n.createdBy = me; n.createdAt = now; n.updatedBy = me; n.updatedAt = now; continue; }
    n.createdBy = o.createdBy; n.createdAt = o.createdAt;
    var changed = _diffKeys(o, n).some(function (k) { return k !== 'updatedBy' && k !== 'updatedAt'; });
    n.updatedBy = changed ? me : o.updatedBy;
    n.updatedAt = changed ? now : o.updatedAt;
  }
}

function handleGetReleases(ctx) {
  if (!core.authzGuard(ctx, 'viewer')) return;
  ctx.response.json({ success: true, releases: readReleases(ctx), perms: releasePerms(ctx), archivedCount: readArchive(ctx).length });
}

/* R4 (US-R4-02) — read-only архив истории (lazy-fetch фронта по раскрытию спойлера). */
function handleGetArchive(ctx) {
  if (!core.authzGuard(ctx, 'viewer')) return;
  ctx.response.json({ success: true, releases: readArchive(ctx) });
}

function handlePostReleases(ctx) {
  if (!core.authzGuard(ctx, 'viewer')) return; // аутентификация (инвариант: authzGuard первым)
  var perms = releasePerms(ctx);
  if (!perms.canAdvance) { core.forbidden(ctx, 'release_rights_required'); return; }
  /* v3.2.1 — core.getBody вместо raw json(): лимит 2МБ + sanitizeDeep + не-500 на не-JSON
     (единственный handler, ходивший мимо общего конверта). */
  var body = core.getBody(ctx);
  if (body.__rejected__) { core.badRequest(ctx, body.__reason__ || 'invalid_input'); return; }
  /* v3.2.1 — тело без ЯВНОГО releases-массива больше не коэрсится в []: один битый/
     оборванный POST стирал все релизы проекта с success:true. */
  if (!Array.isArray(body.releases)) { core.badRequest(ctx, 'invalid_releases_structure'); return; }
  var blob = { releases: body.releases };
  if (!validateReleasesBlob(blob)) { core.badRequest(ctx, 'invalid_releases_structure'); return; }
  var stored = readReleases(ctx);
  if (!perms.canManage) {
    var deny = engineerDiffAllowed(stored, blob.releases);
    if (deny) { core.forbidden(ctx, 'release_engineer_scope_' + deny); return; }
  }
  stampAudit(ctx, stored, blob.releases);
  /* R4 — авто-архив ДО размер-чека (in-memory): активный блоб худеет на старейшие закрытые.
     Запись архив-пропа — только после прохождения чека (иначе split-brain: записи в архиве
     при неизменённом активном; повторный POST лечится дедупом splitForArchive). */
  var split = splitForArchive(blob, readArchive(ctx));
  var serialized = JSON.stringify(blob);
  if (serialized.length > MAX_RELEASES_SIZE) { core.badRequest(ctx, 'releases_too_large'); return; }
  if (split.moved > 0) core.setProp(ctx, ARCHIVE_PROP, JSON.stringify({ releases: split.archive }));
  core.setProp(ctx, 'ssp_releases', serialized);
  ctx.response.json({ success: true, releases: blob.releases, archived: split.moved });
}

var RELEASE_ENDPOINTS = [
  { scope: 'project', method: 'GET',  path: 'releases', handle: handleGetReleases },
  { scope: 'project', method: 'POST', path: 'releases', handle: handlePostReleases },
  { scope: 'project', method: 'GET',  path: 'releases-archive', handle: handleGetArchive } // R4 (US-R4-02)
];

/* Самрегистрация в ОБЩИЙ core.ENDPOINTS (оба handler-файла читают его — gotcha #7).
   Идемпотентно: guard на core-объекте защищает от двойного push в shared-контексте. */
if (core && core.ENDPOINTS && !core.__releaseEndpointsRegistered) {
  for (var ei = 0; ei < RELEASE_ENDPOINTS.length; ei++) core.ENDPOINTS.push(RELEASE_ENDPOINTS[ei]);
  core.__releaseEndpointsRegistered = true;
}

/* Runtime + test-only exports. */
exports.RELEASE_ENDPOINTS = RELEASE_ENDPOINTS;
if (typeof module !== 'undefined' && module.exports) {
  Object.assign(exports, {
    RELEASE_KIND: RELEASE_KIND,
    RELEASE_SOURCE: RELEASE_SOURCE,
    RELEASE_STATUS: RELEASE_STATUS,
    validateReleaseRecord: validateReleaseRecord,
    validateReleasesBlob: validateReleasesBlob,
    readReleases: readReleases,
    handleGetReleases: handleGetReleases,
    handlePostReleases: handlePostReleases,
    releasePerms: releasePerms,               // R2.4
    engineerDiffAllowed: engineerDiffAllowed, // R2.4
    stampAudit: stampAudit,                   // R2.4
    readArchive: readArchive,                 // R4
    splitForArchive: splitForArchive,         // R4
    handleGetArchive: handleGetArchive,       // R4
  });
}
