/* #57-2 (эпик 57) — блокировка создания спринтов: pure-детект создания
 * (isNewSprintCreation — гейт sprint-data), валидация тела POST sprint-lock и
 * приём новых settings-ключей (blockSprintCreation / sprintLockGroups*) whitelist'ом.
 * Запуск: node --test 'tests/unit/sprint-lock.test.js'. */
'use strict';
const test   = require('node:test');
const assert = require('node:assert');
const path   = require('node:path');

const backend = require(path.join(__dirname, '..', '..', 'backend-project.js'));
const lock    = require(path.join(__dirname, '..', '..', 'backend-sprintlock.js'));
const { isNewSprintCreation, validateSettings } = backend;

/* ---- isNewSprintCreation: детект «это создание нового спринта» ---- */

const SLOT = { sprintId: 'sp-aaa', name: 'Спринт 1' };
const HIST = [{ sprintId: 'sp-old1' }, null, { sprintId: 'sp-old2' }];

test('новый sprintId (нет ни в слоте, ни в истории) → создание', () => {
  assert.strictEqual(isNewSprintCreation({ sprintId: 'sp-new' }, SLOT, HIST), true);
});

test('sprintId совпадает со слотом → НЕ создание (обычное сохранение)', () => {
  assert.strictEqual(isNewSprintCreation({ sprintId: 'sp-aaa' }, SLOT, HIST), false);
});

test('sprintId из истории → НЕ создание (переключение на исторический/PLANNING)', () => {
  assert.strictEqual(isNewSprintCreation({ sprintId: 'sp-old2' }, SLOT, HIST), false);
});

test('без sprintId / без sprint → НЕ создание (гейт не мешает прочим веткам)', () => {
  assert.strictEqual(isNewSprintCreation({}, SLOT, HIST), false);
  assert.strictEqual(isNewSprintCreation(null, SLOT, HIST), false);
});

test('пустой слот и пустая история → новый id = создание (первый спринт проекта)', () => {
  assert.strictEqual(isNewSprintCreation({ sprintId: 'sp-first' }, null, []), true);
  assert.strictEqual(isNewSprintCreation({ sprintId: 'sp-first' }, null, 'мусор'), true); // graceful не-массив
});

/* ---- validateSprintLockBody: тело POST sprint-lock ---- */

test('sprint-lock body: {locked:bool} валиден, прочее — reject', () => {
  assert.strictEqual(lock.validateSprintLockBody({ locked: true }), true);
  assert.strictEqual(lock.validateSprintLockBody({ locked: false }), true);
  assert.strictEqual(lock.validateSprintLockBody({ locked: 'true' }), false);
  assert.strictEqual(lock.validateSprintLockBody({ locked: true, extra: 1 }), false);  // whitelist
  assert.strictEqual(lock.validateSprintLockBody({}), false);
  assert.strictEqual(lock.validateSprintLockBody(null), false);
  assert.strictEqual(lock.validateSprintLockBody([true]), false);
});

/* ---- whitelist настроек: новые ключи принимаются, типы валидируются ---- */

test('validateSettings: blockSprintCreation bool + sprintLockGroups/Names str[] проходят', () => {
  assert.strictEqual(validateSettings({
    blockSprintCreation: true,
    sprintLockGroups: ['1-42'], sprintLockGroupNames: ['Тимлиды'],
  }), true);
});

test('validateSettings: blockSprintCreation не-bool / не-массив групп — reject', () => {
  assert.strictEqual(validateSettings({ blockSprintCreation: 'yes' }), false);
  assert.strictEqual(validateSettings({ sprintLockGroups: '1-42' }), false);
  assert.strictEqual(validateSettings({ sprintLockGroupNames: [42] }), false);
});
