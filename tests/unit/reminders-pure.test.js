'use strict';
/* #112 «Напоминания» — чистая логика фронта pure/reminders-pure.js (спека §5.2, §5.7).
   Каждый негативный кейс отличается от валидного ровно одним значением.
   Запуск: node --test tests/unit/reminders-pure.test.js */

const test   = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');

const P = require(path.join(__dirname, '..', '..', 'widgets', 'main', 'src', 'pure', 'reminders-pure.js'));
const ru = require(path.join(__dirname, '..', '..', 'widgets', 'main', 'i18n', 'ru.json'));
const T = (k) => (Object.prototype.hasOwnProperty.call(ru, k) ? ru[k] : k);

const DAY = 86400000;
const TODAY = Date.UTC(2026, 8, 9);

function item(over) {
  return Object.assign({ id: 'sprints:sp-1_devBack', module: 'sprints', kind: 'sprintRoleOpen', entityId: 'sp-1_devBack',
    params: { sprint: 'Спринт 1', role: 'Бэкенд' }, days: 3, ref: { sprintId: 'sp-1', roleKey: 'devBack' } }, over || {});
}
function resp(over) {
  return Object.assign({ success: true, enabled: true, today: TODAY, count: 1, items: [item()],
    modules: { sprints: { on: true, addressee: true }, capacity: { on: true, addressee: true }, releases: { on: true, addressee: false } } }, over || {});
}

/* ── shouldOpenOnLoad — 4 комбинации режима × штампа + гейты enabled/count ── */
test('shouldOpenOnLoad: daily — открываем, если штампа проекта за сегодня нет', () => {
  const base = { enabled: true, count: 2, mode: 'daily', today: TODAY, projectKey: 'GM' };
  assert.equal(P.shouldOpenOnLoad(Object.assign({ stamp: {} }, base)), true);
  assert.equal(P.shouldOpenOnLoad(Object.assign({ stamp: { GM: TODAY - DAY } }, base)), true);   /* вчерашний штамп */
  assert.equal(P.shouldOpenOnLoad(Object.assign({ stamp: { OTHER: TODAY } }, base)), true);     /* чужой проект */
  assert.equal(P.shouldOpenOnLoad(Object.assign({ stamp: { GM: TODAY } }, base)), false);
});
test('shouldOpenOnLoad: always — штамп не учитывается', () => {
  const base = { enabled: true, count: 1, mode: 'always', today: TODAY, projectKey: 'GM' };
  assert.equal(P.shouldOpenOnLoad(Object.assign({ stamp: { GM: TODAY } }, base)), true);
  assert.equal(P.shouldOpenOnLoad(Object.assign({ stamp: {} }, base)), true);
});
test('shouldOpenOnLoad: мастер выкл или ноль пунктов → не открываем (в любом режиме)', () => {
  assert.equal(P.shouldOpenOnLoad({ enabled: false, count: 3, mode: 'always', today: TODAY, projectKey: 'GM', stamp: {} }), false);
  assert.equal(P.shouldOpenOnLoad({ enabled: true, count: 0, mode: 'always', today: TODAY, projectKey: 'GM', stamp: {} }), false);
  assert.equal(P.shouldOpenOnLoad(null), false);
});

/* ── nextStamp / parseStamp ── */
test('nextStamp: прунинг чужих дней, свой проект = сегодня', () => {
  assert.deepEqual(P.nextStamp({ A: TODAY, B: TODAY - DAY, C: 'junk' }, 'GM', TODAY), { A: TODAY, GM: TODAY });
  assert.deepEqual(P.nextStamp(null, 'GM', TODAY), { GM: TODAY });
  assert.deepEqual(P.nextStamp({ GM: TODAY - DAY }, 'GM', TODAY), { GM: TODAY });
});
test('parseStamp: мусор/массив/null → {}', () => {
  assert.deepEqual(P.parseStamp('{"GM":1}'), { GM: 1 });
  assert.deepEqual(P.parseStamp('[1]'), {});
  assert.deepEqual(P.parseStamp('not json'), {});
  assert.deepEqual(P.parseStamp(null), {});
});

/* ── daysLabel ── */
test('daysLabel: знак дней → «через N дн.» / «сегодня» / «N дн. назад»', () => {
  assert.equal(P.daysLabel(-2, T), 'через 2 дн.');
  assert.equal(P.daysLabel(0, T), 'сегодня');
  assert.equal(P.daysLabel(5, T), '5 дн. назад');
  assert.equal(P.daysLabel(undefined, T), 'сегодня');
});

/* ── buildVm ── */
test('buildVm: секции в порядке Спринты → Ёмкость → Релизы, пустые выкинуты, заголовки с (N)', () => {
  const vm = P.buildVm(resp({ count: 3, items: [
    item({ id: 'releases:rel-1', module: 'releases', kind: 'releaseOverdue', entityId: 'rel-1', params: { release: 'R1', status: 'work' }, days: 0, ref: { releaseId: 'rel-1' } }),
    item(), item({ id: 'sprints:sp-1_qa', entityId: 'sp-1_qa', params: { sprint: 'Спринт 1', role: 'QA' } }),
  ] }), T);
  assert.equal(vm.count, 3);
  assert.deepEqual(vm.sections.map((s) => s.module), ['sprints', 'releases']);
  assert.equal(vm.sections[0].title, 'Спринты (2)');
  assert.equal(vm.sections[1].title, 'Релизы (1)');
});
test('buildVm: текст режется по {days} на pre/days/post, подстановки sprint/role', () => {
  const it = P.buildVm(resp(), T).sections[0].items[0];
  assert.equal(it.pre, 'Спринт «Спринт 1» закончился ');
  assert.equal(it.days, '3 дн. назад');
  assert.equal(it.post, ', роль «Бэкенд» не завершена.');
  assert.equal(it.id, 'sprints:sp-1_devBack');
  assert.deepEqual(it.ref, { sprintId: 'sp-1', roleKey: 'devBack' });
});
test('buildVm: статус релиза → ярлык relStatus*, неизвестный код — как есть', () => {
  const rel = (status) => P.buildVm(resp({ items: [item({ module: 'releases', kind: 'releaseOverdue', params: { release: 'R1', status }, days: 5 })] }), T).sections[0].items[0];
  assert.equal(rel('work').post, ', статус «В работе».');
  assert.equal(rel('prep').post, ', статус «Подготовка».');
  assert.equal(rel('weird').post, ', статус «weird».');
});
test('buildVm: легаси-запись без роли → «роль не указана», строка «undefined» запрещена', () => {
  const it = P.buildVm(resp({ items: [item({ params: { sprint: 'S', role: null } })] }), T).sections[0].items[0];
  assert.equal(it.post, ', роль «роль не указана» не завершена.');
  assert.ok(!/undefined|null/.test(it.pre + it.post));
});
test('buildVm: «$&» в имени спринта не разворачивается (функция-замена)', () => {
  const it = P.buildVm(resp({ items: [item({ params: { sprint: 'Q3 $& $1', role: 'R' } })] }), T).sections[0].items[0];
  assert.equal(it.pre, 'Спринт «Q3 $& $1» закончился ');
});
test('buildVm: kind ёмкости before/after и sprintSlotOver берут свои шаблоны', () => {
  const one = (over) => P.buildVm(resp({ items: [item(over)] }), T).sections[0].items[0];
  assert.equal(one({ module: 'capacity', kind: 'capacityBefore', params: { sprint: 'S' }, days: -2 }).pre, 'Старт спринта «S» ');
  assert.equal(one({ module: 'capacity', kind: 'capacityAfter', params: { sprint: 'S' }, days: 1 }).pre, 'Спринт «S» стартовал ');
  assert.equal(one({ kind: 'sprintSlotOver', params: { sprint: 'S' } }).post, ', ни одна роль не согласована.');
});
test('buildVm: пустой/битый ответ → count 0, секций нет', () => {
  assert.deepEqual(P.buildVm(null, T), { count: 0, sections: [] });
  assert.deepEqual(P.buildVm({ items: 'junk' }, T), { count: 0, sections: [] });
});

/* ── navTarget (§5.5) ── */
test('navTarget: роль спринта → история + focus hist:<sprintId записи>, спринт не переключаем', () => {
  assert.deepEqual(P.navTarget(item()), { node: 'history', focus: 'hist:sp-1_devBack' });
});
test('navTarget: sprintSlotOver → роли слота с выбором спринта', () => {
  assert.deepEqual(P.navTarget(item({ kind: 'sprintSlotOver', entityId: 'sp-cur', ref: { sprintId: 'sp-cur', roleKey: null } })), { node: 'planning-roles', sprintId: 'sp-cur' });
});
test('navTarget: ёмкость → узел capacity с выбором спринта; релиз → release-planned + focus release:<id>', () => {
  assert.deepEqual(P.navTarget(item({ module: 'capacity', kind: 'capacityBefore', entityId: 'sp-cur', ref: { sprintId: 'sp-cur' } })), { node: 'capacity', sprintId: 'sp-cur' });
  assert.deepEqual(P.navTarget(item({ module: 'releases', kind: 'releaseOverdue', entityId: 'rel-1', ref: { releaseId: 'rel-1' } })), { node: 'release-planned', focus: 'release:rel-1' });
  assert.equal(P.navTarget(item({ module: 'other' })), null);
  assert.equal(P.navTarget(null), null);
});

/* ── bellState (⚖7) ── */
test('bellState: виден, если хоть один включённый модуль адресован мне; бейдж = count', () => {
  assert.deepEqual(P.bellState(resp({ count: 3 })), { visible: true, count: 3 });
  assert.deepEqual(P.bellState(resp({ count: 0 })), { visible: true, count: 0 });
});
test('bellState: ни один включённый модуль не адресован → скрыт (on без addressee, addressee без on)', () => {
  const mods = { sprints: { on: true, addressee: false }, capacity: { on: false, addressee: true }, releases: { on: true, addressee: false } };
  assert.deepEqual(P.bellState(resp({ modules: mods })), { visible: false, count: 0 });
});
test('bellState: мастер выкл (modules:{}), success:false, null → скрыт', () => {
  assert.deepEqual(P.bellState({ success: true, enabled: false, count: 0, items: [], modules: {} }), { visible: false, count: 0 });
  assert.deepEqual(P.bellState({ success: false }), { visible: false, count: 0 });
  assert.deepEqual(P.bellState(null), { visible: false, count: 0 });
});

/* ── настройки: умолчания и клампы (§2.1, §5.7) ── */
test('settingsToForm: отсутствие ключей = умолчания вычислителя (мастер выкл, модули вкл, daily, 3)', () => {
  assert.deepEqual(P.settingsToForm({}), { enabled: false, sprints: true, capacity: true, releases: true, mode: 'daily', days: 3 });
  assert.deepEqual(P.settingsToForm(null).days, 3);
  assert.equal(P.settingsToForm({ remindersCapacityDays: null }).days, 3);   /* null — не 0 */
});
test('settingsToForm: хранимые значения проходят как есть', () => {
  const f = P.settingsToForm({ remindersEnabled: true, remindersSprints: false, remindersCapacity: false, remindersReleases: false, remindersModalMode: 'always', remindersCapacityDays: 7 });
  assert.deepEqual(f, { enabled: true, sprints: false, capacity: false, releases: false, mode: 'always', days: 7 });
});
test('formToSettings: шесть ключей, целое 0..30 с округлением, мусор → 3, enum → daily', () => {
  const s = P.formToSettings({ enabled: true, sprints: true, capacity: false, releases: true, mode: 'always', days: '5' });
  assert.deepEqual(s, { remindersEnabled: true, remindersSprints: true, remindersCapacity: false, remindersReleases: true, remindersModalMode: 'always', remindersCapacityDays: 5 });
  assert.equal(P.formToSettings({ days: '' }).remindersCapacityDays, 3);
  assert.equal(P.formToSettings({ days: 'abc' }).remindersCapacityDays, 3);
  assert.equal(P.formToSettings({ days: 99 }).remindersCapacityDays, 30);
  assert.equal(P.formToSettings({ days: -4 }).remindersCapacityDays, 0);
  assert.equal(P.formToSettings({ days: 2.6 }).remindersCapacityDays, 3);
  assert.equal(P.formToSettings({ mode: 'weird' }).remindersModalMode, 'daily');
  assert.equal(Object.keys(P.formToSettings({})).length, 6);
});
test('round-trip: settingsToForm ∘ formToSettings сохраняет хранимые значения', () => {
  const stored = { remindersEnabled: true, remindersSprints: false, remindersCapacity: true, remindersReleases: false, remindersModalMode: 'daily', remindersCapacityDays: 0 };
  assert.deepEqual(P.formToSettings(P.settingsToForm(stored)), stored);
});

/* ── журнал (S5, §5.6) ── */
const fmtDay = (ts) => new Date(ts).toISOString().slice(0, 10);
const JR = (o) => Object.assign({ params: {}, resolvedDay: null, resolvedHow: null, resolvedBy: null }, o);
test('buildJournalVm: активная строка — «активно · N дн.» от серверного today; погасшая — день · чем (кто); порядок сервера сохраняется', () => {
  const vm = P.buildJournalVm({ today: TODAY, journal: [
    JR({ id: 'a', module: 'sprints', entityId: 'sp-1_devBack', params: { sprint: 'Спринт 1', role: 'Бэкенд' }, firedDay: TODAY - 3 * DAY }),
    JR({ id: 'b', module: 'capacity', entityId: 'sp-2', params: { sprint: 'Спринт 2' }, firedDay: TODAY - 5 * DAY, resolvedDay: TODAY - 4 * DAY, resolvedHow: 'capacityApproved', resolvedBy: 'pm1' }),
    JR({ id: 'c', module: 'releases', entityId: 'rel-1', params: { release: 'R 2026.09' }, firedDay: TODAY - 1 * DAY, resolvedDay: TODAY, resolvedHow: 'released' }),
  ] }, T, fmtDay);
  assert.deepEqual(vm.rows.map((r) => r.id), ['a', 'b', 'c']);
  assert.deepEqual(vm.rows[0], { id: 'a', fired: fmtDay(TODAY - 3 * DAY), module: 'Спринты', entity: '«Спринт 1» · Бэкенд', active: true, resolved: 'активно · 3 дн.' });
  assert.deepEqual(vm.rows[1], { id: 'b', fired: fmtDay(TODAY - 5 * DAY), module: 'Ёмкость', entity: '«Спринт 2»', active: false, resolved: fmtDay(TODAY - 4 * DAY) + ' · ёмкость утверждена (pm1)' });
  assert.equal(vm.rows[2].resolved, fmtDay(TODAY) + ' · релиз выпущен', 'без resolvedBy — без скобок');
  assert.equal(vm.rows[2].entity, '«R 2026.09»');
});
test('buildJournalVm: неизвестное «чем» → «сущность удалена»; неизвестный модуль — код как есть; нет today → 0 дн.; пустой/битый ответ — без строк', () => {
  const vm = P.buildJournalVm({ journal: [JR({ id: 'x', module: 'sprints', entityId: 'sp-9_qa', firedDay: TODAY, resolvedDay: TODAY, resolvedHow: 'weird' }), JR({ id: 'y', module: 'other', entityId: 'e', firedDay: TODAY })] }, T, fmtDay);
  assert.equal(vm.rows[0].resolved, fmtDay(TODAY) + ' · сущность удалена');
  assert.equal(vm.rows[0].entity, 'sp-9_qa', 'без слепка имён — id сущности');
  assert.deepEqual([vm.rows[1].module, vm.rows[1].resolved], ['other', 'активно · 0 дн.']);
  assert.deepEqual(P.buildJournalVm(null, T, fmtDay), { rows: [] });
  assert.deepEqual(P.buildJournalVm({ success: true, journal: 'nope' }, T, fmtDay), { rows: [] });
});
test('journalEntity: спринт с ролью / без роли (легаси) / релиз', () => {
  assert.equal(P.journalEntity({ module: 'sprints', params: { sprint: 'S', role: null } }), '«S»');
  assert.equal(P.journalEntity({ module: 'capacity', params: { sprint: 'S', role: 'игнор' } }), '«S»');
  assert.equal(P.journalEntity({ module: 'releases', entityId: 'rel-2', params: {} }), 'rel-2');
});

