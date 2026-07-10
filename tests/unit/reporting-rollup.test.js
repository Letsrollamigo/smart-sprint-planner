'use strict';

/* #50 B0 — as-of примитивы свода (pure/reporting-rollup.js): truncateTimelineAsOf + stateAsOf.
 * Полуоткрытость (ts < asOfTs). stateAsOf покрывает 4 случая: A) ещё не создана; B) последний
 * переход до asOfTs → .to; C) все переходы позже → .from первого (начальное состояние);
 * D) переходов нет → current. Эталон рассуждается вручную (не вызовом модуля). */

const test = require('node:test');
const assert = require('node:assert');
const { truncateTimelineAsOf, stateAsOf, computeRollupSeries } = require('../../widgets/main/src/pure/reporting-rollup.js');

const DAY = 86400000;
const day = (n) => n * DAY;                        // простое ms-время для читаемых t
const AS_OF = day(100);                            // «конец месяца» по умолчанию

/* ── truncateTimelineAsOf ─────────────────────────────────────────────── */
test('truncate: держит ts < asOfTs, режет ts == asOfTs и ts > asOfTs (полуоткрыто)', () => {
  const tl = [
    { ts: day(50), to: 'A' }, { ts: day(99), to: 'B' },
    { ts: day(100), to: 'C' }, { ts: day(120), to: 'D' },   // == и > конца месяца → следующий месяц
  ];
  const out = truncateTimelineAsOf(tl, AS_OF);
  assert.deepStrictEqual(out.map((e) => e.to), ['A', 'B']);
});

test('truncate: нефинитный ts отбрасывается; порядок сохранён; битый вход → []', () => {
  const tl = [{ ts: null, to: 'X' }, { ts: day(10), to: 'A' }, { ts: NaN, to: 'Y' }, { ts: day(20), to: 'B' }];
  assert.deepStrictEqual(truncateTimelineAsOf(tl, AS_OF).map((e) => e.to), ['A', 'B']);
  assert.deepStrictEqual(truncateTimelineAsOf(null, AS_OF), []);
  assert.deepStrictEqual(truncateTimelineAsOf(tl, NaN), []);
  assert.deepStrictEqual(truncateTimelineAsOf(tl, 'x'), []);
});

/* ── stateAsOf ────────────────────────────────────────────────────────── */
test('stateAsOf Case A: created > asOfTs → null (задачи ещё нет)', () => {
  const tl = [{ ts: day(110), from: 'To do', to: 'In Progress' }];
  assert.strictEqual(stateAsOf(tl, day(105), 'In Progress', AS_OF), null);
});

test('stateAsOf граница создания: createdTs === asOfTs → null (симметрия с ts<asOfTs; Bug 1 адверс)', () => {
  // asOfTs = начало след. месяца (эксклюзив) → задача, созданная РОВНО тогда, принадлежит M+1
  assert.strictEqual(stateAsOf([], AS_OF, 'To do', AS_OF), null);
  assert.strictEqual(stateAsOf([{ ts: day(120), from: 'To do', to: 'In Progress' }], AS_OF, 'In Progress', AS_OF), null);
  // на 1мс раньше — уже существует (Case D)
  assert.strictEqual(stateAsOf([], AS_OF - 1, 'To do', AS_OF), 'To do');
});

test('stateAsOf: очистка State (to=null) → null, а не сталое состояние (Bug 2 адверс, D7)', () => {
  // parseAnchorsChunk теперь эмитит clear как {to:null}; последний переход до asOfTs = очистка → null
  const tl = [{ ts: day(10), from: 'To do', to: 'In Progress' }, { ts: day(50), from: 'In Progress', to: null }];
  assert.strictEqual(stateAsOf(tl, day(1), null, AS_OF), null);
});

test('stateAsOf Case B: есть переход до asOfTs → .to последнего такого', () => {
  const tl = [
    { ts: day(10), from: 'To do', to: 'In Progress' },
    { ts: day(60), from: 'In Progress', to: 'Review' },
    { ts: day(130), from: 'Review', to: 'Done' },        // после asOfTs — не учитывается
  ];
  assert.strictEqual(stateAsOf(tl, day(1), 'Done', AS_OF), 'Review');
});

test('stateAsOf Case B граница: переход РОВНО в asOfTs НЕ применён (относится к след. месяцу)', () => {
  const tl = [
    { ts: day(10), from: 'To do', to: 'In Progress' },
    { ts: day(100), from: 'In Progress', to: 'Done' },   // == asOfTs → не «до»
  ];
  assert.strictEqual(stateAsOf(tl, day(1), 'Done', AS_OF), 'In Progress');
});

test('stateAsOf Case C: все переходы позже asOfTs → .from первого (начальное состояние)', () => {
  // свежая «To do», ушедшая в работу ПОЗЖЕ конца месяца → на конец месяца была «To do»
  const tl = [
    { ts: day(120), from: 'To do', to: 'In Progress' },
    { ts: day(140), from: 'In Progress', to: 'Done' },
  ];
  assert.strictEqual(stateAsOf(tl, day(90), 'Done', AS_OF), 'To do');
});

test('stateAsOf Case C: .from===null («впервые установлено») → null', () => {
  const tl = [{ ts: day(120), from: null, to: 'To do' }];
  assert.strictEqual(stateAsOf(tl, day(90), 'To do', AS_OF), null);
});

test('stateAsOf Case D: переходов нет → currentState (не менялось)', () => {
  assert.strictEqual(stateAsOf([], undefined, 'To do', AS_OF), 'To do');
  assert.strictEqual(stateAsOf([], undefined, '', AS_OF), null);       // пустой current → null
  assert.strictEqual(stateAsOf([], undefined, null, AS_OF), null);
});

test('stateAsOf: несколько переходов до asOfTs — берётся с наибольшим ts (последний по времени)', () => {
  const tl = [
    { ts: day(30), from: 'A', to: 'B' },
    { ts: day(90), from: 'B', to: 'C' },
    { ts: day(50), from: 'B', to: 'B2' },   // порядок в массиве нарушен намеренно
  ];
  assert.strictEqual(stateAsOf(tl, day(1), 'X', AS_OF), 'C');  // ts=90 — самый поздний до 100
});

test('stateAsOf: нефинитный ts игнорируется; битый asOfTs → null', () => {
  const tl = [{ ts: NaN, from: 'A', to: 'B' }, { ts: day(40), from: 'A', to: 'B' }];
  assert.strictEqual(stateAsOf(tl, day(1), 'X', AS_OF), 'B');  // NaN-запись пропущена, day(40) < 100 → 'B'
  assert.strictEqual(stateAsOf(tl, day(1), 'X', NaN), null);
});

test('stateAsOf: created неизвестно (undefined) + переходы позже → Case C (не блокируем)', () => {
  const tl = [{ ts: day(120), from: 'Open', to: 'In Progress' }];
  assert.strictEqual(stateAsOf(tl, undefined, 'In Progress', AS_OF), 'Open');
});

/* ── B0-c · computeRollupSeries — помесячный свод (mock-движки изолируют loop/фильтр/редукцию) ── */
const _2mo = [{ fromTs: 0, toTs: DAY, key: 'm1', y: 2026, mo: 0 }, { fromTs: DAY, toTs: 2 * DAY, key: 'm2', y: 2026, mo: 1 }];
function mockDeps(o) {
  return Object.assign({
    monthlyWindows: () => _2mo,
    computeTtm: () => ({ tiles: [] }),
    computePlanFact: () => ({ rollups: [] }),
    computeBottleneck: () => ({ states: [] }),
    buildBacklogRows: () => ({ rows: [] }),
    asOfPeriodMinutes: (tl, cur) => cur,
    workdaysBetween: () => 0,
    agingLevel: () => 'none',
  }, o || {});
}

test('rollup: системы = __all__ + distinct; N месяцев', () => {
  const r = computeRollupSeries({ N: 2, nowTs: 100 * DAY, issues: [{ id: 'A' }, { id: 'B' }, { id: 'C' }], systemOf: { A: 'S1', B: 'S2', C: 'S1' } }, mockDeps());
  assert.deepStrictEqual(r.systems, ['__all__', 'S1', 'S2']);
  assert.strictEqual(r.months.length, 2);
  assert.strictEqual(r.metrics.ttm.lines['S1'].length, 2);   // значение на каждый месяц
});

test('rollup TTM: медиана Lead на систему (фильтр по системе кормит движок), норматив', () => {
  const units = [{ id: 'A', type: 'epic' }, { id: 'B', type: 'epic' }, { id: 'C', type: 'epic' }];
  const input = { N: 2, nowTs: 100 * DAY, issues: units, systemOf: { A: 'S1', B: 'S2', C: 'S1' },
    ttm: { units, anchorEntries: {}, pauses: {}, incompleteSet: [], config: { norms: { lead: 21 } } } };
  const deps = mockDeps({ computeTtm: (u) => ({ tiles: [{ metric: 'lead', median: u.length, n: u.length }] }) });
  const r = computeRollupSeries(input, deps);
  assert.strictEqual(r.metrics.ttm.lines['__all__'][0].value, 3);   // все units
  assert.strictEqual(r.metrics.ttm.lines['S1'][0].value, 2);        // A, C
  assert.strictEqual(r.metrics.ttm.lines['S2'][0].value, 1);        // B
  assert.strictEqual(r.metrics.ttm.norm, 21);
});

test('rollup planfact: популяция = система И lead.end∈месяц; портфель task-weighted', () => {
  const input = { N: 2, nowTs: 100 * DAY, issues: [{ id: 'A' }, { id: 'B' }], systemOf: { A: 'S1', B: 'S1' },
    planfact: { issues: [{ id: 'A' }, { id: 'B' }], leadEndBy: { A: 0, B: DAY }, threshold: 20,
      asOf: {}, workItems: [], roleExecutors: {}, roles: [], incomplete: [] } };
  const deps = mockDeps({ computePlanFact: ({ issues }) => ({ rollups: issues.map((i) => ({ avgVariancePct: i.id === 'A' ? 10 : 30, taskCount: 1 })) }) });
  const r = computeRollupSeries(input, deps);
  assert.strictEqual(r.metrics.planfact.lines['S1'][0].value, 10);  // m1: только A (leadEnd 0∈[0,DAY))
  assert.strictEqual(r.metrics.planfact.lines['S1'][1].value, 30);  // m2: только B (leadEnd DAY∈[DAY,2DAY))
});

test('rollup planfact: портфель = взвешенное по taskCount среднее', () => {
  const input = { N: 1, nowTs: 100 * DAY, issues: [{ id: 'A' }], systemOf: { A: 'S1' },
    planfact: { issues: [{ id: 'A' }], leadEndBy: { A: 0 }, threshold: 20, asOf: {}, workItems: [], roleExecutors: {}, roles: [], incomplete: [] } };
  const deps = mockDeps({ monthlyWindows: () => [{ fromTs: 0, toTs: DAY, key: 'm1' }],
    computePlanFact: () => ({ rollups: [{ avgVariancePct: 10, taskCount: 3 }, { avgVariancePct: 40, taskCount: 1 }] }) });
  const r = computeRollupSeries(input, deps);
  assert.strictEqual(r.metrics.planfact.lines['S1'][0].value, (10 * 3 + 40 * 1) / 4);  // = 17.5
});

test('rollup bottleneck: max медиана dwell + level того состояния', () => {
  const input = { N: 2, nowTs: 100 * DAY, issues: [{ id: 'A' }], systemOf: { A: 'S1' },
    bottleneck: { timelines: { A: [{ ts: 0, to: 'X' }, { ts: 2 * DAY, to: 'Y' }] }, pauses: {}, incompleteSet: [], config: { flowStates: ['X', 'Y'] } } };
  const deps = mockDeps({ computeBottleneck: () => ({ states: [{ state: 'X', median: 5, level: 'over' }, { state: 'Y', median: 3, level: 'ok' }] }) });
  const r = computeRollupSeries(input, deps);
  assert.strictEqual(r.metrics.bottleneck.lines['S1'][0].value, 5);      // max(5,3)
  assert.strictEqual(r.metrics.bottleneck.lines['S1'][0].level, 'over'); // level состояния-максимума
});

test('rollup bottleneck: обрезка as-of конца месяца (переход после конца НЕ виден движку)', () => {
  const calls = [];
  const input = { N: 2, nowTs: 100 * DAY, issues: [{ id: 'A' }], systemOf: { A: 'S1' },
    bottleneck: { timelines: { A: [{ ts: 0, to: 'X' }, { ts: DAY + 1, to: 'Y' }] }, pauses: {}, incompleteSet: [], config: { flowStates: ['X', 'Y'] } } };
  const deps = mockDeps({ computeBottleneck: (tls) => { calls.push((tls.A || []).length); return { states: [] }; } });
  computeRollupSeries(input, deps);
  assert.strictEqual(calls[0], 1);   // m1 toTs=DAY → только ts:0 (ts:DAY+1 отсечён)
  assert.strictEqual(calls[1], 2);   // m2 toTs=2DAY → оба
});

test('rollup backlog: as-of open-set (stateAsOf∈backlogStates) + Σч и max месяцев', () => {
  // A двинулась в Done ПОСЛЕ конца m1 → на конец m1 была «To do» (в бэклоге), на конец m2 — Done (вне)
  const input = { N: 2, nowTs: 100 * DAY, issues: [{ id: 'A', created: 0 }], systemOf: { A: 'S1' },
    backlog: { issues: [{ id: 'A', created: 0 }], stateTimelines: { A: [{ ts: DAY + 1, from: 'To do', to: 'Done' }] },
      currentStates: { A: 'Done' }, estTimelines: {}, currentEst: { A: { F1: 6000 } }, backlogStates: { 'To do': true },
      roles: [{ key: 'analysis', fieldId: 'F1', label: 'An' }], monthlyCapHours: { analysis: 100 }, normMonths: 6, incompleteSet: [] } };
  const deps = mockDeps({ buildBacklogRows: (per) => {
    let min = 0; per.forEach((p) => { for (const k in p.est) min += (p.est[k] || 0); });
    return { rows: min > 0 ? [{ roleKey: 'analysis', sumHours: min / 60, months: (min / 60) / 100 }] : [] };
  } });
  const r = computeRollupSeries(input, deps);
  assert.strictEqual(r.metrics.backlogHours.lines['S1'][0].value, 100);   // m1: в бэклоге, 6000м=100ч
  assert.strictEqual(r.metrics.backlogMonths.lines['S1'][0].value, 1);    // 100ч/100 = 1 мес
  assert.strictEqual(r.metrics.backlogHours.lines['S1'][1].value, 0);     // m2: Done → вне бэклога
  assert.strictEqual(r.metrics.backlogMonths.lines['S1'][1].value, null);
});

test('rollup backlog: incomplete (D7) исключается из as-of', () => {
  const input = { N: 1, nowTs: 100 * DAY, issues: [{ id: 'A', created: 0 }], systemOf: { A: 'S1' },
    backlog: { issues: [{ id: 'A', created: 0 }], stateTimelines: { A: [] }, currentStates: { A: 'To do' },
      estTimelines: {}, currentEst: { A: { F1: 6000 } }, backlogStates: { 'To do': true },
      roles: [{ key: 'analysis', fieldId: 'F1', label: 'An' }], monthlyCapHours: { analysis: 100 }, normMonths: 6,
      incompleteSet: ['A'] } };
  const deps = mockDeps({ monthlyWindows: () => [{ fromTs: 0, toTs: DAY, key: 'm1' }],
    buildBacklogRows: (per) => ({ rows: per.length ? [{ sumHours: 100, months: 1 }] : [] }) });
  const r = computeRollupSeries(input, deps);
  assert.strictEqual(r.metrics.backlogHours.lines['S1'][0].value, 0);     // A incomplete → не в perIssue
});

/* ── B0-c адверс-фиксы (workflow 6 REAL_BUG → 4 разных) ── */
test('rollup Bug B: текущий (неполный) месяц — bottleneck as-of = NOW, не будущий конец', () => {
  const win = [{ fromTs: 0, toTs: 10 * DAY, key: 'm1' }];
  let seenNow;
  const input = { N: 1, nowTs: 3 * DAY, issues: [{ id: 'A' }], systemOf: { A: 'S1' },
    bottleneck: { timelines: { A: [{ ts: 0, to: 'X' }] }, pauses: {}, incompleteSet: [], config: { flowStates: ['X'] } } };
  const deps = mockDeps({ monthlyWindows: () => win, computeBottleneck: (tls, p, inc, cfg, nowArg) => { seenNow = nowArg; return { states: [] }; } });
  computeRollupSeries(input, deps);
  assert.strictEqual(seenNow, 3 * DAY);   // as-of = now, НЕ toTs=10*DAY (иначе dwell раздут в будущее)
});

test('rollup Bug A: изменение оценки РОВНО на границе месяца НЕ утекает в завершающий месяц', () => {
  const pure = require('../../widgets/main/src/pure/reporting-pure.js');
  const input = { N: 1, nowTs: 100 * DAY, issues: [{ id: 'A', created: 0 }], systemOf: { A: 'S1' },
    backlog: { issues: [{ id: 'A', created: 0 }], stateTimelines: { A: [] }, currentStates: { A: 'To do' },
      estTimelines: { A: { F1: [{ ts: DAY, from: 6000, to: 12000 }] } }, currentEst: { A: { F1: 12000 } },
      backlogStates: { 'To do': true }, roles: [{ key: 'an', fieldId: 'F1', label: 'An' }],
      monthlyCapHours: { an: 100 }, normMonths: 6, incompleteSet: [] } };
  const deps = mockDeps({ monthlyWindows: () => [{ fromTs: 0, toTs: DAY, key: 'm1' }],
    asOfPeriodMinutes: pure.asOfPeriodMinutes, buildBacklogRows: pure.buildBacklogRows });
  const r = computeRollupSeries(input, deps);
  assert.strictEqual(r.metrics.backlogHours.lines['S1'][0].value, 100);   // 6000м (ДО изменения на границе) = 100ч, не 200
  assert.strictEqual(r.metrics.backlogMonths.lines['S1'][0].value, 1);
});

test('rollup Bug C: incompleteSet как ES6 Set — задача исключается из бэклога (D7)', () => {
  const input = { N: 1, nowTs: 100 * DAY, issues: [{ id: 'A', created: 0 }], systemOf: { A: 'S1' },
    backlog: { issues: [{ id: 'A', created: 0 }], stateTimelines: { A: [] }, currentStates: { A: 'To do' },
      estTimelines: {}, currentEst: { A: { F1: 6000 } }, backlogStates: { 'To do': true },
      roles: [{ key: 'an', fieldId: 'F1', label: 'An' }], monthlyCapHours: { an: 100 }, normMonths: 6,
      incompleteSet: new Set(['A']) } };
  const deps = mockDeps({ monthlyWindows: () => [{ fromTs: 0, toTs: DAY, key: 'm1' }],
    buildBacklogRows: (per) => ({ rows: per.length ? [{ sumHours: 100, months: 1 }] : [] }) });
  const r = computeRollupSeries(input, deps);
  assert.strictEqual(r.metrics.backlogHours.lines['S1'][0].value, 0);   // Set-incomplete исключена (не 100)
});

test('rollup Bug D: falsy-значение системы (0) не создаёт фантом-раздел', () => {
  const input = { N: 1, nowTs: 100 * DAY, issues: [{ id: 'A' }, { id: 'B' }], systemOf: { A: 0, B: 'S1' },
    ttm: { units: [{ id: 'A' }, { id: 'B' }], anchorEntries: {}, pauses: {}, incompleteSet: [], config: { norms: {} } } };
  const deps = mockDeps({ monthlyWindows: () => [{ fromTs: 0, toTs: DAY, key: 'm1' }],
    computeTtm: (u) => ({ tiles: [{ metric: 'lead', median: u.length }] }) });
  const r = computeRollupSeries(input, deps);
  assert.ok(r.systems.indexOf(0) >= 0);
  assert.strictEqual(r.metrics.ttm.lines[0][0].value, 1);       // A матчит систему 0 (был бы 0 при фантоме)
  assert.strictEqual(r.metrics.ttm.lines['__all__'][0].value, 2);
});
