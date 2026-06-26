'use strict';
/* #45 R2 — паритет фронт≡бэк (gotcha #5). Формула продублирована осознанно (две среды:
 * esbuild ES2017 vs YT-scripting ES5; общий модуль не импортируется). Этот тест — ЕДИНСТВЕННЫЙ
 * ловец дрейфа: один набор примитивов-фикстур → CAPACITY_PURE (фронт) ≡ computeCapacity (бэк),
 * число-в-число. Любая правка формулы в одном файле без второго красит этот тест. */

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const front = require('../../widgets/main/src/pure/capacity-pure.js');
const back = require(path.join(__dirname, '..', '..', 'backend-project.js'));

const JUN = function (d) { return Date.UTC(2026, 5, d); };
const DEC = function (y, mo, d) { return Date.UTC(y, mo, d); };

const FIXTURES = [
  {
    name: 'базовый мультироль + short + vacation',
    record: { constants: { kpe: { Middle: 0.65, Senior: 0.75 }, hoursPerDay: 8 }, persons: {
      alice: { grade: 'Middle', rate: 1.0, alloc: { analysis: 0.5, testing: 0.5 } },
      bob: { grade: 'Senior', rate: 0.5, alloc: { analysis: 1.0 } }
    } },
    calendar: { years: { '2026': [{ date: '2026-06-03', type: 'short', hoursDelta: -1 }] } },
    absences: { alice: [{ from: '2026-06-02', to: '2026-06-02', type: 'vacation' }] },
    start: JUN(1), end: JUN(5)
  },
  {
    name: 'перекрытие отсутствий (set-union) + holiday + workday',
    record: { constants: { kpe: { Junior: 0.5, Middle: 0.65 }, hoursPerDay: 8 }, persons: {
      u1: { grade: 'Junior', rate: 1.0, alloc: { devBack: 0.4, devFront: 0.3 } },
      u2: { grade: 'Middle', rate: 0.75, alloc: { devBack: 0.6 } }
    } },
    calendar: { years: { '2026': [
      { date: '2026-06-23', type: 'holiday', hoursDelta: 0 },
      { date: '2026-06-27', type: 'workday', hoursDelta: 0 }
    ] } },
    absences: { u1: [
      { from: '2026-06-23', to: '2026-06-25', type: 'vacation' },
      { from: '2026-06-24', to: '2026-06-26', type: 'sick' }
    ] },
    start: JUN(22), end: JUN(28)
  },
  {
    name: 'граница года D10',
    record: { constants: { kpe: { Senior: 0.75 }, hoursPerDay: 8 }, persons: {
      x: { grade: 'Senior', rate: 1.0, alloc: { analysis: 1.0 } }
    } },
    calendar: { years: {
      '2026': [{ date: '2026-12-31', type: 'holiday', hoursDelta: 0 }],
      '2027': [{ date: '2027-01-01', type: 'holiday', hoursDelta: 0 }]
    } },
    absences: {},
    start: DEC(2026, 11, 30), end: DEC(2027, 0, 4)
  },
  {
    name: 'дробные часы 3×⅓ alloc (float-устойчивость)',
    record: { constants: { kpe: { Middle: 0.65 }, hoursPerDay: 8 }, persons: {
      p: { grade: 'Middle', rate: 1.0, alloc: { analysis: 1 / 3, testing: 1 / 3, devBack: 1 / 3 } }
    } },
    calendar: null, absences: {}, start: JUN(1), end: JUN(12)
  },
  {
    name: 'пустой ростер / без календаря',
    record: { constants: { hoursPerDay: 8 }, persons: {} },
    calendar: null, absences: {}, start: JUN(1), end: JUN(5)
  },
  {
    name: 'per-person participation (% участия) — отдельный множитель',
    record: { constants: { kpe: { Junior: 0.5, Middle: 0.65, Senior: 0.75 }, hoursPerDay: 8 }, persons: {
      half: { grade: 'Middle', rate: 0.5, participation: 0.8, alloc: { analysis: 0.5, testing: 0.5 } },
      full: { grade: 'Senior', rate: 1.0, participation: 1.0, alloc: { devBack: 1.0 } },
      noPart: { grade: 'Junior', rate: 1.0, alloc: { devFront: 1.0 } } // participation отсутствует → дефолт 1
    } },
    calendar: { years: { '2026': [{ date: '2026-06-03', type: 'short', hoursDelta: -1 }] } },
    absences: { half: [{ from: '2026-06-02', to: '2026-06-02', type: 'vacation' }] },
    start: JUN(1), end: JUN(5)
  }
];

FIXTURES.forEach(function (fx) {
  test('parity: ' + fx.name, () => {
    const f = front.computeCapacity(fx.record, fx.calendar, fx.absences, fx.start, fx.end);
    const b = back.computeCapacity(fx.record, fx.calendar, fx.absences, fx.start, fx.end);
    assert.strictEqual(JSON.stringify(f), JSON.stringify(b),
      'фронт≡бэк дрейф в фикстуре «' + fx.name + '»:\n  front=' + JSON.stringify(f) + '\n  back =' + JSON.stringify(b));
  });
});

/* Точечный паритет вспомогательных функций (мост day-key / absence). */
test('parity: validateAllocSums идентичен', () => {
  const p = { u: { alloc: { a: 0.5, b: 0.5 + 1e-9 } } };
  assert.strictEqual(JSON.stringify(front.validateAllocSums(p)), JSON.stringify(back.validateAllocSums(p)));
});
test('parity: workingHoursInSprint идентичен на границе года', () => {
  const cal = { years: { '2026': [{ date: '2026-12-31', type: 'short', hoursDelta: -2 }] } };
  assert.strictEqual(
    front.workingHoursInSprint(DEC(2026, 11, 28), DEC(2027, 0, 3), cal, 8),
    back.workingHoursInSprint(DEC(2026, 11, 28), DEC(2027, 0, 3), cal, 8));
});
