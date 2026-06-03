'use strict';
// Unit tests for widgets/main/src/period-pure.js — #34.
// parsePeriod: голое число = часы, locale-aware часы/минуты, дни/недели убраны.
// fmtPeriod/fmtHours/fmtHoursOnly — вывод не менялся (часы+минуты через __SSP_T).

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const { parsePeriod, fmtPeriod } = require('../../widgets/main/src/period-pure.js');

// Помощник: временно подменить активную локаль (минуты/часы short) через window.__SSP_T.
function withLocale(map, fn) {
  const prev = global.window;
  global.window = { __SSP_T: (k) => (map[k] !== undefined ? map[k] : k) };
  try { fn(); } finally { global.window = prev; }
}

afterEach(() => { delete global.window; });

describe('parsePeriod — голое число = часы (#34)', () => {
  it('целое без суффикса трактуется как часы', () => {
    assert.strictEqual(parsePeriod('16'), 960);
    assert.strictEqual(parsePeriod('1'), 60);
    assert.strictEqual(parsePeriod('  8 '), 480);
  });
});

describe('parsePeriod — RU/EN суффиксы часов/минут', () => {
  it('часы', () => {
    assert.strictEqual(parsePeriod('16ч'), 960);
    assert.strictEqual(parsePeriod('16h'), 960);
    assert.strictEqual(parsePeriod('2 ч'), 120);
  });
  it('минуты', () => {
    assert.strictEqual(parsePeriod('90м'), 90);
    assert.strictEqual(parsePeriod('30m'), 30);
    assert.strictEqual(parsePeriod('45 мин'), 45);
    assert.strictEqual(parsePeriod('45min'), 45);
  });
  it('часы + минуты', () => {
    assert.strictEqual(parsePeriod('1ч 30м'), 90);
    assert.strictEqual(parsePeriod('2h 15m'), 135);
  });
});

describe('parsePeriod — дни/недели убраны (#34)', () => {
  it('бывший day-суффикс теперь часы, не 480', () => {
    assert.strictEqual(parsePeriod('5д'), 300); // 5ч, а не 2400
    assert.strictEqual(parsePeriod('5d'), 300);
  });
  it('бывший week-суффикс теперь часы, не 2400', () => {
    assert.strictEqual(parsePeriod('2н'), 120); // 2ч, а не 4800
    assert.strictEqual(parsePeriod('1w'), 60);
  });
  it('неизвестный суффикс трактуется как часы (lenient)', () => {
    assert.strictEqual(parsePeriod('3x'), 180);
  });
});

describe('parsePeriod — пусто/мусор', () => {
  it('пустое и нечисловое → 0', () => {
    assert.strictEqual(parsePeriod(''), 0);
    assert.strictEqual(parsePeriod('   '), 0);
    assert.strictEqual(parsePeriod('abc'), 0);
    assert.strictEqual(parsePeriod(null), 0);
    assert.strictEqual(parsePeriod(undefined), 0);
  });
});

describe('parsePeriod — locale-aware (round-trip инвариант)', () => {
  it('турецкий: minuteShort=d, hourShort=s (коллизия дня снята)', () => {
    withLocale({ hourShort: 's', minuteShort: 'd' }, () => {
      assert.strictEqual(parsePeriod('30d'), 30);   // 30 минут, не 30 дней
      assert.strictEqual(parsePeriod('2s'), 120);   // 2 часа
      assert.strictEqual(parsePeriod('2s 30d'), 150);
    });
  });
  it('японский: hourShort=時, minuteShort=分', () => {
    withLocale({ hourShort: '時', minuteShort: '分' }, () => {
      assert.strictEqual(parsePeriod('16時'), 960);
      assert.strictEqual(parsePeriod('30分'), 30);
    });
  });
  it('ven.: ASCII h/m работают в любой локали', () => {
    withLocale({ hourShort: 's', minuteShort: 'd' }, () => {
      assert.strictEqual(parsePeriod('16h'), 960);
      assert.strictEqual(parsePeriod('30m'), 30);
    });
  });
});

describe('parsePeriod ↔ fmtPeriod round-trip', () => {
  it('parse(fmt(x)) === x (RU/EN по умолчанию)', () => {
    [0, 30, 60, 90, 480, 960, 1234].forEach((x) => {
      assert.strictEqual(parsePeriod(fmtPeriod(x)), x);
    });
  });
  it('round-trip в локали с собственными суффиксами (ja)', () => {
    withLocale({ hourShort: '時', minuteShort: '分' }, () => {
      [30, 90, 960].forEach((x) => {
        assert.strictEqual(parsePeriod(fmtPeriod(x)), x);
      });
    });
  });
});
