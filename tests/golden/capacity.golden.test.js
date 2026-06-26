'use strict';
/* #45 R2 — golden-снимок формы записи ёмкости (computeCapacity, Full). Детерминирован
 * (фикс-вход, без Date.now/окружения). Несовпадение = поведение формулы изменилось →
 * либо регрессия (чинить), либо осознанная правка (GOLDEN_UPDATE=1 npm run test:golden).
 * computeCapacity — backend (авторитет); паритет с фронтом пинит capacity-parity.test.js. */

const test = require('node:test');
const path = require('node:path');
const { checkJsonSnapshot } = require('./snap');

const back = require(path.join(__dirname, '..', '..', 'backend-project.js'));

const JUN = function (d) { return Date.UTC(2026, 5, d); };

test('golden: computeCapacity — Full record shape (мультироль + short + vacation + holiday)', () => {
  const record = {
    constants: { kpe: { Junior: 0.5, Middle: 0.65, Senior: 0.75 }, hoursPerDay: 8, usefulHoursPerDay: 6 },
    persons: {
      alice: { grade: 'Middle', rate: 1.0, participation: 0.8, alloc: { analysis: 0.5, testing: 0.5 } },
      bob: { grade: 'Senior', rate: 0.5, alloc: { analysis: 1.0 } }, // participation отсутствует → 1
      carol: { grade: 'Junior', rate: 1.0, participation: 1.0, alloc: { devBack: 0.7 } }
    }
  };
  const calendar = { years: { '2026': [
    { date: '2026-06-03', type: 'short', hoursDelta: -1 },
    { date: '2026-06-04', type: 'holiday', hoursDelta: 0 }
  ] } };
  const absences = {
    alice: [{ from: '2026-06-02', to: '2026-06-02', type: 'vacation' }],
    bob: [{ from: '2026-06-01', to: '2026-06-02', type: 'out_of_membership' }]
  };
  const out = back.computeCapacity(record, calendar, absences, JUN(1), JUN(5));
  checkJsonSnapshot('capacity-full-record', out);
});

test('golden: computeCapacity — граница года D10', () => {
  const record = {
    constants: { kpe: { Senior: 0.75 }, hoursPerDay: 8 },
    persons: { x: { grade: 'Senior', rate: 1.0, alloc: { analysis: 1.0 } } }
  };
  const calendar = { years: {
    '2026': [{ date: '2026-12-31', type: 'holiday', hoursDelta: 0 }],
    '2027': [{ date: '2027-01-01', type: 'holiday', hoursDelta: 0 }]
  } };
  const out = back.computeCapacity(record, calendar, {}, Date.UTC(2026, 11, 30), Date.UTC(2027, 0, 4));
  checkJsonSnapshot('capacity-year-boundary', out);
});
