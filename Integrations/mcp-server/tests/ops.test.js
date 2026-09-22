import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withRev, slotRev, bodyRev, makeOps } from '../src/ops.js';
import { createClient } from '../src/client.js';
import { PlannerRefusal, PlatformError, NetworkError } from '../src/errors.js';
import { makeState, mockFetch } from './_mock.js';

const conflict = (rev) => new PlannerRefusal({ success: false, error: 'rev_conflict', reason: 'rev_conflict', rev, cid: 'c' });

test('withRev: baseRev агента — один вызов, конфликт наружу', async () => {
  let calls = 0;
  await assert.rejects(withRev({ baseRev: 3, readRev: async () => { throw new Error('не должен читать'); }, run: async () => { calls++; throw conflict(9); } }), (e) => e.reason === 'rev_conflict' && e.rev === 9);
  assert.equal(calls, 1);
});

test('withRev: без baseRev — чтение, один повтор с ревизией из отказа, второй конфликт наружу', async () => {
  const seen = [];
  const r = await withRev({ readRev: async () => 5, run: async (rev) => { seen.push(rev); if (seen.length === 1) throw conflict(7); return { rev: 8 }; } });
  assert.deepEqual(seen, [5, 7]); assert.equal(r.retried, true); assert.equal(r.result.rev, 8);
  const seen2 = [];
  await assert.rejects(withRev({ readRev: async () => 5, run: async (rev) => { seen2.push(rev); throw conflict(rev + 1); } }), (e) => e.reason === 'rev_conflict');
  assert.equal(seen2.length, 2);
});

test('withRev: retry:false — без повтора; иной отказ не повторяется', async () => {
  let n = 0;
  await assert.rejects(withRev({ readRev: async () => 1, run: async () => { n++; throw conflict(2); }, retry: false }));
  assert.equal(n, 1);
  n = 0;
  await assert.rejects(withRev({ readRev: async () => 1, run: async () => { n++; throw new PlannerRefusal({ success: false, reason: 'item_not_found' }); } }), (e) => e.reason === 'item_not_found');
  assert.equal(n, 1);
});

test('ревизии из ответов', () => {
  assert.equal(slotRev({ sprint: null }), 0); assert.equal(slotRev({ sprint: { _rev: 4 } }), 4); assert.equal(slotRev({}), 0);
  assert.equal(bodyRev({ rev: 2 }), 2); assert.equal(bodyRev({}), 0);
});

test('client: адрес по контракту, токен в заголовке, конверт отказа с cid, платформенные ошибки', async () => {
  const st = makeState();
  const c = createClient({ baseUrl: 'http://yt.local', appId: 'app-x', token: 'perm-1', timeoutMs: 1000, fetchImpl: mockFetch(st) });
  assert.equal(c.url('sprint-data', { projectKey: 'DEMO', query: { action: 'upsertItem', empty: '' } }).href, 'http://yt.local/api/extensionEndpoints/app-x/backend-global/sprint-data?projectKey=DEMO&action=upsertItem');
  assert.throws(() => c.url('draft', {}), /outside contract/);
  const sd = await c.call('GET', 'sprint-data', { projectKey: 'DEMO' });
  assert.equal(sd.success, true); assert.equal(st.calls[0].auth, 'Bearer perm-1');
  await assert.rejects(c.call('GET', 'sprint-data', { projectKey: 'OTHER' }), (e) => e instanceof PlannerRefusal && e.reason === 'project_unavailable' && e.cid === 'cid-test-1');
  st.platformStatus = 404;
  await assert.rejects(c.call('GET', 'sprint-data', { projectKey: 'DEMO' }), (e) => e instanceof PlatformError && e.status === 404);
  st.platformStatus = null;
  const bad = createClient({ baseUrl: 'http://yt.local', appId: 'a', token: 't', timeoutMs: 1000, fetchImpl: async () => { throw new TypeError('fetch failed'); } });
  await assert.rejects(bad.call('GET', 'calendar', { projectKey: 'DEMO' }), (e) => e instanceof NetworkError && e.timeout === false);
  const slow = createClient({ baseUrl: 'http://yt.local', appId: 'a', token: 't', timeoutMs: 1000, fetchImpl: async () => { const e = new Error('t'); e.name = 'TimeoutError'; throw e; } });
  await assert.rejects(slow.call('GET', 'calendar', { projectKey: 'DEMO' }), (e) => e instanceof NetworkError && e.timeout === true);
  const ops = makeOps(c);
  await ops.capacityAction('DEMO', 'upsertPerson', 'sprint-1', { login: 'x', person: {} });
  assert.deepEqual(st.calls.at(-1).query, { projectKey: 'DEMO', action: 'upsertPerson', sprintId: 'sprint-1' });
  await ops.appVersion();
  assert.equal(st.calls.at(-1).query.projectKey, undefined);
});
