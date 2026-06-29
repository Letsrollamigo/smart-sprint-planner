/* Fitness function BE — backend LOC ratchet (храповик размера бэкенда).
 *
 * Фронтовый size-ratchet (A1/A2/A3) гейтит только widgets/main/src/**. Бэкенд —
 * CommonJS-модули в корне репо (backend-*.js), require'ят общее ядро backend-core.js
 * и дописывают свои endpoints в core.ENDPOINTS (паттерн backend-capacity.js /
 * backend-issuefields.js). Этот гейт переносит на них ту же дисциплину: ядро ужимается
 * (BE2), каждый модуль ≤ бюджета (BE1), новый backend-<feature>.js обязан получить
 * запись (BE3). Так фича не дописывается в god-object, а едет в свой модуль.
 *
 * Что НЕ переносим (осознанно): топология слоёв (B/C) и state-baseline — они построены
 * на window.__-мостах; бэкенд использует require, мостов нет → сигнал был бы пустым.
 * Числа в registry.backend — per-fork (форки дрейфят), правятся вручную в каждом форке.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const lib = require('./_lib.js');
const reg = require('../../module-registry.json');

const ROOT = path.resolve(__dirname, '..', '..');
const CORE = 'backend-core.js';

/** Все backend-*.js в корне репо КРОМЕ ядра. */
function listBackendModules() {
  return fs.readdirSync(ROOT)
    .filter((f) => /^backend-.*\.js$/.test(f) && f !== CORE)
    .sort();
}

function locOf(f) {
  return lib.nonEmptyLOC(fs.readFileSync(path.join(ROOT, f), 'utf8'));
}

test('BE1 — каждый backend-модуль не превышает свой LOC-бюджет (ratchet only down)', () => {
  const be = reg.backend;
  assert.ok(be && be.modules, 'module-registry.json: отсутствует секция backend.modules');
  const over = [];
  for (const f of listBackendModules()) {
    const entry = be.modules[f];
    if (!entry) continue; // ловит BE3
    const loc = locOf(f);
    if (loc > entry.locBudget) over.push(`${f}: ${loc} > бюджет ${entry.locBudget}`);
  }
  assert.deepStrictEqual(over, [],
    'Backend-модули переросли бюджет. Вынеси в новый backend-<feature>.js ИЛИ, если рост ' +
    'оправдан, осознанно подними locBudget в module-registry.json (backend.modules):\n  ' + over.join('\n  '));
});

test('BE2 — backend-core.js ужимается, не пухнет (новая фича = свой модуль, не дописка в ядро)', () => {
  const be = reg.backend;
  assert.ok(be && be.core, 'module-registry.json: отсутствует backend.core');
  const loc = locOf(CORE);
  assert.ok(loc <= be.core.locBudget,
    `backend-core.js = ${loc} LOC > бюджет ${be.core.locBudget}. ` +
    'Новый endpoint/домен идёт в backend-<feature>.js (require core + push в core.ENDPOINTS), ' +
    'не в ядро. Ядро — общие хелперы/authz/schema-движок/диспетчер.');
});

test('BE3 — реестр полон: каждый backend-*.js имеет запись, нет осиротевших', () => {
  const be = reg.backend;
  const onDisk = listBackendModules();
  const inReg = Object.keys(be.modules);
  const missing = onDisk.filter((f) => !be.modules[f]);
  const orphan = inReg.filter((f) => !fs.existsSync(path.join(ROOT, f)));
  assert.deepStrictEqual(missing, [],
    'Новый backend-*.js без записи в registry.backend.modules (добавь loc/locBudget): ' + missing.join(', '));
  assert.deepStrictEqual(orphan, [],
    'Осиротевшие записи в registry.backend.modules (файла нет на диске): ' + orphan.join(', '));
});
