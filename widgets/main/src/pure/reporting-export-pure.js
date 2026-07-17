/* reporting-export-pure.js — #50 S9. Чистый проектор «отчёт → секции» для экспорта (Excel/PDF).

   Читает ФИНАЛЬНЫЙ vm отчёта (те же данные, что рендерит react/reporting-view.jsx) и его лейблы
   (vm.labels — те же i18n-ключи, что колонки на экране) → нейтральную табличную модель
   { fileStem, title, meta, sections }. Формат-агностичен: XLS-писатель (excel-export.js) и
   PDF-писатель (pdfmake, S9-EXP-b) потребляют ОДИН и тот же выход — табличная проекция пишется
   один раз на отчёт.

   Контракт «снимок точки во времени» (US-EXP-03): meta несёт проект / период(или «снимок») /
   отбор / дату генерации. Модуль отчёт НЕ хранит.

   Числа = числа (часы = минуты/60 округл. до 0.01; % целые; дни/счётчики как есть) — дружелюбно
   к сводным/BI (US-EXP «мост в BI»); Excel сам форматирует по локали → уходит и разнобой
   точка/запятая. Даты/лейблы = строки (форматтер виджета передаётся, чтобы совпадало с UI).

   deps: { fmtDate(ts)->str, nowTs:number }  (fmtDate — тот же, что в reporting-view; nowTs — live).
   Leaf-слой (pure): читает только vm + deps, без domain/data-мостов. */
'use strict';

/* минуты → часы (число, 2 знака) | '' если нет значения */
function _h(min) { return (min == null || isNaN(min)) ? '' : Math.round(min / 60 * 100) / 100; }
/* доля [0..1] → целые % */
function _pf(frac) { return Math.round((Number(frac) || 0) * 100); }
/* знаковый % (уже в процентах) → целое | '' */
function _ps(v) { return (v == null || isNaN(v)) ? '' : Math.round(v); }
/* уровень светофора → слово-флаг (как бейдж на экране); none → '' */
function _flag(level, L) {
  return level === 'over' ? L.flagOver : level === 'warn' ? L.flagWarn : level === 'ok' ? L.flagOk : '';
}
function _round1(v) { return (v == null || isNaN(v)) ? '' : Math.round(v * 10) / 10; }
/* whitelist-санитайзер имени файла: только безопасные символы (кавычки в char-class ломают
   string-стриппер arch-детектора stateLocalization — намеренно избегаем). Кириллица разрешена
   (ревью #50): ключ YT-проекта валидируется denylist'ом, кириллический ключ легален — иначе
   все выгрузки таких проектов схлопывались в безликий 'report'. */
function _san(s) { return String(s == null ? '' : s).replace(/[^A-Za-z0-9_А-яЁё-]+/g, '_').replace(/^_+|_+$/g, ''); }
function _ymd(ts) {
  var d = new Date(ts), p = function (n) { return (n < 10 ? '0' : '') + n; };
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
}

/* оконные отчёты (период = селектор популяции) — ЗЕРКАЛО Chrome.isWindowed (reporting-view.jsx):
   A1/A2/Поток/A4/A5/B3 «1000 мелочей»/B2 «Налог на баги». B1 Техдолг — снимок (не здесь). */
var _WINDOWED = { a1: 1, a2: 1, flow: 1, a4: 1, a5: 1, b3: 1, b2: 1 };

/* период → человекочитаемая строка для meta (пресет/год/свой диапазон), как в Chrome. */
function _scopeText(vm, L) {
  var p = vm.period, po = vm.periodOpts || {}, per = L.period || {};
  if (p === 'custom') return (po.from || '?') + ' — ' + (po.to || '?');
  if (p === 'calendarYear') return (per.calendarYear || 'calendarYear') + (po.year ? ' ' + po.year : '');
  return per[p] || p || '—';
}

/* A10 «период» = выбранный закрытый спринт N (сравнение с N+1) — резолвим spillSprint→label. */
function _sprintLabel(vm) {
  var sel = vm.spillSprint, list = vm.sprints || [];
  for (var i = 0; i < list.length; i++) { if (list[i] && String(list[i].key) === String(sel)) return list[i].label || String(sel); }
  return sel ? String(sel) : '—';
}

/* заголовок отчёта (тот же, что <h2> вью). */
function _reportTitle(report, L) {
  var m = { a1: L.a1Title, a2: L.a2Title, a3: L.a3Title, a6: L.a6Title, a10: L.a10Title,
    flow: L.flowTitle, a4: L.a4Title, a5: L.a5Title, b3: L.b3Title, b2: L.b2Title, b1: L.b1Title, b0: L.b0Title };
  return m[report] || L.a7Title;
}

function _section(title, columns, rows) { return { title: title || '', columns: columns, rows: rows }; }

/* v3.9.0 — ID-ячейка: при известном ytBase — линк-объект { v, link } (XLS-писатель ставит
   гиперссылку, PDF — link-атрибут); иначе — просто строка (форма старых выгрузок не меняется). */
function _idCell(vm, id) {
  return vm.ytBase ? { v: id, link: String(vm.ytBase) + '/issue/' + id } : id;
}

/* per-report проекция: → { sections:[…], extraMeta:[[k,v],…] } */
function _projectReport(vm, L, deps) {
  var report = vm.report, rows = vm.rows || [];
  var roleLabels = vm.roleLabels || {};
  var fmtDate = deps.fmtDate || function (ts) { return String(ts); };

  if (report === 'a7') {
    var a7c = [L.colId, L.colTask, L.colStatus, L.colDays, L.colFlag];
    if (vm.hasSystem) a7c.push(L.colSystem);              /* v3.9.0 — колонка «Система» по тумблеру */
    return { sections: [_section('', a7c,
      rows.map(function (r) {
        var row = [_idCell(vm, r.id), r.summary, r.state, r.days, _flag(r.level, L)];
        if (vm.hasSystem) row.push(r.system || '');
        return row;
      }))] };
  }
  if (report === 'a1') {
    var a1c = [L.colId, L.colTask, L.colEnteredStatus, L.colEnteredDate, L.colLabel];
    if (vm.hasSystem) a1c.push(L.colSystem);              /* v3.9.0 — колонка «Система» по тумблеру */
    return { sections: [_section('', a1c,
      rows.map(function (r) {
        var row = [_idCell(vm, r.id), r.summary, r.state, fmtDate(r.enteredAt), r.label];
        if (vm.hasSystem) row.push(r.system || '');
        return row;
      }))] };
  }
  if (report === 'a2') {
    var typeRows = vm.typeRows || [], tiles = vm.tiles || [], buckets = vm.buckets || {};
    var byM = {}; tiles.forEach(function (t) { byM[t.metric] = t; });
    var typeSec = _section('', [L.colUnitType, L.colCount, L.metricLead, L.metricTeam, L.metricCycle],
      typeRows.map(function (r) { return [r.unitType === 'epic' ? L.unitEpic : L.unitStory, r.count, r.lead, r.team, r.cycle]; }));
    var lt = byM.lead, tt = byM.team, ct = byM.cycle;
    typeSec.rows.push([L.exportTotal, lt ? lt.n : '', lt ? lt.median : '', tt ? tt.median : '', ct ? ct.median : '']);
    var bucketSec = _section(L.bucketTitle, ['', L.colCount],
      [[L.bucketLe40, buckets.le40 || 0], [L.bucketMid, buckets.mid || 0], [L.bucketGt120, buckets.gt120 || 0]]);
    return { sections: [typeSec, bucketSec] };
  }
  if (report === 'a3') {
    var snapRoles = vm.snapRoles || [], snapCols = vm.snapCols || {};
    var a3cols = function () {
      var c = [L.colId, L.a3ColUnit];
      if (snapCols.stage) c.push(L.a3ColStage);
      snapRoles.forEach(function (r) { c.push(L.a3EstPrefix + ' ' + r.label); });
      if (snapCols.org) c.push(L.a3ColOrg);
      if (snapCols.priority) c.push(L.a3ColPriority);
      if (vm.hasSystem) c.push(L.colSystem);              /* v3.9.0 — колонка «Система» по тумблеру */
      return c;
    };
    var a3rows = function (mode) {
      return rows.filter(function (r) { return r.mode === mode; }).map(function (r) {
        var row = [_idCell(vm, r.id), r.summary];
        if (snapCols.stage) row.push(r.stage || '');
        snapRoles.forEach(function (rr) { row.push(r.est && r.est[rr.key] != null ? _h(r.est[rr.key]) : ''); });
        if (snapCols.org) row.push(r.org || '');
        if (snapCols.priority) row.push(r.priority || '');
        if (vm.hasSystem) row.push(r.system || '');
        return row;
      });
    };
    return { sections: [_section(L.a3ModeWip, a3cols(), a3rows('wip')),
      _section(L.a3ModeDone, a3cols(), a3rows('done'))] };
  }
  if (report === 'a4') {
    var roleOf = function (rk) { return rk ? (roleLabels[rk] || rk) : L.a4RoleNone; };
    var work = _section('', [L.a4ColPerson, L.a4ColRole, L.a4ColHours, L.a4ColDays],
      (vm.workloadRows || []).map(function (r) { return [r.author, roleOf(r.roleKey), _h(r.minutes), r.days]; }));
    var secs = [work];
    if ((vm.noLog || []).length) {
      secs.push(_section(L.a4NoLogTitle, [L.a4ColPerson, L.a4ColRole],
        vm.noLog.map(function (n) { return [n.author, roleOf(n.roleKey)]; })));
    }
    return { sections: secs, extraMeta: [[L.a4Total, _h(vm.totalMinutes)], [L.a4ColPerson, vm.authorCount || 0]] };
  }
  if (report === 'a5') {
    var rollups = (vm.rollups || []).filter(function (r) { return (r.taskCount || 0) > 0; });
    var roleSec = _section(L.a5MetricSuffix, [L.a4ColRole, L.a5ColVar, L.colCount],
      rollups.map(function (r) { return [r.label, _ps(r.avgVariancePct), r.taskCount || 0]; }));
    var a5c = [L.colId, L.colTask, L.a4ColRole, L.a5ColEst, L.a5ColFact, L.a5ColVar];
    if (vm.hasSystem) a5c.push(L.colSystem);              /* v3.9.0 — колонка «Система» по тумблеру */
    var taskSec = _section('', a5c,
      rows.map(function (r) {
        var row = [_idCell(vm, r.id), r.summary, r.roleLabel, _h(r.asOfMin), _h(r.factMin), _ps(r.variancePct)];
        if (vm.hasSystem) row.push(r.system || '');
        return row;
      }));
    return { sections: [roleSec, taskSec] };
  }
  if (report === 'a6') {
    return { sections: [_section('', [L.a4ColRole, L.a6ColTasks, L.a6ColSum, L.a6ColCapacity, L.a6ColMonths],
      rows.map(function (r) { return [r.label, r.taskCount, _h(r.sumMinutes), _round1(r.capacityHours), _round1(r.months)]; }))] };
  }
  if (report === 'a10') {
    var under = _section(L.a10SectUnder, [L.a4ColRole, '%', L.a10Carried, L.a10Dropped],
      (vm.roleRows || []).map(function (r) { return [r.label, Math.round((r.pct || 0) * 100), _h(r.carriedMinutes), _h(r.droppedMinutes)]; }));
    /* v3.9.0 — «Система» по тумблеру (hasSystem); в файле тип — полной формулировкой (легенды нет). */
    var tailCols = [L.colId, L.colTask, L.a4ColRole, L.a10ColHours, L.a10ColType];
    if (vm.hasSystem) tailCols.push(L.a10ColSystem);
    var tails = _section(L.a10SectTails, tailCols,
      (vm.tails || []).map(function (t) {
        var row = [_idCell(vm, t.issueId), t.title, t.roleLabel, _h(t.minutes), t.type === 'carried' ? L.a10Carried : L.a10Dropped];
        if (vm.hasSystem) row.push(t.system || '');
        return row;
      }));
    var ageCols = [L.colId, L.colTask, L.a4ColRole, L.a10ColAge];
    if (vm.hasSystem) ageCols.push(L.a10ColSystem);
    var ages = _section(L.a10SectAge, ageCols,
      (vm.ages || []).map(function (a) {
        var row = [_idCell(vm, a.issueId), a.title, a.roleLabel, a.age];
        if (vm.hasSystem) row.push(a.system || '');
        return row;
      }));
    return { sections: [under, tails, ages] };
  }
  if (report === 'flow') {
    var bottle = _section(L.bottleneckTitle, [L.colStatus, L.colDays, L.flowColWip],
      (vm.bottleneck || []).map(function (s) { return [s.state, s.median == null ? '' : s.median, s.wip || 0]; }));
    var rework = _section(L.reworkTitle, [L.reworkColTransition, L.reworkColCount],
      (((vm.rework && vm.rework.byTransition) || [])).map(function (t) { return [t.from + ' → ' + t.to, t.count]; }));
    var rw = vm.rework || {};
    return { sections: [bottle, rework], extraMeta: [[L.reworkTotal, rw.totalBack || 0], [L.reworkIssues, rw.issuesWithReopen || 0]] };
  }
  if (report === 'b1') {
    var b1Groups = vm.groups || [];
    var b1Secs = b1Groups.map(function (g) {
      return _section(vm.hasSystem ? (g.system || L.b1AllSystems) : '', [L.b1ColRole, L.b1ColDebt, L.b1ColPct],
        (g.rows || []).map(function (r) { return [r.label, _h(r.debtMinutes), _pf(r.pct)]; }));
    });
    return { sections: b1Secs, extraMeta: [[L.b1TotalDebt, _h(vm.totalDebtMinutes)], [L.b1TotalPct, _pf(vm.totalPct)], [L.b1Unestimated, vm.unestimated || 0]] };
  }
  if (report === 'b2') {
    var b2Groups = vm.groups || [];
    var b2Secs = b2Groups.map(function (g) {
      return _section(vm.hasSystem ? (g.system || L.b2AllSystems) : '', [L.b2ColRole, L.b2ColBug, L.b2ColPct],
        (g.rows || []).map(function (r) { return [r.label, _h(r.bugMinutes), _pf(r.pct)]; }));
    });
    if (vm.basket) b2Secs.push(_section(L.b2Basket, [L.b2ColBug], [[_h(vm.basket.totalMinutes)]]));
    var b2Meta = [[L.b2TotalPct, _pf(vm.totalPct)], [L.b2TotalBug, _h(vm.totalBugMinutes)]];
    if (vm.fallbackBugCount) b2Meta.push([L.b2Fallback, vm.fallbackBugCount]);
    return { sections: b2Secs, extraMeta: b2Meta };
  }
  if (report === 'b3') {
    var avg = (typeof vm.b3Avg === 'number' && isFinite(vm.b3Avg)) ? _round1(vm.b3Avg) : 0;
    return { sections: [], extraMeta: [[L.b3Period, vm.b3Period || 0], [L.b3Avg, avg], [L.b3Ytd, vm.b3Ytd || 0]] };
  }
  if (report === 'b0') {
    /* #50 B0-e — свод: секция на КАЖДУЮ метрику; строки = месяцы, колонки = [месяц, …системы+агрегат].
       Значения числами (дни/%/мес/ЧЧ, округл. 0.1) — дружелюбно к BI, как остальные проекции. */
    var series = vm.series || { months: [], systems: [], metrics: {} };
    var b0Months = series.months || [], b0Systems = series.systems || [];
    var sysHead = b0Systems.map(function (s) { return s === '__all__' ? L.b0AllSystems : s; });
    var b0Metrics = [
      { key: 'ttm', title: L.b0MetricTtm }, { key: 'planfact', title: L.b0MetricPlanfact },
      { key: 'bottleneck', title: L.b0MetricBottleneck }, { key: 'backlogMonths', title: L.b0MetricBacklogMonths },
      { key: 'backlogHours', title: L.b0MetricBacklogHours }
    ];
    var b0Secs = b0Metrics.map(function (mt) {
      var lines = ((series.metrics || {})[mt.key] || {}).lines || {};
      return _section(mt.title, [L.b0ColMonth].concat(sysHead), b0Months.map(function (w, i) {
        var row = [w.key];
        b0Systems.forEach(function (s) { var pt = (lines[s] || [])[i]; row.push((pt && typeof pt.value === 'number') ? _round1(pt.value) : ''); });
        return row;
      }));
    });
    return { sections: b0Secs };
  }
  return { sections: [] };
}

/* Публичный вход: финальный vm → нейтральная модель для писателей. */
function reportToSheets(vm, deps) {
  deps = deps || {};
  var L = vm.labels || {};
  var report = vm.report;
  var fmtDate = deps.fmtDate || function (ts) { return String(ts); };
  var nowTs = (typeof deps.nowTs === 'number') ? deps.nowTs : 0;

  var meta = [];
  meta.push([L.exportProject, vm.projectName || '—']);
  if (_WINDOWED[report]) meta.push([L.exportPeriod, _scopeText(vm, L)]);
  else if (report === 'a10') meta.push([L.a10PickSprint, _sprintLabel(vm)]);   /* A10 — «период» по спринту N */
  else meta.push([L.exportPeriod, L.exportSnapshot]);
  meta.push([L.filterLabel, (vm.query && String(vm.query).trim()) ? String(vm.query).trim() : '—']);
  meta.push([L.exportGenerated, fmtDate(nowTs)]);
  /* D7 в файле (ревью #50): усечение LIMIT'ом и неполнота данных обязаны попасть в выгрузку —
     на экране это баннеры, а файл живёт отдельной жизнью (BI-мост, US-EXP-03). Реюз ключей баннеров. */
  if (vm.limitHit) meta.push(['⚠', String(L.limitHit || '').replace('{n}', String(vm.limit != null ? vm.limit : ''))]);
  if (vm.incompleteCount > 0) meta.push(['⚠', String(L.incomplete || '').replace('{n}', String(vm.incompleteCount))]);

  var proj = _projectReport(vm, L, deps);
  if (proj.extraMeta) meta = meta.concat(proj.extraMeta);

  /* fileStem = отчёт-проект-дата (проект-ключ ASCII). A10 в один день по разным спринтам —
     различает meta (строка «Спринт N»); одноимённые файлы браузер авто-нумерует. */
  return {
    fileStem: report + '-' + (_san(vm.projectName) || 'report') + '-' + _ymd(nowTs),
    title: _reportTitle(report, L),
    meta: meta,
    sections: proj.sections || [],
  };
}

var _api = { reportToSheets: reportToSheets };

if (typeof window !== 'undefined') {
  try { window.__SSP_REPORTING_EXPORT_PURE = _api; } catch (_) { /* sandboxed write may throw */ }
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = _api;
}
