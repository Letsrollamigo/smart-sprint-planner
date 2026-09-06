#!/usr/bin/env node
/* scripts/gen-code-map.js — генератор Documentation/CODE_MAP.md: карта кода для ориентировки
 * без серии grep'ов (каталоги с подписями, модули фронта по слоям с назначением и мостами,
 * бэкенд с таблицей эндпоинтов, ручной индекс «где что»).
 *
 * Копия скрипта живёт в ОБОИХ форках (fork-agnostic: префикс мостов из package.json,
 * per-fork подписи каталогов — необязательный scripts/code-map.notes.json). Править синхронно:
 * парити-гейт tests/mirror на scripts/ не распространяется.
 *
 * Запуск из корня репо:
 *   node scripts/gen-code-map.js          # перегенерировать карту
 *   node scripts/gen-code-map.js --check  # гейт (tests/arch/code-map.test.js): файл совпадает
 *                                         # с генерацией И каждый путь ручного индекса существует
 *
 * В шапке карты намеренно нет ни версии, ни даты: иначе --check краснел бы после каждого
 * бампа, а карта стала бы ещё одной точкой синхронизации версии. Источники: module-registry.json
 * (слой/LOC/мосты — обновляется gen-arch-registry.js), заголовочные комментарии модулей,
 * объявления эндпоинтов backend-*.js, дерево каталогов.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'Documentation', 'CODE_MAP.md');
const reg = require(path.join(ROOT, 'module-registry.json'));
const lib = require(path.join(ROOT, 'tests', 'arch', '_lib.js'));
const SRC = 'widgets/main/src';
/* Префикс мостов window.__<NS>_* — самый частый в core.js (форки: SCBT / SSP), не литералом. */
const NS = (() => {
  const cnt = {};
  for (const m of fs.readFileSync(path.join(ROOT, SRC, 'core.js'), 'utf8').matchAll(/window\.__([A-Z0-9]+)_/g)) cnt[m[1]] = (cnt[m[1]] || 0) + 1;
  return Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0] || 'APP';
})();
const BRIDGE = '__' + NS + '_';

/* ── Ручная часть 1: подписи каталогов и корневых файлов (нейтральная проза, общая для форков).
   Ключ с '/' — каталог, ключ с '*' — группа файлов по маске. Каталог на диске без подписи
   печатается с пометкой «без подписи» (видно, что словарь отстал); подпись без каталога
   молча пропускается (корни форков различаются). Per-fork дополнения — code-map.notes.json. */
const NOTES = {
  'backend-*.js': 'бэкенд приложения: HTTP-обработчики (extensionEndpoints), исполняются внутри YouTrack; core = общие гейты, валидаторы, миграции; остальные — по фичам',
  'workflow-*.js': 'правила workflow YouTrack (Issue.onChange): агрегации, подтяжка состояния родителя, запрет контейнера; общая инфраструктура — workflow-common.js',
  'manifest.json': 'манифест приложения YouTrack: виджеты, версия, changeNotes',
  'entity-extensions.json': 'объявление extension-properties — слотов хранения на Project/User',
  'settings.json': 'JSON-схема параметров приложения (группа настройщика, debug-лог)',
  'module-registry.json': 'реестр модулей фронта: слой, LOC, стейт, мосты — контракт арх-гейтов',
  'package.json': 'сборка (esbuild), тесты (node --test), гейты, zip',
  'README.md': 'витрина проекта и актуальная версия',
  'widgets/': 'виджеты приложения',
  'widgets/main/': 'единственный виджет: index.html, собранные бандлы (main.js, vendored-react.chunk.js, ленивый recharts.chunk.js), ring-subset.css, i18n, lib',
  'widgets/main/src/': 'исходники фронта, esbuild → main.js',
  'widgets/main/src/core.js': 'ядро-монолит: стейт вкладки, инициализация, делегаторы в модули через мосты',
  'widgets/main/src/index.js': 'порядок сборки: импорты модулей',
  'widgets/main/src/data/': 'слой данных: обёртка бэкенда и REST YouTrack, загрузчики, данные отчётности',
  'widgets/main/src/domain/': 'доменные контроллеры и представления: спринт, история, релизы, бэклог, ёмкость, отчётность, Гант',
  'widgets/main/src/pure/': 'чистые функции без DOM и стейта: расчёты, слияние, даты, сортировка',
  'widgets/main/src/infra/': 'инфраструктура UI: тосты, модалки, датапикер, предпочтения, диагностика',
  'widgets/main/src/i18n/': 'локализация: загрузчик словарей, контроллер, список языков',
  'widgets/main/src/react/': 'React-компоненты на вендоренном Ring UI и точки монтирования',
  'widgets/main/src/icons.generated.js': 'словарь SVG-иконок, собирается build-icons.js — не править руками',
  'widgets/main/main.js': 'собранный бандл фронта (esbuild, минифицирован) — артефакт, не источник',
  'widgets/main/vendored-react.chunk.js': 'вендоренный React + Ring UI одним чанком — артефакт сборки',
  'widgets/main/recharts.chunk.js': 'ленивый чанк графиков отчётности — артефакт сборки',
  'CLAUDE.md': 'правила работы с репозиторием для сессий; общие правила форков — в соседнем Shared Docks',
  'package-lock.json': 'фиксация версий devDependencies (npm ci)',
  'widgets/main/src/icons/': 'SVG-иконки набора JetBrains, собираются в icons.generated.js',
  'widgets/main/i18n/': 'словари локалей (json)',
  'widgets/main/lib/': 'вендоренные библиотеки экспорта (pdfmake, xlsx) с лицензиями',
  'schema/': 'whitelists.json — источник allow-list ключей схемы, синхронизируется в бэкенд скриптом',
  'scripts/': 'сборка и гейты: whitelists, иконки, Ring-CSS, реестр модулей, карта кода, release-check, деплой на стенд',
  'tests/': 'node --test: unit, golden, arch, mirror, fixtures',
  'tests/arch/': 'architecture fitness: ратчеты LOC, топология, полнота реестра, актуальность карты кода',
  'tests/golden/': 'характеризационные тесты со снимками (.snap)',
  'tests/unit/': 'юнит-тесты бэкенда и чистых функций',
  'tests/fixtures/': 'фикстуры снимков схемы по версиям-границам, моки YouTrack',
  'tests/mirror/': 'парити форков: список fork-identical файлов',
  'tests/screenshots/': 'локальные кадры смоуков (не в git)',
  'Documentation/': 'документация: CHANGELOG, SECURITY (матрица доступа), гайды, эта карта',
  'Spec/': 'спеки и планы фич',
  'Prompts/': 'бутстрап-промпты сессий',
  'Roadmap/': 'заглушки-указатели на общую дорожную карту',
  'RoadMap/': 'заглушки-указатели на общую дорожную карту',
  'Integrations/': 'контракт внешних клиентов (OpenAPI), гайд подключения, материалы по модели прав',
  'design/': 'зеркало дизайн-системы: карточки UI на Ring CSS',
  'tools/': 'служебные скрипты вне рантайма',
  'docs/': 'опубликованная документация со скриншотами',
  'marketplace-screenshots/': 'кадры для витрины Marketplace',
  'MP publication/': 'материалы публикации на Marketplace',
  'NOTICE.md': 'уведомления о лицензиях вендоренных библиотек',
  'SECURITY.md': 'политика безопасности и матрица доступа',
  'LICENSE.md': 'лицензия',
  'NEXT_SESSION_PROMPT.md': 'промпт следующей сессии (legacy-расположение; канон — соседний каталог общих промптов)',
  'assets/': 'графика витрины',
};

/* ── Ручная часть 2: индекс «где что». Пути относительно корня; 'a|b' — первый существующий
   (форки расходятся именами доков); '?path' — необязательный (есть не в каждом форке).
   Несуществующий обязательный путь роняет генерацию и --check. */
const WHERE = [
  ['Optimistic lock: rev слотов, 409 rev_conflict, baseRev', ['backend-core.js', SRC + '/data/youtrack-api.js', SRC + '/domain/sprint-store.js']],
  ['Слияние правок при конфликте записи вместо отказа', [SRC + '/pure/slot-merge-pure.js', SRC + '/data/youtrack-api.js']],
  ['Миграции схемы снимков: цепочка, migrateSnap, маркер схемы, лестница депрекации', ['backend-core.js', 'tests/unit/schema-evolution.test.js', 'tests/fixtures/snapshots/']],
  ['Allow-list ключей схемы и настроек', ['schema/whitelists.json', 'scripts/sync-backend-whitelists.js']],
  ['Авторизация: гейты ролей, группы, матрица доступа', ['backend-core.js', 'Documentation/SECURITY.md|Documentation/SECURITY.ru.md|.github/SECURITY.md', 'tests/unit/security-matrix-invariant.test.js']],
  ['Запись в поля задач YouTrack: allow-list полей, видимость, права', ['backend-issuefields.js', SRC + '/domain/validation-controller.js', SRC + '/pure/sprint-field-pure.js']],
  ['Сетевой слой фронта: роутинг project/global, дедлайны чтения, обработка 409', [SRC + '/data/youtrack-api.js']],
  ['Пул бэклога: YT-запрос, пагинация, батчи родителей', [SRC + '/domain/backlog-loader.js']],
  ['Чанкованные массовые операции по 25', [SRC + '/domain/validation-controller.js', SRC + '/domain/release-controller.js', SRC + '/data/youtrack-api.js']],
  ['Ёмкость: расчёт, календарь, отсутствия, архив', ['backend-capacity.js', SRC + '/pure/capacity-pure.js', SRC + '/domain/capacity-store.js', SRC + '/domain/capacity-view.js']],
  ['История спринтов: снимки, экспорт и импорт', [SRC + '/domain/history-controller.js', SRC + '/domain/history-io.js', SRC + '/domain/history-view.js']],
  ['Релизы: состав, состояния, откат по истории', ['backend-release.js', SRC + '/domain/release-controller.js', SRC + '/domain/release-rollback.js']],
  ['Отчётность: activities, периоды, бисекция', [SRC + '/data/reporting-data.js', SRC + '/domain/reporting-view.js', SRC + '/pure/reporting-pure.js', 'backend-reporting.js']],
  ['Гант: история состояний, стрелки связей', [SRC + '/domain/gantt-view.js', SRC + '/data/youtrack-api.js']],
  ['Связи задач: роли типов связей, дерево', [SRC + '/pure/link-roles-pure.js', SRC + '/pure/release-tree-pure.js']],
  ['«Обновить из задачи»: слияние по классам полей', [SRC + '/domain/refresh-controller.js', SRC + '/pure/refresh-merge-pure.js']],
  ['Рабочие копии и черновики', [SRC + '/domain/working-copy.js', SRC + '/domain/draft-store.js']],
  ['Предпочтения пользователя: localStorage и серверное зеркало', [SRC + '/infra/user-prefs.js', 'backend-userprefs.js']],
  ['Диагностика: панель, слепок состояния', [SRC + '/infra/diag-snapshot.js']],
  ['Модалки и тосты Ring UI', [SRC + '/infra/modal-specs.js', SRC + '/infra/toast-ring.js', SRC + '/react/modal-bodies.jsx']],
  ['Локализация', [SRC + '/i18n/loader.js', SRC + '/i18n/i18n-controller.js', 'widgets/main/i18n/']],
  ['Главное меню: выбор проекта, фильтр проектов', ['backend-global.js', SRC + '/domain/project-nav.js']],
  ['Отключение планера в проекте', ['backend-plannerdisable.js']],
  ['Блокировка создания спринтов', ['backend-sprintlock.js']],
  ['Workflow-правила: агрегации, подтяжка состояния', ['workflow-common.js', 'workflow-cascade-aggregation.js', 'workflow-dta-aggregation.js', 'workflow-state-rollup.js', 'workflow-forbid-container.js']],
  ['Даты и часовые пояса', [SRC + '/pure/date-pure.js', SRC + '/pure/period-pure.js']],
  ['Экспорт в Excel и PDF', [SRC + '/domain/excel-export.js', SRC + '/pure/reporting-export-pure.js', 'widgets/main/lib/']],
  ['Точки версии и релизный гейт', ['manifest.json', 'package.json', 'backend-core.js', SRC + '/core.js', 'scripts/release-check.sh']],
  ['Сборка: esbuild, вендоринг React и Ring, иконки', ['package.json', SRC + '/react/vendor.js', 'scripts/build-icons.js', 'scripts/extract-ring-subset.js']],
  ['Арх-гейты: реестр модулей, ратчеты, парити форков', ['module-registry.json', 'tests/arch/', '?tests/mirror/']],
  ['Деплой на тест-стенд', ['scripts/stand-deploy.sh']],
];

/* ── helpers ─────────────────────────────────────────────────────────────── */
const SKIP_DIRS = new Set(['node_modules', 'test-results', '.git', '.claude', 'playwright-report']);
function exists(rel) { return fs.existsSync(path.join(ROOT, rel)); }
function resolveAlt(spec) {
  const optional = spec.startsWith('?');
  const alts = (optional ? spec.slice(1) : spec).split('|');
  const hit = alts.find(exists);
  if (!hit && !optional) throw new Error('code-map: путь ручного индекса не существует: ' + spec);
  return hit || null;
}
function readNotes() {
  const p = path.join(ROOT, 'scripts', 'code-map.notes.json');
  return fs.existsSync(p) ? Object.assign({}, NOTES, JSON.parse(fs.readFileSync(p, 'utf8'))) : NOTES;
}
function esc(s) { return String(s).replace(/\|/g, '\\|').replace(/\r?\n/g, ' '); }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

/* Первая содержательная строка заголовочного комментария модуля, без префиксов
   «имя.js —» и «<Название приложения> —». */
function headline(rel) {
  const base = path.basename(rel);
  let src = read(rel).replace(/^﻿/, '').replace(/^\s*'use strict';\s*/, '');
  const block = /\/\*\*?([\s\S]*?)\*\//.exec(src);
  let text = block ? block[1] : ((/^\s*\/\/\s*(.*)$/m.exec(src) || [])[1] || '');
  const lines = text.split('\n').map((l) => l.replace(/^\s*\*+\s?/, '').trim()).filter(Boolean);
  if (lines.length && lines[0].endsWith(base)) lines.shift();               /* «widgets/.../loader.js» отдельной строкой */
  let first = lines.slice(0, 3).join(' ');                                    /* заголовок часто переносится на 2–3 строки */
  first = first.replace(new RegExp('^.*?' + base.replace(/\./g, '\\.') + '\\s*[—–-]+\\s*'), '');
  first = first.replace(/^[^—]{0,60}(?:[Пп]ланер|[Pp]lanner)[^—]*—\s*/, '');  /* «<Название> — …» в бэкенде и workflow */
  first = first.replace(/^v\d+\.\d+\.\d+(?:\s+\S+){0,3}\s+—\s*/, '');     /* «v2.0.0 D125 — …» — код ревизии без смысла для читателя */
  first = first.split(/(?<=[.;])\s+(?=[А-ЯA-Z#(«])/)[0];
  if (first.length > 150) first = first.slice(0, 147) + '…';
  return esc(first);
}

function listDir(rel) {
  return fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })
    .filter((d) => !d.name.startsWith('.') && !SKIP_DIRS.has(d.name))
    .map((d) => ({ name: d.name, dir: d.isDirectory() }))
    .sort((a, b) => (a.dir !== b.dir ? (a.dir ? -1 : 1) : a.name.localeCompare(b.name, 'en')));
}
function noteFor(notes, rel, isDir) {
  const key = isDir ? rel + '/' : rel;
  if (notes[key]) return notes[key];
  const base = path.basename(rel);
  const glob = Object.keys(notes).find((k) => k.includes('*') && new RegExp('^' + k.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$').test(base));
  return glob ? notes[glob] : null;
}
/* Каталог: группы файлов по маске сворачиваются в одну строку. */
function treeSection(notes, rel, depth) {
  const out = [];
  const seenGlob = new Set();
  for (const e of listDir(rel)) {
    const child = rel ? rel + '/' + e.name : e.name;
    const key = e.dir ? child + '/' : child;
    let label = e.dir ? e.name + '/' : e.name;
    let note = notes[key] || null;
    if (!note && !e.dir) {
      const glob = Object.keys(notes).find((k) => k.includes('*') && new RegExp('^' + k.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$').test(e.name));
      if (glob) { if (seenGlob.has(glob)) continue; seenGlob.add(glob); label = glob; note = notes[glob]; }
    }
    if (!note && !e.dir && !/\.(js|json|md|sh)$/.test(e.name)) continue;      /* svg/лицензии/прочее не перечисляем */
    out.push('  '.repeat(depth) + '- `' + label + '`' + (note ? ' — ' + esc(note) : ' — (без подписи)'));
    if (e.dir && depth === 0 && ['widgets', 'tests'].includes(e.name)) out.push(...treeSection(notes, child, depth + 1));
    if (e.dir && child === 'widgets/main') out.push(...treeSection(notes, child, depth + 1));
    if (e.dir && child === 'widgets/main/src') out.push(...treeSection(notes, child, depth + 1));
  }
  return out;
}

function endpoints() {
  const rows = [];
  for (const f of fs.readdirSync(ROOT).filter((n) => /^backend-.*\.js$/.test(n)).sort()) {
    const lines = read(f).split('\n');
    lines.forEach((l, i) => {
      if (/^\s*(\/\/|\*)/.test(l)) return;
      const pm = /\bpath:\s*'([^']+)'/.exec(l);
      if (!pm) return;
      let method = '?', scope = 'project';
      for (let k = i; k >= Math.max(0, i - 5); k--) {
        const mm = /\bmethod:\s*'(GET|POST|PUT|DELETE)'/.exec(lines[k]);
        if (mm && method === '?') method = mm[1];
        const sm = /\bscope:\s*'(\w+)'/.exec(lines[k]);
        if (sm) scope = sm[1];
      }
      rows.push({ file: f, method, path: pm[1], scope });
    });
  }
  return rows;
}

/* ── render ──────────────────────────────────────────────────────────────── */
function render() {
  const notes = readNotes();
  const L = [];
  L.push('# Карта кода');
  L.push('');
  L.push('> Сгенерировано `scripts/gen-code-map.js` (`npm run code-map`), руками не править: гейт `tests/arch/code-map.test.js` сверяет файл с генерацией и существование путей индекса. Назначение — ориентировка в репозитории без серии grep\'ов: перед поиском по коду прочитать нужный раздел. Версии и даты в карте нет намеренно.');
  L.push('');
  L.push('## 1. Каталоги и корневые файлы');
  L.push('');
  L.push(...treeSection(notes, '', 0));
  L.push('');
  L.push('## 2. Фронт: модули по слоям');
  L.push('');
  L.push('Слой и LOC — из `module-registry.json`; мосты — глобалы `window.' + BRIDGE + '*`, через которые ядро зовёт модуль; назначение — первая строка заголовка модуля.');
  L.push('');
  const coreLoc = lib.nonEmptyLOC(read(SRC + '/core.js'));
  L.push('| Модуль | LOC | Мосты | Назначение |');
  L.push('|---|---|---|---|');
  L.push('| `core.js` | ' + coreLoc + ' | — | ' + headline(SRC + '/core.js') + ' |');
  L.push('');
  const byLayer = {};
  for (const key of lib.listModules()) {
    const m = reg.modules[key];
    if (!m) throw new Error('code-map: модуль без записи в реестре: ' + key);
    (byLayer[m.layer] = byLayer[m.layer] || []).push(key);
  }
  for (const layer of ['data', 'domain', 'pure', 'infra', 'i18n']) {
    if (!byLayer[layer]) continue;
    L.push('### ' + layer + '/ — ' + esc(notes[SRC + '/' + layer + '/'] || ''));
    L.push('');
    L.push('| Модуль | LOC | Мосты | Назначение |');
    L.push('|---|---|---|---|');
    for (const key of byLayer[layer].sort()) {
      const m = reg.modules[key];
      const bridges = (m.publishes || []).map((s) => '`' + BRIDGE + s + '`').join(', ') || '—';
      L.push('| `' + path.basename(key) + '` | ' + m.loc + ' | ' + bridges + ' | ' + headline(SRC + '/' + key) + ' |');
    }
    L.push('');
  }
  L.push('### react/ — ' + esc(notes[SRC + '/react/'] || ''));
  L.push('');
  L.push('| Компонент | LOC | Назначение |');
  L.push('|---|---|---|');
  for (const key of lib.listJsxModules().sort()) {
    const m = (reg.jsx && reg.jsx.modules && reg.jsx.modules[key]) || {};
    L.push('| `' + path.basename(key) + '` | ' + (m.loc != null ? m.loc : '?') + ' | ' + headline(SRC + '/' + key) + ' |');
  }
  L.push('');
  L.push('## 3. Бэкенд и workflow');
  L.push('');
  L.push('| Файл | Назначение |');
  L.push('|---|---|');
  for (const f of fs.readdirSync(ROOT).filter((n) => /^(backend|workflow)-.*\.js$/.test(n)).sort()) {
    L.push('| `' + f + '` | ' + headline(f) + ' |');
  }
  L.push('');
  L.push('### Эндпоинты (`path:` в backend-*.js; scope global — обработчик главного меню, project — проектный)');
  L.push('');
  L.push('| Метод | Путь | Scope | Модуль |');
  L.push('|---|---|---|---|');
  for (const e of endpoints()) L.push('| ' + e.method + ' | `' + e.path + '` | ' + e.scope + ' | `' + e.file + '` |');
  L.push('');
  L.push('## 4. Где что: вопрос → файлы');
  L.push('');
  L.push('| Вопрос | Файлы |');
  L.push('|---|---|');
  for (const [q, paths] of WHERE) L.push('| ' + esc(q) + ' | ' + paths.map(resolveAlt).filter(Boolean).map((p) => '`' + p + '`').join(', ') + ' |');
  L.push('');
  return L.join('\n');
}

const check = process.argv.includes('--check');
let content;
try { content = render(); } catch (e) { console.error(String(e.message || e)); process.exit(1); }
if (check) {
  const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null;
  if (cur !== content) {
    console.error('code-map: Documentation/CODE_MAP.md устарел — запусти `npm run code-map`' + (cur === null ? ' (файла нет)' : ''));
    process.exit(1);
  }
  console.log('code-map: актуален');
} else {
  fs.writeFileSync(OUT, content, 'utf8');
  console.log('code-map: записан ' + path.relative(ROOT, OUT) + ' (' + content.split('\n').length + ' строк)');
}
