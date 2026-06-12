/**
 * Golden-master: persistence-инфра черновиков и working copies (E2) —
 * контракты сняты ДО выноса (Фаза 5 слайс 3) через выживающие entry-points:
 * делегаторы монолита (_draftSet/_draftGet/_draftFlushNow/_draftLoadFromBackend/
 * _draftClearOnBackend/_draftSaveDebounced/_draftIsDirty/_markDirty/_markClean/
 * clearDraftStorage/_workingDraftsLoadFromBackend/_workingDraftsScheduleFlush/
 * _workingDraftsFlushNow/_workingDraftsDeleteOnBackend/reconcileHasWorkingCopyFlag/
 * gcWorkingDrafts) и стейт монолита (gm.get/gm.set — _draft/_draftPending/
 * _workingDrafts/_activeWorkingDraftKey/_thisTabToken остаются в стейт-ядре
 * и после выноса).
 *
 * Backend НЕ ходим: apiGet/apiPost подменяются recording-стабами через gm.set
 * (после выноса deps-фабрика читает closure в момент вызова — стаб
 * подхватывается, паттерн E4 слайса 2). Таймеры flush 300мс / debounce 800мс —
 * управляемый планировщик: window.setTimeout/clearTimeout → очередь с ручным
 * прогоном (паттерн _applyShareFocus слайса 2). Время заморожено (FIXED_NOW
 * хоста) → savedAt/updatedAt детерминированы.
 *
 * Фактическая debounce-семантика (характеризация): каждый повторный
 * schedule до flush'а ПЕРЕАРМИРУЕТ таймер (clearTimeout + новый setTimeout) —
 * draft-путь; working-drafts-путь переармирует только при живом таймере.
 */
'use strict';

const test = require('node:test');
const { createHost } = require('./monolith-host');
const { checkJsonSnapshot } = require('./snap');
const fx = require('./fixtures/state');

const flush = () => new Promise((r) => setTimeout(r, 0));

/** Управляемый планировщик: очередь таймеров + лог clearTimeout. */
function stubScheduler(window) {
  const timers = [];
  const cleared = [];
  let seq = 0;
  window.setTimeout = function (fn, delay) {
    seq += 1;
    timers.push({ id: seq, fn: fn, delay: delay });
    return seq;
  };
  window.clearTimeout = function (id) {
    if (id == null) return;
    cleared.push(id);
    for (let i = 0; i < timers.length; i++) {
      if (timers[i].id === id) { timers.splice(i, 1); return; }
    }
  };
  return {
    timers: timers,
    cleared: cleared,
    delays: function () { return timers.map(function (t) { return t.delay; }); },
    runNext: function () { const t = timers.shift(); if (t) t.fn(); },
  };
}

/** Recording-стаб apiGet/apiPost: лог {fn, path, body, query} + ответы по карте.
 *  Значение REJECT → Promise.reject (catch-ветки). reason — для quota-веток. */
const REJECT = { reject: true };
function stubApi(gm, responses) {
  const log = [];
  function mk(fnName) {
    return function (path, body, query) {
      const entry = { fn: fnName, path: path };
      if (body !== undefined) entry.body = JSON.parse(JSON.stringify(body === undefined ? null : body));
      if (query !== undefined) entry.query = query;
      log.push(entry);
      const r = responses[fnName + ':' + path];
      if (r && r.reject) {
        const e = new Error('gm-api-reject');
        if (r.reason) e.reason = r.reason;
        return Promise.reject(e);
      }
      return Promise.resolve(r !== undefined ? r : {});
    };
  }
  gm.set({ apiGet: mk('get'), apiPost: mk('post') });
  return log;
}

function recordDiag(gm) {
  const entries = [];
  gm.set({ diag: function (msg, level) { entries.push({ msg: msg, level: level || null }); } });
  return entries;
}

function recordToasts(gm) {
  const toasts = [];
  gm.set({ toast: function (msg, type) { toasts.push({ msg: msg, type: type || null }); } });
  return toasts;
}

/* ═══════════════════ серверный черновик (_draft*) ═══════════════════ */

test('golden: draft — set/get/del + debounce 300мс: переарм, один POST на серию', () => {
  const { gm, window } = createHost();
  const sched = stubScheduler(window);
  const api = stubApi(gm, {});
  const diagLog = recordDiag(gm);

  gm.call('_draftSet', 'sprint', { name: 'GM Draft Sprint' });
  gm.call('_draftSet', 'ui', { activeTab: 'planning' });
  gm.call('_draftSet', 'meta', { savedAt: 1, version: 1, baseRevHash: 'h' });
  const armedAfterSeries = { delays: sched.delays(), cleared: sched.cleared.slice() };

  sched.runNext(); /* flush 300мс */
  const getKnown = gm.call('_draftGet', 'sprint');
  const getMissing = gm.call('_draftGet', 'nope');
  /* _draftDel наружу не торчит (приватен будущему модулю) — удаление suffix'ов
     характеризуется через clearDraftStorage (draft-clear-contract). */

  checkJsonSnapshot('draft-set-get-flush-contract', {
    armedAfterSeries: armedAfterSeries,
    api: api,
    pendingAfterFlush: gm.get('_draftPending'),
    getKnown: getKnown,
    getMissing: getMissing,
    diag: diagLog,
  });
});

test('golden: draft — гарды flush: no-pending, перелимит 200KB (pending не сбрасывается), reject', async () => {
  const { gm, window } = createHost();
  const sched = stubScheduler(window);
  const api = stubApi(gm, {});
  const toasts = recordToasts(gm);
  const diagLog = recordDiag(gm);

  /* без pending → no-op */
  gm.call('_draftFlushNow');
  const postsNoPending = api.length;

  /* перелимит: гигантский черновик → toast warn, POST нет, pending остаётся true */
  gm.call('_draftSet', 'sprint', { blob: 'x'.repeat(210 * 1024) });
  gm.call('_draftFlushNow');
  const oversized = {
    posts: api.length,
    toasts: toasts.slice(),
    pendingStays: gm.get('_draftPending'),
  };

  /* reject POST → diag err, pending уже сброшен (повторный flush не ретраит сам) */
  gm.call('_draftSet', 'sprint', { name: 'small' });
  stubApi(gm, { 'post:draft': REJECT });
  gm.call('_draftFlushNow');
  await flush();
  checkJsonSnapshot('draft-flush-guards-contract', {
    postsNoPending: postsNoPending,
    oversized: oversized,
    afterReject: {
      pending: gm.get('_draftPending'),
      diagTail: diagLog.slice(-2),
    },
  });
});

test('golden: draft — load с backend: маппинг слота, пустой ответ, reject', async () => {
  const { gm } = createHost();
  const diagLog = recordDiag(gm);
  const api = stubApi(gm, {
    'get:draft': { data: { meta: { savedAt: 5 }, ui: { activeTab: 'gantt' }, sprint: { name: 'S' },
                          roleItems: { analysis: [] }, currentRole: { pp: 1 }, dirty: { sprint: true },
                          extraneous: 'dropped' } },
  });
  await gm.call('_draftLoadFromBackend');
  const loaded = JSON.parse(JSON.stringify(gm.get('_draft')));

  stubApi(gm, { 'get:draft': {} });
  await gm.call('_draftLoadFromBackend');
  const empty = JSON.parse(JSON.stringify(gm.get('_draft')));

  stubApi(gm, { 'get:draft': REJECT });
  await gm.call('_draftLoadFromBackend');
  checkJsonSnapshot('draft-load-contract', {
    api: api,
    loaded: loaded,
    emptyResponse: empty,
    afterReject: JSON.parse(JSON.stringify(gm.get('_draft'))),
    diag: diagLog,
  });
});

test('golden: draft — clearOnBackend (action=clear) и clearDraftStorage (сброс id + ре-рендер шапки)', async () => {
  const { gm, window } = createHost();
  fx.applyBaseState(gm);
  const sched = stubScheduler(window);
  const api = stubApi(gm, {});
  const headerCalls = [];
  gm.set({ renderWidgetHeader: function () { headerCalls.push(1); } });

  await gm.call('_draftClearOnBackend');
  const afterBackendClear = JSON.parse(JSON.stringify(gm.get('_draft')));

  gm.call('_draftSet', 'meta', { savedAt: 7 });
  gm.call('_draftSet', 'ui', { activeTab: 'planning' });
  gm.call('clearDraftStorage');
  checkJsonSnapshot('draft-clear-contract', {
    api: api,
    afterBackendClear: afterBackendClear,
    afterStorageClear: {
      draft: JSON.parse(JSON.stringify(gm.get('_draft'))),
      currentSprintId: gm.get('_currentSprintId'),
      headerRerenders: headerCalls.length,
      flushArmed: sched.delays(),
    },
  });
});

test('golden: draft — saveDebounced: per-suffix таймеры, переарм, meta при выстреле, гард restore', () => {
  const { gm, window } = createHost();
  const sched = stubScheduler(window);
  stubApi(gm, {});
  recordDiag(gm);
  gm.set({ _baseRevHash: 'gm-base-hash' });

  gm.call('_draftSaveDebounced', 'sprint', function () { return { name: 'S1' }; });
  gm.call('_draftSaveDebounced', 'currentRole', function () { return { pp: 2 }; }, 250);
  const armedBoth = { delays: sched.delays(), cleared: sched.cleared.slice() };
  /* переарм того же suffix — clearTimeout прежнего, второй suffix не тронут */
  gm.call('_draftSaveDebounced', 'sprint', function () { return { name: 'S2' }; });
  const rearmed = { delays: sched.delays(), cleared: sched.cleared.slice() };

  sched.runNext(); /* currentRole 250мс */
  sched.runNext(); /* sprint 800мс (перевооружённый) */
  const draftAfterFire = JSON.parse(JSON.stringify(gm.get('_draft')));

  /* гард: рестор в процессе → no-op */
  gm.set({ _draftRestoreInProgress: true });
  gm.call('_draftSaveDebounced', 'sprint', function () { return { name: 'S3' }; });
  const armedDuringRestore = sched.delays();
  gm.set({ _draftRestoreInProgress: false });

  checkJsonSnapshot('draft-save-debounced-contract', {
    armedBoth: armedBoth,
    rearmed: rearmed,
    draftAfterFire: draftAfterFire,
    armedDuringRestore: armedDuringRestore,
  });
});

/* ═══════════════════ dirty-механика ═══════════════════ */

test('golden: dirty — markDirty/markClean/isDirty: карта секций, индикатор, гарды', () => {
  const { gm, window } = createHost();
  stubScheduler(window);
  stubApi(gm, {});
  recordDiag(gm);
  const indicatorCalls = [];
  gm.set({ refreshDirtyIndicator: function () { indicatorCalls.push(1); } });

  gm.call('_markDirty', 'sprint');
  const afterDirtySprint = {
    dirty: JSON.parse(JSON.stringify(gm.call('_draftGet', 'dirty'))),
    isDirty: gm.call('_draftIsDirty'),
    indicatorCalls: indicatorCalls.length,
  };
  /* ui-секция в _draftIsDirty НЕ учитывается (только sprint/roleItems/currentRole) */
  gm.call('_markClean', 'sprint');
  gm.call('_markDirty', 'ui');
  const uiOnly = {
    dirty: JSON.parse(JSON.stringify(gm.call('_draftGet', 'dirty'))),
    isDirty: gm.call('_draftIsDirty'),
  };
  gm.call('_markDirty', 'roleItems');
  const roleItemsDirty = gm.call('_draftIsDirty');

  /* гард: рестор в процессе → markDirty no-op (markClean гарда не имеет) */
  gm.set({ _draftRestoreInProgress: true });
  gm.call('_markDirty', 'currentRole');
  const duringRestore = JSON.parse(JSON.stringify(gm.call('_draftGet', 'dirty')));
  gm.call('_markClean', 'roleItems');
  const cleanDuringRestore = JSON.parse(JSON.stringify(gm.call('_draftGet', 'dirty')));
  gm.set({ _draftRestoreInProgress: false });

  checkJsonSnapshot('dirty-mark-contract', {
    afterDirtySprint: afterDirtySprint,
    uiOnly: uiOnly,
    roleItemsDirty: roleItemsDirty,
    duringRestore: duringRestore,
    cleanDuringRestore: cleanDuringRestore,
    indicatorCallsTotal: indicatorCalls.length,
  });
});

test('golden: dirty — WC-путь markDirty: sync активной копии, rk из подвкладки или roleKey снимка', () => {
  const { gm, window } = createHost();
  fx.applyBaseState(gm);
  const sched = stubScheduler(window);
  stubApi(gm, {});
  recordDiag(gm);
  gm.set({
    refreshDirtyIndicator: function () {},
    renderWorkingCopyBanner: function () {},
    _thisTabToken: 'gm-tab-token',
  });
  const wcKey = fx.HIST_SPRINT_ID + '_analysis';

  /* rk из _activeSubtab */
  gm.set({
    _activeWorkingDraftKey: wcKey,
    _activeSubtab: 'analysis',
    _workingDrafts: (function () {
      const m = {}; m[wcKey] = { key: wcKey, sprint: {}, items: [] }; return m;
    })(),
  });
  gm.call('_markDirty', 'sprint');
  const synced = JSON.parse(JSON.stringify(gm.get('_workingDrafts')[wcKey]));

  /* rk из roleKey снимка истории (подвкладка не активна) */
  gm.set({
    _activeSubtab: null,
    _workingDrafts: (function () {
      const m = {}; m[wcKey] = { key: wcKey, sprint: {}, items: [] }; return m;
    })(),
  });
  gm.call('_markDirty', 'roleItems');
  const syncedBySnapRole = {
    itemsLen: gm.get('_workingDrafts')[wcKey].items.length,
    tokenStamped: gm.get('_workingDrafts')[wcKey].editorTabToken,
  };

  /* ghost-ключ: записи нет → sync no-op, dirty всё равно ставится */
  gm.set({ _activeWorkingDraftKey: 'gm-ghost_analysis', _workingDrafts: {} });
  gm.call('_markDirty', 'sprint');

  checkJsonSnapshot('dirty-wc-sync-contract', {
    synced: synced,
    syncedBySnapRole: syncedBySnapRole,
    ghostDirty: JSON.parse(JSON.stringify(gm.call('_draftGet', 'dirty'))),
    wcFlushArmed: sched.delays(),
  });
});

/* ═══════════════════ working copies (_workingDrafts*) ═══════════════════ */

test('golden: WC — schedule/flush: переарм при живом таймере, POST, шапка + cross-tab маркеры', async () => {
  const { gm, window } = createHost();
  const sched = stubScheduler(window);
  const api = stubApi(gm, {});
  const headerCalls = [];
  const lsWrites = [];
  gm.set({
    renderWidgetHeader: function () { headerCalls.push(1); },
    safeLs: { set: function (k, v) { lsWrites.push(k); }, get: function () { return null; }, remove: function () {} },
    _workingDrafts: { 'gm-wc-a': { key: 'gm-wc-a' }, 'gm-wc-b': { key: 'gm-wc-b' } },
  });

  gm.call('_workingDraftsScheduleFlush');
  gm.call('_workingDraftsScheduleFlush'); /* живой таймер → переарм */
  const armed = { delays: sched.delays(), cleared: sched.cleared.slice() };
  sched.runNext();
  await flush();
  checkJsonSnapshot('wc-flush-contract', {
    armed: armed,
    api: api,
    dirtyAfter: gm.get('_workingDraftsDirty'),
    headerRerenders: headerCalls.length,
    crossTabKeys: lsWrites,
    /* flushNow без dirty → no-op */
    secondFlushPosts: (function () { gm.call('_workingDraftsFlushNow'); return api.length; })(),
  });
});

test('golden: WC — flush-ошибки: quota → toast + dirty восстановлен; прочее → diag + dirty', async () => {
  const { gm, window } = createHost();
  stubScheduler(window);
  const toasts = recordToasts(gm);
  const diagLog = recordDiag(gm);
  gm.set({
    renderWidgetHeader: function () {},
    safeLs: { set: function () {}, get: function () { return null; }, remove: function () {} },
    _workingDrafts: { 'gm-wc-a': { key: 'gm-wc-a' } },
  });

  stubApi(gm, { 'post:working-drafts': { reject: true, reason: 'working_drafts_too_large' } });
  gm.set({ _workingDraftsDirty: true });
  await gm.call('_workingDraftsFlushNow');
  const quota = { toasts: toasts.slice(), dirtyRestored: gm.get('_workingDraftsDirty') };

  stubApi(gm, { 'post:working-drafts': REJECT });
  gm.set({ _workingDraftsDirty: true });
  await gm.call('_workingDraftsFlushNow');
  checkJsonSnapshot('wc-flush-errors-contract', {
    quota: quota,
    generic: { diagTail: diagLog.slice(-1), dirtyRestored: gm.get('_workingDraftsDirty') },
  });
});

test('golden: WC — load (карта/мусор/reject) и deleteOnBackend (key/без key)', async () => {
  const { gm } = createHost();
  const diagLog = recordDiag(gm);
  let api = stubApi(gm, { 'get:working-drafts': { data: { k1: { key: 'k1' } } } });
  await gm.call('_workingDraftsLoadFromBackend');
  const loadedOk = {
    map: JSON.parse(JSON.stringify(gm.get('_workingDrafts'))),
    loaded: gm.get('_workingDraftsLoaded'),
  };
  stubApi(gm, { 'get:working-drafts': { data: ['array', 'is', 'garbage'] } });
  await gm.call('_workingDraftsLoadFromBackend');
  const loadedGarbage = JSON.parse(JSON.stringify(gm.get('_workingDrafts')));
  stubApi(gm, { 'get:working-drafts': REJECT });
  await gm.call('_workingDraftsLoadFromBackend');
  const loadedReject = {
    map: JSON.parse(JSON.stringify(gm.get('_workingDrafts'))),
    loaded: gm.get('_workingDraftsLoaded'),
  };

  api = stubApi(gm, {});
  await gm.call('_workingDraftsDeleteOnBackend', 'gm-wc-a');
  await gm.call('_workingDraftsDeleteOnBackend', null); /* без key → resolve без POST */
  checkJsonSnapshot('wc-load-delete-contract', {
    loadedOk: loadedOk,
    loadedGarbage: loadedGarbage,
    loadedReject: loadedReject,
    deleteApi: api,
    diag: diagLog,
  });
});

test('golden: WC — reconcile: гард !loaded, orphan-чистка, выравнивание hasWorkingCopy + POST history', async () => {
  const { gm, window } = createHost();
  fx.applyBaseState(gm);
  const sched = stubScheduler(window);
  const api = stubApi(gm, {});
  const diagLog = recordDiag(gm);
  const wcKey = fx.HIST_SPRINT_ID + '_analysis';

  /* гард: не загружено → no-op */
  gm.set({ _workingDraftsLoaded: false, _workingDrafts: { orphan_x: { key: 'orphan_x' } } });
  gm.call('reconcileHasWorkingCopyFlag');
  const guardedDrafts = Object.keys(gm.get('_workingDrafts'));

  /* orphan удаляется + флаг снимка выравнивается в обе стороны */
  const hist = gm.get('_history');
  hist[0].hasWorkingCopy = false; /* есть драфт → станет true */
  hist[1].hasWorkingCopy = true;  /* драфта нет → станет false */
  gm.set({
    _workingDraftsLoaded: true,
    _workingDrafts: (function () {
      const m = { orphan_x: { key: 'orphan_x' } };
      m[wcKey] = { key: wcKey, items: [] };
      return m;
    })(),
  });
  gm.call('reconcileHasWorkingCopyFlag');
  checkJsonSnapshot('wc-reconcile-contract', {
    guardedDrafts: guardedDrafts,
    draftsAfter: Object.keys(gm.get('_workingDrafts')),
    flags: { hist0: gm.get('_history')[0].hasWorkingCopy, hist1: gm.get('_history')[1].hasWorkingCopy },
    flushArmed: sched.delays(),
    api: api,
    diag: diagLog,
  });
});

test('golden: WC — gc: TTL 30 дней от frozen-now, null-записи, toast-сводка, снятие флага истории', async () => {
  const { gm, window } = createHost();
  fx.applyBaseState(gm);
  const sched = stubScheduler(window);
  const api = stubApi(gm, {});
  const toasts = recordToasts(gm);
  recordDiag(gm);
  const NOW = window.Date.now(); /* FIXED_NOW хоста */
  const DAY = 24 * 3600 * 1000;
  const wcKey = fx.HIST_SPRINT_ID + '_analysis';

  const hist = gm.get('_history');
  hist[0].hasWorkingCopy = true; /* его драфт протухнет → флаг снимается */
  gm.set({
    _workingDraftsLoaded: true,
    _workingDrafts: (function () {
      const m = {};
      m[wcKey] = { key: wcKey, updatedAt: NOW - 31 * DAY }; /* протух */
      m['gm-fresh'] = { key: 'gm-fresh', updatedAt: NOW - 5 * DAY }; /* жив */
      m['gm-null'] = null; /* мусор → удаляется */
      m['gm-no-stamp'] = { key: 'gm-no-stamp' }; /* updatedAt нет → 0 → протух */
      return m;
    })(),
  });
  gm.call('gcWorkingDrafts');
  checkJsonSnapshot('wc-gc-contract', {
    survivors: Object.keys(gm.get('_workingDrafts')),
    hist0Flag: gm.get('_history')[0].hasWorkingCopy,
    toasts: toasts,
    flushArmed: sched.delays(),
    api: api,
  });
});
