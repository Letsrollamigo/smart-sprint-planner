/**
 * Golden-master: IO-слой YouTrack — характеризация ДО выноса youtrack-api.js (Тир C).
 *
 * _backendCall (роутинг project/global #25 Ф1, нормализация query) / apiGet /
 * apiPost (контракт success=false, save-сайд-эффекты sprint-data: markSavedAndCleanup
 * + auto-snapshot матрица, history: перепривязка _currentSprintRoleRec) /
 * _fetchGanttStateHistory (#20: детект поля состояния по field.id + fallback'и,
 * кэш _ganttStateHist c TTL, чанкинг, деградации).
 *
 * Сеть — подмена _host (recorder); _fetchGanttStateHistory не возвращает promise —
 * внутренняя цепочка флашится setTimeout(0). syncAssigneesFromYouTrack из старой
 * карты декомпозиции удалён ещё в #35 — его Activities-логика живёт здесь,
 * в _fetchGanttStateHistory.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { createHost, FIXED_NOW } = require('./monolith-host');
const { checkJsonSnapshot } = require('./snap');
const fx = require('./fixtures/state');

function bootApi() {
  const host = createHost();
  fx.applyBaseState(host.gm);
  return host;
}

/** _host-recorder: фиксирует path/opts, отвечает заданной фабрикой (или {}). */
function recHost(respond) {
  const log = [];
  return {
    log: log,
    fetchApp: function (p, o) {
      log.push({ kind: 'app', path: p, opts: JSON.parse(JSON.stringify(o || {})) });
      return respond ? respond(p, o) : Promise.resolve({});
    },
    fetchYouTrack: function (p, o) {
      log.push({ kind: 'yt', path: p, query: o && o.query });
      return respond ? respond(p, o) : Promise.resolve({});
    },
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

test('golden: _backendCall — роутинг project/global + нормализация query', async () => {
  const { gm } = bootApi();
  const host = recHost();
  gm.set({ _host: host });

  /* project (дефолт): scope:true + префикс backend-project */
  await gm.call('_backendCall', 'sprint-data', {});
  await gm.call('_backendCall', 'field-values?fieldName=My%20Field', { method: 'POST', body: { a: 1 } });

  /* global: backend-global + projectKey, встроенный '?a=b' раскладывается в query */
  gm.set({ _mode: 'global', _activeProjectKey: 'GM' });
  await gm.call('_backendCall', 'sprint-data', {});
  await gm.call('_backendCall', 'field-values?fieldName=My%20Field&x=%D0%AE', {});
  await gm.call('_backendCall', 'history?a=1', { query: { b: 2 }, method: 'POST' });

  checkJsonSnapshot('yt-api-backend-call', { calls: host.log });
});

test('golden: apiGet — passthrough результата + diag ok/err', async () => {
  const { gm } = bootApi();
  const okHost = recHost(function () { return Promise.resolve({ success: true, marker: 'payload' }); });
  gm.set({ _host: okHost });
  const diagBefore = gm.get('_diagLines').length;
  const ok = await gm.call('apiGet', 'sprint-data');

  gm.set({ _host: recHost(function () { return Promise.reject(new Error('network down')); }) });
  let err = null;
  try { await gm.call('apiGet', 'history'); } catch (e) { err = e.message; }

  checkJsonSnapshot('yt-api-get', {
    result: ok,
    error: err,
    diag: gm.get('_diagLines').slice(diagBefore),
  });
});

test('golden: apiGet слоты — stale rev (< виденного) не применяется, одиночный refetch (v3.12.0)', async () => {
  const { gm } = bootApi();
  let calls = 0;
  const host = recHost(function () {
    calls++;
    if (calls === 1) return Promise.resolve({ success: true, history: [], rev: 5 });          /* прайм: клиент видел rev 5 */
    if (calls === 2) return Promise.resolve({ success: true, history: ['stale'], rev: 3 });   /* устаревший снапшот */
    return Promise.resolve({ success: true, history: ['fresh'], rev: 6 });                    /* refetch — свежий */
  });
  gm.set({ _host: host });
  const first = await gm.call('apiGet', 'history');
  const second = await gm.call('apiGet', 'history');
  checkJsonSnapshot('yt-api-get-stale-slot', {
    firstRev: first.rev,
    totalCalls: calls,               /* 3 = прайм + stale + один refetch */
    secondRev: second.rev,           /* 6 — отдан свежий ответ, не rev 3 */
    secondHistory: second.history,   /* ['fresh'] — stale-данные не дошли до caller'а */
  });
});

test('golden: apiPost — контракт success=false → reject + форма запроса', async () => {
  const { gm } = bootApi();
  /* стопорим сайд-эффекты save: интерес — только контракт reject */
  gm.set({ markSavedAndCleanup: function () {}, saveRoleHistorySnapshot: function () { return Promise.resolve(); } });

  const host = recHost(function () { return Promise.resolve({ success: false, reason: 'validation_failed' }); });
  gm.set({ _host: host });
  let rejected = null;
  try { await gm.call('apiPost', 'sprint-data', { sprint: { x: 1 } }, { action: 'validate' }); }
  catch (e) { rejected = e.message; }

  /* fallback reason: error-поле, затем unknown_error */
  gm.set({ _host: recHost(function () { return Promise.resolve({ success: false, error: 'custom_err' }); }) });
  let rejectedErrField = null;
  try { await gm.call('apiPost', 'history', null, { action: 'clear' }); } catch (e) { rejectedErrField = e.message; }

  gm.set({ _host: recHost(function () { return Promise.resolve({ success: false }); }) });
  let rejectedUnknown = null;
  try { await gm.call('apiPost', 'draft', {}); } catch (e) { rejectedUnknown = e.message; }

  checkJsonSnapshot('yt-api-post-contract', {
    request: host.log[0],
    rejected: rejected,
    rejectedErrField: rejectedErrField,
    rejectedUnknown: rejectedUnknown,
  });
});

test('golden: apiPost sprint-data — markSavedAndCleanup + auto-snapshot матрица', async () => {
  const { gm } = bootApi();
  const out = {};

  async function run(label, mutate, body, query) {
    const calls = { cleanup: [], snapshots: [] };
    gm.set({
      markSavedAndCleanup: function (section) { calls.cleanup.push(section); },
      saveRoleHistorySnapshot: function (rk) { calls.snapshots.push(rk); return Promise.resolve(); },
      _host: recHost(function () { return Promise.resolve({ success: true }); }),
      /* базовая точка: активный спринт, подвкладка, без рабочей копии */
      _sprint: fx.buildSprint(),
      _activeSubtab: 'analysis',
      _activeWorkingDraftKey: null,
    });
    if (mutate) mutate();
    await gm.call('apiPost', 'sprint-data', body, query);
    await flush();
    out[label] = calls;
  }

  await run('happyBoth', null, { sprint: { x: 1 }, roleItems: {} });
  await run('sprintOnly', null, { sprint: { x: 1 } });
  await run('validateSkipsSnapshot', null, { sprint: { x: 1 } }, { action: 'validate' });
  await run('finishedSkips', function () {
    gm.set({ _sprint: Object.assign(fx.buildSprint(), { status: 'FINISHED' }) });
  }, { roleItems: {} });
  await run('workingCopySkips', function () {
    gm.set({ _activeWorkingDraftKey: 'wc-key-1' });
  }, { roleItems: {} });
  await run('noSubtabSkips', function () {
    gm.set({ _activeSubtab: null });
  }, { sprint: { x: 1 } });
  await run('settingsOnly', null, { settings: { defaultLang: 'ru' } });

  checkJsonSnapshot('yt-api-post-sprint-data-effects', out);
});

test('golden: apiPost history — cleanup currentRole + перепривязка _currentSprintRoleRec', async () => {
  const { gm } = bootApi();
  const cleanup = [];
  gm.set({
    markSavedAndCleanup: function (section) { cleanup.push(section); },
    _host: recHost(function () { return Promise.resolve({ success: true }); }),
  });
  /* stale-копия записи: тот же sprintId, другая ссылка → после POST перепривязка на _history[0] */
  const hist = gm.get('_history');
  const stale = JSON.parse(JSON.stringify(hist[0]));
  stale.items = []; /* отличается содержимым — видно, что взялась свежая ссылка */
  gm.set({ _currentSprintRoleRec: stale });

  await gm.call('apiPost', 'history', { history: hist });

  const rec = gm.get('_currentSprintRoleRec');
  checkJsonSnapshot('yt-api-post-history-rebind', {
    cleanup: cleanup,
    reboundToFresh: rec === gm.get('_history')[0],
    recItemsLen: rec.items.length,
  });

  /* без sprintId перепривязка не выполняется */
  gm.set({ _currentSprintRoleRec: null });
  await gm.call('apiPost', 'history', { history: hist });
  assert.equal(gm.get('_currentSprintRoleRec'), null, 'null rec must stay null');
});

/* ── _fetchGanttStateHistory ─────────────────────────────────────────────── */

const DAY = 86400000;
const T_RECENT = FIXED_NOW - 3 * DAY;

/** Маркер-элементы Ганта для ids (since-span + prev-div, как _ganttHistCellHtml). */
function seedGanttDom(document, ids) {
  const container = document.getElementById('ganttContainer');
  container.innerHTML = ids.map(function (id) {
    return '<span data-gantt-hist-since="' + id + '"></span>' +
      '<div data-gantt-hist-prev="' + id + '">loading…</div>';
  }).join('');
  return container;
}

function ganttHistSnap(gm) {
  return JSON.parse(JSON.stringify(gm.get('_ganttStateHist')));
}

test('golden: _fetchGanttStateHistory — детект по field.id, fallback\'и, формы записей, DOM', async () => {
  const host = bootApi();
  const { gm, document } = host;

  /* Сценарий A: детект по fieldId (приоритет). GM-1 — две активности (reverse:
     свежая выигрывает, старая пропускается); GM-2 — чужое поле; GM-3 — без removed;
     GM-4 — активностей нет → null-запись. */
  const actsA = [
    { target: { idReadable: 'GM-1' }, timestamp: T_RECENT, field: { id: 'fld-state', name: 'Состояние' },
      added: [{ name: 'In Progress', localizedName: 'В работе' }],
      removed: [{ name: 'Open', localizedName: 'Открыта', color: { background: '#e0f', foreground: '#111' } }] },
    { target: { idReadable: 'GM-1' }, timestamp: T_RECENT - DAY, field: { id: 'fld-state' },
      added: [{ name: 'Open' }], removed: [{ name: 'New' }] },
    { target: { idReadable: 'GM-2' }, timestamp: T_RECENT, field: { id: 'fld-priority' },
      added: [{ name: 'Major' }], removed: [{ name: 'Normal' }] },
    { target: { idReadable: 'GM-3' }, timestamp: T_RECENT, field: { id: 'fld-state' },
      added: [{ name: 'Fixed' }], removed: [] },
  ];
  const ids = ['GM-1', 'GM-2', 'GM-3', 'GM-4'];
  const container = seedGanttDom(document, ids);
  const hostA = recHost(function () { return Promise.resolve(actsA); });
  gm.set({ _host: hostA });
  gm.call('_fetchGanttStateHistory', ids, 'sk-detect', false, {}, 'fld-state');
  await flush();
  const byFieldId = { hist: ganttHistSnap(gm), dom: container.innerHTML, request: hostA.log[0] };

  /* Сценарий B: fallback по curStates (added === текущее состояние); added — не массив. */
  gm.set({ _host: recHost(function () {
    return Promise.resolve([
      { target: { idReadable: 'GM-7' }, timestamp: T_RECENT,
        added: { name: 'In Progress', localizedName: 'В работе' }, removed: { name: 'Open' } },
      { target: { idReadable: 'GM-8' }, timestamp: T_RECENT,
        added: [{ name: 'Wrong State' }], removed: [{ name: 'Open' }] },
    ]);
  }) });
  seedGanttDom(document, ['GM-7', 'GM-8']);
  gm.call('_fetchGanttStateHistory', ['GM-7', 'GM-8'], 'sk-curstates', false,
    { 'GM-7': 'В работе', 'GM-8': 'В работе' }, '');
  await flush();
  const byCurState = ganttHistSnap(gm);

  /* Сценарий C: fallback по $type StateBundleElement (нет ни fieldId, ни curStates). */
  gm.set({ _host: recHost(function () {
    return Promise.resolve([
      { target: { idReadable: 'GM-9' }, timestamp: T_RECENT,
        added: [{ $type: 'StateBundleElement', name: 'Done' }], removed: [{ name: 'Open' }] },
      { target: { idReadable: 'GM-10' }, timestamp: T_RECENT,
        added: [{ $type: 'EnumBundleElement', name: 'Major' }], removed: [] },
    ]);
  }) });
  seedGanttDom(document, ['GM-9', 'GM-10']);
  gm.call('_fetchGanttStateHistory', ['GM-9', 'GM-10'], 'sk-bundletype', false, null, null);
  await flush();
  const byBundleType = ganttHistSnap(gm);

  checkJsonSnapshot('gantt-state-hist-detect', {
    byFieldId: byFieldId,
    byCurState: byCurState,
    byBundleType: byBundleType,
  });
});

test('golden: _fetchGanttStateHistory — кэш TTL/force/sprintKey, чанкинг, гарды', async () => {
  const { gm, document } = bootApi();
  const stages = {};

  /* 26 ids → 2 чанка по 25/1 */
  const manyIds = [];
  for (let n = 1; n <= 26; n++) manyIds.push('GM-' + n);
  seedGanttDom(document, manyIds);
  const host = recHost(function () { return Promise.resolve([]); });
  gm.set({ _host: host });

  gm.call('_fetchGanttStateHistory', manyIds, 'sk-chunk', false, {}, 'fld-state');
  await flush();
  stages.chunked = {
    fetches: host.log.map(function (c) { return { path: c.path, issueQuery: c.query.issueQuery, top: c.query.$top, reverse: c.query.reverse, categories: c.query.categories, fields: c.query.fields }; }),
    fetchedAt: gm.get('_ganttStateHist')._fetchedAt,
    nullRecord: ganttHistSnap(gm)['GM-26'],
  };

  /* повтор того же sprintKey в пределах TTL → без сети */
  gm.call('_fetchGanttStateHistory', manyIds, 'sk-chunk', false, {}, 'fld-state');
  await flush();
  stages.ttlSkip = host.log.length;

  /* force → перезапрос */
  gm.call('_fetchGanttStateHistory', manyIds, 'sk-chunk', true, {}, 'fld-state');
  await flush();
  stages.forceRefetch = host.log.length;

  /* смена sprintKey → перезапрос + сброс кэша */
  gm.call('_fetchGanttStateHistory', ['GM-1'], 'sk-other', false, {}, 'fld-state');
  await flush();
  stages.keyChange = { fetches: host.log.length, sprintKey: gm.get('_ganttStateHist')._sprintKey };

  /* гарды: пустые ids / нет fieldState в настройках → no-op */
  gm.call('_fetchGanttStateHistory', [], 'sk-guard', true, {}, '');
  const settings = gm.get('_settings');
  gm.set({ _settings: Object.assign({}, settings, { fieldState: '' }) });
  gm.call('_fetchGanttStateHistory', ['GM-1'], 'sk-guard2', true, {}, '');
  await flush();
  stages.guards = host.log.length;

  checkJsonSnapshot('gantt-state-hist-cache-chunk', stages);
});

test('golden: _fetchGanttStateHistory — деградации: не-массив и сетевая ошибка', async () => {
  const { gm, document } = bootApi();

  /* не-массив → null-записи + «нет переходов» в DOM */
  const c1 = seedGanttDom(document, ['GM-1', 'GM-2']);
  gm.set({ _host: recHost(function () { return Promise.resolve({ error: 'unexpected' }); }) });
  gm.call('_fetchGanttStateHistory', ['GM-1', 'GM-2'], 'sk-nonarray', false, {}, 'fld-state');
  await flush();
  const nonArray = { hist: ganttHistSnap(gm), dom: c1.innerHTML };

  /* reject → catch-ветка: prev-элементы очищаются, записи не создаются */
  const diagBefore = gm.get('_diagLines').length;
  const c2 = seedGanttDom(document, ['GM-3']);
  gm.set({ _host: recHost(function () { return Promise.reject(new Error('activities down')); }) });
  gm.call('_fetchGanttStateHistory', ['GM-3'], 'sk-err', false, {}, 'fld-state');
  await flush();
  const rejected = {
    hist: ganttHistSnap(gm),
    dom: c2.innerHTML,
    diagTail: gm.get('_diagLines').slice(diagBefore).filter(function (l) { return l.type === 'warn'; }),
  };

  checkJsonSnapshot('gantt-state-hist-degraded', { nonArray: nonArray, rejected: rejected });
});
