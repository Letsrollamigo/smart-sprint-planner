/* #36 Share-URL (deep-link + handoff): чтение share-параметров с init,
   авто-синк state→URL, сборка shareable-ссылки, копирование по «Поделиться»
   и фокус-подсветка role:K/user:L. Вынесено из core.js
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

/* Внутренний id активного узла дерева (для билда URL). #124 — фолбэк на body-класс ssp-dashnode-<id>
   (его ставит _setDashNode): на старте дерево строится до настроек проекта, узлов «Ёмкость»/«Релизы»
   в нём ещё нет — активный узел не отмечен, хотя вкладка уже открыта. */
function _currentDashNode() {
  try {
    var act = document.querySelector('.ssp-tree [data-node].active');
    if (act && act.dataset && act.dataset.node) return act.dataset.node;
    var m = /(?:^|\s)ssp-dashnode-(\S+)/.exec(document.body.className);
    if (m) return m[1];
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

/* Найти цель фокуса на текущем узле; [] — ещё не отрисована. Первый элемент — куда прокрутить. */
function _findFocusTargets(f, node) {
  if (f.kind === 'role' && node === 'capacity') {
    return [document.querySelector('#tab-capacity [data-ssp-cap-role="' + f.value + '"]')];
  }
  if (f.kind === 'user' && node === 'capacity') {
    /* #124 — человек с несколькими ролями даёт строку в каждой — подсвечиваем все. */
    return Array.prototype.slice.call(document.querySelectorAll('#tab-capacity .ssp-capacity-row[data-login="' + f.value + '"]'));
  }
  if (f.kind === 'role') {
    return [document.querySelector('.planning-role-card[data-role-key="' + f.value + '"]')];
  }
  if (f.kind === 'user') {
    /* people-таблица не имеет стабильного data-login — best-effort, no-op если нет (R3). */
    return [document.querySelector('[data-login="' + f.value + '"], [data-assignee="' + f.value + '"], [data-user="' + f.value + '"]')];
  }
  if (f.kind === 'hist') {
    /* #112 — запись истории: группа строит ролевые спойлеры по первому раскрытию, поэтому сначала
       раскрываем группу (клик по шапке = toggleGroup), затем запись. База id — по последнему '_'
       (как _histBaseId). ponytail: запись на другой странице истории (HIST_PAGE) — no-op;
       листать к странице по id — если попросят. */
    var u = f.value.lastIndexOf('_'), base = u > 0 ? f.value.slice(0, u) : f.value;
    var grp = document.querySelector('[data-ssp-hist-group="' + base + '"]');
    if (grp && !grp.classList.contains('open')) { var gh = grp.querySelector(':scope > .spoiler__head'); if (gh) gh.click(); }
    var rec = document.querySelector('[data-ssp-hist-rec="' + f.value + '"]');
    if (rec && !rec.classList.contains('open')) { var rh = rec.querySelector(':scope > .spoiler__head'); if (rh) rh.click(); }
    return [rec];
  }
  if (f.kind === 'release') {
    /* #112 — карточка планируемого релиза; #124 — спойлер истории (раскрываем). Ищем в панели
       своего узла: после полного перерендера отрисованы обе, id в них не пересекаются лишь по факту.
       ponytail: ссылка на планируемый релиз, который к открытию уже выпущен, — no-op; фолбэк в историю
       по стору релизов — если попросят. */
    if (node === 'release-history') {
      var sp = document.querySelector('#tab-release-history [data-ssp-release-id="' + f.value + '"]');
      if (sp && !sp.classList.contains('open')) { var sh = sp.querySelector(':scope > .spoiler__head'); if (sh) sh.click(); }
      return [sp];
    }
    return [document.querySelector('#tab-release-planned [data-ssp-release-id="' + f.value + '"]')];
  }
  return [];
}

/* Применить focus=role:K / user:L / hist:<id> / release:<id> — прокрутка + кратковременная подсветка.
   Невалид → no-op (R3). #124 — цель зависит от узла дерева (роль/человек в «Ёмкости» — через выбор
   экрана, не клики) и ждётся до 5 с: данные вкладок грузятся асинхронно. Первая попытка — через 200 мс,
   как раньше; по таймауту — no-op. Тот же путь у «Перейти» из напоминаний (работает и без host.navigation). */
const _FOCUS_TICK_MS = 200, _FOCUS_MAX_TICKS = 25;
function _applyShareFocus(focus, deps) {
  if (typeof SHARE_URL_PURE.parseFocus !== 'function') return;
  var f = SHARE_URL_PURE.parseFocus(focus);
  if (!f) return;
  var node = _currentDashNode();
  if (node === 'capacity' && (f.kind === 'role' || f.kind === 'user') && deps && typeof deps.capacityFocus === 'function') {
    try { deps.capacityFocus(f.kind, f.value); } catch (_) {}
  }
  var ticks = 0;
  function tick() {
    try {
      var els = _findFocusTargets(f, node).filter(Boolean);
      if (!els.length) { if (++ticks < _FOCUS_MAX_TICKS) setTimeout(tick, _FOCUS_TICK_MS); return; }
      els[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
      els.forEach(function (el) { el.classList.add('ssp-focus-flash'); });
      setTimeout(function () { els.forEach(function (el) { try { el.classList.remove('ssp-focus-flash'); } catch (_) {} }); }, 1600);
    } catch (_) {}
  }
  setTimeout(tick, _FOCUS_TICK_MS);
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
/* #124 — target {node?, sprintId?, focus?} перекрывает текущее состояние: иконка карточки релиза
   и выбор в «Ёмкости». Без target — ссылка на экран, как в #36. */
function _buildShareHref(deps, target) {
  var t = target || {};
  var base = String(deps.state.getYtBase() || '').replace(/\/+$/, '');
  var raw = (typeof SHARE_URL_PURE.buildShareSearch === 'function')
    ? SHARE_URL_PURE.buildShareSearch({ projectKey: deps.state.getActiveProjectKey(), sprintId: t.sprintId || deps.state.getCurrentSprintId(), node: t.node || _currentDashNode(), focus: t.focus })
    : '';
  var prefixed = raw ? raw.split('&').map(function (p) { return 'app_' + p; }).join('&') : '';
  return base + _SHARE_APP_PATH + (prefixed ? '?' + prefixed : '');
}
/* #109 — адрес вкладки планера в настройках проекта. Главное меню знает группу настроек
   только из зеркала, а пишет зеркало исключительно проектный режим — поэтому «подключить»
   проект можно единственным способом: открыть в нём планер. Вкладка адресуется парой
   «имя приложения : display-имя виджета» (не key). Форма адреса одна на все линейки
   (#111 — проба версии инстанса снята: форма со /settings ломала 2026.1).
   ⚠️ _PROJECT_WIDGET_TAB — per-fork константа (DIFF_MAP §9), как и _SHARE_APP_PATH выше. */
var _PROJECT_WIDGET_TAB = 'smart-sprint-planner:Smart Sprint Planner';
/* Promise<string|null> — null, если базы/ключа нет или чистое ядро недоступно.
   Промис сохранён ради контракта потребителя (project-nav ждёт адрес асинхронно). */
function _projectSettingsHrefAsync(deps) {
  if (typeof SHARE_URL_PURE.buildProjectSettingsHref !== 'function') return Promise.resolve(null);
  return Promise.resolve(SHARE_URL_PURE.buildProjectSettingsHref(
    deps.state.getYtBase(), deps.state.getActiveProjectKey(), _PROJECT_WIDGET_TAB));
}

/* #124 — цель «Поделиться» в рельсе: на «Ёмкости» — выбор справа (человек / роль) и спринт вкладки;
   на прочих узлах — экран целиком. */
function _railTarget(deps) {
  if (_currentDashNode() !== 'capacity' || typeof deps.capacityShareTarget !== 'function') return null;
  try { return deps.capacityShareTarget() || null; } catch (_) { return null; }
}

/* target — от иконки карточки релиза; без него — «Поделиться» в рельсе. Тост называет цель, только
   если фокус реально попал в ссылку (логин вне алфавита FOCUS_RE молча отбрасывается). */
function _onShareClick(deps, target) {
  var t = target || _railTarget(deps);
  var href = _buildShareHref(deps, t);
  try { deps.diag('share copy: ' + href, 'info'); } catch (_) {}
  var label = (t && t.label && SHARE_URL_PURE.parseFocus && SHARE_URL_PURE.parseFocus(t.focus)) ? t.label : null;
  function ok()  { try { deps.toast(label ? deps.T('shareCopyOkTarget').replace('{target}', label) : deps.T('shareCopyOk')); } catch (_) {} }
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
  _projectSettingsHrefAsync: _projectSettingsHrefAsync,   /* #109 */
  _onShareClick: _onShareClick,
};

if (typeof window !== 'undefined') {
  try { window.__SSP_SHARE_CTRL = api; } catch (_) { /* sandboxed write may throw */ }
}

module.exports = api;
