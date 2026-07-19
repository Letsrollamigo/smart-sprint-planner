/**
 * Регресс 2026-07-19: двойное экранирование в Ring-таблицах.
 *
 * Plain-строки ячеек vm рендерятся table-mount'ом как React-ТЕКСТ (авто-эскейп),
 * поэтому предварительный esc() в vm-билдерах давал на экране «&amp;» вместо «&»
 * (видно даже на старых Marketplace-скриншотах). Контракт: plain-ячейки — сырые
 * строки, esc() — ТОЛЬКО внутри { __html }-веток.
 * Покрытие: состав роли (rolecomposition-view) + items-таблица истории (history-view).
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { createHost } = require('./monolith-host');
const { materializeTable } = require('./serialize');
const fx = require('./fixtures/state');

const AMP_TITLE = 'Onboarding flow — requirements & acceptance criteria';

function col(table, id) {
  const c = (table.columns || []).find(function (x) { return x.id === id; });
  assert.ok(c, 'column "' + id + '" must be present');
  return c;
}

function assertSingleEscaped(cells, what) {
  assert.ok(
    cells.some(function (v) { return typeof v === 'string' && v.includes(AMP_TITLE); }),
    what + ': ячейка должна содержать сырой «&» (эскейпит React), got: ' + JSON.stringify(cells)
  );
  assert.ok(
    !cells.some(function (v) { return String(v).includes('&amp;'); }),
    what + ': «&amp;» в ячейке = двойное экранирование'
  );
}

test('регресс: «&» в тайтле состава роли экранируется одинарно', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  const items = fx.buildRoleItems();
  items.analysis[0].title = AMP_TITLE;
  gm.set({ _roleItems: items });
  document.body.insertAdjacentHTML(
    'beforeend',
    '<div id="compHost_analysis"></div><div id="planPag_analysis"></div>' +
      '<button id="clearBtn_analysis"></button><button id="recalcBtn_analysis"></button>' +
      '<button id="refreshBtn_analysis"></button><button id="pickBtn_analysis"></button>'
  );
  gm.call('renderRoleComposition', 'analysis');
  const table = materializeTable(document.getElementById('compHost_analysis'));
  assert.ok(table, 'Ring Table contract must be stashed on compHost_analysis');
  assertSingleEscaped(col(table, 'title').cells, 'состав роли');
});

test('регресс: «&» в тайтле items-таблицы истории экранируется одинарно', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  gm.set({ _isValidator: true, _isEditor: true, _isAssigner: true });
  const hist = fx.buildHistory();
  hist[0].items[0].title = AMP_TITLE;
  gm.set({ _history: hist });
  const recEl = gm.call('buildSpoiler', gm.get('_history')[0], 0);
  document.body.appendChild(recEl);
  const head = recEl.querySelector('.spoiler__head');
  head.dispatchEvent(new (document.defaultView.MouseEvent)('click', { bubbles: true }));
  const tableHost = recEl.querySelector('[data-ssp-table-host]') ||
    Array.from(recEl.querySelectorAll('*')).find(function (el) { return el.__sspTableOpts; });
  assert.ok(tableHost, 'items-таблица истории должна смонтироваться при раскрытии');
  assertSingleEscaped(col(materializeTable(tableHost), 'title').cells, 'история');
});
