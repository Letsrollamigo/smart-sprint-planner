/* widgets/main/src/period-pure.js
   Side-effect модуль: чистые функции форматирования/парсинга периодов (минуты ↔ строка).
   Публикует window.__SSP_PERIOD_PURE ДО исполнения IIFE legacy-monolith.js
   (паттерн как toast-pure / modal-pure / sort-pure; импортируется в index.js раньше монолита).

   Единицы часов/минут берутся из активной локали через window.__SSP_T('hourShort'/'minuteShort'),
   который монолит публикует при инстанциации. T резолвится ЛЕНИВО на момент вызова
   (к рантайму __SSP_T уже установлен); fallback — идентичность (вернёт ключ). */

function _t(key) {
  var T = (typeof window !== 'undefined' && window.__SSP_T) || null;
  return T ? T(key) : key;
}

/* Период в часах+минутах (без недель/дней). */
function fmtPeriod(m) {
  if (m === null || m === undefined) return '—';
  m = Math.round(m);
  var sign = m < 0 ? '-' : '';
  m = Math.abs(m);
  var h = Math.floor(m / 60), mn = m % 60, p = [];
  var hSuf = _t('hourShort'), mSuf = _t('minuteShort');
  if (h) p.push(h + hSuf); if (mn) p.push(mn + mSuf);
  return sign + (p.length ? p.join(' ') : '0' + mSuf);
}

function fmtHours(m) {
  if (m === null || m === undefined) return '—';
  m = Math.round(m);
  var sign = m < 0 ? '-' : '';
  m = Math.abs(m);
  var h = Math.floor(m / 60), mn = m % 60, p = [];
  var hSuf = _t('hourShort'), mSuf = _t('minuteShort');
  if (h) p.push(h + hSuf); if (mn) p.push(mn + mSuf);
  return sign + (p.length ? p.join(' ') : '0' + mSuf);
}

function fmtHoursOnly(m) {
  if (m === null || m === undefined) return '—';
  m = Math.round(m);
  var h = Math.floor(m / 60), mn = m % 60, p = [];
  var hSuf = _t('hourShort'), mSuf = _t('minuteShort');
  if (h) p.push(h + hSuf); if (mn) p.push(mn + mSuf);
  return p.length ? p.join(' ') : '0' + mSuf;
}

/* Парсинг строки периода (недели/дни/часы/минуты или голое число = минуты). Полностью чистая. */
function parsePeriod(s) {
  if (!s) return 0; s = s.trim().toLowerCase(); var t = 0;
  var wm = s.match(/(\d+)\s*[нnw]/), dm = s.match(/(\d+)\s*[дd]/), hm = s.match(/(\d+)\s*[чh]/), mm = s.match(/(\d+)\s*[мm]/);
  if (wm) t += parseInt(wm[1]) * 2400;
  if (dm) t += parseInt(dm[1]) * 480;
  if (hm) t += parseInt(hm[1]) * 60;
  if (mm) t += parseInt(mm[1]);
  if (!wm && !dm && !hm && !mm) { var n = parseInt(s); if (!isNaN(n)) t = n; }
  return t;
}

if (typeof window !== 'undefined') {
  window.__SSP_PERIOD_PURE = { fmtPeriod: fmtPeriod, fmtHours: fmtHours, fmtHoursOnly: fmtHoursOnly, parsePeriod: parsePeriod };
}
