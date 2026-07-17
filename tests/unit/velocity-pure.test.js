'use strict';
// Unit tests for widgets/main/src/pure/velocity-pure.js — #11 A11 Velocity (v3.12.0).
// Канон данных = A10 Spillover: FINISHED-снимки, active по inclusionStatus, done по state.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { computeRoleVelocity } = require('../../widgets/main/src/pure/velocity-pure.js');

function rec(sprintId, roleKey, dateStart, items) {
  return { sprintId, roleKey, status: 'FINISHED', name: sprintId.replace(/_.*$/, ''), dateStart, items };
}
function it_(id, est, state, inc) {
  return { issueId: id, ['estimate_analysis']: est, state: state || 'Open', inclusionStatus: inc || 'INC_PLANNED' };
}
const ROLES = [{ key: 'analysis', label: 'Анализ' }];
const OPTS = { roles: ROLES, doneStates: ['Done'], window: 3 };

test('velocity: закрытые/план минуты + pct по спринту, порядок старые→новые', () => {
  const snaps = [
    rec('s2_analysis', 'analysis', 200, [it_('T-3', 300, 'Done'), it_('T-4', 300, 'Open')]),
    rec('s1_analysis', 'analysis', 100, [it_('T-1', 600, 'Done'), it_('T-2', 600, 'Done')]),
  ];
  const out = computeRoleVelocity(snaps, OPTS);
  assert.equal(out.roleRows.length, 1);
  const r = out.roleRows[0];
  assert.deepEqual(r.sprints.map((s) => s.sprintId), ['s1_analysis', 's2_analysis'], 'sorted by dateStart asc');
  assert.equal(r.sprints[0].closedMinutes, 1200);
  assert.equal(r.sprints[1].closedMinutes, 300);
  assert.equal(r.sprints[1].plannedMinutes, 600);
  assert.equal(r.sprints[1].pct, 0.5);
  assert.equal(r.avgClosedMinutes, 750, '(1200+300)/2');
  assert.equal(r.avgPct, 0.75, '(1.0+0.5)/2');
  assert.equal(r.sparse, true, '2 точки < окна 3');
});

test('velocity: окно режет старые спринты; sparse=false при полном окне', () => {
  const snaps = [1, 2, 3, 4, 5].map((i) =>
    rec('s' + i + '_analysis', 'analysis', i * 100, [it_('T-' + i, i * 60, 'Done')]));
  const out = computeRoleVelocity(snaps, { roles: ROLES, doneStates: ['Done'], window: 3 });
  const r = out.roleRows[0];
  assert.deepEqual(r.sprints.map((s) => s.sprintId), ['s3_analysis', 's4_analysis', 's5_analysis']);
  assert.equal(r.sparse, false);
  assert.equal(r.avgClosedMinutes, 4 * 60, '(180+240+300)/3');
});

test('velocity: не-FINISHED, чужие роли, неактивные items и спринты план=0 отфильтрованы', () => {
  const snaps = [
    rec('s1_analysis', 'analysis', 100, [it_('T-1', 600, 'Done')]),
    Object.assign(rec('s2_analysis', 'analysis', 200, [it_('T-2', 600, 'Done')]), { status: 'PLANNING' }),
    rec('s3_analysis', 'analysis', 300, [it_('T-3', 600, 'Done', 'INC_EXCLUDED')]),  /* план=0 → шум */
    rec('s4_devFront', 'devFront', 400, [{ issueId: 'T-4', estimate_devFront: 600, state: 'Done', inclusionStatus: 'INC_PLANNED' }]),
  ];
  const out = computeRoleVelocity(snaps, OPTS);
  assert.equal(out.roleRows.length, 1, 'devFront не в opts.roles');
  assert.deepEqual(out.roleRows[0].sprints.map((s) => s.sprintId), ['s1_analysis']);
});

test('velocity: роль без единой точки не попадает в roleRows; пустой вход — пустой выход', () => {
  assert.deepEqual(computeRoleVelocity([], OPTS), { roleRows: [] });
  assert.deepEqual(computeRoleVelocity(null, OPTS), { roleRows: [] });
});

test('velocity: doneStates пуст → закрыто 0, pct 0 (план виден)', () => {
  const snaps = [rec('s1_analysis', 'analysis', 100, [it_('T-1', 600, 'Done')])];
  const out = computeRoleVelocity(snaps, { roles: ROLES, doneStates: [], window: 3 });
  assert.equal(out.roleRows[0].sprints[0].closedMinutes, 0);
  assert.equal(out.roleRows[0].sprints[0].plannedMinutes, 600);
  assert.equal(out.roleRows[0].avgPct, 0);
});

test('velocity: окно клампится в 1..10, нечисловое → 3', () => {
  const snaps = [1, 2, 3, 4].map((i) => rec('s' + i + '_analysis', 'analysis', i * 100, [it_('T-' + i, 60, 'Done')]));
  assert.equal(computeRoleVelocity(snaps, { roles: ROLES, doneStates: ['Done'], window: 0 }).roleRows[0].sprints.length, 1);
  assert.equal(computeRoleVelocity(snaps, { roles: ROLES, doneStates: ['Done'], window: 99 }).roleRows[0].sprints.length, 4);
  assert.equal(computeRoleVelocity(snaps, { roles: ROLES, doneStates: ['Done'] }).roleRows[0].sprints.length, 3);
});
