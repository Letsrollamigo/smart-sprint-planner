/**
 * Smart Sprint Planner — ОБЩЕЕ ЯДРО (shared core, #25 Ф1)
 *
 * Не handler-файл: НЕ экспортирует exports.httpHandler (V1a). Все «чистые» символы +
 * тела endpoint-логики в массиве ENDPOINTS, параметризованные ctx. backend-project.js
 * и backend-global.js делают require('./backend-core.js'); один источник правил.
 *
 * v5.0.0 — Security & UX rollup
 *
 * ИНВАРИАНТЫ БЕЗОПАСНОСТИ (нарушать запрещено без ревью ИБ):
 *  1. Каждый endpoint ОБЯЗАН вызывать authzGuard(ctx, role) до любой логики.
 *  2. Каждый POST-endpoint ОБЯЗАН проходить через sanitizeDeep + filterKeys + validate*().
 *  3. settingsManagerGroup читается ТОЛЬКО из ctx.settings (app-settings).
 *     Никогда — из тела запроса, никогда — из ssp_settings.
 *  4. Клиент НИКОГДА не передаёт свои группы/роли — их сервер берёт из ctx.currentUser.groups.
 *  5. Deny-by-default: если settingsManagerGroup не задана — все мутирующие endpoint'ы 403.
 *  6. Ошибки 4xx — короткий reason без эха содержимого; детали — только в server log при enableDebugLog.
 *  7. Storage хранит латинские enum-коды (PLANNING/CONFIRMED/INC_PLANNED/...). Локализация — только на отображении.
 *
 * Endpoints (матрица доступа — см. SECURITY.md):
 *   GET  project-fields          — viewer
 *   GET  sprint-data             — viewer
 *   POST sprint-data             — editor (sprint/roleItems/items) | settingsManager (settings) | validator (?action=validate)
 *   GET  history                 — viewer
 *   POST history                 — validator
 *   GET  check-settings-manager  — viewer
 *   GET  check-editor            — viewer
 *   GET  check-validator         — viewer
 *   GET  field-values            — viewer
 *   GET  get-user-field-values   — viewer
 *   POST update-issue-field      — editor
 */


// ─── Константы ────────────────────────────────────────────────────────────────

var MAX_PROP_SIZE    = 500 * 1024;       // 500 КБ — максимальный размер одного extensionProperty
var MAX_HISTORY_SIZE = MAX_PROP_SIZE * 2; // 1 МБ — история может быть крупнее
var MAX_REQUEST_BODY = 2 * 1024 * 1024;  // 2 МБ — общий лимит на сырое тело запроса

// ─── Утилиты ──────────────────────────────────────────────────────────────────

/**
 * Условный server-side лог для диагностики.
 * Активен только при enableDebugLog=true (app-settings).
 * Никогда не логирует значения user input — только короткие маркеры/коды.
 */
function dlog(ctx, msg) {
  try {
    if (ctx && ctx.settings && ctx.settings.enableDebugLog) {
      var s = String(msg || '').substring(0, 1000);
      console.log('[smart-sprint-planner] ' + s);
    }
  } catch (e) { /* never throw from logger */ }
}

function getProp(ctx, key, defaultVal) {
  try {
    var val = ctx.project.extensionProperties[key];
    return val !== undefined && val !== null ? val : (defaultVal !== undefined ? defaultVal : null);
  } catch (e) {
    return defaultVal !== undefined ? defaultVal : null;
  }
}

function setProp(ctx, key, value) {
  ctx.project.extensionProperties[key] = value;
}

/* R6 — optimistic lock слотов history/releases/absences (обобщение #56-4, стабильность §3
   P1 #11/#13/#14): rev — ОТДЕЛЬНЫЙ extProp-счётчик (данные/схему блобов не трогаем).
   Контракт как у sprint-data: клиент шлёт baseRev (rev, который он загружал GET'ом);
   расхождение → 409 rev_conflict + echo текущего rev; без baseRev (legacy) — прежнее
   поведение last-write-wins; rev инкрементится на КАЖДОЙ записи слота. */
function slotRev(ctx, prop) {
  var v = parseInt(getProp(ctx, prop), 10);
  return (isFinite(v) && v >= 0) ? v : 0;
}
function bumpSlotRev(ctx, prop) {
  var nv = slotRev(ctx, prop) + 1;
  setProp(ctx, prop, String(nv));
  return nv;
}
function revConflict(ctx, baseRev, cur) {
  if (baseRev === undefined || baseRev === null || baseRev === cur) return false;
  ctx.response.status = 409;
  ctx.response.json({ success: false, error: 'rev_conflict', rev: cur });
  return true;
}

function parseJson(str, fallback) {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch (e) { return fallback; }
}

/**
 * Рекурсивная защита от Prototype Pollution.
 * Обходит объект/массив на любой глубине и отклоняет опасные ключи.
 * Возвращает null если обнаружен потенциально опасный ключ.
 */
function sanitizeDeep(value, depth) {
  if (depth === undefined) depth = 0;
  if (depth > 10) return null; // защита от бесконечной рекурсии
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;

  var DANGEROUS = ['__proto__', 'constructor', 'prototype'];

  if (Array.isArray(value)) {
    var arr = [];
    for (var i = 0; i < value.length; i++) {
      var item = sanitizeDeep(value[i], depth + 1);
      if (item === null && value[i] !== null && typeof value[i] === 'object') return null;
      arr.push(item);
    }
    return arr;
  }

  var result = {};
  var keys = Object.keys(value);
  for (var k = 0; k < keys.length; k++) {
    var key = keys[k];
    if (DANGEROUS.indexOf(key) >= 0) return null; // обнаружен опасный ключ
    var cleaned = sanitizeDeep(value[key], depth + 1);
    if (cleaned === null && value[key] !== null && typeof value[key] === 'object') return null;
    result[key] = cleaned;
  }
  return result;
}

/* #67 H11 — опциональный maxLen: отдельный (меньший) cap для endpoint'ов с гейтом
   «только аутентификация» (filter-planner-projects). Проверка живёт ЗДЕСЬ, а не
   pre-read'ом у вызывателя: ctx.request.body в YT-рантайме читается ОДИН раз —
   внешний просмотр тела опустошал его для последующего getBody (стендовая эмпирика
   2026-08-20, YT 2025.3 и 2026.1). */
function getBody(ctx, maxLen) {
  try {
    var raw = ctx.request.body;
    if (!raw) return {};
    // Лимит размера сырого тела — защита от DoS на парсинг
    if (typeof raw === 'string' && raw.length > (maxLen || MAX_REQUEST_BODY)) {
      dlog(ctx, 'getBody: rejected, raw size=' + raw.length);
      return { __rejected__: true, __reason__: 'too_large' };
    }
    var parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    var cleaned = sanitizeDeep(parsed, 0);
    if (cleaned === null) {
      dlog(ctx, 'getBody: rejected, prototype_pollution_detected');
      return { __rejected__: true, __reason__: 'prototype_pollution_detected' };
    }
    return cleaned;
  } catch (e) {
    /* Битый JSON — reject, НЕ {}: молчаливый {} делал parse-fail неотличимым от
       пустого тела и рождал класс anti-wipe багов (см. фиксы v3.2.1 в capacity/absences). */
    dlog(ctx, 'getBody: parse error');
    return { __rejected__: true, __reason__: 'invalid_json' };
  }
  return {};
}

/* Единый конверт POST-тела: getBody → reject-гейт → whitelist-фильтр.
   Возвращает body либо null (400 уже отправлен). whitelist === null — без фильтра
   (динамические ключи верхнего уровня, напр. карта login→absences). */
function parseBodyOrReject(ctx, whitelist) {
  var body = getBody(ctx);
  if (body.__rejected__) {
    badRequest(ctx, body.__reason__ || 'invalid_input');
    return null;
  }
  return whitelist ? filterKeys(body, whitelist) : body;
}

// Белые списки ключей верхнего уровня
var ALLOWED_SPRINT_DATA_KEYS = ['sprint', 'roleItems', 'settings', 'baseRev']; /* #56-4 — optimistic lock; `items` снят в v3.23.0 (#69 строка 27 шаг 2) */
var ALLOWED_HISTORY_KEYS     = ['history', 'baseRev']; /* R6 — optimistic lock */
// v5.0.3 — серверный draft (черновик в backend, поскольку YouTrack iframe
// sandboxed без allow-same-origin, localStorage недоступен).
var ALLOWED_DRAFT_KEYS       = ['data'];
var MAX_DRAFT_PER_USER       = 256 * 1024; // 256 КБ на одного пользователя
var MAX_DRAFTS_TOTAL         = 1024 * 1024; // 1 МБ суммарно по проекту

// v5.3.0 — working copies (immutable snapshots model, D3/b).
// Хранятся в ssp_workdrafts как dict { '<sprintId>_<roleKey>': workingDraft }.
// Multi-user видимость (виден всем валидаторам) — для cross-user lock и pill «Уже редактирует {who}».
var ALLOWED_WORKING_DRAFTS_KEYS = ['data'];
// AUTOGEN:WHITELISTS BEGIN — generated from schema/whitelists.json by scripts/sync-backend-whitelists.js. Do NOT edit by hand.
var ALLOWED_SPRINT_KEYS = [
  'sprintId',
  'name',
  'status',
  'dateStart',
  'dateEnd',
  'updatedBy',
  'updatedAt',
  'sprintFieldVal',
  'versionFieldVal',
  'personalPlanning',
  'migrationLog',
  'pluginVersion',
  'sprintGoal',
  'roles',
  '_rev'
];
var ALLOWED_HISTORY_SNAP_KEYS = [
  'sprintId',
  'name',
  'status',
  'roleKey',
  'roleLabel',
  'confirmedBy',
  'confirmedAt',
  'dateStart',
  'dateEnd',
  'finishedBy',
  'finishedAt',
  'isOverLimit',
  'sprintFieldVal',
  'versionFieldVal',
  'settings',
  'items',
  'personalPlanning',
  'hasWorkingCopy',
  'revisions',
  'migrationLog',
  'pluginVersion',
  'sprintGoal',
  'goalOutcome',
  'goalRetroNote',
  'roles'
];
var ALLOWED_WORKING_DRAFT_KEYS = [
  'schemaVersion',
  'key',
  'baseSnapshotHash',
  'baseStatusAtOpen',
  'createdAt',
  'updatedAt',
  'editorLogin',
  'editorTabToken',
  'sprint',
  'items',
  'personalPlanning',
  'revisions',
  'gantt',
  'pluginVersion'
];
var ALLOWED_CALENDAR_KEYS = [
  'years',
  'uploadedBy',
  'uploadedAt',
  'pluginVersion'
];
var ALLOWED_ABSENCE_ENTRY_KEYS = [
  'from',
  'to',
  'type',
  'hoursDelta'
];
var ALLOWED_CAPACITY_RECORD_KEYS = [
  'mode',
  'status',
  'dirty',
  'constants',
  'calendarRef',
  'persons',
  'approvedBy',
  'approvedAt',
  'reapprovals',
  'dateEnd',
  'pluginVersion'
];
var ALLOWED_CAPACITY_PERSON_KEYS = [
  'grade',
  'rate',
  'participation',
  'alloc',
  'base',
  'absencesApplied'
];
var ALLOWED_RELEASES_KEYS = [
  'id',
  'name',
  'kind',
  'source',
  'status',
  'plannedDate',
  'freezeDate',
  'freezeLocked',
  'patchNote',
  'notes',
  'taskUrl',
  'roleReps',
  'issues',
  'snapshot',
  'readiness',
  'createdBy',
  'createdAt',
  'updatedBy',
  'updatedAt',
  'pluginVersion'
];
// AUTOGEN:WHITELISTS END
/* v1.8.1 — 'NONE' добавлен для backward-compat. Pre-v1.8.1 frontend записывал level='NONE'
   в revision при commit working copy без реальных изменений (см. computeRequiredRevalidationLevel
   ветка `return 'NONE'`). Эти записи накопились в _history у пилотов и блокировали любой
   следующий POST history через invalid_history_structure: revisions[i].level_invalid:NONE.
   В v1.8.1 frontend уже не пишет 'NONE' (skip revision при level==='NONE'), но старые записи
   должны читаться и переписываться без ошибок. */
var ALLOWED_REVISION_LEVELS     = ['META_ONLY','ALLOCATED_REVAL','CONFIRMED_REVAL','NONE'];
// v1.6.0 D125 — глобальная версия плагина для отслеживания совместимости snapshot'ов.
// Должна совпадать с manifest.json:version и frontend APP_VERSION.
// См. внутренние правила проекта → Версионирование (6 точек bump).
// TODO(post-v1.6.0): автоподтягивание CURRENT_PLUGIN_VERSION из manifest.json
//                    через build-step (esbuild --define или pre-build node-скрипт).
var CURRENT_PLUGIN_VERSION = '3.32.0';
/* Presentation-версия (единый источник для GET /app-version обоих handler-файлов).
   Бампить синхронно с manifest.json/version + frontend APP_VERSION.
   ⚠️ require('./manifest.json') в песочнице YT НЕ работает (проверено пробой 2026-07-11,
   YT 2026.1) — руками литерал; temp-деплой стенда патчит его scripts/stand-deploy.sh. */
var APP_VERSION = '3.34.2';
var MAX_WORKDRAFT_PER_KEY       = 256 * 1024; // 256 КБ на одну рабочую копию
var MAX_WORKDRAFTS_TOTAL        = 480 * 1024; // 480 КБ суммарно (буфер до MAX_PROP_SIZE = 500 КБ)

// Латинские enum-коды (storage). v5.2.0 — PLANNED удалён, мигрируется на PLANNING на чтении.
var STATUS_CODES = ['PLANNING', 'CONFIRMED', 'ALLOCATED', 'FINISHED'];
var INC_CODES    = ['INC_PENDING', 'INC_PLANNED', 'INC_UNPLANNED', 'INC_EXCLUDED'];
var ROLE_KEYS    = ['analysis','testing','devPlatform','devBack','devFront','devIos','devAndroid','devFs','devDb'];

// Миграция legacy русских строк → латинские коды (применяется на READ).
// На WRITE валидатор требует ТОЛЬКО латинские коды.
// Совместимость со старым клиентом обеспечивается тем, что и старый, и новый
// клиент сначала получают данные через GET (миграция применена) — на отображение
// и на подготовку следующего POST идут уже латинские коды.
var STATUS_MIGRATION = {
  'Планируется':                 'PLANNING',
  'Запланирован':                'PLANNING',
  'Запланирован и подтвержден':  'CONFIRMED',
  'Запланирован и подтверждён':  'CONFIRMED',
  'Аллоцирован':                 'ALLOCATED',
  'Запланирован, подтверждён, аллоцирован': 'ALLOCATED',
  'Завершён':                    'FINISHED',
  'Завершен':                    'FINISHED'
};
var INC_MIGRATION = {
  'Ожидает распределения': 'INC_PENDING',
  'Включена планово':      'INC_PLANNED',
  'Включена внепланово':   'INC_UNPLANNED',
  'Исключена из спринта':  'INC_EXCLUDED'
};

function migrateStatus(v) {
  if (!v) return v;
  if (STATUS_CODES.indexOf(v) >= 0) return v;
  // v5.2.0 — PLANNED удалён из STATUS_CODES, мигрируем на PLANNING (display: «Черновик»).
  // Идемпотентно: на следующих чтениях v уже будет 'PLANNING' и попадёт в первую ветку.
  if (v === 'PLANNED') return 'PLANNING';
  return STATUS_MIGRATION[v] || v;
}

function migrateInc(v) {
  if (!v) return v;
  if (INC_CODES.indexOf(v) >= 0) return v;
  return INC_MIGRATION[v] || v;
}

function migrateSprintObj(s) {
  if (!s || typeof s !== 'object') return s;
  if (s.status) s.status = migrateStatus(s.status);
  // v1.6.0 D125 — BASELINE_ASSUMED: pre-v1.6.0 snapshots без pluginVersion.
  if (!s.pluginVersion) {
    _appendMigrationLog(s, { at: Date.now(), level: 'BASELINE_ASSUMED', fromVersion: 'unset', toVersion: '1.4.2' });
    s.pluginVersion = '1.4.2';
  }
  migrateSnap(s, CURRENT_PLUGIN_VERSION);
  return s;
}

function migrateRoleItemsObj(ri) {
  if (!ri || typeof ri !== 'object') return ri;
  Object.keys(ri).forEach(function (rk) {
    var arr = ri[rk];
    if (!Array.isArray(arr)) return;
    arr.forEach(function (it) {
      if (it && it.inclusionStatus) it.inclusionStatus = migrateInc(it.inclusionStatus);
    });
  });
  return ri;
}

/* v2.15.2 — read-time нормализатор settings: ремап legacy-orphan ключей роли
   dev1c→devPlatform (внутренняя линия v7.x «Разработка 1С»). Full-rebuild (v2.1.x) мигрировал
   sprint/roleItems/history, но field-ключи НАСТРОЕК — нет → сироты бессрочно
   бриковали любой save (invalid_settings_structure): форма collect() делает
   Object.assign({}, initial) и passthrough'ит весь сохранённый блоб, включая
   незамапленные ключи, которые строгий validateSettings отклоняет. Чистим блоб
   ПЕРЕД отдачей клиенту (и опционально на write — см. POST /sprint-data).
   Параллель migrateSprintObj/migrateRoleItemsObj. namespace-agnostic (работает с
   распарсенным объектом, не с префиксованными storage-ключами). */
var SETTINGS_FIELD_KEY_REMAP = [
  ['fieldDev',       'fieldDevPlatform'],
  ['fieldFactDev',   'fieldFactDevPlatform'],
  ['userFieldDev1c', 'userFieldDevPlatform']
];
var SETTINGS_ROLE_KEY_REMAP = { dev1c: 'devPlatform' };

function migrateSettingsObj(settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return settings;
  var i;
  // (1) legacy field-orphans → canonical, БЕЗ перезатирания непустого canonical.
  //     orphan удаляем всегда (иначе whitelist всё равно отклонит блоб).
  for (i = 0; i < SETTINGS_FIELD_KEY_REMAP.length; i++) {
    var legacy = SETTINGS_FIELD_KEY_REMAP[i][0];
    var canon  = SETTINGS_FIELD_KEY_REMAP[i][1];
    if (Object.prototype.hasOwnProperty.call(settings, legacy)) {
      var canonEmpty = !Object.prototype.hasOwnProperty.call(settings, canon) ||
                       settings[canon] === null || settings[canon] === undefined;
      if (canonEmpty) settings[canon] = settings[legacy];
      delete settings[legacy];
    }
  }
  // (2) activeRoles: ремап legacy → canonical, фильтр по ROLE_KEYS, dedup (first-seen).
  if (Array.isArray(settings.activeRoles)) {
    var src = settings.activeRoles, out = [], seen = {};
    for (i = 0; i < src.length; i++) {
      var r = src[i];
      if (Object.prototype.hasOwnProperty.call(SETTINGS_ROLE_KEY_REMAP, r)) r = SETTINGS_ROLE_KEY_REMAP[r];
      if (ROLE_KEYS.indexOf(r) < 0) continue;
      if (Object.prototype.hasOwnProperty.call(seen, r)) continue;
      seen[r] = true;
      out.push(r);
    }
    settings.activeRoles = out;
  }
  // (3) defensive: снести любой ключ вне whitelist (будущие неизвестные сироты не
  //     должны бриковать save). ПОСЛЕ (1), чтобы значения уже спаслись в canonical.
  //     v3.23.0 (#69 строка 27 шаг 2): так же уходит `migratedTo` (снят с whitelist) —
  //     и из основного блоба, и из history[].settings (migrateHistoryArr зовёт сюда).
  var allKeys = Object.keys(settings);
  for (i = 0; i < allKeys.length; i++) {
    if (ALLOWED_SETTINGS_KEYS.indexOf(allKeys[i]) < 0) delete settings[allKeys[i]];
  }
  return settings;
}

function migrateHistoryArr(h) {
  if (!Array.isArray(h)) return h;
  h.forEach(function (rec) {
    if (!rec || typeof rec !== 'object') return;
    if (rec.status) rec.status = migrateStatus(rec.status);
    /* v3.6.0 — history-запись может встраивать settings-блоб (заморозка при
       confirm). Ему нужна та же read-time чистка, что и основному блобу
       (v2.15.2 ремап + defensive strip): после hard-removal hideDiagLogUi
       строгий validateSettings внутри history-валидатора иначе бракует
       легаси-запись целиком (найдено на прод-фикстуре v7.5.0). */
    if (rec.settings && typeof rec.settings === 'object' && !Array.isArray(rec.settings)) {
      migrateSettingsObj(rec.settings);
    }
    if (Array.isArray(rec.items)) {
      rec.items.forEach(function (it) {
        if (it && it.inclusionStatus) it.inclusionStatus = migrateInc(it.inclusionStatus);
      });
    }
    // v1.6.0 D125 — BASELINE_ASSUMED per record.
    if (!rec.pluginVersion) {
      _appendMigrationLog(rec, { at: Date.now(), level: 'BASELINE_ASSUMED', fromVersion: 'unset', toVersion: '1.4.2' });
      rec.pluginVersion = '1.4.2';
    }
    migrateSnap(rec, CURRENT_PLUGIN_VERSION);
  });
  return h;
}

/* v6.1.0 D69 — silent strip deprecated keys перед WRITE.
   Поле `gantt` удалено из whitelist'ов в v5.9.0 (D60). Существующие storage records
   и in-memory state'ы могут его содержать; pipeline READ → modify → WRITE приводит к
   invalid_history_structure / invalid_sprint_structure (баг #4 v6.0.0 testbench).
   Стрипаем silent на WRITE для обратной совместимости. */
/* v3.2.1 — '_orphanGanttIssues': транзиентный ключ фронта (D59 orphan-детект вешает его
   на _sprint/_history[i] при чтении), НИКОГДА не легитимен в сторадже. Без стрипа
   legacy-проект с orphan-gantt данными брикал ВСЕ сейвы: strict-whitelist отвергал
   ключ → запись не проходила → gantt не вычищался → детект срабатывал вечно. */
/* v3.23.0 (#69 строка 27, шаг 2 — hard-removal): editingFromHistory/historyIdx (спринт) и
   migratedTo (settings, в т.ч. встроенные в history-запись) сняты с whitelist'ов. Миграция
   чистит их на READ, но хранимые блобы переписываются только при следующем сейве клиента,
   а assignerSync / bulk-POST working-drafts / confirm со stale-вкладки несут их на WRITE
   мимо миграции — silent strip здесь (тот же класс, что gantt v6.1.0). */
var DEPRECATED_HISTORY_SNAP_KEYS = ['gantt', '_orphanGanttIssues'];
var DEPRECATED_SETTINGS_KEYS     = ['migratedTo'];
function stripDeprecatedSettingsKeys(s) {
  if (!s || typeof s !== 'object') return s;
  for (var j = 0; j < DEPRECATED_SETTINGS_KEYS.length; j++) {
    if (Object.prototype.hasOwnProperty.call(s, DEPRECATED_SETTINGS_KEYS[j])) delete s[DEPRECATED_SETTINGS_KEYS[j]];
  }
  return s;
}
function stripDeprecatedHistoryKeys(h) {
  if (!Array.isArray(h)) return h;
  for (var i = 0; i < h.length; i++) {
    var rec = h[i];
    if (!rec || typeof rec !== 'object') continue;
    for (var j = 0; j < DEPRECATED_HISTORY_SNAP_KEYS.length; j++) {
      var dk = DEPRECATED_HISTORY_SNAP_KEYS[j];
      if (Object.prototype.hasOwnProperty.call(rec, dk)) delete rec[dk];
    }
    stripDeprecatedSettingsKeys(rec.settings);
  }
  return h;
}
var DEPRECATED_SPRINT_KEYS = DEPRECATED_HISTORY_SNAP_KEYS.concat(['editingFromHistory', 'historyIdx']);   /* v3.2.1 gantt-набор + v3.23.0 legacy v5.2 */
/* #74 шаг 1 — легаси-фразы иерархии, вытесняемые таблицей linkTypeRoles. */
var DEPRECATED_LINK_PHRASE_KEYS = ['cascadeParentLinkInward', 'cascadeParentLinkOutward'];
function stripDeprecatedSprintKeys(s) {
  if (!s || typeof s !== 'object') return s;
  for (var j = 0; j < DEPRECATED_SPRINT_KEYS.length; j++) {
    var dk = DEPRECATED_SPRINT_KEYS[j];
    if (Object.prototype.hasOwnProperty.call(s, dk)) delete s[dk];
  }
  return s;
}

/* ═══════════════════════════════════════════════════════════════════════════
   v1.6.0 D125 — Schema migration registry.
   Каждый элемент — миграция с версии `from` на версию `to`. Применяется
   на READ к каждому snapshot'у (sprint, history record, working draft).
   Registry пуст в v1.6.0 — первая запись появится при первом breaking change.
   Формат записи: { from: 'X.Y.Z', to: 'X.Y.Z', migrate: function(snap){}, note: '' }
   Правило для PR: любое изменение whitelist'ов или shape snapshot'а ОБЯЗАНО
   добавить запись сюда + fixture в tests/fixtures/snapshots/<new-version>/. */
var SCHEMA_MIGRATIONS = [
  /* v3.6.0 — свёртка исторической цепочки 1.6.0 → … → 2.14.0 (14 записей).
     Все 14 шагов были no-op (арх-аудит 2026-07-12, V13: additive settings-ключи
     и frontend-only фичи; migrateSnap результат migrate() не использует —
     мутация-only). Полные note'ы шагов — git history до v3.5.0 +
     Documentation/CHANGELOG.md. Схемный сдвиг v3.6.0: hideDiagLogUi снят с
     settings-whitelist (hard-removal по лестнице #56-5); ключ живёт в
     settings-блобе, НЕ в снапшотах → shape снимков не меняется, migrate no-op
     (чистку блоба делает migrateSettingsObj шаг 3 на READ). */
  { from: '1.4.2', to: '3.6.0',
    migrate: function (snap) { /* no-op: свёрнутая no-op-цепочка; снапшоты shape не меняли */ },
    note: 'v3.6.0: collapsed no-op chain 1.6.0→2.14.0 (14 steps) + settings hideDiagLogUi hard-removal; snapshot shape unchanged'
  },
  /* v3.23.0 — #69 строка 27, шаг 2 (hard-removal по лестнице после soft-deprecation v3.22.0):
     editingFromHistory/historyIdx (legacy v5.2 «правка из истории», заменены working copy
     v5.3) удаляются из снимков спринта; migratedTo уходит с settings-whitelist'а (чистит
     migrateSettingsObj шаг 3 — и в history[].settings через migrateHistoryArr). */
  { from: '3.6.0', to: '3.23.0',
    migrate: function (snap) { delete snap.editingFromHistory; delete snap.historyIdx; },
    note: 'v3.23.0: hard-removal editingFromHistory/historyIdx (sprint) + settings migratedTo'
  },
  /* v3.27.0 — #73: аддитивный ключ roles (роли-участницы спринта) в sprint/history-снапах.
     Ключ optional: отсутствие = слоёный фолбэк резолвера на фронте (снапы истории →
     settings эпохи → текущие настройки), поэтому миграция no-op. */
  { from: '3.23.0', to: '3.27.0',
    migrate: function (snap) { /* no-op: additive optional key roles */ },
    note: 'v3.27.0: #73 additive sprint/history key roles (per-sprint participating roles)'
  },
  /* v3.28.0 — #74 фаза 1: аддитивный settings-ключ linkTypeRoles + лестница шаг 1 для
     легаси-пары cascadeParentLink*. Настройка project-level, в снимках её нет → shape
     снимков не меняется, миграция no-op; запись фиксирует переход схемы настроек
     (регресс лестницы — на уровне settings, tests/unit/settings-validation.test.js). */
  { from: '3.27.0', to: '3.28.0',
    migrate: function (snap) { /* no-op: настройка project-level, snapshot shape unchanged */ },
    note: 'v3.28.0: #74 additive settings key linkTypeRoles + soft-deprecation of cascadeParentLink* phrases'
  },
  /* v3.29.0 — 68-8: аддитивный settings-ключ displayFields (отображаемые поля таблиц
     задач). Значения самих полей НЕ хранятся — читаются на лету, поэтому shape снимков
     не меняется и миграция no-op; запись фиксирует переход схемы настроек. */
  { from: '3.28.0', to: '3.29.0',
    migrate: function (snap) { /* no-op: настройка project-level, snapshot shape unchanged */ },
    note: 'v3.29.0: 68-8 additive settings key displayFields (issue-table display columns)'
  },
  /* v3.32.0 — #80: аддитивный settings-ключ plannerDisabled («Отключить планер в этом
     проекте»). Настройка project-level, в снимках её нет → shape снимков не меняется,
     миграция no-op; запись фиксирует переход схемы настроек. */
  { from: '3.29.0', to: '3.32.0',
    migrate: function (snap) { /* no-op: настройка project-level, snapshot shape unchanged */ },
    note: 'v3.32.0: #80 additive settings key plannerDisabled (planner switched off per project)'
  }
];

function versionLt(a, b) {
  if (a === b) return false;
  if (a === 'unset' || !a) return true;
  if (b === 'unset') return false;
  var pa = String(a).split('.').map(function (n) { return parseInt(n, 10) || 0; });
  var pb = String(b).split('.').map(function (n) { return parseInt(n, 10) || 0; });
  for (var i = 0; i < 3; i++) {
    if ((pa[i] || 0) < (pb[i] || 0)) return true;
    if ((pa[i] || 0) > (pb[i] || 0)) return false;
  }
  return false;
}

function _appendMigrationLog(snap, entry) {
  if (!Array.isArray(snap.migrationLog)) snap.migrationLog = [];
  snap.migrationLog.push(entry);
  if (snap.migrationLog.length > 50) snap.migrationLog = snap.migrationLog.slice(-50);
}

function migrateSnap(snap, target) {
  if (!snap || typeof snap !== 'object') return snap;
  target = target || CURRENT_PLUGIN_VERSION;
  var from = snap.pluginVersion || 'unset';
  for (var i = 0; i < SCHEMA_MIGRATIONS.length; i++) {
    var step = SCHEMA_MIGRATIONS[i];
    if (versionLt(from, step.to)) {
      try {
        step.migrate(snap);
      } catch (e) {
        _appendMigrationLog(snap, {
          at: Date.now(), level: 'MIGRATION_ERROR',
          fromVersion: step.from, toVersion: step.to,
          error: String(e && e.message || e)
        });
        console.error('[migrateSnap] step ' + step.from + ' → ' + step.to + ' threw: ' + e);
      }
      from = step.to;
      _appendMigrationLog(snap, {
        at: Date.now(), level: 'SCHEMA_BUMP',
        fromVersion: step.from, toVersion: step.to,
        note: step.note || ''
      });
    }
  }
  snap.pluginVersion = target;
  return snap;
}

/**
 * v5.9.0 — D59: централизованная per-snapshot orphan-detection для legacy gantt.tasks[].color
 * (deprecated в v5.7.0 после унификации модели на personalPlanning[*].taskAssignments).
 * Перенесено из frontend (widgets/main/main.js — migrateOnRead). Возвращает массив issueId,
 * у которых есть `gantt.tasks[id].color`, но нет `personalPlanning[*].taskAssignments[id].assignee`.
 * Реверс-маппинг цвет→ассайни не делается — legacy цвет boolean (blue/red), не login.
 *
 * Вызывается на READ из GET /sprint-data и GET /history. Frontend получает результат через
 * отдельные поля response.orphanGanttIssues (массив, для активного спринта) и
 * response.orphanGanttBySprintId (map, для history).
 *
 * После v5.9.0 поле `gantt` запрещено в whitelist'ах (write-time), но existing storage records
 * могут его содержать — whitelist валидируется только при WRITE, READ пропускает.
 */
function detectOrphanGanttIssues(snap) {
  if (!snap || !snap.gantt || !snap.gantt.tasks || !snap.personalPlanning) return [];
  var orphans = [];
  var taskIds = Object.keys(snap.gantt.tasks);
  var ppKeys = Object.keys(snap.personalPlanning);
  for (var i = 0; i < taskIds.length; i++) {
    var issueId = taskIds[i];
    var hasAssignment = false;
    for (var j = 0; j < ppKeys.length; j++) {
      var ta = snap.personalPlanning[ppKeys[j]] && snap.personalPlanning[ppKeys[j]].taskAssignments;
      if (ta && ta[issueId] && ta[issueId].assignee) { hasAssignment = true; break; }
    }
    if (!hasAssignment) orphans.push(issueId);
  }
  /* v5.12.0 — B (D65): audit-trail запись только при issues > 0. */
  if (orphans.length > 0) {
    if (!Array.isArray(snap.migrationLog)) snap.migrationLog = [];
    snap.migrationLog.push({
      at: Date.now(),
      level: 'ORPHAN_GANTT',
      fromVersion: '<5.7',
      toVersion: '>=5.7',
      issues: orphans.length
    });
    if (snap.migrationLog.length > 50) snap.migrationLog = snap.migrationLog.slice(-50);
    console.warn('[migration] orphan-gantt: ' + orphans.length + ' issues in ' + (snap.sprintId || '?'));
  }
  return orphans;
}

function filterKeys(obj, allowedKeys) {
  if (!obj || typeof obj !== 'object') return {};
  var result = {};
  for (var i = 0; i < allowedKeys.length; i++) {
    var k = allowedKeys[i];
    if (Object.prototype.hasOwnProperty.call(obj, k)) {
      result[k] = obj[k];
    }
  }
  return result;
}

/**
 * Валидация строки: только строка, максимальная длина.
 */
function assertStr(val, maxLen) {
  if (val === null || val === undefined) return true; // null разрешён
  if (typeof val !== 'string') return false;
  if (maxLen && val.length > maxLen) return false;
  return true;
}

/**
 * Валидация числа: только number, конечное.
 */
function assertNum(val) {
  if (val === null || val === undefined) return true;
  return typeof val === 'number' && isFinite(val);
}

/* v5.12.0 — B (D65): валидация поля migrationLog (опциональный массив записей аудита). */
function validateMigrationLog(arr, context) {
  if (arr == null) return null;
  if (!Array.isArray(arr)) return 'migrationLog: not an array (in ' + context + ')';
  for (var i = 0; i < arr.length; i++) {
    var rec = arr[i];
    if (!rec || typeof rec !== 'object') return 'migrationLog[' + i + ']: not an object';
    if (typeof rec.at !== 'number') return 'migrationLog[' + i + '].at: must be number';
    if (typeof rec.level !== 'string') return 'migrationLog[' + i + '].level: must be string';
    if (rec.issues != null && typeof rec.issues !== 'number') return 'migrationLog[' + i + '].issues: must be number';
  }
  return null;
}

/* v3.27.0 #73 — roles: optional массив ролей-участниц спринта. Absent/null →
   accepted (pre-#73 снапшоты, набор резолвится фолбэком на фронте). Валидация
   независима от settings.activeRoles (⚖ №5 — «⊆ проекта» только UI-гейт создания;
   write-гейт по настройкам бракует сейв после их смены — класс брика v3.2.1/#70):
   каждый элемент ∈ ROLE_KEYS, без дублей, длина ≤ ROLE_KEYS.length. */
function validateSprintRoles(roles) {
  if (roles == null) return true;
  if (!Array.isArray(roles) || roles.length > ROLE_KEYS.length) return false;
  for (var i = 0; i < roles.length; i++) {
    if (typeof roles[i] !== 'string' || ROLE_KEYS.indexOf(roles[i]) < 0) return false;
    if (roles.indexOf(roles[i]) !== i) return false; // дубль
  }
  return true;
}

/* v1.6.0 D125 — pluginVersion: optional string 'X.Y.Z', max 32 chars.
   Absent/null → accepted (pre-v1.6.0 snapshots). Malformed string → rejected. */
function validatePluginVersion(v) {
  if (v == null) return true;
  if (typeof v !== 'string') return false;
  if (v.length > 32) return false;
  return /^\d+\.\d+\.\d+$/.test(v);
}

/* v1.6.0 D125 — Sprint validator split: ForWrite (strict whitelist) + ForRead (tolerant).
   Единое тело со strict-флагом — по образцу _validateHistoryRecord/_validateWorkingDraftBody:
   различие ForWrite/ForRead ровно одно — реакция на неизвестный ключ (reject vs WARN-лог). */
function _validateSprintBody(sprint, strict) {
  if (!sprint || typeof sprint !== 'object') return false;
  var keys = Object.keys(sprint);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (ALLOWED_SPRINT_KEYS.indexOf(k) < 0 && !/^(resource|remain)[A-Za-z0-9_]*$/.test(k)) {
      if (strict) return false;
      _appendMigrationLog(sprint, { at: Date.now(), level: 'WARN_UNKNOWN_KEY',
        fromVersion: sprint.pluginVersion || 'unset', toVersion: CURRENT_PLUGIN_VERSION, key: k });
    }
  }
  if (!assertStr(sprint.sprintId,        100)) return false;
  if (!assertStr(sprint.name,            500)) return false;
  if (!assertStr(sprint.updatedBy,       200)) return false;
  if (!assertStr(sprint.sprintFieldVal,  500)) return false;
  if (!assertStr(sprint.versionFieldVal, 500)) return false;
  if (sprint.status !== undefined && sprint.status !== null) {
    if (typeof sprint.status !== 'string' || STATUS_CODES.indexOf(sprint.status) < 0) return false;
  }
  if (!assertNum(sprint.dateStart))  return false;
  if (!assertNum(sprint.dateEnd))    return false;
  if (!assertNum(sprint.updatedAt))  return false;
  for (var j = 0; j < keys.length; j++) {
    var sk = keys[j];
    if (/^(resource|remain)[A-Za-z0-9_]*$/.test(sk)) {
      var sv = sprint[sk];
      if (sv !== null && sv !== undefined && (!assertNum(sv) || sv < 0 || sv > 1e8)) return false;
    }
  }
  if (sprint.personalPlanning !== undefined && sprint.personalPlanning !== null
      && typeof sprint.personalPlanning !== 'object') return false;
  /* v1.9.0 D132 — Sprint goal: optional string ≤ 500. */
  if (sprint.sprintGoal !== undefined && sprint.sprintGoal !== null) {
    if (!assertStr(sprint.sprintGoal, 500)) return false;
  }
  if (!validateSprintRoles(sprint.roles)) return false;   /* v3.27.0 #73 */
  if (validateMigrationLog(sprint.migrationLog, 'sprint') !== null) return false;
  if (!validatePluginVersion(sprint.pluginVersion)) return false;
  return true;
}

function validateSprintForWrite(sprint) { return _validateSprintBody(sprint, true); }
function validateSprintForRead(sprint)  { return _validateSprintBody(sprint, false); }

// Whitelist ключей задачи (без динамических estimate_*/fact_*/alloc_*/allocation*/estH_*/factH_*)
var ALLOWED_ITEM_KEYS = [
  'issueId','url','title','priority','xpriority','state','system',
  'version','inclusionStatus','assignee','addedBy','addedAt',
  /* v1.8.0 D130 — Etap В.2 — external ticket ID (optional, populated from
     _settings.fieldExternalTicketId at pick/refresh time). Read-only in UI. */
  'externalTicketId',
  /* v2.1.14 #20 — Gantt state-history: localized state label + color + field id,
     written into items by refreshRoleEstimates / syncAssigneesFromYouTrack.
     Persisted to roleItems → must be whitelisted (иначе invalid_role_items_structure). */
  'stateLocalized','stateColor','stateFieldId'
];

/**
 * Валидация одного item (задача в спринте).
 * Whitelist ключей + типизация + whitelist inclusionStatus (латинские коды).
 * URL только https://; длина URL ограничена 2000.
 */
function validateItem(item) {
  if (!item || typeof item !== 'object') return false;
  var keys = Object.keys(item);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (ALLOWED_ITEM_KEYS.indexOf(k) < 0
        && !/^(estimate_|fact_|alloc_|allocation|estH_|factH_)/.test(k)) {
      return false; // неизвестный ключ
    }
  }
  // Обязательное строковое поле
  if (!assertStr(item.issueId, 100)) return false;
  // Остальные строковые поля
  /* v1.8.0 D130 — externalTicketId добавлен в стандартный strFields (лимит 1000).
     Изначальный отдельный лимит 200 снят: значение может быть URL (> 200 символов).
     URL-рендер в UI управляется на фронтенде; длинные значения усекаются через ellipsis. */
  var strFields = ['url', 'title', 'priority', 'xpriority', 'state', 'system',
                   'version', 'assignee', 'addedBy', 'externalTicketId',
                   /* v2.1.14 #20 — Gantt state-history string fields. */
                   'stateLocalized', 'stateFieldId'];
  for (var s = 0; s < strFields.length; s++) {
    if (!assertStr(item[strFields[s]], 1000)) return false;
  }
  /* v2.1.14 #20 — stateColor: optional объект { background, foreground } (оба — строка|null) или null. */
  if (item.stateColor !== undefined && item.stateColor !== null) {
    if (typeof item.stateColor !== 'object') return false;
    if (!assertStr(item.stateColor.background, 100)) return false;
    if (!assertStr(item.stateColor.foreground, 100)) return false;
  }
  // url — только https?:// или пустая строка, длина ограничена
  if (item.url && item.url.length > 0) {
    if (item.url.length > 2000) return false;
    if (!/^https?:\/\//i.test(item.url)) return false;
  }
  // inclusionStatus — whitelist латинских кодов (миграция применена на READ)
  if (item.inclusionStatus !== undefined && item.inclusionStatus !== null) {
    if (typeof item.inclusionStatus !== 'string' || INC_CODES.indexOf(item.inclusionStatus) < 0) return false;
  }
  // Числовые поля
  if (!assertNum(item.addedAt)) return false;
  // Все числовые динамические поля (estimate_*, fact_*, alloc_*, allocation*, estH_*, factH_*)
  for (var j = 0; j < keys.length; j++) {
    var dk = keys[j];
    if (/^(estimate_|fact_|alloc_|allocation|estH_|factH_)/.test(dk)) {
      if (!assertNum(item[dk])) return false;
    }
  }
  return true;
}

/**
 * Валидация roleItems: объект { roleKey: [item, ...] }
 * roleKey — только из ROLE_KEYS whitelist.
 * Не более 1000 задач на роль.
 */
function validateRoleItems(roleItems) {
  if (!roleItems || typeof roleItems !== 'object') return false;
  var keys = Object.keys(roleItems);
  for (var i = 0; i < keys.length; i++) {
    var rk = keys[i];
    if (ROLE_KEYS.indexOf(rk) < 0) return false; // неизвестный role key
    var arr = roleItems[rk];
    if (!Array.isArray(arr)) return false;
    if (arr.length > 1000) return false;
    for (var j = 0; j < arr.length; j++) {
      if (!validateItem(arr[j])) return false;
    }
  }
  return true;
}

// Жёсткий whitelist ключей settings.
// Сюда НЕ входит settingsManagerGroup — она живёт ТОЛЬКО в app-settings (ctx.settings).
// Любая попытка прислать её в body.settings → 400 (защита от подмены источника правды).
var ALLOWED_SETTINGS_KEYS = [
  // Активные роли
  'activeRoles',
  // Поля по 9 ролям
  'fieldAnalysis','fieldFactAnalysis','userFieldAnalysis',
  'fieldTesting','fieldFactTesting','userFieldTesting',
  'fieldDevPlatform','fieldFactDevPlatform','userFieldDevPlatform',
  'fieldDevBack','fieldFactDevBack','userFieldDevBack',
  'fieldDevFront','fieldFactDevFront','userFieldDevFront',
  'fieldDevIos','fieldFactDevIos','userFieldDevIos',
  'fieldDevAndroid','fieldFactDevAndroid','userFieldDevAndroid',
  'fieldDevFullstack','fieldFactDevFullstack','userFieldDevFs',
  'fieldDevDb','fieldFactDevDb','userFieldDevDb',
  // Прочие поля
  'fieldPriority','fieldXPriority','fieldState','fieldSystem',
  'fieldSprint','fieldVersion',
  /* #21 — тип-назначение задачи (Фича/Баг/Спайк/…) для фильтра модуля «Работа с бэклогом».
     Планировочный тир, как прочие field* (НЕ admin). */
  'fieldType',
  /* v1.8.0 D130 — Etap В.2 — external ticket ID field name (string field in YT). */
  'fieldExternalTicketId',
  // Группы (без settingsManagerGroup)
  'validationGroups','validationGroupNames','editGroups','editGroupNames',
  'historyClearGroups','historyClearGroupNames',
  /* v6.1.0 D82 (F5) — assigner-роль (variant b: assignee + start/end-dates). */
  'assignerGroups','assignerGroupNames',
  /* #22 — планировочный тир (Вариант C): группы менеджеров планировочных настроек.
     Задаются settings-менеджером; редактируют только планировочные секции
     (admin-тир ключи preserve-merge'атся при записи — см. ADMIN_TIER_SETTINGS_KEYS). */
  'planningManagerGroups','planningManagerGroupNames',
  // Параметры планирования
  'dynEditEnabled','personalPlanningEnabled','usePersonalForResource',
  /* v1.4.0 — ручной ввод ресурса по исполнителям (дочерний к personalPlanning).
     При включении entry.resource в personalPlanning.resourcesByAssignee становится
     manual-input в ЧЧ; авторасчёт по грейду игнорируется. */
  'manualPersonalResource',
  /* #38 — разрешить планирование с превышением лимитов роли (не блокировать
     валидацию и не показывать overlimit-модалку; детекция остаётся). */
  'allowOverlimitPlanning',
  /* #40 — авто-прогноз дат старта/окончания (кнопка «Спрогнозировать даты» + очередь
     на уровне «Распределение по исполнителям»). Планировочный тир, как dynEdit/overlimit. */
  'autoForecastEnabled',
  'nkcJanuary','nkcMay','nkcOther','rate','participation',
  'kpe',
  /* #56-5 — показывать панель диагностического лога (default: скрыта).
     Legacy-инверсия hideDiagLogUi (v6.3.0 D110) прошла лестницу deprecation:
     soft #56-5 (форма пишет только showDiagLogUi) → hard-removal v3.6.0.
     Ключ вне whitelist; из старых блобов тихо уходит на READ
     (migrateSettingsObj, шаг 3 — defensive strip). */
  'showDiagLogUi',
  /* v1.1.0 — project-default язык интерфейса (один из ALLOWED_LANG_CODES).
     Если не задан — клиент использует localStorage.ssp_lang ⊃ navigator.language ⊃ 'ru'. */
  'defaultLang',
  /* v1.2.0 — Differentiated Time Accounting (DTA): on-change агрегация
     workItems issue по type → role. Workflow-rule в workflow-dta-aggregation.js
     (корень YT-app). Имена fact-полей берутся из существующих settings.fieldFact*
     (заполняются в settings UI «Поля → Факт»). v1.2.4: dtaWarningsEnabled —
     отдельный toggle для notifyProgress-уведомлений (план/факт). */
  'dtaEnabled',
  'dtaWarningsEnabled',
  'workItemTypeMapping',
  /* v1.3.0 — Cascade aggregation parent ← child + Forbid container workItems.
     Workflow-rules: workflow-cascade-aggregation.js (parent ← child sum по
     DTA-полям) и workflow-forbid-container.js (block direct workItems on
     level-2/level-3 issues). Поля для агрегации derived из settings.fieldFact*
     + settings.fieldEst* через FIELD_FACT_KEY_BY_ROLE/FIELD_EST_KEY_BY_ROLE
     (см. workflow-dta-aggregation.js). 2 уровня иерархии max (B-7).
     Default kindField='Type', level2=['Story'], level3=['Epic'],
     parentLink inward='subtask of'/outward='parent for' (built-in YT). */
  'cascadeAggregationEnabled',
  'forbidContainerWorkItems',
  'cascadeKindField',
  'cascadeLevel2Values',
  'cascadeLevel3Values',
  /* #74 шаг 1 (soft-deprecation): вытеснены таблицей linkTypeRoles, но форма всё ещё
     ПИШЕТ их производными от первой строки «Иерархии» (⚖ владелец 2026-08-24) — оба
     workflow-правила читают этот блоб напрямую. Шаг 2: правила на резолвер + removal. */
  'cascadeParentLinkInward',
  'cascadeParentLinkOutward',
  /* v3.12.0 — тег-маркер защиты ручных оценок: родитель с этим тегом исключается
     из каскадной агрегации (str≤200|null). */
  'cascadeManualEstTag',
  /* #74 — роли типов связей: [{type,hier,dep,info}], type = IssueLinkType.name (id
     различаются между инстансами). Пусто → слоёный фолбэк резолвера на фронте. */
  'linkTypeRoles',
  /* 68-8 — отображаемые поля: [{name,summary,role,my}], name = имя поля YouTrack
     проекта (id у project-fields нет). Значения полей НЕ хранятся — читаются на лету
     фронтом под правами пользователя. Имя ключа намеренно НЕ начинается с field/userField:
     такие ключи попадают в allow-list записи полей задач (backend-issuefields.js). */
  'displayFields',
  // Метаданные
  'savedAt',
  /* v1.7.0 D128 — State Rollup: parent.State ← min(children.State).
     stateRollupEnabled       — master toggle, default false.
     stateRollupOrder         — ordered array of state names (least → most progressed).
     stateRollupResolvedStates— states treated as resolved; guard prevents re-opening.
     stateRollupFloor         — optional floor state (parent won't go below this).
     stateRollupStrategy      — enum, v1.7.0 accepts only 'min' (reserved for future).
     (rescan-ключи v1.7.1 удалены: фича manual-rescan не была реализована — ключи
      никогда не писались фронтом и не читались workflow.) */
  'stateRollupEnabled',
  'stateRollupOrder',
  'stateRollupResolvedStates',
  'stateRollupFloor',
  'stateRollupStrategy',
  /* v1.9.0 D132 — Stand-up assist: admin-configurable list of state names that count as Done. */
  'standupDoneStates',
  /* 68-7 — состояния бандла, скрытые из секций стендапа, + маппинг «состояние → роли»
     (per-role фильтр секций). Планировочный тир, как standupDoneStates. */
  'standupHiddenStates',
  'standupStateRoles',
  /* v2.8.0 #45 R1 — Capacity Management. capacityMode (light|full) — взаимоисключающий
     режим модели ёмкости; hoursPerDay/usefulHoursPerDay — константы политики (8ч бюджет
     vs ~6ч полезных под #40). Все три — admin-тир (см. ADMIN_TIER_SETTINGS_KEYS). */
  'capacityMode',
  'hoursPerDay',
  'usefulHoursPerDay',
  /* v2.14.0 — «Модель планирования» (simple|light|full) — источник правды UI,
     заменяет тройку тогглов в форме настроек; на бэке additive optional поле.
     Старые флаги (personalPlanningEnabled/usePersonalForResource/manualPersonalResource)
     остаются как derived-зеркало для расчётов/super-light (см. PLANNING_MODEL_SHIM). */
  'planningModel',
  /* #21 — модуль «Работа с бэклогом» (additive optional; admin-тир — см. ADMIN_TIER_SETTINGS_KEYS).
     backlogZones        — упорядоченный пайплайн зон [{ state, roles[] }] (состояние→роль(и), MANY);
     backlogStartStates  — состояния «пула заказчика» (стартовая зона, §4/§6.1 спеки);
     backlogTypeFilter   — значения fieldType для базового фильтра (Сопровождение исключаем и т.п.);
     backlogPauseTags / backlogPauseStates — источник признака паузы (тег и/или состояние, §8). */
  'backlogZones','backlogStartStates','backlogTypeFilter','backlogPauseTags','backlogPauseStates',
  /* #48 R1 — Релиз-менеджмент (additive optional; admin-тир — см. ADMIN_TIER_SETTINGS_KEYS).
     releaseEnabled — мастер-тумблер модуля (гейтит вкладку/узлы дерева, как capacityMode).
     releaseCandidate*Groups/*Names — пул кандидатов в представители (D-D2, отдельно от прав);
     release{Manager,Engineer}Groups/*Names — группы прав (РМ полные / РИ сборка-статус).
     releaseStatusStateMapping — { <status> → <target state name> } (R2 применяет к задачам;
     R3 — mapping.planned = стартовый якорь светофора). Зоны светофора — АВТО по State
     (ревизия владельца 2026-07-01); releaseReadinessField/releaseZone*Values удалены до
     merge эпика — жили только на epic-ветке, ни в один релиз не выпускались. */
  'releaseEnabled',
  'releaseCandidateManagerGroups','releaseCandidateManagerGroupNames',
  'releaseCandidateEngineerGroups','releaseCandidateEngineerGroupNames',
  'releaseManagerGroups','releaseManagerGroupNames',
  'releaseEngineerGroups','releaseEngineerGroupNames',
  'releaseStatusStateMapping',
  /* #55 — авто-теги: { <status> → <имя СУЩЕСТВУЮЩЕГО тега> }. Применение — фронтовый
     fanout официальным REST тегов от имени юзера (backend теги не трогает); тег
     предыдущего статуса снимается, нового — ставится. Теги НЕ создаются автоматически
     (авто-созданный тег приватен владельцу и невидим команде). */
  'releaseTagMapping',
  /* #59 — кросс-ролевое исключение задачи из спринта: исключение/удаление записи в одной
     роли каскадится на остальные роли того же спринта. Планировочный тир, дефолт ON
     (семантика `!== false` на фронте — ключ может отсутствовать у старых установок). */
  'crossRoleExcludeEnabled',
  /* #61 — сводная таблица мультиролевого планирования (read-only спойлер над
     аккордеонами ролей). Планировочный тир, дефолт ON (`!== false` на фронте). */
  'allocSummaryEnabled',
  /* #57-2 — блокировка создания новых спринтов: тумблер в шапке планера. blockSprintCreation
     пишется ТОЛЬКО эндпоинтом sprint-lock (backend-sprintlock.js) под группой
     sprintLockGroups/Names («Управление правами», admin-тир); обычный settings-save
     preserve'ит хранимое значение (анти-гонка формы с тумблером). */
  'blockSprintCreation',
  'sprintLockGroups','sprintLockGroupNames',
  /* #80 — «Отключить планер в этом проекте»: флаг пишется ТОЛЬКО эндпоинтом
     planner-disabled (backend-plannerdisable.js, роль settingsManager); обычный
     settings-save preserve'ит хранимое значение (анти-затирание формой, ожог #74).
     Потребители: гейт пикера и global-делегирования (backend-global.js). Workflow-правила
     флагом НЕ гейтятся — осознанно (карточка #80): каскад/rollup читают блоб напрямую. */
  'plannerDisabled',
  /* #50 — Оперативная отчётность (additive optional; admin-тир — см. ADMIN_TIER_SETTINGS_KEYS).
     reportingEnabled — мастер-тумблер модуля (гейтит узлы дерева/секцию, как releaseEnabled).
     reportingGroups{A,B}/*Names — reporting-access группы (US-ACC): контур A (лиды) /
     контур B (руководство, B⊇A). ОТДЕЛЬНО от planning/release ACL — отчёты вскрывают
     individual performance. Сегментация/паузы — со своими потребителями (S5/S6+). */
  'reportingEnabled',
  'reportingGroupsA','reportingGroupsANames',
  'reportingGroupsB','reportingGroupsBNames',
  /* #50 S1c — reportingThresholds: порог aging на статус { <state> → {yellow,red} } (раб.дн). */
  'reportingThresholds',
  /* #50 S2 — A1 Прогресс: reportingTargetStatuses (целевые статусы, str[]) +
     reportingStatusLabels (статус→подпись { <state> → <label> }). */
  'reportingTargetStatuses','reportingStatusLabels',
  /* #50 S3a — A2 TTM: reportingAnchors (пары якорей lead/team/cycle → {start,end}) +
     reportingTtmNorms (нормативы lead/team в раб.дн, int|null) +
     reportingPauseMarkers (маркеры пауз {states,tags}). */
  'reportingAnchors','reportingTtmNorms','reportingPauseMarkers',
  /* #50 v3.2.0 — A2 терминальная политика при reopen (US-A2-02): enum
     'first-close' (дефолт, первый вход в конец-якорь) | 'last-stable-close' (последний вход). */
  'reportingTerminalPolicy',
  /* #50 S4 — A8 Bottleneck / A9 Rework: reportingFlowStates (УПОРЯДОЧЕННЫЙ список статусов
     потока, str[]) — порядок баров/WIP (A8) + детект обратных переходов против потока (A9). */
  'reportingFlowStates',
  /* #50 S5b — A5 План-факт: reportingVariancePct (порог |расхождения| %, num 0..10000). */
  'reportingVariancePct',
  /* #50 D10 — таймаут-бэкстоп прогона отчёта (сек, num 5..3600) — «не завесить систему». */
  'reportingTimeoutSec',
  /* #50 S6a — A3 срез: имена YT-полей бизнес-колонок (Бизнес-этап/Орг-юнит/Приоритет),
     str|null — колонка рендерится только при заданном поле (graceful-degrade). */
  'reportingA3StageField','reportingA3OrgField','reportingA3PriorityField',
  /* #50 S6b — A6 Бэклог в ЧЧ: месячная ёмкость роли { roleKey → ч/мес } (top-down B1);
     знаменатель «месяцев бэклога» = Σ ЧЧ ÷ ёмкость. Роль без ёмкости → гейдж «—». */
  'reportingRoleMonthlyCapacity',
  /* #50 S7a — A10 Spillover: пороги «возраста хвоста» { warm|hot → int 1..1000 спринтов } (бэйджи зомби). */
  'reportingSpilloverAgeBands',
  /* #50 S8a — B3 «1000 мелочей» (контур B): тег YT мелких задач (str≤200|null). */
  'reportingThousandTag',
  /* #50 S8b — B1 Техдолг (контур B): отбор техдолга = значение типа задачи ИЛИ имя тега (str≤200|null; одно из двух). */
  'reportingTechDebtType','reportingTechDebtTag',
  /* #50 S8c — B2 «Налог на баги» (контур B): тип задачи-бага (str≤200|null) + имена типов связей баг→фича (str[]). */
  'reportingBugType','reportingLinkTypes',
  /* v3.9.0 — тумблер «Система» в отчётах: значение поля fieldSystem в per-issue колонках
     A-отчётов, группировке B-отчётов и экспорте XLSX/PDF (bool, дефолт ON — семантика !== false). */
  'reportingShowSystem',
  /* v3.12.0 (#11) — A11 Velocity: окно скользящего среднего (закрытые спринты, int 1..10|null, дефолт 3). */
  'reportingVelocityWindow',
  /* #58-5 шаг 2 — потолок задач среза (A3/A6/B1/B0): пагинация страницами до потолка (int 200..5000|null, дефолт 1000 на фронте). */
  'reportingMaxIssues'
];

/* #22 — ключи admin-тира формы настроек (Вариант C). Записываются ТОЛЬКО
   settings-менеджером; для планировочного менеджера preserve-merge'атся из stored
   (mergeAdminTierFromStored). Две группы: доступ/права (включая planningManagerGroups —
   запрет self-эскалации) + workflow-правила (DTA / каскад+forbid / state-rollup). */
var ADMIN_TIER_SETTINGS_KEYS = [
  // Доступ и права
  'validationGroups','validationGroupNames','editGroups','editGroupNames',
  'historyClearGroups','historyClearGroupNames','assignerGroups','assignerGroupNames',
  'planningManagerGroups','planningManagerGroupNames',
  'sprintLockGroups','sprintLockGroupNames','blockSprintCreation',   /* #57-2 */
  'plannerDisabled',   /* #80 — только settings-менеджер (и то через planner-disabled, не формой) */
  // DTA
  'dtaEnabled','dtaWarningsEnabled','workItemTypeMapping',
  // Каскад + forbid container
  'cascadeAggregationEnabled','forbidContainerWorkItems','cascadeKindField',
  'cascadeLevel2Values','cascadeLevel3Values','cascadeParentLinkInward','cascadeParentLinkOutward',
  'cascadeManualEstTag', /* v3.12.0 — тег-маркер защиты ручных оценок */
  'linkTypeRoles',       /* #74 — таблица «тип связи × роль», тот же тир, что и каскад */
  'displayFields',       /* 68-8 — отображаемые поля таблиц задач (⚖11 — только настройщик проекта) */
  // State Rollup
  'stateRollupEnabled','stateRollupOrder','stateRollupResolvedStates','stateRollupFloor',
  'stateRollupStrategy',
  /* #45 (b) — рекомпозиция блока ёмкости (3 секции настроек → 2): параметры расчёта
     ёмкости (нормы + КПЕ) и источник ресурса исполнителей (personalPlanning-кластер)
     перенесены в admin-тир. Редактируются только settings-менеджером; для планировочного
     менеджера preserve-merge'атся из stored. dynEditEnabled / allowOverlimitPlanning
     намеренно ОСТАЮТСЯ планировочными (см. ниже SETTINGS_WHITELIST). */
  'nkcJanuary','nkcMay','nkcOther','rate','participation','kpe',
  'personalPlanningEnabled','usePersonalForResource','manualPersonalResource',
  // #45 Capacity Management — политика модели ёмкости (admin-тир)
  'capacityMode','hoursPerDay','usefulHoursPerDay',
  // v2.14.0 — модель планирования (admin-тир, как и тройка флагов, которую она заменяет)
  'planningModel',
  /* #21 — настройки модуля «Работа с бэклогом» — admin-тир (спека §9: настройки=admin,
     триаж/раскладка=планировочный). fieldType намеренно НЕ здесь — остаётся
     планировочным, как прочие field*. */
  'backlogZones','backlogStartStates','backlogTypeFilter','backlogPauseTags','backlogPauseStates',
  /* #48 R1 — Релиз-менеджмент: весь раздел настроек — admin-тир (риск §8 обследования:
     иначе планировочный менеджер правил бы admin-конфиг релизов). preserve-merge из stored
     для не-settings-менеджера. */
  'releaseEnabled',
  'releaseCandidateManagerGroups','releaseCandidateManagerGroupNames',
  'releaseCandidateEngineerGroups','releaseCandidateEngineerGroupNames',
  'releaseManagerGroups','releaseManagerGroupNames',
  'releaseEngineerGroups','releaseEngineerGroupNames',
  'releaseStatusStateMapping',
  'releaseTagMapping', /* #55 — как и весь раздел релиз-менеджмента */
  /* #50 — Оперативная отчётность: весь раздел настроек — admin-тир (доступ к чувствительным
     метрикам; reporting-access группы задаёт только settings-менеджер). preserve-merge из
     stored для не-settings-менеджера, как release/backlog. */
  'reportingEnabled',
  'reportingGroupsA','reportingGroupsANames',
  'reportingGroupsB','reportingGroupsBNames',
  'reportingThresholds', /* #50 S1c — пороги aging на статус */
  'reportingTargetStatuses','reportingStatusLabels', /* #50 S2 — A1 целевые статусы + ярлыки */
  'reportingAnchors','reportingTtmNorms','reportingPauseMarkers', /* #50 S3a — A2 якоря/нормативы/паузы */
  'reportingTerminalPolicy', /* #50 v3.2.0 — A2 терминальная политика reopen (US-A2-02) */
  'reportingFlowStates', /* #50 S4 — A8/A9 упорядоченные статусы потока */
  'reportingVariancePct', /* #50 S5b — A5 порог расхождения */
  'reportingTimeoutSec', /* #50 D10 — таймаут-бэкстоп прогона отчёта */
  'reportingA3StageField','reportingA3OrgField','reportingA3PriorityField', /* #50 S6a — A3 бизнес-поля среза */
  'reportingRoleMonthlyCapacity', /* #50 S6b — A6 месячная ёмкость роли ч/мес */
  'reportingSpilloverAgeBands', /* #50 S7a — A10 пороги возраста хвоста */
  'reportingThousandTag', /* #50 S8a — B3 тег «1000 мелочей» (контур B) */
  'reportingTechDebtType','reportingTechDebtTag', /* #50 S8b — B1 отбор техдолга тип/тег (контур B) */
  'reportingBugType','reportingLinkTypes', /* #50 S8c — B2 «Налог на баги»: тип-баг + типы связей баг→фича (контур B) */
  'reportingShowSystem', /* v3.9.0 — тумблер «Система» в отчётах */
  'reportingVelocityWindow', /* v3.12.0 (#11) — A11 Velocity: окно среднего */
  'reportingMaxIssues' /* #58-5 шаг 2 — потолок задач среза A3/A6/B1/B0 */
];

/* #22 — preserve-merge: вернуть копию incoming, где admin-тир ключи взяты из stored
   (присланные значения планировочного менеджера игнорируются), планировочные — из
   incoming. Если ключа нет в stored — он удаляется из результата (планировочный
   менеджер не может СОЗДАТЬ admin-ключ). Чистая функция (test-exported). */
function mergeAdminTierFromStored(incoming, stored) {
  var out = {};
  var inObj = incoming || {};
  Object.keys(inObj).forEach(function (k) { out[k] = inObj[k]; });
  var st = stored || {};
  for (var i = 0; i < ADMIN_TIER_SETTINGS_KEYS.length; i++) {
    var k = ADMIN_TIER_SETTINGS_KEYS[i];
    if (Object.prototype.hasOwnProperty.call(st, k)) out[k] = st[k];
    else delete out[k];
  }
  return out;
}

/* v1.7.0: KPE whitelist accepts both legacy Russian keys (Стажёр/Джун/Мидл/Синьор)
   and canonical English keys (Intern/Junior/Middle/Senior, frontend storage layer
   since v1.4.1 D128 — see widgets/main/src/core.js GRADES_LOCAL).
   Pre-existing fix: previously frontend wrote English keys but backend rejected
   the save with invalid_settings_structure on any settings POST. */
var ALLOWED_KPE_KEYS = ['Стажёр','Джун','Мидл','Синьор','Intern','Junior','Middle','Senior'];

/* v1.1.0 — whitelist 15 ISO-кодов языков. ОБЯЗАН совпадать с widgets/main/src/i18n/languages.js.
   Любой иной код (включая регион "en-US", "ru-RU") отклоняется → 400 invalid_input. */
var ALLOWED_LANG_CODES = ['en','ru','cs','de','es','fr','hu','it','ja','ko','nl','pl','pt','tr','zh'];

function isStrArr(v, maxLen, maxItems) {
  if (!Array.isArray(v)) return false;
  if (v.length > (maxItems || 100)) return false;
  for (var i = 0; i < v.length; i++) {
    if (typeof v[i] !== 'string' || v[i].length > (maxLen || 500)) return false;
  }
  return true;
}

function isNumInRange(v, min, max) {
  return typeof v === 'number' && isFinite(v) && v >= min && v <= max;
}

/**
 * Валидация settings — жёсткий whitelist ключей и типизация по ключам.
 * Любой неизвестный ключ → false.
 * settingsManagerGroup в body.settings ЗАПРЕЩЕНА (читается из ctx.settings).
 */
function validateSettings(settings) {
  if (!settings || typeof settings !== 'object') return false;
  var keys = Object.keys(settings);
  for (var i = 0; i < keys.length; i++) {
    if (ALLOWED_SETTINGS_KEYS.indexOf(keys[i]) < 0) return false;
  }
  // activeRoles — массив из ROLE_KEYS
  if (settings.activeRoles !== undefined && settings.activeRoles !== null) {
    if (!Array.isArray(settings.activeRoles) || settings.activeRoles.length > ROLE_KEYS.length) return false;
    for (var ri = 0; ri < settings.activeRoles.length; ri++) {
      if (ROLE_KEYS.indexOf(settings.activeRoles[ri]) < 0) return false;
    }
  }
  // Все field*/userField* — string|null длиной до 200
  var fieldKeys = ['fieldAnalysis','fieldFactAnalysis','userFieldAnalysis',
    'fieldTesting','fieldFactTesting','userFieldTesting',
    'fieldDevPlatform','fieldFactDevPlatform','userFieldDevPlatform',
    'fieldDevBack','fieldFactDevBack','userFieldDevBack',
    'fieldDevFront','fieldFactDevFront','userFieldDevFront',
    'fieldDevIos','fieldFactDevIos','userFieldDevIos',
    'fieldDevAndroid','fieldFactDevAndroid','userFieldDevAndroid',
    'fieldDevFullstack','fieldFactDevFullstack','userFieldDevFs',
    'fieldDevDb','fieldFactDevDb','userFieldDevDb',
    'fieldPriority','fieldXPriority','fieldState','fieldSystem',
    'fieldSprint','fieldVersion','fieldExternalTicketId',   /* #69 R1 — был в whitelist, но без assertStr(200) */
    /* #21 — тип-назначение задачи (фильтр модуля «Работа с бэклогом»). */
    'fieldType'];
  for (var f = 0; f < fieldKeys.length; f++) {
    if (!assertStr(settings[fieldKeys[f]], 200)) return false;
  }
  // Группы
  if (settings.validationGroups     !== undefined && settings.validationGroups     !== null
      && !isStrArr(settings.validationGroups,     200, 100)) return false;
  if (settings.validationGroupNames !== undefined && settings.validationGroupNames !== null
      && !isStrArr(settings.validationGroupNames, 500, 100)) return false;
  if (settings.editGroups           !== undefined && settings.editGroups           !== null
      && !isStrArr(settings.editGroups,           200, 100)) return false;
  if (settings.editGroupNames       !== undefined && settings.editGroupNames       !== null
      && !isStrArr(settings.editGroupNames,       500, 100)) return false;
  if (settings.historyClearGroups     !== undefined && settings.historyClearGroups     !== null
      && !isStrArr(settings.historyClearGroups,     200, 100)) return false;
  /* v6.1.0 D82 (F5) — assigner groups whitelist. */
  if (settings.assignerGroups     !== undefined && settings.assignerGroups     !== null
      && !isStrArr(settings.assignerGroups,     200, 100)) return false;
  if (settings.assignerGroupNames !== undefined && settings.assignerGroupNames !== null
      && !isStrArr(settings.assignerGroupNames, 200, 100)) return false;
  /* #22 — планировочный тир (Вариант C). */
  if (settings.planningManagerGroups     !== undefined && settings.planningManagerGroups     !== null
      && !isStrArr(settings.planningManagerGroups,     200, 100)) return false;
  if (settings.planningManagerGroupNames !== undefined && settings.planningManagerGroupNames !== null
      && !isStrArr(settings.planningManagerGroupNames, 500, 100)) return false;
  if (settings.historyClearGroupNames !== undefined && settings.historyClearGroupNames !== null
      && !isStrArr(settings.historyClearGroupNames, 500, 100)) return false;
  // Булевы флаги
  var boolKeys = ['dynEditEnabled','personalPlanningEnabled','usePersonalForResource','manualPersonalResource','allowOverlimitPlanning','autoForecastEnabled','showDiagLogUi','dtaEnabled','dtaWarningsEnabled','cascadeAggregationEnabled','forbidContainerWorkItems',
    /* v1.7.0 D128 — State Rollup */ 'stateRollupEnabled',
    /* #57-2 — блокировка создания спринтов */ 'blockSprintCreation',
    /* #80 — планер отключён в проекте */ 'plannerDisabled',
    /* #59 — кросс-ролевое исключение */ 'crossRoleExcludeEnabled',
    /* #61 — сводная мультиролевого планирования */ 'allocSummaryEnabled'];
  for (var b = 0; b < boolKeys.length; b++) {
    var bv = settings[boolKeys[b]];
    if (bv !== undefined && bv !== null && typeof bv !== 'boolean') return false;
  }
  // Числа НКЧ
  var nkcKeys = ['nkcJanuary','nkcMay','nkcOther'];
  for (var n = 0; n < nkcKeys.length; n++) {
    var nv = settings[nkcKeys[n]];
    if (nv !== undefined && nv !== null && !isNumInRange(nv, 0, 10000)) return false;
  }
  // rate, participation
  if (settings.rate !== undefined && settings.rate !== null && !isNumInRange(settings.rate, 0, 10)) return false;
  if (settings.participation !== undefined && settings.participation !== null
      && !isNumInRange(settings.participation, 0, 10)) return false;
  // kpe — объект с фиксированными русскими ключами грейдов
  if (settings.kpe !== undefined && settings.kpe !== null) {
    if (typeof settings.kpe !== 'object' || Array.isArray(settings.kpe)) return false;
    var kpeKeys = Object.keys(settings.kpe);
    for (var kk = 0; kk < kpeKeys.length; kk++) {
      if (ALLOWED_KPE_KEYS.indexOf(kpeKeys[kk]) < 0) return false;
      var kv = settings.kpe[kpeKeys[kk]];
      if (kv !== null && kv !== undefined && !isNumInRange(kv, 0, 10)) return false;
    }
  }
  /* v2.8.0 #45 R1 — Capacity Management политика (admin-тир). */
  if (settings.capacityMode !== undefined && settings.capacityMode !== null) {
    if (settings.capacityMode !== 'light' && settings.capacityMode !== 'full') return false;
  }
  /* v2.14.0 — модель планирования: enum. 'full' принимается (forward-compat,
     UI пока disable не даёт выбрать), 'simple'|'light' — рабочие. */
  if (settings.planningModel !== undefined && settings.planningModel !== null) {
    if (['simple', 'light', 'full'].indexOf(settings.planningModel) < 0) return false;
  }
  if (settings.hoursPerDay !== undefined && settings.hoursPerDay !== null
      && !isNumInRange(settings.hoursPerDay, 1, 24)) return false;
  if (settings.usefulHoursPerDay !== undefined && settings.usefulHoursPerDay !== null
      && !isNumInRange(settings.usefulHoursPerDay, 0, 24)) return false;
  // savedAt
  if (settings.savedAt !== undefined && settings.savedAt !== null
      && (typeof settings.savedAt !== 'number' || !isFinite(settings.savedAt) || settings.savedAt < 0)) return false;
  // v1.1.0 — defaultLang: один из ALLOWED_LANG_CODES (15 ISO-кодов).
  if (settings.defaultLang !== undefined && settings.defaultLang !== null) {
    if (typeof settings.defaultLang !== 'string' || ALLOWED_LANG_CODES.indexOf(settings.defaultLang) < 0) return false;
  }
  /* v1.2.0 DTA — workItemTypeMapping: object<workItemTypeName, roleKey>.
     Keys в JSON object уникальны автоматически → constraint «один type → одна
     роль» обеспечивается shape'ом. Roles обязаны быть из ROLE_KEYS (даже
     если на момент проверки роль выключена — settings.activeRoles может
     быть изменена позже). Имена типов до 200 символов. */
  if (settings.workItemTypeMapping !== undefined && settings.workItemTypeMapping !== null) {
    if (typeof settings.workItemTypeMapping !== 'object' || Array.isArray(settings.workItemTypeMapping)) return false;
    var wmKeys = Object.keys(settings.workItemTypeMapping);
    if (wmKeys.length > 100) return false;
    for (var wk = 0; wk < wmKeys.length; wk++) {
      var wkey = wmKeys[wk];
      if (typeof wkey !== 'string' || wkey.length === 0 || wkey.length > 200) return false;
      var wval = settings.workItemTypeMapping[wkey];
      if (typeof wval !== 'string' || ROLE_KEYS.indexOf(wval) < 0) return false;
    }
  }
  /* v1.3.0 Cascade — string-keys ≤200 для kind-field-name + 2 link names.
     v3.12.0 — + cascadeManualEstTag (тег-маркер защиты ручных оценок). */
  var cascadeStrKeys = ['cascadeKindField','cascadeParentLinkInward','cascadeParentLinkOutward','cascadeManualEstTag'];
  for (var cs = 0; cs < cascadeStrKeys.length; cs++) {
    if (!assertStr(settings[cascadeStrKeys[cs]], 200)) return false;
  }
  /* #74 — linkTypeRoles: array<{type,hier,dep,info}>, max 50, dedup по type; type —
     непустая строка ≤200; hier/dep = какой конец родитель/предшественник. */
  if (settings.linkTypeRoles !== undefined && settings.linkTypeRoles !== null) {
    if (!Array.isArray(settings.linkTypeRoles) || settings.linkTypeRoles.length > 50) return false;
    var ltrSeen = {};
    for (var ltr = 0; ltr < settings.linkTypeRoles.length; ltr++) {
      var row = settings.linkTypeRoles[ltr];
      if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
      if (typeof row.type !== 'string' || row.type.length === 0 || row.type.length > 200) return false;
      if (ltrSeen[row.type]) return false;
      ltrSeen[row.type] = true;
      if (row.hier !== undefined && row.hier !== null && row.hier !== 'source' && row.hier !== 'target') return false;
      if (row.dep !== undefined && row.dep !== null && row.dep !== 'source' && row.dep !== 'target') return false;
      if (row.info !== undefined && row.info !== null && typeof row.info !== 'boolean') return false;
    }
  }
  /* 68-8 — displayFields: array<{name,summary,role,my}>, max 50, дедуп по name;
     name — непустая строка ≤200 (имя поля YouTrack); три флага = в какой из трёх
     таблиц задач колонка показывается. */
  if (settings.displayFields !== undefined && settings.displayFields !== null) {
    if (!Array.isArray(settings.displayFields) || settings.displayFields.length > 50) return false;
    var dfSeen = {};
    for (var df = 0; df < settings.displayFields.length; df++) {
      var dfRow = settings.displayFields[df];
      if (!dfRow || typeof dfRow !== 'object' || Array.isArray(dfRow)) return false;
      if (typeof dfRow.name !== 'string' || dfRow.name.length === 0 || dfRow.name.length > 200) return false;
      if (dfSeen[dfRow.name]) return false;
      dfSeen[dfRow.name] = true;
      var dfFlags = ['summary', 'role', 'my'];
      for (var dfF = 0; dfF < dfFlags.length; dfF++) {
        var dfV = dfRow[dfFlags[dfF]];
        if (dfV !== undefined && dfV !== null && typeof dfV !== 'boolean') return false;
      }
    }
  }
  /* v1.3.0 Cascade — array<string ≤200>, max 50 для level-2/level-3 values. */
  if (settings.cascadeLevel2Values !== undefined && settings.cascadeLevel2Values !== null
      && !isStrArr(settings.cascadeLevel2Values, 200, 50)) return false;
  if (settings.cascadeLevel3Values !== undefined && settings.cascadeLevel3Values !== null
      && !isStrArr(settings.cascadeLevel3Values, 200, 50)) return false;
  /* v1.7.0 D128 — State Rollup validation. */
  // stateRollupOrder: array<string ≤200>, max 50, all unique
  if (settings.stateRollupOrder !== undefined && settings.stateRollupOrder !== null) {
    if (!isStrArr(settings.stateRollupOrder, 200, 50)) return false;
    var srSeen = {};
    for (var sro = 0; sro < settings.stateRollupOrder.length; sro++) {
      if (srSeen[settings.stateRollupOrder[sro]]) return false;
      srSeen[settings.stateRollupOrder[sro]] = true;
    }
  }
  // stateRollupResolvedStates: array<string ≤200>, max 20
  if (settings.stateRollupResolvedStates !== undefined && settings.stateRollupResolvedStates !== null
      && !isStrArr(settings.stateRollupResolvedStates, 200, 20)) return false;
  // stateRollupFloor: string|null ≤200, must be ∈ stateRollupOrder if order is set
  if (settings.stateRollupFloor !== undefined && settings.stateRollupFloor !== null) {
    if (!assertStr(settings.stateRollupFloor, 200)) return false;
    if (Array.isArray(settings.stateRollupOrder)
        && settings.stateRollupOrder.indexOf(settings.stateRollupFloor) < 0) return false;
  }
  // stateRollupStrategy: enum, v1.7.0 accepts only 'min'
  if (settings.stateRollupStrategy !== undefined && settings.stateRollupStrategy !== null) {
    if (settings.stateRollupStrategy !== 'min') return false;
  }
  /* v1.9.0 D132 — Stand-up assist: standupDoneStates — array<string ≤200>, max 50, unique. */
  if (settings.standupDoneStates !== undefined && settings.standupDoneStates !== null) {
    if (!isStrArr(settings.standupDoneStates, 200, 50)) return false;
    var sdsSeen = {};
    for (var sds = 0; sds < settings.standupDoneStates.length; sds++) {
      if (sdsSeen[settings.standupDoneStates[sds]]) return false;
      sdsSeen[settings.standupDoneStates[sds]] = true;
    }
  }
  /* 68-7 — standupHiddenStates: состояния бандла, скрытые из секций стендапа (вместе
     с их задачами). Контракт зеркалит standupDoneStates: array<string ≤200>, max 50, unique. */
  if (settings.standupHiddenStates !== undefined && settings.standupHiddenStates !== null) {
    if (!isStrArr(settings.standupHiddenStates, 200, 50)) return false;
    var shsSeen = {};
    for (var shs = 0; shs < settings.standupHiddenStates.length; shs++) {
      if (shsSeen[settings.standupHiddenStates[shs]]) return false;
      shsSeen[settings.standupHiddenStates[shs]] = true;
    }
  }
  /* 68-7 — standupStateRoles: маппинг «состояние → роли» для per-role фильтра секций
     стендапа. Контракт 1:1 с backlogZones (#21): [{ state:string≤200 (required, unique),
     roles:array<roleKey ∈ ROLE_KEYS> }], max 50. Порядка не несёт (порядок секций —
     из бандла state-поля). */
  if (settings.standupStateRoles !== undefined && settings.standupStateRoles !== null) {
    if (!Array.isArray(settings.standupStateRoles) || settings.standupStateRoles.length > 50) return false;
    var srSeen = {};
    for (var sr = 0; sr < settings.standupStateRoles.length; sr++) {
      var srRow = settings.standupStateRoles[sr];
      if (!srRow || typeof srRow !== 'object') return false;
      if (!assertStr(srRow.state, 200) || !srRow.state) return false;   // state required, non-empty ≤200
      if (srSeen[srRow.state]) return false;                            // unique state
      srSeen[srRow.state] = true;
      if (!Array.isArray(srRow.roles) || srRow.roles.length > ROLE_KEYS.length) return false;
      for (var srr = 0; srr < srRow.roles.length; srr++) {
        if (ROLE_KEYS.indexOf(srRow.roles[srr]) < 0) return false;      // each role ∈ ROLE_KEYS
      }
    }
  }
  /* #21 — модуль «Работа с бэклогом» (additive optional).
     backlogZones — упорядоченный пайплайн зон [{ state:string≤200 (required, unique),
     roles:array<roleKey ∈ ROLE_KEYS> (MANY) }], max 50. Стартовая (Заказчик) и resolved
     (Закрыто) зоны — производные, здесь не хранятся (§4/§6.1 спеки). */
  if (settings.backlogZones !== undefined && settings.backlogZones !== null) {
    if (!Array.isArray(settings.backlogZones) || settings.backlogZones.length > 50) return false;
    var bzSeen = {};
    for (var bz = 0; bz < settings.backlogZones.length; bz++) {
      var zone = settings.backlogZones[bz];
      if (!zone || typeof zone !== 'object') return false;
      if (!assertStr(zone.state, 200) || !zone.state) return false;   // state required, non-empty ≤200
      if (bzSeen[zone.state]) return false;                           // unique state
      bzSeen[zone.state] = true;
      if (!Array.isArray(zone.roles) || zone.roles.length > ROLE_KEYS.length) return false;
      for (var zr = 0; zr < zone.roles.length; zr++) {
        if (ROLE_KEYS.indexOf(zone.roles[zr]) < 0) return false;      // each role ∈ ROLE_KEYS
      }
    }
  }
  /* #21 — backlogStartStates / backlogTypeFilter / backlogPauseTags / backlogPauseStates:
     array<string ≤200>, max 50. */
  var backlogStrArrKeys = ['backlogStartStates','backlogTypeFilter','backlogPauseTags','backlogPauseStates'];
  for (var ba = 0; ba < backlogStrArrKeys.length; ba++) {
    var bav = settings[backlogStrArrKeys[ba]];
    if (bav !== undefined && bav !== null && !isStrArr(bav, 200, 50)) return false;
  }
  /* #48 R1 — Релиз-менеджмент. releaseEnabled — bool; group-пары *Groups/*Names — str[]
     (ids ≤200, names ≤500); releaseStatusStateMapping — { <status ∈ RELEASE_STATUS_KEYS> →
     <target state str≤200> }. Зоны светофора R3 — авто по State, своих ключей нет. */
  if (settings.releaseEnabled !== undefined && settings.releaseEnabled !== null
      && typeof settings.releaseEnabled !== 'boolean') return false;
  var relIdArrKeys = ['releaseCandidateManagerGroups','releaseCandidateEngineerGroups',
    'releaseManagerGroups','releaseEngineerGroups',
    'sprintLockGroups' /* #57-2 */];
  for (var rg = 0; rg < relIdArrKeys.length; rg++) {
    var rgv = settings[relIdArrKeys[rg]];
    if (rgv !== undefined && rgv !== null && !isStrArr(rgv, 200, 100)) return false;
  }
  var relNameArrKeys = ['releaseCandidateManagerGroupNames','releaseCandidateEngineerGroupNames',
    'releaseManagerGroupNames','releaseEngineerGroupNames',
    'sprintLockGroupNames' /* #57-2 */];
  for (var rn = 0; rn < relNameArrKeys.length; rn++) {
    var rnv = settings[relNameArrKeys[rn]];
    if (rnv !== undefined && rnv !== null && !isStrArr(rnv, 500, 100)) return false;
  }
  if (settings.releaseStatusStateMapping !== undefined && settings.releaseStatusStateMapping !== null) {
    var rmap = settings.releaseStatusStateMapping;
    if (typeof rmap !== 'object' || Array.isArray(rmap)) return false;
    var RELEASE_STATUS_KEYS = ['planned','prep','work','released','cancelled'];
    var rmk = Object.keys(rmap);
    for (var rm = 0; rm < rmk.length; rm++) {
      if (RELEASE_STATUS_KEYS.indexOf(rmk[rm]) < 0) return false;      // key ∈ хранимые статусы
      if (!assertStr(rmap[rmk[rm]], 200)) return false;               // target state name str≤200|null
    }
  }
  /* #55 — releaseTagMapping: { <status ∈ RELEASE_STATUS_KEYS> → <имя тега str≤200|null> },
     форма идентична releaseStatusStateMapping. */
  if (settings.releaseTagMapping !== undefined && settings.releaseTagMapping !== null) {
    var tmap = settings.releaseTagMapping;
    if (typeof tmap !== 'object' || Array.isArray(tmap)) return false;
    var TAG_STATUS_KEYS = ['planned','prep','work','released','cancelled'];
    var tmk = Object.keys(tmap);
    for (var tm = 0; tm < tmk.length; tm++) {
      if (TAG_STATUS_KEYS.indexOf(tmk[tm]) < 0) return false;
      if (!assertStr(tmap[tmk[tm]], 200)) return false;
    }
  }
  /* #50 — Оперативная отчётность. reportingEnabled — bool; reporting-access группы —
     str[] (ids ≤200, names ≤500), как release-группы. Пороги/паузы — со своими
     потребителями (S1c+), здесь пока не валидируются. */
  if (settings.reportingEnabled !== undefined && settings.reportingEnabled !== null
      && typeof settings.reportingEnabled !== 'boolean') return false;
  /* v3.9.0 — reportingShowSystem: тумблер «Система» в отчётах (bool, дефолт ON на фронте). */
  if (settings.reportingShowSystem !== undefined && settings.reportingShowSystem !== null
      && typeof settings.reportingShowSystem !== 'boolean') return false;
  var repIdArrKeys = ['reportingGroupsA','reportingGroupsB'];
  for (var rpg = 0; rpg < repIdArrKeys.length; rpg++) {
    var rpgv = settings[repIdArrKeys[rpg]];
    if (rpgv !== undefined && rpgv !== null && !isStrArr(rpgv, 200, 100)) return false;
  }
  var repNameArrKeys = ['reportingGroupsANames','reportingGroupsBNames'];
  for (var rpn = 0; rpn < repNameArrKeys.length; rpn++) {
    var rpnv = settings[repNameArrKeys[rpn]];
    if (rpnv !== undefined && rpnv !== null && !isStrArr(rpnv, 500, 100)) return false;
  }
  /* #50 S1c — reportingThresholds: { <state str≤200> → { yellow:num|null, red:num|null } } —
     порог aging A7 на статус (рабочих дней). ≤100 статусов; yellow/red в 0..10000. */
  if (settings.reportingThresholds !== undefined && settings.reportingThresholds !== null) {
    var rt = settings.reportingThresholds;
    if (typeof rt !== 'object' || Array.isArray(rt)) return false;
    var rtk = Object.keys(rt);
    if (rtk.length > 100) return false;
    for (var rti = 0; rti < rtk.length; rti++) {
      if (typeof rtk[rti] !== 'string' || !rtk[rti] || rtk[rti].length > 200) return false;
      var band = rt[rtk[rti]];
      if (!band || typeof band !== 'object' || Array.isArray(band)) return false;
      var bandKeys = Object.keys(band);   /* ревью #50: посторонние вложенные ключи не персистим */
      for (var bki = 0; bki < bandKeys.length; bki++) { if (bandKeys[bki] !== 'yellow' && bandKeys[bki] !== 'red') return false; }
      if (band.yellow !== undefined && band.yellow !== null && !isNumInRange(band.yellow, 0, 10000)) return false;
      if (band.red !== undefined && band.red !== null && !isNumInRange(band.red, 0, 10000)) return false;
    }
  }
  /* #50 S2 — reportingTargetStatuses: str[] (имена статусов ≤200, ≤100) — целевые статусы A1. */
  if (settings.reportingTargetStatuses !== undefined && settings.reportingTargetStatuses !== null
      && !isStrArr(settings.reportingTargetStatuses, 200, 100)) return false;
  /* #50 S4 — reportingFlowStates: str[] (имена статусов ≤200, ≤100) — УПОРЯДОЧЕННЫЙ поток
     (порядок = последовательность статусов). Кормит A8 (порядок баров/WIP) и A9 (обратность). */
  if (settings.reportingFlowStates !== undefined && settings.reportingFlowStates !== null
      && !isStrArr(settings.reportingFlowStates, 200, 100)) return false;
  /* #50 S2 — reportingStatusLabels: { <state str≤200> → <label str≤200> } (≤100) — ярлык A1. */
  if (settings.reportingStatusLabels !== undefined && settings.reportingStatusLabels !== null) {
    var rsl = settings.reportingStatusLabels;
    if (typeof rsl !== 'object' || Array.isArray(rsl)) return false;
    var rslk = Object.keys(rsl);
    if (rslk.length > 100) return false;
    for (var rsi = 0; rsi < rslk.length; rsi++) {
      if (typeof rslk[rsi] !== 'string' || !rslk[rsi] || rslk[rsi].length > 200) return false;
      if (typeof rsl[rslk[rsi]] !== 'string' || rsl[rslk[rsi]].length > 200) return false;
    }
  }
  /* #50 S3a — reportingAnchors: { <metric в lead|team|cycle> → { start, end } } — пары
     якорей TTM. start/end — опциональные имена состояний (str≤200|null); метрика считается
     только при обоих концах. Метрик-ключи фиксированы (⊆ [lead,team,cycle]). */
  if (settings.reportingAnchors !== undefined && settings.reportingAnchors !== null) {
    var ra = settings.reportingAnchors;
    if (typeof ra !== 'object' || Array.isArray(ra)) return false;
    var raAllowed = ['lead','team','cycle'];
    var rak = Object.keys(ra);
    for (var rai = 0; rai < rak.length; rai++) {
      if (raAllowed.indexOf(rak[rai]) < 0) return false;
      var pair = ra[rak[rai]];
      if (!pair || typeof pair !== 'object' || Array.isArray(pair)) return false;
      var pairKeys = Object.keys(pair);   /* ревью #50: посторонние вложенные ключи не персистим */
      for (var pki = 0; pki < pairKeys.length; pki++) { if (pairKeys[pki] !== 'start' && pairKeys[pki] !== 'end') return false; }
      if (!assertStr(pair.start, 200)) return false;   // start str≤200|null (опционально)
      if (!assertStr(pair.end, 200)) return false;      // end   str≤200|null (опционально)
    }
  }
  /* #50 S3a — reportingTtmNorms: { lead|team → int|null } — нормативы TTM в раб. днях
     (Cycle норматива не имеет). Ключи фиксированы (⊆ [lead,team]); значение 0..10000|null. */
  if (settings.reportingTtmNorms !== undefined && settings.reportingTtmNorms !== null) {
    var rtn = settings.reportingTtmNorms;
    if (typeof rtn !== 'object' || Array.isArray(rtn)) return false;
    var rtnAllowed = ['lead','team'];
    var rtnk = Object.keys(rtn);
    for (var rtni = 0; rtni < rtnk.length; rtni++) {
      if (rtnAllowed.indexOf(rtnk[rtni]) < 0) return false;
      var rtnv = rtn[rtnk[rtni]];
      if (rtnv !== undefined && rtnv !== null && !isNumInRange(rtnv, 0, 10000)) return false;
    }
  }
  /* #50 v3.2.0 — reportingTerminalPolicy: терминальная политика A2 при reopen (US-A2-02).
     Enum 'first-close'|'last-stable-close' (|null → дефолт first-close на фронте). */
  if (settings.reportingTerminalPolicy !== undefined && settings.reportingTerminalPolicy !== null
      && ['first-close', 'last-stable-close'].indexOf(settings.reportingTerminalPolicy) < 0) return false;
  /* #50 S5b — reportingVariancePct: порог |расхождения| план-факт (%, num 0..10000|null). */
  if (settings.reportingVariancePct !== undefined && settings.reportingVariancePct !== null
      && !isNumInRange(settings.reportingVariancePct, 0, 10000)) return false;
  /* #50 D10 — reportingTimeoutSec: таймаут-бэкстоп прогона отчёта (сек, num 5..3600|null). */
  if (settings.reportingTimeoutSec !== undefined && settings.reportingTimeoutSec !== null
      && !isNumInRange(settings.reportingTimeoutSec, 5, 3600)) return false;
  /* v3.12.0 (#11) — reportingVelocityWindow: окно среднего A11 Velocity (закрытые спринты, num 1..10|null). */
  if (settings.reportingVelocityWindow !== undefined && settings.reportingVelocityWindow !== null
      && !isNumInRange(settings.reportingVelocityWindow, 1, 10)) return false;
  /* #58-5 шаг 2 — reportingMaxIssues: потолок задач среза A3/A6/B1/B0 (num 200..5000|null). */
  if (settings.reportingMaxIssues !== undefined && settings.reportingMaxIssues !== null
      && !isNumInRange(settings.reportingMaxIssues, 200, 5000)) return false;
  /* #50 S7a — reportingSpilloverAgeBands: { warm|hot → int 1..1000|null } — пороги «возраста хвоста»
     A10 (подряд спринтов не-done): warm→жёлтый бэйдж, hot→красный. Ключи фиксированы (⊆ [warm,hot]). */
  if (settings.reportingSpilloverAgeBands !== undefined && settings.reportingSpilloverAgeBands !== null) {
    var rsab = settings.reportingSpilloverAgeBands;
    if (typeof rsab !== 'object' || Array.isArray(rsab)) return false;
    var rsabAllowed = ['warm', 'hot'];
    var rsabk = Object.keys(rsab);
    for (var rsabi = 0; rsabi < rsabk.length; rsabi++) {
      if (rsabAllowed.indexOf(rsabk[rsabi]) < 0) return false;
      var rsabv = rsab[rsabk[rsabi]];
      if (rsabv !== undefined && rsabv !== null && !isNumInRange(rsabv, 1, 1000)) return false;
    }
  }
  /* #50 S6a — reportingA3StageField/OrgField/PriorityField: имена YT-полей бизнес-колонок A3
     (str≤200|null, опц.). Пустое/отсутствует → колонка не рендерится (graceful-degrade). */
  var repA3Fields = ['reportingA3StageField', 'reportingA3OrgField', 'reportingA3PriorityField'];
  for (var r3f = 0; r3f < repA3Fields.length; r3f++) {
    if (!assertStr(settings[repA3Fields[r3f]], 200)) return false;
  }
  /* #50 S8a — reportingThousandTag: имя YT-тега мелких задач B3 (str≤200|null, опц.). Пусто → B3 показывает подсказку. */
  if (!assertStr(settings.reportingThousandTag, 200)) return false;
  /* #50 S8b — reportingTechDebtType/Tag: отбор техдолга B1 = значение типа задачи ИЛИ имя тега (str≤200|null, опц., одно из двух). */
  if (!assertStr(settings.reportingTechDebtType, 200)) return false;
  if (!assertStr(settings.reportingTechDebtTag, 200)) return false;
  /* #50 S8c — reportingBugType: значение типа задачи-бага B2 (str≤200|null, опц.). Пусто → B2 подсказка. */
  if (!assertStr(settings.reportingBugType, 200)) return false;
  /* #50 S8c — reportingLinkTypes: имена типов связей баг→фича (str[] ≤200/≤100, опц.). Пусто → B2 подсказка. */
  if (settings.reportingLinkTypes !== undefined && settings.reportingLinkTypes !== null
      && !isStrArr(settings.reportingLinkTypes, 200, 100)) return false;
  /* #50 S6b — reportingRoleMonthlyCapacity: { <roleKey str≤200> → ч/мес num 0..100000|null } —
     месячная ёмкость роли для A6 (знаменатель «месяцев»). ≤50 ролей; значение опц. */
  if (settings.reportingRoleMonthlyCapacity !== undefined && settings.reportingRoleMonthlyCapacity !== null) {
    var rmc = settings.reportingRoleMonthlyCapacity;
    if (typeof rmc !== 'object' || Array.isArray(rmc)) return false;
    var rmck = Object.keys(rmc);
    if (rmck.length > 50) return false;
    for (var rmi = 0; rmi < rmck.length; rmi++) {
      if (typeof rmck[rmi] !== 'string' || !rmck[rmi] || rmck[rmi].length > 200) return false;
      var rmv = rmc[rmck[rmi]];
      if (rmv !== undefined && rmv !== null && !isNumInRange(rmv, 0, 100000)) return false;
    }
  }
  /* #50 S3a — reportingPauseMarkers: { states:[str≤200 ≤100], tags:[str≤200 ≤100] } —
     маркеры пауз (статусы/теги); интервал вычитается из TTM. */
  if (settings.reportingPauseMarkers !== undefined && settings.reportingPauseMarkers !== null) {
    var rpm = settings.reportingPauseMarkers;
    if (typeof rpm !== 'object' || Array.isArray(rpm)) return false;
    var rpmKeys = Object.keys(rpm);   /* ревью #50: посторонние вложенные ключи не персистим */
    for (var rpmi = 0; rpmi < rpmKeys.length; rpmi++) { if (rpmKeys[rpmi] !== 'states' && rpmKeys[rpmi] !== 'tags') return false; }
    if (rpm.states !== undefined && rpm.states !== null && !isStrArr(rpm.states, 200, 100)) return false;
    if (rpm.tags !== undefined && rpm.tags !== null && !isStrArr(rpm.tags, 200, 100)) return false;
  }
  return true;
}

/* v1.6.0 D125 — History validator split: ForWrite (strict) + ForRead (tolerant). */
function _validateHistoryRecord(h, i, strict) {
  if (!h || typeof h !== 'object') return false;
  var hKeys = Object.keys(h);
  for (var hk = 0; hk < hKeys.length; hk++) {
    var k = hKeys[hk];
    if (ALLOWED_HISTORY_SNAP_KEYS.indexOf(k) < 0 && !/^(resource|remain)[A-Za-z0-9_]*$/.test(k)) {
      if (strict) return false;
      _appendMigrationLog(h, { at: Date.now(), level: 'WARN_UNKNOWN_KEY',
        fromVersion: h.pluginVersion || 'unset', toVersion: CURRENT_PLUGIN_VERSION, key: k });
    }
  }
  var hStrFields = ['sprintId','name','roleLabel','confirmedBy','finishedBy','sprintFieldVal','versionFieldVal'];
  for (var fi = 0; fi < hStrFields.length; fi++) {
    if (!assertStr(h[hStrFields[fi]], 500)) return false;
  }
  if (h.status !== undefined && h.status !== null) {
    if (typeof h.status !== 'string' || STATUS_CODES.indexOf(h.status) < 0) return false;
  }
  if (h.roleKey !== undefined && h.roleKey !== null) {
    if (typeof h.roleKey !== 'string' || ROLE_KEYS.indexOf(h.roleKey) < 0) return false;
  }
  if (!assertNum(h.confirmedAt)) return false;
  if (!assertNum(h.dateStart))   return false;
  if (!assertNum(h.dateEnd))     return false;
  if (!assertNum(h.finishedAt))  return false;
  if (h.isOverLimit !== undefined && h.isOverLimit !== null
      && typeof h.isOverLimit !== 'boolean') return false;
  for (var dk = 0; dk < hKeys.length; dk++) {
    var dn = hKeys[dk];
    if (/^(resource|remain)[A-Za-z0-9_]*$/.test(dn)) {
      var dv = h[dn];
      if (dv !== null && dv !== undefined && (!assertNum(dv) || dv < -1e8 || dv > 1e8)) return false;
    }
  }
  if (h.settings !== undefined && h.settings !== null) {
    if (typeof h.settings !== 'object') return false;
    if (!validateSettings(h.settings)) return false;
  }
  if (h.items !== undefined && h.items !== null) {
    if (!Array.isArray(h.items)) return false;
    if (h.items.length > 1000) return false;
    for (var j = 0; j < h.items.length; j++) {
      if (!validateItem(h.items[j])) return false;
    }
  }
  if (h.personalPlanning !== undefined && h.personalPlanning !== null
      && typeof h.personalPlanning !== 'object') return false;
  if (h.hasWorkingCopy !== undefined && h.hasWorkingCopy !== null
      && typeof h.hasWorkingCopy !== 'boolean') return false;
  if (h.revisions !== undefined && h.revisions !== null) {
    if (!Array.isArray(h.revisions)) return false;
    if (h.revisions.length > 1000) return false;
    for (var ri = 0; ri < h.revisions.length; ri++) {
      var rv = h.revisions[ri];
      if (!rv || typeof rv !== 'object') return false;
      if (!assertNum(rv.at)) return false;
      if (!assertStr(rv.by, 200)) return false;
      if (typeof rv.level !== 'string' || ALLOWED_REVISION_LEVELS.indexOf(rv.level) < 0) return false;
    }
  }
  /* v1.9.0 D132 — Sprint goals fields on history snapshot. */
  if (h.sprintGoal !== undefined && h.sprintGoal !== null) {
    if (!assertStr(h.sprintGoal, 500)) return false;
  }
  if (h.goalOutcome !== undefined && h.goalOutcome !== null) {
    if (typeof h.goalOutcome !== 'string' || ['achieved','partial','missed'].indexOf(h.goalOutcome) < 0) return false;
  }
  if (h.goalRetroNote !== undefined && h.goalRetroNote !== null) {
    if (!assertStr(h.goalRetroNote, 1000)) return false;
  }
  if (!validateSprintRoles(h.roles)) return false;   /* v3.27.0 #73 */
  if (validateMigrationLog(h.migrationLog, 'history[' + i + ']') !== null) return false;
  if (!validatePluginVersion(h.pluginVersion)) return false;
  return true;
}

function validateHistoryForWrite(history) {
  if (!Array.isArray(history)) return false;
  if (history.length > 500) return false;
  for (var i = 0; i < history.length; i++) {
    if (!_validateHistoryRecord(history[i], i, true)) return false;
  }
  return true;
}

/* v1.8.0 D130 — Диагностическая обертка над validateHistoryForWrite.
   Возвращает { ok: bool, where: string, idx: number } — для error response
   в POST /history, чтобы можно было понять где конкретно упала валидация. */
function diagnoseHistoryWrite(history) {
  if (!Array.isArray(history)) return { ok: false, where: 'not an array', idx: -1 };
  if (history.length > 500) return { ok: false, where: 'too many records', idx: -1 };
  for (var i = 0; i < history.length; i++) {
    var h = history[i];
    if (!h || typeof h !== 'object') return { ok: false, where: 'not object', idx: i };
    var hKeys = Object.keys(h);
    for (var hk = 0; hk < hKeys.length; hk++) {
      var k = hKeys[hk];
      if (ALLOWED_HISTORY_SNAP_KEYS.indexOf(k) < 0 && !/^(resource|remain)[A-Za-z0-9_]*$/.test(k)) {
        return { ok: false, where: 'unknown_top_key:' + k, idx: i };
      }
    }
    var hStrFields = ['sprintId','name','roleLabel','confirmedBy','finishedBy','sprintFieldVal','versionFieldVal'];
    for (var fi = 0; fi < hStrFields.length; fi++) {
      if (!assertStr(h[hStrFields[fi]], 500)) {
        return { ok: false, where: 'str_field:' + hStrFields[fi] + ' type=' + typeof h[hStrFields[fi]] + ' len=' + (h[hStrFields[fi]] && h[hStrFields[fi]].length), idx: i };
      }
    }
    if (h.status !== undefined && h.status !== null) {
      if (typeof h.status !== 'string' || STATUS_CODES.indexOf(h.status) < 0) {
        return { ok: false, where: 'status_invalid:' + h.status, idx: i };
      }
    }
    if (h.roleKey !== undefined && h.roleKey !== null) {
      if (typeof h.roleKey !== 'string' || ROLE_KEYS.indexOf(h.roleKey) < 0) {
        return { ok: false, where: 'roleKey_invalid:' + h.roleKey, idx: i };
      }
    }
    if (!assertNum(h.confirmedAt)) return { ok: false, where: 'confirmedAt_invalid:' + typeof h.confirmedAt, idx: i };
    if (!assertNum(h.dateStart))   return { ok: false, where: 'dateStart_invalid:' + typeof h.dateStart, idx: i };
    if (!assertNum(h.dateEnd))     return { ok: false, where: 'dateEnd_invalid:' + typeof h.dateEnd, idx: i };
    if (!assertNum(h.finishedAt))  return { ok: false, where: 'finishedAt_invalid:' + typeof h.finishedAt, idx: i };
    // v1.8.1 — добавлены проверки которых не было: isOverLimit / resource*-remain* / personalPlanning / hasWorkingCopy / revisions.
    if (h.isOverLimit !== undefined && h.isOverLimit !== null && typeof h.isOverLimit !== 'boolean') {
      return { ok: false, where: 'isOverLimit_invalid:' + typeof h.isOverLimit + '=' + h.isOverLimit, idx: i };
    }
    for (var dk = 0; dk < hKeys.length; dk++) {
      var dn = hKeys[dk];
      if (/^(resource|remain)[A-Za-z0-9_]*$/.test(dn)) {
        var dv = h[dn];
        if (dv !== null && dv !== undefined && (!assertNum(dv) || dv < -1e8 || dv > 1e8)) {
          return { ok: false, where: 'resource/remain_invalid:' + dn + '=' + JSON.stringify(dv) + ' type=' + typeof dv, idx: i };
        }
      }
    }
    if (h.settings !== undefined && h.settings !== null) {
      if (typeof h.settings !== 'object') return { ok: false, where: 'settings_not_object', idx: i };
      if (!validateSettings(h.settings)) {
        // Подробнее: какой именно ключ settings упал?
        var sKeys = Object.keys(h.settings);
        for (var sk = 0; sk < sKeys.length; sk++) {
          if (ALLOWED_SETTINGS_KEYS.indexOf(sKeys[sk]) < 0) {
            return { ok: false, where: 'settings_unknown_key:' + sKeys[sk], idx: i };
          }
        }
        return { ok: false, where: 'settings_validation_failed', idx: i };
      }
    }
    if (h.items !== undefined && h.items !== null) {
      if (!Array.isArray(h.items)) return { ok: false, where: 'items_not_array', idx: i };
      if (h.items.length > 1000) return { ok: false, where: 'items_too_many', idx: i };
      for (var j = 0; j < h.items.length; j++) {
        if (!validateItem(h.items[j])) {
          var item = h.items[j];
          var itemKeys = item ? Object.keys(item) : [];
          var badKey = null;
          for (var ik = 0; ik < itemKeys.length; ik++) {
            var ik_k = itemKeys[ik];
            if (ALLOWED_ITEM_KEYS.indexOf(ik_k) < 0 && !/^(estimate_|fact_|alloc_|allocation|estH_|factH_)/.test(ik_k)) {
              badKey = ik_k;
              break;
            }
          }
          return { ok: false, where: 'item[' + j + ']_invalid' + (badKey ? ' bad_key=' + badKey : ' issueId=' + (item && item.issueId)), idx: i };
        }
      }
    }
    if (h.personalPlanning !== undefined && h.personalPlanning !== null && typeof h.personalPlanning !== 'object') {
      return { ok: false, where: 'personalPlanning_not_object:' + typeof h.personalPlanning, idx: i };
    }
    if (h.hasWorkingCopy !== undefined && h.hasWorkingCopy !== null && typeof h.hasWorkingCopy !== 'boolean') {
      return { ok: false, where: 'hasWorkingCopy_invalid:' + typeof h.hasWorkingCopy + '=' + h.hasWorkingCopy, idx: i };
    }
    if (h.revisions !== undefined && h.revisions !== null) {
      if (!Array.isArray(h.revisions)) return { ok: false, where: 'revisions_not_array', idx: i };
      if (h.revisions.length > 1000)   return { ok: false, where: 'revisions_too_many', idx: i };
      for (var ri = 0; ri < h.revisions.length; ri++) {
        var rv = h.revisions[ri];
        if (!rv || typeof rv !== 'object')   return { ok: false, where: 'revisions[' + ri + ']_not_object', idx: i };
        if (!assertNum(rv.at))               return { ok: false, where: 'revisions[' + ri + '].at_invalid:' + typeof rv.at, idx: i };
        if (!assertStr(rv.by, 200))          return { ok: false, where: 'revisions[' + ri + '].by_invalid:' + typeof rv.by + ' len=' + (rv.by && rv.by.length), idx: i };
        if (typeof rv.level !== 'string' || ALLOWED_REVISION_LEVELS.indexOf(rv.level) < 0) {
          return { ok: false, where: 'revisions[' + ri + '].level_invalid:' + rv.level, idx: i };
        }
      }
    }
    if (!validatePluginVersion(h.pluginVersion)) return { ok: false, where: 'pluginVersion_invalid:' + h.pluginVersion + ' type=' + typeof h.pluginVersion, idx: i };
    var migErr = validateMigrationLog(h.migrationLog, 'history[' + i + ']');
    if (migErr !== null) return { ok: false, where: 'migrationLog_invalid: ' + migErr, idx: i };
    /* v1.9.0 D132 — Sprint goals fields. */
    if (h.sprintGoal !== undefined && h.sprintGoal !== null && !assertStr(h.sprintGoal, 500)) {
      return { ok: false, where: 'sprintGoal_invalid: len=' + (h.sprintGoal && h.sprintGoal.length), idx: i };
    }
    if (h.goalOutcome !== undefined && h.goalOutcome !== null) {
      if (typeof h.goalOutcome !== 'string' || ['achieved','partial','missed'].indexOf(h.goalOutcome) < 0) {
        return { ok: false, where: 'goalOutcome_invalid:' + h.goalOutcome, idx: i };
      }
    }
    if (!validateSprintRoles(h.roles)) {
      return { ok: false, where: 'roles_invalid:' + JSON.stringify(h.roles), idx: i };   /* v3.27.0 #73 */
    }
    if (h.goalRetroNote !== undefined && h.goalRetroNote !== null && !assertStr(h.goalRetroNote, 1000)) {
      return { ok: false, where: 'goalRetroNote_invalid: len=' + (h.goalRetroNote && h.goalRetroNote.length), idx: i };
    }
  }
  return { ok: true, where: null, idx: -1 };
}

function validateHistoryForRead(history) {
  if (!Array.isArray(history)) return false;
  if (history.length > 500) return false;
  for (var i = 0; i < history.length; i++) {
    if (!_validateHistoryRecord(history[i], i, false)) return false;
  }
  return true;
}

/* v1.6.0 D125 — WorkingDraft validator split: ForWrite (strict) + ForRead (tolerant). */
function _validateWorkingDraftBody(d, strict) {
  if (!d || typeof d !== 'object') return false;
  var keys = Object.keys(d);
  for (var i = 0; i < keys.length; i++) {
    if (ALLOWED_WORKING_DRAFT_KEYS.indexOf(keys[i]) < 0) {
      if (strict) return false;
      _appendMigrationLog(d, { at: Date.now(), level: 'WARN_UNKNOWN_KEY',
        fromVersion: d.pluginVersion || 'unset', toVersion: CURRENT_PLUGIN_VERSION, key: keys[i] });
    }
  }
  if (typeof d.key !== 'string' || d.key.length === 0 || d.key.length > 200) return false;
  if (!assertNum(d.createdAt) || d.createdAt === null) return false;
  if (!assertNum(d.updatedAt) || d.updatedAt === null) return false;
  if (!assertStr(d.editorLogin,    200)) return false;
  if (!assertStr(d.editorTabToken, 200)) return false;
  if (!assertStr(d.baseSnapshotHash, 100)) return false;
  if (d.baseStatusAtOpen !== undefined && d.baseStatusAtOpen !== null) {
    if (typeof d.baseStatusAtOpen !== 'string' || STATUS_CODES.indexOf(d.baseStatusAtOpen) < 0) return false;
  }
  if (d.schemaVersion !== undefined && d.schemaVersion !== null && !assertNum(d.schemaVersion)) return false;
  if (d.sprint !== undefined && d.sprint !== null) {
    if (strict) { if (!validateSprintForWrite(d.sprint)) return false; }
    else        { if (!validateSprintForRead(d.sprint))  return false; }
  }
  if (d.items !== undefined && d.items !== null) {
    if (!Array.isArray(d.items)) return false;
    if (d.items.length > 1000) return false;
    for (var j = 0; j < d.items.length; j++) {
      if (!validateItem(d.items[j])) return false;
    }
  }
  if (d.personalPlanning !== undefined && d.personalPlanning !== null
      && typeof d.personalPlanning !== 'object') return false;
  if (d.revisions !== undefined && d.revisions !== null) {
    if (!Array.isArray(d.revisions)) return false;
    if (d.revisions.length > 1000) return false;
    for (var ri = 0; ri < d.revisions.length; ri++) {
      var rv = d.revisions[ri];
      if (!rv || typeof rv !== 'object') return false;
      if (!assertNum(rv.at)) return false;
      if (!assertStr(rv.by, 200)) return false;
      if (typeof rv.level !== 'string' || ALLOWED_REVISION_LEVELS.indexOf(rv.level) < 0) return false;
    }
  }
  if (!validatePluginVersion(d.pluginVersion)) return false;
  return true;
}

function validateWorkingDraftForWrite(d) { return _validateWorkingDraftBody(d, true); }
function validateWorkingDraftForRead(d)  { return _validateWorkingDraftBody(d, false); }

// ─── Аутентификация и авторизация ────────────────────────────────────────────

/**
 * Проверяет, что ctx.currentUser не пустой.
 * Defense-in-depth: реальный YouTrack httpHandler не пускает анонимов до handle,
 * но проверка защищает от регрессий и delegation-сценариев.
 */
function isAuthenticated(ctx) {
  try {
    var u = ctx && ctx.currentUser;
    return !!(u && (u.id || u.login));
  } catch (e) { return false; }
}

/**
 * #51 — инстанс-админ: глобальная роль «Администратор проектов» или «Системный
 * администратор» = полный байпас ролевой модели планера по всем проектам.
 * hasPermission БЕЗ project-аргумента = проверка ГЛОБАЛЬНОЙ роли (YT ≥2025.3) —
 * per-project админ сюда НЕ проходит. Ключ UPDATE_PROJECT — пересечение обеих
 * целевых ролей (Hub: jetbrains.jetpass.project-update есть и у system-admin,
 * и у project-admin). Байпас НЕ ослабляет read-gate backend-global, rev-lock
 * #56-4 и updatedBy-штампы (действия админа атрибутируются его логином).
 * Fail-closed; кэш на ctx — ролевые хелперы зовутся по нескольку раз на запрос.
 */
function isInstanceAdmin(ctx) {
  try {
    if (typeof ctx.__instanceAdminCached === 'boolean') return ctx.__instanceAdminCached;
    var u = ctx && ctx.currentUser;
    var ok = !!(u && typeof u.hasPermission === 'function' && u.hasPermission('UPDATE_PROJECT'));
    try { ctx.__instanceAdminCached = ok; } catch (e2) { /* ctx без записи — живём без кэша */ }
    return ok;
  } catch (e) { return false; }
}

/**
 * Проверяет, задана ли settingsManagerGroup в app-settings (ctx.settings).
 * Это «Source of Truth» для всей системы прав плагина:
 *   - settingsManagerGroup ХРАНИТСЯ ТОЛЬКО в app-settings (settings.json),
 *     задаётся админом проекта через Project Settings → Apps → Sprint Planner.
 *   - Никогда не читается из тела запроса или ssp_settings.
 *   - Если не задана — плагин в режиме «не настроен» (deny-by-default везде).
 */
function isSettingsManagerConfigured(ctx) {
  try {
    var g = ctx && ctx.settings && ctx.settings.settingsManagerGroup;
    if (!g) return false;
    /* v1.8.3 — settings.json теперь использует x-entity:UserGroup picker (тип object).
       Поддерживаем оба варианта для обратной совместимости с инсталляциями,
       где значение было сохранено как строка (legacy text-input). */
    if (typeof g === 'string') return g.trim().length > 0;
    if (typeof g === 'object') return !!(g.name || g.id);
    return false;
  } catch (e) { return false; }
}

// ─── Проверка групп пользователя (общая функция) ─────────────────────────────

/**
 * Проверяет принадлежность ctx.currentUser к группам по id или name.
 * savedGroupIds — массив id групп.
 * savedGroupNames — массив имён групп (lowercase).
 * Возвращает true если пользователь входит хотя бы в одну из групп.
 *
 * v1.9.10: walks up the parent chain of each user group (up to 10 levels).
 * Handles aggregate groups: user in X.A gets access when settings saved X (parent).
 * Gracefully degrades if SDK does not populate g.parent (no-op, same as before).
 */
function userInGroups(ctx, savedGroupIds, savedGroupNames) {
  try {
    var me = ctx.currentUser;
    if (!me || !me.groups) return false;
    var found = false;
    me.groups.forEach(function(g) {
      if (found) return;
      var gid   = g.id || '';
      // Bug #2 fix: trim() обе стороны — YT иногда хранит имя группы с trailing/leading
      // whitespace, а ssp_settings может быть сохранён без пробелов (auto-trim в форме).
      // Strict equality давала false-negative → роли «отказывали» при реальном членстве.
      var gname = (g.name || '').trim().toLowerCase();
      if (savedGroupIds && savedGroupIds.indexOf(gid) >= 0) { found = true; return; }
      if (savedGroupNames) {
        savedGroupNames.forEach(function(n) {
          if ((n || '').trim().toLowerCase() === gname && gname !== '') found = true;
        });
      }
      // Walk up parent chain: user in X.A gets access if settings saved parent X.
      // YT App SDK lazily resolves g.parent from DB; if unavailable, loop skips.
      var depth = 0;
      var parent = g.parent;
      while (parent && !found && depth < 10) {
        var pid   = parent.id || '';
        var pname = (parent.name || '').trim().toLowerCase();
        if (savedGroupIds && savedGroupIds.indexOf(pid) >= 0) { found = true; break; }
        if (savedGroupNames) {
          savedGroupNames.forEach(function(n) {
            if ((n || '').trim().toLowerCase() === pname && pname !== '') found = true;
          });
        }
        parent = parent.parent;
        depth++;
      }
    });
    return found;
  } catch (e) {
    return false;
  }
}

/**
 * Проверяет права редактора по настройкам ssp_settings.editGroups.
 * Deny-by-default:
 *   - если settingsManagerGroup не задана → false (плагин не настроен);
 *   - если editGroups пусты → false (нет ограничений ≠ доступ всем).
 * Это закрытие chicken-and-egg: пока settingsManager не настроил editGroups,
 * никто не может редактировать данные плагина.
 */
function isEditor(ctx) {
  if (isInstanceAdmin(ctx)) return true; /* #51 — инстанс-админ = член любой роли */
  if (!isSettingsManagerConfigured(ctx)) return false;
  var savedSettings  = parseJson(getProp(ctx, 'ssp_settings'), null);
  var editGroupIds   = (savedSettings && savedSettings.editGroups)     || [];
  var editGroupNames = (savedSettings && savedSettings.editGroupNames) || [];
  if (!editGroupIds.length && !editGroupNames.length) return false;
  return userInGroups(ctx, editGroupIds, editGroupNames);
}

/**
 * #22 — Права планировочного менеджера (Вариант C) по ssp_settings.planningManagerGroups.
 * Может править ТОЛЬКО планировочные секции формы настроек; admin-тир (workflow + доступ/
 * права) preserve-merge'ится при записи (см. mergeAdminTierFromStored). Deny-by-default,
 * аналогично isEditor.
 */
function isPlanningManager(ctx) {
  if (isInstanceAdmin(ctx)) return true; /* #51 — инстанс-админ = член любой роли */
  if (!isSettingsManagerConfigured(ctx)) return false;
  var savedSettings = parseJson(getProp(ctx, 'ssp_settings'), null);
  var ids   = (savedSettings && savedSettings.planningManagerGroups)     || [];
  var names = (savedSettings && savedSettings.planningManagerGroupNames) || [];
  if (!ids.length && !names.length) return false;
  return userInGroups(ctx, ids, names);
}

/**
 * Проверяет права валидатора по настройкам ssp_settings.validationGroups.
 * Deny-by-default — аналогично isEditor.
 */
function isValidator(ctx) {
  if (isInstanceAdmin(ctx)) return true; /* #51 — инстанс-админ = член любой роли */
  if (!isSettingsManagerConfigured(ctx)) return false;
  var savedSettings  = parseJson(getProp(ctx, 'ssp_settings'), null);
  var valGroupIds    = (savedSettings && savedSettings.validationGroups)     || [];
  var valGroupNames  = (savedSettings && savedSettings.validationGroupNames) || [];
  if (!valGroupIds.length && !valGroupNames.length) return false;
  return userInGroups(ctx, valGroupIds, valGroupNames);
}

/**
 * v6.1.0 D82 (F5) — assigner-роль (variant b: только assignee + start/end-dates).
 * Иерархия editor⊃assigner⊃viewer. Хранится в ssp_settings.assignerGroups /
 * assignerGroupNames. Deny-by-default.
 */
function isAssigner(ctx) {
  if (isInstanceAdmin(ctx)) return true; /* #51 — инстанс-админ = член любой роли */
  if (!isSettingsManagerConfigured(ctx)) return false;
  var savedSettings = parseJson(getProp(ctx, 'ssp_settings'), null);
  var ids   = (savedSettings && savedSettings.assignerGroups)     || [];
  var names = (savedSettings && savedSettings.assignerGroupNames) || [];
  if (!ids.length && !names.length) return false;
  return userInGroups(ctx, ids, names);
}

/**
 * v5.0.1 — отдельная роль для полной очистки истории спринтов.
 * Хранится в ssp_settings.historyClearGroups / historyClearGroupNames
 * (записывается только settings-менеджером).
 * Deny-by-default аналогично остальным ролям.
 */
function isHistoryManager(ctx) {
  /* #66 (⚖ владелец 2026-08-19) — единственное исключение из байпаса #51: очистка/замена
     истории необратима → админ без членства в historyClearGroups не проходит (вырез парный
     с authzGuard, иначе кнопка скрыта, а POST открыт). */
  if (!isSettingsManagerConfigured(ctx)) return false;
  var savedSettings = parseJson(getProp(ctx, 'ssp_settings'), null);
  var ids   = (savedSettings && savedSettings.historyClearGroups)     || [];
  var names = (savedSettings && savedSettings.historyClearGroupNames) || [];
  if (!ids.length && !names.length) return false;
  return userInGroups(ctx, ids, names);
}

/**
 * #48 R2.4 — релиз-роли (D-C). РМ (releaseManagerGroups): состав + все статусы + отмена +
 * фриз. РИ (releaseEngineerGroups): движение статуса по рабочей цепочке + «Выпущен».
 * Deny-by-default, аналогично isEditor. Потребитель — backend-release.js (releasePerms).
 */
function isReleaseManager(ctx) {
  if (isInstanceAdmin(ctx)) return true; /* #51 — инстанс-админ = член любой роли */
  if (!isSettingsManagerConfigured(ctx)) return false;
  var s = parseJson(getProp(ctx, 'ssp_settings'), null);
  var ids   = (s && s.releaseManagerGroups)     || [];
  var names = (s && s.releaseManagerGroupNames) || [];
  if (!ids.length && !names.length) return false;
  return userInGroups(ctx, ids, names);
}

function isReleaseEngineer(ctx) {
  if (isInstanceAdmin(ctx)) return true; /* #51 — инстанс-админ = член любой роли */
  if (!isSettingsManagerConfigured(ctx)) return false;
  var s = parseJson(getProp(ctx, 'ssp_settings'), null);
  var ids   = (s && s.releaseEngineerGroups)     || [];
  var names = (s && s.releaseEngineerGroupNames) || [];
  if (!ids.length && !names.length) return false;
  return userInGroups(ctx, ids, names);
}

/**
 * #57-2 — право переключать тумблер блокировки создания спринтов (sprintLockGroups,
 * «Управление правами»). Deny-by-default, канон isReleaseManager. Потребитель —
 * backend-sprintlock.js (GET/POST sprint-lock).
 */
function isSprintLockManager(ctx) {
  if (isInstanceAdmin(ctx)) return true; /* #51 — инстанс-админ = член любой роли */
  if (!isSettingsManagerConfigured(ctx)) return false;
  var s = parseJson(getProp(ctx, 'ssp_settings'), null);
  var ids   = (s && s.sprintLockGroups)     || [];
  var names = (s && s.sprintLockGroupNames) || [];
  if (!ids.length && !names.length) return false;
  return userInGroups(ctx, ids, names);
}

/* #57-2 — создание нового спринта: sprintId входящего слота не совпадает с хранимым и
   отсутствует в истории (переключение на исторический/PLANNING-спринт — НЕ создание). */
function isNewSprintCreation(incoming, slot, historyArr) {
  var id = incoming && incoming.sprintId;
  if (!id) return false;
  if (slot && slot.sprintId === id) return false;
  var h = Array.isArray(historyArr) ? historyArr : [];
  for (var i = 0; i < h.length; i++) { if (h[i] && h[i].sprintId === id) return false; }
  return true;
}

/**
 * #50 — reporting-access контур B (руководство). Членство в ssp_settings.reportingGroupsB.
 * Deny-by-default. Потребитель — backend-reporting.js (GET reporting-access) + фронт-гейт
 * узлов дерева/секции отчётности. Данные отчётности чувствительны → доступ не опционален.
 */
function isReportingViewerB(ctx) {
  if (isInstanceAdmin(ctx)) return true; /* #51 — инстанс-админ = член любой роли */
  if (!isSettingsManagerConfigured(ctx)) return false;
  var s = parseJson(getProp(ctx, 'ssp_settings'), null);
  var ids   = (s && s.reportingGroupsB)      || [];
  var names = (s && s.reportingGroupsBNames) || [];
  if (!ids.length && !names.length) return false;
  return userInGroups(ctx, ids, names);
}

/**
 * #50 — reporting-access контур A (лиды). B⊇A (US-ACC-02): руководитель (viewer B) видит и
 * оперативные (A). Членство в reportingGroupsA ИЛИ доступ к B. Deny-by-default.
 */
function isReportingViewerA(ctx) {
  if (isInstanceAdmin(ctx)) return true; /* #51 — инстанс-админ = член любой роли */
  if (isReportingViewerB(ctx)) return true; /* B ⊇ A (US-ACC-02) */
  if (!isSettingsManagerConfigured(ctx)) return false;
  var s = parseJson(getProp(ctx, 'ssp_settings'), null);
  var ids   = (s && s.reportingGroupsA)      || [];
  var names = (s && s.reportingGroupsANames) || [];
  if (!ids.length && !names.length) return false;
  return userInGroups(ctx, ids, names);
}

/**
 * Проверяет права settings-менеджера по ctx.settings.settingsManagerGroup.
 * Deny-by-default: если группа не задана — доступ запрещён всем.
 * Это устраняет chicken-and-egg: невозможно подменить настройки на свежей установке,
 * пока админ проекта не задал группу через Project Settings → Apps.
 */
function isSettingsManager(ctx) {
  if (isInstanceAdmin(ctx)) return true; /* #51 — инстанс-админ = член любой роли */
  if (!isSettingsManagerConfigured(ctx)) return false;
  var g = ctx.settings.settingsManagerGroup;
  /* v1.8.3 — UserGroup picker возвращает object {id, name, ...}; legacy text-input — строку. */
  if (typeof g === 'string') {
    return userInGroups(ctx, [], [g.trim()]);
  }
  var ids   = (g && g.id)   ? [String(g.id)]   : [];
  var names = (g && g.name) ? [String(g.name)] : [];
  return userInGroups(ctx, ids, names);
}

/* #80 — «планер отключён в проекте»: единственный детектор флага. Читает ТОЛЬКО
   переданный АКТУАЛЬНЫЙ settings-блоб проекта — НЕ снимки history[].settings (они несут
   настройки эпохи и «выключали» бы проект задним числом, риск 3 карточки #80). */
function isPlannerDisabled(settingsObj) {
  return !!(settingsObj && settingsObj.plannerDisabled === true);
}

/**
 * Отклоняет запрос с кодом 403.
 * reason — короткий машинный код (без эха содержимого тела).
 */
function forbidden(ctx, reason) {
  ctx.response.status = 403;
  ctx.response.json({ success: false, error: 'Forbidden', reason: reason || 'insufficient_rights' });
}

/**
 * Отклоняет запрос с кодом 400.
 */
function badRequest(ctx, reason) {
  ctx.response.status = 400;
  ctx.response.json({ success: false, error: 'Bad Request', reason: reason || 'invalid_input' });
}

/**
 * Отклоняет запрос с кодом 500 — неожиданная серверная ошибка.
 * Подробности — только в server log при enableDebugLog.
 */
function internalError(ctx, reason) {
  try { ctx.response.status = 500; } catch (e) { /* ignore */ }
  dlog(ctx, 'internalError: ' + (reason || ''));
  ctx.response.json({ success: false, error: 'internal_error' });
}

/**
 * Единый guard авторизации.
 * Использование в начале handle:
 *   if (!authzGuard(ctx, 'editor')) return;
 *
 * Роли:
 *   'viewer'          — только аутентификация
 *   'editor'          — членство в editGroups (требует настроенного settingsManagerGroup)
 *   'validator'       — членство в validationGroups (требует настроенного settingsManagerGroup)
 *   'settingsManager' — членство в settingsManagerGroup
 */
function authzGuard(ctx, role) {
  if (!isAuthenticated(ctx)) { forbidden(ctx, 'auth_required'); return false; }
  /* #51 — инстанс-админ: полный доступ, включая проект без настроенной
     settingsManagerGroup (байпас ДО plugin_not_configured).
     #66 — кроме 'historyManager': деструктив требует явного членства даже у админа. */
  if (role !== 'historyManager' && isInstanceAdmin(ctx)) return true;
  if (role === 'viewer') return true;
  if (!isSettingsManagerConfigured(ctx)) {
    forbidden(ctx, 'plugin_not_configured');
    return false;
  }
  if (role === 'settingsManager') {
    if (!isSettingsManager(ctx)) { forbidden(ctx, 'settings_manager_rights_required'); return false; }
    return true;
  }
  if (role === 'editor') {
    if (!isEditor(ctx)) { forbidden(ctx, 'editor_rights_required'); return false; }
    return true;
  }
  if (role === 'validator') {
    if (!isValidator(ctx)) { forbidden(ctx, 'validator_rights_required'); return false; }
    return true;
  }
  if (role === 'historyManager') {
    if (!isHistoryManager(ctx)) { forbidden(ctx, 'history_manager_rights_required'); return false; }
    return true;
  }
  /* #67 H5 — объединение editor∨validator: ветка сброса слота sprint:null (валидатор
     дочищает историю вместе со слотом — сброс слабее full-replace, который validator
     уже штатно делает под ?action=validate, v3.2.1) и ветка POST /history?action=snapshot
     (авто-снапшот истории у редактора). Оформление объединения — псевдоролью, как
     'assigner'/'settingsOrPlanning' ниже: один вызов authzGuard (отказ шлёт 403 сам,
     два вызова подряд дали бы двойной ответ). */
  if (role === 'editorOrValidator') {
    if (isEditor(ctx) || isValidator(ctx)) return true;
    forbidden(ctx, 'editor_rights_required');
    return false;
  }
  /* v6.1.0 D82 (F5) — assigner-уровень. Иерархия editor⊃assigner⊃viewer:
     editor / settingsManager автоматически проходят. #48 R2.4 — релиз-роли тоже:
     РМ/РИ применяют маппинг статус→State (update-issue-field) без editor-прав. */
  if (role === 'assigner') {
    if (isEditor(ctx) || isAssigner(ctx) || isSettingsManager(ctx) || isReleaseManager(ctx) || isReleaseEngineer(ctx)) return true;
    forbidden(ctx, 'assigner_rights_required');
    return false;
  }
  /* #22 — запись настроек: settings-менеджер (полный доступ) ИЛИ планировочный
     менеджер (планировочный тир; admin-ключи preserve-merge'атся в хэндлере). */
  if (role === 'settingsOrPlanning') {
    if (isSettingsManager(ctx) || isPlanningManager(ctx)) return true;
    forbidden(ctx, 'settings_manager_rights_required');
    return false;
  }
  // Неизвестная роль — fail-closed
  forbidden(ctx, 'unknown_role');
  return false;
}

/* #67 H8 — серверные аудит-штампы истории (образец: stampAudit, backend-release.js).
   Клиентским confirmedBy/finishedBy/revisions[].by не доверяем: непустое значение,
   отличное от хранимого (по sprintId), штампуется автором запроса; совпадающее с
   хранимым — остаётся (запись не менялась). revisions: entry, чьей тройки (at,level,by)
   нет среди хранимых этой записи, — новый/подменённый → by от сервера (сопоставление
   по тройке, не по индексу: front усекает массив slice(-200), индексы могут съехать).
   Формы как на фронте: confirmedBy/finishedBy — fullName||login (_commitWorkingCopy),
   revisions[].by — login. Мутирует next in-place (до validate). */
function stampHistoryAudit(ctx, stored, next) {
  var cu = (ctx && ctx.currentUser) || {};
  var meFull  = String(cu.fullName || cu.login || '');
  var meLogin = String(cu.login || '');
  var byId = {};
  for (var i = 0; i < stored.length; i++) {
    var o0 = stored[i];
    if (o0 && typeof o0 === 'object' && typeof o0.sprintId === 'string') byId[o0.sprintId] = o0;
  }
  for (var j = 0; j < next.length; j++) {
    var n = next[j];
    if (!n || typeof n !== 'object' || typeof n.sprintId !== 'string') continue;
    /* hasOwnProperty — класс H6: sprintId='__proto__' уводил бы в прототип. */
    var o = Object.prototype.hasOwnProperty.call(byId, n.sprintId) ? byId[n.sprintId] : null;
    if (n.confirmedBy && n.confirmedBy !== (o ? o.confirmedBy : undefined)) n.confirmedBy = meFull;
    if (n.finishedBy  && n.finishedBy  !== (o ? o.finishedBy  : undefined)) n.finishedBy  = meFull;
    if (Array.isArray(n.revisions)) {
      var seen = {};
      var orv = (o && Array.isArray(o.revisions)) ? o.revisions : [];
      for (var oi = 0; oi < orv.length; oi++) {
        var ov = orv[oi];
        if (ov && typeof ov === 'object') seen[String(ov.at) + '|' + String(ov.level) + '|' + String(ov.by)] = true;
      }
      for (var ri = 0; ri < n.revisions.length; ri++) {
        var rv = n.revisions[ri];
        if (!rv || typeof rv !== 'object') continue;
        if (!seen[String(rv.at) + '|' + String(rv.level) + '|' + String(rv.by)]) rv.by = meLogin;
      }
    }
  }
}

/* #25 Ф1 / #67 H9 — зеркалирование settingsManagerGroup → ssp_acl (читает global-режим,
   backend-global.js). Зовётся endpoint'ом sync-acl (init проектного виджета) и после
   каждого успешного settings-save (H9: досинк сужает окно устаревания зеркала после
   смены группы в Project Settings → Apps). В global-режиме ctx.settings приходит ИЗ
   зеркала (адаптер buildProjectCtx) — перезапись идемпотентна. */
function syncAclMirror(ctx) {
  // Нормализуем в простой сериализуемый вид: settingsManagerGroup может быть строкой
  // (legacy text-input) ИЛИ entity-прокси UserGroup (x-entity picker). JSON.stringify
  // живого прокси теряет id/name (сериализуется в {}) → зеркало пустое. Извлекаем явно.
  var g = null;
  try {
    var raw = (ctx.settings && ctx.settings.settingsManagerGroup);
    if (typeof raw === 'string') { g = raw.trim() || null; }
    else if (raw && (raw.name || raw.id)) { g = { id: raw.id ? String(raw.id) : null, name: raw.name ? String(raw.name) : null }; }
  } catch (e) { g = null; }
  var cur  = parseJson(getProp(ctx, 'ssp_acl'), null);
  var curG = (cur && cur.settingsManagerGroup !== undefined) ? cur.settingsManagerGroup : null;
  var changed = JSON.stringify(curG) !== JSON.stringify(g);
  if (changed) {
    var aclStr = JSON.stringify({
      settingsManagerGroup: g,
      mirroredAt:      Date.now(),
      mirroredVersion: APP_VERSION
    });
    if (aclStr.length <= MAX_PROP_SIZE) {
      setProp(ctx, 'ssp_acl', aclStr);
    }
  }
  return changed;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

// ─── ENDPOINTS — тела endpoint-логики (параметризованы ctx) ──────────────────
var ENDPOINTS = [

    // ── GET /project-fields ──────────────────────────────────────────────────
    {
      scope: 'project',
      method: 'GET',
      path: 'project-fields',
      handle: function (ctx) {
        if (!authzGuard(ctx, 'viewer')) return;
        var fields = [];
        try {
          ctx.project.fields.forEach(function (pf) {
            try {
              fields.push({ name: pf.name, type: pf.typeName || '' });
            } catch (fe) { /* пропускаем нечитаемое поле */ }
          });
        } catch (e) {
          dlog(ctx, 'project-fields error: ' + String(e && e.message));
          ctx.response.json({ success: false, error: 'internal_error', fields: [] });
          return;
        }
        ctx.response.json({
          success:     true,
          fields:      fields,
          projectId:   ctx.project.id,
          projectName: ctx.project.name
        });
      }
    },

    // ── GET /sprint-data ─────────────────────────────────────────────────────
    {
      scope: 'project',
      method: 'GET',
      path: 'sprint-data',
      handle: function (ctx) {
        if (!authzGuard(ctx, 'viewer')) return;
        var sprint    = parseJson(getProp(ctx, 'ssp_sprint'),    null);
        var roleItems = parseJson(getProp(ctx, 'ssp_roleitems'), null);
        var settings  = parseJson(getProp(ctx, 'ssp_settings'),  null);

        if (!roleItems) roleItems = {};   /* v3.23.0 — READ-fallback legacy ssp_items снят (#69 строка 27 шаг 2) */

        // Миграция legacy русских строк → латинские enum-коды (read-time normalization).
        // Storage может содержать данные от v4.5.x — клиент должен получать только латинские.
        sprint    = migrateSprintObj(sprint);
        roleItems = migrateRoleItemsObj(roleItems);
        // v2.15.2 — ремап legacy-orphan ключей настроек (dev1c→devPlatform). Клиент
        // получает чистый блоб → collect() passthrough больше не re-POST'ит сирот,
        // которые бриковали save через invalid_settings_structure.
        settings  = migrateSettingsObj(settings);

        // v5.9.0 — D59: централизованная orphan-detection. Frontend более не делает этого
        // самостоятельно при первом чтении (см. main.js:migrateOnRead defensive fallback).
        var orphanGanttIssues = detectOrphanGanttIssues(sprint);

        var enableDebugLog = false;
        try {
          enableDebugLog = !!(ctx.settings && ctx.settings.enableDebugLog);
        } catch (e) { /* ignore */ }

        ctx.response.json({
          success:           true,
          sprint:            sprint,
          roleItems:         roleItems,
          settings:          settings,
          orphanGanttIssues: orphanGanttIssues,
          enableDebugLog:    enableDebugLog,
          configured:        isSettingsManagerConfigured(ctx)
        });
      }
    },

    // ── POST /sprint-data ────────────────────────────────────────────────────
    // editor: sprint / roleItems
    // settingsManager: settings
    // validator: ?action=validate
    {
      scope: 'project',
      method: 'POST',
      path: 'sprint-data',
      handle: function (ctx) {
        if (!authzGuard(ctx, 'viewer')) return;

        var body = parseBodyOrReject(ctx, ALLOWED_SPRINT_DATA_KEYS);
        if (body === null) return;

        var action = (ctx.request.getParameter('action') || '').trim();
        if (action && action !== 'validate' && action !== 'assignerSync') {
          badRequest(ctx, 'invalid_action');
          return;
        }

        if (action === 'validate') {
          if (!authzGuard(ctx, 'validator')) return;
        } else if (action === 'assignerSync') {
          /* v6.1.0 D82 (F5) — assigner partial save: разрешено только обновление
             personalPlanning внутри текущего ssp_sprint. Иерархия editor⊃assigner. */
          if (!authzGuard(ctx, 'assigner')) return;
        } else {
          // Обычное сохранение: проверки прав по ключам ниже.
          // Для sprint/roleItems/items нужен editor, для settings — settingsManager.
        }

        var warnings = [];

        /* #56-4 — optimistic lock слота ssp_sprint/ssp_roleitems: параллельная правка
           двумя пользователями шла last-write-wins и теряла чужой состав/оценки. Клиент
           шлёт baseRev (rev слота, который он загружал); расхождение → 409 rev_conflict.
           Без baseRev (старый клиент / REST-сид) — прежнее поведение. #84 — потолок из
           этого коммента («roleItems-only / assignerSync rev не двигают») снят ещё в
           v3.2.1, см. ниже; 409 фронт сперва пробует слить (pure/slot-merge-pure.js). */
        var newSlotRev = null;
        if (body.sprint !== undefined || body.roleItems !== undefined) {
          var revSprint = parseJson(getProp(ctx, 'ssp_sprint'), null);
          var slotRev = (revSprint && typeof revSprint._rev === 'number') ? revSprint._rev : 0;
          if (body.baseRev !== undefined && body.baseRev !== null && body.baseRev !== slotRev) {
            ctx.response.status = 409;
            ctx.response.json({ success: false, error: 'rev_conflict', rev: slotRev });
            return;
          }
          /* rev инкрементится на КАЖДОЙ записи sprint (и от legacy-клиентов без baseRev —
             иначе они сбрасывали бы счётчик и провоцировали ложные конфликты). */
          if (body.sprint && typeof body.sprint === 'object') {
            newSlotRev = slotRev + 1;
            body.sprint._rev = newSlotRev;
          }
        }

        /* v3.2.1 — анти-torn-write: проверки roleItems (права/структура/размер)
           выполняются ДО записи ssp_sprint. Раньше 4xx из roleItems-ветки уходил
           ПОСЛЕ setProp спринта (обе записи коммитились независимо) → CONFIRMED-спринт
           персистился без согласованного состава. Заодно выровнена матрица прав шапки:
           action=validate пишет roleItems под validator-гейтом (как sprint-ветка выше),
           не требуя editor. assignerSync roleItems игнорирует (ранний return ниже). */
        var roleItemsStrPre = null;
        if (body.roleItems !== undefined && action !== 'assignerSync') {
          /* #67 H5-mirror — сброс слота приходит парой {sprint:null, roleItems:{}}
             (history-view), и этот гейт срабатывает РАНЬШЕ sprint-ветки: validator-без-
             editor отбивался бы здесь, не дойдя до editorOrValidator ниже. Расширение
             ровно на случай body.sprint===null (не эскалация: полный roleItems-write
             у validator уже есть под ?action=validate, v3.2.1). */
          var riRole = (body.sprint === null) ? 'editorOrValidator' : 'editor';
          if (action !== 'validate' && !authzGuard(ctx, riRole)) return;
          if (!validateRoleItems(body.roleItems)) {
            badRequest(ctx, 'invalid_role_items_structure');
            return;
          }
          /* #67 путь 3 — серверное обогащение «пустых» задач (агентские заливки n8n:
             issueId+оценки без title). Обогатитель регистрируется сателлитом
             backend-issuefields через __enrichRoleItems (ядро не require'ит сателлит —
             цикл зависимостей). Триггер — item с issueId БЕЗ title: виджет всегда шлёт
             title (pick.js, backlog-assign.js) → на виджетном пути ни одного обращения
             к платформе и ответ побайтово прежний (enriched не добавляется). */
          var enrichFn = (typeof module !== 'undefined' && module.exports) ? module.exports.__enrichRoleItems : null;
          var enrichInfo = (typeof enrichFn === 'function') ? enrichFn(ctx, body.roleItems) : null;
          if (enrichInfo && enrichInfo.count > 0 && !validateRoleItems(body.roleItems)) {
            badRequest(ctx, 'invalid_role_items_structure');   /* fail-closed на баг обогатителя */
            return;
          }
          roleItemsStrPre = JSON.stringify(body.roleItems);
          if (roleItemsStrPre.length > MAX_PROP_SIZE) {
            badRequest(ctx, 'role_items_data_too_large');
            return;
          }
        }

        if (body.sprint !== undefined) {
          if (body.sprint === null) {
            /* S3 (кластер-баг спринтов): явный сброс активного спринта — фронт шлёт
               sprint:null при удалении последней ролевой записи активного спринта.
               Затираем ssp_sprint, иначе спринт остаётся призраком в пикере и
               переживает хард-релоад. ssp_roleitems сбрасывается ниже (фронт шлёт {}). */
            /* #67 H2 — байпас `action !== 'validate'` скопирован с соседних веток, где
               широкая запись под validate осознанна (v3.2.1). Здесь ветка деструктивная:
               validate-запрос с sprint:null затирал активный слот без прав editor.
               UI такую комбинацию не порождает — sprint:null уходит без action.
               #67 H5-mirror — editorOrValidator: валидатор, удаляя последнюю запись
               истории активного спринта, дочищает и слот одной цельной операцией
               (сброс слабее full-replace под ?action=validate — v3.2.1). */
            if (!authzGuard(ctx, 'editorOrValidator')) return;
            setProp(ctx, 'ssp_sprint', '');
            /* v3.2.1 — слот пуст → его rev теперь 0; сообщаем клиенту (иначе вкладка
               держала старый _slotRev и все последующие записи ловили 409 до F5). */
            newSlotRev = 0;
          } else if (action === 'assignerSync') {
            /* В action=assignerSync разрешаем перезапись только personalPlanning;
               прочие поля sprint игнорируем — берём из storage. */
            var prevSprint = parseJson(getProp(ctx, 'ssp_sprint'), null);
            if (!prevSprint || typeof prevSprint !== 'object') {
              badRequest(ctx, 'sprint_not_found');
              return;
            }
            if (body.sprint.personalPlanning !== undefined
                && body.sprint.personalPlanning !== null
                && typeof body.sprint.personalPlanning !== 'object') {
              badRequest(ctx, 'invalid_personal_planning');
              return;
            }
            prevSprint.personalPlanning = body.sprint.personalPlanning || null;
            prevSprint = stripDeprecatedSprintKeys(prevSprint);
            // v1.6.0 D125 — stamp before validate+persist.
            prevSprint.pluginVersion = CURRENT_PLUGIN_VERSION;
            /* #56-4 — assigner partial save тоже двигает rev (baseRev-гейт отработал выше). */
            if (newSlotRev !== null) prevSprint._rev = newSlotRev;
            if (!validateSprintForWrite(prevSprint)) {
              badRequest(ctx, 'invalid_sprint_structure');
              return;
            }
            var pSprintStr = JSON.stringify(prevSprint);
            if (pSprintStr.length > MAX_PROP_SIZE) {
              badRequest(ctx, 'sprint_data_too_large');
              return;
            }
            setProp(ctx, 'ssp_sprint', pSprintStr);
            var aResp = { success: true, action: 'assignerSync' };
            if (newSlotRev !== null) aResp.rev = newSlotRev;
            ctx.response.json(aResp);
            return;
          } else {
          if (action !== 'validate' && !authzGuard(ctx, 'editor')) return;
          /* #57-2 — тумблер блокировки создания спринтов: НОВЫЙ sprintId (нет ни в слоте,
             ни в истории) при включённом blockSprintCreation → 403. Правки существующих
             спринтов работают как раньше. Фронт-гейт (doNewSprint) — UX; здесь — enforcement. */
          if (isNewSprintCreation(body.sprint, parseJson(getProp(ctx, 'ssp_sprint'), null), parseJson(getProp(ctx, 'ssp_history'), []))) {
            var lockSettings = parseJson(getProp(ctx, 'ssp_settings'), null);
            if (lockSettings && lockSettings.blockSprintCreation === true) { forbidden(ctx, 'sprint_creation_locked'); return; }
          }
          // v6.1.0 D69 — silent strip legacy `gantt` (см. stripDeprecatedSprintKeys).
          body.sprint = stripDeprecatedSprintKeys(body.sprint);
          // v1.6.0 D125 — stamp before validate+persist.
          body.sprint.pluginVersion = CURRENT_PLUGIN_VERSION;
          /* #67 H8 — updatedBy/At спринта штампует сервер (клиентскому не доверяем;
             форма как на фронте — login, sprint-controller.js:297). */
          body.sprint.updatedBy = String((ctx.currentUser && ctx.currentUser.login) || '');
          body.sprint.updatedAt = Date.now();
          if (!validateSprintForWrite(body.sprint)) {
            badRequest(ctx, 'invalid_sprint_structure');
            return;
          }
          var sprintStr = JSON.stringify(body.sprint);
          if (sprintStr.length > MAX_PROP_SIZE) {
            badRequest(ctx, 'sprint_data_too_large');
            return;
          }
          setProp(ctx, 'ssp_sprint', sprintStr);

          // Server-side overlimit warn при action=validate
          if (action === 'validate' && body.roleItems) {
            /* v3.15.1 — обещание allowOverlimitPlanning распространяется и на серверный
               детектор: warnings не считаем вовсе (тумблер «не смотри на лимит»).
               Скоуп проверки — только валидируемая роль (?role=): иначе валидация одной
               роли ругалась на перелимит чужой (ОС прода: роль с ресурсом 0 и
               хвостом аллокаций). Без параметра (старый фронт) — все роли, как раньше. */
            var ovSettings = parseJson(getProp(ctx, 'ssp_settings'), null);
            var ovSkipAll  = !!(ovSettings && ovSettings.allowOverlimitPlanning === true);
            var ovRole     = (ctx.request.getParameter('role') || '').trim();
            var ovKeys     = ROLE_KEYS.indexOf(ovRole) >= 0 ? [ovRole] : ROLE_KEYS;
            if (!ovSkipAll) ovKeys.forEach(function (rk) {
              var resKey = 'resource' + rk.charAt(0).toUpperCase() + rk.slice(1);
              var allocKey = 'alloc_' + rk;
              var resource = body.sprint[resKey];
              if (typeof resource !== 'number') return;
              var arr = body.roleItems[rk];
              if (!Array.isArray(arr)) return;
              var estKey  = 'estimate_' + rk;
              var factKey = 'fact_' + rk;
              var sumAlloc = 0;
              arr.forEach(function (it) {
                if (it && it.inclusionStatus
                    && (it.inclusionStatus === 'INC_PLANNED' || it.inclusionStatus === 'INC_UNPLANNED')) {
                  var alloc = it[allocKey];
                  sumAlloc += (alloc !== null && alloc !== undefined)
                    ? alloc
                    : Math.max(0, (typeof it[estKey] === 'number' ? it[estKey] : 0) - (typeof it[factKey] === 'number' ? it[factKey] : 0));
                }
              });
              if (sumAlloc > resource) {
                warnings.push('overlimit:' + rk);
                dlog(ctx, 'overlimit_validate role=' + rk + ' rem=' + (resource - sumAlloc));
              }
            });
          }
          }
        }

        if (roleItemsStrPre !== null) {
          /* v3.2.1 — права/структура/размер проверены pre-flight'ом выше (анти-torn-write). */
          setProp(ctx, 'ssp_roleitems', roleItemsStrPre);
          /* #56-4 — roleItems-only write тоже двигает rev слота (иначе два таких
             писателя проходят с одним baseRev и последний молча затирает состав
             первого). Спринт в этом запросе не менялся — переписываем хранимый
             с новым _rev. body.sprint===undefined исключает конфликт с null-сбросом. */
          if (body.sprint === undefined && newSlotRev === null
              && revSprint && typeof revSprint === 'object') {
            newSlotRev = slotRev + 1;
            revSprint._rev = newSlotRev;
            setProp(ctx, 'ssp_sprint', JSON.stringify(revSprint));
          }
        }

        if (body.settings !== undefined) {
          // #22 — settings: settings-менеджер (полностью) ИЛИ планировочный менеджер
          // (планировочный тир; admin-тир ключи preserve-merge'атся из stored).
          if (!authzGuard(ctx, 'settingsOrPlanning')) return;
          stripDeprecatedSettingsKeys(body.settings);   /* v3.23.0 — stale-вкладка до F5 несёт migratedTo */
          /* #74 шаг 1: легаси-фразы принимаем, но помечаем. Блоб настроек не носит
             migrationLog (в отличие от снимков спринта, прецедент v3.22.0) → WARN в
             серверный лог. Срабатывает на клиенте до v3.28.0 И на новом с ПУСТОЙ
             таблицей — ровно та популяция, что должна переехать на неё до шага 2. */
          if (!Array.isArray(body.settings.linkTypeRoles) || !body.settings.linkTypeRoles.length) {
            DEPRECATED_LINK_PHRASE_KEYS.forEach(function (dk) {
              if (body.settings[dk] !== undefined && body.settings[dk] !== null) {
                console.warn('[SCHEMA_DEPRECATION_WARN] settings.' + dk + ' → linkTypeRoles (#74 шаг 1, hard-removal ≥ 1 minor)');
              }
            });
          }
          if (!validateSettings(body.settings)) {
            badRequest(ctx, 'invalid_settings_structure');
            return;
          }
          var settingsToSave = body.settings;
          if (!isSettingsManager(ctx)) {
            // Планировочный менеджер: admin-тир неприкосновенен — берём его из stored.
            var storedSettings = parseJson(getProp(ctx, 'ssp_settings'), {});
            settingsToSave = mergeAdminTierFromStored(body.settings, storedSettings);
          }
          /* #57-2 — blockSprintCreation пишет ТОЛЬКО эндпоинт sprint-lock (группа
             sprintLockGroups): обычный settings-save всегда preserve'ит хранимое значение
             (анти-гонка формы настроек с тумблером в шапке). */
          var storedLock = parseJson(getProp(ctx, 'ssp_settings'), null);
          if (storedLock && storedLock.blockSprintCreation !== undefined) settingsToSave.blockSprintCreation = storedLock.blockSprintCreation;
          else delete settingsToSave.blockSprintCreation;
          /* #80 — plannerDisabled пишет ТОЛЬКО эндпоинт planner-disabled: тот же preserve
             (иначе каждый сейв формы настроек затирал бы флаг — класс ожога #74). */
          if (storedLock && storedLock.plannerDisabled !== undefined) settingsToSave.plannerDisabled = storedLock.plannerDisabled;
          else delete settingsToSave.plannerDisabled;
          var stStr = JSON.stringify(settingsToSave);
          if (stStr.length > MAX_PROP_SIZE) {
            badRequest(ctx, 'settings_data_too_large');
            return;
          }
          setProp(ctx, 'ssp_settings', stStr);
          /* #67 H9 — досинк зеркала ssp_acl при каждом settings-save (не только на init
             виджета): сужает окно устаревания после смены settings-manager-группы. */
          try { syncAclMirror(ctx); } catch (_) {}

          // Подчистка orphan roleItems: удаляем задачи отключённых ролей
          if (Array.isArray(settingsToSave.activeRoles)) {
            var saved = parseJson(getProp(ctx, 'ssp_roleitems'), null);
            if (saved && typeof saved === 'object') {
              var activeSet = {};
              settingsToSave.activeRoles.forEach(function (k) { activeSet[k] = true; });
              var pruned = {};
              var hadOrphans = false;
              Object.keys(saved).forEach(function (rk) {
                if (activeSet[rk]) {
                  pruned[rk] = saved[rk];
                } else {
                  hadOrphans = true;
                  dlog(ctx, 'orphan roleItems pruned: ' + rk);
                }
              });
              if (hadOrphans) {
                setProp(ctx, 'ssp_roleitems', JSON.stringify(pruned));
              }
            }
          }
        }

        var resp = { success: true, saved: Object.keys(body).filter(function (k) { return k !== 'baseRev'; }) };
        if (newSlotRev !== null) resp.rev = newSlotRev;   /* #56-4 — фронт синхронизирует _slotRev */
        if (enrichInfo) resp.enriched = enrichInfo;       /* #67 путь 3 — {count, skipped} для агента */
        if (warnings.length) resp.warnings = warnings;
        ctx.response.json(resp);
      }
    },

    // ── GET /history ─────────────────────────────────────────────────────────
    {
      scope: 'project',
      method: 'GET',
      path: 'history',
      handle: function (ctx) {
        if (!authzGuard(ctx, 'viewer')) return;
        var history = parseJson(getProp(ctx, 'ssp_history'), []);
        // Миграция legacy русских строк → латинские enum-коды
        history = migrateHistoryArr(history);
        // v5.9.0 — D59: per-snapshot orphan-detection. Map { sprintId: [issueId, ...] }.
        // Frontend читает orphans из этого поля и кладёт на _history[i]._orphanGanttIssues.
        var orphanGanttBySprintId = {};
        for (var hi = 0; hi < history.length; hi++) {
          var snap = history[hi];
          if (!snap || !snap.sprintId) continue;
          var orphans = detectOrphanGanttIssues(snap);
          if (orphans.length) orphanGanttBySprintId[snap.sprintId] = orphans;
        }
        ctx.response.json({
          success:               true,
          history:               history,
          orphanGanttBySprintId: orphanGanttBySprintId,
          rev:                   slotRev(ctx, 'ssp_history_rev')   /* R6 — optimistic lock */
        });
      }
    },

    // ── POST /history ────────────────────────────────────────────────────────
    // По умолчанию требует прав валидатора.
    // ?action=clear — полная очистка истории, требует прав historyManager
    // (отдельная роль с v5.0.1, чтобы случайный пользователь не мог затереть всё).
    {
      scope: 'project',
      method: 'POST',
      path: 'history',
      handle: function (ctx) {
        var action = (ctx.request.getParameter('action') || '').trim();
        if (action && action !== 'clear' && action !== 'assignerSync' && action !== 'import-replace' && action !== 'snapshot') {
          badRequest(ctx, 'invalid_action');
          return;
        }

        if (action === 'clear') {
          if (!authzGuard(ctx, 'historyManager')) return;
          // Очистка — игнорируем тело, просто пишем пустой массив
          setProp(ctx, 'ssp_history', '[]');
          dlog(ctx, 'history cleared by ' + ((ctx.currentUser && ctx.currentUser.login) || '?'));
          ctx.response.json({ success: true, cleared: true, rev: bumpSlotRev(ctx, 'ssp_history_rev') });
          return;
        }

        /* #67 H5-editor — узкое право авто-снапшота: upsert РОВНО ОДНОЙ записи по её
           sprintId под editor∨validator. Редактор (без validator) сохраняет состав —
           авто-снапшот истории больше не 403-ится молча (youtrack-api.js). Ветка ничего
           не удаляет: чужие записи не трогаются (границы — Integrations/AUTHZ_HARDENING_67.md).
           Побочно упраздняет read-modify-full-replace авто-снапшота (класс R6 / P1 #11).
           Шаблон тела — assignerSync ниже (parse→migrate→strip→upsert→stamp→validate→persist). */
        if (action === 'snapshot') {
          if (!authzGuard(ctx, 'editorOrValidator')) return;
          var bodySN = parseBodyOrReject(ctx, ALLOWED_HISTORY_KEYS);
          if (bodySN === null) return;
          if (!Array.isArray(bodySN.history) || bodySN.history.length !== 1
              || !bodySN.history[0] || typeof bodySN.history[0] !== 'object'
              || typeof bodySN.history[0].sprintId !== 'string' || !bodySN.history[0].sprintId) {
            badRequest(ctx, 'invalid_snapshot_body');
            return;
          }
          if (revConflict(ctx, bodySN.baseRev, slotRev(ctx, 'ssp_history_rev'))) return;
          var existingSN = parseJson(getProp(ctx, 'ssp_history'), []);
          if (!Array.isArray(existingSN)) existingSN = [];
          existingSN = migrateHistoryArr(existingSN);
          existingSN = stripDeprecatedHistoryKeys(existingSN);
          var storedSN = existingSN.slice();          /* refs ДО upsert'а — опора стампа H8 */
          var snapSN = stripDeprecatedHistoryKeys([bodySN.history[0]])[0];
          var snIdx = -1;
          for (var sni = 0; sni < existingSN.length; sni++) {
            if (existingSN[sni] && existingSN[sni].sprintId === snapSN.sprintId) { snIdx = sni; break; }
          }
          if (snIdx >= 0) existingSN[snIdx] = snapSN;
          else existingSN.unshift(snapSN);            /* как фронт: новая запись — в голову */
          stampHistoryAudit(ctx, storedSN, existingSN);   /* #67 H8 */
          for (var sns = 0; sns < existingSN.length; sns++) {
            if (existingSN[sns] && typeof existingSN[sns] === 'object') existingSN[sns].pluginVersion = CURRENT_PLUGIN_VERSION;
          }
          if (!validateHistoryForWrite(existingSN)) {
            var snDiag = diagnoseHistoryWrite(existingSN);
            badRequest(ctx, 'invalid_history_structure: ' + (snDiag.where || 'unknown') + ' (record[' + snDiag.idx + '])');
            return;
          }
          var snStr = JSON.stringify(existingSN);
          if (snStr.length > MAX_HISTORY_SIZE) {
            badRequest(ctx, 'history_data_too_large');
            return;
          }
          setProp(ctx, 'ssp_history', snStr);
          ctx.response.json({ success: true, action: 'snapshot', rev: bumpSlotRev(ctx, 'ssp_history_rev') });
          return;
        }

        // v2.1.13 — Полное восстановление истории из файла. Требует historyManager.
        // Атомарная замена: валидирует + перезаписывает в одной транзакции.
        if (action === 'import-replace') {
          if (!authzGuard(ctx, 'historyManager')) return;
          var bodyIR = parseBodyOrReject(ctx, ALLOWED_HISTORY_KEYS);
          if (bodyIR === null) return;
          if (!Array.isArray(bodyIR.history)) { badRequest(ctx, 'invalid_history_structure'); return; }
          bodyIR.history = stripDeprecatedHistoryKeys(bodyIR.history);
          for (var iri = 0; iri < bodyIR.history.length; iri++) {
            if (bodyIR.history[iri] && typeof bodyIR.history[iri] === 'object') bodyIR.history[iri].pluginVersion = CURRENT_PLUGIN_VERSION;
          }
          if (!validateHistoryForWrite(bodyIR.history)) {
            var irDiag = diagnoseHistoryWrite(bodyIR.history);
            badRequest(ctx, 'invalid_history_structure: ' + (irDiag.where || 'unknown') + ' (record[' + irDiag.idx + '])');
            return;
          }
          var irStr = JSON.stringify(bodyIR.history);
          if (irStr.length > MAX_HISTORY_SIZE) { badRequest(ctx, 'history_data_too_large'); return; }
          setProp(ctx, 'ssp_history', irStr);
          dlog(ctx, 'history replaced by import (' + bodyIR.history.length + ' rec) by ' + ((ctx.currentUser && ctx.currentUser.login) || '?'));
          ctx.response.json({ success: true, action: 'import-replace', count: bodyIR.history.length, rev: bumpSlotRev(ctx, 'ssp_history_rev') });
          return;
        }

        /* v6.1.0 D82 (F5) — assigner partial save: merge body.history[i].personalPlanning
           в существующий snap по sprintId. Прочие поля snap'ов не трогаются. */
        if (action === 'assignerSync') {
          if (!authzGuard(ctx, 'assigner')) return;
          var bodyAS = parseBodyOrReject(ctx, ALLOWED_HISTORY_KEYS);
          if (bodyAS === null) return;
          if (!Array.isArray(bodyAS.history)) { badRequest(ctx, 'invalid_history_structure'); return; }
          var existing = parseJson(getProp(ctx, 'ssp_history'), []);
          if (!Array.isArray(existing)) existing = [];
          existing = migrateHistoryArr(existing);
          existing = stripDeprecatedHistoryKeys(existing);
          var byId = {};
          for (var ei = 0; ei < existing.length; ei++) {
            if (existing[ei] && existing[ei].sprintId) byId[existing[ei].sprintId] = ei;
          }
          for (var ai = 0; ai < bodyAS.history.length; ai++) {
            var inc = bodyAS.history[ai];
            if (!inc || typeof inc !== 'object' || !inc.sprintId) continue;
            if (!Object.prototype.hasOwnProperty.call(byId, inc.sprintId)) continue;   /* #67 H6 — `in` видит цепочку прототипов: sprintId='__proto__' уводил в член прототипа → TypeError/500 (парный guard — backend-capacity.js) */
            var pp = inc.personalPlanning;
            if (pp !== undefined && pp !== null && typeof pp !== 'object') continue;
            existing[byId[inc.sprintId]].personalPlanning = pp || null;
          }
          // v1.6.0 D125 — stamp each record before validate+persist.
          for (var esi = 0; esi < existing.length; esi++) {
            if (existing[esi] && typeof existing[esi] === 'object') existing[esi].pluginVersion = CURRENT_PLUGIN_VERSION;
          }
          if (!validateHistoryForWrite(existing)) {
            badRequest(ctx, 'invalid_history_structure');
            return;
          }
          var asStr = JSON.stringify(existing);
          if (asStr.length > MAX_HISTORY_SIZE) {
            badRequest(ctx, 'history_data_too_large');
            return;
          }
          setProp(ctx, 'ssp_history', asStr);
          ctx.response.json({ success: true, action: 'assignerSync', rev: bumpSlotRev(ctx, 'ssp_history_rev') });
          return;
        }

        if (!authzGuard(ctx, 'validator')) return;

        var body = parseBodyOrReject(ctx, ALLOWED_HISTORY_KEYS);
        if (body === null) return;

        /* R6 — optimistic lock: full-replace истории (P1 #11 — параллельная работа двух
           ролей теряла снапшоты, класс v2.16.6). Гейт ДО каких-либо записей. */
        if (revConflict(ctx, body.baseRev, slotRev(ctx, 'ssp_history_rev'))) return;

        var hRevNew = null;
        if (body.history !== undefined) {
          /* v3.2.1 — {"history": null} проходил undefined-чек и ронял handler
             TypeError'ом на .length (500); import-ветки Array-гейт имеют, основная — нет. */
          if (!Array.isArray(body.history)) {
            badRequest(ctx, 'invalid_history_structure: not_array');
            return;
          }
          /* #67 H1 — гейт по ЭФФЕКТУ, а не по имени параметра. `?action=clear` требует
             historyManager, но побайтово тот же результат даёт основная ветка
             (POST {"history":[]}) — под validator'ом и под инстанс-админом вне группы
             очистки, то есть замок #66 обходился штатным запросом. Требуем те же права,
             когда запись сносит записи ПАЧКОЙ. Порог: минус одна запись — штатная корзина
             (history-view.js: splice + перезапись усечённого массива), она остаётся правом
             валидатора; минус две и больше за один POST — деструктив, UI такого не шлёт. */
          var prevHist = parseJson(getProp(ctx, 'ssp_history'), []);
          var prevLen  = Array.isArray(prevHist) ? prevHist.length : 0;
          if (prevLen > 0 && body.history.length < prevLen - 1
              && !authzGuard(ctx, 'historyManager')) return;
          /* #67 H8 — серверные аудит-штампы confirmedBy/finishedBy/revisions[].by
             (см. stampHistoryAudit). import-replace НЕ штампуется осознанно:
             восстановление бэкапа обязано сохранить исходную атрибуцию. */
          stampHistoryAudit(ctx, Array.isArray(prevHist) ? prevHist : [], body.history);
          // v6.1.0 D69 — silent strip legacy `gantt` (см. stripDeprecatedHistoryKeys).
          body.history = stripDeprecatedHistoryKeys(body.history);
          // v1.6.0 D125 — stamp each record before validate+persist.
          for (var hsi = 0; hsi < body.history.length; hsi++) {
            if (body.history[hsi] && typeof body.history[hsi] === 'object') body.history[hsi].pluginVersion = CURRENT_PLUGIN_VERSION;
          }
          if (!validateHistoryForWrite(body.history)) {
            /* v1.8.0 D130 — debug: подробная причина чтобы починить багов было проще. */
            var diag = diagnoseHistoryWrite(body.history);
            badRequest(ctx, 'invalid_history_structure: ' + (diag.where || 'unknown') + ' (record[' + diag.idx + '])');
            return;
          }
          var hStr = JSON.stringify(body.history);
          if (hStr.length > MAX_HISTORY_SIZE) {
            badRequest(ctx, 'history_data_too_large');
            return;
          }
          setProp(ctx, 'ssp_history', hStr);
          hRevNew = bumpSlotRev(ctx, 'ssp_history_rev');   /* rev двигается только с реальной записью */
        }
        ctx.response.json(hRevNew !== null ? { success: true, rev: hRevNew } : { success: true });
      }
    },

    // ── GET /check-settings-manager ─────────────────────────────────────────
    // Читает settingsManagerGroup ТОЛЬКО из ctx.settings (app-settings).
    // Deny-by-default: если группа не задана — canManage:false.
    {
      scope: 'project',
      method: 'GET',
      path: 'check-settings-manager',
      handle: function (ctx) {
        if (!authzGuard(ctx, 'viewer')) return;
        var configured = isSettingsManagerConfigured(ctx);
        if (!configured) {
          ctx.response.json({ canManage: false, configured: false, reason: 'not_configured', groupName: '' });
          return;
        }
        /* v1.8.3 — settingsManagerGroup может быть object (UserGroup picker) или string (legacy). */
        var g = ctx.settings.settingsManagerGroup;
        var groupName, canManage;
        if (typeof g === 'string') {
          groupName = g.trim();
          canManage = userInGroups(ctx, [], [groupName]);
        } else {
          groupName = (g && g.name) ? String(g.name) : '';
          var ids = (g && g.id) ? [String(g.id)] : [];
          canManage = userInGroups(ctx, ids, groupName ? [groupName] : []);
        }
        /* #51 — инстанс-админ: canManage без членства в группе (байпас UI-гейта). */
        if (!canManage && isInstanceAdmin(ctx)) canManage = true;
        /* #22 — планировочный тир: settings-менеджер ⊃ планировочный менеджер. */
        var canPlanning = canManage || isPlanningManager(ctx);
        ctx.response.json({
          canManage:         canManage,
          canManagePlanning: canPlanning,   // #22 — может открыть форму + править планировочный тир
          canEditWorkflow:   canManage,     // #22 — admin-группа (workflow + доступ/права) рендерится только при true
          configured: true,
          groupName:  groupName,
          reason:     canManage ? 'ok' : (canPlanning ? 'planning_only' : 'not_in_group')
        });
      }
    },

    // ── GET /check-instance-admin ────────────────────────────────────────────
    // #51 — глобальная роль админа инстанса (гейт кнопки глобального пуша
    // календаря и прочих admin-контролов). UI-only: enforcement — байпас в
    // authzGuard и ролевых хелперах; сам факт роли не секрет.
    {
      scope: 'project',
      method: 'GET',
      path: 'check-instance-admin',
      handle: function (ctx) {
        if (!authzGuard(ctx, 'viewer')) return;
        ctx.response.json({ isInstanceAdmin: isInstanceAdmin(ctx) });
      }
    },

    // ── GET /app-version ─────────────────────────────────────────────────────
    // v5.6.0 — Этап 4 (D40, закрывает KL#3 v5.4.0): единая точка истины для версии.
    // Литерал хардкодится синхронно с manifest.json/version и frontend APP_VERSION
    // (правило синхронности значений между manifest и кодом — поднимать
    // одним коммитом). Frontend кеширует ответ в localStorage с TTL 5 мин и при
    // ошибке/истечении сети fallback'ает на runtime APP_VERSION.
    // Read-only endpoint: не меняет state, не читает чувствительных данных,
    // доступен любому viewer'у проекта.
    {
      scope: 'project',
      method: 'GET',
      path: 'app-version',
      handle: function (ctx) {
        if (!authzGuard(ctx, 'viewer')) return;
        ctx.response.json({ version: APP_VERSION });
      }
    },

    // ── GET /check-validator ─────────────────────────────────────────────────
    // Серверная проверка — читает группы из сохранённых settings (не из тела запроса).
    {
      scope: 'project',
      method: 'GET',
      path: 'check-validator',
      handle: function (ctx) {
        if (!authzGuard(ctx, 'viewer')) return;
        ctx.response.json({
          isValidator: isValidator(ctx),
          configured:  isSettingsManagerConfigured(ctx)
        });
      }
    },

    // ── GET /check-editor ────────────────────────────────────────────────────
    {
      scope: 'project',
      method: 'GET',
      path: 'check-editor',
      handle: function (ctx) {
        if (!authzGuard(ctx, 'viewer')) return;
        ctx.response.json({
          isEditor:   isEditor(ctx),
          configured: isSettingsManagerConfigured(ctx)
        });
      }
    },

    /* v6.1.0 D82 (F5) — GET /check-assigner. Иерархия editor⊃assigner⊃viewer. */
    {
      scope: 'project',
      method: 'GET',
      path: 'check-assigner',
      handle: function (ctx) {
        if (!authzGuard(ctx, 'viewer')) return;
        ctx.response.json({
          isAssigner: isAssigner(ctx),
          configured: isSettingsManagerConfigured(ctx)
        });
      }
    },

    // ── GET /check-history-manager ──────────────────────────────────────────
    // v5.0.1 — отдельная роль для полной очистки истории.
    {
      scope: 'project',
      method: 'GET',
      path: 'check-history-manager',
      handle: function (ctx) {
        if (!authzGuard(ctx, 'viewer')) return;
        ctx.response.json({
          isHistoryManager: isHistoryManager(ctx),
          configured:       isSettingsManagerConfigured(ctx)
        });
      }
    },

    // ── v5.0.3 — Серверный черновик (на смену localStorage) ──────────────────
    // Хранится в `ssp_drafts` как dict { '<userLogin>': <draftBlob> }.
    // Каждый пользователь видит/пишет ТОЛЬКО свой слот (читаем currentUser.login).
    // Лимиты: 256 КБ на слот, 1 МБ суммарно. Авторизация — viewer.
    // Не часть ИБ-модели спринта: drafts — клиентский UI-кэш, не источник правды.
    {
      scope: 'project',
      method: 'GET',
      path: 'draft',
      handle: function (ctx) {
        if (!authzGuard(ctx, 'viewer')) return;
        var login = (ctx.currentUser && ctx.currentUser.login) || '';
        if (!login) { ctx.response.json({ data: null }); return; }
        var allDrafts = parseJson(getProp(ctx, 'ssp_drafts'), {}) || {};
        var slot = allDrafts[login] || null;
        ctx.response.json({ data: slot });
      }
    },
    {
      scope: 'project',
      method: 'POST',
      path: 'draft',
      handle: function (ctx) {
        if (!authzGuard(ctx, 'viewer')) return;
        var login = (ctx.currentUser && ctx.currentUser.login) || '';
        if (!login) { badRequest(ctx, 'auth_required'); return; }

        var body = parseBodyOrReject(ctx, ALLOWED_DRAFT_KEYS);
        if (body === null) return;

        var action = (ctx.request.getParameter('action') || '').trim();

        var allDrafts = parseJson(getProp(ctx, 'ssp_drafts'), {}) || {};
        if (typeof allDrafts !== 'object' || Array.isArray(allDrafts)) allDrafts = {};

        if (action === 'clear') {
          delete allDrafts[login];
        } else if (action && action !== 'clear') {
          badRequest(ctx, 'invalid_action');
          return;
        } else {
          // Обычное сохранение слота.
          // body.data может быть любым (ИБ-инвариант: backend этим данным не доверяет
          // и никогда не использует их в авторизационных решениях). Но всё равно
          // прогоняем sanitizeDeep против Prototype Pollution и держим лимиты.
          var slot = body.data;
          var slotStr = JSON.stringify(slot || null);
          if (slotStr.length > MAX_DRAFT_PER_USER) {
            badRequest(ctx, 'draft_too_large');
            return;
          }
          allDrafts[login] = slot;
        }

        var allStr = JSON.stringify(allDrafts);
        if (allStr.length > MAX_DRAFTS_TOTAL) {
          // Защита от runaway: если суммарно > 1 МБ, удаляем самые старые слоты
          // (по полю slot.savedAt если присутствует), оставляя текущего пользователя.
          var keys = Object.keys(allDrafts);
          var sortable = keys.map(function(k){
            var s = allDrafts[k];
            var ts = (s && typeof s === 'object' && s.savedAt) ? s.savedAt : 0;
            return { k: k, ts: ts };
          });
          sortable.sort(function(a,b){ return a.ts - b.ts; }); // oldest first
          while (allStr.length > MAX_DRAFTS_TOTAL && sortable.length > 1) {
            var oldest = sortable.shift();
            if (oldest.k === login) continue; // никогда не удаляем текущего
            delete allDrafts[oldest.k];
            allStr = JSON.stringify(allDrafts);
          }
        }

        setProp(ctx, 'ssp_drafts', allStr);
        ctx.response.json({ ok: true, savedAt: Date.now() });
      }
    },

    // ── v5.3.0 — Working copies (immutable snapshots model, D3/b) ────────────
    // Хранятся в `ssp_workdrafts` как dict { '<sprintId>_<roleKey>': workingDraft }.
    // Multi-user видимость (виден всем валидаторам).
    // GET — viewer; POST — validator; POST?action=delete&key=... — владелец или settingsManager.
    {
      scope: 'project',
      method: 'GET',
      path: 'working-drafts',
      handle: function (ctx) {
        if (!authzGuard(ctx, 'viewer')) return;
        var data = parseJson(getProp(ctx, 'ssp_workdrafts'), {}) || {};
        if (typeof data !== 'object' || Array.isArray(data)) data = {};
        ctx.response.json({ success: true, data: data });
      }
    },
    {
      scope: 'project',
      method: 'POST',
      path: 'working-drafts',
      handle: function (ctx) {
        if (!authzGuard(ctx, 'validator')) return;
        var login = (ctx.currentUser && ctx.currentUser.login) || '';
        if (!login) { badRequest(ctx, 'auth_required'); return; }

        var action = (ctx.request.getParameter('action') || '').trim();

        var data = parseJson(getProp(ctx, 'ssp_workdrafts'), {}) || {};
        if (typeof data !== 'object' || Array.isArray(data)) data = {};

        if (action === 'delete') {
          var delKey = (ctx.request.getParameter('key') || '').trim();
          if (!delKey) { badRequest(ctx, 'key_required'); return; }
          var existing = data[delKey];
          if (existing && existing.editorLogin && existing.editorLogin !== login
              && !isSettingsManager(ctx)) {
            forbidden(ctx, 'not_owner');
            return;
          }
          delete data[delKey];
          var delStr = JSON.stringify(data);
          if (delStr.length > MAX_PROP_SIZE) {
            badRequest(ctx, 'working_drafts_too_large');
            return;
          }
          setProp(ctx, 'ssp_workdrafts', delStr);
          ctx.response.json({ ok: true, deleted: delKey });
          return;
        }

        if (action && action !== 'delete') {
          badRequest(ctx, 'invalid_action');
          return;
        }

        var body = parseBodyOrReject(ctx, ALLOWED_WORKING_DRAFTS_KEYS);
        if (body === null) return;

        var inMap = body.data;
        if (!inMap || typeof inMap !== 'object' || Array.isArray(inMap)) {
          badRequest(ctx, 'invalid_data');
          return;
        }

        var out = {};
        var inKeys = Object.keys(inMap);
        for (var i = 0; i < inKeys.length; i++) {
          var k = inKeys[i];
          var d = inMap[k];
          // v1.6.0 D125 — stamp before validate+persist (defense-in-depth: nested sprint too).
          if (d && typeof d === 'object') {
            d.pluginVersion = CURRENT_PLUGIN_VERSION;
            if (d.sprint && typeof d.sprint === 'object') {
              stripDeprecatedSprintKeys(d.sprint);   /* v3.23.0 — bulk-flush несёт и старые/чужие драфты с legacy-ключами */
              d.sprint.pluginVersion = CURRENT_PLUGIN_VERSION;
            }
          }
          if (!validateWorkingDraftForWrite(d)) {
            badRequest(ctx, 'invalid_working_draft:' + k);
            return;
          }
          // Защита: editorLogin перезаписывается серверным значением для своих новых записей.
          // Для чужих записей (multi-user) — оставляем как было, но проверяем consistency:
          // клиент не должен мутировать чужой draft. Проверка: если в существующей карте
          // есть запись с editorLogin != login, и клиент прислал ту же key с другим editorLogin,
          // то это перехват — отвергаем.
          var existingForKey = data[k];
          if (existingForKey && existingForKey.editorLogin
              && existingForKey.editorLogin !== login
              && !isSettingsManager(ctx)) {
            if (d.editorLogin === login) {
              // Take-over working copy другого пользователя — запрещено
              forbidden(ctx, 'not_owner');
              return;
            }
            /* v3.2.1 — bulk-flush клиента несёт и ЧУЖИЕ записи (снимок карты на момент
               загрузки): раньше out перекрывал merge и stale-копия затирала живой чужой
               драфт (обход not_owner с сохранённым чужим editorLogin). Чужой ключ —
               серверная версия побеждает, свою копию молча пропускаем. */
            continue;
          }
          /* #67 H4 — editorLogin выводится ИЗ ХРАНИЛИЩА, клиентское значение не персистится
             никогда (SECURITY, митигация №19). Новая запись → пишущий; своя существующая →
             тот же логин; бесхозная (editorLogin пуст) → пишущий забирает владение; чужая под
             settingsManager (единственный путь сюда, см. `continue` выше) → владелец сохраняется,
             иначе bulk-flush админа настроек молча переназначал бы владельцем себя. */
          d.editorLogin = (existingForKey && existingForKey.editorLogin) ? existingForKey.editorLogin : login;
          // Размер на одну запись
          var oneStr = JSON.stringify(d);
          if (oneStr.length > MAX_WORKDRAFT_PER_KEY) {
            badRequest(ctx, 'working_draft_too_large:' + k);
            return;
          }
          out[k] = d;
        }

        // Bulk POST — это полная карта (last-write-wins). Чтобы не терять чужие drafts,
        // объединяем с серверной картой: chuжие drafts (где editorLogin != login)
        // переносим как есть, свои перезаписываем из out.
        var merged = {};
        var srvKeys = Object.keys(data);
        for (var s = 0; s < srvKeys.length; s++) {
          var sk = srvKeys[s];
          var srvD = data[sk];
          if (srvD && srvD.editorLogin && srvD.editorLogin !== login) {
            merged[sk] = srvD;
          }
        }
        var outKeys = Object.keys(out);
        for (var o = 0; o < outKeys.length; o++) {
          merged[outKeys[o]] = out[outKeys[o]];
        }

        var mergedStr = JSON.stringify(merged);
        if (mergedStr.length > MAX_WORKDRAFTS_TOTAL) {
          badRequest(ctx, 'working_drafts_too_large');
          return;
        }
        setProp(ctx, 'ssp_workdrafts', mergedStr);
        ctx.response.json({ ok: true, sizeKb: Math.round(mergedStr.length / 1024) });
      }
    },

    // ── POST /sync-acl (project-only, #25 Ф1) ────────────────────────────────
    // Зеркалит settingsManagerGroup (видна только в project-scope через ctx.settings)
    // в declared extensionProperty ssp_acl, чтобы backend-global.js резолвил
    // settings-manager без доступа к per-project app-settings. Пишет ТОЛЬКО из
    // ctx.settings (server-trusted), никогда из тела. В global scope НЕ публикуется.
    {
      scope: 'project',
      method: 'POST',
      path: 'sync-acl',
      handle: function (ctx) {
        if (!authzGuard(ctx, 'viewer')) return;
        /* Тело вынесено в syncAclMirror (#67 H9 — переиспользуется settings-save веткой). */
        var changed = syncAclMirror(ctx);
        ctx.response.json({ success: true, synced: changed });
      }
    }

  ];

// ─── Runtime exports (нужны обоим handler-файлам; вне test-guard) ────────────
exports.ENDPOINTS   = ENDPOINTS;
exports.APP_VERSION = APP_VERSION;
exports.parseJson   = parseJson;
exports.getBody     = getBody;
exports.parseBodyOrReject = parseBodyOrReject;
exports.MAX_PROP_SIZE = MAX_PROP_SIZE;

/* #45 R2 — символы ядра, нужные backend-capacity.js в YT-рантайме (первый per-feature
   backend-модуль require'ит ядро и пишет свои endpoints в core.ENDPOINTS). Вне test-guard
   — должны быть доступны в проде. Поведение-нейтрально (только расширяют поверхность). */
exports.authzGuard                  = authzGuard;
exports.getProp                     = getProp;
exports.setProp                     = setProp;
exports.filterKeys                  = filterKeys;
exports.badRequest                  = badRequest;
exports.dlog                        = dlog;
exports.forbidden                   = forbidden;
exports.isNumInRange                = isNumInRange;
exports.validatePluginVersion       = validatePluginVersion;
exports.CURRENT_PLUGIN_VERSION      = CURRENT_PLUGIN_VERSION;
exports.isSettingsManager           = isSettingsManager;
exports.isInstanceAdmin             = isInstanceAdmin;       // #51 — байпас инстанс-админа
exports.isSprintLockManager         = isSprintLockManager;   // #57-2 — право тумблера блокировки
exports.isPlannerDisabled           = isPlannerDisabled;     // #80 — гейт «планер отключён» (пикер + делегирование)
exports.isNewSprintCreation         = isNewSprintCreation;   // #57-2 — pure-детект создания (unit-тест)
exports.isPlanningManager           = isPlanningManager;
exports.isReleaseManager            = isReleaseManager;      // #48 R2.4 — релиз-роли (D-C)
exports.isReleaseEngineer           = isReleaseEngineer;     // #48 R2.4
exports.isReportingViewerA          = isReportingViewerA;    // #50 — reporting-access контур A
exports.isReportingViewerB          = isReportingViewerB;    // #50 — reporting-access контур B (B⊇A)
exports.ALLOWED_CALENDAR_KEYS       = ALLOWED_CALENDAR_KEYS;
exports.ALLOWED_ABSENCE_ENTRY_KEYS  = ALLOWED_ABSENCE_ENTRY_KEYS;
exports.ALLOWED_CAPACITY_RECORD_KEYS = ALLOWED_CAPACITY_RECORD_KEYS;
exports.ALLOWED_CAPACITY_PERSON_KEYS = ALLOWED_CAPACITY_PERSON_KEYS;
exports.ROLE_KEYS                   = ROLE_KEYS; // #45 R2 — capacity alloc-key whitelist
exports.ALLOWED_RELEASES_KEYS       = ALLOWED_RELEASES_KEYS; // #48 R1.2 — release record whitelist
exports.internalError               = internalError;         // #48 R1.2 — backend-release error path
exports.slotRev                     = slotRev;               // R6 — optimistic lock слотов (releases/absences)
exports.bumpSlotRev                 = bumpSlotRev;           // R6
exports.revConflict                 = revConflict;           // R6
exports.parseJson                   = parseJson;             // #48 R1.2 — stored blob parse

/* v1.6.0 D125 — Test-only CommonJS exports.
   ВАЖНО: Object.assign(exports, ...) вместо module.exports = {...}.
   В YT scripting runtime module существует, и прямое `module.exports = {...}`
   стирало бы exports.httpHandler — единственную точку входа плагина.
   Object.assign добавляет тест-символы к уже существующему объекту exports,
   не заменяя его. Unit tests работают через require() — получают тот же объект. */
if (typeof module !== 'undefined' && module.exports) {
  Object.assign(exports, {
    // Validators
    validateSprintForWrite:       validateSprintForWrite,
    validateSprintForRead:        validateSprintForRead,
    validateHistoryForWrite:      validateHistoryForWrite,
    validateHistoryForRead:       validateHistoryForRead,
    validateWorkingDraftForWrite: validateWorkingDraftForWrite,
    validateWorkingDraftForRead:  validateWorkingDraftForRead,
    validatePluginVersion:        validatePluginVersion,
    validateMigrationLog:         validateMigrationLog,
    // Migration
    migrateSprintObj:             migrateSprintObj,
    migrateRoleItemsObj:          migrateRoleItemsObj,
    migrateSettingsObj:           migrateSettingsObj,        // v2.15.2 — legacy dev1c→devPlatform settings ремап
    migrateHistoryArr:            migrateHistoryArr,
    migrateSnap:                  migrateSnap,
    versionLt:                    versionLt,
    _appendMigrationLog:          _appendMigrationLog,
    // Schema
    SCHEMA_MIGRATIONS:            SCHEMA_MIGRATIONS,
    CURRENT_PLUGIN_VERSION:       CURRENT_PLUGIN_VERSION,
    ALLOWED_SPRINT_KEYS:          ALLOWED_SPRINT_KEYS,
    ALLOWED_HISTORY_SNAP_KEYS:    ALLOWED_HISTORY_SNAP_KEYS,
    ALLOWED_WORKING_DRAFT_KEYS:   ALLOWED_WORKING_DRAFT_KEYS,
    ALLOWED_SETTINGS_KEYS:        ALLOWED_SETTINGS_KEYS,
    ALLOWED_ITEM_KEYS:            ALLOWED_ITEM_KEYS,
    ALLOWED_KPE_KEYS:             ALLOWED_KPE_KEYS,
    validateItem:                 validateItem,
    validateSettings:             validateSettings,
    ADMIN_TIER_SETTINGS_KEYS:     ADMIN_TIER_SETTINGS_KEYS,   // #22
    mergeAdminTierFromStored:     mergeAdminTierFromStored,   // #22
    // Auth helpers (test-only)
    userInGroups:                 userInGroups,
    isPlanningManager:            isPlanningManager,          // #22
    isEditor:                     isEditor,                   // #51 — байпас-контракт
    isValidator:                  isValidator,                // #51
    isAssigner:                   isAssigner,                 // #51
    isHistoryManager:             isHistoryManager,           // #51
  });
}
