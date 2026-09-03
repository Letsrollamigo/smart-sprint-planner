'use strict';

/* #69 R3 «Лестницы» (v3.22.0 шаг 1 → v3.23.0 шаг 2) — регресс-покрытие двух строк листа корректировок.
 *
 *   Строка 21 — user-prefs (backend-userprefs.js, global-only): единый блоб предпочтений
 *               пользователя User.extensionProperties.ssp_user_prefs — allowlist ключей,
 *               cap значения/блоба, null = удалить, чужой слот недостижим (только currentUser).
 *   Строка 27, шаг 2 (v3.23.0, hard-removal после soft-deprecation v3.22.0): `items` вне
 *               ALLOWED_SPRINT_DATA_KEYS (молча отброшен), READ-fallback ssp_items снят;
 *               editingFromHistory/historyIdx и settings.migratedTo сняты с whitelist'ов —
 *               миграция 3.6.0→3.23.0 чистит на READ, silent strip кроет WRITE-пути мимо
 *               миграции (assignerSync, bulk-POST working-drafts, stale-вкладка settings/history).
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

/* ── строка 27, шаг 2: hard-removal legacy-ключей ────────────────────────── */

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

test('шаг 2: POST sprint-data с legacy `items` — ключ молча отброшен (вне ALLOWED_SPRINT_DATA_KEYS), ssp_items не пишется', () => {
  const ctx = mkProjectCtx({ items: [{ issueId: 'SCBT-1' }], sprint: sprintBody() });
  EP_SPRINT.handle(ctx);
  assert.strictEqual(ctx.response.body.success, true, JSON.stringify(ctx.response.body));
  assert.strictEqual(ctx._props.ssp_items, undefined, 'ssp_items не записан');
  assert.strictEqual(ctx.response.body.warnings, undefined, 'предупреждения шага 1 больше нет');
  assert.deepStrictEqual(ctx.response.body.saved, ['sprint']);
  assert.ok(ctx._props.ssp_sprint, 'sprint записан как обычно');
});

test('шаг 2: GET sprint-data без roleItems → {} (READ-fallback ssp_items снят)', () => {
  const EP_GET = core.ENDPOINTS.find((e) => e.method === 'GET' && e.path === 'sprint-data');
  const ctx = mkProjectCtx({}, { ssp_items: JSON.stringify([{ issueId: 'SCBT-1' }]), ssp_settings: JSON.stringify({ viewGroups: [G_EDITOR.id], activeRoles: ['analysis'] }) });
  EP_GET.handle(ctx);
  assert.strictEqual(ctx.response.body.success, true, JSON.stringify(ctx.response.body));
  assert.deepStrictEqual(ctx.response.body.roleItems, {});
});

test('шаг 2: editingFromHistory/historyIdx на WRITE молча стрипаются (прецедент gantt v6.1.0), без WARN, whitelist их не знает', () => {
  assert.ok(core.ALLOWED_SPRINT_KEYS.indexOf('editingFromHistory') < 0 && core.ALLOWED_SPRINT_KEYS.indexOf('historyIdx') < 0);
  const ctx = mkProjectCtx({ sprint: sprintBody({ editingFromHistory: false, historyIdx: 2 }) });
  EP_SPRINT.handle(ctx);
  assert.strictEqual(ctx.response.body.success, true, JSON.stringify(ctx.response.body));
  const stored = JSON.parse(ctx._props.ssp_sprint);
  assert.ok(!('editingFromHistory' in stored) && !('historyIdx' in stored), 'ключей в сторадже нет');
  assert.ok(!(stored.migrationLog || []).some((e) => e.level === 'SCHEMA_DEPRECATION_WARN'));
  assert.strictEqual(stored.pluginVersion, '3.35.0');
  /* прямой strict-валидатор без strip — отвергает как неизвестный ключ */
  assert.strictEqual(core.validateSprintForWrite(sprintBody({ historyIdx: 1 })), false);
});

test('шаг 2: assignerSync поверх хранимого спринта ≤v3.21 (editingFromHistory:false в сторадже) — проходит, ключ вычищен', () => {
  const stored = Object.assign(sprintBody({ editingFromHistory: false, historyIdx: 1 }), { pluginVersion: '3.6.0' });
  const ctx = mkProjectCtx({ sprint: { personalPlanning: { 'SCBT-1': { assignee: 'user1' } } } }, { ssp_sprint: JSON.stringify(stored) });
  ctx.request.getParameter = (k) => (k === 'action' ? 'assignerSync' : '');
  EP_SPRINT.handle(ctx);
  assert.strictEqual(ctx.response.body.success, true, JSON.stringify(ctx.response.body));
  const after = JSON.parse(ctx._props.ssp_sprint);
  assert.ok(!('editingFromHistory' in after) && !('historyIdx' in after));
  assert.deepStrictEqual(after.personalPlanning, { 'SCBT-1': { assignee: 'user1' } });
});

test('шаг 2: миграция на READ — sprint 3.6.0 с legacy-ключами → ключей нет, SCHEMA_BUMP 3.6.0→3.23.0→3.27.0→3.28.0→3.29.0→3.32.0→3.35.0', () => {
  const s = core.migrateSprintObj(Object.assign(sprintBody({ editingFromHistory: true, historyIdx: 1 }), { pluginVersion: '3.6.0' }));
  assert.ok(!('editingFromHistory' in s) && !('historyIdx' in s));
  assert.strictEqual(s.pluginVersion, '3.35.0');
  assert.deepStrictEqual(s.migrationLog.filter((e) => e.level === 'SCHEMA_BUMP').map((e) => e.fromVersion + '→' + e.toVersion), ['3.6.0→3.23.0', '3.23.0→3.27.0', '3.27.0→3.28.0', '3.28.0→3.29.0', '3.29.0→3.32.0', '3.32.0→3.35.0']);
  assert.strictEqual(core.validateSprintForWrite(s), true, 'после миграции проходит strict');
});

test('шаг 2: migratedTo снят с settings-whitelist — чистится на READ (основной блоб и history[].settings) и на WRITE', () => {
  assert.ok(core.ALLOWED_SETTINGS_KEYS.indexOf('migratedTo') < 0);
  const st = core.migrateSettingsObj({ activeRoles: ['analysis'], migratedTo: '5.3' });
  assert.ok(!('migratedTo' in st));
  const h = core.migrateHistoryArr([{ sprintId: 'S-1_analysis', roleKey: 'analysis', items: [], pluginVersion: '3.6.0',
    settings: { activeRoles: ['analysis'], migratedTo: '5.3' } }]);
  assert.ok(!('migratedTo' in h[0].settings), 'history[].settings вычищен (урок v3.6.0)');
  assert.strictEqual(core.validateHistoryForWrite(h), true);
  /* WRITE со stale-вкладки: settings с migratedTo → принимается, ключ не сохранён */
  const ctx = mkProjectCtx({ settings: { editGroups: [G_EDITOR.id], activeRoles: ['analysis'], migratedTo: '5.3' } });
  ctx.currentUser.groups = [{ id: 'g-admin', name: 'Admins' }];
  EP_SPRINT.handle(ctx);
  assert.strictEqual(ctx.response.body.success, true, JSON.stringify(ctx.response.body));
  assert.ok(!('migratedTo' in JSON.parse(ctx._props.ssp_settings)));
  /* history WRITE (confirm со stale-вкладки замораживает settings с migratedTo) */
  const EP_HISTORY = core.ENDPOINTS.find((e) => e.method === 'POST' && e.path === 'history');
  const hctx = mkProjectCtx({ history: [{ sprintId: 'S-1_analysis', name: 'Спринт', roleLabel: 'Аналитика', items: [],
    settings: { activeRoles: ['analysis'], migratedTo: '5.3' } }] });
  hctx.currentUser.groups = [G_EDITOR];
  hctx.request.getParameter = (k) => (k === 'action' ? 'snapshot' : '');
  EP_HISTORY.handle(hctx);
  assert.strictEqual(hctx.response.body.success, true, JSON.stringify(hctx.response.body));
  assert.ok(!('migratedTo' in JSON.parse(hctx._props.ssp_history)[0].settings));
});

test('шаг 2: bulk-POST working-drafts с legacy-ключами во вложенном sprint (старый/чужой драфт) — принимается, ключи вычищены', () => {
  const EP_WD = core.ENDPOINTS.find((e) => e.method === 'POST' && e.path === 'working-drafts');
  const draft = { key: 'S-1_analysis', createdAt: 1, updatedAt: 2, editorLogin: 'user1', editorTabToken: 't', baseSnapshotHash: 'h',
    sprint: sprintBody({ editingFromHistory: false, historyIdx: 0 }), items: [] };
  const ctx = mkProjectCtx({ data: { 'S-1_analysis': draft } }, { ssp_settings: JSON.stringify({ validationGroups: [G_EDITOR.id] }) });
  EP_WD.handle(ctx);
  assert.strictEqual(ctx.response.body.ok, true, JSON.stringify(ctx.response.body));
  const saved = JSON.parse(ctx._props.ssp_workdrafts)['S-1_analysis'].sprint;
  assert.ok(!('editingFromHistory' in saved) && !('historyIdx' in saved));
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
