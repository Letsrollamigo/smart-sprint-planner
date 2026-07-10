'use strict';

/* #50 S5a — A4 Трудозатраты: buildWorkloadRows (pure/reporting-pure.js). Агрегация нативных
 * workItems по (человек, роль) через per-task исполнителей (userField*) + «кто не списал». */

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildWorkloadRows } = require('../../widgets/main/src/pure/reporting-pure.js');

const DAY = 86400000;
function it_(issueId, author, dateTs, minutes) { return { issueId: issueId, author: author, dateTs: dateTs, minutes: minutes }; }

test('A4: автор сматчен с исполнителем роли задачи → часы в эту роль; days = distinct дни', () => {
  const items = [
    it_('D-1', 'ivan', DAY * 1, 60),
    it_('D-1', 'ivan', DAY * 1, 30),   // тот же день
    it_('D-1', 'ivan', DAY * 2, 120)   // др. день
  ];
  const roleExec = { 'D-1': { analyst: 'ivan', dev: 'petr' } };
  const r = buildWorkloadRows(items, roleExec, []);
  assert.equal(r.rows.length, 1);
  assert.deepEqual(r.rows[0], { author: 'ivan', roleKey: 'analyst', minutes: 210, days: 2 });
  assert.equal(r.totalMinutes, 210);
  assert.equal(r.authorCount, 1);
});

test('A4: автор не совпал ни с одним исполнителем → roleKey null (не определена)', () => {
  const items = [it_('D-1', 'stranger', DAY, 45)];
  const r = buildWorkloadRows(items, { 'D-1': { analyst: 'ivan' } }, []);
  assert.equal(r.rows[0].roleKey, null);
  assert.equal(r.rows[0].minutes, 45);
});

test('A4: один человек в двух ролях на разных задачах → две строки', () => {
  const items = [it_('D-1', 'ivan', DAY, 60), it_('D-2', 'ivan', DAY, 90)];
  const roleExec = { 'D-1': { analyst: 'ivan' }, 'D-2': { dev: 'ivan' } };
  const r = buildWorkloadRows(items, roleExec, []);
  assert.equal(r.rows.length, 2);
  assert.equal(r.rows[0].minutes, 90);  // сорт по минутам ↓: dev 90 первым
  assert.equal(r.rows[0].roleKey, 'dev');
  assert.equal(r.rows[1].roleKey, 'analyst');
  assert.equal(r.authorCount, 1);       // один человек, две роли
});

test('A4: несколько ролей на одной задаче — берётся ПЕРВОЕ совпадение автора', () => {
  const items = [it_('D-1', 'ivan', DAY, 60)];
  const r = buildWorkloadRows(items, { 'D-1': { analyst: 'ivan', reviewer: 'ivan' } }, []);
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].author, 'ivan');
  // первое совпадение (порядок ключей объекта); не удваивает часы
  assert.equal(r.rows[0].minutes, 60);
});

test('A4: «кто не списал» = исполнители отобранных задач без записей', () => {
  const items = [it_('D-1', 'ivan', DAY, 60)];   // ivan списал; petr (dev на D-1) — нет
  const roleExec = { 'D-1': { analyst: 'ivan', dev: 'petr' }, 'D-2': { tester: 'maria' } };
  const r = buildWorkloadRows(items, roleExec, []);
  const noLogKeys = r.noLog.map((n) => n.author + ':' + n.roleKey).sort();
  assert.deepEqual(noLogKeys, ['maria:tester', 'petr:dev']);   // ivan списал → не в списке
});

test('A4: incomplete (D7) — задача исключена из агрегатов, «не списал» и в incomplete[]', () => {
  const items = [it_('BAD', 'ivan', DAY, 60), it_('D-1', 'ivan', DAY, 30)];
  const roleExec = { 'BAD': { analyst: 'ivan', dev: 'petr' }, 'D-1': { analyst: 'ivan' } };
  const r = buildWorkloadRows(items, roleExec, ['BAD']);
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].minutes, 30);            // только D-1
  assert.deepEqual(r.incomplete, ['BAD']);
  // petr (исполнитель dev только на BAD) НЕ попадает в «не списал» — задача incomplete исключена
  assert.deepEqual(r.noLog.map((n) => n.author), []);
});

test('A4: пустой вход → пусто', () => {
  const r = buildWorkloadRows([], {}, []);
  assert.deepEqual(r.rows, []);
  assert.deepEqual(r.noLog, []);
  assert.equal(r.totalMinutes, 0);
  assert.equal(r.authorCount, 0);
});

test('A4: нулевые/битые минуты не ломают сумму, day всё равно считается', () => {
  const items = [it_('D-1', 'ivan', DAY, 0), it_('D-1', 'ivan', DAY * 2, NaN), it_('D-1', 'ivan', DAY * 3, 50)];
  const r = buildWorkloadRows(items, { 'D-1': { analyst: 'ivan' } }, []);
  assert.equal(r.rows[0].minutes, 50);            // 0 и NaN не добавились
  assert.equal(r.rows[0].days, 3);                // но три разных дня с записями
});
