/* widgets/main/src/i18n-bridge.js
   Side-effect модуль: ставит i18n loader API + inlined dicts на window.__SSP_*
   ДО того как IIFE core.js начнёт исполняться.

   ES module side-effects выполняются в порядке объявления import'ов в index.js.
   Поэтому этот файл должен импортироваться РАНЬШЕ './core.js'. */

import * as i18nLoader from './loader.js';
import { LANGS } from './languages.js';
import * as plural from './plural.js';
import enInline from '../../i18n/en.json';
import ruInline from '../../i18n/ru.json';

if (typeof window !== 'undefined') {
  window.__SSP_I18N__ = i18nLoader;
  window.__SSP_I18N_DICTS__ = { en: enInline, ru: ruInline };
  window.__SSP_I18N_LANGS__ = LANGS;
  window.__SSP_I18N_PLURAL__ = plural;
}
