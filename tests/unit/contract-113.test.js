'use strict';

/* #113 1в — поведенческие доработки внешнего контракта: смешанное тело sprint-data
 * (mixed_settings_write), assignerSync без sprint (sprint_required), found у удаления
 * рабочей копии. Обязательный baseRev слотов — tests/unit/slot-rev-lock.test.js.
 * Запуск: node --test 'tests/unit/contract-113.test.js'. */

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const core = require(path.join(__dirname, '..', '..', 'backend-project.js'));

function ep(method, p) { return core.ENDPOINTS.find((e) => e.method === method && e.path === p); }

/* Пользователь — администратор настроек и член групп editor/validator (права не тестируем). */
const SETTINGS = JSON.stringify({ editGroups: ['g-admin'], validationGroups: ['g-admin'], activeRoles: ['analysis'] });
function mkCtx(props, body, params) {
  params = params || {};
  return {
    settings: { settingsManagerGroup: { id: 'g-admin', name: 'Admins' } },
    currentUser: { id: 'u-1', login: 'user1', groups: [{ id: 'g-admin', name: 'Admins' }], hasPermission: () => false },
    project: { key: 'SCBT', extensionProperties: props },
    request: { body: JSON.stringify(body), getParameter: (k) => (params[k] || '') },
    response: { status: 200, body: null, json(v) { this.body = v; } },
  };
}

const SPRINT = { sprintId: 'S-1', name: 'Спринт', status: 'PLANNING', dateStart: 1779148800000, dateEnd: 1780358400000,
  updatedBy: 'user1', updatedAt: 1779148800000, personalPlanning: {}, _rev: 4 };

test('sprint-data: settings вместе со sprint/roleItems → 400 mixed_settings_write до любой записи', () => {
  const bodies = [
    { sprint: SPRINT, settings: { activeRoles: ['analysis'] }, baseRev: 4 },
    { roleItems: {}, settings: { activeRoles: ['analysis'] }, baseRev: 4 },
    { sprint: null, roleItems: {}, settings: {}, baseRev: 4 },
  ];
  for (const body of bodies) {
    const props = { ssp_settings: SETTINGS, ssp_sprint: JSON.stringify(SPRINT), ssp_roleitems: '{"dev":[]}' };
    const before = JSON.stringify(props);
    const ctx = mkCtx(props, body);
    ep('POST', 'sprint-data').handle(ctx);
    assert.strictEqual(ctx.response.status, 400);
    assert.strictEqual(ctx.response.body.reason, 'mixed_settings_write');
    assert.strictEqual(JSON.stringify(props), before, 'ни один слот не тронут');
  }
});

test('sprint-data: тело только с settings и тело только со sprint по-прежнему проходят', () => {
  const props = { ssp_settings: SETTINGS, ssp_sprint: JSON.stringify(SPRINT) };
  const s = mkCtx(props, { settings: JSON.parse(SETTINGS) });
  ep('POST', 'sprint-data').handle(s);
  assert.strictEqual(s.response.body.success, true, JSON.stringify(s.response.body));
  const sp = mkCtx(props, { sprint: Object.assign({}, SPRINT, { name: 'Переименован' }), baseRev: 4 });
  ep('POST', 'sprint-data').handle(sp);
  assert.strictEqual(sp.response.body.success, true, JSON.stringify(sp.response.body));
  assert.strictEqual(sp.response.body.rev, 5);
});

test('sprint-data?action=assignerSync без sprint → 400 sprint_required (был «успех без записи»)', () => {
  for (const body of [{}, { baseRev: 4 }, { sprint: null, baseRev: 4 }, { roleItems: {}, baseRev: 4 }]) {
    const props = { ssp_settings: SETTINGS, ssp_sprint: JSON.stringify(SPRINT) };
    const before = props.ssp_sprint;
    const ctx = mkCtx(props, body, { action: 'assignerSync' });
    ep('POST', 'sprint-data').handle(ctx);
    assert.strictEqual(ctx.response.status, 400, JSON.stringify(body));
    assert.strictEqual(ctx.response.body.reason, 'sprint_required');
    assert.strictEqual(props.ssp_sprint, before, 'слот не тронут (sprint:null не сбрасывает его под assignerSync)');
  }
  const props = { ssp_settings: SETTINGS, ssp_sprint: JSON.stringify(SPRINT) };
  const ok = mkCtx(props, { sprint: { personalPlanning: {} }, baseRev: 4 }, { action: 'assignerSync' });
  ep('POST', 'sprint-data').handle(ok);
  assert.strictEqual(ok.response.body.success, true, JSON.stringify(ok.response.body));
});

test('working-drafts?action=delete: found показывает, было ли что удалять', () => {
  const props = { ssp_settings: SETTINGS, ssp_workdrafts: JSON.stringify({ 's-1_dev': { editorLogin: 'user1' } }) };
  const hit = mkCtx(props, {}, { action: 'delete', key: 's-1_dev' });
  ep('POST', 'working-drafts').handle(hit);
  assert.strictEqual(hit.response.body.success, true);
  assert.strictEqual(hit.response.body.found, true);
  const miss = mkCtx(props, {}, { action: 'delete', key: 's-1_dev' });
  ep('POST', 'working-drafts').handle(miss);
  assert.strictEqual(miss.response.body.success, true);
  assert.strictEqual(miss.response.body.found, false);
});
