/**
 * Golden-master: рендер уровня «Роли» вкладки Планирование.
 *
 * renderRoleAccordion(rk) — чистая HTML-строка карточки роли.
 * renderRoleComposition(rk) — состав роли: непустой (контракт Ring Table)
 * и пустой (структурный empty-state #43-W2) случаи, исторический вид.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { createHost } = require('./monolith-host');
const { checkHtmlSnapshot, checkJsonSnapshot } = require('./snap');
const { materializeTable } = require('./serialize');
const fx = require('./fixtures/state');

/** compHost_<rk> и сопутствующие элементы создаются buildRolePanel динамически —
 *  для изолированной характеризации создаём их в body напрямую. */
function ensureCompHost(document, rk) {
  document.body.insertAdjacentHTML(
    'beforeend',
    '<div id="compHost_' + rk + '"></div><div id="planPag_' + rk + '"></div>' +
      '<button id="clearBtn_' + rk + '"></button><button id="recalcBtn_' + rk + '"></button>' +
      '<button id="refreshBtn_' + rk + '"></button><button id="pickBtn_' + rk + '"></button>'
  );
  return document.getElementById('compHost_' + rk);
}

test('golden: renderRoleAccordion по активным ролям', () => {
  const { gm } = createHost();
  fx.applyBaseState(gm);
  const out = {};
  for (const rk of ['analysis', 'testing', 'devBack', 'devFront']) {
    out[rk] = gm.call('renderRoleAccordion', rk);
  }
  checkJsonSnapshot('role-accordion', out);
});

test('golden: renderRoleComposition — непустой состав (контракт Ring Table)', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  const host = ensureCompHost(document, 'analysis');
  gm.call('renderRoleComposition', 'analysis');
  const table = materializeTable(host);
  assert.ok(table, 'Ring Table contract must be stashed on compHost_analysis');
  checkJsonSnapshot('composition-analysis', table);
});

test('golden: renderRoleComposition — пустой состав (empty-state)', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  gm.set({ _roleItems: Object.assign(fx.buildRoleItems(), { devBack: [] }) });
  const host = ensureCompHost(document, 'devBack');
  gm.call('renderRoleComposition', 'devBack');
  checkHtmlSnapshot('composition-empty-devback', host.innerHTML);
});

test('golden: renderRoleComposition — исторический вид (items из снапшота)', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  gm.set({ _currentSprintId: fx.HIST_SPRINT_ID });
  const host = ensureCompHost(document, 'analysis');
  gm.call('renderRoleComposition', 'analysis');
  const table = materializeTable(host);
  assert.ok(table, 'historical composition must mount Ring Table from history snapshot');
  checkJsonSnapshot('composition-analysis-historical', table);
});
