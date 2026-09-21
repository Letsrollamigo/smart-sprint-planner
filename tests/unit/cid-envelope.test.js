/* #85 — сквозной идентификатор запроса в конверте отказа и в строке лога.
   #113 — единый конверт: reason и cid у каждого отказа, success:true у каждого успеха. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const core = require('../../backend-core.js');
const proj = require(path.join(__dirname, '..', '..', 'backend-project.js'));
const glob = require(path.join(__dirname, '..', '..', 'backend-global.js'));
const prefs = require(path.join(__dirname, '..', '..', 'backend-userprefs.js'));

const CID_RE = /^cid-[a-z0-9]+-[a-z0-9]{6}$/;

function fakeCtx() {
  const out = { status: null, body: null };
  return { out, response: { json: (b) => { out.body = b; }, set status(v) { out.status = v; } } };
}
function withWarn(fn) {
  const lines = []; const orig = console.warn; console.warn = (m) => lines.push(String(m));
  try { fn(); } finally { console.warn = orig; }
  return lines;
}

/* project-scope ctx: пользователь в группе администраторов настроек (конверт тестируем, не права). */
function mkCtx(props, body, params, project) {
  params = params || {};
  return {
    settings: { settingsManagerGroup: { id: 'g-admin', name: 'Admins' } },
    currentUser: { id: 'u-1', login: 'user1', groups: [{ id: 'g-admin', name: 'Admins' }], hasPermission: () => false },
    project: Object.assign({ key: 'SCBT', extensionProperties: props || {} }, project || {}),
    request: { body: body === undefined ? '' : JSON.stringify(body), getParameter: (k) => (params[k] || '') },
    response: { status: 200, body: null, json(v) { this.body = v; } },
  };
}
function ep(list, method, p) { return list.find((e) => e.method === method && e.path === p); }

/* Отказ: success:false, ожидаемые error/reason, cid в теле, одна строка лога «<cid> <status> <reason>». */
function assertRefusal(name, ctxBody, lines, status, error, reason) {
  assert.equal(ctxBody.success, false, name);
  assert.equal(ctxBody.error, error, name + ': error');
  assert.equal(ctxBody.reason, reason, name + ': reason');
  assert.match(String(ctxBody.cid), CID_RE, name + ': cid в конверте');
  assert.equal(lines.length, 1, name + ': ровно одна строка лога');
  assert.ok(lines[0].indexOf('[smart-sprint-planner] ' + ctxBody.cid + ' ' + status + ' ' + reason) === 0, name + ': ' + lines[0]);
}

test('пять хелперов ядра несут cid и reason, пишут одну строку лога без тела', () => {
  const cases = [
    ['forbidden', (ctx) => core.forbidden(ctx, 'plugin_not_configured'), 403, 'Forbidden', 'plugin_not_configured'],
    ['badRequest', (ctx) => core.badRequest(ctx, 'invalid_sprint_structure'), 400, 'Bad Request', 'invalid_sprint_structure'],
    ['revConflict', (ctx) => core.revConflict(ctx, 3, 7), 409, 'rev_conflict', 'rev_conflict'],
    ['internalError', (ctx) => core.internalError(ctx, 'reminders_journal_write_failed', { message: 'boom' }), 500, 'internal_error', 'reminders_journal_write_failed'],
    ['internalError без кода', (ctx) => core.internalError(ctx), 500, 'internal_error', 'internal_error'],
    ['refuseCompat', (ctx) => core.refuseCompat(ctx, 'field_not_writable'), 400, 'field_not_writable', 'field_not_writable'],
  ];
  for (const [name, call, status, error, reason] of cases) {
    const ctx = fakeCtx();
    const lines = withWarn(() => call(ctx));
    assert.equal(ctx.out.status, status, name);
    assertRefusal(name, ctx.out.body, lines, status, error, reason);
    assert.ok(!/boom/.test(lines[0]), 'подробности внутренней ошибки в строку отказа не попадают');
  }
});

test('extra подмешивается в конверт: badRequest errors[], internalError message, revConflict rev', () => {
  const a = fakeCtx(); withWarn(() => core.badRequest(a, 'calendar_invalid', { errors: [{ code: 'invalid_year' }] }));
  assert.deepEqual(a.out.body.errors, [{ code: 'invalid_year' }]);
  const b = fakeCtx(); withWarn(() => core.internalError(b, 'update_issue_field_failed', { message: 'boom' }));
  assert.equal(b.out.body.message, 'boom');
  const c = fakeCtx(); withWarn(() => core.revConflict(c, 3, 7));
  assert.equal(c.out.body.rev, 7);
});

test('cid один на запрос: повторные отказы в том же ctx переиспользуют его, разные ctx — разные', () => {
  const a = fakeCtx(), b = fakeCtx();
  withWarn(() => { core.forbidden(a, 'x'); });
  const first = a.out.body.cid;
  withWarn(() => { core.badRequest(a, 'y'); });
  assert.equal(a.out.body.cid, first);
  withWarn(() => { core.forbidden(b, 'x'); });
  assert.notEqual(b.out.body.cid, first);
  assert.equal(core.cid(null), null);
});

test('глобальный контур: gBad/gForbid отвечают конвертом ядра', () => {
  const G = glob.httpHandler.endpoints;
  const bad = mkCtx({}, undefined, { projectKey: 'a b' });
  let lines = withWarn(() => ep(G, 'GET', 'sprint-data').handle(bad));
  assertRefusal('invalid_project_key', bad.response.body, lines, 400, 'Bad Request', 'invalid_project_key');

  const anon = mkCtx({}, { keys: [] }); anon.currentUser = null;
  lines = withWarn(() => ep(G, 'POST', 'filter-planner-projects').handle(anon));
  assertRefusal('auth_required', anon.response.body, lines, 403, 'Forbidden', 'auth_required');
});

test('user-prefs: bad/forbid отвечают конвертом ядра', () => {
  const anon = mkCtx({}, { prefs: {} }); anon.currentUser = null;
  let lines = withWarn(() => ep(prefs.endpoints, 'POST', 'user-prefs').handle(anon));
  assertRefusal('auth_required', anon.response.body, lines, 403, 'Forbidden', 'auth_required');

  const broken = mkCtx({}, { prefs: 'не объект' });
  lines = withWarn(() => ep(prefs.endpoints, 'POST', 'user-prefs').handle(broken));
  assertRefusal('invalid_prefs', broken.response.body, lines, 400, 'Bad Request', 'invalid_prefs');
});

test('calendar_invalid: вложенные коды errors[] едут в едином конверте', () => {
  const ctx = mkCtx({ ssp_settings: '{}' }, { years: { 'год': [] } });
  const lines = withWarn(() => ep(proj.ENDPOINTS, 'POST', 'calendar').handle(ctx));
  assertRefusal('calendar_invalid', ctx.response.body, lines, 400, 'Bad Request', 'calendar_invalid');
  assert.ok(Array.isArray(ctx.response.body.errors) && ctx.response.body.errors.length > 0);
});

test('поля задач: код остаётся в error и дублируется в reason, прежние ключи ответа на месте', () => {
  const E = proj.ENDPOINTS;
  const noField = { fields: [] };
  const users = mkCtx({}, undefined, { fieldName: 'Нет такого' }, noField);
  let lines = withWarn(() => ep(E, 'GET', 'get-user-field-values').handle(users));
  assertRefusal('get-user-field-values', users.response.body, lines, 400, 'field_not_found', 'field_not_found');
  assert.deepEqual(users.response.body.users, []);
  assert.equal(users.response.body.debug.found, false);

  const values = mkCtx({}, undefined, { fieldName: 'Нет такого' }, noField);
  lines = withWarn(() => ep(E, 'GET', 'field-values').handle(values));
  assertRefusal('field-values', values.response.body, lines, 400, 'field_not_found', 'field_not_found');
  assert.equal(values.response.body.fieldName, 'Нет такого');
  assert.deepEqual(values.response.body.values, []);
  assert.deepEqual(values.response.body.resolved, []);
  assert.deepEqual(values.response.body.colors, {});

  const found = mkCtx({}, undefined, { fieldName: 'State' }, { fields: [{ name: 'State', values: [] }] });
  withWarn(() => ep(E, 'GET', 'field-values').handle(found));
  assert.equal(found.response.body.success, true, 'найденное поле без значений — успех');
});

test('аварийные ветки: internal_error с конкретным кодом причины и прежними ключами', () => {
  const E = proj.ENDPOINTS;
  const boom = { fields: { forEach() { throw new Error('секрет'); } } };
  const cases = [
    ['project-fields', {}, 'project_fields_failed', 'fields'],
    ['field-values', { fieldName: 'State' }, 'field_values_failed', 'values'],
    ['get-user-field-values', { fieldName: 'State' }, 'user_field_values_failed', 'users'],
  ];
  for (const [p, params, reason, listKey] of cases) {
    const ctx = mkCtx({}, undefined, params, boom);
    const lines = withWarn(() => ep(E, 'GET', p).handle(ctx));
    assertRefusal(p, ctx.response.body, lines, 500, 'internal_error', reason);
    assert.deepEqual(ctx.response.body[listKey], [], p + ': ' + listKey);
    assert.ok(!/секрет/.test(lines[0]), 'текст исключения в лог отказа не попадает');
  }
});

test('success:true у ответов без отказа: check-*, app-version, draft', () => {
  const E = proj.ENDPOINTS;
  const paths = ['check-settings-manager', 'check-instance-admin', 'check-validator', 'check-editor',
    'check-assigner', 'check-history-manager', 'app-version', 'draft'];
  for (const p of paths) {
    const ctx = mkCtx({ ssp_settings: '{}' });
    ep(E, 'GET', p).handle(ctx);
    assert.equal(ctx.response.body.success, true, p);
  }
  const notConfigured = mkCtx({}); notConfigured.settings = {};
  ep(E, 'GET', 'check-settings-manager').handle(notConfigured);
  assert.equal(notConfigured.response.body.success, true, 'check-settings-manager без группы');
  assert.equal(notConfigured.response.body.configured, false);

  const g = mkCtx({});
  ep(glob.httpHandler.endpoints, 'GET', 'app-version').handle(g);
  assert.deepEqual(g.response.body, { success: true, version: core.APP_VERSION });

  const saved = mkCtx({ ssp_settings: '{}' }, { data: { a: 1 } });
  ep(E, 'POST', 'draft').handle(saved);
  assert.equal(saved.response.body.success, true, 'POST draft');
  assert.equal(saved.response.body.ok, true, 'ok остаётся рядом с success');
});
