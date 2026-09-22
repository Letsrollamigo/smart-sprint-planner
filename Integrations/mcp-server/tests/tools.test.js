import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeState, makeTestCtx } from './_mock.js';
import { connect } from './_client.js';

async function setup(opts, mutate) {
  const st = makeState(); if (mutate) mutate(st);
  const { ctx, lines } = await makeTestCtx(st, opts);
  const c = await connect(ctx);
  return { st, c, lines };
}

test('состав сервера: 19 инструментов, 5 ресурсов, 3 промпта; READ_ONLY — 8 инструментов без записи', async () => {
  const { c } = await setup();
  const tools = (await c.client.listTools()).tools;
  assert.equal(tools.length, 19);
  assert.ok(tools.every((t) => t.name.startsWith('planner_') && t.description && t.annotations));
  assert.equal(tools.filter((t) => t.annotations.readOnlyHint).length, 8);
  assert.equal((await c.client.listResources()).resources.length, 5);
  assert.equal((await c.client.listPrompts()).prompts.length, 3);
  await c.close();
  const ro = await setup({ readOnly: true });
  const names = (await ro.c.client.listTools()).tools.map((t) => t.name);
  assert.equal(names.length, 8); assert.ok(names.every((n) => n.startsWith('planner_get_')));
  await ro.c.close();
});

test('чтение: обзор, спринт с фильтрами, история, ёмкость по слоту, отсутствия по периоду', async () => {
  const { c, st } = await setup();
  const ov = await c.call('planner_get_project_overview', { projectKey: 'DEMO' });
  assert.equal(ov.isError, undefined); assert.equal(ov.structuredContent.contractOk, true); assert.deepEqual(ov.structuredContent.sprint.itemCounts, { analysis: 2, testing: 0 });
  const sp = await c.call('planner_get_sprint', { projectKey: 'DEMO', roleKey: 'analysis', includeExcluded: false });
  assert.deepEqual(Object.keys(sp.structuredContent.items), ['analysis']); assert.equal(sp.structuredContent.items.analysis.total, 1);
  assert.equal('settings' in sp.structuredContent, false);
  assert.ok(!sp.content[0].text.includes('secret'), 'настройки не утекают без includeSettings');
  const sp2 = await c.call('planner_get_sprint', { projectKey: 'DEMO', includeSettings: true });
  assert.equal(sp2.structuredContent.settings.rates.secret, 1);
  const h = await c.call('planner_get_history', { projectKey: 'DEMO', sprintId: 'sprint-0', includeItems: true });
  assert.equal(h.structuredContent.count, 1); assert.equal(h.structuredContent.records[0].items[0].estimate, 60);
  const cap = await c.call('planner_get_capacity', { projectKey: 'DEMO' });
  assert.equal(cap.structuredContent.sprintId, 'sprint-1'); assert.equal(cap.structuredContent.capacity.persons.ivanov.base, 40);
  const ab = await c.call('planner_get_absences', { projectKey: 'DEMO', from: '2026-11-01', to: '2026-11-02' });
  assert.deepEqual(ab.structuredContent.absences, {}); assert.equal(ab.structuredContent.rev, 2);
  const cal = await c.call('planner_get_calendar', { projectKey: 'DEMO', year: 2026 });
  assert.deepEqual(Object.keys(cal.structuredContent.years), ['2026']);
  const rel = await c.call('planner_get_releases', { projectKey: 'DEMO', status: 'work' });
  assert.equal(rel.structuredContent.releases.length, 0); assert.equal(rel.structuredContent.rev, 7);
  const rem = await c.call('planner_get_reminders', { projectKey: 'DEMO', includeJournal: true });
  assert.equal(rem.structuredContent.count, 1); assert.deepEqual(rem.structuredContent.journal, []);
  st.version = '3.48.3';
  const old = await c.call('planner_get_project_overview', { projectKey: 'DEMO' });
  assert.equal(old.structuredContent.contractOk, false); assert.match(old.content[0].text, /старше/);
  await c.close();
});

test('запись: цикл ревизий с одним повтором, свёртка ключей, цепочка релиза', async () => {
  const { c, st } = await setup();
  st.conflictOnce = true;
  const up = await c.call('planner_upsert_item', { projectKey: 'DEMO', roleKey: 'analysis', item: { issueId: 'DEMO-9', estimate: 120, inclusionStatus: 'INC_PLANNED' } });
  assert.equal(up.isError, undefined); assert.equal(up.structuredContent.retried, true); assert.equal(up.structuredContent.rev, 6);
  const sent = st.calls.filter((x) => x.query.action === 'upsertItem').map((x) => x.body);
  assert.equal(sent.length, 2); assert.deepEqual(sent[1].item, { issueId: 'DEMO-9', inclusionStatus: 'INC_PLANNED', estimate_analysis: 120 }); assert.equal(sent[1].baseRev, 5);
  const agentRev = await c.call('planner_remove_item', { projectKey: 'DEMO', roleKey: 'analysis', issueId: 'DEMO-9', baseRev: 1 });
  assert.equal(agentRev.isError, true); assert.match(agentRev.content[0].text, /rev_conflict/); assert.equal(agentRev._meta.error.rev, 6);
  const ps = await c.call('planner_patch_sprint', { projectKey: 'DEMO', sprint: { resources: { testing: 300 }, name: 'N' } });
  assert.deepEqual(st.calls.at(-1).body.sprint, { name: 'N', resourceTesting: 300 });
  const empty = await c.call('planner_patch_sprint', { projectKey: 'DEMO', sprint: {} });
  assert.equal(empty.isError, true); assert.match(empty.content[0].text, /nothing_to_do/);
  const ap = await c.call('planner_assign_person', { projectKey: 'DEMO', roleKey: 'analysis', issueId: 'DEMO-1', login: 'ivanov', dateEnd: null });
  assert.equal(ap.structuredContent.historyRev, 4); assert.deepEqual(st.calls.at(-1).body, { roleKey: 'analysis', issueId: 'DEMO-1', login: 'ivanov', dateEnd: null, baseRev: 7 });
  const ri = await c.call('planner_update_release_issues', { projectKey: 'DEMO', id: 'rel-1', add: ['DEMO-3'], remove: ['DEMO-1'] });
  assert.deepEqual(ri.structuredContent, { rev: 9, added: ['DEMO-3'], removed: ['DEMO-1'], retried: false });
  const rel = st.calls.filter((x) => x.path === 'releases' && x.method === 'POST');
  assert.deepEqual(rel.map((x) => [x.query.action, x.body.baseRev]), [['addReleaseIssues', 7], ['removeReleaseIssues', 8]]);
  const cp = await c.call('planner_upsert_capacity_person', { projectKey: 'DEMO', login: 'ivanov', person: { rate: 0.5 } });
  assert.equal(cp.structuredContent.sprintId, 'sprint-1'); assert.equal(cp.structuredContent.allocOk, true);
  const ab = await c.call('planner_upsert_absence', { projectKey: 'DEMO', login: 'ivanov', entry: { from: '2026-10-13', to: '2026-10-17', type: 'vacation' } });
  assert.equal(ab.structuredContent.rev, 3);
  await c.close();
});

test('заливка черновика: guard слота и ролей, статус PLANNING, FINISHED считается свободным', async () => {
  const { c, st } = await setup();
  const draft = { sprint: { sprintId: 'sprint-2', name: 'S2', dateStart: 1, dateEnd: 2, resources: { analysis: 60 } }, roleItems: { analysis: [{ issueId: 'DEMO-5', estimate: 60 }] } };
  const occ = await c.call('planner_upload_draft', { projectKey: 'DEMO', ...draft });
  assert.equal(occ.isError, true); assert.match(occ.content[0].text, /slot_occupied/); assert.equal(occ._meta.error.sprintId, 'sprint-1');
  assert.equal(st.calls.filter((x) => x.method === 'POST').length, 0, 'ничего не записано');
  const bad = await c.call('planner_upload_draft', { projectKey: 'DEMO', ...draft, roleItems: { devDb: [] }, overwrite: true });
  assert.match(bad.content[0].text, /role_not_active/);
  const same = await c.call('planner_upload_draft', { projectKey: 'DEMO', ...draft, sprint: { ...draft.sprint, sprintId: 'sprint-1' } });
  assert.equal(same.isError, undefined); assert.equal(same.structuredContent.overwrote, false);
  const body = st.calls.at(-1).body;
  assert.equal(body.sprint.status, 'PLANNING'); assert.equal(body.sprint.resourceAnalysis, 60); assert.equal(body.baseRev, 5); assert.deepEqual(body.roleItems.analysis[0], { issueId: 'DEMO-5', estimate_analysis: 60 });
  st.sprint.status = 'CONFIRMED';
  const conf = await c.call('planner_upload_draft', { projectKey: 'DEMO', ...draft });
  assert.equal(conf.isError, true);
  const forced = await c.call('planner_upload_draft', { projectKey: 'DEMO', ...draft, overwrite: true });
  assert.equal(forced.structuredContent.overwrote, true);
  st.sprint.status = 'FINISHED';
  const fin = await c.call('planner_upload_draft', { projectKey: 'DEMO', ...draft });
  assert.equal(fin.isError, undefined);
  st.conflictOnce = true;
  const nore = await c.call('planner_upload_draft', { projectKey: 'DEMO', ...draft });
  assert.equal(nore.isError, true, 'полная запись при конфликте не повторяется'); assert.match(nore.content[0].text, /rev_conflict/);
  await c.close();
});

test('ошибки: отказ с подсказкой и cid, платформенные 401/404, allowlist, zod', async () => {
  const { c, st, lines } = await setup({ allowlist: ['DEMO'] });
  const r = await c.call('planner_upsert_item', { projectKey: 'DEMO', roleKey: 'analysis', item: { issueId: 'DEMO-9' }, baseRev: 5 });
  assert.equal(r.isError, undefined);
  st.sprint._rev = 5;
  const ref = await c.call('planner_get_sprint', { projectKey: 'OTHER' });
  assert.equal(ref.isError, true);
  await c.close();
  const o = await setup({ allowlist: ['OTHER'] });
  const na = await o.c.call('planner_get_sprint', { projectKey: 'DEMO' });
  assert.match(na.content[0].text, /project_not_allowed/); assert.equal(o.st.calls.length, 0);
  await o.c.close();
  const e = await setup();
  const pr = await e.c.call('planner_get_sprint', { projectKey: 'NOPE' });
  assert.match(pr.content[0].text, /project_unavailable/); assert.match(pr.content[0].text, /cid-test-1/); assert.match(pr.content[0].text, /Что делать/);
  assert.equal(pr._meta.error.kind, 'planner');
  e.st.platformStatus = 401;
  const p401 = await e.c.call('planner_get_sprint', { projectKey: 'DEMO' }); assert.match(p401.content[0].text, /401/);
  e.st.platformStatus = 404;
  const p404 = await e.c.call('planner_get_sprint', { projectKey: 'DEMO' }); assert.match(p404.content[0].text, /PLANNER_APP_ID/);
  e.st.platformStatus = null;
  const zod = await e.c.call('planner_upsert_item', { projectKey: 'DEMO', roleKey: 'analysis', item: { issueId: 'bad id' } });
  assert.equal(zod.isError, true);
  const extra = await e.c.call('planner_get_sprint', { projectKey: 'DEMO', unknownKey: 1 });
  assert.equal(extra.isError, true, 'лишний ключ отвергается схемой');
  const ap = await e.c.call('planner_assign_person', { projectKey: 'DEMO', roleKey: 'devDb', issueId: 'DEMO-1', login: 'x' });
  assert.match(ap.content[0].text, /role_record_not_found/);
  assert.ok(e.lines.length > 0 && e.lines.every((l) => !l.includes('perm-test-token') && !l.includes('secret')), 'журнал без токена и тел');
  assert.ok(e.lines.some((l) => l.includes('"cid":"cid-test-1"')));
  await e.c.close();
});
