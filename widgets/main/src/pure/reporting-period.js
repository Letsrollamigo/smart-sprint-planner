/* reporting-period.js — #50 S2. Чистая модель периодов (D9): пресеты + свой диапазон →
   абсолютное окно { fromTs, toTs } в epoch-ms. Общий для ВСЕХ оконных отчётов (A1 Прогресс
   первый; далее A4/A5/…). Снимок-отчёты (A3/A6/A7) период игнорируют — computeWindow не зовут.

   Инвариант окна: ПОЛУОТКРЫТОЕ [fromTs, toTs). Переход в момент t «в окне» ⇔ fromTs ≤ t < toTs
   (без двойного счёта на границе суток/месяца/квартала). Вся арифметика — UTC (Date.UTC
   нормализует переполнение месяца → границы года/квартала не требуют спец-веток; в UTC нет
   DST → +N суток = +N×86.4e6 точно). Консистентно с _utcDay/isWeekendUTC (reporting-pure).

   Семантика «до сейчас» пресетов (today/last7/last30/currentQuarter/ytd): верх = НАЧАЛО завтра
   (SOD(now)+1д) — включают весь сегодняшний день, не заявляют будущее (t ≤ now < toTs).
   «Закрытые» пресеты (yesterday/lastMonth/lastQuarter/calendarYear): верх = естественная граница.

   БЕЗ I/O. Публикует __SSP_REPORTING_PERIOD ДО IIFE core.js; node-тестируемо (module.exports). */
'use strict';

var _DAY_MS = 86400000;

/* Компоненты UTC-даты из epoch-ms. */
function _ymd(ms) { var d = new Date(ms); return { y: d.getUTCFullYear(), mo: d.getUTCMonth(), d: d.getUTCDate() }; }
/* Начало UTC-суток, содержащих ms. */
function _sod(ms) { var c = _ymd(ms); return Date.UTC(c.y, c.mo, c.d); }
/* Начало UTC-месяца, содержащего ms. */
function _som(ms) { var c = _ymd(ms); return Date.UTC(c.y, c.mo, 1); }
/* Начало UTC-квартала (Q1=янв, Q2=апр, Q3=июл, Q4=окт). */
function _soq(ms) { var c = _ymd(ms); return Date.UTC(c.y, Math.floor(c.mo / 3) * 3, 1); }
/* Начало UTC-года, содержащего ms. */
function _soy(ms) { var c = _ymd(ms); return Date.UTC(c.y, 0, 1); }

/* Строгий разбор ISO 'YYYY-MM-DD' → начало UTC-суток. Отклоняет нереальную дату
   (round-trip, как isoToUTCms в capacity-pure). Возвращает number | NaN. */
function _isoSod(s) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim());
  if (!m) return NaN;
  var y = +m[1], mo = +m[2] - 1, da = +m[3];
  var ts = Date.UTC(y, mo, da);
  var b = new Date(ts);
  if (b.getUTCFullYear() !== y || b.getUTCMonth() !== mo || b.getUTCDate() !== da) return NaN;
  return ts;
}

/* Упорядоченный каталог пресетов (ключи; подписи/группировка — i18n на UI). requiresOpts:
   'year' — нужен opts.year (calendarYear); 'range' — opts.from/opts.to (custom); '' — самодостаточен. */
var PERIOD_PRESETS = [
  { key: 'today',          requiresOpts: '' },
  { key: 'yesterday',      requiresOpts: '' },
  { key: 'last7',          requiresOpts: '' },
  { key: 'last30',         requiresOpts: '' },
  { key: 'lastMonth',      requiresOpts: '' },
  { key: 'lastQuarter',    requiresOpts: '' },
  { key: 'currentQuarter', requiresOpts: '' },
  { key: 'ytd',            requiresOpts: '' },
  { key: 'calendarYear',   requiresOpts: 'year' },
  { key: 'custom',         requiresOpts: 'range' }
];

/* computeWindow(presetKey, nowTs, opts) → { fromTs, toTs } | null.
   nowTs — epoch-ms «сейчас» (обязателен, конечное число). opts:
     calendarYear: { year:int } · custom: { from:'YYYY-MM-DD', to:'YYYY-MM-DD' } (вкл. to-день).
   Неизвестный ключ / отсутствующие/битые opts / from>to → null (UI покажет ошибку, не молч.окно). */
function computeWindow(presetKey, nowTs, opts) {
  if (typeof nowTs !== 'number' || !isFinite(nowTs)) return null;
  opts = opts || {};
  var sod = _sod(nowTs);
  var endToday = sod + _DAY_MS;                 /* начало завтра — верх «до сейчас» пресетов */
  switch (presetKey) {
    case 'today':          return { fromTs: sod, toTs: endToday };
    case 'yesterday':      return { fromTs: sod - _DAY_MS, toTs: sod };
    case 'last7':          return { fromTs: sod - 6 * _DAY_MS, toTs: endToday };   /* 7 суток вкл. сегодня */
    case 'last30':         return { fromTs: sod - 29 * _DAY_MS, toTs: endToday };  /* 30 суток вкл. сегодня */
    case 'lastMonth': {
      var c = _ymd(nowTs);
      return { fromTs: Date.UTC(c.y, c.mo - 1, 1), toTs: Date.UTC(c.y, c.mo, 1) }; /* Date.UTC нормализует mo-1<0 */
    }
    case 'lastQuarter': {
      var q = _ymd(nowTs), qs = Math.floor(q.mo / 3) * 3;
      return { fromTs: Date.UTC(q.y, qs - 3, 1), toTs: Date.UTC(q.y, qs, 1) };     /* qs-3<0 → пред. год */
    }
    case 'currentQuarter': return { fromTs: _soq(nowTs), toTs: endToday };
    case 'ytd':            return { fromTs: _soy(nowTs), toTs: endToday };
    case 'calendarYear': {
      var yr = opts.year;
      if (typeof yr !== 'number' || !isFinite(yr) || yr % 1 !== 0 || yr < 1970 || yr > 3000) return null;
      return { fromTs: Date.UTC(yr, 0, 1), toTs: Date.UTC(yr + 1, 0, 1) };
    }
    case 'custom': {
      var f = _isoSod(opts.from), t = _isoSod(opts.to);
      if (isNaN(f) || isNaN(t) || f > t) return null;
      return { fromTs: f, toTs: t + _DAY_MS };  /* вкл. to-день целиком */
    }
    default: return null;
  }
}

/* #50 B0 — monthlyWindows(N, nowTs) → [{ fromTs, toTs, y, mo, key }] — N последовательных
   ПОЛУОТКРЫТЫХ месячных окон [начало месяца, начало следующего) в UTC, СТАРЫЙ→НОВЫЙ (слева-направо
   на LineChart свода B0). Новейшее окно = месяц, содержащий nowTs (текущий, возможно НЕПОЛНЫЙ —
   консистентно с include-today семантикой пресетов «до сейчас»). Для каждого месяца B0 прогоняет
   соответствующий A-движок: оконные метрики (TTM/План-факт) — окно фильтрует популяцию; снимки
   (Бэклог/Bottleneck) — реконструкция as-of конец окна (toTs). Date.UTC нормализует mo<0 →
   предыдущие годы (границы года без спец-веток; в UTC нет DST → каждое окно = ровно календарный
   месяц). Соседние окна стыкуются без зазора/нахлёста: out[i].toTs === out[i+1].fromTs. Битый
   N/nowTs → []; N кламп [1, MAX_MONTHS] (защита от гиганта на проде — стоимость N×фетч, §12). */
var MAX_MONTHS = 60;
function monthlyWindows(N, nowTs) {
  if (typeof N !== 'number' || !isFinite(N) || N < 1) return [];
  if (typeof nowTs !== 'number' || !isFinite(nowTs)) return [];
  N = Math.min(Math.floor(N), MAX_MONTHS);
  var c = _ymd(nowTs), out = [];
  for (var i = N - 1; i >= 0; i--) {                 /* i=N-1 → самый старый, i=0 → текущий месяц */
    var fromTs = Date.UTC(c.y, c.mo - i, 1);
    var toTs = Date.UTC(c.y, c.mo - i + 1, 1);
    var f = _ymd(fromTs);                            /* нормализованный (y,mo) окна после переполнения */
    out.push({ fromTs: fromTs, toTs: toTs, y: f.y, mo: f.mo,
      key: f.y + '-' + (f.mo + 1 < 10 ? '0' : '') + (f.mo + 1) });
  }
  return out;
}

var _api = { computeWindow: computeWindow, PERIOD_PRESETS: PERIOD_PRESETS, monthlyWindows: monthlyWindows };

if (typeof window !== 'undefined') {
  try { window.__SSP_REPORTING_PERIOD = _api; } catch (_) { /* sandboxed write may throw */ }
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = _api;
}
