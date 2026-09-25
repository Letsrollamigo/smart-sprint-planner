// Запись планера: цикл ревизий (повтор ровно один, без повтора у черновика и ревизии из Options), перенос ревизии
// между элементами, защиты до записи, тела запросов, календарные даты отсутствий.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dist, pathOf, project, refusal, run } from './_mock.mjs';

const { T } = dist('i18n.js');
const { fmt } = dist('transport/errors.js');

const slot = (rev, extra = {}) => ({ configured: true, settings: { activeRoles: ['analysis', 'testing'] }, sprint: { sprintId: 's-11', status: 'PLANNING', _rev: rev, ...extra }, roleItems: {} });
const P = (resource, operation, extra = {}) => ({ resource, operation, project: project(), ...extra });
const upsert = (issueId, extra = {}) => P('sprintItem', 'createOrUpdate', { roleKey: 'analysis', issueId, ...extra });

test('точечная запись: ревизия читается, конфликт — ровно один повтор с ревизией из отказа', async () => {
	const { json, calls } = await run(upsert('DEMO-1', { additionalFields: { estimate: 480 } }), {
		'GET sprint-data': slot(5),
		'POST sprint-data?upsertItem': [refusal('rev_conflict', { rev: 6 }), { rev: 7, applied: { roleKey: 'analysis', issueId: 'DEMO-1', created: true } }],
	});
	assert.deepEqual(calls.map(pathOf), ['sprint-data', 'sprint-data?upsertItem', 'sprint-data?upsertItem']);
	assert.deepEqual(calls.map((c) => c.body?.baseRev), [undefined, 5, 6]);
	assert.deepEqual(calls[1].body.item, { issueId: 'DEMO-1', estimate_analysis: 480 });
	assert.deepEqual(json[0], { rev: 7, applied: { roleKey: 'analysis', issueId: 'DEMO-1', created: true }, retried: true });
});

test('второй конфликт подряд — наружу (повтор один)', async () => {
	const err = await run(upsert('DEMO-1'), { 'GET sprint-data': slot(5), 'POST sprint-data?upsertItem': [refusal('rev_conflict', { rev: 6 }), refusal('rev_conflict', { rev: 8 })] }).catch((e) => e);
	assert.match(err.message, /rev_conflict/);
	assert.ok(err.description.includes(fmt(T.errors.revConflict, { rev: 8 })));
});

test('ревизия из Options — один вызов без чтения и без повтора', async () => {
	const { calls } = await run(upsert('DEMO-1', { options: { revision: 3 } }), { 'POST sprint-data?upsertItem': [refusal('rev_conflict', { rev: 6 })] }, { continueOnFail: true });
	assert.deepEqual(calls.map(pathOf), ['sprint-data?upsertItem']);
	assert.equal(calls[0].body.baseRev, 3);
});

test('перенос ревизии между элементами: N элементов — одно чтение, дальше ревизия из ответа записи', async () => {
	let rev = 10;
	const { json, calls } = await run([upsert('DEMO-1'), upsert('DEMO-2'), upsert('DEMO-3')], {
		'GET sprint-data': slot(10),
		'POST sprint-data?upsertItem': (o) => {
			assert.equal(o.body.baseRev, rev);
			rev += 1;
			return { statusCode: 200, body: { success: true, rev, applied: {} } };
		},
	});
	assert.equal(calls.filter((c) => pathOf(c) === 'sprint-data').length, 1);
	assert.deepEqual(json.map((x) => x.rev), [11, 12, 13]);
});

test('после чужой записи между элементами — повтор с ревизией из отказа, память обновляется', async () => {
	const { json, calls } = await run([upsert('DEMO-1'), upsert('DEMO-2')], {
		'GET sprint-data': slot(1),
		'POST sprint-data?upsertItem': [{ rev: 2 }, refusal('rev_conflict', { rev: 5 }), { rev: 6 }],
	});
	assert.deepEqual(calls.map((c) => c.body?.baseRev), [undefined, 1, 2, 5]);
	assert.deepEqual(json.map((x) => [x.rev, x.retried]), [[2, false], [6, true]]);
});

test('конфликт без ревизии в отказе — повтор с перечитанной ревизией, а не из памяти запуска', async () => {
	const { calls } = await run([upsert('DEMO-1'), upsert('DEMO-2')], {
		'GET sprint-data': [slot(1), slot(7)],
		'POST sprint-data?upsertItem': [{ rev: 2 }, refusal('rev_conflict'), { rev: 8 }],
	});
	assert.deepEqual(calls.map((c) => [pathOf(c), c.body?.baseRev]), [
		['sprint-data', undefined],
		['sprint-data?upsertItem', 1],
		['sprint-data?upsertItem', 2],
		['sprint-data', undefined],
		['sprint-data?upsertItem', 7],
	]);
});

test('черновик: роль не активна и занятый слот — отказ до записи; поверх — с флагом; без повтора', async () => {
	const base = {
		sprintId: 's-12',
		name: 'Спринт 12',
		dateStart: '2026-10-01T00:00:00.000+03:00',
		dateEnd: '2026-10-14T00:00:00.000+03:00',
		items: JSON.stringify({ analysis: [{ issueId: 'DEMO-1', estimate: 480 }] }),
	};
	const busy = { 'GET sprint-data': slot(4, { status: 'CONFIRMED' }), 'POST sprint-data': { rev: 5, enriched: 1, warnings: [] } };
	const e1 = await run(P('sprint', 'uploadDraft', { ...base, items: '{"devIos":[]}' }), busy).catch((e) => e);
	assert.match(e1.message, /devIos/);
	const e2 = await run(P('sprint', 'uploadDraft', base), busy).catch((e) => e);
	assert.ok(e2.message.startsWith(T.guards.slot_occupied.message.split('{')[0]));
	const ok = await run(P('sprint', 'uploadDraft', { ...base, options: { overwrite: true } }), busy);
	const post = ok.calls.find((c) => c.method === 'POST');
	assert.equal(post.body.baseRev, 4);
	assert.equal(post.body.sprint.status, 'PLANNING');
	assert.equal(post.body.sprint.dateStart, Date.parse('2026-09-30T21:00:00.000Z'));
	assert.deepEqual(post.body.roleItems, { analysis: [{ issueId: 'DEMO-1', estimate_analysis: 480 }] });
	assert.deepEqual(ok.json[0], { rev: 5, enriched: 1, warnings: [], overwrote: true });
	const conflict = await run(P('sprint', 'uploadDraft', { ...base, options: { overwrite: true } }), { ...busy, 'POST sprint-data': [refusal('rev_conflict', { rev: 9 })] }).catch((e) => e);
	assert.match(conflict.message, /rev_conflict/);
});

test('черновик: ошибка в составе указывает задачу', async () => {
	const bad = { sprintId: 's', name: 'n', dateStart: '2026-10-01', dateEnd: '2026-10-02', items: '{"analysis":[{"issueId":"DEMO-7","estimate":-1}]}' };
	const err = await run(P('sprint', 'uploadDraft', bad), { 'GET sprint-data': slot(0) }).catch((e) => e);
	assert.match(err.message, /DEMO-7/);
	const err2 = await run(P('sprint', 'uploadDraft', { ...bad, items: '{"analysis":[{"issueId":"DEMO-7","oops":1}]}' }), { 'GET sprint-data': slot(0) }).catch((e) => e);
	assert.match(err2.message, /oops/);
});

test('шапка: пусто — nothing_to_do; ресурсы роли → resource<Роль>', async () => {
	const e = await run(P('sprint', 'update', { updateFields: {} }), {}).catch((x) => x);
	assert.equal(e.message, T.guards.nothing_to_do.message);
	const { calls } = await run(P('sprint', 'update', { updateFields: { sprintGoal: 'Цель', resources: { entries: [{ roleKey: 'testing', minutes: 960 }] } } }), {
		'GET sprint-data': slot(2),
		'POST sprint-data?patchSprint': { rev: 3, applied: {} },
	});
	assert.deepEqual(calls[1].body, { sprint: { sprintGoal: 'Цель', resourceTesting: 960 }, baseRev: 2 });
});

test('назначение: пустой логин снимает исполнителя; даты работы — epoch-ms; historyRev в выводе', async () => {
	const { json, calls } = await run(P('sprintItem', 'assign', { roleKey: 'analysis', issueId: 'DEMO-1', assignee: '', additionalFields: { workStart: '2026-10-01T09:00:00.000Z' } }), {
		'GET sprint-data': slot(1),
		'POST sprint-data?assignPerson': { rev: 2, historyRev: 8, applied: {} },
	});
	assert.equal(calls[1].body.login, null);
	assert.equal(calls[1].body.dateStart, Date.parse('2026-10-01T09:00:00.000Z'));
	assert.equal(json[0].historyRev, 8);
});

test('отсутствие: календарные даты из значения +03:00 без сдвига; ревизия реестра отсутствий', async () => {
	const { json, calls } = await run(
		P('absence', 'createOrUpdate', { login: 'ivanov', from: '2026-10-01T00:00:00.000+03:00', to: '2026-10-03T00:00:00.000+03:00', type: 'vacation', additionalFields: { hoursDelta: 4 } }),
		{ 'GET absences': { rev: 3, absences: {} }, 'POST absences?upsertAbsence': { rev: 4, applied: {} } },
	);
	assert.deepEqual(calls[1].body, { login: 'ivanov', entry: { from: '2026-10-01', to: '2026-10-03', type: 'vacation', hoursDelta: 4 }, baseRev: 3 });
	assert.equal(json[0].rev, 4);
	const del = await run(P('absence', 'delete', { login: 'ivanov', from: '2026-10-01', to: '2026-10-03' }), { 'GET absences': { rev: 4, absences: {} }, 'POST absences?removeAbsence': { rev: 5 } });
	assert.deepEqual(del.json[0], { deleted: true, rev: 5, retried: false });
});

test('ёмкость: участник без спринта в слоте — sprint_not_found; с ID — upsertPerson с долями', async () => {
	const e = await run(P('capacity', 'createOrUpdateMember', { login: 'ivanov' }), { 'GET sprint-data': { sprint: null } }).catch((x) => x);
	assert.equal(e.message, T.guards.sprint_not_found.message);
	const { calls, json } = await run(
		P('capacity', 'createOrUpdateMember', { login: 'ivanov', additionalFields: { sprintId: 's-9', rate: 0.5, allocation: { entries: [{ roleKey: 'analysis', share: 1 }] } } }),
		{ 'POST capacity?upsertPerson': { applied: { login: 'ivanov' }, allocOk: true } },
	);
	assert.equal(calls[0].qs.sprintId, 's-9');
	assert.deepEqual(calls[0].body, { login: 'ivanov', person: { rate: 0.5, alloc: { analysis: 1 } } });
	assert.equal(json[0].allocOk, true);
});

test('релиз: создать, статус со слепком, состав цепочкой ревизий, удалить', async () => {
	const rel = (extra) => P('release', extra.operation, { release: { __rl: true, mode: 'id', value: 'R1' }, ...extra });
	const c1 = await run(P('release', 'createOrUpdate', { releaseId: 'R1', additionalFields: { name: 'Релиз 1', plannedDate: '2026-10-10T00:00:00.000Z', roleReps: { entries: [{ roleKey: 'testing', login: 'petrov' }] } } }), {
		'GET releases': { rev: 1, releases: [] },
		'POST releases?upsertRelease': { rev: 2, applied: { id: 'R1', created: true } },
	});
	assert.deepEqual(c1.calls[1].body.release, { id: 'R1', name: 'Релиз 1', plannedDate: Date.parse('2026-10-10T00:00:00.000Z'), roleReps: { testing: 'petrov' } });
	const c2 = await run(rel({ operation: 'setStatus', status: 'released', additionalFields: { snapshot: '{"done":1}' } }), { 'GET releases': { rev: 2 }, 'POST releases?setReleaseStatus': { rev: 3 } });
	assert.deepEqual(c2.calls[1].body, { id: 'R1', status: 'released', snapshot: { done: 1 }, baseRev: 2 });
	const c3 = await run(rel({ operation: 'updateIssues', additionalFields: { issuesToAdd: 'DEMO-1, DEMO-2', issuesToRemove: ['DEMO-3'] } }), {
		'GET releases': { rev: 3 },
		'POST releases?addReleaseIssues': { rev: 4, applied: { added: ['DEMO-1', 'DEMO-2'] } },
		'POST releases?removeReleaseIssues': { rev: 5, applied: { removed: ['DEMO-3'] } },
	});
	assert.deepEqual(c3.calls.map((c) => c.body?.baseRev), [undefined, 3, 4]);
	assert.deepEqual(c3.json[0], { rev: 5, added: ['DEMO-1', 'DEMO-2'], removed: ['DEMO-3'], retried: false });
	const e = await run(rel({ operation: 'updateIssues', additionalFields: {} }), {}).catch((x) => x);
	assert.equal(e.message, T.guards.nothing_to_do.message);
	const c4 = await run(rel({ operation: 'delete' }), { 'GET releases': { rev: 5 }, 'POST releases?removeRelease': { rev: 6 } });
	assert.deepEqual(c4.json[0], { deleted: true, id: 'R1', rev: 6, retried: false });
	const old = await run(rel({ operation: 'delete' }), { 'GET releases': { rev: 5 }, 'POST releases?removeRelease': refusal('invalid_action') }).catch((x) => x);
	assert.equal(old.message, fmt(T.errors.requires, { version: '3.51.0' }));
});
