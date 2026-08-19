'use strict';

/* #51 — байпас инстанс-админа: глобальная роль «Администратор проектов» /
   «Системный администратор» (hasPermission('UPDATE_PROJECT') БЕЗ project-аргумента
   = глобальная проверка) даёт полный доступ ко всем ролям планера во всех проектах.
   Контракты: fail-closed, кэш на ctx, non-admin поведение не регрессирует. */

const test   = require('node:test');
const assert = require('node:assert');
const path   = require('node:path');

const backend = require(path.join(__dirname, '..', '..', 'backend-project.js'));

/* ── helpers ─────────────────────────────────────────────────────────────── */

function makeCtx(opts) {
  opts = opts || {};
  var calls = [];
  var ctx = {
    currentUser: {
      id: 'u1', login: 'tester', groups: opts.groups || [],
      hasPermission: opts.hasPermission === undefined ? undefined : function () {
        calls.push(Array.prototype.slice.call(arguments));
        if (opts.hasPermission === 'throw') throw new Error('boom');
        return opts.hasPermission;
      }
    },
    settings: opts.settings || {},
    project: { extensionProperties: opts.props || {} },
    response: {
      status: 200,
      json: function (o) { ctx.response.body = o; }
    }
  };
  ctx.__permCalls = calls;
  return ctx;
}

/* ── isInstanceAdmin ─────────────────────────────────────────────────────── */

test('isInstanceAdmin: true при глобальном UPDATE_PROJECT', function () {
  var ctx = makeCtx({ hasPermission: true });
  assert.strictEqual(backend.isInstanceAdmin(ctx), true);
});

test('isInstanceAdmin: false без права', function () {
  var ctx = makeCtx({ hasPermission: false });
  assert.strictEqual(backend.isInstanceAdmin(ctx), false);
});

test('isInstanceAdmin: fail-closed — hasPermission бросает → false', function () {
  var ctx = makeCtx({ hasPermission: 'throw' });
  assert.strictEqual(backend.isInstanceAdmin(ctx), false);
});

test('isInstanceAdmin: fail-closed — hasPermission отсутствует (старый YT) → false', function () {
  var ctx = makeCtx({});
  assert.strictEqual(backend.isInstanceAdmin(ctx), false);
});

test('isInstanceAdmin: проверка ГЛОБАЛЬНАЯ — hasPermission зовётся без project-аргумента', function () {
  var ctx = makeCtx({ hasPermission: true });
  backend.isInstanceAdmin(ctx);
  assert.strictEqual(ctx.__permCalls.length, 1);
  assert.strictEqual(ctx.__permCalls[0][0], 'UPDATE_PROJECT');
  assert.strictEqual(ctx.__permCalls[0].length, 1);
});

test('isInstanceAdmin: кэш на ctx — повторные вызовы не дёргают hasPermission', function () {
  var ctx = makeCtx({ hasPermission: true });
  backend.isInstanceAdmin(ctx);
  backend.isEditor(ctx);
  backend.isValidator(ctx);
  backend.isSettingsManager(ctx);
  assert.strictEqual(ctx.__permCalls.length, 1);
});

/* ── байпас в ролевых хелперах (без единой настроенной группы) ───────────── */

/* #66 (⚖ владелец 2026-08-19) — isHistoryManager ВЫРЕЗАН из байпаса: деструктивная
   очистка/замена истории требует явного членства даже у глобального админа. */
var ROLE_HELPERS = ['isEditor', 'isValidator', 'isAssigner',
  'isSettingsManager', 'isPlanningManager', 'isReleaseManager', 'isReleaseEngineer'];

test('ролевые хелперы: админ = член любой роли без групп и без настройки плагина', function () {
  var ctx = makeCtx({ hasPermission: true });
  ROLE_HELPERS.forEach(function (fn) {
    assert.strictEqual(backend[fn](ctx), true, fn + ' должен пускать инстанс-админа');
  });
});

test('ролевые хелперы: non-admin без групп — deny-by-default не регрессирует', function () {
  var ctx = makeCtx({ hasPermission: false, settings: { settingsManagerGroup: 'admins' } });
  ROLE_HELPERS.forEach(function (fn) {
    assert.strictEqual(backend[fn](ctx), false, fn + ' не должен пускать без членства');
  });
});

/* ── байпас в authzGuard ─────────────────────────────────────────────────── */

test('authzGuard: админ проходит settingsManager в ненастроенном проекте', function () {
  var ctx = makeCtx({ hasPermission: true, settings: {} });
  assert.strictEqual(backend.authzGuard(ctx, 'settingsManager'), true);
});

test('authzGuard: non-admin в ненастроенном проекте — plugin_not_configured (регресс)', function () {
  var ctx = makeCtx({ hasPermission: false, settings: {} });
  assert.strictEqual(backend.authzGuard(ctx, 'editor'), false);
  assert.strictEqual(ctx.response.status, 403);
  assert.strictEqual(ctx.response.body.reason, 'plugin_not_configured');
});

test('authzGuard: неаутентифицированный админ-ctx всё равно 403 (auth первым)', function () {
  var ctx = makeCtx({ hasPermission: true });
  ctx.currentUser = null;
  assert.strictEqual(backend.authzGuard(ctx, 'viewer'), false);
  assert.strictEqual(ctx.response.body.reason, 'auth_required');
});

/* ── #66 — вырез historyManager из байпаса #51 ────────────────────────────── */

test('#66: админ НЕ historyManager без членства в historyClearGroups', function () {
  var ctx = makeCtx({ hasPermission: true, settings: { settingsManagerGroup: 'admins' } });
  assert.strictEqual(backend.isHistoryManager(ctx), false);
});

test('#66: админ становится historyManager только через членство в группе', function () {
  var ctx = makeCtx({
    hasPermission: true,
    settings: { settingsManagerGroup: 'admins' },
    groups: [{ id: 'g-hist', name: 'History Cleaners' }],
    props: { ssp_settings: JSON.stringify({ historyClearGroups: ['g-hist'] }) }
  });
  assert.strictEqual(backend.isHistoryManager(ctx), true);
});

test('#66: authzGuard historyManager — админ без членства получает 403 (UI↔POST парность)', function () {
  var ctx = makeCtx({ hasPermission: true, settings: { settingsManagerGroup: 'admins' } });
  assert.strictEqual(backend.authzGuard(ctx, 'historyManager'), false);
  assert.strictEqual(ctx.response.status, 403);
  assert.strictEqual(ctx.response.body.reason, 'history_manager_rights_required');
});

test('#66: authzGuard historyManager — админ-член группы проходит', function () {
  var ctx = makeCtx({
    hasPermission: true,
    settings: { settingsManagerGroup: 'admins' },
    groups: [{ id: 'g-hist', name: 'History Cleaners' }],
    props: { ssp_settings: JSON.stringify({ historyClearGroups: ['g-hist'] }) }
  });
  assert.strictEqual(backend.authzGuard(ctx, 'historyManager'), true);
});

test('#66: вырез точечный — остальные роли админ по-прежнему проходит', function () {
  var ctx = makeCtx({ hasPermission: true, settings: {} });
  ['viewer', 'editor', 'validator', 'settingsManager', 'assigner'].forEach(function (role) {
    assert.strictEqual(backend.authzGuard(ctx, role), true, role + ': байпас #51 не должен пострадать');
  });
});
