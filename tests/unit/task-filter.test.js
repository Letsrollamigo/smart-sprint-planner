/* 118-1в / 118-3 — фильтры таблиц задач спринта: отбор, опции списков, ключи i18n.
 * Запуск: node --test tests/unit/task-filter.test.js */
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');

const TF = require(path.join(__dirname, '..', '..', 'widgets', 'main', 'src', 'pure', 'task-filter-pure.js'));
const I18N = path.join(__dirname, '..', '..', 'widgets', 'main', 'i18n');

const ROW = { assignee: 'ivanov', state: 'В работе', role: 'analysis', priority: 'Высокий' };

test('пустой выбор ничего не отбирает', () => {
  assert.strictEqual(TF.isActive({}), false);
  assert.strictEqual(TF.isActive({ state: [], role: null }), false);
  assert.strictEqual(TF.matches({}, ROW), true);
});

test('внутри поля — любое из отмеченных, между полями — «и»', () => {
  assert.strictEqual(TF.matches({ state: ['Ревью', 'В работе'] }, ROW), true);
  assert.strictEqual(TF.matches({ state: ['Ревью'] }, ROW), false);
  assert.strictEqual(TF.matches({ state: ['В работе'], priority: ['Низкий'] }, ROW), false, 'второе поле не совпало');
  assert.strictEqual(TF.matches({ state: ['В работе'], priority: ['Высокий'], assignee: ['ivanov'] }, ROW), true);
});

test('пустое значение и «—» ловятся пунктом NONE («Не назначен» / «—»)', () => {
  const noOne = { assignee: '', state: '—', priority: null };
  assert.strictEqual(TF.matches({ assignee: [TF.NONE] }, noOne), true);
  assert.strictEqual(TF.matches({ assignee: ['ivanov'] }, noOne), false);
  assert.strictEqual(TF.matches({ state: [TF.NONE], priority: [TF.NONE] }, noOne), true);
  assert.strictEqual(TF.matches({ assignee: [TF.NONE] }, ROW), false, 'назначенная задача под «Не назначен» не попадает');
});

test('массив значений строки — «содержит»', () => {
  assert.strictEqual(TF.matches({ assignee: ['petrova'] }, { assignee: ['ivanov', 'petrova'] }), true);
  assert.strictEqual(TF.matches({ role: ['testing'] }, { role: ['analysis', 'devBack'] }), false);
});

test('fields ограничивает поля экрана: роль с «Аллокации» на «Людях» не отбирает', () => {
  const sel = { role: ['testing'], state: ['В работе'] };
  assert.strictEqual(TF.matches(sel, ROW), false, 'на «Ролях» роль отбирает');
  assert.strictEqual(TF.matches(sel, ROW, ['assignee', 'state', 'priority']), true);
  assert.strictEqual(TF.isActive({ role: ['testing'] }, ['assignee', 'state', 'priority']), false);
});

test('options: порядок значений, дедуп, NONE первым, отмеченное-пропавшее в конце', () => {
  const opts = TF.options(['Открыта', 'В работе', '', 'Открыта'], ['Архив', 'В работе'],
    (k) => (k === TF.NONE ? '—' : k.toUpperCase()));
  assert.deepStrictEqual(opts.map((o) => o.key), [TF.NONE, 'Открыта', 'В работе', 'Архив']);
  assert.deepStrictEqual(opts.map((o) => o.label), ['—', 'ОТКРЫТА', 'В РАБОТЕ', 'АРХИВ']);
  assert.deepStrictEqual(TF.options([], undefined, String), []);
});

test('normSel: мусор из острова отбрасывается', () => {
  assert.deepStrictEqual(TF.normSel({ state: ['a', 3, null], role: 'x', junk: ['y'] }),
    { assignee: [], state: ['a'], role: [], priority: [] });
});

test('assigneeOf: логин из карты PP роли или пусто', () => {
  const pp = { devBack: { taskAssignments: { 'GM-10': { assignee: 'gm_user_1' } } } };
  assert.strictEqual(TF.assigneeOf(pp, 'devBack', 'GM-10'), 'gm_user_1');
  assert.strictEqual(TF.assigneeOf(pp, 'devBack', 'GM-11'), '');
  assert.strictEqual(TF.assigneeOf(pp, 'analysis', 'GM-10'), '');
  assert.strictEqual(TF.assigneeOf(null, 'devBack', 'GM-10'), '');
});

test('ключи строки фильтров есть во всех 15 локалях, плейсхолдеры на месте', () => {
  const KEYS = ['tfAll', 'tfRole', 'tfReset', 'tfSearch', 'tfShown', 'tfChip', 'tfHiddenRoles', 'tfEmpty', 'tfNoAssignee',
    'thAssignee', 'thState', 'thPriority'];
  const PH = { tfShown: ['{n}', '{m}'], tfChip: ['{n}', '{m}'], tfHiddenRoles: ['{roles}'] };
  const locales = fs.readdirSync(I18N).filter((f) => /^[a-z]{2}\.json$/.test(f));
  assert.strictEqual(locales.length, 15);
  for (const f of locales) {
    const dict = JSON.parse(fs.readFileSync(path.join(I18N, f), 'utf8'));
    for (const k of KEYS) {
      assert.ok(typeof dict[k] === 'string' && dict[k].trim(), f + ': нет ключа ' + k);
      (PH[k] || []).forEach((ph) => assert.ok(dict[k].indexOf(ph) >= 0, f + ': ' + k + ' без ' + ph));
    }
  }
});
