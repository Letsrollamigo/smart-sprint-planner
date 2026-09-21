#!/usr/bin/env node
/* scripts/gen-error-codes.js — реестр кодов отказов бэкенда: извлекает коды из backend-*.js,
 * сводит с описаниями Integrations/error-codes.notes.json и пишет Integrations/error-codes.json
 * (полный реестр) + Integrations/ERROR_CODES.md (таблица публикуемых кодов для документации).
 *
 * Копия скрипта живёт в ОБОИХ форках (fork-agnostic: ни имени приложения, ни префиксов хранилища).
 * Править синхронно: парити-гейт tests/mirror на scripts/ не распространяется.
 *
 * Запуск из корня репо:
 *   node scripts/gen-error-codes.js          # перегенерировать реестр и таблицу
 *   node scripts/gen-error-codes.js --check  # гейт (tests/arch/error-codes.test.js), четыре проверки:
 *     (1) error-codes.json и ERROR_CODES.md совпадают с генерацией;
 *     (2) у каждого кода есть описание в notes, у каждого описания есть код;
 *     (3) каждый публикуемый код встречается в Integrations/openapi-sprint.yaml;
 *     (4) `success: false` пишут только пять хелперов ядра (анти-обход).
 *
 * Правила извлечения:
 *   R1 — вызов хелпера отказа с литералом: badRequest(ctx, 'код'), в т.ч. форма
 *        `<выражение> || 'код'` (значение по умолчанию);
 *   R2 — склейка `'префикс' + …` → «код с суффиксом» (ключ реестра оканчивается на `:` или `_`);
 *        литерал с готовым суффиксом ('префикс: хвост') сводится к тому же префиксу;
 *   R3 — вложенные коды `errors[].code` — с родителем (отказ, который несёт этот errors[]);
 *   R4 — коды конверта из тел самих хелперов ядра (rev_conflict, internal_error, значения по умолчанию);
 *   R6 — коды разбора тела `__reason__: 'код'`;
 *   R7 — коды, которые функция возвращает строкой, а вызывающий передаёт в хелпер (RETURNED);
 *   R8 — шаблон модуля мелких операций `refuse: 'код'` (+ склейка для префиксов).
 * В шапке выходных файлов нет ни версии, ни даты: иначе --check краснел бы после каждого бампа.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'Integrations');
const NOTES = path.join(DIR, 'error-codes.notes.json');
const OUT_JSON = path.join(DIR, 'error-codes.json');
const OUT_MD = path.join(DIR, 'ERROR_CODES.md');
const CONTRACT = path.join(DIR, 'openapi-sprint.yaml');
const CORE = 'backend-core.js';

/* Пять хелперов ядра — единственные писатели success:false; остальные имена — обёртки над ними. */
const CORE_HELPERS = ['forbidden', 'badRequest', 'internalError', 'revConflict', 'refuseCompat'];
const WRAPPERS = { gForbid: 'forbidden', forbid: 'forbidden', gBad: 'badRequest', bad: 'badRequest', badWithErrors: 'badRequest', refuse: 'badRequest' };
const CALLABLE = ['forbidden', 'badRequest', 'internalError', 'refuseCompat'].concat(Object.keys(WRAPPERS));

/* R7 — функции, чьи строковые return становятся кодом отказа у вызывающего. */
const RETURNED = [
  { file: 'backend-core.js', fn: 'normalizeExcludedItems', helper: 'badRequest', prefix: '' },
  { file: 'backend-release.js', fn: 'engineerDiffAllowed', helper: 'forbidden', prefix: 'release_engineer_scope_' },
];

const CARRIERS = ['exErr', 'res.refuse'];   /* переменные-носители кодов правил R7 и R8 */

const files = fs.readdirSync(ROOT).filter((f) => /^backend-.*\.js$/.test(f)).sort();
const src = {};
for (const f of files) src[f] = fs.readFileSync(path.join(ROOT, f), 'utf8');

/* Срез top-level функции: от `function name(` в нулевой колонке до первой строки `}`. */
function sliceFn(file, name) {
  const lines = src[file].split('\n');
  const from = lines.findIndex((l) => l.indexOf('function ' + name + '(') === 0);
  if (from < 0) return null;
  if (/\}\s*$/.test(lines[from])) return { from, to: from, text: lines[from] };   /* однострочная */
  let to = from;
  while (to < lines.length && lines[to] !== '}') to++;
  return { from, to, text: lines.slice(from, to + 1).join('\n') };
}
function enclosingFn(file, lineIdx) {
  const lines = src[file].split('\n');
  for (let i = lineIdx; i >= 0; i--) { const m = /^function (\w+)\(/.exec(lines[i]); if (m) return m[1]; }
  return null;
}

/* Свойства пяти хелперов ядра — из их собственных тел (R4): статус, класс error, литерал/дефолт reason. */
const helperInfo = {};
for (const h of CORE_HELPERS) {
  const s = sliceFn(CORE, h);
  if (!s) throw new Error('gen-error-codes: в ' + CORE + ' не найден хелпер ' + h);
  const http = Number((/response\.status = (\d+)/.exec(s.text) || [])[1]);
  const err = (/error: '([^']+)'/.exec(s.text) || [])[1] || null;   /* у refuseCompat error = сам код */
  helperInfo[h] = { http, error: err, field: h === 'refuseCompat' ? 'both' : 'reason', slice: s };
}

const entries = new Map();   /* ключ `код|хелпер` → запись */
function add(code, helper, file, dynamic) {
  const info = helperInfo[helper];
  const key = code + '|' + helper;
  if (!entries.has(key)) entries.set(key, { code, http: info.http, error: info.error || code, field: info.field, helper, modules: [], dynamic: !!dynamic });
  const e = entries.get(key);
  if (e.modules.indexOf(file) < 0) e.modules.push(file);
}
/* 'префикс: хвост' и 'префикс:' + … → ключ 'префикс:'; 'префикс_' + … → 'префикс_'. */
function normalize(lit, glued) {
  const c = lit.indexOf(':');
  if (c >= 0) return { code: lit.slice(0, c + 1), dynamic: true };
  return { code: lit, dynamic: !!glued };
}

const callRe = new RegExp('\\b(' + CALLABLE.join('|') + ')\\(\\s*\\w+,\\s*(?:[\\w.]+\\s*\\|\\|\\s*)?\'([^\']+)\'(\\s*\\+)?', 'g');
for (const f of files) {
  let m;
  while ((m = callRe.exec(src[f]))) {                                  /* R1 + R2 */
    const n = normalize(m[2], m[3]);
    add(n.code, WRAPPERS[m[1]] || m[1], f, n.dynamic);
  }
  for (const r of src[f].matchAll(/__reason__:\s*'([a-z_]+)'/g)) add(r[1], 'badRequest', f, false);   /* R6 */
  for (const r of src[f].matchAll(/\brefuse:\s*'([^']+)'(\s*\+)?/g)) {                                   /* R8 */
    const n = normalize(r[1], r[2]);
    add(n.code, 'badRequest', f, n.dynamic);
  }
}
for (const h of CORE_HELPERS) {                                        /* R4 */
  const t = helperInfo[h].slice.text;
  for (const r of t.matchAll(/reason(?::| \|\|) '([a-z_]+)'/g)) add(r[1], h, CORE, false);
}
for (const r of RETURNED) {                                            /* R7 */
  const s = sliceFn(r.file, r.fn);
  if (!s) throw new Error('gen-error-codes: не найдена функция ' + r.fn + ' в ' + r.file + ' (RETURNED)');
  const lits = Array.from(s.text.matchAll(/return '([a-z_]+)'/g)).map((x) => x[1]);
  if (!lits.length) throw new Error('gen-error-codes: ' + r.fn + ' не возвращает ни одного кода');
  if (r.prefix) {
    const pk = r.prefix + '|' + r.helper;
    if (!entries.has(pk)) throw new Error('gen-error-codes: префикс ' + r.prefix + ' не найден в вызовах ' + r.helper);
    entries.delete(pk);                                                /* префикс заменяется перечнем вариантов */
  }
  for (const l of lits) add(r.prefix + l, r.helper, r.file, false);
}

/* R3 — вложенные errors[].code: родитель — отказ, который несёт этот errors[]:
   (а) `helper(ctx, 'P', X.errors)`, где `var X = F(` — коды из тела F;
   (б) `helper(ctx, 'P'…, { errors: … })` — коды из той же функции. */
const nested = new Map();   /* код → { parents:Set, modules:Set } */
for (const f of files) {
  const lines = src[f].split('\n');
  const owners = {};        /* имя функции → [родительские коды] */
  lines.forEach((l, i) => {
    const call = new RegExp('\\b(?:' + CALLABLE.join('|') + ')\\(\\s*\\w+,\\s*\'([^\']+)\'').exec(l);
    if (!call || !/\berrors\b/.test(l) || /^function /.test(l)) return;
    const parent = normalize(call[1], /'\s*\+/.test(l)).code;
    const viaVar = /(\w+)\.errors/.exec(l);
    let fn = enclosingFn(f, i);
    if (viaVar) { const d = new RegExp('var ' + viaVar[1] + ' = (\\w+)\\(').exec(src[f]); if (d) fn = d[1]; }
    (owners[fn] = owners[fn] || []).push(parent);
  });
  lines.forEach((l, i) => {
    for (const r of l.matchAll(/\bcode:\s*'([a-z_]+)'/g)) {
      const parents = owners[enclosingFn(f, i)];
      if (!parents) throw new Error('gen-error-codes: вложенный код ' + r[1] + ' (' + f + ':' + (i + 1) + ') без родительского отказа');
      for (const p of parents) {
        if (p.replace(/[:_]$/, '') === r[1]) continue;                 /* код дублирует собственного родителя */
        if (!nested.has(r[1])) nested.set(r[1], { parents: new Set(), modules: new Set() });
        nested.get(r[1]).parents.add(p); nested.get(r[1]).modules.add(f);
      }
    }
  });
}

const registry = Array.from(entries.values());
for (const [code, n] of nested) {
  if (registry.some((e) => e.code === code)) throw new Error('gen-error-codes: вложенный код ' + code + ' совпал с кодом верхнего уровня');
  registry.push({ code, http: 400, error: 'Bad Request', field: 'errors[].code', helper: 'badRequest', modules: Array.from(n.modules).sort(), dynamic: false, parent: Array.from(n.parents).sort() });
}
registry.forEach((e) => e.modules.sort());
registry.sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : a.helper < b.helper ? -1 : 1));

const notes = JSON.parse(fs.readFileSync(NOTES, 'utf8'));
const codes = Array.from(new Set(registry.map((e) => e.code)));
const isPublished = (c) => !!notes[c] && notes[c].published !== false;
for (const e of registry) e.published = isPublished(e.code);

function renderMd() {
  const cell = (s) => String(s || '').replace(/\|/g, '\\|');
  const L = [];
  L.push('# Коды отказов внешнего REST');
  L.push('');
  L.push('> Файл генерируется `scripts/gen-error-codes.js` из кода бэкенда и описаний `Integrations/error-codes.notes.json` — руками не править. Полный реестр, включая служебные коды, — `Integrations/error-codes.json`.');
  L.push('');
  L.push('Отказ приходит с HTTP 200 телом `{ success: false, error, reason, cid }`: `error` — класс, `reason` — код из таблицы, `cid` — идентификатор запроса для обращения в поддержку. Код, оканчивающийся на `:` или `_`, — префикс: сервер дописывает уточнение, сравнивать по началу строки.');
  L.push('');
  L.push('## Коды `reason`');
  L.push('');
  L.push('| Код | Класс | Что значит | Что делать |');
  L.push('|---|---|---|---|');
  const top = codes.filter((c) => isPublished(c) && registry.some((e) => e.code === c && !e.parent));
  for (const c of top) {
    const cls = Array.from(new Set(registry.filter((e) => e.code === c).map((e) => (e.field === 'both' ? 'код в `error`' : e.error)))).join(' / ');
    L.push('| `' + c + '` | ' + cls + ' | ' + cell(notes[c].ru) + ' | ' + cell(notes[c].action) + ' |');
  }
  L.push('');
  L.push('## Вложенные коды `errors[].code`');
  L.push('');
  L.push('Приходят в массиве `errors` родительского отказа; каждая запись указывает место ошибки.');
  L.push('');
  L.push('| Код | Родительский отказ | Что значит | Что делать |');
  L.push('|---|---|---|---|');
  for (const e of registry.filter((x) => x.parent && x.published)) {
    L.push('| `' + e.code + '` | ' + e.parent.map((p) => '`' + p + '`').join(', ') + ' | ' + cell(notes[e.code].ru) + ' | ' + cell(notes[e.code].action) + ' |');
  }
  L.push('');
  return L.join('\n');
}

function problems() {
  const P = [];
  for (const c of codes) {                                             /* (2) */
    const n = notes[c];
    if (!n) P.push('(2) нет описания в error-codes.notes.json: ' + c);
    else if (!n.ru || !n.action) P.push('(2) у описания нет ru/action: ' + c);
  }
  for (const k of Object.keys(notes)) if (codes.indexOf(k) < 0) P.push('(2) описание без кода в бэкенде (протухло): ' + k);
  /* (2) полнота извлечения: код, переданный в хелпер переменной, генератор не увидит. Разрешены
     только тела самих хелперов/обёрток и носители правил R7 (exErr) и R8 (res.refuse). */
  const nonLit = new RegExp('\\b(?:' + CALLABLE.join('|') + ')\\(\\s*\\w+,\\s*([^\'\\s,)][^,)]*)[,)]');
  for (const f of files) {
    src[f].split('\n').forEach((l, i) => {
      const m = nonLit.exec(l);
      if (!m || /^function /.test(l) || m[1].indexOf("'") >= 0 || CARRIERS.indexOf(m[1].trim()) >= 0) return;
      const fn = enclosingFn(f, i);
      if (WRAPPERS[fn] || CORE_HELPERS.indexOf(fn) >= 0) return;
      P.push('(2) код отказа передан не литералом — в реестр не попадёт: ' + f + ':' + (i + 1) + ' (' + m[1].trim() + ')');
    });
  }
  if (!fs.existsSync(CONTRACT)) P.push('(3) нет ' + path.relative(ROOT, CONTRACT));
  else {                                                               /* (3) */
    const y = fs.readFileSync(CONTRACT, 'utf8');
    /* ponytail: граница — только [a-z_]; код, у которого есть одноимённый префикс (`код:`), засчитывается и по префиксу */
    for (const c of codes.filter(isPublished)) {
      const esc = c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = /[:_]$/.test(c) ? new RegExp('(^|[^a-z_])' + esc) : new RegExp('(^|[^a-z_])' + esc + '($|[^a-z_])');
      if (!re.test(y)) P.push('(3) публикуемого кода нет в openapi-sprint.yaml: ' + c);
    }
  }
  for (const f of files) {                                             /* (4) */
    const allowed = f === CORE ? CORE_HELPERS.map((h) => helperInfo[h].slice) : [];
    src[f].split('\n').forEach((l, i) => {
      if (!/success['"]?\s*:\s*(false|!1)/.test(l)) return;
      if (allowed.some((s) => i >= s.from && i <= s.to)) return;
      P.push('(4) success:false мимо хелперов ядра: ' + f + ':' + (i + 1));
    });
  }
  return P;
}

const json = JSON.stringify({ $comment: 'Генерируется scripts/gen-error-codes.js — руками не править. Запись на пару «код + хелпер».', codes: registry }, null, 2) + '\n';
const md = renderMd();
const P = problems();
const check = process.argv.includes('--check');
if (check) {
  if ((fs.existsSync(OUT_JSON) ? fs.readFileSync(OUT_JSON, 'utf8') : null) !== json) P.unshift('(1) Integrations/error-codes.json устарел — запусти `npm run error-codes`');
  if ((fs.existsSync(OUT_MD) ? fs.readFileSync(OUT_MD, 'utf8') : null) !== md) P.unshift('(1) Integrations/ERROR_CODES.md устарел — запусти `npm run error-codes`');
} else {
  fs.writeFileSync(OUT_JSON, json, 'utf8');
  fs.writeFileSync(OUT_MD, md, 'utf8');
}
const pub = codes.filter(isPublished).length;
if (P.length) { console.error('error-codes:\n  ' + P.join('\n  ')); process.exit(1); }
console.log('error-codes: ' + (check ? 'актуален' : 'записан') + ' — кодов ' + codes.length + ', публикуемых ' + pub + ', записей реестра ' + registry.length);
