/* Fitness function J — LOC-ратчет React-слоя (react/*.jsx).
 *
 * Аудит 2026-07-12: react-слой (~7.8k строк, 22 файла) рос вне всех гейтов —
 * settings-form.jsx прибавлял по Section за эпик и стал вторым файлом проекта.
 * J-гейт держит только РАЗМЕР (ratchet-only-down, как A1): топология и стейт JSX
 * намеренно не анализируются (_lib не парсит JSX-синтаксис). Реестр — module-registry.json
 * секция jsx.modules (полнота, J2) + агрегатный бюджет _meta.budgets.jsx (J1; #69 строка 23 —
 * per-file потолки сняты, один файл сторожит fat-count A3). Бюджет двигается только осознанным диффом.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const lib = require('./_lib.js');
const reg = require('../../module-registry.json');

test('J1 — Σ LOC react/*.jsx не превышает агрегатный бюджет секции (ratchet only down)', () => {
  const budget = reg._meta.budgets && reg._meta.budgets.jsx;
  assert.ok(budget && typeof budget.locBudget === 'number', 'module-registry.json: отсутствует _meta.budgets.jsx');
  const sum = lib.listJsxModules().reduce((a, f) => a + lib.nonEmptyLOC(lib.readModule(f)), 0);
  assert.ok(sum <= budget.locBudget,
    `Σ LOC react/*.jsx = ${sum} > агрегатный бюджет ${budget.locBudget} (замер в реестре ${budget.loc}). ` +
    'React-слой перерос: вынеси/упрости ИЛИ, если рост оправдан, осознанно подними ' +
    '_meta.budgets.jsx.locBudget в module-registry.json с budgetNote.');
});

test('J2 — jsx-реестр полон: каждый react/*.jsx имеет запись, нет осиротевших', () => {
  assert.ok(reg.jsx && reg.jsx.modules, 'module-registry.json: секция jsx.modules отсутствует');
  const files = lib.listJsxModules();
  const entries = Object.keys(reg.jsx.modules);
  const missing = files.filter((f) => !entries.includes(f));
  const orphans = entries.filter((e) => !files.includes(e));
  assert.deepStrictEqual(missing, [],
    'Новые react/*.jsx без записи в jsx.modules (новый файл = осознанный бюджет): ' + missing.join(', '));
  assert.deepStrictEqual(orphans, [],
    'Осиротевшие записи jsx.modules (файл удалён — убери запись): ' + orphans.join(', '));
});
