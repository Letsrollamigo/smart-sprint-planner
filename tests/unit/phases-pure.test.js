'use strict';
/* #120 — чистые правила блока «Фазы работ» (pure/phases-pure.js): цепочка и ближайшая непустая
   предыдущая, порядок (только начало), границы по календарным дням (#117: последний день — внутри),
   шкала/отрезок, тон (правило одного тона), отказы только для изменённых фаз, слияние маппинга.
   Юниты бегут под TZ=UTC — зоны гоняются child-процессами (образец date-pure-tz-116): дата, чья
   локальная полночь в Лос-Анджелесе попадает в другой UTC-день, обязана дать те же проценты. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const P = require('../../widgets/main/src/pure/phases-pure.js');
const DP = require('../../widgets/main/src/pure/date-pure.js');
const DAY = 86400000;
const S0 = Date.UTC(2026, 9, 5);   /* пн 5 окт 2026 */
const S1 = Date.UTC(2026, 9, 30);  /* пт 30 окт 2026 */
const SPRINT = { dateStart: S0, dateEnd: S1 };
const d = (n) => S0 + n * DAY;
const pair = (a, b) => ({ dateStart: d(a), dateEnd: d(b) });
/* макет params-block: Анализ 5–8, Разработка 8–21, Тех.тест 19–24, Регресс 26–27, Бизнес-тест 26–28, Деплой 30 */
const MOCK = { analysis: pair(0, 3), development: pair(3, 16), techTest: pair(14, 19), regression: pair(21, 22), bizTest: pair(21, 23), deploy: pair(25, 25) };

test('#120 dayMs pure = date-pure.dayMs; normalize даёт все шесть ключей, половинка → null', () => {
  [S0, S0 + 12 * 3600000, S0 + 12 * 3600000 + 1, S0 - 11 * 3600000].forEach((ts) => assert.equal(P.dayMs(ts), DP.dayMs(ts)));
  const n = P.normalize({ analysis: pair(0, 1), deploy: { dateStart: d(1), dateEnd: null }, junk: pair(0, 1) });
  assert.deepEqual(Object.keys(n), P.PHASE_KEYS);
  assert.deepEqual(n.analysis, pair(0, 1));
  assert.equal(n.deploy, null);
  assert.equal(n.junk, undefined);
});

test('#120 pairError: half / endBeforeStart / null; конец = началу по дням — не ошибка', () => {
  assert.equal(P.pairError({ dateStart: d(1), dateEnd: null }), 'half');
  assert.equal(P.pairError({ dateStart: null, dateEnd: d(1) }), 'half');
  assert.equal(P.pairError(pair(3, 1)), 'endBeforeStart');
  assert.equal(P.pairError({ dateStart: d(1) + 3600000, dateEnd: d(1) }), null, 'тот же день по dayMs');
  assert.equal(P.pairError(null), null);
  assert.equal(P.pairError(pair(1, 2)), null);
});

test('#120 orderWarnings: Бизнес-тест 22 окт раньше Регресса 26 окт → предупреждение у бизнес-теста; конец раньше конца предыдущей — НЕТ; предыдущая — ближайшая непустая', () => {
  const w = P.orderWarnings(Object.assign({}, MOCK, { bizTest: pair(17, 23) }));
  assert.deepEqual(w, { bizTest: 'regression' });
  assert.deepEqual(P.orderWarnings(MOCK), {}, 'макет без нарушений');
  /* Регресс кончается позже Бизнес-теста — законное пересечение (§О2) */
  assert.deepEqual(P.orderWarnings(Object.assign({}, MOCK, { regression: pair(21, 27), bizTest: pair(22, 23) })), {});
  /* пустой Регресс: предыдущая для Бизнес-теста — Тех.тест (14) */
  assert.deepEqual(P.orderWarnings(Object.assign({}, MOCK, { regression: null, bizTest: pair(13, 20) })), { bizTest: 'techTest' });
  assert.deepEqual(P.orderWarnings(Object.assign({}, MOCK, { regression: null, bizTest: pair(14, 20) })), {}, 'равное начало — не нарушение');
});

test('#120 outOfRange по календарным дням: последний день спринта — внутри (#117), день после — снаружи, начало до — снаружи', () => {
  assert.deepEqual(P.outOfRange(MOCK, SPRINT), []);
  assert.deepEqual(P.outOfRange(Object.assign({}, MOCK, { deploy: pair(25, 26) }), SPRINT), ['deploy']);
  assert.deepEqual(P.outOfRange(Object.assign({}, MOCK, { analysis: pair(-1, 3) }), SPRINT), ['analysis']);
  assert.deepEqual(P.outOfRange(Object.assign({}, MOCK, { deploy: { dateStart: d(25), dateEnd: d(25) + 12 * 3600000 } }), SPRINT), [], 'полдень последнего дня — тот же день');
  assert.deepEqual(P.outOfRange(MOCK, { dateStart: null, dateEnd: S1 }), [], 'нет дат спринта — нечего сверять');
});

test('#120 rowErrors: half/endBeforeStart всегда; outOfSprint ТОЛЬКО для изменённых (старая фаза за границей не блокирует правку другой)', () => {
  const narrowed = { dateStart: S0, dateEnd: d(21) };
  const stored = Object.assign({}, MOCK);                       /* deploy 30 окт — за новой границей */
  const form = Object.assign({}, MOCK, { analysis: pair(0, 4) });
  assert.deepEqual(P.rowErrors(form, stored, narrowed), {}, 'deploy не изменился — не проверяется');
  const moved = Object.assign({}, MOCK, { deploy: pair(24, 25) });
  assert.deepEqual(P.rowErrors(moved, stored, narrowed), { deploy: 'outOfSprint' }, 'изменённый deploy за границей');
  assert.deepEqual(P.rowErrors(Object.assign({}, MOCK, { techTest: { dateStart: d(14), dateEnd: null } }), stored, SPRINT), { techTest: 'half' });
  assert.deepEqual(P.rowErrors(Object.assign({}, MOCK, { techTest: pair(19, 14) }), stored, SPRINT), { techTest: 'endBeforeStart' });
});

test('#120 isSame / changedKeys — по дням (не-полуночные ms того же дня — те же)', () => {
  const noon = Object.assign({}, MOCK, { analysis: { dateStart: d(0) + 12 * 3600000, dateEnd: d(3) + 3600000 } });
  assert.equal(P.isSame(noon, MOCK), true);
  assert.deepEqual(P.changedKeys(Object.assign({}, MOCK, { deploy: null }), MOCK), ['deploy']);
});

test('#120 scale/segment: 26 дней, недельный шаг 26.923 %, tick\'и — понедельники + последний день; отрезок клампится и помечает выход за край', () => {
  const sc = P.scale(SPRINT);
  assert.equal(sc.days, 26);
  assert.equal(sc.weekPct.toFixed(3), '26.923');
  assert.deepEqual(sc.ticks.map((t) => [Math.round(t.pct * 1000) / 1000, t.last]), [[0, false], [26.923, false], [53.846, false], [80.769, false], [100, true]]);
  assert.deepEqual(sc.ticks.map((t) => new Date(t.ts).getUTCDate()), [5, 12, 19, 26, 30]);
  const seg = P.segment(pair(0, 4), SPRINT);
  assert.equal(seg.leftPct, 0); assert.equal(seg.widthPct.toFixed(2), '19.23'); assert.equal(seg.clipRight, false);
  const clipped = P.segment(pair(24, 27), SPRINT);
  assert.equal(clipped.clipRight, true); assert.equal(clipped.leftPct + clipped.widthPct, 100);
  const before = P.segment(pair(-2, 1), SPRINT);
  assert.equal(before.clipLeft, true); assert.equal(before.leftPct, 0);
  assert.equal(P.segment(null, SPRINT), null);
  assert.equal(P.scale({ dateStart: S1, dateEnd: S0 }), null, 'конец раньше начала — шкалы нет');
  assert.equal(P.scale({ dateStart: S0, dateEnd: S0 }).days, 1);
});

test('#120 tone — правило одного тона: пустой маппинг → all; роль без фаз → all; роль с фазами → mine/other', () => {
  assert.equal(P.tone('techTest', 'testing', {}), 'all');
  assert.equal(P.tone('techTest', 'testing', null), 'all');
  assert.equal(P.tone('techTest', 'analysis', { techTest: ['testing'] }), 'all', 'у роли анализа нет фаз — всем одним тоном');
  assert.equal(P.tone('techTest', 'testing', { techTest: ['testing'], regression: ['testing'] }), 'mine');
  assert.equal(P.tone('analysis', 'testing', { techTest: ['testing'] }), 'other');
  assert.equal(P.tone('techTest', null, { techTest: ['testing'] }), 'all');
});

test('#120 mergePhaseRoles — привязки выключенных ролей сохраняются, активные берутся из отмеченных, пусто → {}', () => {
  const stored = { techTest: ['testing', 'devIos'], deploy: ['devIos'] };
  const checked = { techTest: ['testing', 'devBack'], regression: ['testing'], deploy: [] };
  const active = ['analysis', 'testing', 'devBack'];
  assert.deepEqual(P.mergePhaseRoles(stored, checked, active), { techTest: ['devIos', 'testing', 'devBack'], regression: ['testing'], deploy: ['devIos'] });
  assert.deepEqual(P.mergePhaseRoles({}, {}, active), {});
  assert.deepEqual(P.mergePhaseRoles({ techTest: ['testing'] }, { techTest: [] }, active), {}, 'сняли галочку активной роли — ушла');
  assert.deepEqual(P.mergePhaseRoles({}, { techTest: ['devIos'] }, active), {}, 'отмеченная неактивная роль не принимается');
});

const CHILD = `
  const P = require(${JSON.stringify(path.resolve(__dirname, '../../widgets/main/src/pure/phases-pure.js'))});
  const S0 = Date.UTC(2026, 9, 5), DAY = 86400000;
  const SPRINT = { dateStart: S0, dateEnd: S0 + 25 * DAY };
  const ph = { analysis: { dateStart: S0, dateEnd: S0 + 3 * DAY }, development: null, techTest: { dateStart: S0 + 14 * DAY, dateEnd: S0 + 19 * DAY },
    regression: { dateStart: S0 + 21 * DAY, dateEnd: S0 + 22 * DAY }, bizTest: { dateStart: S0 + 17 * DAY, dateEnd: S0 + 23 * DAY }, deploy: { dateStart: S0 + 25 * DAY, dateEnd: S0 + 25 * DAY } };
  const sc = P.scale(SPRINT);
  process.stdout.write(JSON.stringify({ ticks: sc.ticks.map((t) => t.pct.toFixed(3)), seg: P.segment(ph.techTest, SPRINT), warns: P.orderWarnings(ph), oor: P.outOfRange(ph, SPRINT),
    local: P.segment({ dateStart: new Date(2026, 9, 19).getTime(), dateEnd: new Date(2026, 9, 24).getTime() }, SPRINT) }));
`;
const ref = JSON.parse(execFileSync(process.execPath, ['-e', CHILD], { env: Object.assign({}, process.env, { TZ: 'UTC' }), encoding: 'utf8' }));
for (const tz of ['America/Los_Angeles', 'Asia/Bangkok', 'Europe/Moscow']) {
  test('#120 под TZ=' + tz + ': шкала, отрезок, порядок и границы совпадают с UTC (даты только через dayMs)', () => {
    const r = JSON.parse(execFileSync(process.execPath, ['-e', CHILD], { env: Object.assign({}, process.env, { TZ: tz }), encoding: 'utf8' }));
    assert.deepEqual(r.ticks, ref.ticks, tz + ' ticks');
    assert.deepEqual(r.seg, ref.seg, tz + ' segment');
    assert.deepEqual(r.warns, ref.warns, tz + ' orderWarnings');
    assert.deepEqual(r.oor, ref.oor, tz + ' outOfRange');
    assert.deepEqual(r.local, ref.local, tz + ' локальная полночь (до 3.39.1 так писал fromDateIn) читается тем же днём');
  });
}
