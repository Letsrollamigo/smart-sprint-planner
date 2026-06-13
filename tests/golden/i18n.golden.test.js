/**
 * Golden-master: i18n-контроллер (Фаза 5, зачистка «прочих» — слайс 8).
 *
 * Характеризация ДО выноса в i18n-controller.js (__SSP_I18N_CTRL):
 *   • applyI18N — обход DOM: [data-i18n] (INPUT/TEXTAREA→placeholder,
 *     data-i18n-html→innerHTML, иначе textContent с сохранением .ssp-icon),
 *     [data-i18n-title]→title, [data-i18n-ph]→placeholder,
 *     [data-i18n-tooltip]→data-tooltip, [data-i18n-label]→dataset.label;
 *   • setLang — синхронный путь (язык в I18N): _lang + localStorage + langSel.value
 *     + _doFullRerender; асинхронный путь (язык не в I18N): loadDictionary →
 *     I18N[lang] → _doFullRerender; rollback при reject loadDictionary;
 *   • _populateLangSelect — заполнение <select> из __SSP_I18N_LANGS__ + идемпотентность;
 *   • _syncProjectDefaultLang — проброс _settings.defaultLang в bridge.setProjectDefault.
 *
 * Контракты — только через выживающие entry-points (делегаторы applyI18N/setLang/
 * _populateLangSelect/_syncProjectDefaultLang остаются в монолите: все callers
 * внутренние — init-IIFE-бинды + render-оркестровка). T() стаблется детерминированно
 * (содержимое словаря не входит в логику кластера); _doFullRerender и _i18nBridge —
 * recording-стабы; стейт зоны (_lang/I18N) остаётся в стейт-ядре за get/set-deps.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { createHost } = require('./monolith-host');
const { checkJsonSnapshot } = require('./snap');

/** Детерминированный T: ключ → 'T:<key>' (логика кластера = обход DOM, не словарь). */
function stubT(gm) {
  gm.set({ T: function (k) { return 'T:' + k; } });
}

/** Recording _doFullRerender + контролируемый _i18nBridge.loadDictionary/setProjectDefault. */
function stubI18nDeps(gm, window, opts) {
  opts = opts || {};
  const log = { rerender: 0, loadArgs: [], setDefaultArgs: [] };
  gm.set({ _doFullRerender: function () { log.rerender += 1; } });
  gm.set({
    _i18nBridge: {
      getCurrentLang: function () { return 'ru'; },
      loadDictionary: function (lang) {
        log.loadArgs.push(lang);
        if (opts.reject) return window.Promise.reject(new Error('load failed'));
        return window.Promise.resolve(opts.dict || {});
      },
      setProjectDefault: function (v) { log.setDefaultArgs.push(v === null ? '<null>' : v); },
    },
  });
  return log;
}

/** Прогнать microtask-очередь (async-путь setLang: .then/.catch). */
async function flush(window, n) {
  for (let i = 0; i < (n || 5); i++) { await window.Promise.resolve(); }
}

/* ───────────────────────── applyI18N ───────────────────────── */

test('golden: applyI18N — все варианты data-i18n атрибутов', () => {
  const { gm, window, document } = createHost();
  stubT(gm);
  const box = document.createElement('div');
  box.innerHTML =
    '<span data-i18n="plain"></span>' +
    '<input data-i18n="inputPh">' +
    '<textarea data-i18n="taPh"></textarea>' +
    '<div data-i18n="htmlKey" data-i18n-html=""></div>' +
    '<span data-i18n-title="titleKey">x</span>' +
    '<input data-i18n-ph="phKey">' +
    '<span data-i18n-tooltip="tipKey" data-tooltip="old">x</span>' +
    '<span data-i18n-label="labelKey"></span>';
  document.body.appendChild(box);

  gm.call('applyI18N');

  const q = function (sel, attr) {
    const el = box.querySelector(sel);
    if (attr === 'text') return el.textContent;
    if (attr === 'ph') return el.placeholder;
    if (attr === 'html') return el.innerHTML;
    return el.getAttribute(attr);
  };
  checkJsonSnapshot('i18n-applyI18N-variants', {
    plainText: q('[data-i18n="plain"]', 'text'),
    inputPlaceholder: q('[data-i18n="inputPh"]', 'ph'),
    textareaPlaceholder: q('[data-i18n="taPh"]', 'ph'),
    htmlInner: q('[data-i18n-html]', 'html'),
    title: q('[data-i18n-title]', 'title'),
    phAttr: q('[data-i18n-ph]', 'ph'),
    tooltip: q('[data-i18n-tooltip]', 'data-tooltip'),
    label: box.querySelector('[data-i18n-label]').dataset.label,
  });
});

test('golden: applyI18N — сохранение .ssp-icon при обновлении текста', () => {
  const { gm, window, document } = createHost();
  stubT(gm);
  const box = document.createElement('div');
  box.innerHTML = '<button data-i18n="btnKey"><span class="ssp-icon">I</span> старый</button>';
  document.body.appendChild(box);

  gm.call('applyI18N');

  const btn = box.querySelector('button');
  checkJsonSnapshot('i18n-applyI18N-icon-preserved', {
    iconPreserved: !!btn.querySelector('.ssp-icon'),
    iconText: btn.querySelector('.ssp-icon').textContent,
    buttonText: btn.textContent,
    childNodeCount: btn.childNodes.length,
  });
});

/* ───────────────────────── setLang ───────────────────────── */

test('golden: setLang — синхронный путь (язык в I18N: _lang+localStorage+rerender, без loadDictionary)', () => {
  const { gm, window, document } = createHost();
  const log = stubI18nDeps(gm, window);

  gm.call('setLang', 'en');

  checkJsonSnapshot('i18n-setLang-sync', {
    lang: gm.get('_lang'),
    localStorage: window.localStorage.getItem('ssp_lang'),
    langSelValue: document.getElementById('langSel') ? document.getElementById('langSel').value : '<no-el>',
    rerenderCalls: log.rerender,
    loadDictionaryCalls: log.loadArgs.length,
  });
});

test('golden: setLang — асинхронный путь (язык не в I18N: loadDictionary→I18N[lang]→rerender)', async () => {
  const { gm, window } = createHost();
  const log = stubI18nDeps(gm, window, { dict: { greeting: 'Hola' } });

  gm.call('setLang', 'es');
  await flush(window);

  checkJsonSnapshot('i18n-setLang-async', {
    loadDictionaryArgs: log.loadArgs,
    i18nEsLoaded: gm.get('I18N').es,
    lang: gm.get('_lang'),
    localStorage: window.localStorage.getItem('ssp_lang'),
    rerenderCalls: log.rerender,
  });
});

test('golden: setLang — rollback при reject loadDictionary (_lang/localStorage откатываются)', async () => {
  const { gm, window } = createHost();
  /* стартовый язык — ru (host default) */
  const log = stubI18nDeps(gm, window, { reject: true });
  const langBefore = gm.get('_lang');

  gm.call('setLang', 'es');
  await flush(window);

  checkJsonSnapshot('i18n-setLang-rollback', {
    langBefore: langBefore,
    langAfter: gm.get('_lang'),
    localStorageAfter: window.localStorage.getItem('ssp_lang'),
    rerenderCalls: log.rerender,
    loadDictionaryArgs: log.loadArgs,
  });
});

/* ───────────────────────── _populateLangSelect ───────────────────────── */

test('golden: _populateLangSelect — заполнение <select> + идемпотентность', () => {
  const { gm, window, document } = createHost();
  window.__SSP_I18N_LANGS__ = [
    { code: 'en', native: 'English', flag: '🇬🇧' },
    { code: 'ru', native: 'Русский', flag: '🇷🇺' },
    { code: 'es', native: 'Español', flag: '🇪🇸' },
  ];
  const sel = document.createElement('select');
  document.body.appendChild(sel);

  gm.call('_populateLangSelect', sel);
  const firstFill = Array.prototype.map.call(sel.options, function (o) {
    return { value: o.value, text: o.textContent };
  });
  const countAfterFirst = sel.options.length;

  gm.call('_populateLangSelect', sel); /* повторный вызов — идемпотентен */

  checkJsonSnapshot('i18n-populateLangSelect', {
    firstFill: firstFill,
    countAfterFirst: countAfterFirst,
    countAfterSecond: sel.options.length,
    populatedFlag: sel._sspPopulated === true,
  });
});

/* ───────────────────────── _syncProjectDefaultLang ───────────────────────── */

test('golden: _syncProjectDefaultLang — проброс _settings.defaultLang в bridge', () => {
  const { gm, window } = createHost();
  const log = stubI18nDeps(gm, window);

  gm.set({ _settings: { defaultLang: 'ru' } });
  gm.call('_syncProjectDefaultLang');

  gm.set({ _settings: { defaultLang: '' } });
  gm.call('_syncProjectDefaultLang');

  gm.set({ _settings: {} }); /* нет defaultLang → '' → null */
  gm.call('_syncProjectDefaultLang');

  checkJsonSnapshot('i18n-syncProjectDefaultLang', {
    setDefaultArgs: log.setDefaultArgs,
  });
});
