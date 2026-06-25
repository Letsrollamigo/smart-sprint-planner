'use strict';
/**
 * #21 слайс 2b — async-загрузчик пула (domain/backlog-loader.js).
 * Чистые части (query/map) + оркестрация loadBacklogPool через fake deps + стаб
 * fetchYouTrack. Интеграция с pure buildBacklogVm (2a) на загруженном пуле.
 */
const test   = require('node:test');
const assert = require('node:assert');
const path   = require('node:path');

const LOADER = require(path.join(__dirname, '..', '..', 'widgets', 'main', 'src', 'domain', 'backlog-loader.js'));
const { buildBacklogVm } = require(path.join(__dirname, '..', '..', 'widgets', 'main', 'src', 'pure', 'backlog-vm-pure.js'));

const ROLES = [
  { key: 'analysis', fieldEst: 'fieldAnalysis', fieldFact: 'fieldFactAnalysis' },
  { key: 'devBack',  fieldEst: 'fieldDevBack',  fieldFact: 'fieldFactDevBack' },
];
const SETTINGS = {
  fieldState: 'State', fieldSystem: 'System', fieldPriority: 'Priority',
  fieldAnalysis: 'Анализ ЧЧ', fieldFactAnalysis: 'Факт Анализ',
  fieldDevBack: 'Back ЧЧ', fieldFactDevBack: 'Факт Back',
  activeRoles: ['analysis', 'devBack'],
  backlogStartStates: ['Open'],
  backlogZones: [{ state: 'In Progress', roles: ['analysis', 'devBack'] }],
  backlogTypeFilter: ['Bug', 'Feature'],
  backlogPauseTags: ['blocked'],
};

function depsBase(over) {
  return Object.assign({
    t: function (k) { return k; }, toast: function () {}, diag: function () {},
    ctx: { project: { shortName: 'DEMO', id: '0-1' } },
    settings: SETTINGS,
    getActiveRoles: function (s) { return ROLES.filter(function (r) { return (s.activeRoles || []).indexOf(r.key) >= 0; }); },
    roles: ROLES,
    backlogPage: 2, maxBacklogTotal: 1000,
  }, over);
}

function rawIssue(id, stateName, opts) {
  opts = opts || {};
  return {
    id: 'i-' + id, idReadable: 'DEMO-' + id, summary: '  task ' + id + '  ',
    customFields: [
      { projectCustomField: { field: { name: 'State' } }, value: { name: stateName, localizedName: 'loc-' + stateName, isResolved: !!opts.resolved } },
      { projectCustomField: { field: { name: 'System' } }, value: { name: 'Sys', localizedName: 'Система' } },
      { projectCustomField: { field: { name: 'Анализ ЧЧ' } }, value: { minutes: opts.estA != null ? opts.estA : 120 } },
      { projectCustomField: { field: { name: 'Факт Анализ' } }, value: { minutes: opts.factA != null ? opts.factA : 30 } },
    ],
    tags: (opts.tags || []).map(function (n) { return { name: n }; }),
  };
}

/* ── pure parts ── */

test('_poolStates: дедуп стартовых состояний + состояний зон', function () {
  assert.deepStrictEqual(LOADER._poolStates(SETTINGS), ['Open', 'In Progress']);
  assert.deepStrictEqual(LOADER._poolStates({}), []);
});

test('_buildPoolQuery: project + State + Type, ЗНАЧЕНИЯ В БРЕЙСАХ (многословные не мис-парсятся; запятая = OR)', function () {
  assert.strictEqual(LOADER._buildPoolQuery(depsBase()), 'project: DEMO State: {Open},{In Progress} Type: {Bug},{Feature}');
});

test('_buildPoolQuery: без проекта/типов — только то, что задано', function () {
  const d = depsBase({ ctx: {}, settings: { backlogStartStates: ['Open'] } });
  assert.strictEqual(LOADER._buildPoolQuery(d), 'State: {Open}');
});

test('_buildPoolQuery: имя атрибута из настроек (fieldState/fieldType), многословное имя — в брейсах', function () {
  const d = depsBase({ ctx: {}, settings: {
    fieldState: 'Состояние', fieldType: 'Вид работ',
    backlogStartStates: ['Открыта'], backlogZones: [{ state: 'В разработке', roles: [] }],
    backlogTypeFilter: ['Баг'],
  } });
  assert.strictEqual(LOADER._buildPoolQuery(d), 'Состояние: {Открыта},{В разработке} {Вид работ}: {Баг}');
});

test('_mapPoolIssue: сырой issue → task-контракт (raw stateName, isResolved, est/fact по полям ролей, теги)', function () {
  const t = LOADER._mapPoolIssue(rawIssue(1, 'In Progress', { estA: 120, factA: 30, tags: ['blocked'] }), depsBase());
  assert.strictEqual(t.issueId, 'DEMO-1');
  assert.strictEqual(t.summary, 'task 1');             // trim
  assert.strictEqual(t.stateName, 'In Progress');      // raw value.name, НЕ локализованное
  assert.strictEqual(t.isResolved, false);
  assert.strictEqual(t.system, 'Система');             // presentation/localized
  assert.strictEqual(t.estByRole.analysis, 120);
  assert.strictEqual(t.factByRole.analysis, 30);
  assert.strictEqual(t.estByRole.devBack, null);       // нет поля 'Back ЧЧ' в issue → null
  assert.deepStrictEqual(t.tags, ['blocked']);
});

test('_mapPoolIssue: resolved-флаг с value.isResolved', function () {
  const t = LOADER._mapPoolIssue(rawIssue(2, 'Done', { resolved: true }), depsBase());
  assert.strictEqual(t.isResolved, true);
});

/* ── async loadBacklogPool через стаб fetchYouTrack ── */

function stubHost(allIssues) {
  const calls = [];
  return {
    calls: calls,
    fetchYouTrack: function (pathStr, opts) {
      calls.push({ path: pathStr, query: opts.query });
      const skip = opts.query.$skip || 0, top = opts.query.$top;
      return Promise.resolve(allIssues.slice(skip, skip + top));
    },
  };
}

test('loadBacklogPool: пагинация ($top=page+1), маппинг, запись в transient pool', async function () {
  const issues = [rawIssue(1, 'In Progress'), rawIssue(2, 'In Progress'), rawIssue(3, 'Open')];
  const host = stubHost(issues);
  let stored = null;
  const deps = depsBase({ host: host, state: { setBacklogPool: function (p) { stored = p; }, getBacklogPool: function () { return stored; } } });
  const res = await LOADER.loadBacklogPool(deps);
  assert.strictEqual(res.count, 3);
  assert.strictEqual(res.capped, false);
  assert.strictEqual(stored.length, 3);
  assert.strictEqual(host.calls[0].query.$top, 3);     // page(2)+1 sentinel
  assert.strictEqual(host.calls.length, 2);            // 3 issues / page 2 → 2 страницы
  assert.strictEqual(stored[0].issueId, 'DEMO-1');
});

test('loadBacklogPool: cap (maxBacklogTotal) обрывает выгрузку', async function () {
  const many = []; for (let i = 0; i < 10; i++) many.push(rawIssue(i, 'In Progress'));
  const host = stubHost(many);
  let stored = null;
  const deps = depsBase({ host: host, maxBacklogTotal: 4, state: { setBacklogPool: function (p) { stored = p; }, getBacklogPool: function () {} } });
  const res = await LOADER.loadBacklogPool(deps);
  assert.strictEqual(res.capped, true);
  assert.ok(stored.length >= 4 && stored.length <= 6, 'capped near maxBacklogTotal, got ' + stored.length);
});

/* ── слайс 5 — query-assist фильтр пула ── */

test('_buildPoolQuery: пользовательский фильтр AND-ится к базовому (не брейсится — сырой YT-синтаксис)', function () {
  const d = depsBase({ userFilter: 'Priority: Critical #unresolved' });
  assert.strictEqual(
    LOADER._buildPoolQuery(d),
    'project: DEMO State: {Open},{In Progress} Type: {Bug},{Feature} Priority: Critical #unresolved'
  );
});

test('_buildPoolQuery: пустой/whitespace фильтр не добавляет суффикс', function () {
  assert.strictEqual(LOADER._buildPoolQuery(depsBase({ userFilter: '   ' })),
    'project: DEMO State: {Open},{In Progress} Type: {Bug},{Feature}');
  assert.strictEqual(LOADER._buildPoolQuery(depsBase({ userFilter: undefined })),
    'project: DEMO State: {Open},{In Progress} Type: {Bug},{Feature}');
});

test('_backlogAssist: POST search/assist со scope проекта → {query,caret,suggestions}', async function () {
  let captured = null;
  const host = { fetchYouTrack: function (p, opts) {
    captured = { path: p, opts: opts };
    return Promise.resolve({ suggestions: [{ option: 'Priority' }] });
  } };
  const deps = depsBase({ host: host });
  const res = await LOADER._backlogAssist({ query: 'Pri', caret: 3 }, deps);
  assert.strictEqual(captured.path, 'search/assist');
  assert.strictEqual(captured.opts.method, 'POST');
  assert.strictEqual(captured.opts.body.query, 'Pri');
  assert.strictEqual(captured.opts.body.caret, 3);
  assert.deepStrictEqual(captured.opts.body.folders, [{ $type: 'Project', id: '0-1' }]); // scope из ctx.project
  assert.strictEqual(res.query, 'Pri');
  assert.strictEqual(res.suggestions.length, 1);
});

test('_backlogAssist: ошибка assist → пустые подсказки (поле продолжает работать)', async function () {
  const host = { fetchYouTrack: function () { return Promise.reject(new Error('500')); } };
  const res = await LOADER._backlogAssist({ query: 'x' }, depsBase({ host: host }));
  assert.deepStrictEqual(res.suggestions, []);
  assert.strictEqual(res.query, 'x');
});

test('интеграция 2a+2b: загруженный пул → buildBacklogVm раскладывает по зонам/пулу', async function () {
  const issues = [
    rawIssue(1, 'Open'),                                  // пул заказчика
    rawIssue(2, 'In Progress', { estA: 60, factA: 10 }),  // зона → analysis+devBack
    rawIssue(3, 'Limbo'),                                  // незамаплено → «Прочие»
    rawIssue(4, 'Done', { resolved: true }),               // resolved → скрыт
  ];
  const host = stubHost(issues);
  let stored = null;
  const deps = depsBase({ host: host, backlogPage: 50, state: { setBacklogPool: function (p) { stored = p; }, getBacklogPool: function () { return stored; } } });
  await LOADER.loadBacklogPool(deps);
  const vm = buildBacklogVm(stored, SETTINGS);
  assert.strictEqual(vm.customerPool.length, 1);          // DEMO-1
  assert.strictEqual(vm.counts.hidden, 1);                // DEMO-4 resolved
  assert.strictEqual(vm.otherBucket.length, 1);           // DEMO-3
  const zone = vm.zones.find(function (z) { return z.stateName === 'In Progress'; });
  assert.strictEqual(zone.roles.length, 2);               // analysis + devBack (оба активны)
  assert.strictEqual(zone.roles[0].tasks[0].rem, 50);     // 60−10
});

/* ── слайс 6/7 — цепочка родителей из вложенных links (_parentChain через _mapPoolIssue) ── */

test('_mapPoolIssue: родитель из INWARD-связи (targetToSource === cascadeParentLinkInward) + kind', function () {
  const iss = rawIssue(1, 'In Progress');
  iss.links = [
    { direction: 'OUTWARD', linkType: { name: 'Relates', sourceToTarget: 'relates to', targetToSource: '' }, issues: [{ idReadable: 'X-9' }] },
    { direction: 'INWARD', linkType: { name: 'Subtask', sourceToTarget: 'parent for', targetToSource: 'subtask of' },
      issues: [{ idReadable: 'EP-1', summary: ' Epic A ', customFields: [{ projectCustomField: { field: { name: 'Вид' } }, value: { name: 'Epic' } }] }] },
  ];
  const deps = depsBase({ settings: Object.assign({}, SETTINGS, { cascadeParentLinkInward: 'subtask of', cascadeKindField: 'Вид' }) });
  const t = LOADER._mapPoolIssue(iss, deps);
  assert.deepStrictEqual(t.parentChain, [{ issueId: 'EP-1', summary: 'Epic A', kind: 'Epic' }]);
});

test('_mapPoolIssue: цепочка Стори→Эпик из вложенных links (2 хопа)', function () {
  const iss = rawIssue(7, 'In Progress');
  const subtask = { name: 'Subtask', sourceToTarget: 'parent for', targetToSource: 'subtask of' };
  iss.links = [{ direction: 'INWARD', linkType: subtask, issues: [
    { idReadable: 'ST-1', summary: 'Стори', customFields: [{ projectCustomField: { field: { name: 'Вид' } }, value: { name: 'Story' } }],
      links: [{ direction: 'INWARD', linkType: subtask, issues: [
        { idReadable: 'EP-1', summary: 'Эпик', customFields: [{ projectCustomField: { field: { name: 'Вид' } }, value: { name: 'Epic' } }] }] }] },
  ] }];
  const deps = depsBase({ settings: Object.assign({}, SETTINGS, { cascadeParentLinkInward: 'subtask of', cascadeKindField: 'Вид' }) });
  const t = LOADER._mapPoolIssue(iss, deps);
  assert.deepStrictEqual(t.parentChain, [
    { issueId: 'ST-1', summary: 'Стори', kind: 'Story' },   // ближний
    { issueId: 'EP-1', summary: 'Эпик', kind: 'Epic' },     // дальний
  ]);
});

test('_mapPoolIssue: нет подходящей родительской связи → parentChain []', function () {
  const iss = rawIssue(2, 'In Progress');
  iss.links = [{ direction: 'OUTWARD', linkType: { sourceToTarget: 'relates to', targetToSource: '' }, issues: [] }];
  assert.deepStrictEqual(LOADER._mapPoolIssue(iss, depsBase()).parentChain, []);
});

test('_mapPoolIssue: дефолт cascadeParentLinkInward = «subtask of» когда не задан', function () {
  const iss = rawIssue(3, 'In Progress');
  iss.links = [{ direction: 'INWARD', linkType: { sourceToTarget: 'parent for', targetToSource: 'subtask of' }, issues: [{ idReadable: 'P-1', summary: 'P' }] }];
  const t = LOADER._mapPoolIssue(iss, depsBase());   // SETTINGS без cascadeParentLinkInward
  assert.strictEqual(t.parentChain[0].issueId, 'P-1');
  assert.strictEqual(t.parentChain[0].kind, null);    // cascadeKindField не задан
});

/* ── слайс 7 — carry-over обогащение пула из activities ── */

test('loadBacklogPool: activities → _sinceTs/_prevState (свежайшая State-смена; чужое поле игнор)', async function () {
  const iss = {
    id: 'i-1', idReadable: 'DEMO-1', summary: 't',
    customFields: [{ projectCustomField: { field: { name: 'State', id: 'F-state' } }, value: { name: 'In Progress' } }],
    tags: [],
  };
  const host = { fetchYouTrack: function (p, opts) {
    if (p === 'issues') return Promise.resolve((opts.query.$skip ? [] : [iss]));
    if (p === 'activities') return Promise.resolve([
      { timestamp: 7777, target: { idReadable: 'DEMO-1' }, field: { id: 'F-state' }, added: [{ name: 'In Progress' }], removed: [{ name: 'In Dev' }] },
      { timestamp: 1111, target: { idReadable: 'DEMO-1' }, field: { id: 'F-other' }, added: [{ name: 'x' }] }, // не State → игнор
    ]);
    return Promise.resolve([]);
  } };
  let stored = null;
  const deps = depsBase({ host: host, backlogPage: 50, state: { setBacklogPool: function (p) { stored = p; }, getBacklogPool: function () { return stored; } } });
  await LOADER.loadBacklogPool(deps);
  assert.strictEqual(stored.length, 1);
  assert.strictEqual(stored[0]._sinceTs, 7777);
  assert.strictEqual(stored[0]._prevState, 'In Dev');
});

test('loadBacklogPool: нет id поля State → carry-over пропускается (activities не зовётся)', async function () {
  const iss = { id: 'i-2', idReadable: 'DEMO-2', summary: 't',
    customFields: [{ projectCustomField: { field: { name: 'State' } }, value: { name: 'In Progress' } }], tags: [] }; // нет field.id
  let activitiesCalled = false;
  const host = { fetchYouTrack: function (p, opts) {
    if (p === 'activities') { activitiesCalled = true; return Promise.resolve([]); }
    return Promise.resolve(opts.query.$skip ? [] : [iss]);
  } };
  let stored = null;
  const deps = depsBase({ host: host, backlogPage: 50, state: { setBacklogPool: function (p) { stored = p; }, getBacklogPool: function () {} } });
  await LOADER.loadBacklogPool(deps);
  assert.strictEqual(activitiesCalled, false);   // нет fieldId → детект ненадёжен → пропуск
  assert.strictEqual(stored[0]._sinceTs, undefined);
});

/* ── слайс 8 — §8 schema-warn (computeUnmappedStates) ── */

test('computeUnmappedStates: бандл − зоны/старт/пауза/resolved → незамапленные', function () {
  const s = { backlogStartStates: ['Open'], backlogZones: [{ state: 'In Progress', roles: [] }, { state: 'Testing', roles: [] }], backlogPauseStates: ['Paused'] };
  const values = ['Open', 'In Progress', 'Testing', 'Paused', 'Done', 'Под уточнение', 'Fixed'];
  assert.deepStrictEqual(LOADER.computeUnmappedStates(values, ['Done', 'Fixed'], s), ['Под уточнение']);
});
test('computeUnmappedStates: всё замаплено/resolved → []', function () {
  assert.deepStrictEqual(LOADER.computeUnmappedStates(['Open', 'Done'], ['Done'], { backlogStartStates: ['Open'] }), []);
});
test('computeUnmappedStates: не-массив values → []', function () {
  assert.deepStrictEqual(LOADER.computeUnmappedStates(null, [], {}), []);
});
