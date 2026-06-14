/* scripts/gen-arch-registry.js — генератор module-registry.json (architecture fitness baseline).
 *
 * Замеряет текущее дерево widgets/main/src и пишет замороженный контракт: для каждого
 * модуля — слой/домен/LOC-бюджет/state-baseline/publishes. Fork-agnostic (работает в
 * обоих форках, читает свой namespace). Запуск из корня репо:
 *   node scripts/gen-arch-registry.js
 *
 * Перегенерировать ОСОЗНАННО (после оправданного роста/нового модуля); гейты A/C/D
 * сравнивают факт с этим baseline. Подробно — Spec/ARCH_FITNESS_FUNCTIONS_SPEC.md.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const lib = require(path.join(__dirname, '..', 'tests', 'arch', '_lib.js'));

const ROOT = path.join(__dirname, '..');
const FAT = 600;
const suffix = (tok) => tok.replace(/^__(?:SCBT|SSP)_/, '');
const domainOf = (f) => f.replace(/\.js$/, '').replace(/^i18n\//, 'i18n-');

function moduleLayer(f, published) {
  if (/-pure\.js$/.test(f)) return 'pure';
  if (/^i18n\//.test(f) || f === 'i18n-bridge.js' || f === 'i18n-controller.js') return 'i18n';
  for (const p of published) if (lib.bridgeLayer(p) === 'infra') return 'infra';
  if (f === 'youtrack-api.js' || f === 'data-loaders.js') return 'data';
  return 'domain';
}

const mods = lib.listModules();
const out = { _meta: {}, modules: {} };
let fatCount = 0;
const bridgeLayers = {};

for (const f of mods) {
  const src = lib.readModule(f);
  const loc = lib.nonEmptyLOC(src);
  const pub = [...lib.publishedBridges(src)];
  const layer = moduleLayer(f, pub);
  pub.forEach((t) => { bridgeLayers[suffix(t)] = layer; }); // мост классифицируется по слою публикующего модуля
  if (loc > FAT) fatCount++;
  out.modules[f] = {
    layer,
    domain: domainOf(f),
    loc,
    locBudget: Math.max(loc + 20, Math.ceil(loc * 1.12)),
    state: lib.moduleLevelVarLet(src),
    publishes: pub.map(suffix),
  };
}

const coreLoc = lib.nonEmptyLOC(fs.readFileSync(path.join(ROOT, 'widgets', 'main', 'src', 'core.js'), 'utf8'));
out._meta = {
  note: 'Architecture baseline. LOC-бюджеты ratchet-only-down; state-baseline и layer = контракт. Перегенерация — node scripts/gen-arch-registry.js. Подробно — Spec/ARCH_FITNESS_FUNCTIONS_SPEC.md.',
  generatedBy: 'scripts/gen-arch-registry.js',
  fork: 'fork-agnostic (суффиксы без namespace-префикса)',
  core: { loc: coreLoc, locBudget: Math.ceil(coreLoc * 1.05) },
  fatThreshold: FAT,
  fatCountBaseline: fatCount,
  leafLayers: ['infra', 'pure', 'i18n'],
  bridgeLayers,
};

fs.writeFileSync(path.join(ROOT, 'module-registry.json'), JSON.stringify(out, null, 2) + '\n');
console.log(`module-registry.json: ${mods.length} модулей, fat(>${FAT})=${fatCount}, core=${coreLoc} LOC`);
