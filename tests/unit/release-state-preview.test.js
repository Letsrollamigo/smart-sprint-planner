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

/* ─── #57-3 buildRollbackRows — откат состояний по истории (fromState = oldValue) ─── */
const rb = require('../../widgets/main/src/domain/release-rollback.js');
const TR = (from, to, ts) => ({ enteredAt: ts == null ? 1750000000000 : ts, toState: to, fromState: from });

test('откат: ok / already / desync (меняли после — снят) / nohist / incomplete / вне бандла', () => {
  const r = rec('work', ['A-1', 'A-2', 'A-3', 'A-4', 'A-5', 'A-6']);
  const data = {
    'A-1': { summary: 'ок', state: 'В сборке' },
    'A-2': { summary: 'уже вернули', state: 'Открыта' },
    'A-3': { summary: 'меняли после', state: 'Закрыта' },
    'A-4': { summary: 'без истории', state: 'Открыта' },
    'A-5': { summary: 'история обрезана', state: 'В сборке' },
    'A-6': { summary: 'значение вне бандла', state: 'В сборке' },
  };
  const prim = {
    transitions: {
      'A-1': TR('Открыта', 'В сборке'),
      'A-2': TR('Открыта', 'В сборке'),
      'A-3': TR('Открыта', 'В сборке'),
      'A-6': TR('Архивная', 'В сборке'),
    },
    incomplete: ['A-5'],
    noTransition: ['A-4'],
  };
  const rows = rb.buildRollbackRows(r, data, prim, BUNDLE);
  assert.deepStrictEqual(rows.map((x) => [x.id, x.target, x.mark, x.checked, x.disabled]), [
    ['A-1', 'Открыта', 'ok', true, false],
    ['A-2', 'Открыта', 'already', false, false],
    ['A-3', 'Открыта', 'desync', false, false],
    ['A-4', '', 'nohist', false, true],
    ['A-5', '', 'incomplete', false, true],
    ['A-6', 'Архивная', 'unreachable', false, true],
  ]);
  assert.ok(rows[0].tsLabel.length > 0);          // дата перехода видна юзеру
  assert.strictEqual(rows[3].tsLabel, '');        // нет перехода — нет даты
});

test('откат: бандл не загрузился (null) → reachability не проверяем', () => {
  const prim = { transitions: { 'A-1': TR('Что угодно', 'В сборке') }, incomplete: [], noTransition: [] };
  const rows = rb.buildRollbackRows(rec('work', ['A-1']), { 'A-1': { summary: '', state: 'В сборке' } }, prim, null);
  assert.strictEqual(rows[0].mark, 'ok');
});

test('откат: переход с пустым fromState (первая простановка) → nohist', () => {
  const prim = { transitions: { 'A-1': TR('', 'В сборке') }, incomplete: [], noTransition: [] };
  const rows = rb.buildRollbackRows(rec('work', ['A-1']), { 'A-1': { summary: '', state: 'В сборке' } }, prim, BUNDLE);
  assert.deepStrictEqual([rows[0].mark, rows[0].checked, rows[0].disabled], ['nohist', false, true]);
});

test('откат: пустой состав / пустой prim → graceful', () => {
  assert.deepStrictEqual(rb.buildRollbackRows(rec('work', []), {}, {}, BUNDLE), []);
  const rows = rb.buildRollbackRows(rec('work', ['A-1']), {}, null, BUNDLE);
  assert.strictEqual(rows[0].mark, 'nohist');
});

/* #57-3 — канон-приоритет разбора активностей (грабля feedback_yt_activity_name_vs_localized):
 * fetchIssueData.state и бандл field-values хранят канон v.name → parseStateChunk с preferCanon
 * обязан отдавать name ⊃ localizedName, иначе на локализованном стенде ложный desync всех строк. */
test('parseStateChunk preferCanon: fromState/toState = канон v.name, не localizedName', () => {
  const pure = require('../../widgets/main/src/pure/reporting-pure.js');
  const acts = [{ timestamp: 5, target: { idReadable: 'A-1' },
    added: [{ name: 'In Progress', localizedName: 'В работе', $type: 'StateBundleElement' }],
    removed: [{ name: 'Open', localizedName: 'Открыта', $type: 'StateBundleElement' }] }];
  const canon = pure.parseStateChunk(acts, ['A-1'], { topLimit: 100, preferCanon: true });
  assert.deepStrictEqual(canon.transitions['A-1'], { enteredAt: 5, toState: 'In Progress', fromState: 'Open' });
  const disp = pure.parseStateChunk(acts, ['A-1'], { topLimit: 100 });
  assert.deepStrictEqual(disp.transitions['A-1'], { enteredAt: 5, toState: 'В работе', fromState: 'Открыта' });  // display-приоритет отчётов не изменился
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
