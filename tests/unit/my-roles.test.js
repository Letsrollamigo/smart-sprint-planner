'use strict';

/* #113 (v3.51.0) — GET my-roles (backend-access.js): роли вызывающего по группам планера.
 * Идёт через НАСТОЯЩИЙ обработчик из core.ENDPOINTS (проектный контур) и главного меню.
 * Запуск: node --test 'tests/unit/my-roles.test.js'. */

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const entities = require('@jetbrains/youtrack-scripting-api/entities');
const ROOT = path.join(__dirname, '..', '..');
const core = require(path.join(ROOT, 'backend-project.js'));
const global = require(path.join(ROOT, 'backend-global.js'));

const G = (id) => ({ id: id, name: id });
const SETTINGS = { editGroups: ['g-ed'], releaseManagerGroups: ['g-rm'], historyClearGroups: ['g-hist'], sprintLockGroups: ['g-lock'] };

function mkCtx(props, groups, admin) {
  return {
    settings: { settingsManagerGroup: { id: 'g-set', name: 'g-set' } },
    currentUser: { id: 'u-1', login: 'user1', groups: groups, hasPermission: (p) => admin === true && p === 'UPDATE_PROJECT' },
    project: { key: 'SCBT', extensionProperties: props },
    request: { body: '', getParameter: () => null },
    response: { status: 200, body: null, json(v) { this.body = v; } },
  };
}
function myRoles(ctx) {
  core.ENDPOINTS.find((e) => e.method === 'GET' && e.path === 'my-roles').handle(ctx);
  return ctx.response.body;
}

test('роли = членство в группах планера; остальные false', () => {
  const b = myRoles(mkCtx({ ssp_settings: JSON.stringify(SETTINGS) }, [G('g-ed'), G('g-rm')]));
  assert.strictEqual(b.success, true);
  assert.deepStrictEqual(b.roles, { editor: true, assigner: false, validator: false, historyManager: false, settingsManager: false,
    planningManager: false, releaseManager: true, releaseEngineer: false, sprintLockManager: false });
  assert.strictEqual(b.configured, true);
  assert.strictEqual(b.disabled, false);
  assert.strictEqual(b.instanceAdmin, false);
});

test('инстанс-админ — все роли, кроме управления историей (#66); не настроено — всё false', () => {
  const adm = myRoles(mkCtx({ ssp_settings: JSON.stringify(SETTINGS) }, [], true));
  assert.strictEqual(adm.instanceAdmin, true);
  assert.strictEqual(adm.roles.historyManager, false);
  assert.ok(Object.keys(adm.roles).filter((k) => k !== 'historyManager').every((k) => adm.roles[k] === true));
  const ctx = mkCtx({ ssp_settings: JSON.stringify(Object.assign({ plannerDisabled: true }, SETTINGS)) }, [G('g-ed')]);
  ctx.settings = {};
  const off = myRoles(ctx);
  assert.strictEqual(off.configured, false);
  assert.strictEqual(off.disabled, true);
  assert.ok(Object.values(off.roles).every((v) => v === false));
});

test('главное меню: my-roles проходит read-gate и отвечает по зеркалу ssp_acl', () => {
  entities.Project.findByKey = (k) => (k === 'SCBT' ? { key: 'SCBT', name: 'SCBT', extensionProperties: {
    ssp_acl: JSON.stringify({ settingsManagerGroup: G('g-set') }), ssp_settings: JSON.stringify(SETTINGS) } } : null);
  const ep = global.httpHandler.endpoints.find((e) => e.method === 'GET' && e.path === 'my-roles');
  const ctx = { currentUser: { login: 'u', groups: [G('g-set')], hasPermission: (p) => p === 'READ_PROJECT_BASIC' },
    request: { getParameter: (k) => (k === 'projectKey' ? 'SCBT' : null) }, response: { json(v) { this.body = v; } } };
  ep.handle(ctx);
  assert.strictEqual(ctx.response.body.roles.settingsManager, true);
  assert.strictEqual(ctx.response.body.roles.editor, false);
});
