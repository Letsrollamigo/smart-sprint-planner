#!/usr/bin/env node
// Смоук ноды на локальном стенде n8n против тест-стенда YouTrack (#113 1а, спека §9): сборка выкладывается в
// custom-nodes, учётные данные и воркфлоу «Webhook → Code → нода» создаются публичным API n8n, каждый шаг — вызов вебхука.
// Использование: node tests/smoke-n8n.mjs <projectKey> <issueId>   (перед запуском — npm run build)
// <projectKey> — проект с планером (в нём же задачи <projectKey>-1 и -2 для релиза); <issueId> — задача для «Записать поле»,
// может быть в другом проекте: виды полей берутся из проекта самой задачи.
// Окружение (умолчаний для проекта, задачи и имён Keychain нет намеренно — как у смоука MCP-сервера):
//   N8N_URL            адрес n8n, по умолчанию http://localhost:5678
//   N8N_API_KEY | N8N_KEY_SERVICE [N8N_KEY_ACCOUNT=api-key]      ключ публичного API n8n (Keychain macOS)
//   N8N_CUSTOM_DIR     папка custom-nodes стенда на хосте (смонтирована в /home/node/.n8n/custom)
//   N8N_CONTAINER      контейнер n8n для рестарта (новый тип учётных данных n8n видит после рестарта); пусто — без рестарта
//   YT_URL             YouTrack для ноды изнутри контейнера, например http://host.docker.internal:<порт>
//   YT_HOST_URL        тот же YouTrack с хоста — проверки и подготовка наборов, например http://localhost:<порт>
//   YT_TOKEN | YT_TOKEN_SERVICE [YT_TOKEN_ACCOUNT=api-token]     токен тест-стенда
// Скрипт ПИШЕТ данные и возвращает состояние (воркфлоу, учётные данные, значения полей и временные значения наборов);
// предохранитель — только локальные адреса. Значения токенов не печатаются.
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { name: PKG_NAME } = JSON.parse(fs.readFileSync(path.join(PKG, 'package.json'), 'utf8'));
const { BRAND } = require(path.join(PKG, 'dist/nodes/SprintPlanner/branding.js'));

const [projectKey, issueId] = process.argv.slice(2);
if (!projectKey || !issueId) { console.error('usage: node tests/smoke-n8n.mjs <projectKey> <issueId>'); process.exit(2); }
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|host\.docker\.internal|[a-z0-9-]+\.orb\.local)(:\d+)?\/?$/;
const n8nUrl = (process.env.N8N_URL || 'http://localhost:5678').replace(/\/+$/, '');
const ytUrl = (process.env.YT_URL || '').replace(/\/+$/, '');
const ytHost = (process.env.YT_HOST_URL || '').replace(/\/+$/, '');
for (const [n, u] of [['N8N_URL', n8nUrl], ['YT_URL', ytUrl], ['YT_HOST_URL', ytHost]]) {
	if (!LOCAL.test(u)) { console.error(`smoke: ОТКАЗ — ${n} «${u}» не локальный`); process.exit(2); }
}
if (!process.env.N8N_CUSTOM_DIR || !fs.existsSync(process.env.N8N_CUSTOM_DIR)) { console.error('smoke: нужен N8N_CUSTOM_DIR — папка custom-nodes стенда'); process.exit(2); }
if (!fs.existsSync(path.join(PKG, 'dist/nodes/SprintPlanner/SprintPlanner.node.js'))) { console.error('smoke: нет dist/ — сначала npm run build'); process.exit(2); }

function secret(envValue, envService, account) {
	if (process.env[envValue]) return process.env[envValue];
	if (!process.env[envService]) { console.error(`smoke: нужен ${envValue} либо ${envService} (Keychain)`); process.exit(2); }
	return execFileSync('security', ['find-generic-password', '-s', process.env[envService], '-a', account, '-w'], { encoding: 'utf8' }).trim();
}
const n8nKey = secret('N8N_API_KEY', 'N8N_KEY_SERVICE', process.env.N8N_KEY_ACCOUNT || 'api-key');
const ytToken = secret('YT_TOKEN', 'YT_TOKEN_SERVICE', process.env.YT_TOKEN_ACCOUNT || 'api-token');

const failed = [];
const check = (name, ok, detail = '') => {
	console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (ok ? '' : '  → ' + String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 400)));
	if (!ok) failed.push(name);
	return ok;
};

async function http(base, headers, method, p, body) {
	const res = await fetch(base + p, { method, headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
	const text = await res.text();
	let data;
	try { data = text ? JSON.parse(text) : null; } catch { data = text; }
	return { status: res.status, data };
}
const n8n = (m, p, b) => http(n8nUrl, { 'X-N8N-API-KEY': n8nKey }, m, '/api/v1' + p, b);
const yt = (m, p, b) => http(ytHost, { Authorization: 'Bearer ' + ytToken }, m, p, b);

// 1. Выкладка сборки и рестарт (тип учётных данных регистрируется только при старте n8n)
const target = path.join(process.env.N8N_CUSTOM_DIR, PKG_NAME);
fs.rmSync(target, { recursive: true, force: true });
fs.cpSync(path.join(PKG, 'dist'), target, { recursive: true });
if (process.env.N8N_CONTAINER) {
	execFileSync('docker', ['restart', process.env.N8N_CONTAINER], { stdio: 'ignore' });
	for (let i = 0; i < 60; i++) {
		if ((await fetch(n8nUrl + '/healthz').then((r) => r.ok).catch(() => false)) && (await n8n('GET', '/credentials/schema/' + BRAND.credentialName)).status === 200) break;
		await new Promise((r) => setTimeout(r, 2000));
	}
}
check('тип учётных данных виден публичному API', (await n8n('GET', '/credentials/schema/' + BRAND.credentialName)).status === 200);

const cred = await n8n('POST', '/credentials', { name: 'smoke-113-1a', type: BRAND.credentialName, data: { url: ytUrl, token: ytToken, appId: BRAND.appId } });
if (!check('учётные данные созданы', cred.status === 200 && cred.data?.id, cred.data)) process.exit(1);
const NODE_TYPE = 'CUSTOM.sprintPlanner';
const PR = { __rl: true, mode: 'key', value: projectKey };

/** Один запуск ноды: воркфлоу создаётся, активируется, вызывается вебхуком и удаляется. */
async function node(parameters, { items, continueOnFail = false, credId = cred.data.id } = {}) {
	const hook = 'smoke-113-1a-' + randomUUID();
	const wf = await n8n('POST', '/workflows', {
		name: 'smoke-113-1a ' + parameters.resource + '.' + parameters.operation,
		nodes: [
			{ id: randomUUID(), name: 'Hook', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 0], webhookId: randomUUID(), parameters: { httpMethod: 'POST', path: hook, responseMode: 'lastNode', responseData: 'allEntries', options: {} } },
			{ id: randomUUID(), name: 'Items', type: 'n8n-nodes-base.code', typeVersion: 2, position: [220, 0], parameters: { jsCode: 'return ($input.first().json.body.items || [{}]).map((json) => ({ json }));' } },
			{
				id: randomUUID(), name: 'Planner', type: NODE_TYPE, typeVersion: 1, position: [440, 0], parameters,
				credentials: { [BRAND.credentialName]: { id: credId, name: 'smoke-113-1a' } },
				...(continueOnFail ? { onError: 'continueRegularOutput' } : {}),
			},
		],
		connections: { Hook: { main: [[{ node: 'Items', type: 'main', index: 0 }]] }, Items: { main: [[{ node: 'Planner', type: 'main', index: 0 }]] } },
		settings: {},
	});
	if (wf.status !== 200) return { status: wf.status, data: wf.data };
	try {
		const act = await n8n('POST', `/workflows/${wf.data.id}/activate`);
		if (act.status !== 200) return { status: act.status, data: act.data };
		return await http(n8nUrl, {}, 'POST', '/webhook/' + hook, { items });
	} finally {
		await n8n('POST', `/workflows/${wf.data.id}/deactivate`);
		await n8n('DELETE', `/workflows/${wf.data.id}`);
	}
}
const ok = async (name, parameters, opts) => {
	const r = await node(parameters, opts);
	check(name, r.status === 200 && Array.isArray(r.data), r.data);
	return Array.isArray(r.data) ? r.data : [];
};
const refused = async (name, parameters, reason, opts = {}) => {
	const r = await node(parameters, { continueOnFail: true, ...opts });
	const j = Array.isArray(r.data) ? r.data[0] : null;
	check(name + ' → ' + reason, !!j && j.ok === false && (Array.isArray(reason) ? reason.includes(j.reason) : j.reason === reason), r.data);
	return j;
};
const P = (resource, operation, extra = {}) => ({ resource, operation, project: PR, ...extra });

try {
	// 2. Чтения
	const [ov] = await ok('Проект → Обзор', P('project', 'getOverview'));
	check('обзор: планер ≥ 3.49.1, настроен', ov?.contractOk === true && ov?.configured === true, ov);
	const [sp] = await ok('Спринт → Получить', P('sprint', 'get'));
	await ok('История → Список', P('history', 'getMany', { limit: 3 }));
	await ok('Ёмкость → Получить', P('capacity', 'get'));
	await ok('Календарь → Получить', P('calendar', 'get'));
	await ok('Напоминание → Список', P('reminder', 'getMany', { options: { includeJournal: true } }));
	const [roles] = await ok('Права → Мои роли', P('access', 'getMyRoles'));
	check('мои роли: 9 ключей', roles && Object.keys(roles.roles || {}).length >= 9, roles);
	const projects = await ok('Проект → Список', { resource: 'project', operation: 'getMany', search: projectKey, returnAll: true });
	check('список проектов: проект с планером', projects.some((p) => p.key === projectKey && p.planner === true), projects);
	const [st] = await ok('Проект → Статус планера', P('project', 'getPlannerStatus'));
	check('статус: подключён, версия', st?.attached === true && typeof st?.version === 'string', st);
	const found = await ok('Задача YouTrack → Найти', { resource: 'issue', operation: 'search', query: 'sort by: created', limit: 3, options: { project: projectKey } });
	check('поиск: задачи проекта с полями', found.length > 0 && found.every((x) => x.project === projectKey && x.fields), found);

	// 3. Отказы
	const badCred = await n8n('POST', '/credentials', { name: 'smoke-113-1a-bad', type: BRAND.credentialName, data: { url: ytUrl, token: 'perm-bad.token', appId: BRAND.appId } });
	try {
		await refused('Проект → Обзор (плохой токен)', P('project', 'getOverview'), 'http_401', { credId: badCred.data?.id });
	} finally {
		if (badCred.data?.id) await n8n('DELETE', '/credentials/' + badCred.data.id);
	}
	await refused('Спринт → Получить (несуществующий проект)', { resource: 'sprint', operation: 'get', project: { __rl: true, mode: 'key', value: 'NoSuchProject113' } }, 'project_unavailable');
	if (sp?.sprint && sp.sprint.status !== 'FINISHED') {
		await refused('Спринт → Залить черновик в занятый слот', P('sprint', 'uploadDraft', { sprintId: 'smoke-113-never', name: 'smoke', dateStart: '2031-01-01T00:00:00.000Z', dateEnd: '2031-01-14T00:00:00.000Z', items: '{"analysis":[]}' }), 'slot_occupied');
	} else console.log('SKIP  slot_occupied — слот пуст либо спринт завершён');

	// 4. Круг задачи спринта: ревизия растёт на каждой записи; два элемента за запуск — ревизия переносится
	const SMOKE = projectKey + '-999113';
	if (sp?.sprint?.sprintId) {
		const rev = sp.sprint.rev;
		const [a] = await ok('Задача спринта → Добавить', P('sprintItem', 'createOrUpdate', { roleKey: 'analysis', issueId: SMOKE, additionalFields: { title: 'n8n-smoke', inclusionStatus: 'INC_PLANNED', estimate: 60 } }));
		check('добавить: rev +1', a?.rev === rev + 1, a);
		const pair = await ok('два элемента: изменить оценку и убрать', P('sprintItem', 'createOrUpdate', { roleKey: 'analysis', issueId: SMOKE, additionalFields: { estimate: '={{ $json.estimate }}' } }), { items: [{ estimate: 120 }, { estimate: 180 }] });
		check('перенос ревизии: rev +1, +1 без повтора', pair.length === 2 && pair[0].rev === rev + 2 && pair[1].rev === rev + 3 && !pair[0].retried && !pair[1].retried, pair);
		const split = await ok('Спринт → Получить (элементы)', P('sprint', 'get', { options: { splitIntoItems: true, roleKey: 'analysis' } }));
		check('оценка 180 на месте', split.some((x) => x.issueId === SMOKE && x.estimate === 180), split.filter((x) => x.issueId === SMOKE));
		await refused('Задача спринта → устаревшая ревизия', P('sprintItem', 'createOrUpdate', { roleKey: 'analysis', issueId: SMOKE, options: { revision: rev } }), 'rev_conflict');
		const [rm] = await ok('Задача спринта → Убрать', P('sprintItem', 'remove', { roleKey: 'analysis', issueId: SMOKE }));
		check('убрать: rev +1', rm?.rev === rev + 4, rm);
		const [hd] = await ok('Спринт → Изменить шапку (то же название)', P('sprint', 'update', { updateFields: { name: sp.sprint.name } }));
		check('шапка: rev +1', hd?.rev === rev + 5, hd);
	} else console.log('SKIP  операции спринта — слот пуст');

	// 5. Отсутствие туда-обратно (календарные даты)
	const [ua] = await ok('Отсутствие → Добавить', P('absence', 'createOrUpdate', { login: 'n8n-smoke', from: '2031-01-13T00:00:00.000+03:00', to: '2031-01-14T00:00:00.000+03:00', type: 'vacation' }));
	const mine = await ok('Отсутствие → Список (логин)', P('absence', 'getMany', { options: { login: 'n8n-smoke' } }));
	check('отсутствие записано датами 13–14 января', mine.length === 1 && mine[0].from === '2031-01-13' && mine[0].to === '2031-01-14', mine);
	const [da] = await ok('Отсутствие → Удалить', P('absence', 'delete', { login: 'n8n-smoke', from: '2031-01-13', to: '2031-01-14' }));
	check('отсутствие удалено: rev +1', da?.deleted === true && da.rev === ua?.rev + 1, da);

	// 6. Релиз: создать → состав → статус → удалить
	const RID = 'n8n-smoke-113';
	const RL = { __rl: true, mode: 'id', value: RID };
	const [cr] = await ok('Релиз → Создать', P('release', 'createOrUpdate', { releaseId: RID, additionalFields: { name: 'n8n-smoke', kind: 'release', source: 'internal', status: 'planned', plannedDate: '2031-01-01T00:00:00.000Z' } }));
	const [ui] = await ok('Релиз → Добавить и убрать задачи', P('release', 'updateIssues', { release: RL, additionalFields: { issuesToAdd: `${projectKey}-1, ${projectKey}-2`, issuesToRemove: `${projectKey}-1` } }));
	check('состав: +2 −1, rev +2', ui?.added?.length === 2 && ui?.removed?.length === 1 && ui.rev === cr?.rev + 2, ui);
	await ok('Релиз → Сменить статус prep', P('release', 'setStatus', { release: RL, status: 'prep' }));
	const rels = await ok('Релиз → Список', P('release', 'getMany', { returnAll: true, options: { status: 'prep' } }));
	const r = rels.find((x) => x.id === RID);
	check('релиз: prep, состав [-2]', !!r && JSON.stringify(r.issues) === JSON.stringify([projectKey + '-2']), r);
	const [dr] = await ok('Релиз → Удалить', P('release', 'delete', { release: RL }));
	check('релиз удалён', dr?.deleted === true && dr.id === RID, dr);
	await refused('Релиз → Удалить повторно', P('release', 'delete', { release: RL }), 'release_not_found');

	// 7. Записать поле (штатно) — по одному полю вида, запись → проверка → возврат (спека §6)
	await fieldRound();
	await refused('Записать поле через планер (поле не из настроек)', P('issue', 'setFieldViaPlanner', { issueId, fieldName: 'NoSuchField113', fieldType: 'enum', value: 'x' }), ['field_not_whitelisted', 'field_not_found', 'plugin_not_configured', 'assigner_rights_required']);
} finally {
	await n8n('DELETE', '/credentials/' + cred.data.id);
	const left = (await n8n('GET', '/workflows?limit=250')).data?.data?.filter((w) => w.name.startsWith('smoke-113-1a')) ?? [];
	check('стенд n8n чист: воркфлоу смоука удалены', left.length === 0, left.map((w) => w.id));
}

async function fieldRound() {
	const pf = (await yt('GET', `/api/admin/projects/${issueId.replace(/-\d+$/, '')}/customFields?fields=id,canBeEmpty,field(name,fieldType(id)),bundle(id,values(name),aggregatedUsers(login))&$top=200`)).data;
	const pick = (type, pred = () => true) => pf.find((f) => f.field.fieldType.id === type && pred(f));
	const current = async (id) => (await yt('GET', `/api/issues/${issueId}?fields=customFields(id,value(name,login,minutes,text))`)).data.customFields.find((f) => f.id === id)?.value ?? null;
	const setViaNode = (f, value) => node(P('issue', 'setField', { issueId, field: `${f.id}|${f.field.fieldType.id}`, ...(value === null ? { clearField: true } : { value }) }));
	const plain = (v) => (v && typeof v === 'object' ? v.login ?? v.name ?? v.minutes ?? v.text ?? null : v);

	/** Запись значения и возврат исходного; exp — ожидаемое значение после записи (по умолчанию то же). */
	async function round(label, f, value, exp = value) {
		if (!f) return console.log('SKIP  поле вида ' + label + ' — в проекте нет');
		const before = plain(await current(f.id));
		const w = await setViaNode(f, value);
		check(`Записать поле: ${label} «${f.field.name}»`, w.status === 200 && Array.isArray(w.data), w.data);
		check(`  значение записано (${label})`, plain(await current(f.id)) === exp, await current(f.id));
		const back = await setViaNode(f, before === null ? null : String(before));
		check(`  возвращено (${label})`, back.status === 200 && plain(await current(f.id)) === before, await current(f.id));
	}

	const enumF = pick('enum[1]', (f) => (f.bundle?.values?.length ?? 0) >= 2 && !f.canBeEmpty);
	const cur = enumF ? plain(await current(enumF.id)) : null;
	await round('enum', enumF, enumF?.bundle.values.map((v) => v.name).find((n) => n !== cur));
	const stateF = pick('state[1]');
	if (stateF) {
		const s = plain(await current(stateF.id));
		const w = await setViaNode(stateF, s);
		check(`Записать поле: state «${stateF.field.name}» тем же значением`, w.status === 200 && plain(await current(stateF.id)) === s, w.data);
	}
	await round('version[1]', pick('version[1]', (f) => f.bundle?.values?.length), pick('version[1]', (f) => f.bundle?.values?.length)?.bundle.values[0].name);
	const userF = pick('user[1]', (f) => f.canBeEmpty && (f.bundle?.aggregatedUsers?.length ?? 0) >= 2);
	const curUser = userF ? plain(await current(userF.id)) : null;
	await round('user', userF, userF?.bundle.aggregatedUsers.map((u) => u.login).find((l) => l !== curUser));
	await round('period', pick('period'), '180', 180);
	await round('text', pick('text'), 'n8n-smoke');
	await round('string', pick('string'), 'n8n-smoke');
	await round('integer', pick('integer'), '42', 42);
	await round('date', pick('date'), '2031-01-13T00:00:00.000+03:00', Date.UTC(2031, 0, 13, 12));
	const multi = pick('version[*]');
	if (multi) await refused(`Записать поле: многозначное «${multi.field.name}»`, P('issue', 'setField', { issueId, field: `${multi.id}|version[*]`, value: 'x' }), 'multi_value_field');

	// build и owned: во временное значение набора и обратно (набор стенда может быть пуст)
	for (const [type, kind] of [['build[1]', 'build'], ['ownedField[1]', 'ownedField']]) {
		const f = pick(type);
		if (!f) { console.log('SKIP  поле вида ' + type + ' — в проекте нет'); continue; }
		const name = 'n8n-smoke-113';
		const added = await yt('POST', `/api/admin/customFieldSettings/bundles/${kind}/${f.bundle.id}/values?fields=id,name`, { name });
		if (!check(`набор ${type}: временное значение добавлено`, added.status === 200 && added.data?.id, added.data)) continue;
		try {
			await round(type, f, name);
		} finally {
			const del = await yt('DELETE', `/api/admin/customFieldSettings/bundles/${kind}/${f.bundle.id}/values/${added.data.id}`);
			check(`набор ${type}: временное значение удалено`, del.status === 200, del.data);
		}
	}
}

console.log('\nИТОГ: ' + (failed.length ? 'FAIL (' + failed.length + '): ' + failed.join('; ') : 'PASS'));
process.exit(failed.length ? 1 : 0);
