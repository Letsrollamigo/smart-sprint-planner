/**
 * #73 — роли-участницы спринта: схема-валидация ключа `roles` (v3.27.0).
 *
 * Контракты:
 *   - roles — optional: absent/null проходит (pre-#73 снапшоты);
 *   - каждый элемент ∈ ROLE_KEYS, без дублей, не-массив бракуется;
 *   - WRITE-валидация НЕЗАВИСИМА от settings.activeRoles (⚖ №5 спеки #73:
 *     «⊆ проекта» — только UI-гейт диалога создания; write-гейт по настройкам
 *     бракует сейв после их смены — класс брика v3.2.1/#70);
 *   - миграция 3.23.0 → 3.27.0 — no-op: roles не досеивается и не теряется.
 */
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const path   = require('node:path');

const backend = require(path.join(__dirname, '..', '..', 'backend-project.js'));
const {
  migrateSprintObj,
  migrateHistoryArr,
  validateSprintForWrite,
  validateSprintForRead,
  validateHistoryForWrite,
} = backend;

function sprintBody(over) {
  return Object.assign({
    sprintId: 'S-73', name: 'Спринт #73', status: 'PLANNING',
    dateStart: 1785000000000, dateEnd: 1786000000000,
    updatedBy: 'user', updatedAt: 1785000000000,
  }, over || {});
}

function histRec(over) {
  return Object.assign({
    sprintId: 'S-73_analysis', roleKey: 'analysis', roleLabel: 'Анализ',
    name: 'Спринт #73', status: 'PLANNING', confirmedAt: 1785000000000,
    items: [],
  }, over || {});
}

test('#73 sprint.roles: валидный набор проходит Write и Read', () => {
  const s = sprintBody({ roles: ['analysis', 'devBack'] });
  assert.strictEqual(validateSprintForWrite(s), true);
  assert.strictEqual(validateSprintForRead(s), true);
});

test('#73 sprint.roles: absent/null проходит (pre-#73 спринты)', () => {
  assert.strictEqual(validateSprintForWrite(sprintBody()), true);
  assert.strictEqual(validateSprintForWrite(sprintBody({ roles: null })), true);
});

test('#73 sprint.roles: неизвестная роль / дубль / не-массив бракуются', () => {
  assert.strictEqual(validateSprintForWrite(sprintBody({ roles: ['analysis', 'nosuch'] })), false);
  assert.strictEqual(validateSprintForWrite(sprintBody({ roles: ['analysis', 'analysis'] })), false);
  assert.strictEqual(validateSprintForWrite(sprintBody({ roles: 'analysis' })), false);
  assert.strictEqual(validateSprintForWrite(sprintBody({ roles: [42] })), false);
});

test('#73 sprint.roles: WRITE не проверяет подмножество настроек (роль вне activeRoles проекта проходит)', () => {
  /* Валидатор не получает settings вовсе — фиксируем контракт «полный ROLE_KEYS-набор валиден»:
     спринт с ролью, выключенной из настроек ПОСЛЕ создания, обязан сохраняться. */
  const all = ['analysis','testing','devPlatform','devBack','devFront','devIos','devAndroid','devFs','devDb'];
  assert.strictEqual(validateSprintForWrite(sprintBody({ roles: all })), true);
});

test('#73 history[].roles: валидный проходит, битый бракует запись', () => {
  assert.strictEqual(validateHistoryForWrite([histRec({ roles: ['analysis'] })]), true);
  assert.strictEqual(validateHistoryForWrite([histRec()]), true);
  assert.strictEqual(validateHistoryForWrite([histRec({ roles: ['nosuch'] })]), false);
  assert.strictEqual(validateHistoryForWrite([histRec({ roles: ['analysis', 'analysis'] })]), false);
});

test('#73 миграция 3.23.0 → 3.27.0: no-op — roles не досеивается и не теряется', () => {
  const bare = migrateSprintObj(sprintBody({ pluginVersion: '3.23.0' }));
  assert.strictEqual(bare.pluginVersion, '3.35.0');   /* цепочка достраивается дальше — #74 добавил no-op 3.27.0→3.28.0, 68-8 — 3.28.0→3.29.0, #80 — 3.29.0→3.32.0 */
  assert.ok(!('roles' in bare), 'roles не досеивается миграцией (отсутствие = фолбэк резолвера)');

  const withRoles = migrateSprintObj(sprintBody({ pluginVersion: '3.23.0', roles: ['testing'] }));
  assert.deepStrictEqual(withRoles.roles, ['testing'], 'roles переживает миграцию');

  const h = migrateHistoryArr([histRec({ pluginVersion: '3.23.0', roles: ['analysis'] })]);
  assert.deepStrictEqual(h[0].roles, ['analysis']);
  assert.strictEqual(h[0].pluginVersion, '3.35.0');
});
