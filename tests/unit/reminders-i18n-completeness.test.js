'use strict';

/* #112 «Напоминания» — полнота локализации модалки/колокольчика/раздела настроек (калька
 * capacity-i18n-completeness). Гейтит: все rem*-ключи v3.40.0 присутствуют во ВСЕХ 15 локалях,
 * имеют НЕ-EN перевод (T() молча подменяет отсутствующий ключ EN→RU→самим ключом) и сохраняют
 * ВСЕ плейсхолдеры подстановок ({n} {sprint} {role} {release} {status} {days} {project}).
 * Ключи журнала (префиксы remJrn / remTab / remMod / remHow) — v3.41.0, здесь не заводятся: тест ловит
 * и лишнее, и недостающее по своему списку. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const I18N_DIR = path.join(__dirname, '..', '..', 'widgets', 'main', 'i18n');
const EXPECTED_LOCALES = ['en', 'ru', 'cs', 'de', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'nl', 'pl', 'pt', 'tr', 'zh'];

const REMINDERS_KEYS = [
  // модалка
  'remModalTitle', 'remSectionSprints', 'remSectionCapacity', 'remSectionReleases', 'remGo', 'remEmpty', 'remRoleUnknown',
  // тексты ⚖10 + ⚖16 О1
  'remSprintRoleOpen', 'remSprintSlotOver', 'remCapacityBefore', 'remCapacityAfter', 'remReleaseOverdue',
  // дни
  'remDaysToday', 'remDaysIn', 'remDaysAgo',
  // колокольчик
  'remBellTitle', 'remBellTitleNone', 'aria.btnReminders',
  // настройки
  'cardReminders', 'navReminders', 'remSetMaster', 'remSetMasterHint', 'remSetFreqTitle', 'remSetFreqDaily', 'remSetFreqAlways',
  'remSetModulesTitle', 'remSetSprints', 'remSetSprintsHint', 'remSetCapacity', 'remSetCapacityHint',
  'remSetCapacityDaysPre', 'remSetCapacityDaysPost', 'remSetCapacityUnavailable',
  'remSetReleases', 'remSetReleasesHint', 'remSetReleasesUnavailable',
];
const PLACEHOLDERS = ['{n}', '{sprint}', '{role}', '{release}', '{status}', '{days}', '{project}'];

/* Когнаты: значение легитимно совпадает с EN в КОНКРЕТНОЙ локали («Sprints», «Releases»,
   фр. «Notifications»). Формат "<lc>.<key>". */
const COGNATE_OK = new Set([
  'de.remSectionSprints', 'de.remSetSprints', 'de.remSectionReleases', 'de.remSetReleases',
  'nl.remSectionSprints', 'nl.remSetSprints', 'nl.remSectionReleases', 'nl.remSetReleases',
  'es.remSectionSprints', 'es.remSetSprints', 'fr.remSectionSprints', 'fr.remSetSprints',
  'pt.remSectionSprints', 'pt.remSetSprints', 'fr.cardReminders', 'fr.navReminders',
]);

const dicts = {};
EXPECTED_LOCALES.forEach(function (lc) {
  dicts[lc] = JSON.parse(fs.readFileSync(path.join(I18N_DIR, lc + '.json'), 'utf8'));
});

test('reminders i18n: каждый ключ присутствует во всех 15 локалях', function () {
  const missing = [];
  EXPECTED_LOCALES.forEach(function (lc) {
    REMINDERS_KEYS.forEach(function (k) {
      if (typeof dicts[lc][k] !== 'string' || dicts[lc][k].length === 0) missing.push(lc + '.' + k);
    });
  });
  assert.deepStrictEqual(missing, [], 'Отсутствуют rem-ключи: ' + missing.join(', '));
});

test('reminders i18n: ключи журнала (v3.41.0) ещё не заведены ни в одной локали', function () {
  const early = [];
  EXPECTED_LOCALES.forEach(function (lc) {
    Object.keys(dicts[lc]).forEach(function (k) { if (/^(remJrn|remTab|remHow|remMod(Sprints|Capacity|Releases)$)/.test(k)) early.push(lc + '.' + k);   /* remMod* — чипы журнала, не remModalTitle */ });
  });
  assert.deepStrictEqual(early, [], 'Ключи журнала раньше S5: ' + early.join(', '));
});

test('reminders i18n: нет placeholder-копий EN (реальные переводы во всех локалях)', function () {
  const en = dicts.en;
  const placeholders = [];
  EXPECTED_LOCALES.forEach(function (lc) {
    if (lc === 'en') return;
    REMINDERS_KEYS.forEach(function (k) {
      if (COGNATE_OK.has(lc + '.' + k)) return;
      if (dicts[lc][k] === en[k]) placeholders.push(lc + '.' + k);
    });
  });
  assert.strictEqual(placeholders.length, 0, 'EN-копии (не переведено): ' + placeholders.join(', '));
});

test('reminders i18n: все плейсхолдеры EN-эталона сохранены в каждой локали (и лишних нет)', function () {
  const broken = [];
  REMINDERS_KEYS.forEach(function (k) {
    const need = PLACEHOLDERS.filter(function (ph) { return dicts.en[k].indexOf(ph) >= 0; });
    EXPECTED_LOCALES.forEach(function (lc) {
      const v = dicts[lc][k] || '';
      need.forEach(function (ph) { if (v.indexOf(ph) < 0) broken.push(lc + '.' + k + ' (no ' + ph + ')'); });
      PLACEHOLDERS.forEach(function (ph) { if (need.indexOf(ph) < 0 && v.indexOf(ph) >= 0) broken.push(lc + '.' + k + ' (extra ' + ph + ')'); });
    });
  });
  assert.deepStrictEqual(broken, [], 'Сломаны плейсхолдеры: ' + broken.join(', '));
});

test('reminders i18n: тексты пунктов содержат {days} ровно один раз (фронт режет строку по нему)', function () {
  const bad = [];
  ['remSprintRoleOpen', 'remSprintSlotOver', 'remCapacityBefore', 'remCapacityAfter', 'remReleaseOverdue'].forEach(function (k) {
    EXPECTED_LOCALES.forEach(function (lc) {
      const n = (dicts[lc][k] || '').split('{days}').length - 1;
      if (n !== 1) bad.push(lc + '.' + k + ' (' + n + ')');
    });
  });
  assert.deepStrictEqual(bad, [], '{days} не ровно один раз: ' + bad.join(', '));
});
