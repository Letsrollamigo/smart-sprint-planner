/* 68-8 — загрузчик значений «отображаемых полей»: дедуп волн, частичность, посев,
 * и главное — ЭКРАНИРОВАНИЕ значения в ячейке.
 * Запуск: node --test tests/unit/fieldvalues-loader.test.js */
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const path   = require('node:path');

const SRC = path.join(__dirname, '..', '..', 'widgets', 'main', 'src');

/* Мосты публикуются в window при загрузке модулей — поднимаем окружение до require. */
global.window = global.window || {};
require(path.join(SRC, 'pure', 'util-pure.js'));
require(path.join(SRC, 'pure', 'date-pure.js'));
require(path.join(SRC, 'pure', 'display-fields-pure.js'));
const FVL = require(path.join(SRC, 'infra', 'fieldvalues-loader.js'));

const ROWS = [{ name: 'Заказчик', summary: true, role: true, my: true }];
const SETTINGS = { displayFields: ROWS };

/* Хост-заглушка: считает запросы и отдаёт заранее заданные задачи (или падает). */
function mkHost(byChunk) {
  const calls = [];
  return {
    calls,
    fetchYouTrack(res, opts) {
      calls.push(opts.query.query);
      const r = byChunk(opts.query.query);
      return r instanceof Error ? Promise.reject(r) : Promise.resolve(r);
    },
  };
}

const issue = (id, value) => ({ idReadable: id, customFields: [{ name: 'Заказчик', value, $type: 'SimpleIssueCustomField' }] });

function prep(host, ids, extra) {
  return FVL.prepare(Object.assign({
    host, sprintId: 'S1', settings: SETTINGS, table: 'summary', ids, warnTitle: 'не загрузилось',
  }, extra || {}));
}

test('prepare: без настроенных колонок возвращает null — вью ничего не добавляет', () => {
  FVL.invalidate();
  assert.strictEqual(FVL.prepare({ host: mkHost(() => []), sprintId: 'S1', settings: {}, table: 'summary', ids: ['A-1'] }), null);
  assert.strictEqual(FVL.prepare({ host: null, sprintId: 'S1', settings: { displayFields: [{ name: 'X' }] }, table: 'summary', ids: [] }), null,
    'строка без единой галочки колонкой не становится');
});

test('prepare: колонки берутся по своей таблице, id с префиксом', () => {
  FVL.invalidate();
  const dyn = prep(mkHost(() => []), []);
  assert.deepStrictEqual(dyn.cols, [{ id: 'cf_Заказчик', name: 'Заказчик' }]);
});

test('инфлайт-дедуп: три таблицы стартуют разом — задачи запрашиваются ОДИН раз', async () => {
  FVL.invalidate();
  const host = mkHost(() => [issue('A-1', 'ООО')]);
  prep(host, ['A-1']);                                   /* сводная */
  prep(host, ['A-1'], { table: 'role' });                /* состав роли */
  prep(host, ['A-1'], { table: 'my' });                  /* «Моя роль» */
  await new Promise((r) => setImmediate(r));
  assert.strictEqual(host.calls.length, 1, 'тройная волна за одними и теми же задачами не ушла');
});

test('повторный рендер после загрузки не порождает нового запроса (нет цикла рендер↔фетч)', async () => {
  FVL.invalidate();
  const host = mkHost(() => [issue('A-1', 'ООО')]);
  prep(host, ['A-1']);
  await new Promise((r) => setImmediate(r));
  const after = host.calls.length;
  prep(host, ['A-1']);
  prep(host, ['A-1']);
  await new Promise((r) => setImmediate(r));
  assert.strictEqual(host.calls.length, after);
});

test('значения доезжают до ячейки; до загрузки ячейка пустая, после — «—» при отсутствии значения', async () => {
  FVL.invalidate();
  const host = mkHost(() => [issue('A-1', 'ООО «Ромашка»'), { idReadable: 'A-2', customFields: [] }]);
  let dyn = prep(host, ['A-1', 'A-2']);
  assert.strictEqual(dyn.cell('A-1', 'Заказчик'), '', 'ещё грузится — пусто, а не «—»');
  await new Promise((r) => setImmediate(r));
  dyn = prep(host, ['A-1', 'A-2']);
  assert.strictEqual(dyn.cell('A-1', 'Заказчик'), 'ООО «Ромашка»');
  assert.strictEqual(dyn.cell('A-2', 'Заказчик'), '—', 'загружено, значения нет');
});

test('🔴 XSS: значение с сырым HTML не собирается в разметку', async () => {
  FVL.invalidate();
  const host = mkHost(() => [
    issue('A-1', 'строковое значение <b>тест</b>'),
    { idReadable: 'A-2', customFields: [{ name: 'Заказчик', $type: 'SingleEnumIssueCustomField',
      value: { name: '<img src=x onerror=alert(1)>', color: { background: '#fee', foreground: '#900' } } }] },
  ]);
  prep(host, ['A-1', 'A-2']);
  await new Promise((r) => setImmediate(r));
  const dyn = prep(host, ['A-1', 'A-2']);

  /* plain-ячейка идёт React-текстом — экранирование по построению, esc НЕ применяем
     (двойное экранирование — уже ловленный в проекте баг, голден escape-once). */
  const plain = dyn.cell('A-1', 'Заказчик');
  assert.strictEqual(typeof plain, 'string');
  assert.strictEqual(plain, 'строковое значение <b>тест</b>', 'сырая строка, React отрисует её текстом');

  /* чип идёт {__html} — здесь esc обязателен */
  const chip = dyn.cell('A-2', 'Заказчик');
  assert.ok(chip && chip.__html, 'цветное значение бандла рисуется чипом');
  assert.ok(!/<img/.test(chip.__html), 'разметка из значения не попала в DOM: ' + chip.__html);
  assert.ok(chip.__html.indexOf('&lt;img') >= 0, 'значение экранировано');
  assert.ok(chip.__html.indexOf('background:#fee') >= 0, 'валидный цвет бандла применён');
});

test('цвет из YouTrack не подставляется сырым в style', async () => {
  FVL.invalidate();
  const host = mkHost(() => [{ idReadable: 'A-1', customFields: [{ name: 'Заказчик',
    $type: 'SingleEnumIssueCustomField', value: { name: 'X', color: { background: 'red;content:url(//evil)' } } }] }]);
  prep(host, ['A-1']);
  await new Promise((r) => setImmediate(r));
  const cell = prep(host, ['A-1']).cell('A-1', 'Заказчик');
  assert.strictEqual(cell, 'X', 'невалидный цвет отбракован → обычный текст, не чип');
});

test('ошибка чанка не глотается: задачи в failed, шапка получает признак, цикла нет', async () => {
  FVL.invalidate();
  const host = mkHost(() => new Error('boom'));
  prep(host, ['A-1']);
  await new Promise((r) => setImmediate(r));
  const dyn = prep(host, ['A-1']);
  assert.strictEqual(host.calls.length, 1, 'провалившаяся задача не перезапрашивается на каждый рендер');
  assert.ok(dyn.partial, 'набор помечен неполным');
  assert.strictEqual(typeof dyn.headerOf('Заказчик'), 'function', 'шапка колонки несёт признак');
  const hdr = dyn.headerOf('Заказчик')();
  assert.ok(hdr.__html.indexOf('Заказчик') >= 0);
});

test('успешная загрузка — шапка без признака (обычный заголовок)', async () => {
  FVL.invalidate();
  const host = mkHost(() => [issue('A-1', 'ООО')]);
  prep(host, ['A-1']);
  await new Promise((r) => setImmediate(r));
  assert.strictEqual(prep(host, ['A-1']).headerOf('Заказчик'), null);
});

test('смена состава колонок сбрасывает поколение — значения перезапрашиваются', async () => {
  FVL.invalidate();
  const host = mkHost(() => [issue('A-1', 'ООО')]);
  prep(host, ['A-1']);
  await new Promise((r) => setImmediate(r));
  assert.strictEqual(host.calls.length, 1);
  FVL.prepare({ host, sprintId: 'S1', table: 'summary', ids: ['A-1'],
    settings: { displayFields: ROWS.concat([{ name: 'Срок', summary: true }]) } });
  await new Promise((r) => setImmediate(r));
  assert.strictEqual(host.calls.length, 2, 'новый отпечаток состава = новое поколение');
});

test('seed: значения из чужого батча снимают пометку провала и избавляют от запроса', async () => {
  FVL.invalidate();
  const host = mkHost(() => new Error('boom'));
  prep(host, ['A-1']);
  await new Promise((r) => setImmediate(r));
  assert.ok(prep(host, ['A-1']).partial);

  const DFP = global.window.__SSP_DISPLAY_FIELDS_PURE;
  FVL.invalidate();
  FVL.seed('S1:' + DFP.fingerprint(ROWS), DFP.fieldNames(ROWS), [issue('A-1', 'ООО')]);
  const dyn = prep(host, ['A-1']);
  assert.strictEqual(dyn.partial, false, 'посев = ретрай: пометка снята');
  assert.strictEqual(dyn.cell('A-1', 'Заказчик'), 'ООО');
  assert.strictEqual(host.calls.length, 1, 'засеянные задачи повторно не запрашиваются');
});

test('seed форматирует дату той же локалью, что и обычная загрузка (регресс: язык терялся)', async () => {
  FVL.invalidate();
  const DATE_ROWS = [{ name: 'Срок', summary: true }];
  const DFP = global.window.__SSP_DISPLAY_FIELDS_PURE;
  const dated = { idReadable: 'A-1', customFields: [
    { name: 'Срок', $type: 'DateIssueCustomField', value: 1756036800000 }] };
  const key = 'S1:' + DFP.fingerprint(DATE_ROWS);

  const host = mkHost(() => [dated]);
  FVL.prepare({ host, sprintId: 'S1', settings: { displayFields: DATE_ROWS }, table: 'summary', ids: ['A-1'] });
  await new Promise((r) => setImmediate(r));
  const loaded = FVL.prepare({ host: null, sprintId: 'S1', settings: { displayFields: DATE_ROWS }, table: 'summary', ids: [] })
    .cell('A-1', 'Срок');

  FVL.invalidate();
  FVL.seed(key, DFP.fieldNames(DATE_ROWS), [dated]);
  const seeded = FVL.prepare({ host: null, sprintId: 'S1', settings: { displayFields: DATE_ROWS }, table: 'summary', ids: [] })
    .cell('A-1', 'Срок');

  assert.strictEqual(seeded, loaded, 'дата после «Обновить из задачи» печатается так же, как при обычной загрузке');
  assert.ok(!/:/.test(String(seeded)), 'без времени');
});

test('селектор фетча несёт text и $type — иначе текстовое поле приезжает пустышкой', () => {
  assert.ok(/\btext\b/.test(FVL.FIELDS), 'без подполя text TextIssueCustomField приходит пустым (спека §3)');
  assert.ok(FVL.FIELDS.indexOf('$type') >= 0, '$type различает дату и integer');
});
