/* widgets/main/src/date-pure.js
   Чистые date-хелперы. Публикует window.__SSP_DATE_PURE ДО исполнения IIFE
   core.js (паттерн как period-pure / enum-locale-pure).
   Зависимостей от closure-состояния нет; fmtDate/fmtDT принимают локаль
   параметром (core передаёт активный язык виджета), дефолт en. */

/* timestamp → 'YYYY-MM-DD' в ЛОКАЛЬНОМ времени (для <input type=date>). */
function toDateIn(ts) {
  if (!ts) return '';
  var d = new Date(ts);
  var mm = String(d.getMonth() + 1).padStart(2, '0');
  var dd = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + mm + '-' + dd;
}

/* 'YYYY-MM-DD' (или иная распознаваемая дата) → timestamp. */
function fromDateIn(s) {
  if (!s) return null;
  /* v3.2.1 — 'YYYY-MM-DD' через new Date(s) по ES-спеке парсится как UTC-полночь,
     а отображение/обратный путь (toDateIn/fmtDate) — локальные: западнее Гринвича
     дата казала −1 день и ДРЕЙФОВАЛА на день за каждый цикл «открыл форму → сохранил».
     Парсим календарные компоненты руками в ЛОКАЛЬНУЮ полночь (симметрично toDateIn);
     не-ISO строки — прежним путём. */
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s).trim());
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]).getTime();
  return new Date(s).getTime();
}

/* timestamp → числовая дата в переданной локали ('18.07.2026' для ru, '07/18/2026' для en). */
function fmtDate(ts, lang) { return ts ? new Date(ts).toLocaleDateString(lang || 'en', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'; }

/* timestamp → числовые дата+время в переданной локали. */
function fmtDT(ts, lang) { return ts ? new Date(ts).toLocaleString(lang || 'en', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'; }

/* Короткая дата из timestamp (бейдж изменения состояния на Ганте, #20).
   #94 — формат по языку планера: был жёсткий 'D.MM' независимо от локали. */
function _fmtGanttDate(ts, lang) {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleDateString(lang || 'en', { day: 'numeric', month: '2-digit' });
  } catch (_) { return ''; }
}

/* Сколько целых дней назад был timestamp (≥0), или null. */
function _ganttDaysAgo(ts) {
  if (!ts) return null;
  return Math.max(0, Math.floor((Date.now() - ts) / 86400000));
}

var _api = {
  toDateIn: toDateIn, fromDateIn: fromDateIn, fmtDate: fmtDate, fmtDT: fmtDT,
  _fmtGanttDate: _fmtGanttDate, _ganttDaysAgo: _ganttDaysAgo,
};

if (typeof window !== 'undefined') {
  window.__SSP_DATE_PURE = _api;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = _api;
}
