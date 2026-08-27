/* Fitness function E — контракт `deps.state` между ядром и доменными модулями.
 *
 * Зачем. Модули не видят стейт напрямую: ядро собирает per-call фабрику `_<x>Deps()`
 * и кладёт аксессоры в её поле `state`. Модуль зовёт `deps.state.getFoo()`. Если аксессор
 * в фабрике не объявлен, вызов возвращает `undefined` — и модуль обычно уходит в тихую
 * раннюю ветку вместо падения.
 *
 * Что этим поймано (#93). В deps Ганта не было `getHost`. Первая строка загрузчика связей:
 *   var host = deps.state.getHost && deps.state.getHost();
 *   if (!host || !ids.length) return;
 * — то есть Гант НИКОГДА не запрашивал связи, и стрелки зависимостей вместе со значком
 * внешних предшественников (фаза 2 эпика #74) были мертвы с 3.28.0. Ни один гейт этого
 * не видел: тесты pure-функций зелены, размер и топология не при чём, а `fork-constants`
 * пинит константы, а не состав фабрик. Строка потерялась при пофайловом переносе правок
 * между редакциями — тот же механизм, что у #77.
 *
 * Как считаем. Карта «модуль → фабрика» выводится из самого core.js и потому не протухает:
 *   var GANTT_VIEW = (typeof window !== 'undefined' && window.__X_GANTT_VIEW) || {};
 *   ... GANTT_VIEW.renderGanttChart(_ganttDeps())
 * даёт пару `__X_GANTT_VIEW → _ganttDeps`. Модуль публикует себя тем же
 * `window.__X_GANTT_VIEW = ...`. Дальше — обычная разность множеств. Префикс моста
 * в редакциях разный, поэтому в регулярках он не зашит — файл fork-identical.
 *
 * Границы. Проверяется ровно `deps.state.*`: у него единая форма во всех фабриках.
 * Верхний уровень deps (функции, константы, мосты) не сканируется — там передача идёт
 * и через spread, и через переименование, сигнал был бы шумным. Модуль без вызова
 * `deps.state.*` и модуль, чья фабрика не находится по вызову, молча пропускаются —
 * поэтому E2 отдельно держит нижнюю границу покрытия: если разбор карты сломается,
 * тест обязан покраснеть, а не позеленеть вхолостую.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const lib = require('./_lib.js');

/* Гасим ТОЛЬКО комментарии, строки оставляем как есть. Полный стриппер (в т.ч.
   lib.stripCommentsAndStrings) на этих файлах не годится: он принимает кавычку внутри
   регулярки (`/[^']/` и подобные, в core.js их хватает) за начало строки и гасит код
   до следующей такой же кавычки — карта мостов после этого разбирается наполовину.
   Комментарии же на регулярках не спотыкаются. Цена — `//` внутри строкового литерала
   (URL) гасит остаток СВОЕЙ строки; на разбираемые здесь конструкции это не влияет,
   а нижнюю границу покрытия всё равно сторожит E2. */
function strip(src) {
  let out = '', i = 0, st = 'code';
  while (i < src.length) {
    const c = src[i], c2 = src[i + 1];
    if (c === '\n') { out += '\n'; i++; if (st === 'line') st = 'code'; continue; }
    if (st === 'code') {
      if (c === '/' && c2 === '/') { st = 'line'; out += '  '; i += 2; continue; }
      if (c === '/' && c2 === '*') { st = 'block'; out += '  '; i += 2; continue; }
      out += c; i++; continue;
    }
    if (st === 'block' && c === '*' && c2 === '/') { st = 'code'; out += '  '; i += 2; continue; }
    out += ' '; i++;
  }
  return out;
}

const CORE = strip(fs.readFileSync(path.join(lib.SRC, 'core.js'), 'utf8'));

/* `var X = (typeof window !== 'undefined' && window.__PFX_Y) || {};` → { X: '__PFX_Y' }.
   Префикс моста намеренно не зашит: редакции планера различаются им (`__SSP_`/`__SCBT_`),
   а файл обязан оставаться в обеих одинаковым — иначе он сам станет тем расхождением,
   которое призван ловить. */
function coreBridgeConsts() {
  const out = {};
  const re = /var\s+([A-Z][A-Z0-9_]*)\s*=\s*\(typeof window[^;]*?window\.(__[A-Z][A-Z0-9_]*)/g;
  let m;
  while ((m = re.exec(CORE))) out[m[1]] = m[2];
  return out;
}

/* `X.method(_yDeps())` → { '__PFX_Y': Set('_yDeps') }. Один мост может получать
   несколько фабрик (релизный срез — пять модулей на одну), поэтому Set. */
function bridgeToBuilders() {
  const consts = coreBridgeConsts();
  const out = {};
  const re = /\b([A-Z][A-Z0-9_]*)\.\w+\(\s*(_[A-Za-z0-9]*Deps)\(\)/g;
  let m;
  while ((m = re.exec(CORE))) {
    const bridge = consts[m[1]];
    if (!bridge) continue;
    (out[bridge] || (out[bridge] = new Set())).add(m[2]);
  }
  return out;
}

/* Ключи объекта `state: { ... }` внутри `function _yDeps() {`. null — фабрики нет. */
function builderStateKeys(builder) {
  const at = CORE.indexOf('function ' + builder + '() {');
  if (at < 0) return null;
  const open = CORE.indexOf('state: {', at);
  if (open < 0) return new Set();
  const from = open + 'state: '.length;
  let depth = 0, end = -1;
  for (let i = from; i < CORE.length; i++) {
    if (CORE[i] === '{') depth++;
    else if (CORE[i] === '}' && --depth === 0) { end = i; break; }
  }
  if (end < 0) return new Set();
  return new Set([...CORE.slice(from, end + 1).matchAll(/(\w+)\s*:/g)].map((x) => x[1]));
}

/* Пары «модуль, зовущий deps.state.*» × «фабрика, которую ему передаёт ядро». */
function contractPairs() {
  const map = bridgeToBuilders();
  const pairs = [];
  for (const rel of lib.listModules()) {
    const src = strip(lib.readModule(rel));
    const used = new Set([...src.matchAll(/deps\.state\.(\w+)/g)].map((m) => m[1]));
    if (!used.size) continue;
    const pub = src.match(/window\.(__[A-Z][A-Z0-9_]*)\s*=/);
    if (!pub || !map[pub[1]]) continue;
    for (const builder of map[pub[1]]) pairs.push({ rel, builder, used });
  }
  return pairs;
}

test('E1: каждый deps.state.* модуля объявлен в фабрике ядра', function () {
  const missing = [];
  for (const { rel, builder, used } of contractPairs()) {
    const have = builderStateKeys(builder);
    assert.ok(have, 'фабрика ' + builder + ' не найдена в core.js (пара для ' + rel + ')');
    for (const key of [...used].sort()) {
      if (!have.has(key)) missing.push(rel + ' → ' + builder + '.state.' + key);
    }
  }
  assert.deepStrictEqual(missing, [],
    'Модуль читает аксессор, которого фабрика не даёт: вызов вернёт undefined, и модуль ' +
    'уйдёт в тихую раннюю ветку вместо падения. Так фаза 2 эпика #74 (стрелки зависимостей ' +
    'на Ганте) молча не работала три релиза — см. шапку файла.\n  ' + missing.join('\n  '));
});

test('E2: разбор карты «модуль → фабрика» живой, а не вхолостую зелёный', function () {
  const pairs = contractPairs();
  assert.ok(pairs.length >= 20,
    'Пар модуль↔фабрика найдено ' + pairs.length + ' — разбор core.js сломался ' +
    '(переименовали фабрики, мосты или форму объявления). E1 в таком виде зелен вхолостую.');
  const gantt = pairs.find((p) => p.rel.endsWith('gantt-view.js'));
  assert.ok(gantt && gantt.used.has('getHost'),
    'Пара Ганта потеряна или он больше не читает getHost — регресс-якорь #93 обессмыслен.');
});
