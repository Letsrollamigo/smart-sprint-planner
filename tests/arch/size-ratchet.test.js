/* Fitness function A — per-module LOC ratchet (храповик размера).
 *
 * Болезнь монолита = god-object. Защита: ни один файл не растёт сверх своего
 * бюджета, и число «жирных» файлов (> fatThreshold) монотонно НЕ растёт. Бюджет
 * только опускается (осознанным коммитом в module-registry.json), вверх — красный
 * гейт. Сторожит регрост в ЛЮБОМ файле, включая ещё не существующий capacity-engine.js
 * (новый файл обязан получить запись в реестре — см. registry-complete.test.js).
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const lib = require('./_lib.js');
const reg = require('../../module-registry.json');

test('A1 — каждый модуль не превышает свой LOC-бюджет (ratchet only down)', () => {
  const over = [];
  for (const f of lib.listModules()) {
    const entry = reg.modules[f];
    if (!entry) continue; // ловит registry-complete.test.js
    const loc = lib.nonEmptyLOC(lib.readModule(f));
    if (loc > entry.locBudget) over.push(`${f}: ${loc} > бюджет ${entry.locBudget}`);
  }
  assert.deepStrictEqual(over, [],
    'Модули переросли бюджет. Декомпозируй (вынеси в новый модуль) ИЛИ, если рост оправдан, ' +
    'осознанно подними locBudget в module-registry.json:\n  ' + over.join('\n  '));
});

test('A2 — core.js не растёт (композиционный корень должен сжиматься, не пухнуть)', () => {
  const coreLoc = lib.nonEmptyLOC(require('fs').readFileSync(
    path.join(lib.SRC, 'core.js'), 'utf8'));
  assert.ok(coreLoc <= reg._meta.core.locBudget,
    `core.js = ${coreLoc} LOC > бюджет ${reg._meta.core.locBudget}. ` +
    'Новый код идёт в МОДУЛЬ, не в ядро. Ядро — только композиция/бутстрап/init-оркестровка.');
});

test('A3 — число «жирных» файлов (> fatThreshold) не растёт', () => {
  const fat = lib.listModules()
    .map((f) => [f, lib.nonEmptyLOC(lib.readModule(f))])
    .filter(([, loc]) => loc > reg._meta.fatThreshold)
    .map(([f, loc]) => `${f}=${loc}`);
  assert.ok(fat.length <= reg._meta.fatCountBaseline,
    `Жирных файлов ${fat.length} > baseline ${reg._meta.fatCountBaseline} ` +
    `(порог ${reg._meta.fatThreshold} LOC): ${fat.join(', ')}. ` +
    'Новый «жирный» модуль = кандидат на дробление по доменам.');
});
