/* Fitness function ④ — cross-fork mirror parity (anti-DRIFT, не anti-regrowth).
 *
 * Самая хрупкая ручная операция проекта — зеркалирование corp↔comm namespace-sed'ом.
 * Зелёный свой trunk НЕ гарантирует зелёный sibling-trunk: реверс-sed молча ломается
 * в форк-дивергентных зонах (память: `(scbt_/ssp_)→(ssp_/ssp_)`), а ничто это не ловит.
 * Гейт: модули из allowlist (fork-identical на момент заморозки) обязаны round-trip'ить
 * namespace-sed'ом между форками. Если файл, бывший идентичным, разошёлся — красный.
 *
 * Fork-aware: определяет свой namespace по core.js и sed'ит В СТОРОНУ sibling-форка,
 * поэтому тест байт-идентичен в обоих форках и запускается из любого.
 *
 * unit-run: SKIP, если sibling-репо не найден (co-location зависимость).
 * release-run: release-check.sh ОБЯЗАН трактовать absent/stale-sibling как FAIL —
 * нельзя резать релиз-пару вслепую к зеркалу (см. Spec/ARCH_FITNESS_FUNCTIONS_SPEC.md).
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const OWN_SRC = path.resolve(__dirname, '..', '..', 'widgets', 'main', 'src');
const APPS_DIR = path.resolve(__dirname, '..', '..', '..'); // ~/Youtrack APPS
const allow = require('./fork-identical.json');

/* Определяем свой форк по namespace в core.js. */
const ownIsCorp = fs.readFileSync(path.join(OWN_SRC, 'core.js'), 'utf8').includes('__SCBT_');
/* sed В СТОРОНУ sibling: corp→comm как в allow.sed; comm→corp — реверс пар. */
const sed = ownIsCorp ? allow.sed : allow.sed.map(([a, b]) => [b, a]);
/* Каталог sibling-форка (другой проект под ~/Youtrack APPS/). */
const SIBLING_NAMES = ['Smart Sprint Planner', 'Sprint Planer for  MultiTeams'];
let siblingSrc = null;
for (const name of SIBLING_NAMES) {
  const cand = path.join(APPS_DIR, name, 'widgets', 'main', 'src');
  if (cand !== OWN_SRC && fs.existsSync(cand)) { siblingSrc = cand; break; }
}

function toSibling(s) {
  for (const [from, to] of sed) s = s.split(from).join(to);
  return s;
}

test('④ — fork-identical модули остаются namespace-sed-идентичными между форками',
  { skip: siblingSrc ? false : 'sibling-форк не найден (unit-run); на релизе это FAIL' }, () => {
    const drift = [];
    for (const f of allow.identical) {
      const op = path.join(OWN_SRC, f);
      const sp = path.join(siblingSrc, f);
      if (!fs.existsSync(op)) { drift.push(`${f}: нет в своём форке`); continue; }
      if (!fs.existsSync(sp)) { drift.push(`${f}: нет в sibling-форке (зеркало отстало?)`); continue; }
      const expected = toSibling(fs.readFileSync(op, 'utf8'));
      const actual = fs.readFileSync(sp, 'utf8');
      if (expected !== actual) {
        const e = expected.split('\n'), a = actual.split('\n');
        let ln = 0;
        while (ln < e.length && ln < a.length && e[ln] === a[ln]) ln++;
        drift.push(`${f}: разошёлся со стр.${ln + 1}\n      own→sed:  ${JSON.stringify((e[ln] || '').trim().slice(0, 90))}\n      sibling:  ${JSON.stringify((a[ln] || '').trim().slice(0, 90))}`);
      }
    }
    assert.deepStrictEqual(drift, [],
      'Зеркало форков разъехалось на fork-identical модулях. Пере-зеркаль namespace-sed\'ом ' +
      'ИЛИ, если дивергенция намеренная, убери файл из tests/mirror/fork-identical.json с обоснованием:\n  ' +
      drift.join('\n  '));
  });
