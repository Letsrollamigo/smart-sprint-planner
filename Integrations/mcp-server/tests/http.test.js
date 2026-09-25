import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startHttp } from '../src/http.js';
import { createLog } from '../src/log.js';
import { makeT, loadDictionary } from '../src/i18n/index.js';
import { makeState, makeTestCtx } from './_mock.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

test('http: healthz без токена, 401 без WWW-Authenticate, 405, параллельные клиенты со своими токенами', async () => {
  const st = makeState();
  const t = makeT(await loadDictionary('ru'));
  const { ctx } = await makeTestCtx(st);
  const tokens = [];
  const makeCtx = (token) => { tokens.push(token); return ctx; };
  const server = await startHttp({ host: '127.0.0.1', port: 0, allowedHosts: [] }, makeCtx, { t, log: createLog('error', { write() {} }) });
  const base = 'http://127.0.0.1:' + server.address().port;
  const h = await fetch(base + '/healthz'); assert.equal(h.status, 200); assert.equal((await h.json()).name, 'sprint-planner-mcp');
  const no = await fetch(base + '/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(no.status, 401); assert.equal(no.headers.get('www-authenticate'), null);
  assert.equal((await fetch(base + '/mcp')).status, 405);
  assert.equal((await fetch(base + '/other')).status, 404);
  const call = async (token) => {
    const c = new Client({ name: 'c', version: '0' });
    await c.connect(new StreamableHTTPClientTransport(new URL(base + '/mcp'), { requestInit: { headers: { Authorization: 'Bearer ' + token } } }));
    const r = await c.callTool({ name: 'planner_get_project_overview', arguments: { projectKey: 'DEMO' } });
    await c.close();
    return r.structuredContent.version;
  };
  const rs = await Promise.all([call('perm-a'), call('perm-b')]);
  assert.deepEqual(rs, ['3.51.0', '3.51.0']);
  assert.ok(tokens.includes('perm-a') && tokens.includes('perm-b'));
  await new Promise((r) => server.close(r));
});
