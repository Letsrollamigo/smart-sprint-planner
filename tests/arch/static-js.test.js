/* Fitness functions N, X и W — статические проверки продуктового JS, которых не делают
 * ни сборка, ни остальные тесты.
 *
 * N — неизвестные имена. esbuild собирает файл с обращением к необъявленному имени без
 * предупреждения: для него это глобальная переменная. У бэкенда сборки нет вовсе. Опечатка
 * в имени или забытый импорт доживают до ReferenceError у пользователя — и только на той
 * ветке, где имя читается. Проверка типов TypeScript такое имя видит, но включать её целиком
 * нельзя: на JS без аннотаций это больше тысячи срабатываний шума (сужения DOM, мосты
 * `window.__X_*`). Поэтому из всей диагностики берётся одно семейство — «имя не найдено».
 *
 * X — экспорты модулей бэкенда. Бэкенд — CommonJS: `var core = require('./backend-core.js')`,
 * дальше `core.x(...)`. Уберите `x` из экспортов ядра — `core.x` станет undefined, и узнает
 * об этом только тот тест, который дойдёт до этой строки. Проба мутацией: удаление экспорта
 * `filterKeys` не ловил ни один тест. Экспорты берутся из загруженного модуля, а не разбором
 * текста: часть их объявлена через `Object.assign(exports, {...})`, и статический разбор
 * (сам TypeScript в том числе) их не видит.
 *
 * W — мосты `window.__X_*` фронта. Модуль публикует себя объектом (`window.__X_VIEW = api`),
 * потребитель берёт его с запасным значением: `var VIEW = (... && window.__X_VIEW) || {}` —
 * и зовёт `VIEW.render(...)`. Переименуйте `render` у издателя — сборка пройдёт, а голдены
 * подменяют мост заглушкой и тоже зелёные. Проба мутацией: переименование `getCurrentLang`
 * в загрузчике переводов роняло старт виджета, и этого не ловил никто. Состав моста берётся
 * из объекта-литерала издателя либо, если мостом выставлен модуль целиком (`import * as`),
 * из его экспортов.
 *
 * Границы. Проверяется продуктовый код: `backend-*.js`, `mcp-*.js`, `workflow-*.js` в корне
 * и `widgets/main/src/`; тесты и скрипты — нет. X видит `псевдоним.имя`, где псевдоним объявлен
 * как `var псевдоним = require('./файл.js')`, и `require('./файл.js').имя`; доступ по строке
 * (`core['x']`) и деструктуризацию не видит. Имена `__*` пропускаются: это флаги, которые
 * модули выставляют друг на друге при загрузке. W видит `window.__X_МОСТ.имя` и `псевдоним.имя`,
 * где псевдоним объявлен как сам мост или мост с запасным значением (`&&`, `||`, `??`, `?:`);
 * мост, выставленный не объектом (функция, флаг, массив), и объект со spread — вне проверки.
 *
 * Файл одинаков в обеих редакциях планера. TypeScript — только devDependency этого гейта:
 * в сборку и в зип не попадает.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURES = path.join(ROOT, 'tests', 'fixtures', 'static-js');
const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.jsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

const BACKEND = fs.readdirSync(ROOT).filter((f) => /^(backend|mcp|workflow)-.*\.js$/.test(f)).sort()
  .map((f) => path.join(ROOT, f));
const FRONTEND = walk(path.join(ROOT, 'widgets', 'main', 'src'), []).sort();
const FIXTURE_NAMES = path.join(FIXTURES, 'unknown-names.js');
const FIXTURE_EXPORTS = path.join(FIXTURES, 'missing-export.js');
const FIXTURE_BRIDGES = ['bridge-module.js', 'bridge-publish.js', 'bridge-consume.js'].map((f) => path.join(FIXTURES, f));

/* Одна программа на все проверки: разбор стандартных библиотек — основная цена запуска.
   noResolve + types: [] — результат зависит только от перечисленных файлов, а не от того,
   что лежит в node_modules. strict выключен намеренно: нужна не проверка типов, а имена. */
const program = ts.createProgram(BACKEND.concat(FRONTEND, [FIXTURE_NAMES, FIXTURE_EXPORTS], FIXTURE_BRIDGES), {
  allowJs: true, checkJs: true, noEmit: true, strict: false, noResolve: true, types: [], skipLibCheck: true,
  target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.Preserve,
});

/* ─────────────── N: неизвестные имена ─────────────── */

/* «Имя не найдено» у TypeScript — не один код: 2304 — обычный случай, 2552 и 2570 — он же
   с подсказкой «Did you mean», 18004 — сокращённое свойство `{ x }` без `x`; остальные — то же
   самое для имён, которые он узнаёт как глобалы Node, jQuery, тестовых раннеров и новых
   стандартных библиотек (2580–2584, 2591–2593). В рантаймах планера ничего из этого нет. */
const NAME_CODES = new Set([2304, 2552, 2570, 2580, 2581, 2582, 2583, 2584, 2591, 2592, 2593, 18004]);

/* Имена, которых нет в коде, но которые есть там, где он исполняется. `only` — имя допустимо
   только в этом файле: в другом месте оно снова ошибка. */
const HOST_NAMES = {
  YTApp: { why: 'объект хоста YouTrack, в странице виджета есть всегда' },
  XLSX: { why: 'SheetJS: догружается отдельным <script> перед первой выгрузкой в Excel' },
  process: { why: '`process.env.NODE_ENV` — сборка подставляет вместо него литерал (--define)',
    only: 'widgets/main/src/react/modal-mount.jsx' },
  require: { why: '`typeof require === \'function\'` — ветка для запуска модуля под node в юнит-тестах',
    only: 'widgets/main/src/domain/phases-view.js' },
};

function unknownNames(files) {
  const out = [];
  for (const f of files) {
    const sf = program.getSourceFile(f);
    for (const d of program.getSemanticDiagnostics(sf)) {
      if (!NAME_CODES.has(d.code)) continue;
      out.push({
        file: rel(f),
        line: sf.getLineAndCharacterOfPosition(d.start).line + 1,
        name: sf.text.slice(d.start, d.start + d.length),
      });
    }
  }
  return out;
}

function isHostName(u) {
  const h = Object.prototype.hasOwnProperty.call(HOST_NAMES, u.name) ? HOST_NAMES[u.name] : null;
  return !!h && (!h.only || h.only === u.file);
}

const PRODUCT_UNKNOWN = unknownNames(BACKEND.concat(FRONTEND));

test('N1: в продуктовом коде нет обращений к необъявленным именам', function () {
  const bad = PRODUCT_UNKNOWN.filter((u) => !isHostName(u)).map((u) => u.file + ':' + u.line + ' ' + u.name);
  assert.deepStrictEqual(bad, [],
    'Имя не объявлено ни в файле, ни в импортах, ни среди глобалов браузера. Сборка это ' +
    'пропускает, в рантайме будет ReferenceError на первой же ветке, где имя читается. ' +
    'Опечатка или забытый импорт — исправить; настоящий глобал хоста — добавить в HOST_NAMES ' +
    'с объяснением, откуда он берётся.\n  ' + bad.join('\n  '));
});

test('N2: проверка живая — каждое имя хоста из списка в коде действительно встречается', function () {
  const seen = new Set(PRODUCT_UNKNOWN.filter(isHostName).map((u) => u.name));
  const stale = Object.keys(HOST_NAMES).filter((n) => !seen.has(n));
  assert.deepStrictEqual(stale, [],
    'Имя из HOST_NAMES не найдено среди неизвестных. Либо код перестал его использовать ' +
    '(убрать из списка), либо программа TypeScript собрана не так и не видит ничего — тогда ' +
    'N1 зелен вхолостую.');
});

test('N3: гейт краснеет на каждом виде неизвестного имени (фикстура)', function () {
  assert.deepStrictEqual(unknownNames([FIXTURE_NAMES]).map((u) => u.name),
    ['undeclaredValue', 'declaerd', 'missingShorthand', 'process', '$'],
    'Фикстура tests/fixtures/static-js/unknown-names.js содержит пять неизвестных имён разного ' +
    'вида. Если найдены не все — после обновления TypeScript сменились коды диагностики: ' +
    'дополнить NAME_CODES.');
});

/* ─────────────── X: экспорты модулей бэкенда ─────────────── */

/* Все обращения `псевдоним.имя` и `require('./файл.js').имя` в файлах. Псевдоним сверяется
   по символу, а не по тексту: одноимённый параметр или локальная переменная — не модуль. */
function exportAccesses(files) {
  const checker = program.getTypeChecker();
  const out = [];
  for (const f of files) {
    const sf = program.getSourceFile(f);
    const required = function (node) {
      if (!node || !ts.isCallExpression(node) || !ts.isIdentifier(node.expression)) return null;
      const arg = node.arguments[0];
      if (node.expression.text !== 'require' || !arg || !ts.isStringLiteral(arg) || arg.text[0] !== '.') return null;
      return path.resolve(path.dirname(f), arg.text);
    };
    const aliases = new Map();   // объявление `var x = require(...)` → путь модуля
    (function collect(node) {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && required(node.initializer)) {
        aliases.set(node, required(node.initializer));
      }
      ts.forEachChild(node, collect);
    })(sf);
    (function visit(node) {
      if (ts.isPropertyAccessExpression(node)) {
        let mod = required(node.expression);
        if (!mod && ts.isIdentifier(node.expression)) {
          const sym = checker.getSymbolAtLocation(node.expression);
          const decl = sym && (sym.declarations || []).find((d) => aliases.has(d));
          if (decl) mod = aliases.get(decl);
        }
        if (mod) {
          out.push({
            file: rel(f),
            line: sf.getLineAndCharacterOfPosition(node.name.getStart(sf)).line + 1,
            module: mod,
            name: node.name.text,
          });
        }
      }
      ts.forEachChild(node, visit);
    })(sf);
  }
  return out;
}

function missingExports(accesses) {
  return accesses.filter((a) => !a.name.startsWith('__') && !(a.name in require(a.module)));
}

const BACKEND_ACCESSES = exportAccesses(BACKEND);

test('X1: каждое обращение к соседнему модулю бэкенда попадает в его экспорт', function () {
  const bad = missingExports(BACKEND_ACCESSES)
    .map((a) => a.file + ':' + a.line + ' ' + a.name + ' — нет в экспортах ' + rel(a.module));
  assert.deepStrictEqual(bad, [],
    'Модуль читает имя, которого соседний модуль не экспортирует: значение будет undefined, ' +
    'вызов упадёт в рантайме. Экспорт удалён или переименован — вернуть его либо поправить ' +
    'все обращения.\n  ' + bad.join('\n  '));
});

test('X2: разбор обращений живой, а не вхолостую зелёный', function () {
  const files = new Set(BACKEND_ACCESSES.map((a) => a.file));
  assert.ok(BACKEND_ACCESSES.length >= 300 && files.size >= 30,
    'Обращений к соседним модулям найдено ' + BACKEND_ACCESSES.length + ' в ' + files.size +
    ' файлах — разбор сломался (сменилась форма require или объявления псевдонима). ' +
    'X1 в таком виде зелен вхолостую.');
  assert.ok(BACKEND_ACCESSES.some((a) => a.file === 'backend-issuefields.js' && a.name === 'filterKeys'),
    'Обращение backend-issuefields.js → core.filterKeys не найдено — якорь пробы мутацией ' +
    '(удаление этого экспорта не ловил ни один тест) потерян.');
});

test('X3: гейт краснеет на несуществующем экспорте и не путает модуль с одноимённым параметром (фикстура)', function () {
  assert.deepStrictEqual(missingExports(exportAccesses([FIXTURE_EXPORTS])).map((a) => a.name),
    ['noSuchExport', 'alsoMissing']);
});

/* ─────────────── W: мосты window ─────────────── */

/* `window.__X_ИМЯ` (а также globalThis/self). Префикс моста в редакциях разный, поэтому
   в шаблоне он не зашит. */
function isBridge(node) {
  return !!node && ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)
    && /^(window|globalThis|self)$/.test(node.expression.text) && /^__[A-Z]+_/.test(node.name.text);
}

/* Мост, которому равна переменная: сам `window.__X_ИМЯ` либо он же за `&&`, `||`, `??`, `?:`
   и скобками. Любое другое выражение вокруг моста (вызов, отрицание, обращение к его члену)
   значит, что в переменной лежит уже не мост, — null. */
function aliasedBridge(init) {
  const found = new Set();
  let plain = true;
  (function scan(node, through) {
    if (isBridge(node)) { if (through) found.add(node.name.text); else plain = false; return; }
    const pass = through && (ts.isParenthesizedExpression(node) || ts.isConditionalExpression(node)
      || (ts.isBinaryExpression(node) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken,
        ts.SyntaxKind.QuestionQuestionToken].includes(node.operatorToken.kind)));
    ts.forEachChild(node, (child) => scan(child, pass));
  })(init, true);
  return plain && found.size === 1 ? [...found][0] : null;
}

/* Издатели и чтения мостов в файлах: { published: мост → Set имён | null (состав неизвестен),
   reads: [{ file, line, bridge, name }] }. */
function bridgeContract(files) {
  const checker = program.getTypeChecker();
  const published = new Map();
  const reads = [];
  const publish = function (bridge, names) {
    const had = published.get(bridge);
    published.set(bridge, !published.has(bridge) ? names : (had && names ? new Set([...had, ...names]) : null));
  };
  const literalKeys = (obj) => obj.properties.some((p) => !p.name || ts.isComputedPropertyName(p.name))
    ? null : new Set(obj.properties.map((p) => p.name.text));
  const shapeOf = function (expr) {
    if (ts.isObjectLiteralExpression(expr)) return literalKeys(expr);
    const sym = ts.isIdentifier(expr) ? checker.getSymbolAtLocation(expr) : null;
    const decl = sym && sym.declarations && sym.declarations[0];
    if (!decl) return null;
    if (ts.isVariableDeclaration(decl) && decl.initializer && ts.isObjectLiteralExpression(decl.initializer)) {
      return literalKeys(decl.initializer);
    }
    if (ts.isNamespaceImport(decl)) {   // `import * as x from './файл.js'` → экспорты файла
      const from = path.resolve(path.dirname(decl.getSourceFile().fileName), decl.parent.parent.moduleSpecifier.text);
      const mod = program.getSourceFile(from);
      const modSym = mod && checker.getSymbolAtLocation(mod);
      return modSym ? new Set(checker.getExportsOfModule(modSym).map((s) => s.name)) : null;
    }
    return null;
  };
  const isAssigned = (node) => ts.isBinaryExpression(node.parent) && node.parent.left === node
    && node.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken;

  for (const f of files) {
    const sf = program.getSourceFile(f);
    const aliases = new Map();   // объявление `var X = … window.__X_ИМЯ …` → мост
    (function collect(node) {
      if (isBridge(node) && isAssigned(node)) publish(node.name.text, shapeOf(node.parent.right));
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        const bridge = aliasedBridge(node.initializer);
        if (bridge) aliases.set(node, bridge);
      }
      ts.forEachChild(node, collect);
    })(sf);
    (function visit(node) {
      if (ts.isPropertyAccessExpression(node) && !isBridge(node)) {
        let bridge = isBridge(node.expression) ? node.expression.name.text : null;
        if (!bridge && ts.isIdentifier(node.expression)) {
          const sym = checker.getSymbolAtLocation(node.expression);
          const decl = sym && (sym.declarations || []).find((d) => aliases.has(d));
          if (decl) bridge = aliases.get(decl);
        }
        /* Присваивание `мост.имя = …` — член, досаженный на мост снаружи: он известен. */
        if (bridge && isAssigned(node)) publish(bridge, new Set([node.name.text]));
        else if (bridge) {
          reads.push({
            file: rel(f),
            line: sf.getLineAndCharacterOfPosition(node.name.getStart(sf)).line + 1,
            bridge: bridge,
            name: node.name.text,
          });
        }
      }
      ts.forEachChild(node, visit);
    })(sf);
  }
  return { published: published, reads: reads };
}

/* Чтения, которым нечему ответить: моста никто не публикует либо в его составе нет имени.
   Мост с неизвестным составом пропускается; `in {}` — встроенные члены любого объекта. */
function brokenReads(contract) {
  return contract.reads.filter(function (r) {
    if (!contract.published.has(r.bridge)) return true;
    const names = contract.published.get(r.bridge);
    return !!names && !names.has(r.name) && !(r.name in {});
  });
}

const BRIDGES = bridgeContract(FRONTEND);

test('W1: каждое обращение к мосту window попадает в то, что издатель моста публикует', function () {
  const bad = brokenReads(BRIDGES).map((r) => r.file + ':' + r.line + ' ' + r.bridge + '.' + r.name
    + (BRIDGES.published.has(r.bridge) ? ' — нет в составе моста' : ' — мост никто не публикует'));
  assert.deepStrictEqual(bad, [],
    'Потребитель читает с моста имя, которого издатель не публикует. Значение будет undefined: ' +
    'вызов упадёт в рантайме, а чтение под запасным `|| {}` молча уйдёт в пустую ветку. Сборка ' +
    'и голдены этого не видят. Член моста удалён или переименован — вернуть его либо поправить ' +
    'все обращения.\n  ' + bad.join('\n  '));
});

test('W2: разбор мостов живой, а не вхолостую зелёный', function () {
  const known = [...BRIDGES.published.values()].filter(Boolean).length;
  const checked = BRIDGES.reads.filter((r) => BRIDGES.published.get(r.bridge)).length;
  assert.ok(known >= 90 && checked >= 450,
    'Мостов с известным составом ' + known + ', проверяемых чтений ' + checked + ' — разбор сломался ' +
    '(сменилась форма публикации моста или объявления псевдонима). W1 в таком виде зелен вхолостую.');
  assert.ok(BRIDGES.reads.some((r) => r.file === 'widgets/main/src/core.js' && r.name === 'getCurrentLang'
      && BRIDGES.published.get(r.bridge)),
    'Чтение getCurrentLang из core.js не найдено или состав моста переводов неизвестен — якорь ' +
    'пробы мутацией (переименование роняло старт виджета, и этого не ловил никто) потерян.');
});

test('W3: гейт краснеет на несуществующем члене моста и на мосте без издателя (фикстура)', function () {
  assert.deepStrictEqual(brokenReads(bridgeContract(FIXTURE_BRIDGES)).map((r) => r.bridge + '.' + r.name),
    ['__FIX_VIEW.renderRenamed', '__FIX_NS__.aliveRenamed', '__FIX_VIEW.gone', '__FIX_NOBODY.member']);
});
