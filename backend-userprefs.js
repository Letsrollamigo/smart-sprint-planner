/**
 * Smart Sprint Planner — User-prefs backend (#69 строка 21, мега-эпик «Упрощение»).
 *
 * Per-feature backend-модуль (§11 «фича бэка = свой модуль»), GLOBAL-only: require-ится
 * из backend-global.js, endpoint-объекты дописываются в его собственный список (не в
 * core.ENDPOINTS — project-scope и адаптер с projectKey тут не нужны: данные пользователя,
 * не проекта; чужой слот недостижим — только ctx.currentUser).
 *
 * Зачем: прод YT 2025.3 — виджет в srcdoc-песочнице БЕЗ allow-same-origin
 * (localStorage бросает SecurityError, host.navigation отсутствует — стенд YT 2025.3,
 * 2026-08-22) → язык/роль/сортировка и прочие safeLs-ключи не переживали перезагрузку.
 * Единый блоб User.extensionProperties.ssp_user_prefs (entity-extensions.json); фронт
 * (infra/user-prefs.js) делает GET на старте и debounce-POST изменившихся ключей.
 * Прецедент — last-project (58-10, backend-global.js).
 *
 * ИНВАРИАНТЫ БЕЗОПАСНОСТИ — см. шапку backend-core.js: auth первым; allowlist ключей +
 * cap длины значения (строки; null = удалить) + cap блоба; reason-коды БЕЗ эха значений.
 */

var core = require('./backend-core.js');

function bad(ctx, reason)    { try { ctx.response.status = 400; } catch (e) {} ctx.response.json({ success: false, error: 'Bad Request', reason: reason || 'invalid_input' }); }
function forbid(ctx, reason) { try { ctx.response.status = 403; } catch (e) {} ctx.response.json({ success: false, error: 'Forbidden',   reason: reason || 'access_denied' }); }

/* Allowlist ключей → cap длины значения. Ключи = safeLs-ключи фронта. */
var USER_PREFS_ALLOWED = {
  ssp_lang: 8,                    // код локали
  ssp_lastActiveRole: 100,        // roleKey
  ssp_sortKey: 16,                // off|xpriority|priority|id|state
  ssp_railCollapsed: 1,           // '0'|'1'
  ssp_allocLockHintShown: 1,      // '1'
  ssp_app_version_cache: 120,     // JSON {version, ts}
  ssp_last_project_key: 100       // = PROJECT_KEY_MAX backend-global
};
var USER_PREFS_MAX_BLOB = 2048;

function readUserPrefs(ctx) {
  var raw = null;
  try { raw = ctx.currentUser.extensionProperties.ssp_user_prefs || null; } catch (e) { raw = null; }
  var obj = core.parseJson(raw, {});
  var out = {};
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
  Object.keys(USER_PREFS_ALLOWED).forEach(function (k) {
    if (typeof obj[k] === 'string') out[k] = obj[k];
  });
  return out;
}

/* Слияние входа в текущий блоб; null → удалить ключ. Возвращает null при невалидном входе. */
function mergeUserPrefs(prefs, inp) {
  if (!inp || typeof inp !== 'object' || Array.isArray(inp)) return null;
  var keys = Object.keys(inp);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i], v = inp[k];
    if (!Object.prototype.hasOwnProperty.call(USER_PREFS_ALLOWED, k)) return null;
    if (v === null) { delete prefs[k]; continue; }
    if (typeof v !== 'string' || v.length > USER_PREFS_ALLOWED[k]) return null;
    prefs[k] = v;
  }
  return prefs;
}

var endpoints = [
  {
    scope: 'global', method: 'GET', path: 'user-prefs',
    handle: function (ctx) {
      if (!ctx.currentUser) { forbid(ctx, 'auth_required'); return; }
      ctx.response.json({ success: true, prefs: readUserPrefs(ctx) });
    }
  },
  {
    scope: 'global', method: 'POST', path: 'user-prefs',
    handle: function (ctx) {
      if (!ctx.currentUser) { forbid(ctx, 'auth_required'); return; }
      var body = core.getBody(ctx);
      if (body.__rejected__) { bad(ctx, body.__reason__ || 'invalid_input'); return; }
      var prefs = mergeUserPrefs(readUserPrefs(ctx), body.prefs);
      if (!prefs) { bad(ctx, 'invalid_prefs'); return; }
      var str = JSON.stringify(prefs);
      if (str.length > USER_PREFS_MAX_BLOB) { bad(ctx, 'prefs_too_large'); return; }
      try { ctx.currentUser.extensionProperties.ssp_user_prefs = str; }
      catch (e) { bad(ctx, 'store_failed'); return; }
      ctx.response.json({ success: true, prefs: prefs });
    }
  }
];

exports.endpoints          = endpoints;
exports.USER_PREFS_ALLOWED = USER_PREFS_ALLOWED;
exports.readUserPrefs      = readUserPrefs;
exports.mergeUserPrefs     = mergeUserPrefs;
