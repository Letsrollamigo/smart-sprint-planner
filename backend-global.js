/**
 * Smart Sprint Planner — HTTP Handler (GLOBAL scope, #25 Ф1)
 *
 * MAIN_MENU_ITEM-виджет (нет ctx.project). Переиспользует ВСЕ тела endpoint'ов из
 * backend-core.js через ctx-адаптер: синтезирует project-scope ctx из projectKey
 * (query), резолвит проект через entities.Project.findByKey (V3 — findById НЕТ),
 * подставляет settingsManagerGroup из зеркала ssp_acl, остальное — passthrough.
 * После адаптера authzGuard, getProp, валидаторы и миграции работают без изменений.
 *
 * ИБ-инвариант (новый, §3 дизайна): виджет виден любому READ_USER, projectKey — из
 * запроса (недоверенный). Каждый делегируемый endpoint проходит read-gate
 * userCanReadProject (currentUser.hasPermission('READ_PROJECT', project), V2 ✅)
 * ДО любой логики. Write-проверки (роли editor/validator/...) — внутри тел ядра,
 * как в project-scope (settingsManagerGroup из зеркала + ssp_settings.*Groups).
 *
 * Отличия от project-набора:
 *   • sync-acl       — НЕ публикуется (project-only: достоверный ctx.settings есть
 *                       только в project-scope; зеркало пишет project-handler).
 *   • app-version    — статика без read-gate (нужна в шапке ДО выбора проекта).
 *   • filter-planner-projects — НОВЫЙ (picker): пересечение «видимых юзеру» ключей
 *                       с «планер прикреплён» (ssp_settings != null) + read-gate.
 */
var entities = require('@jetbrains/youtrack-scripting-api/entities');
var core     = require('./backend-core.js');

// Стендовая эмпирика (Test_user_2, не-админ с доступом к DEMO): 'READ_PROJECT' — админ-only
// (у участника false), а 'READ_PROJECT_BASIC' = true у участника И админа, false у no-access.
// Семантика «есть доступ к проекту/видимость». isVisibleTo/isInProject/visibleProjects отсутствуют.
var READ_PROJECT_PERMISSION = 'READ_PROJECT_BASIC';
// shortName/ID проекта YouTrack — недоверенный вход (тело picker'а клиентское). YT генерирует ID
// из имени: может начинаться с цифры (1c_demo для «1С ЗУП»), быть в нижнем регистре, содержать
// кириллицу/Unicode-буквы, дефис, точку, подчёркивание. Прежняя ASCII-allowlist
// /^[A-Za-z][A-Za-z0-9_]{0,99}$/ молча теряла такие проекты в picker'е и global-эндпоинтах
// (prod-fix 2026-06-09 «1С ЗУП»/1c_demo). Валидируем длину + denylist опасных символов
// (engine-portable: без \p{L}/u-флага и без диапазонов в char-class); существование арбитрит findByKey.
var PROJECT_KEY_MAX = 100;
var PROJECT_KEY_WS_RE     = /\s/;
var PROJECT_KEY_DANGER_RE = /["'`<>(){}\[\]|\\\/?#&=;%:@$*+^~,!]/;
function isValidProjectKey(k) {
  if (typeof k !== 'string') return false;
  var s = k.trim();
  if (s.length < 1 || s.length > PROJECT_KEY_MAX) return false;
  return !PROJECT_KEY_WS_RE.test(s) && !PROJECT_KEY_DANGER_RE.test(s);
}
var MAX_PICKER_KEYS = 5000;                          // лимит батча picker'а (был 500; bump под масштаб)

// ── 4xx-хелперы (форма ответа идентична core.badRequest/forbidden) ───────────
function gBad(ctx, reason)    { try { ctx.response.status = 400; } catch (e) {} ctx.response.json({ success: false, error: 'Bad Request', reason: reason || 'invalid_input' }); }
function gForbid(ctx, reason) { try { ctx.response.status = 403; } catch (e) {} ctx.response.json({ success: false, error: 'Forbidden',   reason: reason || 'access_denied' }); }

function getProjectKey(globalCtx) {
  try {
    var k = globalCtx.request.getParameter('projectKey');
    if (!k) return null;
    k = String(k).trim();
    return isValidProjectKey(k) ? k : null;
  } catch (e) { return null; }
}

// read-gate D1 (V2 ✅): права currentUser на проект средствами YT, fail-closed.
function userCanReadProject(globalCtx, project) {
  try { return !!globalCtx.currentUser.hasPermission(READ_PROJECT_PERMISSION, project); }
  catch (e) { return false; }
}

// ctx-адаптер: синтетический project-scope ctx из резолвленного проекта.
function buildProjectCtx(globalCtx, project) {
  var acl = core.parseJson(project.extensionProperties.ssp_acl, null);
  return {
    project:  project,                                  // → getProp/setProp как есть
    settings: {
      settingsManagerGroup: acl ? acl.settingsManagerGroup : null,
      enableDebugLog: false
    },
    currentUser: globalCtx.currentUser,                 // passthrough (роли/login)
    request:     globalCtx.request,
    response:    globalCtx.response
    // globalStorage намеренно не прокидываем — тела ядра его не используют.
  };
}

// Резолв projectKey + read-gate. Возвращает adapter ctx либо null (ответ уже отправлен).
function resolveOrReject(globalCtx) {
  var key = getProjectKey(globalCtx);
  if (!key) { gBad(globalCtx, 'invalid_project_key'); return null; }
  var project = null;
  try { project = entities.Project.findByKey(key); } catch (e) { project = null; }
  if (!project) { gBad(globalCtx, 'project_not_found'); return null; }
  if (!userCanReadProject(globalCtx, project)) { gForbid(globalCtx, 'project_access_denied'); return null; }
  return buildProjectCtx(globalCtx, project);
}

// ── Сборка global-endpoints из core.ENDPOINTS ────────────────────────────────
var SKIP = { 'sync-acl': true, 'app-version': true };
var endpoints = [];

core.ENDPOINTS.forEach(function (ep) {
  if (SKIP[ep.path]) return;
  var coreHandle = ep.handle;
  endpoints.push({
    scope:  'global',
    method: ep.method,
    path:   ep.path,
    handle: function (globalCtx) {
      var adapter = resolveOrReject(globalCtx);  // projectKey + read-gate ДО логики
      if (!adapter) return;                      // 400/403 уже отправлены
      coreHandle(adapter);                       // делегируем в общее тело ядра
    }
  });
});

// app-version — статика, без read-gate (бейдж версии в шапке до выбора проекта).
endpoints.push({
  scope: 'global', method: 'GET', path: 'app-version',
  handle: function (ctx) { ctx.response.json({ version: core.APP_VERSION }); }
});

// filter-planner-projects — авторитетный арбитр picker'а (§6.2).
// Body: { keys: ['DEMO','ABC', ...] } — ключи проектов, видимых юзеру (admin/projects).
// Для каждого: findByKey + ssp_settings != null (планер прикреплён) + read-gate.
// Возврат: { success, projects: [{ key, name, hasMirror }] }.
endpoints.push({
  scope: 'global', method: 'POST', path: 'filter-planner-projects',
  handle: function (ctx) {
    if (!ctx.currentUser) { gForbid(ctx, 'auth_required'); return; }
    var body = core.getBody(ctx);
    if (body.__rejected__) { gBad(ctx, body.__reason__ || 'invalid_input'); return; }
    var keys = body.keys;
    if (!Array.isArray(keys)) { gBad(ctx, 'invalid_keys'); return; }
    if (keys.length > MAX_PICKER_KEYS) keys = keys.slice(0, MAX_PICKER_KEYS);

    var out  = [];
    var seen = {};
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (typeof k !== 'string') continue;
      k = k.trim();
      if (!isValidProjectKey(k) || seen[k]) continue;
      seen[k] = true;
      var project = null;
      try { project = entities.Project.findByKey(k); } catch (e) { project = null; }
      if (!project) continue;
      // «планер прикреплён» к проекту, видимо global'у, = одно из:
      //   • ssp_acl-зеркало с заданным settingsManagerGroup (settings-manager задан + sync-acl
      //     отработал на init проектного виджета) — основной сигнал прикрепления; ИЛИ
      //   • ssp_settings != null (роли/настройки уже сохранялись).
      // Раньше критерий был ТОЛЬКО ssp_settings — баг: проект, к которому планер прикреплён
      // (settingsManagerGroup задан, виджет открыт), но роли ещё не сохранены, не попадал в picker.
      var attached = false;
      try {
        if (project.extensionProperties.ssp_settings != null) {
          attached = true;
        } else {
          var aclRaw = project.extensionProperties.ssp_acl;
          if (aclRaw != null) {
            var acl = core.parseJson(aclRaw, null);
            if (acl && acl.settingsManagerGroup != null) attached = true;
          }
        }
      } catch (e) { attached = false; }
      if (!attached) continue;
      // авторитетная серверная перепроверка прав (клиентский список недоверенный)
      if (!userCanReadProject(ctx, project)) continue;
      var hasMirror = false;
      try { hasMirror = (project.extensionProperties.ssp_acl != null); } catch (e) { hasMirror = false; }
      out.push({ key: k, name: project.name || k, hasMirror: hasMirror });
    }
    out.sort(function (a, b) { return (a.name || '').localeCompare(b.name || '', 'ru'); });
    ctx.response.json({ success: true, projects: out });
  }
});

exports.httpHandler = { endpoints: endpoints };
exports.isValidProjectKey = isValidProjectKey;  // test-only (unit: project-key-validation)
