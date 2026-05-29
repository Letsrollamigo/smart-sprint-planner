/**
 * Smart Sprint Planner — HTTP Handler (project scope)
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

var entities = require('@jetbrains/youtrack-scripting-api/entities');

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

function getBody(ctx) {
  try {
    var raw = ctx.request.body;
    if (!raw) return {};
    // Лимит размера сырого тела — защита от DoS на парсинг
    if (typeof raw === 'string' && raw.length > MAX_REQUEST_BODY) {
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
    dlog(ctx, 'getBody: parse error');
  }
  return {};
}

// Белые списки ключей верхнего уровня
var ALLOWED_SPRINT_DATA_KEYS = ['sprint', 'roleItems', 'settings', 'items'];
var ALLOWED_HISTORY_KEYS     = ['history'];
var ALLOWED_UPDATE_ISSUE_KEYS = ['issueId', 'fieldName', 'value', 'type'];
/* v6.1.0 D80 (F3) — bulk read assignee из YouTrack для перечисленных issueId. */
var ALLOWED_REFRESH_ASSIGNEES_KEYS = ['issueIds', 'fieldName'];
var MAX_REFRESH_ASSIGNEES_BATCH    = 200;
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
  'editingFromHistory',
  'historyIdx',
  'sprintFieldVal',
  'versionFieldVal',
  'personalPlanning',
  'migrationLog',
  'pluginVersion',
  'sprintGoal'
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
  'goalRetroNote'
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
var CURRENT_PLUGIN_VERSION = '2.1.7';
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

function migrateHistoryArr(h) {
  if (!Array.isArray(h)) return h;
  h.forEach(function (rec) {
    if (!rec || typeof rec !== 'object') return;
    if (rec.status) rec.status = migrateStatus(rec.status);
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
var DEPRECATED_HISTORY_SNAP_KEYS = ['gantt'];
function stripDeprecatedHistoryKeys(h) {
  if (!Array.isArray(h)) return h;
  for (var i = 0; i < h.length; i++) {
    var rec = h[i];
    if (!rec || typeof rec !== 'object') continue;
    for (var j = 0; j < DEPRECATED_HISTORY_SNAP_KEYS.length; j++) {
      var dk = DEPRECATED_HISTORY_SNAP_KEYS[j];
      if (Object.prototype.hasOwnProperty.call(rec, dk)) delete rec[dk];
    }
  }
  return h;
}
var DEPRECATED_SPRINT_KEYS = ['gantt'];
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
  /* v1.7.0 D128 — State Rollup.
     sprint/history/working-draft shape НЕ меняется (settings additive, snapshot no-op).
     Settings-defaults инициализируются на GET /settings load (§8.2 spec), не здесь. */
  { from: '1.6.0', to: '1.7.0',
    migrate: function (snap) { /* no-op: shape unchanged */ },
    note: 'v1.7.0: State Rollup — stateRollup* settings keys added; sprint/history shape unchanged'
  },
  /* v1.8.0 D130 — Etap В.2 — External ticket ID.
     item.externalTicketId — optional additive field; undefined допустим на старых snapshot'ах.
     Settings: fieldExternalTicketId — optional string field name; null/undefined допустимо. */
  { from: '1.7.0', to: '1.8.0',
    migrate: function (snap) { /* no-op: items.externalTicketId — optional additive field */ },
    note: 'v1.8.0: Added optional externalTicketId on sprint items (Etap В.2)'
  },
  /* v1.9.0 D132 — Etap Г — Sprint goals + Stand-up assist.
     sprint.sprintGoal — optional string ≤ 500 (shared sprint-level goal).
     history[i].sprintGoal — optional string ≤ 500 (frozen from sprint at confirm).
     history[i].goalOutcome — optional enum {achieved,partial,missed}.
     history[i].goalRetroNote — optional string ≤ 1000 (retro comment at confirm).
     settings.standupDoneStates — optional array<string>, state names for Done bucket.
     All fields optional/additive — no-op migration. */
  { from: '1.8.0', to: '1.9.0',
    migrate: function (snap) { /* no-op: all goal/standup fields are optional additive */ },
    note: 'v1.9.0: Added optional sprintGoal (_sprint + _history) + goalOutcome/goalRetroNote (_history) + standupDoneStates (settings) — Etap Г'
  },
  /* v1.9.3 D134 — Hotfix Etap О.1 + О.2/П.2: per-role status в saveRoleHistorySnapshot
     (cross-role contamination в History/Excel) + resumeWorkingDraft грузит _roleItems
     для всех ролей из их history snapshot (не только активную из draft). Cherry-pick
     из proprietary v7.3.1 + v7.3.2. Schema без изменений — no-op entry для registry. */
  { from: '1.9.0', to: '1.9.3',
    migrate: function (snap) { /* no-op: pure runtime fixes, no schema impact */ },
    note: 'v1.9.3: Hotfix per-role status contamination (О.1) + stale _roleItems on edit (О.2/П.2) — schema unchanged'
  },
  /* v1.9.4 D135 — Visual refresh: new Gantt-cascade app icon (light + dark).
     Pure asset swap — no schema, no runtime behaviour changes. */
  { from: '1.9.3', to: '1.9.4',
    migrate: function (snap) { /* no-op: icon-only asset update, no schema impact */ },
    note: 'v1.9.4: Visual refresh — new app icon (light + dark) — schema unchanged'
  },
  { from: '1.9.4', to: '1.9.6',
    migrate: function (snap) { return snap; }, /* no-op: UI-only polish (Ring tier 1), no shape change */
    note: 'v1.9.6: Ring UI tier 1 — emoji→SVG icons, focus-ring, z-index scale, aria sweep — schema unchanged'
  },
  { from: '1.9.6', to: '1.9.7',
    migrate: function (snap) { return snap; }, /* no-op: i18n aria translations only, no schema change */
    note: 'v1.9.7: aria translations only — schema unchanged'
  },
  { from: '1.9.7', to: '1.9.9',
    migrate: function (snap) { return snap; }, /* no-op: Ring UI tier 2 is frontend-only, no schema change */
    note: 'v1.9.9: Ring UI tier 2 (CSS classes) — schema unchanged'
  },
  { from: '1.9.9', to: '1.9.10',
    migrate: function (snap) { return snap; }, /* no-op: group search fix is frontend-only, no schema change */
    note: 'v1.9.10: Group search visibility hotfix ($top: 5000 + auto-refresh on dropdown open) — schema unchanged'
  },
  { from: '1.9.10', to: '1.9.11',
    migrate: function (snap) { return snap; }, /* no-op: modal/toast UX overhaul is frontend-only, no schema change */
    note: 'v1.9.11: Modal+toast UX overhaul (B-32) + B-31 polish (textarea/buttons) — schema unchanged'
  },
  { from: '1.9.11', to: '1.10.0',
    migrate: function (snap) { return snap; }, /* no-op: sort-by-assignee is frontend-only, no schema change */
    note: 'v1.10.0: Sort tasks by assignee column (B-23) — schema unchanged'
  },
  { from: '1.10.0', to: '2.1.0',
    migrate: function (snap) { return snap; }, /* no-op: Ring UI ярус 3 + Ring Input mount-points are frontend-only, no schema change */
    note: 'v2.1.0: Ring UI ярус 3 — full Ring Table migration + Ring Input mount-points для main-view text/number/textarea fields + visual unification'
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

/* v1.6.0 D125 — pluginVersion: optional string 'X.Y.Z', max 32 chars.
   Absent/null → accepted (pre-v1.6.0 snapshots). Malformed string → rejected. */
function validatePluginVersion(v) {
  if (v == null) return true;
  if (typeof v !== 'string') return false;
  if (v.length > 32) return false;
  return /^\d+\.\d+\.\d+$/.test(v);
}

/* v1.6.0 D125 — Sprint validator split: ForWrite (strict whitelist) + ForRead (tolerant).
   Deprecated alias validateSprint → validateSprintForWrite, removed in v1.7.0. */
function validateSprintForWrite(sprint) {
  if (!sprint || typeof sprint !== 'object') return false;
  var keys = Object.keys(sprint);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (ALLOWED_SPRINT_KEYS.indexOf(k) < 0 && !/^(resource|remain)[A-Za-z0-9_]*$/.test(k)) {
      return false;
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
  if (sprint.historyIdx !== undefined && sprint.historyIdx !== null && !assertNum(sprint.historyIdx)) return false;
  if (sprint.editingFromHistory !== undefined && sprint.editingFromHistory !== null
      && typeof sprint.editingFromHistory !== 'boolean') return false;
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
  if (validateMigrationLog(sprint.migrationLog, 'sprint') !== null) return false;
  if (!validatePluginVersion(sprint.pluginVersion)) return false;
  return true;
}

function validateSprintForRead(sprint) {
  if (!sprint || typeof sprint !== 'object') return false;
  var keys = Object.keys(sprint);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (ALLOWED_SPRINT_KEYS.indexOf(k) < 0 && !/^(resource|remain)[A-Za-z0-9_]*$/.test(k)) {
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
  if (sprint.historyIdx !== undefined && sprint.historyIdx !== null && !assertNum(sprint.historyIdx)) return false;
  if (sprint.editingFromHistory !== undefined && sprint.editingFromHistory !== null
      && typeof sprint.editingFromHistory !== 'boolean') return false;
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
  if (validateMigrationLog(sprint.migrationLog, 'sprint') !== null) return false;
  if (!validatePluginVersion(sprint.pluginVersion)) return false;
  return true;
}

// @deprecated since v1.6.0; use validateSprintForWrite() or validateSprintForRead().
function validateSprint(sprint) { return validateSprintForWrite(sprint); }

// Whitelist ключей задачи (без динамических estimate_*/fact_*/alloc_*/allocation*/estH_*/factH_*)
var ALLOWED_ITEM_KEYS = [
  'issueId','url','title','priority','xpriority','state','system',
  'version','inclusionStatus','assignee','addedBy','addedAt',
  /* v1.8.0 D130 — Etap В.2 — external ticket ID (optional, populated from
     _settings.fieldExternalTicketId at pick/refresh time). Read-only in UI. */
  'externalTicketId'
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
                   'version', 'assignee', 'addedBy', 'externalTicketId'];
  for (var s = 0; s < strFields.length; s++) {
    if (!assertStr(item[strFields[s]], 1000)) return false;
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
  /* v1.8.0 D130 — Etap В.2 — external ticket ID field name (string field in YT). */
  'fieldExternalTicketId',
  // Группы (без settingsManagerGroup)
  'validationGroups','validationGroupNames','editGroups','editGroupNames',
  'historyClearGroups','historyClearGroupNames',
  /* v6.1.0 D82 (F5) — assigner-роль (variant b: assignee + start/end-dates). */
  'assignerGroups','assignerGroupNames',
  // Параметры планирования
  'dynEditEnabled','personalPlanningEnabled','usePersonalForResource',
  /* v1.4.0 — ручной ввод ресурса по исполнителям (дочерний к personalPlanning).
     При включении entry.resource в personalPlanning.resourcesByAssignee становится
     manual-input в ЧЧ; авторасчёт по грейду игнорируется. */
  'manualPersonalResource',
  'nkcJanuary','nkcMay','nkcOther','rate','participation',
  'kpe',
  /* v6.3.0 D110 — флаг скрытия панели диагностического лога из UI. */
  'hideDiagLogUi',
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
  'cascadeParentLinkInward',
  'cascadeParentLinkOutward',
  // Метаданные
  'savedAt',
  // v5.3.0 — миграционный флаг (commit-as-PLANNING для in-flight v5.2.0 правок)
  'migratedTo',
  /* v1.7.0 D128 — State Rollup: parent.State ← min(children.State).
     stateRollupEnabled       — master toggle, default false.
     stateRollupOrder         — ordered array of state names (least → most progressed).
     stateRollupResolvedStates— states treated as resolved; guard prevents re-opening.
     stateRollupFloor         — optional floor state (parent won't go below this).
     stateRollupStrategy      — enum, v1.7.0 accepts only 'min' (reserved for future).
     stateRollupRescanRequested    — manual rescan flag (v1.7.1 impl, forward-compat key).
     stateRollupRescanRequestedAt  — timestamp for rescan cooldown (v1.7.1 impl). */
  'stateRollupEnabled',
  'stateRollupOrder',
  'stateRollupResolvedStates',
  'stateRollupFloor',
  'stateRollupStrategy',
  'stateRollupRescanRequested',
  'stateRollupRescanRequestedAt',
  /* v1.9.0 D132 — Stand-up assist: admin-configurable list of state names that count as Done. */
  'standupDoneStates'
];

/* v1.7.0: KPE whitelist accepts both legacy Russian keys (Стажёр/Джун/Мидл/Синьор)
   and canonical English keys (Intern/Junior/Middle/Senior, frontend storage layer
   since v1.4.1 D128 — see widgets/main/src/legacy-monolith.js GRADES_LOCAL).
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
    'fieldSprint','fieldVersion'];
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
  if (settings.historyClearGroupNames !== undefined && settings.historyClearGroupNames !== null
      && !isStrArr(settings.historyClearGroupNames, 500, 100)) return false;
  // Булевы флаги
  var boolKeys = ['dynEditEnabled','personalPlanningEnabled','usePersonalForResource','manualPersonalResource','hideDiagLogUi','dtaEnabled','dtaWarningsEnabled','cascadeAggregationEnabled','forbidContainerWorkItems',
    /* v1.7.0 D128 — State Rollup */ 'stateRollupEnabled','stateRollupRescanRequested'];
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
  /* v1.3.0 Cascade — string-keys ≤200 для kind-field-name + 2 link names. */
  var cascadeStrKeys = ['cascadeKindField','cascadeParentLinkInward','cascadeParentLinkOutward'];
  for (var cs = 0; cs < cascadeStrKeys.length; cs++) {
    if (!assertStr(settings[cascadeStrKeys[cs]], 200)) return false;
  }
  /* v1.3.0 Cascade — array<string ≤200>, max 50 для level-2/level-3 values. */
  if (settings.cascadeLevel2Values !== undefined && settings.cascadeLevel2Values !== null
      && !isStrArr(settings.cascadeLevel2Values, 200, 50)) return false;
  if (settings.cascadeLevel3Values !== undefined && settings.cascadeLevel3Values !== null
      && !isStrArr(settings.cascadeLevel3Values, 200, 50)) return false;
  // v5.3.0 — migratedTo: строка-маркер версии миграции (например '5.3')
  if (settings.migratedTo !== undefined && settings.migratedTo !== null
      && (typeof settings.migratedTo !== 'string' || settings.migratedTo.length > 20)) return false;
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
  // stateRollupRescanRequestedAt: number (ms timestamp) | null
  if (settings.stateRollupRescanRequestedAt !== undefined && settings.stateRollupRescanRequestedAt !== null) {
    if (typeof settings.stateRollupRescanRequestedAt !== 'number'
        || !isFinite(settings.stateRollupRescanRequestedAt)) return false;
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
  return true;
}

/* v1.6.0 D125 — History validator split: ForWrite (strict) + ForRead (tolerant).
   Deprecated alias validateHistory → validateHistoryForWrite, removed in v1.7.0. */
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

// @deprecated since v1.6.0; use validateHistoryForWrite() or validateHistoryForRead().
function validateHistory(history) { return validateHistoryForWrite(history); }

/* v1.6.0 D125 — WorkingDraft validator split: ForWrite (strict) + ForRead (tolerant).
   Deprecated alias validateWorkingDraft → validateWorkingDraftForWrite, removed v1.7.0. */
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

// @deprecated since v1.6.0; use validateWorkingDraftForWrite() or validateWorkingDraftForRead().
function validateWorkingDraft(d) { return validateWorkingDraftForWrite(d); }

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
  if (!isSettingsManagerConfigured(ctx)) return false;
  var savedSettings  = parseJson(getProp(ctx, 'ssp_settings'), null);
  var editGroupIds   = (savedSettings && savedSettings.editGroups)     || [];
  var editGroupNames = (savedSettings && savedSettings.editGroupNames) || [];
  if (!editGroupIds.length && !editGroupNames.length) return false;
  return userInGroups(ctx, editGroupIds, editGroupNames);
}

/**
 * Проверяет права валидатора по настройкам ssp_settings.validationGroups.
 * Deny-by-default — аналогично isEditor.
 */
function isValidator(ctx) {
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
  if (!isSettingsManagerConfigured(ctx)) return false;
  var savedSettings = parseJson(getProp(ctx, 'ssp_settings'), null);
  var ids   = (savedSettings && savedSettings.historyClearGroups)     || [];
  var names = (savedSettings && savedSettings.historyClearGroupNames) || [];
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
  /* v6.1.0 D82 (F5) — assigner-уровень. Иерархия editor⊃assigner⊃viewer:
     editor / settingsManager автоматически проходят. */
  if (role === 'assigner') {
    if (isEditor(ctx) || isAssigner(ctx) || isSettingsManager(ctx)) return true;
    forbidden(ctx, 'assigner_rights_required');
    return false;
  }
  // Неизвестная роль — fail-closed
  forbidden(ctx, 'unknown_role');
  return false;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

exports.httpHandler = {
  endpoints: [

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

        // Обратная совместимость: если roleItems нет, читаем старый ssp_items
        if (!roleItems) {
          var oldItems = parseJson(getProp(ctx, 'ssp_items'), []);
          if (oldItems && oldItems.length > 0) {
            var firstRole = (settings && settings.activeRoles && settings.activeRoles[0]) || 'devPlatform';
            roleItems = {};
            roleItems[firstRole] = oldItems;
          } else {
            roleItems = {};
          }
        }

        // Миграция legacy русских строк → латинские enum-коды (read-time normalization).
        // Storage может содержать данные от v4.5.x — клиент должен получать только латинские.
        sprint    = migrateSprintObj(sprint);
        roleItems = migrateRoleItemsObj(roleItems);

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
    // editor: sprint / roleItems / items
    // settingsManager: settings
    // validator: ?action=validate
    {
      scope: 'project',
      method: 'POST',
      path: 'sprint-data',
      handle: function (ctx) {
        if (!authzGuard(ctx, 'viewer')) return;

        var body = getBody(ctx);
        if (body.__rejected__) {
          badRequest(ctx, body.__reason__ || 'invalid_input');
          return;
        }

        body = filterKeys(body, ALLOWED_SPRINT_DATA_KEYS);

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

        if (body.sprint !== undefined) {
          if (action === 'assignerSync') {
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
            ctx.response.json({ success: true, action: 'assignerSync' });
            return;
          }
          if (action !== 'validate' && !authzGuard(ctx, 'editor')) return;
          // v6.1.0 D69 — silent strip legacy `gantt` (см. stripDeprecatedSprintKeys).
          body.sprint = stripDeprecatedSprintKeys(body.sprint);
          // v1.6.0 D125 — stamp before validate+persist.
          body.sprint.pluginVersion = CURRENT_PLUGIN_VERSION;
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
            ROLE_KEYS.forEach(function (rk) {
              var resKey = 'resource' + rk.charAt(0).toUpperCase() + rk.slice(1);
              var allocKey = 'alloc_' + rk;
              var resource = body.sprint[resKey];
              if (typeof resource !== 'number') return;
              var arr = body.roleItems[rk];
              if (!Array.isArray(arr)) return;
              var sumAlloc = 0;
              arr.forEach(function (it) {
                if (it && it.inclusionStatus
                    && (it.inclusionStatus === 'INC_PLANNED' || it.inclusionStatus === 'INC_UNPLANNED')
                    && typeof it[allocKey] === 'number') {
                  sumAlloc += it[allocKey];
                }
              });
              if (sumAlloc > resource) {
                warnings.push('overlimit:' + rk);
                dlog(ctx, 'overlimit_validate role=' + rk + ' rem=' + (resource - sumAlloc));
              }
            });
          }
        }

        if (body.roleItems !== undefined) {
          if (!authzGuard(ctx, 'editor')) return;
          if (!validateRoleItems(body.roleItems)) {
            badRequest(ctx, 'invalid_role_items_structure');
            return;
          }
          var riStr = JSON.stringify(body.roleItems);
          if (riStr.length > MAX_PROP_SIZE) {
            badRequest(ctx, 'role_items_data_too_large');
            return;
          }
          setProp(ctx, 'ssp_roleitems', riStr);
        }

        if (body.settings !== undefined) {
          // settings — только settings-manager
          if (!authzGuard(ctx, 'settingsManager')) return;
          if (!validateSettings(body.settings)) {
            badRequest(ctx, 'invalid_settings_structure');
            return;
          }
          var stStr = JSON.stringify(body.settings);
          if (stStr.length > MAX_PROP_SIZE) {
            badRequest(ctx, 'settings_data_too_large');
            return;
          }
          setProp(ctx, 'ssp_settings', stStr);

          // Подчистка orphan roleItems: удаляем задачи отключённых ролей
          if (Array.isArray(body.settings.activeRoles)) {
            var saved = parseJson(getProp(ctx, 'ssp_roleitems'), null);
            if (saved && typeof saved === 'object') {
              var activeSet = {};
              body.settings.activeRoles.forEach(function (k) { activeSet[k] = true; });
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

        if (body.items !== undefined) {
          // Legacy ключ — оставляем для обратной совместимости READ-fallback.
          // На запись требуется editor.
          if (!authzGuard(ctx, 'editor')) return;
          if (!Array.isArray(body.items) || body.items.length > 1000) {
            badRequest(ctx, 'invalid_items_structure');
            return;
          }
          for (var li = 0; li < body.items.length; li++) {
            if (!validateItem(body.items[li])) {
              badRequest(ctx, 'invalid_items_structure');
              return;
            }
          }
          var legacyStr = JSON.stringify(body.items);
          if (legacyStr.length > MAX_PROP_SIZE) {
            badRequest(ctx, 'items_data_too_large');
            return;
          }
          setProp(ctx, 'ssp_items', legacyStr);
        }

        var resp = { success: true, saved: Object.keys(body) };
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
          orphanGanttBySprintId: orphanGanttBySprintId
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
        if (action && action !== 'clear' && action !== 'assignerSync') {
          badRequest(ctx, 'invalid_action');
          return;
        }

        if (action === 'clear') {
          if (!authzGuard(ctx, 'historyManager')) return;
          // Очистка — игнорируем тело, просто пишем пустой массив
          setProp(ctx, 'ssp_history', '[]');
          dlog(ctx, 'history cleared by ' + ((ctx.currentUser && ctx.currentUser.login) || '?'));
          ctx.response.json({ success: true, cleared: true });
          return;
        }

        /* v6.1.0 D82 (F5) — assigner partial save: merge body.history[i].personalPlanning
           в существующий snap по sprintId. Прочие поля snap'ов не трогаются. */
        if (action === 'assignerSync') {
          if (!authzGuard(ctx, 'assigner')) return;
          var bodyAS = getBody(ctx);
          if (bodyAS.__rejected__) { badRequest(ctx, bodyAS.__reason__ || 'invalid_input'); return; }
          bodyAS = filterKeys(bodyAS, ALLOWED_HISTORY_KEYS);
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
            if (!(inc.sprintId in byId)) continue;
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
          ctx.response.json({ success: true, action: 'assignerSync' });
          return;
        }

        if (!authzGuard(ctx, 'validator')) return;

        var body = getBody(ctx);
        if (body.__rejected__) {
          badRequest(ctx, body.__reason__ || 'invalid_input');
          return;
        }
        body = filterKeys(body, ALLOWED_HISTORY_KEYS);

        if (body.history !== undefined) {
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
        }
        ctx.response.json({ success: true });
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
        ctx.response.json({
          canManage:  canManage,
          configured: true,
          groupName:  groupName,
          reason:     canManage ? 'ok' : 'not_in_group'
        });
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
        ctx.response.json({ version: '2.1.11' });
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

        var body = getBody(ctx);
        if (body.__rejected__) {
          badRequest(ctx, body.__reason__ || 'invalid_input');
          return;
        }
        body = filterKeys(body, ALLOWED_DRAFT_KEYS);

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

        var body = getBody(ctx);
        if (body.__rejected__) {
          badRequest(ctx, body.__reason__ || 'invalid_input');
          return;
        }
        body = filterKeys(body, ALLOWED_WORKING_DRAFTS_KEYS);

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
            if (d.sprint && typeof d.sprint === 'object') d.sprint.pluginVersion = CURRENT_PLUGIN_VERSION;
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
              && d.editorLogin === login
              && !isSettingsManager(ctx)) {
            // Take-over working copy другого пользователя — запрещено
            forbidden(ctx, 'not_owner');
            return;
          }
          // Перезаписываем editorLogin на серверное значение если запись новая
          if (!existingForKey) {
            d.editorLogin = login;
          }
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

    // ── GET /field-values ────────────────────────────────────────────────────
    {
      scope: 'project',
      method: 'GET',
      path: 'field-values',
      handle: function (ctx) {
        if (!authzGuard(ctx, 'viewer')) return;
        var fieldName = ctx.request.getParameter('fieldName');
        if (!fieldName) {
          badRequest(ctx, 'field_name_required');
          return;
        }
        // Валидация имени поля: лимит длины + запрет управляющих символов и < > "
        // (имена YouTrack-полей могут содержать точки, скобки, амперсанды, апострофы и пр.)
        if (typeof fieldName !== 'string' || fieldName.length > 200 || /[\x00-\x1F<>"]/.test(fieldName)) {
          badRequest(ctx, 'invalid_field_name');
          return;
        }
        var values = [];
        var debugInfo = { searched: fieldName, found: false };
        try {
          var pf = null;
          if (ctx.project.findFieldByName) {
            try { pf = ctx.project.findFieldByName(fieldName); } catch (e1) { /* ignore */ }
          }
          if (!pf && ctx.project.fields) {
            ctx.project.fields.forEach(function (f) {
              if (!pf && (f.name || '') === fieldName) pf = f;
            });
          }
          if (!pf && ctx.project.fields) {
            var fn = fieldName.trim().toLowerCase();
            ctx.project.fields.forEach(function (f) {
              if (!pf && (f.name || '').trim().toLowerCase() === fn) pf = f;
            });
          }
          if (pf) {
            debugInfo.found = true;
            if (pf.values && typeof pf.values.forEach === 'function') {
              pf.values.forEach(function (v) {
                try {
                  if (!(v.isArchived || v.archived || false) && v.name) values.push(v.name);
                } catch (ve) { /* ignore */ }
              });
            }
          }
        } catch (e) {
          dlog(ctx, 'field-values error: ' + String(e && e.message));
          ctx.response.json({ success: false, error: 'internal_error', values: [], debug: debugInfo });
          return;
        }
        ctx.response.json({ success: !!values.length || debugInfo.found, fieldName: fieldName, values: values, debug: debugInfo });
      }
    },

    // ── GET /get-user-field-values ──────────────────────────────────────────
    {
      scope: 'project',
      method: 'GET',
      path: 'get-user-field-values',
      handle: function (ctx) {
        if (!authzGuard(ctx, 'viewer')) return;
        var fieldName = (ctx.request.getParameter('fieldName') || '').trim();
        if (!fieldName) {
          badRequest(ctx, 'field_name_required');
          return;
        }
        if (fieldName.length > 200 || /[\x00-\x1F<>"]/.test(fieldName)) {
          badRequest(ctx, 'invalid_field_name');
          return;
        }
        var users = [];
        var seen  = {};
        var debug = { fieldName: fieldName, found: false, method: 'none' };
        try {
          var pf = null;
          if (ctx.project.findFieldByName) {
            try { pf = ctx.project.findFieldByName(fieldName); } catch (e1) { /* ignore */ }
          }
          if (!pf && ctx.project.fields) {
            ctx.project.fields.forEach(function (f) {
              if (!pf && (f.name || '').trim().toLowerCase() === fieldName.trim().toLowerCase()) pf = f;
            });
          }
          if (!pf) {
            ctx.response.json({ success: false, error: 'field_not_found', users: [], debug: debug });
            return;
          }
          debug.found = true;

          function addUser(u) {
            var login = u.login || u.name || '';
            if (!login || seen[login]) return;
            var isBot = login.indexOf('svc') >= 0 || login.indexOf('service') >= 0 ||
                        login.indexOf('_uas') >= 0 || login.indexOf('pyrus') >= 0;
            if (isBot) return;
            seen[login] = true;
            users.push({ login: login, fullName: u.fullName || u.name || login });
          }

          function iterCollection(col, fn) {
            if (!col) return;
            if (typeof col.forEach === 'function') { col.forEach(fn); return; }
            if (typeof col.size !== 'undefined' && typeof col.get === 'function') {
              for (var i = 0; i < col.size; i++) { try { fn(col.get(i)); } catch (e) { /* ignore */ } }
              return;
            }
            if (typeof col.length !== 'undefined') {
              for (var j = 0; j < col.length; j++) { try { fn(col[j]); } catch (e) { /* ignore */ } }
            }
          }

          var bundle = pf.bundle || null;
          if (bundle) {
            debug.method = 'bundle';
            try { iterCollection(bundle.users, addUser); } catch (e) { /* ignore */ }
            try {
              iterCollection(bundle.groups, function (g) {
                var members = g.transitiveMembers || g.usersWithoutGroupMembers || g.users || g.members;
                iterCollection(members, addUser);
              });
            } catch (e) { /* ignore */ }
          }
          if (!users.length && pf.groups) {
            debug.method = 'pf.groups';
            try {
              iterCollection(pf.groups, function (g) {
                var members = g.transitiveMembers || g.users || g.members;
                iterCollection(members, addUser);
              });
            } catch (e) { /* ignore */ }
          }
          if (!users.length && pf.values) {
            debug.method = 'pf.values';
            try { iterCollection(pf.values, function (v) { if (v && v.login) addUser(v); }); } catch (e) { /* ignore */ }
          }
          if (!users.length) {
            debug.method = 'fallback-current-user';
            var me = ctx.currentUser;
            if (me) users.push({ login: me.login || '', fullName: me.fullName || me.name || me.login || '' });
          }
          users.sort(function (a, b) { return (a.fullName || '').localeCompare(b.fullName || '', 'ru'); });
          ctx.response.json({ success: true, users: users, debug: debug });
        } catch (e) {
          dlog(ctx, 'get-user-field-values error: ' + String(e && e.message));
          ctx.response.json({ success: false, error: 'internal_error', users: [], debug: debug });
        }
      }
    },

    // ── POST /update-issue-field ─────────────────────────────────────────────
    // v6.1.0 D82 (F5) — assigner-уровень: иерархия editor⊃assigner (variant b).
    {
      scope: 'project',
      method: 'POST',
      path: 'update-issue-field',
      handle: function (ctx) {
        if (!authzGuard(ctx, 'assigner')) return;

        var body = getBody(ctx);
        if (body.__rejected__) {
          badRequest(ctx, body.__reason__ || 'invalid_input');
          return;
        }
        body = filterKeys(body, ALLOWED_UPDATE_ISSUE_KEYS);

        var issueId   = body.issueId;
        var fieldName = body.fieldName;
        var value     = body.value;
        var type      = body.type || 'enum';

        var ALLOWED_TYPES = ['period', 'enum', 'state', 'version', 'owned', 'build', 'user'];
        if (!issueId || !fieldName ||
            typeof issueId !== 'string' || issueId.length > 100 ||
            typeof fieldName !== 'string' || fieldName.length > 200 ||
            ALLOWED_TYPES.indexOf(type) < 0) {
          badRequest(ctx, 'invalid_update_issue_params');
          return;
        }
        // Regex для issueId (ProjectKey-Number)
        if (!/^[A-Za-z][A-Za-z0-9_]*-\d+$/.test(issueId)) {
          badRequest(ctx, 'invalid_issue_id');
          return;
        }
        // Валидация fieldName: лимит длины + запрет управляющих символов и < > "
        if (fieldName.length > 200 || /[\x00-\x1F<>"]/.test(fieldName)) {
          badRequest(ctx, 'invalid_field_name');
          return;
        }

        try {
          var issue = entities.Issue.findById(issueId);
          if (!issue) {
            ctx.response.json({ success: false, error: 'issue_not_found' });
            return;
          }

          var projectField = null;
          try { projectField = issue.project.findFieldByName(fieldName); } catch (fe) { /* ignore */ }

          if (type === 'user') {
            if (!projectField) {
              ctx.response.json({ success: false, error: 'field_not_found' });
              return;
            }
            var userVal = null;
            if (value !== null && value !== undefined) {
              try { userVal = entities.User.findByLogin(String(value).substring(0, 200)); } catch (_) {}
            }
            if (value !== null && !userVal) {
              ctx.response.json({ success: false, error: 'user_not_found' });
              return;
            }
            issue.fields[projectField.name] = userVal;
            ctx.response.json({ success: true, issueId: issueId, fieldName: fieldName });
            return;
          } else if (type === 'period') {
            var mins = parseInt(value) || 0;
            if (!isFinite(mins) || mins < 0 || mins > 100000) {
              badRequest(ctx, 'invalid_period_value');
              return;
            }
            if (projectField) {
              issue.fields[projectField.name] = mins;
            } else {
              issue.fields.forEach(function (f) {
                if (f.projectCustomField && (f.projectCustomField.name || '') === fieldName) {
                  f.value = mins;
                }
              });
            }
          } else {
            if (!projectField) {
              ctx.response.json({ success: false, error: 'field_not_found' });
              return;
            }
            // value может быть null (сброс поля)
            var bundleValue = null;
            if (value !== null && value !== undefined && projectField.findValueByName) {
              bundleValue = projectField.findValueByName(String(value).substring(0, 500));
            }
            if (value !== null && !bundleValue) {
              ctx.response.json({ success: false, error: 'value_not_found' });
              return;
            }
            issue.fields[projectField.name] = bundleValue;
          }
          ctx.response.json({ success: true, issueId: issueId, fieldName: fieldName });
        } catch (e) {
          dlog(ctx, 'update-issue-field error: ' + String(e && e.message));
          ctx.response.json({ success: false, error: 'internal_error' });
        }
      }
    },

    /* ── POST /refresh-assignees ───────────────────────────────────────────────
       v6.1.0 D80 (F3) — bulk read поля Assignee из YouTrack для перечисленных issueId.
       Body: { issueIds: ['ABC-1','ABC-2',...], fieldName: 'Назначен' (имя поля в YT) }
       Response: { success: true, assignees: { 'ABC-1': {login, fullName} | null, ... } }
       Authz: viewer (read-only). */
    {
      scope: 'project',
      method: 'POST',
      path: 'refresh-assignees',
      handle: function (ctx) {
        if (!authzGuard(ctx, 'viewer')) return;

        var body = getBody(ctx);
        if (body.__rejected__) {
          badRequest(ctx, body.__reason__ || 'invalid_input');
          return;
        }
        body = filterKeys(body, ALLOWED_REFRESH_ASSIGNEES_KEYS);

        var issueIds = body.issueIds;
        var fieldName = body.fieldName;
        if (!Array.isArray(issueIds) || !issueIds.length || issueIds.length > MAX_REFRESH_ASSIGNEES_BATCH) {
          badRequest(ctx, 'invalid_issue_ids');
          return;
        }
        if (typeof fieldName !== 'string' || !fieldName.length || fieldName.length > 200
            || /[\x00-\x1F<>"]/.test(fieldName)) {
          badRequest(ctx, 'invalid_field_name');
          return;
        }
        var ID_RE = /^[A-Za-z][A-Za-z0-9_]*-\d+$/;
        for (var i = 0; i < issueIds.length; i++) {
          if (typeof issueIds[i] !== 'string' || !ID_RE.test(issueIds[i])) {
            badRequest(ctx, 'invalid_issue_id_in_list');
            return;
          }
        }

        var assignees = {};
        for (var k = 0; k < issueIds.length; k++) {
          var issueId = issueIds[k];
          assignees[issueId] = null;
          try {
            var issue = entities.Issue.findById(issueId);
            if (!issue) continue;
            var raw = null;
            try { raw = issue.fields[fieldName]; } catch (_) {}
            if (raw == null && issue.fields && typeof issue.fields.forEach === 'function') {
              issue.fields.forEach(function (f) {
                if (f && f.projectCustomField && (f.projectCustomField.name || '') === fieldName) {
                  raw = f.value;
                }
              });
            }
            if (raw && typeof raw === 'object') {
              assignees[issueId] = {
                login:    raw.login    || null,
                fullName: raw.fullName || raw.name || null
              };
            }
          } catch (e) {
            dlog(ctx, 'refresh-assignees(' + issueId + ') err: ' + String(e && e.message));
          }
        }
        ctx.response.json({ success: true, assignees: assignees });
      }
    }

  ]
};

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
    validateSprint:               validateSprint,
    validateHistoryForWrite:      validateHistoryForWrite,
    validateHistoryForRead:       validateHistoryForRead,
    validateHistory:              validateHistory,
    validateWorkingDraftForWrite: validateWorkingDraftForWrite,
    validateWorkingDraftForRead:  validateWorkingDraftForRead,
    validateWorkingDraft:         validateWorkingDraft,
    validatePluginVersion:        validatePluginVersion,
    validateMigrationLog:         validateMigrationLog,
    // Migration
    migrateSprintObj:             migrateSprintObj,
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
    // Auth helpers (test-only)
    userInGroups:                 userInGroups,
  });
}
