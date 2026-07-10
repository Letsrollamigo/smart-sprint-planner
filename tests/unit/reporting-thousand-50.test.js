'use strict';

/* #50 S8a — B3 «1000 мелочей» (контур B): чистый computeThousand.
   Счётчик задач с тегом за период + среднемесячный темп с начала года
   (avgPerMonth = countYtd ÷ прошедших месяцев, месяц 0..11 + дробь по дню, кламп ≥1). */

const test = require('node:test');
const assert = require('node:assert');
const pure = require('../../widgets/main/src/pure/reporting-pure.js');

test('computeThousand: countPeriod проходит насквозь (округление, ≥0)', () => {
  const now = Date.UTC(2026, 6, 9);
  assert.strictEqual(pure.computeThousand(42, 100, now).countPeriod, 42);
  assert.strictEqual(pure.computeThousand(42.7, 100, now).countPeriod, 43);   /* округляет */
  assert.strictEqual(pure.computeThousand(-5, 100, now).countPeriod, 0);      /* <0 → 0 */
  assert.strictEqual(pure.computeThousand('x', 100, now).countPeriod, 0);     /* не число → 0 */
});

test('computeThousand: Dec 31 → ровно 12 прошедших месяцев (среднее точное)', () => {
  const now = Date.UTC(2026, 11, 31);   /* mo=11, day=31/31 → monthsElapsed = 11 + 1 = 12 */
  const out = pure.computeThousand(3, 120, now);
  assert.strictEqual(out.countYtd, 120);
  assert.strictEqual(out.avgPerMonth, 10);   /* 120 / 12 */
});

test('computeThousand: начало января клампится к 1 месяцу (не делит на ~0)', () => {
  const now = Date.UTC(2026, 0, 5);   /* monthsElapsed = 0 + 5/31 ≈ 0.16 → clamp 1 */
  const out = pure.computeThousand(7, 9, now);
  assert.strictEqual(out.avgPerMonth, 9);    /* 9 / 1 */
});

test('computeThousand: середина года — среднемесячный темп по дробным месяцам', () => {
  const now = Date.UTC(2026, 6, 9);   /* July: mo=6, day=9, daysInMo=31 → 6 + 9/31 = 6.2903… */
  const out = pure.computeThousand(20, 63, now);
  const expected = 63 / (6 + 9 / 31);
  assert.ok(Math.abs(out.avgPerMonth - expected) < 1e-9, out.avgPerMonth + ' ≈ ' + expected);
});

test('computeThousand: невалидный countYtd → среднее 0, счётчики 0', () => {
  const now = Date.UTC(2026, 6, 9);
  const out = pure.computeThousand(null, null, now);
  assert.strictEqual(out.countPeriod, 0);
  assert.strictEqual(out.countYtd, 0);
  assert.strictEqual(out.avgPerMonth, 0);
});
