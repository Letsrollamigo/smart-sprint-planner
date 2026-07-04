/* widgets/main/src/pure/capacity-pure.js
   Side-effect модуль: чистое ядро расчёта ёмкости (#45 R2 «ядро ёмкости»).
   Публикует window.__SSP_CAPACITY_PURE ДО исполнения IIFE core.js
   (паттерн как share-url-pure / period-pure; импортируется в index.js раньше монолита).

   Назначение — live-preview формулы ёмкости на фронте (мгновенный отклик при правке
   grade/rate/alloc/отсутствий, без round-trip к бэку). ⚠️ НЕ источник истины: авторитетный
   расчёт — backend-capacity.js.computeCapacity() (no client claims, §6 спеки). Этот модуль
   ЗЕРКАЛИТ ту же формулу; паритет фронт≡бэк пинится tests/unit/capacity-parity.test.js.
   Любая правка формулы — синхронно в ОБА файла одним коммитом (две разные среды
   исполнения: esbuild-бандл ES2017 vs YT-scripting ES5; общий модуль не импортируется).

   Канон — ЧАСЫ, полная точность (без округления; округление — только на дисплее, D13).
   Все даты мостятся в UTC (gotcha #1): даты спринта = epoch-ms числа, календарь/отсутствия =
   ISO 'YYYY-MM-DD' строки. Дневной цикл строго по getUTC* / Date.UTC — никаких local
   getDay/getDate (иначе праздник/выходной/окно отсутствия съезжают на день под non-UTC TZ).
   Граница `dateEnd` — INCLUSIVE (день, содержащий dateEnd, входит в спринт).

   Stateless (только const на уровне модуля → state:[] в module-registry); без domain/data-зависимостей. */

/* Понижающий коэф. продуктивности по грейду (дефолты; авторитет — снимок constants.kpe записи). */
const DEFAULT_KPE = { Intern: 0, Junior: 0.5, Middle: 0.65, Senior: 0.75 };
/* EPS для дробных сумм (float 0.1+0.2); D1a / D13. */
const EPS = 1e-6;
const MS_PER_DAY = 86400000;
const ABSENCE_TYPES = ['vacation', 'sick', 'out_of_membership', 'regional_holiday', 'training', 'teamleading', 'other'];
const DAY_TYPES = ['holiday', 'short', 'workday'];

/* number-or-default: конечное число либо дефолт. */
function numOr(v, d) {
  return (typeof v === 'number' && isFinite(v)) ? v : d;
}

function pad2(n) { return n < 10 ? '0' + n : '' + n; }

/* epoch-ms → UTC-полночь того же дня (ms). */
function floorUTCDay(ms) {
  var d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/* epoch-ms → 'YYYY-MM-DD' (UTC). */
function msToIso(ms) {
  var d = new Date(ms);
  return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
}

/* 'YYYY-MM-DD' → epoch-ms UTC-полночь (NaN, если формат не ISO-дата). */
function isoToUTCms(iso) {
  if (typeof iso !== 'string') return NaN;
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return NaN;
  var y = parseInt(m[1], 10), mo = parseInt(m[2], 10), da = parseInt(m[3], 10);
  if (mo < 1 || mo > 12 || da < 1 || da > 31) return NaN;
  var ms = Date.UTC(y, mo - 1, da);
  // строгая проверка реальной даты (31 апреля → откат месяца → reject)
  var back = new Date(ms);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== da) return NaN;
  return ms;
}

/* true, если ISO-строка — валидная реальная дата. */
function isValidIsoDate(iso) {
  return !isNaN(isoToUTCms(iso));
}

/* Sat/Sun по UTC. Принимает ms либо ISO-строку. */
function isWeekendUTC(d) {
  var ms = (typeof d === 'number') ? d : isoToUTCms(d);
  if (isNaN(ms)) return false;
  var day = new Date(ms).getUTCDay();
  return day === 0 || day === 6;
}

/* [startMs..endMs] → массив ISO-дней (UTC, inclusive). UTC иммунен к DST (+86400000 точен). */
function dayKeysUTC(startMs, endMs) {
  var out = [];
  if (typeof startMs !== 'number' || typeof endMs !== 'number' || !isFinite(startMs) || !isFinite(endMs)) return out;
  var s = floorUTCDay(startMs), e = floorUTCDay(endMs);
  if (e < s) return out;
  var cur = s;
  // защита от рантайм-зацикливания на абсурдном окне (>3 лет)
  var guard = 0;
  while (cur <= e && guard < 1200) { out.push(msToIso(cur)); cur += MS_PER_DAY; guard++; }
  return out;
}

/* [fromIso..toIso] → массив ISO-дней (UTC, inclusive). Невалидные/from>to → []. */
function isoRangeDays(fromIso, toIso) {
  var s = isoToUTCms(fromIso), e = isoToUTCms(toIso);
  if (isNaN(s) || isNaN(e) || e < s) return [];
  var out = [], cur = s, guard = 0;
  while (cur <= e && guard < 1200) { out.push(msToIso(cur)); cur += MS_PER_DAY; guard++; }
  return out;
}

/* Запись произв.-календаря по дню (ищет в calendar.years[<год>] по date). null, если нет. */
function calendarLookup(calendar, dayKey) {
  if (!calendar || !calendar.years || typeof dayKey !== 'string') return null;
  var year = dayKey.substring(0, 4);
  var arr = calendar.years[year];
  if (!arr || !arr.length) return null;
  for (var i = 0; i < arr.length; i++) {
    if (arr[i] && arr[i].date === dayKey) return arr[i];
  }
  return null;
}

/* Рабочие часы конкретного дня с учётом типа (holiday 0 / short hpd+delta / workday hpd /
   fallback Пн-Пт hpd, Сб/Вс 0). Используется И для рабочих часов, И для часов отсутствия
   (отсутствие на праздник = 0ч, D5/gotcha #12). */
function workingHoursOfDay(dayKey, calendar, hoursPerDay) {
  var entry = calendarLookup(calendar, dayKey);
  if (entry) {
    if (entry.type === 'holiday') return 0;
    if (entry.type === 'short') return Math.max(0, hoursPerDay + numOr(entry.hoursDelta, 0));
    if (entry.type === 'workday') return hoursPerDay;
    // неизвестный тип → fallback по дню недели
  }
  return isWeekendUTC(dayKey) ? 0 : hoursPerDay;
}

/* Σ рабочих часов окна спринта по произв.-календарю. */
function workingHoursInSprint(startMs, endMs, calendar, hoursPerDay) {
  var days = dayKeysUTC(startMs, endMs);
  var h = 0;
  for (var i = 0; i < days.length; i++) h += workingHoursOfDay(days[i], calendar, hoursPerDay);
  return h;
}

/* Σ рабочих часов отсутствий человека: ОБЪЕДИНЕНИЕ absent-рабочих-дней ∩ окно спринта,
   каждый день учитывается ОДИН раз (set-union, D5/gotcha #12 — перекрытия не двоятся;
   тип отсутствия = только ярлык, математика 0ч в эти дни одинаковая). */
function absenceHours(ranges, startMs, endMs, calendar, hoursPerDay) {
  if (!ranges || !ranges.length) return 0;
  var windowDays = dayKeysUTC(startMs, endMs);
  if (!windowDays.length) return 0;
  // Числовые границы диапазонов. НЕ разворачиваем диапазон в список дней (gotcha #12):
  // длинный lead-in (напр. out_of_membership {from:'2021-…'} до окна) съел бы guard-лимит
  // итераций isoRangeDays и дни окна не проверились бы → absence=0, base завышен.
  var bounds = [];
  for (var r = 0; r < ranges.length; r++) {
    var rng = ranges[r];
    if (!rng) continue;
    var rs = isoToUTCms(rng.from), re = isoToUTCms(rng.to);
    if (isNaN(rs) || isNaN(re) || re < rs) continue;
    // #53 частичный день: hoursDelta>0 → отсутствие ЧАСТИ дня (capped рабочими часами); иначе (-1) полный день.
    var hd = (typeof rng.hoursDelta === 'number' && isFinite(rng.hoursDelta) && rng.hoursDelta > 0) ? rng.hoursDelta : -1;
    bounds.push([rs, re, hd]);
  }
  if (!bounds.length) return 0;
  // Идём по дням ОКНА (set-union by construction — каждый день учтён ≤1 раза, перекрытия
  // не двоятся). Число итераций = длине спринта, независимо от длины диапазонов.
  var h = 0;
  for (var w = 0; w < windowDays.length; w++) {
    var dayMs = isoToUTCms(windowDays[w]);
    var full = workingHoursOfDay(windowDays[w], calendar, hoursPerDay);
    // #53 — часы отсутствия дня = МАКСИМУМ по перекрывающим диапазонам (полный день ⊃ частичный),
    // capped рабочими часами дня (частичное отсутствие на праздник = 0ч, как и полное).
    var dayAbs = 0;
    for (var b = 0; b < bounds.length; b++) {
      if (dayMs >= bounds[b][0] && dayMs <= bounds[b][1]) {
        var thisAbs = (bounds[b][2] < 0) ? full : Math.min(bounds[b][2], full);
        if (thisAbs > dayAbs) dayAbs = thisAbs;
      }
    }
    h += dayAbs;
  }
  return h;
}

/* KPE по грейду: снимок constants.kpe → дефолт-таблица → 0. */
function kpeFor(grade, kpe) {
  if (kpe && typeof kpe[grade] === 'number' && isFinite(kpe[grade])) return kpe[grade];
  if (typeof DEFAULT_KPE[grade] === 'number') return DEFAULT_KPE[grade];
  return 0;
}

/* nominal = max(0, working − absence). max(0,…) — иначе absence>working даёт nominal<0 → base<0. */
function nominal(workingH, absenceH) {
  return Math.max(0, numOr(workingH, 0) - numOr(absenceH, 0));
}

/* base = nominal × kpe(grade) × rate × participation (% участия). Полная точность (без
   округления). Все per-person кроме nominal (глобальная норма); rate=ставка, participation=
   доля доступности человека команде — раздельные множители (как в старой форме). alloc
   (доля в роли, мультироль) — НЕ здесь: применяется отдельно в roleContribution. */
function baseHours(nominalH, grade, rate, participation, kpe) {
  return numOr(nominalH, 0) * kpeFor(grade, kpe) * numOr(rate, 1) * numOr(participation, 1);
}

/* Нормализация alloc-карты: только конечные числовые доли (role→0..). */
function sanitizeAlloc(alloc) {
  var out = {};
  if (!alloc || typeof alloc !== 'object') return out;
  var keys = Object.keys(alloc).sort();
  for (var i = 0; i < keys.length; i++) {
    var v = alloc[keys[i]];
    if (typeof v === 'number' && isFinite(v)) out[keys[i]] = v;
  }
  return out;
}

/* D1a: для каждого человека Σ_R alloc ≤ 1.0 + EPS. Первый нарушитель → {ok:false,...}. */
function validateAllocSums(persons) {
  if (!persons || typeof persons !== 'object') return { ok: true };
  var logins = Object.keys(persons).sort();
  for (var i = 0; i < logins.length; i++) {
    var p = persons[logins[i]] || {};
    var alloc = p.alloc || {};
    var keys = Object.keys(alloc).sort();
    var sum = 0;
    for (var j = 0; j < keys.length; j++) sum += numOr(alloc[keys[j]], 0);
    if (sum > 1.0 + EPS) return { ok: false, offender: logins[i], sum: sum };
  }
  return { ok: true };
}

/* Авторитетная форма расчёта (зеркало бэка). Из примитивов (grade/rate/alloc + absences +
   calendar + constants + окно спринта) пересчитывает base каждого человека и ёмкость ролей.
   Детерминизм для паритета: логины и роли сортируются → порядок float-аккумуляции идентичен
   фронту и бэку → числа бит-в-бит совпадают.

   record           — { constants:{kpe,hoursPerDay,…}, persons:{login:{grade,rate,alloc}} }
   calendar         — ssp_calendar { years:{...} }
   absencesByLogin  — { login: [ {from,to,type} ] } (live либо frozen — решает вызывающий)
   sprintStart/End  — epoch-ms числа (server-side из ssp_sprint; никогда из тела клиента, #2)

   → { working, persons:{login:{grade,rate,alloc,nominal,absenceHours,base}}, roleCapacities:{R:часы} } */
function computeCapacity(record, calendar, absencesByLogin, sprintStart, sprintEnd) {
  var constants = (record && record.constants) || {};
  var hoursPerDay = numOr(constants.hoursPerDay, 8);
  var kpe = constants.kpe || DEFAULT_KPE;
  var working = workingHoursInSprint(sprintStart, sprintEnd, calendar, hoursPerDay);

  var personsIn = (record && record.persons) || {};
  var logins = Object.keys(personsIn).sort();
  var outPersons = {};
  var roleCapacities = {};

  for (var i = 0; i < logins.length; i++) {
    var login = logins[i];
    var p = personsIn[login] || {};
    var ranges = (absencesByLogin && absencesByLogin[login]) || [];
    var absentH = absenceHours(ranges, sprintStart, sprintEnd, calendar, hoursPerDay);
    var nominalH = nominal(working, absentH);
    var grade = (typeof p.grade === 'string' && p.grade) ? p.grade : 'Middle';
    var rate = numOr(p.rate, 1);
    var participation = numOr(p.participation, 1);
    var alloc = sanitizeAlloc(p.alloc);
    var base = baseHours(nominalH, grade, rate, participation, kpe);

    outPersons[login] = {
      grade: grade,
      rate: rate,
      participation: participation,
      alloc: alloc,
      nominal: nominalH,
      absenceHours: absentH,
      base: base
    };

    var roleKeys = Object.keys(alloc).sort();
    for (var j = 0; j < roleKeys.length; j++) {
      var rk = roleKeys[j];
      roleCapacities[rk] = numOr(roleCapacities[rk], 0) + base * numOr(alloc[rk], 0);
    }
  }

  return { working: working, persons: outPersons, roleCapacities: roleCapacities };
}

/* Вклад человека в роль = base × alloc(R) (role-scoped, НЕ полный base; D1↔D12). */
function roleContribution(base, alloc, roleKey) {
  if (!alloc || typeof alloc !== 'object') return 0;
  return numOr(base, 0) * numOr(alloc[roleKey], 0);
}

/* #45 R4 — ёмкость роли из frozen-записи (часы): Σ по людям base × alloc(rk). Источник для
   адаптера планирования §9 (frozen base из утверждённой записи, НЕ live-пересчёт). */
function roleCapacity(roleKey, record) {
  if (!record || !record.persons) return 0;
  var sum = 0;
  var logins = Object.keys(record.persons);
  for (var i = 0; i < logins.length; i++) {
    var p = record.persons[logins[i]] || {};
    sum += roleContribution(p.base, p.alloc, roleKey);
  }
  return sum;
}

const _api = {
  // helpers
  numOr: numOr,
  floorUTCDay: floorUTCDay,
  msToIso: msToIso,
  isoToUTCms: isoToUTCms,
  isValidIsoDate: isValidIsoDate,
  isWeekendUTC: isWeekendUTC,
  dayKeysUTC: dayKeysUTC,
  isoRangeDays: isoRangeDays,
  calendarLookup: calendarLookup,
  // formula
  workingHoursOfDay: workingHoursOfDay,
  workingHoursInSprint: workingHoursInSprint,
  absenceHours: absenceHours,
  kpeFor: kpeFor,
  nominal: nominal,
  baseHours: baseHours,
  sanitizeAlloc: sanitizeAlloc,
  validateAllocSums: validateAllocSums,
  computeCapacity: computeCapacity,
  roleContribution: roleContribution,
  roleCapacity: roleCapacity,
  // constants (snapshot-дефолты)
  DEFAULT_KPE: DEFAULT_KPE,
  ABSENCE_TYPES: ABSENCE_TYPES,
  DAY_TYPES: DAY_TYPES,
  EPS: EPS
};

if (typeof window !== 'undefined') {
  try { window.__SSP_CAPACITY_PURE = _api; } catch (_) { /* sandboxed write may throw */ }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = _api;
}
