/* scripts/gen-arch-registry.js — генератор module-registry.json (architecture fitness baseline).
 *
 * Замеряет текущее дерево widgets/main/src и пишет контракт: для каждого модуля —
 * слой/домен/LOC/state-baseline/publishes. Fork-agnostic (работает в обоих форках,
 * читает свой namespace). Запуск из корня репо:
 *   node scripts/gen-arch-registry.js                  # замеры обновить, решения сохранить
 *   node scripts/gen-arch-registry.js --reset-budgets  # пересчитать и бюджеты/baseline с нуля
 *
 * ЗАМЕР vs РЕШЕНИЕ (#69 строка 23, 2026-08-22). Скрипт честно пересчитывает замеры
 * (loc, layer, state, publishes), но НЕ трогает решения, принятые руками в реестре:
 * агрегатные бюджеты `_meta.budgets`, `_meta.core.{locBudget,stateBaseline,budgetNote}`,
 * `fatCountBaseline`, `budgetNote`/`stateNote`/`layer` записей, ручные `bridgeLayers`, секции
 * `backend`/`workflow` (ведутся BE/WF-гейтами per-fork). До этой правки перегенерация
 * молча сбрасывала ratchet (бюджеты ×1.12 от факта), роняла секцию workflow,
 * stateBaseline (C3) и ручные слои мостов. Сброс решений — только явным --reset-budgets.
 * Гейты A/C/D/J/BE/WF сравнивают факт с этим baseline. Подробно — Spec/ARCH_FITNESS_FUNCTIONS_SPEC.md.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const lib = require(path.join(__dirname, '..', 'tests', 'arch', '_lib.js'));

const ROOT = path.join(__dirname, '..');
const REG = path.join(ROOT, 'module-registry.json');
const FAT = 600;
const BAND = 1.10; // полоса агрегатного бюджета: бюджет = ceil(Σloc × 1.10)
const RESET = process.argv.includes('--reset-budgets');
const suffix = (tok) => tok.replace(/^__(?:SCBT|SSP)_/, '');
const domainOf = (f) => f.replace(/\.js$/, '').replace(/^i18n\//, 'i18n-');

let prev = { _meta: {}, modules: {}, jsx: { modules: {} } };
try { prev = JSON.parse(fs.readFileSync(REG, 'utf8')); } catch (_) { /* первый прогон без реестра */ }
const prevMeta = prev._meta || {};
const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj && obj[k] !== undefined).map((k) => [k, obj[k]]));
const NOTES = ['budgetNote', 'stateNote'];

function moduleLayer(f, published) {
  if (/-pure\.js$/.test(f)) return 'pure';
  if (/^i18n\//.test(f) || f === 'i18n-bridge.js' || f === 'i18n-controller.js') return 'i18n';
  for (const p of published) if (lib.bridgeLayer(p) === 'infra') return 'infra';
  if (f === 'youtrack-api.js' || f === 'data-loaders.js') return 'data';
  return 'domain';
}

/** Агрегатный бюджет секции: решение переносится из реестра, замер Σloc обновляется. */
function budgetFor(key, sum) {
  const old = !RESET && prevMeta.budgets && prevMeta.budgets[key];
  return old ? Object.assign({}, old, { loc: sum }) : { loc: sum, locBudget: Math.ceil(sum * BAND) };
}

const modules = {};
let fatCount = 0, sumModules = 0;
const bridgeLayers = {};
for (const f of lib.listModules()) {
  const src = lib.readModule(f);
  const loc = lib.nonEmptyLOC(src);
  const pub = [...lib.publishedBridges(src)];
  // Слой — тоже решение (reviewed-исключения вроде pure/reporting-period.js без суффикса -pure):
  // переносится из реестра, замеряется только для нового модуля или при --reset-budgets.
  const layer = (!RESET && prev.modules[f] && prev.modules[f].layer) || moduleLayer(f, pub);
  pub.forEach((t) => { bridgeLayers[suffix(t)] = layer; }); // мост классифицируется по слою публикующего модуля
  if (loc > FAT) fatCount++;
  sumModules += loc;
  modules[f] = Object.assign({
    layer,
    domain: domainOf(f),
    loc,
    state: lib.moduleLevelVarLet(src),
    publishes: pub.map(suffix),
  }, pick(prev.modules[f], NOTES));
}

/* R3a (аудит 2026-07-12) — react/*.jsx: только размер (J-гейт), топология JSX не анализируется.
   Fat-count (A3) с #69 строки 23 считает и react/*.jsx. */
const jsxModules = {};
let sumJsx = 0;
for (const f of lib.listJsxModules()) {
  const jloc = lib.nonEmptyLOC(lib.readModule(f));
  if (jloc > FAT) fatCount++;
  sumJsx += jloc;
  jsxModules[f] = Object.assign({ loc: jloc }, pick((prev.jsx && prev.jsx.modules || {})[f], NOTES));
}

const coreLoc = lib.nonEmptyLOC(fs.readFileSync(path.join(lib.SRC, 'core.js'), 'utf8'));
const prevCore = prevMeta.core || {};
const _meta = {
  note: 'Architecture baseline. Агрегатные LOC-бюджеты (_meta.budgets, ratchet-only-down по Σ секции; per-module loc — информационный замер); state-baseline и layer = контракт. Перегенерация — node scripts/gen-arch-registry.js (решения переносятся; --reset-budgets пересчитывает бюджеты/baseline). Подробно — Spec/ARCH_FITNESS_FUNCTIONS_SPEC.md.',
  generatedBy: 'scripts/gen-arch-registry.js',
  fork: 'fork-agnostic (суффиксы без namespace-префикса)',
  // stateBaseline (C3) и записка переносятся ВСЕГДА — --reset-budgets сбрасывает только бюджеты/fat-baseline.
  core: Object.assign({ loc: coreLoc },
    RESET ? { locBudget: Math.ceil(coreLoc * 1.05) } : pick(prevCore, ['locBudget']),
    pick(prevCore, ['stateBaseline', 'budgetNote'])),
  budgets: {
    modules: budgetFor('modules', sumModules),
    jsx: budgetFor('jsx', sumJsx),
    // backend/workflow — Σ по секциям, которые ведутся per-fork руками (см. ниже).
  },
  fatThreshold: FAT,
  _fatCountNote: prevMeta._fatCountNote,
  fatCountBaseline: RESET || prevMeta.fatCountBaseline === undefined ? fatCount : prevMeta.fatCountBaseline,
  leafLayers: ['infra', 'pure', 'i18n'],
  // Ручные решения по слою моста (реестр) сильнее замера; новые мосты добавляются замером.
  bridgeLayers: RESET ? bridgeLayers : Object.assign(bridgeLayers, prevMeta.bridgeLayers || {}),
};
if (_meta._fatCountNote === undefined) delete _meta._fatCountNote;

/* Секции backend/workflow ведутся BE/WF-гейтами per-fork — переносим как есть, только
   обновляем Σloc агрегата (сами loc записей правятся руками вместе с кодом). */
const sumOf = (sec) => Object.values(sec && sec.modules || {}).reduce((a, e) => a + (e.loc || 0), 0);
if (prev.backend) _meta.budgets.backend = budgetFor('backend', sumOf(prev.backend));
if (prev.workflow) _meta.budgets.workflow = budgetFor('workflow', sumOf(prev.workflow));

const jsx = Object.assign({}, prev.jsx, {
  _note: (prev.jsx && prev.jsx._note) || 'react/*.jsx — агрегатный LOC-ратчет (J1 по _meta.budgets.jsx) + полнота реестра (J2); топология и стейт JSX не анализируются.',
  modules: jsxModules,
});
const final = { _meta, backend: prev.backend, workflow: prev.workflow, jsx, modules };
if (!final.backend) delete final.backend;
if (!final.workflow) delete final.workflow;

const INDENT = (fs.existsSync(REG) && /^\{\n {2}"/.test(fs.readFileSync(REG, 'utf8'))) ? 2 : 1; // corp indent=1 / comm indent=2
fs.writeFileSync(REG, JSON.stringify(final, null, INDENT) + '\n');
console.log(`module-registry.json: ${Object.keys(modules).length} модулей (Σ${sumModules}) + ${Object.keys(jsxModules).length} jsx (Σ${sumJsx}), fat(>${FAT})=${fatCount}, core=${coreLoc} LOC${RESET ? ' [reset]' : ''}`);
