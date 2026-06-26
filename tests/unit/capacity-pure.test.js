'use strict';
/* #45 R2 — unit-тесты чистой формулы ёмкости (widgets/main/src/pure/capacity-pure.js).
 * Канон — ЧАСЫ, UTC day-keys. Покрытие: workingHoursInSprint (holiday/short/workday/
 * fallback/граница года D10/non-UTC TZ), nominal/base/roleCapacity, validateAllocSums
 * (Σ=1/Σ>1+EPS/Σ<1/3×⅓), absenceHours set-union перекрытий (D5) + pro-rata out_of_membership. */

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const C = require('../../widgets/main/src/pure/capacity-pure.js');

/* Июнь-2026 якорь: 2026-06-01 = понедельник (подтверждено parity-проверкой). */
const JUN = function (d) { return Date.UTC(2026, 5, d); };

/* ── day-keys / UTC мост ──────────────────────────────────────────────────── */

test('dayKeysUTC: inclusive окно, ISO-дни', () => {
  assert.deepStrictEqual(C.dayKeysUTC(JUN(1), JUN(5)),
    ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05']);
});
test('dayKeysUTC: end<start → []', () => {
  assert.deepStrictEqual(C.dayKeysUTC(JUN(5), JUN(1)), []);
});
test('dayKeysUTC: время суток внутри epoch-ms не влияет (день нормализуется в UTC)', () => {
  assert.deepStrictEqual(C.dayKeysUTC(JUN(1) + 23 * 3600000, JUN(2) + 1), ['2026-06-01', '2026-06-02']);
});
test('isWeekendUTC: Sat/Sun по UTC', () => {
  assert.strictEqual(C.isWeekendUTC('2026-06-06'), true);  // Sat
  assert.strictEqual(C.isWeekendUTC('2026-06-07'), true);  // Sun
  assert.strictEqual(C.isWeekendUTC('2026-06-01'), false); // Mon
});
test('isoToUTCms: отклоняет нереальную дату (31 апреля)', () => {
  assert.ok(isNaN(C.isoToUTCms('2026-04-31')));
  assert.ok(isNaN(C.isoToUTCms('2026-13-01')));
  assert.ok(!isNaN(C.isoToUTCms('2026-02-28')));
});

/* ── workingHoursInSprint ──────────────────────────────────────────────────── */

test('working: рабочая неделя Пн-Пт без календаря = 5×8 = 40', () => {
  assert.strictEqual(C.workingHoursInSprint(JUN(1), JUN(5), null, 8), 40);
});
test('working: окно с выходными — Сб/Вс = 0 (fallback)', () => {
  // Пн 01 .. Вс 07 → 5 рабочих дней
  assert.strictEqual(C.workingHoursInSprint(JUN(1), JUN(7), null, 8), 40);
});
test('working: holiday = 0ч в этот день', () => {
  const cal = { years: { '2026': [{ date: '2026-06-03', type: 'holiday', hoursDelta: 0 }] } };
  assert.strictEqual(C.workingHoursInSprint(JUN(1), JUN(5), cal, 8), 32); // 4×8
});
test('working: short = hoursPerDay + hoursDelta (−1)', () => {
  const cal = { years: { '2026': [{ date: '2026-06-03', type: 'short', hoursDelta: -1 }] } };
  assert.strictEqual(C.workingHoursInSprint(JUN(1), JUN(5), cal, 8), 39); // 4×8 + 7
});
test('working: workday (рабочий выходной) = hoursPerDay даже в Сб', () => {
  const cal = { years: { '2026': [{ date: '2026-06-06', type: 'workday', hoursDelta: 0 }] } };
  // Сб 06 как рабочий: окно только этот день
  assert.strictEqual(C.workingHoursInSprint(JUN(6), JUN(6), cal, 8), 8);
  // без календаря тот же день = 0
  assert.strictEqual(C.workingHoursInSprint(JUN(6), JUN(6), null, 8), 0);
});
test('working: short не уходит в минус (max 0)', () => {
  const cal = { years: { '2026': [{ date: '2026-06-01', type: 'short', hoursDelta: -8 }] } };
  assert.strictEqual(C.workingHoursOfDay('2026-06-01', cal, 8), 0);
});

/* ── граница года D10 ──────────────────────────────────────────────────────── */

test('D10: окно через границу года — lookup консультирует ОБА года', () => {
  const start = Date.UTC(2026, 11, 31); // 2026-12-31
  const end = Date.UTC(2027, 0, 1);     // 2027-01-01
  assert.deepStrictEqual(C.dayKeysUTC(start, end), ['2026-12-31', '2027-01-01']);
  const cal = {
    years: {
      '2026': [{ date: '2026-12-31', type: 'holiday', hoursDelta: 0 }],
      '2027': [{ date: '2027-01-01', type: 'holiday', hoursDelta: 0 }]
    }
  };
  // оба дня — праздники из СВОИХ годовых массивов → 0
  assert.strictEqual(C.workingHoursInSprint(start, end, cal, 8), 0);
  // holiday только 2026 → 2027-01-01 падает в fallback (его weekday)
  const calPartial = { years: { '2026': [{ date: '2026-12-31', type: 'holiday', hoursDelta: 0 }] } };
  const expected2027 = C.isWeekendUTC('2027-01-01') ? 0 : 8;
  assert.strictEqual(C.workingHoursInSprint(start, end, calPartial, 8), expected2027);
});

/* ── non-UTC TZ иммунность (gotcha #1) ─────────────────────────────────────── */

test('TZ-иммунность: working/computeCapacity идентичны под America/New_York и Asia/Kolkata', () => {
  const snippet =
    "const C=require(" + JSON.stringify(path.resolve(__dirname, '../../widgets/main/src/pure/capacity-pure.js')) + ");" +
    "const cal={years:{'2026':[{date:'2026-06-03',type:'short',hoursDelta:-1}]}};" +
    "const abs={a:[{from:'2026-06-02',to:'2026-06-02',type:'vacation'}]};" +
    "const rec={constants:{kpe:{Middle:0.65},hoursPerDay:8},persons:{a:{grade:'Middle',rate:1,alloc:{analysis:1}}}};" +
    "process.stdout.write(JSON.stringify(C.computeCapacity(rec,cal,abs,Date.UTC(2026,5,1),Date.UTC(2026,5,5))));";
  const runUnder = function (tz) {
    return execFileSync(process.execPath, ['-e', snippet], { env: Object.assign({}, process.env, { TZ: tz }), encoding: 'utf8' });
  };
  const utc = runUnder('UTC');
  assert.strictEqual(runUnder('America/New_York'), utc, 'NY (DST) разошёлся с UTC');
  assert.strictEqual(runUnder('Asia/Kolkata'), utc, 'Kolkata (UTC+5:30) разошёлся с UTC');
});

/* ── nominal / base / roleCapacity ─────────────────────────────────────────── */

test('nominal = max(0, working − absence); base = nominal×kpe×rate×participation', () => {
  assert.strictEqual(C.nominal(40, 8), 32);
  assert.strictEqual(C.nominal(8, 40), 0); // absence>working → 0, не отрицательное
  assert.strictEqual(C.baseHours(40, 'Middle', 1, 1, { Middle: 0.65 }), 26);
  assert.strictEqual(C.baseHours(40, 'Senior', 0.5, 1, { Senior: 0.75 }), 15);
  // % участия — отдельный множитель (Вариант A, как в старой форме)
  assert.strictEqual(C.baseHours(40, 'Middle', 1, 0.8, { Middle: 0.65 }), 40 * 0.65 * 0.8);
  assert.strictEqual(C.baseHours(40, 'Senior', 0.5, 0.5, { Senior: 0.75 }), 40 * 0.75 * 0.5 * 0.5);
  assert.strictEqual(C.baseHours(40, 'Middle', 1, undefined, { Middle: 0.65 }), 26); // participation дефолт 1
});

test('participation: per-person отдельный множитель base; role-scoped через alloc', () => {
  const rec = {
    constants: { kpe: { Middle: 0.65 }, hoursPerDay: 8 },
    persons: { bob: { grade: 'Middle', rate: 0.5, participation: 0.8, alloc: { analysis: 1 } } } // полставки × 80%
  };
  const out = C.computeCapacity(rec, null, {}, JUN(1), JUN(5)); // working 40
  assert.strictEqual(out.persons.bob.participation, 0.8);
  assert.strictEqual(out.persons.bob.base, 40 * 0.65 * 0.5 * 0.8);
  assert.strictEqual(out.roleCapacities.analysis, 40 * 0.65 * 0.5 * 0.8);
});

test('participation: отсутствует → дефолт 1.0 (base не меняется)', () => {
  const rec = { constants: { kpe: { Middle: 0.65 }, hoursPerDay: 8 }, persons: { x: { grade: 'Middle', rate: 1, alloc: { analysis: 1 } } } };
  const out = C.computeCapacity(rec, null, {}, JUN(1), JUN(5));
  assert.strictEqual(out.persons.x.participation, 1);
  assert.strictEqual(out.persons.x.base, 26);
});
test('kpeFor: снимок → дефолт-таблица → 0', () => {
  assert.strictEqual(C.kpeFor('Middle', { Middle: 0.7 }), 0.7); // снимок приоритетен
  assert.strictEqual(C.kpeFor('Senior', {}), 0.75);             // дефолт
  assert.strictEqual(C.kpeFor('Unknown', {}), 0);               // нет → 0
});
test('roleCapacity = Σ base×alloc(R), мультироль role-scoped', () => {
  const rec = {
    constants: { kpe: { Middle: 0.65, Senior: 0.75 }, hoursPerDay: 8 },
    persons: {
      alice: { grade: 'Middle', rate: 1, alloc: { analysis: 0.5, testing: 0.5 } },
      bob: { grade: 'Senior', rate: 1, alloc: { analysis: 1 } }
    }
  };
  const out = C.computeCapacity(rec, null, {}, JUN(1), JUN(5)); // 40 working
  assert.strictEqual(out.persons.alice.base, 26);   // 40×0.65
  assert.strictEqual(out.persons.bob.base, 30);     // 40×0.75
  assert.strictEqual(out.roleCapacities.analysis, 13 + 30); // alice .5×26=13 + bob 30
  assert.strictEqual(out.roleCapacities.testing, 13);
});

/* ── validateAllocSums (D1a + EPS) ─────────────────────────────────────────── */

test('validateAllocSums: Σ=1.0 ok', () => {
  assert.deepStrictEqual(C.validateAllocSums({ u: { alloc: { a: 0.5, b: 0.5 } } }), { ok: true });
});
test('validateAllocSums: Σ=1.0+1e-9 в пределах EPS → ok', () => {
  assert.strictEqual(C.validateAllocSums({ u: { alloc: { a: 0.5, b: 0.5 + 1e-9 } } }).ok, true);
});
test('validateAllocSums: 3×⅓ (float) → ok', () => {
  assert.strictEqual(C.validateAllocSums({ u: { alloc: { a: 1 / 3, b: 1 / 3, c: 1 / 3 } } }).ok, true);
});
test('validateAllocSums: Σ<1.0 ok (буфер)', () => {
  assert.strictEqual(C.validateAllocSums({ u: { alloc: { a: 0.3 } } }).ok, true);
});
test('validateAllocSums: Σ=1.01 > 1+EPS → fail с offender', () => {
  const r = C.validateAllocSums({ u: { alloc: { a: 0.51, b: 0.5 } } });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.offender, 'u');
});

/* ── absenceHours: set-union + pro-rata (D5 / gotcha #12) ───────────────────── */

test('absence set-union: перекрытие vacation+sick НЕ двоится', () => {
  // окно 2026-06-22(Пн)..06-26(Пт). vacation 23-25, sick 24-26 → union {23,24,25,26}=4×8=32
  const ranges = [
    { from: '2026-06-23', to: '2026-06-25', type: 'vacation' },
    { from: '2026-06-24', to: '2026-06-26', type: 'sick' }
  ];
  assert.strictEqual(C.absenceHours(ranges, JUN(22), JUN(26), null, 8), 32);
});
test('absence на праздник = 0ч (математика типа-агностична)', () => {
  const cal = { years: { '2026': [{ date: '2026-06-23', type: 'holiday', hoursDelta: 0 }] } };
  assert.strictEqual(C.absenceHours([{ from: '2026-06-23', to: '2026-06-23', type: 'vacation' }], JUN(23), JUN(23), cal, 8), 0);
});
test('absence вне окна спринта → 0', () => {
  assert.strictEqual(C.absenceHours([{ from: '2026-06-20', to: '2026-06-22', type: 'vacation' }], JUN(1), JUN(5), null, 8), 0);
});
test('pro-rata out_of_membership: приход в середине спринта', () => {
  // окно 06-01..06-05 (40ч). out_of_membership 06-01..06-02 (вышел 06-03) → −16ч → nominal 24
  const rec = {
    constants: { kpe: { Middle: 0.65 }, hoursPerDay: 8 },
    persons: { newbie: { grade: 'Middle', rate: 1, alloc: { analysis: 1 } } }
  };
  const abs = { newbie: [{ from: '2026-06-01', to: '2026-06-02', type: 'out_of_membership' }] };
  const out = C.computeCapacity(rec, null, abs, JUN(1), JUN(5));
  assert.strictEqual(out.persons.newbie.absenceHours, 16);
  assert.strictEqual(out.persons.newbie.nominal, 24);
  assert.strictEqual(out.persons.newbie.base, 24 * 0.65);
});
test('roleCapacity: Σ base×alloc(rk) по людям из frozen-записи (#45 R4 §9)', () => {
  const rec = { persons: {
    a: { base: 100, alloc: { analysis: 0.5, testing: 0.5 } },
    b: { base: 80,  alloc: { analysis: 1 } },
    c: { base: 60,  alloc: { testing: 1 } },
  } };
  assert.strictEqual(C.roleCapacity('analysis', rec), 130); // 100*0.5 + 80*1
  assert.strictEqual(C.roleCapacity('testing', rec), 110);  // 100*0.5 + 60*1
  assert.strictEqual(C.roleCapacity('devBack', rec), 0);    // никто не аллоцирован на роль
  assert.strictEqual(C.roleCapacity('analysis', null), 0);  // нет записи
  assert.strictEqual(C.roleCapacity('analysis', {}), 0);    // нет persons
});
