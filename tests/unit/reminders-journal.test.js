'use strict';
/* #112 «Напоминания» — журнал: reconcile идемпотентен и не мутирует вход (GET идёт под ретраем
   read-gate), дедуп по детерминированному id, гашение через explain, кольцо 50 и лимит размера,
   валидатор блоба/записи, чтение с молчаливым срезом чужих ключей.
   Запуск: node --test tests/unit/reminders-journal.test.js */

const test   = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');

const rem = require(path.join(__dirname, '..', '..', 'backend-reminders.js'));

const DAY = 86400000;
const TODAY = Date.UTC(2026, 8, 9);
const d = (n) => TODAY + n * DAY;

function item(over) {
  return Object.assign({ id: 'sprints:sp-1_devBack', module: 'sprints', kind: 'sprintRoleOpen', entityId: 'sp-1_devBack',
    params: { sprint: 'Спринт 1', role: 'Бэкенд' }, days: 3, ref: { sprintId: 'sp-1', roleKey: 'devBack' }, addressee: 'validator' }, over || {});
}
function rec(over) {
  return Object.assign({ id: 'sprints:sp-1_devBack:' + d(-2), module: 'sprints', kind: 'sprintRoleOpen', entityId: 'sp-1_devBack',
    params: { sprint: 'Спринт 1', role: 'Бэкенд' }, firedDay: d(-2), resolvedDay: null, resolvedHow: null, resolvedBy: null }, over || {});
}
const explainGone = () => ({ how: 'gone', by: null });

test('#112 reconcile — новый пункт: запись с детерминированным id module:entityId:today, firedDay = today, открыта', () => {
  const out = rem.reconcile([], [item()], TODAY, explainGone);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], { id: 'sprints:sp-1_devBack:' + TODAY, module: 'sprints', kind: 'sprintRoleOpen', entityId: 'sp-1_devBack',
    params: { sprint: 'Спринт 1', role: 'Бэкенд' }, firedDay: TODAY, resolvedDay: null, resolvedHow: null, resolvedBy: null });
});

test('#112 reconcile — идемпотентен: второй прогон того же состояния даёт тот же журнал; вход не мутируется', () => {
  const journal = [rec(), rec({ id: 'releases:rel-9:' + d(-4), module: 'releases', kind: 'releaseOverdue', entityId: 'rel-9', params: { release: 'R9', status: 'work' }, firedDay: d(-4) })];
  const before = JSON.stringify(journal);
  const active = [item(), item({ id: 'capacity:sp-cur', module: 'capacity', kind: 'capacityBefore', entityId: 'sp-cur', params: { sprint: 'Текущий' }, addressee: 'settingsOrPlanning' })];
  const once = rem.reconcile(journal, active, TODAY, () => ({ how: 'released', by: 'rm' }));
  assert.equal(JSON.stringify(journal), before, 'вход не тронут (иначе сравнение сериализаций в хендлере всегда «равно» и журнал не пишется)');
  const twice = rem.reconcile(once, active, TODAY, () => ({ how: 'released', by: 'rm' }));
  assert.deepEqual(twice, once);
  assert.equal(once.length, 3);
  const relRec = once.find((r) => r.entityId === 'rel-9');
  assert.equal(relRec.resolvedDay, TODAY);
  assert.equal(relRec.resolvedHow, 'released');
  assert.equal(relRec.resolvedBy, 'rm');
  const open = once.find((r) => r.entityId === 'sp-1_devBack');
  assert.equal(open.resolvedDay, null, 'активный пункт с открытой записью — без новой записи');
  assert.equal(open.firedDay, d(-2));
});

test('#112 reconcile — дедуп по id (гонка двух открытий): остаётся первая', () => {
  const a = rec({ params: { sprint: 'первая', role: 'x' } }), b = rec({ params: { sprint: 'вторая', role: 'y' } });
  const out = rem.reconcile([a, b], [item()], TODAY, explainGone);
  assert.equal(out.length, 1);
  assert.equal(out[0].params.sprint, 'первая');
});

test('#112 reconcile — гашение: открытая запись без активного пункта получает resolvedDay=today и {how,by} из explain; неизвестный how → gone', () => {
  const out = rem.reconcile([rec()], [], TODAY, () => ({ how: 'roleFinished', by: 'val1' }));
  assert.equal(out[0].resolvedDay, TODAY);
  assert.equal(out[0].resolvedHow, 'roleFinished');
  assert.equal(out[0].resolvedBy, 'val1');
  const bad = rem.reconcile([rec()], [], TODAY, () => ({ how: 'whatever', by: 42 }));
  assert.equal(bad[0].resolvedHow, 'gone');
  assert.equal(bad[0].resolvedBy, null);
  const none = rem.reconcile([rec()], [], TODAY, () => undefined);
  assert.equal(none[0].resolvedHow, 'gone');
  const done = rem.reconcile([rec({ resolvedDay: d(-1), resolvedHow: 'gone' })], [], TODAY, () => ({ how: 'dateMoved' }));
  assert.equal(done[0].resolvedDay, d(-1), 'уже погасшая запись не перештамповывается');
  assert.equal(done[0].resolvedHow, 'gone');
});

test('#112 reconcile — повторное появление на другой день даёт НОВУЮ запись, прежняя остаётся погасшей', () => {
  const gone = rem.reconcile([rec()], [], d(-1), explainGone);
  assert.equal(gone[0].resolvedDay, d(-1));
  const back = rem.reconcile(gone, [item()], TODAY, explainGone);
  assert.equal(back.length, 2);
  assert.equal(back[0].resolvedDay, d(-1));
  assert.equal(back[1].id, 'sprints:sp-1_devBack:' + TODAY);
  assert.equal(back[1].firedDay, TODAY);
  assert.equal(back[1].resolvedDay, null);
});

test('#112 reconcile — появился, погас и снова появился В ОДИН день: дубля id нет, новая запись только завтра', () => {
  const a = rem.reconcile([], [item()], TODAY, explainGone);
  const b = rem.reconcile(a, [], TODAY, explainGone);
  assert.equal(b[0].resolvedDay, TODAY);
  const c = rem.reconcile(b, [item()], TODAY, explainGone);
  assert.equal(c.length, 1, 'та же запись, без дубля');
  assert.equal(c[0].resolvedDay, TODAY);
  const ids = new Set(c.map((r) => r.id));
  assert.equal(ids.size, c.length);
  const tomorrow = rem.reconcile(c, [item()], d(1), explainGone);
  assert.equal(tomorrow.length, 2);
  assert.equal(tomorrow[1].firedDay, d(1));
});

test('#112 reconcile — кольцо 50: старейшие по firedDay среди погасших; погасших нет — старейшие открытые; порядок хранения по firedDay возр.', () => {
  const resolved = [];
  for (let i = 0; i < 55; i++) resolved.push(rec({ id: 'releases:r' + i + ':' + d(-100 + i), module: 'releases', kind: 'releaseOverdue', entityId: 'r' + i, params: { release: 'R' + i }, firedDay: d(-100 + i), resolvedDay: d(-50 + i), resolvedHow: 'released' }));
  const open = rec({ id: 'sprints:oldest:' + d(-200), entityId: 'oldest', firedDay: d(-200) });
  const out = rem.reconcile([open].concat(resolved.slice().reverse()), [item({ id: 'sprints:oldest', entityId: 'oldest' })], TODAY, explainGone);
  assert.equal(out.length, rem.MAX_JOURNAL);
  assert.equal(out[0].entityId, 'oldest', 'самая старая ОТКРЫТАЯ запись пережила обрезку');
  assert.ok(!out.some((r) => r.entityId === 'r0' || r.entityId === 'r5'), 'ушли шесть старейших погасших (r0…r5)');
  assert.ok(out.some((r) => r.entityId === 'r6'));
  for (let i = 1; i < out.length; i++) assert.ok(out[i - 1].firedDay <= out[i].firedDay, 'порядок по firedDay возр.');
  const allOpen = [];
  for (let i = 0; i < 52; i++) allOpen.push(rec({ id: 'sprints:o' + i + ':' + d(-60 + i), entityId: 'o' + i, firedDay: d(-60 + i) }));
  const active = allOpen.map((r) => item({ id: 'sprints:' + r.entityId, entityId: r.entityId }));
  const out2 = rem.reconcile(allOpen, active, TODAY, explainGone);
  assert.equal(out2.length, 50);
  assert.ok(!out2.some((r) => r.entityId === 'o0' || r.entityId === 'o1'), 'погасших нет — ушли две старейшие открытые');
});

test('#112 reconcile — лимит размера: после кольца дообрезаются старейшие погасшие до входа в лимит; открытые по размеру не режутся', () => {
  const big = 'x'.repeat(500);
  const list = [];
  for (let i = 0; i < 40; i++) list.push(rec({ id: 'releases:b' + i + ':' + d(-90 + i), module: 'releases', kind: 'releaseOverdue', entityId: 'b' + i, params: { release: big, status: big }, firedDay: d(-90 + i), resolvedDay: d(-40 + i), resolvedHow: 'released', resolvedBy: 'u'.repeat(200) }));
  for (let i = 0; i < 10; i++) list.push(rec({ id: 'sprints:s' + i + ':' + d(-30 + i), entityId: 's' + i, params: { sprint: big, role: big }, firedDay: d(-30 + i) }));
  assert.ok(JSON.stringify(list).length > rem.MAX_REMINDERS_SIZE, 'предусловие: 50 записей не влезают в лимит');
  const active = list.filter((r) => r.resolvedDay === null).map((r) => item({ id: 'sprints:' + r.entityId, entityId: r.entityId }));
  const out = rem.reconcile(list, active, TODAY, explainGone);
  assert.ok(JSON.stringify({ journal: out, pluginVersion: '3.40.0' }).length <= rem.MAX_REMINDERS_SIZE);
  assert.equal(out.filter((r) => r.resolvedDay === null).length, 10, 'все открытые на месте');
  assert.ok(out.length < 50 && out.length > 10);
  assert.ok(!out.some((r) => r.entityId === 'b0'), 'ушли старейшие погасшие');
});

test('#112 validateRemindersBlob — валидный блоб принимается; пустой журнал допустим', () => {
  assert.equal(rem.validateRemindersBlob({ journal: [rec(), rec({ id: 'x:1', resolvedDay: d(-1), resolvedHow: 'gone', resolvedBy: 'u' })], pluginVersion: '3.40.0' }), true);
  assert.equal(rem.validateRemindersBlob({ journal: [], pluginVersion: '3.40.0' }), true);
  assert.equal(rem.validateRemindersBlob({}), true);
  assert.equal(rem.validateRemindersRecord(rec({ params: null })), true);
  assert.equal(rem.validateRemindersRecord(rec({ params: { status: null } })), true, 'null-подстановка допустима');
});

test('#112 validateRemindersBlob — каждое отклонение — отказ (чужой ключ, enum, id, размер, дубль)', () => {
  const badBlob = [
    ['чужой ключ блоба', { journal: [], foo: 1 }],
    ['journal не массив', { journal: {} }],
    ['дубль id', { journal: [rec(), rec()] }],
    ['> 50 записей', { journal: Array.from({ length: 51 }, (_, i) => rec({ id: 'id' + i })) }],
    ['pluginVersion не строка', { journal: [], pluginVersion: 3 }]
  ];
  for (const [label, b] of badBlob) assert.equal(rem.validateRemindersBlob(b), false, label);
  const badRec = [
    ['чужой ключ записи', rec({ note: 'x' })],
    ['id пустой', rec({ id: '' })],
    ['module вне enum', rec({ module: 'backlog' })],
    ['kind вне enum', rec({ kind: 'foo' })],
    ['entityId не строка', rec({ entityId: 7 })],
    ['entityId > 200', rec({ entityId: 'e'.repeat(201) })],
    ['params массив', rec({ params: [] })],
    ['params чужой ключ', rec({ params: { sprint: 'a', extra: 'b' } })],
    ['params число', rec({ params: { sprint: 5 } })],
    ['params > 500', rec({ params: { sprint: 's'.repeat(501) } })],
    ['firedDay строка', rec({ firedDay: '1' })],
    ['firedDay отсутствует', rec({ firedDay: undefined })],
    ['resolvedDay строка', rec({ resolvedDay: 'today' })],
    ['resolvedHow вне enum', rec({ resolvedHow: 'clicked' })],
    ['resolvedBy > 200', rec({ resolvedBy: 'b'.repeat(201) })],
    ['resolvedBy число', rec({ resolvedBy: 1 })]
  ];
  for (const [label, r] of badRec) {
    assert.equal(rem.validateRemindersRecord(r), false, label);
    assert.equal(rem.validateRemindersBlob({ journal: [r] }), false, 'блоб: ' + label);
  }
});

test('#112 readJournal — чужие ключи записи и params молча срезаются, битые элементы выкидываются, отсутствие свойства → []', () => {
  const mk = (raw) => ({ project: { extensionProperties: { ssp_reminders: raw } } });
  assert.deepEqual(rem.readJournal(mk(undefined)), []);
  assert.deepEqual(rem.readJournal(mk('not json')), []);
  assert.deepEqual(rem.readJournal(mk(JSON.stringify({ journal: 'x' }))), []);
  const out = rem.readJournal(mk(JSON.stringify({ journal: [Object.assign(rec(), { future: 1, params: { sprint: 'S', role: 'R', weird: 'w' } }), null, 'str', { module: 'sprints' }] })));
  assert.equal(out.length, 1);
  assert.ok(!('future' in out[0]));
  assert.deepEqual(out[0].params, { sprint: 'S', role: 'R' });
  assert.equal(out[0].id, rec().id);
  /* невалидное ЗНАЧЕНИЕ — запись выкидывается на чтении, иначе валидатор на записи отверг бы весь блоб и журнал замер бы навсегда */
  const poisoned = rem.readJournal(mk(JSON.stringify({ journal: [rec({ module: 'backlog' }), rec({ id: 'ok:1', firedDay: 'yesterday' }), rec({ id: 'ok:2' })] })));
  assert.deepEqual(poisoned.map((r) => r.id), ['ok:2']);
});

test('#112 isAddressee — validator / settingsOrPlanning / логины ∨ валидатор', () => {
  const v = { login: 'v', validator: true, planning: false };
  const p = { login: 'p', validator: false, planning: true };
  const rep = { login: 'rm', validator: false, planning: false };
  const nobody = { login: '', validator: false, planning: false };
  assert.equal(rem.isAddressee('validator', v), true);
  assert.equal(rem.isAddressee('validator', p), false);
  assert.equal(rem.isAddressee('settingsOrPlanning', p), true);
  assert.equal(rem.isAddressee('settingsOrPlanning', v), false);
  const rule = { logins: ['rm', 'ri'], orValidator: true };
  assert.equal(rem.isAddressee(rule, rep), true);
  assert.equal(rem.isAddressee(rule, v), true);
  assert.equal(rem.isAddressee(rule, p), false);
  assert.equal(rem.isAddressee({ logins: [''], orValidator: false }, nobody), false, 'пустой логин не совпадает с пустым представителем');
  assert.equal(rem.isAddressee('unknown', v), false);
});
