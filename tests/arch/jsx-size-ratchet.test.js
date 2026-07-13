/* Fitness function J — LOC-ратчет React-слоя (react/*.jsx).
 *
 * Аудит 2026-07-12: react-слой (~7.8k строк, 22 файла) рос вне всех гейтов —
 * settings-form.jsx прибавлял по Section за эпик и стал вторым файлом проекта.
 * J-гейт держит только РАЗМЕР (ratchet-only-down, как A1): топология и стейт JSX
 * намеренно не анализируются (_lib не парсит JSX-синтаксис). Реестр — module-registry.json
 * секция jsx.modules; бюджеты двигаются только осознанным диффом.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const lib = require('./_lib.js');
const reg = require('../../module-registry.json');

test('J1 — каждый react/*.jsx не превышает свой LOC-бюджет (ratchet only down)', () => {
  const over = [];
  for (const f of lib.listJsxModules()) {
    const entry = reg.jsx && reg.jsx.modules ? reg.jsx.modules[f] : null;
    if (!entry) continue; // отсутствие записи ловит J2
    const loc = lib.nonEmptyLOC(lib.readModule(f));
    if (loc > entry.locBudget) over.push(`${f}: ${loc} > бюджет ${entry.locBudget}`);
  }
  assert.deepStrictEqual(over, [],
    'React-модули переросли бюджет. Вынеси Section/компонент в свой файл ИЛИ, если рост ' +
    'оправдан, осознанно подними locBudget в module-registry.json (jsx.modules):\n  ' + over.join('\n  '));
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
