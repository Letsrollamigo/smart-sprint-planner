'use strict';

/* #88 — резолверы ролевого поля «Спринт» (pure/sprint-field-pure.js).
 * Контракт: имя поля и значение берутся ролевые, а на общие падают только тогда, когда
 * роль и правда пишет в общее поле — иначе значение чужого бандла уехало бы в задачу.
 * Запуск: node --test 'tests/unit/sprint-field.test.js'. */

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const M = require(path.join(__dirname, '..', '..', 'widgets', 'main', 'src', 'pure', 'sprint-field-pure.js'));

const ROLE = (key) => ({ key: key, label: key, sprintField: 'fieldSprint' + key[0].toUpperCase() + key.slice(1) });
const ANALYSIS = ROLE('analysis');
const TESTING  = ROLE('testing');

/* ── имя поля ────────────────────────────────────────────────────────────── */

test('настройки без ролевых ключей: все роли берут общее поле (как до 3.35.0)', () => {
  const s = { fieldSprint: 'Спринт' };
  assert.strictEqual(M.fieldNameFor(s, ANALYSIS), 'Спринт');
  assert.strictEqual(M.fieldNameFor(s, TESTING), 'Спринт');
  assert.strictEqual(M.fieldsDiverge(s, [ANALYSIS, TESTING]), false, 'один список во вводных');
});

test('ролевой ключ перебивает общий', () => {
  const s = { fieldSprint: 'Спринт', fieldSprintTesting: 'Спринт QA' };
  assert.strictEqual(M.fieldNameFor(s, ANALYSIS), 'Спринт');
  assert.strictEqual(M.fieldNameFor(s, TESTING), 'Спринт QA');
  assert.strictEqual(M.fieldsDiverge(s, [ANALYSIS, TESTING]), true, 'поля разошлись → строка на роль');
});

test('общего поля нет, ролевое есть — работает только у своей роли', () => {
  const s = { fieldSprintTesting: 'Спринт QA' };
  assert.strictEqual(M.fieldNameFor(s, TESTING), 'Спринт QA');
  assert.strictEqual(M.fieldNameFor(s, ANALYSIS), '', 'роль без поля не получает чужое');
  assert.strictEqual(M.fieldsDiverge(s, [ANALYSIS, TESTING]), false,
    'роль без настроенного поля выбора не создаёт — расхождением не считается');
});

test('пробелы и пустые строки в настройке = «не настроено»', () => {
  assert.strictEqual(M.fieldNameFor({ fieldSprint: '   ' }, ANALYSIS), '');
  assert.strictEqual(M.fieldNameFor({ fieldSprint: 'Спринт', fieldSprintTesting: '  ' }, TESTING), 'Спринт');
});

/* ── значение ────────────────────────────────────────────────────────────── */

test('ролевое значение перебивает общее', () => {
  const sp = { sprintFieldVal: 'Спринт 19', sprintFieldValByRole: { testing: 'QA-19' } };
  assert.strictEqual(M.valueFor(sp, 'testing'), 'QA-19');
  assert.strictEqual(M.valueFor(sp, 'analysis'), 'Спринт 19');
});

test('спринт без карты (создан до 3.35.0) отдаёт общее значение всем ролям', () => {
  const sp = { sprintFieldVal: 'Спринт 19' };
  assert.strictEqual(M.valueFor(sp, 'testing'), 'Спринт 19');
  assert.strictEqual(M.valueFor(sp, 'analysis'), 'Спринт 19');
});

test('🔴 роль со СВОИМ полем не получает общее значение — это значение чужого бандла', () => {
  /* Ожог, ради которого резолвер знает про настройки: рабочую копию открыли по снимку
     роли «Анализ», её значение легло в общий sprintFieldVal — и без этой ветки оно
     подставилось бы в список «Тестирования», а оттуда уехало бы в задачу как
     несуществующее значение чужого поля. */
  const sp = { sprintFieldVal: 'Спринт 19' };
  const s  = { fieldSprint: 'Спринт', fieldSprintTesting: 'Спринт QA' };
  assert.strictEqual(M.valueFor(sp, 'analysis', s, ANALYSIS), 'Спринт 19',
    'предусловие: роль на ОБЩЕМ поле общее значение получает');
  assert.strictEqual(M.valueFor(sp, 'testing', s, TESTING), '',
    'роль со своим полем — не получает');
});

test('ролевое значение доходит даже к роли со своим полем', () => {
  const sp = { sprintFieldVal: 'Спринт 19', sprintFieldValByRole: { testing: 'QA-19' } };
  const s  = { fieldSprint: 'Спринт', fieldSprintTesting: 'Спринт QA' };
  assert.strictEqual(M.valueFor(sp, 'testing', s, TESTING), 'QA-19');
});

/* ── кратность поля ──────────────────────────────────────────────────────── */

test('кратность читается из типа YouTrack: [*] — многозначное', () => {
  ['enum[1]', 'state[1]', 'version[1]', 'user[1]', 'period', 'string', 'date'].forEach((t) => {
    assert.strictEqual(M.isSingleValueType(t), true, t + ' должно быть одиночным');
  });
  ['enum[*]', 'version[*]', 'user[*]', 'ownedField[*]'].forEach((t) => {
    assert.strictEqual(M.isSingleValueType(t), false, t + ' должно быть многозначным');
  });
  assert.strictEqual(M.isSingleValueType(''), false, 'тип неизвестен → в подбор не берём');
});

/* ── план записи ─────────────────────────────────────────────────────────── */

const ACTIVE = ['PLANNED', 'IN_PROGRESS'];
const items = [
  { issueId: 'A-1', inclusionStatus: 'PLANNED' },
  { issueId: 'A-2', inclusionStatus: 'EXCLUDED' },
  { issueId: 'A-3', inclusionStatus: 'IN_PROGRESS' },
];

test('в план идут только активные задачи состава', () => {
  const plan = M.writePlan(items, ACTIVE, 'Спринт', 'Спринт 19');
  assert.deepStrictEqual(plan.map((r) => r.issueId), ['A-1', 'A-3']);
  assert.deepStrictEqual(plan[0], { issueId: 'A-1', fieldName: 'Спринт', value: 'Спринт 19' });
});

test('не настроено поле или не выбрано значение → писать нечего, а не писать пусто', () => {
  assert.deepStrictEqual(M.writePlan(items, ACTIVE, '', 'Спринт 19'), []);
  assert.deepStrictEqual(M.writePlan(items, ACTIVE, 'Спринт', ''), []);
  assert.deepStrictEqual(M.writePlan([], ACTIVE, 'Спринт', 'Спринт 19'), []);
});
