/* Fitness function M — карта кода актуальна.
 *
 * Documentation/CODE_MAP.md генерируется scripts/gen-code-map.js из реестра модулей,
 * заголовков файлов и ручного индекса «где что». Гейт роняет сборку в двух случаях:
 * (1) файл на диске не совпадает с генерацией (кто-то добавил модуль/эндпоинт и не
 * перегенерировал), (2) путь из ручного индекса больше не существует (карта врёт).
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const path = require('path');

test('M1 — Documentation/CODE_MAP.md совпадает с генерацией и все пути ручного индекса существуют', () => {
  const script = path.resolve(__dirname, '..', '..', 'scripts', 'gen-code-map.js');
  const r = spawnSync(process.execPath, [script, '--check'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, (r.stdout || '') + (r.stderr || ''));
});
