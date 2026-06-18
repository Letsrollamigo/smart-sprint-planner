'use strict';

/* #22 — двух-тирная модель прав формы настроек (Вариант C).
 * Покрывает: validateSettings(новые planning-ключи), ADMIN_TIER_SETTINGS_KEYS,
 * mergeAdminTierFromStored (preserve-merge = ядро безопасности), isPlanningManager. */

const test   = require('node:test');
const assert = require('node:assert');
const path   = require('node:path');

const backend = require(path.join(__dirname, '..', '..', 'backend-project.js'));
const { validateSettings, mergeAdminTierFromStored, ADMIN_TIER_SETTINGS_KEYS, isPlanningManager } = backend;

/* ── validateSettings: новые planning-тир ключи ── */
test('validateSettings: принимает planningManagerGroups/Names (string arrays)', () => {
  assert.strictEqual(validateSettings({ planningManagerGroups: ['g1', 'g2'], planningManagerGroupNames: ['Planners'] }), true);
});
test('validateSettings: planningManagerGroups=null допустим', () => {
  assert.strictEqual(validateSettings({ planningManagerGroups: null, planningManagerGroupNames: null }), true);
});
test('validateSettings: planningManagerGroups не-массив → false', () => {
  assert.strictEqual(validateSettings({ planningManagerGroups: 'g1' }), false);
});
test('validateSettings: planningManagerGroups с не-строковым элементом → false', () => {
  assert.strictEqual(validateSettings({ planningManagerGroups: [1, 2] }), false);
});
/* backward-compat: settings-блоб прошлого релиза (БЕЗ новых planning-ключей) валиден —
   ключи аддитивно-опциональны, миграции нет (см. SETTINGS_WORKFLOW_GATE_22_SPEC §5). */
test('validateSettings: pre-#22 settings-блоб (без planningManagerGroups) валиден', () => {
  assert.strictEqual(validateSettings({
    activeRoles: ['analysis'], fieldPriority: 'Priority', editGroups: ['eng'], editGroupNames: ['Engineers'],
    dtaEnabled: true, cascadeAggregationEnabled: false, stateRollupEnabled: false,
    nkcJanuary: 105, kpe: { Intern: 0, Junior: 0.5 }, personalPlanningEnabled: true,
  }), true);
});

/* #45 L2 — валидатор политики ёмкости (capacityMode light|full + диапазоны часов).
   На main Full в UI не вводится, но значение принимается бэком (epic↔main roundtrip). */
test('validateSettings: capacityMode принимает light|full, отвергает прочее', () => {
  assert.strictEqual(validateSettings({ capacityMode: 'light' }), true);
  assert.strictEqual(validateSettings({ capacityMode: 'full' }), true);
  assert.strictEqual(validateSettings({ capacityMode: undefined }), true);
  assert.strictEqual(validateSettings({ capacityMode: null }), true);
  assert.strictEqual(validateSettings({ capacityMode: 'super-light' }), false);
  assert.strictEqual(validateSettings({ capacityMode: 'Light' }), false);
});
test('validateSettings: hoursPerDay [1,24] / usefulHoursPerDay [0,24]', () => {
  assert.strictEqual(validateSettings({ hoursPerDay: 8, usefulHoursPerDay: 6 }), true);
  assert.strictEqual(validateSettings({ hoursPerDay: 1 }), true);
  assert.strictEqual(validateSettings({ hoursPerDay: 24 }), true);
  assert.strictEqual(validateSettings({ usefulHoursPerDay: 0 }), true);
  assert.strictEqual(validateSettings({ hoursPerDay: 0 }), false);
  assert.strictEqual(validateSettings({ hoursPerDay: 25 }), false);
  assert.strictEqual(validateSettings({ usefulHoursPerDay: 25 }), false);
});

/* ── ADMIN_TIER_SETTINGS_KEYS: состав тиров ── */
test('ADMIN_TIER_SETTINGS_KEYS: содержит workflow + доступ/права + planningManagerGroups (анти-эскалация)', () => {
  ['dtaEnabled', 'workItemTypeMapping', 'cascadeAggregationEnabled', 'forbidContainerWorkItems', 'stateRollupEnabled',
   'validationGroups', 'editGroups', 'assignerGroups', 'historyClearGroups',
   'planningManagerGroups', 'planningManagerGroupNames'].forEach((k) => {
    assert.ok(ADMIN_TIER_SETTINGS_KEYS.indexOf(k) >= 0, 'отсутствует admin-тир ключ: ' + k);
  });
});
/* #45 (b) — рекомпозиция блока ёмкости: параметры расчёта ёмкости (нормы + КПЕ) и
   источник ресурса исполнителей (personalPlanning-кластер) перенесены в admin-тир. */
test('ADMIN_TIER_SETTINGS_KEYS: содержит параметры расчёта ёмкости + источник ресурса (#45 b)', () => {
  ['capacityMode', 'hoursPerDay', 'usefulHoursPerDay',
   'nkcJanuary', 'nkcMay', 'nkcOther', 'rate', 'participation', 'kpe',
   'personalPlanningEnabled', 'usePersonalForResource', 'manualPersonalResource'].forEach((k) => {
    assert.ok(ADMIN_TIER_SETTINGS_KEYS.indexOf(k) >= 0, 'отсутствует admin-тир ключ ёмкости: ' + k);
  });
});
test('ADMIN_TIER_SETTINGS_KEYS: НЕ содержит планировочных ключей', () => {
  /* dynEditEnabled / allowOverlimitPlanning намеренно ОСТАЮТСЯ планировочными (#45 b). */
  ['activeRoles', 'fieldPriority', 'standupDoneStates', 'defaultLang',
   'dynEditEnabled', 'allowOverlimitPlanning'].forEach((k) => {
    assert.ok(ADMIN_TIER_SETTINGS_KEYS.indexOf(k) < 0, 'планировочный ключ ошибочно в admin-тире: ' + k);
  });
});

/* ── mergeAdminTierFromStored: preserve-merge (ядро безопасности) ── */
test('preserve-merge: планировочные ключи берутся из incoming', () => {
  /* #45 (b) — nkcJanuary теперь admin-тир; в качестве планировочного примера —
     allowOverlimitPlanning (намеренно остался планировочным). */
  const out = mergeAdminTierFromStored(
    { activeRoles: ['analysis'], allowOverlimitPlanning: true, dtaEnabled: true },
    { activeRoles: ['testing'], allowOverlimitPlanning: false, dtaEnabled: false }
  );
  assert.deepStrictEqual(out.activeRoles, ['analysis']);
  assert.strictEqual(out.allowOverlimitPlanning, true);
});
/* #45 (b) — нормы расчёта ёмкости теперь admin-тир: планировочный менеджер не может их
   перезаписать (берутся из stored). */
test('preserve-merge: nkcJanuary (admin #45 b) берётся из stored, не из incoming', () => {
  const out = mergeAdminTierFromStored({ nkcJanuary: 100 }, { nkcJanuary: 999 });
  assert.strictEqual(out.nkcJanuary, 999);
});
test('preserve-merge: admin-ключи берутся из stored (присланные игнорируются)', () => {
  const out = mergeAdminTierFromStored(
    { dtaEnabled: true, workItemTypeMapping: { Bug: 'analysis' }, editGroups: ['hacker'], stateRollupEnabled: true },
    { dtaEnabled: false, workItemTypeMapping: { Task: 'testing' }, editGroups: ['legit'], stateRollupEnabled: false }
  );
  assert.strictEqual(out.dtaEnabled, false);
  assert.deepStrictEqual(out.workItemTypeMapping, { Task: 'testing' });
  assert.deepStrictEqual(out.editGroups, ['legit']);
  assert.strictEqual(out.stateRollupEnabled, false);
});
test('preserve-merge: анти-эскалация — planningManagerGroups нельзя изменить', () => {
  const out = mergeAdminTierFromStored(
    { planningManagerGroups: ['attacker-self'], planningManagerGroupNames: ['Attacker'] },
    { planningManagerGroups: ['legit'], planningManagerGroupNames: ['Legit'] }
  );
  assert.deepStrictEqual(out.planningManagerGroups, ['legit']);
  assert.deepStrictEqual(out.planningManagerGroupNames, ['Legit']);
});
test('preserve-merge: admin-ключ отсутствует в stored → удаляется (нельзя СОЗДАТЬ)', () => {
  const out = mergeAdminTierFromStored({ dtaEnabled: true, activeRoles: ['analysis'] }, { activeRoles: ['testing'] });
  assert.ok(!Object.prototype.hasOwnProperty.call(out, 'dtaEnabled'), 'admin-ключ не должен создаваться планировочным менеджером');
  assert.deepStrictEqual(out.activeRoles, ['analysis']);
});
test('preserve-merge: incoming не мутируется', () => {
  const incoming = { dtaEnabled: true };
  mergeAdminTierFromStored(incoming, { dtaEnabled: false });
  assert.strictEqual(incoming.dtaEnabled, true);
});
test('preserve-merge: stored=null/undefined → все admin-ключи удалены', () => {
  const out = mergeAdminTierFromStored({ dtaEnabled: true, activeRoles: ['analysis'] }, null);
  assert.ok(!Object.prototype.hasOwnProperty.call(out, 'dtaEnabled'));
  assert.deepStrictEqual(out.activeRoles, ['analysis']);
});

/* ── isPlanningManager ── */
function pmCtx(opts) {
  opts = opts || {};
  return {
    settings: { settingsManagerGroup: opts.unconfigured ? null : 'mgr' },
    project: { extensionProperties: { ssp_settings: JSON.stringify({
      planningManagerGroups: opts.groups || [],
      planningManagerGroupNames: opts.names || [],
    }) } },
    currentUser: { id: 'u1', login: 'u', groups: opts.userGroups || [] },
  };
}
test('isPlanningManager: член planningManagerGroups (по id) → true', () => {
  assert.strictEqual(isPlanningManager(pmCtx({ groups: ['gP'], userGroups: [{ id: 'gP', name: 'Planners' }] })), true);
});
test('isPlanningManager: член по имени → true', () => {
  assert.strictEqual(isPlanningManager(pmCtx({ names: ['Planners'], userGroups: [{ id: 'gX', name: 'Planners' }] })), true);
});
test('isPlanningManager: не член → false', () => {
  assert.strictEqual(isPlanningManager(pmCtx({ groups: ['gP'], userGroups: [{ id: 'gOther', name: 'Other' }] })), false);
});
test('isPlanningManager: deny-by-default — пустые planning-группы → false', () => {
  assert.strictEqual(isPlanningManager(pmCtx({ groups: [], userGroups: [{ id: 'gP', name: 'Planners' }] })), false);
});
test('isPlanningManager: плагин не сконфигурирован → false', () => {
  assert.strictEqual(isPlanningManager(pmCtx({ unconfigured: true, groups: ['gP'], userGroups: [{ id: 'gP', name: 'Planners' }] })), false);
});
