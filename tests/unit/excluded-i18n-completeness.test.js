'use strict';

/* #121 «Исключённые задачи с причиной» — полнота локализации окна причины, блока «Исключённые из спринта»,
 * колонки Excel (калька phases-i18n-completeness). Гейтит: 17 ключей v3.46.0 присутствуют во ВСЕХ 15 локалях,
 * имеют НЕ-EN перевод (T() молча подменяет отсутствующий ключ EN→RU→самим ключом) и сохраняют плейсхолдеры
 * ({role} {sprint} {roles} {date} {user} {n}); снятый тумблер 68-2 — ключ hideExcludedToggle отсутствует
 * во всех 15 (до правки присутствовал — assert падал, как положено). */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const I18N_DIR = path.join(__dirname, '..', '..', 'widgets', 'main', 'i18n');
const EXPECTED_LOCALES = ['en', 'ru', 'cs', 'de', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'nl', 'pl', 'pt', 'tr', 'zh'];

const EXCLUDED_KEYS = [
  'excludeReasonTitle', 'excludeReasonContext', 'excludeReasonLabel', 'phExcludeReason', 'excludeReasonCascade',
  'btnExclude', 'editReasonTitle', 'btnSaveReason', 'excludedStamp', 'toastExcludeReasonRequired',
  'excludedBlockTitle', 'excludedColTask', 'excludedColReason', 'excludedColBy', 'btnReturnToSprint', 'btnEditReason',
  'excelColExcludeReason',
];
const PLACEHOLDERS = ['{role}', '{sprint}', '{roles}', '{date}', '{user}', '{n}'];

/* Когнаты: значение легитимно совпадает с EN в КОНКРЕТНОЙ локали. Формат "<lc>.<key>". */
const COGNATE_OK = new Set([]);

const dicts = {};
EXPECTED_LOCALES.forEach(function (lc) {
  dicts[lc] = JSON.parse(fs.readFileSync(path.join(I18N_DIR, lc + '.json'), 'utf8'));
});

test('excluded i18n: каждый из 17 ключей присутствует во всех 15 локалях', function () {
  const missing = [];
  EXPECTED_LOCALES.forEach(function (lc) {
    EXCLUDED_KEYS.forEach(function (k) {
      if (typeof dicts[lc][k] !== 'string' || dicts[lc][k].length === 0) missing.push(lc + '.' + k);
    });
  });
  assert.deepStrictEqual(missing, [], 'Отсутствуют ключи #121: ' + missing.join(', '));
});

test('excluded i18n: нет placeholder-копий EN (реальные переводы во всех локалях)', function () {
  const en = dicts.en;
  const copies = [];
  EXPECTED_LOCALES.forEach(function (lc) {
    if (lc === 'en') return;
    EXCLUDED_KEYS.forEach(function (k) {
      if (COGNATE_OK.has(lc + '.' + k)) return;
      if (dicts[lc][k] === en[k]) copies.push(lc + '.' + k);
    });
  });
  assert.strictEqual(copies.length, 0, 'EN-копии (не переведено): ' + copies.join(', '));
});

test('excluded i18n: все плейсхолдеры EN-эталона сохранены в каждой локали (и лишних нет)', function () {
  const broken = [];
  EXCLUDED_KEYS.forEach(function (k) {
    const need = PLACEHOLDERS.filter(function (ph) { return dicts.en[k].indexOf(ph) >= 0; });
    EXPECTED_LOCALES.forEach(function (lc) {
      const v = dicts[lc][k] || '';
      need.forEach(function (ph) { if (v.indexOf(ph) < 0) broken.push(lc + '.' + k + ' (no ' + ph + ')'); });
      PLACEHOLDERS.forEach(function (ph) { if (need.indexOf(ph) < 0 && v.indexOf(ph) >= 0) broken.push(lc + '.' + k + ' (extra ' + ph + ')'); });
    });
  });
  assert.deepStrictEqual(broken, [], 'Плейсхолдеры сломаны: ' + broken.join(', '));
  /* эталон обязан нести плейсхолдеры — иначе проверка выше проходит вхолостую */
  assert.ok(dicts.en.excludeReasonContext.indexOf('{role}') >= 0 && dicts.en.excludedStamp.indexOf('{user}') >= 0 && dicts.en.excludedBlockTitle.indexOf('{n}') >= 0);
});

test('excluded i18n: тумблер 68-2 снят — ключа hideExcludedToggle нет ни в одной локали', function () {
  const left = EXPECTED_LOCALES.filter(function (lc) { return Object.prototype.hasOwnProperty.call(dicts[lc], 'hideExcludedToggle'); });
  assert.deepStrictEqual(left, [], 'hideExcludedToggle ещё в словарях: ' + left.join(', '));
});
