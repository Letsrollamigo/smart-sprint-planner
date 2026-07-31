'use strict';

/* v3.15.1 — серверный overlimit-warn при ?action=validate (ОС прода 2026-07-31):
 * (1) скоуп проверки = валидируемая роль из ?role= — валидация одной роли больше
 *     не ругается на перелимит чужой (роль с ресурсом 0 и хвостом аллокаций);
 * (2) без ?role= (legacy-фронт ≤3.15.0) — прежнее поведение, все роли;
 * (3) allowOverlimitPlanning=true глушит warnings целиком (обещание тумблера
 *     «не смотри на лимит» распространяется и на сервер).
 * Запуск: node --test 'tests/unit/validate-overlimit-scope.test.js'. */

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const core = require(path.join(__dirname, '..', '..', 'backend-project.js'));

const EP = core.ENDPOINTS.find((e) => e.method === 'POST' && e.path === 'sprint-data');

/* Спринт: testing перелимичен (ресурс 0, активная аллокация 60м), analysis чист. */
function overlimitBody() {
  return {
    sprint: {
      sprintId: 's-1', name: 'Спринт 1', status: 'CONFIRMED',
      dateStart: 1750000000000, dateEnd: 1751000000000,
      resourceAnalysis: 6000, resourceTesting: 0,
    },
    roleItems: {
      analysis: [{ issueId: 'T-1', inclusionStatus: 'INC_PLANNED', alloc_analysis: 60 }],
      testing:  [{ issueId: 'T-2', inclusionStatus: 'INC_PLANNED', alloc_testing: 60 }],
    },
  };
}

function mkCtx(settingsOver, params) {
  params = params || {};
  const props = {
    ssp_settings: JSON.stringify(Object.assign({ validationGroups: ['g-v'] }, settingsOver || {})),
    ssp_sprint: '',
  };
  return {
    settings: { settingsManagerGroup: { id: 'g-admin', name: 'Admins' } },
    currentUser: { id: 'u-1', login: 'user1', groups: [{ id: 'g-v', name: 'g-v' }] },
    project: { extensionProperties: props },
    request: { body: JSON.stringify(overlimitBody()), getParameter: (k) => (params[k] || '') },
    response: { status: 200, body: null, json(v) { this.body = v; } },
    _props: props,
  };
}

function warningsOf(ctx) { return (ctx.response.body && ctx.response.body.warnings) || []; }

test('validate ?role=analysis: чужой перелимит testing не репортится', () => {
  const ctx = mkCtx(null, { action: 'validate', role: 'analysis' });
  EP.handle(ctx);
  assert.strictEqual(ctx.response.body.success, true);
  assert.deepStrictEqual(warningsOf(ctx), []);
});

test('validate ?role=testing: свой перелимит ловится', () => {
  const ctx = mkCtx(null, { action: 'validate', role: 'testing' });
  EP.handle(ctx);
  assert.strictEqual(ctx.response.body.success, true);
  assert.deepStrictEqual(warningsOf(ctx), ['overlimit:testing']);
});

test('validate без ?role (legacy-фронт): все роли, как раньше', () => {
  const ctx = mkCtx(null, { action: 'validate' });
  EP.handle(ctx);
  assert.strictEqual(ctx.response.body.success, true);
  assert.deepStrictEqual(warningsOf(ctx), ['overlimit:testing']);
});

test('validate + allowOverlimitPlanning=true: warnings глушатся целиком', () => {
  const ctx = mkCtx({ allowOverlimitPlanning: true }, { action: 'validate', role: 'testing' });
  EP.handle(ctx);
  assert.strictEqual(ctx.response.body.success, true);
  assert.deepStrictEqual(warningsOf(ctx), []);
});
