'use strict';
// Modal-spec factories extracted from widgets/main/src/core.js (Tier B).
// Browser bridge: window.__SSP_MODAL_SPECS. Golden-tested in
// tests/golden/modal-specs.golden.test.js (spec shapes + callback contracts).
//
// Faithful extraction — bodies mirror the IIFE originals 1:1. The monolith keeps
// thin delegators so all call-sites and function-declaration hoisting stay
// unchanged. Dependencies are injected per call via the trailing `deps` object:
//   t          — i18n resolver (monolith T)
//   openModal  — declarative spec API over __SSP_RING_MODAL (monolith openModal)
//   showDynFieldConfirm additionally: localizeEnumVal, fmtPeriod, parsePeriod
//   openImportReplaceConfirm instead: onReplace (downstream _doImportReplaceAll),
//   onAbandon (clears _importHistPending) — keeps monolith state out of the module.

/* Phase 2 #32 — WC-семейство мигрировано на openModal() (настоящий React в Ring Dialog).
   Callback-контракты сохранены: conflict → 'overwrite'|'export'|'cancel'; multiTab/discard → boolean.
   onClose гарантирует ровно один вызов callback на любом закрытии (кнопка/Escape). */
function showWorkingCopyConflictModal(key, baseSnap, mySnap, callback, deps) {
  var t = deps.t, openModal = deps.openModal;
  var cb = callback || function(){};
  var who = (baseSnap && baseSnap.confirmedBy) || '?';
  var decided = null;
  openModal({
    id: 'wcConflict',
    type: 'confirm',
    title: t('wcConflictTitle'),
    body: { kind: 'text', text: t('wcConflictBody').replace('{who}', who) },
    buttons: [
      { id: 'overwrite', text: t('wcConflictOverwrite'), variant: 'danger',    onClick: function(h){ decided = 'overwrite'; h.close(); } },
      { id: 'export',    text: t('wcConflictExportBoth'), variant: 'secondary', onClick: function(h){ decided = 'export';    h.close(); } },
      { id: 'cancel',    text: t('wcConflictCancel'),     variant: 'primary',   onClick: function(h){ decided = 'cancel';    h.close(); } },
    ],
    dismissOnBackdrop: false,
    blockEscape: false,
    showCloseButton: false,
    onClose: function(){ cb(decided || 'cancel'); },   /* Escape/backdrop → безопасный 'cancel' */
  });
}

function showMultiTabConflictModal(key, callback, deps) {
  var t = deps.t, openModal = deps.openModal;
  var cb = callback || function(){};
  var decided = null;
  openModal({
    id: 'wcMultiTab',
    type: 'informational',
    title: t('wcMultiTabTitle'),
    body: { kind: 'text', text: t('wcMultiTabBody') },
    buttons: [
      { id: 'continue', text: t('wcMultiTabContinue'), variant: 'primary',   onClick: function(h){ decided = true;  h.close(); } },
      { id: 'readonly', text: t('wcMultiTabReadonly'), variant: 'secondary', onClick: function(h){ decided = false; h.close(); } },
    ],
    dismissOnBackdrop: false,
    blockEscape: true,                                  /* no-escape: системно-блокирующая */
    showCloseButton: false,
    onClose: function(){ if (decided !== null) cb(decided); },  /* только явный выбор */
  });
}

function showDiscardConfirmModal(key, callback, deps) {
  var t = deps.t, openModal = deps.openModal;
  var cb = callback || function(){};
  var confirmed = false;
  openModal({
    id: 'wcDiscard',
    type: 'destructive',
    title: t('wcDiscardConfirmTitle'),
    body: { kind: 'text', text: t('wcDiscardConfirmBody') },
    buttons: [
      { id: 'confirm', text: t('wcDiscard'), variant: 'danger',  onClick: function(h){ confirmed = true;  h.close(); } },
      { id: 'cancel',  text: t('btnNo'),     variant: 'primary', onClick: function(h){ confirmed = false; h.close(); } },
    ],
    dismissOnBackdrop: false,
    blockEscape: false,
    showCloseButton: false,
    onClose: function(){ cb(confirmed); },              /* Escape/backdrop → false (отмена, безопасно) */
  });
}

function showCloseWorkingCopyModal(cb, deps) {
  var t = deps.t, openModal = deps.openModal;
  openModal({
    id: 'closeWc',
    type: 'confirm',
    title: t('wcCloseTitle'),
    body: { kind: 'text', text: t('wcCloseBody') },
    buttons: [
      { id: 'cancel', text: t('btnCancel'), variant: 'secondary', onClick: function(h) { h.close(); cb(false); } },
      { id: 'confirm', text: t('wcCloseConfirm'), variant: 'primary', onClick: function(h) { h.close(); cb(true); } },
    ],
    dismissOnBackdrop: false,
    blockEscape: false,
    showCloseButton: false,
  });
}

function openConfirmGoalDialog(sprintGoalText, existingOutcome, existingRetro, deps) {
  var t = deps.t, openModal = deps.openModal;
  return new Promise(function(resolve) {
    /* Phase 2 #32 — мигрировано на openModal() (bespoke confirmGoalForm, настоящий React).
       Promise-контракт сохранён: resolve({goalOutcome, goalRetroNote}) на confirm,
       resolve(null) на cancel/Escape. Defensive-fallback если Ring недоступен. */
    if (!window.__SSP_RING_MODAL) { resolve({ goalOutcome: 'achieved', goalRetroNote: '' }); return; }
    var result = null;   /* null = отмена/escape; объект = подтверждение */
    var h = openModal({
      id: 'confirmGoal',
      type: 'form',
      title: t('dialogConfirmGoalTitle'),
      body: { kind: 'component', name: 'confirmGoalForm', props: {
        goalText: sprintGoalText || '',
        goalLabel: t('histGoalLabel'),
        goalNotSetText: t('histGoalNotSet'),
        outcomeLabel: t('lblGoalOutcome'),
        options: [
          { value: 'achieved', label: t('optGoalAchieved') || 'Достигнута' },
          { value: 'partial',  label: t('optGoalPartial')  || 'Частично' },
          { value: 'missed',   label: t('optGoalMissed')   || 'Не достигнута' },
        ],
        existingOutcome: existingOutcome || '',
        existingRetro: existingRetro || '',   /* #69 R1 — префилл ретро из FINISHED-сестры */
        retroLabel: t('lblGoalRetroNote'),
        retroPlaceholder: t('phGoalRetroNote'),
        cancelText: t('btnCancelGoal'),
        confirmText: t('btnConfirmGoal'),
        onConfirm: function(vals){ result = vals; h.close(); },
        onCancel: function(){ result = null; h.close(); },
      }},
      buttons: [],
      dismissOnBackdrop: false,
      blockEscape: false,
      showCloseButton: false,
      onClose: function(){ resolve(result); },   /* единственная точка resolve (foundation-guarded) */
    });
  });
}

function showDynFieldConfirm(title, desc, enumValues, currentVal, callback, deps) {
  var t = deps.t, openModal = deps.openModal;
  var cb = callback || function(){};
  var isEnum = !!enumValues;
  var done = false;
  var h = openModal({
    id: 'dynField',
    type: 'form',
    title: title,
    body: { kind: 'component', name: 'dynFieldForm', props: {
      desc: desc,
      mode: isEnum ? 'enum' : 'text',
      options: isEnum ? enumValues.map(function(v){ return { value: v, label: deps.localizeEnumVal(v) || v }; }) : [],
      initialValue: isEnum ? (currentVal || (enumValues[0] || '')) : (currentVal ? deps.fmtPeriod(currentVal) : ''),
      placeholder: t('phPeriod'),
      applyText: t('btnYesUpdate'),
      cancelText: t('btnNo'),
      onApply: function(raw){
        done = true; h.close();
        cb(true, isEnum ? raw : deps.parsePeriod(raw));
      },
      onCancel: function(){ done = true; h.close(); cb(false, null); },
    }},
    buttons: [],
    dismissOnBackdrop: true,
    blockEscape: false,
    showCloseButton: true,
    onClose: function(){ if (!done) cb(false, null); },
  });
}

function openImportReplaceConfirm(deps) {
  var t = deps.t, openModal = deps.openModal;
  var confirmed = false;
  openModal({
    id: 'importReplaceHist',
    type: 'destructive',
    title: t('importReplaceTitle'),
    body: { kind: 'lines', lines: [
      { html: t('importReplaceWarn'), style: { color: 'var(--error)' } },
      { text: t('importReplaceInfo'), style: { marginTop: '8px', fontSize: '13px', color: 'var(--muted)' } },
    ]},
    buttons: [
      { id: 'cancel', text: t('btnCancel'),     variant: 'secondary', onClick: function(hh){ confirmed = false; hh.close(); } },
      { id: 'yes',    text: t('btnYesReplace'), variant: 'danger',    onClick: function(hh){ confirmed = true;  hh.close(); deps.onReplace(); } },
    ],
    dismissOnBackdrop: false,
    blockEscape: false,
    showCloseButton: false,
    onClose: function(){ if (!confirmed) deps.onAbandon(); },
  });
}

const api = {
  showWorkingCopyConflictModal,
  showMultiTabConflictModal,
  showDiscardConfirmModal,
  showCloseWorkingCopyModal,
  openConfirmGoalDialog,
  showDynFieldConfirm,
  openImportReplaceConfirm,
};

if (typeof window !== 'undefined') {
  try { window.__SSP_MODAL_SPECS = api; } catch (_) { /* sandboxed write may throw */ }
}

module.exports = api;
