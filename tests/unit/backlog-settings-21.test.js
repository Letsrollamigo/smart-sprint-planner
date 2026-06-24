'use strict';
/**
 * #21 — Модуль «Работа с бэклогом», слайс 1 (backend-контракт настроек).
 *
 * Покрывает additive settings-ключи (whitelist + типизация + тир):
 *   - fieldType — string-поле фильтра, ПЛАНИРОВОЧНЫЙ тир (как прочие field*);
 *   - backlogZones — [{ state, roles[] }] упорядоченный пайплайн (состояние→роль(и), MANY);
 *   - backlogStartStates / backlogTypeFilter / backlogPauseTags / backlogPauseStates — string[];
 *     все backlog* — admin-тир (спека §9), preserve-merge'атся для планировочного менеджера.
 *
 * Состав/раскладка (_roleItems, INC.PLANNED) НЕ затрагиваются — переиспуск as-is (см. спека §4, tech-note).
 */
const test   = require('node:test');
const assert = require('node:assert');
const path   = require('node:path');

const backend = require(path.join(__dirname, '..', '..', 'backend-project.js'));
const {
  validateSettings,
  ALLOWED_SETTINGS_KEYS,
  ADMIN_TIER_SETTINGS_KEYS,
  mergeAdminTierFromStored,
} = backend;

const BACKLOG_KEYS = ['backlogZones','backlogStartStates','backlogTypeFilter','backlogPauseTags','backlogPauseStates'];

/* ---- whitelist ---- */

test('fieldType + backlog* присутствуют в ALLOWED_SETTINGS_KEYS', function () {
  assert.ok(ALLOWED_SETTINGS_KEYS.indexOf('fieldType') >= 0, 'fieldType missing');
  BACKLOG_KEYS.forEach(function (k) {
    assert.ok(ALLOWED_SETTINGS_KEYS.indexOf(k) >= 0, k + ' missing in ALLOWED_SETTINGS_KEYS');
  });
});

test('backlog* — admin-тир, а fieldType — НЕ admin (планировочный, как прочие field*)', function () {
  BACKLOG_KEYS.forEach(function (k) {
    assert.ok(ADMIN_TIER_SETTINGS_KEYS.indexOf(k) >= 0, k + ' must be admin-tier');
  });
  assert.ok(ADMIN_TIER_SETTINGS_KEYS.indexOf('fieldType') < 0,
    'fieldType must stay planning-tier (sibling of field*)');
});

/* ---- validateSettings: happy path ---- */

test('validateSettings принимает полный валидный backlog-конфиг', function () {
  const s = {
    fieldType: 'Type',
    backlogZones: [
      { state: 'Анализ',        roles: ['analysis'] },
      { state: 'В разработке',  roles: ['devBack', 'devFront'] },   // MANY: состояние → несколько ролей
      { state: 'Тестирование',  roles: ['testing'] },
    ],
    backlogStartStates: ['Открыта', 'Новая'],
    backlogTypeFilter: ['Фича', 'Баг', 'Спайк'],
    backlogPauseTags: ['на паузе'],
    backlogPauseStates: ['Заблокирована'],
  };
  assert.strictEqual(validateSettings(s), true);
});

test('validateSettings принимает settings без backlog-ключей (backward compat)', function () {
  assert.strictEqual(validateSettings({ fieldState: 'State' }), true);
  assert.strictEqual(validateSettings({}), true);
});

test('validateSettings принимает null/пустые backlog-значения', function () {
  const s = {
    fieldType: null,
    backlogZones: [],
    backlogStartStates: null,
    backlogTypeFilter: [],
  };
  assert.strictEqual(validateSettings(s), true);
});

/* ---- validateSettings: rejects (trust boundary — роли из ROLE_KEYS) ---- */

test('reject: backlogZones с неизвестной ролью', function () {
  const s = { backlogZones: [{ state: 'X', roles: ['analysis', 'notARole'] }] };
  assert.strictEqual(validateSettings(s), false);
});

test('reject: backlogZones с дублирующимся состоянием', function () {
  const s = { backlogZones: [{ state: 'Анализ', roles: ['analysis'] }, { state: 'Анализ', roles: ['testing'] }] };
  assert.strictEqual(validateSettings(s), false);
});

test('reject: backlogZones с пустым/отсутствующим state', function () {
  assert.strictEqual(validateSettings({ backlogZones: [{ state: '', roles: ['analysis'] }] }), false);
  assert.strictEqual(validateSettings({ backlogZones: [{ roles: ['analysis'] }] }), false);
  assert.strictEqual(validateSettings({ backlogZones: [{ state: 123, roles: [] }] }), false);
});

test('reject: backlogZones не массив / roles не массив', function () {
  assert.strictEqual(validateSettings({ backlogZones: { state: 'X', roles: [] } }), false);
  assert.strictEqual(validateSettings({ backlogZones: [{ state: 'X', roles: 'analysis' }] }), false);
});

test('reject: backlogTypeFilter не массив строк', function () {
  assert.strictEqual(validateSettings({ backlogTypeFilter: [1, 2] }), false);
  assert.strictEqual(validateSettings({ backlogPauseTags: 'нет' }), false);
});

test('reject: fieldType не строка', function () {
  assert.strictEqual(validateSettings({ fieldType: 42 }), false);
});

test('reject: неизвестный ключ остаётся отвергнутым (whitelist не дырявый)', function () {
  assert.strictEqual(validateSettings({ backlogUnknown: 1 }), false);
});

/* ---- admin-tier preserve-merge: планировочный менеджер не может задать backlog* ---- */

test('mergeAdminTierFromStored: backlog* берётся из stored, incoming игнорируется', function () {
  const stored   = { backlogZones: [{ state: 'Анализ', roles: ['analysis'] }], fieldType: 'Type' };
  const incoming = { backlogZones: [{ state: 'ВЗЛОМ', roles: ['devBack'] }], fieldType: 'Hacked' };
  const out = mergeAdminTierFromStored(incoming, stored);
  // admin-тир: stored wins
  assert.deepStrictEqual(out.backlogZones, stored.backlogZones);
  // планировочный fieldType: incoming wins (не admin)
  assert.strictEqual(out.fieldType, 'Hacked');
});

test('mergeAdminTierFromStored: backlog-ключ удаляется, если его нет в stored (нельзя СОЗДАТЬ admin-ключ)', function () {
  const out = mergeAdminTierFromStored({ backlogTypeFilter: ['Фича'] }, {});
  assert.ok(!Object.prototype.hasOwnProperty.call(out, 'backlogTypeFilter'),
    'planning manager must not be able to create admin key');
});
