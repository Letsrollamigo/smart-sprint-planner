/**
 * Golden-master: Excel-экспорт — AOA-билдеры.
 *
 * XLSX заменён capture-стабом: снимается ровно то, что IIFE передаёт в
 * aoa_to_sheet / book_append_sheet / writeFile (AOA-массивы, имена листов,
 * имя файла). Сама XLSX-запись (vendored mini-build) не характеризуется.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { createHost } = require('./monolith-host');
const { checkJsonSnapshot } = require('./snap');
const fx = require('./fixtures/state');

function installXlsxStub(window) {
  const calls = { sheets: [], appended: [], files: [] };
  window.XLSX = {
    utils: {
      aoa_to_sheet: function (aoa) { calls.sheets.push(aoa); return { __sheet: calls.sheets.length - 1 }; },
      book_new: function () { return { __wb: true }; },
      book_append_sheet: function (wb, ws, name) { calls.appended.push({ sheet: ws.__sheet, name: name }); },
      sheet_add_aoa: function (ws, aoa, opts) { calls.sheets.push(aoa); },
      decode_range: function () { return { s: { c: 0, r: 0 }, e: { c: 0, r: 0 } }; },
      encode_cell: function (c) { return 'A1'; },
    },
    writeFile: function (wb, filename) { calls.files.push(filename); },
  };
  return calls;
}

test('golden: _buildConflictAOA — base vs working с диффом', () => {
  const { gm } = createHost();
  fx.applyBaseState(gm);
  const base = gm.get('_history')[0];
  /* «другая сторона»: меняем alloc и добавляем задачу — дифф обязан подсветиться */
  const other = JSON.parse(JSON.stringify(base));
  other.items[0].alloc_analysis = 720;
  other.items.push({
    issueId: 'GM-H9', title: 'Добавленная в рабочей копии', inclusionStatus: 'INC_PLANNED',
    estimate_analysis: 300, fact_analysis: 0, alloc_analysis: 300,
  });
  const aoaBase = gm.call('_buildConflictAOA', base, other);
  const aoaWorking = gm.call('_buildConflictAOA', other, base);
  checkJsonSnapshot('conflict-aoa', { base: aoaBase, working: aoaWorking });
});

test('golden: exportSprintToExcel — AOA, листы, имя файла', () => {
  const host = createHost();
  fx.applyBaseState(host.gm);
  const calls = installXlsxStub(host.window);
  host.gm.call('exportSprintToExcel', host.gm.get('_history')[0]);
  assert.ok(calls.sheets.length > 0, 'exportSprintToExcel must build at least one AOA sheet');
  checkJsonSnapshot('export-excel', calls);
});
