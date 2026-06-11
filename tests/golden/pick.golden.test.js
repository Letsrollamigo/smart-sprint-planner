/**
 * Golden-master: подбор задач (Phase 4 #32 / #33) — характеризация ДО выноса
 * pick.js (Тир C).
 *
 * _buildPickQuery / _buildPickScope / _mapIssueMeta / _pickAssist / _pickSearch /
 * _pickLoadAll (вкл. cap-ветку через подмену MAX_PICK_TOTAL) / _pickAddSelected /
 * openPickModal (спек модалки + контракты onAdd/onClose).
 *
 * Сеть симулируется подменой _host (паттерн buildHostStub фикстуры) — синтетические
 * выдачи issues постранично; время заморожено → addedAt детерминирован. _ctx в
 * харнесе не инициализирован (init-цепочка заморожена) — задаётся gm.set явно.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { createHost } = require('./monolith-host');
const { checkJsonSnapshot } = require('./snap');
const fx = require('./fixtures/state');

const PICK_PAGE = 10; /* = монолитному PICK_PAGE; страницы синтетики строятся под него */

function bootPick() {
  const host = createHost();
  fx.applyBaseState(host.gm);
  host.gm.set({
    _ctx: { project: { id: 'gm-project-id', shortName: 'GM', name: 'GM Project' } },
    _currentUser: { login: 'gm_user_editor', fullName: 'GM Editor' },
    _currentPickRole: 'analysis',
  });
  return host;
}

/** Спек → снапшот-форма: функции заменяются плейсхолдером (как modal-specs). */
function serializeSpec(spec) {
  return JSON.parse(JSON.stringify(spec, function (k, v) {
    return typeof v === 'function' ? '<fn>' : v;
  }));
}

/** Синтетический issue YouTrack-API. n=1 → idReadable 'GM-1' (коллизия с фикстурой). */
function ytIssue(n) {
  return {
    id: 'gm-int-' + n,
    idReadable: 'GM-' + n,
    summary: 'Synthetic issue ' + n,
    customFields: [
      { name: 'State', value: { name: n % 2 ? 'Open' : 'In Progress' } },
      { name: 'Priority', value: { name: n % 3 ? 'Normal' : 'Major' } },
    ],
  };
}

/** _host-стаб с постраничной выдачей issues: pages[skip/PICK_PAGE] или []. */
function pagedHost(pages) {
  const log = [];
  return {
    log: log,
    fetchApp: function (p, o) { log.push({ kind: 'app', path: p }); return Promise.resolve({}); },
    fetchYouTrack: function (p, o) {
      log.push({ kind: 'yt', path: p, query: o && o.query && o.query.query, skip: o && o.query && o.query.$skip });
      if (p === 'issues') {
        const idx = ((o && o.query && o.query.$skip) || 0) / PICK_PAGE;
        return Promise.resolve(pages[idx] || []);
      }
      return Promise.resolve({});
    },
  };
}

test('golden: _buildPickQuery / _buildPickScope — матрица проект/без проекта', () => {
  const { gm } = bootPick();
  const withProject = {
    empty: gm.call('_buildPickQuery', ''),
    text: gm.call('_buildPickQuery', '  #Unresolved сортировать по: обновлена  '),
    hasProjectPrefix: gm.call('_buildPickQuery', 'PROJECT: OTHER #Unresolved'),
    scope: gm.call('_buildPickScope'),
  };
  gm.set({ _ctx: {} });
  const noProject = {
    text: gm.call('_buildPickQuery', '#Unresolved'),
    scope: gm.call('_buildPickScope'),
  };
  checkJsonSnapshot('pick-query-scope', { withProject: withProject, noProject: noProject });
});

test('golden: _mapIssueMeta — формы значений customFields + маппинг настроек', () => {
  const { gm } = bootPick();
  const settings = gm.get('_settings');
  gm.set({
    _settings: Object.assign({}, settings, {
      fieldXPriority: 'XPrio', fieldSystem: 'Система', fieldExternalTicketId: 'ExtId',
    }),
  });
  const shapes = gm.call('_mapIssueMeta', {
    id: 'i-1', idReadable: 'GM-S1', summary: '  trimmed summary  ',
    customFields: [
      { name: 'State', value: { localizedName: 'Открыта', name: 'Open' } },
      { name: 'Priority', value: { presentation: 'P-Major' } },
      { name: 'XPrio', value: 'plain-string' },
      { projectCustomField: { field: { name: 'Система' } }, value: { name: 'Core' } },
      { name: 'ExtId', value: { name: 'EXT-77' } },
    ],
  });
  const fallbacks = gm.call('_mapIssueMeta', {
    id: 'i-2', idReadable: 'GM-S2', summary: '',
    customFields: [
      { name: 'Состояние', value: { name: 'В работе' } }, /* RU-fallback имени поля */
      { name: 'Priority', value: null },                  /* null value → null */
    ],
  });
  checkJsonSnapshot('pick-map-issue-meta', { shapes: shapes, fallbacks: fallbacks });
});

test('golden: _pickAssist — контракт search/assist (успех + деградация)', async () => {
  const { gm } = bootPick();
  const ok = pagedHost([]);
  ok.fetchYouTrack = function (p, o) {
    ok.log.push({ path: p, body: o && o.body, fields: o && o.query && o.query.fields });
    return Promise.resolve({ suggestions: [{ option: 'Unresolved', prefix: '#' }] });
  };
  gm.set({ _host: ok });
  const success = await gm.call('_pickAssist', { query: '#Unr', caret: 4 });

  const broken = { fetchYouTrack: function () { return Promise.reject(new Error('assist down')); }, fetchApp: function () { return Promise.resolve({}); } };
  gm.set({ _host: broken });
  const degraded = await gm.call('_pickAssist', { query: 'x' }); /* caret по умолчанию = длина */

  checkJsonSnapshot('pick-assist', { success: success, degraded: degraded, request: ok.log[0] });
});

test('golden: _pickSearch — страница, hasMore, isAdded, кэш по fingerprint', async () => {
  const { gm } = bootPick();
  /* 11 issues → slice до 10, hasMore=true; GM-1 уже в составе роли analysis фикстуры */
  const page0 = []; for (let n = 1; n <= PICK_PAGE + 1; n++) page0.push(ytIssue(n));
  const host = pagedHost([page0]);
  gm.set({ _host: host });
  const res = await gm.call('_pickSearch', '#Unresolved', 1);
  checkJsonSnapshot('pick-search', {
    result: res,
    fetches: host.log,
    cacheSize: gm.get('_pickAllResults').size,
    fingerprint: gm.get('_pickQueryFingerprint'),
  });
});

test('golden: _pickLoadAll — полная подгрузка + cap-ветка', async () => {
  const { gm } = bootPick();
  const toasts = [];
  gm.set({ toast: function (msg, type) { toasts.push({ msg: msg, type: type }); } });

  /* Сценарий А: 2 страницы (11 + 3) → 13 в кэше, минус GM-1 из состава роли */
  const page0 = []; for (let n = 1; n <= PICK_PAGE + 1; n++) page0.push(ytIssue(n));
  const page1 = [ytIssue(11), ytIssue(12), ytIssue(13)];
  const hostA = pagedHost([page0, page1]);
  gm.set({ _host: hostA });
  const full = await gm.call('_pickLoadAll', '#Unresolved');

  /* Сценарий Б: лимит снижен → cap после первой страницы */
  gm.set({ _pickAllResults: new Map(), _pickQueryFingerprint: '', MAX_PICK_TOTAL: 5 });
  const hostB = pagedHost([page0, page1]);
  gm.set({ _host: hostB });
  const capped = await gm.call('_pickLoadAll', '#Unresolved');
  gm.set({ MAX_PICK_TOTAL: 1000 });

  checkJsonSnapshot('pick-load-all', {
    full: { ids: full.ids, capped: full.capped, fetches: hostA.log.length },
    cappedRun: { ids: capped.ids, capped: capped.capped, fetches: hostB.log.length },
    toasts: toasts,
  });
});

test('golden: _pickAddSelected — структура новых item, дубли, draft/apiPost, сброс кэша', async () => {
  const { gm } = bootPick();
  const calls = { apiPost: [], markDirty: [], draftSet: [], renders: [], toasts: [] };
  /* Кэш наполняется честным путём — через _pickSearch на стабе сети */
  const page0 = []; for (let n = 1; n <= 3; n++) page0.push(ytIssue(n));
  gm.set({ _host: pagedHost([page0]) });
  await gm.call('_pickSearch', '#Unresolved', 1);

  gm.set({
    toast: function (msg, type) { calls.toasts.push({ msg: msg, type: type }); },
    apiPost: function (path, payload) { calls.apiPost.push({ path: path, payloadKeys: Object.keys(payload) }); return Promise.resolve({}); },
    _markDirty: function (what) { calls.markDirty.push(what); },
    _draftSet: function (key) { calls.draftSet.push(key); },
    renderRoleComposition: function (rk) { calls.renders.push('comp:' + rk); },
    updateRoleRemaining: function (rk) { calls.renders.push('rem:' + rk); },
    refreshRoleEstimates: function (rk) { calls.renders.push('est:' + rk); },
  });

  const before = gm.get('_roleItems').analysis.length;
  /* GM-1 — дубль (есть в фикстуре), GM-2 есть в фикстуре, GM-3 фикстурный... берём 2 и 3:
     в фикстуре analysis = GM-1..GM-4 → синтетика GM-2/GM-3 тоже дубли; реально новых нет.
     Чтобы охватить обе ветки — добавляем заведомо новый GM-99 через кэш второй страницы. */
  const page0b = [ytIssue(99)];
  gm.set({ _host: pagedHost([page0b]) });
  await gm.call('_pickSearch', 'другой запрос', 1); /* новый fingerprint → кэш сброшен и наполнен GM-99 */
  gm.call('_pickAddSelected', 'analysis', ['GM-99', 'GM-1']); /* GM-1 нет в кэше нового запроса, но он дубль */
  await new Promise(function (r) { setTimeout(r, 0); }); /* flush then-цепочки apiPost */

  const after = gm.get('_roleItems').analysis;
  checkJsonSnapshot('pick-add-selected', {
    appended: after.slice(before),
    totalAfter: after.length,
    calls: calls,
    cacheReset: gm.get('_pickAllResults').size === 0 && gm.get('_pickQueryFingerprint') === '',
  });
});

test('golden: openPickModal — спек модалки + сброс стейта + контракты onAdd/onClose', () => {
  const host = bootPick();
  const { gm } = host;
  const added = [];
  gm.set({
    _pickAllResults: new Map([['stale', {}]]), _pickQueryFingerprint: 'stale', _selectedIds: new Set(['x']),
    _pickAddSelected: function (rk, ids) { added.push({ rk: rk, ids: ids }); },
  });
  const role = gm.get('ALL_ROLES').find(function (r) { return r.key === 'analysis'; });
  gm.call('openPickModal', 'analysis', role);
  assert.equal(host.modalLog.length, 1, 'pick modal must open');
  const spec = host.modalLog[0];
  const stateAfterOpen = {
    currentPickRole: gm.get('_currentPickRole'),
    cacheCleared: gm.get('_pickAllResults').size === 0,
    fingerprintCleared: gm.get('_pickQueryFingerprint') === '',
    inFlightReset: gm.get('_pickAllInFlight') === false,
  };
  spec.body.props.onAdd(['GM-7', 'GM-8']); /* onAdd → _pickAddSelected (рекордер) + close */
  gm.set({ _pickAllResults: new Map([['x', {}]]) });
  spec.onClose(); /* закрытие → сброс кэша */
  checkJsonSnapshot('pick-modal', {
    spec: serializeSpec(spec),
    stateAfterOpen: stateAfterOpen,
    onAddCalls: added,
    cacheResetOnClose: gm.get('_pickAllResults').size === 0,
  });
});
