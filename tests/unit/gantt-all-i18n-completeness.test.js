'use strict';

/* #122 «Сквозной Гант по всем ролям» — полнота локализации режима «Все роли» (калька
 * phases-i18n-completeness). Гейтит: ключи ступеней 3.47.0 и 3.48.0 присутствуют во ВСЕХ 15 локалях, имеют НЕ-EN
 * перевод (T() молча подменяет отсутствующий ключ EN→RU→самим ключом) и сохраняют плейсхолдеры. Множественные
 * формы — одна на ключ, как у существующих «{n} задач» (§A8/§О12 спеки). */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const I18N_DIR = path.join(__dirname, '..', '..', 'widgets', 'main', 'i18n');
const EXPECTED_LOCALES = ['en', 'ru', 'cs', 'de', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'nl', 'pl', 'pt', 'tr', 'zh'];

const GANTT_ALL_KEYS = [
  'ganttModeRole', 'ganttModeAll', 'ganttConflictsCounter', 'ganttConflictsTip', 'ganttLegendChain', 'ganttLegendConflict',
  'ganttConflictBeforeTip', 'ganttConflictPhaseTip', 'ganttTrackTasks', 'ganttTrackConflicts', 'ganttTrackCollapse',
  'ganttTrackExpand', 'ganttHistoryBadge', 'ganttNoSnapshot', 'ganttAssigneeTip', 'phasesSetUsedInGantt',
  /* ступень 3.48.0 — прогноз по всем ролям и группы эпиков */
  'ganttForecastAllTip', 'forecastAllConfirmText', 'toastForecastAllDone', 'toastForecastAllUnfit', 'ganttWaitsFor',
  'ganttUnfitBlockTitle', 'ganttUnfitReasonWait', 'ganttUnfitReasonCap', 'ganttCycleWarn', 'ganttEpicChip',
  'ganttEpicParentRole', 'ganttEpicParentRoleTip',
];
const PLACEHOLDERS = ['{n}', '{a}', '{b}', '{date}', '{issue}', '{role}', '{prevDate}', '{from}', '{to}', '{phases}', '{sprint}', '{who}', '{issues}'];

/* Когнаты: значение легитимно совпадает с EN в КОНКРЕТНОЙ локали. Формат "<lc>.<key>". */
const COGNATE_OK = new Set(['cs.ganttModeRole']);

const dicts = {};
EXPECTED_LOCALES.forEach(function (lc) {
  dicts[lc] = JSON.parse(fs.readFileSync(path.join(I18N_DIR, lc + '.json'), 'utf8'));
});

test('gantt-all i18n: 28 ключей (16 ступени 3.47.0 + 12 ступени 3.48.0) во всех 15 локалях', function () {
  assert.strictEqual(GANTT_ALL_KEYS.length, 28);
  const missing = [];
  EXPECTED_LOCALES.forEach(function (lc) {
    GANTT_ALL_KEYS.forEach(function (k) {
      if (typeof dicts[lc][k] !== 'string' || dicts[lc][k].length === 0) missing.push(lc + '.' + k);
    });
  });
  assert.deepStrictEqual(missing, [], 'Отсутствуют ключи режима «Все роли»: ' + missing.join(', '));
});

test('gantt-all i18n: нет EN-копий (реальные переводы во всех локалях)', function () {
  const copies = [];
  EXPECTED_LOCALES.forEach(function (lc) {
    if (lc === 'en') return;
    GANTT_ALL_KEYS.forEach(function (k) {
      if (!COGNATE_OK.has(lc + '.' + k) && dicts[lc][k] === dicts.en[k]) copies.push(lc + '.' + k);
    });
  });
  assert.deepStrictEqual(copies, [], 'EN-копии (не переведено): ' + copies.join(', '));
});

test('gantt-all i18n: плейсхолдеры EN-эталона сохранены в каждой локали, лишних нет', function () {
  const broken = [];
  GANTT_ALL_KEYS.forEach(function (k) {
    const need = PLACEHOLDERS.filter(function (ph) { return dicts.en[k].indexOf(ph) >= 0; });
    EXPECTED_LOCALES.forEach(function (lc) {
      const v = dicts[lc][k] || '';
      need.forEach(function (ph) { if (v.indexOf(ph) < 0) broken.push(lc + '.' + k + ' (no ' + ph + ')'); });
      PLACEHOLDERS.forEach(function (ph) { if (need.indexOf(ph) < 0 && v.indexOf(ph) >= 0) broken.push(lc + '.' + k + ' (extra ' + ph + ')'); });
    });
  });
  assert.deepStrictEqual(broken, [], 'Сломаны плейсхолдеры: ' + broken.join(', '));
});
