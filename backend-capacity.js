/**
 * Smart Sprint Planner — Capacity Management backend (#45 R2 «ядро ёмкости»).
 *
 * Первый per-feature backend-модуль (§19.3 спеки): держит backend-core.js от роста +
 * изолирует домен ёмкости. Require-ится в backend-project.js И backend-global.js; свои
 * endpoint-объекты ДОПИСЫВАЕТ в общий core.ENDPOINTS массив (оба handler-файла читают
 * именно его — иначе global-режим 404, gotcha #7). Экспорт через Object.assign(exports,…)
 * для unit-тестов (require('./backend-project.js') ре-экспортит).
 *
 * АВТОРИТЕТНЫЙ расчёт: computeCapacity() пересчитывает base/roleCapacity из ПРИМИТИВОВ
 * (grade/rate/alloc + хранимые calendar/absences + constants + окно спринта) на КАЖДЫЙ
 * write. Клиент НЕ присылает вычисленные числа — только примитивы (no client claims).
 * Окно спринта (dateStart/dateEnd) берётся СЕРВЕРНО из ssp_sprint (никогда из тела, #2).
 *
 * Канон — ЧАСЫ, полная точность (округление только на дисплее, D13). Даты мостятся в UTC
 * (gotcha #1): окно спринта = epoch-ms, календарь/отсутствия = ISO 'YYYY-MM-DD'.
 *
 * ⚠️ ПАРИТЕТ ФОРМУЛЫ: математика ниже — БАЙТ-в-байт зеркало widgets/main/src/pure/
 * capacity-pure.js (две среды: YT-scripting ES5 vs esbuild ES2017). Любая правка формулы —
 * синхронно в ОБА файла; дрейф ловит tests/unit/capacity-parity.test.js.
 *
 * ИНВАРИАНТЫ БЕЗОПАСНОСТИ — см. шапку backend-core.js. Ключевые здесь:
 *   • authzGuard первым в каждом handler (calendar = admin-тир, capacity/absences = планировочный);
 *   • no client claims: base/окно/approvedBy — серверные, не из тела;
 *   • validateAllocSums hard-block при approve (Σ alloc > 1.0+EPS), defense-in-depth (D1a);
 *   • атомарная валидация календаря/отсутствий с reason-кодами БЕЗ эха значений.
 */

var core = require('./backend-core.js');

/* ─── Константы ──────────────────────────────────────────────────────────────── */

var DEFAULT_KPE = { Intern: 0, Junior: 0.5, Middle: 0.65, Senior: 0.75 };
var EPS = 1e-6;
var MS_PER_DAY = 86400000;
var ABSENCE_TYPES = ['vacation', 'sick', 'out_of_membership', 'regional_holiday', 'training', 'teamleading', 'other'];
var DAY_TYPES = ['holiday', 'short', 'workday'];

/* ssp_capacity копит frozen-снимок per-sprint вечно → к 500КБ (gotcha #13). Размер-чек
   до setProp; внятный reason при превышении. */
var MAX_CAPACITY_SIZE  = 400 * 1024; // буфер до MAX_PROP_SIZE (500КБ)
var MAX_CALENDAR_SIZE  = 300 * 1024;
var MAX_ABSENCES_SIZE  = 300 * 1024;

/* #53 — авто-архив ёмкости (паттерн backend-release.js splitForArchive): активный стор
   перерос CAP_ARCHIVE_TRIGGER → старейшие по dateEnd записи (КРОМЕ текущего спринта)
   переезжают в ssp_capacity_archive, пока активный не уляжется в CAP_ARCHIVE_TARGET.
   Read-only история: архив отдаёт GET capacity-archive, POST'а на архив нет. */
var CAP_ARCHIVE_PROP    = 'ssp_capacity_archive';
var CAP_ARCHIVE_COUNT_PROP = 'ssp_capacity_archive_count'; /* счётчик для бейджа «Архив (N)» без парса блоба */
var CAP_ARCHIVE_TRIGGER = 300 * 1024;
var CAP_ARCHIVE_TARGET  = 250 * 1024;
var CAP_ARCHIVE_MAX     = 480 * 1024; // потолок архив-пропа (буфер до MAX_PROP_SIZE 500КБ)

/* ─── Формула (ЗЕРКАЛО capacity-pure.js — править синхронно) ──────────────────── */

function numOr(v, d) {
  return (typeof v === 'number' && isFinite(v)) ? v : d;
}

function pad2(n) { return n < 10 ? '0' + n : '' + n; }

function floorUTCDay(ms) {
  var d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function msToIso(ms) {
  var d = new Date(ms);
  return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
}

function isoToUTCms(iso) {
  if (typeof iso !== 'string') return NaN;
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return NaN;
  var y = parseInt(m[1], 10), mo = parseInt(m[2], 10), da = parseInt(m[3], 10);
  if (mo < 1 || mo > 12 || da < 1 || da > 31) return NaN;
  var ms = Date.UTC(y, mo - 1, da);
  var back = new Date(ms);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== da) return NaN;
  return ms;
}

function isValidIsoDate(iso) {
  return !isNaN(isoToUTCms(iso));
}

function isWeekendUTC(d) {
  var ms = (typeof d === 'number') ? d : isoToUTCms(d);
  if (isNaN(ms)) return false;
  var day = new Date(ms).getUTCDay();
  return day === 0 || day === 6;
}

function dayKeysUTC(startMs, endMs) {
  var out = [];
  if (typeof startMs !== 'number' || typeof endMs !== 'number' || !isFinite(startMs) || !isFinite(endMs)) return out;
  var s = floorUTCDay(startMs), e = floorUTCDay(endMs);
  if (e < s) return out;
  var cur = s, guard = 0;
  while (cur <= e && guard < 7400) { out.push(msToIso(cur)); cur += MS_PER_DAY; guard++; }  /* v3.2.1 — 1200 дней резал реальные lead-in диапазоны (out_of_membership 2021→2026) на UI-roundtrip'е; потолок ~20 лет */
  return out;
}

function isoRangeDays(fromIso, toIso) {
  var s = isoToUTCms(fromIso), e = isoToUTCms(toIso);
  if (isNaN(s) || isNaN(e) || e < s) return [];
  var out = [], cur = s, guard = 0;
  while (cur <= e && guard < 7400) { out.push(msToIso(cur)); cur += MS_PER_DAY; guard++; }  /* v3.2.1 — 1200 дней резал реальные lead-in диапазоны (out_of_membership 2021→2026) на UI-roundtrip'е; потолок ~20 лет */
  return out;
}

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

function workingHoursOfDay(dayKey, calendar, hoursPerDay) {
  var entry = calendarLookup(calendar, dayKey);
  if (entry) {
    if (entry.type === 'holiday') return 0;
    if (entry.type === 'short') return Math.max(0, hoursPerDay + numOr(entry.hoursDelta, 0));
    if (entry.type === 'workday') return hoursPerDay;
  }
  return isWeekendUTC(dayKey) ? 0 : hoursPerDay;
}

function workingHoursInSprint(startMs, endMs, calendar, hoursPerDay) {
  var days = dayKeysUTC(startMs, endMs);
  var h = 0;
  for (var i = 0; i < days.length; i++) h += workingHoursOfDay(days[i], calendar, hoursPerDay);
  return h;
}

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

function kpeFor(grade, kpe) {
  if (kpe && typeof kpe[grade] === 'number' && isFinite(kpe[grade])) return kpe[grade];
  if (typeof DEFAULT_KPE[grade] === 'number') return DEFAULT_KPE[grade];
  return 0;
}

function nominal(workingH, absenceH) {
  return Math.max(0, numOr(workingH, 0) - numOr(absenceH, 0));
}

function baseHours(nominalH, grade, rate, participation, kpe) {
  return numOr(nominalH, 0) * kpeFor(grade, kpe) * numOr(rate, 1) * numOr(participation, 1);
}

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

function roleContribution(base, alloc, roleKey) {
  if (!alloc || typeof alloc !== 'object') return 0;
  return numOr(base, 0) * numOr(alloc[roleKey], 0);
}

/* ─── Серверные хелперы ──────────────────────────────────────────────────────── */

function cuLogin(ctx) {
  return (ctx && ctx.currentUser && ctx.currentUser.login) || '';
}

/* Уникальные годы окна спринта (для calendarRef). */
function yearsInWindow(startMs, endMs) {
  var days = dayKeysUTC(startMs, endMs);
  var seen = {}, out = [];
  for (var i = 0; i < days.length; i++) {
    var y = days[i].substring(0, 4);
    if (!seen[y]) { seen[y] = true; out.push(y); }
  }
  out.sort();
  return out;
}

/* Frozen-копия отсутствий человека, пересекающих окно спринта (ключи → whitelist). */
function absencesInWindow(ranges, startMs, endMs) {
  var out = [];
  if (!ranges || !ranges.length) return out;
  var wStart = floorUTCDay(startMs), wEnd = floorUTCDay(endMs);
  for (var i = 0; i < ranges.length; i++) {
    var r = ranges[i];
    if (!r) continue;
    var rs = isoToUTCms(r.from), re = isoToUTCms(r.to);
    if (isNaN(rs) || isNaN(re)) continue;
    if (re < wStart || rs > wEnd) continue;
    var snap = { from: r.from, to: r.to, type: r.type };
    if (typeof r.hoursDelta === 'number' && isFinite(r.hoursDelta)) snap.hoursDelta = r.hoursDelta; // #53 частичный день
    out.push(snap);
  }
  return out;
}

/* ─── #53 архив ёмкости (паттерн backend-release.js) ─────────────────────────── */

/* Ключ сортировки «старейшие — первыми»: dateEnd записи (epoch-ms); фолбэк 0 для pre-#53
   записей без поля (они и есть старейшие → архивируются первыми). */
function _capDateEndOf(rec) {
  return (rec && typeof rec.dateEnd === 'number' && isFinite(rec.dateEnd)) ? rec.dateEnd : 0;
}

/* Счётчик архива без полного парса блоба (до сотен КБ на каждый GET): живёт в отдельном
   пропе, пишется вместе с архивом. Legacy-фолбэк — полный парс, пока архив не перезаписан. */
function readCapacityArchiveCount(ctx) {
  var raw = core.getProp(ctx, CAP_ARCHIVE_COUNT_PROP, null);
  if (raw !== null && raw !== undefined && raw !== '' && isFinite(Number(raw))) return Number(raw);
  return Object.keys(readCapacityArchive(ctx)).length;
}

function readCapacityArchive(ctx) {
  var blob = core.parseJson(core.getProp(ctx, CAP_ARCHIVE_PROP, null), null);
  return (blob && typeof blob === 'object' && !Array.isArray(blob)) ? blob : {};
}

/* Pure-разрез стора ёмкости на «активный + архив» (in-memory, БЕЗ записи пропов — порядок
   записи решает handler). Мутирует store (старейшие-по-dateEnd, КРОМЕ currentSprintId,
   удаляются), возвращает { moved, archive }. Ниже CAP_ARCHIVE_TRIGGER — no-op; переносим,
   пока активный не уляжется в CAP_ARCHIVE_TARGET; текущий спринт НИКОГДА не архивируется;
   ключ карты уникален → дедуп by construction (split-brain невозможен). Архив упёрся в свой
   лимит → перенос останавливается (активный POST может отклониться capacity_data_too_large,
   но молчаливой потери нет). */
function splitCapacityForArchive(store, archiveStore, currentSprintId) {
  var moved = 0;
  var archive = {};
  var ak = Object.keys(archiveStore || {});
  for (var a = 0; a < ak.length; a++) archive[ak[a]] = archiveStore[ak[a]];
  if (JSON.stringify(store).length <= CAP_ARCHIVE_TRIGGER) return { moved: 0, archive: archive };
  var ids = Object.keys(store).filter(function (id) { return id !== currentSprintId; })
    .sort(function (x, y) { return _capDateEndOf(store[x]) - _capDateEndOf(store[y]); });
  for (var i = 0; i < ids.length; i++) {
    if (JSON.stringify(store).length <= CAP_ARCHIVE_TARGET) break;
    var id = ids[i];
    archive[id] = store[id];
    if (JSON.stringify(archive).length > CAP_ARCHIVE_MAX) { delete archive[id]; break; }
    delete store[id];
    moved++;
  }
  return { moved: moved, archive: archive };
}

/* ─── Валидаторы ─────────────────────────────────────────────────────────────── */

/* Произв. календарь — АТОМАРНО (любая жёсткая ошибка → reject всего файла) с построчным
   отчётом {year,index,field,code} БЕЗ эха значений (gotcha #1 / §5.1). */
function validateCalendarForWrite(cal) {
  var errors = [];
  if (!cal || typeof cal !== 'object' || Array.isArray(cal)) {
    return { ok: false, errors: [{ field: 'root', code: 'not_object' }] };
  }
  var years = cal.years;
  if (years === undefined || years === null) years = {};
  if (typeof years !== 'object' || Array.isArray(years)) {
    return { ok: false, errors: [{ field: 'years', code: 'not_object' }] };
  }
  var normalizedYears = {};
  var yearKeys = Object.keys(years);
  for (var yi = 0; yi < yearKeys.length; yi++) {
    var yk = yearKeys[yi];
    if (!/^\d{4}$/.test(yk)) { errors.push({ year: yk, field: 'year', code: 'invalid_year' }); continue; }
    var arr = years[yk];
    if (!Array.isArray(arr)) { errors.push({ year: yk, field: 'year', code: 'not_array' }); continue; }
    var seenDates = {};
    var normEntries = [];
    for (var i = 0; i < arr.length; i++) {
      var e = arr[i];
      if (!e || typeof e !== 'object' || Array.isArray(e)) { errors.push({ year: yk, index: i, field: 'entry', code: 'not_object' }); continue; }
      if (!isValidIsoDate(e.date)) { errors.push({ year: yk, index: i, field: 'date', code: 'invalid_date' }); continue; }
      if (e.date.substring(0, 4) !== yk) { errors.push({ year: yk, index: i, field: 'date', code: 'year_mismatch' }); continue; }
      if (DAY_TYPES.indexOf(e.type) < 0) { errors.push({ year: yk, index: i, field: 'type', code: 'invalid_type' }); continue; }
      var delta = (e.hoursDelta === undefined || e.hoursDelta === null) ? 0 : e.hoursDelta;
      if (e.type === 'short') {
        if (!core.isNumInRange(delta, -8, -0.5)) { errors.push({ year: yk, index: i, field: 'hoursDelta', code: 'invalid_delta' }); continue; }
      } else {
        if (typeof delta !== 'number' || delta !== 0) { errors.push({ year: yk, index: i, field: 'hoursDelta', code: 'delta_must_be_zero' }); continue; }
      }
      if (seenDates[e.date]) { errors.push({ year: yk, index: i, field: 'date', code: 'duplicate_date' }); continue; }
      seenDates[e.date] = true;
      normEntries.push({ date: e.date, type: e.type, hoursDelta: delta });
    }
    normalizedYears[yk] = normEntries;
  }
  if (errors.length) return { ok: false, errors: errors };
  return { ok: true, normalized: { years: normalizedYears } };
}

function validateCalendarForRead(cal) {
  return cal === null || cal === undefined || (typeof cal === 'object' && !Array.isArray(cal));
}

/* Реестр отсутствий — АТОМАРНО {login,index,field,code}. */
function validateAbsencesForWrite(absences) {
  var errors = [];
  if (!absences || typeof absences !== 'object' || Array.isArray(absences)) {
    return { ok: false, errors: [{ field: 'root', code: 'not_object' }] };
  }
  var normalized = {};
  var logins = Object.keys(absences);
  for (var li = 0; li < logins.length; li++) {
    var login = logins[li];
    if (typeof login !== 'string' || login.length === 0 || login.length > 200) { errors.push({ login: login, field: 'login', code: 'invalid_login' }); continue; }
    var arr = absences[login];
    if (!Array.isArray(arr)) { errors.push({ login: login, field: 'login', code: 'not_array' }); continue; }
    var normEntries = [];
    for (var i = 0; i < arr.length; i++) {
      var e = arr[i];
      if (!e || typeof e !== 'object' || Array.isArray(e)) { errors.push({ login: login, index: i, field: 'entry', code: 'not_object' }); continue; }
      if (!isValidIsoDate(e.from)) { errors.push({ login: login, index: i, field: 'from', code: 'invalid_date' }); continue; }
      if (!isValidIsoDate(e.to)) { errors.push({ login: login, index: i, field: 'to', code: 'invalid_date' }); continue; }
      if (isoToUTCms(e.from) > isoToUTCms(e.to)) { errors.push({ login: login, index: i, field: 'from', code: 'from_after_to' }); continue; }
      if (ABSENCE_TYPES.indexOf(e.type) < 0) { errors.push({ login: login, index: i, field: 'type', code: 'invalid_type' }); continue; }
      var normA = { from: e.from, to: e.to, type: e.type };
      if (e.hoursDelta !== undefined && e.hoursDelta !== null) { // #53 частичный день (optional)
        if (!core.isNumInRange(e.hoursDelta, 0.5, 24)) { errors.push({ login: login, index: i, field: 'hoursDelta', code: 'invalid_delta' }); continue; }
        normA.hoursDelta = e.hoursDelta;
      }
      normEntries.push(normA);
    }
    normalized[login] = normEntries;
  }
  if (errors.length) return { ok: false, errors: errors };
  return { ok: true, normalized: normalized };
}

function validateAbsencesForRead(absences) {
  return absences === null || absences === undefined || (typeof absences === 'object' && !Array.isArray(absences));
}

/* Запись ёмкости — строгая (boolean). Динамические под-карты (alloc/kpe/years) валидируются
   как opaque-блобы по shape, БЕЗ key-фильтра детей (gotcha #8). Все поля optional/additive. */
function validateCapacityForWrite(rec) {
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return false;
  if (rec.mode !== undefined && rec.mode !== null && rec.mode !== 'light' && rec.mode !== 'full') return false;
  if (rec.status !== undefined && rec.status !== null && rec.status !== 'draft' && rec.status !== 'approved') return false;
  if (rec.dirty !== undefined && rec.dirty !== null && typeof rec.dirty !== 'boolean') return false;

  if (rec.constants !== undefined && rec.constants !== null) {
    var c = rec.constants;
    if (typeof c !== 'object' || Array.isArray(c)) return false;
    if (c.kpe !== undefined && c.kpe !== null && (typeof c.kpe !== 'object' || Array.isArray(c.kpe))) return false;
    if (c.hoursPerDay !== undefined && c.hoursPerDay !== null && !core.isNumInRange(c.hoursPerDay, 1, 24)) return false;
    if (c.usefulHoursPerDay !== undefined && c.usefulHoursPerDay !== null && !core.isNumInRange(c.usefulHoursPerDay, 0, 24)) return false;
  }
  if (rec.calendarRef !== undefined && rec.calendarRef !== null) {
    if (typeof rec.calendarRef !== 'object' || Array.isArray(rec.calendarRef)) return false;
  }
  if (rec.persons !== undefined && rec.persons !== null) {
    if (typeof rec.persons !== 'object' || Array.isArray(rec.persons)) return false;
    var plogins = Object.keys(rec.persons);
    for (var pi = 0; pi < plogins.length; pi++) {
      var p = rec.persons[plogins[pi]];
      if (!p || typeof p !== 'object' || Array.isArray(p)) return false;
      if (p.grade !== undefined && p.grade !== null && (typeof p.grade !== 'string' || p.grade.length > 64)) return false;
      if (p.rate !== undefined && p.rate !== null && !core.isNumInRange(p.rate, 0, 1)) return false;
      if (p.participation !== undefined && p.participation !== null && !core.isNumInRange(p.participation, 0, 1)) return false;
      if (p.base !== undefined && p.base !== null && (typeof p.base !== 'number' || !isFinite(p.base) || p.base < 0)) return false;
      if (p.alloc !== undefined && p.alloc !== null) {
        if (typeof p.alloc !== 'object' || Array.isArray(p.alloc)) return false;
        var aks = Object.keys(p.alloc);
        for (var ai = 0; ai < aks.length; ai++) {
          // alloc-ключ ОБЯЗАН быть реальной ролью (как роль-ключи валидируются везде в ядре —
          // validateRoleItems/workItemTypeMapping/history). Иначе планировочный тир мог бы
          // персистить мусорные роли произвольной длины (data-integrity + size-amplification).
          if (core.ROLE_KEYS.indexOf(aks[ai]) < 0) return false;
          var av = p.alloc[aks[ai]];
          if (!core.isNumInRange(av, 0, 1)) return false;
        }
      }
      if (p.absencesApplied !== undefined && p.absencesApplied !== null) {
        if (!Array.isArray(p.absencesApplied)) return false;
      }
    }
  }
  if (rec.approvedBy !== undefined && rec.approvedBy !== null && (typeof rec.approvedBy !== 'string' || rec.approvedBy.length > 200)) return false;
  if (rec.approvedAt !== undefined && rec.approvedAt !== null && (typeof rec.approvedAt !== 'number' || !isFinite(rec.approvedAt))) return false;
  if (rec.reapprovals !== undefined && rec.reapprovals !== null && !Array.isArray(rec.reapprovals)) return false;
  if (rec.dateEnd !== undefined && rec.dateEnd !== null && (typeof rec.dateEnd !== 'number' || !isFinite(rec.dateEnd))) return false; // #53
  if (rec.pluginVersion !== undefined && rec.pluginVersion !== null && !core.validatePluginVersion(rec.pluginVersion)) return false;
  return true;
}

function validateCapacityForRead(rec) {
  return rec === null || rec === undefined || (typeof rec === 'object' && !Array.isArray(rec));
}

/* Миграция записи ёмкости — no-op на старте (поля аддитивны/optional). */
function migrateCapacity(rec) { return rec; }

/* ─── Endpoint-обработчики ───────────────────────────────────────────────────── */

/* Кастомный 400 с массивом reason-кодов (без эха значений). */
function badWithErrors(ctx, reason, errors) {
  try { ctx.response.status = 400; } catch (e) { /* ignore */ }
  ctx.response.json({ success: false, error: 'Bad Request', reason: reason, errors: errors || [] });
}

function handleGetCapacity(ctx) {
  if (!core.authzGuard(ctx, 'viewer')) return;
  var sprintId = (ctx.request.getParameter('sprintId') || '').trim();
  var store = core.parseJson(core.getProp(ctx, 'ssp_capacity'), {}) || {};
  // hasOwnProperty-guard: иначе sprintId='__proto__' вернул бы Object.prototype ({}) как
  // фантомную запись для несуществующего спринта (read-side probing).
  var record = (sprintId && Object.prototype.hasOwnProperty.call(store, sprintId)) ? store[sprintId] : null;
  ctx.response.json({ success: true, sprintId: sprintId, capacity: record, archivedCount: readCapacityArchiveCount(ctx) }); // #53
}

/* #53 — read-only архив ёмкости (lazy-fetch фронта по раскрытию спойлера «Архив (N)»).
   Отдаём массивом записей (sprintId вложен в запись) — удобно для рендера; сортировка по
   dateEnd убыв. (свежие архивные — сверху). */
function handleGetCapacityArchive(ctx) {
  if (!core.authzGuard(ctx, 'viewer')) return;
  var arch = readCapacityArchive(ctx);
  var ids = Object.keys(arch).sort(function (x, y) { return _capDateEndOf(arch[y]) - _capDateEndOf(arch[x]); });
  var rows = [];
  for (var i = 0; i < ids.length; i++) {
    var r = arch[ids[i]] || {};
    var row = {};
    for (var k in r) if (Object.prototype.hasOwnProperty.call(r, k)) row[k] = r[k];
    row.sprintId = ids[i]; // ключ карты вкладываем поверх записи для рендера
    rows.push(row);
  }
  ctx.response.json({ success: true, capacity: rows });
}

function handlePostCapacity(ctx) {
  // планировочный тир (settings-менеджер ИЛИ планировочный менеджер); 'planningManager'-строки
  // в authzGuard НЕТ — используем 'settingsOrPlanning' (gotcha #3).
  if (!core.authzGuard(ctx, 'settingsOrPlanning')) return;

  var action = (ctx.request.getParameter('action') || 'save').trim();
  if (action !== 'save' && action !== 'approve' && action !== 'reapprove') { core.badRequest(ctx, 'invalid_action'); return; }

  var sprintId = (ctx.request.getParameter('sprintId') || '').trim();
  if (!sprintId) { core.badRequest(ctx, 'sprint_id_required'); return; }

  var body = core.parseBodyOrReject(ctx, core.ALLOWED_CAPACITY_RECORD_KEYS);
  if (body === null) return;
  /* v3.2.1 — анти-wipe: битое тело (getBody → {}) валидно перезаписывало запись ёмкости
     спринта пустыми persons. Ключ persons обязан присутствовать явно (фронт шлёт всегда). */
  if (body.persons === undefined || typeof body.persons !== 'object' || Array.isArray(body.persons)) {
    core.badRequest(ctx, 'capacity_persons_required');
    return;
  }
  if (!validateCapacityForWrite(body)) { core.badRequest(ctx, 'invalid_capacity_structure'); return; }

  // gotcha #2: окно спринта — серверно из ssp_sprint (R2 = только активный спринт).
  var curSprint = core.parseJson(core.getProp(ctx, 'ssp_sprint'), null);
  if (!curSprint || curSprint.sprintId !== sprintId) { core.badRequest(ctx, 'sprint_not_current'); return; }
  var sStart = curSprint.dateStart, sEnd = curSprint.dateEnd;
  if (typeof sStart !== 'number' || typeof sEnd !== 'number') { core.badRequest(ctx, 'sprint_dates_missing'); return; }

  // Существующая запись спринта (для статус-машины + frozen-снимка при live-edit).
  var store = core.parseJson(core.getProp(ctx, 'ssp_capacity'), {}) || {};
  var existing = Object.prototype.hasOwnProperty.call(store, sprintId) ? store[sprintId] : null;
  // Live-edit утверждённой записи (action=save при approved): frozen-снимок входов
  // (constants/calendarRef/absencesApplied) НЕ обновляется — только при (пере)утверждении (§8);
  // base пересчитывается Live (Feed=Live) с dirty=true. constants (kpe/часы) — НЕ live-триггер
  // (§8: триггеры = отсутствие/alloc/grade/rate/участие), потому на live-edit база считается по
  // ЗАМОРОЖЕННЫМ constants (правка глоб. kpe требует переутверждения).
  var isLiveEditOfApproved = (action === 'save' && existing && existing.status === 'approved');
  var frozenConstants = (isLiveEditOfApproved && existing.constants
    && typeof existing.constants === 'object' && !Array.isArray(existing.constants)) ? existing.constants : null;

  // constants — серверно: на live-edit утверждённой = замороженные из записи; иначе из настроек
  // (admin-политика; не client claims).
  var settings = core.parseJson(core.getProp(ctx, 'ssp_settings'), {}) || {};
  var constants = frozenConstants || {
    kpe: (settings.kpe && typeof settings.kpe === 'object' && !Array.isArray(settings.kpe)) ? settings.kpe : DEFAULT_KPE,
    hoursPerDay: numOr(settings.hoursPerDay, 8),
    usefulHoursPerDay: numOr(settings.usefulHoursPerDay, 7)
  };

  // persons-примитивы из тела (grade/rate/participation/alloc); base/absencesApplied клиента игнорим.
  var personsIn = (body.persons && typeof body.persons === 'object' && !Array.isArray(body.persons)) ? body.persons : {};
  var calendar = core.parseJson(core.getProp(ctx, 'ssp_calendar'), null);
  var absStore = core.parseJson(core.getProp(ctx, 'ssp_absences'), {}) || {};

  var computeRecord = { constants: constants, persons: {} };
  var absencesByLogin = {};
  var inLogins = Object.keys(personsIn);
  for (var i = 0; i < inLogins.length; i++) {
    var login = inLogins[i];
    var p = personsIn[login] || {};
    computeRecord.persons[login] = {
      grade: (typeof p.grade === 'string' && p.grade) ? p.grade : 'Middle',
      rate: numOr(p.rate, 1),
      participation: numOr(p.participation, 1),
      alloc: sanitizeAlloc(p.alloc)
    };
    absencesByLogin[login] = (absStore[login] && absStore[login].length) ? absStore[login] : [];
  }

  // D1a: серверный hard-block утверждения при Σ alloc > 1.0+EPS (defense-in-depth).
  var allocCheck = validateAllocSums(computeRecord.persons);
  if ((action === 'approve' || action === 'reapprove') && !allocCheck.ok) {
    core.badRequest(ctx, 'alloc_sum_exceeds_100');
    return;
  }

  // Авторитетный пересчёт.
  var computed = computeCapacity(computeRecord, calendar, absencesByLogin, sStart, sEnd);

  // frozen-снимок входов на live-edit утверждённой записи (§8): сохраняем calendarRef и
  // per-person absencesApplied из existing; обновляются только при (пере)утверждении.
  var existingPersons = (isLiveEditOfApproved && existing.persons && typeof existing.persons === 'object') ? existing.persons : null;
  var frozenCalRef = (isLiveEditOfApproved && existing.calendarRef && typeof existing.calendarRef === 'object') ? existing.calendarRef : null;

  var rec = {
    mode: 'full',
    constants: constants,
    calendarRef: frozenCalRef || { years: yearsInWindow(sStart, sEnd), uploadedAt: (calendar && calendar.uploadedAt) || null },
    persons: {},
    dateEnd: sEnd, // #53 — окно спринта (серверно из ssp_sprint) для сортировки/дисплея архива
    pluginVersion: core.CURRENT_PLUGIN_VERSION
  };
  var outLogins = Object.keys(computed.persons);
  for (var j = 0; j < outLogins.length; j++) {
    var ol = outLogins[j];
    var cp = computed.persons[ol];
    // absencesApplied — frozen-копия входов: на live-edit сохраняем approve-time копию (§8);
    // для новой записи/нового человека — текущее окно.
    var frozenAbs = (existingPersons && existingPersons[ol] && Array.isArray(existingPersons[ol].absencesApplied))
      ? existingPersons[ol].absencesApplied
      : absencesInWindow(absencesByLogin[ol], sStart, sEnd);
    rec.persons[ol] = {
      grade: cp.grade,
      rate: cp.rate,
      participation: cp.participation,
      alloc: cp.alloc,
      base: cp.base,
      absencesApplied: frozenAbs
    };
  }

  var ts = Date.now();
  if (action === 'save') {
    if (existing && existing.status === 'approved') {
      // Live-feed: правка утверждённой ёмкости → пересчёт base + dirty=true; approve-метаданные
      // сохраняем (frozen-снимок прошлой записи обновляется только при (пере)утверждении).
      rec.status = 'approved';
      rec.dirty = true;
      rec.approvedBy = existing.approvedBy || null;
      rec.approvedAt = (typeof existing.approvedAt === 'number') ? existing.approvedAt : null;
      rec.reapprovals = Array.isArray(existing.reapprovals) ? existing.reapprovals : [];
    } else {
      rec.status = 'draft';
      rec.dirty = false;
    }
  } else { // approve | reapprove
    rec.status = 'approved';
    rec.dirty = false;
    rec.approvedBy = cuLogin(ctx); // НИКОГДА из тела (#14)
    if (action === 'reapprove' && existing && existing.status === 'approved') {
      rec.approvedAt = (typeof existing.approvedAt === 'number') ? existing.approvedAt : ts;
      rec.reapprovals = (Array.isArray(existing.reapprovals) ? existing.reapprovals : []).concat([{ by: cuLogin(ctx), at: ts }]);
    } else {
      rec.approvedAt = ts;
      rec.reapprovals = [];
    }
  }

  store[sprintId] = rec;
  /* #53 — авто-архив ДО размер-чека (in-memory): активный стор худеет на старейшие спринты
     (кроме текущего). Запись архив-пропа — только после прохождения чека активным (иначе
     split-brain: записи в архиве при неизменённом активном; повторный POST лечится дедупом). */
  var archiveSplit = splitCapacityForArchive(store, readCapacityArchive(ctx), sprintId);
  var serialized = JSON.stringify(store);
  if (serialized.length > MAX_CAPACITY_SIZE) { core.badRequest(ctx, 'capacity_data_too_large'); return; }
  if (archiveSplit.moved > 0) {
    core.setProp(ctx, CAP_ARCHIVE_PROP, JSON.stringify(archiveSplit.archive));
    core.setProp(ctx, CAP_ARCHIVE_COUNT_PROP, String(Object.keys(archiveSplit.archive).length));
  }
  core.setProp(ctx, 'ssp_capacity', serialized);
  ctx.response.json({ success: true, sprintId: sprintId, action: action, capacity: rec, allocOk: allocCheck.ok, archived: archiveSplit.moved });
}

function handleGetCalendar(ctx) {
  if (!core.authzGuard(ctx, 'viewer')) return;
  var cal = core.parseJson(core.getProp(ctx, 'ssp_calendar'), null);
  ctx.response.json({ success: true, calendar: cal });
}

function handlePostCalendar(ctx) {
  // admin-тир (загрузка произв. календаря); calendar = политика модели.
  if (!core.authzGuard(ctx, 'settingsManager')) return;
  var body = core.parseBodyOrReject(ctx, core.ALLOWED_CALENDAR_KEYS);
  if (body === null) return;
  var vc = validateCalendarForWrite(body);
  if (!vc.ok) { badWithErrors(ctx, 'calendar_invalid', vc.errors); return; }
  var cal = vc.normalized;
  cal.uploadedBy = cuLogin(ctx);
  cal.uploadedAt = Date.now();
  cal.pluginVersion = core.CURRENT_PLUGIN_VERSION;
  var s = JSON.stringify(cal);
  if (s.length > MAX_CALENDAR_SIZE) { core.badRequest(ctx, 'calendar_data_too_large'); return; }
  core.setProp(ctx, 'ssp_calendar', s);
  ctx.response.json({ success: true, calendar: cal });
}

function handleGetAbsences(ctx) {
  if (!core.authzGuard(ctx, 'viewer')) return;
  var abs = core.parseJson(core.getProp(ctx, 'ssp_absences'), {}) || {};
  ctx.response.json({ success: true, absences: abs, rev: core.slotRev(ctx, 'ssp_absences_rev') /* R6 */ });
}

function handlePostAbsences(ctx) {
  // планировочный тир (ввод отсутствий).
  if (!core.authzGuard(ctx, 'settingsOrPlanning')) return;
  var body = core.parseBodyOrReject(ctx, null); /* динамические login-ключи — без whitelist */
  if (body === null) return;
  // body = карта login→[entry] (динамические login-ключи → filterKeys не применим; validator
  // нормализует каждую запись до {from,to,type} — gotcha #8). Обёртку
  // {absences:{…}} распознаём по ШЕЙПУ (non-array object), не по наличию ключа: иначе легит-
  // логин буквально «absences» (значение = массив) ложно принялся бы за обёртку и весь POST
  // (включая других людей) терялся бы с 400.
  var map = (body.absences && typeof body.absences === 'object' && !Array.isArray(body.absences)) ? body.absences : body;
  /* R6 — optimistic lock (P1 #13): full-map replace двумя менеджерами шёл last-write-wins.
     baseRev уважаем ТОЛЬКО в обёрточной форме {absences:{…}, baseRev} — в raw-map теле
     top-level ключи суть логины, baseRev там был бы «логином» (legacy-клиенты его не шлют). */
  if (body.absences && core.revConflict(ctx, body.baseRev, core.slotRev(ctx, 'ssp_absences_rev'))) return;
  /* v3.2.1 — анти-wipe: битое/оборванное тело парсится в {} (core.getBody) и до фикса
     ВАЛИДНО затирало реестр отсутствий всех людей с success:true. Пустая карта легальна
     только через ЯВНУЮ обёртку {absences:{}} (фронт v3.2.1+ всегда шлёт обёртку). */
  if (!Object.keys(map).length
      && !(body.absences && typeof body.absences === 'object' && !Array.isArray(body.absences))) {
    core.badRequest(ctx, 'absences_empty_body');
    return;
  }
  var va = validateAbsencesForWrite(map);
  if (!va.ok) { badWithErrors(ctx, 'absences_invalid', va.errors); return; }
  var s = JSON.stringify(va.normalized);
  if (s.length > MAX_ABSENCES_SIZE) { core.badRequest(ctx, 'absences_data_too_large'); return; }
  core.setProp(ctx, 'ssp_absences', s);
  ctx.response.json({ success: true, rev: core.bumpSlotRev(ctx, 'ssp_absences_rev') });
}

var CAPACITY_ENDPOINTS = [
  { scope: 'project', method: 'GET',  path: 'capacity', handle: handleGetCapacity },
  { scope: 'project', method: 'GET',  path: 'capacity-archive', handle: handleGetCapacityArchive }, // #53
  { scope: 'project', method: 'POST', path: 'capacity', handle: handlePostCapacity },
  { scope: 'project', method: 'GET',  path: 'calendar', handle: handleGetCalendar },
  { scope: 'project', method: 'POST', path: 'calendar', handle: handlePostCalendar },
  { scope: 'project', method: 'GET',  path: 'absences', handle: handleGetAbsences },
  { scope: 'project', method: 'POST', path: 'absences', handle: handlePostAbsences }
];

/* Самрегистрация в ОБЩИЙ core.ENDPOINTS (оба handler-файла читают его — gotcha #7).
   Идемпотентно: при повторном require (тот же module-cache) тело не перевыполняется;
   guard на core-объекте защищает от двойного push в shared-контексте. */
if (core && core.ENDPOINTS && !core.__capacityEndpointsRegistered) {
  for (var ei = 0; ei < CAPACITY_ENDPOINTS.length; ei++) core.ENDPOINTS.push(CAPACITY_ENDPOINTS[ei]);
  core.__capacityEndpointsRegistered = true;
}

/* Runtime + test-only exports. */
exports.CAPACITY_ENDPOINTS = CAPACITY_ENDPOINTS;
if (typeof module !== 'undefined' && module.exports) {
  Object.assign(exports, {
    // формула
    numOr: numOr,
    floorUTCDay: floorUTCDay,
    msToIso: msToIso,
    isoToUTCms: isoToUTCms,
    isValidIsoDate: isValidIsoDate,
    isWeekendUTC: isWeekendUTC,
    dayKeysUTC: dayKeysUTC,
    isoRangeDays: isoRangeDays,
    calendarLookup: calendarLookup,
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
    yearsInWindow: yearsInWindow,
    absencesInWindow: absencesInWindow,
    // валидаторы
    validateCalendarForWrite: validateCalendarForWrite,
    validateCalendarForRead: validateCalendarForRead,
    validateAbsencesForWrite: validateAbsencesForWrite,
    validateAbsencesForRead: validateAbsencesForRead,
    validateCapacityForWrite: validateCapacityForWrite,
    validateCapacityForRead: validateCapacityForRead,
    migrateCapacity: migrateCapacity,
    // #53 архив
    readCapacityArchive: readCapacityArchive,
    splitCapacityForArchive: splitCapacityForArchive,
    // handlers (для unit-тестов endpoint-логики)
    handleGetCapacity: handleGetCapacity,
    handleGetCapacityArchive: handleGetCapacityArchive, // #53
    handlePostCapacity: handlePostCapacity,
    handleGetCalendar: handleGetCalendar,
    handlePostCalendar: handlePostCalendar,
    handleGetAbsences: handleGetAbsences,
    handlePostAbsences: handlePostAbsences,
    // константы
    DEFAULT_KPE: DEFAULT_KPE,
    ABSENCE_TYPES: ABSENCE_TYPES,
    DAY_TYPES: DAY_TYPES,
    EPS: EPS,
    MAX_CAPACITY_SIZE: MAX_CAPACITY_SIZE,
    CAP_ARCHIVE_TRIGGER: CAP_ARCHIVE_TRIGGER, // #53
    CAP_ARCHIVE_TARGET: CAP_ARCHIVE_TARGET    // #53
  });
}
