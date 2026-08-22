'use strict';

/* #69 R3 «Лестницы» (v3.22.0) — регресс-покрытие двух строк листа корректировок.
 *
 *   Строка 21 — user-prefs (backend-userprefs.js, global-only): единый блоб предпочтений
 *               пользователя User.extensionProperties.ssp_user_prefs — allowlist ключей,
 *               cap значения/блоба, null = удалить, чужой слот недостижим (только currentUser).
 *   Строка 27, шаг 1 — soft-deprecation legacy-ключей: POST sprint-data с `items` принимается,
 *               но ssp_items НЕ пишется (warning + исключение из saved); editingFromHistory/
 *               historyIdx на WRITE принимаются с SCHEMA_DEPRECATION_WARN в migrationLog,
 *               на READ — без отметки.
 *
 * Запуск: node --test 'tests/unit/simplify-69-r3.test.js'. */

const test   = require('node:test');
const assert = require('node:assert');
const path   = require('path');
const core   = require(path.join(__dirname, '..', '..', 'backend-project.js'));
const glob   = require(path.join(__dirname, '..', '..', 'backend-global.js'));
const up     = require(path.join(__dirname, '..', '..', 'backend-userprefs.js'));

/* ── строка 21: user-prefs ───────────────────────────────────────────────── */

const EP_GET  = glob.httpHandler.endpoints.find((e) => e.method === 'GET'  && e.path === 'user-prefs');
const EP_POST = glob.httpHandler.endpoints.find((e) => e.method === 'POST' && e.path === 'user-prefs');

function mkUserCtx(body, stored, noUser) {
  const ext = { ssp_user_prefs: stored === undefined ? null : stored };
  return {
    currentUser: noUser ? null : { id: 'u-1', login: 'user1', extensionProperties: ext },
    request: { body: body === undefined ? '{}' : JSON.stringify(body), getParameter: () => '' },
    response: { status: 200, body: null, json(v) { this.body = v; } },
    _ext: ext
  };
}

test('user-prefs: оба endpoint зарегистрированы в global-handler (не в core.ENDPOINTS)', () => {
  assert.ok(EP_GET && EP_POST, 'GET/POST user-prefs в backend-global');
  assert.ok(!core.ENDPOINTS.some((e) => e.path === 'user-prefs'), 'project-scope не публикует user-prefs');
});

test('user-prefs GET: без пользователя — 403 auth_required', () => {
  const ctx = mkUserCtx(undefined, null, true);
  EP_GET.handle(ctx);
  assert.strictEqual(ctx.response.body.reason, 'auth_required');
});

test('user-prefs GET: пустой слот → {}; мусор/чужие ключи/не-строки отфильтрованы', () => {
  let ctx = mkUserCtx(undefined, null);
  EP_GET.handle(ctx);
  assert.deepStrictEqual(ctx.response.body, { success: true, prefs: {} });

  ctx = mkUserCtx(undefined, JSON.stringify({ ssp_lang: 'de', evil: 'x', ssp_sortKey: 5, __proto__: { a: 1 } }));
  EP_GET.handle(ctx);
  assert.deepStrictEqual(ctx.response.body.prefs, { ssp_lang: 'de' });

  ctx = mkUserCtx(undefined, 'not json');
  EP_GET.handle(ctx);
  assert.deepStrictEqual(ctx.response.body.prefs, {});
});

test('user-prefs POST: merge в существующий блоб, null удаляет ключ, ответ = итоговый блоб', () => {
  const ctx = mkUserCtx({ prefs: { ssp_lastActiveRole: 'testing', ssp_sortKey: null } },
    JSON.stringify({ ssp_lang: 'en', ssp_sortKey: 'id' }));
  EP_POST.handle(ctx);
  assert.strictEqual(ctx.response.body.success, true);
  assert.deepStrictEqual(ctx.response.body.prefs, { ssp_lang: 'en', ssp_lastActiveRole: 'testing' });
  assert.deepStrictEqual(JSON.parse(ctx._ext.ssp_user_prefs), { ssp_lang: 'en', ssp_lastActiveRole: 'testing' });
});

test('user-prefs POST: ключ вне allowlist / не-строка / длиннее cap → 400 invalid_prefs, слот не тронут', () => {
  for (const prefs of [{ evil: '1' }, { ssp_lang: 7 }, { ssp_lang: 'x'.repeat(9) }, { ssp_railCollapsed: '10' }]) {
    const ctx = mkUserCtx({ prefs }, JSON.stringify({ ssp_lang: 'ru' }));
    EP_POST.handle(ctx);
    assert.strictEqual(ctx.response.body.reason, 'invalid_prefs', JSON.stringify(prefs));
    assert.strictEqual(ctx._ext.ssp_user_prefs, JSON.stringify({ ssp_lang: 'ru' }), 'слот не изменён');
  }
  for (const body of [{}, { prefs: [] }, { prefs: 'x' }]) {
    const ctx = mkUserCtx(body, null);
    EP_POST.handle(ctx);
    assert.strictEqual(ctx.response.body.reason, 'invalid_prefs', JSON.stringify(body));
  }
});

test('user-prefs POST: битый JSON / без пользователя', () => {
  let ctx = mkUserCtx(undefined, null, true);
  EP_POST.handle(ctx);
  assert.strictEqual(ctx.response.body.reason, 'auth_required');
  ctx = mkUserCtx(undefined, null); ctx.request.body = '{bad';
  EP_POST.handle(ctx);
  assert.strictEqual(ctx.response.body.reason, 'invalid_json');
});

test('user-prefs: allowlist покрывает все safeLs-ключи фронта; cap блоба 2 КБ', () => {
  const keys = Object.keys(up.USER_PREFS_ALLOWED);
  for (const k of ['ssp_lang', 'ssp_lastActiveRole', 'ssp_sortKey', 'ssp_railCollapsed',
                   'ssp_allocLockHintShown', 'ssp_app_version_cache', 'ssp_last_project_key']) {
    assert.ok(keys.indexOf(k) >= 0, k);
  }
  /* mergeUserPrefs — чистая функция: sum caps < 2048 → prefs_too_large практически недостижим,
     но гейт есть (защита от будущего роста allowlist). */
  const full = {};
  keys.forEach((k) => { full[k] = 'x'.repeat(up.USER_PREFS_ALLOWED[k]); });
  assert.ok(JSON.stringify(up.mergeUserPrefs({}, full)).length <= 2048);
  assert.strictEqual(up.mergeUserPrefs({}, { ssp_lang: 'en', nope: 'x' }), null);
});

/* ── строка 27, шаг 1: soft-deprecation legacy-ключей ───────────────────── */

const EP_SPRINT = core.ENDPOINTS.find((e) => e.method === 'POST' && e.path === 'sprint-data');
const G_EDITOR  = { id: 'g-e', name: 'Editors' };

function mkProjectCtx(body, props) {
  props = Object.assign({ ssp_settings: JSON.stringify({ editGroups: [G_EDITOR.id] }) }, props || {});
  return {
    settings: { settingsManagerGroup: { id: 'g-admin', name: 'Admins' } },
    project: { key: 'SCBT', extensionProperties: props },
    currentUser: { id: 'u-1', login: 'user1', groups: [G_EDITOR], hasPermission: () => false },
    request: { body: JSON.stringify(body), getParameter: () => '' },
    response: { status: 200, body: null, json(v) { this.body = v; } },
    _props: props
  };
}

function sprintBody(over) {
  return Object.assign({
    sprintId: 'S-1', name: 'Спринт', status: 'PLANNING',
    dateStart: 1779148800000, dateEnd: 1780358400000,
    updatedBy: 'user1', updatedAt: 1779148800000, personalPlanning: {}
  }, over || {});
}

test('шаг 1: POST sprint-data с legacy `items` — принимается, ssp_items НЕ пишется, warning + нет в saved', () => {
  const ctx = mkProjectCtx({ items: [{ issueId: 'SCBT-1' }], sprint: sprintBody() });
  EP_SPRINT.handle(ctx);
  assert.strictEqual(ctx.response.body.success, true, JSON.stringify(ctx.response.body));
  assert.strictEqual(ctx._props.ssp_items, undefined, 'ssp_items не записан');
  assert.ok(ctx.response.body.warnings.indexOf('deprecated:items_ignored') >= 0);
  assert.deepStrictEqual(ctx.response.body.saved, ['sprint']);
  assert.ok(ctx._props.ssp_sprint, 'sprint записан как обычно');
});

test('шаг 1: editingFromHistory/historyIdx на WRITE принимаются, но помечаются SCHEMA_DEPRECATION_WARN', () => {
  const ctx = mkProjectCtx({ sprint: sprintBody({ editingFromHistory: false, historyIdx: 2 }) });
  EP_SPRINT.handle(ctx);
  assert.strictEqual(ctx.response.body.success, true, JSON.stringify(ctx.response.body));
  const stored = JSON.parse(ctx._props.ssp_sprint);
  const warns = (stored.migrationLog || []).filter((e) => e.level === 'SCHEMA_DEPRECATION_WARN').map((e) => e.key).sort();
  assert.deepStrictEqual(warns, ['editingFromHistory', 'historyIdx']);
  assert.strictEqual(stored.editingFromHistory, false, 'шаг 1: ключ ещё хранится (delete — шаг 2)');
});

test('шаг 1: validateSprintForRead не помечает deprecated-ключи (только strict/WRITE)', () => {
  const s = sprintBody({ editingFromHistory: true, historyIdx: 1 });
  assert.strictEqual(core.validateSprintForRead(s), true);
  assert.ok(!(s.migrationLog || []).some((e) => e.level === 'SCHEMA_DEPRECATION_WARN'));
  const w = sprintBody();
  assert.strictEqual(core.validateSprintForWrite(w), true);
  assert.ok(!(w.migrationLog || []).length, 'без legacy-ключей записей нет');
});

/* ── строка 21: фронтовый стор infra/user-prefs.js (без localStorage = прод YT 2025.3) ── */

const prefs = require(path.join(__dirname, '..', '..', 'widgets', 'main', 'src', 'infra', 'user-prefs.js'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function mkHost(stored) {
  const calls = [];
  return {
    calls,
    fetchApp(p, opts) {
      calls.push({ path: p, method: (opts && opts.method) || 'GET', body: opts && opts.body });
      if (opts && opts.method === 'POST') return Promise.resolve({ success: true, prefs: opts.body.prefs });
      return Promise.resolve({ success: true, prefs: stored });
    }
  };
}

test('user-prefs store: до load get → null (localStorage мёртв); после load — серверное значение', async () => {
  assert.strictEqual(prefs.get('ssp_lang'), null);
  const host = mkHost({ ssp_lang: 'de', ssp_lastActiveRole: 'qa' });
  const deps = { getHost: () => host, diag: () => {} };
  await prefs.load(deps);
  assert.strictEqual(prefs.get('ssp_lang'), 'de');
  assert.strictEqual(prefs.get('ssp_lastActiveRole'), 'qa');
  assert.strictEqual(prefs.get('ssp_sortKey'), null);
  assert.strictEqual(host.calls.length, 1, 'только GET');
});

test('user-prefs store: set → один debounce-POST с батчем изменившихся ключей; то же значение — без POST', async () => {
  const host = mkHost({ ssp_lang: 'de' });
  const deps = { getHost: () => host, diag: () => {} };
  await prefs.load(deps);
  host.calls.length = 0;
  prefs.set('ssp_lang', 'de', deps);            /* гейт «то же значение» */
  await sleep(500);
  assert.strictEqual(host.calls.length, 0, 'повтор того же значения не шлётся');
  prefs.set('ssp_lang', 'en', deps);
  prefs.set('ssp_sortKey', 'id', deps);
  prefs.del('ssp_lastActiveRole', deps);
  assert.strictEqual(prefs.get('ssp_lang'), 'en', 'кэш обновлён сразу');
  await sleep(500);
  assert.strictEqual(host.calls.length, 1, 'один POST на батч');
  assert.strictEqual(host.calls[0].method, 'POST');
  assert.strictEqual(host.calls[0].path, 'backend-global/user-prefs');
  assert.deepStrictEqual(host.calls[0].body, { prefs: { ssp_lang: 'en', ssp_sortKey: 'id', ssp_lastActiveRole: null } });
});

test('user-prefs store: set до хоста не теряется — доливается после load', async () => {
  const deps0 = { getHost: () => null, diag: () => {} };
  prefs.set('ssp_railCollapsed', '1', deps0);
  await sleep(500);
  const host = mkHost({ ssp_railCollapsed: '0', ssp_lang: 'ru' });
  const deps = { getHost: () => host, diag: () => {} };
  await prefs.load(deps);
  assert.strictEqual(prefs.get('ssp_railCollapsed'), '1', 'локальное изменение приоритетнее серверного');
  assert.strictEqual(prefs.get('ssp_lang'), 'ru');
  const post = host.calls.find((c) => c.method === 'POST');
  assert.ok(post && post.body.prefs.ssp_railCollapsed === '1', 'dirty-ключ долит POST\'ом');
});
