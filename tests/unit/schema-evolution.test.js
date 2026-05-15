/**
 * v1.6.0 D125 — Schema-evolution CI guard.
 *
 * Если whitelist в текущей ветке расширен относительно main (git show main:schema/whitelists.json),
 * в SCHEMA_MIGRATIONS ОБЯЗАНА быть запись с `to === CURRENT_PLUGIN_VERSION`,
 * ИЛИ должна существовать директория tests/fixtures/snapshots/<CURRENT_PLUGIN_VERSION>/.
 *
 * Защищает от случайного расширения whitelist'а без сопроводительного migration step
 * и fixture для новой версии.
 *
 * Если main не содержит schema/whitelists.json (например, первый PR в репозиторий),
 * тест пропускается.
 */
'use strict';

const test          = require('node:test');
const assert        = require('node:assert');
const path          = require('node:path');
const fs            = require('node:fs');
const { execSync }  = require('node:child_process');

const backend = require(path.join(__dirname, '..', '..', 'backend-project.js'));
const { SCHEMA_MIGRATIONS, CURRENT_PLUGIN_VERSION } = backend;

const SCHEMA_PATH = path.join(__dirname, '..', '..', 'schema', 'whitelists.json');
const SNAP_ROOT   = path.join(__dirname, '..', 'fixtures', 'snapshots');

const current = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));

let mainSchema = null;
try {
  const raw = execSync('git show main:schema/whitelists.json', { encoding: 'utf8' });
  mainSchema = JSON.parse(raw);
} catch (_) {
  mainSchema = null; // main doesn't have this file yet — skip
}

test('schema-evolution: если whitelist расширен — есть SCHEMA_MIGRATIONS entry или fixture dir', function () {
  if (!mainSchema) {
    // Нет main-версии файла — первый PR, пропускаем.
    return;
  }

  const lists = ['ALLOWED_SPRINT_KEYS', 'ALLOWED_HISTORY_SNAP_KEYS', 'ALLOWED_WORKING_DRAFT_KEYS'];
  const allAdded = [];

  for (const k of lists) {
    const mainKeys    = mainSchema[k] || [];
    const currentKeys = current[k]   || [];
    const added = currentKeys.filter(function (v) { return mainKeys.indexOf(v) < 0; });
    if (added.length > 0) allAdded.push({ list: k, added: added });
  }

  if (allAdded.length === 0) {
    // Нет расширений — guard не нужен.
    return;
  }

  const addedSummary = allAdded.map(function (a) {
    return a.list + ': +' + JSON.stringify(a.added);
  }).join('; ');

  const hasMigration = SCHEMA_MIGRATIONS.some(function (s) {
    return s.to === CURRENT_PLUGIN_VERSION;
  });

  const fixtureDir   = path.join(SNAP_ROOT, CURRENT_PLUGIN_VERSION);
  const hasFixture   = fs.existsSync(fixtureDir);

  assert.ok(hasMigration || hasFixture,
    'Whitelist расширен: ' + addedSummary +
    '\nТребуется SCHEMA_MIGRATIONS запись с to="' + CURRENT_PLUGIN_VERSION +
    '" ИЛИ директория tests/fixtures/snapshots/' + CURRENT_PLUGIN_VERSION + '/');
});
