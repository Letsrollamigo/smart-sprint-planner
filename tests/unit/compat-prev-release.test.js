/**
 * v1.6.0 D125 — Compat-prev-release CI guard.
 *
 * Гарантирует, что все fixture'ы предыдущих версий по-прежнему проходят
 * через полную цепочку migrate* → validate*ForWrite текущей версии плагина.
 *
 * Если fixture v<prev> загружается без invalid_*_structure, апгрейд с предыдущей
 * версии на текущую прозрачен для пользователя.
 *
 * Набор fixture'ов (с 2026-08-22, #69 строка 24) — только версии-границы схемы, не каждый
 * релиз: каталоги читаются динамически, см. tests/fixtures/snapshots/README.md.
 *
 * Тест фейлится, если:
 *   - fixture существует, но после migrate* НЕ проходит ForWrite.
 *   - fixture существует, но НЕ имеет pluginVersion после migrate*.
 */
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const path   = require('node:path');
const fs     = require('node:fs');

const backend = require(path.join(__dirname, '..', '..', 'backend-project.js'));
const {
  migrateSprintObj,
  migrateHistoryArr,
  validateSprintForWrite,
  validateHistoryForWrite,
  validateWorkingDraftForWrite,
  CURRENT_PLUGIN_VERSION,
} = backend;

const SNAP_ROOT = path.join(__dirname, '..', 'fixtures', 'snapshots');

const allVersions = fs.readdirSync(SNAP_ROOT)
  .filter(n => fs.statSync(path.join(SNAP_ROOT, n)).isDirectory())
  .sort();

// Тестируем все версии КРОМЕ текущей (их тестирует backward-compatibility.test.js).
// Compat-prev-release: фокус на «старый fixture в новом коде».
const prevVersions = allVersions.filter(function (v) {
  return v !== CURRENT_PLUGIN_VERSION;
});

prevVersions.forEach(function (ver) {
  const dir = path.join(SNAP_ROOT, ver);

  test('compat-prev-release ' + ver + ' → ' + CURRENT_PLUGIN_VERSION + ': sprint-baseline', function () {
    const raw  = JSON.parse(fs.readFileSync(path.join(dir, 'sprint-baseline.json'), 'utf8'));
    const snap = migrateSprintObj(JSON.parse(JSON.stringify(raw)));
    assert.ok(snap.pluginVersion, 'pluginVersion set after migrate (version: ' + ver + ')');
    assert.ok(validateSprintForWrite(snap),
      'sprint-baseline from v' + ver + ' must pass ForWrite after migrate');
  });

  test('compat-prev-release ' + ver + ' → ' + CURRENT_PLUGIN_VERSION + ': sprint-full', function () {
    const raw  = JSON.parse(fs.readFileSync(path.join(dir, 'sprint-full.json'), 'utf8'));
    const snap = migrateSprintObj(JSON.parse(JSON.stringify(raw)));
    assert.ok(snap.pluginVersion, 'pluginVersion set after migrate');
    assert.ok(validateSprintForWrite(snap),
      'sprint-full from v' + ver + ' must pass ForWrite after migrate');
  });

  test('compat-prev-release ' + ver + ' → ' + CURRENT_PLUGIN_VERSION + ': history', function () {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, 'history.json'), 'utf8'));
    const arr = migrateHistoryArr(JSON.parse(JSON.stringify(raw)));
    assert.ok(validateHistoryForWrite(arr),
      'history from v' + ver + ' must pass ForWrite after migrate');
    arr.forEach(function (rec, i) {
      assert.ok(rec.pluginVersion, 'history[' + i + '].pluginVersion set after migrate (v' + ver + ')');
    });
  });

  test('compat-prev-release ' + ver + ' → ' + CURRENT_PLUGIN_VERSION + ': working-draft', function () {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, 'working-draft.json'), 'utf8'));
    assert.ok(validateWorkingDraftForWrite(raw),
      'working-draft from v' + ver + ' must pass ForWrite (no migrate for drafts)');
  });
});

// Sanity: есть хотя бы одна предыдущая версия для проверки.
test('compat-prev-release: есть хотя бы одна предыдущая версия fixture', function () {
  assert.ok(prevVersions.length >= 1,
    'Должна быть минимум одна предыдущая версия fixture; есть только: ' + allVersions.join(', '));
});
