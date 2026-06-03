/* widgets/main/src/date-pure.js
   Чистые date-хелперы диаграммы Ганта (#20 state-история). Публикует
   window.__SSP_DATE_PURE ДО исполнения IIFE legacy-monolith.js
   (паттерн как period-pure / enum-locale-pure). Зависимостей от closure-состояния нет. */

/* Короткая дата «DD.MM» из timestamp (для бейджа изменения состояния на Ганте). */
function _fmtGanttDate(ts) {
  if (!ts) return '';
  try {
    var d = new Date(ts);
    return d.getDate() + '.' + String(d.getMonth() + 1).padStart(2, '0');
  } catch (_) { return ''; }
}

/* Сколько целых дней назад был timestamp (≥0), или null. */
function _ganttDaysAgo(ts) {
  if (!ts) return null;
  return Math.max(0, Math.floor((Date.now() - ts) / 86400000));
}

if (typeof window !== 'undefined') {
  window.__SSP_DATE_PURE = { _fmtGanttDate: _fmtGanttDate, _ganttDaysAgo: _ganttDaysAgo };
}
