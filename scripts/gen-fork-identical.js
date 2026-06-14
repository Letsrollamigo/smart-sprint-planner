/* scripts/gen-fork-identical.js — генератор tests/mirror/fork-identical.json.
 *
 * Вычисляет набор модулей, namespace-sed-идентичных между форками СЕЙЧАС (canonical
 * corp→comm). Это baseline для mirror-parity-гейта (④): перечисленные файлы обязаны
 * оставаться идентичными. Запуск из corp-репо (canonical-направление):
 *   node scripts/gen-fork-identical.js
 * Результат байт-идентичен в обоих форках (parity.test.js сам реверсит sed по своему namespace).
 */
'use strict';
const path = require('path');
const fs = require('fs');
const lib = require(path.join(__dirname, '..', 'tests', 'arch', '_lib.js'));

const ROOT = path.join(__dirname, '..');
const APPS = path.join(ROOT, '..');
const SED = [['__XFORK_', '__SSP_'], ['ssp_', 'ssp_'], ['scbt-', 'ssp-']];

/* sibling = другой проект под ~/internal/ (comm). */
const SIB_NAMES = ['Smart Sprint Planner', 'Internal Fork'];
let sibSrc = null;
const ownSrc = path.join(ROOT, 'widgets', 'main', 'src');
for (const n of SIB_NAMES) {
  const cand = path.join(APPS, n, 'widgets', 'main', 'src');
  if (cand !== ownSrc && fs.existsSync(cand)) { sibSrc = cand; break; }
}
if (!sibSrc) { console.error('sibling-форк не найден'); process.exit(1); }

const ownIsCorp = fs.readFileSync(path.join(ownSrc, 'core.js'), 'utf8').includes('__XFORK_');
const sed = ownIsCorp ? SED : SED.map(([a, b]) => [b, a]);
function toSibling(s) { for (const [a, b] of sed) s = s.split(a).join(b); return s; }

const identical = [];
for (const f of lib.listModules()) {
  const sp = path.join(sibSrc, f);
  if (!fs.existsSync(sp)) continue;
  if (toSibling(fs.readFileSync(path.join(ownSrc, f), 'utf8')) === fs.readFileSync(sp, 'utf8')) {
    identical.push(f);
  }
}
identical.sort();

fs.writeFileSync(path.join(ROOT, 'tests', 'mirror', 'fork-identical.json'), JSON.stringify({
  note: 'Модули, namespace-sed-идентичные между форками (baseline mirror-parity-гейта). Перегенерация — node scripts/gen-fork-identical.js. Дивергентные файлы (per-fork комменты/литералы) — НЕ здесь.',
  generatedBy: 'scripts/gen-fork-identical.js',
  sed: SED, // canonical corp→comm; parity.test.js реверсит по своему namespace
  identical,
}, null, 2) + '\n');
console.log(`fork-identical.json: ${identical.length}/${lib.listModules().length} модулей идентичны`);
