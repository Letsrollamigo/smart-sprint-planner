'use strict';
// History export/import cluster (#27) extracted from widgets/main/src/legacy-monolith.js (Tier C).
// Browser bridge: window.__SSP_HISTORY_IO. Golden-tested in
// tests/golden/history-io.golden.test.js (envelope, anonymize, preflight matrix,
// file stem, download capture, import dialog spec + cancel/replace/merge contracts).
//
// Faithful extraction — bodies mirror the IIFE originals 1:1. The monolith keeps thin
// delegators (building deps per call via _histIoDeps), so call-sites and hoisting stay
// unchanged. Format markers HIST_* stay in the monolith and are injected: their values
// intentionally differ between forks (cross-fork import acceptance). Injected deps:
//   t, toast, diag                          — i18n/UI services of the monolith
//   fmtDate, fmtDT                          — date formatters
//   histExportFormat / FormatVer / AcceptedFormats, appVersion — envelope markers
//   projectDisplayName, ctx, currentUser, history — live state references at call time
//   openModal, triggerJsonDownload          — UI/IO services
//   submitHistImport, openImportReplaceConfirm — import continuations
//   setImportHistPending                    — state-mutation callback (_importHistPending)
// YTApp stays a global (host API) — exactly as in the monolith.

function _anonymizeHistRecords(records) {
  return records.map(function(rec) {
    var r = JSON.parse(JSON.stringify(rec));
    if (r.settings) {
      delete r.settings.kpe; delete r.settings.rate;
      ['analysis','development','testing','devops','analytics','management','design','qa','support'].forEach(function(rk){
        if (r.settings['rate_' + rk] !== undefined) delete r.settings['rate_' + rk];
        if (r.settings['kpe_'  + rk] !== undefined) delete r.settings['kpe_'  + rk];
      });
    }
    return r;
  });
}

function _buildHistEnvelope(records, anonymize, deps) {
  var recs = anonymize ? _anonymizeHistRecords(records) : records;
  var su   = (typeof YTApp !== 'undefined' && YTApp.serverUrl) ? YTApp.serverUrl : '';
  var proj = deps.projectDisplayName || (deps.ctx && deps.ctx.project && (deps.ctx.project.shortName || deps.ctx.project.id)) || '';
  return {
    format:        deps.histExportFormat,
    formatVersion: deps.histExportFormatVer,
    pluginVersion: deps.appVersion,
    exportedAt:    Date.now(),
    exportedBy:    (deps.currentUser && deps.currentUser.login) || '',
    sourceProject: proj,
    sourceInstance: su,
    anonymized:    !!anonymize,
    records:       recs
  };
}

function _histFileStem(deps) {
  var proj = (deps.projectDisplayName || 'project').replace(/[\\/:*?"<>|]/g, '_');
  var d    = new Date(); var ds = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  return 'ssp-history_' + proj + '_' + ds;
}

/* Экспорт всей истории */
function exportAllHistoryToJson(anonymize, deps) {
  var T = deps.t, toast = deps.toast, diag = deps.diag;
  if (!deps.history || !deps.history.length) { toast(T('emptyHistory') || 'Нет истории', 'warn'); return; }
  var env = _buildHistEnvelope(deps.history, anonymize, deps);
  deps.triggerJsonDownload(env, _histFileStem(deps) + '.json');
  toast(T('toastHistExported') || 'История экспортирована', 'success');
  diag('JSON history exported: ' + deps.history.length + ' records', 'ok');
}

/* ── Preflight-валидация конверта ── */
function _preflightHistFile(data, deps) {
  if (!data || typeof data !== 'object') return { ok: false, reason: 'not_object' };
  if (deps.histAcceptedFormats.indexOf(data.format) < 0) return { ok: false, reason: 'wrong_format' };
  if (!data.formatVersion || data.formatVersion > deps.histExportFormatVer) return { ok: false, reason: 'unsupported_version' };
  if (!Array.isArray(data.records)) return { ok: false, reason: 'no_records' };
  return { ok: true };
}

/* ── Диалог импорта (Promise-based) ── */
function openImportHistDialog(data, deps) {
  var T = deps.t, toast = deps.toast, fmtDate = deps.fmtDate, fmtDT = deps.fmtDT;
  return new Promise(function(resolve) {
    var pf = _preflightHistFile(data, deps);
    if (!pf.ok) {
      toast(T('toastHistImportInvalid') || 'Файл не является историей спринтов', 'err');
      resolve(null); return;
    }
    var records = data.records;
    if (!records.length) {
      toast(T('importHistEmpty') || 'Нет записей для импорта', 'warn');
      resolve(null); return;
    }

    // Существующие базовые sprintId
    var existingBaseIds = {};
    (deps.history || []).forEach(function(h){ if (h && h.sprintId) existingBaseIds[String(h.sprintId).split('_')[0]] = true; });

    // Группируем записи файла по базовому sprintId
    var groups = {}; // baseId → { baseId, name, dateStart, roleCount, hasCollision }
    records.forEach(function(r) {
      if (!r || !r.sprintId) return;
      var base = String(r.sprintId).split('_')[0];
      if (!groups[base]) groups[base] = { baseId: base, name: r.name || base, dateStart: r.dateStart, roleCount: 0, hasCollision: !!existingBaseIds[base] };
      groups[base].roleCount++;
    });
    var groupList = Object.keys(groups).map(function(k){ return groups[k]; });

    // Cross-fork и cross-instance флаги
    var isCrossFork     = data.format !== deps.histExportFormat;
    var su              = (typeof YTApp !== 'undefined' && YTApp.serverUrl) ? YTApp.serverUrl : '';
    var isCrossInstance = !!(data.sourceInstance && su && data.sourceInstance !== su);
    var isVersionNewer  = !!(data.pluginVersion && data.pluginVersion > deps.appVersion);

    if (!window.__SSP_RING_MODAL) { resolve(null); return; }

    // Info-строки (label/value) — рендерятся компонентом importHistForm
    var infoRows = [];
    if (data.sourceProject)  infoRows.push({ label: T('importHistProject'),    value: data.sourceProject, bold: true });
    if (data.sourceInstance) infoRows.push({ label: T('importHistInstance'),   value: data.sourceInstance });
    if (data.exportedAt)     infoRows.push({ label: T('importHistExportedAt'), value: fmtDT(data.exportedAt) });
    if (data.pluginVersion)  infoRows.push({ label: T('importHistPluginVer'),  value: data.pluginVersion });
    infoRows.push({ label: T('importHistSprintsLabel'), value: String(groupList.length) });

    // Предупреждения (cross-fork / cross-instance / более новая версия)
    var warnings = [];
    if (isCrossFork)     warnings.push({ text: (T('importHistCrossFork') || '').replace('{fork}', data.format), color: 'var(--primary,#0d6efd)' });
    if (isCrossInstance) warnings.push({ text: T('importHistCrossInstance') || '', color: 'var(--warn-text,#b36800)' });
    if (isVersionNewer)  warnings.push({ text: (T('importHistVersionWarn') || '').replace('{v}', data.pluginVersion), color: 'var(--warn-text,#b36800)' });

    /* Phase 3 #32 — мигрировано на openModal() (bespoke importHistForm, настоящий React).
       Чекбоксы выбора спринтов — обычный React-стейт (НЕ Ring Table → нет mousedown-проблемы
       B11/B12). Promise-контракт сохранён: {action:'merge'} / {action:'replace'} / null. */
    var decided = null;  // null=отмена; {action:'merge',sel,mode} / {action:'replace'}
    var h = deps.openModal({
      id: 'importHist',
      type: 'form',
      title: T('importHistTitle'),
      body: { kind: 'component', name: 'importHistForm', props: {
        infoRows: infoRows,
        anonText: data.anonymized ? ('🔒 ' + (T('importHistAnonBadge') || '')) : '',
        warnings: warnings,
        groups: groupList.map(function(g){
          return { baseId: g.baseId, name: g.name, dateText: g.dateStart ? fmtDate(g.dateStart) : '', collision: !!g.hasCollision };
        }),
        labels: {
          collisionBadge: T('importHistCollisionBadge') || 'дубль',
          modeLabel:      T('importHistModeLabel')      || 'При совпадении sprintId:',
          modeSkip:       T('importHistModeSkip')       || 'Пропустить дубли',
          modeOverwrite:  T('importHistModeOverwrite')  || 'Перезаписать дубли',
          replaceText:    T('btnImportReplace')         || 'Полное восстановление…',
          replaceTitle:   T('btnImportReplaceTitle')    || '',
          cancelText:     T('btnCancel')                || 'Отмена',
          submitText:     T('btnImport')                || 'Импортировать',
        },
        onSubmit:  function(sel, mode){ decided = { action: 'merge', sel: sel, mode: mode }; h.close(); },
        onReplace: function(){ decided = { action: 'replace' }; h.close(); },
        onCancel:  function(){ decided = null; h.close(); },
      }},
      buttons: [],
      dismissOnBackdrop: true,
      blockEscape: false,
      showCloseButton: true,
      onClose: function(){
        if (!decided) { resolve(null); return; }
        if (decided.action === 'merge') {
          deps.submitHistImport(decided.sel, decided.mode, records)
            .then(function(){ resolve({ action: 'merge' }); })
            .catch(function(){ resolve({ action: 'merge' }); });
        } else {
          deps.setImportHistPending({ records: records });
          resolve({ action: 'replace' });
          deps.openImportReplaceConfirm();
        }
      },
    });
  });
}

const api = {
  _anonymizeHistRecords,
  _buildHistEnvelope,
  _histFileStem,
  exportAllHistoryToJson,
  _preflightHistFile,
  openImportHistDialog,
};

if (typeof window !== 'undefined') {
  try { window.__SSP_HISTORY_IO = api; } catch (_) { /* sandboxed write may throw */ }
}

module.exports = api;
