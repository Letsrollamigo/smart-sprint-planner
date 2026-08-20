'use strict';

/* #67 A6 — инвариант «матрица доступа SECURITY = код».
 * Doc-drift был гейтом приёмки аудита #67: матрица описывала 26 endpoints из 39
 * фактических и разъехалась с кодом по ролям. Тест парсит таблицы между якорями
 * <!-- authz-matrix:project|global:begin/end --> и сверяет множество (method, path)
 * с фактическим реестром core.ENDPOINTS (+ собственные endpoints backend-global).
 * Рассинхрон в любую сторону — красный. Роли по строкам не сверяются (семантика
 * веток не извлекается из кода автоматически) — за ними следит authz-67.test.js.
 *
 * Файлы: corp — Documentation/SECURITY.md; community — Documentation/SECURITY.ru.md
 * + .github/SECURITY.md. Тест берёт все существующие из списка кандидатов —
 * файл теста fork-identical.
 *
 * Запуск: node --test 'tests/unit/security-matrix-invariant.test.js'. */

const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('fs');
const path   = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const core = require(path.join(ROOT, 'backend-project.js'));
const glob = require(path.join(ROOT, 'backend-global.js'));

/* ── фактический реестр из кода ──────────────────────────────────────────── */

const projectActual = new Set(core.ENDPOINTS.map((e) => e.method + ' ' + e.path));

/* Собственные endpoints global-handler'а = те, чьей пары (method, path) нет среди
   делегированных зеркал project-реестра (sync-acl/app-version зеркала пропускают,
   app-version у global — собственная статика). */
const globalActual = new Set(
  glob.httpHandler.endpoints
    .map((e) => e.method + ' ' + e.path)
    .filter((mp) => !projectActual.has(mp) || mp === 'GET app-version')
);

/* ── парсинг матрицы из markdown ─────────────────────────────────────────── */

function extractBlock(md, name, file) {
  const begin = '<!-- authz-matrix:' + name + ':begin -->';
  const end   = '<!-- authz-matrix:' + name + ':end -->';
  const i = md.indexOf(begin), j = md.indexOf(end);
  assert.ok(i >= 0 && j > i, file + ': не найден блок ' + begin + ' … ' + end);
  return md.slice(i + begin.length, j);
}

/* Строка таблицы → (method, base path): путь берём из первого `…`-спана до
   разделителя ?action / пробела / (body-пометки. */
function parseRows(block, file) {
  const rows = new Set();
  for (const line of block.split('\n')) {
    const m = line.match(/^\|\s*(GET|POST|PUT|DELETE)\s*\|\s*`([^`]+)`/);
    if (!m) continue;
    const basePath = m[2].split('?')[0].split(' ')[0].trim();
    assert.ok(basePath.length > 0, file + ': пустой path в строке: ' + line);
    rows.add(m[1] + ' ' + basePath);
  }
  return rows;
}

function diff(a, b) { return [...a].filter((x) => !b.has(x)).sort(); }

/* ── файлы-кандидаты (per-fork) ──────────────────────────────────────────── */

const CANDIDATES = [
  'Documentation/SECURITY.md',      // corp
  'Documentation/SECURITY.ru.md',   // community (RU)
  '.github/SECURITY.md'             // community (EN, GitHub tab)
];
const files = CANDIDATES.filter((f) => fs.existsSync(path.join(ROOT, f)));

test('SECURITY: хотя бы один файл с матрицей существует', () => {
  assert.ok(files.length > 0, 'ни одного SECURITY-файла из ' + CANDIDATES.join(', '));
});

for (const f of files) {
  const md = fs.readFileSync(path.join(ROOT, f), 'utf8');

  test(`${f}: project-матрица покрывает все endpoints кода и не содержит лишних`, () => {
    const doc = parseRows(extractBlock(md, 'project', f), f);
    assert.deepStrictEqual(diff(projectActual, doc), [],
      f + ': endpoints кода отсутствуют в матрице (добавь строки)');
    assert.deepStrictEqual(diff(doc, projectActual), [],
      f + ': строки матрицы не существуют в core.ENDPOINTS (удали или поправь)');
  });

  test(`${f}: global-матрица = собственные endpoints backend-global`, () => {
    const doc = parseRows(extractBlock(md, 'global', f), f);
    assert.deepStrictEqual(diff(globalActual, doc), [],
      f + ': собственные global-endpoints отсутствуют в матрице');
    assert.deepStrictEqual(diff(doc, globalActual), [],
      f + ': строки global-матрицы не существуют в backend-global');
  });

  test(`${f}: шапка заявляет текущую версию плагина`, () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
    assert.ok(md.includes('**' + manifest.version + '**'),
      f + ': «Актуально для версии» ≠ manifest.version (' + manifest.version + ') — обнови шапку при бампе');
  });
}
