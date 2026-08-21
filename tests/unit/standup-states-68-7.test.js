'use strict';
/**
 * 68-7 — Стендап: реальные состояния по ролям (backend-контракт настроек).
 *
 * Покрывает additive settings-ключи (whitelist + типизация + тир):
 *   - standupHiddenStates — string[] состояний, скрытых из секций стендапа
 *     (контракт зеркалит standupDoneStates: ≤200, max 50, unique);
 *   - standupStateRoles — [{ state, roles[] }] маппинг «состояние → роли»
 *     per-role фильтра секций (контракт 1:1 с backlogZones: state unique ≤200,
 *     roles ⊆ ROLE_KEYS, max 50);
 *   оба — ПЛАНИРОВОЧНЫЙ тир, как standupDoneStates (не backlog*-admin).
 */
const test   = require('node:test');
const assert = require('node:assert');
const path   = require('node:path');

const backend = require(path.join(__dirname, '..', '..', 'backend-project.js'));
const {
  validateSettings,
  ALLOWED_SETTINGS_KEYS,
  ADMIN_TIER_SETTINGS_KEYS,
} = backend;

/* ---- whitelist + тир ---- */

test('standupHiddenStates + standupStateRoles присутствуют в ALLOWED_SETTINGS_KEYS', function () {
  ['standupHiddenStates', 'standupStateRoles'].forEach(function (k) {
    assert.ok(ALLOWED_SETTINGS_KEYS.indexOf(k) >= 0, k + ' missing in ALLOWED_SETTINGS_KEYS');
  });
});

test('оба ключа — планировочный тир (как standupDoneStates), НЕ admin', function () {
  ['standupDoneStates', 'standupHiddenStates', 'standupStateRoles'].forEach(function (k) {
    assert.ok(ADMIN_TIER_SETTINGS_KEYS.indexOf(k) < 0, k + ' must stay planning-tier');
  });
});

/* ---- validateSettings: happy path ---- */

test('validateSettings принимает валидный стендап-конфиг 68-7', function () {
  const s = {
    standupHiddenStates: ['Отменено', 'Архив'],
    standupStateRoles: [
      { state: 'Аналитика',    roles: ['analysis'] },
      { state: 'Тестирование', roles: ['testing', 'devBack'] },   // MANY: состояние → несколько ролей
      { state: 'Витрина',      roles: [] },                       // строка без ролей допустима
    ],
  };
  assert.strictEqual(validateSettings(s), true);
});

test('validateSettings принимает отсутствие/null обоих ключей (additive optional)', function () {
  assert.strictEqual(validateSettings({}), true);
  assert.strictEqual(validateSettings({ standupHiddenStates: null, standupStateRoles: null }), true);
});

/* ---- validateSettings: rejects ---- */

test('reject: standupHiddenStates — дубль состояния', function () {
  assert.strictEqual(validateSettings({ standupHiddenStates: ['Готово', 'Готово'] }), false);
});

test('reject: standupHiddenStates — не массив строк', function () {
  assert.strictEqual(validateSettings({ standupHiddenStates: 'Готово' }), false);
  assert.strictEqual(validateSettings({ standupHiddenStates: [42] }), false);
});

test('reject: standupStateRoles — дубль состояния', function () {
  assert.strictEqual(validateSettings({ standupStateRoles: [
    { state: 'Аналитика', roles: ['analysis'] },
    { state: 'Аналитика', roles: ['testing'] },
  ] }), false);
});

test('reject: standupStateRoles — пустой/отсутствующий state', function () {
  assert.strictEqual(validateSettings({ standupStateRoles: [{ state: '', roles: [] }] }), false);
  assert.strictEqual(validateSettings({ standupStateRoles: [{ roles: ['analysis'] }] }), false);
});

test('reject: standupStateRoles — неизвестная роль', function () {
  assert.strictEqual(validateSettings({ standupStateRoles: [
    { state: 'Аналитика', roles: ['not_a_role'] },
  ] }), false);
});

test('reject: standupStateRoles — roles не массив / строка не объект', function () {
  assert.strictEqual(validateSettings({ standupStateRoles: [{ state: 'A', roles: 'analysis' }] }), false);
  assert.strictEqual(validateSettings({ standupStateRoles: ['A'] }), false);
});

test('reject: standupStateRoles — больше 50 строк', function () {
  const rows = [];
  for (let i = 0; i < 51; i++) rows.push({ state: 'S' + i, roles: [] });
  assert.strictEqual(validateSettings({ standupStateRoles: rows }), false);
});
