/**
 * Golden-master: validation-контроллер (Фаза 5 слайс 4, домен E1-validation).
 *
 * Характеризация ДО выноса в validation-controller.js (__SSP_VALIDATION_CTRL):
 *   • doValidateRole — гарды до запроса, отказ прав, успешный флоу
 *     (CONFIRMED + snapshot + cleanup + рендеры), server-warnings, ошибки;
 *   • updateAllocOverlimitUI — per-task бордеры, B13-агрегат (fallback без host),
 *     #38 allowOverlimitPlanning, guard одноразовости модалки + сброс;
 *   • ветки downgrade/cancel overlimit-модалки — через recording RING_MODAL
 *     (showOverlimitModal будет приватен модулю — вход только updateAllocOverlimitUI);
 *   • maybeShowAllocatedLockHint — onboarding-гард localStorage;
 *   • event-контракты document-листенеров blur (alloc-input) / change (inc-sel) —
 *     таймер 50мс через управляемый планировщик (паттерн draft-store).
 *
 * Контракты — только через выживающие entry-points (урок слайса 3):
 * doValidateRole / updateAllocOverlimitUI / maybeShowAllocatedLockHint остаются
 * делегаторами; стейт guard'а _overlimitModalShownFor остаётся в стейт-ядре
 * (его читают/сбрасывают голдены через gm).
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { createHost } = require('./monolith-host');
const { checkJsonSnapshot } = require('./snap');
const fx = require('./fixtures/state');

/** Управляемый планировщик: очередь таймеров + ручной прогон (паттерн draft-store). */
function stubScheduler(window) {
  const timers = [];
  let seq = 0;
  window.setTimeout = function (fn, delay) {
    seq += 1;
    timers.push({ id: seq, fn: fn, delay: delay });
    return seq;
  };
  window.clearTimeout = function (id) {
    if (id == null) return;
    for (let i = 0; i < timers.length; i++) {
      if (timers[i].id === id) { timers.splice(i, 1); return; }
    }
  };
  return {
    timers: timers,
    delays: function () { return timers.map(function (t) { return t.delay; }); },
    runNext: function () { const t = timers.shift(); if (t) t.fn(); },
  };
}

/** Recording-стаб apiPost: лог {path, bodyKeys, query} (тела sprint-data огромны —
 *  контракту достаточно структуры). reject=true → Promise.reject (catch-ветки). */
function stubApiPost(gm, opts) {
  opts = opts || {};
  const log = [];
  gm.set({
    apiPost: function (path, body, query) {
      log.push({
        path: path,
        bodyKeys: Object.keys(body || {}).sort(),
        query: query === undefined ? null : query,
      });
      if (opts.reject) return Promise.reject(new Error('gm-api-reject'));
      return Promise.resolve(opts.response !== undefined ? opts.response : { success: true });
    },
  });
  return log;
}

function recordToasts(gm) {
  const toasts = [];
  gm.set({ toast: function (msg, type) { toasts.push({ msg: msg, type: type || null }); } });
  return toasts;
}

/** Стабы рендер/WC-хуков успешного флоу валидации. */
function stubValidateHooks(gm, rights) {
  const calls = { checkValidator: 0, snapshotArgs: [], hideWcBanner: 0, renderHeader: 0, badges: [] };
  gm.set({
    checkValidatorNow: function () {
      calls.checkValidator += 1;
      if (rights && rights.reject) return Promise.reject(new Error('gm-rights-reject'));
      return Promise.resolve(!rights || rights.ok !== false);
    },
    saveRoleHistorySnapshot: function (rk, overrideIdx, goalFields, wasValidated) {
      calls.snapshotArgs.push({
        rk: rk,
        overrideIdx: overrideIdx === undefined ? '<undefined>' : overrideIdx,
        goalFields: goalFields === undefined ? '<undefined>' : goalFields,
        wasValidated: wasValidated,
      });
      return Promise.resolve();
    },
    hideWorkingCopyBanner: function () { calls.hideWcBanner += 1; },
    renderWidgetHeader: function () { calls.renderHeader += 1; },
    renderRoleStatusBadge: function (rk) { calls.badges.push(rk); },
  });
  return calls;
}

/** DOM-обвязка validation-зоны: кнопка валидации + статус/new-кнопка + edit-баннер. */
function ensureValidationDom(document, rk) {
  document.body.insertAdjacentHTML(
    'beforeend',
    '<button id="validateBtn_' + rk + '"></button>' +
      '<span id="sprintStatus_' + rk + '"></span>' +
      '<button id="newSprintBtn_' + rk + '" style="display: none;"></button>' +
      '<div id="editHistBanner" style="display: block;">edit-banner</div>'
  );
  return document.getElementById('validateBtn_' + rk);
}

/** statusByRole — пометить роль валидированной активной per-role записью _history.
 *  R6-гейт overlimit-модалки (и setRoleStatus) читают статус per-role, не глобальный. */
function markRoleValidated(gm, rk, status) {
  const id = fx.SPRINT_ID + '_' + rk;
  const h = gm.get('_history').filter(function (r) { return r.sprintId !== id; });
  h.push({
    sprintId: id, roleKey: rk, status: status || 'ALLOCATED',
    name: 'GM Sprint June 2026', items: [], personalPlanning: {}, revisions: [], pluginVersion: '2.5.6',
  });
  gm.set({ _history: h });
}

/** compHost с alloc-инпутами (data-iid) для бордер-контракта. */
function ensureCompHostInputs(document, rk, iids) {
  const inputs = iids
    .map(function (iid) { return '<input class="alloc-input" data-iid="' + iid + '">'; })
    .join('');
  document.body.insertAdjacentHTML('beforeend', '<div id="compHost_' + rk + '">' + inputs + '</div>');
  return document.getElementById('compHost_' + rk);
}

function bordersOf(document, rk) {
  const out = {};
  document.querySelectorAll('#compHost_' + rk + ' input.alloc-input').forEach(function (inp) {
    out[inp.getAttribute('data-iid')] = inp.style.borderColor;
  });
  return out;
}

function btnContract(btn) {
  return {
    disabled: btn.disabled,
    overlimitClass: btn.classList.contains('btn--disabled-overlimit'),
    title: btn.title,
  };
}

/* ═══════════════════ doValidateRole ═══════════════════ */

test('golden: doValidateRole — гарды до запроса (settings/dates/resource/active/unknown-role)', async () => {
  const { gm } = createHost();
  fx.applyBaseState(gm);
  const toasts = recordToasts(gm);
  const api = stubApiPost(gm);
  const hooks = stubValidateHooks(gm);

  /* нет настроек */
  gm.set({ _settings: null });
  await gm.call('doValidateRole', 'analysis');
  gm.set({ _settings: fx.buildSettings() });

  /* нет дат спринта */
  const noDates = fx.buildSprint();
  noDates.dateStart = null;
  gm.set({ _sprint: noDates });
  await gm.call('doValidateRole', 'analysis');
  gm.set({ _sprint: fx.buildSprint() });

  /* неизвестная роль — тихий return без тоста */
  const toastsBeforeGhost = toasts.length;
  await gm.call('doValidateRole', 'ghostRole');
  const ghostSilent = toasts.length === toastsBeforeGhost;

  /* нулевой ресурс роли (фикстура: resourceDevFront = 0) */
  await gm.call('doValidateRole', 'devFront');

  /* ресурс есть, активных задач нет */
  gm.get('_sprint').resourceDevFront = 600;
  const items = gm.get('_roleItems');
  items.devFront = [];
  await gm.call('doValidateRole', 'devFront');

  checkJsonSnapshot('validate-role-guards', {
    toasts: toasts,
    ghostRoleSilent: ghostSilent,
    apiCalls: api.length,
    checkValidatorCalls: hooks.checkValidator,
  });
});

test('golden: doValidateRole — нет прав валидатора (флаг + тост, без POST)', async () => {
  const { gm } = createHost();
  fx.applyBaseState(gm);
  const toasts = recordToasts(gm);
  const api = stubApiPost(gm);
  const hooks = stubValidateHooks(gm, { ok: false });

  await gm.call('doValidateRole', 'analysis');

  checkJsonSnapshot('validate-role-no-rights', {
    toasts: toasts,
    isValidator: gm.get('_isValidator'),
    statusUnchanged: gm.get('_sprint').status,
    apiCalls: api.length,
    checkValidatorCalls: hooks.checkValidator,
    snapshotCalls: hooks.snapshotArgs.length,
  });
});

test('golden: doValidateRole — успешный флоу (CONFIRMED + snapshot + cleanup + рендеры)', async () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  ensureValidationDom(document, 'analysis');
  const toasts = recordToasts(gm);
  const api = stubApiPost(gm);
  const hooks = stubValidateHooks(gm);

  /* legacy-поля редактирования истории + активная WC — успех обязан их зачистить */
  const sprint = gm.get('_sprint');
  sprint.editingFromHistory = true;
  sprint.historyIdx = 2;
  gm.set({ _activeWorkingDraftKey: 'gm-wc-key' });

  await gm.call('doValidateRole', 'analysis');

  const after = gm.get('_sprint');
  checkJsonSnapshot('validate-role-success', {
    apiLog: api,
    snapshotArgs: hooks.snapshotArgs,
    isValidator: gm.get('_isValidator'),
    status: after.status,
    editingFromHistory: after.editingFromHistory,
    historyIdxPresent: 'historyIdx' in after,
    activeWorkingDraftKey: gm.get('_activeWorkingDraftKey'),
    hideWcBanner: hooks.hideWcBanner,
    renderHeader: hooks.renderHeader,
    badges: hooks.badges,
    dom: {
      editBannerDisplay: document.getElementById('editHistBanner').style.display,
      editBannerText: document.getElementById('editHistBanner').textContent,
      sprintStatusDisplay: document.getElementById('sprintStatus_analysis').style.display,
      newSprintBtnDisplay: document.getElementById('newSprintBtn_analysis').style.display,
    },
    toasts: toasts,
  });
});

test('golden: doValidateRole — server warnings overlimit (известная/неизвестная роль, мусор игнорируется)', async () => {
  const { gm } = createHost();
  fx.applyBaseState(gm);
  const toasts = recordToasts(gm);
  stubApiPost(gm, { response: { success: true, warnings: ['overlimit:testing', 'overlimit:ghost', 'misc-warning', 42] } });
  stubValidateHooks(gm);

  await gm.call('doValidateRole', 'analysis');

  checkJsonSnapshot('validate-role-server-warnings', { toasts: toasts });
});

test('golden: doValidateRole — ошибки (reject прав → toastCheckError; reject POST → toastSaveError)', async () => {
  /* reject проверки прав */
  const hostA = createHost();
  fx.applyBaseState(hostA.gm);
  const toastsA = recordToasts(hostA.gm);
  const apiA = stubApiPost(hostA.gm);
  stubValidateHooks(hostA.gm, { reject: true });
  await hostA.gm.call('doValidateRole', 'analysis');

  /* права ок, reject POST — статус уже переведён локально (фиксируем факт) */
  const hostB = createHost();
  fx.applyBaseState(hostB.gm);
  const toastsB = recordToasts(hostB.gm);
  stubApiPost(hostB.gm, { reject: true });
  const hooksB = stubValidateHooks(hostB.gm);
  await hostB.gm.call('doValidateRole', 'analysis');

  checkJsonSnapshot('validate-role-errors', {
    checkErr: { toasts: toastsA, apiCalls: apiA.length },
    saveErr: {
      toasts: toastsB,
      statusAfter: hostB.gm.get('_sprint').status,
      snapshotCalls: hooksB.snapshotArgs.length,
    },
  });
});

/* ═══════════════════ updateAllocOverlimitUI ═══════════════════ */

test('golden: updateAllocOverlimitUI — per-task бордеры + блокировка кнопки (testing, ALLOCATED → модалка)', () => {
  const { gm, document, modalLog } = createHost();
  fx.applyBaseState(gm);
  const btn = ensureValidationDom(document, 'testing');
  markRoleValidated(gm, 'testing');   /* per-role ALLOCATED → R6 откроет модалку */
  /* GM-5: alloc 960 > delta 600; GM-6: alloc 600 > delta 480; GM-404 — нет в items */
  ensureCompHostInputs(document, 'testing', ['GM-5', 'GM-6', 'GM-404']);

  gm.call('updateAllocOverlimitUI', 'testing');

  checkJsonSnapshot('overlimit-ui-borders-testing', {
    borders: bordersOf(document, 'testing'),
    btn: btnContract(btn),
    modalIds: modalLog.map(function (s) { return s.id; }),
    guardKeys: Object.keys(gm.get('_overlimitModalShownFor')),
  });
});

test('golden: updateAllocOverlimitUI — сброс бордера неактивной задачи + else-ветка снимает блокировку (analysis)', () => {
  const { gm, document, modalLog } = createHost();
  fx.applyBaseState(gm);
  const btn = ensureValidationDom(document, 'analysis');
  const host = ensureCompHostInputs(document, 'analysis', ['GM-1', 'GM-2', 'GM-3', 'GM-4']);
  /* GM-4 — INC_EXCLUDED: остаточный бордер обязан сброситься */
  host.querySelector('input[data-iid="GM-4"]').style.borderColor = 'red';
  /* кнопка предварительно заблокирована + guard взведён — else-ветка всё снимает */
  btn.disabled = true;
  btn.title = 'stale';
  btn.classList.add('btn--disabled-overlimit');
  gm.get('_overlimitModalShownFor')['analysis:' + fx.SPRINT_ID] = true;

  gm.call('updateAllocOverlimitUI', 'analysis');

  checkJsonSnapshot('overlimit-ui-clear-analysis', {
    borders: bordersOf(document, 'analysis'),
    btn: btnContract(btn),
    modalIds: modalLog.map(function (s) { return s.id; }),
    guardKeys: Object.keys(gm.get('_overlimitModalShownFor')),
  });
});

test('golden: updateAllocOverlimitUI — fallback без host: per-task агрегат и B13 (Σalloc > ресурс при пустых est/fact)', () => {
  /* host отсутствует → детекция только агрегатами */
  const hostA = createHost();
  fx.applyBaseState(hostA.gm);
  markRoleValidated(hostA.gm, 'testing');   /* per-role ALLOCATED → R6 откроет модалку */
  const btnA = ensureValidationDom(hostA.document, 'testing');
  hostA.gm.call('updateAllocOverlimitUI', 'testing');

  /* B13: per-task проверка слепа (delta=0), ловит только calcRemForRole < 0 */
  const hostB = createHost();
  fx.applyBaseState(hostB.gm);
  const btnB = ensureValidationDom(hostB.document, 'testing');
  hostB.gm.get('_roleItems').testing.forEach(function (it) {
    it.estimate_testing = 0;
    it.fact_testing = 0;
  });
  const aggregates = {
    checkLen: hostB.gm.call('checkAllocOverlimit', 'testing').length,
    calcRem: hostB.gm.call('calcRemForRole', 'testing'),
  };
  hostB.gm.call('updateAllocOverlimitUI', 'testing');

  checkJsonSnapshot('overlimit-ui-aggregate-fallback', {
    perTaskAggregate: { btn: btnContract(btnA), modalIds: hostA.modalLog.map(function (s) { return s.id; }) },
    b13Aggregate: { btn: btnContract(btnB), aggregates: aggregates },
  });
});

test('golden: updateAllocOverlimitUI — #38 allowOverlimitPlanning: детекция остаётся, блокировки и модалки нет', () => {
  const { gm, document, modalLog } = createHost();
  fx.applyBaseState(gm);
  gm.get('_settings').allowOverlimitPlanning = true;
  const btn = ensureValidationDom(document, 'testing');
  ensureCompHostInputs(document, 'testing', ['GM-5', 'GM-6']);

  gm.call('updateAllocOverlimitUI', 'testing');

  checkJsonSnapshot('overlimit-ui-allow-overlimit-38', {
    borders: bordersOf(document, 'testing'),
    btn: btnContract(btn),
    modalIds: modalLog.map(function (s) { return s.id; }),
    guardKeys: Object.keys(gm.get('_overlimitModalShownFor')),
  });
});

test('golden: overlimit-модалка — guard одноразовости + сброс else-веткой + повторный показ', () => {
  const { gm, document, modalLog } = createHost();
  fx.applyBaseState(gm);
  markRoleValidated(gm, 'testing');   /* per-role ALLOCATED → R6 откроет модалку */
  ensureValidationDom(document, 'testing');

  gm.call('updateAllocOverlimitUI', 'testing');
  gm.call('updateAllocOverlimitUI', 'testing');
  const afterTwoCalls = modalLog.length;

  /* устранение перелимита → else-ветка удаляет guard-ключ */
  gm.get('_roleItems').testing.forEach(function (it) {
    it.estimate_testing = 600;
    it.fact_testing = 0;
    it.alloc_testing = 100;
  });
  gm.call('updateAllocOverlimitUI', 'testing');
  const guardAfterFix = Object.keys(gm.get('_overlimitModalShownFor'));

  /* новый перелимит → модалка показывается снова */
  gm.get('_roleItems').testing.forEach(function (it) { it.alloc_testing = 960; });
  gm.call('updateAllocOverlimitUI', 'testing');

  checkJsonSnapshot('overlimit-modal-once-guard', {
    afterTwoCalls: afterTwoCalls,
    guardAfterFix: guardAfterFix,
    afterReBreak: modalLog.length,
    modalIds: modalLog.map(function (s) { return s.id; }),
  });
});

test('golden: B24 — overlimit-модалка: downgrade понижает PER-ROLE статус (бейдж/шапка/persist) и cancel', () => {
  const { gm, document, modalLog } = createHost();
  fx.applyBaseState(gm);
  ensureValidationDom(document, 'testing');
  document.body.insertAdjacentHTML(
    'beforeend',
    '<span id="statusBadge_analysis"></span><span id="statusBadge_testing"></span>'
  );
  /* B24/statusByRole — статус роли канонически в _history[<sprintId>_<rk>].status.
     Добавляем активную per-role запись testing=ALLOCATED → R6-гейт (per-role) откроет
     downgrade-модалку; downgrade переведёт ЕЁ (а не глобальный статус) в PLANNING. */
  const activeId = fx.SPRINT_ID + '_testing';
  gm.set({
    _history: gm.get('_history').concat([{
      sprintId: activeId, roleKey: 'testing', roleLabel: 'Тестирование',
      name: 'GM Sprint June 2026', status: 'ALLOCATED',
      items: [], personalPlanning: {}, revisions: [], pluginVersion: '2.5.6',
    }]),
  });
  const toasts = recordToasts(gm);
  const calls = { badges: [], renderHeader: 0, closes: 0, apiPost: [] };
  gm.set({
    renderRoleStatusBadge: function (rk) { calls.badges.push(rk); },
    renderWidgetHeader: function () { calls.renderHeader += 1; },
    apiPost: function (path) { calls.apiPost.push(path); return Promise.resolve({}); },
  });

  gm.call('updateAllocOverlimitUI', 'testing');
  assert.strictEqual(modalLog.length, 1, 'overlimit-модалка обязана открыться (per-role ALLOCATED)');
  const spec = modalLog[0];
  const h = { close: function () { calls.closes += 1; } };

  spec.buttons.find(function (b) { return b.id === 'downgrade'; }).onClick(h);
  const afterDowngrade = {
    roleStatus: gm.call('statusForRole', 'testing'),
    historyStatus: gm.get('_history').find(function (r) { return r.sprintId === activeId; }).status,
    globalStatusUntouched: gm.get('_sprint').status,
    badges: calls.badges.slice(),
    renderHeader: calls.renderHeader,
    apiPost: calls.apiPost.slice(),
    closes: calls.closes,
    toasts: toasts.slice(),
  };

  /* cancel: вернуть роль в ALLOCATED + сбросить guard → новая модалка → отмена ничего не меняет */
  gm.get('_history').find(function (r) { return r.sprintId === activeId; }).status = 'ALLOCATED';
  gm.set({ _overlimitModalShownFor: {} });
  gm.call('updateAllocOverlimitUI', 'testing');
  modalLog[1].buttons.find(function (b) { return b.id === 'cancel'; }).onClick(h);

  checkJsonSnapshot('overlimit-modal-downgrade-cancel', {
    afterDowngrade: afterDowngrade,
    afterCancel: {
      roleStatus: gm.call('statusForRole', 'testing'),
      closes: calls.closes,
      toastCount: toasts.length,
    },
    buttonContract: modalLog.map(function (s) {
      return {
        id: s.id,
        type: s.type,
        buttonIds: s.buttons.map(function (b) { return b.id + ':' + b.variant; }),
        dismissOnBackdrop: s.dismissOnBackdrop,
        blockEscape: s.blockEscape,
        showCloseButton: s.showCloseButton,
      };
    }),
  });
});

/* ═══════════════════ maybeShowAllocatedLockHint ═══════════════════ */

test('golden: maybeShowAllocatedLockHint — onboarding-гард (per-role статус + localStorage)', () => {
  const { gm, window } = createHost();
  fx.applyBaseState(gm);
  const toasts = recordToasts(gm);

  /* ни одна роль не ALLOCATED (per-role) → ничего */
  gm.call('maybeShowAllocatedLockHint');
  const afterPlanning = toasts.length;

  /* роль ALLOCATED (per-role _history) → тост + маркер в localStorage */
  markRoleValidated(gm, 'analysis', 'ALLOCATED');
  gm.call('maybeShowAllocatedLockHint');
  const lsValue = window.localStorage.getItem('ssp_allocLockHintShown');

  /* повторно → гард по маркеру */
  gm.call('maybeShowAllocatedLockHint');

  checkJsonSnapshot('allocated-lock-hint', {
    afterPlanning: afterPlanning,
    toasts: toasts,
    lsValue: lsValue,
  });
});

/* ═══════════════════ document-листенеры (blur/change, таймер 50мс) ═══════════════════ */

test('golden: event-контракты листенеров — blur alloc-input / change inc-sel (таймер 50мс)', () => {
  const { gm, document, window, modalLog } = createHost();
  fx.applyBaseState(gm);
  markRoleValidated(gm, 'testing');   /* per-role ALLOCATED → R6 откроет модалку на blur/change */
  const btn = ensureValidationDom(document, 'testing');
  const sched = stubScheduler(window);

  document.body.insertAdjacentHTML(
    'beforeend',
    '<input id="gmAllocInp" class="alloc-input" data-rk="testing">' +
      '<select id="gmIncSel" class="inc-sel" data-rk="testing"></select>' +
      '<input id="gmPlainInp">'
  );

  /* blur на alloc-input → отложенный updateAllocOverlimitUI(rk) */
  document.getElementById('gmAllocInp').dispatchEvent(new window.Event('blur'));
  const delaysAfterBlur = sched.delays();
  sched.runNext();
  const afterBlur = { btn: btnContract(btn), modalCount: modalLog.length };

  /* change на inc-sel → тот же отложенный путь (guard модалки уже взведён) */
  document.getElementById('gmIncSel').dispatchEvent(new window.Event('change'));
  const delaysAfterChange = sched.delays();
  sched.runNext();

  /* посторонние элементы таймер не арм-ируют */
  document.getElementById('gmPlainInp').dispatchEvent(new window.Event('blur'));
  document.getElementById('gmPlainInp').dispatchEvent(new window.Event('change'));

  checkJsonSnapshot('overlimit-listeners-contract', {
    delaysAfterBlur: delaysAfterBlur,
    afterBlur: afterBlur,
    delaysAfterChange: delaysAfterChange,
    modalCountAfterChange: modalLog.length,
    timersAfterForeignEvents: sched.delays(),
  });
});
