/**
 * Snapshot-хелпер golden-master тестов (Фаза 2 декомпозиции).
 *
 * Снимки лежат в tests/golden/snapshots/<name>.snap (текст: HTML или JSON).
 * Режимы:
 *   - обычный прогон: снимок обязан существовать и совпадать байт-в-байт;
 *   - GOLDEN_UPDATE=1 node --test … — снимки (пере)записываются.
 *
 * Несовпадение = поведение монолита изменилось → либо регрессия рефактора
 * (чинить код), либо осознанное изменение (перегенерировать снимок отдельным
 * коммитом с обоснованием). На ветке декомпозиции легитимен только diff = 0.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');

const SNAP_DIR = path.join(__dirname, 'snapshots');
const UPDATE = process.env.GOLDEN_UPDATE === '1';

function snapPath(name) {
  return path.join(SNAP_DIR, name + '.snap');
}

/** Первая отличающаяся строка + контекст — для читаемого fail-репорта. */
function firstDiff(expected, actual) {
  const e = expected.split('\n');
  const a = actual.split('\n');
  const n = Math.max(e.length, a.length);
  for (let i = 0; i < n; i++) {
    if (e[i] !== a[i]) {
      return (
        'first diff at line ' + (i + 1) + ':\n' +
        '  expected: ' + (e[i] === undefined ? '<EOF>' : JSON.stringify(e[i])) + '\n' +
        '  actual:   ' + (a[i] === undefined ? '<EOF>' : JSON.stringify(a[i]))
      );
    }
  }
  return 'contents equal?!';
}

/**
 * Сверка строки со снимком <name>.snap (или запись при GOLDEN_UPDATE=1).
 * @param {string} name — имя снимка (становится именем файла).
 * @param {string} content — фактический вывод.
 */
function checkSnapshot(name, content) {
  assert.ok(/^[\w.-]+$/.test(name), 'snapshot name must be filename-safe: ' + name);
  const file = snapPath(name);
  if (UPDATE) {
    fs.mkdirSync(SNAP_DIR, { recursive: true });
    fs.writeFileSync(file, content, 'utf8');
    return;
  }
  assert.ok(
    fs.existsSync(file),
    'golden snapshot missing: ' + name + '.snap — run GOLDEN_UPDATE=1 npm run test:golden'
  );
  const expected = fs.readFileSync(file, 'utf8');
  if (expected !== content) {
    assert.fail('golden mismatch [' + name + ']\n' + firstDiff(expected, content));
  }
}

/** JSON-вариант: детерминированная сериализация значения. */
function checkJsonSnapshot(name, value) {
  checkSnapshot(name, JSON.stringify(value, null, 2) + '\n');
}

/** Лёгкая нормализация HTML для читаемых диффов: перенос между тегами. */
function htmlPretty(html) {
  return html.replace(/></g, '>\n<') + '\n';
}

/** HTML-вариант: outerHTML/innerHTML с нормализацией переносов. */
function checkHtmlSnapshot(name, html) {
  checkSnapshot(name, htmlPretty(html));
}

module.exports = { checkSnapshot, checkJsonSnapshot, checkHtmlSnapshot, UPDATE };
