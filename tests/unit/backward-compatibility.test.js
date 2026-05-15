/**
 * v1.6.0 D125 — Backward-compatibility fixture test.
 *
 * Запуск: `node --test 'tests/unit/*.test.js'`
 *
 * Прогоняет каждую версионную папку tests/fixtures/snapshots/<version>/
 * через полную цепочку:
 *   migrateSprintObj / migrateHistoryArr → validate*ForRead → validate*ForWrite
 *
 * Контракты:
 *   - 1.4.2/sprint-baseline.json — legacy snapshot без pluginVersion.
 *     После migrate* получает pluginVersion = '1.4.2'.
 *   - Любая ≥1.6.0/ — snapshot уже со stamped pluginVersion.
 *   - Все fixture'ы должны пройти ForRead без ошибок.
 *   - Все fixture'ы должны пройти ForWrite (они написаны в соответствии с
 *     текущим whitelist'ом).
 *   - pluginVersion после migrate — равен CURRENT_PLUGIN_VERSION.
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
  validateSprintForRead,
  validateSprintForWrite,
  validateHistoryForRead,
  validateHistoryForWrite,
  validateWorkingDraftForRead,
  validateWorkingDraftForWrite,
  CURRENT_PLUGIN_VERSION,
} = backend;

const SNAP_ROOT = path.join(__dirname, '..', 'fixtures', 'snapshots');
const STATUS_CODES = ['PLANNING', 'CONFIRMED', 'ALLOCATED', 'FINISHED'];

const versions = fs.readdirSync(SNAP_ROOT)
  .filter(n => fs.statSync(path.join(SNAP_ROOT, n)).isDirectory())
  .sort();

// ─── Loop across all fixture versions ────────────────────────────────────────

versions.forEach(function (ver) {
  const dir = path.join(SNAP_ROOT, ver);

  // sprint-baseline
  test('fixture ' + ver + '/sprint-baseline: migrate → ForRead → ForWrite', function () {
    const raw  = JSON.parse(fs.readFileSync(path.join(dir, 'sprint-baseline.json'), 'utf8'));
    const snap = migrateSprintObj(JSON.parse(JSON.stringify(raw)));

    assert.ok(snap.pluginVersion, 'pluginVersion must be set after migrate');
    assert.ok(validateSprintForRead(snap),  'ForRead must accept migrated sprint-baseline');
    assert.ok(validateSprintForWrite(snap), 'ForWrite must accept migrated sprint-baseline');

    assert.ok(snap.sprintId, 'sprintId required');
    assert.ok(snap.name,     'name required');
    assert.ok(STATUS_CODES.indexOf(snap.status) >= 0, 'status must be valid');
  });

  // sprint-full
  test('fixture ' + ver + '/sprint-full: migrate → ForRead → ForWrite + personalPlanning', function () {
    const raw  = JSON.parse(fs.readFileSync(path.join(dir, 'sprint-full.json'), 'utf8'));
    const snap = migrateSprintObj(JSON.parse(JSON.stringify(raw)));

    assert.ok(snap.pluginVersion, 'pluginVersion must be set after migrate');
    assert.ok(validateSprintForRead(snap),  'ForRead must accept migrated sprint-full');
    assert.ok(validateSprintForWrite(snap), 'ForWrite must accept migrated sprint-full');

    assert.ok(snap.personalPlanning && typeof snap.personalPlanning === 'object',
              'sprint-full must have non-empty personalPlanning');
    assert.ok(Object.keys(snap.personalPlanning).length > 0, 'personalPlanning must not be empty');
  });

  // history
  test('fixture ' + ver + '/history: migrate → ForRead → ForWrite (≥2 records)', function () {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, 'history.json'), 'utf8'));
    const arr = migrateHistoryArr(JSON.parse(JSON.stringify(raw)));

    assert.ok(Array.isArray(arr), 'history must be array');
    assert.ok(arr.length >= 2,   'history must have ≥ 2 records');

    assert.ok(validateHistoryForRead(arr),  'ForRead must accept migrated history');
    assert.ok(validateHistoryForWrite(arr), 'ForWrite must accept migrated history');

    arr.forEach(function (rec, i) {
      assert.ok(rec.sprintId,   'history[' + i + '].sprintId required');
      assert.ok(rec.pluginVersion, 'history[' + i + '].pluginVersion must be set after migrate');
      assert.ok(STATUS_CODES.indexOf(rec.status) >= 0, 'history[' + i + '].status must be valid');
    });
  });

  // working-draft
  test('fixture ' + ver + '/working-draft: ForRead → ForWrite (no migrate — drafts not in storage)', function () {
    const raw  = JSON.parse(fs.readFileSync(path.join(dir, 'working-draft.json'), 'utf8'));
    // Working drafts are per-user in localStorage, not in entity props.
    // They are not passed through migrateSprintObj/migrateHistoryArr on the server.
    // ForRead / ForWrite operate on them as-is.
    assert.ok(validateWorkingDraftForRead(raw),  'ForRead must accept working-draft');
    assert.ok(validateWorkingDraftForWrite(raw), 'ForWrite must accept working-draft');
    assert.strictEqual(typeof raw.schemaVersion, 'number', 'schemaVersion must be number');
  });
});

// ─── Specific version contracts ───────────────────────────────────────────────

test('fixture 1.4.2/sprint-baseline: pluginVersion absent before migrate', function () {
  const raw = JSON.parse(fs.readFileSync(
    path.join(SNAP_ROOT, '1.4.2', 'sprint-baseline.json'), 'utf8'));
  assert.strictEqual(raw.pluginVersion, undefined,
    '1.4.2 fixture must not contain pluginVersion — frozen contract');
});

test('fixture 1.4.2: after migrateSprintObj pluginVersion becomes CURRENT_PLUGIN_VERSION', function () {
  const raw  = JSON.parse(fs.readFileSync(
    path.join(SNAP_ROOT, '1.4.2', 'sprint-baseline.json'), 'utf8'));
  const snap = migrateSprintObj(JSON.parse(JSON.stringify(raw)));
  assert.strictEqual(snap.pluginVersion, CURRENT_PLUGIN_VERSION);
});

test('fixture 1.4.2: history records get BASELINE_ASSUMED audit entry in migrationLog', function () {
  const raw = JSON.parse(fs.readFileSync(
    path.join(SNAP_ROOT, '1.4.2', 'history.json'), 'utf8'));
  const arr = migrateHistoryArr(JSON.parse(JSON.stringify(raw)));
  arr.forEach(function (rec, i) {
    assert.ok(Array.isArray(rec.migrationLog), 'migrationLog must be array after migrate');
    const baselineEntry = rec.migrationLog.find(function (e) { return e.level === 'BASELINE_ASSUMED'; });
    assert.ok(baselineEntry, 'history[' + i + '] must have BASELINE_ASSUMED entry in migrationLog');
    assert.strictEqual(baselineEntry.toVersion, '1.4.2');
  });
});

test('fixture 1.6.0: sprint-baseline already has pluginVersion = "1.6.0"', function () {
  const raw = JSON.parse(fs.readFileSync(
    path.join(SNAP_ROOT, '1.6.0', 'sprint-baseline.json'), 'utf8'));
  assert.strictEqual(raw.pluginVersion, '1.6.0');
});

test('fixture 1.6.0: history records already have pluginVersion = "1.6.0"', function () {
  const arr = JSON.parse(fs.readFileSync(
    path.join(SNAP_ROOT, '1.6.0', 'history.json'), 'utf8'));
  arr.forEach(function (rec, i) {
    assert.strictEqual(rec.pluginVersion, '1.6.0',
      'history[' + i + '] missing pluginVersion in 1.6.0 fixture');
  });
});

test('ForRead is tolerant: sprint with unknown future key passes', function () {
  const snap = {
    sprintId: 'test-forward-compat',
    name:     'Test',
    status:   'PLANNING',
    dateStart:  1779148800000,
    dateEnd:    1780358400000,
    updatedBy:  'test_user',
    updatedAt:  1779148800000,
    pluginVersion: '9.9.9',
    unknownFutureKey: 'some value from future plugin version',
  };
  assert.ok(validateSprintForRead(snap),  'ForRead must accept sprint with unknown key');
  assert.ok(!validateSprintForWrite(snap), 'ForWrite must reject sprint with unknown key');
});
