/**
 * Golden-master: расчётные цепочки монолита (Фаза 2 декомпозиции).
 *
 * Характеризация ТЕКУЩЕГО поведения calcRemForRole / computeRoleQuickStats /
 * checkAllocOverlimit на детерминированной фикстуре. Эталон = снимок;
 * любой diff при рефакторе — регрессия (или осознанная перегенерация).
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHost } = require('./monolith-host');
const { checkJsonSnapshot } = require('./snap');
const fx = require('./fixtures/state');

const ROLES = ['analysis', 'testing', 'devBack', 'devFront', 'devIos'];

test('monolith boots in sandbox: hook installed, T() resolves ru', () => {
  const { gm } = createHost();
  const t = gm.call('T', 'tabSettings');
  if (typeof t !== 'string' || t === 'tabSettings') {
    throw new Error('T("tabSettings") did not resolve from ru dict: ' + t);
  }
});

test('golden: calcRemForRole по всем ролям (вкл. неактивную devIos)', () => {
  const { gm } = createHost();
  fx.applyBaseState(gm);
  const out = {};
  for (const rk of ROLES) out[rk] = gm.call('calcRemForRole', rk);
  checkJsonSnapshot('calc-rem-for-role', out);
});

test('golden: computeRoleQuickStats — активный спринт', () => {
  const { gm } = createHost();
  fx.applyBaseState(gm);
  const out = {};
  for (const rk of ROLES) out[rk] = gm.call('computeRoleQuickStats', rk);
  checkJsonSnapshot('quick-stats-active', out);
});

test('golden: computeRoleQuickStats — исторический вид (выбран hist-спринт)', () => {
  const { gm } = createHost();
  fx.applyBaseState(gm);
  gm.set({ _currentSprintId: fx.HIST_SPRINT_ID });
  const out = {};
  for (const rk of ['analysis', 'testing', 'devBack']) {
    out[rk] = gm.call('computeRoleQuickStats', rk);
  }
  checkJsonSnapshot('quick-stats-historical', out);
});

test('golden: checkAllocOverlimit по активным ролям', () => {
  const { gm } = createHost();
  fx.applyBaseState(gm);
  const out = {};
  for (const rk of ['analysis', 'testing', 'devBack', 'devFront']) {
    out[rk] = gm.call('checkAllocOverlimit', rk);
  }
  checkJsonSnapshot('check-alloc-overlimit', out);
});

/* #89.1 — счётчик задач без оценки в шапке роли: считаются только активные
   (ACTIVE_INC), оценка «пуста или ноль», ручная аллокация задачу не спасает —
   в YouTrack оценки всё равно нет. Базовая фикстура целиком оценена → 0. */
test('#89.1: computeRoleQuickStats — задачи без оценки (активные; alloc не спасает; исключённые не в счёт)', () => {
  const { gm } = createHost();
  fx.applyBaseState(gm);
  const items = gm.get('_roleItems');
  for (const rk of ROLES) assert.equal(gm.call('computeRoleQuickStats', rk).unestimated, 0, rk + ': базовая фикстура оценена целиком');
  items.analysis.push(
    { issueId: 'GM-90', title: 'Пустая оценка, но alloc задан', inclusionStatus: 'INC_PLANNED', estimate_analysis: null, fact_analysis: 0, alloc_analysis: 300 },
    { issueId: 'GM-91', title: 'Нулевая оценка', inclusionStatus: 'INC_UNPLANNED', estimate_analysis: 0, fact_analysis: 0, alloc_analysis: null },
    { issueId: 'GM-92', title: 'Исключённая без оценки', inclusionStatus: 'INC_EXCLUDED', fact_analysis: 0, alloc_analysis: null }
  );
  const st = gm.call('computeRoleQuickStats', 'analysis');
  assert.equal(st.unestimated, 2, 'две активные без оценки, исключённая не считается');
  assert.equal(st.taskCount, 5, 'счётчик задач по-прежнему считает активные');
});
