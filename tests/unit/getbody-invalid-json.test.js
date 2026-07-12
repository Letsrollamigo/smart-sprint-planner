'use strict';

/* Аудит 2026-07-12 G1 — getBody: битый JSON тела реджектится (__rejected__/invalid_json),
 * а не парсится молча в {} (корень класса anti-wipe: parse-fail был неотличим от пустого тела).
 * Запуск: node --test 'tests/unit/getbody-invalid-json.test.js'. */

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const core = require(path.join(__dirname, '..', '..', 'backend-project.js'));

const EP_SPRINT = core.ENDPOINTS.find((e) => e.method === 'POST' && e.path === 'sprint-data');

/* Mock ctx: editor-права; rawBody уходит в request.body КАК ЕСТЬ (без JSON.stringify). */
function mkCtx(rawBody, props) {
  const p = Object.assign({
    ssp_settings: JSON.stringify({ editGroups: ['g-edit'] }),
    ssp_sprint: JSON.stringify({ sprintId: 's-1', name: 'Спринт 1', status: 'PLANNING',
      dateStart: 1750000000000, dateEnd: 1751000000000 }),
    ssp_history: JSON.stringify([]),
  }, props || {});
  return {
    settings: { settingsManagerGroup: { id: 'g-admin', name: 'Admins' } },
    currentUser: { id: 'u-1', login: 'user1', groups: [{ id: 'g-edit', name: 'g-edit' }] },
    project: { extensionProperties: p },
    request: { body: rawBody, getParameter: () => '' },
    response: { status: 200, body: null, json(v) { this.body = v; } },
    _props: p,
  };
}

test('getBody: битый JSON в sprint-data → 400 invalid_json, хранимый спринт не тронут', () => {
  const ctx = mkCtx('{"sprint": {broken');
  EP_SPRINT.handle(ctx);
  assert.strictEqual(ctx.response.status, 400);
  assert.strictEqual(ctx.response.body.reason, 'invalid_json');
  assert.strictEqual(JSON.parse(ctx._props.ssp_sprint).name, 'Спринт 1');
});

test('getBody: пустое тело — по-прежнему {} (легитимный no-op, не reject)', () => {
  const ctx = mkCtx('');
  EP_SPRINT.handle(ctx);
  assert.notStrictEqual(ctx.response.status, 400);
});
