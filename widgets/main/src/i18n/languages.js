/* widgets/main/src/i18n/languages.js
   Список 15 поддерживаемых языков для v1.1.0 i18n.
   Сортировка: EN → RU → остальные по ISO коду (cs, de, es, fr, hu, it, ja, ko, nl, pl, pt, tr, zh).
   Используется dropdown'ом языка и валидацией settings.defaultLang в backend whitelist. */

export const LANGS = [
  { code: 'en', native: 'English',     flag: '🇬🇧' },
  { code: 'ru', native: 'Русский',     flag: '🇷🇺' },
  { code: 'cs', native: 'Čeština',     flag: '🇨🇿' },
  { code: 'de', native: 'Deutsch',     flag: '🇩🇪' },
  { code: 'es', native: 'Español',     flag: '🇪🇸' },
  { code: 'fr', native: 'Français',    flag: '🇫🇷' },
  { code: 'hu', native: 'Magyar',      flag: '🇭🇺' },
  { code: 'it', native: 'Italiano',    flag: '🇮🇹' },
  { code: 'ja', native: '日本語',       flag: '🇯🇵' },
  { code: 'ko', native: '한국어',       flag: '🇰🇷' },
  { code: 'nl', native: 'Nederlands',  flag: '🇳🇱' },
  { code: 'pl', native: 'Polski',      flag: '🇵🇱' },
  { code: 'pt', native: 'Português',   flag: '🇵🇹' },
  { code: 'tr', native: 'Türkçe',      flag: '🇹🇷' },
  { code: 'zh', native: '中文',         flag: '🇨🇳' }
];

export const LANG_CODES = LANGS.map(function (l) { return l.code; });

/* v1.3.1: финальный fallback — английский. Цепочка resolution в loader.getCurrentLang():
   localStorage.ssp_lang ⊃ ssp_settings.defaultLang ⊃ navigator.language[0..2] ⊃ DEFAULT_LANG.
   Так первый запуск виджета подбирает язык из локали учётной записи пользователя YT;
   если язык не поддержан плагином — берётся EN, а не RU (как было до публичного релиза). */
export const DEFAULT_LANG = 'en';

export function isSupportedLang(code) {
  return LANG_CODES.indexOf(String(code || '').toLowerCase()) >= 0;
}

export function findLang(code) {
  var c = String(code || '').toLowerCase();
  for (var i = 0; i < LANGS.length; i++) {
    if (LANGS[i].code === c) return LANGS[i];
  }
  return null;
}
