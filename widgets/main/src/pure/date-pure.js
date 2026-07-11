/* widgets/main/src/date-pure.js
   Чистые date-хелперы. Публикует window.__SSP_DATE_PURE ДО исполнения IIFE
   core.js (паттерн как period-pure / enum-locale-pure).
   Зависимостей от closure-состояния нет; fmtDate/fmtDT используют локаль ru-RU
   (исторически дата/время всегда в RU-формате — поведение сохранено). */

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

/* timestamp → 'DD.MM.YYYY' (ru-RU). */
function fmtDate(ts) { return ts ? new Date(ts).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'; }

/* timestamp → 'DD.MM.YYYY HH:MM' (ru-RU). */
function fmtDT(ts) { return ts ? new Date(ts).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'; }

/* Короткая дата 'DD.MM' из timestamp (бейдж изменения состояния на Ганте, #20). */
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
  window.__SSP_DATE_PURE = {
    toDateIn: toDateIn, fromDateIn: fromDateIn, fmtDate: fmtDate, fmtDT: fmtDT,
    _fmtGanttDate: _fmtGanttDate, _ganttDaysAgo: _ganttDaysAgo,
  };
}
