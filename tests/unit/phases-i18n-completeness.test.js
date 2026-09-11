'use strict';

/* #120 «Фазы работ» — полнота локализации блока фаз / раздела настроек (калька
 * reminders-i18n-completeness). Гейтит: все ключи phase… и phases… v3.45.0 и tooltipNoRightsPhases /
 * toastPhasesSaved / btnSavePhases / phasesPickDate присутствуют во ВСЕХ 15 локалях, имеют НЕ-EN
 * перевод (T() молча подменяет отсутствующий ключ EN→RU→самим ключом) и сохраняют плейсхолдеры
 * ({who} {when} {phase} {date} {prevDate} {from} {to}); отдельно — relNavSettings === relTabTitle
 * (⚖9: раздел «Релизы» → «Релиз-менеджмент»). */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const I18N_DIR = path.join(__dirname, '..', '..', 'widgets', 'main', 'i18n');
const EXPECTED_LOCALES = ['en', 'ru', 'cs', 'de', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'nl', 'pl', 'pt', 'tr', 'zh'];

const PHASES_KEYS = [
  'phaseAnalysis', 'phaseDevelopment', 'phaseTechTest', 'phaseRegression', 'phaseBizTest', 'phaseDeploy',
  'phasesTitle', 'btnSavePhases', 'phasesStamp', 'phasesColPhase', 'phasesColFrom', 'phasesColTo', 'phasesNotPlanned',
  'phasesWarnOrder', 'phasesWarnOrderTip', 'phasesWarnOutOfRangeTip',
  'phasesErrEndBeforeStart', 'phasesErrOutOfSprint', 'phasesErrHalfPair', 'phasesNotSaved',
  'phasesNeedSprintDates', 'phasesFinished', 'tooltipNoRightsPhases', 'toastPhasesSaved',
  'phasesSetEnable', 'phasesSetEnableHint', 'phasesSetMappingTitle', 'phasesSetMappingHint',
  'phasesSetUsedIn', 'phasesSetUsedInParams', 'phasesPickDate',
];
const PLACEHOLDERS = ['{who}', '{when}', '{phase}', '{date}', '{prevDate}', '{from}', '{to}'];

/* Когнаты: значение легитимно совпадает с EN в КОНКРЕТНОЙ локали. Формат "<lc>.<key>". */
const COGNATE_OK = new Set([
  'de.phaseRegression', 'nl.phaseRegression', 'it.phaseDeploy', 'de.phaseAnalyse', 'fr.phaseAnalysis', 'nl.phaseAnalysis', 'de.phaseAnalysis',
  'fr.phasesColPhase', 'nl.phasesColPhase', 'de.phasesColPhase', 'de.phaseDevelopment',
]);

const dicts = {};
EXPECTED_LOCALES.forEach(function (lc) {
  dicts[lc] = JSON.parse(fs.readFileSync(path.join(I18N_DIR, lc + '.json'), 'utf8'));
});

test('phases i18n: каждый ключ присутствует во всех 15 локалях', function () {
  const missing = [];
  EXPECTED_LOCALES.forEach(function (lc) {
    PHASES_KEYS.forEach(function (k) {
      if (typeof dicts[lc][k] !== 'string' || dicts[lc][k].length === 0) missing.push(lc + '.' + k);
    });
  });
  assert.deepStrictEqual(missing, [], 'Отсутствуют ключи фаз: ' + missing.join(', '));
});

test('phases i18n: нет placeholder-копий EN (реальные переводы во всех локалях)', function () {
  const en = dicts.en;
  const placeholders = [];
  EXPECTED_LOCALES.forEach(function (lc) {
    if (lc === 'en') return;
    PHASES_KEYS.forEach(function (k) {
      if (COGNATE_OK.has(lc + '.' + k)) return;
      if (dicts[lc][k] === en[k]) placeholders.push(lc + '.' + k);
    });
  });
  assert.strictEqual(placeholders.length, 0, 'EN-копии (не переведено): ' + placeholders.join(', '));
});

test('phases i18n: все плейсхолдеры EN-эталона сохранены в каждой локали (и лишних нет)', function () {
  const broken = [];
  PHASES_KEYS.forEach(function (k) {
    const need = PLACEHOLDERS.filter(function (ph) { return dicts.en[k].indexOf(ph) >= 0; });
    EXPECTED_LOCALES.forEach(function (lc) {
      const v = dicts[lc][k] || '';
      need.forEach(function (ph) { if (v.indexOf(ph) < 0) broken.push(lc + '.' + k + ' (no ' + ph + ')'); });
      PLACEHOLDERS.forEach(function (ph) { if (need.indexOf(ph) < 0 && v.indexOf(ph) >= 0) broken.push(lc + '.' + k + ' (extra ' + ph + ')'); });
    });
  });
  assert.deepStrictEqual(broken, [], 'Сломаны плейсхолдеры: ' + broken.join(', '));
});

test('phases i18n: раздел настроек «Релизы» переименован — relNavSettings === relTabTitle во всех локалях (⚖9)', function () {
  const bad = EXPECTED_LOCALES.filter(function (lc) { return dicts[lc].relNavSettings !== dicts[lc].relTabTitle; });
  assert.deepStrictEqual(bad, [], 'relNavSettings ≠ relTabTitle: ' + bad.join(', '));
});

test('phases i18n: ключи снятого кастомного датапикера удалены (dpPrevMonth/dpNextMonth/btnToday), btnClear остался', function () {
  const stale = [];
  EXPECTED_LOCALES.forEach(function (lc) {
    ['dpPrevMonth', 'dpNextMonth', 'btnToday', 'dynConfirmEst', 'dynConfirmEstTo'].forEach(function (k) { if (k in dicts[lc]) stale.push(lc + '.' + k); });
    if (typeof dicts[lc].btnClear !== 'string') stale.push(lc + '.btnClear (missing)');
  });
  assert.deepStrictEqual(stale, [], 'Протухшие/недостающие ключи: ' + stale.join(', '));
});
