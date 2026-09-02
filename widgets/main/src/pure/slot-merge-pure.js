'use strict';
/* slot-merge-pure.js — #84 «перечитать-и-слить вместо „обновите страницу"».

   Чистое трёхстороннее слияние значения слота: base (каким слот был, когда эта
   вкладка его читала) / mine (что вкладка пытается записать) / theirs (что лежит
   на сервере сейчас). Про транспорт и стейт не знает ничего — вход и выход только
   данные, поэтому проверяется юнитами (tests/unit/slot-merge.test.js).
   Потребитель ровно один — api-шов data/youtrack-api.js на 409 rev_conflict.

   Правило: правку берёт та сторона, которая её сделала; обе стороны тронули одно
   и то же место РАЗНЫМИ значениями → conflict, и наверху остаётся честный отказ
   #100 (заморозка правок до перезагрузки). Одинаковое значение с двух сторон
   конфликтом НЕ считается — иначе повторное слияние ловило бы собственную
   предыдущую merge-запись как чужую правку (вкладка после слияния намеренно
   остаётся на доконфликтных rev+базе, см. коммент у _mergeRetry в youtrack-api.js).

   Удаление отличаем от «ключа не было» по базе (ожог #102, memory
   feedback_empty_remote_is_not_a_fact): отсутствие ключа у чужой стороны — факт
   удаления только если ключ БЫЛ в базе; и даже тогда, если я его правил, это
   конфликт, а не молчаливое согласие с удалением.

   Публикует window.__SSP_SLOT_MERGE_PURE. */

/* Серверные штампы: сервер проставляет их сам на каждой записи (pluginVersion
   в history/sprint, updatedBy/At в #67 H8 и релизах, _rev в sprint). В сравнении
   не участвуют — иначе ЛЮБАЯ чужая запись выглядела бы правкой каждого поля. */
var STAMP_KEYS = { pluginVersion: 1, updatedAt: 1, updatedBy: 1, _rev: 1 };

/* Кандидаты в идентификатор записи массива — первый, которым массив индексируется
   без дублей, и выигрывает. Одним списком на все слоты: history → sprintId,
   releases → id, roleItems[роль] → issueId. Массив, который не индексируется
   (нет ключа, дубли, не объекты), сравнивается целиком. */
var ID_FIELDS = ['sprintId', 'id', 'issueId'];

function _isPlainObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
function _notStamp(k)   { return !STAMP_KEYS[k]; }
function _has(o, k)     { return Object.prototype.hasOwnProperty.call(o, k); }

/* Глубокое равенство, игнорируя серверные штампы. */
function _eq(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (!_eq(a[i], b[i])) return false;
    return true;
  }
  if (_isPlainObj(a) && _isPlainObj(b)) {
    var ka = Object.keys(a).filter(_notStamp);
    var kb = Object.keys(b).filter(_notStamp);
    if (ka.length !== kb.length) return false;
    for (var j = 0; j < ka.length; j++) {
      if (!_has(b, ka[j]) || !_eq(a[ka[j]], b[ka[j]])) return false;
    }
    return true;
  }
  return false;   /* примитивы отсеяны === выше */
}

/* Массив записей → карта id→запись. null, если этим полем не индексируется.
   Карта — Object.create(null): id вида '__proto__' уводил бы в член прототипа
   (тот же класс, что #67 H6 на бэкенде). */
function _index(arr, field) {
  var map = Object.create(null);
  for (var i = 0; i < arr.length; i++) {
    var it = arr[i];
    if (!_isPlainObj(it)) return null;
    var id = it[field];
    if (typeof id !== 'string' || !id || _has(map, id)) return null;
    map[id] = it;
  }
  return map;
}

/* Общее поле-идентификатор для всех трёх сторон — иначе сливать поэлементно нечем. */
function _pickIdField(base, mine, theirs) {
  for (var i = 0; i < ID_FIELDS.length; i++) {
    var f = ID_FIELDS[i];
    if (_index(mine, f) && _index(theirs, f) && (!Array.isArray(base) || _index(base, f))) return f;
  }
  return null;
}

function _mergeMaps(base, mine, theirs, path, conflicts) {
  /* Object.create(null), а не {}: ключ '__proto__' у обычного литерала не становится
     собственным свойством — запись с таким id молча исчезала бы из результата
     (поймано юнитом; парный guard на бэкенде — #67 H6). */
  var out = Object.create(null);
  var seen = Object.create(null);
  var keys = [];
  [mine, theirs, base].forEach(function (src) {
    Object.keys(src).forEach(function (k) { if (!seen[k]) { seen[k] = 1; keys.push(k); } });
  });

  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    var hasB = _has(base, k), hasM = _has(mine, k), hasT = _has(theirs, k);
    var p = path ? path + '.' + k : k;

    if (!hasM && !hasT) continue;                       /* удалили обе стороны */
    if (hasM && !hasT) {
      if (!hasB)                    { out[k] = mine[k]; continue; }   /* я добавил */
      if (_eq(base[k], mine[k]))    { continue; }                     /* они удалили, я не трогал */
      conflicts.push(p); continue;                                    /* они удалили, я правил */
    }
    if (!hasM && hasT) {
      if (!hasB)                    { out[k] = theirs[k]; continue; } /* они добавили */
      if (_eq(base[k], theirs[k]))  { continue; }                     /* я удалил, они не трогали */
      conflicts.push(p); continue;                                    /* я удалил, они правили */
    }
    out[k] = _merge(hasB ? base[k] : undefined, mine[k], theirs[k], p, conflicts);
  }
  return out;
}

function _merge(base, mine, theirs, path, conflicts) {
  if (_eq(mine, theirs))  return theirs;   /* обе стороны пришли к одному значению */
  if (_eq(base, mine))    return theirs;   /* я не трогал → чужое */
  if (_eq(base, theirs))  return mine;     /* они не трогали → моё */

  /* Обе стороны правили это место по-разному — пробуем спуститься глубже. */
  if (Array.isArray(mine) && Array.isArray(theirs)) {
    var idf = _pickIdField(base, mine, theirs);
    if (!idf) { conflicts.push(path); return theirs; }
    var bi = Array.isArray(base) ? _index(base, idf) : Object.create(null);
    var mi = _index(mine, idf), ti = _index(theirs, idf);
    var merged = _mergeMaps(bi, mi, ti, path, conflicts);
    /* Порядок: сперва мои записи, которых у них нет (и фронт, и бэкенд кладут
       новую запись в голову — unshift), затем чужой порядок. */
    var out = [], m, t;
    for (m = 0; m < mine.length; m++) {
      var mid = mine[m][idf];
      if (!_has(ti, mid) && _has(merged, mid)) out.push(merged[mid]);
    }
    for (t = 0; t < theirs.length; t++) {
      var tid = theirs[t][idf];
      if (_has(merged, tid)) out.push(merged[tid]);
    }
    return out;
  }

  if (_isPlainObj(mine) && _isPlainObj(theirs)) {
    return _mergeMaps(_isPlainObj(base) ? base : {}, mine, theirs, path, conflicts);
  }

  conflicts.push(path);   /* скаляры / разные типы — сливать нечего */
  return theirs;
}

/* merge(base, mine, theirs) → {ok:true, result} | {ok:false, conflicts:[путь…]} */
function merge(base, mine, theirs) {
  var conflicts = [];
  var result = _merge(base, mine, theirs, '', conflicts);
  if (conflicts.length) return { ok: false, conflicts: conflicts };
  /* Прогон через JSON: узлы слияния собраны на Object.create(null) — возвращаем
     обычные объекты (и заодно отбрасываем undefined, как это сделает сериализация
     тела POST'а). Собственный ключ '__proto__' round-trip переживает. */
  return { ok: true, result: JSON.parse(JSON.stringify(result)) };
}

var api = { merge: merge };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
try { if (typeof window !== 'undefined') window.__SSP_SLOT_MERGE_PURE = api; } catch (_) { /* sandboxed write may throw */ }
