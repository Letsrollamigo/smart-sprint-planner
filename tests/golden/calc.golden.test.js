/**
 * Golden-master: расчётные цепочки монолита (Фаза 2 декомпозиции).
 *
 * Характеризация ТЕКУЩЕГО поведения calcRemForRole / computeRoleQuickStats /
 * checkAllocOverlimit на детерминированной фикстуре. Эталон = снимок;
 * любой diff при рефакторе — регрессия (или осознанная перегенерация).
 */
'use strict';

const test = require('node:test');
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
