/* #85 — сквозной идентификатор запроса в конверте отказа и в строке лога. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../../backend-core.js');

function fakeCtx() {
  const out = { status: null, body: null };
  return { out, response: { json: (b) => { out.body = b; }, set status(v) { out.status = v; } } };
}
function withWarn(fn) {
  const lines = []; const orig = console.warn; console.warn = (m) => lines.push(String(m));
  try { fn(); } finally { console.warn = orig; }
  return lines;
}

test('forbidden/badRequest/revConflict/internalError несут cid и пишут одну строку лога без тела', () => {
  const cases = [
    ['forbidden', (ctx) => core.forbidden(ctx, 'plugin_not_configured'), 403, 'plugin_not_configured'],
    ['badRequest', (ctx) => core.badRequest(ctx, 'invalid_sprint_structure'), 400, 'invalid_sprint_structure'],
    ['revConflict', (ctx) => core.revConflict(ctx, 3, 7), 409, 'rev_conflict'],
    ['internalError', (ctx) => core.internalError(ctx, 'boom'), 500, 'internal_error'],
  ];
  for (const [name, call, status, reason] of cases) {
    const ctx = fakeCtx();
    const lines = withWarn(() => call(ctx));
    assert.equal(ctx.out.status, status, name);
    assert.equal(ctx.out.body.success, false, name);
    assert.match(String(ctx.out.body.cid), /^cid-[a-z0-9]+-[a-z0-9]{6}$/, name + ': cid в конверте');
    assert.equal(lines.length, 1, name + ': ровно одна строка лога');
    assert.match(lines[0], new RegExp('\\[smart-sprint-planner\\] ' + ctx.out.body.cid + ' ' + status + ' ' + reason), name);
    assert.ok(!/boom/.test(lines[0]), 'подробности внутренней ошибки в строку отказа не попадают');
  }
});

test('cid один на запрос: повторные отказы в том же ctx переиспользуют его, разные ctx — разные', () => {
  const a = fakeCtx(), b = fakeCtx();
  withWarn(() => { core.forbidden(a, 'x'); });
  const first = a.out.body.cid;
  withWarn(() => { core.badRequest(a, 'y'); });
  assert.equal(a.out.body.cid, first);
  withWarn(() => { core.forbidden(b, 'x'); });
  assert.notEqual(b.out.body.cid, first);
  assert.equal(core.cid(null), null);
});
