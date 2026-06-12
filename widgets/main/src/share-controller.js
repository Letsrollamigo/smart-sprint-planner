/* #36 Share-URL (deep-link + handoff): чтение share-параметров с init,
   авто-синк state→URL, сборка shareable-ссылки, копирование по «Поделиться»
   и фокус-подсветка role:K/user:L. Вынесено из legacy-monolith.js
   (Фаза 5 слайс 2, коммит В) за мост window.__SSP_SHARE_CTRL;
   golden-характеризация — tests/golden/permissions-share.golden.test.js
   (через делегаторы монолита).

   host.navigation доступен только в global-режиме (MAIN_MENU_ITEM). getAppLocation()
   АСИНХРОНЕН (Promise) — проверено V0-A 2026-06-09. YT добавляет app_-префикс к ключам
   в видимой строке, но get/replaceAppLocation работают с чистыми ключами симметрично.

   Deps приходят АРГУМЕНТОМ на каждый вызов (фабрика _shareDeps() в монолите);
   стейт (_host/_mode/_urlSyncEnabled/_activeProjectKey/_currentSprintId/_ytBase/
   _sprint/_history) остаётся в монолите — get-аксессоры читаются строго в момент
   вызова (init-restore переключает _urlSyncEnabled уже после install модуля).

   ⚠️ _SHARE_APP_PATH — per-fork константа (DIFF_MAP §9): различается ИМЕНЕМ
   приложения между форками, а не только префиксом — зеркалится sed-заменой
   имени приложения ДО namespace-префиксов; дифф зоны при зеркале обязателен. */
'use strict';

var SHARE_URL_PURE = (typeof window !== 'undefined' && window.__SSP_SHARE_URL_PURE) || {};

function _navAvailable(deps) {
  var _host = deps.state.getHost();
  return !!(_host && _host.navigation && typeof _host.navigation.getAppLocation === 'function');
}

/* URL → state: читает search один раз на init. Возвращает Promise<{projectKey,sprintId,node,focus}>. */
function _readShareParams(deps) {
  if (typeof SHARE_URL_PURE.parseShareSearch !== 'function' || !_navAvailable(deps)) return Promise.resolve({});
  try {
    return Promise.resolve(deps.state.getHost().navigation.getAppLocation())
      .then(function (loc) { return SHARE_URL_PURE.parseShareSearch(loc && loc.search) || {}; })
      .catch(function () { return {}; });
  } catch (_) { return Promise.resolve({}); }
}

/* Внутренний id активного узла дерева (для билда URL). */
function _currentDashNode() {
  try {
    var act = document.querySelector('.ssp-tree [data-node].active');
    if (act && act.dataset && act.dataset.node) return act.dataset.node;
  } catch (_) {}
  return null;
}

/* state → URL: replaceAppLocation (без записи в history). No-op до _urlSyncEnabled / вне global. */
function _syncStateToUrl(deps) {
  if (!deps.state.getUrlSyncEnabled() || deps.state.getMode() !== 'global' || !_navAvailable(deps)) return;
  if (typeof deps.state.getHost().navigation.replaceAppLocation !== 'function') return;
  if (typeof SHARE_URL_PURE.buildShareSearch !== 'function') return;
  try {
    var search = SHARE_URL_PURE.buildShareSearch({
      projectKey: deps.state.getActiveProjectKey(),
      sprintId:   deps.state.getCurrentSprintId(),
      node:       _currentDashNode()
    });
    deps.state.getHost().navigation.replaceAppLocation({ search: search });
  } catch (_) {}
}

/* Валиден ли sprintId (base-UUID) среди доступных: активный спринт или запись истории. */
function _validSprintId(id, deps) {
  if (!id) return false;
  var _sprint = deps.state.getSprint();
  var _history = deps.state.getHistory();
  if (_sprint && _sprint.sprintId === id) return true;
  if (Array.isArray(_history)) {
    return _history.some(function (rec) {
      return rec && rec.sprintId && String(rec.sprintId).split('_')[0] === id;
    });
  }
  return false;
}

/* Применить focus=role:K / user:L — прокрутка + кратковременная подсветка. Невалид → no-op (R3). */
function _applyShareFocus(focus) {
  if (typeof SHARE_URL_PURE.parseFocus !== 'function') return;
  var f = SHARE_URL_PURE.parseFocus(focus);
  if (!f) return;
  setTimeout(function () {
    try {
      var el = null;
      if (f.kind === 'role') {
        el = document.querySelector('.planning-role-card[data-role-key="' + f.value + '"]');
      } else if (f.kind === 'user') {
        /* people-таблица не имеет стабильного data-login — best-effort, no-op если нет (R3). */
        el = document.querySelector('[data-login="' + f.value + '"], [data-assignee="' + f.value + '"], [data-user="' + f.value + '"]');
      }
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ssp-focus-flash');
      setTimeout(function () { try { el.classList.remove('ssp-focus-flash'); } catch (_) {} }, 1600);
    } catch (_) {}
  }, 200);
}

/* Клик по «Поделиться»: копирует текущий deep-link URL + toast. Без модалки/dropdown (D4).
   ВАЖНО (V0-смоук 2026-06-09): iframe виджета YT идёт без allow="clipboard-write" в
   Permissions-Policy → navigator.clipboard.writeText БЛОКИРУЕТСЯ (и в проде, не только в
   автоматизации). Поэтому primary-путь — синхронный execCommand('copy') в gesture'е (он
   не гейтится clipboard-write policy); async Clipboard API — лишь enhancement-fallback. */
function _execCopy(text) {
  try {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    try { ta.setSelectionRange(0, text.length); } catch (_) {}
    var done = false;
    try { done = document.execCommand('copy'); } catch (_) { done = false; }
    document.body.removeChild(ta);
    return !!done;
  } catch (_) { return false; }
}
/* #36 v2.5.2 — shareable URL РЕКОНСТРУИРУЕМ из состояния, НЕ из window.location.href:
   виджет живёт в sandboxed about:srcdoc-iframe → window.location.href = "about:srcdoc#…"
   (адрес iframe, не родительский YT-URL). Собираем: ytBase + путь app/widget +
   app_-префиксные параметры (YT в реальном URL префиксует ключи app_; getAppLocation
   читает их обратно без префикса — V0-A 2026-06-09). */
var _SHARE_APP_PATH = '/app/smart-sprint-planner/ssp-main-global/';
function _buildShareHref(deps) {
  var base = String(deps.state.getYtBase() || '').replace(/\/+$/, '');
  var raw = (typeof SHARE_URL_PURE.buildShareSearch === 'function')
    ? SHARE_URL_PURE.buildShareSearch({ projectKey: deps.state.getActiveProjectKey(), sprintId: deps.state.getCurrentSprintId(), node: _currentDashNode() })
    : '';
  var prefixed = raw ? raw.split('&').map(function (p) { return 'app_' + p; }).join('&') : '';
  return base + _SHARE_APP_PATH + (prefixed ? '?' + prefixed : '');
}
function _onShareClick(deps) {
  var href = _buildShareHref(deps);
  try { deps.diag('share copy: ' + href, 'info'); } catch (_) {}
  function ok()  { try { deps.toast(deps.T('shareCopyOk')); } catch (_) {} }
  function err() { try { deps.toast(deps.T('shareCopyErr')); } catch (_) {} }
  /* 1) синхронный execCommand в gesture'е (работает в sandboxed iframe без clipboard-write) */
  if (_execCopy(href)) { ok(); return; }
  /* 2) fallback — async Clipboard API (если вдруг доступен) */
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(href).then(ok, err);
    } else {
      err();
    }
  } catch (_) { err(); }
}

const api = {
  _navAvailable: _navAvailable,
  _readShareParams: _readShareParams,
  _syncStateToUrl: _syncStateToUrl,
  _validSprintId: _validSprintId,
  _applyShareFocus: _applyShareFocus,
  _buildShareHref: _buildShareHref,
  _onShareClick: _onShareClick,
};

if (typeof window !== 'undefined') {
  try { window.__SSP_SHARE_CTRL = api; } catch (_) { /* sandboxed write may throw */ }
}

module.exports = api;
