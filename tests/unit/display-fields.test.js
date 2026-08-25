/* 68-8 «Отображаемые поля» — набор колонок, пикер и форматтеры значений.
 * Запуск: node --test tests/unit/display-fields.test.js
 *
 * Шейпы значений замерены вживую на YouTrack 2025.3 и 2026.1 (спека §3): на 2025.3
 * localizedName у значений бандла приходит null, на 2026.1 — заполнен. */
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const path   = require('node:path');

const DF = require(path.join(__dirname, '..', '..', 'widgets', 'main', 'src', 'pure', 'display-fields-pure.js'));
const backend = require(path.join(__dirname, '..', '..', 'backend-project.js'));
const { validateSettings, ALLOWED_SETTINGS_KEYS, ADMIN_TIER_SETTINGS_KEYS } = backend;

/* ── набор колонок ───────────────────────────────────────────────────────── */

test('normRows: тримит имя, приводит флаги к bool, режет мусор', () => {
  assert.deepStrictEqual(
    DF.normRows([{ name: '  Оценка  ', summary: 1 }, null, { name: '' }, { summary: true }, 'x']),
    [{ name: 'Оценка', summary: true, role: false, my: false }]);
});

test('normRows: дедуп по имени — выживает первая строка', () => {
  const out = DF.normRows([{ name: 'A', summary: true }, { name: 'A', my: true }]);
  assert.deepStrictEqual(out, [{ name: 'A', summary: true, role: false, my: false }]);
});

test('normRows: cap 50 — лишние строки отбрасываются', () => {
  const raw = [];
  for (let i = 0; i < 60; i++) raw.push({ name: 'F' + i, summary: true });
  assert.strictEqual(DF.normRows(raw).length, DF.DF_MAX);
  assert.strictEqual(DF.DF_MAX, 50);
});

test('columnsFor: фильтр по таблице, порядок строк настроек, id с префиксом', () => {
  const rows = [{ name: 'Б', my: true }, { name: 'А', summary: true, my: true }];
  assert.deepStrictEqual(DF.columnsFor(rows, 'summary'), [{ id: 'cf_А', name: 'А' }]);
  assert.deepStrictEqual(DF.columnsFor(rows, 'my'),
    [{ id: 'cf_Б', name: 'Б' }, { id: 'cf_А', name: 'А' }]);
  assert.deepStrictEqual(DF.columnsFor(rows, 'role'), []);
  assert.deepStrictEqual(DF.columnsFor(rows, 'nosuch'), []);
});

test('colId: без слага — два похожих имени НЕ схлопываются в один id', () => {
  assert.notStrictEqual(DF.colId('My Field'), DF.colId('My-Field'));
  /* префикс обязателен: ключи ячеек state/title/estSum уже заняты */
  assert.strictEqual(DF.colId('state'), 'cf_state');
});

test('fingerprint меняется при правке состава — иначе кэш значений не сбросится', () => {
  const a = [{ name: 'A', summary: true }];
  assert.notStrictEqual(DF.fingerprint(a), DF.fingerprint(a.concat([{ name: 'B', my: true }])));
  /* строка без единой галочки в набор не входит */
  assert.strictEqual(DF.fingerprint([{ name: 'A' }]), '');
  assert.deepStrictEqual(DF.fieldNames(a), ['A']);
});

/* ── пикер ───────────────────────────────────────────────────────────────── */

const PROJECT_FIELDS = [
  { name: 'Оценка анализа', type: 'period' },
  { name: 'Приоритет', type: 'enum[1]' },
  { name: 'Заказчик', type: 'string' },
  { name: 'Срок', type: 'date' },
];

test('пикер исключает поля, занятые ключами field*/userField*', () => {
  const settings = { fieldPriority: 'Приоритет', userFieldAnalysis: 'Заказчик', fieldState: '' };
  const names = DF.pickerOptions(PROJECT_FIELDS, [], settings).map((o) => o.name);
  assert.deepStrictEqual(names, ['Оценка анализа', 'Срок']);
});

test('пикер исключает уже добавленные строки', () => {
  const names = DF.pickerOptions(PROJECT_FIELDS, [{ name: 'Срок' }], {}).map((o) => o.name);
  assert.deepStrictEqual(names, ['Оценка анализа', 'Приоритет', 'Заказчик']);
});

test('пикер берёт ЛЮБОЙ тип поля — date/string/period не отсекаются (⚖4)', () => {
  const types = DF.pickerOptions(PROJECT_FIELDS, [], {}).map((o) => o.type);
  assert.deepStrictEqual(types, ['period', 'enum[1]', 'string', 'date']);
});

test('occupiedNames игнорирует не-field-ключи и пустые значения', () => {
  assert.deepStrictEqual(DF.occupiedNames({ fieldA: 'X', userFieldB: '', standupDoneStates: ['Y'], zzz: 'W' }),
    { X: true });
});

/* ── форматтеры значений (спека §3) ──────────────────────────────────────── */

const cf = (name, value, type) => ({ name, value, $type: type || 'SimpleIssueCustomField' });

test('enum/state: localizedName || name + валидный цвет бандла', () => {
  assert.deepStrictEqual(
    DF.formatValue(cf('P', { name: 'Show-stopper', localizedName: 'Критическая',
      color: { background: '#ffdcdc', foreground: '#c22' } }, 'SingleEnumIssueCustomField')),
    { text: 'Критическая', bg: '#ffdcdc', fg: '#c22' });
  /* на YT 2025.3 localizedName приходит null — падаем на name */
  assert.strictEqual(DF.formatValue(cf('P', { name: 'Show-stopper', localizedName: null })).text, 'Show-stopper');
});

test('цвет из YouTrack валидируется: не-#hex не уходит в style', () => {
  const v = DF.formatValue(cf('P', { name: 'X', color: { background: 'url(javascript:alert(1))', foreground: 'red' } }));
  assert.deepStrictEqual(v, { text: 'X', bg: null, fg: null });
});

test('user → fullName; period → presentation', () => {
  assert.strictEqual(DF.formatValue(cf('U', { login: 'ivanov', fullName: 'Иванов И.' })).text, 'Иванов И.');
  assert.strictEqual(DF.formatValue(cf('E', { minutes: 480, presentation: '1d' })).text, '1d');
});

test('строка/число приходят примитивом как есть', () => {
  assert.strictEqual(DF.formatValue(cf('S', 'строковое значение')).text, 'строковое значение');
  assert.strictEqual(DF.formatValue(cf('N', 42)).text, '42');
});

test('date: epoch ms печатается ДАТОЙ без времени', () => {
  const v = DF.formatValue(cf('D', 1756036800000, 'DateIssueCustomField'), 'ru');
  assert.ok(/^\d{2}\.\d{2}\.\d{4}$/.test(v.text), 'формат dd.mm.yyyy без времени, получено: ' + v.text);
  assert.ok(!/:/.test(v.text), 'времени в ячейке быть не должно');
  /* тот же ms в integer-поле — обычное число, не дата */
  assert.strictEqual(DF.formatValue(cf('N', 1756036800000)).text, '1756036800000');
});

test('text: без подполя text приезжает пустышка → значения нет; с text — многострочный текст', () => {
  assert.strictEqual(DF.formatValue(cf('T', { $type: 'TextFieldValue' }, 'TextIssueCustomField')), null);
  assert.strictEqual(DF.formatValue(cf('T', { text: 'много\nстрок' }, 'TextIssueCustomField')).text, 'много\nстрок');
});

test('множественное значение — через запятую, без цвета', () => {
  const v = DF.formatValue(cf('V', [{ name: 'v1' }, { name: 'v2', color: { background: '#fff' } }], 'MultiVersionIssueCustomField'));
  assert.deepStrictEqual(v, { text: 'v1, v2', bg: null, fg: null });
  assert.strictEqual(DF.formatValue(cf('V', [], 'MultiVersionIssueCustomField')), null);
});

test('пустое значение → null («значения нет»), а не пустая строка', () => {
  assert.strictEqual(DF.formatValue(cf('X', null)), null);
  assert.strictEqual(DF.formatValue(cf('X', undefined)), null);
  assert.strictEqual(DF.formatValue(null), null);
});

test('valuesOf: имя берётся и из projectCustomField, лишние поля не попадают', () => {
  const issue = { idReadable: 'P-1', customFields: [
    { projectCustomField: { field: { name: 'Заказчик' } }, value: 'ООО «Ромашка»' },
    cf('Прочее', 'мимо'),
  ] };
  assert.deepStrictEqual(DF.valuesOf(issue, ['Заказчик']),
    { 'Заказчик': { text: 'ООО «Ромашка»', bg: null, fg: null } });
});

test('🔴 XSS: сырой HTML из значения поля остаётся ТЕКСТОМ, разметка не собирается', () => {
  /* реальный ответ YouTrack по строковому полю с разметкой в значении */
  const v = DF.formatValue(cf('S', 'строковое значение <b>тест</b>'));
  assert.strictEqual(v.text, 'строковое значение <b>тест</b>',
    'форматтер отдаёт СЫРОЕ значение — экранирование обязано случиться в ячейке (esc/React-текст)');
  assert.strictEqual(v.bg, null, 'plain-значение не превращается в чип, стилей не несёт');
});

/* ── регистрация ключа на бэке ───────────────────────────────────────────── */

test('displayFields — и в whitelist настроек, и в ADMIN_TIER (⚖11)', () => {
  assert.ok(ALLOWED_SETTINGS_KEYS.indexOf('displayFields') >= 0, 'без whitelist сейв реджектит ВЕСЬ блоб');
  assert.ok(ADMIN_TIER_SETTINGS_KEYS.indexOf('displayFields') >= 0,
    'без admin-тира правки планировочного менеджера молча теряются на сейве');
});

test('имя ключа не начинается с field/userField — иначе попадёт в allow-list записи полей задач', () => {
  assert.ok(!/^(field|userField)/.test('displayFields'));
});

test('validateSettings: корректный набор принимается', () => {
  assert.strictEqual(validateSettings({ displayFields: [{ name: 'Срок', summary: true, role: false, my: true }] }), true);
  assert.strictEqual(validateSettings({ displayFields: [] }), true);
  assert.strictEqual(validateSettings({ displayFields: null }), true);
});

test('validateSettings: cap 50, дедуп по name, тип флагов и имени', () => {
  const many = [];
  for (let i = 0; i < 51; i++) many.push({ name: 'F' + i });
  assert.strictEqual(validateSettings({ displayFields: many }), false, 'cap 50');
  assert.strictEqual(validateSettings({ displayFields: [{ name: 'A' }, { name: 'A' }] }), false, 'дедуп');
  assert.strictEqual(validateSettings({ displayFields: [{ name: '' }] }), false, 'пустое имя');
  assert.strictEqual(validateSettings({ displayFields: [{ name: 'A'.repeat(201) }] }), false, 'имя > 200');
  assert.strictEqual(validateSettings({ displayFields: [{ name: 'A', summary: 'yes' }] }), false, 'флаг не bool');
  assert.strictEqual(validateSettings({ displayFields: [{ name: 'A', role: null }] }), true, 'null-флаг допустим');
  assert.strictEqual(validateSettings({ displayFields: [['A']] }), false, 'строка-массив вместо объекта');
  assert.strictEqual(validateSettings({ displayFields: { name: 'A' } }), false, 'не массив');
});
