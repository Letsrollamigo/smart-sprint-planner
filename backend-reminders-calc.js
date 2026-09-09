/**
 * Smart Sprint Planner — вычислитель напоминаний (#112 «Напоминания», v3.40.0).
 *
 * Чистый модуль БЕЗ require (ни backend-core, ни entities): вход — уже распарсенные объекты
 * проекта, выход — список пунктов для ВСЕХ адресатов плюс описание правила адресации.
 * Права НЕ проверяет (это делает backend-reminders.js предикатами ядра), журнал не трогает,
 * «сегодня» получает снаружи (единый день на запрос, тестируемость). Такой разрез нужен
 * будущему правилу on-schedule (#115 «дайджест в почту»): оно подключит файл как есть.
 *
 * Канон дня (⚖5, #116): календарная дата сущности = ближайшая UTC-полночь — dayMs, локальная
 * копия pure/date-pure.js (юнит держит паритет на выборке). «Сегодня» — UTC-пол мгновения
 * (todayOf): dayMs округляет к БЛИЖАЙШЕЙ полуночи и после 12:00 UTC дал бы завтрашний день.
 * Мгновения (confirmedAt, approvedAt, updatedAt) через dayMs не прогонять.
 */

var DAY_MS = 86400000;

var MODULES = ['sprints', 'capacity', 'releases'];
var KINDS = ['sprintRoleOpen', 'sprintSlotOver', 'capacityBefore', 'capacityAfter', 'releaseOverdue'];
var RESOLVED_HOW = ['roleFinished', 'validated', 'capacityApproved', 'sprintOver', 'released', 'cancelled',
  'dateMoved', 'gone', 'moduleOff'];

/* Умолчания настроек: отсутствие ключа = умолчание (мастер remindersEnabled — отдельно, false). */
var DEFAULTS = { remindersSprints: true, remindersCapacity: true, remindersReleases: true, remindersCapacityDays: 3 };

function dayMs(ts) {
  return Math.ceil(ts / DAY_MS - 0.5) * DAY_MS;
}

/* «Сегодня» из мгновения: пол по UTC-суткам, не dayMs (см. шапку). */
function todayOf(now) {
  return Math.floor(now / DAY_MS) * DAY_MS;
}

/* Базовый id спринта из id записи истории `<sprintId>_<roleKey>` — режем по ПОСЛЕДНЕМУ '_'
   (как history-view._histBaseId: легаси-id мог содержать подчёркивание). */
function baseId(sid) {
  var s = String(sid || ''), u = s.lastIndexOf('_');
  return u > 0 ? s.slice(0, u) : s;
}

function boolSetting(settings, key) {
  var v = settings ? settings[key] : undefined;
  return (v === undefined || v === null) ? DEFAULTS[key] : v === true;
}

function capacityDays(settings) {
  var v = settings ? settings.remindersCapacityDays : undefined;
  return (typeof v === 'number' && isFinite(v) && v >= 0) ? Math.floor(v) : DEFAULTS.remindersCapacityDays;
}

/* on = мастер ∧ тумблер модуля ∧ доступность модуля (ёмкость — только полная модель, релизы —
   только при включённом модуле релизов). */
function modulesOn(settings) {
  var s = settings || {};
  var enabled = s.remindersEnabled === true;
  return {
    sprints:  { on: enabled && boolSetting(s, 'remindersSprints') },
    capacity: { on: enabled && boolSetting(s, 'remindersCapacity') && s.capacityMode === 'full' },
    releases: { on: enabled && boolSetting(s, 'remindersReleases') && s.releaseEnabled === true }
  };
}

function daysSince(today, day) {
  return Math.round((today - day) / DAY_MS);
}

/* hasOwnProperty-гард: sprintId='__proto__' не должен вернуть Object.prototype фантомом. */
function capacityRecordOf(capacity, sprintId) {
  if (!capacity || typeof capacity !== 'object' || !sprintId) return null;
  return Object.prototype.hasOwnProperty.call(capacity, sprintId) ? capacity[sprintId] : null;
}

function findHistory(history, sprintId) {
  for (var i = 0; i < history.length; i++) {
    if (history[i] && history[i].sprintId === sprintId) return history[i];
  }
  return null;
}

function firstHistoryOfBase(history, base) {
  for (var i = 0; i < history.length; i++) {
    if (history[i] && baseId(history[i].sprintId) === base) return history[i];
  }
  return null;
}

function findRelease(releases, id) {
  for (var i = 0; i < releases.length; i++) {
    if (releases[i] && releases[i].id === id) return releases[i];
  }
  return null;
}

function releaseAddressee(rel) {
  var reps = (rel && rel.roleReps) || {};
  var logins = [];
  if (typeof reps.manager === 'string' && reps.manager) logins.push(reps.manager);
  if (typeof reps.engineer === 'string' && reps.engineer && logins.indexOf(reps.engineer) < 0) logins.push(reps.engineer);
  return { logins: logins, orValidator: true };
}

function nameOf(it) {
  return String((it.params && (it.params.sprint || it.params.release)) || '');
}

/* Самое давнее первым (days убыв.), затем по имени. */
function byDaysThenName(a, b) {
  if (a.days !== b.days) return b.days - a.days;
  var an = nameOf(a), bn = nameOf(b);
  return an < bn ? -1 : (an > bn ? 1 : 0);
}

/**
 * compute({ settings, sprint, history, capacity, releases, today }) →
 *   { modules: { sprints:{on}, capacity:{on}, releases:{on} }, items: [ … ] }
 * Пункт: { id: '<module>:<entityId>', module, kind, entityId, params, days, ref, addressee }.
 * days = (today − день сущности) / DAY_MS: < 0 «через N дн.», 0 «сегодня», > 0 «N дн. назад».
 */
function compute(input) {
  var settings = input.settings || {};
  var sprint = input.sprint && typeof input.sprint === 'object' ? input.sprint : null;
  var history = Array.isArray(input.history) ? input.history : [];
  var releases = Array.isArray(input.releases) ? input.releases : [];
  var today = input.today;
  var mods = modulesOn(settings);
  var sprints = [], capacity = [], rels = [], i, rec, day;

  if (mods.sprints.on) {
    /* Каждая незавершённая роль — свой пункт; записи без dateEnd молчат. Легаси-запись без
       roleKey/roleLabel даёт пункт с params.role = null (подпись подставит фронт). */
    for (i = 0; i < history.length; i++) {
      rec = history[i];
      if (!rec || typeof rec !== 'object' || typeof rec.dateEnd !== 'number' || rec.status === 'FINISHED') continue;
      day = dayMs(rec.dateEnd);
      if (day > today) continue;
      sprints.push({
        id: 'sprints:' + rec.sprintId, module: 'sprints', kind: 'sprintRoleOpen', entityId: String(rec.sprintId),
        params: { sprint: rec.name || '', role: rec.roleLabel || rec.roleKey || null },
        days: daysSince(today, day), ref: { sprintId: baseId(rec.sprintId), roleKey: rec.roleKey || null },
        addressee: 'validator'
      });
    }
    /* ⚖16 О1 — слот с истёкшим dateEnd и без единой записи истории: один пункт на спринт. */
    if (sprint && typeof sprint.dateEnd === 'number' && sprint.sprintId && !firstHistoryOfBase(history, sprint.sprintId)) {
      day = dayMs(sprint.dateEnd);
      if (day <= today) {
        sprints.push({
          id: 'sprints:' + sprint.sprintId, module: 'sprints', kind: 'sprintSlotOver', entityId: String(sprint.sprintId),
          params: { sprint: sprint.name || '' },
          days: daysSince(today, day), ref: { sprintId: String(sprint.sprintId), roleKey: null },
          addressee: 'validator'
        });
      }
    }
  }

  if (mods.capacity.on && sprint && sprint.sprintId && typeof sprint.dateStart === 'number') {
    /* Не утверждена: записи нет / не approved / approved+dirty. Гаснет на следующий день после
       dateEnd (У1). Горизонт — за N дней до старта (N=0 → только с дня старта). */
    var start = dayMs(sprint.dateStart);
    var cap = capacityRecordOf(input.capacity, sprint.sprintId);
    var approved = !!(cap && cap.status === 'approved' && cap.dirty !== true);
    var over = typeof sprint.dateEnd === 'number' && today > dayMs(sprint.dateEnd);
    if (!approved && !over && today >= start - capacityDays(settings) * DAY_MS) {
      var d = daysSince(today, start);
      capacity.push({
        id: 'capacity:' + sprint.sprintId, module: 'capacity', kind: d > 0 ? 'capacityAfter' : 'capacityBefore',
        entityId: String(sprint.sprintId), params: { sprint: sprint.name || '' },
        days: d, ref: { sprintId: String(sprint.sprintId) }, addressee: 'settingsOrPlanning'
      });
    }
  }

  if (mods.releases.on) {
    /* plannedDate только number (строку не парсим — молчим, как release-view). В день даты уже
       активно (≤), в отличие от строгого бейджа «Просрочен» вкладки релизов. */
    for (i = 0; i < releases.length; i++) {
      rec = releases[i];
      if (!rec || typeof rec !== 'object' || typeof rec.plannedDate !== 'number' || !rec.id) continue;
      if (rec.status === 'released' || rec.status === 'cancelled') continue;
      day = dayMs(rec.plannedDate);
      if (day > today) continue;
      rels.push({
        id: 'releases:' + rec.id, module: 'releases', kind: 'releaseOverdue', entityId: String(rec.id),
        params: { release: rec.name || '', status: rec.status || null },
        days: daysSince(today, day), ref: { releaseId: String(rec.id) }, addressee: releaseAddressee(rec)
      });
    }
  }

  sprints.sort(byDaysThenName); capacity.sort(byDaysThenName); rels.sort(byDaysThenName);
  return { modules: mods, items: sprints.concat(capacity, rels) };
}

/**
 * explainResolved(record, { settings, sprint, history, capacity, releases, today }) → { how, by }
 * Чем погас пункт открытой записи журнала, которого нет среди активных (таблица спеки §4.4).
 * releases — актив (+ архив, если HTTP-слой его дочитал): терминальный статус ищется и там.
 */
function explainResolved(record, data) {
  var mods = modulesOn(data.settings);
  var m = record && record.module;
  if (!mods[m] || !mods[m].on) return { how: 'moduleOff', by: null };
  var today = data.today, eid = record.entityId;
  var sprint = data.sprint && typeof data.sprint === 'object' ? data.sprint : null;
  var history = Array.isArray(data.history) ? data.history : [];
  var rec;
  if (m === 'sprints') {
    if (record.kind === 'sprintSlotOver') {
      rec = firstHistoryOfBase(history, eid);
      if (rec) return { how: 'validated', by: rec.confirmedBy || null };
      if (sprint && sprint.sprintId === eid && typeof sprint.dateEnd === 'number' && dayMs(sprint.dateEnd) > today) return { how: 'dateMoved', by: null };
      return { how: 'gone', by: null };
    }
    rec = findHistory(history, eid);
    if (!rec) return { how: 'gone', by: null };
    if (rec.status === 'FINISHED') return { how: 'roleFinished', by: rec.finishedBy || null };
    if (typeof rec.dateEnd === 'number' && dayMs(rec.dateEnd) > today) return { how: 'dateMoved', by: null };
    return { how: 'gone', by: null };
  }
  if (m === 'capacity') {
    if (!sprint || sprint.sprintId !== eid) return { how: 'gone', by: null };
    var cap = capacityRecordOf(data.capacity, eid);
    if (cap && cap.status === 'approved' && cap.dirty !== true) return { how: 'capacityApproved', by: cap.approvedBy || null };
    if (typeof sprint.dateEnd === 'number' && today > dayMs(sprint.dateEnd)) return { how: 'sprintOver', by: null };
    if (typeof sprint.dateStart === 'number' && today < dayMs(sprint.dateStart) - capacityDays(data.settings) * DAY_MS) return { how: 'dateMoved', by: null };
    return { how: 'gone', by: null };
  }
  if (m === 'releases') {
    rec = findRelease(Array.isArray(data.releases) ? data.releases : [], eid);
    if (!rec) return { how: 'gone', by: null };
    if (rec.status === 'released' || rec.status === 'cancelled') return { how: rec.status, by: rec.updatedBy || null };
    if (typeof rec.plannedDate === 'number' && dayMs(rec.plannedDate) > today) return { how: 'dateMoved', by: null };
    return { how: 'gone', by: null };
  }
  return { how: 'gone', by: null };
}

exports.DAY_MS = DAY_MS;
exports.MODULES = MODULES;
exports.KINDS = KINDS;
exports.RESOLVED_HOW = RESOLVED_HOW;
exports.DEFAULTS = DEFAULTS;
exports.dayMs = dayMs;
exports.todayOf = todayOf;
exports.baseId = baseId;
exports.modulesOn = modulesOn;
exports.compute = compute;
exports.explainResolved = explainResolved;
