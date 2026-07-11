'use strict';

/* #40 — полнота локализации авто-прогноза дат (зеркало capacity-i18n-completeness).
 * Гейтит: все forecast-ключи присутствуют во ВСЕХ 15 локалях И имеют НЕ-EN перевод
 * (placeholder-fence). Allowlist — ключи, чьё значение легитимно равно EN
 * (символ колонки очереди «#»). */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const I18N_DIR = path.join(__dirname, '..', '..', 'widgets', 'main', 'i18n');
const EXPECTED_LOCALES = ['en', 'ru', 'cs', 'de', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'nl', 'pl', 'pt', 'tr', 'zh'];

const FORECAST_KEYS = [
  'btnForecastDates', 'forecastConfirmTitle', 'forecastConfirmText', 'btnForecastConfirm',
  'toastForecastDone', 'toastForecastUnfit', 'toastForecastEmpty', 'toastForecastErr',
  'toastForecastNoDates', 'forecastUnfitBadge', 'lblAutoForecast', 'descAutoForecast',
  'thQueue', 'queueMoveUp', 'queueMoveDown',
];

/* Значение может легитимно совпадать с EN (символ, не слово). */
const EN_EQUAL_ALLOWLIST = ['thQueue'];

const dicts = {};
EXPECTED_LOCALES.forEach((loc) => {
  dicts[loc] = JSON.parse(fs.readFileSync(path.join(I18N_DIR, loc + '.json'), 'utf8'));
});

test('#40 forecast i18n: все ключи присутствуют во всех 15 локалях', () => {
  const missing = [];
  EXPECTED_LOCALES.forEach((loc) => {
    FORECAST_KEYS.forEach((k) => {
      if (typeof dicts[loc][k] !== 'string' || !dicts[loc][k].length) missing.push(loc + ':' + k);
    });
  });
  assert.deepStrictEqual(missing, []);
});

test('#40 forecast i18n: не-EN локали имеют собственный перевод (кроме allowlist)', () => {
  const same = [];
  EXPECTED_LOCALES.filter((l) => l !== 'en').forEach((loc) => {
    FORECAST_KEYS.forEach((k) => {
      if (EN_EQUAL_ALLOWLIST.indexOf(k) >= 0) return;
      if (dicts[loc][k] === dicts.en[k]) same.push(loc + ':' + k);
    });
  });
  assert.deepStrictEqual(same, []);
});

test('#40 forecast i18n: плейсхолдер {n} сохранён в toastForecastUnfit во всех локалях', () => {
  const broken = [];
  EXPECTED_LOCALES.forEach((loc) => {
    if (String(dicts[loc].toastForecastUnfit).indexOf('{n}') < 0) broken.push(loc);
  });
  assert.deepStrictEqual(broken, []);
});
