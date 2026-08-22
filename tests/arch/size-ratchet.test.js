/* Fitness function A — LOC ratchet (храповик размера).
 *
 * Болезнь монолита = god-object. Защита: секция модулей не растёт сверх своего
 * АГРЕГАТНОГО бюджета (Σloc, ratchet only-down — #69 строка 23, 2026-08-22: 73 per-module
 * потолка заменены одним на секцию, полоса 10 %), ядро только сжимается (A2), и число «жирных»
 * файлов (> fatThreshold, modules + react/*.jsx) монотонно НЕ растёт (A3). Бюджет только
 * опускается (осознанным коммитом в module-registry.json), вверх — красный гейт.
 * Новый файл обязан получить запись в реестре — см. registry-complete.test.js.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const lib = require('./_lib.js');
const reg = require('../../module-registry.json');

test('A1 — Σ LOC модулей не превышает агрегатный бюджет секции (ratchet only down)', () => {
  const budget = reg._meta.budgets && reg._meta.budgets.modules;
  assert.ok(budget && typeof budget.locBudget === 'number', 'module-registry.json: отсутствует _meta.budgets.modules');
  const sum = lib.listModules().reduce((a, f) => a + lib.nonEmptyLOC(lib.readModule(f)), 0);
  assert.ok(sum <= budget.locBudget,
    `Σ LOC модулей = ${sum} > агрегатный бюджет ${budget.locBudget} (замер в реестре ${budget.loc}). ` +
    'Фронт-слой перерос: удали/упрости мёртвое ИЛИ, если рост оправдан, осознанно подними ' +
    '_meta.budgets.modules.locBudget в module-registry.json с budgetNote.');
});

test('A2 — core.js не растёт (композиционный корень должен сжиматься, не пухнуть)', () => {
  const coreLoc = lib.nonEmptyLOC(require('fs').readFileSync(
    path.join(lib.SRC, 'core.js'), 'utf8'));
  assert.ok(coreLoc <= reg._meta.core.locBudget,
    `core.js = ${coreLoc} LOC > бюджет ${reg._meta.core.locBudget}. ` +
    'Новый код идёт в МОДУЛЬ, не в ядро. Ядро — только композиция/бутстрап/init-оркестровка.');
});

test('A3 — число «жирных» файлов (> fatThreshold, modules + react/*.jsx) не растёт', () => {
  const fat = lib.listModules().concat(lib.listJsxModules())
    .map((f) => [f, lib.nonEmptyLOC(lib.readModule(f))])
    .filter(([, loc]) => loc > reg._meta.fatThreshold)
    .map(([f, loc]) => `${f}=${loc}`);
  assert.ok(fat.length <= reg._meta.fatCountBaseline,
    `Жирных файлов ${fat.length} > baseline ${reg._meta.fatCountBaseline} ` +
    `(порог ${reg._meta.fatThreshold} LOC): ${fat.join(', ')}. ` +
    'Новый «жирный» модуль = кандидат на дробление по доменам (агрегатный бюджет A1/J1 ' +
    'один файл не сторожит — сторожит этот счётчик).');
});
