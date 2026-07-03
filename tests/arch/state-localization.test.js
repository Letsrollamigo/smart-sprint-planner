/* Fitness function C — state localization (ЦЕНТРАЛЬНЫЙ гейт против регроста).
 *
 * Болезнь монолита, буквально: общее изменяемое состояние, достижимое отовсюду.
 * Инвариант декомпозиции: модули STATELESS — состояние живёт в замыкании core за
 * deps.state.*-аксессорами, а в модуль приходит аргументом. Гейт: множество
 * module-level var/let каждого модуля не должно РАСТИ сверх зафиксированного baseline
 * (module-registry.json). Новый `let _capacityState` в будущем модуле → не в baseline
 * → красный → автор вынужден либо вынести стейт в core за deps, либо осознанно внести
 * исключение в реестр (видимый, ревьюабельный diff).
 *
 * Это ДИФФЕРЕНЦИАЛЬНЫЙ ratchet, не абсолютное доказательство «ноль состояния»:
 * идеальный статический разбор требует полноценного парсера. Ratchet делает ЛЮБОЕ
 * новое module-level состояние механически видимым — этого достаточно против дрейфа.
 * Текущий baseline содержит задокументированные исключения (таймеры draft-store,
 * кэш i18n/loader, позиция click-anchor, объекты-экспорты `api`, локальные константы).
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const lib = require('./_lib.js');
const reg = require('../../module-registry.json');

test('C1 — модуль не вводит НОВОЕ module-level mutable состояние сверх baseline', () => {
  const additions = [];
  for (const f of lib.listModules()) {
    const entry = reg.modules[f];
    if (!entry) continue;
    const baseline = new Set(entry.state || []);
    const actual = lib.moduleLevelVarLet(lib.readModule(f));
    const fresh = actual.filter((n) => !baseline.has(n));
    if (fresh.length) additions.push(`${f}: +[${fresh.join(', ')}]`);
  }
  assert.deepStrictEqual(additions, [],
    'Новое module-level состояние (модули обязаны быть stateless — стейт в core за deps.state.*).\n' +
    'Если состояние реально модуль-приватное и обоснованное (как таймеры draft-store) — внеси имя в ' +
    'module-registry.json:modules[<file>].state с обоснованием:\n  ' + additions.join('\n  '));
});

test('C2 — baseline не протух (имена из реестра ещё существуют в файле)', () => {
  // Защита от молчаливого разрастания allowlist: если из файла убрали состояние,
  // запись в baseline стоит почистить (иначе под прикрытием старого имени проедет новое).
  const stale = [];
  for (const f of lib.listModules()) {
    const entry = reg.modules[f];
    if (!entry || !entry.state || !entry.state.length) continue;
    const actual = new Set(lib.moduleLevelVarLet(lib.readModule(f)));
    const gone = entry.state.filter((n) => !actual.has(n));
    if (gone.length) stale.push(`${f}: baseline содержит отсутствующие [${gone.join(', ')}]`);
  }
  assert.deepStrictEqual(stale, [],
    'Baseline состояния протух — почисти module-registry.json (перегенерируй):\n  ' + stale.join('\n  '));
});

test('C3 — стейт ядра не растёт: счётчик top-level `_*`-переменных core.js ≤ stateBaseline (ratchet only-down)', () => {
  const fs = require('fs');
  const path = require('path');
  const core = fs.readFileSync(path.join(__dirname, '..', '..', 'widgets', 'main', 'src', 'core.js'), 'utf8');
  const n = lib.coreStateVars(core).length;
  const baseline = reg._meta.core.stateBaseline;
  assert.ok(typeof baseline === 'number', 'module-registry.json:_meta.core.stateBaseline отсутствует');
  assert.ok(n <= baseline,
    `core.js: ${n} стейт-переменных > baseline ${baseline}. Новый стейт в ядро ЗАПРЕЩЁН — ` +
    'клади его в доменный стор по ADR-001 (прецеденты: release-store.js, sprint-store.js) ' +
    'или в module-private стейт с записью в реестр (C1). Осознанное исключение — bump baseline с обоснованием в diff.');
  assert.ok(n >= baseline,
    `core.js: ${n} стейт-переменных < baseline ${baseline} — ratchet вниз: зафиксируй прогресс, обнови stateBaseline в module-registry.json.`);
});
