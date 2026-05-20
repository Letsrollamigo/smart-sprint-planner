/**
 * v1.6.0 D125 — Unit tests for the schema migration engine.
 *
 * Покрывает:
 *   versionLt()             — semver-компаратор
 *   _appendMigrationLog()   — audit-trail helper
 *   migrateSnap()           — chain executor (пустой registry в v1.6.0)
 *   BASELINE_ASSUMED        — поведение при pluginVersion = undefined/null
 *   CURRENT_PLUGIN_VERSION  — значение совпадает с ALLOWED lists context
 */
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const path   = require('node:path');

const backend = require(path.join(__dirname, '..', '..', 'backend-project.js'));
const {
  versionLt,
  _appendMigrationLog,
  migrateSnap,
  SCHEMA_MIGRATIONS,
  CURRENT_PLUGIN_VERSION,
} = backend;

// ─── versionLt ───────────────────────────────────────────────────────────────

test('versionLt: 1.0.0 < 1.0.1', function () {
  assert.ok(versionLt('1.0.0', '1.0.1'));
});

test('versionLt: 1.0.0 < 2.0.0', function () {
  assert.ok(versionLt('1.0.0', '2.0.0'));
});

test('versionLt: equal versions → false', function () {
  assert.ok(!versionLt('1.6.0', '1.6.0'));
});

test('versionLt: 2.0.0 is not < 1.9.9', function () {
  assert.ok(!versionLt('2.0.0', '1.9.9'));
});

test('versionLt: unset < any version', function () {
  assert.ok(versionLt('unset', '1.0.0'));
  assert.ok(versionLt(null,    '1.0.0'));
  assert.ok(versionLt('',      '1.0.0'));
});

test('versionLt: any version is not < unset', function () {
  assert.ok(!versionLt('1.0.0', 'unset'));
});

// ─── _appendMigrationLog ─────────────────────────────────────────────────────

test('_appendMigrationLog: creates array if absent', function () {
  const snap = {};
  _appendMigrationLog(snap, { at: 1000, level: 'TEST', fromVersion: 'a', toVersion: 'b' });
  assert.ok(Array.isArray(snap.migrationLog));
  assert.strictEqual(snap.migrationLog.length, 1);
  assert.strictEqual(snap.migrationLog[0].level, 'TEST');
});

test('_appendMigrationLog: caps at 50 entries', function () {
  const snap = { migrationLog: [] };
  for (let i = 0; i < 55; i++) {
    _appendMigrationLog(snap, { at: i, level: 'X', fromVersion: '1', toVersion: '2' });
  }
  assert.strictEqual(snap.migrationLog.length, 50);
  // Should keep the LAST 50
  assert.strictEqual(snap.migrationLog[0].at, 5);
});

// ─── migrateSnap ─────────────────────────────────────────────────────────────

test('migrateSnap: empty registry sets pluginVersion = target', function () {
  const snap = { pluginVersion: '1.0.0' };
  migrateSnap(snap, '1.6.0');
  assert.strictEqual(snap.pluginVersion, '1.6.0');
});

test('migrateSnap: empty registry leaves snap otherwise unchanged', function () {
  const snap = { pluginVersion: '1.4.2', sprintId: 'x', name: 'y' };
  migrateSnap(snap, '1.6.0');
  assert.strictEqual(snap.sprintId, 'x');
  assert.strictEqual(snap.name, 'y');
});

test('migrateSnap: null/undefined snap returns as-is without error', function () {
  assert.strictEqual(migrateSnap(null, '1.6.0'), null);
  assert.strictEqual(migrateSnap(undefined, '1.6.0'), undefined);
});

test('migrateSnap: defaults target to CURRENT_PLUGIN_VERSION', function () {
  const snap = { pluginVersion: '1.0.0' };
  migrateSnap(snap);
  assert.strictEqual(snap.pluginVersion, CURRENT_PLUGIN_VERSION);
});

test('SCHEMA_MIGRATIONS has expected entries (v1.7.0 State Rollup + v1.8.0 External ticket ID + v1.9.0 Sprint goals + v1.9.3 status-contamination hotfix + v1.9.4 visual refresh)', function () {
  assert.ok(Array.isArray(SCHEMA_MIGRATIONS));
  assert.strictEqual(SCHEMA_MIGRATIONS.length, 5,
    'Registry should have 5 entries; update this test when next entry is added');
  assert.strictEqual(SCHEMA_MIGRATIONS[0].to, '1.7.0');
  assert.strictEqual(typeof SCHEMA_MIGRATIONS[0].migrate, 'function');
  /* v1.8.0 D130 — second entry: external ticket ID (no-op additive migration). */
  assert.strictEqual(SCHEMA_MIGRATIONS[1].to, '1.8.0');
  assert.strictEqual(typeof SCHEMA_MIGRATIONS[1].migrate, 'function');
  /* v1.9.0 D132 — third entry: sprint goals + standup settings (no-op additive). */
  assert.strictEqual(SCHEMA_MIGRATIONS[2].to, '1.9.0');
  assert.strictEqual(typeof SCHEMA_MIGRATIONS[2].migrate, 'function');
  /* v1.9.3 D134 — fourth entry: per-role status contamination hotfix (no-op, pure runtime). */
  assert.strictEqual(SCHEMA_MIGRATIONS[3].to, '1.9.3');
  assert.strictEqual(typeof SCHEMA_MIGRATIONS[3].migrate, 'function');
  /* v1.9.4 D135 — fifth entry: visual refresh (icon swap, no-op). */
  assert.strictEqual(SCHEMA_MIGRATIONS[4].to, '1.9.4');
  assert.strictEqual(typeof SCHEMA_MIGRATIONS[4].migrate, 'function');
});

test('CURRENT_PLUGIN_VERSION matches semver pattern', function () {
  assert.ok(/^\d+\.\d+\.\d+$/.test(CURRENT_PLUGIN_VERSION),
    'CURRENT_PLUGIN_VERSION must be X.Y.Z, got: ' + CURRENT_PLUGIN_VERSION);
});
