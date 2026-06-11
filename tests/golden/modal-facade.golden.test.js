/**
 * Golden-master: инварианты после сноса легаси-модал-фасада.
 *
 * Характеризация ДО сноса (см. историю файла) фиксировала: .overlay-элементов
 * нет ни в одном состоянии, _modalStack всегда пуст, Escape-хендлер init-зоны
 * и _initModalCloseObserver — no-op. Фасад (_appModalOpen/_appModalClose/
 * _showOverlay/стак/трап/observer/__SSP_MODAL + modal-pure.js) демонтирован;
 * тесты внутренностей ушли вместе с ним. Остаются контракты наблюдаемого
 * поведения — они идентичны до/после сноса:
 *
 *   1. .overlay / .settings-overlay / .dyn-modal-overlay-элементов НЕТ ни в
 *      одном состоянии рендера (CSS-правила в index.html остаются мёртвым
 *      грузом до вычистки в Тире D — тест ловит реинтродукцию элементов).
 *   2. Document-level Escape — no-op: не мутирует DOM и не зовёт Ring-close.
 *      Ring-модалки закрывает их собственный capture-listener в
 *      modal-mount.jsx (вне скоупа golden — React-сторона не характеризуется).
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { createHost } = require('./monolith-host');
const fx = require('./fixtures/state');

const OVERLAY_SEL = '.overlay, .settings-overlay, .dyn-modal-overlay';

/** Прогоняет все основные render entry-points поверх базовой фикстуры. */
function renderAllStates(host) {
  const { gm } = host;
  fx.applyBaseState(gm);
  gm.call('renderWidgetHeader');
  gm.call('renderRoleComposition', 'analysis');
  gm.call('renderStandupView');
  fx.applyPeopleState(gm);
  gm.call('renderCurrentRoleTaskTable');
  gm.call('renderCurrentRoleAssigneeTable');
  gm.call('renderGanttChart');
  gm.call('buildSpoiler', gm.get('_history')[0], 0);
}

test('golden: модал-фасад — оверлей-элементов нет ни в одном состоянии', () => {
  const host = createHost();
  const { document } = host;
  /* Статический DOM index.html — до любых рендеров. */
  assert.equal(document.querySelectorAll(OVERLAY_SEL).length, 0,
    'static index.html must contain no overlay elements');
  /* После каждого render entry-point. */
  const { gm } = host;
  fx.applyBaseState(gm);
  const steps = [
    ['renderWidgetHeader'],
    ['renderRoleComposition', 'analysis'],
    ['renderStandupView'],
  ];
  steps.forEach(function (s) {
    gm.call.apply(null, s);
    assert.equal(document.querySelectorAll(OVERLAY_SEL).length, 0,
      'no overlay elements after ' + s[0]);
  });
  fx.applyPeopleState(gm);
  ['renderCurrentRoleTaskTable', 'renderCurrentRoleAssigneeTable', 'renderGanttChart'].forEach(function (fn) {
    gm.call(fn);
    assert.equal(document.querySelectorAll(OVERLAY_SEL).length, 0,
      'no overlay elements after ' + fn);
  });
  gm.call('buildSpoiler', gm.get('_history')[0], 0);
  assert.equal(document.querySelectorAll(OVERLAY_SEL).length, 0,
    'no overlay elements after buildSpoiler');
  /* И после открытия Ring-модалки (recording-стаб). */
  gm.call('showDiscardConfirmModal', 'k', function () {});
  assert.equal(host.modalLog.length, 1, 'ring modal opened');
  assert.equal(document.querySelectorAll(OVERLAY_SEL).length, 0,
    'no overlay elements with ring modal open');
});

test('golden: Escape на document — no-op без модалок и при Ring-модалке', () => {
  const host = createHost();
  const { gm, window, document } = host;
  renderAllStates(host);

  function pressEscape() {
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  }
  function ringCloseCalls() {
    return host.bridgeLog.filter(function (e) {
      return e.bridge === 'RING_MODAL' && e.method === 'close';
    }).length;
  }

  /* (а) Без модалок: Escape ничего не меняет. */
  const beforeIdle = document.body.innerHTML;
  pressEscape();
  assert.equal(document.body.innerHTML, beforeIdle, 'escape w/o modals must not mutate DOM');
  assert.equal(host.modalLog.length, 0, 'no modal opened by escape');
  assert.equal(ringCloseCalls(), 0, 'no ring close w/o modals');

  /* (б) При открытой Ring-модалке: монолит её не трогает (закрытие — за
     capture-listener'ом modal-mount.jsx, вне харнесса). */
  gm.call('showDiscardConfirmModal', 'k', function () {});
  assert.equal(host.modalLog.length, 1, 'ring modal opened');
  const beforeModal = document.body.innerHTML;
  pressEscape();
  assert.equal(document.body.innerHTML, beforeModal, 'escape with ring modal must not mutate DOM');
  assert.equal(ringCloseCalls(), 0, 'monolith must not call ring close on escape');
});
