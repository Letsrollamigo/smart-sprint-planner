/* widgets/main/src/i18n/loader.js
   Async-загрузчик i18n-словарей.

   - EN+RU inlined в bundle через ES-import JSON (esbuild json loader).
   - Остальные 13 языков лениво загружаются через fetch('widgets/main/i18n/{lang}.json')
     относительно root'а виджета (resolved через _host или window.location).
   - getCurrentLang() читает: localStorage.ssp_lang ⊃ ssp_settings.defaultLang ⊃ 'en'.
   - setLang(lang) → сохраняет в localStorage, грузит словарь, эмитит callback'и.
   - subscribe(cb) — подписка на смену языка / готовности словаря.

   Loader не зависит от _host — работает в core.js через window-side fetch
   с относительным URL. */

import enInline from '../../i18n/en.json';
import ruInline from '../../i18n/ru.json';
import { LANG_CODES, DEFAULT_LANG, isSupportedLang } from './languages.js';

var _cache = Object.create(null);
_cache.en = enInline;
_cache.ru = ruInline;

var _currentLang = null;
var _subscribers = [];
var _projectDefault = null; // ssp_settings.defaultLang, заполняется setProjectDefault()

function safeReadStorage(key) {
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      return localStorage.getItem(key);
    }
  } catch (e) { /* private mode / disabled storage */ }
  return null;
}

function safeWriteStorage(key, value) {
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      localStorage.setItem(key, value);
      return true;
    }
  } catch (e) { /* private mode */ }
  return false;
}

function detectBrowserLang() {
  try {
    var nav = (typeof navigator !== 'undefined') ? navigator : null;
    if (!nav) return null;
    var raw = (nav.language || (nav.languages && nav.languages[0]) || '').toLowerCase();
    if (!raw) return null;
    var primary = raw.split('-')[0];
    if (isSupportedLang(primary)) return primary;
  } catch (e) { /* ignore */ }
  return null;
}

/**
 * Возвращает текущий выбранный язык. Цепочка:
 *   localStorage.ssp_lang
 *   → projectDefault (ssp_settings.defaultLang, если установлен через setProjectDefault)
 *   → navigator.language[0..2]
 *   → DEFAULT_LANG ('en')
 */
export function getCurrentLang() {
  if (_currentLang) return _currentLang;
  var fromStorage = (safeReadStorage('ssp_lang') || '').toLowerCase();
  if (fromStorage && isSupportedLang(fromStorage)) {
    _currentLang = fromStorage;
    return _currentLang;
  }
  if (_projectDefault && isSupportedLang(_projectDefault)) {
    _currentLang = _projectDefault;
    return _currentLang;
  }
  var fromBrowser = detectBrowserLang();
  if (fromBrowser) {
    _currentLang = fromBrowser;
    return _currentLang;
  }
  _currentLang = DEFAULT_LANG;
  return _currentLang;
}

/**
 * Лёгкий сеттер активного языка (без записи storage/загрузки словаря/notify).
 * Зовётся i18n-controller'ом при смене языка селектором: getCurrentLang()
 * мемоизирует _currentLang, и без синка react-мост (getCurrentSspLang → канон
 * этой цепочки) замирал бы на стартовом языке до перезагрузки iframe.
 */
export function setCurrentLang(lang) {
  var v = String(lang || '').toLowerCase();
  _currentLang = isSupportedLang(v) ? v : DEFAULT_LANG;
}

/**
 * Устанавливает project-default язык (из ssp_settings.defaultLang).
 * Вызывается после загрузки settings; не перезаписывает явный пользовательский выбор.
 */
export function setProjectDefault(lang) {
  var v = String(lang || '').toLowerCase();
  if (v && isSupportedLang(v)) _projectDefault = v;
  else _projectDefault = null;
}

/**
 * Меняет текущий язык, сохраняет выбор в localStorage, грузит словарь,
 * затем уведомляет subscribers с новым языком и словарём.
 *
 * Возвращает Promise<{ lang, dict }>.
 */
export function setLang(lang) {
  var v = String(lang || '').toLowerCase();
  if (!isSupportedLang(v)) v = DEFAULT_LANG;
  _currentLang = v;
  safeWriteStorage('ssp_lang', v);
  return loadDictionary(v).then(function (dict) {
    notify(v, dict);
    return { lang: v, dict: dict };
  });
}

/**
 * Загружает словарь для указанного языка. EN+RU — синхронно из bundle inline.
 * Остальные — fetch('widgets/main/i18n/{lang}.json'). Кешируется.
 *
 * Возвращает Promise<dictionary-object>. При ошибке fetch — fallback на EN.
 */
export function loadDictionary(lang) {
  var v = String(lang || '').toLowerCase();
  if (!isSupportedLang(v)) v = DEFAULT_LANG;
  if (_cache[v]) return Promise.resolve(_cache[v]);

  var url = resolveDictUrl(v);
  return fetch(url, { credentials: 'same-origin' })
    .then(function (resp) {
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      return resp.json();
    })
    .then(function (json) {
      _cache[v] = json || {};
      return _cache[v];
    })
    .catch(function (err) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[ssp-i18n] failed to load dictionary for ' + v + ', falling back to EN:', err);
      }
      /* v3.2.1 — транзиентный сетевой сбой раньше НАВСЕГДА кэшировал EN под ключом
         чужого языка (повторный выбор бил в отравленный кэш), а resolve маскировал
         сбой от контроллера (его rollback-ветка была мёртвым кодом). Возвращаем EN
         как fallback ТЕКУЩЕГО вызова, но кэш не пишем — следующий выбор перезагрузит. */
      return enInline;
    });
}

/**
 * URL словаря относительно текущей страницы. В YouTrack виджет загружается из
 * /widgets/main/index.html, поэтому относительный путь 'i18n/{lang}.json' корректен.
 */
function resolveDictUrl(lang) {
  return 'i18n/' + lang + '.json';
}

/**
 * Возвращает уже загруженный словарь синхронно. Если язык не загружен — null.
 * Используется внутри hot-path рендеринга, где await неуместен.
 */
export function getCachedDictionary(lang) {
  var v = String(lang || getCurrentLang()).toLowerCase();
  return _cache[v] || null;
}

/**
 * Подписка на смену языка. cb(lang, dict) вызывается после успешной загрузки.
 * Возвращает функцию отписки.
 */
export function subscribe(cb) {
  if (typeof cb !== 'function') return function () {};
  _subscribers.push(cb);
  return function unsubscribe() {
    var idx = _subscribers.indexOf(cb);
    if (idx >= 0) _subscribers.splice(idx, 1);
  };
}

function notify(lang, dict) {
  for (var i = 0; i < _subscribers.length; i++) {
    try { _subscribers[i](lang, dict); } catch (e) { /* swallow per-subscriber */ }
  }
}

/**
 * Список поддерживаемых языков (re-export для удобства потребителей,
 * чтобы не импортировать languages.js вторым импортом).
 */
export { LANG_CODES, isSupportedLang } from './languages.js';
