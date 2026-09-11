/* widgets/main/src/pure/phases-pure.js — #120 «Фазы работ внутри спринта»: чистые правила блока фаз
   (цепочка, парность, порядок, границы, шкала, тон, слияние маппинга). Публикует
   window.__SSP_PHASES_PURE ДО исполнения IIFE core.js (паттерн date-pure / period-pure).
   Все сравнения дат — только через dayMs (UTC-полночь, #116): голден renderRolePlannerHeader
   гоняется вторым прогоном под TZ=America/Los_Angeles, локальные геттеры дали бы сдвиг дня.
   Фаза = null («не планируется») | { dateStart: ms, dateEnd: ms }; форма из пикеров может нести
   половинку пары ({ dateStart, dateEnd: null }) — pairError её ловит. */

var DAY_MS = 86400000;
var PHASE_KEYS = ['analysis', 'development', 'techTest', 'regression', 'bizTest', 'deploy'];
var LABEL_KEYS = { analysis: 'phaseAnalysis', development: 'phaseDevelopment', techTest: 'phaseTechTest',
  regression: 'phaseRegression', bizTest: 'phaseBizTest', deploy: 'phaseDeploy' };

function dayMs(ts) { return Math.ceil(ts / DAY_MS - 0.5) * DAY_MS; }
function isNum(v) { return typeof v === 'number' && isFinite(v); }
function hasStart(p) { return !!p && isNum(p.dateStart); }
function hasEnd(p) { return !!p && isNum(p.dateEnd); }
function isFull(p) { return hasStart(p) && hasEnd(p); }

/* Шесть ключей: полная пара → копия, иначе null (половинка нормализацией теряется — её ловят
   pairError/rowErrors ДО нормализации). */
function normalize(phases) {
  var out = {};
  for (var i = 0; i < PHASE_KEYS.length; i++) {
    var p = phases && phases[PHASE_KEYS[i]];
    out[PHASE_KEYS[i]] = isFull(p) ? { dateStart: p.dateStart, dateEnd: p.dateEnd } : null;
  }
  return out;
}

/* 'half' — одна дата из двух; 'endBeforeStart' — конец раньше начала по дням; null — ок. */
function pairError(phase) {
  if (!phase) return null;
  var s = hasStart(phase), e = hasEnd(phase);
  if (s !== e) return 'half';
  if (s && dayMs(phase.dateEnd) < dayMs(phase.dateStart)) return 'endBeforeStart';
  return null;
}

function samePair(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return dayMs(a.dateStart) === dayMs(b.dateStart) && dayMs(a.dateEnd) === dayMs(b.dateEnd);
}
function isSame(a, b) {
  var na = normalize(a), nb = normalize(b);
  for (var i = 0; i < PHASE_KEYS.length; i++) if (!samePair(na[PHASE_KEYS[i]], nb[PHASE_KEYS[i]])) return false;
  return true;
}
function changedKeys(phases, stored) {
  var na = normalize(phases), nb = normalize(stored), out = [];
  for (var i = 0; i < PHASE_KEYS.length; i++) if (!samePair(na[PHASE_KEYS[i]], nb[PHASE_KEYS[i]])) out.push(PHASE_KEYS[i]);
  return out;
}

/* Сломанный порядок: начало фазы раньше начала ближайшей НЕПУСТОЙ предыдущей по цепочке
   (⚖1; конец раньше конца предыдущей — законное пересечение, не помечается — §О2).
   → { <key>: <prevKey> }. */
function orderWarnings(phases) {
  var n = normalize(phases), out = {}, prev = null;
  for (var i = 0; i < PHASE_KEYS.length; i++) {
    var k = PHASE_KEYS[i], p = n[k];
    if (!p) continue;
    if (prev && dayMs(p.dateStart) < dayMs(n[prev].dateStart)) out[k] = prev;
    prev = k;
  }
  return out;
}

function sprintDays(sprint) {
  if (!sprint || !isNum(sprint.dateStart) || !isNum(sprint.dateEnd)) return null;
  var s = dayMs(sprint.dateStart), e = dayMs(sprint.dateEnd);
  if (e < s) return null;
  return { start: s, end: e, days: (e - s) / DAY_MS + 1 };
}

/* Фазы, выходящие за границы спринта по календарным дням (последний день спринта — внутри, #117). */
function outOfRange(phases, sprint) {
  var sd = sprintDays(sprint);
  if (!sd) return [];
  var n = normalize(phases), out = [];
  for (var i = 0; i < PHASE_KEYS.length; i++) {
    var p = n[PHASE_KEYS[i]];
    if (p && (dayMs(p.dateStart) < sd.start || dayMs(p.dateEnd) > sd.end)) out.push(PHASE_KEYS[i]);
  }
  return out;
}

/* Отказы по кнопке: 'half' | 'endBeforeStart' (форма) | 'outOfSprint' — последний ТОЛЬКО для фаз,
   изменившихся относительно stored (⚖4: старая фаза за границей не блокирует правку другой). */
function rowErrors(phases, stored, sprint) {
  var out = {}, sd = sprintDays(sprint), ns = normalize(stored);
  for (var i = 0; i < PHASE_KEYS.length; i++) {
    var k = PHASE_KEYS[i], p = phases && phases[k];
    var pe = pairError(p);
    if (pe) { out[k] = pe; continue; }
    if (!isFull(p) || !sd) continue;
    if (samePair(p, ns[k])) continue;
    if (dayMs(p.dateStart) < sd.start || dayMs(p.dateEnd) > sd.end) out[k] = 'outOfSprint';
  }
  return out;
}

/* Шкала спринта: days, недельный шаг в %, tick'и — понедельники (getUTCDay() === 1) + последний день. */
function scale(sprint) {
  var sd = sprintDays(sprint);
  if (!sd) return null;
  var ticks = [];
  for (var t = sd.start; t <= sd.end; t += DAY_MS) {
    if (new Date(t).getUTCDay() === 1) ticks.push({ ts: t, pct: (t - sd.start) / (sd.days * DAY_MS) * 100, last: false });
  }
  if (!ticks.length || ticks[ticks.length - 1].ts !== sd.end) ticks.push({ ts: sd.end, pct: 100, last: true });
  else ticks[ticks.length - 1].last = true;
  return { days: sd.days, start: sd.start, end: sd.end, weekPct: 7 / sd.days * 100, ticks: ticks };
}

/* Отрезок фазы на шкале: доли в %, клампится в [0, 100]; clipLeft/clipRight — вышел ли за край. */
function segment(phase, sprint) {
  var sd = sprintDays(sprint);
  if (!sd || !isFull(phase)) return null;
  var total = sd.days * DAY_MS;
  var left = (dayMs(phase.dateStart) - sd.start) / total * 100;
  var right = (dayMs(phase.dateEnd) + DAY_MS - sd.start) / total * 100;
  var clipLeft = left < 0, clipRight = right > 100;
  var l = Math.max(0, Math.min(100, left)), r = Math.max(0, Math.min(100, right));
  return { leftPct: l, widthPct: Math.max(0, r - l), clipLeft: clipLeft, clipRight: clipRight };
}

/* Тон строки: 'mine' — фаза роли rk по маппингу, 'other' — чужая; правило одного тона (⚖6):
   маппинг пуст или у роли нет ни одной фазы → всем 'all'. */
function tone(key, rk, phaseRoles) {
  if (!rk || !phaseRoles || typeof phaseRoles !== 'object') return 'all';
  var any = false;
  for (var i = 0; i < PHASE_KEYS.length; i++) {
    var arr = phaseRoles[PHASE_KEYS[i]];
    if (Array.isArray(arr) && arr.indexOf(rk) >= 0) { any = true; break; }
  }
  if (!any) return 'all';
  var mine = phaseRoles[key];
  return (Array.isArray(mine) && mine.indexOf(rk) >= 0) ? 'mine' : 'other';
}

/* Форма настроек (⚖9): привязки ВЫКЛЮЧЕННЫХ ролей сохраняются из stored, активные — из отмеченных.
   Пустые массивы не пишутся (пусто → {}). */
function mergePhaseRoles(stored, checked, activeKeys) {
  var out = {};
  var active = Array.isArray(activeKeys) ? activeKeys : [];
  for (var i = 0; i < PHASE_KEYS.length; i++) {
    var k = PHASE_KEYS[i];
    var keep = (stored && Array.isArray(stored[k]) ? stored[k] : []).filter(function (r) { return active.indexOf(r) < 0; });
    var add = (checked && Array.isArray(checked[k]) ? checked[k] : []).filter(function (r) { return active.indexOf(r) >= 0; });
    var arr = keep.slice();
    for (var j = 0; j < add.length; j++) if (arr.indexOf(add[j]) < 0) arr.push(add[j]);
    if (arr.length) out[k] = arr;
  }
  return out;
}

var _api = {
  PHASE_KEYS: PHASE_KEYS, LABEL_KEYS: LABEL_KEYS, DAY_MS: DAY_MS, dayMs: dayMs,
  normalize: normalize, pairError: pairError, isSame: isSame, changedKeys: changedKeys,
  orderWarnings: orderWarnings, outOfRange: outOfRange, rowErrors: rowErrors,
  scale: scale, segment: segment, tone: tone, mergePhaseRoles: mergePhaseRoles,
};

if (typeof window !== 'undefined') {
  window.__SSP_PHASES_PURE = _api;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = _api;
}
