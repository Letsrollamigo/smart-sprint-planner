// Транспорт и ошибки: конверт контракта, HTTP-статусы, сеть и таймаут, минимальные версии операций, тексты ошибок.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ctx, dist, project, refusal, run } from './_mock.mjs';

const { makePlannerCall } = dist('transport/planner.js');
const { PlannerRefusal, PlatformError, NetworkError, GuardError } = dist('shared/errors.js');
const { toNodeError, failureJson, REQUIRES, fmt } = dist('transport/errors.js');
const { T } = dist('i18n.js');

const node = { id: 'n1', name: 'Planner', type: 't', typeVersion: 1, position: [0, 0], parameters: {} };
const scope = (opKey = 'sprint.get', projectKey = 'DEMO') => ({ itemIndex: 3, opKey, projectKey });

test('call — адрес, projectKey и query; пустые значения не шлются; хвостовой / у адреса срезается', async () => {
	const c = ctx({ routes: { 'GET capacity': { capacity: null } } });
	await makePlannerCall(c.fn)('GET', 'capacity', { projectKey: 'DEMO', query: { sprintId: 's1', empty: '', none: null, undef: undefined } });
	const [r] = c.calls;
	assert.equal(r.url, 'https://yt.test/api/extensionEndpoints/test-app/backend-global/capacity');
	assert.deepEqual(r.qs, { projectKey: 'DEMO', sprintId: 's1' });
	assert.equal(r.method, 'GET');
	assert.equal(r.timeout, 30000);
	assert.equal(r.returnFullResponse, true);
	assert.equal(r.ignoreHttpStatusErrors, true);
});

test('call — путь вне контракта не уходит в сеть', async () => {
	const c = ctx();
	await assert.rejects(makePlannerCall(c.fn)('GET', 'planner-disabled'), /outside contract/);
	assert.equal(c.calls.length, 0);
});

test('call — конверт: success:false → PlannerRefusal; статус ≠ 200 → PlatformError; тело не объект → PlatformError(200)', async () => {
	const call = (routes) => makePlannerCall(ctx({ routes }).fn);
	const e1 = await call({ 'GET sprint-data': refusal('rev_conflict', { rev: 12 }) })('GET', 'sprint-data').catch((e) => e);
	assert.ok(e1 instanceof PlannerRefusal);
	assert.equal(e1.reason, 'rev_conflict');
	assert.equal(e1.rev, 12);
	const e2 = await call({ 'GET sprint-data': { statusCode: 500, body: { message: 'boom' } } })('GET', 'sprint-data').catch((e) => e);
	assert.ok(e2 instanceof PlatformError);
	assert.equal(e2.status, 500);
	assert.equal(e2.text, '{"message":"boom"}');
	const e3 = await call({ 'GET sprint-data': { statusCode: 200, body: '<html>' } })('GET', 'sprint-data').catch((e) => e);
	assert.ok(e3 instanceof PlatformError);
	assert.equal(e3.status, 200);
});

test('call — сбой сети → NetworkError; таймаут axios (ECONNABORTED) помечается timeout', async () => {
	const net = Object.assign(new Error('getaddrinfo ENOTFOUND yt.test'), { code: 'ENOTFOUND' });
	const tmo = Object.assign(new Error('timeout of 30000ms exceeded'), { code: 'ECONNABORTED' });
	const e1 = await makePlannerCall(ctx({ routes: { 'GET app-version': net } }).fn)('GET', 'app-version').catch((e) => e);
	const e2 = await makePlannerCall(ctx({ routes: { 'GET app-version': tmo } }).fn)('GET', 'app-version').catch((e) => e);
	assert.ok(e1 instanceof NetworkError && !e1.timeout);
	assert.ok(e2 instanceof NetworkError && e2.timeout);
	assert.equal(e2.baseUrl, 'https://yt.test');
});

test('toNodeError — отказ планера: смысл и код в message, что делать + cid + ревизия в description', () => {
	const r = new PlannerRefusal({ success: false, reason: 'rev_conflict', cid: 'c-9', rev: 41 });
	const e = toNodeError(node, r, scope());
	assert.equal(e.constructor.name, 'NodeApiError');
	assert.match(e.message, /\(rev_conflict\)$/);
	assert.match(e.description, /cid: c-9/);
	assert.ok(e.description.includes(fmt(T.errors.revConflict, { rev: 41 })));
	assert.equal(e.context.itemIndex, 3);
	const unknown = toNodeError(node, new PlannerRefusal({ reason: 'no_such_code_xyz' }), scope());
	assert.equal(unknown.message, fmt(T.errors.refusalNoHint, { reason: 'no_such_code_xyz' }));
});

test('toNodeError — 401, 404, прочий статус, сеть, таймаут', () => {
	assert.equal(toNodeError(node, new PlatformError(401, ''), scope()).message, T.errors.token);
	assert.equal(toNodeError(node, new PlatformError(404, 'HTTP handler not found'), scope()).message, fmt(T.errors.notAvailable, { projectKey: 'DEMO' }));
	assert.equal(toNodeError(node, new PlatformError(502, 'bad gw'), scope()).message, fmt(T.errors.status, { status: 502 }));
	assert.equal(toNodeError(node, new NetworkError(new Error('x'), 'https://yt.test'), scope()).message, fmt(T.errors.network, { url: 'https://yt.test' }));
	const t = new NetworkError(new Error('x'), 'https://yt.test');
	t.timeout = true;
	assert.equal(toNodeError(node, t, scope()).message, fmt(T.errors.timeout, { url: 'https://yt.test' }));
});

test('REQUIRES — 404 у my-roles и invalid_action у removeRelease → «Нужен планер 3.51.0»; у прочих операций — нет', () => {
	assert.deepEqual(REQUIRES, { 'access.getMyRoles': '3.51.0', 'release.delete': '3.51.0' });
	assert.equal(toNodeError(node, new PlatformError(404, 'HTTP handler not found'), scope('access.getMyRoles')).message, fmt(T.errors.requires, { version: '3.51.0' }));
	assert.equal(toNodeError(node, new PlannerRefusal({ reason: 'invalid_action' }), scope('release.delete')).message, fmt(T.errors.requires, { version: '3.51.0' }));
	assert.notEqual(toNodeError(node, new PlannerRefusal({ reason: 'invalid_action' }), scope('release.setStatus')).message, fmt(T.errors.requires, { version: '3.51.0' }));
});

test('защиты ноды → NodeOperationError с текстом словаря', () => {
	const e = toNodeError(node, new GuardError('role_not_active', { roleKey: 'devIos', activeRoles: 'analysis, testing' }), scope());
	assert.equal(e.constructor.name, 'NodeOperationError');
	assert.equal(e.message, fmt(T.guards.role_not_active.message, { roleKey: 'devIos' }));
	assert.match(e.description, /analysis, testing/);
});

test('failureJson — элемент Continue On Fail: ok:false, kind, reason, cid, rev', () => {
	const j = failureJson(new PlannerRefusal({ reason: 'rev_conflict', cid: 'c-1', rev: 7 }), scope());
	assert.equal(j.ok, false);
	assert.equal(j.kind, 'planner');
	assert.equal(j.reason, 'rev_conflict');
	assert.equal(j.cid, 'c-1');
	assert.equal(j.rev, 7);
	assert.ok(j.message && j.action !== undefined && j.hint !== undefined);
});

test('нода: отказ несуществующего проекта при Continue On Fail — элемент с pairedItem, следующий элемент выполняется', async () => {
	const routes = {
		'GET sprint-data': (o) => (o.qs.projectKey === 'NOPE' ? refusal('project_unavailable') : { sprint: null, configured: true, roleItems: {} }),
	};
	const p = (k) => ({ resource: 'sprint', operation: 'get', project: project(k) });
	const { out } = await run([p('NOPE'), p('DEMO')], routes, { continueOnFail: true });
	assert.equal(out.length, 2);
	assert.deepEqual(out[0].pairedItem, { item: 0 });
	assert.equal(out[0].json.ok, false);
	assert.equal(out[0].json.reason, 'project_unavailable');
	assert.deepEqual(out[1].pairedItem, { item: 1 });
	assert.equal(out[1].json.sprint, null);
});

test('нода: без Continue On Fail ошибка элемента — NodeApiError с itemIndex', async () => {
	const routes = { 'GET sprint-data': { statusCode: 401, body: {} } };
	const err = await run({ resource: 'sprint', operation: 'get', project: project() }, routes).catch((e) => e);
	assert.equal(err.constructor.name, 'NodeApiError');
	assert.equal(err.message, T.errors.token);
	assert.equal(err.context.itemIndex, 0);
});
