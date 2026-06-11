/**
 * Golden-master: modal-спеки (Тир B — подготовка выноса modal-specs.js).
 *
 * Характеризация семи фабрик ДО рефактора: openConfirmGoalDialog,
 * showDiscardConfirmModal, showCloseWorkingCopyModal, showMultiTabConflictModal,
 * showWorkingCopyConflictModal, _openImportReplaceConfirm, showDynFieldConfirm.
 *
 * Два среза на фабрику:
 *   - spec: снимок объекта, уходящего в __SSP_RING_MODAL.open (recording-стаб
 *     хоста пишет его в modalLog); функции → плейсхолдер '<fn>';
 *   - behavior: контракты колбэков — клик каждой кнопки и «закрытие без выбора»
 *     (Escape/backdrop → onClose). Клик симулируется вызовом onClick с
 *     handle, чей close() зовёт spec.onClose — как настоящий modal-mount.
 *     Для component-body фабрик (confirmGoal/dynField) props-колбэки замыкают
 *     handle стаба (close=noop), поэтому ring-закрытие симулируется явным
 *     вызовом spec.onClose() после колбэка.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { createHost } = require('./monolith-host');
const { checkJsonSnapshot } = require('./snap');

/** Спек → снапшот-форма: функции заменяются плейсхолдером. */
function serializeSpec(spec) {
  return JSON.parse(JSON.stringify(spec, function (k, v) {
    return typeof v === 'function' ? '<fn>' : v;
  }));
}

function lastSpec(host) {
  assert.ok(host.modalLog.length > 0, 'modal must be opened');
  return host.modalLog[host.modalLog.length - 1];
}

/** Клик кнопки спека: handle.close() → spec.onClose (контракт modal-mount). */
function clickButton(spec, id) {
  const btn = (spec.buttons || []).filter(function (b) { return b.id === id; })[0];
  assert.ok(btn, 'button not found: ' + id);
  btn.onClick({ close: function () { if (spec.onClose) spec.onClose(); } });
}

/** Закрытие без выбора (Escape/backdrop/крестик). */
function dismiss(spec) {
  if (spec.onClose) spec.onClose();
}

test('golden: showWorkingCopyConflictModal — спек + контракт overwrite/export/cancel/escape', () => {
  const host = createHost();
  const probe = (action) => {
    const calls = [];
    host.gm.call('showWorkingCopyConflictModal', 'k', { confirmedBy: 'GM Editor' }, {}, function (v) { calls.push(v); });
    const spec = lastSpec(host);
    if (action === 'escape') dismiss(spec); else clickButton(spec, action);
    return calls;
  };
  host.gm.call('showWorkingCopyConflictModal', 'k', { confirmedBy: 'GM Editor' }, {}, function () {});
  const specSnap = serializeSpec(lastSpec(host));
  checkJsonSnapshot('modal-spec-wc-conflict', {
    spec: specSnap,
    behavior: {
      overwrite: probe('overwrite'),
      exportBoth: probe('export'),
      cancel: probe('cancel'),
      escape: probe('escape'),
    },
  });
});

test('golden: showMultiTabConflictModal — спек + контракт continue/readonly, escape молчит', () => {
  const host = createHost();
  const probe = (action) => {
    const calls = [];
    host.gm.call('showMultiTabConflictModal', 'k', function (v) { calls.push(v); });
    const spec = lastSpec(host);
    if (action === 'escape') dismiss(spec); else clickButton(spec, action);
    return calls;
  };
  host.gm.call('showMultiTabConflictModal', 'k', function () {});
  const specSnap = serializeSpec(lastSpec(host));
  checkJsonSnapshot('modal-spec-wc-multitab', {
    spec: specSnap,
    behavior: {
      continue: probe('continue'),
      readonly: probe('readonly'),
      escape: probe('escape'),          /* без явного выбора cb не зовётся → [] */
    },
  });
});

test('golden: showDiscardConfirmModal — спек + контракт confirm/cancel/escape', () => {
  const host = createHost();
  const probe = (action) => {
    const calls = [];
    host.gm.call('showDiscardConfirmModal', 'k', function (v) { calls.push(v); });
    const spec = lastSpec(host);
    if (action === 'escape') dismiss(spec); else clickButton(spec, action);
    return calls;
  };
  host.gm.call('showDiscardConfirmModal', 'k', function () {});
  const specSnap = serializeSpec(lastSpec(host));
  checkJsonSnapshot('modal-spec-wc-discard', {
    spec: specSnap,
    behavior: {
      confirm: probe('confirm'),
      cancel: probe('cancel'),
      escape: probe('escape'),          /* Escape → false (безопасная отмена) */
    },
  });
});

test('golden: showCloseWorkingCopyModal — спек + контракт confirm/cancel', () => {
  const host = createHost();
  const probe = (action) => {
    const calls = [];
    host.gm.call('showCloseWorkingCopyModal', function (v) { calls.push(v); });
    clickButton(lastSpec(host), action);
    return calls;
  };
  host.gm.call('showCloseWorkingCopyModal', function () {});
  const specSnap = serializeSpec(lastSpec(host));
  checkJsonSnapshot('modal-spec-close-wc', {
    spec: specSnap,
    behavior: {
      confirm: probe('confirm'),
      cancel: probe('cancel'),
    },
  });
});

test('golden: openConfirmGoalDialog — спек + промис confirm/cancel + fallback без Ring', async () => {
  const host = createHost();

  /* confirm: props.onConfirm(vals) → ring-закрытие → resolve(vals) */
  const pConfirm = host.gm.call('openConfirmGoalDialog', 'Цель спринта GM', 'partial');
  const specConfirm = lastSpec(host);
  specConfirm.body.props.onConfirm({ goalOutcome: 'missed', goalRetroNote: 'ретро-заметка' });
  dismiss(specConfirm);
  const confirmed = await pConfirm;

  /* cancel: props.onCancel() → ring-закрытие → resolve(null) */
  const pCancel = host.gm.call('openConfirmGoalDialog', 'Цель спринта GM', '');
  const specCancel = lastSpec(host);
  specCancel.body.props.onCancel();
  dismiss(specCancel);
  const cancelled = await pCancel;

  /* escape без выбора → resolve(null) */
  const pEscape = host.gm.call('openConfirmGoalDialog', 'Цель спринта GM', '');
  dismiss(lastSpec(host));
  const escaped = await pEscape;

  /* defensive-fallback: Ring недоступен → сразу {achieved, ''} без модалки */
  const ringBridge = host.window.__SSP_RING_MODAL;
  host.window.__SSP_RING_MODAL = null;
  const fallback = await host.gm.call('openConfirmGoalDialog', 'Цель спринта GM', '');
  host.window.__SSP_RING_MODAL = ringBridge;

  checkJsonSnapshot('modal-spec-confirm-goal', {
    spec: serializeSpec(specConfirm),
    behavior: {
      confirmed: confirmed,
      cancelled: cancelled,
      escaped: escaped,
      fallbackNoRing: fallback,
    },
  });
});

test('golden: showDynFieldConfirm — enum/text спеки + контракт apply/cancel/escape', () => {
  const host = createHost();
  const probeText = (action) => {
    const calls = [];
    host.gm.call('showDynFieldConfirm', 'GM Поле', 'Описание', null, 480, function (ok, v) { calls.push([ok, v]); });
    const spec = lastSpec(host);
    if (action === 'escape') { dismiss(spec); }
    else if (action === 'apply') { spec.body.props.onApply('16ч'); dismiss(spec); }
    else { spec.body.props.onCancel(); dismiss(spec); }
    return calls;
  };
  const probeEnum = () => {
    const calls = [];
    host.gm.call('showDynFieldConfirm', 'GM Поле', 'Описание', ['Normal', 'Critical'], 'Critical', function (ok, v) { calls.push([ok, v]); });
    const spec = lastSpec(host);
    spec.body.props.onApply('Normal');
    dismiss(spec);
    return calls;
  };

  host.gm.call('showDynFieldConfirm', 'GM Поле', 'Описание', ['Normal', 'Critical'], 'Critical', function () {});
  const specEnum = serializeSpec(lastSpec(host));
  host.gm.call('showDynFieldConfirm', 'GM Поле', 'Описание', null, 480, function () {});
  const specText = serializeSpec(lastSpec(host));

  checkJsonSnapshot('modal-spec-dyn-field', {
    specEnum: specEnum,
    specText: specText,
    behavior: {
      applyEnum: probeEnum(),           /* raw как есть, без parsePeriod */
      applyText: probeText('apply'),    /* parsePeriod('16ч') → минуты */
      cancel: probeText('cancel'),
      escape: probeText('escape'),      /* done-гард: ровно один cb(false,null) */
    },
  });
});

test('golden: _openImportReplaceConfirm — спек + стейт _importHistPending по yes/cancel/escape', () => {
  const host = createHost();
  const replaceCalls = [];
  /* Подменяем downstream через gm.set — характеризуем только модалку,
     не сетевую цепочку _doImportReplaceAll. */
  host.gm.set({ _doImportReplaceAll: function () { replaceCalls.push('replaceAll'); } });
  const PENDING = { records: [{ sprintId: 'gm-s1' }] };

  const probe = (action) => {
    host.gm.set({ _importHistPending: JSON.parse(JSON.stringify(PENDING)) });
    host.gm.call('_openImportReplaceConfirm');
    const spec = lastSpec(host);
    if (action === 'escape') dismiss(spec); else clickButton(spec, action);
    return host.gm.get('_importHistPending');
  };

  host.gm.set({ _importHistPending: JSON.parse(JSON.stringify(PENDING)) });
  host.gm.call('_openImportReplaceConfirm');
  const specSnap = serializeSpec(lastSpec(host));

  checkJsonSnapshot('modal-spec-import-replace', {
    spec: specSnap,
    behavior: {
      cancelPending: probe('cancel'),   /* отмена → pending сброшен (null) */
      escapePending: probe('escape'),   /* escape → pending сброшен (null) */
      yesPending: probe('yes'),         /* yes → pending живёт (чистит _doImportReplaceAll) */
      replaceAllCalls: replaceCalls,
    },
  });
});
