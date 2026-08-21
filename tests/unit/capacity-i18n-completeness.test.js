'use strict';

/* #45 R3 — полнота локализации вкладки «Ёмкость» (зеркало workflow-i18n.test.js).
 * Гейтит: все capacity-ключи (R1/R2 долг + R3) присутствуют во ВСЕХ 15 локалях И
 * имеют НЕ-EN перевод (placeholder-fence: T() молча подменяет отсутствующий ключ EN→RU→
 * самим ключом, что прошло бы незаметно). Allowlist — ключи, чьё значение легитимно равно
 * EN (brand-нейтральные имена режимов Light/Full). */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const I18N_DIR = path.join(__dirname, '..', '..', 'widgets', 'main', 'i18n');
const EXPECTED_LOCALES = ['en', 'ru', 'cs', 'de', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'nl', 'pl', 'pt', 'tr', 'zh'];

/* Полный контракт ключей вкладки ёмкости (R1/R2 + R3). */
const CAPACITY_KEYS = [
  // R1/R2 (долг — были только en/ru)
  'cardCapacity', 'navCapacity', 'descCapacityMode', 'lblHoursPerDay', 'lblUsefulHoursPerDay',
  // R3 — вкладка
  'tabCapacity', 'capacitySprintLabel', 'capacityActiveSprint', 'capacityReadOnly', 'capacityNotApproved',
  'statusDraft', 'statusApproved', 'statusDirty', 'btnApprove', 'btnReapprove',
  'btnSaveCapacity',
  'capacityRoleHeader', 'capacityCalendarHeader', 'lblPersonName', 'lblGrade', 'lblRate',
  'lblParticipation', 'lblAlloc', 'lblBase', 'lblContribution', 'sumAllocShort',
  'capacityNoRoles', 'capacityNoPeople', 'capacityNoSprint', 'capacitySprintDatesMissing', 'capacityLightHint',
  'btnDownloadTemplate', 'btnUploadCsv', 'btnSaveAbsences', 'capacityCalendarFor', 'calendarPickPerson',
  // R3.2 — выбор «для кого» (сводный режим по роли) + панель деталей
  'capacityViewModeRole', 'capacityAbsentLabel',
  'capacityAbsenceType', 'absVacation', 'absSick', 'absOutOfMembership', 'absRegionalHoliday',
  'absTraining', 'absTeamLeading', 'absOther', 'dayHoliday', 'dayShort', 'dayWorkday',
  'dayWeekend', 'calendarDows', 'calendarYearFallback', 'sumAllocOverlimit', 'msgAbsencesSaved',
  'errAbsencesSave', 'msgCapacitySaved', 'msgCapacityApproved', 'errCapacitySave', 'errCapacityLoad',
  'errCalendarParse', 'msgCalendarSaved', 'errCalendarSave',
  // #45 (b) — подзаголовок «источник ресурса» в объединённом admin-блоке ёмкости
  'capGroupResource',
  // #53 — частичный день отсутствия (hoursDelta) — редактор часов + бейдж
  'capacityPartialHours', 'capacityFullDay', 'capacityHoursShort',
  // #53 — read-only спойлер архива ёмкости
  'capacityArchiveNode', 'capacityArchivePeople',
];

/* Ключи, чьё не-EN значение легитимно равно EN во ВСЕХ локалях (#69 R1 снял мёртвые optCapacity*). */
const NON_TRANSLATABLE = new Set([]);

/* Когнаты/заимствования: значение легитимно совпадает с EN в КОНКРЕТНОЙ локали (вручную
   выверено — это настоящие переводы, а не пропущенные EN-копии; «Sprint», «Grade», «Base»,
   фр. «Allocation»/«Contribution», нид. «Weekend»). Формат "<lc>.<key>". */
const COGNATE_OK = new Set([
  'cs.capacitySprintLabel', 'cs.lblGrade', 'de.capacitySprintLabel', 'de.lblGrade',
  'es.capacitySprintLabel', 'es.lblBase', 'fr.lblAlloc', 'fr.lblBase', 'fr.lblContribution',
  'hu.capacitySprintLabel', 'it.capacitySprintLabel', 'it.lblBase', 'nl.capacitySprintLabel',
  'nl.lblGrade', 'nl.dayWeekend', 'pl.capacitySprintLabel', 'pl.lblGrade',
  'pt.capacitySprintLabel', 'pt.lblBase', 'tr.capacitySprintLabel',
  // #53 — короткое «ч» легитимно = EN «h» в романских/чешском (реальная аббревиатура часа).
  'es.capacityHoursShort', 'fr.capacityHoursShort', 'it.capacityHoursShort',
  'cs.capacityHoursShort', 'pt.capacityHoursShort',
]);

const dicts = {};
EXPECTED_LOCALES.forEach(function (lc) {
  dicts[lc] = JSON.parse(fs.readFileSync(path.join(I18N_DIR, lc + '.json'), 'utf8'));
});

test('capacity i18n: каждый ключ присутствует во всех 15 локалях', function () {
  const missing = [];
  EXPECTED_LOCALES.forEach(function (lc) {
    CAPACITY_KEYS.forEach(function (k) {
      if (typeof dicts[lc][k] !== 'string' || dicts[lc][k].length === 0) missing.push(lc + '.' + k);
    });
  });
  assert.deepStrictEqual(missing, [], 'Отсутствуют capacity-ключи: ' + missing.join(', '));
});

test('capacity i18n: нет placeholder-копий EN (реальные переводы во всех локалях)', function () {
  const en = dicts.en;
  const placeholders = [];
  EXPECTED_LOCALES.forEach(function (lc) {
    if (lc === 'en') return;
    CAPACITY_KEYS.forEach(function (k) {
      if (NON_TRANSLATABLE.has(k)) return;
      if (COGNATE_OK.has(lc + '.' + k)) return;
      if (dicts[lc][k] === en[k]) placeholders.push(lc + '.' + k);
    });
  });
  assert.strictEqual(placeholders.length, 0, 'EN-копии (не переведено): ' + placeholders.join(', '));
});

test('capacity i18n: плейсхолдеры {years}/{n} сохранены во всех локалях', function () {
  const withYears = CAPACITY_KEYS.filter(function (k) { return /\{years\}/.test(dicts.en[k]); });
  const withN = CAPACITY_KEYS.filter(function (k) { return /\{n\}/.test(dicts.en[k]); });
  const broken = [];
  EXPECTED_LOCALES.forEach(function (lc) {
    withYears.forEach(function (k) { if (!/\{years\}/.test(dicts[lc][k])) broken.push(lc + '.' + k + ' (no {years})'); });
    withN.forEach(function (k) { if (!/\{n\}/.test(dicts[lc][k])) broken.push(lc + '.' + k + ' (no {n})'); });
  });
  assert.deepStrictEqual(broken, [], 'Сломаны плейсхолдеры: ' + broken.join(', '));
});

test('capacity i18n: calendarDows = 7 разделённых запятой значений в каждой локали', function () {
  const bad = [];
  EXPECTED_LOCALES.forEach(function (lc) {
    const parts = String(dicts[lc].calendarDows || '').split(',');
    if (parts.length !== 7) bad.push(lc + ' (' + parts.length + ')');
  });
  assert.deepStrictEqual(bad, [], 'calendarDows не из 7 значений: ' + bad.join(', '));
});
