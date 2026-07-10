'use strict';
/* #50 S7b — pure computeSpillover: golden на сид-данных S7 + edge-кейсы.
   Сид (соответствует scratchpad/seed_a10_history.js):
     analysis     M2: DEMO-16 IP 40, DEMO-17 IP 28, DEMO-18 Done 24
                  M3: DEMO-16 IP 40 (carried), DEMO-28 IP 32 (new)
     devPlatform  M2: DEMO-16 IP 24
                  M3: DEMO-16 IP 24 (carried), DEMO-28 IP 16 */

const test = require('node:test');
const assert = require('node:assert');
const pure = require('../../widgets/main/src/pure/reporting-pure.js');

const M2_START = Date.UTC(2026, 4, 16);
const M3_START = Date.UTC(2026, 5, 1);
const ROLES = [
  { key: 'analysis', label: 'Аналитик' },
  { key: 'devPlatform', label: 'Разработчик' },
];
const OPTS_BASE = { roles: ROLES, doneStates: ['Done'], ageBands: { warm: 2, hot: 5 } };

function mkItem(id, state, est, extra) {
  return Object.assign({ issueId: id, title: 'Задача ' + id, state: state,
    inclusionStatus: 'INC_PLANNED' }, extra || {}, (function () {
    var o = {}; if (est) { for (var k in est) o['estimate_' + k] = est[k]; } return o;
  })());
}
function mkSnap(base, rk, ds, items) {
  return { sprintId: base + '_' + rk, roleKey: rk, status: 'FINISHED',
    dateStart: ds, dateEnd: ds + 15 * 86400e3, finishedAt: ds + 20 * 86400e3,
    name: base, items: items };
}

const SEED = [
  mkSnap('demo-m2-2026', 'analysis', M2_START, [
    mkItem('DEMO-16', 'In Progress', { analysis: 40 }),
    mkItem('DEMO-17', 'In Progress', { analysis: 28 }),
    mkItem('DEMO-18', 'Done', { analysis: 24 }),
  ]),
  mkSnap('demo-m2-2026', 'devPlatform', M2_START, [
    mkItem('DEMO-16', 'In Progress', { devPlatform: 24 }),
  ]),
  mkSnap('demo-m3-2026', 'analysis', M3_START, [
    mkItem('DEMO-16', 'In Progress', { analysis: 40 }),
    mkItem('DEMO-28', 'In Progress', { analysis: 32 }),
  ]),
  mkSnap('demo-m3-2026', 'devPlatform', M3_START, [
    mkItem('DEMO-16', 'In Progress', { devPlatform: 24 }),
    mkItem('DEMO-28', 'In Progress', { devPlatform: 16 }),
  ]),
];

test('S7b golden: analysis май-2 → 74% (68/92), 1 carried + 1 dropped', () => {
  const out = pure.computeSpillover(SEED, OPTS_BASE, 'demo-m2-2026');
  const an = out.roleRows.find((r) => r.roleKey === 'analysis');
  assert.strictEqual(an.plannedMinutes, 92);
  assert.strictEqual(an.notDoneMinutes, 68);
  assert.strictEqual(an.carriedMinutes, 40);      /* DEMO-16 → есть в м3 */
  assert.strictEqual(an.droppedMinutes, 28);      /* DEMO-17 → нет в м3 */
  assert.ok(Math.abs(an.pct - 68 / 92) < 1e-9);
  assert.strictEqual(an.level, 'over');         /* 74% ≥ 50% */
  assert.strictEqual(out.hasN1, true);
});

test('S7b golden: devPlatform май-2 → 100% (24/24), 1 carried', () => {
  const out = pure.computeSpillover(SEED, OPTS_BASE, 'demo-m2-2026');
  const dp = out.roleRows.find((r) => r.roleKey === 'devPlatform');
  assert.strictEqual(dp.plannedMinutes, 24);
  assert.strictEqual(dp.notDoneMinutes, 24);
  assert.strictEqual(dp.carriedMinutes, 24);
  assert.strictEqual(dp.droppedMinutes, 0);
  assert.strictEqual(dp.pct, 1);
});

test('S7b golden: tails содержат DEMO-16(carried) + DEMO-17(dropped) для analysis, DEMO-16(carried) для devPlatform, БЕЗ DEMO-18(done)', () => {
  const out = pure.computeSpillover(SEED, OPTS_BASE, 'demo-m2-2026');
  const byKey = out.tails.map((t) => t.issueId + '/' + t.roleKey + '/' + t.type);
  assert.deepStrictEqual(byKey.sort(), [
    'DEMO-16/analysis/carried',
    'DEMO-16/devPlatform/carried',
    'DEMO-17/analysis/dropped',
  ].sort());
  assert.strictEqual(out.tails.find((t) => t.issueId === 'DEMO-18'), undefined);
});

test('S7b golden: возраст DEMO-16=1 (у май-2 нет предыдущего FINISHED), DEMO-17=1', () => {
  const out = pure.computeSpillover(SEED, OPTS_BASE, 'demo-m2-2026');
  const a16 = out.ages.find((a) => a.issueId === 'DEMO-16');
  const a17 = out.ages.find((a) => a.issueId === 'DEMO-17');
  assert.strictEqual(a16.age, 1);   /* май-2 = первый спринт цепочки */
  assert.strictEqual(a17.age, 1);
  assert.strictEqual(a16.level, 'ok');
  assert.strictEqual(a17.level, 'ok');
  /* DEMO-18 done — исключается из ages */
  assert.strictEqual(out.ages.find((a) => a.issueId === 'DEMO-18'), undefined);
});

test('S7b: возраст растёт по цепочке — DEMO-16 в июнь-1 = 2 (warm), при dateStart май-1 предшественнике = 3 (warm)', () => {
  /* смоделируем цепочку: май-1 (не-done DEMO-16) → май-2 (не-done) → июнь-1 (не-done). Считаем для baseSprintId=demo-m3-2026 (июнь-1). */
  const chain = [
    mkSnap('demo-m1-2026', 'analysis', Date.UTC(2026, 4, 1), [mkItem('DEMO-16', 'In Progress', { analysis: 40 })]),
    mkSnap('demo-m2-2026', 'analysis', M2_START, [mkItem('DEMO-16', 'In Progress', { analysis: 40 })]),
    mkSnap('demo-m3-2026', 'analysis', M3_START, [mkItem('DEMO-16', 'In Progress', { analysis: 40 })]),
  ];
  const out = pure.computeSpillover(chain, OPTS_BASE, 'demo-m3-2026');
  const a16 = out.ages.find((a) => a.issueId === 'DEMO-16');
  assert.strictEqual(a16.age, 3);      /* 3 подряд не-done */
  assert.strictEqual(a16.level, 'warm'); /* 3 ≥ warm(2), < hot(5) */
});

test('S7b: hot-порог срабатывает при age ≥ hot', () => {
  const opts = Object.assign({}, OPTS_BASE, { ageBands: { warm: 2, hot: 3 } });
  const chain = [
    mkSnap('s1', 'analysis', 1e12, [mkItem('X-1', 'In Progress', { analysis: 8 })]),
    mkSnap('s2', 'analysis', 2e12, [mkItem('X-1', 'In Progress', { analysis: 8 })]),
    mkSnap('s3', 'analysis', 3e12, [mkItem('X-1', 'In Progress', { analysis: 8 })]),
  ];
  const out = pure.computeSpillover(chain, opts, 's3');
  const a = out.ages.find((x) => x.issueId === 'X-1');
  assert.strictEqual(a.age, 3);
  assert.strictEqual(a.level, 'hot');
});

test('S7b: последний спринт цепочки → hasN1=false, всё в dropped', () => {
  const out = pure.computeSpillover(SEED, OPTS_BASE, 'demo-m3-2026');
  assert.strictEqual(out.hasN1, false);
  /* нет следующего снимка → carried не определить, всё не-done идёт как dropped */
  const an = out.roleRows.find((r) => r.roleKey === 'analysis');
  assert.strictEqual(an.carriedMinutes, 0);
  assert.strictEqual(an.droppedMinutes, 40 + 32);  /* DEMO-16 + DEMO-28 не-done в м3 */
});

test('S7b: цепочка прерывается на done — возраст сбрасывается', () => {
  const chain = [
    mkSnap('s1', 'analysis', 1e12, [mkItem('X-1', 'In Progress', { analysis: 8 })]),
    mkSnap('s2', 'analysis', 2e12, [mkItem('X-1', 'Done', { analysis: 8 })]),      /* прерывание */
    mkSnap('s3', 'analysis', 3e12, [mkItem('X-1', 'In Progress', { analysis: 8 })]), /* новый не-done */
  ];
  const out = pure.computeSpillover(chain, OPTS_BASE, 's3');
  const a = out.ages.find((x) => x.issueId === 'X-1');
  assert.strictEqual(a.age, 1);   /* цепочка сброшена done'ом в s2 */
});

test('S7b: exclusion — INC_EXCLUDED в план НЕ идёт (не «закоммичено»)', () => {
  const chain = [
    mkSnap('s1', 'analysis', 1e12, [
      mkItem('X-1', 'In Progress', { analysis: 40 }),                                       /* INC_PLANNED (default) */
      Object.assign(mkItem('X-2', 'In Progress', { analysis: 20 }), { inclusionStatus: 'INC_EXCLUDED' }),
    ]),
    mkSnap('s2', 'analysis', 2e12, [mkItem('X-1', 'In Progress', { analysis: 40 })]),
  ];
  const out = pure.computeSpillover(chain, OPTS_BASE, 's1');
  const an = out.roleRows.find((r) => r.roleKey === 'analysis');
  assert.strictEqual(an.plannedMinutes, 40);      /* X-2 excluded */
  assert.strictEqual(an.notDoneMinutes, 40);
  assert.strictEqual(out.tails.length, 1);       /* только X-1 */
  assert.strictEqual(out.tails[0].issueId, 'X-1');
});

test('S7b: PLANNING-снимок игнорируется (не FINISHED)', () => {
  const chain = [
    mkSnap('s1', 'analysis', 1e12, [mkItem('X-1', 'In Progress', { analysis: 8 })]),
    Object.assign(mkSnap('s2', 'analysis', 2e12, [mkItem('X-1', 'In Progress', { analysis: 8 })]), { status: 'PLANNING' }),
  ];
  const out = pure.computeSpillover(chain, OPTS_BASE, 's1');
  assert.strictEqual(out.hasN1, false);           /* s2 не-FINISHED, отфильтровался */
});

test('S7b: baseSprintId несуществующий → пустой результат', () => {
  const out = pure.computeSpillover(SEED, OPTS_BASE, 'demo-XX-nope');
  assert.strictEqual(out.roleRows.every((r) => r.plannedMinutes === 0), true);
  assert.strictEqual(out.tails.length, 0);
  assert.strictEqual(out.ages.length, 0);
});

test('S7b: пустые аргументы не падают', () => {
  const out = pure.computeSpillover(null, null, null);
  assert.deepStrictEqual(out.roleRows, []);
  assert.deepStrictEqual(out.tails, []);
  assert.deepStrictEqual(out.ages, []);
  assert.strictEqual(out.hasN1, false);
});

test('S7b адверс: sibling-снимок с тем же dateStart НЕ подхватывается как N+1 (нужен строго ПОЗЖЕ + иной base id)', () => {
  const chain = [
    mkSnap('sprintA', 'analysis', 100, [mkItem('X-1', 'In Progress', { analysis: 10 })]),
    /* параллельный sibling: тот же dateStart, другой base id, не «следующий по времени» */
    mkSnap('sprintB', 'analysis', 100, [mkItem('X-9', 'In Progress', { analysis: 5 })]),
    /* реальный N+1 позже — уносит X-1 */
    mkSnap('sprintC', 'analysis', 200, [mkItem('X-1', 'In Progress', { analysis: 10 })]),
  ];
  const out = pure.computeSpillover(chain, OPTS_BASE, 'sprintA');
  const an = out.roleRows.find((r) => r.roleKey === 'analysis');
  assert.strictEqual(an.carriedMinutes, 10);   /* X-1 → sprintC (не sprintB) */
  assert.strictEqual(an.droppedMinutes, 0);
  assert.strictEqual(out.tails[0].type, 'carried');
});

test('S7b адверс: N+1 с dateStart=null отфильтровывается (не тонет в 0 и не крадёт N+1)', () => {
  const chain = [
    mkSnap('sprintA', 'analysis', 100, [mkItem('X-1', 'In Progress', { analysis: 8 })]),
    Object.assign(
      mkSnap('sprintB', 'analysis', 200, [mkItem('X-1', 'In Progress', { analysis: 8 })]),
      { dateStart: null },
    ),
  ];
  const out = pure.computeSpillover(chain, OPTS_BASE, 'sprintA');
  assert.strictEqual(out.hasN1, false);       /* dateStart нельзя сравнить → игнор */
  const an = out.roleRows.find((r) => r.roleKey === 'analysis');
  assert.strictEqual(an.carriedMinutes, 0);
  assert.strictEqual(an.droppedMinutes, 8);      /* всё в dropped, hasN1=false */
});

test('S7b адверс: item в N+1 с INC_EXCLUDED = dropped (задачу явно исключили из плана)', () => {
  const chain = [
    mkSnap('sprintA', 'analysis', 1e12, [mkItem('X-1', 'In Progress', { analysis: 40 })]),
    mkSnap('sprintB', 'analysis', 2e12, [
      Object.assign(mkItem('X-1', 'In Progress', { analysis: 40 }), { inclusionStatus: 'INC_EXCLUDED' }),
    ]),
  ];
  const out = pure.computeSpillover(chain, OPTS_BASE, 'sprintA');
  const an = out.roleRows.find((r) => r.roleKey === 'analysis');
  assert.strictEqual(an.carriedMinutes, 0);      /* INC_EXCLUDED в N+1 → dropped, не carried */
  assert.strictEqual(an.droppedMinutes, 40);
  assert.strictEqual(out.tails[0].type, 'dropped');
});

test('S7b регресс: хвосты отсортированы по объёму (minutes) убыванием — «худшие сверху»', () => {
  /* было `b.hours - a.hours`, но элементы tails несут `minutes` (не hours) → NaN-компаратор =
     Array.sort no-op → порядок вставки. Порядок вставки тут SMALL,BIG,MID ≠ убыв. по объёму. */
  const chain = [
    mkSnap('sX', 'analysis', 1e12, [
      mkItem('SMALL', 'In Progress', { analysis: 5 }),
      mkItem('BIG', 'In Progress', { analysis: 50 }),
      mkItem('MID', 'In Progress', { analysis: 20 }),
    ]),
  ];
  const out = pure.computeSpillover(chain, OPTS_BASE, 'sX');   /* последний → hasN1=false, все 3 dropped */
  assert.deepStrictEqual(out.tails.map((t) => t.minutes), [50, 20, 5]);
  assert.deepStrictEqual(out.tails.map((t) => t.issueId), ['BIG', 'MID', 'SMALL']);
});

test('S7b: level порогов недовыполнения — ok/warn/over', () => {
  /* 10% недовыполнения = ok; 30% = warn; 60% = over */
  function chainWith(pct) {
    const notDone = Math.round(100 * pct);
    const done = 100 - notDone;
    return [
      mkSnap('sN', 'analysis', 1e12, [
        mkItem('A', 'In Progress', { analysis: notDone }),
        mkItem('B', 'Done', { analysis: done }),
      ]),
    ];
  }
  assert.strictEqual(pure.computeSpillover(chainWith(0.1), OPTS_BASE, 'sN').roleRows[0].level, 'ok');
  assert.strictEqual(pure.computeSpillover(chainWith(0.3), OPTS_BASE, 'sN').roleRows[0].level, 'warn');
  assert.strictEqual(pure.computeSpillover(chainWith(0.6), OPTS_BASE, 'sN').roleRows[0].level, 'over');
});
