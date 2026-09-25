// Чтение планера: проекции Simplified/Raw, разбиение, лимиты, фильтры, перевод дат, порядок вызовов.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dist, pathOf, project, run } from './_mock.mjs';

const { ROLE_LABELS } = dist('shared/constants.js');
const { BRAND } = dist('branding.js');

const SD = {
	configured: true,
	settings: { activeRoles: ['analysis', 'testing'] },
	sprint: { sprintId: 's-11', name: 'Спринт 11', status: 'PLANNING', _rev: 7, resourceAnalysis: 4800 },
	roleItems: {
		analysis: [
			{ issueId: 'DEMO-1', title: 'A', inclusionStatus: 'INC_PLANNED', estimate_analysis: 480 },
			{ issueId: 'DEMO-2', title: 'B', inclusionStatus: 'INC_EXCLUDED', excludeReason: 'x' },
		],
		testing: [{ issueId: 'DEMO-1', title: 'A', inclusionStatus: 'INC_PLANNED', estimate_testing: 120 }],
	},
};
const P = (resource, operation, extra = {}) => ({ resource, operation, project: project(), ...extra });

test('обзор — четыре вызова строго по очереди, минимум планера 3.49.1', async () => {
	const { json, calls } = await run(P('project', 'getOverview'), {
		'GET app-version': { version: '3.49.1' },
		'GET sprint-data': SD,
		'GET sprint-lock': { locked: true },
		'GET releases': { rev: 4, releases: [{ id: 'r1' }, { id: 'r2' }] },
	});
	assert.deepEqual(calls.map(pathOf), ['app-version', 'sprint-data', 'sprint-lock', 'releases']);
	const [o] = json;
	assert.equal(o.contractOk, true);
	assert.equal(o.contractMin, '3.49.1');
	assert.equal(o.sprint.rev, 7);
	assert.deepEqual(o.sprint.itemCounts, { analysis: 2, testing: 1 });
	assert.deepEqual(o.releases, { count: 2, rev: 4 });
	assert.equal(o.sprintCreationLocked, true);
	assert.deepEqual(o.activeRoles, ['analysis', 'testing']);
});

test('спринт — Simplified по ролям, фильтр исключённых, Raw без success, разбиение на элементы', async () => {
	const routes = { 'GET sprint-data': SD };
	const [s] = (await run(P('sprint', 'get', { options: { includeExcluded: false } }), routes)).json;
	assert.equal(s.items.analysis.total, 1);
	assert.equal(s.items.analysis.items[0].estimate, 480);
	assert.equal(s.settings, undefined);
	const [r] = (await run(P('sprint', 'get', { options: { output: 'raw' } }), routes)).json;
	assert.equal(r.success, undefined);
	assert.equal(r.sprint.sprintId, 's-11');
	const split = (await run(P('sprint', 'get', { options: { splitIntoItems: true, roleKey: 'testing' } }), routes)).json;
	assert.deepEqual(
		split.map((x) => [x.roleKey, x.sprintId, x.issueId, x.estimate]),
		[['testing', 's-11', 'DEMO-1', 120]],
	);
});

test('история — фильтры, лимит по умолчанию 20, Вернуть все', async () => {
	const history = Array.from({ length: 25 }, (_, n) => ({ sprintId: 's-' + n, roleKey: n % 2 ? 'analysis' : 'testing', status: 'CONFIRMED', items: [] }));
	const routes = { 'GET history': { rev: 3, history } };
	assert.equal((await run(P('history', 'getMany'), routes)).json.length, 20);
	assert.equal((await run(P('history', 'getMany', { returnAll: true }), routes)).json.length, 25);
	const only = (await run(P('history', 'getMany', { returnAll: true, options: { roleKey: 'analysis' } }), routes)).json;
	assert.equal(only.length, 12);
	assert.ok(only.every((x) => x.roleKey === 'analysis' && x.roleLabel === ROLE_LABELS[BRAND.lang].analysis));
	assert.equal((await run(P('history', 'getMany', { limit: 3 }), routes)).json.length, 3);
});

test('ёмкость — без ID спринта берётся спринт слота; архив по параметру', async () => {
	const { json, calls } = await run(P('capacity', 'get', { options: { includeArchive: true } }), {
		'GET sprint-data': SD,
		'GET capacity': { capacity: { sprintId: 's-11', status: 'draft', persons: { ivanov: { rate: 1 } } }, archivedCount: 2 },
		'GET capacity-archive': { archive: [{ sprintId: 's-10', persons: {} }] },
	});
	assert.equal(calls[1].qs.sprintId, 's-11');
	assert.equal(json[0].sprintId, 's-11');
	assert.equal(json[0].capacity.persons.ivanov.rate, 1);
	assert.equal(json[0].archive.length, 1);
});

test('календарь — один год', async () => {
	const routes = { 'GET calendar': { calendar: { years: { 2025: { d: 1 }, 2026: { d: 2 } }, uploadedBy: 'admin' } } };
	const [c] = (await run(P('calendar', 'get', { options: { year: 2026 } }), routes)).json;
	assert.deepEqual(c.years, { 2026: { d: 2 } });
	assert.equal(c.uploadedBy, 'admin');
});

test('отсутствия — элемент на запись; период — календарные даты без сдвига зоны (+03:00)', async () => {
	const routes = {
		'GET absences': {
			rev: 5,
			absences: {
				ivanov: [
					{ from: '2026-09-28', to: '2026-10-02', type: 'vacation' },
					{ from: '2026-11-01', to: '2026-11-01', type: 'sick' },
				],
				petrov: [{ from: '2026-10-01', to: '2026-10-01', type: 'training', hoursDelta: 4 }],
			},
		},
	};
	const all = (await run(P('absence', 'getMany'), routes)).json;
	assert.equal(all.length, 3);
	const oct1 = (await run(P('absence', 'getMany', { options: { periodFrom: '2026-10-01T00:00:00.000+03:00', periodTo: '2026-10-01T00:00:00.000+03:00' } }), routes)).json;
	assert.deepEqual(oct1.map((x) => x.login).sort(), ['ivanov', 'petrov']);
	assert.equal(oct1.find((x) => x.login === 'petrov').hoursDelta, 4);
});

test('релизы — фильтр статуса, архив с отметкой, лимит', async () => {
	const routes = {
		'GET releases': { rev: 9, perms: { write: true }, releases: [{ id: 'r1', status: 'prep' }, { id: 'r2', status: 'planned' }] },
		'GET releases-archive': { releases: [{ id: 'r0', status: 'prep' }] },
	};
	const list = (await run(P('release', 'getMany', { options: { status: 'prep', includeArchive: true } }), routes)).json;
	assert.deepEqual(list.map((x) => [x.id, x.archived === true]), [['r1', false], ['r0', true]]);
	assert.equal(list[0].perms, undefined);
	const [raw] = (await run(P('release', 'getMany', { options: { output: 'raw' } }), routes)).json;
	assert.deepEqual(raw.perms, { write: true });
});

test('напоминания — элементы напоминаний и журнала', async () => {
	const routes = { 'GET reminders': { enabled: true, items: [{ id: 'a' }] }, 'GET reminders-journal': { journal: [{ id: 'j1' }, { id: 'j2' }] } };
	const list = (await run(P('reminder', 'getMany', { options: { includeJournal: true } }), routes)).json;
	assert.deepEqual(list.map((x) => x.kind), ['reminder', 'journal', 'journal']);
});

test('мои роли — все девять ключей и список имеющихся', async () => {
	const routes = { 'GET my-roles': { configured: true, disabled: false, instanceAdmin: false, roles: { editor: true, releaseManager: true } } };
	const [r] = (await run(P('access', 'getMyRoles'), routes)).json;
	assert.equal(Object.keys(r.roles).length, 9);
	assert.deepEqual(r.list, ['editor', 'releaseManager']);
});

test('проекты — постранично, пересечение с filter-planner-projects, архивные скрыты, Только с планером', async () => {
	const page1 = Array.from({ length: 100 }, (_, n) => ({ id: '0-' + n, shortName: 'P' + n, name: 'Проект ' + n, archived: n === 1 }));
	const page2 = [{ id: '0-100', shortName: 'P100', name: 'Проект 100', archived: false }];
	const routes = {
		'GET /api/admin/projects': (o) => ({ statusCode: 200, body: o.qs.$skip === 0 ? page1 : page2 }),
		'POST filter-planner-projects': (o) => ({ statusCode: 200, body: { success: true, projects: o.body.keys.filter((k) => k === 'P0' || k === 'P100').map((k) => ({ key: k, name: k, hasMirror: false })) } }),
	};
	const { json, calls } = await run({ resource: 'project', operation: 'getMany', returnAll: true }, routes);
	assert.deepEqual(json.map((x) => x.key), ['P0', 'P100']);
	assert.equal(json[0].planner, true);
	assert.ok(!calls.find((c) => c.method === 'POST').body.keys.includes('P1'));
	assert.equal(calls.find((c) => c.method === 'POST').qs.projectKey, undefined);
	const all = (await run({ resource: 'project', operation: 'getMany', onlyWithPlanner: false, limit: 5 }, routes)).json;
	assert.equal(all.length, 5);
	assert.equal(all[1].planner, false);
});

test('статус планера — не подключён: без лишних вызовов; подключён: настроен и версия', async () => {
	const off = await run(P('project', 'getPlannerStatus'), { 'POST filter-planner-projects': { projects: [] } });
	assert.deepEqual(off.json[0], { key: 'DEMO', attached: false, hasMirror: null, disabled: null, configured: null, version: null });
	assert.equal(off.calls.length, 1);
	const on = await run(P('project', 'getPlannerStatus'), {
		'POST filter-planner-projects': { projects: [{ key: 'DEMO', name: 'Demo', hasMirror: true }] },
		'GET sprint-data': SD,
		'GET app-version': { version: '3.51.0' },
	});
	assert.deepEqual(on.json[0], { key: 'DEMO', attached: true, hasMirror: true, disabled: false, configured: true, version: '3.51.0' });
});
