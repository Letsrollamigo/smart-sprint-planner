'use strict';

/* #67 остаток (v3.18.0) — регресс-покрытие H5 + уровня 3 + серверного обогащения (путь 3).
 * Дизайн: Integrations/AUTHZ_HARDENING_67.md (решения владельца ⚖ 2026-08-20).
 *
 *   H5-mirror — validator сбрасывает слот {sprint:null, roleItems:{}} (реальный payload
 *               history-view) через псевдороль editorOrValidator; без ролей — 403.
 *   H5-editor — POST /history?action=snapshot: upsert одной записи по sprintId под
 *               editor∨validator; удалений нет; 409 на baseRev-конфликт.
 *   H7        — update-issue-field: fieldName вне настроенных полей → 400.
 *   H8        — серверные аудит-штампы confirmedBy/finishedBy/revisions[].by + sprint.updatedBy.
 *   Путь 3    — обогащение «дополняем только пустое»: title наполняется, непустой не
 *               трогается, чужой проект/невидимая пропускаются, лимит 200 → skipped.
 *
 * Запуск: node --test 'tests/unit/authz-67-remainder.test.js'. */

const test   = require('node:test');
const assert = require('node:assert');
const path   = require('path');
const core   = require(path.join(__dirname, '..', '..', 'backend-project.js'));
const entities = require('@jetbrains/youtrack-scripting-api/entities');

const EP_HISTORY = core.ENDPOINTS.find((e) => e.method === 'POST' && e.path === 'history');
const EP_SPRINT  = core.ENDPOINTS.find((e) => e.method === 'POST' && e.path === 'sprint-data');
const EP_UPDATE  = core.ENDPOINTS.find((e) => e.method === 'POST' && e.path === 'update-issue-field');

const G_VALIDATOR = { id: 'g-v', name: 'Validators' };
const G_EDITOR    = { id: 'g-e', name: 'Editors' };

function mkCtx(opts) {
  opts = opts || {};
  const props = Object.assign({
    ssp_settings: JSON.stringify(Object.assign({
      validationGroups: [G_VALIDATOR.id],
      editGroups:       [G_EDITOR.id]
    }, opts.settings || {}))
  }, opts.props || {});
  const params = opts.params || {};
  return {
    settings: { settingsManagerGroup: { id: 'g-admin', name: 'Admins' } },
    project: { key: 'DEMO', extensionProperties: props },
    currentUser: {
      id: 'u-1', login: opts.login || 'user1', fullName: opts.fullName || undefined,
      groups: opts.groups || [],
      hasPermission: function () { return false; }
    },
    request: {
      body: opts.body === undefined ? '{}' : JSON.stringify(opts.body),
      getParameter: (k) => (params[k] || '')
    },
    response: { status: 200, body: null, json(v) { this.body = v; } },
    _props: props
  };
}

function snap(sprintId, over) {
  return Object.assign({ sprintId: sprintId, name: 'Спринт ' + sprintId, roleLabel: 'Аналитика', items: [] }, over || {});
}
function storedHistory(ctx) { return JSON.parse(ctx._props.ssp_history || '[]'); }

/* ── H5-mirror: сброс слота под validator ─────────────────────────────────── */

test('H5-mirror: validator, реальный payload UI {sprint:null, roleItems:{}} — 200, оба слота сброшены', () => {
  const ctx = mkCtx({ groups: [G_VALIDATOR],
                      body: { sprint: null, roleItems: {} },
                      props: { ssp_sprint: JSON.stringify({ sprintId: 's-1', name: 'Спринт 1' }),
                               ssp_roleitems: JSON.stringify({ analysis: [] }) } });
  EP_SPRINT.handle(ctx);
  assert.strictEqual(ctx.response.body.success, true);
  assert.strictEqual(ctx._props.ssp_sprint, '');
  assert.strictEqual(ctx._props.ssp_roleitems, '{}');
});

test('H5-mirror: без ролей {sprint:null, roleItems:{}} — 403, слот цел', () => {
  const ctx = mkCtx({ groups: [],
                      body: { sprint: null, roleItems: {} },
                      props: { ssp_sprint: JSON.stringify({ sprintId: 's-1', name: 'Спринт 1' }) } });
  EP_SPRINT.handle(ctx);
  assert.strictEqual(ctx.response.status, 403);
  assert.notStrictEqual(ctx._props.ssp_sprint, '');
});

test('H5-mirror: editor по-прежнему сбрасывает слот (штатный путь не задет)', () => {
  const ctx = mkCtx({ groups: [G_EDITOR],
                      body: { sprint: null, roleItems: {} },
                      props: { ssp_sprint: JSON.stringify({ sprintId: 's-1', name: 'Спринт 1' }) } });
  EP_SPRINT.handle(ctx);
  assert.strictEqual(ctx.response.body.success, true);
  assert.strictEqual(ctx._props.ssp_sprint, '');
});

test('H5-mirror: расширение НЕ эскалирует обычную запись — validator без editor не пишет sprint-объект вне validate', () => {
  const ctx = mkCtx({ groups: [G_VALIDATOR],
                      body: { sprint: { sprintId: 's-2', name: 'Спринт 2' } } });
  EP_SPRINT.handle(ctx);
  assert.strictEqual(ctx.response.status, 403);
});

/* ── H5-editor: POST /history?action=snapshot ─────────────────────────────── */

test('snapshot: editor-без-validator вставляет новую запись — 200, запись в голове', () => {
  const ctx = mkCtx({ groups: [G_EDITOR], params: { action: 'snapshot' },
                      body: { history: [snap('s-9')] },
                      props: { ssp_history: JSON.stringify([snap('s-1'), snap('s-2')]) } });
  EP_HISTORY.handle(ctx);
  assert.strictEqual(ctx.response.body.success, true);
  assert.strictEqual(ctx.response.body.action, 'snapshot');
  const h = storedHistory(ctx);
  assert.strictEqual(h.length, 3);
  assert.strictEqual(h[0].sprintId, 's-9');
});

test('snapshot: validator тоже может (editorOrValidator)', () => {
  const ctx = mkCtx({ groups: [G_VALIDATOR], params: { action: 'snapshot' },
                      body: { history: [snap('s-9')] } });
  EP_HISTORY.handle(ctx);
  assert.strictEqual(ctx.response.body.success, true);
});

test('snapshot: замена существующей записи по sprintId — чужие целы, длина та же', () => {
  const ctx = mkCtx({ groups: [G_EDITOR], params: { action: 'snapshot' },
                      body: { history: [snap('s-2', { name: 'Обновлённый' })] },
                      props: { ssp_history: JSON.stringify([snap('s-1'), snap('s-2'), snap('s-3')]) } });
  EP_HISTORY.handle(ctx);
  assert.strictEqual(ctx.response.body.success, true);
  const h = storedHistory(ctx);
  assert.strictEqual(h.length, 3);
  assert.strictEqual(h.find((r) => r.sprintId === 's-2').name, 'Обновлённый');
  assert.strictEqual(h.find((r) => r.sprintId === 's-1').name, 'Спринт s-1');
});

test('snapshot: без ролей — 403, история цела', () => {
  const ctx = mkCtx({ groups: [], params: { action: 'snapshot' },
                      body: { history: [snap('s-9')] },
                      props: { ssp_history: JSON.stringify([snap('s-1')]) } });
  EP_HISTORY.handle(ctx);
  assert.strictEqual(ctx.response.status, 403);
  assert.strictEqual(storedHistory(ctx).length, 1);
});

test('snapshot: две записи в теле — 400 (контракт: ровно одна)', () => {
  const ctx = mkCtx({ groups: [G_EDITOR], params: { action: 'snapshot' },
                      body: { history: [snap('s-1'), snap('s-2')] } });
  EP_HISTORY.handle(ctx);
  assert.strictEqual(ctx.response.body.reason, 'invalid_snapshot_body');
});

test('snapshot: baseRev-конфликт — 409, история цела', () => {
  const ctx = mkCtx({ groups: [G_EDITOR], params: { action: 'snapshot' },
                      body: { history: [snap('s-9')], baseRev: 1 },
                      props: { ssp_history: JSON.stringify([snap('s-1')]), ssp_history_rev: '5' } });
  EP_HISTORY.handle(ctx);
  assert.strictEqual(ctx.response.status, 409);
  assert.strictEqual(ctx.response.body.error, 'rev_conflict');
  assert.strictEqual(storedHistory(ctx).length, 1);
});

/* ── H7: allow-list fieldName в update-issue-field ────────────────────────── */

test('H7: fieldName вне настроенных полей — 400 field_not_whitelisted', () => {
  const ctx = mkCtx({ groups: [G_EDITOR],
                      settings: { fieldPriority: 'Priority' },
                      body: { issueId: 'DEMO-1', fieldName: 'Секретное поле', value: 'x', type: 'enum' } });
  EP_UPDATE.handle(ctx);
  assert.strictEqual(ctx.response.body.reason, 'field_not_whitelisted');
});

test('H7: настроенное поле проходит гейт (доходит до платформы)', () => {
  const orig = entities.Issue.findById;
  entities.Issue.findById = () => null;   /* останавливаемся сразу после гейта */
  try {
    const ctx = mkCtx({ groups: [G_EDITOR],
                        settings: { fieldPriority: 'Priority' },
                        body: { issueId: 'DEMO-1', fieldName: 'Priority', value: 'x', type: 'enum' } });
    EP_UPDATE.handle(ctx);
    assert.strictEqual(ctx.response.body.error, 'issue_not_found');   /* гейт пройден */
  } finally { entities.Issue.findById = orig; }
});

test('H7: фолбэк релизного state-поля — "State" разрешён при пустом fieldState (release-controller.js:603)', () => {
  const orig = entities.Issue.findById;
  entities.Issue.findById = () => null;
  try {
    const ctx = mkCtx({ groups: [G_EDITOR],
                        body: { issueId: 'DEMO-1', fieldName: 'State', value: 'In Progress', type: 'state' } });
    EP_UPDATE.handle(ctx);
    assert.strictEqual(ctx.response.body.error, 'issue_not_found');   /* гейт пройден */
  } finally { entities.Issue.findById = orig; }
});

/* ── H8: серверные аудит-штампы ───────────────────────────────────────────── */

test('H8: подменённый confirmedBy существующей записи штампуется автором запроса', () => {
  const stored = snap('s-1', { confirmedBy: 'Настоящий Валидатор', confirmedAt: 1000 });
  const tampered = snap('s-1', { confirmedBy: 'Подставной', confirmedAt: 1000 });
  const ctx = mkCtx({ groups: [G_VALIDATOR], login: 'user1', fullName: 'Юзер Первый',
                      body: { history: [tampered] },
                      props: { ssp_history: JSON.stringify([stored]) } });
  EP_HISTORY.handle(ctx);
  assert.strictEqual(ctx.response.body.success, true);
  assert.strictEqual(storedHistory(ctx)[0].confirmedBy, 'Юзер Первый');
});

test('H8: неизменённый confirmedBy сохраняется (запись не менялась — чужая атрибуция цела)', () => {
  const stored = snap('s-1', { confirmedBy: 'Настоящий Валидатор', confirmedAt: 1000 });
  const ctx = mkCtx({ groups: [G_VALIDATOR], login: 'user1',
                      body: { history: [snap('s-1', { confirmedBy: 'Настоящий Валидатор', confirmedAt: 1000 })] },
                      props: { ssp_history: JSON.stringify([stored]) } });
  EP_HISTORY.handle(ctx);
  assert.strictEqual(ctx.response.body.success, true);
  assert.strictEqual(storedHistory(ctx)[0].confirmedBy, 'Настоящий Валидатор');
});

test('H8: новая ревизия с чужим by штампуется логином автора; существующая тройка цела', () => {
  const oldRev = { at: 1000, by: 'olduser', level: 'CONFIRMED_REVAL' };
  const stored = snap('s-1', { revisions: [oldRev] });
  const next   = snap('s-1', { revisions: [oldRev, { at: 2000, by: 'victim', level: 'META_ONLY' }] });
  const ctx = mkCtx({ groups: [G_VALIDATOR], login: 'user1',
                      body: { history: [next] },
                      props: { ssp_history: JSON.stringify([stored]) } });
  EP_HISTORY.handle(ctx);
  assert.strictEqual(ctx.response.body.success, true);
  const revs = storedHistory(ctx)[0].revisions;
  assert.strictEqual(revs[0].by, 'olduser');
  assert.strictEqual(revs[1].by, 'user1');
});

test('H8: snapshot-ветка штампует confirmedBy новой записи', () => {
  const ctx = mkCtx({ groups: [G_EDITOR], login: 'user1', params: { action: 'snapshot' },
                      body: { history: [snap('s-9', { confirmedBy: 'Подставной', confirmedAt: 1000 })] } });
  EP_HISTORY.handle(ctx);
  assert.strictEqual(ctx.response.body.success, true);
  assert.strictEqual(storedHistory(ctx)[0].confirmedBy, 'user1');
});

test('H8: sprint.updatedBy штампуется сервером (клиентскому не верим)', () => {
  const ctx = mkCtx({ groups: [G_EDITOR], login: 'user1',
                      body: { sprint: { sprintId: 's-1', name: 'Спринт 1', updatedBy: 'victim', updatedAt: 1 } } });
  EP_SPRINT.handle(ctx);
  assert.strictEqual(ctx.response.body.success, true);
  const sp = JSON.parse(ctx._props.ssp_sprint);
  assert.strictEqual(sp.updatedBy, 'user1');
  assert.ok(sp.updatedAt > 1);
});

test('H8: import-replace НЕ штампует (восстановление бэкапа сохраняет атрибуцию)', () => {
  const ctx = mkCtx({ groups: [G_VALIDATOR], params: { action: 'import-replace' },
                      props: { ssp_settings: JSON.stringify({
                        validationGroups: [G_VALIDATOR.id], editGroups: [G_EDITOR.id],
                        historyClearGroups: [G_VALIDATOR.id] }) },
                      body: { history: [snap('s-1', { confirmedBy: 'Исходный Автор', confirmedAt: 1000 })] } });
  EP_HISTORY.handle(ctx);
  assert.strictEqual(ctx.response.body.success, true);
  assert.strictEqual(storedHistory(ctx)[0].confirmedBy, 'Исходный Автор');
});

/* ── H11: cap тела filter-planner-projects ────────────────────────────────── */

const glob = require(path.join(__dirname, '..', '..', 'backend-global.js'));
const EP_FILTER = glob.httpHandler.endpoints.find((e) => e.method === 'POST' && e.path === 'filter-planner-projects');

function mkGlobalCtx(body) {
  return {
    currentUser: { id: 'u-1', login: 'user1' },
    request: { body: body, getParameter: () => '' },
    response: { status: 200, body: null, json(v) { this.body = v; } }
  };
}

test('H11: тело больше 256 КБ — too_large (cap внутри getBody, не pre-read: тело read-once)', () => {
  const big = JSON.stringify({ keys: ['X'.repeat(300000)] });
  const ctx = mkGlobalCtx(big);
  EP_FILTER.handle(ctx);
  assert.strictEqual(ctx.response.body.reason, 'too_large');
});

test('H11: обычное тело picker\'а проходит cap и доходит до логики ключей', () => {
  const ctx = mkGlobalCtx(JSON.stringify({ keys: 'not-an-array' }));
  EP_FILTER.handle(ctx);
  assert.strictEqual(ctx.response.body.reason, 'invalid_keys');   /* cap пройден */
});

/* ── Путь 3: серверное обогащение состава ─────────────────────────────────── */

function mkIssue(over) {
  return Object.assign({
    summary: 'Реальное название задачи',
    project: { key: 'DEMO' },
    isVisibleTo: () => true,
    fields: {}
  }, over || {});
}
function item(over) {
  return Object.assign({ issueId: 'DEMO-1', addedAt: 1750000000000 }, over || {});
}
function postRoleItems(ctx) { EP_SPRINT.handle(ctx); return JSON.parse(ctx._props.ssp_roleitems || '{}'); }

test('обогащение: пустой title наполняется из summary; настроенные поля дополняются', () => {
  const orig = entities.Issue.findById;
  entities.Issue.findById = () => mkIssue({ fields: {
    'Состояние': { name: 'In Progress', localizedName: 'В работе', color: { background: '#eee', foreground: '#111' } },
    'Priority': { name: 'Critical' } } });
  try {
    const ctx = mkCtx({ groups: [G_EDITOR],
                        settings: { fieldState: 'Состояние', fieldPriority: 'Priority' },
                        body: { roleItems: { analysis: [item()] } } });
    const ri = postRoleItems(ctx);
    assert.strictEqual(ctx.response.body.success, true);
    assert.deepStrictEqual(ctx.response.body.enriched, { count: 1, skipped: 0 });
    const it = ri.analysis[0];
    assert.strictEqual(it.title, 'Реальное название задачи');
    assert.strictEqual(it.state, 'In Progress');
    assert.strictEqual(it.stateLocalized, 'В работе');
    assert.deepStrictEqual(it.stateColor, { background: '#eee', foreground: '#111' });
    assert.strictEqual(it.priority, 'Critical');
  } finally { entities.Issue.findById = orig; }
});

test('обогащение: непустой title НЕ трогается, платформа НЕ дёргается (главный инвариант виджетного пути)', () => {
  const orig = entities.Issue.findById;
  let calls = 0;
  entities.Issue.findById = () => { calls++; return mkIssue(); };
  try {
    const ctx = mkCtx({ groups: [G_EDITOR],
                        body: { roleItems: { analysis: [item({ title: 'Правка тимлида', state: 'Open' })] } } });
    const ri = postRoleItems(ctx);
    assert.strictEqual(ctx.response.body.success, true);
    assert.strictEqual(ctx.response.body.enriched, undefined);   /* ответ побайтово прежний */
    assert.strictEqual(calls, 0);
    assert.strictEqual(ri.analysis[0].title, 'Правка тимлида');
  } finally { entities.Issue.findById = orig; }
});

test('обогащение: задача чужого проекта пропускается (изоляция v3.2.1)', () => {
  const orig = entities.Issue.findById;
  entities.Issue.findById = () => mkIssue({ project: { key: 'OTHER' } });
  try {
    const ctx = mkCtx({ groups: [G_EDITOR], body: { roleItems: { analysis: [item()] } } });
    const ri = postRoleItems(ctx);
    assert.strictEqual(ctx.response.body.success, true);
    assert.strictEqual(ctx.response.body.enriched, undefined);
    assert.strictEqual(ri.analysis[0].title, undefined);
  } finally { entities.Issue.findById = orig; }
});

test('обогащение: невидимая задача не обогащается и неотличима от несуществующей (без оракула)', () => {
  const orig = entities.Issue.findById;
  entities.Issue.findById = (id) => (id === 'DEMO-1'
    ? mkIssue({ isVisibleTo: () => false })   /* скрытая Visible to */
    : null);                                  /* несуществующая */
  try {
    const ctx = mkCtx({ groups: [G_EDITOR],
                        body: { roleItems: { analysis: [item(), item({ issueId: 'DEMO-404' })] } } });
    const ri = postRoleItems(ctx);
    assert.strictEqual(ctx.response.body.success, true);
    assert.strictEqual(ctx.response.body.enriched, undefined);   /* обе не считаются нигде */
    assert.strictEqual(ri.analysis[0].title, undefined);
    assert.strictEqual(ri.analysis[1].title, undefined);
  } finally { entities.Issue.findById = orig; }
});

test('обогащение: лимит 200 — частичное обогащение + счётчик skipped, хвост сохраняется как пришёл', () => {
  const orig = entities.Issue.findById;
  entities.Issue.findById = () => mkIssue();
  try {
    const items = [];
    for (let i = 1; i <= 250; i++) items.push(item({ issueId: 'DEMO-' + i }));
    const ctx = mkCtx({ groups: [G_EDITOR], body: { roleItems: { analysis: items } } });
    const ri = postRoleItems(ctx);
    assert.strictEqual(ctx.response.body.success, true);
    assert.deepStrictEqual(ctx.response.body.enriched, { count: 200, skipped: 50 });
    assert.strictEqual(ri.analysis[199].title, 'Реальное название задачи');
    assert.strictEqual(ri.analysis[200].title, undefined);
    assert.strictEqual(ri.analysis.length, 250);
  } finally { entities.Issue.findById = orig; }
});

test('обогащение: длинный summary усекается до лимита validateItem (1000), запись не 400-ится', () => {
  const orig = entities.Issue.findById;
  entities.Issue.findById = () => mkIssue({ summary: 'Д'.repeat(5000) });
  try {
    const ctx = mkCtx({ groups: [G_EDITOR], body: { roleItems: { analysis: [item()] } } });
    const ri = postRoleItems(ctx);
    assert.strictEqual(ctx.response.body.success, true);
    assert.strictEqual(ri.analysis[0].title.length, 1000);
  } finally { entities.Issue.findById = orig; }
});
