/* widgets/main/src/hash-pure.js
   Чистые hash / equality / diff-утилиты рабочих копий. Публикует window.__SSP_HASH_PURE
   ДО исполнения IIFE legacy-monolith.js (паттерн как period-pure / date-pure).
   Зависимостей от closure-состояния нет. (_sortKeys — внутренний хелпер, не экспортируется.) */

/* FNV-подобный 32-бит хеш строки → 8 hex-символов (отпечаток блока рабочей копии). */
function _wcSha1Light(s) {
  var h = 0x811c9dc5 >>> 0;
  for (var i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ('00000000' + h.toString(16)).slice(-8);
}

/* Стабилизирующая сортировка ключей для _blockEq. */
function _sortKeys(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(_sortKeys);
  var keys = Object.keys(obj).sort();
  var out = {};
  for (var i = 0; i < keys.length; i++) out[keys[i]] = _sortKeys(obj[keys[i]]);
  return out;
}

/* Глубокое сравнение блоков, нечувствительное к порядку ключей. */
function _blockEq(a, b) {
  return JSON.stringify(_sortKeys(a || null)) === JSON.stringify(_sortKeys(b || null));
}

/* Массив элементов → мапа по issueId. */
function _mapById(arr) {
  var out = {};
  if (!Array.isArray(arr)) return out;
  for (var i = 0; i < arr.length; i++) {
    var it = arr[i];
    if (it && it.issueId) out[it.issueId] = it;
  }
  return out;
}

/* Числовое равенство с трактовкой undefined/null как эквивалентных. */
function _numEq(a, b) {
  if (a === undefined) a = null;
  if (b === undefined) b = null;
  if (a === null || b === null) return a === b;
  return Number(a) === Number(b);
}

/* Дифф состава снимок↔рабочая копия для UI: { added, removed, changed }. */
function diffItemsForUI(snap, working) {
  var rk = snap.roleKey;
  var estK = 'estimate_' + rk;
  var allK = 'alloc_' + rk;
  var sMap = _mapById(snap.items || []);
  var wMap = _mapById(working.items || []);
  var added = [], removed = [], changed = [];
  Object.keys(wMap).forEach(function (id) {
    if (!sMap[id]) { added.push(wMap[id]); return; }
    var fields = [];
    if (sMap[id].inclusionStatus !== wMap[id].inclusionStatus)
      fields.push({ name: 'inclusionStatus', from: sMap[id].inclusionStatus, to: wMap[id].inclusionStatus });
    if (!_numEq(sMap[id][estK], wMap[id][estK]))
      fields.push({ name: estK, from: sMap[id][estK], to: wMap[id][estK] });
    if (!_numEq(sMap[id][allK], wMap[id][allK]))
      fields.push({ name: allK, from: sMap[id][allK], to: wMap[id][allK] });
    if (fields.length) changed.push({ item: wMap[id], fields: fields });
  });
  Object.keys(sMap).forEach(function (id) {
    if (!wMap[id]) removed.push(sMap[id]);
  });
  return { added: added, removed: removed, changed: changed };
}

/* FNV-32 хеш сериализованного { sprint, roleItems } → hex (отпечаток ревизии). */
function computeRevHash(sprint, roleItems) {
  var s = JSON.stringify({ s: sprint, r: roleItems });
  var h = 0x811c9dc5;
  for (var i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16);
}

if (typeof window !== 'undefined') {
  window.__SSP_HASH_PURE = {
    _wcSha1Light: _wcSha1Light, _blockEq: _blockEq, _mapById: _mapById,
    _numEq: _numEq, diffItemsForUI: diffItemsForUI, computeRevHash: computeRevHash,
  };
}
