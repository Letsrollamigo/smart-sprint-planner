'use strict';

/* R6 — optimistic lock слотов history/releases/absences (обобщение #56-4, стабильность §3
 * P1 #11/#13/#14): baseRev vs хранимый rev-счётчик в отдельном extProp ssp_<slot>_rev.
 * Контракт: расхождение → 409 rev_conflict + echo rev; без baseRev (legacy) — прежнее
 * поведение; rev двигается только с реальной записью; GET отдаёт rev.
 * Запуск: node --test 'tests/unit/slot-rev-lock.test.js'. */

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const core = require(path.join(__dirname, '..', '..', 'backend-project.js'));
require(path.join(__dirname, '..', '..', 'backend-release.js'));
require(path.join(__dirname, '..', '..', 'backend-capacity.js'));

function ep(method, p) { return core.ENDPOINTS.find((e) => e.method === method && e.path === p); }

/* Mock ctx: validator/historyManager/editor/settings-manager разом (лок тестируем, не права). */
const HIST_SETTINGS = JSON.stringify({ validationGroups: ['g-admin'], historyClearGroups: ['g-admin'] });
function mkCtx(props, body, params) {
  params = params || {};
  return {
    settings: { settingsManagerGroup: { id: 'g-admin', name: 'Admins' } },
    currentUser: { id: 'u-1', login: 'user1', groups: [{ id: 'g-admin', name: 'Admins' }] },
    project: { extensionProperties: props },
    request: { body: body === undefined ? '' : JSON.stringify(body), getParameter: (k) => (params[k] || '') },
    response: { status: 200, body: null, json(v) { this.body = v; } },
    _props: props,
  };
}

function validSnap(over) {
  return Object.assign({
    sprintId: 's-1_analysis', roleKey: 'analysis', name: 'Спринт 1', status: 'FINISHED',
    dateStart: 1750000000000, dateEnd: 1751000000000,
  }, over || {});
}

/* ── history ── */

test('history POST: baseRev мимо хранимого rev → 409 rev_conflict + echo, запись не тронута', () => {
  const props = { ssp_settings: HIST_SETTINGS, ssp_history: '[]', ssp_history_rev: '5' };
  const ctx = mkCtx(props, { history: [validSnap()], baseRev: 3 });
  ep('POST', 'history').handle(ctx);
  assert.strictEqual(ctx.response.status, 409);
  assert.strictEqual(ctx.response.body.error, 'rev_conflict');
  assert.strictEqual(ctx.response.body.rev, 5);
  assert.strictEqual(props.ssp_history, '[]');           // full-replace не прошёл
  assert.strictEqual(props.ssp_history_rev, '5');        // rev не сдвинут
});

test('history POST: baseRev совпал → запись + rev+1 в ответе и сторе', () => {
  const props = { ssp_settings: HIST_SETTINGS, ssp_history: '[]', ssp_history_rev: '5' };
  const ctx = mkCtx(props, { history: [validSnap()], baseRev: 5 });
  ep('POST', 'history').handle(ctx);
  assert.strictEqual(ctx.response.body.success, true);
  assert.strictEqual(ctx.response.body.rev, 6);
  assert.strictEqual(props.ssp_history_rev, '6');
  assert.strictEqual(JSON.parse(props.ssp_history).length, 1);
});

test('history POST: legacy без baseRev → пишет (прежнее поведение), rev всё равно двигается', () => {
  const props = { ssp_settings: HIST_SETTINGS, ssp_history: '[]', ssp_history_rev: '7' };
  const ctx = mkCtx(props, { history: [validSnap()] });
  ep('POST', 'history').handle(ctx);
  assert.strictEqual(ctx.response.body.success, true);
  assert.strictEqual(ctx.response.body.rev, 8);
});

test('history POST без history-ключа: rev НЕ двигается (нет записи — нет бампа)', () => {
  const props = { ssp_settings: HIST_SETTINGS, ssp_history: '[]', ssp_history_rev: '2' };
  const ctx = mkCtx(props, { baseRev: 2 });
  ep('POST', 'history').handle(ctx);
  assert.strictEqual(ctx.response.body.success, true);
  assert.strictEqual(ctx.response.body.rev, undefined);
  assert.strictEqual(props.ssp_history_rev, '2');
});

test('history GET: rev в ответе (пустой стор → 0)', () => {
  const ctx = mkCtx({ ssp_history: '[]' });
  ep('GET', 'history').handle(ctx);
  assert.strictEqual(ctx.response.body.rev, 0);
  const ctx2 = mkCtx({ ssp_history: '[]', ssp_history_rev: '4' });
  ep('GET', 'history').handle(ctx2);
  assert.strictEqual(ctx2.response.body.rev, 4);
});

test('history action=clear: гейта нет (явная операция), rev двигается', () => {
  const props = { ssp_settings: HIST_SETTINGS, ssp_history: JSON.stringify([validSnap()]), ssp_history_rev: '9' };
  const ctx = mkCtx(props, null, { action: 'clear' });
  ep('POST', 'history').handle(ctx);
  assert.strictEqual(ctx.response.body.cleared, true);
  assert.strictEqual(ctx.response.body.rev, 10);
  assert.strictEqual(props.ssp_history, '[]');
});

/* ── releases ── */

function relRec(over) {
  return Object.assign({
    id: 'R-1', name: 'v1.0', kind: 'release', source: 'internal', status: 'planned',
    plannedDate: 1750000000000, freezeLocked: false,
    roleReps: { manager: '1-1', engineer: '1-2' }, issues: ['DEMO-1'],
  }, over || {});
}

test('releases POST: baseRev мимо → 409 + echo; совпал → запись + rev', () => {
  const props = { ssp_settings: '{}', ssp_releases: JSON.stringify({ releases: [] }), ssp_releases_rev: '3' };
  const bad = mkCtx(props, { releases: [relRec()], baseRev: 1 });
  ep('POST', 'releases').handle(bad);
  assert.strictEqual(bad.response.status, 409);
  assert.strictEqual(bad.response.body.rev, 3);
  assert.deepStrictEqual(JSON.parse(props.ssp_releases).releases, []);
  const ok = mkCtx(props, { releases: [relRec()], baseRev: 3 });
  ep('POST', 'releases').handle(ok);
  assert.strictEqual(ok.response.body.success, true);
  assert.strictEqual(ok.response.body.rev, 4);
  assert.strictEqual(JSON.parse(props.ssp_releases).releases.length, 1);
});

test('releases GET: rev в ответе', () => {
  const ctx = mkCtx({ ssp_settings: '{}', ssp_releases: JSON.stringify({ releases: [] }), ssp_releases_rev: '11' });
  ep('GET', 'releases').handle(ctx);
  assert.strictEqual(ctx.response.body.rev, 11);
});

/* ── absences ── */

test('absences POST (обёртка): baseRev мимо → 409; совпал → запись + rev', () => {
  const props = { ssp_settings: '{}', ssp_absences: '{}', ssp_absences_rev: '2' };
  const entry = { from: '2026-07-01', to: '2026-07-05', type: 'vacation' };
  const bad = mkCtx(props, { absences: { user1: [entry] }, baseRev: 1 });
  ep('POST', 'absences').handle(bad);
  assert.strictEqual(bad.response.status, 409);
  assert.strictEqual(props.ssp_absences, '{}');
  const ok = mkCtx(props, { absences: { user1: [entry] }, baseRev: 2 });
  ep('POST', 'absences').handle(ok);
  assert.strictEqual(ok.response.body.success, true);
  assert.strictEqual(ok.response.body.rev, 3);
  assert.ok(JSON.parse(props.ssp_absences).user1);
});

test('absences POST (legacy raw-map, без обёртки): лок не участвует — прежнее поведение', () => {
  const props = { ssp_settings: '{}', ssp_absences: '{}', ssp_absences_rev: '5' };
  const entry = { from: '2026-07-01', to: '2026-07-05', type: 'vacation' };
  const ctx = mkCtx(props, { user1: [entry] });
  ep('POST', 'absences').handle(ctx);
  assert.strictEqual(ctx.response.body.success, true);
  assert.strictEqual(ctx.response.body.rev, 6);   // rev двигается и на legacy-записи (как #56-4)
});

test('absences GET: rev в ответе', () => {
  const ctx = mkCtx({ ssp_settings: '{}', ssp_absences: '{}', ssp_absences_rev: '7' });
  ep('GET', 'absences').handle(ctx);
  assert.strictEqual(ctx.response.body.rev, 7);
});
