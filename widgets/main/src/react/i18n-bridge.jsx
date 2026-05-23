/* v2.0.0 D125 — i18n bridge for Ring components.
   Maps localStorage.ssp_lang to date-fns Locale object from SSP_VENDORED.DateFnsLocales.
   All 15 SSP locales are backed by a date-fns locale → Ring DatePicker works natively
   in every language. ssp_lang values that don't have a date-fns equivalent fall back to en. */

const SSP_LANG_TO_DATE_FNS = {
  en: 'en',
  ru: 'ru',
  fr: 'fr',
  de: 'de',
  'zh-CN': 'zh-CN',
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
  try { return localStorage.getItem('ssp_lang') || 'ru'; } catch (_) { return 'ru'; }
}

export function getDateFnsLocale(sspLang) {
  const key = SSP_LANG_TO_DATE_FNS[sspLang] || 'en';
  const pool = (globalThis.SSP_VENDORED && globalThis.SSP_VENDORED.DateFnsLocales) || {};
  return pool[key] || pool.en;
}
