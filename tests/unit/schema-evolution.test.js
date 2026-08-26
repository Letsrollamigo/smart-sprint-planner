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

/* v3.29.1 — регресс на мета-схему settings.json.
   YouTrack компилирует схему параметров приложения валидатором, который знает
   мета-схему draft-07 ТОЛЬКО по `http://json-schema.org/draft-07/schema#`.
   Вариант с `https://` не резолвится → форма параметров всегда невалидна и не
   сохраняется вовсе. Цена дефекта высока непропорционально размеру: ключ
   settingsManagerGroup задаётся только оттуда, поэтому новый проект остаётся
   в read-only без обходного пути через интерфейс (см. CHANGELOG 3.29.1). */
test('settings.json: мета-схема указана по http (иначе YouTrack не сохраняет параметры приложения)', function () {
  const appSettings = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', '..', 'settings.json'), 'utf8'));
  assert.strictEqual(appSettings.$schema, 'http://json-schema.org/draft-07/schema#',
    'Мета-схема settings.json должна быть по http://: валидатор YouTrack не знает её по https:// ' +
    'и отклоняет сохранение всей формы параметров приложения.');
});
