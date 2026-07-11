'use strict';
/* #40 — unit-тесты чистого ядра авто-прогноза дат (widgets/main/src/pure/forecast-pure.js)
 * + извлечённых пер-дневных примитивов отсутствий capacity-pure (absenceBounds/absenceHoursOfDay).
 * Канон: часы float, дни ISO (UTC), needMin — минуты. Якорь Июнь-2026: 2026-06-01 = понедельник. */

const test = require('node:test');
const assert = require('node:assert');

const F = require('../../widgets/main/src/pure/forecast-pure.js');
const C = require('../../widgets/main/src/pure/capacity-pure.js');

/* Рабочая неделя Пн 01 — Пт 05 июня 2026, 8ч/день, без отсутствий. */
function week(absMap) {
  var out = [];
  ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05'].forEach(function (iso) {
    out.push({ iso: iso, workH: 8, absH: (absMap && absMap[iso]) || 0 });
  });
  return out;
}

/* ── dailyQuotas ──────────────────────────────────────────────────────────── */

test('dailyQuotas: равномерное распределение по одинаковым дням', () => {
  assert.deepStrictEqual(F.dailyQuotas(40, week(), 0), [8, 8, 8, 8, 8]);
});
test('dailyQuotas: кап usefulHoursPerDay срезает дневную долю (Σквот < ёмкости — осознанно)', () => {
  const q = F.dailyQuotas(40, week(), 6);
  assert.deepStrictEqual(q, [6, 6, 6, 6, 6]);
  assert.ok(q.reduce((a, b) => a + b, 0) < 40);
});
test('dailyQuotas: кап не задан (0/null/undefined) → без капа', () => {
  assert.deepStrictEqual(F.dailyQuotas(40, week(), null), [8, 8, 8, 8, 8]);
  assert.deepStrictEqual(F.dailyQuotas(40, week(), undefined), [8, 8, 8, 8, 8]);
});
test('dailyQuotas: короткий день получает пропорционально меньшую долю', () => {
  const days = week();
  days[2].workH = 4; // среда короткая
  const q = F.dailyQuotas(36, days, 0);
  // Σeff = 36 → множитель 1: [8,8,4,8,8]
  assert.deepStrictEqual(q, [8, 8, 4, 8, 8]);
});
test('dailyQuotas: день полного отсутствия → квота 0, остальное перераспределяется', () => {
  const q = F.dailyQuotas(32, week({ '2026-06-03': 8 }), 0);
  assert.deepStrictEqual(q, [8, 8, 0, 8, 8]);
});
test('dailyQuotas: Σeff=0 (полное отсутствие) → все квоты 0', () => {
  const q = F.dailyQuotas(40, week({ '2026-06-01': 8, '2026-06-02': 8, '2026-06-03': 8, '2026-06-04': 8, '2026-06-05': 8 }), 0);
  assert.deepStrictEqual(q, [0, 0, 0, 0, 0]);
});
test('dailyQuotas: ёмкость 0 → все квоты 0', () => {
  assert.deepStrictEqual(F.dailyQuotas(0, week(), 0), [0, 0, 0, 0, 0]);
});

/* ── forecastAssignee: упаковка ───────────────────────────────────────────── */

test('forecast: одна задача 16ч при 8ч/день → Пн-Вт', () => {
  const r = F.forecastAssignee({
    queue: [{ issueId: 'T-1', needMin: 960 }],
    capacityHours: 40, days: week(), usefulHoursPerDay: 0,
  });
  assert.deepStrictEqual(r.unfit, []);
  assert.deepStrictEqual(r.dates['T-1'], { startIso: '2026-06-01', endIso: '2026-06-02' });
});
test('forecast: вторая задача стартует в остатке дня первой', () => {
  const r = F.forecastAssignee({
    queue: [{ issueId: 'T-1', needMin: 720 }, { issueId: 'T-2', needMin: 720 }], // 12ч + 12ч
    capacityHours: 40, days: week(), usefulHoursPerDay: 0,
  });
  // T-1: Пн(8)+Вт(4) → 01–02; T-2: Вт(4)+Ср(8) → 02–03
  assert.deepStrictEqual(r.dates['T-1'], { startIso: '2026-06-01', endIso: '2026-06-02' });
  assert.deepStrictEqual(r.dates['T-2'], { startIso: '2026-06-02', endIso: '2026-06-03' });
});
test('forecast: кап useful растягивает прогноз', () => {
  const r = F.forecastAssignee({
    queue: [{ issueId: 'T-1', needMin: 960 }], // 16ч
    capacityHours: 40, days: week(), usefulHoursPerDay: 6,
  });
  // 6ч/день → 16ч = Пн(6)+Вт(6)+Ср(4) → 01–03
  assert.deepStrictEqual(r.dates['T-1'], { startIso: '2026-06-01', endIso: '2026-06-03' });
});
test('forecast: день отсутствия в середине входит в интервал задачи (пропуск без потребления)', () => {
  const r = F.forecastAssignee({
    queue: [{ issueId: 'T-1', needMin: 960 }], // 16ч
    capacityHours: 32, days: week({ '2026-06-02': 8 }), usefulHoursPerDay: 0,
  });
  // квоты [8,0,8,8,8]: Пн(8)+Ср(8) → 01–03 (вторник внутри, но не потребляется)
  assert.deepStrictEqual(r.dates['T-1'], { startIso: '2026-06-01', endIso: '2026-06-03' });
});
test('forecast: не влезающая задача и все последующие → unfit, даты не пишутся', () => {
  const r = F.forecastAssignee({
    queue: [
      { issueId: 'T-1', needMin: 36 * 60 },
      { issueId: 'T-2', needMin: 8 * 60 },
      { issueId: 'T-3', needMin: 60 },
    ],
    capacityHours: 40, days: week(), usefulHoursPerDay: 0,
  });
  assert.deepStrictEqual(r.dates['T-1'], { startIso: '2026-06-01', endIso: '2026-06-05' });
  assert.deepStrictEqual(r.unfit, ['T-2', 'T-3']);
  assert.strictEqual(r.dates['T-2'], undefined);
  assert.strictEqual(r.dates['T-3'], undefined);
});
test('forecast: Σeff=0 → все содержательные задачи unfit', () => {
  const r = F.forecastAssignee({
    queue: [{ issueId: 'T-1', needMin: 60 }, { issueId: 'T-2', needMin: 60 }],
    capacityHours: 40,
    days: week({ '2026-06-01': 8, '2026-06-02': 8, '2026-06-03': 8, '2026-06-04': 8, '2026-06-05': 8 }),
    usefulHoursPerDay: 0,
  });
  assert.deepStrictEqual(r.unfit, ['T-1', 'T-2']);
  assert.deepStrictEqual(r.dates, {});
});
test('forecast: needMin=0 пропускается (ни dates, ни unfit)', () => {
  const r = F.forecastAssignee({
    queue: [{ issueId: 'T-0', needMin: 0 }, { issueId: 'T-1', needMin: 480 }],
    capacityHours: 40, days: week(), usefulHoursPerDay: 0,
  });
  assert.strictEqual(r.dates['T-0'], undefined);
  assert.ok(r.unfit.indexOf('T-0') === -1);
  assert.deepStrictEqual(r.dates['T-1'], { startIso: '2026-06-01', endIso: '2026-06-01' });
});
test('forecast: детерминизм — повторный вызов с теми же входами даёт тот же результат', () => {
  const input = {
    queue: [{ issueId: 'T-1', needMin: 700 }, { issueId: 'T-2', needMin: 1300 }],
    capacityHours: 33.7, days: week({ '2026-06-04': 3 }), usefulHoursPerDay: 6.5,
  };
  assert.deepStrictEqual(F.forecastAssignee(input), F.forecastAssignee(input));
});

/* ── orderQueue: виртуальная очередь ──────────────────────────────────────── */

test('orderQueue: датированные по startMs, недатированные в хвост по rank, tie-break id', () => {
  const q = F.orderQueue([
    { issueId: 'B-2', startMs: null, rank: 1 },
    { issueId: 'A-9', startMs: Date.UTC(2026, 5, 3), rank: 5 },
    { issueId: 'A-1', startMs: Date.UTC(2026, 5, 1), rank: 9 },
    { issueId: 'B-1', startMs: null, rank: 1 },
    { issueId: 'C-1', startMs: null, rank: 0 },
    { issueId: 'A-2', startMs: Date.UTC(2026, 5, 1), rank: 2 },
  ]).map(function (e) { return e.issueId; });
  // 01: A-2 (rank 2) < A-1 (rank 9); 03: A-9; без дат: C-1 (rank 0), затем B-1 < B-2 (id)
  assert.deepStrictEqual(q, ['A-2', 'A-1', 'A-9', 'C-1', 'B-1', 'B-2']);
});

/* ── capacity-pure: извлечённые пер-дневные примитивы (#40) ───────────────── */

test('absenceBounds: невалидные/перевёрнутые диапазоны отбрасываются, частичный день → hd', () => {
  const b = C.absenceBounds([
    { from: '2026-06-02', to: '2026-06-03' },
    { from: '2026-06-10', to: '2026-06-01' },          // to < from → drop
    { from: 'мусор', to: '2026-06-05' },               // NaN → drop
    { from: '2026-06-04', to: '2026-06-04', hoursDelta: 2 },
  ]);
  assert.strictEqual(b.length, 2);
  assert.strictEqual(b[0][2], -1);
  assert.strictEqual(b[1][2], 2);
});
test('absenceHoursOfDay: полный день = рабочие часы дня, частичный = min(hd, часы дня), вне диапазона = 0', () => {
  const b = C.absenceBounds([
    { from: '2026-06-02', to: '2026-06-02' },
    { from: '2026-06-04', to: '2026-06-04', hoursDelta: 2 },
  ]);
  assert.strictEqual(C.absenceHoursOfDay('2026-06-02', b, null, 8), 8);
  assert.strictEqual(C.absenceHoursOfDay('2026-06-04', b, null, 8), 2);
  assert.strictEqual(C.absenceHoursOfDay('2026-06-03', b, null, 8), 0);
});
test('absenceHoursOfDay: отсутствие на праздник/выходной = 0 (cap рабочими часами)', () => {
  const b = C.absenceBounds([{ from: '2026-06-06', to: '2026-06-07' }]); // Сб-Вс
  assert.strictEqual(C.absenceHoursOfDay('2026-06-06', b, null, 8), 0);
});
test('absenceHours: рефактор-эквивалентность — сумма по дням совпадает с пер-дневными вызовами', () => {
  const ranges = [
    { from: '2026-06-02', to: '2026-06-03' },
    { from: '2026-06-03', to: '2026-06-04', hoursDelta: 3 }, // перекрытие: max(full, 3)
  ];
  const startMs = Date.UTC(2026, 5, 1), endMs = Date.UTC(2026, 5, 5);
  const b = C.absenceBounds(ranges);
  let manual = 0;
  C.dayKeysUTC(startMs, endMs).forEach(function (iso) {
    manual += C.absenceHoursOfDay(iso, b, null, 8);
  });
  assert.strictEqual(C.absenceHours(ranges, startMs, endMs, null, 8), manual);
  assert.strictEqual(manual, 8 + 8 + 3); // Вт full, Ср max(full=8? нет: full-диапазон кроет Ср→8), Чт 3
});
