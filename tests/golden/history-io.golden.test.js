/**
 * Golden-master: экспорт/импорт истории (#27) — характеризация ДО выноса
 * history-io.js (Тир C).
 *
 * _buildHistEnvelope / _anonymizeHistRecords / _preflightHistFile /
 * _histFileStem / exportAllHistoryToJson (download-капча через подмену
 * _triggerJsonDownload) / openImportHistDialog (спек модалки + контракты
 * cancel / replace / merge).
 *
 * Время заморожено → exportedAt и дата файл-стема детерминированы.
 * Формат-маркеры резолвятся из констант монолита через gm.get (НЕ литералами)
 * — тест fork-agnostic, переживает namespace-sed зеркала. pluginVersion
 * нормализуется из снимков (бампается с релизами — не должен ломать golden).
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { createHost } = require('./monolith-host');
const { checkJsonSnapshot } = require('./snap');
const fx = require('./fixtures/state');

function bootHist() {
  const host = createHost();
  fx.applyBaseState(host.gm);
  host.gm.set({
    _currentUser: { login: 'gm_user_editor', fullName: 'GM Editor' },
    _projectDisplayName: 'GM Project',
  });
  return host;
}

/** Спек → снапшот-форма: функции заменяются плейсхолдером (как modal-specs). */
function serializeSpec(spec) {
  return JSON.parse(JSON.stringify(spec, function (k, v) {
    return typeof v === 'function' ? '<fn>' : v;
  }));
}

/** pluginVersion из конверта → флаг семвера (значение бампается с релизами). */
function normEnvelope(env) {
  const copy = JSON.parse(JSON.stringify(env));
  copy.pluginVersion = /^\d+\.\d+\.\d+$/.test(copy.pluginVersion) ? '<semver>' : copy.pluginVersion;
  return copy;
}

test('golden: _buildHistEnvelope — конверт по фикстурной истории (plain + anonymized)', () => {
  const { gm } = bootHist();
  const plain = gm.call('_buildHistEnvelope', gm.get('_history'), false);
  const anon = gm.call('_buildHistEnvelope', gm.get('_history'), true);
  checkJsonSnapshot('hist-envelope', {
    plain: normEnvelope(plain),
    anonymized: normEnvelope(anon),
  });
});

test('golden: _anonymizeHistRecords — вычистка kpe/rate, источник не мутируется', () => {
  const { gm } = bootHist();
  const recs = [
    {
      sprintId: 'gm_anon_1_analysis', name: 'Anon S1',
      settings: {
        kpe: 1.1, rate: 2000,
        rate_analysis: 1500, kpe_testing: 0.9, rate_qa: 1200,
        workdayHours: 8, fieldAnalysis: 'Оценка Анализ',
      },
    },
    { sprintId: 'gm_anon_2_testing', name: 'Anon S2 (без settings)' },
  ];
  const out = gm.call('_anonymizeHistRecords', recs);
  checkJsonSnapshot('hist-anonymize', {
    anonymized: out,
    sourceUntouched: recs[0].settings.kpe === 1.1 && recs[0].settings.rate_analysis === 1500,
  });
});

test('golden: _preflightHistFile — матрица валидации конверта', () => {
  const { gm } = bootHist();
  const own = gm.get('HIST_EXPORT_FORMAT');
  const ver = gm.get('HIST_EXPORT_FORMAT_VER');
  const foreign = gm.get('HIST_ACCEPTED_FORMATS').filter(function (f) { return f !== own; })[0];
  checkJsonSnapshot('hist-preflight', {
    nullData: gm.call('_preflightHistFile', null),
    stringData: gm.call('_preflightHistFile', 'not-an-object'),
    wrongFormat: gm.call('_preflightHistFile', { format: 'alien-format', formatVersion: ver, records: [] }),
    noVersion: gm.call('_preflightHistFile', { format: own, records: [] }),
    newerVersion: gm.call('_preflightHistFile', { format: own, formatVersion: ver + 1, records: [] }),
    noRecords: gm.call('_preflightHistFile', { format: own, formatVersion: ver }),
    ownOk: gm.call('_preflightHistFile', { format: own, formatVersion: ver, records: [] }),
    crossForkOk: gm.call('_preflightHistFile', { format: foreign, formatVersion: ver, records: [] }),
    crossForkDetected: foreign !== own,
  });
});

test('golden: _histFileStem — sanitize имени проекта + frozen-дата (+ дефолт)', () => {
  const { gm } = bootHist();
  gm.set({ _projectDisplayName: 'GM/Project:X*?' });
  const sanitized = gm.call('_histFileStem');
  gm.set({ _projectDisplayName: '' });
  const fallback = gm.call('_histFileStem');
  checkJsonSnapshot('hist-file-stem', { sanitized: sanitized, fallback: fallback });
});

test('golden: exportAllHistoryToJson — download-капча + пустая история', () => {
  const { gm } = bootHist();
  const downloads = [];
  gm.set({
    _triggerJsonDownload: function (obj, fileName) {
      downloads.push({
        fileName: fileName,
        format: obj.format,
        recordCount: obj.records.length,
        anonymized: obj.anonymized,
      });
    },
  });
  gm.call('exportAllHistoryToJson', false);
  gm.call('exportAllHistoryToJson', true);
  const histBackup = gm.get('_history');
  gm.set({ _history: [] });
  gm.call('exportAllHistoryToJson', false); /* пустая история → toast, без download */
  gm.set({ _history: histBackup });
  checkJsonSnapshot('hist-export-download', { downloads: downloads });
});

/** Конверт «чужого» форка для импорт-диалога: cross-fork + cross-instance +
 *  более новая версия плагина + коллизия с существующим baseId фикстуры. */
function buildForeignEnvelope(gm) {
  const own = gm.get('HIST_EXPORT_FORMAT');
  const foreign = gm.get('HIST_ACCEPTED_FORMATS').filter(function (f) { return f !== own; })[0];
  const existingBase = String(gm.get('_history')[0].sprintId).split('_')[0];
  return {
    format: foreign,
    formatVersion: 1,
    pluginVersion: '99.0.0',
    exportedAt: 1780000000000,
    exportedBy: 'ext_user',
    sourceProject: 'EXT Project',
    sourceInstance: 'http://other-instance:9090',
    anonymized: true,
    records: [
      { sprintId: 'ext1_analysis', name: 'Ext Sprint 1', dateStart: 1779000000000 },
      { sprintId: 'ext1_testing', name: 'Ext Sprint 1', dateStart: 1779000000000 },
      { sprintId: existingBase + '_analysis', name: 'Collision Sprint', dateStart: 1778000000000 },
    ],
  };
}

test('golden: openImportHistDialog — невалидный файл → null без модалки', async () => {
  const host = bootHist();
  const res = await host.gm.call('openImportHistDialog', { format: 'alien-format' });
  assert.equal(res, null);
  checkJsonSnapshot('hist-import-invalid', {
    result: res === null ? 'null' : res,
    modalsOpened: host.modalLog.length,
  });
});

test('golden: openImportHistDialog — спек модалки импорта (cross-fork/instance/version/collision)', () => {
  const host = bootHist();
  host.gm.call('openImportHistDialog', buildForeignEnvelope(host.gm));
  assert.equal(host.modalLog.length, 1, 'import dialog must open');
  checkJsonSnapshot('hist-import-dialog-spec', serializeSpec(host.modalLog[0]));
});

test('golden: openImportHistDialog — контракты cancel / replace / merge', async () => {
  /* cancel: onCancel → close-стаб (noop) → ring-закрытие симулируем spec.onClose() */
  const hostC = bootHist();
  const pC = hostC.gm.call('openImportHistDialog', buildForeignEnvelope(hostC.gm));
  const specC = hostC.modalLog[0];
  specC.body.props.onCancel();
  specC.onClose();
  const resCancel = await pC;

  /* replace: пендинг записывается, открывается confirm-модалка (вторая в логе) */
  const hostR = bootHist();
  const pR = hostR.gm.call('openImportHistDialog', buildForeignEnvelope(hostR.gm));
  const specR = hostR.modalLog[0];
  specR.body.props.onReplace();
  specR.onClose();
  const resReplace = await pR;
  const pending = hostR.gm.get('_importHistPending');

  /* merge: _submitHistImport подменяется рекордером (сеть заморожена в хосте) */
  const hostM = bootHist();
  const submitCalls = [];
  hostM.gm.set({
    _submitHistImport: function (sel, mode, fileRecords) {
      submitCalls.push({ sel: sel, mode: mode, fileRecordCount: fileRecords.length });
      return hostM.window.Promise.resolve();
    },
  });
  const pM = hostM.gm.call('openImportHistDialog', buildForeignEnvelope(hostM.gm));
  const specM = hostM.modalLog[0];
  specM.body.props.onSubmit(['ext1'], 'overwrite');
  specM.onClose();
  const resMerge = await pM;

  checkJsonSnapshot('hist-import-dialog-behavior', {
    cancel: { result: resCancel === null ? 'null' : resCancel },
    replace: {
      result: resReplace,
      pendingRecordCount: pending && pending.records ? pending.records.length : null,
      modalsOpened: hostR.modalLog.length,
      secondModalId: hostR.modalLog.length > 1 ? hostR.modalLog[1].id : null,
    },
    merge: { result: resMerge, submitCalls: submitCalls },
  });
});
