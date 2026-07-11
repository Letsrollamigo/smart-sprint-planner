/* widgets/main/src/period-pure.js
   Side-effect модуль: чистые функции форматирования/парсинга периодов (минуты ↔ строка).
   Публикует window.__SSP_PERIOD_PURE ДО исполнения IIFE core.js
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

/* Множество токенов-минут активной локали (#34). minuteShort локали + ASCII/RU/слова.
   hourShort НЕ нужен: всё, что не минуты (голое число / hourShort / h/ч / неизвестное), = часы. */
function _minuteTokens() {
  var mSuf = (_t('minuteShort') || '').toLowerCase();
  var set = { 'm': 1, 'м': 1, 'min': 1, 'мин': 1 };
  if (mSuf) set[mSuf] = 1;
  return set;
}

/* Парсинг строки периода в минуты (#34). Единицы — только часы/минуты, locale-aware.
   Правило: фрагмент «(число)(буквы)»; если буквы ∈ minuteTokens → минуты, иначе → часы
   (голое число, hourShort локали, h/ч, неизвестный суффикс). Полностью чистая. */
function parsePeriod(s) {
  if (s === null || s === undefined) return 0;
  s = String(s).trim().toLowerCase();
  if (!s) return 0;
  var minTok = _minuteTokens(), total = 0, found = false;
  /* v3.2.1 — десятичный ввод «1.5»/«0,5» (± суффикс) раньше разваливался на ДВА
     regex-матча (разделитель шёл «неизвестным суффиксом = часы»): '1.5' → 360 мин
     вместо 90. Голое десятичное — часы; с minute-суффиксом — минуты. */
  var dec = /^(\d+)[.,](\d+)\s*([^\d\s]*)$/.exec(s);
  if (dec) {
    var df = parseFloat(dec[1] + '.' + dec[2]);
    var du = (dec[3] || '').toLowerCase();
    return Math.round(minTok[du] ? df : df * 60);
  }
  var re = /(\d+)\s*([^\d\s]*)/g, m;
  while ((m = re.exec(s)) !== null) {
    if (m[0] === '') { re.lastIndex++; continue; }
    found = true;
    var n = parseInt(m[1], 10);
    if (isNaN(n)) continue;
    var unit = (m[2] || '').toLowerCase();
    total += minTok[unit] ? n : n * 60;
  }
  return found ? Math.round(total) : 0;
}

var _api = { fmtPeriod: fmtPeriod, fmtHours: fmtHours, fmtHoursOnly: fmtHoursOnly, parsePeriod: parsePeriod };

if (typeof window !== 'undefined') {
  try { window.__SSP_PERIOD_PURE = _api; } catch (_) { /* sandboxed write may throw */ }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = _api;
}
