'use strict';

/* #67 — authz-аудит 2026-08-19, регресс-покрытие фиксов v3.17.0.
 * Прогон ПРОД-КЛАССОВ (backend-project.js → core.ENDPOINTS) с mock-ctx —
 * репро-таблицы из доклада Spec/AUTHZ_AUDIT_67.md выполняются как тесты.
 *
 *   H1 — очистка истории основной веткой (POST {"history":[]}) требует historyManager,
 *        как и ?action=clear: гейт по эффекту, а не по имени параметра.
 *   H2 — ?action=validate больше не снимает editor-гейт со сброса слота (sprint:null).
 *   H4 — editorLogin рабочей копии выводится из хранилища, клиентскому не верим.
 *   H6 — assignerSync с sprintId из цепочки прототипов не роняет handler.
 *
 * Запуск: node --test 'tests/unit/authz-67.test.js'. */

const test   = require('node:test');
const assert = require('node:assert');
const path   = require('path');
const core   = require(path.join(__dirname, '..', '..', 'backend-project.js'));

const EP_HISTORY = core.ENDPOINTS.find((e) => e.method === 'POST' && e.path === 'history');
const EP_SPRINT  = core.ENDPOINTS.find((e) => e.method === 'POST' && e.path === 'sprint-data');
const EP_DRAFTS  = core.ENDPOINTS.find((e) => e.method === 'POST' && e.path === 'working-drafts');

const G_VALIDATOR = { id: 'g-v',    name: 'Validators' };
const G_EDITOR    = { id: 'g-e',    name: 'Editors' };
const G_HIST      = { id: 'g-hist', name: 'History Cleaners' };

/* Роли: перечень групп пользователя. Плагин настроен всегда (иначе authzGuard
   отвечает plugin_not_configured до ролевой проверки). */
function mkCtx(opts) {
  opts = opts || {};
  const props = Object.assign({
    ssp_settings: JSON.stringify({
      validationGroups:   [G_VALIDATOR.id],
      editGroups:         [G_EDITOR.id],
      historyClearGroups: [G_HIST.id]
    })
  }, opts.props || {});
  const params = opts.params || {};
  return {
    settings: { settingsManagerGroup: { id: 'g-admin', name: 'Admins' } },
    currentUser: {
      id: 'u-1', login: opts.login || 'user1', groups: opts.groups || [],
      hasPermission: opts.instanceAdmin ? function () { return true; } : function () { return false; }
    },
    project: { extensionProperties: props },
    request: {
      body: opts.body === undefined ? '{}' : JSON.stringify(opts.body),
      getParameter: (k) => (params[k] || '')
    },
    response: { status: 200, body: null, json(v) { this.body = v; } },
    _props: props
  };
}

function snap(sprintId) {
  return { sprintId: sprintId, name: 'Спринт ' + sprintId, roleLabel: 'Аналитика', items: [] };
}
function seedHistory(n) {
  const arr = [];
  for (let i = 1; i <= n; i++) arr.push(snap('s-' + i));
  return JSON.stringify(arr);
}
function storedLen(ctx) {
  return JSON.parse(ctx._props.ssp_history || '[]').length;
}

/* ── H1: репро-таблица доклада ─────────────────────────────────────────────── */

test('H1: POST history {"history":[]} под validator — 403, история цела', () => {
  const ctx = mkCtx({ groups: [G_VALIDATOR], body: { history: [] }, props: { ssp_history: seedHistory(3) } });
  EP_HISTORY.handle(ctx);
  assert.strictEqual(ctx.response.status, 403);
  assert.strictEqual(ctx.response.body.reason, 'history_manager_rights_required');
  assert.strictEqual(storedLen(ctx), 3);
});

test('H1: POST history {"history":[]} под инстанс-админом вне группы очистки — 403 (замок #66 держит и здесь)', () => {
  const ctx = mkCtx({ instanceAdmin: true, body: { history: [] }, props: { ssp_history: seedHistory(3) } });
  EP_HISTORY.handle(ctx);
  assert.strictEqual(ctx.response.status, 403);
  assert.strictEqual(storedLen(ctx), 3);
});

test('H1: POST history {"history":[]} под historyManager — 200, история очищена', () => {
  const ctx = mkCtx({ groups: [G_VALIDATOR, G_HIST], body: { history: [] }, props: { ssp_history: seedHistory(3) } });
  EP_HISTORY.handle(ctx);
  assert.strictEqual(ctx.response.body.success, true);
  assert.strictEqual(storedLen(ctx), 0);
});

test('H1: ?action=clear под validator — 403 (регресс #66)', () => {
  const ctx = mkCtx({ groups: [G_VALIDATOR], params: { action: 'clear' }, props: { ssp_history: seedHistory(3) } });
  EP_HISTORY.handle(ctx);
  assert.strictEqual(ctx.response.status, 403);
  assert.strictEqual(storedLen(ctx), 3);
});

/* Порог: −1 запись = штатная корзина (splice + перезапись), право валидатора. */
test('H1 порог: удаление одной записи под validator проходит', () => {
  const ctx = mkCtx({ groups: [G_VALIDATOR], body: { history: [snap('s-1'), snap('s-2')] },
                      props: { ssp_history: seedHistory(3) } });
  EP_HISTORY.handle(ctx);
  assert.strictEqual(ctx.response.body.success, true);
  assert.strictEqual(storedLen(ctx), 2);
});

test('H1 порог: удаление последней (единственной) записи под validator проходит', () => {
  const ctx = mkCtx({ groups: [G_VALIDATOR], body: { history: [] }, props: { ssp_history: seedHistory(1) } });
  EP_HISTORY.handle(ctx);
  assert.strictEqual(ctx.response.body.success, true);
  assert.strictEqual(storedLen(ctx), 0);
});

test('H1 порог: усечение на две записи под validator — 403', () => {
  const ctx = mkCtx({ groups: [G_VALIDATOR], body: { history: [snap('s-1')] },
                      props: { ssp_history: seedHistory(3) } });
  EP_HISTORY.handle(ctx);
  assert.strictEqual(ctx.response.status, 403);
  assert.strictEqual(storedLen(ctx), 3);
});

test('H1: рост истории (авто-снапшот) под validator не задет', () => {
  const ctx = mkCtx({ groups: [G_VALIDATOR], body: { history: [snap('s-1'), snap('s-2'), snap('s-3'), snap('s-4')] },
                      props: { ssp_history: seedHistory(3) } });
  EP_HISTORY.handle(ctx);
  assert.strictEqual(ctx.response.body.success, true);
  assert.strictEqual(storedLen(ctx), 4);
});

test('H1: первая запись в пустую историю под validator не задета', () => {
  const ctx = mkCtx({ groups: [G_VALIDATOR], body: { history: [snap('s-1')] } });
  EP_HISTORY.handle(ctx);
  assert.strictEqual(ctx.response.body.success, true);
  assert.strictEqual(storedLen(ctx), 1);
});

/* ── H2: сброс слота под ?action=validate ─────────────────────────────────── */

test('H2: sprint:null под validator без editor — 403, слот цел', () => {
  const ctx = mkCtx({ groups: [G_VALIDATOR], body: { sprint: null }, params: { action: 'validate' },
                      props: { ssp_sprint: JSON.stringify({ sprintId: 's-1', name: 'Спринт 1' }) } });
  EP_SPRINT.handle(ctx);
  assert.strictEqual(ctx.response.status, 403);
  assert.strictEqual(ctx.response.body.reason, 'editor_rights_required');
  assert.notStrictEqual(ctx._props.ssp_sprint, '');
});

test('H2: sprint:null под editor — 200, слот сброшен (штатный путь UI не сломан)', () => {
  const ctx = mkCtx({ groups: [G_EDITOR], body: { sprint: null },
                      props: { ssp_sprint: JSON.stringify({ sprintId: 's-1', name: 'Спринт 1' }) } });
  EP_SPRINT.handle(ctx);
  assert.strictEqual(ctx.response.body.success, true);
  assert.strictEqual(ctx._props.ssp_sprint, '');
});

/* ── H4: editorLogin — серверное значение, клиентскому не верим ───────────── */

function draft(over) {
  return Object.assign({
    key: 'k-1', createdAt: 1750000000000, updatedAt: 1750000000000,
    baseSnapshotHash: 'h1', editorTabToken: 't1', editorLogin: 'user1'
  }, over || {});
}
function storedDrafts(ctx) { return JSON.parse(ctx._props.ssp_workdrafts || '{}'); }

test('H4: новая запись штампуется логином пишущего, клиентский логин отброшен', () => {
  const ctx = mkCtx({ groups: [G_VALIDATOR], body: { data: { 'k-1': draft({ editorLogin: 'victim' }) } } });
  EP_DRAFTS.handle(ctx);
  assert.strictEqual(ctx.response.body.ok, true);
  assert.strictEqual(storedDrafts(ctx)['k-1'].editorLogin, 'user1');
});

test('H4: своя существующая запись — чужой логин из тела не персистится (была персистентная блокировка правки)', () => {
  const ctx = mkCtx({ groups: [G_VALIDATOR], body: { data: { 'k-1': draft({ editorLogin: 'victim' }) } },
                      props: { ssp_workdrafts: JSON.stringify({ 'k-1': draft({ editorLogin: 'user1' }) }) } });
  EP_DRAFTS.handle(ctx);
  assert.strictEqual(ctx.response.body.ok, true);   /* не ложно-зелёный: запись прошла, значение серверное */
  assert.strictEqual(storedDrafts(ctx)['k-1'].editorLogin, 'user1');
});

test('H4: editorLogin:null из тела не делает запись бесхозной', () => {
  const ctx = mkCtx({ groups: [G_VALIDATOR], body: { data: { 'k-1': draft({ editorLogin: null }) } },
                      props: { ssp_workdrafts: JSON.stringify({ 'k-1': draft({ editorLogin: 'user1' }) }) } });
  EP_DRAFTS.handle(ctx);
  assert.strictEqual(ctx.response.body.ok, true);   /* не ложно-зелёный: запись прошла, значение серверное */
  assert.strictEqual(storedDrafts(ctx)['k-1'].editorLogin, 'user1');
});

test('H4: бесхозная запись (editorLogin пуст в хранилище) — владение забирает пишущий', () => {
  const ctx = mkCtx({ groups: [G_VALIDATOR], body: { data: { 'k-1': draft({ editorLogin: null }) } },
                      props: { ssp_workdrafts: JSON.stringify({ 'k-1': draft({ editorLogin: null }) }) } });
  EP_DRAFTS.handle(ctx);
  assert.strictEqual(ctx.response.body.ok, true);   /* не ложно-зелёный: запись прошла, значение серверное */
  assert.strictEqual(storedDrafts(ctx)['k-1'].editorLogin, 'user1');
});

test('H4: bulk-flush админа настроек НЕ переназначает владельца чужой рабочей копии', () => {
  const ctx = mkCtx({ instanceAdmin: true, login: 'admin',
                      body: { data: { 'k-1': draft({ editorLogin: 'owner' }) } },
                      props: { ssp_workdrafts: JSON.stringify({ 'k-1': draft({ editorLogin: 'owner' }) }) } });
  EP_DRAFTS.handle(ctx);
  assert.strictEqual(ctx.response.body.ok, true);
  assert.strictEqual(storedDrafts(ctx)['k-1'].editorLogin, 'owner');
});

/* ── H6: assignerSync и цепочка прототипов ────────────────────────────────── */

test('H6: sprintId="__proto__" в assignerSync не роняет handler', () => {
  const ctx = mkCtx({ groups: [G_EDITOR], params: { action: 'assignerSync' },
                      body: { history: [{ sprintId: '__proto__', personalPlanning: {} }] },
                      props: { ssp_history: seedHistory(2) } });
  assert.doesNotThrow(() => EP_HISTORY.handle(ctx));
  assert.strictEqual(ctx.response.body.success, true);
  assert.strictEqual(storedLen(ctx), 2);
});
