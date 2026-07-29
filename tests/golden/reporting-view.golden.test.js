/**
 * Golden-master оркестратора отчётности #50 — domain/reporting-view.js AS-IS,
 * ДО рефактора makeReportLoader (свёртка boilerplate 13 лоадеров).
 *
 * Путь исполнения: ПРЯМОЙ require домен-модуля (module.exports; мосты
 * __SSP_REPORTING_{PURE,B_PURE,PERIOD,TTM,ROLLUP} — НАСТОЯЩИЕ pure-модули,
 * они self-register'ятся на window при require). Стабы — только I/O-граница:
 * host.fetchYouTrack, bulk*-примитивы (deps), fetchHistory, mount-мост.
 *
 * Что пиннит каждый снимок (см. _snapVm):
 *   - vmKeys      — ТОЧНЫЙ отсортированный список ключей vm верхнего уровня.
 *                   exportReport (core.js) проецирует именно форму vm в XLSX/PDF
 *                   (reporting-export-pure.reportToSheets) → переименование/потеря
 *                   ключа = молча сломанный экспорт. Ловится здесь.
 *   - vm          — нормализованный полный vm: функции → '[Function]' (присутствие
 *                   коллбэков pinned, тела нет), ключи отсортированы (перестановка
 *                   Object.assign при рефакторе легитимна), labels → список ключей
 *                   (значения = identity T-стаба, информации не несут).
 *   - fetchCalls  — какие YT-запросы издал лоадер (query-текст, fields, $top).
 *   - primCalls   — контракт лоадер→примитив (имя, ids, opts без функций).
 *
 * Детерминизм: Date.now заморожен (FIXED_NOW монолит-хоста, 2026-06-01T12:00Z),
 * фикстуры — фикс-эпохи; все стабы синхронно-резолвящиеся промисы.
 * Несовпадение = изменение поведения → регрессия рефактора или осознанный
 * GOLDEN_UPDATE=1 отдельным коммитом.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { checkJsonSnapshot } = require('./snap');

/* ── Детерминизм: frozen now (= FIXED_NOW монолит-хоста) ────────────────────────── */
const FIXED_NOW = 1780315200000; /* 2026-06-01T12:00:00Z */
Date.now = function () { return FIXED_NOW; };

/* ── window/document-песочница ДО require модулей (мосты пишутся на window) ─────── */
const hostElems = {}; /* id → элемент-объект (plain object достаточно: только expando-поля) */
function _resetHosts() {
  ['tab-reporting-a', 'tab-reporting-b'].forEach(function (id) { hostElems[id] = { id: id }; });
}
_resetHosts();
global.window = {};
global.document = { getElementById: function (id) { return hostElems[id] || null; } };

const SRC = path.join(__dirname, '..', '..', 'widgets', 'main', 'src');
/* Настоящие pure-движки: require публикует их и на window (мосты для reporting-view). */
require(path.join(SRC, 'pure', 'reporting-pure.js'));
require(path.join(SRC, 'pure', 'reporting-b-pure.js'));
require(path.join(SRC, 'pure', 'reporting-period.js'));
require(path.join(SRC, 'pure', 'reporting-ttm.js'));
require(path.join(SRC, 'pure', 'reporting-rollup.js'));
require(path.join(SRC, 'pure', 'velocity-pure.js'));   /* v3.12.0 (#11) — A11 Velocity */
const REPORTING_DATA = require(path.join(SRC, 'data', 'reporting-data.js')); /* combinePauses (чистая) */
const VIEW = require(path.join(SRC, 'domain', 'reporting-view.js'));

/* mount-мост: перехват vm (реальный react-маунт вне скоупа голдена) */
let mounts = [];
global.window.__SSP_REPORTING_MOUNT = {
  mountAt: function (host, vm) { mounts.push({ hostId: host && host.id, vm: vm }); },
};

/* ── Фикстуры ────────────────────────────────────────────────────────────────────── */
function D(m, d) { return Date.UTC(2026, m - 1, d, 10); } /* 10:00 UTC — вне полуночных граней */
const APR1 = D(4, 1), APR20 = D(4, 20), MAY3 = D(5, 3), MAY5 = D(5, 5), MAY6 = D(5, 6),
  MAY10 = D(5, 10), MAY12 = D(5, 12), MAY15 = D(5, 15), MAY18 = D(5, 18), MAY19 = D(5, 19),
  MAY20 = D(5, 20), MAY21 = D(5, 21), MAY22 = D(5, 22), MAY24 = D(5, 24), MAY25 = D(5, 25),
  MAY26 = D(5, 26), MAY28 = D(5, 28), MAY29 = D(5, 29);

function _cf(fieldName, fieldId, value) {
  return { name: fieldName, projectCustomField: { field: { name: fieldName, id: fieldId } }, value: value };
}
const FLD_STATE = 'fld-state', FLD_EST_AN = 'fld-est-an', FLD_EST_DEV = 'fld-est-dev';

/* Универсальная популяция задач (все ISSUE_FIELDS-варианты выкраивают из неё своё). */
function makeIssues() {
  return [
    { idReadable: 'T-1', summary: 'Эпик CRM', created: APR1,
      customFields: [
        _cf('State', FLD_STATE, { name: 'In Progress' }),
        _cf('Type', 'fld-type', { name: 'Эпик' }),
        _cf('Система', 'fld-sys', { name: 'CRM' }),
        _cf('Бизнес-этап', 'fld-stage', { name: 'Дизайн' }),
        _cf('Analyst', 'fld-an', { login: 'alice' }),
        _cf('Оценка (Аналитика)', FLD_EST_AN, { minutes: 2400 }),
        _cf('Оценка (Разработка)', FLD_EST_DEV, { minutes: 4800 }),
      ], links: [], tags: [] },
    { idReadable: 'T-2', summary: 'Стори под эпиком', created: APR20,
      customFields: [
        _cf('State', FLD_STATE, { name: 'Done' }),
        _cf('Type', 'fld-type', { name: 'Story' }),
        _cf('Система', 'fld-sys', { name: 'CRM' }),
        _cf('Analyst', 'fld-an', { login: 'alice' }),
        _cf('Developer', 'fld-dev', { login: 'bob' }),
        _cf('Оценка (Аналитика)', FLD_EST_AN, { minutes: 600 }),
        _cf('Оценка (Разработка)', FLD_EST_DEV, { minutes: 240 }),
      ],
      links: [{ direction: 'INWARD', linkType: { name: 'Subtask' },
        issues: [{ idReadable: 'T-1', customFields: [{ name: 'Type', value: { name: 'Эпик' } }] }] }],
      tags: [] },
    { idReadable: 'T-3', summary: 'Сольная стори ERP', created: MAY10,
      customFields: [
        _cf('State', FLD_STATE, { name: 'Open' }),
        _cf('Type', 'fld-type', { name: 'Story' }),
        _cf('Система', 'fld-sys', { name: 'ERP' }),
        _cf('Developer', 'fld-dev', { login: 'bob' }),
        _cf('Оценка (Разработка)', FLD_EST_DEV, { minutes: 1200 }),
      ], links: [], tags: [] },
    { idReadable: 'T-4', summary: 'Баг по стори', created: MAY5,
      customFields: [
        _cf('State', FLD_STATE, { name: 'Done' }),
        _cf('Type', 'fld-type', { name: 'Bug' }),
        _cf('Система', 'fld-sys', { name: 'CRM' }),
        _cf('Priority', 'fld-prio', { name: 'Major', localizedName: 'Высокий' }),
        _cf('Analyst', 'fld-an', { login: 'bob' }),
        _cf('Оценка (Аналитика)', FLD_EST_AN, { minutes: 300 }),
      ],
      links: [{ linkType: { name: 'Relates' }, issues: [{ idReadable: 'T-2' }] }],
      tags: [] },
    { idReadable: 'T-5', summary: 'Техдолг ERP', created: APR20,
      customFields: [
        _cf('State', FLD_STATE, { name: 'Open' }),
        _cf('Type', 'fld-type', { name: 'Техдолг' }),
        _cf('Система', 'fld-sys', { name: 'ERP' }),
        _cf('Developer', 'fld-dev', { login: 'carol' }),
        _cf('Оценка (Разработка)', FLD_EST_DEV, { minutes: 2400 }),
      ], links: [], tags: [] },
    { idReadable: 'T-6', summary: 'Без типа и оценок (incomplete)', created: MAY5,
      customFields: [_cf('State', FLD_STATE, { name: 'In Progress' })], links: [], tags: [] },
    { idReadable: 'T-7', summary: 'Сольная стори Done', created: MAY3,
      customFields: [
        _cf('State', FLD_STATE, { name: 'Done' }),
        _cf('Type', 'fld-type', { name: 'Story' }),
        _cf('Система', 'fld-sys', { name: 'ERP' }),
        _cf('Analyst', 'fld-an', { login: 'alice' }),
        _cf('Оценка (Аналитика)', FLD_EST_AN, { minutes: 960 }),
      ], links: [], tags: [] },
  ];
}

/* Таймлайны переходов state-поля (parseAnchorsChunk-шейп: [{ts,from,to}] хронологически). */
const TIMELINES = {
  'T-1': [{ ts: APR1, from: null, to: 'Open' }, { ts: MAY5, from: 'Open', to: 'In Progress' }],
  'T-2': [{ ts: APR20, from: null, to: 'Open' }, { ts: MAY10, from: 'Open', to: 'In Progress' },
    { ts: MAY15, from: 'In Progress', to: 'On Hold' }, { ts: MAY18, from: 'On Hold', to: 'In Progress' },
    { ts: MAY20, from: 'In Progress', to: 'Review' }, { ts: MAY25, from: 'Review', to: 'Done' }],
  'T-3': [{ ts: MAY10, from: null, to: 'Open' }],
  'T-4': [{ ts: MAY5, from: null, to: 'Open' }, { ts: MAY10, from: 'Open', to: 'In Progress' },
    { ts: MAY18, from: 'In Progress', to: 'Review' }, { ts: MAY20, from: 'Review', to: 'In Progress' },
    { ts: MAY24, from: 'In Progress', to: 'Review' }, { ts: MAY28, from: 'Review', to: 'Done' }],
  'T-7': [{ ts: MAY3, from: null, to: 'Open' }, { ts: MAY6, from: 'Open', to: 'In Progress' },
    { ts: MAY19, from: 'In Progress', to: 'Review' }, { ts: MAY22, from: 'Review', to: 'Done' }],
};
const ANCHORS = {
  'T-1': { Open: APR1, 'In Progress': MAY5 },
  'T-2': { Open: APR20, 'In Progress': MAY10, 'On Hold': MAY15, Review: MAY20, Done: MAY25 },
  'T-3': { Open: MAY10 },
  'T-4': { Open: MAY5, 'In Progress': MAY10, Review: MAY18, Done: MAY28 },
  'T-7': { Open: MAY3, 'In Progress': MAY6, Review: MAY19, Done: MAY22 },
};
const EST_TIMELINES = { 'T-2': { 'fld-est-an': [{ ts: MAY12, from: 480, to: 600 }] } };
const TRANSITIONS = {
  'T-1': { toState: 'In Progress', enteredAt: MAY5 },
  'T-2': { toState: 'Done', enteredAt: MAY25 },
  'T-4': { toState: 'Done', enteredAt: MAY28 },
  'T-7': { toState: 'Done', enteredAt: MAY22 },
};
const WORK_ITEMS = [
  { issueId: 'T-2', author: 'alice', dateTs: MAY26, minutes: 480 },
  { issueId: 'T-2', author: 'bob', dateTs: MAY26, minutes: 240 },
  { issueId: 'T-3', author: 'bob', dateTs: MAY20, minutes: 300 },
  { issueId: 'T-4', author: 'bob', dateTs: MAY29, minutes: 120 },
  { issueId: 'T-7', author: 'alice', dateTs: MAY21, minutes: 600 },
];
const HISTORY = [
  { sprintId: 'sprA_analysis', roleKey: 'analysis', status: 'FINISHED', name: 'Спринт А', dateStart: APR1,
    items: [
      { issueId: 'T-2', title: 'Стори под эпиком', state: 'Done', inclusionStatus: 'INC_PLANNED', estimate_analysis: 600, system: 'CRM' },
      { issueId: 'T-3', title: 'Сольная стори ERP', state: 'Open', inclusionStatus: 'INC_PLANNED', estimate_analysis: 1200, system: 'ERP' },
    ] },
  { sprintId: 'sprB_analysis', roleKey: 'analysis', status: 'FINISHED', name: 'Спринт Б', dateStart: MAY3,
    items: [
      { issueId: 'T-3', title: 'Сольная стори ERP', state: 'Done', inclusionStatus: 'INC_PLANNED', estimate_analysis: 1200, system: 'ERP' },
    ] },
];

function baseSettings() {
  return {
    fieldState: 'State', fieldType: 'Type', fieldSystem: 'Система',
    reportingThresholds: { 'In Progress': { yellow: 3, red: 7 }, Review: { yellow: 2 } },
    reportingTargetStatuses: ['Done', 'Closed'],
    reportingStatusLabels: { Done: 'Готово' },
    reportingAnchors: { lead: { start: 'Open', end: 'Done' }, team: { start: 'In Progress', end: 'Done' }, cycle: { start: 'In Progress', end: 'Review' } },
    reportingTtmNorms: { lead: 21, team: 15, cycle: null },
    reportingPauseMarkers: { states: ['On Hold'], tags: ['paused'] },
    reportingFlowStates: ['Open', 'In Progress', 'Review', 'Done'],
    reportingVariancePct: 20,
    reportingA3StageField: 'Бизнес-этап', reportingA3OrgField: '', reportingA3PriorityField: 'Priority',
    backlogStartStates: ['Open'], backlogZones: [{ state: 'Ready' }], backlogTypeFilter: [],
    reportingRoleMonthlyCapacity: { analysis: 100, dev: 160 },
    standupDoneStates: ['Done', 'Closed'],
    stateRollupOrder: ['Open', 'In Progress', 'Review', 'Done'],
    reportingSpilloverAgeBands: { warm: 2, hot: 5 },
    reportingTechDebtType: 'Техдолг', reportingTechDebtTag: '',
    reportingBugType: 'Bug', reportingLinkTypes: ['Relates'],
    reportingThousandTag: 'мелочь',
    reportingTimeoutSec: 60,
    reportingTerminalPolicy: 'first-close',
  };
}

/* ── deps-фабрика: стабы I/O-границы + запись контрактных вызовов ────────────────── */
function _optsNoFn(opts) {
  const out = {};
  Object.keys(opts || {}).forEach(function (k) {
    out[k] = (typeof opts[k] === 'function') ? '[Function]' : opts[k];
  });
  return out;
}
function makeDeps(over) {
  over = over || {};
  const settings = over.settings || baseSettings();
  const issues = over.issues || makeIssues();
  const fetchCalls = [], primCalls = [];
  const ui = Object.assign({}, over.ui);
  function rec(name, result) {
    return function (deps, ids, opts) {
      primCalls.push({ name: name, ids: (ids || []).slice(), opts: _optsNoFn(opts) });
      return Promise.resolve(typeof result === 'function' ? result(ids, opts) : result);
    };
  }
  const deps = {
    T: function (k) { return k; },
    diag: function () {},
    host: {
      fetchYouTrack: over.fetchYouTrack || function (endpoint, opts) {
        const q = (opts && opts.query) || {};
        fetchCalls.push({ endpoint: endpoint, query: q.query, fields: q.fields, $top: q.$top, $skip: q.$skip });
        if (q.fields === 'idReadable') { /* B3 счётчик-пагинация */
          const total = String(q.query).indexOf('2026-01-01') >= 0 ? 23 : 7;
          const skip = q.$skip || 0;
          const n = Math.max(0, Math.min(total - skip, q.$top || 500));
          return Promise.resolve(Array.from({ length: n }, function (_, i) { return { idReadable: 'C-' + (skip + i) }; }));
        }
        return Promise.resolve(JSON.parse(JSON.stringify(issues)));
      },
    },
    ctx: { project: { shortName: 'DEMO', id: 'p1' } },
    settings: settings,
    activeProjectKey: 'DEMO', activeProjectId: 'p1',
    draftGet: function (k) { return k === 'ui' ? ui : null; },
    draftSet: function (k, v) { if (k === 'ui') Object.assign(ui, v); },
    bulkStateTransitions: rec('bulkStateTransitions',
      { transitions: TRANSITIONS, noTransition: ['T-3', 'T-5'], incomplete: ['T-6'], diag: { chunks: 1, activitiesReturned: 9 } }),
    bulkAnchorTransitions: rec('bulkAnchorTransitions',
      { anchors: ANCHORS, timelines: TIMELINES, estTimelines: EST_TIMELINES, incomplete: [], diag: { chunks: 1 } }),
    bulkPauseTagIntervals: rec('bulkPauseTagIntervals',
      { intervals: { 'T-4': [{ fromTs: MAY20, toTs: MAY22 }] }, incomplete: [], diag: {} }),
    bulkWorkItems: rec('bulkWorkItems', { items: WORK_ITEMS, incomplete: [], diag: { chunks: 1, pages: 1 } }),
    bulkAsOfEstimates: rec('bulkAsOfEstimates', { asOf: {}, incomplete: [], diag: {} }),
    combinePauses: REPORTING_DATA.combinePauses,
    searchAssist: function (d, req) { return Promise.resolve({ query: (req && req.query) || '', caret: 0, suggestions: [] }); },
    fetchHistory: function () {
      primCalls.push({ name: 'fetchHistory', ids: [], opts: {} });
      return Promise.resolve({ history: JSON.parse(JSON.stringify(HISTORY)), orphanGanttBySprintId: {} });
    },
    roles: [
      { key: 'analysis', fieldName: 'Analyst', estField: 'Оценка (Аналитика)', label: 'Аналитика' },
      { key: 'dev', fieldName: 'Developer', estField: 'Оценка (Разработка)', label: 'Разработка' },
    ],
    exportReport: function () {},
    state: { getSettings: function () { return settings; } },
  };
  Object.assign(deps, over.depsOver);
  deps.__fetchCalls = fetchCalls;
  deps.__primCalls = primCalls;
  deps.__ui = ui;
  return deps;
}

/* ── прогон + ожидание финального mount + чистка таймера бэкстопа ────────────────── */
function _lastVm(contour) {
  const hostId = 'tab-reporting-' + contour;
  for (let i = mounts.length - 1; i >= 0; i--) { if (mounts[i].hostId === hostId) return mounts[i].vm; }
  return null;
}
function _isFinal(vm) { return !!(vm && (vm.loading === false || vm.error === true || vm.aborted)); }
function _clearTimers() {
  Object.keys(hostElems).forEach(function (id) {
    const h = hostElems[id];
    if (h && h.__sspReportingTimer) { clearTimeout(h.__sspReportingTimer); h.__sspReportingTimer = null; }
  });
}
async function settleUntil(pred) {
  for (let i = 0; i < 200; i++) {
    if (pred()) return;
    await new Promise(function (r) { setImmediate(r); });
  }
  throw new Error('reporting golden: финальный mount не наступил за 200 тиков');
}
async function runReport(deps, contour) {
  _resetHosts();
  mounts = [];
  VIEW.loadAndRender(deps, contour, true);   /* #58-12 — расчёт только по явному run */
  await settleUntil(function () { return _isFinal(_lastVm(contour)); });
  _clearTimers();
  return _lastVm(contour);
}

/* ── нормализация vm для снимка ──────────────────────────────────────────────────── */
function _norm(v) {
  if (typeof v === 'function') return '[Function]';
  if (v === undefined) return '[undefined]';
  if (typeof v === 'number' && !isFinite(v)) return String(v);
  if (Array.isArray(v)) return v.map(_norm);
  if (v && typeof v === 'object') {
    const out = {};
    Object.keys(v).sort().forEach(function (k) { out[k] = _norm(v[k]); });
    return out;
  }
  return v;
}
function _labelKeys(labels) { /* значения = identity T-стаба → пиннится только набор ключей */
  const flat = [];
  Object.keys(labels || {}).forEach(function (k) {
    if (labels[k] && typeof labels[k] === 'object') {
      Object.keys(labels[k]).forEach(function (k2) { flat.push(k + '.' + k2); });
    } else flat.push(k);
  });
  return flat.sort();
}
function snapOf(deps, vm) {
  const shallow = Object.assign({}, vm);
  const labels = shallow.labels; delete shallow.labels;
  return {
    vmKeys: Object.keys(vm).sort(),
    labelKeys: _labelKeys(labels),
    fetchCalls: _norm(deps.__fetchCalls),
    primCalls: _norm(deps.__primCalls),
    vm: _norm(shallow),
  };
}

/* ── 13 лоадеров: happy-path через стабы ─────────────────────────────────────────── */
const A_REPORTS = ['a7', 'a1', 'a2', 'flow', 'a4', 'a5', 'a3', 'a6', 'a10', 'a11'];
A_REPORTS.forEach(function (report) {
  test('golden: reporting vm — контур A / ' + report, async function () {
    const deps = makeDeps({ ui: { reportingReport: report, reportingPeriod: 'last30' } });
    const vm = await runReport(deps, 'a');
    assert.strictEqual(vm.report, report, 'диспетч довёл до лоадера ' + report);
    checkJsonSnapshot('reporting-vm-' + report, snapOf(deps, vm));
  });
});

const B_REPORTS = ['b1', 'b2', 'b3', 'b0'];
B_REPORTS.forEach(function (report) {
  test('golden: reporting vm — контур B / ' + report, async function () {
    const deps = makeDeps({ ui: { reportingReportB: report, reportingPeriodB: 'last30' } });
    const vm = await runReport(deps, 'b');
    assert.strictEqual(vm.report, report, 'диспетч довёл до лоадера ' + report);
    checkJsonSnapshot('reporting-vm-' + report, snapOf(deps, vm));
  });
});

/* ── #57-5 Н3 + #58-1: юзер-хвост в скобках, склейка ЯВНЫМ and, sort by отбрасывается ─
   Юкстапозиция `project: X (A)` отвергается парсером YT (400 invalid_query, 2025.3 и 2026.1),
   а `sort by:` со скобочной группой несовместим в принципе — отчёты строят свой порядок. */
test('reporting: юзер-фильтр клеится через and (…) — or не рвёт project-скоуп, sort by отброшен', async function () {
  const deps = makeDeps({ ui: { reportingReport: 'a7', reportingPeriod: 'last30',
    reportingQuery: '#Bug or #Feature sort by: updated' } });
  await runReport(deps, 'a');
  assert.strictEqual(deps.__fetchCalls[0].query,
    'project: DEMO #Unresolved and (#Bug or #Feature)');
});

/* ── #58-12: явный запуск — без run расчёт не стартует ──────────────────────────── */
test('reporting: loadAndRender без run → idle-vm, ноль фетчей', async function () {
  const deps = makeDeps({ ui: { reportingReport: 'a7', reportingPeriod: 'last30', reportingQuery: '' } });
  _resetHosts(); mounts = [];
  VIEW.loadAndRender(deps, 'a');            /* вход во вкладку/смена параметров */
  const vm = _lastVm('a');
  assert.strictEqual(vm.idle, true);
  assert.strictEqual(deps.__fetchCalls.length, 0, 'ни одного YT-запроса без явного запуска');
});

test('reporting: после успешного run повторный вход отдаёт кэш-vm без пересчёта; смена периода → paramsDirty', async function () {
  const deps = makeDeps({ ui: { reportingReport: 'a7', reportingPeriod: 'last30', reportingQuery: '' } });
  await runReport(deps, 'a');               /* построили */
  const fetches = deps.__fetchCalls.length;
  VIEW.loadAndRender(deps, 'a');            /* повторный вход — те же параметры */
  let vm = _lastVm('a');
  assert.strictEqual(vm.idle || false, false, 'кэш-vm, не пустое состояние');
  assert.strictEqual(vm.paramsDirty, false);
  assert.strictEqual(deps.__fetchCalls.length, fetches, 'без новых фетчей');
  deps.draftSet('ui', Object.assign({}, deps.draftGet('ui'), { reportingPeriod: 'last7' }));
  VIEW.loadAndRender(deps, 'a');            /* смена периода без запуска */
  vm = _lastVm('a');
  assert.strictEqual(vm.paramsDirty, true, 'прежний расчёт помечен устаревшим');
  assert.strictEqual(deps.__fetchCalls.length, fetches);
});

/* ── #58-5: серверное сужение популяции + сортировка ────────────────────────────────
   Сорт клеится ТОЛЬКО при пустом юзер-фильтре (`sort by` после скобочной группы = 400). */
test('reporting: A7 без фильтра — sort by updated asc; с фильтром — сорт опущен', async function () {
  const d1 = makeDeps({ ui: { reportingReport: 'a7', reportingPeriod: 'last30', reportingQuery: '' } });
  await runReport(d1, 'a');
  assert.strictEqual(d1.__fetchCalls[0].query, 'project: DEMO #Unresolved sort by: updated asc');
  const d2 = makeDeps({ ui: { reportingReport: 'a7', reportingPeriod: 'last30', reportingQuery: '#Bug' } });
  await runReport(d2, 'a');
  assert.strictEqual(d2.__fetchCalls[0].query, 'project: DEMO #Unresolved and (#Bug)');
});

test('reporting: A4 — популяция сужена `work date:` окна (frozen now 2026-06-01, last30)', async function () {
  const deps = makeDeps({ ui: { reportingReport: 'a4', reportingPeriod: 'last30', reportingQuery: '' } });
  await runReport(deps, 'a');
  assert.strictEqual(deps.__fetchCalls[0].query, 'project: DEMO work date: 2026-05-03 .. 2026-06-01');
});

test('reporting: A2 — популяция сужена `updated:` суперсетом окна', async function () {
  const deps = makeDeps({ ui: { reportingReport: 'a2', reportingPeriod: 'last30', reportingQuery: '' } });
  await runReport(deps, 'a');
  assert.strictEqual(deps.__fetchCalls[0].query, 'project: DEMO updated: 2026-05-03 .. *');
});

/* ── ранние выходы «конфиг не задан» ─────────────────────────────────────────────── */
test('golden: reporting A1 — целевые статусы не заданы → noTargets, ноль фетчей', async function () {
  const settings = baseSettings();
  settings.reportingTargetStatuses = [];
  const deps = makeDeps({ settings: settings, ui: { reportingReport: 'a1' } });
  const vm = await runReport(deps, 'a');
  assert.strictEqual(vm.noTargets, true);
  assert.strictEqual(deps.__fetchCalls.length, 0, 'ранний выход не издаёт YT-запросов');
  checkJsonSnapshot('reporting-vm-a1-notargets', snapOf(deps, vm));
});

test('golden: reporting A1 — custom-период без дат → rangePrompt, ноль фетчей', async function () {
  const deps = makeDeps({ ui: { reportingReport: 'a1', reportingPeriod: 'custom', reportingPeriodOpts: {} } });
  const vm = await runReport(deps, 'a');
  assert.strictEqual(vm.rangePrompt, true);
  assert.strictEqual(deps.__fetchCalls.length, 0, 'ранний выход не издаёт YT-запросов');
  checkJsonSnapshot('reporting-vm-a1-rangeprompt', snapOf(deps, vm));
});

/* ── D10: ручное прерывание (onCancel → _cancelRun) + блок устаревшего mount ─────── */
test('golden: reporting abort — onCancel монтирует aborted-vm, поздний ответ гейтится', async function () {
  let resolveFetch;
  const gate = new Promise(function (r) { resolveFetch = r; });
  const deps = makeDeps({ ui: { reportingReport: 'a7' } });
  const realFetch = deps.host.fetchYouTrack;
  deps.host.fetchYouTrack = function (endpoint, opts) {
    return gate.then(function () { return realFetch(endpoint, opts); });
  };
  _resetHosts();
  mounts = [];
  VIEW.loadAndRender(deps, 'a', true);   /* #58-12 — явный запуск */
  const hostA = hostElems['tab-reporting-a'];
  assert.strictEqual(_lastVm('a').loading, true, 'loading-vm смонтирован до ответа');
  assert.strictEqual(typeof hostA.__sspReportingBase.onCancel, 'function', '_armRun вооружил onCancel');
  hostA.__sspReportingBase.onCancel();   /* кнопка «Прервать» */
  const aborted = _lastVm('a');
  assert.strictEqual(aborted.aborted, 'manual');
  assert.strictEqual(aborted.loading, false);
  const mountsAfterCancel = mounts.length;
  resolveFetch();                          /* поздний in-flight ответ */
  for (let i = 0; i < 50; i++) await new Promise(function (r) { setImmediate(r); });
  assert.strictEqual(mounts.length, mountsAfterCancel, 'устаревший ответ НЕ перезаписал aborted-vm (gen-гейт)');
  _clearTimers();
  checkJsonSnapshot('reporting-vm-aborted-manual', snapOf(deps, aborted));
});

/* ── _fresh-гейт: свитч отчёта на лету — старый in-flight ответ не монтируется ───── */
test('golden: reporting fresh-гейт — второй прогон вытесняет первый', async function () {
  let resolveFetch;
  const gate = new Promise(function (r) { resolveFetch = r; });
  const deps = makeDeps({ ui: { reportingReport: 'a7' } });
  const realFetch = deps.host.fetchYouTrack;
  let slowUsed = false;
  deps.host.fetchYouTrack = function (endpoint, opts) {
    if (!slowUsed) { slowUsed = true; return gate.then(function () { return realFetch(endpoint, opts); }); }
    return realFetch(endpoint, opts);
  };
  _resetHosts();
  mounts = [];
  VIEW.loadAndRender(deps, 'a');           /* прогон 1: висит на gate */
  deps.__ui.reportingReport = 'a3';
  VIEW.loadAndRender(deps, 'a');           /* прогон 2: свитч → gen bump */
  await settleUntil(function () { const vm = _lastVm('a'); return _isFinal(vm) && vm.report === 'a3'; });
  const countAfterSecond = mounts.length;
  const finalVm = _lastVm('a');
  resolveFetch();                          /* поздний ответ прогона 1 */
  for (let i = 0; i < 50; i++) await new Promise(function (r) { setImmediate(r); });
  assert.strictEqual(mounts.length, countAfterSecond, 'устаревший ответ прогона 1 не смонтирован');
  assert.strictEqual(_lastVm('a'), finalVm, 'актуальный vm остался от прогона 2');
  assert.strictEqual(finalVm.report, 'a3');
  _clearTimers();
});
