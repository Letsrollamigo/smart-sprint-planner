/* #110 — шлюз чтений: потолок параллелизма и повтор транзиентных ошибок.
   Каждый assert способен упасть: без потолка 20 параллельных вызовов дали бы 20
   одновременных, без повтора первый 503 ушёл бы наверх. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { wrapHost, isTransient } = require('../../widgets/main/src/infra/read-gate.js');

function fakeHost(behaviour) {
  var inFlight = 0, maxInFlight = 0, calls = [];
  function run(kind, path, opts) {
    calls.push({ kind, path, method: (opts && opts.method) || 'GET' });
    inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
    return new Promise(function (resolve, reject) {
      setTimeout(function () {
        inFlight--;
        try { resolve(behaviour(calls.length, kind, path, opts)); } catch (e) { reject(e); }
      }, 3);
    });
  }
  return {
    fetchYouTrack: function (p, o) { return run('yt', p, o); },
    fetchApp: function (p, o) { return run('app', p, o); },
    stats: function () { return { maxInFlight, calls }; },
  };
}

test('потолок параллелизма fetchYouTrack GET: 20 вызовов → не больше 6 одновременно, все отвечены', async () => {
  const host = fakeHost(() => 'ok');
  const w = wrapHost(host, { delaysMs: [1, 1] });
  const rs = await Promise.all(Array.from({ length: 20 }, (_, i) => w.fetchYouTrack('issues/' + i)));
  assert.equal(rs.length, 20);
  assert.equal(host.stats().maxInFlight, 6);
});

test('POST fetchYouTrack мимо очереди: 10 POST идут параллельно и не повторяются', async () => {
  let n = 0;
  const host = fakeHost(() => { n++; if (n === 1) throw new Error('503 Service Unavailable'); return 'ok'; });
  const w = wrapHost(host, { delaysMs: [1, 1] });
  await assert.rejects(w.fetchYouTrack('issues', { method: 'POST', body: {} }), /503/);
  const rs = await Promise.all(Array.from({ length: 10 }, (_, i) => w.fetchYouTrack('q' + i, { method: 'POST' })));
  assert.equal(rs.length, 10);
  assert.equal(host.stats().maxInFlight, 10, 'POST не гейтится');
});

test('транзиентная ошибка (503) → повтор с паузой, третья попытка удачна', async () => {
  const host = fakeHost((k) => { if (k <= 2) throw new Error('Request failed: 503'); return { ok: true }; });
  const log = [];
  const w = wrapHost(host, { delaysMs: [1, 1], diag: (m) => log.push(m) });
  const r = await w.fetchYouTrack('issues/X-1');
  assert.deepEqual(r, { ok: true });
  assert.equal(host.stats().calls.length, 3);
  assert.equal(log.length, 2, 'два повтора залогированы');
});

test('прикладной отказ не повторяется; 429 после исчерпания попыток уходит наверх', async () => {
  const bad = fakeHost(() => { throw new Error('invalid_role_items_structure'); });
  await assert.rejects(wrapHost(bad, { delaysMs: [1, 1] }).fetchApp('backend-project/sprint-data'), /invalid_role_items_structure/);
  assert.equal(bad.stats().calls.length, 1);
  const busy = fakeHost(() => { throw new Error('429 Too Many Requests'); });
  await assert.rejects(wrapHost(busy, { delaysMs: [1, 1] }).fetchApp('backend-project/history'), /429/);
  assert.equal(busy.stats().calls.length, 3, 'первая попытка + два повтора');
});

test('дедлайн чтения (30 с) и обычный POST fetchApp не повторяются', async () => {
  const dl = fakeHost(() => { const e = new Error('read deadline exceeded'); e._readDeadlineExceeded = true; throw e; });
  await assert.rejects(wrapHost(dl, { delaysMs: [1] }).fetchApp('backend-project/sprint-data'));
  assert.equal(dl.stats().calls.length, 1);
  const post = fakeHost(() => { throw new Error('503'); });
  await assert.rejects(wrapHost(post, { delaysMs: [1] }).fetchApp('backend-project/sprint-data', { method: 'POST', body: {} }));
  assert.equal(post.stats().calls.length, 1, 'запись не повторяется');
  assert.equal(isTransient(new Error('Failed to fetch')), true);
  assert.equal(isTransient(new Error('403 Forbidden')), false);
});

test('обёртка сохраняет прочие свойства хоста и не трогает хост без методов', () => {
  const host = { fetchYouTrack: () => Promise.resolve(1), fetchApp: () => Promise.resolve(2), serverUrl: 'http://x' };
  const w = wrapHost(host);
  assert.equal(w.serverUrl, 'http://x');
  assert.notEqual(w.fetchYouTrack, host.fetchYouTrack);
  assert.equal(wrapHost(null), null);
});
