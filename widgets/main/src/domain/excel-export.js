'use strict';
// Excel-export AOA builders extracted from widgets/main/src/core.js (Tier B).
// Browser bridge: window.__SSP_EXCEL_EXPORT. Golden-tested in
// tests/golden/excel.golden.test.js (XLSX capture stub: AOA sheets, sheet names, file name).
//
// Faithful extraction — bodies mirror the IIFE originals 1:1, with one deliberate
// deviation: the lazy-XLSX recursion in exportSprintToExcel re-passes `deps`.
// The monolith keeps thin delegators (building deps per call via _excelDeps), so
// call-sites and hoisting stay unchanged. Injected deps:
//   t, toast, diag, loadXLSXLib — i18n/UI/IO services of the monolith
//   allRoles, activeInc — live role config references at call time
//   fmtDate, fmtDT, fmtPeriod, fmtHours, dispEnum, statusLabel, incLabel, roleLabel
// XLSX stays a global (vendored lib, lazy-loaded) — exactly as in the monolith.

/* v5.7.0 — KL#5 v5.3.0 (D48 уточнённый): один xlsx с двумя листами «Текущий снимок» /
   «Ваша рабочая копия» + diff-маркер в отдельной колонке. Background-fill в SheetJS
   community edition не поддерживается на запись (требует xlsx-js-style fork),
   поэтому используем текстовый маркер «Δ» в первой колонке и легенду в meta. */
function buildConflictAOA(snap, otherSnap, deps) {
  var T = deps.t, ALL_ROLES = deps.allRoles;
  var fmtDate = deps.fmtDate, statusLabel = deps.statusLabel, incLabel = deps.incLabel, roleLabel = deps.roleLabel;
  var rk = snap && snap.roleKey;
  var role = rk ? ALL_ROLES.find(function(r){ return r.key === rk; }) : null;
  var roleName = role ? roleLabel(role) : (rk || '—');
  var pp = (snap && snap.personalPlanning) || null;
  var ppRole = (pp && rk && pp[rk]) ? pp[rk] : null;
  var ta = (ppRole && ppRole.taskAssignments) || {};
  /* Зеркальные данные другой стороны для diff-сравнения */
  var otherPP = (otherSnap && otherSnap.personalPlanning) || null;
  var otherPPRole = (otherPP && rk && otherPP[rk]) ? otherPP[rk] : null;
  var otherTA = (otherPPRole && otherPPRole.taskAssignments) || {};

  var meta = [
    [T('excelSprintName'),      snap && snap.name || '—'],
    [T('excelRole'),            roleName],
    [T('excelPeriod'),          (snap && snap.dateStart ? fmtDate(snap.dateStart) : '—') + ' — ' + (snap && snap.dateEnd ? fmtDate(snap.dateEnd) : '—')],
    [T('excelStatus'),          (snap && snap.status) ? statusLabel(snap.status) : '—'],
    [T('excelDiffHighlightLegend')], /* строка-легенда */
    []
  ];
  /* v6.1.0 D78 (F1, OQ76 default) — добавлены Факт и Ресурс для consistency с основным экспортом. */
  var header = ['Δ', T('excelColId'), T('excelColTitle'), T('excelColInclusion'),
                T('excelColEstimate'), T('excelColFact'), T('excelColResource'), T('excelColAlloc'),
                T('excelColAssignee'), T('excelColStartDate') || 'Старт', T('excelColEndDate') || 'Финиш'];
  function minToH(m){ return m != null ? Math.round(m/60*100)/100 : ''; }
  function tsToD(ts){ return ts ? fmtDate(ts) : ''; }
  var items = (snap && snap.items) || [];
  var rows = items.map(function(item) {
    var iid = item.issueId || '';
    var taE = ta[iid] || {};
    var oE  = otherTA[iid] || {};
    /* Сравниваем ключевые поля: estimate, alloc, inclusion, assignee, dates.
       Если хоть одно отличается — Δ. Также сравниваем сам факт наличия item у второй стороны. */
    var otherItem = (otherSnap && otherSnap.items) ? otherSnap.items.find(function(x){ return x && x.issueId === iid; }) : null;
    var diffParts = [];
    if (!otherItem) diffParts.push('item');
    else {
      if ((item['estimate_'+rk]||0) !== (otherItem['estimate_'+rk]||0)) diffParts.push('est');
      if ((item['alloc_'+rk]) !== (otherItem['alloc_'+rk])) diffParts.push('alloc');
      if ((item.inclusionStatus||'') !== (otherItem.inclusionStatus||'')) diffParts.push('incl');
    }
    if ((taE.assignee||'') !== (oE.assignee||'')) diffParts.push('assignee');
    if ((taE.dateStart||0) !== (oE.dateStart||0)) diffParts.push('start');
    if ((taE.dateEnd||0)   !== (oE.dateEnd||0))   diffParts.push('end');
    var diff = diffParts.length ? ('Δ ' + diffParts.join(',')) : '';
    var resourceMin = Math.max(0, (item['estimate_'+rk]||0) - (item['fact_'+rk]||0));
    var allocRaw = item['alloc_'+rk];
    var allocMin = (allocRaw !== null && allocRaw !== undefined) ? allocRaw : resourceMin;
    return [
      diff,
      iid,
      item.title || '',
      item.inclusionStatus ? incLabel(item.inclusionStatus) : '',
      minToH(item['estimate_'+rk]),
      minToH(item['fact_'+rk]),
      minToH(resourceMin),
      minToH(allocMin),
      taE.assigneeName || taE.assignee || '',
      tsToD(taE.dateStart),
      tsToD(taE.dateEnd)
    ];
  });
  /* Также добавим строки для items, которые есть только в other (orphan на этой стороне) */
  var ourIds = {};
  items.forEach(function(it){ if (it && it.issueId) ourIds[it.issueId] = true; });
  var otherItems = (otherSnap && otherSnap.items) || [];
  otherItems.forEach(function(it){
    if (!it || !it.issueId) return;
    if (ourIds[it.issueId]) return;
    rows.push(['Δ missing', it.issueId, it.title || '', '', '', '', '', '', '', '', '']);
  });
  return meta.concat([header]).concat(rows);
}

function exportSprintToExcel(rec, deps) {
  var T = deps.t, toast = deps.toast, diag = deps.diag, loadXLSXLib = deps.loadXLSXLib;
  var ALL_ROLES = deps.allRoles, ACTIVE_INC = deps.activeInc;
  var fmtDate = deps.fmtDate, fmtDT = deps.fmtDT, fmtPeriod = deps.fmtPeriod, fmtHours = deps.fmtHours;
  var statusLabel = deps.statusLabel, roleLabel = deps.roleLabel, incLabel = deps.incLabel, dispEnum = deps.dispEnum;
  /* Lazy load — если ещё не загружен, грузим, потом рекурсивно вызываем себя */
  if (typeof XLSX === 'undefined') {
    toast(T('toastXlsxLoading') || 'Загружаем XLSX-библиотеку…', 'info');
    loadXLSXLib().then(function(){
      exportSprintToExcel(rec, deps);
    }).catch(function(e){
      diag('XLSX load failed: '+(e&&e.message?e.message:e),'err');
      toast(T('toastXlsxErr'));
    });
    return;
  }
  var rk   = rec.roleKey;
  var role = ALL_ROLES.find(function(r){ return r.key === rk; });

  var meta = [
    [T('excelSprintName'), rec.name || '—'],
    [T('excelRole'), rec.roleLabel || rk],
    [T('excelPeriod'), fmtDate(rec.dateStart) + ' — ' + fmtDate(rec.dateEnd)],
    [T('excelStatus'), rec.status ? statusLabel(rec.status) : '—'],
    [T('currentRoleConfirmedAt'), (rec.confirmedBy || '—') + ' · ' + fmtDT(rec.confirmedAt)],
    [T('excelQtyTasks'), rec.items ? rec.items.length : 0],
    []
  ];
  if (role) {
    meta.push([T('excelResource') + ' ' + roleLabel(role), fmtPeriod(rec[role.resKey] || 0), T('excelRemain'), fmtHours(rec[role.remKey] !== undefined ? rec[role.remKey] : 0)]);
  }
  if (rec.sprintFieldVal)  meta.push([T('excelSprint'), rec.sprintFieldVal]);
  if (rec.versionFieldVal) meta.push([T('excelVersion'), rec.versionFieldVal]);
  meta.push([]);

  var roleSuffixHdr = ' ' + (role ? roleLabel(role) : rk) + ' (ч)';
  /* v5.5.0 — Этап 3e: условная колонка «Ответственный по задаче» при наличии
     personal-распределения хотя бы по одной задаче этой роли. Multi-assignee — через запятую.
     Спринты без personal распределения экспортируются как раньше (regression-safe). */
  var ppTaskAssignments = (rec.personalPlanning && rec.personalPlanning.taskAssignments) || {};
  var hasAssignees = Object.keys(ppTaskAssignments).some(function(id){
    var ta = ppTaskAssignments[id];
    if (!ta) return false;
    if (Array.isArray(ta)) return ta.some(function(x){ return x && x.assignee; });
    return !!ta.assignee;
  });
  function _formatAssigneeCell(item) {
    var ta = ppTaskAssignments[item.issueId];
    if (!ta) return '';
    if (Array.isArray(ta)) {
      var names = ta.filter(function(x){ return x && x.assignee; })
                    .map(function(x){ return x.assigneeName || x.assignee; });
      return names.join(', ');
    }
    return ta.assigneeName || ta.assignee || '';
  }
  /* v6.1.0 D78 (F1) — добавлена колонка «Факт» между Estimate и Resource. */
  var header = [T('excelColId'), T('excelColTitle'), T('excelColSystem'), T('excelColPriority'), T('excelColXpriority'), T('excelColState'), T('excelColInclusion'),
    T('excelColEstimate') + roleSuffixHdr,
    T('excelColFact')     + roleSuffixHdr,
    T('excelColResource') + roleSuffixHdr,
    T('excelColAlloc')    + roleSuffixHdr];
  if (hasAssignees) header.push(T('excelColAssignee'));
  header.push(T('excelColLink'));

  function minToH(m) { return m != null ? Math.round(m / 60 * 100) / 100 : ''; }

  var rows = (rec.items || []).map(function(item) {
    var est  = item['estimate_' + rk] || 0;
    var fact = item['fact_'     + rk] || 0;
    var resourceMin = Math.max(0, est - fact);
    var allocRaw    = item['alloc_' + rk];
    var allocMin    = (allocRaw !== null && allocRaw !== undefined) ? allocRaw : resourceMin;
    var row = [
      item.issueId  || '',
      item.title    || '',
      item.system   || '',
      dispEnum(item.priority) || '',
      dispEnum(item.xpriority) || '',
      dispEnum(item.state)    || '',
      item.inclusionStatus ? incLabel(item.inclusionStatus) : '',
      minToH(item['estimate_' + rk]),
      minToH(item['fact_'     + rk]),
      minToH(resourceMin),
      minToH(allocMin)
    ];
    if (hasAssignees) row.push(_formatAssigneeCell(item));
    row.push(item.url || '');
    return row;
  });

  var _activeSnap = (rec.items || []).filter(function(i){ return ACTIVE_INC.indexOf(i.inclusionStatus) >= 0; });
  var totalsBase = ['', T('excelTotal'), '', '', '', '', '',
    Math.round(_activeSnap.reduce(function(s, i) { return s + (i['estimate_' + rk] || 0); }, 0) / 60 * 100) / 100,
    /* v6.1.0 D78 (F1) — итог по колонке «Факт». */
    Math.round(_activeSnap.reduce(function(s, i) { return s + (i['fact_' + rk] || 0); }, 0) / 60 * 100) / 100,
    Math.round(_activeSnap.reduce(function(s, i) {
      var est  = i['estimate_' + rk] || 0;
      var fact = i['fact_'     + rk] || 0;
      return s + Math.max(0, est - fact);
    }, 0) / 60 * 100) / 100,
    Math.round(_activeSnap.reduce(function(s, i) {
      var est  = i['estimate_' + rk] || 0;
      var fact = i['fact_'     + rk] || 0;
      var raw  = i['alloc_'    + rk];
      var resMin = Math.max(0, est - fact);
      return s + ((raw !== null && raw !== undefined) ? raw : resMin);
    }, 0) / 60 * 100) / 100
  ];
  if (hasAssignees) totalsBase.push('');
  totalsBase.push('');
  var totals = totalsBase;

  var wsData = meta.concat([header]).concat(rows).concat([totals]);
  var ws = XLSX.utils.aoa_to_sheet(wsData);
  /* v6.1.0 D78 (F1) — +1 колонка ширины (Факт). */
  var cols = [{wch:16},{wch:50},{wch:16},{wch:14},{wch:20},{wch:16},{wch:20},{wch:14},{wch:14},{wch:14},{wch:14}];
  if (hasAssignees) cols.push({wch:24});
  cols.push({wch:40});
  ws['!cols'] = cols;

  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, T('excelSprint'));
  var roleSuffix = role ? ('_' + roleLabel(role).replace(/\s+/g, '_').replace(/[\\/:*?"<>|]/g, '')) : '';
  var fileName = (rec.name ? rec.name.replace(/[\\/:*?"<>|]/g, '_') : T('excelSprint').toLowerCase()) + roleSuffix + '_' + fmtDate(rec.dateStart).replace(/\./g, '-') + '.xlsx';
  XLSX.writeFile(wb, fileName);
  diag('Excel exported: ' + fileName, 'ok');
}

const api = { buildConflictAOA, exportSprintToExcel };

if (typeof window !== 'undefined') {
  try { window.__SSP_EXCEL_EXPORT = api; } catch (_) { /* sandboxed write may throw */ }
}

module.exports = api;
