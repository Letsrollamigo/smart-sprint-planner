'use strict';

/* #56-4 — optimistic lock слота sprint-data (POST): baseRev vs хранимый sprint._rev.
 * Параллельная правка двумя пользователями шла last-write-wins и теряла чужой состав.
 * Запуск: node --test 'tests/unit/sprint-rev-lock.test.js'. */

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const core = require(path.join(__dirname, '..', '..', 'backend-project.js'));

const EP = core.ENDPOINTS.find((e) => e.method === 'POST' && e.path === 'sprint-data');

function validSprint(over) {
  return Object.assign({
    sprintId: 's-1', name: 'Спринт 1', status: 'PLANNING',
    dateStart: 1750000000000, dateEnd: 1751000000000,
  }, over || {});
}

/* Mock ctx: editor-права + хранимый ssp_sprint; setProp пишет в extensionProperties. */
function mkCtx(storedSprint, body) {
  const props = {
    ssp_settings: JSON.stringify({ editGroups: ['g-edit'] }),
    ssp_sprint: storedSprint ? JSON.stringify(storedSprint) : '',
  };
  return {
    settings: { settingsManagerGroup: { id: 'g-admin', name: 'Admins' } },
    currentUser: { id: 'u-1', login: 'user1', groups: [{ id: 'g-edit', name: 'g-edit' }] },
    project: { extensionProperties: props },
    request: { body: JSON.stringify(body), getParameter: () => '' },
    response: { status: 200, body: null, json(v) { this.body = v; } },
    _props: props,
  };
}

test('rev-lock: baseRev не совпал с хранимым _rev → 409 rev_conflict + echo rev', () => {
  const ctx = mkCtx(validSprint({ _rev: 5 }), { sprint: validSprint({ name: 'моя правка' }), baseRev: 3 });
  EP.handle(ctx);
  assert.strictEqual(ctx.response.status, 409);
  assert.strictEqual(ctx.response.body.error, 'rev_conflict');
  assert.strictEqual(ctx.response.body.rev, 5);
  assert.strictEqual(JSON.parse(ctx._props.ssp_sprint).name, 'Спринт 1'); // хранимое не тронуто
});

test('rev-lock: baseRev совпал → запись проходит, rev инкрементирован и возвращён', () => {
  const ctx = mkCtx(validSprint({ _rev: 5 }), { sprint: validSprint({ name: 'моя правка' }), baseRev: 5 });
  EP.handle(ctx);
  assert.strictEqual(ctx.response.body.success, true);
  assert.strictEqual(ctx.response.body.rev, 6);
  const stored = JSON.parse(ctx._props.ssp_sprint);
  assert.strictEqual(stored.name, 'моя правка');
  assert.strictEqual(stored._rev, 6);
  assert.ok(ctx.response.body.saved.indexOf('baseRev') < 0); // служебный ключ не в saved
});

test('rev-lock: legacy-клиент без baseRev → пишет как раньше, rev всё равно растёт', () => {
  const ctx = mkCtx(validSprint({ _rev: 7 }), { sprint: validSprint({ name: 'legacy' }) });
  EP.handle(ctx);
  assert.strictEqual(ctx.response.body.success, true);
  assert.strictEqual(JSON.parse(ctx._props.ssp_sprint)._rev, 8);
});

test('rev-lock: пустой слот (нет спринта) → baseRev 0 проходит, первый rev = 1', () => {
  const ctx = mkCtx(null, { sprint: validSprint(), baseRev: 0 });
  EP.handle(ctx);
  assert.strictEqual(ctx.response.body.success, true);
  assert.strictEqual(ctx.response.body.rev, 1);
});

test('rev-lock: roleItems-only write с протухшим baseRev → 409 (состав не затирается)', () => {
  const ctx = mkCtx(validSprint({ _rev: 2 }), { roleItems: { analysis: [] }, baseRev: 1 });
  EP.handle(ctx);
  assert.strictEqual(ctx.response.status, 409);
  assert.strictEqual(ctx.response.body.error, 'rev_conflict');
});

test('rev-lock: roleItems-only write тоже двигает rev слота (второй такой же писатель конфликтнёт)', () => {
  const ctx = mkCtx(validSprint({ _rev: 2 }), { roleItems: { analysis: [] }, baseRev: 2 });
  EP.handle(ctx);
  assert.strictEqual(ctx.response.body.success, true);
  assert.strictEqual(ctx.response.body.rev, 3);
  assert.strictEqual(JSON.parse(ctx._props.ssp_sprint)._rev, 3);
  // второй клиент с тем же baseRev=2 теперь получает конфликт
  const ctx2 = mkCtx(JSON.parse(ctx._props.ssp_sprint), { roleItems: { analysis: [] }, baseRev: 2 });
  EP.handle(ctx2);
  assert.strictEqual(ctx2.response.status, 409);
});
