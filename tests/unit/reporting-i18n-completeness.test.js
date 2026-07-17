'use strict';

/* #50 S1 — полнота локализации модуля «Оперативная отчётность» (зеркало
 * capacity-i18n-completeness.test.js). Гейтит: все reporting-ключи S1 присутствуют во ВСЕХ
 * 15 локалях И имеют НЕ-EN перевод (placeholder-fence: T() молча подменяет отсутствующий ключ
 * EN→RU→самим ключом, что прошло бы незаметно). Растёт по мере слайсов (S1c: пороги/паузы). */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const I18N_DIR = path.join(__dirname, '..', '..', 'widgets', 'main', 'i18n');
const EXPECTED_LOCALES = ['en', 'ru', 'cs', 'de', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'nl', 'pl', 'pt', 'tr', 'zh'];

/* Контракт ключей модуля отчётности. S1a — каркас (навигация + доступ + плейсхолдер);
   S1c — пороги aging (settings-таблица). */
const REPORTING_KEYS = [
  'repNavSettings', 'repNodeA', 'repNodeB',
  'repSetEnable', 'repSetAccessGroups', 'repSetAccessNote', 'repSetGroupsA', 'repSetGroupsB',
  'repPlaceholder',
  // S1c — пороги aging (settings)
  'repSetThresholds', 'repSetThHint', 'repSetThColState', 'repSetThColYellow', 'repSetThColRed', 'repSetThEmpty',
  // S1c — A7 Aging вью
  'repA7Title', 'repA7Sub', 'repColId', 'repColTask', 'repColStatus', 'repColDays', 'repColFlag', 'repDaysUnit',
  'repFilterLabel', 'repFilterPh', 'repRefresh', 'repLoading', 'repEmpty', 'repError',
  'repFlagOver', 'repFlagWarn', 'repFlagOk', 'repFlagNone', 'repIncomplete', 'repLimitHit',
  // S2 — A1 Прогресс: целевые статусы + ярлыки (settings)
  'repSetA1Targets', 'repSetA1Hint', 'repSetA1ColTarget', 'repSetA1ColLabel',
  // S2c-b — A1 Прогресс вью: заголовок/колонки + chrome (пикер вида + период)
  'repA1Title', 'repA1Sub', 'repColEnteredStatus', 'repColEnteredDate', 'repColLabel', 'repA1NoTargets',
  'repPickReport', 'repPeriodLabel', 'repYearLabel', 'repRangeFrom', 'repRangeTo', 'repRangePrompt',
  'repPeriodToday', 'repPeriodYesterday', 'repPeriodLast7', 'repPeriodLast30', 'repPeriodLastMonth',
  'repPeriodLastQuarter', 'repPeriodCurrentQuarter', 'repPeriodYtd', 'repPeriodCalendarYear', 'repPeriodCustom',
  // S3a — A2 TTM: якоря + нормативы + маркеры пауз (settings)
  'repSetA2Anchors', 'repSetA2AnchorsHint', 'repSetA2ColMetric', 'repSetA2ColStart', 'repSetA2ColEnd',
  'repSetA2Lead', 'repSetA2Team', 'repSetA2Cycle',
  'repSetA2Norms', 'repSetA2NormsHint', 'repSetA2NormLead', 'repSetA2NormTeam',
  'repSetA2Pauses', 'repSetA2PausesHint', 'repSetA2PauseStates', 'repSetA2PauseTags',
  // S3c — A2 TTM вью: заголовок/метрики/светофор + типы единиц + распределение Lead Time + баннеры
  'repA2Title', 'repA2Sub', 'repMetricLead', 'repMetricTeam', 'repMetricCycle',
  'repTtmUnit', 'repTtmOver', 'repTtmOk', 'repTtmNoNorm', 'repTtmNormPrefix',
  'repColUnitType', 'repColCount', 'repUnitEpic', 'repUnitStory',
  'repBucketTitle', 'repBucketLe40', 'repBucketMid', 'repBucketGt120',
  'repRiskSuffix', 'repA2NoAnchors', 'repA2NoPauses',
  // S4 — A8 Bottleneck / A9 Rework: упорядоченный поток статусов (settings)
  'repSetA8Flow', 'repSetA8FlowHint', 'repSetA8ColOrder',
  // S4c — Поток A8/A9 вью: заголовки/бары/метрики/таблица откатов
  'repFlowTitle', 'repFlowSub', 'repBottleneckTitle', 'repBottleneckSub', 'repFlowColWip',
  'repFlowNoFlow', 'repFlowEmpty', 'repFlowPopulation',
  'repReworkTitle', 'repReworkSub', 'repReworkTotal', 'repReworkIssues',
  'repReworkColTransition', 'repReworkColCount',
  // S5a-iii — A4 Трудозатраты вью: заголовок/колонки/итог + «кто не списал»
  'repA4Title', 'repA4Sub', 'repA4ColPerson', 'repA4ColRole', 'repA4ColHours', 'repA4ColDays',
  'repA4RoleNone', 'repA4NoLogTitle', 'repA4Total', 'repA4Empty',
  // S5b-iii — A5 План-факт вью: заголовок/плитки/колонки + настройка порога расхождения
  'repA5Title', 'repA5Sub', 'repA5MetricSuffix', 'repA5OverCount', 'repA5OverEst', 'repA5UnderEst',
  'repA5NormHint', 'repA5ColEst', 'repA5ColFact', 'repA5ColVar', 'repA5Empty',
  'repSetA5', 'repSetA5Hint', 'repSetA5Variance',
  // S6a — A3 WIP/Done срез: заголовок/колонки/тоггл/пусто + настройки полей бизнес-колонок
  'repA3Title', 'repA3Sub', 'repA3ColUnit', 'repA3ColStage', 'repA3ColOrg', 'repA3ColPriority',
  'repA3EstPrefix', 'repA3ModeWip', 'repA3ModeDone', 'repA3Empty',
  'repSetA3', 'repSetA3Hint', 'repSetA3Stage', 'repSetA3Org', 'repSetA3Priority',
  // S6b — A6 Бэклог в ЧЧ по ролям: заголовок/колонки/гейдж/пусто + настройка месячной ёмкости
  'repA6Title', 'repA6Sub', 'repA6ColTasks', 'repA6ColSum', 'repA6ColCapacity', 'repA6ColMonths',
  'repA6MonthsUnit', 'repA6AtThreshold', 'repA6NormMarker', 'repA6Empty', 'repA6NoBacklogHint',
  'repSetA6', 'repSetA6Hint',
  // Статусные секции (пороги/цели/поток) — «строка = пикер + добавить»: кнопки/пусто
  'repSetAddState', 'repSetRemoveState', 'repSetStatesEmpty',
  // S7 — говорящие названия пикера отчётов (repA*Menu); заголовок <h2> остаётся на repA*Title
  'repA7Menu', 'repA1Menu', 'repA3Menu', 'repA2Menu', 'repFlowMenu', 'repA4Menu', 'repA5Menu', 'repA6Menu',
  // S7a — A10 Spillover: пороги «возраста хвоста» (settings)
  'repSetA10Age', 'repSetA10AgeHint', 'repSetA10AgeWarm', 'repSetA10AgeHot',
  // S7c — A10 Spillover вью: заголовок/пикер спринта/секции/легенда/колонки/бэйджи/баннеры
  'repA10Title', 'repA10Sub', 'repA10Menu', 'repA10SectUnder', 'repA10SectTails', 'repA10SectAge',
  'repA10Carried', 'repA10Dropped', 'repA10CarriedShort', 'repA10DroppedShort',   /* v3.9.0 — короткие бейджи хвостов */
  'repA10ColHours', 'repA10ColType', 'repA10ColSystem', 'repA10ColAge',
  'repA10AgeUnit', 'repA10PickSprint', 'repA10NoN1', 'repA10Empty', 'repA10NoDoneCfg',
  // S8a — B3 «1000 мелочей» (контур B)
  'repB3Title', 'repB3Sub', 'repB3Menu', 'repB3Period', 'repB3Avg', 'repB3Ytd', 'repB3Unit', 'repB3NoTag',
  'repSetB3', 'repSetB3Tag', 'repSetB3TagHint',
  // S8b — B1 Техдолг (контур B)
  'repB1Title', 'repB1Sub', 'repB1Menu', 'repB1TotalDebt', 'repB1TotalPct', 'repB1Unestimated',
  'repB1ColRole', 'repB1ColDebt', 'repB1ColPct', 'repB1AllSystems', 'repB1NoCfg', 'repB1Empty',
  'repSetB1', 'repSetB1Hint', 'repSetB1Type', 'repSetB1Tag',
  // B0 — «Свод» (контур B): помесячный тренд 4 метрик × система на Recharts LineChart
  'repB0Menu', 'repB0Title', 'repB0Sub', 'repB0NoCfg', 'repB0Empty', 'repB0Window',
  'repB0AllSystems', 'repB0ColMonth', 'repB0MetricTtm', 'repB0MetricPlanfact', 'repB0MetricBottleneck',
  'repB0MetricBacklogMonths', 'repB0MetricBacklogHours', 'repB0NoFlowHint', 'repB0NoBacklogHint',
  // S9-EXP-a — экспорт отчёта (кнопка + meta: проект/снимок/дата генерации)
  'repExportLabel', 'repExportProject', 'repExportSnapshot', 'repExportGenerated',
  // S9-EXP-b — PDF (pdfmake): тосты ленивой загрузки/ошибки
  'repExportPdfLoading', 'repExportPdfErr',
  // D10 — прерывание отчёта: кнопка «Прервать» + баннеры отмены/таймаута + настройка таймаута
  'repCancel', 'repCancelHint', 'repAbortedManual', 'repAbortedTimeout',
  'repSetTimeout', 'repSetTimeoutHint', 'repSetTimeoutSec',
  'repSetShowSystem', 'repSetShowSystemHint',   /* v3.9.0 — тумблер «Система» в отчётах */
];

/* Ключи, чьё не-EN значение легитимно равно EN во ВСЕХ локалях. */
const NON_TRANSLATABLE = new Set([
  'repColId', 'repFlagNone', // «ID» / «—» — не переводятся
  // «Lead ≤» / «Team ≤» — метка = имя метрики (когнат) + символ ≤; идентична во всех локалях.
  'repSetA2NormLead', 'repSetA2NormTeam',
  // A2-вью: бренд-термины TTM/Lead-Team-Cycle Time — established English loan-terms, verbatim во всех
  // локалях (RU-эталон тоже держит их по-английски; смысл несёт локализованный подзаголовок repA2Sub).
  'repA2Title', 'repMetricLead', 'repMetricTeam', 'repMetricCycle',
  // S7 — repA2Menu = «A2 TTM — Time to Market (Lead/Team/Cycle)» — целиком бренд-термины, идентичен во всех локалях.
  'repA2Menu',
  // S7c — repA10Title = «Spillover» — established English loan-term, verbatim во всех локалях (как repA2Title/repA3Title).
  'repA10Title',
  // S4c — «WIP» (work-in-progress) — established loan-term, идентичен во всех локалях (в т.ч. RU).
  'repFlowColWip',
  // S6a — «WIP/Done» (бренд-акроним + WIP/Done loan-terms) + тоггл «WIP»/«Done» —
  // established English status idiom, verbatim во всех локалях (как repA2Title/repFlowColWip).
  'repA3Title', 'repA3ModeWip', 'repA3ModeDone',
]);

/* Когнаты/заимствования: значение легитимно совпадает с EN в КОНКРЕТНОЙ локали (вручную
   выверено — настоящий перевод, не пропущенная EN-копия). Формат "<lc>.<key>". */
const COGNATE_OK = new Set([
  // «Status» — стандартное слово в нем./нид. software UI (pl=«Stan», pt=«Estado» — переведены).
  'de.repSetThColState', 'nl.repSetThColState',
  // «ok» — универсальное заимствование (флаг «в норме»); переведено в ru/es/cs/pl/tr/ja/ko/zh.
  'de.repFlagOk', 'fr.repFlagOk', 'it.repFlagOk', 'nl.repFlagOk', 'pt.repFlagOk',
  // nl «wd» = werkdagen (совпало с EN-аббревиатурой рабочих дней).
  'nl.repDaysUnit',
  // «Epic» — de/fr/hu/nl держат agile-термин по-английски (ru «Эпик», es «Épica», it «Epica»,
  // pt «Épico», pl/cs/tr «Epik», ja/ko/zh — переведены).
  'de.repUnitEpic', 'fr.repUnitEpic', 'hu.repUnitEpic', 'nl.repUnitEpic',
  // «norm ≤» — nl/tr используют заимствование «norm» + ≤; посимвольно совпало с EN «norm ≤»
  // (de «Norm ≤» отличается регистром; ru «норма ≤», es/it/pt/pl/cs «norma ≤», fr «norme ≤» — свои).
  'nl.repTtmNormPrefix', 'tr.repTtmNormPrefix',
  // S4c — nl «Flow» = established agile-loan в нидерландском UI (de «Fluss», fr «Flux» и пр. — свои).
  'nl.repFlowTitle',
  // S5a-iii — интернационализмы, посимвольно совпавшие с EN в конкретной локали (настоящий перевод):
  'cs.repA4ColRole',   // «Role» — то же слово в чешском (de «Rolle», es «Rol», it «Ruolo» и пр. — свои)
  'de.repA4ColPerson', // «Person» — то же слово в немецком (fr «Personne», es «Persona» и пр. — свои)
  'es.repA4Total', 'fr.repA4Total', 'pt.repA4Total', // «Total» — латинизм, идентичен EN (de «Gesamt», it «Totale», nl «Totaal» — свои)
  // S5b-iii — «norm 90–110%»: nl/tr держат заимствование «norm» (как repTtmNormPrefix; de «Norm» с заглавной, прочие переводят).
  'nl.repA5NormHint', 'tr.repA5NormHint',
  // S6a — «Est.» — во французском та же аббревиатура «Estimation» (совпала с EN посимвольно).
  'fr.repA3EstPrefix',
  // S7c — A10-вью agile-заимствования/интернационализмы, идентичны EN в конкретной локали (ja/ko/zh — свои):
  // «Sprint N» — Sprint = универсальный agile-loan (латинские локали держат по-английски).
  'cs.repA10PickSprint', 'de.repA10PickSprint', 'es.repA10PickSprint', 'fr.repA10PickSprint',
  'it.repA10PickSprint', 'nl.repA10PickSprint', 'pl.repA10PickSprint', 'pt.repA10PickSprint', 'tr.repA10PickSprint',
  // «spr.» — сокр. sprint, та же аббревиатура в латинских локалях.
  'cs.repA10AgeUnit', 'es.repA10AgeUnit', 'fr.repA10AgeUnit', 'hu.repA10AgeUnit', 'it.repA10AgeUnit',
  'nl.repA10AgeUnit', 'pl.repA10AgeUnit', 'pt.repA10AgeUnit', 'tr.repA10AgeUnit',
  // «Type»/«System» — интернационализмы: fr/nl «Type», de/pl «System» посимвольно совпали с EN.
  'fr.repA10ColType', 'nl.repA10ColType', 'de.repA10ColSystem', 'pl.repA10ColSystem',
  // S8b — «Role» = то же слово в чешском (как cs.repA4ColRole; de «Rolle», es «Rol» и пр. — свои).
  'cs.repB1ColRole',
  // S9-EXP-a — «Export»: cs/de/fr держат латинизм-существительное verbatim (es «Exportar», it «Esporta»,
  // pl «Eksport», nl «Exporteren» и пр. — свои); nl «Project» посимвольно совпал с EN «Project».
  'cs.repExportLabel', 'de.repExportLabel', 'fr.repExportLabel', 'nl.repExportProject',
]);

const dicts = {};
EXPECTED_LOCALES.forEach(function (lc) {
  dicts[lc] = JSON.parse(fs.readFileSync(path.join(I18N_DIR, lc + '.json'), 'utf8'));
});

test('reporting i18n: каждый ключ присутствует во всех 15 локалях', function () {
  const missing = [];
  EXPECTED_LOCALES.forEach(function (lc) {
    REPORTING_KEYS.forEach(function (k) {
      if (typeof dicts[lc][k] !== 'string' || dicts[lc][k].length === 0) missing.push(lc + '.' + k);
    });
  });
  assert.deepStrictEqual(missing, [], 'Отсутствуют reporting-ключи: ' + missing.join(', '));
});

test('reporting i18n: нет placeholder-копий EN (реальные переводы во всех локалях)', function () {
  const en = dicts.en;
  const placeholders = [];
  EXPECTED_LOCALES.forEach(function (lc) {
    if (lc === 'en') return;
    REPORTING_KEYS.forEach(function (k) {
      if (NON_TRANSLATABLE.has(k)) return;
      if (COGNATE_OK.has(lc + '.' + k)) return;
      if (dicts[lc][k] === en[k]) placeholders.push(lc + '.' + k);
    });
  });
  assert.strictEqual(placeholders.length, 0, 'EN-копии (не переведено): ' + placeholders.join(', '));
});

test('reporting i18n: символ ⊇ (B⊇A) сохранён в repSetAccessNote во всех локалях', function () {
  const missing = [];
  EXPECTED_LOCALES.forEach(function (lc) {
    if (String(dicts[lc].repSetAccessNote || '').indexOf('⊇') < 0) missing.push(lc);
  });
  assert.deepStrictEqual(missing, [], 'Потерян символ ⊇ в repSetAccessNote: ' + missing.join(', '));
});

test('reporting i18n: плейсхолдер {n} сохранён в repIncomplete/repLimitHit во всех локалях', function () {
  const broken = [];
  EXPECTED_LOCALES.forEach(function (lc) {
    ['repIncomplete', 'repLimitHit', 'repA5OverCount', 'repA5NormHint', 'repA6NormMarker', 'repB0Window'].forEach(function (k) {
      if (String(dicts[lc][k] || '').indexOf('{n}') < 0) broken.push(lc + '.' + k);
    });
  });
  assert.deepStrictEqual(broken, [], 'Потерян {n}: ' + broken.join(', '));
});
