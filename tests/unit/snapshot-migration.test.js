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

/* v3.6.0 — реестр свёрнут: 14 исторических no-op записей (1.6.0 → … → 2.14.0,
   аудит 2026-07-12 V13) заменены одной. hideDiagLogUi hard-removal живёт в
   settings-whitelist, не здесь (снапшоты shape не меняли).
   v3.23.0 — вторая запись 3.6.0 → 3.23.0 (#69 строка 27 шаг 2): delete
   editingFromHistory/historyIdx из снимка спринта.
   v3.28.0 — четвёртая запись 3.27.0 → 3.28.0 (#74): аддитивный settings-ключ
   linkTypeRoles, снимки shape не меняли → тоже no-op.
   v3.27.0 — третья запись 3.23.0 → 3.27.0 (#73): аддитивный optional ключ
   roles (роли-участницы спринта), миграция no-op. */
test('SCHEMA_MIGRATIONS: свёрнутая 1.4.2 → 3.6.0 + hard-removal 3.6.0 → 3.23.0 + no-op 3.23.0 → 3.27.0 → 3.28.0', function () {
  assert.ok(Array.isArray(SCHEMA_MIGRATIONS));
  assert.strictEqual(SCHEMA_MIGRATIONS.length, 4,
    'Registry: свёрнутая запись + 3.23.0 + 3.27.0 + 3.28.0; при следующем schema-change добавляй from="3.28.0"');
  assert.strictEqual(SCHEMA_MIGRATIONS[0].from, '1.4.2');
  assert.strictEqual(SCHEMA_MIGRATIONS[0].to, '3.6.0');
  assert.strictEqual(SCHEMA_MIGRATIONS[1].from, '3.6.0');
  assert.strictEqual(SCHEMA_MIGRATIONS[1].to, '3.23.0');
  assert.strictEqual(typeof SCHEMA_MIGRATIONS[1].migrate, 'function');
  assert.strictEqual(SCHEMA_MIGRATIONS[2].from, '3.23.0');
  assert.strictEqual(SCHEMA_MIGRATIONS[2].to, '3.27.0');
  assert.strictEqual(SCHEMA_MIGRATIONS[3].from, '3.27.0');
  assert.strictEqual(SCHEMA_MIGRATIONS[3].to, '3.28.0');
  assert.strictEqual(typeof SCHEMA_MIGRATIONS[2].migrate, 'function');
});

test('migrateSnap: legacy snapshot получает четыре SCHEMA_BUMP — 3.6.0, 3.23.0, 3.27.0, 3.28.0', function () {
  const snap = { pluginVersion: '2.14.0', editingFromHistory: false, historyIdx: 1 };
  migrateSnap(snap);
  assert.strictEqual(snap.pluginVersion, CURRENT_PLUGIN_VERSION);
  const bumps = (snap.migrationLog || []).filter(function (e) { return e.level === 'SCHEMA_BUMP'; }).map(function (e) { return e.toVersion; });
  assert.deepStrictEqual(bumps, ['3.6.0', '3.23.0', '3.27.0', '3.28.0']);
  assert.ok(!('editingFromHistory' in snap) && !('historyIdx' in snap), 'legacy-ключи вычищены миграцией');
});

test('migrateSnap: snapshot на 3.23.0 — два SCHEMA_BUMP до 3.28.0; на 3.28.0 — ни одного', function () {
  const snap = { pluginVersion: '3.23.0' };
  migrateSnap(snap);
  assert.strictEqual(snap.pluginVersion, '3.28.0');
  assert.deepStrictEqual(snap.migrationLog.map(function (e) { return e.fromVersion + '→' + e.toVersion; }), ['3.23.0→3.27.0', '3.27.0→3.28.0']);
  const cur = { pluginVersion: '3.28.0' };
  migrateSnap(cur);
  assert.ok(!cur.migrationLog, 'migrationLog не должен появиться');
});

test('CURRENT_PLUGIN_VERSION matches semver pattern', function () {
  assert.ok(/^\d+\.\d+\.\d+$/.test(CURRENT_PLUGIN_VERSION),
    'CURRENT_PLUGIN_VERSION must be X.Y.Z, got: ' + CURRENT_PLUGIN_VERSION);
});
