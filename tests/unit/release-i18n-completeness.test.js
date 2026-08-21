'use strict';

/* #48 R1.1 — полнота локализации раздела «Релиз-менеджмент» (зеркало
 * capacity-i18n-completeness.test.js). Гейтит: все release-ключи присутствуют во ВСЕХ
 * 15 локалях И имеют НЕ-EN перевод (placeholder-fence: T() молча подменяет отсутствующий
 * ключ EN→RU→самим ключом — это прошло бы незаметно). COGNATE_OK — ключи, чьё значение
 * легитимно равно EN в КОНКРЕТНОЙ локали (заимствования/когнаты, вручную выверено).
 * Список растёт вместе с ключами по мере имплемента слайсов R1→R4. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const I18N_DIR = path.join(__dirname, '..', '..', 'widgets', 'main', 'i18n');
const EXPECTED_LOCALES = ['en', 'ru', 'cs', 'de', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'nl', 'pl', 'pt', 'tr', 'zh'];

/* Контракт ключей раздела релиз-менеджмента (R1.1 — настройки + core-таксономия). */
const RELEASE_KEYS = [
  // §1 статусы (6)
  'relStatusPlanned', 'relStatusPrep', 'relStatusWork', 'relStatusReleased', 'relStatusCancelled', 'relStatusOverdue',
  // §2 тип: вид×источник (6)
  'relKindLabel', 'relKindRelease', 'relKindHotfix', 'relSrcLabel', 'relSrcInternal', 'relSrcVendor',
  // §3 зоны светофора — дисплейные метки (4) + заголовок секции (R3.1: зоны — авто по State)
  'relZoneGreen', 'relZoneYellow', 'relZoneRed', 'relZoneGrey', 'relReadinessTitle',
  // §4 навигация: вкладка + узлы дерева (R1.1/R1.2b)
  'relTabTitle', 'relNodePlanned', 'relNodeHistory',
  // §7 empty-state вкладки релизов (R1.2b)
  'relEmptyTitle', 'relEmptyHint',
  // §5 настройки (R1.1)
  'relNavSettings', 'relSetEnable',
  'relSetCandGroups', 'relSetCandManagers', 'relSetCandEngineers',
  'relSetRightsGroups', 'relSetRightsManagers', 'relSetRightsEngineers',
  'relSetMappingTitle', 'relSetMappingNoChange', 'relSetMappingColStatus', 'relSetMappingColState',
  'relSetMappingAnchorNote', // R3.1 — двойная роль маппинга (свои настройки светофора снесены)
  'relSetTypeTitle', 'relSetTypeFixedNote',
  // §6 модалка создания релиза (R1.3)
  'relNewTitle', 'relFieldName', 'relFieldPlanDate', 'relFieldFreezeDate',
  'relFieldManager', 'relFieldEngineer', 'relFieldPatchnote', 'relFieldNotes', 'relFieldTaskUrl',
  'relBtnCreate', 'relHintFreezeRule', 'relHintManagerDefault', 'relHintEngineerRequired',
  'relValNameRequired', 'relValFreezeAfterPlan', 'relPickerNoGroups', 'relPickerLoadError',
  // §7 состав + подбор задач (R1.4)
  'relCardComposition', 'relCardAddIssues', 'relAddIssuesTitle', 'relPickAlready',
  // §8 перенос задач между релизами — D-B (R1.4b)
  'relTransferTitle', 'relTransferPrompt', 'relTransferFrom', 'relTransferFrozenNote',
  'relBtnTransfer', 'relTransferDone', 'relTransferTargetLocked',
  // §9 удаление незакрытого релиза (R1.3b)
  'relActDelete', 'relDeleteTitle', 'relDeleteConfirm', 'relDeleteDone',
  // §10 редактирование карточки (R1.5a)
  'relActEdit', 'relSaveBtn', 'relEditTitle',
  // §11 история релизов — спойлер-слепок (R1.5b/c)
  'relHistClosedAt', 'relSnapComposition', 'relWasOverdue',
  // §12 смена статуса + закрытие со слепком (R2.1)
  'relStatusChange', 'relStatusAdvanceTo', 'relBtnRelease', 'relCancelRelease',
  'relConfirmClose', 'relStatusChanged', 'relReleaseClosed',
  // §13 фриз/разморозка состава (R2.2, US-R2-08/09 + US-T-03)
  'relActFreeze', 'relActUnfreeze', 'relFrozenBadge', 'relFreezeConfirm', 'relUnfreezeConfirm',
  'relFreezeHintRelease', 'relFreezeHintHotfix', 'relFreezeDone', 'relUnfreezeDone',
  // §14 предпросмотр смены состояний + применение (R2.3, US-R2-04..07)
  'relCardUpdateStates', 'relPvTitle', 'relPvMappingLine', 'relPvColCurrent', 'relPvColTarget',
  'relPvColMark', 'relPvWillApply', 'relPvDesync', 'relPvUnreachable', 'relPvAlreadyTarget',
  'relPvApplyBtn', 'relPvResult', 'relPvErrDetails', 'relPvRetry', 'relPvNoMapping',
  // §16 дерево состава (R3.2, US-R3-04)
  'relTreeOrphans', 'relTreeAggPrefix', 'relTreeAggTasks',
  // §17 R4: экспорт .txt (US-R4-01) + архив истории (US-R4-02); share reuse'ит treeShare
  'relBtnExport', 'relArchiveNode', 'relArchivedToast',
];

/* Заимствования/когнаты: значение легитимно = EN в конкретной локали. Формат "<lc>.<key>".
   Выверено после мёрджа переводов (настоящие термины, не пропущенные EN-копии). */
const COGNATE_OK = new Set([
  // «Hotfix» — устоявшееся заимствование в латинице (ja/ko/zh — переведено).
  'cs.relKindHotfix', 'de.relKindHotfix', 'es.relKindHotfix', 'fr.relKindHotfix', 'hu.relKindHotfix',
  'it.relKindHotfix', 'nl.relKindHotfix', 'pl.relKindHotfix', 'pt.relKindHotfix', 'tr.relKindHotfix',
  // «Release»/«Releases» — заимствования в de/es/it/nl (RU тоже loanword «Релиз»).
  'de.relKindRelease', 'es.relKindRelease', 'it.relKindRelease', 'nl.relKindRelease',
  'de.relNavSettings', 'es.relNavSettings', 'nl.relNavSettings',
  // fr «Source» — идентичный когнат EN «Source».
  'fr.relSrcLabel',
  // R1.3 create-модалка: заимствования/когнаты, легитимно = EN в конкретной локали.
  'de.relFieldName',        // de «Name» = en «Name»
  'fr.relFieldNotes',       // fr «Notes» = en «Notes»
  'it.relFieldManager', 'it.relFieldEngineer', 'it.relFieldPatchnote', // it держит англицизмы «Release manager/engineer», «Patch note»
]);

const dicts = {};
EXPECTED_LOCALES.forEach(function (lc) {
  dicts[lc] = JSON.parse(fs.readFileSync(path.join(I18N_DIR, lc + '.json'), 'utf8'));
});

test('release i18n: каждый ключ присутствует во всех 15 локалях', function () {
  const missing = [];
  EXPECTED_LOCALES.forEach(function (lc) {
    RELEASE_KEYS.forEach(function (k) {
      if (typeof dicts[lc][k] !== 'string' || dicts[lc][k].length === 0) missing.push(lc + '.' + k);
    });
  });
  assert.deepStrictEqual(missing, [], 'Отсутствуют release-ключи: ' + missing.join(', '));
});

test('release i18n: нет placeholder-копий EN (реальные переводы во всех локалях)', function () {
  const en = dicts.en;
  const placeholders = [];
  EXPECTED_LOCALES.forEach(function (lc) {
    if (lc === 'en') return;
    RELEASE_KEYS.forEach(function (k) {
      if (COGNATE_OK.has(lc + '.' + k)) return;
      if (dicts[lc][k] === en[k]) placeholders.push(lc + '.' + k);
    });
  });
  assert.strictEqual(placeholders.length, 0, 'EN-копии (не переведено / добавь в COGNATE_OK если это когнат): ' + placeholders.join(', '));
});
