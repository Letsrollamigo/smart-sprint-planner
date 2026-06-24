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
