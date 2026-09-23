/* Fitness function BE — backend LOC ratchet (храповик размера бэкенда).
 *
 * Фронтовый size-ratchet (A1/A2/A3) гейтит только widgets/main/src/**. Бэкенд —
 * CommonJS-модули в корне репо (backend-*.js), require'ят общее ядро backend-core.js
 * и дописывают свои endpoints в core.ENDPOINTS (паттерн backend-capacity.js /
 * backend-issuefields.js). Этот гейт переносит на них ту же дисциплину: ядро ужимается
 * (BE2), Σ модулей ≤ агрегатного бюджета _meta.budgets.backend (BE1; #69 строка 23 —
 * per-file потолки сняты), новый backend-<feature>.js обязан получить запись (BE3). Так фича не дописывается в god-object, а едет в свой модуль.
 *
 * Что НЕ переносим (осознанно): топология слоёв (B/C) и state-baseline — они построены
 * на window.__-мостах; бэкенд использует require, мостов нет → сигнал был бы пустым.
 * Числа в registry.backend/_meta.budgets.backend — per-fork (форки дрейфят), правятся вручную в каждом форке.
 *
 * WF1/WF2 (R3c, v3.7.0): та же дисциплина на workflow-*.js. Общая инфраструктура вынесена
 * в workflow-common.js (sibling-require), правила require'ят её — ратчет фиксирует ужатие
 * и ловит регресс «правило снова обросло локальной копией». registry.workflow и
 * _meta.budgets.workflow — per-fork; WF1 с #69/23 — агрегат Σ.
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

/** Агрегатный гейт секции: Σ LOC файлов ≤ _meta.budgets[key].locBudget. */
function assertAggregate(key, files, hint) {
  const budget = reg._meta.budgets && reg._meta.budgets[key];
  assert.ok(budget && typeof budget.locBudget === 'number', `module-registry.json: отсутствует _meta.budgets.${key}`);
  const sum = files.reduce((a, f) => a + locOf(f), 0);
  assert.ok(sum <= budget.locBudget,
    `Σ LOC ${key} = ${sum} > агрегатный бюджет ${budget.locBudget} (замер в реестре ${budget.loc}). ` +
    hint + ` ИЛИ, если рост оправдан, осознанно подними _meta.budgets.${key}.locBudget в module-registry.json с budgetNote.`);
}

test('BE1 — Σ LOC backend-модулей не превышает агрегатный бюджет (ratchet only down)', () => {
  assertAggregate('backend', listBackendModules(),
    'Backend перерос: вынеси в новый backend-<feature>.js / упрости');
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
    'Новый backend-*.js без записи в registry.backend.modules (добавь loc): ' + missing.join(', '));
  assert.deepStrictEqual(orphan, [],
    'Осиротевшие записи в registry.backend.modules (файла нет на диске): ' + orphan.join(', '));
});

/** Все workflow-*.js в корне репо. */
function listWorkflowModules() {
  return fs.readdirSync(ROOT)
    .filter((f) => /^workflow-.*\.js$/.test(f))
    .sort();
}

test('WF1 — Σ LOC workflow-модулей не превышает агрегатный бюджет (ratchet only down)', () => {
  assertAggregate('workflow', listWorkflowModules(),
    'Workflow перерос: общая инфраструктура едет в workflow-common.js (не копия в правиле!)');
});

test('WF2 — реестр полон: каждый workflow-*.js имеет запись, нет осиротевших', () => {
  const wf = reg.workflow;
  const onDisk = listWorkflowModules();
  const inReg = Object.keys(wf.modules);
  const missing = onDisk.filter((f) => !wf.modules[f]);
  const orphan = inReg.filter((f) => !fs.existsSync(path.join(ROOT, f)));
  assert.deepStrictEqual(missing, [],
    'Новый workflow-*.js без записи в registry.workflow.modules (добавь loc): ' + missing.join(', '));
  assert.deepStrictEqual(orphan, [],
    'Осиротевшие записи в registry.workflow.modules (файла нет на диске): ' + orphan.join(', '));
});

/* MC1/MC2 (#113 1б-2): MCP-инструменты во встроенном MCP YouTrack — mcp-common.js (адаптер,
   схемы, проекции, определения), mcp-i18n.js (словарь) и однострочные mcp-tool-<имя>.js (файл на
   инструмент — требование YouTrack; соответствие файлов определениям — tests/unit/mcp-tools.test.js).
   Свой агрегат _meta.budgets.mcp вне BE1 (⚖ владелец 2026-09-23); реестр mcp.modules — без
   однострочников. Числа per-fork. */
function listMcpModules() {
  return fs.readdirSync(ROOT).filter((f) => /^mcp-.*\.js$/.test(f)).sort();
}

test('MC1 — Σ LOC mcp-*.js не превышает агрегатный бюджет (ratchet only down)', () => {
  assertAggregate('mcp', listMcpModules(),
    'MCP-слой перерос: инструмент — тонкое определение в mcp-common.js над обработчиками, логика — в backend-*.js');
});

test('MC2 — реестр полон: каждый mcp-*.js, кроме mcp-tool-*.js, имеет запись, нет осиротевших', () => {
  const mc = reg.mcp;
  assert.ok(mc && mc.modules, 'module-registry.json: отсутствует mcp.modules');
  const onDisk = listMcpModules().filter((f) => !f.startsWith('mcp-tool-'));
  const missing = onDisk.filter((f) => !mc.modules[f]);
  const orphan = Object.keys(mc.modules).filter((f) => !fs.existsSync(path.join(ROOT, f)));
  assert.deepStrictEqual(missing, [], 'Новый mcp-*.js без записи в registry.mcp.modules (добавь loc): ' + missing.join(', '));
  assert.deepStrictEqual(orphan, [], 'Осиротевшие записи в registry.mcp.modules (файла нет на диске): ' + orphan.join(', '));
});
