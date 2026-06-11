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
