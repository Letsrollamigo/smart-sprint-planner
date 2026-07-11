'use strict';

/* #50 S3b — движок A2 TTM (pure/reporting-ttm.js) + data-layer помощники
 * (bulkAnchorTransitions / pauseIntervalsFromTimeline / _pairTagIntervals / combinePauses).
 * Гейтит: медиана odd/even/пусто, границы бакетов 40/120, слияние перекрытий пауз, клампинг
 * паузы к [start,end], свёртка эпик-детей, популяция по входу в конец-якорь (старт до окна
 * считается), end<start→null, риск-счётчик, исключение incomplete из медиан. */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const pure = require(path.join(__dirname, '..', '..', 'widgets', 'main', 'src', 'pure', 'reporting-pure.js'));
const ttm = require(path.join(__dirname, '..', '..', 'widgets', 'main', 'src', 'pure', 'reporting-ttm.js'));
const { median, bucketize, mergeIntervals, pauseWorkdays, foldChildUnits, computeTtm } = ttm;

/* data-модуль читает pure через window-мост в РАНТАЙМЕ — инжектим (node:test изолирует per-file). */
global.window = { __SSP_REPORTING_PURE: pure };
const data = require(path.join(__dirname, '..', '..', 'widgets', 'main', 'src', 'data', 'reporting-data.js'));

const DAY = 86400000;
const day = (n) => n * DAY;                                       // синтетический таймстемп «N-й день»
/* Календарно-дневной стаб workdaysBetween — арифметика медиан прозрачна (движок к нему нейтрален). */
const wd = (a, b) => (typeof a === 'number' && typeof b === 'number' && b > a) ? Math.round((b - a) / DAY) : 0;
const DEPS = { workdaysBetween: wd, agingLevel: pure.agingLevel };

function act(id, ts, toState, fromState, fieldId) {
  return {
    timestamp: ts,
    target: { idReadable: id },
    field: { id: fieldId || 'STATE_FIELD', name: 'State' },
    added: toState ? [{ name: toState, localizedName: toState, $type: 'StateBundleElement' }] : [],
    removed: fromState ? [{ name: fromState, localizedName: fromState, $type: 'StateBundleElement' }] : []
  };
}

// ─────────────────────────────── median ───────────────────────────────

test('median: нечётное → середина, чётное → среднее двух средних, пусто → null', () => {
  assert.equal(median([5, 1, 3]), 3);                            // odd
  assert.equal(median([1, 2, 3, 4]), 2.5);                       // even (дробное ок)
  assert.equal(median([]), null);                               // пусто
  assert.equal(median([7]), 7);
  assert.equal(median([NaN, Infinity, '4', 2, 4]), 3);           // нечисла отфильтрованы → [2,4] → 3
  assert.equal(median(null), null);
});

// ─────────────────────────────── bucketize ───────────────────────────────

test('bucketize: границы 40 и 120 включительно в нижнюю корзину (le / mid)', () => {
  // 40 → le40 (v<=40); 120 → mid (v<=120); 41 → mid; 121 → gt120.
  const r = bucketize([40, 41, 120, 121, 0, 200], [40, 120]);
  assert.deepEqual(r, { le40: 2, mid: 2, gt120: 2 });            // {0,40} / {41,120} / {121,200}
  assert.deepEqual(bucketize([], [40, 120]), { le40: 0, mid: 0, gt120: 0 });
  assert.deepEqual(bucketize([40], undefined), { le40: 1, mid: 0, gt120: 0 }); // дефолтные края
});

// ─────────────────────────────── mergeIntervals ───────────────────────────────

test('mergeIntervals: перекрытия/касания склеиваются, невалидные отброшены', () => {
  const r = mergeIntervals([
    { fromTs: 20, toTs: 25 }, { fromTs: 2, toTs: 6 }, { fromTs: 5, toTs: 9 }, // 2..9 склеены
    { fromTs: 9, toTs: 12 },                                                   // касание 9 → 2..12
    { fromTs: 50, toTs: 40 }                                                   // невалидный (to<=from) — отброшен
  ]);
  assert.deepEqual(r, [{ fromTs: 2, toTs: 12 }, { fromTs: 20, toTs: 25 }]);
});

// ─────────────────────────────── pauseWorkdays ───────────────────────────────

test('pauseWorkdays: паузы клампятся к [start,end], перекрытия НЕ вычитаются дважды, открытая → endTs', () => {
  const start = day(10), end = day(20);
  // пауза начинается ДО окна → клампится слева к 10; [5,15] → [10,15] = 5 дней
  assert.equal(pauseWorkdays([{ fromTs: day(5), toTs: day(15) }], start, end, wd), 5);
  // пауза уходит ЗА конец → клампится справа к 20; [18,30] → [18,20] = 2
  assert.equal(pauseWorkdays([{ fromTs: day(18), toTs: day(30) }], start, end, wd), 2);
  // открытая пауза (toTs=null) → до end; [12,null] → [12,20] = 8
  assert.equal(pauseWorkdays([{ fromTs: day(12), toTs: null }], start, end, wd), 8);
  // две ПЕРЕКРЫВАЮЩИЕСЯ паузы внутри окна → merge, счёт один раз: [11,15]+[13,17] → [11,17] = 6 (не 4+4=8)
  assert.equal(pauseWorkdays([{ fromTs: day(11), toTs: day(15) }, { fromTs: day(13), toTs: day(17) }], start, end, wd), 6);
  // пустые/битые входы → 0
  assert.equal(pauseWorkdays([], start, end, wd), 0);
  assert.equal(pauseWorkdays([{ fromTs: day(11), toTs: day(15) }], end, start, wd), 0); // end<=start
});

// ─────────────────────────────── foldChildUnits ───────────────────────────────

test('foldChildUnits: держим эпики и одиночные стори; стори-детей эпика отбрасываем; дедуп', () => {
  const r = foldChildUnits([
    { id: 'E1', type: 'epic' },
    { id: 'S1', type: 'story', parentIsEpic: false },  // одиночная — держим
    { id: 'S2', type: 'story', parentIsEpic: true },   // ребёнок эпика — свернуть (отбросить)
    { id: 'E1', type: 'epic' },                         // дубль — дедуп
    { id: 'T1', type: 'task' }                          // таск — не единица счёта
  ]);
  assert.deepEqual(r.map((u) => u.id), ['E1', 'S1']);
});

// ─────────────────────────────── computeTtm ───────────────────────────────

const CFG = {
  anchors: { lead: { start: 'InProgress', end: 'Done' }, team: { start: 'InProgress', end: 'Done' }, cycle: { start: 'Dev', end: 'Done' } },
  norms: { lead: 21, team: 15, cycle: null },
  buckets: [40, 120],
  riskDays: 80,
  populationMetric: 'lead'
};
const WIN = { fromTs: day(100), toTs: day(200) };                // окно популяции [100,200)

test('computeTtm: популяция по входу в КОНЕЦ-якорь в окне; старт ДО окна всё равно считается', () => {
  const units = [
    { id: 'E1', type: 'epic' },                                  // start day10 (задолго до окна), end day150 (в окне)
    { id: 'S1', type: 'story' },                                 // start day120, end day160 (в окне)
    { id: 'X9', type: 'story' },                                 // end day250 — ВНЕ окна → не в популяции
    { id: 'N0', type: 'epic' }                                   // нет входа в конец — не в популяции
  ];
  const anchorEntries = {
    E1: { InProgress: day(10), Done: day(150) },
    S1: { InProgress: day(120), Done: day(160) },
    X9: { InProgress: day(100), Done: day(250) },
    N0: { InProgress: day(90) }
  };
  const r = computeTtm(units, anchorEntries, {}, [], CFG, WIN, day(300), DEPS);
  assert.equal(r.populationCount, 2);                            // E1, S1 (X9/N0 вне популяции)
  assert.deepEqual(r.incomplete, []);
  // Lead-длительности: E1 = 150-10 = 140 (старт за окном не помешал), S1 = 160-120 = 40 → медиана 90.
  const lead = r.tiles.find((t) => t.metric === 'lead');
  assert.equal(lead.median, 90);
  assert.equal(lead.n, 2);
  assert.equal(lead.norm, 21);
  assert.equal(lead.level, 'over');                             // 90 > 21
  // Cycle настроен, но входов в 'Dev' нет → n=0, median=null, norm=null → level none.
  const cyc = r.tiles.find((t) => t.metric === 'cycle');
  assert.equal(cyc.median, null);
  assert.equal(cyc.level, 'none');
  // Строки по типам: epic{count1, lead140}, story{count1, lead40}.
  const epicRow = r.rows.find((x) => x.unitType === 'epic');
  const storyRow = r.rows.find((x) => x.unitType === 'story');
  assert.equal(epicRow.count, 1); assert.equal(epicRow.lead, 140);
  assert.equal(storyRow.count, 1); assert.equal(storyRow.lead, 40);
  // Бакеты Lead: 140>120 → gt120; 40<=40 → le40.
  assert.deepEqual(r.buckets, { le40: 1, mid: 0, gt120: 1 });
});

test('computeTtm: end<start (first-end раньше first-start) → длительность null, вне медианы', () => {
  const units = [{ id: 'A', type: 'story' }, { id: 'B', type: 'story' }];
  const anchorEntries = {
    A: { InProgress: day(160), Done: day(150) },                 // конец РАНЬШЕ старта — аномалия
    B: { InProgress: day(120), Done: day(150) }                  // норм: 30
  };
  const r = computeTtm(units, anchorEntries, {}, [], CFG, WIN, day(300), DEPS);
  assert.equal(r.populationCount, 2);                            // обе в популяции (обе доехали до Done в окне)
  const lead = r.tiles.find((t) => t.metric === 'lead');
  assert.equal(lead.n, 1);                                       // A даёт null → только B
  assert.equal(lead.median, 30);
});

test('computeTtm: паузы вычитаются из длительности (нетто), max(0,…)', () => {
  const units = [{ id: 'A', type: 'story' }];
  const anchorEntries = { A: { InProgress: day(100), Done: day(140) } }; // брутто 40
  const pauses = { A: [{ fromTs: day(110), toTs: day(120) }] };           // пауза 10
  const r = computeTtm(units, anchorEntries, pauses, [], CFG, WIN, day(300), DEPS);
  const lead = r.tiles.find((t) => t.metric === 'lead');
  assert.equal(lead.median, 30);                                // 40 - 10
});

test('computeTtm: incomplete (D7) исключены из медиан и вынесены в incomplete[]', () => {
  const units = [{ id: 'A', type: 'story' }, { id: 'B', type: 'story' }];
  const anchorEntries = {
    A: { InProgress: day(100), Done: day(150) },                 // 50 — но incomplete
    B: { InProgress: day(120), Done: day(160) }                  // 40 — usable
  };
  const r = computeTtm(units, anchorEntries, {}, new Set(['A']), CFG, WIN, day(300), DEPS);
  assert.deepEqual(r.incomplete, ['A']);
  assert.equal(r.populationCount, 1);                            // только B
  const lead = r.tiles.find((t) => t.metric === 'lead');
  assert.equal(lead.median, 40);                                // A не участвует
  assert.equal(lead.n, 1);
});

test('computeTtm: riskCount по ВСЕМ units — старт team есть, > riskDays, конца нет; incompleteSet как массив тоже ок', () => {
  const units = [
    { id: 'R1', type: 'story' },   // старт day0, now day100 → 100>80, конца нет → РИСК
    { id: 'R2', type: 'story' },   // старт day50, now day100 → 50, не >80 → не риск
    { id: 'R3', type: 'story' },   // старт day0, но конец есть → не риск
    { id: 'R4', type: 'story' }    // старта нет → не риск
  ];
  const anchorEntries = {
    R1: { InProgress: day(0) },
    R2: { InProgress: day(50) },
    R3: { InProgress: day(0), Done: day(90) },
    R4: {}
  };
  const r = computeTtm(units, anchorEntries, {}, [], CFG, WIN, day(100), DEPS);
  assert.equal(r.riskCount, 1);                                 // только R1
  assert.equal(r.populationCount, 0);                           // никто не доехал до Done В ОКНЕ [100,200)
});

test('computeTtm: реальный workdaysBetween из pure — проверка инъекции deps (будни)', () => {
  // 2026-06-01 (Пн) .. +7 календарных = 5 будней. Окно ловит вход в Done.
  const start = Date.UTC(2026, 5, 1), end = start + 7 * DAY;
  const units = [{ id: 'A', type: 'story' }];
  const anchorEntries = { A: { InProgress: start, Done: end } };
  const win = { fromTs: start, toTs: end + DAY };
  const r = computeTtm(units, anchorEntries, {}, [], CFG, win, end + DAY,
    { workdaysBetween: pure.workdaysBetween, agingLevel: pure.agingLevel });
  const lead = r.tiles.find((t) => t.metric === 'lead');
  assert.equal(lead.median, 5);                                 // 7 календарных = 5 будней
});

// ─────────────────── data-layer: pauseIntervalsFromTimeline / combine ───────────────────

test('pauseIntervalsFromTimeline: вход в пауза-статус → [ts, ts_следующего); последний → toTs=null', () => {
  const timeline = [
    { ts: day(1), to: 'InProgress' },
    { ts: day(3), to: 'OnHold' },       // пауза начинается
    { ts: day(6), to: 'InProgress' },   // пауза закончилась
    { ts: day(9), to: 'OnHold' }        // снова пауза, НЕ покинута → открытая
  ];
  const r = data.pauseIntervalsFromTimeline(timeline, ['OnHold']);
  assert.deepEqual(r, [{ fromTs: day(3), toTs: day(6) }, { fromTs: day(9), toTs: null }]);
});

test('combinePauses: паузы-статусы ++ паузы-теги на одну задачу', () => {
  const timelines = { A: [{ ts: day(2), to: 'OnHold' }, { ts: day(4), to: 'InProgress' }] };
  const tagIv = { A: [{ fromTs: day(10), toTs: day(12) }], B: [{ fromTs: day(1), toTs: null }] };
  const r = data.combinePauses(timelines, ['OnHold'], tagIv);
  assert.deepEqual(r.A, [{ fromTs: day(2), toTs: day(4) }, { fromTs: day(10), toTs: day(12) }]);
  assert.deepEqual(r.B, [{ fromTs: day(1), toTs: null }]);   // только теги
});

// ─────────────────── data-layer: _pairTagIntervals (паринг тегов) ───────────────────

test('_pairTagIntervals: add→remove в интервалы; открытый (без remove) → toTs=null; чужие теги игнор', () => {
  const tagSet = { Blocked: true };
  const acts = [
    // приходят в ЛЮБОМ порядке (reverse=true с прода) — сортируем по ts внутри
    { timestamp: day(6), target: { idReadable: 'P-1' }, added: [], removed: [{ name: 'Blocked' }] },  // снят
    { timestamp: day(3), target: { idReadable: 'P-1' }, added: [{ name: 'Blocked' }], removed: [] },  // повешен
    { timestamp: day(9), target: { idReadable: 'P-1' }, added: [{ name: 'Blocked' }], removed: [] },  // снова повешен (открытый)
    { timestamp: day(2), target: { idReadable: 'P-2' }, added: [{ name: 'Other' }], removed: [] }     // чужой тег
  ];
  const r = data._pairTagIntervals(acts, tagSet);
  assert.deepEqual(r['P-1'], [{ fromTs: day(3), toTs: day(6) }, { fromTs: day(9), toTs: null }]);
  assert.equal(r['P-2'], undefined);                          // Other не отслеживается
});

test('_pairTagIntervals: remove без предшествующего add игнорируется (нет висячих интервалов)', () => {
  const r = data._pairTagIntervals(
    [{ timestamp: day(5), target: { idReadable: 'P-1' }, added: [], removed: [{ name: 'Blocked' }] }],
    { Blocked: true });
  assert.deepEqual(r['P-1'], []);
});

// ─────────────────── data-layer: bulkAnchorTransitions (orchestrator) ───────────────────

function mockDeps(responder) {
  const calls = [];
  return {
    calls,
    host: { fetchYouTrack: function (p, opts) { calls.push(opts.query); return responder(opts.query); } },
    diag: function () {}
  };
}

test('bulkAnchorTransitions: чанкинг по 25, merge anchors/timelines, complete', async () => {
  const ids = [];
  for (let i = 1; i <= 30; i++) ids.push('P-' + i);
  const deps = mockDeps(function (q) {
    const idsInQ = q.issueQuery.replace('issue id: ', '').split(', ');
    return Promise.resolve(idsInQ.map((id) => act(id, day(5), 'InProgress', 'Open', 'STATE_FIELD')));
  });
  const r = await data.bulkAnchorTransitions(deps, ids, { fieldId: 'STATE_FIELD', anchorStates: ['InProgress'] });
  assert.equal(deps.calls.length, 2);                          // 25 + 5
  assert.equal(deps.calls[0].categories, 'CustomFieldCategory');
  assert.equal(Object.keys(r.anchors).length, 30);
  assert.equal(r.anchors['P-1'].InProgress, day(5));
  assert.deepEqual(r.timelines['P-1'], [{ ts: day(5), from: 'Open', to: 'InProgress' }]);   /* #50 B0 — .from добавлен (as-of реконструкция) */
  assert.equal(r.complete, true);
  assert.deepEqual(r.incomplete, []);
});

test('bulkAnchorTransitions: hitTop-чанк ⇒ все его задачи incomplete, complete=false', async () => {
  const deps = mockDeps(function () {
    const flood = [];
    for (let i = 0; i < 300; i++) flood.push(act('P-1', day(9) - i, 'InProgress', 'Open', 'STATE_FIELD'));
    return Promise.resolve(flood);                             // 300 = TOP_LIMIT → hitTop
  });
  const r = await data.bulkAnchorTransitions(deps, ['P-1', 'P-2'], { fieldId: 'STATE_FIELD', anchorStates: ['InProgress'] });
  assert.equal(r.diag.hitTopChunks, 1);
  assert.deepEqual(r.incomplete.slice().sort(), ['P-1', 'P-2']);
  assert.equal(r.complete, false);
});

// ─────────────────── #50 D10 · прерывание отчёта (S-SAFE SAFE-a) ───────────────────

test('D10: shouldAbort между чанками → REPORT_ABORTED, поток остановлен после 1-го чанка', async () => {
  const ids = []; for (let i = 1; i <= 30; i++) ids.push('P-' + i);   // 25+5 = 2 чанка
  const deps = mockDeps(function (q) {
    const inQ = q.issueQuery.replace('issue id: ', '').split(', ');
    return Promise.resolve(inQ.map((id) => act(id, day(5), 'InProgress', 'Open', 'STATE_FIELD')));
  });
  // прерываем ПОСЛЕ первого фетча (проверка перед чанком: 0→fetch, 1→abort)
  const opts = { fieldId: 'STATE_FIELD', anchorStates: ['InProgress'], shouldAbort: () => deps.calls.length >= 1 };
  await assert.rejects(() => data.bulkAnchorTransitions(deps, ids, opts), (e) => !!(e && e.__reportAborted));
  assert.equal(deps.calls.length, 1);                          // 2-й чанк НЕ ушёл — флуд остановлен
});

test('D10: shouldAbort с самого начала → 0 фетчей; без shouldAbort — как раньше', async () => {
  const deps = mockDeps(function (q) {
    const inQ = q.issueQuery.replace('issue id: ', '').split(', ');
    return Promise.resolve(inQ.map((id) => act(id, day(5), 'InProgress', 'Open', 'STATE_FIELD')));
  });
  await assert.rejects(() => data.bulkStateTransitions(deps, ['P-1', 'P-2'], { fieldId: 'STATE_FIELD', shouldAbort: () => true }),
    (e) => !!(e && e.__reportAborted));
  assert.equal(deps.calls.length, 0);                          // прервано до первого запроса
  // без shouldAbort — обычная работа (регресс, поведение не изменилось)
  const r = await data.bulkStateTransitions(deps, ['P-9'], { fieldId: 'STATE_FIELD' });
  assert.equal(deps.calls.length, 1);
  assert.equal(r.complete, true);
});

test('bulkAnchorTransitions: сетевой сбой чанка → все задачи incomplete (fail-loud)', async () => {
  const deps = mockDeps(function () { return Promise.reject(new Error('network')); });
  const r = await data.bulkAnchorTransitions(deps, ['P-1', 'P-2'], { fieldId: 'STATE_FIELD', anchorStates: ['InProgress'] });
  assert.deepEqual(r.incomplete.slice().sort(), ['P-1', 'P-2']);
  assert.equal(r.complete, false);
});

test('bulkPauseTagIntervals: фетч отдельной категории тегов + паринг; needsSmokeVerify флаг', async () => {
  const deps = mockDeps(function (q) {
    assert.equal(q.categories, data.PAUSE_TAG_CATEGORY);       // ОТДЕЛЬНАЯ категория (не CustomFieldCategory)
    return Promise.resolve([
      { timestamp: day(3), target: { idReadable: 'P-1' }, added: [{ name: 'Blocked' }], removed: [] },
      { timestamp: day(6), target: { idReadable: 'P-1' }, added: [], removed: [{ name: 'Blocked' }] }
    ]);
  });
  const r = await data.bulkPauseTagIntervals(deps, ['P-1'], { tags: ['Blocked'] });
  assert.deepEqual(r.intervals['P-1'], [{ fromTs: day(3), toTs: day(6) }]);
  assert.equal(r.diag.needsSmokeVerify, true);                 // живая форма — под смоук S3d
  assert.equal(r.complete, true);
});

test('bulkPauseTagIntervals: чанк с activities >= TOP_LIMIT → issues чанка incomplete (D7 hitTop, ревью #50)', async () => {
  const flood = [];
  for (let i = 0; i < data.TOP_LIMIT; i++) {
    flood.push({ timestamp: day(1) + i, target: { idReadable: 'P-1' }, added: [], removed: [] });
  }
  const deps = mockDeps(function () { return Promise.resolve(flood); });   // ровно 300 → окно могло обрезаться
  const r = await data.bulkPauseTagIntervals(deps, ['P-1', 'P-2'], { tags: ['Blocked'] });
  assert.equal(r.complete, false);                             // НЕ молча: старый add мог быть срезан
  assert.deepEqual(r.incomplete.slice().sort(), ['P-1', 'P-2']);
  assert.equal(r.diag.hitTopChunks, 1);
});

// ═══════════════════ §S4 · A8 Bottleneck (computeBottleneck) ═══════════════════
const { computeBottleneck, computeRework } = ttm;
const FLOW = ['Analysis', 'Wait', 'Dev', 'Test'];

/* Хелпер: timeline из [ [state, dayN], … ] в хронологии. */
function tline() { const a = Array.prototype.slice.call(arguments); return a.map(function (p) { return { to: p[0], ts: day(p[1]) }; }); }

test('A8 dwell: по одному интервалу на статус + открытый последний до now', () => {
  const timelines = { 'I-1': tline(['Analysis', 0], ['Wait', 3], ['Dev', 8]) };
  const r = computeBottleneck(timelines, {}, [], { flowStates: FLOW }, day(10), DEPS);
  const by = {}; r.states.forEach((s) => { by[s.state] = s; });
  assert.equal(by.Analysis.median, 3);          // 0→3
  assert.equal(by.Wait.median, 5);              // 3→8
  assert.equal(by.Dev.median, 2);               // 8→now(10) — открытый интервал включён
  assert.equal(by.Test.median, null);           // не посещён
  assert.equal(by.Test.n, 0);
  assert.equal(r.states.map((s) => s.state).join(','), FLOW.join(',')); // порядок = flowStates
  assert.equal(r.populationCount, 1);
});

test('A8 WIP: текущий статус = последний .to (fallback без currentStates)', () => {
  const timelines = {
    'I-1': tline(['Analysis', 0], ['Wait', 2]),   // сейчас в Wait
    'I-2': tline(['Analysis', 0], ['Dev', 4])      // сейчас в Dev
  };
  const r = computeBottleneck(timelines, {}, [], { flowStates: FLOW }, day(6), DEPS);
  const by = {}; r.states.forEach((s) => { by[s.state] = s; });
  assert.equal(by.Wait.wip, 1);
  assert.equal(by.Dev.wip, 1);
  assert.equal(by.Analysis.wip, 0);
});

test('A8 WIP: currentStates даёт точный WIP, включая задачу без переходов (стартовый статус)', () => {
  const timelines = { 'I-1': tline(['Analysis', 0], ['Dev', 3]) };
  const currentStates = { 'I-1': 'Dev', 'I-2': 'Analysis' };   // I-2 без переходов, сидит в Analysis
  const r = computeBottleneck(timelines, {}, [], { flowStates: FLOW, currentStates: currentStates }, day(6), DEPS);
  const by = {}; r.states.forEach((s) => { by[s.state] = s; });
  assert.equal(by.Analysis.wip, 1);            // I-2 (0 переходов) учтён через currentStates
  assert.equal(by.Dev.wip, 1);                 // I-1
  assert.equal(r.populationCount, 2);          // население = currentStates (полный отбор)
});

test('A8 dwell: повторный заход = отдельный сэмпл (медиана по визитам)', () => {
  const timelines = { 'I-1': tline(['Analysis', 0], ['Dev', 2], ['Test', 5], ['Dev', 7], ['Test', 9]) };
  const r = computeBottleneck(timelines, {}, [], { flowStates: FLOW }, day(9), DEPS);
  const by = {}; r.states.forEach((s) => { by[s.state] = s; });
  assert.equal(by.Dev.n, 2);                   // два визита в Dev: [2→5]=3 и [7→9]=2
  assert.equal(by.Dev.median, 2.5);            // median([3,2]) = 2.5
});

test('A8 dwell: паузы вычитаются из интервала статуса', () => {
  const timelines = { 'I-1': tline(['Dev', 0], ['Test', 10]) };
  const pauses = { 'I-1': [{ fromTs: day(2), toTs: day(5) }] };   // 3 дня паузы внутри Dev
  const r = computeBottleneck(timelines, pauses, [], { flowStates: FLOW }, day(12), DEPS);
  const by = {}; r.states.forEach((s) => { by[s.state] = s; });
  assert.equal(by.Dev.median, 7);              // брутто 10 − 3 паузы = 7
});

test('A8: incomplete (D7) исключены из агрегатов и попадают в incomplete[]', () => {
  const timelines = {
    'I-1': tline(['Analysis', 0], ['Dev', 4]),
    'BAD': tline(['Analysis', 0], ['Dev', 4])
  };
  const r = computeBottleneck(timelines, {}, ['BAD'], { flowStates: FLOW }, day(6), DEPS);
  assert.equal(r.populationCount, 1);
  assert.deepEqual(r.incomplete, ['BAD']);
  const by = {}; r.states.forEach((s) => { by[s.state] = s; });
  assert.equal(by.Analysis.n, 1);              // только I-1
});

test('A8: статус вне потока игнорируется, соседи бьются по фактическим ts', () => {
  const timelines = { 'I-1': tline(['Analysis', 0], ['Side', 3], ['Dev', 5]) };  // Side ∉ FLOW
  const r = computeBottleneck(timelines, {}, [], { flowStates: FLOW }, day(8), DEPS);
  const by = {}; r.states.forEach((s) => { by[s.state] = s; });
  assert.equal(by.Analysis.median, 3);         // 0→3 (интервал до Side)
  assert.equal(by.Dev.median, 3);              // 5→now(8)
  assert.equal(by.Wait.n, 0);
});

test('A8: level = agingLevel(median, thresholds[state])', () => {
  const timelines = { 'I-1': tline(['Dev', 0], ['Test', 12]) };  // Dev dwell = 12
  const cfg = { flowStates: FLOW, thresholds: { Dev: { yellow: 5, red: 10 } } };
  const r = computeBottleneck(timelines, {}, [], cfg, day(12), DEPS);
  const by = {}; r.states.forEach((s) => { by[s.state] = s; });
  assert.equal(by.Dev.level, 'over');          // 12 > red(10)
  assert.equal(by.Analysis.level, 'none');     // нет данных
});

// ═══════════════════ §S4 · A9 Rework (computeRework) ═══════════════════

test('A9: обратный переход против порядка потока детектится', () => {
  const timelines = { 'I-1': tline(['Analysis', 0], ['Dev', 2], ['Test', 4], ['Dev', 6]) }; // Test→Dev откат
  const r = computeRework(timelines, [], { flowStates: FLOW }, {});
  assert.equal(r.totalBack, 1);
  assert.equal(r.issuesWithReopen, 1);
  assert.equal(r.populationCount, 1);
  assert.deepEqual(r.byTransition, [{ from: 'Test', to: 'Dev', count: 1, issueIds: ['I-1'] }]);
});

test('A9: чисто прямой поток → 0 откатов', () => {
  const timelines = { 'I-1': tline(['Analysis', 0], ['Wait', 2], ['Dev', 4], ['Test', 6]) };
  const r = computeRework(timelines, [], { flowStates: FLOW }, {});
  assert.equal(r.totalBack, 0);
  assert.equal(r.issuesWithReopen, 0);
  assert.deepEqual(r.byTransition, []);
});

test('A9: окно [from,to) режет откаты по ts перехода', () => {
  const timelines = { 'I-1': tline(['Analysis', 0], ['Dev', 2], ['Test', 4], ['Dev', 6]) }; // откат в day6
  assert.equal(computeRework(timelines, [], { flowStates: FLOW }, { fromTs: day(0), toTs: day(5) }).totalBack, 0); // day6 вне
  assert.equal(computeRework(timelines, [], { flowStates: FLOW }, { fromTs: day(5), toTs: day(10) }).totalBack, 1); // day6 внутри
});

test('A9: incomplete (D7) исключены целиком', () => {
  const timelines = { 'BAD': tline(['Analysis', 0], ['Test', 2], ['Dev', 4]) }; // Test→Dev откат, но BAD incomplete
  const r = computeRework(timelines, ['BAD'], { flowStates: FLOW }, {});
  assert.equal(r.totalBack, 0);
  assert.equal(r.populationCount, 0);
  assert.deepEqual(r.incomplete, ['BAD']);
});

test('A9: reopen из терминального статуса ловится, только если он в flowStates', () => {
  const flowWithDone = ['Analysis', 'Dev', 'Test', 'Done'];
  const timelines = { 'I-1': tline(['Dev', 0], ['Done', 3], ['Test', 5]) };  // Done→Test reopen
  assert.equal(computeRework(timelines, [], { flowStates: flowWithDone }, {}).totalBack, 1);   // Done в потоке
  assert.equal(computeRework(timelines, [], { flowStates: FLOW }, {}).totalBack, 0);           // Done вне потока → Done-переходы игнор
});

test('A9: byTransition отсортирован по count ↓, issueIds собраны', () => {
  const timelines = {
    'I-1': tline(['Analysis', 0], ['Test', 2], ['Dev', 4]),     // Test→Dev
    'I-2': tline(['Analysis', 0], ['Test', 2], ['Dev', 4]),     // Test→Dev
    'I-3': tline(['Analysis', 0], ['Dev', 2], ['Analysis', 4])  // Dev→Analysis
  };
  const r = computeRework(timelines, [], { flowStates: FLOW }, {});
  assert.equal(r.totalBack, 3);
  assert.equal(r.issuesWithReopen, 3);
  assert.equal(r.byTransition[0].from + '→' + r.byTransition[0].to, 'Test→Dev'); // count 2 первым
  assert.equal(r.byTransition[0].count, 2);
  assert.deepEqual(r.byTransition[0].issueIds.sort(), ['I-1', 'I-2']);
});

// ═══════════════ §S4 · регресс адверсариальной верификации (4 бага) ═══════════════

test('A8 регресс#1: нулевой визит (enter==leave) даёт валидный 0-сэмпл (консистентно с same-day)', () => {
  // B посещён мгновенно (day5→day5), затем реально (day7→now day9).
  const timelines = { I1: tline(['B', 5], ['A', 5], ['B', 7]) };
  const r = computeBottleneck(timelines, {}, [], { flowStates: ['A', 'B'] }, day(9), DEPS);
  const B = r.states.find((s) => s.state === 'B');
  assert.equal(B.n, 2);                          // оба визита: [0, 2]
  assert.equal(B.median, 1);                     // median([0,2])
});

test('A8 регресс#2: null-ts у среднего перехода НЕ роняет leave в now (нет double-count хвоста)', () => {
  const timelines = { I1: [{ to: 'A', ts: day(5) }, { to: 'B', ts: null }, { to: 'C', ts: day(7) }] };
  const r = computeBottleneck(timelines, {}, [], { flowStates: ['A', 'B', 'C'] }, day(30), DEPS);
  const by = {}; r.states.forEach((s) => { by[s.state] = s; });
  assert.equal(by.A.median, 2);                  // 5→7 (следующий валидный переход), НЕ 5→30
  assert.equal(by.B.n, 0);                        // null-ts B отфильтрован
  assert.equal(by.C.median, 23);                  // 7→30 открытый
});

test('A8 регресс#3: имя-статуса = прототипный ключ не роняет расчёт (null-proto мапы)', () => {
  const timelines = { X: [{ to: '__proto__', ts: day(1) }, { to: '__proto__', ts: day(3) }] };
  let r;
  assert.doesNotThrow(() => {
    r = computeBottleneck(timelines, {}, [], { flowStates: ['__proto__', 'constructor'] }, day(5), DEPS);
  });
  assert.equal(r.states.length, 2);
  assert.equal(r.states[0].state, '__proto__');
  assert.equal(r.states[0].n, 2);                 // day1→day3 и day3→now day5
});

test('A8/A9 регресс#4: NaN-ts не даёт фантомный сэмпл (isFinite-санитайз)', () => {
  const timelines = { X: [{ to: 'A', ts: NaN }, { to: 'B', ts: day(10) }] };
  const b = computeBottleneck(timelines, {}, [], { flowStates: ['A', 'B'] }, day(20), DEPS);
  const A = b.states.find((s) => s.state === 'A');
  assert.equal(A.n, 0);                           // NaN-вход A отфильтрован (не фантомный 0)
  assert.equal(A.median, null);
  // A9: обратный переход с NaN-ts не попадает ни в какое конечное окно.
  const tl2 = { X: [{ to: 'B', ts: day(2) }, { to: 'A', ts: NaN }] };  // B→A откат, но ts=NaN
  const w = computeRework(tl2, [], { flowStates: ['A', 'B'] }, { fromTs: day(0), toTs: day(10) });
  assert.equal(w.totalBack, 0);
});

// ─────────────── computeTtm: терминальная политика + точный Cycle (v3.2.0, US-A2-02) ───────────────

/* Reopen-сценарий: InProgress@10 → Dev@20 → Done@50 → Dev@60 (reopen) → Done@90.
   Первые входы (как parseAnchorsChunk.anchors): InProgress=10, Dev=20, Done=50.
   Эпизоды cycle (Dev→Done): [20,50] = 30 дн и [60,90] = 30 дн. */
const TP_ANCHORS = { R1: { InProgress: day(10), Dev: day(20), Done: day(50) } };
const TP_TIMELINES = { R1: [
  { ts: day(10), from: 'Open', to: 'InProgress' },
  { ts: day(20), from: 'InProgress', to: 'Dev' },
  { ts: day(50), from: 'Dev', to: 'Done' },
  { ts: day(60), from: 'Done', to: 'Dev' },
  { ts: day(90), from: 'Dev', to: 'Done' }
] };
const TP_UNITS = [{ id: 'R1', type: 'story' }];
const tile = (res, m) => res.tiles.find((t) => t.metric === m);

test('computeTtm ХАРАКТЕРИЗАЦИЯ: без timelines reopen НЕ продлевает (first-close из первых входов)', () => {
  const res = computeTtm(TP_UNITS, TP_ANCHORS, {}, null, CFG, { fromTs: day(40), toTs: day(100) }, day(300), DEPS);
  assert.equal(res.populationCount, 1);                          // Done первый вход @50 ∈ [40,100)
  assert.equal(tile(res, 'lead').median, 40);                    // 10→50
  assert.equal(tile(res, 'cycle').median, 30);                   // span первых входов 20→50
});

test('computeTtm: timelines + дефолт first-close ≡ прежнее поведение (lead 40, cycle = 1-й эпизод 30)', () => {
  const res = computeTtm(TP_UNITS, TP_ANCHORS, {}, null, CFG, { fromTs: day(40), toTs: day(100) }, day(300), DEPS, TP_TIMELINES);
  assert.equal(res.populationCount, 1);
  assert.equal(tile(res, 'lead').median, 40);
  assert.equal(tile(res, 'cycle').median, 30);                   // только первый закрытый эпизод
});

test('computeTtm: last-stable-close — конец метрики и ОКНО популяции по ПОСЛЕДНЕМУ входу; cycle = Σ эпизодов', () => {
  const cfg = Object.assign({}, CFG, { terminalPolicy: 'last-stable-close' });
  // Окно ловит последний вход @90 (первый @50 — вне окна): популяция сдвинулась на устоявшееся закрытие.
  const res = computeTtm(TP_UNITS, TP_ANCHORS, {}, null, cfg, { fromTs: day(60), toTs: day(100) }, day(300), DEPS, TP_TIMELINES);
  assert.equal(res.populationCount, 1);
  assert.equal(tile(res, 'lead').median, 80);                    // 10→90 (последний Done)
  assert.equal(tile(res, 'cycle').median, 60);                   // 30 + 30 — межэпизодный простой [50,60] НЕ считается
  // Окно вокруг ПЕРВОГО входа при last-stable уже НЕ ловит задачу.
  const res2 = computeTtm(TP_UNITS, TP_ANCHORS, {}, null, cfg, { fromTs: day(40), toTs: day(60) }, day(300), DEPS, TP_TIMELINES);
  assert.equal(res2.populationCount, 0);
});

test('computeTtm: last-stable-close БЕЗ timelines — деградация к первым входам (fail-safe)', () => {
  const cfg = Object.assign({}, CFG, { terminalPolicy: 'last-stable-close' });
  const res = computeTtm(TP_UNITS, TP_ANCHORS, {}, null, cfg, { fromTs: day(40), toTs: day(100) }, day(300), DEPS);
  assert.equal(res.populationCount, 1);                          // по первому входу @50
  assert.equal(tile(res, 'lead').median, 40);
});

test('computeTtm: cycle без ЗАКРЫТОГО эпизода при живом таймлайне → null (не 0 и не span)', () => {
  // Cycle-якоря Dev→DevDone; задача вошла в Dev, но DevDone не достигла. Lead закрыт → в популяции.
  const cfg = Object.assign({}, CFG, { anchors: { lead: { start: 'InProgress', end: 'Done' }, cycle: { start: 'Dev', end: 'DevDone' } } });
  const tls = { R1: [
    { ts: day(10), from: 'Open', to: 'InProgress' },
    { ts: day(20), from: 'InProgress', to: 'Dev' },
    { ts: day(50), from: 'Dev', to: 'Done' }
  ] };
  const res = computeTtm(TP_UNITS, { R1: { InProgress: day(10), Dev: day(20), Done: day(50) } }, {}, null, cfg,
    { fromTs: day(40), toTs: day(100) }, day(300), DEPS, tls);
  assert.equal(res.populationCount, 1);
  const c = tile(res, 'cycle');
  assert.equal(c.median, null);                                  // эпизод не закрыт — не мерено
  assert.equal(c.n, 0);
});

test('computeTtm: точный Cycle спасает аномалию «конец раньше старта» (мусорный ранний вход в конец-якорь)', () => {
  // Done@5 (аномалия/импорт) → Dev@20 → Done@40: span первых входов дал бы null (40>5, e<s по cycle Dev@20>Done@5).
  const anchors = { R1: { InProgress: day(3), Dev: day(20), Done: day(5) } };
  const tls = { R1: [
    { ts: day(5), from: 'Open', to: 'Done' },
    { ts: day(20), from: 'Done', to: 'Dev' },
    { ts: day(40), from: 'Dev', to: 'Done' }
  ] };
  const res = computeTtm(TP_UNITS, anchors, {}, null, CFG, { fromTs: day(0), toTs: day(100) }, day(300), DEPS, tls);
  assert.equal(tile(res, 'cycle').median, 20);                   // эпизод [20,40] закрыт — мерим честно
});

test('computeTtm: паузы вычитаются ВНУТРИ каждого cycle-эпизода', () => {
  const cfg = Object.assign({}, CFG, { terminalPolicy: 'last-stable-close' });
  const pauses = { R1: [{ fromTs: day(25), toTs: day(30) }, { fromTs: day(65), toTs: day(70) }] };  // по 5 дн в каждом эпизоде
  const res = computeTtm(TP_UNITS, TP_ANCHORS, pauses, null, cfg, { fromTs: day(60), toTs: day(100) }, day(300), DEPS, TP_TIMELINES);
  assert.equal(tile(res, 'cycle').median, 50);                   // (30-5) + (30-5)
});
