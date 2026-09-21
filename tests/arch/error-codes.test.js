/* Fitness function — реестр кодов отказов актуален и полон.
 *
 * Integrations/error-codes.json и ERROR_CODES.md генерируются scripts/gen-error-codes.js из
 * backend-*.js и описаний error-codes.notes.json. Гейт роняет сборку, если: (1) файлы не совпадают
 * с генерацией; (2) у кода нет описания, описание протухло либо код передан в хелпер не литералом;
 * (3) публикуемого кода нет в Integrations/openapi-sprint.yaml; (4) `success: false` написан мимо
 * пяти хелперов ядра.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const path = require('path');

test('error-codes — реестр совпадает с генерацией, описания полны, публикуемые коды есть в контракте, success:false только в хелперах ядра', () => {
  const script = path.resolve(__dirname, '..', '..', 'scripts', 'gen-error-codes.js');
  const r = spawnSync(process.execPath, [script, '--check'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, (r.stdout || '') + (r.stderr || ''));
});
