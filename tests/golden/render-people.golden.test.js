/**
 * Golden-master: рендер уровня «Люди» — таблицы задач и исполнителей
 * текущей роли (devBack на активном спринте) + пустые состояния.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { createHost } = require('./monolith-host');
const { checkHtmlSnapshot, checkJsonSnapshot } = require('./snap');
const { materializeTable } = require('./serialize');
const fx = require('./fixtures/state');

test('golden: renderCurrentRoleTaskTable — devBack активного спринта', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  fx.applyPeopleState(gm);
  gm.call('renderCurrentRoleTaskTable');
  const host = document.getElementById('currentRoleTaskHost');
  const table = materializeTable(host);
  assert.ok(table, 'task table contract must be stashed on currentRoleTaskHost');
  checkJsonSnapshot('people-task-table', table);
});

test('golden: renderCurrentRoleTaskTable — нет выбранной записи (empty)', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  gm.call('renderCurrentRoleTaskTable');
  checkHtmlSnapshot('people-task-table-empty', document.getElementById('currentRoleTaskHost').innerHTML);
});

test('golden: renderCurrentRoleAssigneeTable — ресурсы/остатки исполнителей', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  fx.applyPeopleState(gm);
  gm.call('renderCurrentRoleAssigneeTable');
  const host = document.getElementById('currentRoleAssigneeHost');
  const table = materializeTable(host);
  assert.ok(table, 'assignee table contract must be stashed on currentRoleAssigneeHost');
  checkJsonSnapshot('people-assignee-table', table);
});

test('golden: renderCurrentRoleAssigneeTable — пустой PP (empty)', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  gm.call('renderCurrentRoleAssigneeTable');
  checkHtmlSnapshot('people-assignee-table-empty', document.getElementById('currentRoleAssigneeHost').innerHTML);
});

test('golden: calcAssigneeUsed по исполнителям devBack', () => {
  const { gm } = createHost();
  fx.applyBaseState(gm);
  fx.applyPeopleState(gm);
  const out = {
    gm_user_1: gm.call('calcAssigneeUsed', 'gm_user_1'),
    gm_user_2: gm.call('calcAssigneeUsed', 'gm_user_2'),
    unknown: gm.call('calcAssigneeUsed', 'gm_user_none'),
  };
  checkJsonSnapshot('calc-assignee-used', out);
});
