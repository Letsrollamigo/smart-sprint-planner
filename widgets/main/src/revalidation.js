'use strict';
// Working-copy revalidation cluster extracted from widgets/main/src/legacy-monolith.js (Tier C).
// Browser bridge: window.__SSP_REVALIDATION. Golden-tested in
// tests/golden/working-copy.golden.test.js (rev-hashes / revalidation-levels /
// apply-revalidation-matrix) and tests/golden/calc.golden.test.js (checkAllocOverlimit).
//
// Faithful extraction — bodies mirror the IIFE originals 1:1. The monolith keeps thin
// delegators (building deps per call via _revalDeps), so call-sites and hoisting stay
// unchanged. Injected deps:
//   allRoles, status, activeInc — live config/constant references at call time
//   getRoleItemsArr             — state accessor (reads monolith _roleItems)
//   hash                        — __SSP_HASH_PURE utils (_mapById, _numEq, _blockEq, _wcSha1Light)

/* Уровни ре-валидации working copy. Чем глубже правка — тем ниже падает статус. */
function computeRequiredRevalidationLevel(snap, work, deps) {
  var ALL_ROLES = deps.allRoles;
  var _mapById = deps.hash._mapById, _numEq = deps.hash._numEq, _blockEq = deps.hash._blockEq;
  if (!snap || !work) return 'CONFIRMED_REVAL';
  var rk   = snap.roleKey;
  if (!rk) return 'NONE';
  var role = ALL_ROLES.find(function(r){ return r.key === rk; });
  var resK = role ? role.resKey : '';
  var estK = 'estimate_' + rk;
  var allK = 'alloc_'    + rk;

  var sMap = _mapById(snap.items || []);
  var wMap = _mapById(work.items || []);
  var sIds = Object.keys(sMap), wIds = Object.keys(wMap);
  var added = wIds.filter(function(id){ return !sMap[id]; });
  var removed = sIds.filter(function(id){ return !wMap[id]; });
  if (added.length || removed.length) return 'CONFIRMED_REVAL';

  var allocChanged = false;
  for (var i = 0; i < wIds.length; i++) {
    var id = wIds[i], s = sMap[id], w = wMap[id];
    if (s.inclusionStatus !== w.inclusionStatus) return 'CONFIRMED_REVAL';
    if (!_numEq(s[estK], w[estK]))               return 'CONFIRMED_REVAL';
    if (!_numEq(s[allK], w[allK]))               allocChanged = true;
  }
  var sRes = (resK && snap[resK] != null) ? snap[resK] : 0;
  var wRes = (work.sprint && resK && work.sprint[resK] != null) ? work.sprint[resK] : 0;
  if (!_numEq(sRes, wRes)) allocChanged = true;

  var ws = work.sprint || {};
  var metaChanged =
       (snap.name             || null) !== (ws.name             || null)
    || (snap.dateStart        || null) !== (ws.dateStart        || null)
    || (snap.dateEnd          || null) !== (ws.dateEnd          || null)
    || (snap.sprintFieldVal   || null) !== (ws.sprintFieldVal   || null)
    || (snap.versionFieldVal  || null) !== (ws.versionFieldVal  || null)
    || !_blockEq(snap.personalPlanning, work.personalPlanning)
    || !_blockEq(snap.gantt,            work.gantt);

  if (allocChanged) return 'ALLOCATED_REVAL';
  if (metaChanged)  return 'META_ONLY';
  return 'NONE';
}

function applyRevalidationLevel(currentStatus, level, deps) {
  var STATUS = deps.status;
  if (level === 'CONFIRMED_REVAL') return STATUS.PLANNING;
  if (level === 'ALLOCATED_REVAL') {
    return (currentStatus === STATUS.ALLOCATED) ? STATUS.CONFIRMED : currentStatus;
  }
  return currentStatus;
}

/* Стабильный хэш базового снимка по полям, релевантным для diff.
   НЕ включает confirmedAt/By/revisions/personalPlanning/gantt — изменения этих
   полей не должны провоцировать conflict-модал. */
function computeBaseSnapshotHash(snap, deps) {
  var ALL_ROLES = deps.allRoles, _wcSha1Light = deps.hash._wcSha1Light;
  if (!snap) return '';
  var rk = snap.roleKey;
  var role = ALL_ROLES.find(function(r){ return r.key === rk; });
  var resK = role ? role.resKey : '';
  var estK = 'estimate_' + rk;
  var allK = 'alloc_' + rk;
  var items = (snap.items || []).slice()
    .sort(function(a, b){ return String(a.issueId||'').localeCompare(String(b.issueId||'')); })
    .map(function(it){
      return [it.issueId, it.inclusionStatus || '', (it[estK] != null ? it[estK] : ''), (it[allK] != null ? it[allK] : '')].join('|');
    })
    .join(';');
  var head = [
    snap.sprintId || '', snap.status || '',
    snap.name || '', snap.dateStart || 0, snap.dateEnd || 0,
    (resK && snap[resK] != null ? snap[resK] : 0),
    snap.sprintFieldVal || '', snap.versionFieldVal || ''
  ].join('|');
  return _wcSha1Light(head + '##' + items);
}

/**
 * Проверяет превышение аллокации у задач vs. ресурс роли.
 * Возвращает массив индексов задач с превышением.
 */
function checkAllocOverlimit(rk, deps) {
  var ACTIVE_INC = deps.activeInc, getRoleItemsArr = deps.getRoleItemsArr;
  // Строка с задачей: превышение если аллокация задачи > дельта этой задачи (max(0, est-fact))
  // Ресурс задачи = дельта между оценкой и фактом трудозатрат — именно это значение
  // отображается в колонке «Ресурс Анализ» для каждой строки задачи.
  var items = getRoleItemsArr(rk);
  var overlimit = [];
  items.forEach(function(item, idx) {
    if (ACTIVE_INC.indexOf(item.inclusionStatus) < 0) return;
    var alloc = item['alloc_'+rk];
    var est   = item['estimate_'+rk] || 0;
    var fact  = item['fact_'+rk] || 0;
    var delta    = Math.max(0, est - fact);  // ресурс строки задачи
    var allocVal = (alloc !== null && alloc !== undefined) ? alloc : delta;
    // Аллокация задачи превышает дельту этой задачи
    if (delta > 0 && allocVal > delta) overlimit.push(idx);
  });
  return overlimit;
}

const api = {
  computeRequiredRevalidationLevel,
  applyRevalidationLevel,
  computeBaseSnapshotHash,
  checkAllocOverlimit,
};

if (typeof window !== 'undefined') {
  try { window.__SSP_REVALIDATION = api; } catch (_) { /* sandboxed write may throw */ }
}

module.exports = api;
