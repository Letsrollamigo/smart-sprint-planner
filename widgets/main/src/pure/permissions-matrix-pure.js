/* #71 — «Управление правами» как таблица «группа × полномочие»: чистая логика.
   Форма уже держит права как 12 независимых слотов {ids,names} (settings-form.jsx:
   groups ×6, release ×4, reporting ×2), а путь сохранения пишет каждый слот в свою
   пару ключей <x>Groups/<x>GroupNames и от раскладки не зависит. Таблица — ПРОИЗВОДНОЕ
   представление тех же слотов: галочка (группа G, полномочие P) = «G ∈ слот P».
   Поэтому императив #71 п.2 (хранимые настройки переживают апдейт) выполняется
   по построению — collect() не меняется ни строкой.

   Инварианты (SPEC §2, юниты — tests/unit/permissions-matrix.test.js):
     I1  строки строятся из СОХРАНЁННЫХ слотов; живой список групп YT только
         обогащает имена, никогда не фильтрует (удалённая в YT группа остаётся
         строкой-сиротой, её права не теряются);
     I2  round-trip: открыл → сохранил без правок → все 24 массива byte-identical;
     I3  хранимые *GroupNames не освежаются из loadGroups (имя участвует в userInGroups);
     I5  добавление — в конец слота, снятие — splice по индексу (как removeTag сегодня).

   Без DOM и React — потребитель react/settings-permissions.jsx. */
'use strict';

/* 12 колонок в трёх группах шапки. slotKey — путь до слота в стейте формы:
   bucket = groups|release|reporting (три независимых useState формы), key — поле в нём.
   required — deny-by-default колонки (#69 R1 строка 3): пусто = не может НИКТО. */
var PERMISSION_COLUMNS = [
  { id: 'planning',   group: 'planning',  bucket: 'groups',    key: 'planning',   required: false },
  { id: 'val',        group: 'planning',  bucket: 'groups',    key: 'val',        required: true  },
  { id: 'edit',       group: 'planning',  bucket: 'groups',    key: 'edit',       required: true  },
  { id: 'histClear',  group: 'planning',  bucket: 'groups',    key: 'histClear',  required: false },
  { id: 'assigner',   group: 'planning',  bucket: 'groups',    key: 'assigner',   required: false },
  { id: 'sprintLock', group: 'planning',  bucket: 'groups',    key: 'sprintLock', required: false },
  { id: 'candMgr',    group: 'release',   bucket: 'release',   key: 'candMgr',    required: false },
  { id: 'candEng',    group: 'release',   bucket: 'release',   key: 'candEng',    required: false },
  { id: 'rightsMgr',  group: 'release',   bucket: 'release',   key: 'rightsMgr',  required: false },
  { id: 'rightsEng',  group: 'release',   bucket: 'release',   key: 'rightsEng',  required: false },
  { id: 'repA',       group: 'reporting', bucket: 'reporting', key: 'groupsA',    required: false },
  { id: 'repB',       group: 'reporting', bucket: 'reporting', key: 'groupsB',    required: false },
];

var COLUMN_GROUPS = ['planning', 'release', 'reporting'];

/* Лимит групп на слот — как в снятом GrpMultiSelect (backend whitelist его не проверяет,
   потолок держался только формой; сохраняем поведение). */
var MAX_GROUPS_PER_SLOT = 100;

/* Идентичность строки: id, а при пустом id — имя (legacy-записи, писавшиеся по имени).
   Префиксы разводят пространства: группа с id 'X' и группа с именем 'X' — разные строки. */
function rowKeyOf(id, name) {
  var gid = (id === null || id === undefined) ? '' : String(id);
  if (gid) return 'i:' + gid;
  var nm = (name === null || name === undefined) ? '' : String(name);
  return nm ? 'n:' + nm : '';
}

function _slot(state, col) {
  var bucket = (state && state[col.bucket]) || {};
  var s = bucket[col.key] || {};
  return { ids: Array.isArray(s.ids) ? s.ids : [], names: Array.isArray(s.names) ? s.names : [] };
}

/* I5 — индекс группы в слоте: по id, а для legacy-записи без id — по имени
   (позиция в names при пустом ids[i]). -1 = группы в слоте нет. */
function _indexInSlot(slot, row) {
  var i;
  if (row.id) {
    i = slot.ids.indexOf(row.id);
    return i;
  }
  for (i = 0; i < slot.names.length; i++) {
    if (!slot.ids[i] && slot.names[i] === row.name) return i;
  }
  return -1;
}

/* I1 — строки = упорядоченное объединение групп из ВСЕХ 12 слотов по сохранённым
   данным. Порядок — первое появление при обходе колонок в порядке PERMISSION_COLUMNS,
   внутри колонки — порядок слота. Живой список групп (groupList) НЕ участвует в отборе
   строк: он лишь даёт свежее имя для показа и снимает маркер сироты. */
function buildRows(state, groupList) {
  var live = {}; var liveByName = {};
  var loaded = Array.isArray(groupList) && groupList.length > 0;
  if (loaded) {
    groupList.forEach(function (g) {
      if (!g) return;
      var gid = g.id ? String(g.id) : '';
      if (gid) live[gid] = g;
      if (g.name) liveByName[String(g.name)] = g;
    });
  }
  var order = []; var byKey = {};
  PERMISSION_COLUMNS.forEach(function (col) {
    var slot = _slot(state, col);
    var n = Math.max(slot.ids.length, slot.names.length);
    for (var i = 0; i < n; i++) {
      var id = slot.ids[i] ? String(slot.ids[i]) : '';
      var name = (slot.names[i] === null || slot.names[i] === undefined) ? '' : String(slot.names[i]);
      var key = rowKeyOf(id, name);
      if (!key || byKey[key]) continue;
      byKey[key] = _makeRow(key, id, name, live, liveByName, loaded);
      order.push(byKey[key]);
    }
  });
  return order;
}

function _makeRow(key, id, name, live, liveByName, loaded) {
  var hit = id ? live[id] : liveByName[name];
  return {
    key: key,
    id: id,
    /* I3 — хранимое имя остаётся источником правды для сейва; свежее имя из YT
       идёт только в display (в слоты его не переписываем). */
    name: name,
    display: (hit && hit.name) ? String(hit.name) : (name || id),
    /* Маркеры показываются только когда список групп реально загружен: loadProjectGroups
       глотает ошибку и ставит [], поэтому «пусто» неотличимо от «упало» — при пустом
       списке любая строка ложно выглядела бы сиротой. */
    orphan: loaded && !hit,
    allUsers: !!(hit && hit.allUsersGroup),
  };
}

/* Строка, добавленная кнопкой «Добавить группу»: ещё ни в одном слоте нет. */
function makeNewRow(group) {
  var g = group || {};
  var id = g.id ? String(g.id) : '';
  var name = g.name ? String(g.name) : '';
  return {
    key: rowKeyOf(id, name), id: id, name: name,
    display: name || id, orphan: false, allUsers: !!g.allUsersGroup,
  };
}

/* Опции пикера «Добавить группу» = живой список минус уже присутствующие строки
   (по id, fallback по имени) — «одну группу нельзя добавить дважды» (#71 п.5). */
function availableGroups(groupList, rows) {
  var takenId = {}; var takenName = {};
  (rows || []).forEach(function (r) {
    if (!r) return;
    if (r.id) takenId[r.id] = true; else if (r.name) takenName[r.name] = true;
  });
  return (Array.isArray(groupList) ? groupList : []).filter(function (g) {
    if (!g) return false;
    var gid = g.id ? String(g.id) : '';
    if (gid && takenId[gid]) return false;
    if (!gid && g.name && takenName[String(g.name)]) return false;
    return true;
  });
}

function isChecked(state, row, colId) {
  var col = columnById(colId);
  if (!col || !row) return false;
  return _indexInSlot(_slot(state, col), row) >= 0;
}

function columnById(colId) {
  for (var i = 0; i < PERMISSION_COLUMNS.length; i++) {
    if (PERMISSION_COLUMNS[i].id === colId) return PERMISSION_COLUMNS[i];
  }
  return null;
}

/* Сколько галок стоит у строки — число для модалки удаления («будут отозваны N прав»). */
function countRights(state, row) {
  var n = 0;
  PERMISSION_COLUMNS.forEach(function (col) {
    if (_indexInSlot(_slot(state, col), row) >= 0) n++;
  });
  return n;
}

/* I5 — переключение галки. Возвращает { slot:{ids,names}, overflow } — новое значение
   ОДНОГО слота (потребитель кладёт его через setGroup/setRel/setRep, путь сейва не
   трогается). overflow=true → лимит слота, значение не изменилось (тост потребителя). */
function toggleCell(state, row, colId) {
  var col = columnById(colId);
  var slot = _slot(state, col);
  var i = _indexInSlot(slot, row);
  var ids = slot.ids.slice(); var names = slot.names.slice();
  if (i >= 0) {
    ids.splice(i, 1); names.splice(i, 1);
    return { slot: { ids: ids, names: names }, overflow: false };
  }
  if (ids.length >= MAX_GROUPS_PER_SLOT) return { slot: { ids: ids, names: names }, overflow: true };
  ids.push(row.id); names.push(row.name || row.display || row.id);
  return { slot: { ids: ids, names: names }, overflow: false };
}

/* Удаление строки: группа вычищается из всех 12 слотов. Возвращает патчи по bucket'ам —
   { groups:{...}, release:{...}, reporting:{...} } с ТОЛЬКО изменившимися слотами
   (пустой bucket не возвращается: незатронутые слоты остаются прежними ссылками → I2). */
function removeRow(state, row) {
  var patch = {};
  PERMISSION_COLUMNS.forEach(function (col) {
    var slot = _slot(state, col);
    var i = _indexInSlot(slot, row);
    if (i < 0) return;
    var ids = slot.ids.slice(); var names = slot.names.slice();
    ids.splice(i, 1); names.splice(i, 1);
    if (!patch[col.bucket]) patch[col.bucket] = {};
    patch[col.bucket][col.key] = { ids: ids, names: names };
  });
  return patch;
}

/* Обязательные колонки без единой галки — предупреждение под таблицей (сейв не блокируется:
   пусто разрешено и сегодня). Возвращает массив id колонок. */
function emptyRequiredColumns(state) {
  return PERMISSION_COLUMNS.filter(function (col) {
    if (!col.required) return false;
    var slot = _slot(state, col);
    return slot.ids.length === 0 && slot.names.length === 0;
  }).map(function (col) { return col.id; });
}

var _api = {
  PERMISSION_COLUMNS: PERMISSION_COLUMNS,
  COLUMN_GROUPS: COLUMN_GROUPS,
  MAX_GROUPS_PER_SLOT: MAX_GROUPS_PER_SLOT,
  rowKeyOf: rowKeyOf,
  buildRows: buildRows,
  makeNewRow: makeNewRow,
  availableGroups: availableGroups,
  columnById: columnById,
  isChecked: isChecked,
  countRights: countRights,
  toggleCell: toggleCell,
  removeRow: removeRow,
  emptyRequiredColumns: emptyRequiredColumns,
};

if (typeof window !== 'undefined') {
  try { window.__SSP_PERMISSIONS_MATRIX_PURE = _api; } catch (_) { /* sandboxed write may throw */ }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = _api;
}
