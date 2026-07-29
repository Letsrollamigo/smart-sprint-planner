'use strict';

/* #50 S1b — примитив bulkStateTransitions + чистый разбор parseStateChunk.
 * Гейтит ядро D7 (анти-тихая-порча): детект обрезки (hitTop), per-issue недобор при
 * starvation → incomplete (а НЕ молча пусто), «нет перехода при полном чанке» → статус
 * с создания, fail-loud на сетевом сбое чанка. */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const pure = require(path.join(__dirname, '..', '..', 'widgets', 'main', 'src', 'pure', 'reporting-pure.js'));
const { parseStateChunk, parseAnchorsChunk, workdaysBetween, agingLevel, buildAgingRows } = pure;

const DAY = 86400000;

/* data-модуль читает pure через window-мост в РАНТАЙМЕ (_pure()) — инжектим и НЕ снимаем:
   node:test изолирует процесс per-file, утечки в другие файлы нет; parseStateChunk-тесты
   window не используют. */
global.window = { __SSP_REPORTING_PURE: pure };
const { bulkStateTransitions, bulkAnchorTransitions, bulkWorkItems, _parseWorkItems, _fmtWorkDate,
  CHUNK_SIZE, TOP_LIMIT, MAX_ACT_FETCHES } =
  require(path.join(__dirname, '..', '..', 'widgets', 'main', 'src', 'data', 'reporting-data.js'));

/* Фабрика activity в форме Activities API (см. _fetchGanttStateHistory). */
function act(id, ts, toState, fromState, fieldId) {
  return {
    timestamp: ts,
    target: { idReadable: id },
    field: { id: fieldId || 'STATE_FIELD', name: 'State' },
    added: toState ? [{ name: toState, localizedName: toState, $type: 'StateBundleElement' }] : [],
    removed: fromState ? [{ name: fromState, localizedName: fromState, $type: 'StateBundleElement' }] : []
  };
}

// ─────────────────────────── parseStateChunk ───────────────────────────

test('parseStateChunk: новейший вход в текущий статус per issue (reverse=true → первый встреченный)', () => {
  // reverse=true: новейшие первыми. У A два перехода — берём первый (новейший).
  const acts = [
    act('P-1', 3000, 'Тех.тест', 'Разработка', 'STATE_FIELD'),
    act('P-1', 1000, 'Разработка', 'Анализ', 'STATE_FIELD'),
    act('P-2', 2500, 'Разработка', 'Анализ', 'STATE_FIELD')
  ];
  const r = parseStateChunk(acts, ['P-1', 'P-2'], { fieldId: 'STATE_FIELD', topLimit: 300 });
  assert.equal(r.transitions['P-1'].enteredAt, 3000);
  assert.equal(r.transitions['P-1'].toState, 'Тех.тест');
  assert.equal(r.transitions['P-1'].fromState, 'Разработка');
  assert.equal(r.transitions['P-2'].enteredAt, 2500);
  assert.deepEqual(r.incomplete, []);
  assert.deepEqual(r.noTransition, []);
  assert.equal(r.diag.hitTop, false);
  assert.equal(r.diag.issuesWithTransition, 2);
});

test('parseStateChunk: не-State активности игнорируются (идентификация по field.id)', () => {
  const acts = [
    act('P-1', 3000, 'Приоритет-высокий', null, 'PRIORITY_FIELD'), // чужое поле, новее
    act('P-1', 2000, 'Разработка', 'Анализ', 'STATE_FIELD')
  ];
  const r = parseStateChunk(acts, ['P-1'], { fieldId: 'STATE_FIELD', topLimit: 300 });
  assert.equal(r.transitions['P-1'].enteredAt, 2000);
  assert.equal(r.transitions['P-1'].toState, 'Разработка');
});

test('parseStateChunk: fallback по $type StateBundleElement когда fieldId не задан', () => {
  const a = act('P-1', 2000, 'Разработка', 'Анализ', 'STATE_FIELD');
  const notState = { timestamp: 3000, target: { idReadable: 'P-1' }, field: { id: 'X', name: 'Assignee' },
    added: [{ name: 'user', $type: 'User' }], removed: [] };
  const r = parseStateChunk([notState, a], ['P-1'], { fieldId: '', topLimit: 300 });
  assert.equal(r.transitions['P-1'].enteredAt, 2000); // User-активность отброшена, взята State
});

test('parseStateChunk: обрезка (hitTop) + задача без перехода → incomplete (D7, не молча пусто)', () => {
  const acts = [act('P-1', 3000, 'Разработка', 'Анализ', 'STATE_FIELD'), act('P-1', 2000, 'Анализ', null, 'STATE_FIELD')];
  // topLimit=2, length=2 → hitTop. P-2 перехода нет.
  const r = parseStateChunk(acts, ['P-1', 'P-2'], { fieldId: 'STATE_FIELD', topLimit: 2 });
  assert.equal(r.diag.hitTop, true);
  assert.deepEqual(r.incomplete, ['P-2']);
  assert.deepEqual(r.noTransition, []);
});

test('parseStateChunk: chunk starvation — гиперактивная задача забивает $top, остальные incomplete', () => {
  // topLimit=3, 3 активности ВСЕ по P-1 (флуд), P-2 не влез вовсе.
  const acts = [
    act('P-1', 3000, 'Тех.тест', 'Разработка', 'STATE_FIELD'),
    act('P-1', 2900, 'Разработка', 'Анализ', 'STATE_FIELD'),
    act('P-1', 2800, 'Анализ', 'Открыта', 'STATE_FIELD')
  ];
  const r = parseStateChunk(acts, ['P-1', 'P-2'], { fieldId: 'STATE_FIELD', topLimit: 3 });
  assert.equal(r.diag.hitTop, true);
  assert.equal(r.diag.perIssueMax, 3); // индикатор starvation
  assert.equal(r.transitions['P-1'].enteredAt, 3000);
  assert.deepEqual(r.incomplete, ['P-2']); // молча НЕ пропущена — сигнал неполноты
});

test('parseStateChunk: нет перехода при НЕобрезанном чанке → noTransition (статус с создания)', () => {
  const acts = [act('P-1', 2000, 'Разработка', 'Анализ', 'STATE_FIELD')]; // 1 активность, topLimit=300 → не обрезан
  const r = parseStateChunk(acts, ['P-1', 'P-2'], { fieldId: 'STATE_FIELD', topLimit: 300 });
  assert.equal(r.diag.hitTop, false);
  assert.deepEqual(r.incomplete, []);
  assert.deepEqual(r.noTransition, ['P-2']); // всё влезло, перехода нет → статус с создания
});

test('parseStateChunk: не-массив activities → пусто, всё в noTransition (без обрезки)', () => {
  const r = parseStateChunk(null, ['P-1'], { fieldId: 'STATE_FIELD', topLimit: 300 });
  assert.equal(r.diag.activitiesReturned, 0);
  assert.deepEqual(r.noTransition, ['P-1']);
  assert.deepEqual(r.incomplete, []);
});

// ─────────────────────────── parseAnchorsChunk (A2 TTM) ───────────────────────────

test('parseAnchorsChunk: первый (старейший) вход в якорь под reopen — OVERWRITE оставляет самый ранний', () => {
  // reverse=true: новейшие первыми. Задача входила в InProgress дважды (1000 и 3000).
  const acts = [
    act('P-1', 3000, 'InProgress', 'Review', 'STATE_FIELD'),  // 2-й вход (новее)
    act('P-1', 2000, 'Review', 'InProgress', 'STATE_FIELD'),
    act('P-1', 1000, 'InProgress', 'Open', 'STATE_FIELD')     // 1-й вход (старейший)
  ];
  const r = parseAnchorsChunk(acts, ['P-1'], { fieldId: 'STATE_FIELD', topLimit: 300, anchorStates: ['InProgress', 'Done'] });
  assert.equal(r.anchors['P-1'].InProgress, 1000);            // первый вход = последнее совпадение
  assert.equal(r.anchors['P-1'].Done, undefined);            // в Done не входил
  assert.deepEqual(r.timelines['P-1'].map((e) => e.ts), [1000, 2000, 3000]); // хронологический таймлайн
  assert.deepEqual(r.timelines['P-1'].map((e) => e.to), ['InProgress', 'Review', 'InProgress']);
  assert.deepEqual(r.incomplete, []);
  assert.equal(r.diag.hitTop, false);
});

test('parseAnchorsChunk: ОЧИСТКА State (added пуст, removed есть) эмитится как {to:null} (Bug 2 адверс, D7)', () => {
  const acts = [
    act('P-1', 2000, null, 'InProgress', 'STATE_FIELD'),      // очистка: added=[], removed=InProgress
    act('P-1', 1000, 'InProgress', 'Open', 'STATE_FIELD')     // обычный вход
  ];
  const r = parseAnchorsChunk(acts, ['P-1'], { fieldId: 'STATE_FIELD', topLimit: 300, anchorStates: ['InProgress'] });
  assert.deepEqual(r.timelines['P-1'].map((e) => e.to), ['InProgress', null]);   // очистка НЕ дропнута
  assert.deepEqual(r.timelines['P-1'].map((e) => e.from), ['Open', 'InProgress']);
  assert.equal(r.anchors['P-1'].InProgress, 1000);            // якорь по очистке не пишется (nm=null)
});

test('parseAnchorsChunk: первый вход не зависит от порядка обхода (min-по-времени, не reverse-only)', () => {
  // Те же два входа в InProgress (1000 и 3000), но поданы СТАРЕЙШИЕ первыми (не reverse:true).
  // Guard min-по-времени обязан всё равно оставить 1000 — инвариант «первый вход» не должен молча
  // ломаться, если fetch-порядок когда-либо изменится.
  const acts = [
    act('P-1', 1000, 'InProgress', 'Open', 'STATE_FIELD'),     // старейший подан первым
    act('P-1', 2000, 'Review', 'InProgress', 'STATE_FIELD'),
    act('P-1', 3000, 'InProgress', 'Review', 'STATE_FIELD')    // новейший подан последним
  ];
  const r = parseAnchorsChunk(acts, ['P-1'], { fieldId: 'STATE_FIELD', topLimit: 300, anchorStates: ['InProgress', 'Done'] });
  assert.equal(r.anchors['P-1'].InProgress, 1000);            // старейший вход, независимо от порядка
});

test('parseAnchorsChunk: оба якоря (старт+конец) фиксируются с их ПЕРВЫМ входом', () => {
  const acts = [
    act('P-1', 5000, 'Done', 'InProgress', 'STATE_FIELD'),
    act('P-1', 1000, 'InProgress', 'Open', 'STATE_FIELD')
  ];
  const r = parseAnchorsChunk(acts, ['P-1'], { fieldId: 'STATE_FIELD', topLimit: 300, anchorStates: ['InProgress', 'Done'] });
  assert.equal(r.anchors['P-1'].InProgress, 1000);
  assert.equal(r.anchors['P-1'].Done, 5000);
});

test('parseAnchorsChunk: anchor-aware D7 — hitTop ⇒ ВЕСЬ чанк incomplete (старт-якорь режется хвостом истории)', () => {
  const acts = [
    act('P-1', 3000, 'Done', 'InProgress', 'STATE_FIELD'),
    act('P-1', 2000, 'InProgress', 'Open', 'STATE_FIELD')
  ];
  // topLimit=2, length=2 → hitTop. Даже P-1 (у кого якорь НАЙДЕН) неполна: более ранний вход мог быть срезан.
  const r = parseAnchorsChunk(acts, ['P-1', 'P-2'], { fieldId: 'STATE_FIELD', topLimit: 2, anchorStates: ['InProgress', 'Done'] });
  assert.equal(r.diag.hitTop, true);
  assert.deepEqual(r.incomplete.slice().sort(), ['P-1', 'P-2']);   // sound-over-precise: обе неполны
  assert.equal(r.anchors['P-1'].InProgress, 2000);                 // значение всё равно вернули (но задача помечена incomplete)
});

test('parseAnchorsChunk: чанк влез (не hitTop) ⇒ incomplete пуст, первые входы достоверны', () => {
  const acts = [act('P-1', 2000, 'InProgress', 'Open', 'STATE_FIELD')];
  const r = parseAnchorsChunk(acts, ['P-1', 'P-2'], { fieldId: 'STATE_FIELD', topLimit: 300, anchorStates: ['InProgress'] });
  assert.equal(r.diag.hitTop, false);
  assert.deepEqual(r.incomplete, []);
  assert.equal(r.anchors['P-1'].InProgress, 2000);
  assert.equal(r.anchors['P-2'], undefined);                       // без переходов — просто нет якоря (не incomplete)
});

test('parseAnchorsChunk: якорь матчится по name на локализованном инстансе YT (added name≠localizedName)', () => {
  // RU-инстанс: added={name:"Done",localizedName:"Готово"}; _valName вернул бы "Готово",
  // но конфиг якоря хранит канон name "Done" — матч обязан быть по name, иначе тихий population=0.
  const acts = [{
    timestamp: 5000, target: { idReadable: 'P-1' }, field: { id: 'STATE_FIELD', name: 'Состояние' },
    added: [{ name: 'Done', localizedName: 'Готово', $type: 'StateBundleElement' }],
    removed: [{ name: 'In Progress', localizedName: 'В работе' }]
  }];
  const r = parseAnchorsChunk(acts, ['P-1'], { fieldId: 'STATE_FIELD', topLimit: 300, anchorStates: ['In Progress', 'Done'] });
  assert.equal(r.anchors['P-1'].Done, 5000);                       // совпал по канон name, не по localizedName
  assert.deepEqual(r.timelines['P-1'].map((e) => e.to), ['Done']); // таймлайн тоже в канон name (для pm.states)
});

test('parseAnchorsChunk: якорь матчится и по localizedName (конфиг хранит локализованное имя)', () => {
  const acts = [{
    timestamp: 5000, target: { idReadable: 'P-1' }, field: { id: 'STATE_FIELD', name: 'Состояние' },
    added: [{ name: 'Done', localizedName: 'Готово', $type: 'StateBundleElement' }], removed: []
  }];
  const r = parseAnchorsChunk(acts, ['P-1'], { fieldId: 'STATE_FIELD', topLimit: 300, anchorStates: ['Готово'] });
  assert.equal(r.anchors['P-1']['Готово'], 5000);                  // совпал по localizedName
});

// ─────────────────────── bulkStateTransitions (orchestrator) ───────────────────────

function mockDeps(responder) {
  const calls = [];
  return {
    calls,
    host: {
      fetchYouTrack: function (pathArg, opts) {
        calls.push(opts.query.issueQuery);
        return responder(opts.query.issueQuery);
      }
    },
    diag: function () {}
  };
}

test('bulkStateTransitions: чанкинг по 25 — 30 задач → 2 фетча', async () => {
  assert.equal(CHUNK_SIZE, 25);
  assert.equal(TOP_LIMIT, 300);
  const ids = [];
  for (let i = 1; i <= 30; i++) ids.push('P-' + i);
  const deps = mockDeps(function (q) {
    // вернуть по одной state-активности на каждую задачу из issueQuery
    const idsInQ = q.replace('issue id: ', '').split(', ');
    return Promise.resolve(idsInQ.map(function (id, n) { return act(id, 1000 + n, 'Разработка', 'Анализ', 'STATE_FIELD'); }));
  });
  const r = await bulkStateTransitions(deps, ids, { fieldId: 'STATE_FIELD' });
  assert.equal(deps.calls.length, 2);            // 25 + 5
  assert.equal(r.diag.chunks, 2);
  assert.equal(Object.keys(r.transitions).length, 30);
  assert.equal(r.complete, true);
  assert.deepEqual(r.incomplete, []);
});

test('bulkStateTransitions: обрезка не лечится бисекцией (flood и в single-issue) → incomplete, complete=false', async () => {
  const deps = mockDeps(function () {
    // упираемся в лимит на ЛЮБОМ запросе (и после деления): P-2 так и не влезает
    const flood = [];
    for (let i = 0; i < 300; i++) flood.push(act('P-1', 5000 - i, 'Разработка', 'Анализ', 'STATE_FIELD'));
    return Promise.resolve(flood);
  });
  const r = await bulkStateTransitions(deps, ['P-1', 'P-2'], { fieldId: 'STATE_FIELD' });
  assert.equal(deps.calls.length, 3);            // #58-4: чанк → бисекция → 2 single-issue
  assert.equal(r.diag.bisects, 1);
  assert.equal(r.diag.hitTopChunks, 2);          // оба single-issue листа упёрлись
  assert.deepEqual(r.incomplete, ['P-2']);       // P-1 найден, P-2 честно неполон
  assert.equal(r.complete, false);               // метрику по P-2 считать нельзя
});

/* #58-4 — адаптивная бисекция: совокупная история чанка не влезает в $top, но per-issue
   влезает → деление пополам восстанавливает ПОЛНУЮ метрику (раньше: starvation-задачи чанка
   уходили в incomplete, у якорей — гас весь чанк). */
test('bulkStateTransitions: #58-4 бисекция лечит starvation — совокупный flood, per-issue влезает', async () => {
  const deps = mockDeps(function (q) {
    const idsInQ = q.replace('issue id: ', '').split(', ');
    if (idsInQ.length > 1) {                     // совместное окно упёрлось
      const flood = [];
      for (let i = 0; i < 300; i++) flood.push(act(idsInQ[0], 5000 - i, 'Разработка', 'Анализ', 'STATE_FIELD'));
      return Promise.resolve(flood);
    }                                             // single-issue: влезает
    return Promise.resolve([act(idsInQ[0], 7000, 'Тех.тест', 'Разработка', 'STATE_FIELD')]);
  });
  const r = await bulkStateTransitions(deps, ['P-1', 'P-2'], { fieldId: 'STATE_FIELD' });
  assert.equal(deps.calls.length, 3);
  assert.equal(r.diag.bisects, 1);
  assert.equal(Object.keys(r.transitions).length, 2);   // ОБЕ задачи с метрикой
  assert.deepEqual(r.incomplete, []);
  assert.equal(r.complete, true);
});

test('bulkStateTransitions: #58-4 потолок MAX_ACT_FETCHES — бисекция останавливается, неполнота честная, без зависания', async () => {
  const ids = [];
  for (let i = 1; i <= 50; i++) ids.push('P-' + i);     // 2 базовых чанка, всё флудит
  const deps = mockDeps(function () {
    const flood = [];
    for (let i = 0; i < 300; i++) flood.push(act('P-1', 5000 - i, 'Разработка', 'Анализ', 'STATE_FIELD'));
    return Promise.resolve(flood);
  });
  const r = await bulkStateTransitions(deps, ids, { fieldId: 'STATE_FIELD' });
  assert.ok(deps.calls.length <= MAX_ACT_FETCHES + 2, 'фетчи ограничены потолком (+хвост деления): ' + deps.calls.length);
  assert.equal(r.complete, false);
  assert.ok(r.incomplete.length > 0, 'обрезанные за потолком — честно incomplete');
});

// ─────────────────────── bulkAnchorTransitions (orchestrator, #58-4) ───────────────────────

test('bulkAnchorTransitions: #58-4 бисекция спасает якоря — раньше hitTop гасил весь чанк', async () => {
  const deps = mockDeps(function (q) {
    const idsInQ = q.replace('issue id: ', '').split(', ');
    if (idsInQ.length > 1) {
      const flood = [];
      for (let i = 0; i < 300; i++) flood.push(act(idsInQ[0], 5000 + i, 'Разработка', 'Анализ', 'STATE_FIELD'));
      return Promise.resolve(flood);
    }
    return Promise.resolve([act(idsInQ[0], 4000, 'Разработка', 'Анализ', 'STATE_FIELD')]);
  });
  const r = await bulkAnchorTransitions(deps, ['P-1', 'P-2'], { fieldId: 'STATE_FIELD', anchorStates: ['Разработка'] });
  assert.equal(deps.calls.length, 3);
  assert.equal(r.diag.bisects, 1);
  assert.equal(r.anchors['P-1']['Разработка'], 4000);   // якорь достоверен по полной истории
  assert.equal(r.anchors['P-2']['Разработка'], 4000);
  assert.deepEqual(r.incomplete, []);
  assert.equal(r.complete, true);
});

test('bulkAnchorTransitions: #58-4 single-issue упёрся в $top → задача честно incomplete (anchor-aware D7)', async () => {
  const deps = mockDeps(function () {
    const flood = [];
    for (let i = 0; i < 300; i++) flood.push(act('P-1', 5000 + i, 'Разработка', 'Анализ', 'STATE_FIELD'));
    return Promise.resolve(flood);
  });
  const r = await bulkAnchorTransitions(deps, ['P-1'], { fieldId: 'STATE_FIELD', anchorStates: ['Разработка'] });
  assert.equal(deps.calls.length, 1);                   // одиночную не делим
  assert.deepEqual(r.incomplete, ['P-1']);
  assert.equal(r.complete, false);
});

test('bulkStateTransitions: сетевой сбой чанка → все его задачи incomplete (fail-loud)', async () => {
  const deps = mockDeps(function () { return Promise.reject(new Error('network')); });
  const r = await bulkStateTransitions(deps, ['P-1', 'P-2'], { fieldId: 'STATE_FIELD' });
  assert.deepEqual(r.incomplete.sort(), ['P-1', 'P-2']);
  assert.equal(r.complete, false);
  assert.equal(Object.keys(r.transitions).length, 0);
});

test('bulkStateTransitions: пустой список → resolves пусто, complete=true, без фетчей', async () => {
  const deps = mockDeps(function () { return Promise.resolve([]); });
  const r = await bulkStateTransitions(deps, [], { fieldId: 'STATE_FIELD' });
  assert.equal(deps.calls.length, 0);
  assert.equal(r.complete, true);
  assert.equal(r.diag.chunks, 0);
});

// ─────────────────────────── A7 compute (pure) ───────────────────────────

test('workdaysBetween: инвариант — любые 7 дней = 5 будней, 14 = 10; тот же день = 0', () => {
  const t = Date.UTC(2026, 5, 3, 12, 0, 0); // произвольный момент
  assert.equal(workdaysBetween(t, t), 0);
  assert.equal(workdaysBetween(t, t + 7 * DAY), 5);
  assert.equal(workdaysBetween(t, t + 14 * DAY), 10);
  assert.equal(workdaysBetween(t + DAY, t), 0);      // end<=start → 0
  assert.equal(workdaysBetween(null, t), 0);          // некорректный вход → 0
});

test('workdaysBetween: выходные пропускаются (Пт→Пн = 1 будний)', () => {
  // 2026-06-05 — пятница (проверяем через getUTCDay), 2026-06-08 — понедельник.
  const fri = Date.UTC(2026, 5, 5, 0, 0, 0);
  assert.equal(new Date(fri).getUTCDay(), 5, 'фикстура: 2026-06-05 = пятница');
  const mon = fri + 3 * DAY; // Сб, Вс, Пн
  assert.equal(workdaysBetween(fri, mon), 1); // только Пн
});

test('agingLevel: пороги yellow/red (строгое >), нет порога → none', () => {
  const band = { yellow: 5, red: 10 };
  assert.equal(agingLevel(3, band), 'ok');
  assert.equal(agingLevel(5, band), 'ok');   // не > 5
  assert.equal(agingLevel(6, band), 'warn');
  assert.equal(agingLevel(10, band), 'warn'); // не > 10
  assert.equal(agingLevel(11, band), 'over');
  assert.equal(agingLevel(100, null), 'none');
  assert.equal(agingLevel(100, {}), 'none');
  assert.equal(agingLevel(8, { red: 10 }), 'ok');   // только red
  assert.equal(agingLevel(12, { red: 10 }), 'over');
});

test('buildAgingRows: переход/created/incomplete + сортировка ↓ по days + флаг', () => {
  const now = Date.UTC(2026, 5, 8, 0, 0, 0); // понедельник
  const issues = [
    { id: 'P-1', summary: 'A', state: 'Разработка', created: now - 30 * DAY },
    { id: 'P-2', summary: 'B', state: 'Тех.тест', created: now - 40 * DAY },
    { id: 'P-3', summary: 'C', state: 'Разработка', created: now - 3 * DAY },  // статус с создания
    { id: 'P-4', summary: 'D', state: 'Анализ', created: now - 99 * DAY }      // incomplete
  ];
  const primitiveOut = {
    transitions: { 'P-1': { enteredAt: now - 21 * DAY }, 'P-2': { enteredAt: now - 7 * DAY } },
    noTransition: ['P-3'],
    incomplete: ['P-4']
  };
  const thresholds = { 'Разработка': { yellow: 12, red: 20 }, 'Тех.тест': { yellow: 5, red: 10 } };
  const r = buildAgingRows(issues, primitiveOut, primitiveOut.incomplete, thresholds, now);
  assert.deepEqual(r.incomplete, ['P-4']);           // исключён из строк
  assert.equal(r.rows.length, 3);
  assert.equal(r.rows[0].id, 'P-1');                 // 21д (15 будней) — сверху
  assert.equal(r.rows[0].days, 15);                  // 21 календарный = 15 будних
  assert.equal(r.rows[0].level, 'warn');             // 15 > 12, не > 20
  const p2 = r.rows.find((x) => x.id === 'P-2');
  assert.equal(p2.days, 5);                          // 7 календарных = 5 будних
  assert.equal(p2.level, 'ok');                      // 5 не > 5
  const p3 = r.rows.find((x) => x.id === 'P-3');     // created-fallback
  assert.equal(p3.days, workdaysBetween(now - 3 * DAY, now));
  // отсортировано по days ↓
  assert.ok(r.rows[0].days >= r.rows[1].days && r.rows[1].days >= r.rows[2].days);
});

test('buildAgingRows: нет даты входа (не переход, не created) → incomplete (D7)', () => {
  const now = Date.UTC(2026, 5, 8);
  const issues = [{ id: 'P-9', summary: 'X', state: 'Разработка' }]; // created отсутствует
  const r = buildAgingRows(issues, { transitions: {}, noTransition: ['P-9'], incomplete: [] }, [], {}, now);
  assert.deepEqual(r.incomplete, ['P-9']);
  assert.equal(r.rows.length, 0);
});

// ─────────────────────── #50 S5a — bulkWorkItems (net-new) ───────────────────────

/* Мок host для workItems: responder получает (query, skip). calls хранит запросы. */
function mockWiDeps(responder) {
  const calls = [];
  return {
    calls,
    host: {
      fetchYouTrack: function (pathArg, opts) {
        calls.push({ path: pathArg, query: opts.query.query, top: opts.query.$top, skip: opts.query.$skip });
        return Promise.resolve(responder(opts.query.query, opts.query.$skip));
      }
    },
    diag: function () {}
  };
}
function wi(issueId, author, dateTs, minutes) {
  return { issue: { idReadable: issueId }, author: { login: author }, date: dateTs, duration: { minutes: minutes } };
}

test('_fmtWorkDate: epoch-ms → UTC YYYY-MM-DD с нулями', () => {
  assert.equal(_fmtWorkDate(Date.UTC(2026, 0, 5)), '2026-01-05');   // янв=0 → 01, день 5 → 05
  assert.equal(_fmtWorkDate(Date.UTC(2026, 11, 31)), '2026-12-31');
});

test('_parseWorkItems: валидные → {issueId,author,dateTs,minutes}; невалидные отброшены', () => {
  const raw = [
    wi('D-1', 'ivan', 1000, 60),
    { issue: { idReadable: 'D-2' }, author: { login: 'ivan' }, date: 2000 },   // нет duration
    { issue: { idReadable: 'D-3' }, date: 3000, duration: { minutes: 30 } },     // нет author
    { author: { login: 'ivan' }, date: 4000, duration: { minutes: 30 } },        // нет issue
    { issue: { idReadable: 'D-5' }, author: { name: 'Пётр' }, date: 5000, duration: { minutes: 15 } } // author=name fallback
  ];
  const out = _parseWorkItems(raw);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { issueId: 'D-1', author: 'ivan', dateTs: 1000, minutes: 60 });
  assert.deepEqual(out[1], { issueId: 'D-5', author: 'Пётр', dateTs: 5000, minutes: 15 });
});

test('bulkWorkItems: собирает часы + чанкинг по 25 (30 задач → 2 чанка)', async () => {
  const ids = [];
  for (let i = 1; i <= 30; i++) ids.push('D-' + i);
  const deps = mockWiDeps(function (q) {
    const idsInQ = q.replace('issue id: ', '').split(', ');
    return idsInQ.map(function (id) { return wi(id, 'ivan', 1000, 60); });
  });
  const r = await bulkWorkItems(deps, ids, {});
  assert.equal(r.diag.chunks, 2);        // 25 + 5
  assert.equal(r.items.length, 30);
  assert.equal(r.complete, true);
  assert.deepEqual(r.incomplete, []);
});

test('bulkWorkItems: окно → серверный фильтр `work date:` (toTs-1 = последний день)', async () => {
  const deps = mockWiDeps(function () { return [wi('D-1', 'ivan', Date.UTC(2026, 4, 15), 60)]; });
  const win = { fromTs: Date.UTC(2026, 4, 1), toTs: Date.UTC(2026, 5, 1) };   // [1 мая, 1 июн) → 01..31 мая
  await bulkWorkItems(deps, ['D-1'], { window: win });
  assert.match(deps.calls[0].query, /work date: 2026-05-01 \.\. 2026-05-31/);
});

test('bulkWorkItems: пагинация до полноты ($top → докрутка, < $top → стоп)', async () => {
  // страница skip=0 = ровно TOP_LIMIT items (полна → докрутка), skip=TOP_LIMIT = 2 (конец).
  const full = [];
  for (let i = 0; i < TOP_LIMIT; i++) full.push(wi('D-1', 'ivan', 1000 + i, 10));
  const deps = mockWiDeps(function (q, skip) {
    return skip === 0 ? full : [wi('D-1', 'ivan', 9000, 10), wi('D-1', 'ivan', 9001, 10)];
  });
  const r = await bulkWorkItems(deps, ['D-1'], {});
  assert.equal(r.diag.pages, 2);                       // 2 страницы
  assert.equal(r.items.length, TOP_LIMIT + 2);
  assert.equal(deps.calls[1].skip, TOP_LIMIT);         // вторая страница со $skip=TOP_LIMIT
  assert.equal(r.complete, true);
});

test('bulkWorkItems: сетевой сбой чанка → incomplete (fail-loud D7)', async () => {
  const deps = { host: { fetchYouTrack: function () { return Promise.reject(new Error('network')); } }, diag: function () {} };
  const r = await bulkWorkItems(deps, ['D-1', 'D-2'], {});
  assert.equal(r.complete, false);
  assert.deepEqual(r.incomplete.sort(), ['D-1', 'D-2']);
  assert.equal(r.items.length, 0);
});

test('bulkWorkItems: пустой вход → пусто без фетча', async () => {
  const deps = mockWiDeps(function () { return []; });
  const r = await bulkWorkItems(deps, [], {});
  assert.equal(r.items.length, 0);
  assert.equal(deps.calls.length, 0);
});
