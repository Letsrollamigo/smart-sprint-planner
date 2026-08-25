/* display-fields-pure.js — 68-8 «Отображаемые поля»: произвольные поля YouTrack
   проекта дополнительными колонками трёх таблиц задач.

   Значения полей НЕ хранятся нигде (ни в составе спринта, ни в снимках, ни в истории) —
   читаются на лету под правами самого пользователя (⚖2). Хранится только НАБОР колонок:
   settings.displayFields = [{name, summary, role, my}], где name — имя поля YouTrack
   (у GET project-fields id нет вовсе), а три флага = в какой из трёх таблиц колонка видна:
     summary — сводная «Аллокация общего ресурса»;
     role    — состав роли;
     my      — «Моя роль» (таблица задач, не исполнителей).

   Здесь — нормализация набора, опции пикера и форматтеры значений по типам.
   Без DOM и React. Потребители: react/settings-fields.jsx (набор),
   infra/fieldvalues-loader.js (список имён + отпечаток), три вью (колонки).
   Юниты — tests/unit/display-fields.test.js. */
'use strict';

var DF_MAX = 50;                 /* технический потолок набора (⚖12) */
var DF_TABLES = ['summary', 'role', 'my'];

/* Префикс id колонки. Имя поля YouTrack — произвольная пользовательская строка, а ключи
   ячеек уже заняты (id/state/title/assignee/est_<rk>/estSum/delete). Слаг НЕ делаем:
   два разных имени схлопнулись бы в один id и молча слили ячейки. */
function colId(name) { return 'cf_' + String(name); }

function _normRow(r) {
  if (!r || typeof r !== 'object') return null;
  var name = (typeof r.name === 'string') ? r.name.trim() : '';
  if (!name) return null;
  return { name: name, summary: !!r.summary, role: !!r.role, my: !!r.my };
}

/* Блоб настроек может прийти из чужой/старой вкладки — здесь defensive-нормализация,
   строгая валидация живёт на бэке (validateSettings). */
function normRows(raw) {
  if (!Array.isArray(raw)) return [];
  var out = [], seen = {};
  for (var i = 0; i < raw.length && out.length < DF_MAX; i++) {
    var row = _normRow(raw[i]);
    if (!row || seen[row.name]) continue;
    seen[row.name] = true;
    out.push(row);
  }
  return out;
}

/* Колонки одной таблицы — в порядке строк настроек (⚖9). */
function columnsFor(rows, tableKey) {
  if (DF_TABLES.indexOf(tableKey) < 0) return [];
  return normRows(rows)
    .filter(function (r) { return !!r[tableKey]; })
    .map(function (r) { return { id: colId(r.name), name: r.name }; });
}

/* Имена всех полей набора — единый селектор фетча на все три таблицы сразу. */
function fieldNames(rows) {
  return normRows(rows)
    .filter(function (r) { return r.summary || r.role || r.my; })
    .map(function (r) { return r.name; });
}

/* Отпечаток состава — часть ключа кэша загрузчика: правка настроек обязана сбросить
   уже загруженные значения (у связей Ганта ровно эта дыра — ключ без состава). */
function fingerprint(rows) {
  return fieldNames(rows).join(' ');
}

/* Поля, занятые другими настройками: значения ключей field.../userField... (оценки,
   факты, исполнители ролей, приоритет, состояние, система, спринт, версия, тип,
   внешний ID). Источник — ТЕКУЩЕЕ состояние формы, не initial: в той же сессии
   пользователь мог переназначить поле роли, и пикер иначе разрешит взять занятое имя. */
function occupiedNames(settings) {
  var out = {};
  if (!settings || typeof settings !== 'object') return out;
  Object.keys(settings).forEach(function (k) {
    if (!/^(field|userField)/.test(k)) return;
    var v = settings[k];
    if (typeof v === 'string' && v) out[v] = true;
  });
  return out;
}

/* Опции пикера: поля проекта минус занятые минус уже добавленные.
   Категоризация _buildFieldsByType намеренно НЕ применяется — она отсекает
   date/number/text, а нам годится любой тип (⚖4). */
function pickerOptions(projectFields, rows, settings) {
  var occupied = occupiedNames(settings);
  var taken = {};
  (Array.isArray(rows) ? rows : []).forEach(function (r) {
    if (r && typeof r.name === 'string') taken[r.name] = true;
  });
  var seen = {}, out = [];
  (Array.isArray(projectFields) ? projectFields : []).forEach(function (f) {
    var name = f && (typeof f === 'string' ? f : f.name);
    if (!name || seen[name] || occupied[name] || taken[name]) return;
    seen[name] = true;
    out.push({ name: name, type: (f && f.type) || '' });
  });
  return out;
}

/* ── Форматтеры значений ──────────────────────────────────────────────────────
   Замеры шейпов — спека §3 (оба стенда, 2026-08-25). Разбираем по ФОРМЕ значения,
   $type нужен ровно для одного различения: сырое число — это дата (epoch ms) или
   integer/float. Цвет отдаётся отдельными полями: решение «чип или текст» — за вью. */

var _COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;
function _color(c) { return (typeof c === 'string' && _COLOR_RE.test(c)) ? c : null; }

/* Дата YouTrack — day-precision (послано 1756000000000 → вернулось 1756036800000):
   печатаем датой без времени. */
function _fmtDay(ts, lang) {
  var DP = (typeof window !== 'undefined' && window.__SSP_DATE_PURE) || null;
  if (DP && typeof DP.fmtDate === 'function') return DP.fmtDate(ts, lang);
  return new Date(ts).toLocaleDateString(lang || 'en', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function _isDateType(cfType) { return /Date/.test(String(cfType || '')); }

/* Одно значение (у множественных полей вызывается поэлементно). */
function _one(v, cfType, lang) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') {
    return { text: _isDateType(cfType) ? _fmtDay(v, lang) : String(v), bg: null, fg: null };
  }
  if (typeof v === 'string' || typeof v === 'boolean') return { text: String(v), bg: null, fg: null };
  if (typeof v !== 'object') return null;
  /* period — {minutes, presentation} */
  if (typeof v.presentation === 'string' && v.presentation) return { text: v.presentation, bg: null, fg: null };
  /* user — fullName предпочтительнее login */
  if (v.login || v.fullName) return { text: v.fullName || v.login, bg: null, fg: null };
  /* text — без `text` в селекторе приезжает пустышка {$type:'TextFieldValue'} (спека §3) */
  if (typeof v.text === 'string') return v.text ? { text: v.text, bg: null, fg: null } : null;
  /* enum / state / version / build / ownedField — localizedName || name (+ цвет бандла) */
  var nm = v.localizedName || v.name;
  if (typeof nm === 'string' && nm) {
    var c = v.color || {};
    return { text: nm, bg: _color(c.background), fg: _color(c.foreground) };
  }
  return null;
}

/* customField задачи → отрисовываемое значение или null («значения нет»).
   Множественные (version[*], multi-enum, multi-user) — массив элементов того же шейпа:
   склеиваем через запятую и цвет не показываем (чип на склейку смысла не имеет). */
function formatValue(cf, lang) {
  if (!cf) return null;
  var v = cf.value;
  if (Array.isArray(v)) {
    var parts = [];
    for (var i = 0; i < v.length; i++) {
      var one = _one(v[i], cf.$type, lang);
      if (one && one.text) parts.push(one.text);
    }
    return parts.length ? { text: parts.join(', '), bg: null, fg: null } : null;
  }
  return _one(v, cf.$type, lang);
}

/* Имя поля из customField: у части ответов оно только в projectCustomField. */
function cfName(cf) {
  if (!cf) return '';
  return (cf.projectCustomField && cf.projectCustomField.field && cf.projectCustomField.field.name) || cf.name || '';
}

/* Ответ по одной задаче → {имя поля: {text,bg,fg}} по нужному набору имён. */
function valuesOf(issue, names, lang) {
  var want = {}, out = {};
  (Array.isArray(names) ? names : []).forEach(function (n) { want[n] = true; });
  var cfs = (issue && issue.customFields) || [];
  for (var i = 0; i < cfs.length; i++) {
    var nm = cfName(cfs[i]);
    if (!nm || !want[nm]) continue;
    var val = formatValue(cfs[i], lang);
    if (val) out[nm] = val;
  }
  return out;
}

var _api = {
  DF_MAX: DF_MAX,
  DF_TABLES: DF_TABLES,
  colId: colId,
  normRows: normRows,
  columnsFor: columnsFor,
  fieldNames: fieldNames,
  fingerprint: fingerprint,
  occupiedNames: occupiedNames,
  pickerOptions: pickerOptions,
  formatValue: formatValue,
  cfName: cfName,
  valuesOf: valuesOf,
};

if (typeof window !== 'undefined') {
  try { window.__SSP_DISPLAY_FIELDS_PURE = _api; } catch (_) { /* sandboxed write may throw */ }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = _api;
}
