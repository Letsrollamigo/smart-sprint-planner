'use strict';
/* #112 «Напоминания» — вычислитель backend-reminders-calc.js (чистый, ноль require).
   Правила трёх модулей по таблице спеки §3.2, адресация §3.3, гашение §4.4, канон дня §1.
   Каждый негативный кейс отличается от валидного ровно одним значением, чтобы отказ
   нельзя было получить «за компанию». Запуск: node --test tests/unit/reminders-calc.test.js */

const test   = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');

const calc = require(path.join(__dirname, '..', '..', 'backend-reminders-calc.js'));
const DP   = require(path.join(__dirname, '..', '..', 'widgets', 'main', 'src', 'pure', 'date-pure.js'));

const DAY = 86400000;
const TODAY = Date.UTC(2026, 8, 9);           /* 2026-09-09 */
const d = (n) => TODAY + n * DAY;             /* день относительно «сегодня» */

const FULL = { remindersEnabled: true, capacityMode: 'full', releaseEnabled: true };
function run(over) {
  return calc.compute(Object.assign({ settings: FULL, sprint: null, history: [], capacity: {}, releases: [], today: TODAY }, over || {}));
}
/* пункты одного модуля — слот участвует и в спринтах (sprintSlotOver), и в ёмкости, тесты режут по модулю */
const only = (module, over) => run(over).items.filter((i) => i.module === module);
function hist(over) {
  return Object.assign({ sprintId: 'sp-1_devBack', name: 'Спринт 1', roleKey: 'devBack', roleLabel: 'Бэкенд', status: 'CONFIRMED', dateEnd: d(-3) }, over || {});
}
function slot(over) {
  return Object.assign({ sprintId: 'sp-cur', name: 'Текущий', dateStart: d(2), dateEnd: d(16) }, over || {});
}
function rel(over) {
  return Object.assign({ id: 'rel-1', name: 'Релиз 1', status: 'work', plannedDate: d(-1), roleReps: { manager: 'rm', engineer: 'ri' } }, over || {});
}

/* ── Канон дня ──────────────────────────────────────────────────────────────────────── */

test('#112 dayMs — паритет с pure/date-pure.dayMs на выборке (полночь, полдень UTC и +1 мс, локальные полуночи ±11 ч)', () => {
  const MAY18 = Date.UTC(2026, 4, 18);
  const samples = [MAY18, MAY18 + 12 * 3600000, MAY18 + 12 * 3600000 + 1, MAY18 - 11 * 3600000, MAY18 + 11 * 3600000,
    MAY18 - 3 * 3600000, MAY18 + 7 * 3600000, 0, 1789084800000, Date.UTC(2024, 1, 29, 23, 59, 59, 999)];
  for (const ts of samples) assert.equal(calc.dayMs(ts), DP.dayMs(ts), 'dayMs(' + ts + ')');
  /* assert обязан уметь падать (урок v3.34.1): полдень + 1 мс — уже следующий день, полдень — ещё тот же */
  assert.equal(calc.dayMs(MAY18 + 12 * 3600000), MAY18);
  assert.equal(calc.dayMs(MAY18 + 12 * 3600000 + 1), MAY18 + DAY);
  assert.equal(calc.dayMs(MAY18 - 11 * 3600000), MAY18);
});

test('#112 todayOf — «сегодня» из мгновения: UTC-пол, не dayMs (после 12:00 UTC dayMs дал бы завтра)', () => {
  const noon13 = Date.UTC(2026, 8, 9, 13, 0, 0);
  assert.equal(calc.todayOf(noon13), TODAY);
  assert.equal(calc.dayMs(noon13), TODAY + DAY, 'контрпример: dayMs мгновения после полудня — завтрашний день');
  assert.equal(calc.todayOf(Date.UTC(2026, 8, 9, 23, 59, 59, 999)), TODAY);
  assert.equal(calc.todayOf(TODAY), TODAY);
  assert.equal(calc.todayOf(Date.UTC(2026, 8, 9, 0, 0, 0, 1)), TODAY);
});

test('#112 baseId — режем по последнему «_» (легаси-id с подчёркиванием не склеивается)', () => {
  assert.equal(calc.baseId('uuid-1_devBack'), 'uuid-1');
  assert.equal(calc.baseId('legacy_id_analysis'), 'legacy_id');
  assert.equal(calc.baseId('sp-cur'), 'sp-cur');
  assert.equal(calc.baseId(''), '');
});

/* ── Модули: on = мастер ∧ тумблер ∧ доступность ──────────────────────────────────── */

test('#112 modulesOn — умолчания true при отсутствии ключей; мастер выкл → всё выкл; доступность гейтит', () => {
  assert.deepEqual(calc.modulesOn(FULL), { sprints: { on: true }, capacity: { on: true }, releases: { on: true } });
  assert.deepEqual(calc.modulesOn(Object.assign({}, FULL, { remindersEnabled: false })), { sprints: { on: false }, capacity: { on: false }, releases: { on: false } });
  assert.deepEqual(calc.modulesOn({}), { sprints: { on: false }, capacity: { on: false }, releases: { on: false } }, 'без мастера — выключено');
  assert.equal(calc.modulesOn(Object.assign({}, FULL, { capacityMode: 'light' })).capacity.on, false);
  assert.equal(calc.modulesOn(Object.assign({}, FULL, { releaseEnabled: false })).releases.on, false);
  assert.equal(calc.modulesOn(Object.assign({}, FULL, { remindersSprints: false })).sprints.on, false);
  assert.equal(calc.modulesOn(Object.assign({}, FULL, { remindersCapacity: false })).capacity.on, false);
  assert.equal(calc.modulesOn(Object.assign({}, FULL, { remindersReleases: false })).releases.on, false);
  assert.equal(calc.modulesOn(Object.assign({}, FULL, { remindersSprints: null })).sprints.on, true, 'null = умолчание');
});

test('#112 compute — мастер выключен: пунктов нет, modules все off', () => {
  const out = run({ settings: Object.assign({}, FULL, { remindersEnabled: false }), history: [hist()], sprint: slot(), releases: [rel()] });
  assert.equal(out.items.length, 0);
  assert.equal(out.modules.sprints.on, false);
});

/* ── Спринты ───────────────────────────────────────────────────────────────────────── */

test('#112 спринты — незавершённая роль после dateEnd: пункт, days, params, ref, адресат validator', () => {
  const out = run({ history: [hist()] });
  assert.equal(out.items.length, 1);
  const it = out.items[0];
  assert.equal(it.id, 'sprints:sp-1_devBack');
  assert.equal(it.module, 'sprints');
  assert.equal(it.kind, 'sprintRoleOpen');
  assert.equal(it.entityId, 'sp-1_devBack');
  assert.deepEqual(it.params, { sprint: 'Спринт 1', role: 'Бэкенд' });
  assert.equal(it.days, 3);
  assert.deepEqual(it.ref, { sprintId: 'sp-1', roleKey: 'devBack' });
  assert.equal(it.addressee, 'validator');
});

test('#112 спринты — FINISHED исключён; без dateEnd молчит; dateEnd завтра — нет; в день dateEnd — days 0 и активен', () => {
  assert.equal(run({ history: [hist({ status: 'FINISHED' })] }).items.length, 0);
  assert.equal(run({ history: [hist({ dateEnd: undefined })] }).items.length, 0);
  assert.equal(run({ history: [hist({ dateEnd: '2026-09-01' })] }).items.length, 0, 'строковый dateEnd — молчим');
  assert.equal(run({ history: [hist({ dateEnd: d(1) })] }).items.length, 0);
  const today = run({ history: [hist({ dateEnd: TODAY })] }).items;
  assert.equal(today.length, 1);
  assert.equal(today[0].days, 0);
  assert.equal(run({ history: [hist({ dateEnd: TODAY + 12 * 3600000 })] }).items[0].days, 0, 'полдень UTC поля «дата» — тот же день');
  assert.equal(run({ history: [hist({ status: undefined })] }).items.length, 1, 'отсутствующий статус = не завершён');
  assert.equal(run({ settings: Object.assign({}, FULL, { remindersSprints: false }), history: [hist()] }).items.length, 0);
});

test('#112 спринты — легаси-запись без roleKey/roleLabel: пункт есть, params.role === null (не undefined), ref.roleKey null', () => {
  const it = run({ history: [hist({ sprintId: 'legacy-7', roleKey: undefined, roleLabel: undefined })] }).items[0];
  assert.ok(it);
  assert.equal(it.params.role, null);
  assert.ok('role' in it.params, 'ключ role присутствует со значением null');
  assert.equal(it.ref.roleKey, null);
  assert.equal(it.ref.sprintId, 'legacy-7');
  assert.equal(run({ history: [hist({ roleLabel: undefined })] }).items[0].params.role, 'devBack', 'без ярлыка — roleKey');
});

test('#112 спринты — каждая запись = свой пункт; слот с истёкшим dateEnd и без записей истории даёт один sprintSlotOver', () => {
  const two = run({ history: [hist(), hist({ sprintId: 'sp-1_analysis', roleKey: 'analysis', roleLabel: 'Аналитика' })] }).items;
  assert.equal(two.length, 2);
  const over = run({ sprint: slot({ dateEnd: d(-2) }) }).items;
  assert.equal(over.length, 1);
  assert.equal(over[0].kind, 'sprintSlotOver');
  assert.equal(over[0].entityId, 'sp-cur');
  assert.equal(over[0].id, 'sprints:sp-cur');
  assert.deepEqual(over[0].params, { sprint: 'Текущий' });
  assert.deepEqual(over[0].ref, { sprintId: 'sp-cur', roleKey: null });
  assert.equal(over[0].days, 2);
  assert.equal(over[0].addressee, 'validator');
});

test('#112 спринты — слот с записями истории по его базовому id пунктом sprintSlotOver не считается; слот с dateEnd в будущем — нет', () => {
  const withHist = run({ sprint: slot({ dateEnd: d(-2) }), history: [hist({ sprintId: 'sp-cur_devBack', dateEnd: d(-2) })] }).items;
  assert.equal(withHist.length, 1);
  assert.equal(withHist[0].kind, 'sprintRoleOpen', 'за слот отвечают записи ролей');
  assert.equal(only('sprints', { sprint: slot({ dateEnd: d(1) }) }).length, 0);
  assert.equal(only('sprints', { sprint: slot({ dateEnd: undefined }) }).length, 0);
  assert.equal(only('sprints', { sprint: slot({ dateEnd: d(-2) }), history: [hist({ sprintId: 'sp-cur_devBack', status: 'FINISHED', dateEnd: d(-2) })] }).length, 0,
    'все роли завершены — ни sprintRoleOpen, ни sprintSlotOver');
});

/* ── Ёмкость ───────────────────────────────────────────────────────────────────────── */

test('#112 ёмкость — горизонт N дней (умолчание 3): старт через 3 дня активен (before, days −3), через 4 — нет', () => {
  const on = run({ sprint: slot({ dateStart: d(3) }) }).items;
  assert.equal(on.length, 1);
  assert.equal(on[0].module, 'capacity');
  assert.equal(on[0].kind, 'capacityBefore');
  assert.equal(on[0].days, -3);
  assert.equal(on[0].entityId, 'sp-cur');
  assert.equal(on[0].id, 'capacity:sp-cur');
  assert.deepEqual(on[0].params, { sprint: 'Текущий' });
  assert.deepEqual(on[0].ref, { sprintId: 'sp-cur' });
  assert.equal(on[0].addressee, 'settingsOrPlanning');
  assert.equal(run({ sprint: slot({ dateStart: d(4) }) }).items.length, 0);
});

test('#112 ёмкость — N настраиваемо: N=0 только с дня старта; N=10 — за десять; в день старта days 0 и kind before; после старта — after', () => {
  const n0 = Object.assign({}, FULL, { remindersCapacityDays: 0 });
  assert.equal(run({ settings: n0, sprint: slot({ dateStart: d(1) }) }).items.length, 0);
  const startToday = run({ settings: n0, sprint: slot({ dateStart: TODAY }) }).items;
  assert.equal(startToday.length, 1);
  assert.equal(startToday[0].days, 0);
  assert.equal(startToday[0].kind, 'capacityBefore');
  const n10 = Object.assign({}, FULL, { remindersCapacityDays: 10 });
  assert.equal(run({ settings: n10, sprint: slot({ dateStart: d(10) }) }).items.length, 1);
  assert.equal(run({ settings: n10, sprint: slot({ dateStart: d(11) }) }).items.length, 0);
  const after = run({ sprint: slot({ dateStart: d(-2), dateEnd: d(12) }) }).items;
  assert.equal(after[0].kind, 'capacityAfter');
  assert.equal(after[0].days, 2);
});

test('#112 ёмкость — не утверждена: записи нет / draft / approved+dirty; approved без dirty — гаснет', () => {
  const s = slot({ dateStart: d(1) });
  assert.equal(run({ sprint: s, capacity: {} }).items.length, 1, 'записи нет');
  assert.equal(run({ sprint: s, capacity: { 'sp-cur': { status: 'draft', dirty: false } } }).items.length, 1, 'draft');
  assert.equal(run({ sprint: s, capacity: { 'sp-cur': { status: 'approved', dirty: true } } }).items.length, 1, 'approved+dirty');
  assert.equal(run({ sprint: s, capacity: { 'sp-cur': { status: 'approved', dirty: false } } }).items.length, 0, 'approved');
  assert.equal(run({ sprint: s, capacity: { 'sp-cur': { status: 'approved' } } }).items.length, 0, 'approved без dirty-ключа');
});

test('#112 ёмкость — гаснет на следующий день после dateEnd (У1); в день dateEnd ещё активна; capacityMode light → модуль off', () => {
  assert.equal(only('capacity', { sprint: slot({ dateStart: d(-10), dateEnd: d(-1) }) }).length, 0);
  assert.equal(only('sprints', { sprint: slot({ dateStart: d(-10), dateEnd: d(-1) }) }).length, 1, 'тот же слот — уже sprintSlotOver');
  assert.equal(only('capacity', { sprint: slot({ dateStart: d(-10), dateEnd: TODAY }) }).length, 1);
  assert.equal(only('capacity', { sprint: slot({ dateStart: d(-10), dateEnd: undefined }) }).length, 1, 'без dateEnd — не истёк');
  const light = run({ settings: Object.assign({}, FULL, { capacityMode: 'light' }), sprint: slot({ dateStart: d(1) }) });
  assert.equal(light.items.length, 0);
  assert.equal(light.modules.capacity.on, false);
  assert.equal(run({ settings: Object.assign({}, FULL, { remindersCapacity: false }), sprint: slot({ dateStart: d(1) }) }).items.length, 0);
  assert.equal(run({ sprint: slot({ dateStart: undefined }) }).items.length, 0, 'без dateStart молчим');
  assert.equal(run({ sprint: slot({ sprintId: '__proto__', dateStart: d(1) }), capacity: {} }).items.length, 1, '__proto__ не даёт фантомной записи и не роняет');
});

/* ── Релизы ────────────────────────────────────────────────────────────────────────── */

test('#112 релизы — plannedDate наступила (≤ today): вчера days 1, сегодня days 0 активен, завтра — нет', () => {
  const y = run({ releases: [rel()] }).items;
  assert.equal(y.length, 1);
  assert.equal(y[0].module, 'releases');
  assert.equal(y[0].kind, 'releaseOverdue');
  assert.equal(y[0].id, 'releases:rel-1');
  assert.equal(y[0].entityId, 'rel-1');
  assert.equal(y[0].days, 1);
  assert.deepEqual(y[0].params, { release: 'Релиз 1', status: 'work' });
  assert.deepEqual(y[0].ref, { releaseId: 'rel-1' });
  assert.equal(run({ releases: [rel({ plannedDate: TODAY })] }).items[0].days, 0, 'в день даты уже активно (не строгий бейдж вкладки)');
  assert.equal(run({ releases: [rel({ plannedDate: d(1) })] }).items.length, 0);
});

test('#112 релизы — строковый plannedDate молчит; released/cancelled не считаются; без статуса — считается, params.status null', () => {
  assert.equal(run({ releases: [rel({ plannedDate: '2026-09-01' })] }).items.length, 0);
  assert.equal(run({ releases: [rel({ plannedDate: undefined })] }).items.length, 0);
  assert.equal(run({ releases: [rel({ status: 'released' })] }).items.length, 0);
  assert.equal(run({ releases: [rel({ status: 'cancelled' })] }).items.length, 0);
  const noStatus = run({ releases: [rel({ status: undefined })] }).items;
  assert.equal(noStatus.length, 1);
  assert.equal(noStatus[0].params.status, null);
  assert.equal(run({ settings: Object.assign({}, FULL, { releaseEnabled: false }), releases: [rel()] }).items.length, 0);
  assert.equal(run({ settings: Object.assign({}, FULL, { remindersReleases: false }), releases: [rel()] }).items.length, 0);
});

test('#112 релизы — адресация: логины представителей (дедуп, пустые выкинуты) + orValidator', () => {
  assert.deepEqual(run({ releases: [rel()] }).items[0].addressee, { logins: ['rm', 'ri'], orValidator: true });
  assert.deepEqual(run({ releases: [rel({ roleReps: { manager: 'x', engineer: 'x' } })] }).items[0].addressee, { logins: ['x'], orValidator: true });
  assert.deepEqual(run({ releases: [rel({ roleReps: { manager: '', engineer: null } })] }).items[0].addressee, { logins: [], orValidator: true });
  assert.deepEqual(run({ releases: [rel({ roleReps: undefined })] }).items[0].addressee, { logins: [], orValidator: true });
});

/* ── Порядок ───────────────────────────────────────────────────────────────────────── */

test('#112 порядок — модули Спринты → Ёмкость → Релизы; внутри модуля days убыв., затем имя', () => {
  const out = run({
    history: [hist({ sprintId: 'b_devBack', name: 'Б', dateEnd: d(-1) }), hist({ sprintId: 'a_devBack', name: 'А', dateEnd: d(-1) }), hist({ sprintId: 'c_devBack', name: 'В', dateEnd: d(-5) })],
    sprint: slot({ dateStart: d(1) }),
    releases: [rel({ id: 'r2', name: 'Я', plannedDate: d(-1) }), rel({ id: 'r1', name: 'А', plannedDate: d(-1) }), rel({ id: 'r3', name: 'Б', plannedDate: TODAY })]
  });
  assert.deepEqual(out.items.map((i) => i.id),
    ['sprints:c_devBack', 'sprints:a_devBack', 'sprints:b_devBack', 'capacity:sp-cur', 'releases:r1', 'releases:r2', 'releases:r3']);
});

/* ── explainResolved ───────────────────────────────────────────────────────────────── */

const D = (over) => Object.assign({ settings: FULL, sprint: null, history: [], capacity: {}, releases: [], today: TODAY }, over || {});
const R = (module, kind, entityId) => ({ id: module + ':' + entityId + ':' + d(-1), module, kind, entityId, params: {}, firedDay: d(-1), resolvedDay: null, resolvedHow: null, resolvedBy: null });

test('#112 explainResolved — moduleOff: тумблер или недоступность модуля', () => {
  assert.deepEqual(calc.explainResolved(R('sprints', 'sprintRoleOpen', 'sp-1_devBack'), D({ settings: Object.assign({}, FULL, { remindersSprints: false }) })), { how: 'moduleOff', by: null });
  assert.deepEqual(calc.explainResolved(R('capacity', 'capacityBefore', 'sp-cur'), D({ settings: Object.assign({}, FULL, { capacityMode: 'light' }) })), { how: 'moduleOff', by: null });
  assert.deepEqual(calc.explainResolved(R('releases', 'releaseOverdue', 'rel-1'), D({ settings: Object.assign({}, FULL, { releaseEnabled: false }) })), { how: 'moduleOff', by: null });
});

test('#112 explainResolved — спринты: roleFinished (finishedBy), dateMoved, gone; слот: validated (confirmedBy), dateMoved, gone', () => {
  const rec = R('sprints', 'sprintRoleOpen', 'sp-1_devBack');
  assert.deepEqual(calc.explainResolved(rec, D({ history: [hist({ status: 'FINISHED', finishedBy: 'val1' })] })), { how: 'roleFinished', by: 'val1' });
  assert.deepEqual(calc.explainResolved(rec, D({ history: [hist({ status: 'FINISHED' })] })), { how: 'roleFinished', by: null }, 'finishedBy может быть пустым');
  assert.deepEqual(calc.explainResolved(rec, D({ history: [hist({ dateEnd: d(5) })] })), { how: 'dateMoved', by: null });
  assert.deepEqual(calc.explainResolved(rec, D({ history: [] })), { how: 'gone', by: null });
  const over = R('sprints', 'sprintSlotOver', 'sp-cur');
  assert.deepEqual(calc.explainResolved(over, D({ sprint: slot({ dateEnd: d(-2) }), history: [hist({ sprintId: 'sp-cur_devBack', confirmedBy: 'val2' })] })), { how: 'validated', by: 'val2' });
  assert.deepEqual(calc.explainResolved(over, D({ sprint: null, history: [hist({ sprintId: 'sp-cur_devBack', confirmedBy: 'val2' })] })), { how: 'validated', by: 'val2' }, 'слот ушёл в историю');
  assert.deepEqual(calc.explainResolved(over, D({ sprint: slot({ dateEnd: d(3) }) })), { how: 'dateMoved', by: null });
  assert.deepEqual(calc.explainResolved(over, D({ sprint: slot({ sprintId: 'sp-next', dateEnd: d(-2) }) })), { how: 'gone', by: null }, 'слот заменён');
});

test('#112 explainResolved — ёмкость: capacityApproved (approvedBy), sprintOver, dateMoved, gone', () => {
  const rec = R('capacity', 'capacityBefore', 'sp-cur');
  assert.deepEqual(calc.explainResolved(rec, D({ sprint: slot({ dateStart: d(1) }), capacity: { 'sp-cur': { status: 'approved', dirty: false, approvedBy: 'pm' } } })), { how: 'capacityApproved', by: 'pm' });
  assert.deepEqual(calc.explainResolved(rec, D({ sprint: slot({ dateStart: d(-10), dateEnd: d(-1) }) })), { how: 'sprintOver', by: null });
  assert.deepEqual(calc.explainResolved(rec, D({ sprint: slot({ dateStart: d(20), dateEnd: d(30) }) })), { how: 'dateMoved', by: null });
  assert.deepEqual(calc.explainResolved(rec, D({ sprint: slot({ sprintId: 'sp-next', dateStart: d(1) }) })), { how: 'gone', by: null });
  assert.deepEqual(calc.explainResolved(rec, D({ sprint: null })), { how: 'gone', by: null });
});

test('#112 explainResolved — релизы: released/cancelled (updatedBy), dateMoved, gone; терминальный статус ищется и в переданном архиве', () => {
  const rec = R('releases', 'releaseOverdue', 'rel-1');
  assert.deepEqual(calc.explainResolved(rec, D({ releases: [rel({ status: 'released', updatedBy: 'rm' })] })), { how: 'released', by: 'rm' });
  assert.deepEqual(calc.explainResolved(rec, D({ releases: [rel({ status: 'cancelled', updatedBy: 'rm' })] })), { how: 'cancelled', by: 'rm' });
  assert.deepEqual(calc.explainResolved(rec, D({ releases: [rel({ plannedDate: d(4) })] })), { how: 'dateMoved', by: null });
  assert.deepEqual(calc.explainResolved(rec, D({ releases: [] })), { how: 'gone', by: null });
  assert.deepEqual(calc.explainResolved(rec, D({ releases: [rel({ id: 'other' }), rel({ status: 'released', updatedBy: 'arch' })] })), { how: 'released', by: 'arch' });
});
