'use strict';

/* #50 S2 — модель периодов D9 (pure/reporting-period.js). Проверяет computeWindow: границы
 * каждого пресета при фиксированном «сейчас», нормализацию границ месяца/квартала/года и
 * отбраковку битого ввода. Окно полуоткрытое [fromTs, toTs). Эталон считается независимо через
 * Date.UTC (не вызовом модуля) — чтобы тест не унаследовал возможный баг реализации. */

const test = require('node:test');
const assert = require('node:assert');
const { computeWindow, PERIOD_PRESETS, monthlyWindows } = require('../../widgets/main/src/pure/reporting-period.js');

const DAY = 86400000;
/* Пятница 2026-05-15 10:30 UTC — «сейчас» по умолчанию. */
const NOW = Date.UTC(2026, 4, 15, 10, 30);
const SOD = Date.UTC(2026, 4, 15);            // начало сегодня
const END_TODAY = Date.UTC(2026, 4, 16);      // начало завтра

test('today: [начало сегодня, начало завтра)', () => {
  assert.deepStrictEqual(computeWindow('today', NOW), { fromTs: SOD, toTs: END_TODAY });
});

test('yesterday: [начало вчера, начало сегодня)', () => {
  assert.deepStrictEqual(computeWindow('yesterday', NOW), { fromTs: Date.UTC(2026, 4, 14), toTs: SOD });
});

test('last7: 7 суток включая сегодня', () => {
  assert.deepStrictEqual(computeWindow('last7', NOW), { fromTs: Date.UTC(2026, 4, 9), toTs: END_TODAY });
  assert.strictEqual((computeWindow('last7', NOW).toTs - computeWindow('last7', NOW).fromTs) / DAY, 7);
});

test('last30: 30 суток включая сегодня (через границу месяца)', () => {
  assert.deepStrictEqual(computeWindow('last30', NOW), { fromTs: Date.UTC(2026, 3, 16), toTs: END_TODAY });
  assert.strictEqual((computeWindow('last30', NOW).toTs - computeWindow('last30', NOW).fromTs) / DAY, 30);
});

test('lastMonth: полный прошлый месяц (апрель)', () => {
  assert.deepStrictEqual(computeWindow('lastMonth', NOW), { fromTs: Date.UTC(2026, 3, 1), toTs: Date.UTC(2026, 4, 1) });
});

test('lastQuarter: Q1 (янв–мар) когда сейчас Q2', () => {
  assert.deepStrictEqual(computeWindow('lastQuarter', NOW), { fromTs: Date.UTC(2026, 0, 1), toTs: Date.UTC(2026, 3, 1) });
});

test('currentQuarter: [начало Q2, начало завтра)', () => {
  assert.deepStrictEqual(computeWindow('currentQuarter', NOW), { fromTs: Date.UTC(2026, 3, 1), toTs: END_TODAY });
});

test('ytd: [1 января, начало завтра)', () => {
  assert.deepStrictEqual(computeWindow('ytd', NOW), { fromTs: Date.UTC(2026, 0, 1), toTs: END_TODAY });
});

test('calendarYear: полный год по opts.year', () => {
  assert.deepStrictEqual(computeWindow('calendarYear', NOW, { year: 2024 }),
    { fromTs: Date.UTC(2024, 0, 1), toTs: Date.UTC(2025, 0, 1) });
});

test('custom: [начало from-дня, начало дня после to) — to включён', () => {
  assert.deepStrictEqual(computeWindow('custom', NOW, { from: '2026-03-10', to: '2026-03-20' }),
    { fromTs: Date.UTC(2026, 2, 10), toTs: Date.UTC(2026, 2, 21) });
});

test('custom: from == to → окно = ровно один день', () => {
  const w = computeWindow('custom', NOW, { from: '2026-03-10', to: '2026-03-10' });
  assert.strictEqual((w.toTs - w.fromTs) / DAY, 1);
});

/* ── Границы: смена месяца/квартала/года ─────────────────────────────── */
test('граница года: сейчас 15 января → lastMonth=декабрь пред.года, lastQuarter=Q4 пред.года', () => {
  const jan = Date.UTC(2026, 0, 15, 8, 0);
  assert.deepStrictEqual(computeWindow('lastMonth', jan), { fromTs: Date.UTC(2025, 11, 1), toTs: Date.UTC(2026, 0, 1) });
  assert.deepStrictEqual(computeWindow('lastQuarter', jan), { fromTs: Date.UTC(2025, 9, 1), toTs: Date.UTC(2026, 0, 1) });
  assert.deepStrictEqual(computeWindow('ytd', jan), { fromTs: Date.UTC(2026, 0, 1), toTs: Date.UTC(2026, 0, 16) });
});

test('граница квартала: 31 марта = Q1, 1 апреля = Q2', () => {
  assert.strictEqual(computeWindow('currentQuarter', Date.UTC(2026, 2, 31, 23, 0)).fromTs, Date.UTC(2026, 0, 1));
  assert.strictEqual(computeWindow('currentQuarter', Date.UTC(2026, 3, 1, 1, 0)).fromTs, Date.UTC(2026, 3, 1));
});

test('currentQuarter Q4 (дек): [1 окт, начало завтра)', () => {
  const dec = Date.UTC(2026, 11, 31, 12, 0);
  assert.deepStrictEqual(computeWindow('currentQuarter', dec), { fromTs: Date.UTC(2026, 9, 1), toTs: Date.UTC(2027, 0, 1) });
});

/* ── Отбраковка битого ввода (D7: null, не молчаливое окно) ───────────── */
test('невалидный ввод → null', () => {
  assert.strictEqual(computeWindow('unknownPreset', NOW), null);
  assert.strictEqual(computeWindow('today', 'not-a-number'), null);
  assert.strictEqual(computeWindow('today', NaN), null);
  assert.strictEqual(computeWindow('calendarYear', NOW), null);            // нет year
  assert.strictEqual(computeWindow('calendarYear', NOW, { year: 2026.5 }), null); // дробный
  assert.strictEqual(computeWindow('calendarYear', NOW, { year: 1900 }), null);   // вне диапазона
  assert.strictEqual(computeWindow('custom', NOW, { from: '2026-03-20', to: '2026-03-10' }), null); // from>to
  assert.strictEqual(computeWindow('custom', NOW, { from: '2026-02-29', to: '2026-03-01' }), null); // 2026 не високосный
  assert.strictEqual(computeWindow('custom', NOW, { from: 'garbage', to: '2026-03-01' }), null);
  assert.strictEqual(computeWindow('custom', NOW, {}), null);
});

test('custom: 29 февраля валиден в високосный год', () => {
  assert.deepStrictEqual(computeWindow('custom', NOW, { from: '2024-02-29', to: '2024-02-29' }),
    { fromTs: Date.UTC(2024, 1, 29), toTs: Date.UTC(2024, 2, 1) });
});

test('каталог PERIOD_PRESETS: 10 пресетов, requiresOpts согласован', () => {
  assert.strictEqual(PERIOD_PRESETS.length, 10);
  const byKey = {};
  PERIOD_PRESETS.forEach((p) => { byKey[p.key] = p.requiresOpts; });
  assert.strictEqual(byKey.calendarYear, 'year');
  assert.strictEqual(byKey.custom, 'range');
  assert.strictEqual(byKey.today, '');
});

/* ── #50 B0 · monthlyWindows(N, nowTs) — помесячные окна свода ─────────── */
test('monthlyWindows: N=6 от 15 мая 2026 → 6 месяцев дек–май, старый→новый, текущий последним', () => {
  const w = monthlyWindows(6, NOW);
  assert.strictEqual(w.length, 6);
  // эталон: [dec2025, jan, feb, mar, apr, may2026], новейший = месяц NOW
  const expect = [
    { y: 2025, mo: 11 }, { y: 2026, mo: 0 }, { y: 2026, mo: 1 },
    { y: 2026, mo: 2 }, { y: 2026, mo: 3 }, { y: 2026, mo: 4 },
  ];
  expect.forEach((e, i) => {
    assert.strictEqual(w[i].y, e.y, 'year @' + i);
    assert.strictEqual(w[i].mo, e.mo, 'month @' + i);
    assert.strictEqual(w[i].fromTs, Date.UTC(e.y, e.mo, 1), 'fromTs @' + i);
    assert.strictEqual(w[i].toTs, Date.UTC(e.y, e.mo + 1, 1), 'toTs @' + i);
  });
  // новейшее окно содержит NOW; старейшее = 5 месяцев назад
  assert.ok(w[5].fromTs <= NOW && NOW < w[5].toTs, 'текущий месяц содержит NOW');
});

test('monthlyWindows: соседние окна стыкуются без зазора/нахлёста (полуоткрытость)', () => {
  const w = monthlyWindows(12, Date.UTC(2026, 6, 20));
  for (let i = 0; i + 1 < w.length; i++) {
    assert.strictEqual(w[i].toTs, w[i + 1].fromTs, 'стык @' + i);
    assert.ok(w[i].fromTs < w[i].toTs, 'полуоткрытость @' + i);
  }
  // каждое окно = ровно один календарный месяц (границы = 1-е число)
  w.forEach((win) => {
    assert.strictEqual(new Date(win.fromTs).getUTCDate(), 1);
    assert.strictEqual(new Date(win.toTs).getUTCDate(), 1);
  });
});

test('monthlyWindows: граница года — N=3 от января 2026 → ноя/дек 2025 + янв 2026', () => {
  const w = monthlyWindows(3, Date.UTC(2026, 0, 10));
  assert.deepStrictEqual(w.map((x) => x.key), ['2025-11', '2025-12', '2026-01']);
  assert.strictEqual(w[0].fromTs, Date.UTC(2025, 10, 1));
  assert.strictEqual(w[2].toTs, Date.UTC(2026, 1, 1));
});

test('monthlyWindows: N=1 → только текущий месяц; key нуль-паддинг', () => {
  const w = monthlyWindows(1, Date.UTC(2026, 2, 5));  // март → '2026-03'
  assert.strictEqual(w.length, 1);
  assert.strictEqual(w[0].key, '2026-03');
  const w2 = monthlyWindows(1, Date.UTC(2026, 9, 5)); // октябрь → '2026-10'
  assert.strictEqual(w2[0].key, '2026-10');
});

test('monthlyWindows: битый N/nowTs → [], N кламп до MAX_MONTHS=60', () => {
  assert.deepStrictEqual(monthlyWindows(0, NOW), []);
  assert.deepStrictEqual(monthlyWindows(-3, NOW), []);
  assert.deepStrictEqual(monthlyWindows(NaN, NOW), []);
  assert.deepStrictEqual(monthlyWindows('6', NOW), []);
  assert.deepStrictEqual(monthlyWindows(6, NaN), []);
  assert.deepStrictEqual(monthlyWindows(6, 'x'), []);
  assert.strictEqual(monthlyWindows(999, NOW).length, 60);   // кламп
  assert.strictEqual(monthlyWindows(6.9, NOW).length, 6);     // floor
});
