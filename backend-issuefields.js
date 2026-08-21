/**
 * Smart Sprint Planner — Issue-fields backend (вынос из backend-core.js).
 *
 * Per-feature backend-модуль (паттерн backend-capacity.js): мост к YouTrack entities
 * (field-values / get-user-field-values / update-issue-field / refresh-assignees).
 * НЕ трогает persist плагина (ssp_*), миграции и schema-whitelist'ы — читает/пишет
 * только поля YT-issue. Require'ится в backend-project.js И backend-global.js; свои
 * endpoint-объекты ДОПИСЫВАЕТ в общий core.ENDPOINTS (оба handler-файла читают его —
 * иначе global-режим 404, gotcha #7). Тела хендлеров переехали из core дословно;
 * kernel-deps резолвятся через core.* (локальные алиасы ниже).
 *
 * ИНВАРИАНТЫ БЕЗОПАСНОСТИ — см. шапку backend-core.js (authzGuard первым; filterKeys
 * по whitelist'у; getBody с sanitize). authz: viewer (read) / assigner (update-issue-field).
 */

var core     = require('./backend-core.js');
var entities = require('@jetbrains/youtrack-scripting-api/entities');

/* Локальные алиасы ядра — тела хендлеров переехали дословно и зовут их без префикса. */
var authzGuard = core.authzGuard;
var badRequest = core.badRequest;
var getBody    = core.getBody;
var filterKeys = core.filterKeys;
var parseBodyOrReject = core.parseBodyOrReject;
var dlog       = core.dlog;

/* Константы домена issue-fields (переехали из backend-core.js). */
var ALLOWED_UPDATE_ISSUE_KEYS      = ['issueId', 'fieldName', 'value', 'type'];
var ALLOWED_REFRESH_ASSIGNEES_KEYS = ['issueIds', 'fieldName', 'stateFieldName'];
var MAX_REFRESH_ASSIGNEES_BATCH    = 200;
/* #67 путь 3 — потолок обогащаемых задач на запрос: то же число и та же причина, что
   MAX_REFRESH_ASSIGNEES_BATCH (прод-смоук #58: обращение к задаче на боевой БД — единицы
   секунд). Перелимит — не отказ: хвост сохраняется как пришёл, агенту — счётчик skipped. */
var MAX_ENRICH_BATCH               = 200;
/* #67 H7 — ключи настроек, значения которых суть имена YT-полей (27 ролевых field* /
   userField* + fieldPriority/XPriority/State/System/Sprint/Version/Type/ExternalTicketId).
   Производная от whitelist'а ядра — новые field*-ключи попадают в allow-list сами. */
var FIELD_SETTING_KEYS = core.ALLOWED_SETTINGS_KEYS.filter(function (k) { return /^(field|userField)/.test(k); });

/* Чтение значения поля задачи: прямой доступ + обход по projectCustomField.name
   (двойной путь — вынесен из refresh-assignees для переиспользования обогатителем). */
function readField(issue, fname) {
  var raw = null;
  try { raw = issue.fields[fname]; } catch (_) {}
  if (raw == null && issue.fields && typeof issue.fields.forEach === 'function') {
    issue.fields.forEach(function (f) {
      if (raw == null && f && f.projectCustomField && (f.projectCustomField.name || '') === fname) {
        raw = f.value;
      }
    });
  }
  return raw;
}

/* Имя enum-подобного значения поля (string как есть; entity — name/localizedName). */
function _enumName(raw) {
  if (raw == null) return '';
  if (typeof raw === 'string') return raw;
  return String(raw.name || raw.localizedName || raw.presentation || '');
}

/* ── #67 путь 3 — серверное обогащение состава («дополняем только пустое») ──────
   Агентские заливки (n8n) шлют issueId+оценки; сервер наполняет title/state/priority/
   xpriority/system/externalTicketId из задачи по настроенным полям ssp_settings.
   Триггер — item с issueId, но БЕЗ title: виджет всегда ставит title (pick.js,
   backlog-assign.js) → виджетный путь обогащение не запускает ни разу.
   🔒 Видимость fail-closed (Q1/Q2 стенда открыты): задача, невидимая автору запроса
   (Issue.isVisibleTo, SDK entities.js:1774), НЕ обогащается и НЕ отличима в ответе от
   несуществующей/чужой — иначе счётчик стал бы оракулом существования скрытых задач.
   skipped считает ТОЛЬКО перелимит. Item mutable in-place; ядро после обогащения
   перегоняет roleItems через validateRoleItems (fail-closed на баг обогатителя). */
function enrichRoleItems(ctx, roleItems) {
  if (!roleItems || typeof roleItems !== 'object') return null;
  var settings = core.parseJson(core.getProp(ctx, 'ssp_settings'), null) || {};
  var count = 0, skipped = 0, budget = MAX_ENRICH_BATCH;
  var rks = Object.keys(roleItems);
  for (var r = 0; r < rks.length; r++) {
    var arr = roleItems[rks[r]];
    if (!Array.isArray(arr)) continue;
    for (var i = 0; i < arr.length; i++) {
      var item = arr[i];
      if (!item || typeof item !== 'object') continue;
      if (typeof item.issueId !== 'string' || !item.issueId) continue;
      if (item.title) continue;                     /* самогейт: дополняем только пустое */
      if (budget <= 0) { skipped++; continue; }     /* перелимит: хвост сохраняется как пришёл */
      budget--;
      try {
        var issue = entities.Issue.findById(item.issueId);
        if (!issue) continue;
        /* Изоляция проекта — как в refresh-assignees/update-issue-field (v3.2.1). */
        if (!issue.project || !ctx.project || issue.project.key !== ctx.project.key) continue;
        var visible = false;
        try { visible = !!issue.isVisibleTo(ctx.currentUser); } catch (_) { visible = false; }
        if (!visible) continue;
        /* Лимиты validateItem: строки ≤1000 — усечение, чтобы длинный summary не 400-ил запись. */
        item.title = String(issue.summary || item.issueId).slice(0, 1000);
        if (!item.state && settings.fieldState) {
          var stRaw = readField(issue, settings.fieldState);
          if (stRaw && typeof stRaw === 'object' && (stRaw.name || stRaw.localizedName)) {
            item.state          = String(stRaw.name || '').slice(0, 1000);
            item.stateLocalized = String(stRaw.localizedName || stRaw.name || '').slice(0, 1000);
            try {
              if (stRaw.color && (stRaw.color.background || stRaw.color.foreground)) {
                item.stateColor = { background: stRaw.color.background || null, foreground: stRaw.color.foreground || null };
              }
            } catch (_) {}
          }
        }
        if (!item.priority  && settings.fieldPriority)  item.priority  = _enumName(readField(issue, settings.fieldPriority)).slice(0, 1000);
        if (!item.xpriority && settings.fieldXPriority) item.xpriority = _enumName(readField(issue, settings.fieldXPriority)).slice(0, 1000);
        if (!item.system    && settings.fieldSystem)    item.system    = _enumName(readField(issue, settings.fieldSystem)).slice(0, 1000);
        if (!item.externalTicketId && settings.fieldExternalTicketId) {
          var ext = readField(issue, settings.fieldExternalTicketId);
          if (typeof ext === 'string' && ext) item.externalTicketId = ext.slice(0, 1000);
        }
        count++;
      } catch (e) {
        dlog(ctx, 'enrich(' + item.issueId + ') err: ' + String(e && e.message));
      }
    }
  }
  return (count || skipped) ? { count: count, skipped: skipped } : null;
}

/* ─── Endpoint-обработчики (scope:'project') ─────────────────────────────────── */

var ISSUEFIELDS_ENDPOINTS = [

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
        var resolved = [];   // #21 §8 — имена resolved-состояний (для schema-warning «незамапленное»)
        var colors = {};     /* 68-7 — { name: {background,foreground} } для чипов секций стендапа;
                                bundle-значения могут не нести color на старых YT — тогда карта
                                частичная/пустая, фронт падает на нейтральный чип */
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
                  if (!(v.isArchived || v.archived || false) && v.name) {
                    values.push(v.name);
                    if (v.isResolved) resolved.push(v.name);   // #21 §8 — аддитивно, values не трогаем
                    if (v.color && (v.color.background || v.color.foreground)) {   /* 68-7 — аддитивно */
                      colors[v.name] = { background: v.color.background || null, foreground: v.color.foreground || null };
                    }
                  }
                } catch (ve) { /* ignore */ }
              });
            }
          }
        } catch (e) {
          dlog(ctx, 'field-values error: ' + String(e && e.message));
          ctx.response.json({ success: false, error: 'internal_error', values: [], debug: debugInfo });
          return;
        }
        ctx.response.json({ success: !!values.length || debugInfo.found, fieldName: fieldName, values: values, resolved: resolved, colors: colors, debug: debugInfo });
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

        var body = parseBodyOrReject(ctx, ALLOWED_UPDATE_ISSUE_KEYS);
        if (body === null) return;

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
        /* #67 H7 — allow-list: пишем ТОЛЬКО в поля, настроенные в плагине (значения
           field*- и userField*-ключей хранимого ssp_settings) + фолбэк релизного
           state-поля 'State' (та же формула, что на фронте — release-controller.js:603).
           Все 4 вызывателя (quick-edit rolecomposition-view, запись исполнителя core.js,
           reassign-controller, применение состояний release-controller) резолвят
           fieldName из настроек — сверено при реализации. Закрывает «какие поля»,
           не «под чьими правами пишет сервер» (Q1): field-level canBeWrittenBy
           по-прежнему не вызывается — зафиксированный остаток. */
        var s7 = core.parseJson(core.getProp(ctx, 'ssp_settings'), null) || {};
        var allowedFields = {};
        for (var afi = 0; afi < FIELD_SETTING_KEYS.length; afi++) {
          var afv = s7[FIELD_SETTING_KEYS[afi]];
          if (typeof afv === 'string' && afv.trim()) allowedFields[afv.trim()] = true;
        }
        allowedFields[(typeof s7.fieldState === 'string' && s7.fieldState.trim()) ? s7.fieldState.trim() : 'State'] = true;
        if (!Object.prototype.hasOwnProperty.call(allowedFields, fieldName)) {
          badRequest(ctx, 'field_not_whitelisted');
          return;
        }

        try {
          var issue = entities.Issue.findById(issueId);
          if (!issue) {
            ctx.response.json({ success: false, error: 'issue_not_found' });
            return;
          }
          /* v3.2.1 — изоляция проекта на app-уровне: authz считается по ssp_settings
             ЭТОГО проекта, а findById достаёт задачу любого — assigner проекта A мог
             писать поля задач проекта B (страховала только платформенная ACL YT). */
          if (!issue.project || !ctx.project || issue.project.key !== ctx.project.key) {
            ctx.response.json({ success: false, error: 'issue_not_in_project' });
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
          /* #57-3 — текст исключения (отказ state-machine и т.п.) видимее кода в per-task отчёте */
          ctx.response.json({ success: false, error: 'internal_error', message: String(e && e.message || '').substring(0, 300) });
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

        var body = parseBodyOrReject(ctx, ALLOWED_REFRESH_ASSIGNEES_KEYS);
        if (body === null) return;

        var issueIds = body.issueIds;
        var fieldName = body.fieldName;
        var stateFieldName = body.stateFieldName || '';
        if (!Array.isArray(issueIds) || !issueIds.length || issueIds.length > MAX_REFRESH_ASSIGNEES_BATCH) {
          badRequest(ctx, 'invalid_issue_ids');
          return;
        }
        if (typeof fieldName !== 'string' || !fieldName.length || fieldName.length > 200
            || /[\x00-\x1F<>"]/.test(fieldName)) {
          badRequest(ctx, 'invalid_field_name');
          return;
        }
        if (stateFieldName && (typeof stateFieldName !== 'string' || stateFieldName.length > 200
            || /[\x00-\x1F<>"]/.test(stateFieldName))) {
          badRequest(ctx, 'invalid_state_field_name');
          return;
        }
        var ID_RE = /^[A-Za-z][A-Za-z0-9_]*-\d+$/;
        for (var i = 0; i < issueIds.length; i++) {
          if (typeof issueIds[i] !== 'string' || !ID_RE.test(issueIds[i])) {
            badRequest(ctx, 'invalid_issue_id_in_list');
            return;
          }
        }

        /* readField — module-level (переиспользуется обогатителем #67 путь 3). */
        var assignees = {};
        for (var k = 0; k < issueIds.length; k++) {
          var issueId = issueIds[k];
          assignees[issueId] = null;
          try {
            var issue = entities.Issue.findById(issueId);
            if (!issue) continue;
            /* v3.2.1 — изоляция проекта (см. update-issue-field): чтение assignee/state
               чужих проектов через viewer-ручку закрыто на app-уровне. */
            if (!issue.project || !ctx.project || issue.project.key !== ctx.project.key) continue;
            var raw = readField(issue, fieldName);
            var entry = null;
            if (raw && typeof raw === 'object') {
              entry = { login: raw.login || null, fullName: raw.fullName || raw.name || null };
            }
            if (stateFieldName) {
              var stRaw = readField(issue, stateFieldName);
              var stData = null;
              if (stRaw && typeof stRaw === 'object' && (stRaw.name || stRaw.localizedName)) {
                var stColor = null;
                try {
                  if (stRaw.color && (stRaw.color.background || stRaw.color.foreground)) {
                    stColor = { background: stRaw.color.background || null, foreground: stRaw.color.foreground || null };
                  }
                } catch (_) {}
                stData = { name: stRaw.name || null, localizedName: stRaw.localizedName || stRaw.name || null, color: stColor };
              }
              if (stData) { entry = entry || {}; entry.state = stData; }
            }
            assignees[issueId] = entry;
          } catch (e) {
            dlog(ctx, 'refresh-assignees(' + issueId + ') err: ' + String(e && e.message));
          }
        }
        ctx.response.json({ success: true, assignees: assignees });
      }
    },
];

/* Самрегистрация в общий core.ENDPOINTS (оба handler-файла читают его — gotcha #7).
   Идемпотентно: guard на core-объекте защищает от двойного push при повторном require. */
if (core && core.ENDPOINTS && !core.__issuefieldsEndpointsRegistered) {
  for (var ei = 0; ei < ISSUEFIELDS_ENDPOINTS.length; ei++) core.ENDPOINTS.push(ISSUEFIELDS_ENDPOINTS[ei]);
  core.__issuefieldsEndpointsRegistered = true;
}
/* #67 путь 3 — самрегистрация обогатителя на объекте ядра (тот же механизм, что
   ENDPOINTS-push выше: ядро не require'ит сателлит — цикл; хук зовёт ветка roleItems
   POST /sprint-data). Свойство на существующем экспорт-объекте, не новая связь. */
if (core && !core.__enrichRoleItems) core.__enrichRoleItems = enrichRoleItems;

/* Runtime + test-only exports. */
exports.ISSUEFIELDS_ENDPOINTS = ISSUEFIELDS_ENDPOINTS;
if (typeof module !== 'undefined' && module.exports) {
  Object.assign(exports, {
    ALLOWED_UPDATE_ISSUE_KEYS: ALLOWED_UPDATE_ISSUE_KEYS,
    ALLOWED_REFRESH_ASSIGNEES_KEYS: ALLOWED_REFRESH_ASSIGNEES_KEYS,
    MAX_REFRESH_ASSIGNEES_BATCH: MAX_REFRESH_ASSIGNEES_BATCH
  });
}
