#!/usr/bin/env node
// Контрактный смоук MCP-сервера на локальном тест-стенде: через HTTP-сервер и клиент SDK.
// Использование: node tests/smoke.mjs <projectKey> [--url http://localhost:8085/mcp]
//   без --url — поднимает свой HTTP-сервер на свободном порту (YT_BASE_URL обязателен);
//   с --url — ходит в уже запущенный сервер (например, контейнер); YT_BASE_URL всё равно нужен для возврата состояния.
// Токен: env YT_TOKEN либо Keychain macOS (YT_TOKEN_SERVICE обязателен, YT_TOKEN_ACCOUNT по умолчанию api-token).
// Умолчаний для ключа проекта и имени сервиса нет намеренно. Значение токена не печатается.
// Скрипт ПИШЕТ данные (точечные операции) и возвращает состояние; предохранитель — только localhost.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import branding from '../src/branding.js';
import { createClient } from '../src/client.js';
import { loadConfig, pickLang } from '../src/config.js';
import { loadDictionary, makeT } from '../src/i18n/index.js';
import { createLog } from '../src/log.js';
import { contextFactory } from '../src/context.js';
import { startHttp } from '../src/http.js';

const args = process.argv.slice(2);
const projectKey = args.find((a) => !a.startsWith('--'));
const urlArg = args.includes('--url') ? args[args.indexOf('--url') + 1] : null;
if (!projectKey) { console.error('usage: node tests/smoke.mjs <projectKey> [--url http://localhost:8085/mcp]'); process.exit(2); }
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/.*)?$/;
const ytBase = (process.env.YT_BASE_URL || '').replace(/\/+$/, '');
if (!LOCAL.test(ytBase)) { console.error('smoke: ОТКАЗ — YT_BASE_URL «' + ytBase + '» не локальный тест-стенд'); process.exit(2); }
if (urlArg && !LOCAL.test(urlArg)) { console.error('smoke: ОТКАЗ — --url не локальный'); process.exit(2); }
let token = process.env.YT_TOKEN || '';
if (!token) {
  if (!process.env.YT_TOKEN_SERVICE) { console.error('smoke: нужен YT_TOKEN либо YT_TOKEN_SERVICE (Keychain)'); process.exit(2); }
  token = execFileSync('security', ['find-generic-password', '-s', process.env.YT_TOKEN_SERVICE, '-a', process.env.YT_TOKEN_ACCOUNT || 'api-token', '-w'], { encoding: 'utf8' }).trim();
}
const appId = process.env.PLANNER_APP_ID || branding.appId;

let server = null, mcpUrl = urlArg;
if (!mcpUrl) {
  const t = makeT(await loadDictionary(pickLang(process.env, branding)));
  const config = loadConfig({ ...process.env, YT_TOKEN: '', MCP_TRANSPORT: 'http', MCP_PORT: '0', MCP_HOST: '127.0.0.1', PLANNER_APP_ID: appId }, branding, t);
  const notes = JSON.parse(fs.readFileSync(new URL('../contract/error-codes.notes.json', import.meta.url), 'utf8'));
  server = await startHttp(config, contextFactory(config, { t, notes, log: createLog('error'), branding }), { t, log: createLog('error') });
  mcpUrl = 'http://127.0.0.1:' + server.address().port + '/mcp';
}
const failed = [];
const check = (name, ok, detail = '') => { console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (ok ? '' : '  → ' + String(detail).slice(0, 300))); if (!ok) failed.push(name); };

async function session(tok) {
  const c = new Client({ name: 'smoke', version: '0' });
  await c.connect(new StreamableHTTPClientTransport(new URL(mcpUrl), { requestInit: { headers: { Authorization: 'Bearer ' + tok } } }));
  return c;
}
const c = await session(token);
const call = async (name, a) => c.callTool({ name, arguments: { projectKey, ...a } });
const okCall = async (name, a) => { const r = await call(name, a); check(name + (a && Object.keys(a).length ? ' ' + JSON.stringify(a).slice(0, 60) : ''), !r.isError, r.content?.[0]?.text); return r.structuredContent || {}; };
const refusal = async (name, a, reason) => { const r = await call(name, a); const e = r._meta?.error || {}; check(name + ' → ' + reason, r.isError === true && e.reason === reason, r.content?.[0]?.text); return e; };

// 1. Состав
const tools = (await c.listTools()).tools; check('listTools = 19', tools.length === 19, tools.length);
check('listResources = 5', (await c.listResources()).resources.length === 5);
check('listPrompts = 3', (await c.listPrompts()).prompts.length === 3);
check('resource enums читается', (await c.readResource({ uri: 'planner://reference/enums' })).contents[0].text.includes('releaseChain'));

// 2. Чтения
const ov = await okCall('planner_get_project_overview', {});
check('overview.contractOk', ov.contractOk === true, JSON.stringify(ov));
const sp = await okCall('planner_get_sprint', {});
for (const [n, a] of [['planner_get_history', { limit: 5 }], ['planner_get_capacity', {}], ['planner_get_calendar', {}], ['planner_get_absences', {}], ['planner_get_releases', {}], ['planner_get_reminders', { includeJournal: true }]]) await okCall(n, a);

// 3. Отказы
{ // токен не проверяется до вызова инструмента (сервер не ходит в YouTrack на initialize) — 401 приходит из инструмента
  const bad = await session('perm:bad.token');
  const r = await bad.callTool({ name: 'planner_get_project_overview', arguments: { projectKey } });
  check('плохой токен → платформенный 401 из инструмента', r.isError === true && r._meta?.error?.kind === 'platform' && r._meta?.error?.status === 401, r.content?.[0]?.text);
  await bad.close(); }
await refusal('planner_get_sprint', { projectKey: 'NoSuchProject113' }, 'project_unavailable');
if (sp.sprint && sp.sprint.status !== 'FINISHED') {
  await refusal('planner_upload_draft', { sprint: { sprintId: 'smoke-113-never', name: 'smoke', dateStart: 1924992000000, dateEnd: 1925596800000 }, roleItems: { analysis: [] } }, 'slot_occupied');
} else console.log('SKIP  slot_occupied — слот пуст либо спринт завершён');

// 4. Круг точечных операций
const SMOKE_ISSUE = projectKey + '-999113';
if (sp.sprint && sp.sprint.sprintId) {
  const rev = sp.sprint.rev;
  const up = await okCall('planner_upsert_item', { roleKey: 'analysis', item: { issueId: SMOKE_ISSUE, title: 'mcp-smoke', inclusionStatus: 'INC_PLANNED', estimate: 60 } });
  check('upsert_item: rev +1', up.rev === rev + 1, up.rev);
  const got = await okCall('planner_get_sprint', { roleKey: 'analysis' });
  check('get_sprint видит задачу с estimate 60', (got.items?.analysis?.items || []).some((i) => i.issueId === SMOKE_ISSUE && i.estimate === 60));
  await refusal('planner_upsert_item', { roleKey: 'analysis', item: { issueId: SMOKE_ISSUE }, baseRev: rev }, 'rev_conflict');
  const rm = await okCall('planner_remove_item', { roleKey: 'analysis', issueId: SMOKE_ISSUE });
  check('remove_item: rev +1', rm.rev === rev + 2, rm.rev);
  const ps = await okCall('planner_patch_sprint', { sprint: { name: sp.sprint.name } });
  check('patch_sprint: rev +1', ps.rev === rev + 3, ps.rev);
  await refusal('planner_remove_item', { roleKey: 'analysis', issueId: SMOKE_ISSUE }, 'item_not_found');
  await refusal('planner_assign_person', { roleKey: 'devDb', issueId: SMOKE_ISSUE, login: 'mcp-smoke' }, 'role_record_not_found');
  const hist = await okCall('planner_get_history', { sprintId: sp.sprint.sprintId, roleKey: 'analysis', includeItems: true });
  const rec = (hist.records || [])[0];
  const withAssignee = rec && (rec.items || []).find((i) => i.assignee);
  if (withAssignee) { const ap = await okCall('planner_assign_person', { roleKey: 'analysis', issueId: withAssignee.issueId, login: withAssignee.assignee }); check('assign_person: historyRev есть', typeof ap.historyRev === 'number', JSON.stringify(ap)); }
  else console.log('SKIP  assign_person — у роли analysis нет записи истории с назначениями');
  const cap = await okCall('planner_get_capacity', {});
  const persons = cap.capacity && cap.capacity.persons ? Object.entries(cap.capacity.persons) : [];
  if (persons.length) { const [login, p] = persons[0]; await okCall('planner_upsert_capacity_person', { login, person: { rate: p.rate ?? 1 } }); }
  else console.log('SKIP  upsert_capacity_person — у спринта нет записи ёмкости');
} else console.log('SKIP  операции спринта — слот пуст');

const ab = await okCall('planner_get_absences', {});
const ua = await okCall('planner_upsert_absence', { login: 'mcp-smoke', entry: { from: '2031-01-13', to: '2031-01-14', type: 'vacation' } });
check('upsert_absence: rev +1', ua.rev === ab.rev + 1, ua.rev);
await okCall('planner_remove_absence', { login: 'mcp-smoke', from: '2031-01-13', to: '2031-01-14' });
check('absences: после круга записи нет', !((await okCall('planner_get_absences', { login: 'mcp-smoke' })).absences || {})['mcp-smoke']);

const rel = await okCall('planner_get_releases', {});
const rid = 'mcp-smoke-113';
const ur = await okCall('planner_upsert_release', { release: { id: rid, name: 'mcp-smoke', kind: 'release', source: 'internal', status: 'planned', plannedDate: 1924992000000 } });
check('upsert_release: rev +1', ur.rev === rel.rev + 1, ur.rev);
const ri = await okCall('planner_update_release_issues', { id: rid, add: [projectKey + '-1', projectKey + '-2'], remove: [projectKey + '-1'] });
check('update_release_issues: rev +2, added 2, removed 1', ri.rev === rel.rev + 3 && ri.added.length === 2 && ri.removed.length === 1, JSON.stringify(ri));
const ss = await okCall('planner_set_release_status', { id: rid, status: 'prep' });
check('set_release_status: rev +1', ss.rev === rel.rev + 4, ss.rev);
const cur = await okCall('planner_get_releases', {});
const mine = (cur.releases || []).find((r) => r.id === rid);
check('релиз записан: статус prep, состав -2', !!mine && mine.status === 'prep' && JSON.stringify(mine.issues) === JSON.stringify([projectKey + '-2']), JSON.stringify(mine));
// возврат состояния: удаления релиза точечной операцией нет — полная запись напрямую, мимо сервера
const direct = createClient({ baseUrl: ytBase, appId, token, timeoutMs: 30000 });
const full = await direct.call('GET', 'releases', { projectKey });
const rest = (full.releases || []).filter((r) => r.id !== rid);
const restored = await direct.call('POST', 'releases', { projectKey, body: { releases: rest, baseRev: full.rev } }).then(() => true).catch((e) => e.message);
check('releases: возврат состояния полной записью', restored === true, restored);

await c.close();
if (server) await new Promise((r) => server.close(r));
console.log('\nИТОГ: ' + (failed.length ? 'FAIL (' + failed.length + '): ' + failed.join('; ') : 'PASS'));
process.exit(failed.length ? 1 : 0);
