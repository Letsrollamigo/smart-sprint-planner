/* release-controller.buildPreviewRows — self-check pure-билдера строк предпросмотра
 * смены состояний (#48 R2.3, US-R2-04/05, D-F). Проверяет пометки ok/desync/already/
 * unreachable, дефолт чекбоксов, гард D-F (expected = маппинг ближайшего предыдущего
 * статуса) и graceful-режим без бандла. Запуск: node --test 'tests/unit/release-state-preview.test.js'. */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const ctrl = require('../../widgets/main/src/domain/release-controller.js');

const MAPPING = { planned: '', prep: 'Готова к сборке', work: 'В сборке', released: 'Закрыта', cancelled: '' };
const BUNDLE = ['Открыта', 'Готова к сборке', 'В сборке', 'Закрыта'];

function rec(status, issues) { return { id: 'rel-1', status: status, issues: issues }; }

test('пометки: ok (факт = expected) / desync (факт ≠ expected) / already (уже в целевом)', () => {
  const data = {
    'ZUP-142': { summary: 'Правило расчёта', state: 'Готова к сборке' },
    'ZUP-161': { summary: 'Маппинг счетов', state: 'Закрыта' },
    'ZUP-143': { summary: 'Юнит-тесты', state: 'В сборке' },
  };
  const rows = ctrl.buildPreviewRows(rec('work', ['ZUP-142', 'ZUP-161', 'ZUP-143']), MAPPING, data, BUNDLE);
  assert.deepStrictEqual(rows[0], { id: 'ZUP-142', title: 'Правило расчёта', current: 'Готова к сборке', target: 'В сборке', mark: 'ok', checked: true, disabled: false });
  assert.deepStrictEqual(rows[1], { id: 'ZUP-161', title: 'Маппинг счетов', current: 'Закрыта', target: 'В сборке', mark: 'desync', checked: true, disabled: false });
  assert.deepStrictEqual(rows[2], { id: 'ZUP-143', title: 'Юнит-тесты', current: 'В сборке', target: 'В сборке', mark: 'already', checked: false, disabled: false });
});

test('expected — walk-back через пустые маппинги: released ← work (prep/planned не мешают)', () => {
  const rows = ctrl.buildPreviewRows(rec('released', ['A-1']), MAPPING, { 'A-1': { summary: '', state: 'Открыта' } }, BUNDLE);
  assert.strictEqual(rows[0].mark, 'desync'); // expected = mapping.work = «В сборке», факт «Открыта»
});

test('нет expected (первый статус с маппингом) → рассинхрон не размечается', () => {
  const m = { planned: '', prep: 'Готова к сборке', work: '', released: '', cancelled: '' };
  const rows = ctrl.buildPreviewRows(rec('prep', ['A-1', 'A-2']), m,
    { 'A-1': { summary: '', state: 'Открыта' }, 'A-2': { summary: '', state: 'Готова к сборке' } }, BUNDLE);
  assert.strictEqual(rows[0].mark, 'ok');       // куда угодно — рассинхрону не с чем сравнивать
  assert.strictEqual(rows[1].mark, 'already');  // уже в целевом
});

test('целевого нет в бандле State → unreachable: чекбокс снят и заблокирован', () => {
  const rows = ctrl.buildPreviewRows(rec('work', ['A-1']), MAPPING, { 'A-1': { summary: '', state: 'Открыта' } }, ['Открыта', 'Закрыта']);
  assert.deepStrictEqual(rows.map((r) => [r.mark, r.checked, r.disabled]), [['unreachable', false, true]]);
});

test('бандл не загрузился (null) → reachability не проверяем, разметка обычная', () => {
  const rows = ctrl.buildPreviewRows(rec('work', ['A-1']), MAPPING, { 'A-1': { summary: '', state: 'Готова к сборке' } }, null);
  assert.strictEqual(rows[0].mark, 'ok');
});

test('неизвестный факт (fetch-пропуск) при известном expected → desync (безопасно-видимо)', () => {
  const rows = ctrl.buildPreviewRows(rec('work', ['A-1']), MAPPING, {}, BUNDLE);
  assert.deepStrictEqual(rows[0], { id: 'A-1', title: '', current: '', target: 'В сборке', mark: 'desync', checked: true, disabled: false });
});

test('пустой состав → []', () => {
  assert.deepStrictEqual(ctrl.buildPreviewRows(rec('work', []), MAPPING, {}, BUNDLE), []);
});

/* Регресс live-смоука R2.3: State извлекается КАНОНИЧЕСКИМ именем (v.name), не localizedName —
 * маппинг настроек и бандл field-values хранят канонические имена; localizedName давал
 * ложный «рассинхрон» всех строк на локализованном стенде. */
test('fetchIssueData: канон v.name важнее localizedName; summary тримится', async () => {
  const view = require('../../widgets/main/src/domain/release-view.js');
  const deps = { state: {
    getSettings: () => ({ fieldState: 'State' }),
    getHost: () => ({ fetchYouTrack: (path, opts) => Promise.resolve([{
      idReadable: 'DEMO-4', summary: ' Создать демопроект ',
      customFields: [{ name: 'State', projectCustomField: { field: { name: 'State' } },
        value: { name: 'In Progress', localizedName: 'В обработке', presentation: 'В обработке' } }],
    }]) }),
  } };
  const data = await view.fetchIssueData(deps, ['DEMO-4']);
  assert.deepStrictEqual(data, { 'DEMO-4': { summary: 'Создать демопроект', state: 'In Progress', resolved: false, type: '', parents: [] } });
});

/* R3.1 — isResolved значения State пробрасывается в resolved (зелёная зона светофора). */
test('fetchIssueData: value.isResolved → resolved:true', async () => {
  const view = require('../../widgets/main/src/domain/release-view.js');
  const deps = { state: {
    getSettings: () => ({ fieldState: 'State' }),
    getHost: () => ({ fetchYouTrack: () => Promise.resolve([{
      idReadable: 'DEMO-5', summary: 'Готовая задача',
      customFields: [{ name: 'State', projectCustomField: { field: { name: 'State' } },
        value: { name: 'Done', localizedName: 'Готово', isResolved: true } }],
    }]) }),
  } };
  const data = await view.fetchIssueData(deps, ['DEMO-5']);
  assert.deepStrictEqual(data, { 'DEMO-5': { summary: 'Готовая задача', state: 'Done', resolved: true, type: '', parents: [] } });
});

/* R3.2 — тип (fieldType, канон v.name) и Subtask-родители (direction INWARD) добираются
 * тем же батчем; OUTWARD (дети) и не-Subtask линки игнорируются. */
test('fetchIssueData: type из customFields + parents из links (только Subtask INWARD)', async () => {
  const view = require('../../widgets/main/src/domain/release-view.js');
  const deps = { state: {
    getSettings: () => ({ fieldState: 'State', fieldType: 'Type' }),
    getHost: () => ({ fetchYouTrack: () => Promise.resolve([{
      idReadable: 'DEMO-6', summary: 'Стори',
      customFields: [
        { name: 'State', projectCustomField: { field: { name: 'State' } }, value: { name: 'In Progress' } },
        { name: 'Type', projectCustomField: { field: { name: 'Type' } }, value: { name: 'User Story', localizedName: 'История' } },
      ],
      links: [
        { direction: 'INWARD',  linkType: { name: 'Subtask' }, issues: [{ idReadable: 'DEMO-2' }] },
        { direction: 'OUTWARD', linkType: { name: 'Subtask' }, issues: [{ idReadable: 'DEMO-9' }] },
        { direction: 'INWARD',  linkType: { name: 'Depend' },  issues: [{ idReadable: 'DEMO-7' }] },
      ],
    }]) }),
  } };
  const data = await view.fetchIssueData(deps, ['DEMO-6']);
  assert.deepStrictEqual(data, { 'DEMO-6': { summary: 'Стори', state: 'In Progress', resolved: false, type: 'User Story', parents: ['DEMO-2'] } });
});
