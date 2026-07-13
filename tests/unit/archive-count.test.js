'use strict';

/* Аудит 2026-07-12 P-2 (v3.4.0) — archivedCount горячих GET без полного парса архива:
 * счётчик в отдельном пропе (пишется при архивации), legacy-фолбэк — парс блоба.
 * Запуск: node --test 'tests/unit/archive-count.test.js'. */

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const core = require(path.join(__dirname, '..', '..', 'backend-project.js'));

const EP_CAP = core.ENDPOINTS.find((e) => e.method === 'GET' && e.path === 'capacity');

function mkCtx(props) {
  const p = Object.assign({ ssp_settings: JSON.stringify({ editGroups: ['g-edit'] }) }, props || {});
  return {
    settings: { settingsManagerGroup: { id: 'g-admin', name: 'Admins' } },
    currentUser: { id: 'u-1', login: 'user1', groups: [{ id: 'g-edit', name: 'g-edit' }] },
    project: { extensionProperties: p },
    request: { body: '', getParameter: (k) => (k === 'sprintId' ? 's-1' : '') },
    response: { status: 200, body: null, json(v) { this.body = v; } },
    _props: p,
  };
}

test('archivedCount: берётся из count-пропа БЕЗ парса блоба (блоб намеренно битый)', () => {
  const ctx = mkCtx({
    ssp_capacity: JSON.stringify({ 's-1': { persons: {} } }),
    ssp_capacity_archive: '{broken json — парс этого блоба означал бы регресс',
    ssp_capacity_archive_count: '7',
  });
  EP_CAP.handle(ctx);
  assert.strictEqual(ctx.response.body.success, true);
  assert.strictEqual(ctx.response.body.archivedCount, 7);
});

test('archivedCount: legacy-фолбэк — пропа нет, счёт по содержимому архива', () => {
  const ctx = mkCtx({
    ssp_capacity: JSON.stringify({ 's-1': { persons: {} } }),
    ssp_capacity_archive: JSON.stringify({ 'old-1': {}, 'old-2': {} }),
  });
  EP_CAP.handle(ctx);
  assert.strictEqual(ctx.response.body.archivedCount, 2);
});
