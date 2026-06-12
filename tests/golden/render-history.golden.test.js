/**
 * Golden-master: рендер истории спринтов — buildSpoiler(rec, idx).
 *
 * Снимается: outerHTML спойлера (vanilla-разметка IIFE) + материализованный
 * контракт Ring Table вложенной таблицы items (если она смонтирована при
 * раскрытии). Права редактора/валидатора включены, чтобы кнопки управления
 * попали в характеризацию.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { createHost } = require('./monolith-host');
const { checkHtmlSnapshot, checkJsonSnapshot } = require('./snap');
const { materializeTable } = require('./serialize');
const fx = require('./fixtures/state');

function bootWithRights() {
  const host = createHost();
  fx.applyBaseState(host.gm);
  host.gm.set({ _isValidator: true, _isEditor: true, _isAssigner: true });
  return host;
}

test('golden: buildSpoiler — FINISHED-запись (analysis)', () => {
  const { gm } = bootWithRights();
  const recEl = gm.call('buildSpoiler', gm.get('_history')[0], 0);
  assert.ok(recEl && recEl.outerHTML, 'buildSpoiler must return an element');
  checkHtmlSnapshot('spoiler-finished-analysis', recEl.outerHTML);
});

test('golden: buildSpoiler — FINISHED-запись (testing)', () => {
  const { gm } = bootWithRights();
  const recEl = gm.call('buildSpoiler', gm.get('_history')[1], 1);
  checkHtmlSnapshot('spoiler-finished-testing', recEl.outerHTML);
});

test('golden: buildSpoiler — items-таблица истории (контракт Ring Table)', () => {
  const { gm, document } = bootWithRights();
  const recEl = gm.call('buildSpoiler', gm.get('_history')[0], 0);
  document.body.appendChild(recEl);
  /* Спойлер ленивый: таблица items монтируется при раскрытии. */
  const head = recEl.querySelector('.spoiler__head');
  head.dispatchEvent(new (document.defaultView.MouseEvent)('click', { bubbles: true }));
  const tableHost = recEl.querySelector('[data-ssp-table-host]') ||
    Array.from(recEl.querySelectorAll('*')).find((el) => el.__sspTableOpts);
  if (!tableHost) {
    /* характеризуем фактическое поведение: спойлер мог отрендерить без Ring-таблицы */
    checkJsonSnapshot('spoiler-items-table', { mounted: false, bodyAfterToggle: recEl.querySelector('.spoiler__body') ? recEl.querySelector('.spoiler__body').className : null });
    return;
  }
  checkJsonSnapshot('spoiler-items-table', materializeTable(tableHost));
});

/* ── Добор Тира D слайс 4: ветки buildSpoiler + renderHistory ─────────────── */

/** Синтетическая запись истории с детерминированными epoch-датами. */
function mkRec(over) {
  return Object.assign({
    sprintId: 'gm-syn-2026-06_analysis',
    roleKey: 'analysis',
    roleLabel: 'Анализ',
    name: 'GM Synthetic June 2026',
    status: 'PLANNING',
    dateStart: 1781136000000,
    dateEnd: 1782345600000,
    confirmedAt: 1781136000000,
    confirmedBy: 'gm_user_validator',
    hasWorkingCopy: false,
    items: [],
    personalPlanning: {},
    revisions: [],
    pluginVersion: '2.5.6',
  }, over || {});
}

function synItem(id, over) {
  return Object.assign({
    issueId: id,
    url: 'https://yt.local/issue/' + id,
    title: 'Синтетическая задача ' + id,
    inclusionStatus: 'INC_PLANNED',
    priority: 'Major',
    state: 'Open',
  }, over || {});
}

function click(document, el) {
  el.dispatchEvent(new (document.defaultView.MouseEvent)('click', { bubbles: true }));
}

test('golden: buildSpoiler — PLANNING с целью/итогом/ретро и полями Спринт/Версия', () => {
  const { gm } = bootWithRights();
  const rec = mkRec({
    sprintGoal: 'Очень длинная цель спринта, которая заведомо превышает восемьдесят символов для проверки усечения в шапке спойлера',
    goalOutcome: 'partial',
    goalRetroNote: 'Ретро-заметка: половина задач уехала в следующий спринт',
    sprintFieldVal: 'Спринт 2026.06',
    versionFieldVal: 'v2.5.6',
    items: [synItem('GM-S1', { estimate_analysis: 300, fact_analysis: null })],
  });
  const el = gm.call('buildSpoiler', rec, 0);
  checkHtmlSnapshot('spoiler-planning-goal-fields', el.outerHTML);
});

test('golden: buildSpoiler — CONFIRMED с перелимитом и отрицательным остатком', () => {
  const { gm } = bootWithRights();
  const rec = mkRec({ status: 'CONFIRMED', isOverLimit: true, remainAnalysis: -120 });
  const el = gm.call('buildSpoiler', rec, 0);
  checkHtmlSnapshot('spoiler-confirmed-overlimit', el.outerHTML);
});

test('golden: buildSpoiler — ALLOCATED (бейдж с tooltip, положительный остаток)', () => {
  const { gm } = bootWithRights();
  const rec = mkRec({ status: 'ALLOCATED', remainAnalysis: 60 });
  const el = gm.call('buildSpoiler', rec, 0);
  checkHtmlSnapshot('spoiler-allocated', el.outerHTML);
});

test('golden: buildSpoiler — без прав валидатора (нет Edit; Finish/Del присутствуют)', () => {
  const host = createHost();
  fx.applyBaseState(host.gm);
  const rec = mkRec({ status: 'CONFIRMED' });
  const el = host.gm.call('buildSpoiler', rec, 0);
  checkHtmlSnapshot('spoiler-nonvalidator-confirmed', el.outerHTML);
});

test('golden: buildSpoiler — минимальная запись без name/role/goal, items пусто', () => {
  const { gm } = bootWithRights();
  const rec = mkRec({ name: null, roleLabel: null, status: 'CONFIRMED' });
  const el = gm.call('buildSpoiler', rec, 0);
  checkHtmlSnapshot('spoiler-minimal-empty-items', el.outerHTML);
});

function wcDraft(editorLogin) {
  return {
    editorLogin: editorLogin,
    updatedAt: 1781200000000,
    items: [synItem('GM-W1', { estimate_analysis: 900, fact_analysis: 300 })],
  };
}

test('golden: buildSpoiler — моя working copy (pill, тоггл, resume, discard)', () => {
  const { gm } = bootWithRights();
  gm.set({
    _currentUser: { login: 'gm_user_validator' },
    _workingDrafts: { 'gm-syn-2026-06_analysis': wcDraft('gm_user_validator') },
  });
  const rec = mkRec({ status: 'CONFIRMED', hasWorkingCopy: true });
  const el = gm.call('buildSpoiler', rec, 0);
  checkHtmlSnapshot('spoiler-wc-mine', el.outerHTML);
});

test('golden: buildSpoiler — чужая working copy (Edit disabled, без discard)', () => {
  const { gm } = bootWithRights();
  gm.set({
    _currentUser: { login: 'gm_user_validator' },
    _workingDrafts: { 'gm-syn-2026-06_analysis': wcDraft('gm_other_editor') },
  });
  const rec = mkRec({ status: 'CONFIRMED', hasWorkingCopy: true });
  const el = gm.call('buildSpoiler', rec, 0);
  checkHtmlSnapshot('spoiler-wc-foreign', el.outerHTML);
});

test('golden: buildSpoiler — WC-тоггл «Снимок ↔ Рабочая копия» (контракт переключения)', () => {
  const { gm, document } = bootWithRights();
  gm.set({
    _currentUser: { login: 'gm_user_validator' },
    _workingDrafts: { 'gm-syn-2026-06_analysis': wcDraft('gm_user_validator') },
  });
  const rec = mkRec({
    status: 'CONFIRMED', hasWorkingCopy: true,
    items: [synItem('GM-S1', { estimate_analysis: 300, fact_analysis: 600 })],
  });
  const el = gm.call('buildSpoiler', rec, 0);
  document.body.appendChild(el);
  const radioHost = el.querySelector('[data-ssp-radio-host]');
  const notice = el.querySelector('.wc-spoiler-notice');

  radioHost.dataset.value = 'wc';
  radioHost.dispatchEvent(new (document.defaultView.Event)('change'));
  const wcItems = materializeTable(el.querySelector('[data-ssp-table-host]'));
  const wcNoticeHidden = notice.classList.contains('hidden');

  radioHost.dataset.value = 'snap';
  radioHost.dispatchEvent(new (document.defaultView.Event)('change'));
  const snapItems = materializeTable(el.querySelector('[data-ssp-table-host]'));
  const snapNoticeHidden = notice.classList.contains('hidden');

  checkJsonSnapshot('spoiler-wc-toggle-contract', {
    wcItems: wcItems, wcNoticeHidden: wcNoticeHidden,
    snapItems: snapItems, snapNoticeHidden: snapNoticeHidden,
  });
});

test('golden: buildSpoiler — колонки externalTicket/xpriority + отрицательная дельта', () => {
  const { gm } = bootWithRights();
  const st = gm.get('_settings');
  gm.set({ _settings: Object.assign({}, st, { fieldExternalTicketId: 'External Ticket', fieldXPriority: 'XPriority' }) });
  const rec = mkRec({
    status: 'CONFIRMED',
    items: [
      synItem('GM-S1', { externalTicketId: 'https://jira.local/browse/EXT-1', xpriority: 'High', estimate_analysis: 300, fact_analysis: 600 }),
      synItem('GM-S2', { externalTicketId: 'EXT-плоский-идентификатор', xpriority: null, estimate_analysis: 600, fact_analysis: null }),
      synItem('GM-S3', { externalTicketId: null, estimate_analysis: null, fact_analysis: null }),
    ],
  });
  const el = gm.call('buildSpoiler', rec, 0);
  checkJsonSnapshot('spoiler-extticket-xpriority-delta', materializeTable(el.querySelector('[data-ssp-table-host]')));
});

test('golden: buildSpoiler — контракт кнопок записи (excel/json/edit/finish, stopPropagation)', () => {
  const { gm, document } = bootWithRights();
  const log = [];
  gm.set({
    exportSprintToExcel: function (r) { log.push(['excel', r.sprintId]); },
    exportPerSprintJson: function (r) { log.push(['json', r.sprintId]); },
    editHistorySprint: function (r, i) { log.push(['edit', r.sprintId, i]); },
    finishHistorySprint: function (r, i) { log.push(['finish', r.sprintId, i]); },
  });
  const rec = mkRec({ status: 'CONFIRMED' });
  const el = gm.call('buildSpoiler', rec, 3);
  document.body.appendChild(el);
  const excelBtns = el.querySelectorAll('.btn--excel');
  click(document, el.querySelector('.btn--edit-hist'));
  click(document, el.querySelector('.btn--finish-hist'));
  click(document, excelBtns[0]);
  click(document, excelBtns[1]);
  checkJsonSnapshot('spoiler-buttons-contract', {
    log: log,
    openAfterClicks: el.classList.contains('open'),
  });
});

test('golden: buildSpoiler — контракт удаления записи (confirm-модалка, переключение спринта)', async () => {
  const host = createHost();
  const { gm, document, modalLog } = host;
  fx.applyBaseState(gm);
  gm.set({ _isValidator: true });
  const log = [];
  gm.set({
    apiPost: function (path, body) {
      log.push({ apiPost: path, historyLen: body && body.history ? body.history.length : null });
      return Promise.resolve({ success: true });
    },
    setCurrentSprintId: function (id, o) { log.push({ setCurrentSprintId: id, confirmed: !!(o && o.confirmed) }); },
    renderWidgetHeader: function () { log.push({ renderWidgetHeader: true }); },
    toast: function (msg, kind) { log.push({ toast: kind }); },
  });
  const rec = mkRec({ status: 'CONFIRMED' });
  /* Единственная запись логического спринта + неактивный текущий спринт →
     после удаления должна сработать ветка setCurrentSprintId. */
  gm.set({ _history: [rec], _currentSprintId: 'gm-syn-2026-06' });
  const el = gm.call('buildSpoiler', rec, 0);
  document.body.appendChild(el);
  click(document, el.querySelector('.ring-button-iconOnly'));
  const spec = modalLog[modalLog.length - 1];
  spec.buttons[1].onClick({ close: function () { log.push({ modalClosed: true }); } });
  await new Promise(function (r) { setImmediate(r); });
  checkJsonSnapshot('hist-del-confirm-contract', {
    modalId: spec.id,
    modalType: spec.type,
    buttonIds: spec.buttons.map(function (b) { return b.id; }),
    log: log,
    historyLenAfter: gm.get('_history').length,
  });
});

test('golden: renderHistory — пустая история (empty-state, пагинация скрыта)', () => {
  const { gm, document } = bootWithRights();
  gm.set({ _history: [] });
  gm.call('renderHistory');
  checkJsonSnapshot('hist-empty-state', {
    html: document.getElementById('historyList').innerHTML,
    pagDisplay: document.getElementById('histPag').style.display,
  });
});

test('golden: renderHistory — миграция записи без roleKey + сортировка по confirmedAt desc', () => {
  const { gm, document } = bootWithRights();
  const a = mkRec({ sprintId: 'gm-a_analysis', name: 'REC-A', roleKey: null, roleLabel: null, confirmedAt: 100 });
  const b = mkRec({ sprintId: 'gm-b_analysis', name: 'REC-B', confirmedAt: 300 });
  const c = mkRec({ sprintId: 'gm-c_analysis', name: 'REC-C', confirmedAt: 200 });
  gm.set({ _history: [a, b, c], _histPage: 1 });
  gm.call('renderHistory');
  const names = Array.from(document.getElementById('historyList').querySelectorAll('.spoiler'))
    .map(function (sp) { return sp.querySelector('.spoiler__mv').textContent; });
  checkJsonSnapshot('hist-migration-sort', {
    order: names,
    migratedRoleKey: gm.get('_history')[0].roleKey,
    migratedRoleLabel: gm.get('_history')[0].roleLabel,
    pagDisplay: document.getElementById('histPag').style.display,
  });
});

test('golden: renderHistory — пагинация HIST_PAGE (страницы, disabled-кнопки, clamp)', () => {
  const { gm, document } = bootWithRights();
  const recs = [];
  for (let i = 1; i <= 13; i++) {
    recs.push(mkRec({ sprintId: 'gm-p' + i + '_analysis', name: 'REC-' + i, confirmedAt: 14000 - i * 1000 }));
  }
  gm.set({ _history: recs, _histPage: 1 });
  gm.call('renderHistory');
  const list = document.getElementById('historyList');
  const page1 = {
    count: list.querySelectorAll('.spoiler').length,
    info: document.getElementById('histPageInfo').textContent,
    prevDisabled: document.getElementById('histPrev').disabled,
    nextDisabled: document.getElementById('histNext').disabled,
    pagDisplay: document.getElementById('histPag').style.display,
  };
  gm.set({ _histPage: 2 });
  gm.call('renderHistory');
  const page2 = {
    count: list.querySelectorAll('.spoiler').length,
    info: document.getElementById('histPageInfo').textContent,
    prevDisabled: document.getElementById('histPrev').disabled,
    nextDisabled: document.getElementById('histNext').disabled,
  };
  gm.set({ _histPage: 99 });
  gm.call('renderHistory');
  checkJsonSnapshot('hist-pagination', { page1: page1, page2: page2, clampedTo: gm.get('_histPage') });
});
