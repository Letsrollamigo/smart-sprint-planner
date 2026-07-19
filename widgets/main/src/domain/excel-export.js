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
  /* v3.2.1 — PP-канон #49 давно SINGLE-FLAT ({resourcesByAssignee, taskAssignments}),
     а diff-экспорт всё ещё читал keyed-map pp[rk] → ta всегда {} → колонки
     Исполнитель/Старт/Финиш пусты и Δ по ним не помечался (сосед exportSprintToExcel
     читает flat). Legacy keyed-снимки страхуем фолбэком. */
  var pp = (snap && snap.personalPlanning) || null;
  var ppFlat = (pp && pp.taskAssignments) ? pp : ((pp && rk && pp[rk]) ? pp[rk] : null);
  var ta = (ppFlat && ppFlat.taskAssignments) || {};
  /* Зеркальные данные другой стороны для diff-сравнения */
  var otherPP = (otherSnap && otherSnap.personalPlanning) || null;
  var otherPPFlat = (otherPP && otherPP.taskAssignments) ? otherPP : ((otherPP && rk && otherPP[rk]) ? otherPP[rk] : null);
  var otherTA = (otherPPFlat && otherPPFlat.taskAssignments) || {};

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
  var toDateIn = deps.toDateIn;
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
  /* Дата в имени файла — локале-независимый YYYY-MM-DD (toDateIn): fmtDate теперь
     локализован, и для en/zh даёт слэши — path-separator в download-имени. */
  var fileName = (rec.name ? rec.name.replace(/[\\/:*?"<>|]/g, '_') : T('excelSprint').toLowerCase()) + roleSuffix + '_' + toDateIn(rec.dateStart) + '.xlsx';
  XLSX.writeFile(wb, fileName);
  diag('Excel exported: ' + fileName, 'ok');
}

/* #50 S9-EXP-a — экспорт любого отчёта отчётности в XLSX. model = выход
   reporting-export-pure.reportToSheets: { fileStem, title, meta:[[k,v]], sections:[{title,columns,rows}] }.
   Один лист: заголовок + мета + секции (подзаголовок + колонки + строки), разделённые пустой строкой.
   Lazy-load XLSX 1:1 как exportSprintToExcel (первый клик грузит vendored lib, дальше — напрямую). */
function writeReportXlsx(model, deps) {
  var T = deps.t, toast = deps.toast, diag = deps.diag, loadXLSXLib = deps.loadXLSXLib;
  if (typeof XLSX === 'undefined') {
    if (toast) toast((T && T('toastXlsxLoading')) || 'Загружаем XLSX-библиотеку…', 'info');
    loadXLSXLib().then(function () { writeReportXlsx(model, deps); }).catch(function (e) {
      if (diag) diag('XLSX load failed: ' + (e && e.message ? e.message : e), 'err');
      if (toast) toast(T ? T('toastXlsxErr') : 'Ошибка XLSX');
    });
    return;
  }
  var aoa = [], links = [];                              /* v3.9.0 — {r,c,url} линк-ячеек ({v,link} из проектора) */
  function pushRow(cells) {
    var out = [], rIdx = aoa.length;
    for (var ci = 0; ci < cells.length; ci++) {
      var c = cells[ci];
      if (c && typeof c === 'object' && c.link) { links.push({ r: rIdx, c: ci, url: c.link }); out.push(c.v); }
      else out.push(c);
    }
    aoa.push(out);
  }
  if (model.title) aoa.push([model.title]);
  (model.meta || []).forEach(function (m) { aoa.push([m[0], m[1]]); });
  (model.sections || []).forEach(function (sec) {
    aoa.push([]);                                        /* разделитель секций */
    if (sec.title) aoa.push([sec.title]);
    aoa.push(sec.columns || []);
    (sec.rows || []).forEach(function (r) { pushRow(r); });
  });
  var ws = XLSX.utils.aoa_to_sheet(aoa);
  links.forEach(function (lk) {                          /* гиперссылка на ID-ячейке (клик открывает задачу) */
    var addr = XLSX.utils.encode_cell({ r: lk.r, c: lk.c });
    if (ws[addr]) ws[addr].l = { Target: lk.url };
  });
  var wb = XLSX.utils.book_new();
  var sheetName = String(model.title || 'Report').replace(/[\\/:*?"[\]]/g, ' ').slice(0, 31) || 'Report';
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, (model.fileStem || 'report') + '.xlsx');
  if (diag) diag('Report XLSX exported: ' + (model.fileStem || 'report'), 'ok');
}

/* #50 S9-EXP-b — экспорт отчёта в PDF через vendored pdfmake (Roboto с кириллицей по умолчанию).
   Тот же выход reportToSheets, что и XLS: заголовок + мета-таблица (2 колонки) + секции
   (подзаголовок + таблица). Landscape — отчёты широкие. Все ячейки строкой (pdfmake не любит
   голые числа в body). Lazy-load pdfmake 1:1 как writeReportXlsx. */
function writeReportPdf(model, deps) {
  var T = deps.t, toast = deps.toast, diag = deps.diag, loadPdfMakeLib = deps.loadPdfMakeLib;
  if (typeof window === 'undefined' || !window.pdfMake) {
    if (toast) toast((T && T('repExportPdfLoading')) || 'Загружаем PDF-библиотеку…', 'info');
  }
  /* ⚠️ pdfmake 0.2.x регистрирует шрифты во ВНУТРЕННИЙ store (addVirtualFileSystem → приватная
     переменная), а pdfMake.vfs остаётся undefined. Поэтому готовность НЕЛЬЗЯ проверять по PM.vfs
     (это давало бесконечную ре-инъекцию → фриз потока). Гейт готовности = резолв memo-промиса
     loadPdfMakeLib (грузит min→vfs один раз); createPdf сам читает внутренний store. */
  loadPdfMakeLib().then(function () {
    var PM = window.pdfMake;
    if (!PM) { if (diag) diag('pdfMake unavailable after load', 'err'); if (toast) toast(T ? T('repExportPdfErr') : 'Ошибка PDF'); return; }
    /* Астральные символы (эмодзи в названиях задач) — вне cmap вшитого Roboto → .notdef-боксы
       в PDF; вычищаем суррогатные пары (ревью #50). Кириллица в cmap есть — не трогаем. */
    var S = function (v) { return String(v == null ? '' : v).replace(/[\uD800-\uDFFF]/g, ''); };
    var content = [];
    if (model.title) content.push({ text: S(model.title), style: 'h' });
    if ((model.meta || []).length) {
      content.push({ table: { widths: ['auto', '*'], body: (model.meta || []).map(function (m) { return [{ text: S(m[0]), bold: true }, S(m[1])]; }) }, layout: 'noBorders', margin: [0, 2, 0, 8], fontSize: 9 });
    }
    (model.sections || []).forEach(function (sec) {
      if (sec.title) content.push({ text: S(sec.title), style: 'sh' });
      var head = (sec.columns || []).map(function (c) { return { text: S(c), bold: true, fillColor: '#eef0f3' }; });
      /* v3.9.0 — линк-ячейка {v,link} из проектора → кликабельный ID (pdfmake link-атрибут). */
      var body = [head].concat((sec.rows || []).map(function (r) {
        return (r || []).map(function (c) {
          if (c && typeof c === 'object' && c.link) return { text: S(c.v), link: c.link, color: '#2b6cb0', decoration: 'underline' };
          return S(c);
        });
      }));
      /* ревью #50: без widths auto-таблица шире страницы РИСУЕТСЯ за правое поле и обрезается
         (pdfmake не сжимает auto ниже длиннейшего слова). Широкие секции (B0 месяц×системы,
         A3 роли) — равные '*' (перенос по словам внутри колонки); узкие ≤4 — auto (компактнее). */
      var tbl = { headerRows: 1, body: body };
      var colsN = (sec.columns || []).length;
      if (colsN >= 5) { tbl.widths = []; for (var wi = 0; wi < colsN; wi++) tbl.widths.push('*'); }
      content.push({ table: tbl, layout: 'lightHorizontalLines', margin: [0, 2, 0, 10], fontSize: 9 });
    });
    var dd = {
      content: content,
      defaultStyle: { fontSize: 10 },
      styles: { h: { fontSize: 15, bold: true, margin: [0, 0, 0, 6] }, sh: { fontSize: 12, bold: true, margin: [0, 6, 0, 3] } },
      pageMargins: [26, 26, 26, 26], pageOrientation: 'landscape',
    };
    PM.createPdf(dd).download((model.fileStem || 'report') + '.pdf');
    if (diag) diag('Report PDF exported: ' + (model.fileStem || 'report'), 'ok');
  }).catch(function (e) {
    if (diag) diag('pdfmake export failed: ' + (e && e.message ? e.message : e), 'err');
    if (toast) toast(T ? T('repExportPdfErr') : 'Ошибка PDF');
  });
}

const api = { buildConflictAOA, exportSprintToExcel, writeReportXlsx, writeReportPdf };

if (typeof window !== 'undefined') {
  try { window.__SSP_EXCEL_EXPORT = api; } catch (_) { /* sandboxed write may throw */ }
}

module.exports = api;
