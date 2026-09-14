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
