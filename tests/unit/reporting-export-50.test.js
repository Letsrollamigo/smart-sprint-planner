'use strict';

/* #50 S9-EXP-a — проектор reporting-export-pure.reportToSheets (отчёт → нейтральные секции для
   Excel/PDF). Гейтит: колонки/строки/meta проецируются из ФИНАЛЬНОГО vm байт-в-байт (числа=числа,
   часы=мин/60, флаги=слова, snapshot vs windowed период). Лейблы = identity-Proxy → колонка равна
   имени своего i18n-ключа, поэтому ассерты читаемы. */

const test = require('node:test');
const assert = require('node:assert');
const EXP = require('../../widgets/main/src/pure/reporting-export-pure.js');

/* L: любой L.<key> → 'key' (identity); L.period — объект пресетов. */
const L = new Proxy({ period: { last30: 'last30', calendarYear: 'calendarYear', custom: 'custom' } }, {
  get(t, p) { return (p in t) ? t[p] : String(p); },
});
const DEPS = { fmtDate: (ts) => 'D' + ts, nowTs: 1000 };
const base = (over) => Object.assign({ labels: L, projectName: 'DEMO', period: 'last30', periodOpts: {}, query: '' }, over);

test('a7 Aging — колонки/строки, snapshot-период, флаг-слово, meta', () => {
  const vm = base({ report: 'a7', rows: [{ id: 'D-1', summary: 'Задача', state: 'Open', days: 5, level: 'over' }] });
  const m = EXP.reportToSheets(vm, DEPS);
  assert.strictEqual(m.fileStem, 'a7-DEMO-19700101');   // ymd(1000ms) = 1970-01-01
  assert.strictEqual(m.title, 'a7Title');
  assert.deepStrictEqual(m.meta, [
    ['exportProject', 'DEMO'],
    ['exportPeriod', 'exportSnapshot'],   // a7 — снимок (не windowed)
    ['filterLabel', '—'],
    ['exportGenerated', 'D1000'],
  ]);
  assert.strictEqual(m.sections.length, 1);
  assert.deepStrictEqual(m.sections[0].columns, ['colId', 'colTask', 'colStatus', 'colDays', 'colFlag']);
  assert.deepStrictEqual(m.sections[0].rows[0], ['D-1', 'Задача', 'Open', 5, 'flagOver']);
});

test('a1 Прогресс — windowed период (пресет), дата через fmtDate', () => {
  const vm = base({ report: 'a1', period: 'last30', rows: [{ id: 'D-2', summary: 'S', state: 'Done', enteredAt: 42, label: 'Готово' }] });
  const m = EXP.reportToSheets(vm, DEPS);
  assert.deepStrictEqual(m.meta[1], ['exportPeriod', 'last30']);   // windowed → пресет
  assert.deepStrictEqual(m.sections[0].rows[0], ['D-2', 'S', 'Done', 'D42', 'Готово']);
});

test('custom период → диапазон from — to в meta', () => {
  const vm = base({ report: 'a1', period: 'custom', periodOpts: { from: '2026-01-01', to: '2026-02-01' }, rows: [] });
  const m = EXP.reportToSheets(vm, DEPS);
  assert.deepStrictEqual(m.meta[1], ['exportPeriod', '2026-01-01 — 2026-02-01']);
});

test('a2 TTM — таблица по типу + строка «Итого» из плиток + секция бакетов', () => {
  const vm = base({ report: 'a2',
    typeRows: [{ unitType: 'epic', count: 2, lead: 10, team: 8, cycle: 5 }],
    tiles: [{ metric: 'lead', median: 10, n: 2 }, { metric: 'team', median: 8, n: 2 }, { metric: 'cycle', median: 5, n: 2 }],
    buckets: { le40: 2, mid: 0, gt120: 0 } });
  const m = EXP.reportToSheets(vm, DEPS);
  assert.strictEqual(m.sections.length, 2);
  assert.deepStrictEqual(m.sections[0].columns, ['colUnitType', 'colCount', 'metricLead', 'metricTeam', 'metricCycle']);
  assert.deepStrictEqual(m.sections[0].rows[0], ['unitEpic', 2, 10, 8, 5]);
  assert.deepStrictEqual(m.sections[0].rows[1], ['exportTotal', 2, 10, 8, 5]);   // overall из плиток
  assert.strictEqual(m.sections[1].title, 'bucketTitle');
  assert.deepStrictEqual(m.sections[1].rows, [['bucketLe40', 2], ['bucketMid', 0], ['bucketGt120', 0]]);
});

test('a4 Трудозатраты — часы=мин/60, роль-лейбл/none, noLog-секция, extraMeta', () => {
  const vm = base({ report: 'a4', roleLabels: { analysis: 'Анализ' },
    workloadRows: [{ author: 'user1', roleKey: 'analysis', minutes: 90, days: 2 }, { author: 'user2', roleKey: null, minutes: 30, days: 1 }],
    noLog: [{ author: 'user3', roleKey: 'analysis' }], totalMinutes: 120, authorCount: 2 });
  const m = EXP.reportToSheets(vm, DEPS);
  assert.deepStrictEqual(m.sections[0].rows[0], ['user1', 'Анализ', 1.5, 2]);   // 90мин → 1.5ч
  assert.deepStrictEqual(m.sections[0].rows[1], ['user2', 'a4RoleNone', 0.5, 1]);
  assert.strictEqual(m.sections[1].title, 'a4NoLogTitle');
  assert.deepStrictEqual(m.sections[1].rows[0], ['user3', 'Анализ']);
  // extraMeta — итог часов/людей, добавлен после общей meta
  assert.ok(m.meta.some((r) => r[0] === 'a4Total' && r[1] === 2));   // 120мин → 2ч
  assert.ok(m.meta.some((r) => r[0] === 'a4ColPerson' && r[1] === 2));
});

test('b1 Техдолг — per-система секции (%=доля×100), extraMeta тоталы', () => {
  const vm = base({ report: 'b1', hasSystem: true,
    groups: [{ system: 'Sys A', rows: [{ label: 'Анализ', debtMinutes: 300, pct: 0.15 }] }],
    totalDebtMinutes: 300, totalPct: 0.15, unestimated: 2 });
  const m = EXP.reportToSheets(vm, DEPS);
  assert.strictEqual(m.sections[0].title, 'Sys A');
  assert.deepStrictEqual(m.sections[0].columns, ['b1ColRole', 'b1ColDebt', 'b1ColPct']);
  assert.deepStrictEqual(m.sections[0].rows[0], ['Анализ', 5, 15]);   // 300мин→5ч, 0.15→15%
  assert.ok(m.meta.some((r) => r[0] === 'b1TotalPct' && r[1] === 15));
  assert.ok(m.meta.some((r) => r[0] === 'b1Unestimated' && r[1] === 2));
});

test('b2 «Налог на баги» — ОКОННЫЙ (период в meta, НЕ снимок) [review-fix]', () => {
  const vm = base({ report: 'b2', period: 'last30', hasSystem: false,
    groups: [{ system: '', rows: [{ label: 'Анализ', bugMinutes: 60, pct: 0.25 }] }], totalPct: 0.25, totalBugMinutes: 60 });
  const m = EXP.reportToSheets(vm, DEPS);
  assert.deepStrictEqual(m.meta[1], ['exportPeriod', 'last30']);   // b2 windowed — не exportSnapshot
});

test('a10 Spillover — спринт N в meta (не пустой скоуп) [review-fix]', () => {
  const vm = base({ report: 'a10', spillSprint: 'sp2',
    sprints: [{ key: 'sp1', label: 'Апрель' }, { key: 'sp2', label: 'Май-2' }],
    roleRows: [], tails: [], ages: [] });
  const m = EXP.reportToSheets(vm, DEPS);
  assert.deepStrictEqual(m.meta[1], ['a10PickSprint', 'Май-2']);   // резолв spillSprint→label
  assert.strictEqual(m.fileStem, 'a10-DEMO-19700101');
});

test('b3 «1000 мелочей» — метрики-only (нет секций, всё в extraMeta)', () => {
  const vm = base({ report: 'b3', period: 'last30', b3Period: 3, b3Avg: 0.83, b3Ytd: 5 });
  const m = EXP.reportToSheets(vm, DEPS);
  assert.deepStrictEqual(m.sections, []);
  assert.ok(m.meta.some((r) => r[0] === 'b3Period' && r[1] === 3));
  assert.ok(m.meta.some((r) => r[0] === 'b3Avg' && r[1] === 0.8));   // округл. до 0.1
  assert.ok(m.meta.some((r) => r[0] === 'b3Ytd' && r[1] === 5));
});

test('b0 «Свод» — секция на метрику; строки=месяцы, колонки=[месяц,…системы]; snapshot-период', () => {
  const series = {
    months: [{ key: '2026-05' }, { key: '2026-06' }],
    systems: ['__all__', 'SysA'],
    metrics: {
      ttm: { lines: { __all__: [{ value: 3.14 }, { value: null }], SysA: [{ value: 2 }, { value: 4 }] } },
      planfact: { lines: { __all__: [{ value: -12.5 }, { value: 8 }], SysA: [{ value: 0 }, { value: 0 }] } },
      bottleneck: { lines: { __all__: [{ value: 5 }, { value: 6 }], SysA: [{ value: null }, { value: 1 }] } },
      backlogMonths: { lines: { __all__: [{ value: 1.2 }, { value: 1.5 }], SysA: [{ value: 0 }, { value: 0.3 }] } },
      backlogHours: { lines: { __all__: [{ value: 40 }, { value: 55 }], SysA: [{ value: 10 }, { value: 12 }] } },
    },
  };
  const vm = base({ report: 'b0', hasSystem: true, series: series });
  const m = EXP.reportToSheets(vm, DEPS);
  assert.strictEqual(m.title, 'b0Title');
  assert.deepStrictEqual(m.meta[1], ['exportPeriod', 'exportSnapshot']);   // b0 — снимок (свой N-мес период, не date-окно)
  assert.strictEqual(m.sections.length, 5);
  assert.deepStrictEqual(m.sections.map((s) => s.title),
    ['b0MetricTtm', 'b0MetricPlanfact', 'b0MetricBottleneck', 'b0MetricBacklogMonths', 'b0MetricBacklogHours']);
  assert.deepStrictEqual(m.sections[0].columns, ['b0ColMonth', 'b0AllSystems', 'SysA']);
  assert.deepStrictEqual(m.sections[0].rows[0], ['2026-05', 3.1, 2]);   // округл. 3.14→3.1
  assert.deepStrictEqual(m.sections[0].rows[1], ['2026-06', '', 4]);    // null → ''
  assert.deepStrictEqual(m.sections[2].rows[0], ['2026-05', 5, '']);    // bottleneck SysA null → ''
});

test('flow — bottleneck (медиана/WIP) + rework byTransition + extraMeta', () => {
  const vm = base({ report: 'flow',
    bottleneck: [{ state: 'In Progress', median: 3, wip: 4, level: 'warn' }],
    rework: { totalBack: 2, issuesWithReopen: 1, byTransition: [{ from: 'Done', to: 'In Progress', count: 2 }] } });
  const m = EXP.reportToSheets(vm, DEPS);
  assert.deepStrictEqual(m.sections[0].rows[0], ['In Progress', 3, 4]);
  assert.deepStrictEqual(m.sections[1].rows[0], ['Done → In Progress', 2]);
  assert.ok(m.meta.some((r) => r[0] === 'reworkTotal' && r[1] === 2));
});

test('фильтр (QueryAssist) попадает в meta, иначе «—»', () => {
  const vm = base({ report: 'a7', query: '  Priority: Critical ', rows: [] });
  const m = EXP.reportToSheets(vm, DEPS);
  assert.deepStrictEqual(m.meta[2], ['filterLabel', 'Priority: Critical']);
});

/* ревью #50 — D7 в файле: усечение/неполнота из vm обязаны попасть в meta выгрузки
   (файл живёт отдельно от экрана с его баннерами). Реюз i18n-ключей баннеров. */
test('limitHit/incompleteCount → строки-предупреждения в meta (после exportGenerated)', () => {
  const vm = base({ report: 'a7', rows: [], limitHit: true, limit: 200, incompleteCount: 3 });
  const m = EXP.reportToSheets(vm, DEPS);
  assert.deepStrictEqual(m.meta[4], ['(!)', 'limitHit']);      // identity-Proxy: '{n}' отсутствует в ключе → без замены
  assert.deepStrictEqual(m.meta[5], ['(!)', 'incomplete']);
});

test('без limitHit/incomplete meta не растёт (снимок прежнего формата)', () => {
  const vm = base({ report: 'a7', rows: [] });
  const m = EXP.reportToSheets(vm, DEPS);
  assert.strictEqual(m.meta.length, 4);
});


/* v3.9.0 — тумблер «Система» (hasSystem) + кликабельные ID (ytBase → линк-ячейка {v,link}).
   Без hasSystem/ytBase форма старых выгрузок не меняется (тесты выше — тот же контракт). */
test('v3.9.0 a7 — hasSystem: колонка «Система»; ytBase: ID = линк-ячейка {v,link}', () => {
  const vm = base({ report: 'a7', hasSystem: true, ytBase: 'https://yt.example',
    rows: [{ id: 'D-1', summary: 'Задача', state: 'Open', days: 5, level: 'over', system: 'ERP' }] });
  const m = EXP.reportToSheets(vm, DEPS);
  assert.deepStrictEqual(m.sections[0].columns, ['colId', 'colTask', 'colStatus', 'colDays', 'colFlag', 'colSystem']);
  assert.deepStrictEqual(m.sections[0].rows[0],
    [{ v: 'D-1', link: 'https://yt.example/issue/D-1' }, 'Задача', 'Open', 5, 'flagOver', 'ERP']);
});

test('v3.9.0 a10 — hasSystem гейтит колонку в хвостах и возрасте; ID — линк-ячейки', () => {
  const mk = (hasSystem) => EXP.reportToSheets(base({ report: 'a10', hasSystem, ytBase: 'https://yt.example',
    spillSprint: 'sp1', sprints: [{ key: 'sp1', label: 'Май' }], roleRows: [],
    tails: [{ issueId: 'D-2', title: 'T', roleLabel: 'Анализ', minutes: 60, type: 'carried', system: 'CRM' }],
    ages: [{ issueId: 'D-2', title: 'T', roleLabel: 'Анализ', age: 2, system: 'CRM' }] }), DEPS);
  const on = mk(true);
  assert.deepStrictEqual(on.sections[1].columns, ['colId', 'colTask', 'a4ColRole', 'a10ColHours', 'a10ColType', 'a10ColSystem']);
  assert.deepStrictEqual(on.sections[1].rows[0],
    [{ v: 'D-2', link: 'https://yt.example/issue/D-2' }, 'T', 'Анализ', 1, 'a10Carried', 'CRM']);
  assert.deepStrictEqual(on.sections[2].columns, ['colId', 'colTask', 'a4ColRole', 'a10ColAge', 'a10ColSystem']);
  assert.deepStrictEqual(on.sections[2].rows[0][4], 'CRM');
  const off = mk(false);
  assert.deepStrictEqual(off.sections[1].columns, ['colId', 'colTask', 'a4ColRole', 'a10ColHours', 'a10ColType']);
  assert.deepStrictEqual(off.sections[2].columns, ['colId', 'colTask', 'a4ColRole', 'a10ColAge']);
});
