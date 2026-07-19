/* v2.0.0 D125 — i18n bridge for Ring components.
   Maps the active widget language to a date-fns Locale object from SSP_VENDORED.DateFnsLocales.
   All 15 SSP locales are backed by a date-fns locale → Ring DatePicker works natively
   in every language. ssp_lang values that don't have a date-fns equivalent fall back to en. */

const SSP_LANG_TO_DATE_FNS = {
  en: 'en',
  ru: 'ru',
  fr: 'fr',
  de: 'de',
  zh: 'zh-CN', // код языка виджета 'zh' (languages.js) → date-fns-локаль zhCN в пуле
  it: 'it',
  pl: 'pl',
  tr: 'tr',
  ja: 'ja',
  ko: 'ko',
  cs: 'cs',
  nl: 'nl',
  pt: 'pt',
  hu: 'hu',
  es: 'es',
};

export function getCurrentSspLang() {
  /* Канон — цепочка loader'а (__SSP_I18N__: localStorage ⊃ projectDefault ⊃ browser ⊃ en):
     живёт в памяти, поэтому работает в sandboxed srcdoc (localStorage заблокирован)
     и следует за сменой языка селектором. Прямое чтение localStorage — фолбэк
     для ранних вызовов до постановки моста; дефолт en (синхронно core.js). */
  try {
    const bridge = typeof window !== 'undefined' && window.__SSP_I18N__;
    if (bridge && typeof bridge.getCurrentLang === 'function') return bridge.getCurrentLang();
  } catch (_) { /* fall through */ }
  try { return localStorage.getItem('ssp_lang') || 'en'; } catch (_) { return 'en'; }
}

export function getDateFnsLocale(sspLang) {
  const key = SSP_LANG_TO_DATE_FNS[sspLang] || 'en';
  const pool = (globalThis.SSP_VENDORED && globalThis.SSP_VENDORED.DateFnsLocales) || {};
  return pool[key] || pool.en;
}
