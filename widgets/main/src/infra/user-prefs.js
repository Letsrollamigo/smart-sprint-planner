/* user-prefs.js — предпочтения пользователя: localStorage ⊃ серверное зеркало (#69 строка 21).
   Корп-прод YT 2025.3: виджет живёт в srcdoc-песочнице БЕЗ allow-same-origin —
   localStorage бросает SecurityError, host.navigation отсутствует (стенд YT 2025.3,
   2026-08-22) → все safeLs-ключи (язык, роль, сортировка, рельс, хинты, кэш версии,
   последний проект) жили до перезагрузки. Теперь единый блоб
   User.extensionProperties.ssp_user_prefs (backend-global GET/POST user-prefs,
   allowlist ключей на сервере, прецедент last-project 58-10).
   Контракт safeLs сохранён: get — localStorage, при промахе серверный кэш;
   set/del — localStorage + debounce-POST только изменившихся ключей (гейт «то же
   значение» — иначе ssp_app_version_cache слал бы POST на каждый старт).
   load() зовётся ядром сразу после YTApp.register — до первого рендера, чтобы язык
   применился без мигания. Fail-soft: без хоста/сети ведёт себя как прежний safeLs.
   Мост window.__SSP_USER_PREFS; deps {getHost, diag} приходят аргументом. */
'use strict';

var FLUSH_MS = 400;
var _cache = null;   // серверный блоб после load(); null — ещё не загружен
var _dirty = {};     // ключи, ожидающие POST (null = удалить)
var _timer = null;

function lsGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (_) { return false; } }
function lsDel(k) { try { localStorage.removeItem(k); } catch (_) { /* ignore */ } }

function get(k) {
  var v = lsGet(k);
  if (v === null && _cache && typeof _cache[k] === 'string') v = _cache[k];
  return v;
}

function set(k, v, deps) {
  v = String(v);
  var ok = lsSet(k, v);
  queue(k, v, deps);
  return ok;
}

function del(k, deps) {
  lsDel(k);
  queue(k, null, deps);
}

function queue(k, v, deps) {
  if (!/^ssp_/.test(k)) return;
  var cur = (_cache && typeof _cache[k] === 'string') ? _cache[k] : null;
  if (cur === v) return;
  if (!_cache) _cache = {};
  if (v === null) delete _cache[k]; else _cache[k] = v;
  _dirty[k] = v;
  if (_timer) clearTimeout(_timer);
  _timer = setTimeout(function () { flush(deps); }, FLUSH_MS);
}

function flush(deps) {
  _timer = null;
  var host = deps && typeof deps.getHost === 'function' ? deps.getHost() : null;
  if (!host || typeof host.fetchApp !== 'function') return;   // до register — дольёт load()
  if (!Object.keys(_dirty).length) return;
  var batch = _dirty;
  _dirty = {};
  try {
    host.fetchApp('backend-global/user-prefs', { method: 'POST', body: { prefs: batch } })
      .then(function () {}, function (e) { deps.diag('user-prefs POST failed: ' + (e && e.message ? e.message : e), 'warn'); });
  } catch (e) { deps.diag('user-prefs POST threw: ' + e, 'warn'); }
}

/** Загрузить серверный блоб; локально изменённые до загрузки ключи не затираются. */
function load(deps) {
  var host = deps.getHost();
  if (!host || typeof host.fetchApp !== 'function') return Promise.resolve(_cache || {});
  return host.fetchApp('backend-global/user-prefs', {}).then(function (r) {
    var p = (r && r.success !== false && r.prefs) || {};
    _cache = _cache || {};
    Object.keys(p).forEach(function (k) {
      if (typeof p[k] === 'string' && !Object.prototype.hasOwnProperty.call(_dirty, k)) _cache[k] = p[k];
    });
    deps.diag('user-prefs loaded: ' + (Object.keys(p).join(', ') || '—'), 'ok');
    if (Object.keys(_dirty).length) flush(deps);
    return _cache;
  }).catch(function (e) {
    deps.diag('user-prefs GET failed: ' + (e && e.message ? e.message : e), 'warn');
    _cache = _cache || {};
    return _cache;
  });
}

var api = { get: get, set: set, del: del, load: load, flush: flush };

if (typeof window !== 'undefined') {
  try { window.__SSP_USER_PREFS = api; } catch (_) { /* sandboxed write may throw */ }
}

if (typeof module !== 'undefined' && module.exports) module.exports = api;
