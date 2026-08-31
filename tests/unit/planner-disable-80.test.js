'use strict';

/* #80 «Отключить планер в этом проекте» — регресс-покрытие рисков карточки.
 *
 *   Флаг ssp_settings.plannerDisabled (bool) пишет ТОЛЬКО POST planner-disabled
 *   (backend-plannerdisable.js, settingsManager, fail-closed). Обычный settings-save
 *   preserve'ит хранимое значение (анти-затирание формой — класс ожога #74).
 *   Гейты (backend-global.js): filter-planner-projects (отключённый виден только тем,
 *   кто может включить) и global-делегирование (403 planner_disabled, exempt только
 *   planner-disabled). Гейт читает ТОЛЬКО актуальный блоб — не history (риск 3).
 *
 * Запуск: node --test 'tests/unit/planner-disable-80.test.js'. */

const test   = require('node:test');
const assert = require('node:assert');
const path   = require('path');
const core   = require(path.join(__dirname, '..', '..', 'backend-project.js'));
const glob   = require(path.join(__dirname, '..', '..', 'backend-global.js'));
const pd     = require(path.join(__dirname, '..', '..', 'backend-plannerdisable.js'));

const G_ADMIN  = { id: 'g-admin',  name: 'Admins' };
const G_EDITOR = { id: 'g-editor', name: 'Editors' };

const EP_PD     = core.ENDPOINTS.find((e) => e.method === 'POST' && e.path === 'planner-disabled');
const EP_SPRINT = core.ENDPOINTS.find((e) => e.method === 'POST' && e.path === 'sprint-data');

/* project-scope fake ctx (паттерн simplify-69-r3). userGroups — группы currentUser. */
function mkCtx(body, props, opts) {
  opts = opts || {};
  props = Object.assign({}, props || {});
  return {
    settings: { settingsManagerGroup: opts.smGroup !== undefined ? opts.smGroup : G_ADMIN },
    project: { key: 'SCBT', extensionProperties: props },
    currentUser: { id: 'u-1', login: 'user1', groups: opts.userGroups || [G_ADMIN], hasPermission: () => false },
    request: { body: JSON.stringify(body), getParameter: () => '' },
    response: { status: 200, body: null, json(v) { this.body = v; } },
    _props: props
  };
}

/* ── валидация тела ──────────────────────────────────────────────────────── */

test('planner-disabled body: {disabled:bool} валиден, прочее — reject', () => {
  assert.strictEqual(pd.validatePlannerDisableBody({ disabled: true }), true);
  assert.strictEqual(pd.validatePlannerDisableBody({ disabled: false }), true);
  assert.strictEqual(pd.validatePlannerDisableBody({ disabled: 'true' }), false);
  assert.strictEqual(pd.validatePlannerDisableBody({ disabled: true, extra: 1 }), false);
  assert.strictEqual(pd.validatePlannerDisableBody({}), false);
  assert.strictEqual(pd.validatePlannerDisableBody(null), false);
  assert.strictEqual(pd.validatePlannerDisableBody([true]), false);
});

/* ── whitelist настроек + admin-тир ──────────────────────────────────────── */

test('validateSettings: plannerDisabled bool проходит, не-bool — reject', () => {
  assert.strictEqual(core.validateSettings({ plannerDisabled: true }), true);
  assert.strictEqual(core.validateSettings({ plannerDisabled: false }), true);
  assert.strictEqual(core.validateSettings({ plannerDisabled: 'yes' }), false);
  assert.strictEqual(core.validateSettings({ plannerDisabled: 1 }), false);
});

test('admin-тир: планировочный менеджер не может ни задать, ни создать plannerDisabled', () => {
  assert.ok(core.ADMIN_TIER_SETTINGS_KEYS.indexOf('plannerDisabled') >= 0);
  /* stored несёт флаг → incoming планировочного игнорируется, значение из stored */
  let merged = core.mergeAdminTierFromStored({ plannerDisabled: false, dynEditEnabled: true }, { plannerDisabled: true });
  assert.strictEqual(merged.plannerDisabled, true);
  assert.strictEqual(merged.dynEditEnabled, true);
  /* stored без флага → ключ не создаётся */
  merged = core.mergeAdminTierFromStored({ plannerDisabled: true }, {});
  assert.ok(!('plannerDisabled' in merged));
});

/* ── детектор флага (риск 3: только актуальный блоб) ─────────────────────── */

test('isPlannerDisabled: строго === true; мусор/строки/1 — false', () => {
  assert.strictEqual(core.isPlannerDisabled({ plannerDisabled: true }), true);
  assert.strictEqual(core.isPlannerDisabled({ plannerDisabled: false }), false);
  assert.strictEqual(core.isPlannerDisabled({ plannerDisabled: 'true' }), false);
  assert.strictEqual(core.isPlannerDisabled({ plannerDisabled: 1 }), false);
  assert.strictEqual(core.isPlannerDisabled({}), false);
  assert.strictEqual(core.isPlannerDisabled(null), false);
});

test('риск 3: флаг в history[].settings НЕ выключает проект — гейт читает только актуальный блоб', () => {
  const project = { key: 'SCBT', extensionProperties: {
    ssp_settings: JSON.stringify({ activeRoles: ['analysis'] }),   /* актуальный блоб БЕЗ флага */
    ssp_history: JSON.stringify([{ sprintId: 'S-1', settings: { plannerDisabled: true } }])  /* снимок эпохи С флагом */
  } };
  assert.strictEqual(glob.isProjectPlannerDisabled(project), false);
  /* и наоборот: флаг в актуальном блобе выключает независимо от истории */
  project.extensionProperties.ssp_settings = JSON.stringify({ plannerDisabled: true });
  assert.strictEqual(glob.isProjectPlannerDisabled(project), true);
  /* битый/пустой блоб — fail-open в «не отключён» (нет самозапирания на мусоре) */
  assert.strictEqual(glob.isProjectPlannerDisabled({ key: 'X', extensionProperties: { ssp_settings: 'not json' } }), false);
  assert.strictEqual(glob.isProjectPlannerDisabled({ key: 'X', extensionProperties: {} }), false);
});

/* ── endpoint POST planner-disabled ──────────────────────────────────────── */

test('POST planner-disabled: settings-менеджер выключает — флаг лёг, прочие ключи целы', () => {
  const ctx = mkCtx({ disabled: true }, { ssp_settings: JSON.stringify({ activeRoles: ['analysis'], dynEditEnabled: true }) });
  EP_PD.handle(ctx);
  assert.strictEqual(ctx.response.body.success, true, JSON.stringify(ctx.response.body));
  assert.strictEqual(ctx.response.body.disabled, true);
  const stored = JSON.parse(ctx._props.ssp_settings);
  assert.strictEqual(stored.plannerDisabled, true);
  assert.deepStrictEqual(stored.activeRoles, ['analysis']);
  assert.strictEqual(stored.dynEditEnabled, true);
});

test('POST planner-disabled: включение чистит ключ (не оставляет plannerDisabled:false)', () => {
  const ctx = mkCtx({ disabled: false }, { ssp_settings: JSON.stringify({ plannerDisabled: true, kpe: null }) });
  EP_PD.handle(ctx);
  assert.strictEqual(ctx.response.body.success, true);
  const stored = JSON.parse(ctx._props.ssp_settings);
  assert.ok(!('plannerDisabled' in stored));
});

test('POST planner-disabled: не-настройщик → 403 settings_manager_rights_required', () => {
  const ctx = mkCtx({ disabled: true }, {}, { userGroups: [G_EDITOR] });
  EP_PD.handle(ctx);
  assert.strictEqual(ctx.response.status, 403);
  assert.strictEqual(ctx.response.body.reason, 'settings_manager_rights_required');
});

test('POST planner-disabled: мусорное тело → 400 invalid_planner_disable_body', () => {
  const ctx = mkCtx({ disabled: 'true' }, {});
  EP_PD.handle(ctx);
  assert.strictEqual(ctx.response.status, 400);
  assert.strictEqual(ctx.response.body.reason, 'invalid_planner_disable_body');
});

/* ── риск 4: fail-closed на обоих скоупах ────────────────────────────────── */

test('риск 4 (project): группа настройщика не сконфигурирована → 403 plugin_not_configured', () => {
  const ctx = mkCtx({ disabled: false }, { ssp_settings: JSON.stringify({ plannerDisabled: true }) }, { smGroup: null });
  EP_PD.handle(ctx);
  assert.strictEqual(ctx.response.status, 403);
  assert.strictEqual(ctx.response.body.reason, 'plugin_not_configured');
});

test('риск 4 (global): пустое зеркало ssp_acl → buildProjectCtx без группы → 403 plugin_not_configured', () => {
  const globalCtx = {
    currentUser: { id: 'u-1', login: 'user1', groups: [G_ADMIN], hasPermission: () => false },
    request: { body: JSON.stringify({ disabled: false }), getParameter: () => '' },
    response: { status: 200, body: null, json(v) { this.body = v; } }
  };
  const project = { key: 'SCBT', extensionProperties: { ssp_settings: JSON.stringify({ plannerDisabled: true }) } };  /* зеркала нет */
  const ctx = glob.buildProjectCtx(globalCtx, project);
  EP_PD.handle(ctx);
  assert.strictEqual(globalCtx.response.status, 403);
  assert.strictEqual(globalCtx.response.body.reason, 'plugin_not_configured');
});

test('global happy-path: зеркало ssp_acl с группой + членство → включение проходит', () => {
  const globalCtx = {
    currentUser: { id: 'u-1', login: 'user1', groups: [G_ADMIN], hasPermission: () => false },
    request: { body: JSON.stringify({ disabled: false }), getParameter: () => '' },
    response: { status: 200, body: null, json(v) { this.body = v; } }
  };
  const props = {
    ssp_settings: JSON.stringify({ plannerDisabled: true }),
    ssp_acl: JSON.stringify({ settingsManagerGroup: { id: G_ADMIN.id, name: G_ADMIN.name } })
  };
  const ctx = glob.buildProjectCtx(globalCtx, { key: 'SCBT', extensionProperties: props });
  EP_PD.handle(ctx);
  assert.strictEqual(globalCtx.response.body.success, true, JSON.stringify(globalCtx.response.body));
  assert.ok(!('plannerDisabled' in JSON.parse(props.ssp_settings)));
});

/* ── анти-затирание формой (класс ожога #74) ─────────────────────────────── */

test('settings-save preserve: сейв формы НЕ сбрасывает хранимый plannerDisabled и не создаёт его', () => {
  /* хранимый флаг есть, форма шлёт настройки без него → флаг пережил сейв */
  let ctx = mkCtx({ settings: { activeRoles: ['analysis'] } },
    { ssp_settings: JSON.stringify({ plannerDisabled: true, activeRoles: ['analysis'] }) });
  EP_SPRINT.handle(ctx);
  assert.strictEqual(ctx.response.body.success, true, JSON.stringify(ctx.response.body));
  assert.strictEqual(JSON.parse(ctx._props.ssp_settings).plannerDisabled, true);

  /* хранимого флага нет, stale-форма шлёт plannerDisabled:true → ключ выброшен */
  ctx = mkCtx({ settings: { activeRoles: ['analysis'], plannerDisabled: true } },
    { ssp_settings: JSON.stringify({ activeRoles: ['analysis'] }) });
  EP_SPRINT.handle(ctx);
  assert.strictEqual(ctx.response.body.success, true, JSON.stringify(ctx.response.body));
  assert.ok(!('plannerDisabled' in JSON.parse(ctx._props.ssp_settings)));
});

/* ── гейт делегирования: exempt-список ───────────────────────────────────── */

test('global-делегирование: planner-disabled опубликован в global-handler (канал включения)', () => {
  const ep = glob.httpHandler.endpoints.find((e) => e.method === 'POST' && e.path === 'planner-disabled');
  assert.ok(ep, 'POST planner-disabled есть в global-handler');
});
