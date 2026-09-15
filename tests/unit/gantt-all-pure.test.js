'use strict';
/* #122 — чистые правила режима «Все роли» (pure/gantt-all-pure.js): стадии и порядок дорожек, неявная
   цепочка задачи, конфликты сроков «раньше конца» и «вне фазы», сворачивание групп с переносом стрелок,
   стили стрелок, ось либы. Для ключевых правил есть мутационный кейс: сдвиг на день или флаг меняет
   вердикт (feedback_assertion_must_be_able_to_fail). Ось сверяется не с зафиксированными числами, а с
   функциями самой либы gantt-task-react 0.3.9, вырезанными из dist: обновление либы покраснит тест. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const G = require('../../widgets/main/src/pure/gantt-all-pure.js');
const PH = require('../../widgets/main/src/pure/phases-pure.js');
const DAY = 86400000;
const S0 = Date.UTC(2026, 9, 5);   /* пн 5 окт 2026 */
const d = (n) => S0 + n * DAY;
const SPRINT_ROLES = ['analysis', 'testing', 'devBack', 'devFront'];   /* порядок getSprintRoles = ALL_ROLES */
const bar = (rk, id, s, e) => ({ key: rk + ':' + id, rk: rk, issueId: id, startMs: d(s), endMs: d(e) });

test('#122 parseId/barKey: полоса, дорожка, группа эпика; мусор → null', () => {
  assert.deepEqual(G.parseId(G.barKey('devBack', 'NOVA-42')), { kind: 'bar', rk: 'devBack', issueId: 'NOVA-42' });
  assert.deepEqual(G.parseId('track:testing'), { kind: 'track', rk: 'testing' });
  assert.deepEqual(G.parseId('epic:devBack:NOVA-1'), { kind: 'epic', rk: 'devBack', issueId: 'NOVA-1' });
  assert.equal(G.parseId('NOVA-42'), null);
  assert.equal(G.parseId(''), null);
});

test('#122 stages: без маппинга — анализ → разработки одной стадией → тестирование; роли не из спринта выпадают', () => {
  const st = G.stages(SPRINT_ROLES, {}, PH.PHASE_KEYS);
  assert.deepEqual(st.list, [['analysis'], ['devBack', 'devFront'], ['testing']]);
  assert.deepEqual(st.order, ['analysis', 'devBack', 'devFront', 'testing']);
  assert.deepEqual(st.stageOf, { analysis: 0, devBack: 1, devFront: 1, testing: 2 });
  assert.deepEqual(G.stages(['testing', 'devIos'], {}, PH.PHASE_KEYS).list, [['devIos'], ['testing']]);
});

test('#122 stages: маппинг фаз — роль из двух фаз в первой, фаза без свободных ролей пропускается, остаток встроенным порядком перед более поздней стадией', () => {
  const settings = { phasesEnabled: true, phaseRoles: {
    analysis: ['analysis'], development: ['devBack'], techTest: ['testing', 'devBack'], regression: ['testing'] } };
  const st = G.stages(SPRINT_ROLES, settings, PH.PHASE_KEYS);
  assert.deepEqual(st.list, [['analysis'], ['devBack'], ['devFront'], ['testing']]);
  assert.equal(st.stageOf.devBack, 1, 'devBack в «Разработке», не в «Тех. тесте»');
  /* мутация: тумблер фаз выключен — маппинг не участвует, порядок встроенный */
  assert.deepEqual(G.stages(SPRINT_ROLES, Object.assign({}, settings, { phasesEnabled: false }), PH.PHASE_KEYS).order,
    ['analysis', 'devBack', 'devFront', 'testing']);
  /* мутация: пустой маппинг при включённом тумблере — тоже встроенный */
  assert.deepEqual(G.stages(SPRINT_ROLES, { phasesEnabled: true, phaseRoles: { analysis: [] } }, PH.PHASE_KEYS).order,
    ['analysis', 'devBack', 'devFront', 'testing']);
});

test('#122 stages: частичный маппинг (⚖ 2026-09-14) — роли вне фаз встают до замапленной более поздней стадии', () => {
  const only = { phasesEnabled: true, phaseRoles: { techTest: ['testing'], regression: ['testing'] } };
  assert.deepEqual(G.stages(SPRINT_ROLES, only, PH.PHASE_KEYS).list, [['analysis'], ['devBack', 'devFront'], ['testing']],
    'тестирование из маппинга не встаёт первым');
  /* мутация: замаплен только анализ — разработка и тестирование идут после него */
  assert.deepEqual(G.stages(SPRINT_ROLES, { phasesEnabled: true, phaseRoles: { analysis: ['analysis'] } }, PH.PHASE_KEYS).list,
    [['analysis'], ['devBack', 'devFront'], ['testing']]);
  /* мутация: замаплена разработка — анализ до неё, тестирование после; неизвестная роль — в конце */
  assert.deepEqual(G.stages(['analysis', 'testing', 'devBack', 'custom'], { phasesEnabled: true, phaseRoles: { development: ['devBack'] } }, PH.PHASE_KEYS).list,
    [['analysis'], ['devBack'], ['testing'], ['custom']]);
});

test('#122 chainEdges: соседние непустые стадии, внутри стадии рёбер нет', () => {
  const stageOf = G.stages(SPRINT_ROLES, {}, PH.PHASE_KEYS).stageOf;
  const edges = (rks, id) => G.chainEdges(rks.map((rk) => ({ key: rk + ':' + id, rk: rk, issueId: id })), stageOf);
  assert.deepEqual(edges(['analysis', 'devBack', 'testing'], 'N1'),
    [{ from: 'analysis:N1', to: 'devBack:N1' }, { from: 'devBack:N1', to: 'testing:N1' }]);
  assert.deepEqual(edges(['devBack', 'devFront'], 'N2'), []);
  assert.deepEqual(edges(['analysis', 'devBack', 'devFront'], 'N3'),
    [{ from: 'analysis:N3', to: 'devBack:N3' }, { from: 'analysis:N3', to: 'devFront:N3' }]);
  assert.deepEqual(edges(['testing', 'analysis'], 'N4'), [{ from: 'analysis:N4', to: 'testing:N4' }], 'пропуск пустой стадии разработки');
  assert.deepEqual(edges(['devBack'], 'N5'), [], 'роль без пары');
});

test('#122 conflicts: цепочка — день в день конфликт, на день позже — нет', () => {
  const chain = [{ from: 'analysis:N1', to: 'devBack:N1' }];
  const hit = G.conflicts([bar('analysis', 'N1', 0, 3), bar('devBack', 'N1', 3, 6)], {}, chain, {});
  assert.equal(hit.total, 1);
  assert.deepEqual(hit.byBar['devBack:N1'], [{ kind: 'before', predKey: 'analysis:N1', predIssue: 'N1', predRole: 'analysis', predEnd: d(3) }]);
  assert.deepEqual(hit.edges, { 'analysis:N1→devBack:N1': true });
  const miss = G.conflicts([bar('analysis', 'N1', 0, 3), bar('devBack', 'N1', 4, 6)], {}, chain, {});
  assert.equal(miss.total, 0, 'мутация: старт на день позже снимает конфликт');
  assert.deepEqual(miss.edges, {});
});

test('#122 conflicts: явная связь проверяется по КАЖДОЙ полосе предшественника в любой роли (§О15)', () => {
  const bars = [bar('analysis', 'N1', 0, 3), bar('testing', 'N1', 5, 8), bar('devBack', 'N2', 4, 6)];
  const preds = { N2: [{ id: 'N1', type: 'Depend' }], N1: [{ id: 'EXT-1', type: 'Depend' }] };
  const r = G.conflicts(bars, preds, [], {});
  assert.equal(r.byBar['devBack:N2'].length, 1);
  assert.equal(r.byBar['devBack:N2'][0].predRole, 'testing', 'виновник — полоса тестирования, анализ кончился раньше');
  assert.deepEqual(Object.keys(r.edges), ['testing:N1→devBack:N2']);
  /* мутация: тестирование предшественника закончилось до старта — конфликтов нет */
  const r2 = G.conflicts([bar('analysis', 'N1', 0, 3), bar('testing', 'N1', 2, 3), bar('devBack', 'N2', 4, 6)], preds, [], {});
  assert.equal(r2.total, 0);
});

test('#122 conflicts: «вне фазы» — по объединению фаз роли; не считается без тумблера, без маппинга, для роли вне маппинга', () => {
  const phases = PH.normalize({ analysis: { dateStart: d(0), dateEnd: d(3) }, development: { dateStart: d(4), dateEnd: d(10) },
    techTest: { dateStart: d(11), dateEnd: d(14) } });
  const ctx = { enabled: true, phases: phases, phaseKeys: PH.PHASE_KEYS,
    phaseRoles: { analysis: ['analysis'], development: ['devBack'], techTest: ['devBack'] } };
  assert.equal(G.conflicts([bar('devBack', 'N1', 5, 14)], {}, [], ctx).total, 0, 'конец в последний день объединения — внутри');
  const out = G.conflicts([bar('devBack', 'N1', 5, 15)], {}, [], ctx);
  assert.deepEqual(out.byBar['devBack:N1'], [{ kind: 'phase', from: d(5), to: d(15), phases: ['development', 'techTest'] }]);
  assert.equal(G.conflicts([bar('devBack', 'N1', 3, 8)], {}, [], ctx).phase, 1, 'старт раньше начала');
  assert.equal(G.conflicts([bar('devBack', 'N1', 5, 15)], {}, [], Object.assign({}, ctx, { enabled: false })).total, 0);
  assert.equal(G.conflicts([bar('devBack', 'N1', 5, 15)], {}, [], Object.assign({}, ctx, { phaseRoles: {} })).total, 0);
  assert.equal(G.conflicts([bar('devFront', 'N1', 5, 15)], {}, [], ctx).total, 0, 'роль вне маппинга');
});

test('#122 conflicts: счётчик — полосы, а не причины', () => {
  const ctx = { enabled: true, phaseKeys: PH.PHASE_KEYS, phaseRoles: { development: ['devBack'] },
    phases: PH.normalize({ development: { dateStart: d(4), dateEnd: d(10) } }) };
  const r = G.conflicts([bar('analysis', 'N1', 0, 5), bar('devBack', 'N1', 3, 6)], {}, [{ from: 'analysis:N1', to: 'devBack:N1' }], ctx);
  assert.equal(r.byBar['devBack:N1'].length, 2, 'у полосы две причины');
  assert.deepEqual({ total: r.total, before: r.before, phase: r.phase }, { total: 1, before: 1, phase: 1 });
});

test('#122 collapseRows: свёрнутая дорожка забирает стрелки детей, ссылки на спрятанных переезжают на неё, дубли и петли сняты', () => {
  const rows = [
    { id: 'track:analysis', parent: null },
    { id: 'analysis:N1', parent: 'track:analysis' },
    { id: 'track:devBack', parent: null },
    { id: 'devBack:N1', parent: 'track:devBack', dependencies: ['analysis:N1'], depTypes: { 'analysis:N1': '__chain' } },
    { id: 'devBack:N2', parent: 'track:devBack', dependencies: ['analysis:N1'], depTypes: { 'analysis:N1': 'Depend' } },
    { id: 'devBack:N3', parent: 'track:devBack', dependencies: ['devBack:N1'], depTypes: { 'devBack:N1': 'Depend' } },
    { id: 'track:testing', parent: null },
    { id: 'testing:N1', parent: 'track:testing', dependencies: ['devBack:N1', 'EXT-9'], depTypes: { 'devBack:N1': '__chain' } },
  ];
  const a = G.collapseRows(rows, { 'track:analysis': 1 });
  assert.deepEqual(a.rows.map((r) => r.id), ['track:analysis', 'track:devBack', 'devBack:N1', 'devBack:N2', 'devBack:N3', 'track:testing', 'testing:N1']);
  assert.deepEqual(a.rows.find((r) => r.id === 'devBack:N2').dependencies, ['track:analysis']);
  assert.equal(a.repOf['analysis:N1'], 'track:analysis');

  const b = G.collapseRows(rows, { 'track:devBack': 1 });
  const grp = b.rows.find((r) => r.id === 'track:devBack');
  assert.deepEqual(grp.dependencies, ['analysis:N1'], 'две зависимости детей на одну цель — одна стрелка; N3→N1 внутри группы — петля снята');
  assert.deepEqual(grp.depTypes, { 'analysis:N1': '__chain' });
  assert.deepEqual(b.rows.find((r) => r.id === 'testing:N1').dependencies, ['track:devBack', 'EXT-9']);
  /* мутация: ничего не свёрнуто — строки и ссылки как были */
  assert.equal(G.collapseRows(rows, {}).rows.length, rows.length);
  assert.deepEqual(G.collapseRows(rows, {}).rows.find((r) => r.id === 'testing:N1').dependencies, ['devBack:N1', 'EXT-9']);
});

test('#122 collapseRows: вложенность дорожка → эпик → задача — представитель внешний свёрнутый предок', () => {
  const rows = [
    { id: 'track:devBack', parent: null },
    { id: 'epic:devBack:E1', parent: 'track:devBack' },
    { id: 'devBack:C1', parent: 'epic:devBack:E1', dependencies: ['analysis:N1'], depTypes: { 'analysis:N1': 'Depend' } },
    { id: 'track:testing', parent: null },
    { id: 'testing:N1', parent: 'track:testing', dependencies: ['devBack:C1'], depTypes: {} },
  ];
  const epic = G.collapseRows(rows, { 'epic:devBack:E1': 1 });
  assert.deepEqual(epic.rows.find((r) => r.id === 'testing:N1').dependencies, ['epic:devBack:E1']);
  assert.deepEqual(epic.rows.find((r) => r.id === 'epic:devBack:E1').dependencies, ['analysis:N1']);
  const both = G.collapseRows(rows, { 'epic:devBack:E1': 1, 'track:devBack': 1 });
  assert.deepEqual(both.rows.map((r) => r.id), ['track:devBack', 'track:testing', 'testing:N1']);
  assert.deepEqual(both.rows.find((r) => r.id === 'testing:N1').dependencies, ['track:devBack']);
  assert.deepEqual(both.rows[0].dependencies, ['analysis:N1']);
});

test('#122 arrowStyles: цвет типа, цепочка пунктиром, виновник конфликта --warn поверх, чужой тип не трогаем', () => {
  const plan = [{ from: 'a', to: 'b', type: 'Depend' }, { from: 'x', to: 'y', type: '__chain' }, { from: 'a', to: 'c', type: 'Other' }, { from: 'p', to: 'q', type: '__chain' }];
  assert.deepEqual(G.arrowStyles(plan, { Depend: '#5585D7' }, { 'x→y': true }), [
    { stroke: '#5585D7', dash: null, width: null },
    { stroke: 'var(--warn)', dash: '5 4', width: 2 },
    null,
    { stroke: 'var(--muted)', dash: '5 4', width: null },
  ]);
});

test('#122 span: охват полос с датами', () => {
  assert.deepEqual(G.span([bar('devBack', 'N1', 2, 5), bar('devBack', 'N2', 0, 3), { key: 'x' }]), { startMs: d(0), endMs: d(5) });
  assert.equal(G.span([]), null);
});

/* Оракул оси: функции самой либы из dist (ViewMode и хелпер итерации — минимальные заглушки). */
function libAxis() {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'node_modules', 'gantt-task-react', 'dist', 'index.modern.js'), 'utf8');
  const pick = (name) => {
    const m = new RegExp('var ' + name + ' = function ' + name + '\\([\\s\\S]*?\\n};\\n').exec(src);
    assert.ok(m, 'в dist либы нет ' + name + ' — версия поменялась, сверить ось заново');
    return m[0];
  };
  return new Function([
    'var ViewMode = { Hour: "Hour", QuarterDay: "Quarter Day", HalfDay: "Half Day", Day: "Day", Week: "Week", Month: "Month", Year: "Year" };',
    'function _createForOfIteratorHelperLoose(a) { var i = 0; return function () { return i < a.length ? { done: false, value: a[i++] } : { done: true }; }; }',
    pick('addToDate'), pick('startOfDate'), pick('getMonday'), pick('ganttDateRange'), pick('seedDates'), pick('taskXCoordinate'),
    'return { ganttDateRange: ganttDateRange, seedDates: seedDates, taskXCoordinate: taskXCoordinate, ViewMode: ViewMode };',
  ].join('\n'))();
}

test('#122 ось: axisDates и xOf совпадают с арифметикой либы 0.3.9 в режимах Day/Week/Month', () => {
  const L = libAxis();
  const tasks = [{ start: new Date(2026, 9, 7), end: new Date(2026, 9, 17) }, { start: new Date(2026, 9, 12), end: new Date(2026, 10, 3) }];
  ['Day', 'Week', 'Month'].forEach((mode) => {
    const range = L.ganttDateRange(tasks, L.ViewMode[mode], 1);
    const libDates = L.seedDates(range[0], range[1], L.ViewMode[mode]);
    const ours = G.axisDates(new Date(2026, 9, 7), new Date(2026, 10, 3), mode);
    assert.deepEqual(ours.map(Number), libDates.map(Number), mode + ': даты оси');
    [new Date(2026, 9, 7), new Date(2026, 9, 20, 0), new Date(2026, 10, 3)].forEach((x) => {
      assert.equal(G.xOf(x, ours, 44), L.taskXCoordinate(x, ours, 44), mode + ': x ' + x.toDateString());
    });
  });
  /* хвост Day — +19 дней от последнего конца, не «+1 шаг» */
  const day = G.axisDates(new Date(2026, 9, 7), new Date(2026, 10, 3), 'Day');
  assert.equal(+day[0], +new Date(2026, 9, 6));
  assert.equal(+day[day.length - 1], +new Date(2026, 10, 22));
  /* клэмп за краями: у либы индекс −1 уронил бы рендер */
  assert.equal(G.xOf(new Date(2026, 8, 1), day, 44), 0);
  assert.equal(G.xOf(new Date(2027, 0, 1), day, 44), (day.length - 1) * 44);
});

test('#122 monthSpans: центр отрезка каждого месяца внутри оси (Day)', () => {
  const day = G.axisDates(new Date(2026, 9, 7), new Date(2026, 10, 3), 'Day');   /* 6 окт … 22 ноя */
  const sp = G.monthSpans(day, 44);
  assert.equal(sp.length, 2);
  const nov1 = G.xOf(new Date(2026, 10, 1), day, 44);
  assert.equal(sp[0].x, nov1 / 2, 'октябрь: от левого края оси до 1 ноября');
  assert.equal(sp[0].w, nov1, 'ширина видимого отрезка октября');
  assert.equal(sp[1].x, (nov1 + (day.length - 1) * 44) / 2, 'ноябрь: от 1 ноября до правого края');
  assert.equal(sp[1].date.getMonth(), 10);
});

/* ── 3.48.0: группы эпиков (§A6) ── */
test('#122 epicLayout: родитель в дорожке — группа на его месте; в чужой роли — на месте первой подзадачи; вне спринта — плоско', () => {
  const inSprint = { 'N-1': true, 'N-5': true, 'N-6': true, 'N-7': true, 'N-9': true };
  const parents = { 'N-5': ['N-9'], 'N-6': ['N-9'] };
  assert.deepEqual(G.epicLayout(['N-1', 'N-9', 'N-5', 'N-7', 'N-6'], parents, inSprint), [
    { id: 'N-1', children: null }, { id: 'N-9', children: ['N-5', 'N-6'], own: true }, { id: 'N-7', children: null },
  ]);
  assert.deepEqual(G.epicLayout(['N-1', 'N-5', 'N-7', 'N-6'], parents, inSprint), [
    { id: 'N-1', children: null }, { id: 'N-9', children: ['N-5', 'N-6'], own: false }, { id: 'N-7', children: null },
  ], 'родитель в другой роли — группа встаёт на место N-5');
  /* мутация: родителя нет в спринте — группы нет */
  const out = Object.assign({}, inSprint); delete out['N-9'];
  assert.deepEqual(G.epicLayout(['N-5', 'N-6'], parents, out), [{ id: 'N-5', children: null }, { id: 'N-6', children: null }]);
  /* родитель в дорожке без своих подзадач здесь — обычная строка */
  assert.deepEqual(G.epicLayout(['N-9', 'N-1'], parents, inSprint), [{ id: 'N-9', children: null }, { id: 'N-1', children: null }]);
});

test('#122 epicLayout: два родителя в спринте — первый по idReadable (§О8), числовое сравнение; один уровень вложенности', () => {
  const inSprint = { 'N-2': true, 'N-9': true, 'N-10': true, 'N-3': true };
  assert.deepEqual(G.epicLayout(['N-2'], { 'N-2': ['N-10', 'N-9'] }, inSprint), [{ id: 'N-9', children: ['N-2'], own: false }]);
  /* N-9 — родитель N-2 и сам подзадача N-3: в дорожке он голова своей группы, под N-3 не уходит */
  assert.deepEqual(G.epicLayout(['N-9', 'N-2'], { 'N-2': ['N-9'], 'N-9': ['N-3'] }, inSprint),
    [{ id: 'N-9', children: ['N-2'], own: true }]);
  /* три яруса в одной дорожке: N-3 → N-9 → N-2; N-9 — голова, N-3 без детей здесь остаётся строкой, не исчезает */
  assert.deepEqual(G.epicLayout(['N-3', 'N-9', 'N-2'], { 'N-2': ['N-9'], 'N-9': ['N-3'] }, inSprint),
    [{ id: 'N-3', children: null }, { id: 'N-9', children: ['N-2'], own: true }]);
});

/* ── 3.48.0: прогноз по всем ролям (§A5) ── */
test('#122 packOne: старт — первый день с остатком не раньше fromIdx; не влезла — потреблённое возвращается', () => {
  const q = [8, 8, 8];
  assert.deepEqual(G.packOne(q, 12, 0), { startIdx: 0, endIdx: 1 });
  assert.deepEqual(q, [0, 4, 8]);
  assert.equal(G.packOne(q, 20, 1), null);
  assert.deepEqual(q, [0, 4, 8], 'частичное потребление откатилось');
  assert.deepEqual(G.packOne(q, 12, 1), { startIdx: 1, endIdx: 2 });
});

const FDAYS = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'];
const person = (h) => ({ days: FDAYS.slice(), quotas: FDAYS.map(() => h) });
function fc(over) {
  return G.forecastAll(Object.assign({ bars: [], preds: {}, chain: [], queues: {}, people: {}, needH: {} }, over));
}

test('#122 forecastAll: зависимая стартует на следующий день после конца предшественника; мутация — предшественник короче', () => {
  const bars = [{ key: 'devBack:A', issueId: 'A' }, { key: 'testing:B', issueId: 'B' }];
  const base = { bars: bars, preds: { B: [{ id: 'A' }] }, queues: { 'u1|devBack': ['devBack:A'], 'u2|testing': ['testing:B'] },
    people: { 'u1|devBack': person(8), 'u2|testing': person(8) } };
  const r = fc(Object.assign({ needH: { 'devBack:A': 16, 'testing:B': 8 } }, base));
  assert.deepEqual(r.dates['devBack:A'], { startIso: '2026-10-05', endIso: '2026-10-06' });
  assert.deepEqual(r.dates['testing:B'], { startIso: '2026-10-07', endIso: '2026-10-07' });
  const m = fc(Object.assign({ needH: { 'devBack:A': 8, 'testing:B': 8 } }, base));
  assert.equal(m.dates['testing:B'].startIso, '2026-10-06');
});

test('#122 forecastAll: окно ожидания занимает следующая задача очереди (⚖5); мутация — без связи порядок очереди', () => {
  const bars = [{ key: 'devBack:A', issueId: 'A' }, { key: 'testing:B', issueId: 'B' }, { key: 'testing:C', issueId: 'C' }];
  const base = { bars: bars, queues: { 'u0|testing': ['testing:B', 'testing:C'], 'u1|devBack': ['devBack:A'] },
    people: { 'u0|testing': person(8), 'u1|devBack': person(8) }, needH: { 'devBack:A': 16, 'testing:B': 8, 'testing:C': 16 } };
  const r = fc(Object.assign({ preds: { B: [{ id: 'A' }] } }, base));
  assert.deepEqual(r.dates['testing:C'], { startIso: '2026-10-05', endIso: '2026-10-06' }, 'C занял дни, пока B ждёт A');
  assert.deepEqual(r.dates['testing:B'], { startIso: '2026-10-07', endIso: '2026-10-07' });
  const m = fc(base);
  assert.equal(m.dates['testing:B'].startIso, '2026-10-05');
  assert.equal(m.dates['testing:C'].startIso, '2026-10-06');
});

test('#122 forecastAll: «не помещается» возвращает потреблённое и не обрывает очередь', () => {
  const r = fc({ bars: [{ key: 'devBack:X', issueId: 'X' }, { key: 'devBack:Y', issueId: 'Y' }],
    queues: { 'u1|devBack': ['devBack:X', 'devBack:Y'] }, people: { 'u1|devBack': person(8) }, needH: { 'devBack:X': 50, 'devBack:Y': 8 } });
  assert.deepEqual(r.unfit['devBack:X'], { reason: 'cap', waitsFor: null });
  assert.deepEqual(r.dates['devBack:Y'], { startIso: '2026-10-05', endIso: '2026-10-05' });
});

test('#122 forecastAll: фиксированный предшественник — своим концом; без дат (нет исполнителя) — зависимые ждут, в т.ч. по цепочке', () => {
  const bars = [{ key: 'analysis:T', issueId: 'T', endMs: null }, { key: 'devBack:T', issueId: 'T' }];
  const base = { bars: bars, chain: [{ from: 'analysis:T', to: 'devBack:T' }], queues: { 'u1|devBack': ['devBack:T'] },
    people: { 'u1|devBack': person(8) }, needH: { 'devBack:T': 8 } };
  assert.deepEqual(fc(base).unfit['devBack:T'], { reason: 'wait', waitsFor: 'analysis:T' });
  const dated = fc(Object.assign({}, base, { bars: [{ key: 'analysis:T', issueId: 'T', endMs: Date.UTC(2026, 9, 6) }, bars[1]] }));
  assert.deepEqual(dated.dates['devBack:T'], { startIso: '2026-10-07', endIso: '2026-10-07' });
  /* ожидание наследуется: C ждёт T, которая сама без дат */
  const chainWait = fc(Object.assign({}, base, { bars: bars.concat([{ key: 'testing:C', issueId: 'C' }]), preds: { C: [{ id: 'T' }] },
    queues: { 'u1|devBack': ['devBack:T'], 'u2|testing': ['testing:C'] }, people: { 'u1|devBack': person(8), 'u2|testing': person(8) },
    needH: { 'devBack:T': 8, 'testing:C': 8 } }));
  assert.equal(chainWait.unfit['testing:C'].reason, 'wait');
});

test('#122 forecastAll: цикл из двух задач — укладываются как независимые и попадают в cycles; порядок входа не влияет', () => {
  const bars = [{ key: 'devBack:N-2', issueId: 'N-2' }, { key: 'devBack:N-10', issueId: 'N-10' }];
  const input = { bars: bars, preds: { 'N-2': [{ id: 'N-10' }], 'N-10': [{ id: 'N-2' }] },
    queues: { 'u1|devBack': ['devBack:N-2'], 'u2|devBack': ['devBack:N-10'] },
    people: { 'u1|devBack': person(8), 'u2|devBack': person(8) }, needH: { 'devBack:N-2': 8, 'devBack:N-10': 8 } };
  const r = fc(input);
  assert.deepEqual(r.cycles, [['N-2', 'N-10']]);
  assert.equal(r.dates['devBack:N-2'].startIso, '2026-10-05');
  assert.equal(r.dates['devBack:N-10'].startIso, '2026-10-05');
  assert.deepEqual(r.unfit, {});
  assert.deepEqual(fc(Object.assign({}, input, { bars: bars.slice().reverse() })), r);
});

/* ── 3.48.2: очередь сквозного прогноза без дат (#132) ── */
test('#132 queueOrder: ранг → ключ (N-2 раньше N-10), даты не участвуют, без ранга — в хвост', () => {
  const e = [
    { key: 'devBack:N-10', issueId: 'N-10', rank: 1, startMs: Date.UTC(2026, 9, 5) },
    { key: 'devBack:N-3', issueId: 'N-3', startMs: Date.UTC(2026, 9, 1) },
    { key: 'devBack:N-2', issueId: 'N-2', rank: 1, startMs: Date.UTC(2026, 9, 9) },
    { key: 'devBack:N-7', issueId: 'N-7', rank: 0, startMs: Date.UTC(2026, 9, 20) },
  ];
  assert.deepEqual(G.queueOrder(e).map((x) => x.issueId), ['N-7', 'N-2', 'N-10', 'N-3']);
  assert.equal(e[0].issueId, 'N-10', 'вход не мутирован');
});

test('#132 forecastAll + queueOrder: повторный прогноз поверх собственных дат даёт те же даты; мутация — очередь по датам старта переставляет задачи', () => {
  const days = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'];
  const ms = (iso) => Date.parse(iso + 'T00:00:00Z');
  /* A первой по приоритету, 40 ч, ждёт фиксированного предшественника P до 06.10; B 32 ч без предшественников */
  const input = (ta, order) => {
    const bars = [{ key: 'devBack:P', issueId: 'P', endMs: ms('2026-10-06') },
      { key: 'devBack:A', issueId: 'A', rank: 0, startMs: ta.A && ta.A[0], endMs: ta.A && ta.A[1] },
      { key: 'devBack:B', issueId: 'B', rank: 1, startMs: ta.B && ta.B[0], endMs: ta.B && ta.B[1] }];
    return { bars: bars, preds: { A: [{ id: 'P' }] }, queues: { 'u1|devBack': order(bars.slice(1)).map((b) => b.key) },
      people: { 'u1|devBack': { days: days, quotas: days.map(() => 8) } }, needH: { 'devBack:A': 40, 'devBack:B': 32 } };
  };
  const back = (r) => ({ A: [ms(r.dates['devBack:A'].startIso), ms(r.dates['devBack:A'].endIso)], B: [ms(r.dates['devBack:B'].startIso), ms(r.dates['devBack:B'].endIso)] });
  const run1 = fc(input({}, G.queueOrder));
  assert.equal(run1.dates['devBack:B'].startIso, '2026-10-05', 'B обтекает ожидающую A (⚖5)');
  assert.deepEqual(fc(input(back(run1), G.queueOrder)).dates, run1.dates);
  const byStart = (bs) => bs.slice().sort((a, b) => a.startMs - b.startMs);
  assert.notDeepEqual(fc(input(back(run1), byStart)).dates, run1.dates, 'очередь по датам старта неидемпотентна — ассерт умеет падать');
});

