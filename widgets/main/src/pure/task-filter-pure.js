/* task-filter-pure.js — 118-1в / 118-3: фильтры таблиц задач спринта (исполнитель ·
   состояние · роль · приоритет). Чистые функции без DOM и стейта: нормализация выбора,
   «строка проходит фильтр», опции списков. Выбор живёт в острове react/task-filter.jsx
   (мост __SSP_TASK_FILTER_BAR) до перезагрузки страницы — ⚖ владелец 2026-09-10: не храним.
   Потребители — сводная, состав роли, таблица задач «Людей».
   Юниты — tests/unit/task-filter.test.js. */
'use strict';

var FIELDS = ['assignee', 'state', 'role', 'priority'];
/* Пустое значение: «Не назначен» у исполнителя, «—» у состояния и приоритета. */
var NONE = '__none';

function normSel(sel) {
  var out = {};
  FIELDS.forEach(function (f) {
    var v = sel && sel[f];
    out[f] = Array.isArray(v) ? v.filter(function (x) { return typeof x === 'string'; }) : [];
  });
  return out;
}

/* Отбирает ли выбор хоть по одному из полей fields (по умолчанию — по любому). */
function isActive(sel, fields) {
  var s = normSel(sel);
  return (fields || FIELDS).some(function (f) { return s[f].length > 0; });
}

/* Значение поля строки (или массив значений) → ключи; пусто и «—» → NONE. */
function keysOf(v) {
  var out = (Array.isArray(v) ? v : [v]).filter(function (x) { return typeof x === 'string' && x !== '' && x !== '—'; });
  return out.length ? out : [NONE];
}

/* Внутри поля — «любое из отмеченных», между полями — «и». facts = {assignee, state, role,
   priority}: строка или массив строк. fields ограничивает набор полей экрана. */
function matches(sel, facts, fields) {
  var s = normSel(sel);
  return (fields || FIELDS).every(function (f) {
    if (!s[f].length) return true;
    return keysOf(facts ? facts[f] : null).some(function (k) { return s[f].indexOf(k) >= 0; });
  });
}

/* Опции списка: ключи в порядке values (порядок задаёт вызывающий — бандл YouTrack через
   сортировку по полю), NONE первым; отмеченные, которых в задачах уже нет, — в конце:
   снять их можно, таблица при этом честно пуста. labelOf(key) → подпись. */
function options(values, selected, labelOf) {
  var seen = {}, keys = [];
  function add(k) { if (!seen[k]) { seen[k] = true; keys.push(k); } }
  (values || []).forEach(function (v) { keysOf(v).forEach(add); });
  (selected || []).forEach(add);
  var none = keys.indexOf(NONE);
  if (none > 0) { keys.splice(none, 1); keys.unshift(NONE); }
  return keys.map(function (k) { return { key: k, label: labelOf(k) }; });
}

/* Исполнитель задачи в роли по карте PP (канон истории + live-PP, 68-1): логин или ''. */
function assigneeOf(ppMap, rk, issueId) {
  var ta = ppMap && ppMap[rk] && ppMap[rk].taskAssignments && ppMap[rk].taskAssignments[issueId];
  return (ta && ta.assignee) || '';
}

var _api = {
  FIELDS: FIELDS,
  NONE: NONE,
  normSel: normSel,
  isActive: isActive,
  matches: matches,
  options: options,
  assigneeOf: assigneeOf,
};

if (typeof window !== 'undefined') {
  try { window.__SSP_TASK_FILTER_PURE = _api; } catch (_) { /* sandboxed write may throw */ }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = _api;
}
