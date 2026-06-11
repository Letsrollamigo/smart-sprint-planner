/**
 * Golden-master: легаси-модал-фасад — характеризация ДО сноса.
 *
 * Фиксирует инварианты, которые обязаны сохраниться после демонтажа фасада
 * (_appModalOpen / _appModalClose / _showOverlay / _modalAutoAttach /
 * _modalAutoDetach / _getFocusable / _createFocusTrap / _bodyScrollLock /
 * _modalObserver / _modalStack / __SSP_MODAL + modal-pure.js):
 *
 *   1. .overlay / .settings-overlay / .dyn-modal-overlay-элементов НЕТ ни в
 *      одном состоянии рендера: статический DOM их не содержит (#32 Phase 6
 *      демонтировал), динамически они не создаются → fallback-ветка
 *      Escape-хендлера (`.overlay:not(.hidden)`) и цели _modalObserver
 *      недостижимы.
 *   2. _modalStack пуст во всех состояниях, включая открытую Ring-модалку
 *      (Ring-путь фасад не трогает) → стак-ветка Escape-хендлера недостижима.
 *   3. Escape-хендлер init-зоны (в харнессе init заморожен → тест биндит его
 *      ИЗ ИСХОДНИКА монолита в реальный closure через gm-eval) — no-op: не
 *      мутирует DOM и не зовёт Ring-close ни без модалок, ни при открытой
 *      Ring-модалке. Настоящие Ring-модалки закрывает их собственный
 *      capture-listener в modal-mount.jsx (stopPropagation) — вне скоупа сноса.
 *   4. _initModalCloseObserver() (вызов в init-цепочке) наблюдает 0 элементов
 *      → вызов no-op.
 *
 * Жизненный цикл после сноса: тесты 2–4 ссылаются на демонтируемые
 * внутренности и уходят вместе с фасадом; тест 1 и Escape-no-op-контракт
 * (без бинда) переживают снос без изменения наблюдаемого поведения.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { createHost } = require('./monolith-host');
const fx = require('./fixtures/state');

const OVERLAY_SEL = '.overlay, .settings-overlay, .dyn-modal-overlay';
const MONO_PATH = path.join(__dirname, '..', '..', 'widgets', 'main', 'src', 'legacy-monolith.js');

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

test('golden: модал-фасад — _modalStack пуст во всех состояниях (вкл. Ring-модалку)', () => {
  const host = createHost();
  renderAllStates(host);
  assert.equal(host.gm.get('_modalStack').length, 0, 'stack empty after renders');
  host.gm.call('showDiscardConfirmModal', 'k', function () {});
  assert.equal(host.modalLog.length, 1, 'ring modal opened');
  assert.equal(host.gm.get('_modalStack').length, 0,
    'ring path must not touch legacy stack');
});

test('golden: Escape-хендлер — no-op без модалок и при Ring-модалке', () => {
  const host = createHost();
  const { gm, window, document } = host;
  renderAllStates(host);

  /* Бинд НАСТОЯЩЕГО хендлера из исходника монолита в реальный closure
     (init в харнессе заморожен, сам он не вешается). */
  const src = fs.readFileSync(MONO_PATH, 'utf8');
  const anchor = src.indexOf('Esc для закрытия overlay');
  assert.ok(anchor > 0, 'escape handler comment anchor present in monolith');
  const bindStart = src.indexOf("document.addEventListener('keydown'", anchor);
  assert.ok(bindStart > anchor, 'escape handler binding found');
  const bindEnd = src.indexOf('\n    });', bindStart);
  assert.ok(bindEnd > bindStart, 'escape handler end found');
  const handlerSrc = src.slice(bindStart, bindEnd + '\n    });'.length);
  assert.ok(handlerSrc.indexOf('_modalStack') > 0, 'handler references _modalStack');
  assert.ok(handlerSrc.indexOf('_appModalClose') > 0, 'handler references _appModalClose');
  gm.get(handlerSrc); /* eval внутри closure IIFE → реальный bind. */

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

  /* (б) При открытой Ring-модалке: легаси-хендлер её не видит и не трогает
     (закрытие — за capture-listener'ом modal-mount.jsx, вне харнесса). */
  gm.call('showDiscardConfirmModal', 'k', function () {});
  assert.equal(host.modalLog.length, 1, 'ring modal opened');
  const beforeModal = document.body.innerHTML;
  pressEscape();
  assert.equal(document.body.innerHTML, beforeModal, 'escape with ring modal must not mutate DOM');
  assert.equal(ringCloseCalls(), 0, 'legacy handler must not call ring close');
  assert.equal(gm.get('_modalStack').length, 0, 'stack still empty');
});

test('golden: _initModalCloseObserver — наблюдает 0 элементов (вызов в init = no-op)', () => {
  const host = createHost();
  const { gm, document } = host;
  assert.equal(gm.get('_modalObserver'), null, 'observer not created before init');
  gm.call('_initModalCloseObserver');
  assert.ok(gm.get('_modalObserver') !== null, 'observer created');
  assert.equal(document.querySelectorAll(OVERLAY_SEL).length, 0,
    'observer has zero observable targets');
});
