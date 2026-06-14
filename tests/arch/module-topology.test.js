/* Fitness function B — layered star topology (направление зависимостей).
 *
 * Болезнь монолита = плотный граф связности. Защита: топология обязана оставаться
 * СЛОИСТОЙ ЗВЕЗДОЙ — core (центр) композирует домены через deps; домены могут тянуть
 * только leaf-слои (infra/pure/i18n), но НЕ другие домены напрямую. Прямой
 * межмодульный вызов domain→domain через `window.__SCBT_X` = ребро будущего цикла =
 * красный гейт. Анализ — по КОДУ (комментарии вырезаны), поэтому doc-упоминание
 * чужого моста (как history-controller→HISTORY_IO в шапке) не ложно-срабатывает.
 *
 * Проверено на момент заморозки (2026-06-14): domain→domain код-рёбер НОЛЬ —
 * декомпозиция дала чистую слоистую звезду. Гейт её удерживает.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const lib = require('./_lib.js');
const reg = require('../../module-registry.json');

const LEAF = new Set(reg._meta.leafLayers); // infra/pure/i18n

/* Слой моста: сначала реестр (по слою публикующего модуля), затем suffix-правило
   для ВНЕШНИХ токенов (react-mounts/core: TABLE/RADIO/RING_MODAL/GANTT_MOUNT/T/…). */
function tokenLayer(tok) {
  const suffix = tok.replace(/^__(?:SCBT|SSP)_/, '');
  return reg._meta.bridgeLayers[suffix] || lib.bridgeLayer(tok);
}

test('B1 — ни один модуль не зовёт чужой DOMAIN-мост напрямую (только leaf-слои)', () => {
  const violations = [];
  for (const f of lib.listModules()) {
    const src = lib.readModule(f);
    const own = lib.publishedBridges(src);
    const refs = lib.bridgeTokens(src);
    for (const tok of refs) {
      if (own.has(tok)) continue; // свой мост — публикация/самовызов, ок
      const layer = tokenLayer(tok);
      if (!LEAF.has(layer)) {
        violations.push(`${f} → ${tok} (слой ${layer}). ` +
          'Domain→domain напрямую запрещён — связь должна идти через core deps.');
      }
    }
  }
  assert.deepStrictEqual(violations, [],
    'Появилось межмодульное domain→domain ребро (мешает звезда-топологии):\n  ' +
    violations.join('\n  '));
});

test('B2 — leaf-модули (pure/i18n) не тянут domain/data-мосты (слои не инвертируются)', () => {
  const violations = [];
  for (const f of lib.listModules()) {
    const m = reg.modules[f];
    if (!m || (m.layer !== 'pure' && m.layer !== 'i18n')) continue;
    const own = lib.publishedBridges(lib.readModule(f));
    for (const tok of lib.bridgeTokens(lib.readModule(f))) {
      if (own.has(tok)) continue;
      const layer = tokenLayer(tok);
      if (layer === 'domain' || layer === 'data') {
        violations.push(`${f} (${m.layer}) → ${tok} (${layer}) — leaf не должен зависеть от домена`);
      }
    }
  }
  assert.deepStrictEqual(violations, [], 'Инверсия слоёв:\n  ' + violations.join('\n  '));
});
