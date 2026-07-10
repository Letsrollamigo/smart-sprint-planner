'use strict';

/* #50 S5b-i — примитив bulkAsOfEstimates + чистый разбор parseAsOfPeriodChunk + as-of picker
 * asOfPeriodMinutes. Гейтит A5 План-факт as-of реплей: значение period-поля оценки на момент
 * старт-якоря (lead.start), реконструкция НАЗАД от текущего (устойчива к срезу хвоста истории),
 * идентификация поля по field.id (не имя — RU-локализация), anchor-aware D7 (hitTop ⇒ чанк
 * incomplete), fail-loud на сетевом сбое. */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const pure = require(path.join(__dirname, '..', '..', 'widgets', 'main', 'src', 'pure', 'reporting-pure.js'));
const { parseAsOfPeriodChunk, asOfPeriodMinutes, computePlanFact } = pure;

/* data-модуль читает pure через window-мост в РАНТАЙМЕ (_pure()) — инжектим (node:test изолирует процесс per-file). */
global.window = { __SSP_REPORTING_PURE: pure };
const { bulkAsOfEstimates, bulkAnchorTransitions } = require(path.join(__dirname, '..', '..', 'widgets', 'main', 'src', 'data', 'reporting-data.js'));

/* Фабрика period-активности — РЕАЛЬНАЯ форма YT (added/removed = СКАЛЯР-минуты, bare number;
   подтверждено смоуком S5b на стенде: DEMO-8 Оценка 360→400 отдала added=400 removed=360). */
function pact(id, ts, toMin, fromMin, fieldId) {
  return {
    timestamp: ts,
    target: { idReadable: id },
    field: { id: fieldId || 'EST_ANALYSIS' },
    added: toMin,       /* bare number | null */
    removed: fromMin    /* bare number | null */
  };
}

// ─────────────────────────── asOfPeriodMinutes (pure picker) ───────────────────────────

test('asOfPeriodMinutes: нет переходов после asOfTs → текущее значение (не менялось)', () => {
  // менялось ДО среза (ts 500 < asOf 1000) → как есть на 1000 = current.
  const tl = [{ ts: 500, from: 20, to: 40 }];
  assert.equal(asOfPeriodMinutes(tl, 40, 1000), 40);
});

test('asOfPeriodMinutes: переход после asOfTs → значение ДО него (from самого раннего post-T)', () => {
  // на 1000: 40; на 2000 стало 62; текущее 62. As-of(1000) обязан вернуть 40, не 62.
  const tl = [{ ts: 2000, from: 40, to: 62 }];
  assert.equal(asOfPeriodMinutes(tl, 62, 1000), 40);
});

test('asOfPeriodMinutes: несколько post-T переходов → from САМОГО РАННЕГО', () => {
  // 40→50 (2000), 50→62 (3000); as-of(1000) = 40 (from раннего 2000), не 50.
  const tl = [{ ts: 2000, from: 40, to: 50 }, { ts: 3000, from: 50, to: 62 }];
  assert.equal(asOfPeriodMinutes(tl, 62, 1000), 40);
});

test('asOfPeriodMinutes: поле не задано на asOfTs (первое изменение после) → null', () => {
  // впервые установлено 30 на 2000 (from пусто → null); на 1000 поле было пусто.
  const tl = [{ ts: 2000, from: null, to: 30 }];
  assert.equal(asOfPeriodMinutes(tl, 30, 1000), null);
});

test('asOfPeriodMinutes: изменение РОВНО на asOfTs считается применённым (строгое > )', () => {
  // на 1000 меняется 40→62; as-of(1000) = 62 (изменение на границе уже применено) = current.
  const tl = [{ ts: 1000, from: 40, to: 62 }];
  assert.equal(asOfPeriodMinutes(tl, 62, 1000), 62);
});

test('asOfPeriodMinutes: asOfTs не число или пустой timeline → currentMin; нет post-T + current не число → null', () => {
  assert.equal(asOfPeriodMinutes([{ ts: 2000, from: 40, to: 62 }], 62, null), 62);
  assert.equal(asOfPeriodMinutes([], 55, 1000), 55);
  assert.equal(asOfPeriodMinutes(null, 55, 1000), 55);
  assert.equal(asOfPeriodMinutes([{ ts: 500, from: 40, to: 62 }], undefined, 1000), null); // нет post-T, current не число
  assert.equal(asOfPeriodMinutes([{ ts: 2000, from: 40, to: 62 }], 62, NaN), 62); // NaN-ts не проваливает в min-скан → current
});

// ─────────────────────────── parseAsOfPeriodChunk (pure разбор) ───────────────────────────

test('parseAsOfPeriodChunk: per-field хронологический таймлайн из reverse-активностей', () => {
  // reverse=true: новейшие первыми. Два изменения оценки Аналитика.
  const acts = [
    pact('D-1', 3000, 62, 40, 'EST_ANALYSIS'),
    pact('D-1', 1000, 40, 20, 'EST_ANALYSIS')
  ];
  const r = parseAsOfPeriodChunk(acts, ['D-1'], { fieldIds: ['EST_ANALYSIS'], topLimit: 300 });
  assert.deepEqual(r.timelines['D-1']['EST_ANALYSIS'].map((e) => e.ts), [1000, 3000]); // хронологически
  assert.deepEqual(r.timelines['D-1']['EST_ANALYSIS'].map((e) => e.to), [40, 62]);
  assert.deepEqual(r.timelines['D-1']['EST_ANALYSIS'].map((e) => e.from), [20, 40]);
  assert.deepEqual(r.incomplete, []);
  assert.equal(r.diag.hitTop, false);
});

test('parseAsOfPeriodChunk: чужое поле (не в fieldIds) игнорируется — фильтр по field.id', () => {
  const acts = [
    pact('D-1', 3000, 99, 88, 'EST_DEV'),        // другое поле оценки, не отслеживаем
    pact('D-1', 1000, 40, 20, 'EST_ANALYSIS')
  ];
  const r = parseAsOfPeriodChunk(acts, ['D-1'], { fieldIds: ['EST_ANALYSIS'], topLimit: 300 });
  assert.equal(r.timelines['D-1']['EST_DEV'], undefined);
  assert.deepEqual(r.timelines['D-1']['EST_ANALYSIS'].map((e) => e.to), [40]);
});

test('parseAsOfPeriodChunk: два разных поля оценки в одном чанке разложены по field.id', () => {
  const acts = [
    pact('D-1', 2000, 62, 40, 'EST_ANALYSIS'),
    pact('D-1', 1500, 30, null, 'EST_DEV')
  ];
  const r = parseAsOfPeriodChunk(acts, ['D-1'], { fieldIds: ['EST_ANALYSIS', 'EST_DEV'], topLimit: 300 });
  assert.deepEqual(r.timelines['D-1']['EST_ANALYSIS'].map((e) => e.to), [62]);
  assert.deepEqual(r.timelines['D-1']['EST_DEV'].map((e) => e.to), [30]);
  assert.equal(r.timelines['D-1']['EST_DEV'][0].from, null);   // впервые установлено
});

test('parseAsOfPeriodChunk: defensive — {minutes}-форма added/removed тоже парсится (иные версии YT)', () => {
  // На случай если какая-то версия/поле отдаст объект {minutes} вместо скаляра — не терять.
  const acts = [{ timestamp: 2000, target: { idReadable: 'D-1' }, field: { id: 'EST_ANALYSIS' },
    added: [{ minutes: 62, $type: 'PeriodValue' }], removed: { minutes: 40, $type: 'PeriodValue' } }];
  const r = parseAsOfPeriodChunk(acts, ['D-1'], { fieldIds: ['EST_ANALYSIS'], topLimit: 300 });
  assert.equal(r.timelines['D-1']['EST_ANALYSIS'][0].to, 62);
  assert.equal(r.timelines['D-1']['EST_ANALYSIS'][0].from, 40);
});

test('parseAsOfPeriodChunk: активность без .minutes (не period) отброшена', () => {
  const notPeriod = { timestamp: 2500, target: { idReadable: 'D-1' }, field: { id: 'EST_ANALYSIS' },
    added: [{ name: 'foo', $type: 'EnumBundleElement' }], removed: [] };  // нет minutes
  const acts = [notPeriod, pact('D-1', 1000, 40, 20, 'EST_ANALYSIS')];
  const r = parseAsOfPeriodChunk(acts, ['D-1'], { fieldIds: ['EST_ANALYSIS'], topLimit: 300 });
  assert.deepEqual(r.timelines['D-1']['EST_ANALYSIS'].map((e) => e.ts), [1000]);  // enum-запись отброшена
});

test('parseAsOfPeriodChunk: anchor-aware D7 — hitTop ⇒ ВЕСЬ чанк incomplete', () => {
  const acts = [pact('D-1', 3000, 62, 40, 'EST_ANALYSIS'), pact('D-1', 2000, 40, 20, 'EST_ANALYSIS')];
  // topLimit=2, length=2 → hitTop. Даже D-1 (нашли изменения) неполна: свежее могло быть срезано starvation.
  const r = parseAsOfPeriodChunk(acts, ['D-1', 'D-2'], { fieldIds: ['EST_ANALYSIS'], topLimit: 2 });
  assert.equal(r.diag.hitTop, true);
  assert.deepEqual(r.incomplete.slice().sort(), ['D-1', 'D-2']);
  assert.equal(r.diag.perIssueMax, 2);
});

test('parseAsOfPeriodChunk: не-массив activities → пусто, incomplete пуст (без обрезки)', () => {
  const r = parseAsOfPeriodChunk(null, ['D-1'], { fieldIds: ['EST_ANALYSIS'], topLimit: 300 });
  assert.equal(r.diag.activitiesReturned, 0);
  assert.deepEqual(r.incomplete, []);
  assert.deepEqual(Object.keys(r.timelines), []);
});

// ─────────────────────── bulkAsOfEstimates (orchestrator) ───────────────────────

function mockDeps(responder) {
  const calls = [];
  return {
    calls,
    host: { fetchYouTrack: function (pathArg, opts) { calls.push({ path: pathArg, query: opts.query }); return responder(opts.query.issueQuery); } },
    diag: function () {}
  };
}

test('bulkAsOfEstimates: чанкинг по 25 + as-of на момент старт-якоря per issue', async () => {
  const ids = [];
  for (let i = 1; i <= 30; i++) ids.push('D-' + i);
  const deps = mockDeps(function (q) {
    const idsInQ = q.replace('issue id: ', '').split(', ');
    // у каждой задачи одно изменение оценки 40→62 на ts=5000 (после старт-якоря 1000)
    return Promise.resolve(idsInQ.map(function (id) { return pact(id, 5000, 62, 40, 'EST_ANALYSIS'); }));
  });
  const asOfById = {}, currentById = {};
  ids.forEach(function (id) { asOfById[id] = 1000; currentById[id] = { EST_ANALYSIS: 62 }; });
  const r = await bulkAsOfEstimates(deps, ids, { fieldIds: ['EST_ANALYSIS'], asOfById: asOfById, currentById: currentById });
  assert.equal(deps.calls.length, 2);            // 25 + 5
  assert.equal(r.diag.chunks, 2);
  assert.equal(r.asOf['D-1'].EST_ANALYSIS, 40);  // на 1000 было 40 (62 — позже)
  assert.equal(r.asOf['D-30'].EST_ANALYSIS, 40);
  assert.equal(r.complete, true);
  assert.equal(deps.calls[0].query.categories, 'CustomFieldCategory');
  assert.equal(deps.calls[0].query.reverse, 'true');
});

test('bulkAsOfEstimates: нет изменений после старт-якоря → текущее значение', async () => {
  const deps = mockDeps(function () { return Promise.resolve([pact('D-1', 500, 40, 20, 'EST_ANALYSIS')]); }); // ts 500 < asOf 1000
  const r = await bulkAsOfEstimates(deps, ['D-1'], {
    fieldIds: ['EST_ANALYSIS'], asOfById: { 'D-1': 1000 }, currentById: { 'D-1': { EST_ANALYSIS: 40 } } });
  assert.equal(r.asOf['D-1'].EST_ANALYSIS, 40);  // не менялось после 1000 → current
});

test('bulkAsOfEstimates: hitTop чанк → incomplete, complete=false', async () => {
  const deps = mockDeps(function () {
    const flood = [];
    for (let i = 0; i < 300; i++) flood.push(pact('D-1', 5000 - i, 62, 40, 'EST_ANALYSIS'));
    return Promise.resolve(flood);
  });
  const r = await bulkAsOfEstimates(deps, ['D-1', 'D-2'], {
    fieldIds: ['EST_ANALYSIS'], asOfById: { 'D-1': 1000, 'D-2': 1000 }, currentById: {} });
  assert.equal(r.diag.hitTopChunks, 1);
  assert.deepEqual(r.incomplete.slice().sort(), ['D-1', 'D-2']);
  assert.equal(r.complete, false);
});

test('bulkAsOfEstimates: сетевой сбой чанка → все задачи incomplete (fail-loud)', async () => {
  const deps = mockDeps(function () { return Promise.reject(new Error('network')); });
  const r = await bulkAsOfEstimates(deps, ['D-1', 'D-2'], {
    fieldIds: ['EST_ANALYSIS'], asOfById: {}, currentById: {} });
  assert.deepEqual(r.incomplete.slice().sort(), ['D-1', 'D-2']);
  assert.equal(r.complete, false);
});

test('bulkAsOfEstimates: пустой список задач или полей → без фетча', async () => {
  const deps = mockDeps(function () { return Promise.resolve([]); });
  const r1 = await bulkAsOfEstimates(deps, [], { fieldIds: ['EST_ANALYSIS'] });
  const r2 = await bulkAsOfEstimates(deps, ['D-1'], { fieldIds: [] });
  assert.equal(deps.calls.length, 0);
  assert.equal(r1.complete, true);
  assert.equal(r2.complete, true);
});

// ─────────────────────── #50 S5b-ii — computePlanFact (движок) ───────────────────────

const ROLE_AN = { key: 'analysis', label: 'Аналитик', fieldId: 'F_AN' };

test('computePlanFact: знаковое ср. по всем задачам роли + overCount + строки только сверх порога', () => {
  const r = computePlanFact({
    issues: [{ id: 'D-1', summary: 'A' }, { id: 'D-2', summary: 'B' }, { id: 'D-3', summary: 'C' }],
    asOf: { 'D-1': { F_AN: 100 }, 'D-2': { F_AN: 100 }, 'D-3': { F_AN: 100 } },
    workItems: [{ issueId: 'D-1', author: 'ivan', minutes: 155 }, { issueId: 'D-2', author: 'ivan', minutes: 106 }, { issueId: 'D-3', author: 'ivan', minutes: 100 }],
    roleExecutors: { 'D-1': { analysis: 'ivan' }, 'D-2': { analysis: 'ivan' }, 'D-3': { analysis: 'ivan' } },
    roles: [ROLE_AN], incomplete: [], threshold: 20
  });
  const ru = r.rollups[0];
  assert.equal(ru.taskCount, 3);
  assert.ok(Math.abs(ru.avgVariancePct - (55 + 6 + 0) / 3) < 1e-9);   // знаковое среднее ≈ 20.33
  assert.equal(ru.overCount, 1);                                       // только +55 > 20
  assert.equal(ru.level, 'over');                                      // |20.33| > 20 (порог) = red
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].id, 'D-1');
  assert.ok(Math.abs(r.rows[0].variancePct - 55) < 1e-9);   // FP: 55.0000…1
  assert.equal(r.rows[0].asOfMin, 100);
  assert.equal(r.rows[0].factMin, 155);
  assert.equal(r.rows[0].level, 'over');                               // 55 > 40 (2×порог) = red pill
  assert.equal(r.populationCount, 3);
});

test('computePlanFact: знаковое среднее сокращает недо+пере (не avg|%|) → зелёная норма', () => {
  // +30 и −30 → знаковое ср = 0 (в норме), хотя avg|%| был бы 30 (красный). Проверяет решение владельца.
  const r = computePlanFact({
    issues: [{ id: 'D-1' }, { id: 'D-2' }],
    asOf: { 'D-1': { F_AN: 100 }, 'D-2': { F_AN: 100 } },
    workItems: [{ issueId: 'D-1', author: 'ivan', minutes: 130 }, { issueId: 'D-2', author: 'ivan', minutes: 70 }],
    roleExecutors: { 'D-1': { analysis: 'ivan' }, 'D-2': { analysis: 'ivan' } },
    roles: [ROLE_AN], threshold: 20
  });
  assert.equal(r.rollups[0].avgVariancePct, 0);
  assert.equal(r.rollups[0].level, 'ok');       // |0| ≤ 10 = green
  assert.equal(r.rollups[0].overCount, 2);      // но обе задачи |30|>20 → сверх порога (счётчик честен)
  assert.equal(r.rows.length, 2);
});

test('computePlanFact: guard asOf<=0|null → noEstimate, вне метрики (÷0)', () => {
  const r = computePlanFact({
    issues: [{ id: 'D-1' }, { id: 'D-2' }, { id: 'D-3' }],
    asOf: { 'D-1': { F_AN: 100 }, 'D-2': { F_AN: 0 }, 'D-3': {} },   // D-2 оценка 0, D-3 нет оценки
    workItems: [{ issueId: 'D-1', author: 'ivan', minutes: 150 }, { issueId: 'D-2', author: 'ivan', minutes: 50 }, { issueId: 'D-3', author: 'ivan', minutes: 50 }],
    roleExecutors: { 'D-1': { analysis: 'ivan' }, 'D-2': { analysis: 'ivan' }, 'D-3': { analysis: 'ivan' } },
    roles: [ROLE_AN], threshold: 20
  });
  assert.equal(r.rollups[0].taskCount, 1);        // только D-1
  assert.equal(r.rollups[0].noEstimate, 2);       // D-2 (0) + D-3 (null)
  assert.equal(r.rollups[0].avgVariancePct, 50);  // (150-100)/100
});

test('computePlanFact: incomplete (D7) исключены целиком', () => {
  const r = computePlanFact({
    issues: [{ id: 'D-1' }, { id: 'D-2' }],
    asOf: { 'D-1': { F_AN: 100 }, 'D-2': { F_AN: 100 } },
    workItems: [{ issueId: 'D-1', author: 'ivan', minutes: 200 }, { issueId: 'D-2', author: 'ivan', minutes: 105 }],
    roleExecutors: { 'D-1': { analysis: 'ivan' }, 'D-2': { analysis: 'ivan' } },
    roles: [ROLE_AN], incomplete: ['D-1'], threshold: 20
  });
  assert.equal(r.incompleteCount, 1);
  assert.equal(r.rollups[0].taskCount, 1);        // D-1 исключена
  assert.equal(r.rollups[0].avgVariancePct, 5);   // только D-2: (105-100)/100
  assert.equal(r.rows.length, 0);                 // D-1 (была бы +100%) не в строках
});

test('computePlanFact: ПЕРВОЕ совпадение роли — двойная роль одного человека не двоит факт', () => {
  // ivan = и аналитик, и тестировщик на D-1. workItems 130 → идут ПЕРВОЙ роли (analysis), testing факт=0.
  const r = computePlanFact({
    issues: [{ id: 'D-1' }],
    asOf: { 'D-1': { F_AN: 100, F_TE: 100 } },
    workItems: [{ issueId: 'D-1', author: 'ivan', minutes: 130 }],
    roleExecutors: { 'D-1': { analysis: 'ivan', testing: 'ivan' } },
    roles: [ROLE_AN, { key: 'testing', label: 'Тестировщик', fieldId: 'F_TE' }], threshold: 20
  });
  const an = r.rollups.find((x) => x.roleKey === 'analysis');
  const te = r.rollups.find((x) => x.roleKey === 'testing');
  assert.equal(an.avgVariancePct, 30);    // 130 vs 100 = +30% (весь факт ivan)
  assert.equal(te.avgVariancePct, -100);  // testing факт=0 → (0-100)/100 = -100% (НЕ +30 повторно)
});

test('computePlanFact: роль без укомплектованных задач → taskCount 0, level none', () => {
  const r = computePlanFact({
    issues: [{ id: 'D-1' }],
    asOf: { 'D-1': { F_AN: 100 } },
    workItems: [{ issueId: 'D-1', author: 'ivan', minutes: 150 }],
    roleExecutors: { 'D-1': { devPlatform: 'petr' } },   // analysis исполнителя нет
    roles: [ROLE_AN], threshold: 20
  });
  assert.equal(r.rollups[0].taskCount, 0);
  assert.equal(r.rollups[0].avgVariancePct, null);
  assert.equal(r.rollups[0].level, 'none');
});

test('computePlanFact: факт=0 при наличии оценки → −100% (планировали, не сделали)', () => {
  const r = computePlanFact({
    issues: [{ id: 'D-1' }],
    asOf: { 'D-1': { F_AN: 100 } },
    workItems: [],   // нет записей
    roleExecutors: { 'D-1': { analysis: 'ivan' } },
    roles: [ROLE_AN], threshold: 20
  });
  assert.equal(r.rollups[0].avgVariancePct, -100);
  assert.equal(r.rollups[0].overCount, 1);
  assert.equal(r.rows[0].variancePct, -100);
  assert.equal(r.rows[0].factMin, 0);
});

// ─────────────────── O1 (ревью #50): объединённый фетч anchors + estTimelines ───────────────────

test('O1: bulkAnchorTransitions с estFieldIds — ОДИН фетч кормит оба парсера', async () => {
  const calls = [];
  const deps = {
    host: { fetchYouTrack: (pth, o) => { calls.push(o.query); return Promise.resolve([
      { timestamp: 200, target: { idReadable: 'D-1' }, field: { id: 'STATE_FIELD', name: 'State' },
        added: [{ name: 'InProgress', localizedName: 'InProgress', $type: 'StateBundleElement' }],
        removed: [{ name: 'Open', localizedName: 'Open', $type: 'StateBundleElement' }] },
      pact('D-1', 100, 400, 360, 'EST_ANALYSIS'),
    ]); } },
    diag: () => {},
  };
  const r = await bulkAnchorTransitions(deps, ['D-1'],
    { fieldId: 'STATE_FIELD', anchorStates: ['InProgress'], estFieldIds: ['EST_ANALYSIS'] });
  assert.equal(calls.length, 1);                              // один запрос вместо двух
  assert.match(calls[0].fields, /minutes/);                   // union-проекция несёт period-значения
  assert.equal(r.anchors['D-1'].InProgress, 200);             // anchors-парсер отработал
  assert.equal(r.estTimelines['D-1'].EST_ANALYSIS.length, 1); // est-парсер отработал на ТОМ ЖЕ ответе
  assert.equal(r.complete, true);
});

test('O1: без estFieldIds — прежняя проекция, estTimelines отсутствует (обратная совместимость)', async () => {
  const calls = [];
  const deps = { host: { fetchYouTrack: (pth, o) => { calls.push(o.query); return Promise.resolve([]); } }, diag: () => {} };
  const r = await bulkAnchorTransitions(deps, ['D-1'], { fieldId: 'STATE_FIELD', anchorStates: [] });
  assert.equal(/minutes/.test(calls[0].fields), false);
  assert.equal(r.estTimelines, undefined);
});
