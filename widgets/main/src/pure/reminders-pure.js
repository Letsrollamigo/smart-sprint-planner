/* widgets/main/src/pure/reminders-pure.js
   #112 «Напоминания» — чистая логика фронта: показывать ли модалку при загрузке, штамп
   «показано сегодня», VM модалки из ответа GET reminders, подпись дней, адрес «Перейти»,
   состояние колокольчика, умолчания и клампы раздела настроек «Уведомления».
   Публикует window.__SSP_REMINDERS_PURE ДО исполнения IIFE core.js (паттерн share-url-pure).
   Без DOM, стейта и host; «сегодня» приходит от сервера (resp.today) — клиент день не считает. */
'use strict';

var MODULE_ORDER = ['sprints', 'capacity', 'releases'];
var SECTION_KEY = { sprints: 'remSectionSprints', capacity: 'remSectionCapacity', releases: 'remSectionReleases' };
var KIND_KEY = {
  sprintRoleOpen: 'remSprintRoleOpen', sprintSlotOver: 'remSprintSlotOver',
  capacityBefore: 'remCapacityBefore', capacityAfter: 'remCapacityAfter', releaseOverdue: 'remReleaseOverdue'
};
/* Ярлыки статусов релиза — те же ключи, что у вкладки релизов (release-view.js:101). */
var STATUS_KEY = { planned: 'relStatusPlanned', prep: 'relStatusPrep', work: 'relStatusWork', released: 'relStatusReleased', cancelled: 'relStatusCancelled' };

function _has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
/* Подстановка данных пользователя: функция-замена, иначе String.replace трактует «$&»/«$1» в имени спринта. */
function _sub(tpl, ph, val) { return tpl.replace(ph, function () { return val; }); }

/* enabled ∧ count > 0 ∧ (режим «при каждом открытии» ∨ штамп проекта ≠ сегодня). */
function shouldOpenOnLoad(a) {
  a = a || {};
  if (!a.enabled || !(a.count > 0)) return false;
  if (a.mode === 'always') return true;
  var st = (a.stamp && typeof a.stamp === 'object') ? a.stamp : {};
  return st[a.projectKey] !== a.today;
}

/* Штамп user-prefs { <projectKey>: <today ms> }: чужие дни выкидываются — размер не растёт. */
function nextStamp(stamp, projectKey, today) {
  var out = {};
  if (stamp && typeof stamp === 'object') {
    for (var k in stamp) if (_has(stamp, k) && stamp[k] === today) out[k] = today;
  }
  out[projectKey] = today;
  return out;
}

function parseStamp(raw) {
  try { var v = JSON.parse(raw); return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}; } catch (_) { return {}; }
}

/* < 0 → «через N дн.», 0 → «сегодня», > 0 → «N дн. назад» (склонений нет — «дн.» инвариантно). */
function daysLabel(days, T) {
  var n = Number(days) || 0;
  if (n < 0) return T('remDaysIn').replace('{n}', String(-n));
  if (n === 0) return T('remDaysToday');
  return T('remDaysAgo').replace('{n}', String(n));
}

function statusLabel(code, T) { return _has(STATUS_KEY, code) ? T(STATUS_KEY[code]) : (code || ''); }

/* Текст пункта режется по {days} на pre/post — выделенный счётчик дней рисует React отдельным span. */
function itemText(item, T) {
  var p = item.params || {};
  var tpl = T(KIND_KEY[item.kind] || item.kind);
  tpl = _sub(tpl, '{sprint}', p.sprint || '');
  tpl = _sub(tpl, '{role}', p.role || T('remRoleUnknown'));
  tpl = _sub(tpl, '{release}', p.release || '');
  tpl = _sub(tpl, '{status}', statusLabel(p.status, T));
  var i = tpl.indexOf('{days}');
  return i < 0 ? { pre: tpl, post: '' } : { pre: tpl.slice(0, i), post: tpl.slice(i + 6) };
}

/* Ответ GET reminders → { count, sections:[{module,title,items:[{id,module,kind,entityId,pre,days,post,ref}]}] }.
   Секции в порядке ⚖6, пустые не попадают; порядок пунктов внутри — серверный. */
function buildVm(resp, T) {
  var items = (resp && Array.isArray(resp.items)) ? resp.items : [];
  var by = {};
  items.forEach(function (it) { if (it && it.module) (by[it.module] = by[it.module] || []).push(it); });
  var sections = [];
  MODULE_ORDER.forEach(function (m) {
    var list = by[m];
    if (!list || !list.length) return;
    sections.push({
      module: m,
      title: T(SECTION_KEY[m]).replace('{n}', String(list.length)),
      items: list.map(function (it) {
        var t = itemText(it, T);
        return { id: it.id, module: m, kind: it.kind, entityId: it.entityId, pre: t.pre, days: daysLabel(it.days, T), post: t.post, ref: it.ref || {} };
      })
    });
  });
  return { count: items.length, sections: sections };
}

/* Адрес «Перейти» (спека §5.5): история → узел + focus hist:<id>; слот без согласования → роли слота;
   ёмкость → слот; релиз → узел планируемых + focus release:<id>. */
function navTarget(item) {
  if (!item) return null;
  var ref = item.ref || {};
  if (item.module === 'sprints') {
    if (item.kind === 'sprintSlotOver') return { node: 'planning-roles', sprintId: ref.sprintId || null };
    return { node: 'history', focus: 'hist:' + item.entityId };
  }
  if (item.module === 'capacity') return { node: 'capacity', sprintId: ref.sprintId || null };
  if (item.module === 'releases') return { node: 'release-planned', focus: 'release:' + item.entityId };
  return null;
}

/* Колокольчик виден, если мастер включён и хотя бы один включённый модуль адресован мне (⚖7);
   при мастере выкл сервер отдаёт modules:{} — переживаем отсутствие ключей. */
function bellState(resp) {
  if (!resp || resp.success === false || !resp.enabled) return { visible: false, count: 0 };
  var mods = resp.modules || {}, visible = false;
  MODULE_ORDER.forEach(function (m) { var s = mods[m]; if (s && s.on && s.addressee) visible = true; });
  return { visible: visible, count: visible ? (Number(resp.count) || 0) : 0 };
}

/* Раздел настроек: хранимые ключи ↔ стейт формы. Умолчания = вычислителя (отсутствие ключа): мастер выкл (⚖9),
   модули вкл, «раз в день», 3 дня. Обратно — клампы бэкенда (bool ×4, enum, целое 0..30): отказ валидатора
   роняет ВЕСЬ сейв настроек, поэтому мусор из NumField до сервера не доходит. */
function settingsToForm(s) {
  s = s || {};
  return {
    enabled: s.remindersEnabled === true,
    sprints: s.remindersSprints !== false,
    capacity: s.remindersCapacity !== false,
    releases: s.remindersReleases !== false,
    mode: s.remindersModalMode === 'always' ? 'always' : 'daily',
    days: (typeof s.remindersCapacityDays === 'number' && isFinite(s.remindersCapacityDays)) ? s.remindersCapacityDays : 3
  };
}

function formToSettings(f) {
  f = f || {};
  var d = Math.round(parseFloat(f.days));
  if (!isFinite(d)) d = 3;
  d = Math.min(30, Math.max(0, d));
  return {
    remindersEnabled: f.enabled === true,
    remindersSprints: f.sprints !== false,
    remindersCapacity: f.capacity !== false,
    remindersReleases: f.releases !== false,
    remindersModalMode: f.mode === 'always' ? 'always' : 'daily',
    remindersCapacityDays: d
  };
}

var _api = {
  shouldOpenOnLoad: shouldOpenOnLoad,
  nextStamp: nextStamp,
  parseStamp: parseStamp,
  daysLabel: daysLabel,
  statusLabel: statusLabel,
  itemText: itemText,
  buildVm: buildVm,
  navTarget: navTarget,
  bellState: bellState,
  settingsToForm: settingsToForm,
  formToSettings: formToSettings,
  MODULE_ORDER: MODULE_ORDER
};

if (typeof window !== 'undefined') {
  try { window.__SSP_REMINDERS_PURE = _api; } catch (_) { /* sandboxed write may throw */ }
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = _api;
}
