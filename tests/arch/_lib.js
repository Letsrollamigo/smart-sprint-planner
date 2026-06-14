/* tests/arch/_lib.js — статический анализатор модулей для architecture fitness functions.
 *
 * Без сторонних зависимостей и без полноценного парсера: лёгкий char-токенизатор,
 * который (1) вырезает комментарии и содержимое строк/шаблонов/regex, заменяя их
 * пробелами (структура и переносы строк сохраняются), и (2) считает глубину фигурных
 * скобок. Этого достаточно, чтобы НАДЁЖНО отличать объявления уровня модуля от
 * локальных переменных функций и видеть реальные обращения к мостам в КОДЕ (не в
 * комментариях). Точность не абсолютная (см. ограничения ниже) — но гейты на её
 * основе устроены дифференциально (ratchet/baseline), поэтому важна СТАБИЛЬНОСТЬ
 * сигнала, а не идеальный разбор: новый module-level стейт или новое cross-domain
 * ребро становятся видимым diff'ом, и это всё, что нужно тривайру.
 *
 * Ограничения (задокументированы намеренно): regex-литералы с фигурными скобками
 * (напр. /a{2}/) на УРОВНЕ МОДУЛЯ могли бы сбить счётчик глубины — в кодовой базе
 * такого нет (regex живут внутри функций, глубже module-level); если появится —
 * вынести в исключение. JSX (.jsx) не анализируется (другой слой/синтаксис).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '..', '..', 'widgets', 'main', 'src');

/* Файлы, НЕ являющиеся доменными модулями (исключаются из арх-проверок). */
const EXCLUDE = new Set(['core.js', 'index.js', 'icons.generated.js']);

/* Каталоги-слои («доминионы звезды»), в которые разнесены модули. '' = корень src/
   (после фолдинга там только EXCLUDE-файлы). react/common/icons НЕ сканируются намеренно. */
const MODULE_DIRS = ['', 'domain', 'infra', 'pure', 'data', 'i18n'];

/** Список анализируемых модулей (layer-папки src/), относительными именами. */
function listModules() {
  const out = [];
  for (const d of MODULE_DIRS) {
    const dir = d ? path.join(SRC, d) : SRC;
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.js')) continue;
      if (d === '' && EXCLUDE.has(f)) continue;
      out.push(d ? d + '/' + f : f);
    }
  }
  return out.sort();
}

function readModule(rel) {
  return fs.readFileSync(path.join(SRC, rel), 'utf8');
}

function nonEmptyLOC(src) {
  return src.split('\n').filter((l) => l.trim().length > 0).length;
}

/** Вырезает комментарии и содержимое строк/шаблонов, сохраняя длину/переносы строк. */
function stripCommentsAndStrings(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  let st = 'code'; // code|line|block|sq|dq|tpl
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (st === 'code') {
      if (c === '/' && c2 === '/') { st = 'line'; out += '  '; i += 2; continue; }
      if (c === '/' && c2 === '*') { st = 'block'; out += '  '; i += 2; continue; }
      if (c === "'") { st = 'sq'; out += ' '; i++; continue; }
      if (c === '"') { st = 'dq'; out += ' '; i++; continue; }
      if (c === '`') { st = 'tpl'; out += ' '; i++; continue; }
      out += c; i++; continue;
    }
    if (st === 'line') { if (c === '\n') { st = 'code'; out += '\n'; } else out += ' '; i++; continue; }
    if (st === 'block') {
      if (c === '*' && c2 === '/') { st = 'code'; out += '  '; i += 2; }
      else { out += c === '\n' ? '\n' : ' '; i++; }
      continue;
    }
    if (st === 'sq') { if (c === '\\') { out += '  '; i += 2; continue; } if (c === "'") st = 'code'; out += ' '; i++; continue; }
    if (st === 'dq') { if (c === '\\') { out += '  '; i += 2; continue; } if (c === '"') st = 'code'; out += ' '; i++; continue; }
    if (st === 'tpl') { if (c === '\\') { out += '  '; i += 2; continue; } if (c === '`') st = 'code'; out += c === '\n' ? '\n' : ' '; i++; continue; }
  }
  return out;
}

/** Глубина фигурных скобок «уровня модуля»: 1 для IIFE-обёрток, 0 для «голых» модулей. */
function moduleDepth(stripped) {
  const t = stripped.replace(/^\s+/, '');
  return t.startsWith('(function') || t.startsWith('(()') || t.startsWith('!function') ? 1 : 0;
}

/**
 * Идентификаторы, объявленные через var/let НА УРОВНЕ МОДУЛЯ (mutable persistent state).
 * const исключён намеренно (immutable-binding); mutable-контейнеры за const — вторичный
 * сигнал, проверяется отдельным правилом в спеке, не здесь.
 */
function moduleLevelVarLet(src) {
  /* Indent-based (не brace-depth): кодовая база консистентно отбита, и отступ
     иммунен к regex/template-десинхрону, в отличие от подсчёта скобок. Стиль
     обёртки задаёт отступ уровня модуля: IIFE → 2 пробела, «голый» → колонка 0. */
  const s = stripCommentsAndStrings(src);
  const md = moduleDepth(s); // 1 = IIFE (2-space), 0 = bare (col 0)
  const indent = md === 1 ? '  ' : '';
  const re = new RegExp('^' + indent + '(?:var|let)\\s+([A-Za-z_$][\\w$]*)');
  const names = new Set();
  for (const ln of s.split('\n')) {
    if (md === 1 && /^   /.test(ln)) continue; // 3+ пробелов = глубже уровня модуля
    const m = re.exec(ln);
    if (m) names.add(m[1]);
  }
  return [...names].sort();
}

/** Все токены мостов (__SCBT_ / __SSP_), встречающиеся в КОДЕ (комменты уже вырезаны). */
function bridgeTokens(src) {
  const s = stripCommentsAndStrings(src);
  const set = new Set();
  const re = /__(?:SCBT|SSP)_[A-Z0-9_]+/g;
  let m;
  while ((m = re.exec(s))) set.add(m[0]);
  return set;
}

/** Мост(ы), которые модуль ПУБЛИКУЕТ: `window.__X = ` или `__X = `. */
function publishedBridges(src) {
  const s = stripCommentsAndStrings(src);
  const set = new Set();
  const re = /(?:window\.)?(__(?:SCBT|SSP)_[A-Z0-9_]+)\s*=(?!=)/g;
  let m;
  while ((m = re.exec(s))) set.add(m[1]);
  return set;
}

/* Классификация моста по СЛОЮ (fork-agnostic — по суффиксу без __SCBT_/__SSP_).
   leaf-слои (infra/pure/i18n) может тянуть кто угодно; domain — нет (только через core deps). */
const INFRA_SUFFIX = new Set([
  'ICONS', 'TABLE', 'DATEPICKER', 'DP_BRIDGE', 'RADIO', 'CHECKBOX', 'INPUT', 'SELECT',
  'TABS', 'COLLAPSE', 'LOADER', 'RING_MODAL', 'MODAL_ANCHOR', 'MODAL_SPECS',
  'GANTT_MOUNT', 'STANDUP_MOUNT', 'TOAST', 'TOAST_RING',
]);
const I18N_SUFFIX = new Set(['T', 'I']);
function bridgeLayer(token) {
  const s = token.replace(/^__(?:SCBT|SSP)_/, '');
  if (/_PURE$/.test(s)) return 'pure';
  if (I18N_SUFFIX.has(s)) return 'i18n';
  if (INFRA_SUFFIX.has(s)) return 'infra';
  return 'domain';
}

module.exports = {
  SRC,
  EXCLUDE,
  bridgeLayer,
  listModules,
  readModule,
  nonEmptyLOC,
  stripCommentsAndStrings,
  moduleDepth,
  moduleLevelVarLet,
  bridgeTokens,
  publishedBridges,
};
