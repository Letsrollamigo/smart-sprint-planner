/* widgets/main/src/share-url-pure.js
   Side-effect модуль: чистое ядро deep-link share-URL (#36).
   Публикует window.__SSP_SHARE_URL_PURE ДО исполнения IIFE core.js
   (паттерн как period-pure / sort-pure / refresh-merge-pure; импортируется в index.js раньше монолита).

   Назначение — двусторонняя трансляция между URL-search и состоянием планера:
     • parseShareSearch(search)  → { projectKey, sprintId, node, focus }  (URL → state, на init)
     • buildShareSearch(state)   → 'projectKey=K&sprintId=S&node=N&focus=F' (state → URL, авто-синк)

   Ключевые решения (спека SHARE_URL_36_SPEC.md §2.3, §6 D1):
     • Параметры: projectKey (shortName), sprintId (base-UUID), node (enum), focus ('role:K'|'user:L').
       view-параметра НЕТ (режим решают права + гибрид-режим WC).
     • node в URL — «красивый» dotted-формат спеки (params/planning.roles/…); парсер мапит его
       в ВНУТРЕННИЕ id дерева (sprint-params/planning-roles/…), которыми оперирует монолит
       (_setDashNode). buildShareSearch делает обратную мапу. Неизвестный node → опускается.
     • focus валидируется по формату ^(role|user):<...>$; иначе опускается.
     • URLSearchParams и для build, и для parse — устойчиво к URL-кодированию (host YT
       добавляет app_-префикс к ключам в видимой строке, но getAppLocation()/replaceAppLocation()
       работают с чистыми ключами симметрично — проверено V0-A 2026-06-09).

   Чистая, без побочных эффектов и без обращения к DOM/host. */

/* node: URL-формат (спека) ↔ внутренний id дерева (SSP_DASH_NODES в монолите) */
var NODE_URL_TO_INTERNAL = {
  'params':            'sprint-params',
  'planning.roles':    'planning-roles',
  'planning.people':   'planning-people',
  'planning.standup':  'planning-standup',
  'gantt':             'gantt',
  'history':           'history',
  'capacity':          'capacity'
};
var NODE_INTERNAL_TO_URL = (function () {
  var m = {};
  for (var k in NODE_URL_TO_INTERNAL) { if (Object.prototype.hasOwnProperty.call(NODE_URL_TO_INTERNAL, k)) m[NODE_URL_TO_INTERNAL[k]] = k; }
  return m;
})();

var FOCUS_RE = /^(role|user):[A-Za-z0-9._@-]+$/;

function _getParams(search) {
  if (search == null || typeof search !== 'string') return null;
  var s = search.charAt(0) === '?' ? search.slice(1) : search;
  if (!s) return null;
  try { return new URLSearchParams(s); } catch (_) { return null; }
}

/* URL search → { projectKey, sprintId, node, focus }. Включаются только валидные ключи.
   node возвращается во ВНУТРЕННЕМ виде (sprint-params/planning-roles/…). */
function parseShareSearch(search) {
  var out = {};
  var p = _getParams(search);
  if (!p) return out;

  var pk = p.get('projectKey');
  if (pk) out.projectKey = String(pk).trim();

  var sid = p.get('sprintId');
  if (sid) out.sprintId = String(sid).trim();

  var node = p.get('node');
  if (node && Object.prototype.hasOwnProperty.call(NODE_URL_TO_INTERNAL, node)) {
    out.node = NODE_URL_TO_INTERNAL[node];
  }

  var focus = p.get('focus');
  if (focus && FOCUS_RE.test(focus)) out.focus = focus;

  return out;
}

/* state { projectKey, sprintId, node(внутренний), focus } → URL search строка (без ведущего '?').
   Пустые/невалидные поля опускаются. node переводится во внешний dotted-формат. */
function buildShareSearch(state) {
  state = state || {};
  var p;
  try { p = new URLSearchParams(); } catch (_) { return ''; }

  if (state.projectKey) p.set('projectKey', String(state.projectKey));
  if (state.sprintId)   p.set('sprintId', String(state.sprintId));

  if (state.node && Object.prototype.hasOwnProperty.call(NODE_INTERNAL_TO_URL, state.node)) {
    p.set('node', NODE_INTERNAL_TO_URL[state.node]);
  }

  if (state.focus && FOCUS_RE.test(state.focus)) p.set('focus', state.focus);

  return p.toString();
}

/* Разбор focus-значения 'role:analysis' / 'user:jdoe' → { kind:'role'|'user', value:'analysis' }
   (null, если формат не распознан). Удобный хелпер для монолита. */
function parseFocus(focus) {
  if (!focus || typeof focus !== 'string' || !FOCUS_RE.test(focus)) return null;
  var i = focus.indexOf(':');
  return { kind: focus.slice(0, i), value: focus.slice(i + 1) };
}

var _api = {
  parseShareSearch: parseShareSearch,
  buildShareSearch: buildShareSearch,
  parseFocus: parseFocus,
  NODE_URL_TO_INTERNAL: NODE_URL_TO_INTERNAL,
  NODE_INTERNAL_TO_URL: NODE_INTERNAL_TO_URL
};

if (typeof window !== 'undefined') {
  try { window.__SSP_SHARE_URL_PURE = _api; } catch (_) { /* sandboxed write may throw */ }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = _api;
}
