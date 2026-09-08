/* widgets/main/src/date-pure.js
   Чистые date-хелперы. Публикует window.__SSP_DATE_PURE ДО исполнения IIFE
   core.js (паттерн как period-pure / enum-locale-pure).
   Зависимостей от closure-состояния нет; fmtDate/fmtDT принимают локаль
   параметром (core передаёт активный язык виджета), дефолт en. */

var DAY_MS = 86400000;

/* #116 — «дата без времени» в приложении = полночь UTC (канон дат задач, релизов, ёмкости и
   полей типа «дата» YouTrack). dayMs приводит любой timestamp календарной даты к ближайшей
   UTC-полуночи: ровно полночь — она сама; локальная полночь зон ±11 ч (так fromDateIn писал
   dateStart/dateEnd спринта до 3.39.1) — задуманный день; ровно полдень UTC (так YouTrack
   хранит поля «дата») — тот же день, а не следующий. К мгновениям (confirmedAt, updatedAt)
   не применять: у них есть время суток, их показывает fmtDate/fmtDT по локальному времени. */
function dayMs(ts) {
  return Math.ceil(ts / DAY_MS - 0.5) * DAY_MS;
}

/* timestamp календарной даты → 'YYYY-MM-DD' (для <input type=date>); день — по UTC через dayMs,
   поэтому одинаков во всех часовых поясах (#116: раньше локальные геттеры западнее Гринвича
   давали предыдущий день). */
function toDateIn(ts) {
  if (!ts) return '';
  var d = new Date(dayMs(ts));
  var mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  var dd = String(d.getUTCDate()).padStart(2, '0');
  return d.getUTCFullYear() + '-' + mm + '-' + dd;
}

/* 'YYYY-MM-DD' (или иная распознаваемая дата) → timestamp. */
function fromDateIn(s) {
  if (!s) return null;
  /* v3.2.1 чинил дрейф даты западнее Гринвича локальной полуночью (симметрично тогдашнему
     локальному toDateIn). #116 (3.39.1): пишем UTC-полночь — как даты задач, релизов и ёмкости;
     обратный путь toDateIn/fmtDay тоже по UTC, поэтому дрейфа нет ни в одном поясе, а окно
     ёмкости совпадает с формой спринта. Не-ISO строки — прежним путём. */
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s).trim());
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  return new Date(s).getTime();
}

/* timestamp → числовая дата в переданной локали ('18.07.2026' для ru, '07/18/2026' для en). */
function fmtDate(ts, lang) { return ts ? new Date(ts).toLocaleDateString(lang || 'en', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'; }

/* #116 — календарная дата (dateStart/dateEnd спринта, даты задач, поле «дата» YouTrack) →
   числовая дата в локали; день по UTC через dayMs — одна и та же дата во всех поясах.
   Для мгновений (confirmedAt, updatedAt) — fmtDate/fmtDT. */
function fmtDay(ts, lang) {
  return ts ? new Date(dayMs(ts)).toLocaleDateString(lang || 'en', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }) : '—';
}

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

/* #116 — короткая календарная дата для подписи диапазона полосы Ганта (startTs/endTs задачи). */
function _fmtGanttDay(ts, lang) {
  if (!ts) return '';
  try {
    return new Date(dayMs(ts)).toLocaleDateString(lang || 'en', { day: 'numeric', month: '2-digit', timeZone: 'UTC' });
  } catch (_) { return ''; }
}

/* Сколько целых дней назад был timestamp (≥0), или null. */
function _ganttDaysAgo(ts) {
  if (!ts) return null;
  return Math.max(0, Math.floor((Date.now() - ts) / 86400000));
}

var _api = {
  toDateIn: toDateIn, fromDateIn: fromDateIn, fmtDate: fmtDate, fmtDT: fmtDT,
  dayMs: dayMs, fmtDay: fmtDay,                                   /* #116 */
  _fmtGanttDate: _fmtGanttDate, _fmtGanttDay: _fmtGanttDay, _ganttDaysAgo: _ganttDaysAgo,
};

if (typeof window !== 'undefined') {
  window.__SSP_DATE_PURE = _api;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = _api;
}
