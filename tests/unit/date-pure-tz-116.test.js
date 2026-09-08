'use strict';
/* #116 — «дата без времени» = ближайшая UTC-полночь: одна и та же календарная дата во всех поясах.
   В процессе — правило dayMs и симметрия toDateIn/fromDateIn; дочерними процессами под тремя
   поясами — что старые значения (локальная полночь, так писал fromDateIn до 3.39.1) и новые
   (UTC-полночь) читаются одним днём, а окно ёмкости совпадает с формой спринта. Node фиксирует
   TZ при старте процесса, поэтому пояса гоняются child-процессами. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const DP = require('../../widgets/main/src/pure/date-pure.js');
const DAY = 86400000;
const MAY18 = Date.UTC(2026, 4, 18);

test('#116 dayMs: ровно полночь — она сама; ±11 ч — тот же день; полдень UTC — тот же день; полдень + 1 мс — следующий', () => {
  assert.equal(DP.dayMs(MAY18), MAY18);
  assert.equal(DP.dayMs(MAY18 - 3 * 3600000), MAY18);          /* полночь Москвы */
  assert.equal(DP.dayMs(MAY18 - 11 * 3600000), MAY18);
  assert.equal(DP.dayMs(MAY18 + 7 * 3600000), MAY18);          /* полночь Лос-Анджелеса */
  assert.equal(DP.dayMs(MAY18 + 11 * 3600000), MAY18);
  assert.equal(DP.dayMs(MAY18 + 12 * 3600000), MAY18);         /* полдень UTC — поле «дата» YouTrack */
  assert.equal(DP.dayMs(MAY18 + 12 * 3600000 + 1), MAY18 + DAY);
});

test('#116 fromDateIn пишет UTC-полночь, toDateIn/fmtDay читают её же — без дрейфа за цикл «форма → сохранение»', () => {
  assert.equal(DP.fromDateIn('2026-05-18'), MAY18);
  assert.equal(DP.toDateIn(MAY18), '2026-05-18');
  assert.equal(DP.toDateIn(DP.fromDateIn('2026-05-18')), '2026-05-18');
  assert.equal(DP.fmtDay(MAY18, 'ru'), '18.05.2026');
  assert.equal(DP.fmtDay(MAY18, 'en'), '05/18/2026');
  assert.equal(DP.fmtDay(MAY18 + 12 * 3600000, 'ru'), '18.05.2026');
  assert.equal(DP.fmtDay(null, 'ru'), '—');
  assert.equal(DP._fmtGanttDay(MAY18, 'ru'), '18.05');
});

const CHILD = `
  const DP = require(${JSON.stringify(path.resolve(__dirname, '../../widgets/main/src/pure/date-pure.js'))});
  const CP = require(${JSON.stringify(path.resolve(__dirname, '../../widgets/main/src/pure/capacity-pure.js'))});
  const legacyStart = new Date(2026, 4, 18).getTime();   /* локальная полночь пояса процесса */
  const legacyEnd   = new Date(2026, 4, 31).getTime();
  const keys = CP.dayKeysUTC(legacyStart, legacyEnd);
  process.stdout.write(JSON.stringify({
    legacyIn: DP.toDateIn(legacyStart), legacyFmt: DP.fmtDay(legacyStart, 'ru'),
    newIn: DP.toDateIn(DP.fromDateIn('2026-05-18')), newIsUtc: DP.fromDateIn('2026-05-18') === Date.UTC(2026, 4, 18),
    noon: DP.fmtDay(Date.UTC(2026, 4, 18, 12), 'en'),
    capFirst: keys[0], capLast: keys[keys.length - 1], capLen: keys.length,
    ganttLabel: new Date(DP.dayMs(legacyStart)).toLocaleDateString('ru', { day: 'numeric', month: '2-digit', timeZone: 'UTC' }),
  }));
`;

for (const tz of ['America/Los_Angeles', 'Europe/Moscow', 'Asia/Bangkok']) {
  test('#116 под TZ=' + tz + ': старая локальная полночь и новая UTC-полночь читаются одним днём, окно ёмкости = форме спринта', () => {
    const raw = execFileSync(process.execPath, ['-e', CHILD], { env: Object.assign({}, process.env, { TZ: tz }), encoding: 'utf8' });
    const r = JSON.parse(raw);
    assert.equal(r.legacyIn, '2026-05-18', tz + ' toDateIn(legacy)');
    assert.equal(r.legacyFmt, '18.05.2026', tz + ' fmtDay(legacy)');
    assert.equal(r.newIn, '2026-05-18', tz + ' round-trip');
    assert.equal(r.newIsUtc, true, tz + ' fromDateIn → UTC');
    assert.equal(r.noon, '05/18/2026', tz + ' noon UTC');
    assert.equal(r.capFirst, '2026-05-18', tz + ' capacity first day');
    assert.equal(r.capLast, '2026-05-31', tz + ' capacity last day');
    assert.equal(r.capLen, 14, tz + ' capacity days');
    assert.equal(r.ganttLabel, '18.05', tz + ' gantt axis label');
  });
}
