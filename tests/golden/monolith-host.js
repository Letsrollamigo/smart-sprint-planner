/**
 * Golden-master host: исполняет НАСТОЯЩИЙ legacy-monolith.js в jsdom-песочнице
 * под node --test (Фаза 2 программы декомпозиции, MONOLITH_REFACTOR_STRATEGY §4.2).
 *
 * Принципы:
 *   - Файл монолита НЕ модифицируется: хук доступа инжектируется в копию
 *     исходника в памяти перед eval (перед закрывающей `})();` IIFE).
 *   - DOM = настоящий widgets/main/index.html (все контейнеры существуют).
 *   - Bridge-модули (`*-pure.js`, icons, click-anchor, ring-class-helpers) —
 *     настоящие исходники (plain side-effect скрипты, исполняются как есть).
 *   - i18n: словари en/ru читаются напрямую из widgets/main/i18n/*.json
 *     (i18n-bridge.js — ESM, в песочнице заменён минимальным стабом loader-API).
 *   - init-цепочка ЗАМОРОЖЕНА: YTApp.register() возвращает never-resolving
 *     Promise → виджет не стартует сам; состояние ставят тесты через hook.set().
 *   - Детерминизм: Date заморожен (FIXED_NOW), Math.random — seeded LCG,
 *     язык фиксирован через localStorage.ssp_lang.
 *
 * Hook API (window.__GM, generic через direct-eval внутри closure IIFE):
 *   gm.get('name')          → значение closure-переменной/функции
 *   gm.set({name: value})   → присваивание closure-переменных (strict: опечатка = ReferenceError)
 *   gm.call('fname', a, b)  → вызов closure-функции
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..', '..');
const SRC = path.join(ROOT, 'widgets', 'main', 'src');
const WIDGET = path.join(ROOT, 'widgets', 'main');

/** Зафиксированное «сейчас» всех golden-прогонов: 2026-06-01T12:00:00Z. */
const FIXED_NOW = 1780315200000;

/* Bridge-модули в порядке index.js (без ESM i18n-bridge и React-маунтов). */
const BRIDGE_SCRIPTS = [
  'click-anchor.js',
  'icons.generated.js',
  'ring-class-helpers.js',
  'toast-pure.js',
  'sort-pure.js',
  'period-pure.js',
  'enum-locale-pure.js',
  'date-pure.js',
  'hash-pure.js',
  'util-pure.js',
  'migrate-pure.js',
  'refresh-merge-pure.js',
  'share-url-pure.js',
  'modal-specs.js',
  'excel-export.js',
  'revalidation.js',
  'history-io.js',
  'pick.js',
  'youtrack-api.js',
  'working-copy.js',
  'standup-view.js',
  'currentrole-view.js',
  'rolecomposition-view.js',
  'history-view.js',
];

const GM_HOOK = `
  /* === GOLDEN-MASTER HOOK — инжектируется только в тестах (monolith-host.js), в бандл не попадает === */
  var __gmTmp;
  window.__GM = {
    get: function (name) { return eval(name); },
    set: function (vars) { for (var __gmK in vars) { __gmTmp = vars[__gmK]; eval(__gmK + ' = __gmTmp;'); } },
    call: function (name) { var __gmF = eval(name); return __gmF.apply(null, Array.prototype.slice.call(arguments, 1)); }
  };
`;

function seededRandom(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Создаёт песочницу с загруженным монолитом.
 * @param {object} [opts]
 * @param {string} [opts.lang='ru'] — язык T() (фиксируется до eval монолита).
 * @returns {{ window: object, document: object, gm: {get,set,call}, fetchAppLog: Array }}
 */
function createHost(opts) {
  opts = opts || {};
  const lang = opts.lang || 'ru';

  const html = fs.readFileSync(path.join(WIDGET, 'index.html'), 'utf8');
  const dom = new JSDOM(html, {
    url: 'http://localhost:8080/api/appResources/test/widgets/main/index.html',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const window = dom.window;

  /* ── Детерминизм ──────────────────────────────────────────── */
  const RealDate = window.Date;
  class FrozenDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(FIXED_NOW);
      else super(...args);
    }
    static now() { return FIXED_NOW; }
  }
  window.Date = FrozenDate;
  window.Math.random = seededRandom(20260601);
  window.localStorage.setItem('ssp_lang', lang);

  /* ── Browser-API стабы вне jsdom ──────────────────────────── */
  if (!window.matchMedia) {
    window.matchMedia = function () {
      return { matches: false, addEventListener: function () {}, removeEventListener: function () {}, addListener: function () {}, removeListener: function () {} };
    };
  }
  if (!window.scrollTo) window.scrollTo = function () {};

  /* ── YTApp: init-цепочка заморожена ───────────────────────── */
  const fetchAppLog = [];
  window.YTApp = {
    register: function () { return new window.Promise(function () {}); },
    serverUrl: 'http://localhost:8080',
    widget: { id: 'ssp-main' },
    entity: { id: 'gm-project-id', shortName: 'GM' },
  };
  window.YT = {
    host: {
      fetchYouTrack: function (p) { fetchAppLog.push({ kind: 'yt', path: p }); return window.Promise.resolve({}); },
      fetchApp: function (p, o) { fetchAppLog.push({ kind: 'app', path: p, opts: o }); return window.Promise.resolve({}); },
    },
  };

  /* ── React-бриджи: recording-стабы ─────────────────────────
     Граница golden-характеризации = контракт «IIFE → бридж»: стаб пишет
     вызов в bridgeLog, mountAt дополнительно стэшит opts на host
     (host.__sspTableOpts — как настоящий table-mount.jsx), чтобы тест мог
     материализовать ячейки через columns[].getValue(item). React-сторона
     не характеризуется — она не предмет декомпозиции монолита. */
  const bridgeLog = [];
  function rec(bridge, method, fn) {
    return function () {
      const args = Array.prototype.slice.call(arguments);
      bridgeLog.push({ bridge, method, hostId: args[0] && args[0].id ? args[0].id : undefined });
      if (fn) return fn.apply(null, args);
    };
  }
  window.__SSP_TABLE = {
    mountAt: rec('TABLE', 'mountAt', function (host, opts) { if (host) host.__sspTableOpts = opts || {}; }),
    unmountAt: rec('TABLE', 'unmountAt', function (host) { if (host) { try { delete host.__sspTableOpts; } catch (_) {} } }),
    unmountAllIn: rec('TABLE', 'unmountAllIn'),
  };
  window.__SSP_RADIO = { mountAllIn: rec('RADIO', 'mountAllIn'), unmountAllIn: rec('RADIO', 'unmountAllIn') };
  window.__SSP_TABS = { mountAt: rec('TABS', 'mountAt', function (host, opts) { if (host) host.__sspTabsOpts = opts || {}; }) };
  window.__SSP_LOADER = { attach: rec('LOADER', 'attach'), detach: rec('LOADER', 'detach') };
  window.__SSP_INPUT = { mountAllIn: rec('INPUT', 'mountAllIn') };
  window.__SSP_SELECT = { mountAllIn: rec('SELECT', 'mountAllIn') };
  window.__SSP_COLLAPSE = { mountAllIn: rec('COLLAPSE', 'mountAllIn') };
  window.__SSP_DATEPICKER = { mountAllIn: rec('DATEPICKER', 'mountAllIn'), unmountAll: rec('DATEPICKER', 'unmountAll') };
  /* Stand-up (Тир D слайс 1, ступень 2): standup-view.js строит vm и отдаёт мосту —
     стаб стэшит vm на host (host.__sspStandupVm), голдены характеризуют контракт
     «модуль → __SSP_STANDUP_MOUNT» (React-сторона — standup-view.jsx — живьём). */
  window.__SSP_STANDUP_MOUNT = {
    mountAt: rec('STANDUP', 'mountAt', function (host, vm) { if (host) host.__sspStandupVm = vm || null; }),
    unmountAt: rec('STANDUP', 'unmountAt', function (host) { if (host) { try { delete host.__sspStandupVm; } catch (_) {} } }),
  };
  const modalLog = [];
  window.__SSP_RING_MODAL = {
    open: function (spec) { modalLog.push(spec); bridgeLog.push({ bridge: 'RING_MODAL', method: 'open' }); return { close: function () {} }; },
    mountInline: rec('RING_MODAL', 'mountInline'),
    close: rec('RING_MODAL', 'close'),
  };

  /* ── i18n: словари напрямую из JSON, loader — минимальный стаб ── */
  const dictEn = JSON.parse(fs.readFileSync(path.join(WIDGET, 'i18n', 'en.json'), 'utf8'));
  const dictRu = JSON.parse(fs.readFileSync(path.join(WIDGET, 'i18n', 'ru.json'), 'utf8'));
  window.__SSP_I18N_DICTS__ = { en: dictEn, ru: dictRu };
  window.__SSP_I18N_LANGS__ = [
    { code: 'en', label: 'English' },
    { code: 'ru', label: 'Русский' },
  ];
  window.__SSP_I18N_PLURAL__ = { plural: function (n, forms) { return Array.isArray(forms) ? forms[0] : forms; } };
  window.__SSP_I18N__ = {
    getCurrentLang: function () { return lang; },
    setLang: function () { return window.Promise.resolve(); },
    setProjectDefault: function () {},
    subscribe: function () { return function () {}; },
    loadDictionary: function () { return window.Promise.resolve({}); },
    isSupportedLang: function (l) { return l === 'en' || l === 'ru'; },
  };

  /* ── Настоящие bridge-модули ──────────────────────────────── */
  for (const name of BRIDGE_SCRIPTS) {
    const src = fs.readFileSync(path.join(SRC, name), 'utf8');
    try {
      /* module/exports — шим для dual-mode бриджей (window + module.exports). */
      window.eval('(function (module, exports) {\n' + src + '\n})({ exports: {} }, {});');
    } catch (e) {
      throw new Error('bridge ' + name + ' failed in sandbox: ' + e.message);
    }
  }

  /* ── Монолит + хук (инжекция в память, файл не трогаем) ───── */
  const monoPath = path.join(SRC, 'legacy-monolith.js');
  let mono = fs.readFileSync(monoPath, 'utf8');
  const closeIdx = mono.lastIndexOf('})();');
  if (closeIdx < 0) throw new Error('legacy-monolith.js: closing IIFE `})();` not found');
  mono = mono.slice(0, closeIdx) + GM_HOOK + '\n' + mono.slice(closeIdx);
  window.eval(mono);

  if (!window.__GM) throw new Error('GM hook not installed — monolith eval failed silently');

  return { window, document: window.document, gm: window.__GM, fetchAppLog, bridgeLog, modalLog };
}

module.exports = { createHost, FIXED_NOW };
