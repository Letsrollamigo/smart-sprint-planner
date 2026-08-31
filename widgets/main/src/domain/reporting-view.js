/* reporting-view.js — #50 S1c/S2. Домен-вью оперативной отчётности.
   Контур A: диспетч по draft.ui.reportingReport ('a7'|'a1'). A7 Aging (снимок «что горит») —
   fetch #Unresolved задач → buildAgingRows. A1 Прогресс (переходы в целевой статус за период) —
   fetch задач В целевых статусах (БЕЗ #Unresolved: целевой может быть done) → окно периода
   computeWindow(preset, Date.now()) [🔴 live Date.now — не backdated] → buildProgressRows.
   Оба: fetch на ФРОНТЕ (host.fetchYouTrack, D8 — под правами юзера) + примитив bulkStateTransitions
   (инжектится через deps — B1 star-topology) → pure → mount vm через __SSP_REPORTING_MOUNT.
   Контур B — плейсхолдер (отчёты B — S8).

   STATELESS (C1): только function/const; фильтр/вид/период — в draft.ui.reporting* (session).
   Ограничитель диапазона (US-PRD-03/D10): LIMIT задач, при упоре — сообщение (не молч.обрез).
   Стриминг/отмена/прогрессив — НЕ на S1/S2 (D10, с первого period×portfolio-отчёта). */
'use strict';

const LIMIT = 200;
/* #58-5 шаг 2 — потолок задач среза (A3/A6/B1/B0): страницы по LIMIT до reportingMaxIssues
   (настройки отчётности, admin-тир; валидатор бэка 200..5000). Дефолт 1000. */
const MAX_ISSUES_DEFAULT = 1000;
function _maxIssues(settings) {
  var v = settings && settings.reportingMaxIssues;
  return (typeof v === 'number' && v >= LIMIT && v <= 5000) ? Math.floor(v) : MAX_ISSUES_DEFAULT;
}
const ISSUE_FIELDS = 'idReadable,summary,created,customFields(name,projectCustomField(field(name,id)),value(name))';
/* A2 TTM: базовые поля + вложенный Type связанных задач (для parentIsEpic по links). Тип самой
   задачи уже приходит в customFields ISSUE_FIELDS (селектор без фильтра поля отдаёт все cf). */
const ISSUE_FIELDS_A2 = ISSUE_FIELDS +
  ',links(direction,linkType(name),issues(idReadable,customFields(name,value(name))))';
/* A4 Трудозатраты: id + user-поля ролей (value(login) — login матчит author нативных workItems). */
const ISSUE_FIELDS_A4 = 'idReadable,customFields(name,projectCustomField(field(name)),value(login,name))';
/* A5 План-факт: summary + field(name,id) (state-id для якорей + резолв name→id полей оценки) +
   value(login,name,minutes) — login (роли) / name (state) / minutes (текущая оценка period). */
const ISSUE_FIELDS_A5 = 'idReadable,summary,customFields(name,projectCustomField(field(name,id)),value(login,name,minutes))';
/* A3 срез (снимок «сейчас», без activities): summary + текущие поля — state/бизнес-поля
   (value name/localizedName/presentation) + per-role оценки (value.minutes). */
const ISSUE_FIELDS_A3 = 'idReadable,summary,customFields(name,projectCustomField(field(name,id)),value(name,localizedName,presentation,minutes))';
/* #50 S8b — B1 Техдолг (снимок): поля A3 (тип/система/оценки в customFields) + теги (отбор техдолга по тегу). */
const ISSUE_FIELDS_B1 = ISSUE_FIELDS_A3 + ',tags(name)';
/* #50 S8c — B2 «Налог на баги»: created (окно бага) + cf (тип/система/user-роли: value login+name+localizedName)
   + links (типы связей баг→фича + id связанных задач). Роль workitem'а = исполнитель роли задачи (value.login). */
const ISSUE_FIELDS_B2 = 'idReadable,created,customFields(name,projectCustomField(field(name,id)),' +
  'value(login,name,localizedName)),links(linkType(name),issues(idReadable))';
/* #50 B0 «Свод»: все зоны сразу в одном фетче — value(login,name,localizedName,minutes) (роли/state/
   система/оценки) + field(name,id) (state-id + резолв estField name→id) + links(Type связанных) для
   parentIsEpic (foldChildUnits TTM). Объединение A5+A3+A2 селекторов. */
const ISSUE_FIELDS_B0 = 'idReadable,summary,created,customFields(name,projectCustomField(field(name,id)),' +
  'value(login,name,localizedName,minutes)),links(direction,linkType(name),issues(idReadable,customFields(name,value(name))))';
/* A6: норматив-ориентир «месяцев бэклога» (ориентир) — константа (мокап без «из настроек»). */
const A6_NORM_MONTHS = 6;

function _pure()   { return (typeof window !== 'undefined' && window.__SSP_REPORTING_PURE) || null; }
function _bpure()  { return (typeof window !== 'undefined' && window.__SSP_REPORTING_B_PURE) || null; }   /* #50 S8c — B2 движок */
function _period() { return (typeof window !== 'undefined' && window.__SSP_REPORTING_PERIOD) || null; }
function _ttm()    { return (typeof window !== 'undefined' && window.__SSP_REPORTING_TTM) || null; }
function _rollup() { return (typeof window !== 'undefined' && window.__SSP_REPORTING_ROLLUP) || null; }   /* #50 B0 — движок свода */
function _mount()  { return (typeof window !== 'undefined' && window.__SSP_REPORTING_MOUNT) || null; }
function _hostId(contour) { return 'tab-reporting-' + (contour === 'b' ? 'b' : 'a'); }

function _labels(T) {
  return {
    contourA: T('repNodeA'), contourB: T('repNodeB'), placeholder: T('repPlaceholder'),
    /* #50 S8a — B3 «1000 мелочей» (контур B): пикер/заголовок + плитки счётчика */
    b3Title: T('repB3Title'), b3Sub: T('repB3Sub'), b3Menu: T('repB3Menu'),
    b3Period: T('repB3Period'), b3Avg: T('repB3Avg'), b3Ytd: T('repB3Ytd'),
    b3Unit: T('repB3Unit'), b3NoTag: T('repB3NoTag'),
    /* #50 S8b — B1 Техдолг (контур B): пикер/заголовок + плитки + таблица роль×система */
    b1Title: T('repB1Title'), b1Sub: T('repB1Sub'), b1Menu: T('repB1Menu'),
    b1TotalDebt: T('repB1TotalDebt'), b1TotalPct: T('repB1TotalPct'), b1Unestimated: T('repB1Unestimated'),
    b1ColRole: T('repB1ColRole'), b1ColDebt: T('repB1ColDebt'), b1ColPct: T('repB1ColPct'),
    b1AllSystems: T('repB1AllSystems'), b1NoCfg: T('repB1NoCfg'), b1Empty: T('repB1Empty'),
    b1HoursUnit: T('capacityHoursShort'),
    /* #50 S8c — B2 «Налог на баги» (контур B): пикер/заголовок + плитки + таблица роль×система + корзина */
    b2Title: T('repB2Title'), b2Sub: T('repB2Sub'), b2Menu: T('repB2Menu'),
    b2TotalPct: T('repB2TotalPct'), b2TotalBug: T('repB2TotalBug'), b2Fallback: T('repB2Fallback'),
    b2ColRole: T('repB2ColRole'), b2ColBug: T('repB2ColBug'), b2ColPct: T('repB2ColPct'),
    b2AllSystems: T('repB2AllSystems'), b2NoCfg: T('repB2NoCfg'), b2Empty: T('repB2Empty'),
    b2Basket: T('repB2Basket'), b2HoursUnit: T('capacityHoursShort'),
    /* #50 B0-d — «Свод» (контур B): пикер/заголовок + 5 LineChart-метрик × система. Единицы реюзают A2/A6/ёмкость. */
    b0Title: T('repB0Title'), b0Sub: T('repB0Sub'), b0Menu: T('repB0Menu'),
    b0NoCfg: T('repB0NoCfg'), b0Empty: T('repB0Empty'), b0Window: T('repB0Window'),
    b0AllSystems: T('repB0AllSystems'), b0ColMonth: T('repB0ColMonth'),
    b0MetricTtm: T('repB0MetricTtm'), b0MetricPlanfact: T('repB0MetricPlanfact'),
    b0MetricBottleneck: T('repB0MetricBottleneck'), b0MetricBacklogMonths: T('repB0MetricBacklogMonths'),
    b0MetricBacklogHours: T('repB0MetricBacklogHours'),
    b0NoFlowHint: T('repB0NoFlowHint'), b0NoBacklogHint: T('repB0NoBacklogHint'),
    b0UnitDays: T('repTtmUnit'), b0UnitMonths: T('repA6MonthsUnit'), b0UnitHours: T('capacityHoursShort'),
    a7Title: T('repA7Title'), a7Sub: T('repA7Sub'), a1Title: T('repA1Title'), a1Sub: T('repA1Sub'),
    colId: T('repColId'), colTask: T('repColTask'), colStatus: T('repColStatus'),
    colDays: T('repColDays'), colFlag: T('repColFlag'), daysUnit: T('repDaysUnit'),
    colEnteredStatus: T('repColEnteredStatus'), colEnteredDate: T('repColEnteredDate'), colLabel: T('repColLabel'),
    filterLabel: T('repFilterLabel'), filterPh: T('repFilterPh'), refresh: T('repRefresh'),
    pickReport: T('repPickReport'), periodLabel: T('repPeriodLabel'), yearLabel: T('repYearLabel'),
    rangeFrom: T('repRangeFrom'), rangeTo: T('repRangeTo'),
    loading: T('repLoading'), empty: T('repEmpty'), error: T('repError'),
    a1NoTargets: T('repA1NoTargets'), a1PopNote: T('repA1PopNote'), rangePrompt: T('repRangePrompt'),
    flagOver: T('repFlagOver'), flagWarn: T('repFlagWarn'), flagOk: T('repFlagOk'), flagNone: T('repFlagNone'),
    /* #50 v3.2.0 — подписи графиков каталога (A1/A4/A5/A7/B1/B2). */
    a1ChartByDay: T('repA1ChartByDay'), a1ChartByMonth: T('repA1ChartByMonth'),
    a4ChartTitle: T('repA4ChartTitle'), a5ChartTitle: T('repA5ChartTitle'), a7ChartTitle: T('repA7ChartTitle'),
    b1ChartTitle: T('repB1ChartTitle'), b2ChartTitle: T('repB2ChartTitle'),
    chartTasks: T('repChartTasks'), chartTopN: T('repChartTopN'),
    incomplete: T('repIncomplete'), limitHit: T('repLimitHit'),
    /* #50 S3c — A2 TTM вью */
    a2Title: T('repA2Title'), a2Sub: T('repA2Sub'),
    metricLead: T('repMetricLead'), metricTeam: T('repMetricTeam'), metricCycle: T('repMetricCycle'),
    ttmUnit: T('repTtmUnit'), ttmOver: T('repTtmOver'), ttmOk: T('repTtmOk'),
    ttmNoData: T('repTtmNoData'),                       /* #58-9 — median=null: не вердикт, а «нет данных» */
    tagPausePending: T('repTagPausePending'),           /* #58-11 — сноска «*» получает текст */
    runReport: T('repRunReport'), idleHint: T('repIdleHint'),          /* #58-12 — явный запуск */
    paramsDirty: T('repParamsDirty'),
    ttmNoNorm: T('repTtmNoNorm'), ttmNormPrefix: T('repTtmNormPrefix'),
    colUnitType: T('repColUnitType'), colCount: T('repColCount'),
    unitEpic: T('repUnitEpic'), unitStory: T('repUnitStory'),
    bucketTitle: T('repBucketTitle'), bucketLe40: T('repBucketLe40'),
    bucketMid: T('repBucketMid'), bucketGt120: T('repBucketGt120'),
    riskSuffix: T('repRiskSuffix'), a2NoAnchors: T('repA2NoAnchors'), a2NoPauses: T('repA2NoPauses'),
    /* #50 S4c — Поток A8/A9 вью */
    flowTitle: T('repFlowTitle'), flowSub: T('repFlowSub'),
    bottleneckTitle: T('repBottleneckTitle'), bottleneckSub: T('repBottleneckSub'),
    flowColWip: T('repFlowColWip'), flowNoFlow: T('repFlowNoFlow'), flowEmpty: T('repFlowEmpty'),
    flowPopulation: T('repFlowPopulation'),
    reworkTitle: T('repReworkTitle'), reworkSub: T('repReworkSub'),
    reworkTotal: T('repReworkTotal'), reworkIssues: T('repReworkIssues'),
    reworkColTransition: T('repReworkColTransition'), reworkColCount: T('repReworkColCount'),
    /* #50 S5a-iii — A4 Трудозатраты вью */
    a4Title: T('repA4Title'), a4Sub: T('repA4Sub'),
    a4ColPerson: T('repA4ColPerson'), a4ColRole: T('repA4ColRole'),
    a4ColHours: T('repA4ColHours'), a4ColDays: T('repA4ColDays'),
    a4RoleNone: T('repA4RoleNone'), a4NoLogTitle: T('repA4NoLogTitle'),
    a4Total: T('repA4Total'), a4Empty: T('repA4Empty'), a4HoursUnit: T('capacityHoursShort'),
    /* #50 S5b-iii — A5 План-факт вью */
    a5Title: T('repA5Title'), a5Sub: T('repA5Sub'),
    a5MetricSuffix: T('repA5MetricSuffix'), a5OverCount: T('repA5OverCount'),
    a5OverEst: T('repA5OverEst'), a5UnderEst: T('repA5UnderEst'), a5NormHint: T('repA5NormHint'),
    a5ColEst: T('repA5ColEst'), a5ColFact: T('repA5ColFact'), a5ColVar: T('repA5ColVar'), a5Empty: T('repA5Empty'),
    /* #50 S6a — A3 WIP/Done срез */
    a3Title: T('repA3Title'), a3Sub: T('repA3Sub'), a3ColUnit: T('repA3ColUnit'),
    a3ColStage: T('repA3ColStage'), a3ColOrg: T('repA3ColOrg'), a3ColPriority: T('repA3ColPriority'),
    a3EstPrefix: T('repA3EstPrefix'), a3ModeWip: T('repA3ModeWip'), a3ModeDone: T('repA3ModeDone'), a3Empty: T('repA3Empty'),
    a3NoDoneCfg: T('repA3NoDoneCfg'),   /* #57-5 Н4 — без целевых статусов весь срез уходит в WIP */
    /* #50 S6b — A6 Бэклог в ЧЧ по ролям */
    a6Title: T('repA6Title'), a6Sub: T('repA6Sub'), a6ColTasks: T('repA6ColTasks'), a6ColSum: T('repA6ColSum'),
    a6ColCapacity: T('repA6ColCapacity'), a6ColMonths: T('repA6ColMonths'), a6MonthsUnit: T('repA6MonthsUnit'),
    a6AtThreshold: T('repA6AtThreshold'), a6NormMarker: T('repA6NormMarker'), a6Empty: T('repA6Empty'), a6NoBacklogHint: T('repA6NoBacklogHint'),
    /* #50 S7 — говорящие названия пикера (repA*Menu); заголовок <h2> остаётся коротким (repA*Title) */
    a7Menu: T('repA7Menu'), a1Menu: T('repA1Menu'), a3Menu: T('repA3Menu'), a2Menu: T('repA2Menu'),
    flowMenu: T('repFlowMenu'), a4Menu: T('repA4Menu'), a5Menu: T('repA5Menu'), a6Menu: T('repA6Menu'), a10Menu: T('repA10Menu'),
    a11Menu: T('repA11Menu'),
    /* v3.12.0 (#11) — A11 Velocity вью (скорость команды по ролям из снимков) */
    a11Title: T('repA11Title'), a11Sub: T('repA11Sub'), a11Easter: T('repA11Easter'),   /* #98 — пасхалка 42 из словаря */
    a11SectAvg: T('repA11SectAvg'), a11SectTrend: T('repA11SectTrend'),
    a11ColAvgClosed: T('repA11ColAvgClosed'), a11ColAvgPct: T('repA11ColAvgPct'), a11ColPlanned: T('repA11ColPlanned'),
    a11ColSprints: T('repA11ColSprints'), a11ColSprint: T('repA11ColSprint'), a11Sparse: T('repA11Sparse'),
    a11WindowNote: T('repA11WindowNote'),
    a11Empty: T('repA11Empty'), a11NoDoneCfg: T('repA11NoDoneCfg'),
    /* #50 S7c — A10 Spillover вью (снимки соседних спринтов) */
    a10Title: T('repA10Title'), a10Sub: T('repA10Sub'),
    a10SectUnder: T('repA10SectUnder'), a10SectTails: T('repA10SectTails'), a10SectAge: T('repA10SectAge'),
    a10Carried: T('repA10Carried'), a10Dropped: T('repA10Dropped'),
    a10ColHours: T('repA10ColHours'), a10ColType: T('repA10ColType'), a10ColSystem: T('repA10ColSystem'),
    a10CarriedShort: T('repA10CarriedShort'), a10DroppedShort: T('repA10DroppedShort'),
    a10ColAge: T('repA10ColAge'), a10AgeUnit: T('repA10AgeUnit'), a10PickSprint: T('repA10PickSprint'),
    colSystem: T('repA10ColSystem'),   /* v3.9.0 — общий заголовок колонки «Система» (реюз ключа A10) */
    a10NoN1: T('repA10NoN1'), a10Empty: T('repA10Empty'), a10NoDoneCfg: T('repA10NoDoneCfg'),
    a10HoursUnit: T('capacityHoursShort'),
    /* #50 S9-EXP — экспорт (кнопка + meta); exportPeriod/exportTotal реюзят существующие переводы */
    exportLabel: T('repExportLabel'), exportProject: T('repExportProject'),
    /* #50 D10 — прерывание отчёта: кнопка «Прервать» + баннеры отмены/таймаута. */
    cancelReport: T('repCancel'), cancelReportHint: T('repCancelHint'),
    abortedManual: T('repAbortedManual'), abortedTimeout: T('repAbortedTimeout'),
    exportSnapshot: T('repExportSnapshot'), exportGenerated: T('repExportGenerated'),
    exportPeriod: T('repPeriodLabel'), exportTotal: T('excelTotal'),
    period: {
      today: T('repPeriodToday'), yesterday: T('repPeriodYesterday'), last7: T('repPeriodLast7'),
      last30: T('repPeriodLast30'), lastMonth: T('repPeriodLastMonth'), lastQuarter: T('repPeriodLastQuarter'),
      currentQuarter: T('repPeriodCurrentQuarter'), ytd: T('repPeriodYtd'),
      calendarYear: T('repPeriodCalendarYear'), custom: T('repPeriodCustom'),
    },
  };
}

/* As-of значения period-полей из estTimelines объединённого фетча (ревью #50, O1) — та же
   реконструкция, что делал bulkAsOfEstimates: pure.asOfPeriodMinutes(таймлайн, текущее, asOfTs). */
function _asOfFromEstTimelines(pure, ids, estTls, currentById, asOfById, fieldIds) {
  var asOf = {};
  for (var i = 0; i < ids.length; i++) {
    var id = ids[i];
    var tls = (estTls && estTls[id]) || {};
    var cur = currentById[id] || {};
    var ts = asOfById[id];
    var perField = {};
    for (var f = 0; f < fieldIds.length; f++) {
      var fid = fieldIds[f];
      perField[fid] = pure.asOfPeriodMinutes(tls[fid] || [], cur[fid], (typeof ts === 'number') ? ts : null);
    }
    asOf[id] = perField;
  }
  return asOf;
}

/* Объединение incomplete-списков (якоря ∪ пауз-теги) без дублей — честный D7-счётчик (ревью #50). */
function _unionIds(a, b) {
  if (!b || !b.length) return a || [];
  if (!a || !a.length) return b;
  var s = {}, out = [], i;
  for (i = 0; i < a.length; i++) { if (!s[a[i]]) { s[a[i]] = 1; out.push(a[i]); } }
  for (i = 0; i < b.length; i++) { if (!s[b[i]]) { s[b[i]] = 1; out.push(b[i]); } }
  return out;
}

function _activeProj(deps) {
  if (deps.activeProjectKey) return String(deps.activeProjectKey);
  var p = deps.ctx && deps.ctx.project;
  return p ? String(p.shortName || p.id || '') : '';
}
/* Имя атрибута YT-запроса: брейс при пробеле («Этап работ» → «{Этап работ}») — паттерн
   backlog-loader (#21 §9); без брейса запрос по полю с пробелом молча ломает отбор. */
function _battr(name) { return /\s/.test(name) ? '{' + name + '}' : name; }
/* #58-5 — UTC-день YYYY-MM-DD для серверных клауз окна (`updated:`/`work date:`);
   UTC — как весь reporting-period (полуоткрытое окно, границы суток по UTC). */
function _fmtDayUTC(ts) {
  var d = new Date(ts);
  var m = d.getUTCMonth() + 1, day = d.getUTCDate();
  return d.getUTCFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
}
/* #57-5 Н3 (⚖ владелец) — юзер-хвост QueryAssist в скобки: верхнеуровневый `or` иначе
   разрывает project-скоуп (`project: X … A or B` → B со всего инстанса утекает в метрики).
   #58-1: группа обязана клеиться явным `and` — юкстапозиция `project: X (A)` парсер YT
   отвергает (400 invalid_query, обе версии: 2025.3 и 2026.1). `sort by:` со скобочной
   группой несовместим в принципе (`… and (A) sort by: x` → 400), а отчёты строят свой
   порядок строк — суффикс отбрасываем, а не переносим. */
function _wrapUserQuery(q) {
  var m = /\bsort by:/i.exec(q);
  var filter = (m ? q.slice(0, m.index) : q).trim();
  return filter ? 'and (' + filter + ')' : '';
}
/* customField задачи по имени поля (projectCustomField.field.name | cf.name). */
function _cf(iss, fieldName) {
  var cfs = iss.customFields || [];
  for (var i = 0; i < cfs.length; i++) {
    var cf = cfs[i];
    var fn = (cf.projectCustomField && cf.projectCustomField.field && cf.projectCustomField.field.name) || cf.name || '';
    if (fn === fieldName) return cf;
  }
  return null;
}
/* field.id по имени поля (из CF отобранных задач) — для матча activities по id, НЕ по имени
   (имя поля локализуется на RU-инстансе). '' если не найдено. */
function _fieldIdByName(arr, fieldName) {
  for (var i = 0; i < arr.length; i++) {
    var cfs = (arr[i] && arr[i].customFields) || [];
    for (var j = 0; j < cfs.length; j++) {
      var f = cfs[j].projectCustomField && cfs[j].projectCustomField.field;
      if (((f && f.name === fieldName) || cfs[j].name === fieldName) && f && f.id) return f.id;
    }
  }
  return '';
}
/* Текущее period-значение задачи (минуты) по field.id — as-of fallback, когда после старт-якоря
   изменений поля не было. null если поля/значения нет. */
function _cfMinutesById(iss, fieldId) {
  var cfs = (iss && iss.customFields) || [];
  for (var i = 0; i < cfs.length; i++) {
    var f = cfs[i].projectCustomField && cfs[i].projectCustomField.field;
    if (f && f.id === fieldId) { var v = cfs[i].value; return (v && typeof v.minutes === 'number') ? v.minutes : null; }
  }
  return null;
}
/* Маппинг сырых задач YT → { issues:[{id,summary,state,created}], ids, fieldId } (общий A7/A1). */
function _mapIssues(arr, fieldState) {
  var issues = [], ids = [], fieldId = '';
  for (var i = 0; i < arr.length; i++) {
    var iss = arr[i]; if (!iss || !iss.idReadable) continue;
    var cf = _cf(iss, fieldState);
    if (cf && !fieldId) fieldId = (cf.projectCustomField && cf.projectCustomField.field && cf.projectCustomField.field.id) || '';
    var stateName = (cf && cf.value && cf.value.name) || '';
    issues.push({ id: iss.idReadable, summary: iss.summary || '', state: stateName,
      created: (typeof iss.created === 'number') ? iss.created : null });
    ids.push(iss.idReadable);
  }
  return { issues: issues, ids: ids, fieldId: fieldId };
}

/* A2 тип единицы по имени значения Type-поля: эпик / сольная стори / иное (null). */
function _classifyType(name) {
  var s = String(name || '');
  if (/эпик|epic/i.test(s)) return 'epic';
  if (/стори|story|истори/i.test(s)) return 'story';
  return null;
}
/* Имя значения Type-поля задачи (main: projectCustomField.field.name; nested: cf.name — _cf кроет оба). */
function _typeName(iss, typeNames) {
  for (var i = 0; i < typeNames.length; i++) {
    var cf = _cf(iss, typeNames[i]);
    if (cf && cf.value && cf.value.name) return cf.value.name;
  }
  return '';
}
/* parentIsEpic: есть link (subtask/parent/epic по имени типа связи) на задачу типа «эпик».
   Graceful: нет/неразрешённые links → false (трактуем как сольную стори, без дедупа/краша). */
function _parentIsEpic(iss, typeNames) {
  var links = Array.isArray(iss.links) ? iss.links : [];
  for (var i = 0; i < links.length; i++) {
    var l = links[i];
    if (!l || !l.linkType || !/subtask|parent|epic/i.test(String(l.linkType.name || ''))) continue;
    var lis = Array.isArray(l.issues) ? l.issues : [];
    for (var j = 0; j < lis.length; j++) {
      if (_classifyType(_typeName(lis[j], typeNames)) === 'epic') return true;
    }
  }
  return false;
}
/* Уникальные имена якорных состояний (концы всех заданных пар lead/team/cycle) — для фетча. */
function _anchorStateSet(anchors) {
  var set = {}, out = [];
  ['lead', 'team', 'cycle'].forEach(function (metric) {
    var p = anchors[metric] || {};
    [p.start, p.end].forEach(function (s) { if (s && !set[s]) { set[s] = true; out.push(s); } });
  });
  return out;
}
/* Терминальная политика A2 (US-A2-02, v3.2.0): нормализация настройки к enum;
   всё, кроме явного 'last-stable-close', — дефолт 'first-close'. */
function _terminalPolicy(settings) {
  return (settings && settings.reportingTerminalPolicy === 'last-stable-close')
    ? 'last-stable-close' : 'first-close';
}
/* Уровень плитки из median/norm (S3b держим стабильным): >norm→over, ≤norm→ok, нет нормы/данных→none. */
function _tileLevel(med, norm) {
  if (norm == null || med == null) return 'none';
  return med > norm ? 'over' : 'ok';
}
/* Маппинг сырых задач YT для A2 → {issues:[{id,summary,created,type,parentIsEpic}], ids, fieldId,
   diag:{typed,parentResolved}}. type=_classifyType(Type); parentIsEpic по вложенным links. */
function _mapIssuesA2(arr, fieldState, typeNames) {
  var issues = [], ids = [], fieldId = '', typed = 0, parentResolved = 0;
  for (var i = 0; i < arr.length; i++) {
    var iss = arr[i]; if (!iss || !iss.idReadable) continue;
    var cf = _cf(iss, fieldState);
    if (cf && !fieldId) fieldId = (cf.projectCustomField && cf.projectCustomField.field && cf.projectCustomField.field.id) || '';
    var type = _classifyType(_typeName(iss, typeNames));
    var parentIsEpic = _parentIsEpic(iss, typeNames);
    if (type) typed++;
    if (parentIsEpic) parentResolved++;
    issues.push({ id: iss.idReadable, summary: iss.summary || '', type: type, parentIsEpic: parentIsEpic,
      created: (typeof iss.created === 'number') ? iss.created : null });
    ids.push(iss.idReadable);
  }
  return { issues: issues, ids: ids, fieldId: fieldId, diag: { typed: typed, parentResolved: parentResolved } };
}

function _mountVm(contour, vm) {
  var host = document.getElementById(_hostId(contour));
  var m = _mount();
  if (!host || !m) return;
  /* D10 gen-гейт: устаревший mount (свитч/отмена/таймаут сдвинули gen) НЕ перезаписывает актуальный вид
     ни успехом, ни ошибкой — единая защита взамен _fresh в каждом .then/.catch. _cancelRun монтирует
     откат НАПРЯМУЮ (mountAt), в обход этого гейта. vm без gen (не от base) → не гейтим. */
  if (vm && vm.gen && host.__sspReportingGen != null && host.__sspReportingGen !== vm.gen) return;
  host.__sspReportingLoading = !!(vm && vm.loading);
  if (vm && !vm.loading && !vm.error) host.__sspReportingGood = vm;   /* последний НЕ-loading вид: цель отката (error-vm — не цель: откат давал бы «ошибка+прервано» разом) */
  m.mountAt(host, vm);
}

/* Таймаут-бэкстоп прогона отчёта в мс: настройка reportingTimeoutSec (admin-tier), дефолт 90 сек.
   ≤0 / битое → дефолт (бэкстоп не отключаем — цель D10 «не завесить систему»). */
function _reportTimeoutMs(settings) {
  var s = settings && settings.reportingTimeoutSec;
  var sec = (typeof s === 'number' && isFinite(s) && s > 0) ? s : 90;
  return sec * 1000;
}

/* #50 D10 SAFE-b — вооружаем прогон отчёта средствами прерывания (защита «не завесить систему»):
   base.shouldAbort — примитивы проверяют между чанками (истинно ⇒ gen ушёл вперёд = отмена/свитч/таймаут);
   base.onCancel — кнопка «Прервать» в Chrome; самопроверяющийся таймаут-бэкстоп на host. Вызывается ДО
   монтирования loading (кнопка/токен должны существовать сразу). host хранит base — фолбэк отката. */
function _armRun(deps, base, timeoutMs) {
  var host = document.getElementById(_hostId(base.contour === 'b' ? 'b' : 'a'));
  var myGen = base.gen;
  base.shouldAbort = function () { return !!(host && host.__sspReportingGen !== myGen); };
  base.onCancel = function () { _cancelRun(deps, base.contour, 'manual'); };
  if (!host) return;
  host.__sspReportingBase = base;
  if (host.__sspReportingTimer) { clearTimeout(host.__sspReportingTimer); host.__sspReportingTimer = null; }
  if (timeoutMs > 0 && typeof setTimeout === 'function') {
    host.__sspReportingTimer = setTimeout(function () {
      /* фолбэк: сработает только если ЭТОТ прогон ещё актуален (gen не сменился) И всё ещё грузится */
      if (host.__sspReportingGen === myGen && host.__sspReportingLoading) _cancelRun(deps, base.contour, 'timeout');
    }, timeoutMs);
  }
}

/* Прерывание прогона: бамп gen (in-flight примитивы бросят REPORT_ABORTED; _fresh станет false →
   устаревший mount заблокирован) + откат фронта к последнему НЕ-loading виду (или Chrome без тела) +
   баннер «прервано». reason: 'manual' | 'timeout'. */
function _cancelRun(deps, contour, reason) {
  var c = (contour === 'b') ? 'b' : 'a';
  var host = document.getElementById(_hostId(c));
  if (!host) return;
  host.__sspReportingGen = (host.__sspReportingGen || 0) + 1;
  host.__sspReportingLoading = false;
  if (host.__sspReportingTimer) { clearTimeout(host.__sspReportingTimer); host.__sspReportingTimer = null; }
  var m = _mount();
  if (!m) return;
  var good = host.__sspReportingGood;
  var chrome = host.__sspReportingBase ? Object.assign({}, host.__sspReportingBase, { loading: false }) : { contour: c };
  var vm = Object.assign({}, good || chrome, { aborted: reason, loading: false });
  /* Откат мог показать НЕ тот отчёт, что выбран в draft (свитч во время прогона) — ресинк draft
     к показанному, иначе следующий «Обновить» молча перескочит на отчёт из draft. */
  if (good && good.report && deps && deps.draftGet && deps.draftSet) {
    var u = deps.draftGet('ui') || {};
    var dk = (c === 'b') ? 'reportingReportB' : 'reportingReport';
    if (u[dk] !== good.report) { u[dk] = good.report; deps.draftSet('ui', u); }
  }
  m.mountAt(host, vm);   /* напрямую (не _mountVm) — не перезаписывать __sspReportingGood прерванным видом */
}
/* Свежесть ответа: gen на host-элементе. Устаревший in-flight ответ (свитч вида/периода/фильтра
   на лету) НЕ перезаписывает актуальный vm (last-response-wins race). C1-safe: DOM-стейт, не модуль. */
function _fresh(base) {
  var h = document.getElementById(_hostId(base.contour === 'b' ? 'b' : 'a'));
  return !(h && base.gen && h.__sspReportingGen !== base.gen);
}

/* ═══ R4 (v3.8.0, аудит D4) — makeReportLoader: конверт лоадера отчёта. ═══
   Снимает boilerplate ×13: единый catch (__reportAborted → тихо: откат уже смонтирован
   _cancelRun, gen-гейт актуален; иначе diag 'reporting <TAG> err' + error-vm), fetch с
   LIMIT+1-обрезом, scope-запрос project+QueryAssist, период-гарды. Управляющая логика
   отчётов (мульти-фетчи, движки, mid-chain _fresh) остаётся в run(ctx) as-is — конверт
   НЕ перекраивает внутренности (риск тихого дрейфа vm; ключи vm = экспорт-контракт
   reportToSheets). run вызывается СИНХРОННО (ранние config-гарды монтируют vm в том же
   тике, как до R4); вернувшийся promise получает общий catch. */
function makeReportLoader(tag, contour, run) {
  return function (deps, base, settings, fieldState, proj, pure) {
    var ctx = {
      deps: deps, base: base, settings: settings, fieldState: fieldState, proj: proj, pure: pure,
      /* mount(patch) — vm = base + patch (report в патче избыточен: base уже несёт). */
      mount: function (patch) { _mountVm(contour, Object.assign({}, base, patch)); },
      /* scope-запрос: project + серверные клаузы отчёта + QueryAssist-хвост юзера (AND).
         #58-5 — sort: сортировка популяции ('updated asc'|'updated desc') клеится ПОСЛЕДНЕЙ и
         ТОЛЬКО при пустом юзер-фильтре: `sort by` после скобочной группы = 400 invalid_query
         (эмпирика 58-1, обе версии YT). С фильтром население и так сужено — сортировка не критична. */
      queryParts: function (extras, sort) {
        var parts = ['project: ' + proj];
        if (extras) for (var i = 0; i < extras.length; i++) parts.push(extras[i]);
        var hasUq = false;
        if (base.query.trim()) {
          var uq = _wrapUserQuery(base.query.trim());                           /* Н3 — скобки против or-утечки скоупа */
          if (uq) { parts.push(uq); hasUq = true; }                            /* #58-1 — пустой хвост (одно `sort by:`) не клеим */
        }
        if (sort && !hasUq) parts.push('sort by: ' + sort);
        return parts;
      },
      /* Один issues-фетч с ограничителем D10: $top=LIMIT+1 → {arr≤LIMIT, limitHit}. */
      fetchIssues: function (fields, parts) {
        return deps.host.fetchYouTrack('issues', { query: { fields: fields, query: parts.join(' '), $top: LIMIT + 1 } })
          .then(function (raw) {
            var arr = Array.isArray(raw) ? raw : [];
            var limitHit = arr.length > LIMIT; if (limitHit) arr = arr.slice(0, LIMIT);
            return { arr: arr, limitHit: limitHit };
          });
      },
      /* #58-5 шаг 2 — срезы (A3/A6/B1/B0): страницы по LIMIT до потолка reportingMaxIssues
         (настройки отчётности, дефолт 1000). limitHit — ТОЛЬКО при реальном превышении
         потолка (страница полная И собрано ≥ max); {max} — для баннера {n}. */
      fetchIssuesPaged: function (fields, parts) {
        var max = _maxIssues(ctx.settings);
        var q = parts.join(' ');
        var arr = [];
        function page(skip) {
          if (typeof base.shouldAbort === 'function' && base.shouldAbort()) return Promise.reject({ __reportAborted: true });
          return deps.host.fetchYouTrack('issues', { query: { fields: fields, query: q, $skip: skip, $top: LIMIT } })
            .then(function (raw) {
              var pageArr = Array.isArray(raw) ? raw : [];
              for (var i = 0; i < pageArr.length; i++) arr.push(pageArr[i]);
              if (pageArr.length < LIMIT) {              /* хвост: населения больше нет */
                var over = arr.length > max;
                return { arr: over ? arr.slice(0, max) : arr, limitHit: over, max: max };
              }
              if (arr.length > max) return { arr: arr.slice(0, max), limitHit: true, max: max };
              return page(skip + LIMIT);                 /* ровно max при полной странице → probe следующей */
            });
        }
        return page(0);
      },
      /* Период-гарды + окно. Патчи per-loader (исторически гетерогенны — {loading:false,…}
         vs {report:'xx',…}; сохраняем формы vm байт-в-байт). null = vm уже смонтирован. */
      window: function (promptPatch, failPatch) {
        if (base.period === 'custom' && (!base.periodOpts.from || !base.periodOpts.to)) {
          ctx.mount(promptPatch); return null;
        }
        var pd = _period();
        var win = pd ? pd.computeWindow(base.period, Date.now(), base.periodOpts) : null;
        if (!win) ctx.mount(failPatch);
        return win;
      }
    };
    function fail(e) {
      if (e && e.__reportAborted) return;   /* прерывание — не ошибка: откат смонтирован _cancelRun */
      if (deps.diag) deps.diag('reporting ' + tag + ' err: ' + String(e && e.message ? e.message : e), 'err');
      ctx.mount({ error: true });
    }
    try {
      var p = run(ctx);
      if (p && typeof p.catch === 'function') p.catch(fail);
    } catch (e) { fail(e); }
  };
}

/* ═══ R4 (D4) — бывшие инлайн-дубли лоадеров, подняты на module-level. ═══ */
/* Текущее period-значение поля задачи в минутах (был _min ×3: A3/A6/B1). */
function _cfMin(iss, fn) { var c = _cf(iss, fn); var v = c && c.value; return (v && typeof v.minutes === 'number') ? v.minutes : null; }
/* Дисплей-текст значения поля (был _text в A3): localizedName ⊃ name ⊃ presentation. */
function _cfText(iss, fn) { var c = _cf(iss, fn); var v = c && c.value; return v ? (v.localizedName || v.name || v.presentation || '') : ''; }
/* Канон-имя типа задачи (был _typeVal ×2: B1/B2) — value.name (матч конфига). */
function _typeValOf(iss, fieldType) { var c = _cf(iss, fieldType); var v = c && c.value; return (v && v.name) || ''; }
/* Дисплей-имя системы (был _sysVal ×3: B1/B2/B0); пустое имя поля → ''. */
function _sysValOf(iss, fieldSystem) { if (!fieldSystem) return ''; var c = _cf(iss, fieldSystem); var v = c && c.value; return v ? (v.localizedName || v.name || '') : ''; }
/* v3.9.0 — эффективное имя поля «Система» для отчётности: тумблер reportingShowSystem
   (admin-тир, дефолт ON — семантика !== false) гейтит показ; '' = колонка/группировка скрыты
   (для B-отчётов это уже реализованный путь «fieldSystem не задан»). */
function _fieldSystemEff(settings) {
  if (settings && settings.reportingShowSystem === false) return '';
  return (settings && typeof settings.fieldSystem === 'string' && settings.fieldSystem) ? settings.fieldSystem : '';
}
/* v3.9.0 — приклейка системы к готовым rows движка по id из сырого фетча (pure-движки не трогаем). */
function _attachSystem(rows, arr, fieldSystem) {
  if (!fieldSystem) return;
  var by = {};
  for (var i = 0; i < arr.length; i++) { var iss = arr[i]; if (iss && iss.idReadable) by[iss.idReadable] = _sysValOf(iss, fieldSystem); }
  for (var j = 0; j < rows.length; j++) rows[j].system = by[rows[j].id] || '';
}

/* #50 S8a — epoch-ms UTC → 'YYYY-MM-DD' для YT-запроса created-окна (B3). */
function _ymdISO(ms) {
  var d = new Date(ms), p = function (n) { return (n < 10 ? '0' : '') + n; };
  return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
}
/* #50 S8a — счётчик задач под запрос: пагинация id-only до полноты (release-pick-паттерн).
   «1000 мелочей» легко >LIMIT → single-fetch недосчитал бы; тянем страницами по PAGE.
   ponytail: hard-cap 20k задач на счётчик — если тег когда-то перерастёт, апгрейд на count-API.
   Возврат {total, capped} (ревью #50): упор в кап — НЕ точное число, сигналим (D7, не молча). */
function _countIssues(deps, query, shouldAbort) {
  var PAGE = 500, total = 0, skip = 0;
  function step() {
    if (typeof shouldAbort === 'function' && shouldAbort()) return Promise.reject({ __reportAborted: true });   /* D10 — прерывание между страницами счётчика */
    return deps.host.fetchYouTrack('issues', { query: { fields: 'idReadable', query: query, $skip: skip, $top: PAGE } })
      .then(function (raw) {
        var arr = Array.isArray(raw) ? raw : [];
        total += arr.length;
        if (arr.length < PAGE) return { total: total, capped: false };
        if (skip >= 20000) return { total: total, capped: true };   /* страница полная И кап — дальше не считаем */
        skip += PAGE;
        return step();
      });
  }
  return step();
}

/* A7 Aging: #Unresolved задачи проекта → примитив → дни-в-статусе + флаг порога. */
const _loadA7 = makeReportLoader('A7', 'a', function (ctx) {
  var deps = ctx.deps, base = ctx.base, pure = ctx.pure;
  var thresholds = ctx.settings.reportingThresholds || {};
  var fieldSystem = _fieldSystemEff(ctx.settings);   /* v3.9.0 — колонка «Система» */
  return ctx.fetchIssues(ISSUE_FIELDS, ctx.queryParts(['#Unresolved'], 'updated asc')).then(function (f) {   /* активные = нерешённые; #58-5 — давно не тронутые первыми (аудитория Aging) */
    var m = _mapIssues(f.arr, ctx.fieldState);
    return deps.bulkStateTransitions(deps, m.ids, { fieldId: m.fieldId, shouldAbort: base.shouldAbort }).then(function (prim) {
      if (!_fresh(base)) return;                         /* устаревший ответ — не монтируем */
      var built = pure.buildAgingRows(m.issues, prim, prim.incomplete, thresholds, Date.now());
      _attachSystem(built.rows, f.arr, fieldSystem);
      ctx.mount({ loading: false, rows: built.rows, hasSystem: !!fieldSystem,
        incompleteCount: built.incomplete.length, limitHit: f.limitHit, limit: LIMIT, diag: prim.diag });
    });
  });
});

/* A1 Прогресс: задачи В целевых статусах (State: {t1},{t2} — БЕЗ #Unresolved) → примитив →
   окно периода (полуоткрытое, live Date.now — контракт) → buildProgressRows (переходы в окне).
   ⚖ КОНТРАКТ ПОПУЛЯЦИИ (ревью #50): считаются только задачи, стоящие в целевом статусе НА МОМЕНТ
   прогона, по НОВЕЙШЕМУ входу (примитив хранит один переход). Реопенутая после входа в окне или
   ушедшая дальше по цепочке целевых → в отчёт не попадает. Ретро-семантика требует activities по
   всей популяции проекта (кратно дороже) — осознанный трейд-офф; юзеру сигналим L.a1PopNote. */
const _loadA1 = makeReportLoader('A1', 'a', function (ctx) {
  var deps = ctx.deps, base = ctx.base, settings = ctx.settings, pure = ctx.pure;
  var targets = Array.isArray(settings.reportingTargetStatuses) ? settings.reportingTargetStatuses.filter(Boolean) : [];
  if (!targets.length) { ctx.mount({ loading: false, noTargets: true }); return; }
  /* «Свой диапазон» без обеих дат — не ошибка, а незаданный ввод: нейтральная подсказка. */
  var win = ctx.window({ loading: false, rangePrompt: true }, { loading: false, error: true });
  if (!win) return;
  var statusLabels = (settings.reportingStatusLabels && typeof settings.reportingStatusLabels === 'object'
    && !Array.isArray(settings.reportingStatusLabels)) ? settings.reportingStatusLabels : {};
  var fieldSystem = _fieldSystemEff(settings);           /* v3.9.0 — колонка «Система» */
  return ctx.fetchIssues(ISSUE_FIELDS, ctx.queryParts(
    [_battr(ctx.fieldState) + ': ' + targets.map(function (s) { return '{' + s + '}'; }).join(', '),
     'updated: ' + _fmtDayUTC(win.fromTs) + ' .. *'])).then(function (f) {   /* #58-5 — вход в окне ⇒ update в окне (суперсет) */
    var m = _mapIssues(f.arr, ctx.fieldState);
    return deps.bulkStateTransitions(deps, m.ids, { fieldId: m.fieldId, shouldAbort: base.shouldAbort }).then(function (prim) {
      if (!_fresh(base)) return;                         /* устаревший ответ — не монтируем */
      var built = pure.buildProgressRows(m.issues, prim, prim.incomplete, statusLabels, win);
      _attachSystem(built.rows, f.arr, fieldSystem);     /* v3.9.0 — колонка «Система» */
      ctx.mount({ loading: false, rows: built.rows, hasSystem: !!fieldSystem,
        incompleteCount: built.incomplete.length, limitHit: f.limitHit, limit: LIMIT, diag: prim.diag });
    });
  });
});

/* A2 TTM: популяция задач проекта (Type скоупит аналитик через QueryAssist — НЕ форсим) →
   первые входы в якорные состояния + таймлайн + паузы (состояния+теги) → computeTtm.
   Окно [from,to) фильтрует популяцию по входу в КОНЕЦ-якорь lead (populationMetric). */
const _loadA2 = makeReportLoader('A2', 'a', function (ctx) {
  var deps = ctx.deps, base = ctx.base, settings = ctx.settings, pure = ctx.pure;
  var ttm = _ttm();
  if (!ttm || typeof deps.bulkAnchorTransitions !== 'function') {
    ctx.mount({ report: 'a2', error: true }); return;
  }
  var anchors = (settings.reportingAnchors && typeof settings.reportingAnchors === 'object'
    && !Array.isArray(settings.reportingAnchors)) ? settings.reportingAnchors : {};
  var norms = (settings.reportingTtmNorms && typeof settings.reportingTtmNorms === 'object'
    && !Array.isArray(settings.reportingTtmNorms)) ? settings.reportingTtmNorms : { lead: 21, team: 15, cycle: null };
  var pmRaw = (settings.reportingPauseMarkers && typeof settings.reportingPauseMarkers === 'object'
    && !Array.isArray(settings.reportingPauseMarkers)) ? settings.reportingPauseMarkers : {};
  var pm = { states: Array.isArray(pmRaw.states) ? pmRaw.states.filter(Boolean) : [],
             tags: Array.isArray(pmRaw.tags) ? pmRaw.tags.filter(Boolean) : [] };
  var lead = anchors.lead || {};
  /* lead — популяционная метрика: без обоих концов пары считать нечего → подсказка. */
  if (lead.start == null || lead.end == null) {
    ctx.mount({ report: 'a2', noAnchors: true }); return;
  }
  /* «Свой диапазон» без обеих дат — незаданный ввод, нейтральная подсказка (не ошибка). */
  var win = ctx.window({ report: 'a2', rangePrompt: true }, { report: 'a2', error: true });
  if (!win) return;
  var typeNames = settings.fieldType ? [settings.fieldType, 'Type', 'Тип'] : ['Type', 'Тип'];
  var anchorStates = _anchorStateSet(anchors);
  var pausesActive = (pm.states.length || pm.tags.length) > 0;
  /* QueryAssist AND — Type НЕ форсим (D-скоуп аналитика) */
  return ctx.fetchIssues(ISSUE_FIELDS_A2, ctx.queryParts(
    ['updated: ' + _fmtDayUTC(win.fromTs) + ' .. *'])).then(function (f) {   /* #58-5 — вход в якорь в окне ⇒ update в окне */
    var m = _mapIssuesA2(f.arr, ctx.fieldState, typeNames);
    if (deps.diag) deps.diag('reporting A2 map: issues=' + m.issues.length +
      ' typed=' + m.diag.typed + ' parentEpic=' + m.diag.parentResolved, 'ok');
    return deps.bulkAnchorTransitions(deps, m.ids, { fieldId: m.fieldId, anchorStates: anchorStates, shouldAbort: base.shouldAbort })
      .then(function (aRes) {
        var tagP = pm.tags.length ? deps.bulkPauseTagIntervals(deps, m.ids, { tags: pm.tags, shouldAbort: base.shouldAbort })
          : { intervals: {}, diag: {} };
        return Promise.resolve(tagP).then(function (tRes) {
          if (!_fresh(base)) return;                        /* устаревший ответ — не монтируем */
          var pauses = (typeof deps.combinePauses === 'function')
            ? deps.combinePauses(aRes.timelines, pm.states, tRes.intervals || {}) : {};
          var units = ttm.foldChildUnits(m.issues);
          var config = { anchors: anchors, norms: norms, buckets: [40, 120], riskDays: 80, populationMetric: 'lead',
            terminalPolicy: _terminalPolicy(settings) };
          var incA2 = _unionIds(aRes.incomplete, tRes.incomplete);   /* hitTop пауз-тегов = тоже неполнота */
          var res = ttm.computeTtm(units, aRes.anchors, pauses, incA2, config, win, Date.now(),
            { workdaysBetween: pure.workdaysBetween, agingLevel: pure.agingLevel }, aRes.timelines);
          var tiles = res.tiles.map(function (t) {
            return { metric: t.metric, median: t.median, n: t.n, norm: t.norm, level: _tileLevel(t.median, t.norm) };
          });
          ctx.mount({ report: 'a2', loading: false, noAnchors: false,
            rangePrompt: false, pausesActive: pausesActive, tiles: tiles, typeRows: res.rows,
            buckets: res.buckets, riskCount: res.riskCount, riskDays: 80,
            populationCount: res.populationCount, incompleteCount: incA2.length,
            limitHit: f.limitHit, limit: LIMIT, tagPausePending: !!(tRes.diag && tRes.diag.needsSmokeVerify) });
        });
      });
  });
});

/* A8/A9 «Поток»: популяция задач проекта (QueryAssist скоупит аналитик — НЕ форсим) → ПОЛНЫЙ
   таймлайн переходов (bulkAnchorTransitions.timelines = все переходы стейт-поля; anchorStates —
   только для неиспользуемого здесь anchors-выхода) + паузы (состояния+теги) → computeBottleneck
   (dwell+WIP, открытый интервал до now) + computeRework (откаты в окне [from,to)). Окно периода
   режет ТОЛЬКО откаты A9 (как A1); dwell A8 — по всей истории (D9). currentStates = текущий статус
   задачи из фетча → точный WIP (вкл. задачи без переходов). incomplete D7 вне обоих движков. */
const _loadFlow = makeReportLoader('Flow', 'a', function (ctx) {
  var deps = ctx.deps, base = ctx.base, settings = ctx.settings, pure = ctx.pure;
  var ttm = _ttm();
  if (!ttm || typeof deps.bulkAnchorTransitions !== 'function') {
    ctx.mount({ report: 'flow', error: true }); return;
  }
  var flowStates = Array.isArray(settings.reportingFlowStates) ? settings.reportingFlowStates.filter(Boolean) : [];
  /* Поток не задан (нужно ≥2 статуса для порядка/откатов) → подсказка настроить. */
  if (flowStates.length < 2) {
    ctx.mount({ report: 'flow', noFlow: true }); return;
  }
  var win = ctx.window({ report: 'flow', rangePrompt: true }, { report: 'flow', error: true });
  if (!win) return;
  var thresholds = (settings.reportingThresholds && typeof settings.reportingThresholds === 'object'
    && !Array.isArray(settings.reportingThresholds)) ? settings.reportingThresholds : {};
  var pmRaw = (settings.reportingPauseMarkers && typeof settings.reportingPauseMarkers === 'object'
    && !Array.isArray(settings.reportingPauseMarkers)) ? settings.reportingPauseMarkers : {};
  var pm = { states: Array.isArray(pmRaw.states) ? pmRaw.states.filter(Boolean) : [],
             tags: Array.isArray(pmRaw.tags) ? pmRaw.tags.filter(Boolean) : [] };
  var pausesActive = (pm.states.length || pm.tags.length) > 0;
  /* QueryAssist AND — скоуп аналитика (D-скоуп) */
  /* #58-5 — WIP-срезу нужны текущие задачи потока, откатам — переходы окна; давно ушедшие
     из потока и не тронутые в окне не тянем (их закрытые dwell-интервалы вне фокуса «сейчас»). */
  var flowClause = 'and (' + _battr(ctx.fieldState) + ': ' +
    flowStates.map(function (st) { return '{' + st + '}'; }).join(', ') +
    ' or updated: ' + _fmtDayUTC(win.fromTs) + ' .. *)';
  return ctx.fetchIssues(ISSUE_FIELDS, ctx.queryParts([flowClause])).then(function (f) {
    var m = _mapIssues(f.arr, ctx.fieldState);
    var currentStates = {};
    m.issues.forEach(function (u) { if (u.state) currentStates[u.id] = u.state; });   /* текущий статус → WIP */
    var anchorStates = flowStates.concat(pm.states);
    if (deps.diag) deps.diag('reporting Flow map: issues=' + m.issues.length + ' flow=' + flowStates.length, 'ok');
    return deps.bulkAnchorTransitions(deps, m.ids, { fieldId: m.fieldId, anchorStates: anchorStates, shouldAbort: base.shouldAbort })
      .then(function (aRes) {
        var tagP = pm.tags.length ? deps.bulkPauseTagIntervals(deps, m.ids, { tags: pm.tags, shouldAbort: base.shouldAbort })
          : { intervals: {}, diag: {} };
        return Promise.resolve(tagP).then(function (tRes) {
          if (!_fresh(base)) return;                        /* устаревший ответ — не монтируем */
          var pauses = (typeof deps.combinePauses === 'function')
            ? deps.combinePauses(aRes.timelines, pm.states, tRes.intervals || {}) : {};
          var deps2 = { workdaysBetween: pure.workdaysBetween, agingLevel: pure.agingLevel };
          var incFlow = _unionIds(aRes.incomplete, tRes.incomplete);   /* hitTop пауз-тегов = тоже неполнота */
          var bn = ttm.computeBottleneck(aRes.timelines, pauses, incFlow,
            { flowStates: flowStates, thresholds: thresholds, currentStates: currentStates }, Date.now(), deps2);
          var rw = ttm.computeRework(aRes.timelines, incFlow, { flowStates: flowStates }, win);
          ctx.mount({ report: 'flow', loading: false, noFlow: false, rangePrompt: false,
            pausesActive: pausesActive, bottleneck: bn.states, populationCount: bn.populationCount,
            rework: rw, incompleteCount: incFlow.length,
            limitHit: f.limitHit, limit: LIMIT, tagPausePending: !!(tRes.diag && tRes.diag.needsSmokeVerify) });
        });
      });
  });
});

/* Логин исполнителя из user-cf: value = {login} (одиночное) или [{login}] (мульти → первый). */
function _userLogin(cf) {
  if (!cf) return '';
  var v = cf.value;
  if (Array.isArray(v)) v = v[0];
  return (v && v.login) ? String(v.login) : '';
}
/* Из сырых задач + активных ролей → { roleExecutors:{issueId→{roleKey→login}}, ids:[все id] }.
   roleExecutors ставится ТОЛЬКО когда у задачи есть хоть один назначенный исполнитель роли;
   ids собираются по всей популяции (нужны для workItems-фетча независимо от ролей). */
function _buildRoleExecutors(arr, roles) {
  var out = {}, ids = [];
  for (var i = 0; i < arr.length; i++) {
    var iss = arr[i]; if (!iss || !iss.idReadable) continue;
    ids.push(iss.idReadable);
    var map = null;
    for (var r = 0; r < roles.length; r++) {
      var role = roles[r]; if (!role || !role.fieldName) continue;
      var login = _userLogin(_cf(iss, role.fieldName));
      if (login) { if (!map) map = {}; map[role.key] = login; }
    }
    if (map) out[iss.idReadable] = map;
  }
  return { roleExecutors: out, ids: ids };
}

/* A4 Трудозатраты: популяция проекта (QueryAssist скоупит аналитик) + user-поля ролей → roleExecutors;
   нативные workItems за окно периода (bulkWorkItems, серверный `work date:`) → buildWorkloadRows
   (часы по человек×роль + «кто не списал»). Окно режет workItems по дате списания (D9). */
const _loadA4 = makeReportLoader('A4', 'a', function (ctx) {
  var deps = ctx.deps, base = ctx.base, pure = ctx.pure;
  if (typeof deps.bulkWorkItems !== 'function' || typeof pure.buildWorkloadRows !== 'function') {
    ctx.mount({ report: 'a4', error: true }); return;
  }
  var roles = Array.isArray(deps.roles) ? deps.roles : [];
  var win = ctx.window({ report: 'a4', rangePrompt: true }, { report: 'a4', error: true });
  if (!win) return;
  var roleLabels = {};
  roles.forEach(function (r) { roleLabels[r.key] = r.label || r.key; });
  /* QueryAssist AND — скоуп аналитика (D-скоуп) */
  return ctx.fetchIssues(ISSUE_FIELDS_A4, ctx.queryParts(
    ['work date: ' + _fmtDayUTC(win.fromTs) + ' .. ' + _fmtDayUTC(win.toTs - 1)])).then(function (f) {   /* #58-5 — только задачи со списаниями в окне */
    var built = _buildRoleExecutors(f.arr, roles);
    if (deps.diag) deps.diag('reporting A4 pop=' + built.ids.length +
      ' withRole=' + Object.keys(built.roleExecutors).length + ' roles=' + roles.length, 'ok');
    return deps.bulkWorkItems(deps, built.ids, { window: win, shouldAbort: base.shouldAbort }).then(function (wi) {
      if (!_fresh(base)) return;                          /* устаревший ответ — не монтируем */
      var res = pure.buildWorkloadRows(wi.items, built.roleExecutors, wi.incomplete);
      /* incompleteCount из ПРИМИТИВА (wi.incomplete), не из res: движок строит incomplete по
         присутствующим items → полностью упавший чанк (0 items, D7) в res не попал бы, баннер
         бы молчал. wi.incomplete — авторитетный суперсет (как _loadFlow/_loadA2). */
      ctx.mount({ report: 'a4', loading: false,
        workloadRows: res.rows, noLog: res.noLog, roleLabels: roleLabels,
        totalMinutes: res.totalMinutes, authorCount: res.authorCount, populationCount: built.ids.length,
        incompleteCount: (wi.incomplete || []).length, limitHit: f.limitHit, limit: LIMIT });
    });
  });
});

/* A5 План-факт: популяция = задачи, вошедшие в Лид-КОНЕЦ в окне периода (как A2 — завершённая
   работа, факт финален). На КАЖДУЮ роль: as-of оценка (значение period-поля на входе в Лид-СТАРТ,
   bulkAsOfEstimates) vs кумулятивный факт (Σ workItems роли, всё время) → знаковое расхождение.
   name→id полей оценки резолвим ОДИН раз из CF отобранных задач (тот же id и в fieldIds примитива,
   и в roles движка — иначе тихий current-as-asof). incomplete = ОБЪЕДИНЕНИЕ якорь∪asOf∪workItems (D7). */
const _loadA5 = makeReportLoader('A5', 'a', function (ctx) {
  var deps = ctx.deps, base = ctx.base, settings = ctx.settings, pure = ctx.pure;
  if (typeof deps.bulkAsOfEstimates !== 'function' || typeof deps.bulkAnchorTransitions !== 'function'
      || typeof deps.bulkWorkItems !== 'function' || typeof pure.computePlanFact !== 'function') {
    ctx.mount({ report: 'a5', error: true }); return;
  }
  var anchors = (settings.reportingAnchors && typeof settings.reportingAnchors === 'object'
    && !Array.isArray(settings.reportingAnchors)) ? settings.reportingAnchors : {};
  var lead = anchors.lead || {};
  if (lead.start == null || lead.end == null) {           /* без Лид-пары нет ни популяции, ни as-of */
    ctx.mount({ report: 'a5', noAnchors: true }); return;
  }
  var win = ctx.window({ report: 'a5', rangePrompt: true }, { report: 'a5', error: true });
  if (!win) return;
  var roles = Array.isArray(deps.roles) ? deps.roles : [];
  var threshold = (typeof settings.reportingVariancePct === 'number' && isFinite(settings.reportingVariancePct)
    && settings.reportingVariancePct > 0) ? settings.reportingVariancePct : 20;
  var fieldSystem = _fieldSystemEff(settings);           /* v3.9.0 — колонка «Система» */
  /* QueryAssist AND (D-скоуп аналитика) */
  return ctx.fetchIssues(ISSUE_FIELDS_A5, ctx.queryParts(
    ['updated: ' + _fmtDayUTC(win.fromTs) + ' .. *'])).then(function (f) {   /* #58-5 — вход в Лид-конец в окне ⇒ update в окне */
      var arr = f.arr, limitHit = f.limitHit;
      var m = _mapIssues(arr, ctx.fieldState);             /* state-field id для якорей + summary */
      var built = _buildRoleExecutors(arr, roles);         /* исполнители ролей (login) */
      /* name→id полей оценки (ОДИН резолв) + rolesEng для движка + fieldIds для примитива. */
      var fieldIds = [], seenFid = {}, rolesEng = [], unresolved = 0;
      roles.forEach(function (r) {
        var fid = r.estField ? _fieldIdByName(arr, r.estField) : '';
        if (!fid) { unresolved++; return; }               /* поле оценки не настроено/не найдено — роль вне отчёта */
        if (!seenFid[fid]) { seenFid[fid] = true; fieldIds.push(fid); }
        rolesEng.push({ key: r.key, label: r.label || r.key, fieldId: fid });
      });
      var currentById = {};                                /* текущее значение полей оценки per задача (as-of fallback) */
      for (var ai = 0; ai < arr.length; ai++) {
        var iss = arr[ai]; if (!iss || !iss.idReadable) continue;
        var cur = {};
        for (var fi = 0; fi < fieldIds.length; fi++) { var mv = _cfMinutesById(iss, fieldIds[fi]); if (mv != null) cur[fieldIds[fi]] = mv; }
        currentById[iss.idReadable] = cur;
      }
      if (deps.diag) deps.diag('reporting A5 pop=' + m.ids.length + ' roles=' + rolesEng.length +
        ' unresolved=' + unresolved + ' estFields=' + fieldIds.length, unresolved ? 'warn' : 'ok');
      /* O1 (ревью #50): один activities-фетч — anchors + estTimelines из одного ответа. */
      return deps.bulkAnchorTransitions(deps, m.ids, { fieldId: m.fieldId, anchorStates: [lead.start, lead.end], estFieldIds: fieldIds, shouldAbort: base.shouldAbort })
        .then(function (aRes) {
          /* Популяция = вошли в Лид-КОНЕЦ в окне [from,to). asOf ts = вход в Лид-СТАРТ (нет → null → текущее). */
          var popIssues = [], asOfById = {};
          m.issues.forEach(function (it) {
            var an = aRes.anchors[it.id] || {};
            var endTs = an[lead.end];
            if (typeof endTs !== 'number' || !isFinite(endTs) || endTs < win.fromTs || endTs >= win.toTs) return;
            popIssues.push({ id: it.id, summary: it.summary });
            var st = an[lead.start]; asOfById[it.id] = (typeof st === 'number') ? st : null;
          });
          var popIds = popIssues.map(function (x) { return x.id; });
          var esAsOf = _asOfFromEstTimelines(pure, popIds, aRes.estTimelines, currentById, asOfById, fieldIds);
          return deps.bulkWorkItems(deps, popIds, { window: { fromTs: 0, toTs: Date.now() }, shouldAbort: base.shouldAbort }).then(function (wi) {
            if (!_fresh(base)) return;                  /* устаревший ответ — не монтируем */
            var incSet = {};                            /* incomplete = ОБЪЕДИНЕНИЕ примитивов; aRes уже несёт anchors∪est (fail-loud D7) */
            (aRes.incomplete || []).forEach(function (id) { incSet[id] = true; });
            (wi.incomplete || []).forEach(function (id) { incSet[id] = true; });
            var incomplete = Object.keys(incSet);
            var res = pure.computePlanFact({ issues: popIssues, asOf: esAsOf, workItems: wi.items,
              roleExecutors: built.roleExecutors, roles: rolesEng, incomplete: incomplete, threshold: threshold });
            _attachSystem(res.rows, arr, fieldSystem);  /* v3.9.0 — колонка «Система» */
            ctx.mount({ report: 'a5', loading: false, noAnchors: false, rangePrompt: false, hasSystem: !!fieldSystem,
              rollups: res.rollups, rows: res.rows, threshold: threshold,
              populationCount: res.populationCount, incompleteCount: incomplete.length, limitHit: limitHit, limit: LIMIT });
          });
        });
    });
});

/* A3 WIP/Done — СНИМОК текущего среза (арх-спека §56: вне движка, БЕЗ activities/примитивов
   /без периода). Популяция = задачи проекта (+ QueryAssist). Классификация WIP/Done по
   reportingTargetStatuses (Done = в целевых статусах; WIP = остальные) — обе группы из ОДНОГО
   фетча, тоггл фильтрует клиентски (react). Бизнес-колонки (Бизнес-этап/Орг-юнит/Приоритет) —
   опциональны: рендерятся только при заданном имени поля (reportingA3*Field, graceful-degrade).
   Оценки — per-role текущее value.minutes. Стейт-имя для среза берём из value.name (как _mapIssues,
   матч с reportingTargetStatuses), бизнес-значения — localizedName||name||presentation (RU-дисплей). */
const _loadA3 = makeReportLoader('A3', 'a', function (ctx) {
  var deps = ctx.deps, base = ctx.base, settings = ctx.settings;
  var doneSet = {};
  (Array.isArray(settings.reportingTargetStatuses) ? settings.reportingTargetStatuses : []).forEach(function (s) { if (s) doneSet[s] = true; });
  var roles = (Array.isArray(deps.roles) ? deps.roles : []).filter(function (r) { return r && r.estField; })
    .map(function (r) { return { key: r.key, label: r.label || r.key, estField: r.estField }; });
  var stageField = (typeof settings.reportingA3StageField === 'string' && settings.reportingA3StageField) || '';
  var orgField = (typeof settings.reportingA3OrgField === 'string' && settings.reportingA3OrgField) || '';
  var prioField = (typeof settings.reportingA3PriorityField === 'string' && settings.reportingA3PriorityField) || '';
  var fieldSystem = _fieldSystemEff(settings);           /* v3.9.0 — колонка «Система» */
  /* QueryAssist AND (D-скоуп аналитика) */
  return ctx.fetchIssuesPaged(ISSUE_FIELDS_A3, ctx.queryParts(null, 'updated desc')).then(function (f) {   /* #58-5 — свежайшие первыми; ш2 — страницы до потолка */
    if (!_fresh(base)) return;                           /* устаревший ответ — не монтируем */
    var arr = f.arr;
    var rows = [], wipCount = 0, doneCount = 0;
    for (var i = 0; i < arr.length; i++) {
      var iss = arr[i]; if (!iss || !iss.idReadable) continue;
      var st = _cf(iss, ctx.fieldState); var state = (st && st.value && st.value.name) || '';
      var mode = doneSet[state] ? 'done' : 'wip';
      if (mode === 'done') doneCount++; else wipCount++;
      var est = {};
      for (var ri = 0; ri < roles.length; ri++) est[roles[ri].key] = _cfMin(iss, roles[ri].estField);
      rows.push({ id: iss.idReadable, summary: iss.summary || '', state: state, mode: mode, est: est,
        stage: stageField ? _cfText(iss, stageField) : '', org: orgField ? _cfText(iss, orgField) : '',
        priority: prioField ? _cfText(iss, prioField) : '',
        system: fieldSystem ? _sysValOf(iss, fieldSystem) : '' });
    }
    ctx.mount({ report: 'a3', loading: false, rows: rows, hasSystem: !!fieldSystem,
      a3NoDone: !Object.keys(doneSet).length,   /* #57-5 Н4 — подсказка вместо молчаливого Done=0 */
      wipCount: wipCount, doneCount: doneCount, limitHit: f.limitHit, limit: f.max,
      snapRoles: roles.map(function (r) { return { key: r.key, label: r.label }; }),
      snapCols: { stage: !!stageField, org: !!orgField, priority: !!prioField } });
  });
});

/* A6 Бэклог в ЧЧ по ролям — СНИМОК (арх §56: вне движка, без activities/периода). Популяция =
   определение бэклога #21 (backlogStartStates ∪ backlogZones[].state + backlogTypeFilter) СВОИМ
   фетчем (НЕ coupled loadBacklogPool — тот пишет _backlogPool/тянет carryover/parent); пустая
   конфигурация → все #Unresolved проекта + подсказка донастроить (noBacklogCfg). QueryAssist AND.
   На КАЖДУЮ активную роль: Σ текущих оценок (value.minutes, как A3) → ЧЧ + «месяцев» = ЧЧ ÷ месячная
   ёмкость роли (reportingRoleMonthlyCapacity, ч/мес — B1 top-down; нет ёмкости → гейдж «—»). */
const _loadA6 = makeReportLoader('A6', 'a', function (ctx) {
  var deps = ctx.deps, settings = ctx.settings, base = ctx.base, pure = ctx.pure;
  if (typeof pure.buildBacklogRows !== 'function') { ctx.mount({ report: 'a6', error: true }); return; }
  var roles = (Array.isArray(deps.roles) ? deps.roles : []).filter(function (r) { return r && r.estField; })
    .map(function (r) { return { key: r.key, label: r.label || r.key, estField: r.estField }; });
  var capRaw = (settings.reportingRoleMonthlyCapacity && typeof settings.reportingRoleMonthlyCapacity === 'object'
    && !Array.isArray(settings.reportingRoleMonthlyCapacity)) ? settings.reportingRoleMonthlyCapacity : {};
  var stSet = {}, states = [];                              /* union состояний бэклога #21 (start ∪ zones) */
  (Array.isArray(settings.backlogStartStates) ? settings.backlogStartStates : []).forEach(function (s) { if (s && !stSet[s]) { stSet[s] = 1; states.push(s); } });
  (Array.isArray(settings.backlogZones) ? settings.backlogZones : []).forEach(function (z) { var s = z && z.state; if (s && !stSet[s]) { stSet[s] = 1; states.push(s); } });
  var types = (Array.isArray(settings.backlogTypeFilter) ? settings.backlogTypeFilter : []).filter(Boolean);
  var fieldType = (typeof settings.fieldType === 'string' && settings.fieldType) ? settings.fieldType : 'Type';
  var noBacklogCfg = states.length === 0;
  var extras = [];
  if (states.length) extras.push(_battr(ctx.fieldState) + ': ' + states.map(function (s) { return '{' + s + '}'; }).join(', '));
  else extras.push('#Unresolved');                         /* нет конфигурации бэклога → все нерешённые + подсказка */
  if (types.length) extras.push(_battr(fieldType) + ': ' + types.map(function (s) { return '{' + s + '}'; }).join(', '));
  /* QueryAssist AND (D-скоуп аналитика) */
  return ctx.fetchIssuesPaged(ISSUE_FIELDS_A3, ctx.queryParts(extras, 'updated desc')).then(function (f) {   /* #58-5; ш2 — страницы до потолка */
    if (!_fresh(base)) return;                            /* устаревший ответ — не монтируем */
    var arr = f.arr;
    var perIssue = [];
    for (var i = 0; i < arr.length; i++) {
      var iss = arr[i]; if (!iss || !iss.idReadable) continue;
      var est = {};
      for (var ri = 0; ri < roles.length; ri++) est[roles[ri].key] = _cfMin(iss, roles[ri].estField);
      perIssue.push({ est: est });
    }
    var capHours = {};
    for (var ci = 0; ci < roles.length; ci++) { var cv = capRaw[roles[ci].key]; if (typeof cv === 'number' && isFinite(cv)) capHours[roles[ci].key] = cv; }
    var built = pure.buildBacklogRows(perIssue, roles.map(function (r) { return { key: r.key, label: r.label }; }), capHours, A6_NORM_MONTHS);
    ctx.mount({ report: 'a6', loading: false, rows: built.rows, norm: built.norm,
      noBacklogCfg: noBacklogCfg, populationCount: perIssue.length, limitHit: f.limitHit, limit: f.max });
  });
});

/* A10 Spillover — планер-нативный из ssp_history (retro-only): свежий GET /history через
   deps.fetchHistory → база закрытых спринтов (dedupe по baseId, FINISHED) для пикера N → дифф
   соседних снимков по-рольно (pure.computeSpillover). done = standupDoneStates (fallback = 2 послед.
   stateRollupOrder). Единица ЧЧ (estimate_<rk>=минуты). Свой sprint-пикер (вне isWindowed). */
const _loadA10 = makeReportLoader('A10', 'a', function (ctx) {
  var deps = ctx.deps, base = ctx.base, settings = ctx.settings, pure = ctx.pure;
  if (typeof pure.computeSpillover !== 'function' || typeof deps.fetchHistory !== 'function') {
    ctx.mount({ report: 'a10', error: true }); return;
  }
  var roles = (Array.isArray(deps.roles) ? deps.roles : []).map(function (r) { return { key: r.key, label: r.label || r.key }; });
  var doneStates = (Array.isArray(settings.standupDoneStates) && settings.standupDoneStates.length)
    ? settings.standupDoneStates
    : (Array.isArray(settings.stateRollupOrder) ? settings.stateRollupOrder.slice(-2) : []);
  var ab = (settings.reportingSpilloverAgeBands && typeof settings.reportingSpilloverAgeBands === 'object') ? settings.reportingSpilloverAgeBands : {};
  var ageBands = { warm: (typeof ab.warm === 'number' ? ab.warm : 2), hot: (typeof ab.hot === 'number' ? ab.hot : 5) };
  var ui = (deps.draftGet && deps.draftGet('ui')) || {};
  return deps.fetchHistory(deps).then(function (r) {
    if (!_fresh(base)) return;
    var history = (r && Array.isArray(r.history)) ? r.history : [];
    var byBase = {}, order = [];                              /* база закрытых спринтов для пикера */
    for (var i = 0; i < history.length; i++) {
      var rec = history[i]; if (!rec || rec.status !== 'FINISHED' || !rec.sprintId) continue;
      var us = String(rec.sprintId).lastIndexOf('_');
      var bid = us > 0 ? rec.sprintId.slice(0, us) : rec.sprintId;
      if (!byBase[bid]) { byBase[bid] = { key: bid, label: rec.name || bid, dateStart: (typeof rec.dateStart === 'number' ? rec.dateStart : 0) }; order.push(byBase[bid]); }
    }
    order.sort(function (a, b) { return b.dateStart - a.dateStart; });   /* новейшие первыми */
    if (!order.length) { ctx.mount({ report: 'a10', loading: false, sprints: [], a10Empty: true }); return; }
    var sel = (ui.reportingSpillSprint && byBase[ui.reportingSpillSprint]) ? ui.reportingSpillSprint
      : (order.length >= 2 ? order[1].key : order[0].key);   /* дефолт — спринт С преемником (второй новейший) */
    var out = pure.computeSpillover(history, { roles: roles, doneStates: doneStates, ageBands: ageBands }, sel);
    var roleRows = (out.roleRows || []).filter(function (rr) { return rr.plannedMinutes > 0; });   /* пустые роли — шум */
    ctx.mount({ report: 'a10', loading: false, hasSystem: !!_fieldSystemEff(settings),
      sprints: order.map(function (b) { return { key: b.key, label: b.label }; }), spillSprint: sel,
      roleRows: roleRows, tails: out.tails || [], ages: out.ages || [], hasN1: out.hasN1,
      noDoneCfg: !doneStates.length });
  });
});

/* v3.12.0 (#11) — A11 Velocity: скорость команды по ролям из FINISHED-снимков ssp_history
   (планер-нативный, как A10). done-канон = A10 (standupDoneStates || хвост stateRollupOrder);
   окно среднего — settings.reportingVelocityWindow (1..10, дефолт 3). Расчёт —
   pure/velocity-pure.computeRoleVelocity (ЕДИНЫЙ источник velocity: сюда же позже
   подключается коэффициент авто-прогноза #40 v2). */
function _vpure() { return (typeof window !== 'undefined' && window.__SSP_VELOCITY_PURE) || null; }

const _loadA11 = makeReportLoader('A11', 'a', function (ctx) {
  var deps = ctx.deps, settings = ctx.settings, base = ctx.base;
  var vp = _vpure();
  if (!vp || typeof vp.computeRoleVelocity !== 'function' || typeof deps.fetchHistory !== 'function') {
    ctx.mount({ report: 'a11', error: true }); return;
  }
  var roles = (Array.isArray(deps.roles) ? deps.roles : []).map(function (r) { return { key: r.key, label: r.label || r.key }; });
  var doneStates = (Array.isArray(settings.standupDoneStates) && settings.standupDoneStates.length)
    ? settings.standupDoneStates
    : (Array.isArray(settings.stateRollupOrder) ? settings.stateRollupOrder.slice(-2) : []);
  var win = (typeof settings.reportingVelocityWindow === 'number' && isFinite(settings.reportingVelocityWindow)
    && settings.reportingVelocityWindow >= 1 && settings.reportingVelocityWindow <= 10)
    ? Math.round(settings.reportingVelocityWindow) : 3;
  return deps.fetchHistory(deps).then(function (r) {
    if (!_fresh(base)) return;
    var history = (r && Array.isArray(r.history)) ? r.history : [];
    var out = vp.computeRoleVelocity(history, { roles: roles, doneStates: doneStates, window: win });
    var roleRows = out.roleRows || [];
    ctx.mount({ report: 'a11', loading: false, window: win,
      roleRows: roleRows, a11Empty: !roleRows.length, noDoneCfg: !doneStates.length });
  });
});

/* #50 S8a — контур B (управленческий): диспетч по ui.reportingReportB (пока только B3).
   Своя ветка стейта (reportingReportB/PeriodB/PeriodOptsB) — ui.reportingReport общий, но под
   контур B он не действует (A монтируется по нему, B — по своему ключу). */
function _loadContourB(deps, L, run) {
  var ui = (deps.draftGet && deps.draftGet('ui')) || {};
  var report = (ui.reportingReportB === 'b3') ? 'b3'
    : (ui.reportingReportB === 'b2') ? 'b2'
    : (ui.reportingReportB === 'b0') ? 'b0' : 'b1';   /* дефолт B1 Техдолг (B0 Свод — явным выбором) */
  var period = String(ui.reportingPeriodB || 'last30');
  var periodOpts = (ui.reportingPeriodOptsB && typeof ui.reportingPeriodOptsB === 'object') ? ui.reportingPeriodOptsB : {};
  function _patchB(p, doRun) {
    var u = (deps.draftGet && deps.draftGet('ui')) || {};
    for (var k in p) u[k] = p[k];
    if (deps.draftSet) deps.draftSet('ui', u);
    loadAndRender(deps, 'b', !!doRun);   /* #58-12 */
  }
  var nowY = new Date(Date.now()).getUTCFullYear();
  var _hostB = document.getElementById(_hostId('b'));
  var gen = (((_hostB && _hostB.__sspReportingGen) || 0) + 1);
  if (_hostB) _hostB.__sspReportingGen = gen;
  /* Смена проекта инвалидирует цель отката (см. loadAndRender контура A). */
  var projKey = _activeProj(deps);
  if (_hostB && _hostB.__sspReportingProj !== projKey) {
    _hostB.__sspReportingProj = projKey;
    _hostB.__sspReportingGood = null;
    _hostB.__sspReportingBase = null;
  }
  var base = {
    contour: 'b', report: report, labels: L, query: '', period: period, periodOpts: periodOpts, gen: gen,
    lang: (typeof deps.getLang === 'function' && deps.getLang()) || 'en',   /* #94 — даты в языке планера, не браузера */
    years: [nowY, nowY - 1, nowY - 2, nowY - 3, nowY - 4],
    onSwitchReport: function (r) { _patchB({ reportingReportB: (r === 'b3' || r === 'b2' || r === 'b1' || r === 'b0') ? r : 'b1' }); },
    onSetPeriod: function (preset, opts) { _patchB({ reportingPeriodB: String(preset || 'last30'), reportingPeriodOptsB: opts || {} }); },
    onRefresh: function () { _patchB({}, true); },   /* #58-12 — явный запуск (B без свободного фильтра) */
    onAssist: function (req) { return Promise.resolve({ query: (req && req.query) || '', caret: 0, suggestions: [] }); },
    onExport: function (fmt, vm) { if (typeof deps.exportReport === 'function') deps.exportReport(fmt, vm); },   /* #50 S9-EXP — экспорт текущего отчёта */
  };
  var settings = (deps.state && deps.state.getSettings && deps.state.getSettings()) || deps.settings || {};
  if (!run) { _mountIdle('b', _hostB, base); return; }   /* #58-12 */
  _armRun(deps, base, _reportTimeoutMs(settings));   /* D10 — токен/таймаут/onCancel ДО loading-монтирования */
  _mountVm('b', Object.assign({}, base, { loading: true }));
  var pure = _pure();
  if (!deps.host || !pure || typeof deps.host.fetchYouTrack !== 'function') {
    _mountVm('b', Object.assign({}, base, { error: true })); return;
  }
  var proj = projKey;
  base.projectName = proj;   /* #50 S9-EXP — в meta экспорта */
  if (!proj) { _mountVm('b', Object.assign({}, base, { error: true })); return; }
  var fieldState = (typeof settings.fieldState === 'string' && settings.fieldState) ? settings.fieldState : 'State';
  if (report === 'b1') _loadB1(deps, base, settings, fieldState, proj, pure);
  else if (report === 'b2') _loadB2(deps, base, settings, fieldState, proj, pure);
  else if (report === 'b0') _loadB0(deps, base, settings, fieldState, proj, pure);
  else _loadB3(deps, base, settings, fieldState, proj, pure);
}

/* #50 S8b — B1 Техдолг (СНИМОК оценок, контур B): один issues-фетч проекта → классификация техдолг
   (тип задачи reportingTechDebtType ИЛИ тег reportingTechDebtTag — одно из двух) → per-система×роль
   Σ оценок техдолга + Σ всех оценок + % по ЧЧ + «неоценённый долг». Реюз ISSUE_FIELDS_A3/_cf; система
   = значение планерного поля settings.fieldSystem (реюз, как A10 item.system). Без activities/периода. */
const _loadB1 = makeReportLoader('B1', 'b', function (ctx) {
  var deps = ctx.deps, base = ctx.base, settings = ctx.settings, pure = ctx.pure;
  if (typeof pure.buildTechDebtRows !== 'function') { ctx.mount({ error: true }); return; }
  var tdType = (typeof settings.reportingTechDebtType === 'string') ? settings.reportingTechDebtType.trim() : '';
  var tdTag = (typeof settings.reportingTechDebtTag === 'string') ? settings.reportingTechDebtTag.trim() : '';
  if (!tdType && !tdTag) { ctx.mount({ loading: false, b1NoCfg: true }); return; }
  var roles = (Array.isArray(deps.roles) ? deps.roles : []).filter(function (r) { return r && r.estField; })
    .map(function (r) { return { key: r.key, label: r.label || r.key, estField: r.estField }; });
  var fieldType = (typeof settings.fieldType === 'string' && settings.fieldType) ? settings.fieldType : 'Type';
  var fieldSystem = _fieldSystemEff(settings);   /* v3.9.0 — тумблер reportingShowSystem гейтит группировку */
  function _hasTag(iss, tag) { var ts = Array.isArray(iss.tags) ? iss.tags : []; for (var i = 0; i < ts.length; i++) { if (ts[i] && ts[i].name === tag) return true; } return false; }
  /* QueryAssist AND */
  return ctx.fetchIssuesPaged(ISSUE_FIELDS_B1, ctx.queryParts(null, 'updated desc')).then(function (f) {   /* #58-5; ш2 — страницы до потолка */
    if (!_fresh(base)) return;
    var arr = f.arr;
    var perIssue = [];
    for (var i = 0; i < arr.length; i++) {
      var iss = arr[i]; if (!iss || !iss.idReadable) continue;
      var isTd = tdType ? (_typeValOf(iss, fieldType) === tdType) : _hasTag(iss, tdTag);   /* тип имеет приоритет над тегом */
      var est = {};
      for (var ri = 0; ri < roles.length; ri++) est[roles[ri].key] = _cfMin(iss, roles[ri].estField);
      perIssue.push({ est: est, isTechDebt: isTd, system: _sysValOf(iss, fieldSystem) });
    }
    var built = pure.buildTechDebtRows(perIssue, roles.map(function (r) { return { key: r.key, label: r.label }; }));
    ctx.mount({ loading: false,
      groups: built.groups, unestimated: built.unestimated, estimated: built.estimated, debtTasks: built.debtTasks,
      totalDebtMinutes: built.totalDebtMinutes, totalPct: built.totalPct,
      hasSystem: !!fieldSystem, populationCount: perIssue.length, limitHit: f.limitHit, limit: f.max });
  });
});

/* #50 S8c — B2 «Налог на баги» (ОКОННЫЙ, контур B): доля инженерных ЧЧ на баги vs фичи, на
   систему×роль. Баг = тип reportingBugType; «фича» = задача, слинкованная с багом через
   reportingLinkTypes. Один issues-фетч (тип/система/user-роли/links) → workItems окна периода
   (bulkWorkItems) + resolve-время багов (bulkStateTransitions → done ∈ standupDoneStates, для
   верхней границы fallback-окна) → pure(B).computeBugTax. Роль workitem'а = исполнитель роли
   задачи == автор (реюз A4 _buildRoleExecutors). */
const _loadB2 = makeReportLoader('B2', 'b', function (ctx) {
  var deps = ctx.deps, base = ctx.base, settings = ctx.settings;
  var bpure = _bpure();
  if (!bpure || typeof bpure.computeBugTax !== 'function'
      || typeof deps.bulkWorkItems !== 'function' || typeof deps.bulkStateTransitions !== 'function') {
    ctx.mount({ error: true }); return;
  }
  var bugType = (typeof settings.reportingBugType === 'string') ? settings.reportingBugType.trim() : '';
  var linkTypes = Array.isArray(settings.reportingLinkTypes) ? settings.reportingLinkTypes.filter(Boolean) : [];
  if (!bugType || !linkTypes.length) { ctx.mount({ loading: false, b2NoCfg: true }); return; }
  var win = ctx.window({ loading: false, rangePrompt: true }, { loading: false, error: true });
  if (!win) return;
  var roles = (Array.isArray(deps.roles) ? deps.roles : []).map(function (r) { return { key: r.key, label: r.label || r.key, fieldName: r.fieldName }; });
  var fieldType = (typeof settings.fieldType === 'string' && settings.fieldType) ? settings.fieldType : 'Type';
  var fieldSystem = _fieldSystemEff(settings);   /* v3.9.0 — тумблер reportingShowSystem гейтит группировку */
  var doneSet = {};
  (Array.isArray(settings.standupDoneStates) ? settings.standupDoneStates : []).forEach(function (s) { if (s) doneSet[s] = true; });
  var linkSet = {}; linkTypes.forEach(function (n) { linkSet[n] = true; });
  function _linkedIds(iss) {
    var out = [], links = Array.isArray(iss.links) ? iss.links : [];
    for (var i = 0; i < links.length; i++) {
      var l = links[i]; if (!l || !l.linkType || !linkSet[l.linkType.name]) continue;
      var lis = Array.isArray(l.issues) ? l.issues : [];
      for (var j = 0; j < lis.length; j++) { if (lis[j] && lis[j].idReadable) out.push(lis[j].idReadable); }
    }
    return out;
  }
  /* QueryAssist AND (D-скоуп аналитика) */
  return ctx.fetchIssues(ISSUE_FIELDS_B2,
    ctx.queryParts(['work date: ' + _fmtDayUTC(win.fromTs) + ' .. ' + _fmtDayUTC(win.toTs - 1)])   /* #58-5 — часы окна = только задачи со списаниями в окне */
  ).then(function (f) {
    if (!_fresh(base)) return;
    var arr = f.arr;
    var m = _mapIssues(arr, ctx.fieldState);             /* fieldId состояния для resolve-переходов */
    var built = _buildRoleExecutors(arr, roles);         /* issueId→{roleKey→login} */
    var issues = [], bugIds = [];
    for (var i = 0; i < arr.length; i++) {
      var iss = arr[i]; if (!iss || !iss.idReadable) continue;
      var isBug = _typeValOf(iss, fieldType) === bugType;
      if (isBug) bugIds.push(iss.idReadable);
      issues.push({ id: iss.idReadable, isBug: isBug, system: _sysValOf(iss, fieldSystem),
        created: (typeof iss.created === 'number') ? iss.created : null, resolveTs: null,
        featureIds: isBug ? _linkedIds(iss) : [] });
    }
    /* #58-5 — сужение могло отсечь фичи без списаний в окне: догружаем связанные точечно по id,
       иначе их баги осиротеют в корзину. Часы догруженных в окне = 0 по определению сужения —
       знаменатель честен; нужны только идентичность + система. Сверх лимита — остаются orphan. */
    var present = {}, missing = [], seenM = {};
    for (var p1 = 0; p1 < issues.length; p1++) present[issues[p1].id] = true;
    for (var b1 = 0; b1 < issues.length; b1++) {
      if (!issues[b1].isBug) continue;
      var fl = issues[b1].featureIds;
      for (var q1 = 0; q1 < fl.length; q1++)
        if (!present[fl[q1]] && !seenM[fl[q1]]) { seenM[fl[q1]] = true; missing.push(fl[q1]); }
    }
    var extraP = missing.length
      ? ctx.fetchIssues(ISSUE_FIELDS_B2, ['issue id: ' + missing.join(', ')]).then(function (fx) {
          if (!_fresh(base)) return;
          for (var e1 = 0; e1 < fx.arr.length; e1++) {
            var ex = fx.arr[e1]; if (!ex || !ex.idReadable) continue;
            issues.push({ id: ex.idReadable, isBug: _typeValOf(ex, fieldType) === bugType,
              system: _sysValOf(ex, fieldSystem),
              created: (typeof ex.created === 'number') ? ex.created : null, resolveTs: null, featureIds: [] });
          }
        })
      : Promise.resolve();
    return extraP.then(function () {
      if (!_fresh(base)) return;
      return doB2(f, arr, m, built, issues, bugIds);
    });
  });
  function doB2(f, arr, m, built, issues, bugIds) {
    return deps.bulkStateTransitions(deps, bugIds, { fieldId: m.fieldId, shouldAbort: base.shouldAbort }).then(function (prim) {
      if (!_fresh(base)) return;
      var trans = prim.transitions || {};
      for (var k = 0; k < issues.length; k++) {          /* resolveTs бага = вход в done-статус (иначе null = открыт до конца окна) */
        if (!issues[k].isBug) continue;
        var tr = trans[issues[k].id];
        if (tr && doneSet[tr.toState] && typeof tr.enteredAt === 'number') issues[k].resolveTs = tr.enteredAt;
      }
      return deps.bulkWorkItems(deps, built.ids, { window: win, shouldAbort: base.shouldAbort }).then(function (wi) {
        if (!_fresh(base)) return;
        var out = bpure.computeBugTax({ issues: issues, workItems: wi.items, roleExecutors: built.roleExecutors,
          roles: roles.map(function (r) { return { key: r.key, label: r.label }; }), windowToTs: win.toTs });
        if (deps.diag) deps.diag('reporting B2 bugs=' + out.bugCount + ' features=' + out.featureCount +
          ' fallback=' + out.fallbackBugCount + ' orphan=' + out.orphanBugCount +
          ' pct=' + (out.totalPct == null ? 'n/a' : out.totalPct.toFixed(3)), 'ok');   /* #58-6 — null = нет базы доли */
        ctx.mount({ loading: false,
          groups: out.groups, basket: out.basket, totalBugMinutes: out.totalBugMinutes, totalPct: out.totalPct,
          hasSystem: !!fieldSystem, bugCount: out.bugCount, featureCount: out.featureCount,
          fallbackBugCount: out.fallbackBugCount, orphanBugCount: out.orphanBugCount,
          incompleteCount: (wi.incomplete || []).length, limitHit: f.limitHit, limit: LIMIT });
      });
    });
  }
});

/* #50 S8a — B3 «1000 мелочей»: счётчик задач с тегом (настройка reportingThousandTag) за период
   vs среднемесячный темп с начала года. Два YT-подсчёта (created-окно) пагинацией → computeThousand. */
const _loadB3 = makeReportLoader('B3', 'b', function (ctx) {
  var deps = ctx.deps, base = ctx.base, settings = ctx.settings, pure = ctx.pure;
  var tag = (typeof settings.reportingThousandTag === 'string') ? settings.reportingThousandTag.trim() : '';
  if (!tag) { ctx.mount({ loading: false, b3NoTag: true }); return; }
  var now = Date.now();
  var win = ctx.window({ loading: false, rangePrompt: true }, { loading: false, error: true });
  if (!win) return;
  var yearStart = Date.UTC(new Date(now).getUTCFullYear(), 0, 1);
  var tagScope = 'project: ' + ctx.proj + ' tag: {' + tag + '}';
  /* created-окно в YT-запросе (окно полуоткрытое [from,to) → верх = день to-1мс; YT '..' вкл. оба конца по дню). */
  var qPeriod = tagScope + ' created: ' + _ymdISO(win.fromTs) + ' .. ' + _ymdISO(win.toTs - 1);
  var qYtd = tagScope + ' created: ' + _ymdISO(yearStart) + ' .. ' + _ymdISO(now);
  return Promise.all([_countIssues(deps, qPeriod, base.shouldAbort), _countIssues(deps, qYtd, base.shouldAbort)])
    .then(function (res) {
      if (!_fresh(base)) return;
      var out = pure.computeThousand(res[0].total, res[1].total, now);
      ctx.mount({ loading: false,
        b3Period: out.countPeriod, b3Ytd: out.countYtd, b3Avg: out.avgPerMonth,
        b3Capped: !!(res[0].capped || res[1].capped) });   /* упор в 20k-кап счётчика → «≥» (ревью #50) */
    });
});

/* #50 B0-d — «Свод» (контур B, управленческий roll-up): помесячный тренд 4 метрик (TTM / План-факт /
   Bottleneck / Бэклог) × система+агрегат за N месяцев. Внутренний период — N=6 месяцев (свой, НЕ
   date-пикер: b0 вне isWindowed). ОДИН набор фетчей популяции проекта → anchors+timelines /
   as-of оценки+timelines / workItems (всё время) → движок computeRollupSeries (leaf reporting-rollup.js,
   адверс-верифицирован) реконструирует значения помесячно (окно фильтрует / as-of конец месяца для
   снимок-метрик). Популяция маппится _mapIssuesA2 (type/parentIsEpic → foldChildUnits для TTM).
   Гейт: без Лид-пары нет ни TTM, ни план-факт → мягкая подсказка (bottleneck/бэклог без своей
   конфигурации деградируют пустыми линиями, не ошибкой). */
const _loadB0 = makeReportLoader('B0', 'b', function (ctx) {
  var deps = ctx.deps, base = ctx.base, settings = ctx.settings, fieldState = ctx.fieldState, pure = ctx.pure;
  var ttm = _ttm(), pm = _period(), roll = _rollup();
  if (!ttm || !pm || !roll || typeof deps.bulkAnchorTransitions !== 'function'
      || typeof deps.bulkAsOfEstimates !== 'function' || typeof deps.bulkWorkItems !== 'function') {
    ctx.mount({ error: true }); return;
  }
  var anchors = (settings.reportingAnchors && typeof settings.reportingAnchors === 'object'
    && !Array.isArray(settings.reportingAnchors)) ? settings.reportingAnchors : {};
  var lead = anchors.lead || {};
  if (lead.start == null || lead.end == null) {           /* без Лид-пары — ни окна популяции, ни as-of */
    ctx.mount({ loading: false, b0NoCfg: true }); return;
  }
  var norms = (settings.reportingTtmNorms && typeof settings.reportingTtmNorms === 'object'
    && !Array.isArray(settings.reportingTtmNorms)) ? settings.reportingTtmNorms : { lead: 21, team: 15, cycle: null };
  var pmRaw = (settings.reportingPauseMarkers && typeof settings.reportingPauseMarkers === 'object'
    && !Array.isArray(settings.reportingPauseMarkers)) ? settings.reportingPauseMarkers : {};
  var pauseStates = Array.isArray(pmRaw.states) ? pmRaw.states.filter(Boolean) : [];
  var flowStates = Array.isArray(settings.reportingFlowStates) ? settings.reportingFlowStates.filter(Boolean) : [];
  var thresholds = (settings.reportingThresholds && typeof settings.reportingThresholds === 'object'
    && !Array.isArray(settings.reportingThresholds)) ? settings.reportingThresholds : {};
  var threshold = (typeof settings.reportingVariancePct === 'number' && isFinite(settings.reportingVariancePct)
    && settings.reportingVariancePct > 0) ? settings.reportingVariancePct : 20;
  var roles = Array.isArray(deps.roles) ? deps.roles : [];
  var fieldSystem = _fieldSystemEff(settings);   /* v3.9.0 — тумблер reportingShowSystem гейтит группировку */
  var typeNames = settings.fieldType ? [settings.fieldType, 'Type', 'Тип'] : ['Type', 'Тип'];
  var capRaw = (settings.reportingRoleMonthlyCapacity && typeof settings.reportingRoleMonthlyCapacity === 'object'
    && !Array.isArray(settings.reportingRoleMonthlyCapacity)) ? settings.reportingRoleMonthlyCapacity : {};
  var backlogStates = {};                                  /* состояния бэклога #21 (start ∪ zones) → членство stateAsOf */
  (Array.isArray(settings.backlogStartStates) ? settings.backlogStartStates : []).forEach(function (s) { if (s) backlogStates[s] = true; });
  (Array.isArray(settings.backlogZones) ? settings.backlogZones : []).forEach(function (z) { var s = z && z.state; if (s) backlogStates[s] = true; });
  var anchorStates = _anchorStateSet(anchors);             /* концы lead/team/cycle (timelines всё равно полные) */
  flowStates.forEach(function (s) { if (anchorStates.indexOf(s) < 0) anchorStates.push(s); });
  /* QueryAssist AND (D-скоуп аналитика) */
  return ctx.fetchIssuesPaged(ISSUE_FIELDS_B0, ctx.queryParts(null, 'updated desc')).then(function (f) {   /* #58-5 — B0 as-of метрикам нужна вся история: НЕ сужаем, только порядок; ш2 — страницы до потолка */
      var arr = f.arr, limitHit = f.limitHit, maxi = f.max;
      var m = _mapIssuesA2(arr, fieldState, typeNames);    /* type/parentIsEpic для foldChildUnits (TTM) + fieldId состояния */
      var built = _buildRoleExecutors(arr, roles);         /* issueId→{roleKey→login} */
      var fieldIds = [], seenFid = {}, rolesEng = [];      /* estField name→id (ОДИН резолв) → rolesEng {key,label,fieldId} + fieldIds примитива (как A5) */
      roles.forEach(function (r) {
        var fid = r.estField ? _fieldIdByName(arr, r.estField) : '';
        if (!fid) return;
        if (!seenFid[fid]) { seenFid[fid] = true; fieldIds.push(fid); }
        rolesEng.push({ key: r.key, label: r.label || r.key, fieldId: fid });
      });
      var systemOf = {}, currentStates = {}, currentEst = {};   /* per-задача: система / текущий state (backlog Case-D) / текущие оценки (as-of fallback) */
      for (var ai = 0; ai < arr.length; ai++) {
        var iss = arr[ai]; if (!iss || !iss.idReadable) continue;
        var id = iss.idReadable;
        if (fieldSystem) { var sv = _sysValOf(iss, fieldSystem); if (sv) systemOf[id] = sv; }
        var stc = _cf(iss, fieldState); var sn = (stc && stc.value && stc.value.name) || '';
        if (sn) currentStates[id] = sn;
        var cur = {};
        for (var fi = 0; fi < fieldIds.length; fi++) { var mv = _cfMinutesById(iss, fieldIds[fi]); if (mv != null) cur[fieldIds[fi]] = mv; }
        currentEst[id] = cur;
      }
      var capHours = {};
      for (var ci = 0; ci < rolesEng.length; ci++) { var cv = capRaw[rolesEng[ci].key]; if (typeof cv === 'number' && isFinite(cv)) capHours[rolesEng[ci].key] = cv; }
      /* O1 (ревью #50): один activities-фетч — anchors + estTimelines из одного ответа. */
      return deps.bulkAnchorTransitions(deps, m.ids, { fieldId: m.fieldId, anchorStates: anchorStates, estFieldIds: fieldIds, shouldAbort: base.shouldAbort })
        .then(function (aRes) {
          var asOfById = {}, leadEndBy = {};               /* as-of оценки берём на входе в Лид-СТАРТ (как A5); leadEnd — популяция окна план-факта */
          m.issues.forEach(function (it) {
            var an = aRes.anchors[it.id] || {};
            var st = an[lead.start]; asOfById[it.id] = (typeof st === 'number') ? st : null;
            var en = an[lead.end]; if (typeof en === 'number') leadEndBy[it.id] = en;
          });
          var esAsOf = _asOfFromEstTimelines(pure, m.ids, aRes.estTimelines, currentEst, asOfById, fieldIds);
          var esTls = aRes.estTimelines || {};
          return deps.bulkWorkItems(deps, m.ids, { window: { fromTs: 0, toTs: Date.now() }, shouldAbort: base.shouldAbort }).then(function (wi) {
                if (!_fresh(base)) return;                  /* устаревший ответ — не монтируем */
                var incSet = {};                            /* incomplete = ОБЪЕДИНЕНИЕ примитивов (fail-loud D7); aRes уже несёт anchors∪est */
                (aRes.incomplete || []).forEach(function (x) { incSet[x] = true; });
                (wi.incomplete || []).forEach(function (x) { incSet[x] = true; });
                var incomplete = Object.keys(incSet);
                var pauses = (typeof deps.combinePauses === 'function')
                  ? deps.combinePauses(aRes.timelines, pauseStates, {}) : {};   /* ponytail: пауз-теги в свод НЕ тянем (лишний N-фетч); состояния-паузы достаточны для месячного тренда, апгрейд — bulkPauseTagIntervals если понадобится */
                var input = {
                  issues: m.issues, systemOf: systemOf, N: 6, nowTs: Date.now(),
                  ttm: { units: ttm.foldChildUnits(m.issues), anchorEntries: aRes.anchors, pauses: pauses,
                    timelines: aRes.timelines, incompleteSet: aRes.incomplete,
                    config: { anchors: anchors, norms: norms, buckets: [40, 120], riskDays: 80, populationMetric: 'lead',
                      terminalPolicy: _terminalPolicy(settings) } },
                  planfact: { issues: m.issues, leadEndBy: leadEndBy, asOf: esAsOf, workItems: wi.items,
                    roleExecutors: built.roleExecutors, roles: rolesEng, threshold: threshold, incomplete: incomplete },
                  bottleneck: { timelines: aRes.timelines, pauses: pauses, incompleteSet: aRes.incomplete,
                    config: { flowStates: flowStates, thresholds: thresholds } },
                  backlog: { issues: m.issues, stateTimelines: aRes.timelines, currentStates: currentStates,
                    estTimelines: esTls, currentEst: currentEst, backlogStates: backlogStates,
                    roles: rolesEng, monthlyCapHours: capHours, normMonths: A6_NORM_MONTHS, incompleteSet: incomplete }
                };
                var engineDeps = { computeTtm: ttm.computeTtm, computeBottleneck: ttm.computeBottleneck,
                  computePlanFact: pure.computePlanFact, buildBacklogRows: pure.buildBacklogRows,
                  monthlyWindows: pm.monthlyWindows, asOfPeriodMinutes: pure.asOfPeriodMinutes,
                  workdaysBetween: pure.workdaysBetween, agingLevel: pure.agingLevel };
                var series = roll.computeRollupSeries(input, engineDeps);
                if (deps.diag) deps.diag('reporting B0 pop=' + m.ids.length + ' roles=' + rolesEng.length +
                  ' systems=' + series.systems.length + ' months=' + series.months.length +
                  ' incomplete=' + incomplete.length, incomplete.length ? 'warn' : 'ok');
                ctx.mount({ loading: false, b0NoCfg: false, series: series,
                  hasSystem: !!fieldSystem, hasFlow: flowStates.length >= 2,   /* поток осмыслен от 2 статусов (гейт = _loadFlow) */ hasBacklog: Object.keys(backlogStates).length > 0,
                  populationCount: m.ids.length, incompleteCount: incomplete.length, limitHit: limitHit, limit: maxi });
          });
        });
    });
});

/* #58-12 — idle-монтаж без расчёта: тот же отчёт уже строился → последний good-vm (кэш сессии)
   поверх свежих params/handlers + paramsDirty при отличии параметров; иначе пустое состояние. */
function _mountIdle(contour, host, base) {
  var good = host && host.__sspReportingGood;
  if (good && good.report === base.report && good.contour === contour) {
    var dirty = good.period !== base.period ||
      JSON.stringify(good.periodOpts || {}) !== JSON.stringify(base.periodOpts || {}) ||
      String(good.query || '') !== String(base.query || '') ||
      (!!base.spillSprint && String(good.spillSprint || '') !== String(base.spillSprint));   /* пустой ui-параметр = «дефолт», не dirty */
    _mountVm(contour, Object.assign({}, good, base, { loading: false, idle: false, paramsDirty: dirty }));
    return;
  }
  _mountVm(contour, Object.assign({}, base, { loading: false, idle: true }));
}

/* loadAndRender(deps, contour, run): контур B → _loadContourB; контур A → диспетч по ui.reportingReport.
   #58-12 (⚖ владелец) — смена отчёта/периода/спринта и вход во вкладку НЕ считают: run=true только
   от явной кнопки «Сформировать отчёт» (и Enter в фильтре). Без run — idle-монтаж: последний
   построенный vm (кэш сессии) + пометка «параметры изменены», либо пустое состояние с подсказкой. */
function loadAndRender(deps, contour, run) {
  var L = _labels(deps.T);
  if (contour === 'b') { _loadContourB(deps, L, run); return; }

  var ui = (deps.draftGet && deps.draftGet('ui')) || {};
  var report = (ui.reportingReport === 'a1') ? 'a1' : (ui.reportingReport === 'a2') ? 'a2'
    : (ui.reportingReport === 'flow') ? 'flow' : (ui.reportingReport === 'a4') ? 'a4'
    : (ui.reportingReport === 'a5') ? 'a5' : (ui.reportingReport === 'a3') ? 'a3'
    : (ui.reportingReport === 'a6') ? 'a6' : (ui.reportingReport === 'a10') ? 'a10'
    : (ui.reportingReport === 'a11') ? 'a11' : 'a7';
  var userQ = String(ui.reportingQuery || '');
  var period = String(ui.reportingPeriod || 'last30');
  var periodOpts = (ui.reportingPeriodOpts && typeof ui.reportingPeriodOpts === 'object') ? ui.reportingPeriodOpts : {};

  function _patch(p, doRun) {
    var u = (deps.draftGet && deps.draftGet('ui')) || {};
    for (var k in p) u[k] = p[k];
    if (deps.draftSet) deps.draftSet('ui', u);
    loadAndRender(deps, 'a', !!doRun);   /* #58-12 — параметры сами по себе расчёт не запускают */
  }
  var nowY = new Date(Date.now()).getUTCFullYear();
  /* поколение запроса на host-элементе — гейт свежести для async-ответов (см. _fresh). */
  var _hostA = document.getElementById(_hostId('a'));
  var gen = (((_hostA && _hostA.__sspReportingGen) || 0) + 1);
  if (_hostA) _hostA.__sspReportingGen = gen;
  /* Смена проекта инвалидирует цель отката: good/base чужого проекта несут стейл-замыкания deps —
     откат по таймауту/«Прервать» показал бы данные СТАРОГО проекта под контекстом нового. */
  var projKey = _activeProj(deps);
  if (_hostA && _hostA.__sspReportingProj !== projKey) {
    _hostA.__sspReportingProj = projKey;
    _hostA.__sspReportingGood = null;
    _hostA.__sspReportingBase = null;
  }
  var base = {
    contour: 'a', report: report, labels: L, query: userQ, period: period, periodOpts: periodOpts, gen: gen,
    lang: (typeof deps.getLang === 'function' && deps.getLang()) || 'en',   /* #94 — даты в языке планера, не браузера */
    spillSprint: String(ui.reportingSpillSprint || ''),   /* #58-12 — для dirty-сравнения A10 */
    ytBase: (deps.ytBase ? String(deps.ytBase) : ''),   /* v3.9.0 — кликабельные ID (ссылка как в бэклоге) */
    years: [nowY, nowY - 1, nowY - 2, nowY - 3, nowY - 4],
    onRefresh: function (q) { _patch({ reportingQuery: q == null ? '' : String(q) }, true); },   /* #58-12 — явный запуск */
    onAssist: function (req) { return (typeof deps.searchAssist === 'function') ? deps.searchAssist(deps, req) : Promise.resolve({ query: (req && req.query) || '', caret: 0, suggestions: [] }); },
    onSwitchReport: function (r) { _patch({ reportingReport: (r === 'a1' || r === 'a2' || r === 'a3' || r === 'a6' || r === 'a10' || r === 'a11' || r === 'flow' || r === 'a4' || r === 'a5') ? r : 'a7' }); },
    onSetPeriod: function (preset, opts) { _patch({ reportingPeriod: String(preset || 'last30'), reportingPeriodOpts: opts || {} }); },
    onSetSprintN: function (sid) { _patch({ reportingSpillSprint: sid == null ? '' : String(sid) }); },   /* #50 S7c — пикер спринта N для A10 */
    onExport: function (fmt, vm) { if (typeof deps.exportReport === 'function') deps.exportReport(fmt, vm); },   /* #50 S9-EXP — экспорт текущего отчёта (композиция в ядре) */
  };

  var settings = (deps.state && deps.state.getSettings && deps.state.getSettings()) || deps.settings || {};
  if (!run) { _mountIdle('a', _hostA, base); return; }   /* #58-12 — без явного запуска не считаем */
  _armRun(deps, base, _reportTimeoutMs(settings));   /* D10 — токен/таймаут/onCancel ДО loading-монтирования */
  _mountVm('a', Object.assign({}, base, { loading: true }));

  var pure = _pure();
  if (!deps.host || !pure || typeof deps.bulkStateTransitions !== 'function') {
    _mountVm('a', Object.assign({}, base, { error: true })); return;
  }
  var fieldState = (typeof settings.fieldState === 'string' && settings.fieldState) ? settings.fieldState : 'State';
  var proj = projKey;
  base.projectName = proj;   /* #50 S9-EXP — в meta экспорта */
  /* US-NAV-03 forced project-scope: без проекта запрос был бы инстанс-wide — ошибка. */
  if (!proj) { _mountVm('a', Object.assign({}, base, { error: true })); return; }

  if (report === 'flow') _loadFlow(deps, base, settings, fieldState, proj, pure);
  else if (report === 'a2') _loadA2(deps, base, settings, fieldState, proj, pure);
  else if (report === 'a4') _loadA4(deps, base, settings, fieldState, proj, pure);
  else if (report === 'a5') _loadA5(deps, base, settings, fieldState, proj, pure);
  else if (report === 'a1') _loadA1(deps, base, settings, fieldState, proj, pure);
  else if (report === 'a3') _loadA3(deps, base, settings, fieldState, proj, pure);
  else if (report === 'a6') _loadA6(deps, base, settings, fieldState, proj, pure);
  else if (report === 'a10') _loadA10(deps, base, settings, fieldState, proj, pure);
  else if (report === 'a11') _loadA11(deps, base, settings, fieldState, proj, pure);
  else _loadA7(deps, base, settings, fieldState, proj, pure);
}

/* #99 — синк-ре-рендер обоих контуров из кэша последнего НЕ-loading вида (смена языка).
   Подписи запечены в vm при сборке (_labels(T) → vm.labels), компонент читает const L =
   vm.labels — принудительный React-рендер их не переводит. Пересобираем labels из
   актуального T и перемонтируем; данные те же — рефетча нет (повторный loadAndRender
   сработал бы, но стоил бы полного прогона отчёта). Контур не смонтирован / кэша нет /
   идёт прогон — no-op (in-flight доедет со своими подписями, свитч отчёта обновит сам). */
function rerenderFromCache(deps) {
  ['a', 'b'].forEach(function (c) {
    var host = document.getElementById(_hostId(c));
    var m = _mount();
    if (!host || !m) return;
    if (host.__sspReportingLoading) return;
    var good = host.__sspReportingGood;
    if (!good) return;
    var vm = Object.assign({}, good, { labels: _labels(deps.T) });
    host.__sspReportingGood = vm;   /* цель отката тоже говорит на новом языке */
    m.mountAt(host, vm);
  });
}

const api = { loadAndRender: loadAndRender, rerenderFromCache: rerenderFromCache };

if (typeof window !== 'undefined') {
  try { window.__SSP_REPORTING_VIEW = api; } catch (_) { /* sandboxed write may throw */ }
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
