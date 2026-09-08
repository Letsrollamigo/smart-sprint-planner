'use strict';
/* #114 — дрейф состава роли после согласования: чистые функции без DOM и стейта.
   Browser bridge: window.__SSP_SCOPE_DRIFT_PURE. Юнит-тест: tests/unit/scope-drift-pure.test.js.

   Слепок согласования `agreed` пишется в снимок роли при «Согласовать» (working-copy.js
   buildRoleSnap, wasValidated) и переносится нетронутым при всех прочих перезаписях снимка:
     { at: <мс>, by: <кто>, items: { <issueId>: { e?: <оценка, минуты>, x?: 1 } } }
   Компактно намеренно: история лежит в одном свойстве проекта с потолком 1 МБ без пути
   архивации (#110 «Партиционирование»), поэтому в слепок идёт только то, что нужно диффу —
   оценка роли (если число) и признак «исключена из спринта» (только когда он есть).
   Дрейф = состав (добавлено / снято) + оценки + исключения (⚖ владелец 2026-09-08). */

var EXCLUDED = 'INC_EXCLUDED';

function _numOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  var n = Number(v);
  return isFinite(n) ? n : null;
}

/* Слепок согласованного состава роли rk из строк items (все строки, включая исключённые). */
function buildAgreed(items, rk, at, by) {
  var map = {};
  (Array.isArray(items) ? items : []).forEach(function (it) {
    if (!it || !it.issueId) return;
    var rec = {};
    var e = _numOrNull(it['estimate_' + rk]);
    if (e !== null) rec.e = e;
    if (it.inclusionStatus === EXCLUDED) rec.x = 1;
    map[String(it.issueId)] = rec;
  });
  return {
    at: (typeof at === 'number' && isFinite(at)) ? at : null,
    by: by || null,
    items: map,
  };
}

function _emptyDrift() {
  return { has: false, added: [], removed: [], estimate: [], excluded: [], restored: [], count: 0, at: null, by: null };
}

/* Дифф текущих строк роли rk против слепка согласования. has=false — слепка нет
   (роль ни разу не согласовывалась), тогда дрейфа нет по определению. */
function computeDrift(agreed, items, rk) {
  var out = _emptyDrift();
  if (!agreed || typeof agreed !== 'object' || !agreed.items || typeof agreed.items !== 'object') return out;
  out.has = true;
  out.at = (typeof agreed.at === 'number') ? agreed.at : null;
  out.by = agreed.by || null;
  var cur = {};
  (Array.isArray(items) ? items : []).forEach(function (it) {
    if (it && it.issueId) cur[String(it.issueId)] = it;
  });
  Object.keys(cur).forEach(function (id) {
    var base = agreed.items[id];
    if (!base || typeof base !== 'object') { out.added.push(id); return; }
    var it = cur[id];
    var from = _numOrNull(base.e), to = _numOrNull(it['estimate_' + rk]);
    if (from !== to) out.estimate.push({ id: id, from: from, to: to });
    var wasX = (base.x === 1 || base.x === true), isX = (it.inclusionStatus === EXCLUDED);
    if (isX && !wasX) out.excluded.push(id);
    else if (wasX && !isX) out.restored.push(id);
  });
  Object.keys(agreed.items).forEach(function (id) {
    if (!cur[id]) out.removed.push(id);
  });
  out.count = out.added.length + out.removed.length + out.estimate.length
    + out.excluded.length + out.restored.length;
  return out;
}

/* Сумма по ролям — для бейджа шапки спринта. */
function summarizeDrift(drifts) {
  var s = { count: 0, roles: 0, added: 0, removed: 0, estimate: 0, excluded: 0, restored: 0 };
  (Array.isArray(drifts) ? drifts : []).forEach(function (d) {
    if (!d || !d.count) return;
    s.roles += 1;
    s.count += d.count;
    s.added += d.added.length;
    s.removed += d.removed.length;
    s.estimate += d.estimate.length;
    s.excluded += d.excluded.length;
    s.restored += d.restored.length;
  });
  return s;
}

/* Короткая запись «+2 −1 ~3 ⊘1 ↩1»: одна и та же в шапке аккордеона роли и в бейдже
   спринта; нулевые части опускаются. Принимает и дифф роли, и сумму summarizeDrift. */
function formatShort(d) {
  if (!d || !d.count) return '';
  function n(k) { return Array.isArray(d[k]) ? d[k].length : (d[k] || 0); }
  var parts = [];
  if (n('added'))    parts.push('+' + n('added'));
  if (n('removed'))  parts.push('−' + n('removed'));
  if (n('estimate')) parts.push('~' + n('estimate'));
  if (n('excluded')) parts.push('⊘' + n('excluded'));
  if (n('restored')) parts.push('↩' + n('restored'));
  return parts.join(' ');
}

var _api = {
  buildAgreed: buildAgreed,
  computeDrift: computeDrift,
  summarizeDrift: summarizeDrift,
  formatShort: formatShort,
};

if (typeof window !== 'undefined') {
  try { window.__SSP_SCOPE_DRIFT_PURE = _api; } catch (_) { /* sandboxed write may throw */ }
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = _api;
}
