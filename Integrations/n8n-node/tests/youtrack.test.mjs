// Штатный REST YouTrack: поиск задач, «Записать поле» по фактическому $type поля задачи (пробы спеки §6),
// запись через планер, методы списков формы.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ctx, dist, project, run } from './_mock.mjs';

const { listSearch } = dist('methods/listSearch.js');
const { loadOptions } = dist('methods/loadOptions.js');
const { T } = dist('i18n.js');
const { fmt } = dist('transport/errors.js');

const P = (operation, extra = {}) => ({ resource: 'issue', operation, project: project(), ...extra });
const ISSUE = (fields) => ({ statusCode: 200, body: { idReadable: 'DEMO-5', customFields: fields } });

test('поиск — ключ проекта в начале запроса, постранично до предела, Simplified значения полей', async () => {
	const issue = (n) => ({
		id: '2-' + n,
		idReadable: 'DEMO-' + n,
		summary: 'S' + n,
		project: { shortName: 'DEMO', name: 'Demo' },
		customFields: [
			{ name: 'State', value: { name: 'Open' } },
			{ name: 'Assignee', value: { login: 'ivanov', name: 'Иван', fullName: 'Иван' } },
			{ name: 'Estimation', value: { minutes: 480, presentation: '1d' } },
			{ name: 'Fix versions', value: [{ name: '1.0' }, { name: '1.1' }] },
			{ name: 'Due', value: 1790000000000 },
			{ name: 'Empty', value: null },
		],
	});
	const routes = { 'GET /api/issues': (o) => ({ statusCode: 200, body: Array.from({ length: o.qs.$top }, (_, k) => issue(o.qs.$skip + k)) }) };
	const { json, calls } = await run(P('search', { query: '#Unresolved', limit: 150, options: { project: 'DEMO' } }), routes);
	assert.equal(json.length, 150);
	assert.deepEqual(calls.map((c) => [c.qs.$skip, c.qs.$top]), [[0, 100], [100, 50]]);
	assert.equal(calls[0].qs.query, 'project: DEMO #Unresolved');
	assert.deepEqual(json[0].fields, { State: 'Open', Assignee: 'ivanov', Estimation: 480, 'Fix versions': ['1.0', '1.1'], Due: 1790000000000, Empty: null });
	assert.equal(json[0].project, 'DEMO');
});

test('записать поле — $type берётся у задачи (StateMachine), форма значения по $type', async () => {
	const { json, calls } = await run(P('setField', { issueId: 'DEMO-5', field: '84-1|state[1]', value: 'В работе' }), {
		'GET /api/issues/DEMO-5': ISSUE([{ id: '84-1', name: 'State', $type: 'StateMachineIssueCustomField' }]),
		'POST /api/issues/DEMO-5': ISSUE([{ id: '84-1', name: 'State', $type: 'StateMachineIssueCustomField', value: { name: 'В работе' } }]),
	});
	assert.deepEqual(calls[1].body, { customFields: [{ id: '84-1', $type: 'StateMachineIssueCustomField', value: { name: 'В работе' } }] });
	assert.deepEqual(json[0], { idReadable: 'DEMO-5', field: { id: '84-1', name: 'State', value: 'В работе' } });
});

test('записать поле — пользователь, период, текст, простые, дата (полдень UTC календарной даты), сброс', async () => {
	const { valueFor } = dist('actions/issue/setField.operation.js');
	assert.deepEqual(valueFor('SingleUserIssueCustomField', 'user[1]', 'ivanov'), { login: 'ivanov' });
	assert.deepEqual(valueFor('PeriodIssueCustomField', 'period', '480'), { minutes: 480 });
	assert.deepEqual(valueFor('TextIssueCustomField', 'text', 'abc'), { text: 'abc' });
	assert.equal(valueFor('SimpleIssueCustomField', 'integer', '42'), 42);
	assert.equal(valueFor('SimpleIssueCustomField', 'float', '4.5'), 4.5);
	assert.equal(valueFor('SimpleIssueCustomField', 'string', 'x'), 'x');
	assert.deepEqual(valueFor('SingleVersionIssueCustomField', 'version[1]', '1.0'), { name: '1.0' });
	assert.deepEqual(valueFor('SingleOwnedIssueCustomField', 'ownedField[1]', 'Core'), { name: 'Core' });
	assert.equal(valueFor('DateIssueCustomField', 'date', '2026-10-01T00:00:00.000+03:00'), Date.UTC(2026, 9, 1, 12));
	assert.equal(valueFor('DateIssueCustomField', 'date and time', '2026-10-01T09:00:00.000Z'), Date.parse('2026-10-01T09:00:00.000Z'));
	assert.throws(() => valueFor('SomethingNewIssueCustomField', 'x', 'v'), (e) => e.details.problem === fmt(T.problems.unsupportedType, { type: 'SomethingNewIssueCustomField' }));
	assert.throws(() => valueFor('PeriodIssueCustomField', 'period', 'abc'), (e) => e.details.problem.startsWith(T.problems.integer.split('{')[0]));
	const { calls } = await run(P('setField', { issueId: 'DEMO-5', field: '84-2|user[1]', clearField: true }), {
		'GET /api/issues/DEMO-5': ISSUE([{ id: '84-2', name: 'Assignee', $type: 'SingleUserIssueCustomField' }]),
		'POST /api/issues/DEMO-5': ISSUE([]),
	});
	assert.equal(calls[1].body.customFields[0].value, null);
});

test('записать поле — многозначное и поле не из проекта задачи — отказ до записи', async () => {
	const multi = await run(P('setField', { issueId: 'DEMO-5', field: '84-3|version[*]', value: '1.0' }), {}).catch((e) => e);
	assert.ok(multi.message.startsWith(T.guards.multi_value_field.message.split('{')[0]));
	const multiByType = await run(P('setField', { issueId: 'DEMO-5', field: '84-3|version[1]', value: '1.0' }), {
		'GET /api/issues/DEMO-5': ISSUE([{ id: '84-3', name: 'Fix versions', $type: 'MultiVersionIssueCustomField' }]),
	}).catch((e) => e);
	assert.ok(multiByType.message.startsWith(T.guards.multi_value_field.message.split('{')[0]));
	const missing = await run(P('setField', { issueId: 'DEMO-5', field: '99-9|enum[1]', value: 'x' }), { 'GET /api/issues/DEMO-5': ISSUE([]) }).catch((e) => e);
	assert.equal(missing.message, fmt(T.guards.field_not_in_issue.message, { issueId: 'DEMO-5' }));
	const badPick = await run(P('setField', { issueId: 'DEMO-5', field: 'State', value: 'x' }), {}).catch((e) => e);
	assert.ok(badPick.message.includes(T.problems.fieldValue));
});

test('ошибка YouTrack — текст YouTrack в message', async () => {
	const err = await run(P('setField', { issueId: 'DEMO-5', field: '84-1|enum[1]', value: 'Nope' }), {
		'GET /api/issues/DEMO-5': ISSUE([{ id: '84-1', name: 'Priority', $type: 'SingleEnumIssueCustomField' }]),
		'POST /api/issues/DEMO-5': { statusCode: 400, body: { error: 'bad_request', error_description: 'Value not found' } },
	}).catch((e) => e);
	assert.equal(err.message, 'Value not found');
});

test('через планер — update-issue-field с projectKey; период — целые минуты; сброс — null', async () => {
	const { json, calls } = await run(P('setFieldViaPlanner', { issueId: 'DEMO-5', fieldName: 'Оценка', fieldType: 'period', value: '480' }), {
		'POST update-issue-field': { issueId: 'DEMO-5', fieldName: 'Оценка' },
	});
	assert.equal(calls[0].qs.projectKey, 'DEMO');
	assert.deepEqual(calls[0].body, { issueId: 'DEMO-5', fieldName: 'Оценка', type: 'period', value: 480 });
	assert.deepEqual(json[0], { issueId: 'DEMO-5', fieldName: 'Оценка' });
	const clr = await run(P('setFieldViaPlanner', { issueId: 'DEMO-5', fieldName: 'Аналитик', fieldType: 'user', clearField: true }), { 'POST update-issue-field': {} });
	assert.equal(clr.calls[0].body.value, null);
});

test('метод searchProjects — только проекты с планером, без архивных, постранично', async () => {
	const page = Array.from({ length: 50 }, (_, n) => ({ shortName: 'P' + n, name: 'Проект ' + n, archived: n === 2 }));
	const c = ctx({
		routes: {
			'GET /api/admin/projects': { statusCode: 200, body: page },
			'POST filter-planner-projects': (o) => ({ statusCode: 200, body: { success: true, projects: o.body.keys.filter((k) => ['P1', 'P2', 'P3'].includes(k)).map((key) => ({ key })) } }),
		},
	});
	const r = await listSearch.searchProjects.call(c.fn, 'Про', '50');
	assert.deepEqual(r.results, [
		{ name: 'Проект 1 (P1)', value: 'P1' },
		{ name: 'Проект 3 (P3)', value: 'P3' },
	]);
	assert.equal(r.paginationToken, '100');
	assert.equal(c.calls[0].qs.$skip, 50);
	assert.equal(c.calls[0].qs.query, 'Про');
});

test('метод searchReleases — релизы проекта с фильтром; проект выражением — подсказка', async () => {
	const c = ctx({ params: [{ project: project('DEMO') }], routes: { 'GET releases': { releases: [{ id: 'R1', name: 'Осень' }, { id: 'R2', name: 'Зима' }] } } });
	assert.deepEqual((await listSearch.searchReleases.call(c.fn, 'зим')).results, [{ name: 'Зима (R2)', value: 'R2' }]);
	const e = ctx({ params: [{ project: { __rl: true, mode: 'key', value: '={{ $json.key }}' } }] });
	assert.deepEqual((await listSearch.searchReleases.call(e.fn)).results, [{ name: T.lists.selectProject, value: '' }]);
	assert.equal(e.calls.length, 0);
});

test('метод getProjectFields — значение <id>|<вид>, многозначные помечены, сортировка по имени', async () => {
	const c = ctx({
		params: [{ project: project('DEMO') }],
		routes: {
			'GET /api/admin/projects/DEMO/customFields': {
				statusCode: 200,
				body: [
					{ id: '84-2', field: { name: 'State', fieldType: { id: 'state[1]' } } },
					{ id: '84-3', field: { name: 'Fix versions', fieldType: { id: 'version[*]' } } },
				],
			},
		},
	});
	const opts = await loadOptions.getProjectFields.call(c.fn);
	assert.deepEqual(opts, [
		{ name: 'Fix versions ' + T.lists.multiValue, value: '84-3|version[*]', description: 'version[*]' },
		{ name: 'State', value: '84-2|state[1]', description: 'state[1]' },
	]);
});
