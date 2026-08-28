/**
 * Golden-master: data-loaders (Фаза 5 слайс 12, домен E6 — первый выносимый
 * подкластер init/bootstrap).
 *
 * Характеризация ДО выноса в data-loaders.js (__SSP_DATA_LOADERS):
 *   • loadMe — fetchYouTrack('users/me') → _currentUser; catch → {login:'unknown'};
 *   • loadProjectFields — apiGet('project-fields') → _projectFields + projectName
 *     (кэш _projectDisplayName + _updateProjectNameLabel + _ytBaseFromProject);
 *     no-success / reject — стейт не трогаем;
 *   • loadProjectGroups — fetchYouTrack('groups') → _projectGroups (фильтр no-id,
 *     name-trim с fallback на id); reject → [];
 *   • loadAllData — apiGet('sprint-data') → _settings/_sprint/_roleItems/
 *     _enableDebugLog с defensive-миграцией (migrateStatus/migrateInc),
 *     url-репэйр (/null/ → _ytBase), strip item.sprintId, синтез пустого
 *     _sprint (uid), orphanGanttIssues;
 *     затем apiGet('history') → _history (миграция + orphanGanttBySprintId);
 *     затем _workingDraftsLoadFromBackend + reconcile/gc-хвост;
 *   • _refreshFeatureStatusBar — 6 chip'ов #widgetStatusBar по флагам _settings.
 *
 * Контракты — через выживающие entry-points (loadMe/loadProjectFields/
 * loadProjectGroups/loadAllData/_refreshFeatureStatusBar остаются делегаторами);
 * не-кластерные callee (хуки project-name/ytBase, draft-store, i18n-default,
 * diag-visibility) стабятся по closure-vars → переживают вынос. Async —
 * settle макротиками (loaders возвращают свои промис-чейны, но вложенные
 * .then settle'ятся надёжнее).
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { createHost } = require('./monolith-host');
const { checkJsonSnapshot } = require('./snap');

/** Settle вложенных промис-чейнов loadAllData (sprint-data → history → drafts). */
async function settle(n) {
  for (let i = 0; i < (n || 4); i++) await new Promise(function (r) { setTimeout(r, 0); });
}

/** Recording-стаб apiGet с диспетчеризацией по path. */
function stubApiGet(gm, responses) {
  const log = [];
  gm.set({
    apiGet: function (path) {
      log.push(path);
      const r = responses[path];
      if (r instanceof Error) return Promise.reject(r);
      return Promise.resolve(r === undefined ? null : r);
    },
  });
  return log;
}

/** Recording-стаб _host.fetchYouTrack по path. */
function stubHost(gm, handler) {
  const log = [];
  gm.set({
    _host: {
      fetchYouTrack: function (p, o) {
        log.push({ path: p, fields: o && o.query ? o.query.fields : undefined });
        return handler(p, o);
      },
      fetchApp: function () { return Promise.resolve({}); },
    },
  });
  return log;
}

/** Заглушить не-кластерные хвостовые хуки loadAllData как recorder'ы. */
function stubTailHooks(gm) {
  const calls = [];
  function rec(name) { return function () { calls.push(name); return Promise.resolve(); }; }
  gm.set({
    _syncProjectDefaultLang: rec('syncDefaultLang'),
    _refreshFeatureStatusBar: rec('featureBar'),
    _applyDiagLogVisibility: rec('diagVis'),
    _workingDraftsLoadFromBackend: rec('wdLoad'),
    reconcileHasWorkingCopyFlag: rec('reconcile'),
    gcWorkingDrafts: rec('gc'),
  });
  return calls;
}

/* ════════════════════════ loadMe ════════════════════════ */

test('loadMe — happy: fetchYouTrack(users/me) → _currentUser', async () => {
  const { gm } = createHost();
  const log = stubHost(gm, function () {
    return Promise.resolve({ id: 'u-1', login: 'gm_user_1', fullName: 'GM User One' });
  });
  await gm.call('loadMe');
  await settle();
  checkJsonSnapshot('data-loaders-loadMe-happy', {
    fetched: log,
    currentUser: gm.get('_currentUser'),
  });
});

test('loadMe — reject: _currentUser fallback {login:"unknown"}', async () => {
  const { gm } = createHost();
  stubHost(gm, function () { return Promise.reject(new Error('gm-net-down')); });
  await gm.call('loadMe');
  await settle();
  assert.strictEqual(JSON.stringify(gm.get('_currentUser')), JSON.stringify({ login: 'unknown' }));
});

/* ════════════════════ loadProjectFields ════════════════════ */

test('loadProjectFields — happy: _projectFields + projectName кэш/хуки', async () => {
  const { gm } = createHost();
  const apiLog = stubApiGet(gm, {
    'project-fields': {
      success: true,
      fields: [
        { name: 'Sprints', type: 'version' },
        { name: 'State', type: 'state' },
        { name: 'Estimation', type: 'period' },
      ],
      projectName: 'Демопроект DEMOClone',
    },
  });
  const hooks = [];
  gm.set({
    _updateProjectNameLabel: function () { hooks.push('nameLabel'); },
    _ytBaseFromProject: function () { hooks.push('ytBase'); },
  });
  await gm.call('loadProjectFields');
  await settle();
  checkJsonSnapshot('data-loaders-loadProjectFields-happy', {
    apiLog: apiLog,
    projectFields: gm.get('_projectFields'),
    projectDisplayName: gm.get('_projectDisplayName'),
    hooks: hooks,
  });
});

test('loadProjectFields — no-success: стейт не меняется', async () => {
  const { gm } = createHost();
  gm.set({ _projectFields: ['SENTINEL'], _projectDisplayName: 'KEEP' });
  stubApiGet(gm, { 'project-fields': { success: false } });
  gm.set({ _updateProjectNameLabel: function () {}, _ytBaseFromProject: function () {} });
  await gm.call('loadProjectFields');
  await settle();
  assert.strictEqual(JSON.stringify(gm.get('_projectFields')), JSON.stringify(['SENTINEL']));
  assert.strictEqual(gm.get('_projectDisplayName'), 'KEEP');
});

test('loadProjectFields — reject: проглатывается, стейт цел', async () => {
  const { gm } = createHost();
  gm.set({ _projectFields: ['SENTINEL'] });
  stubApiGet(gm, { 'project-fields': new Error('gm-fields-down') });
  gm.set({ _updateProjectNameLabel: function () {}, _ytBaseFromProject: function () {} });
  await gm.call('loadProjectFields');
  await settle();
  assert.strictEqual(JSON.stringify(gm.get('_projectFields')), JSON.stringify(['SENTINEL']));
});

/* ════════════════════ loadProjectGroups ════════════════════ */

test('loadProjectGroups — happy: фильтр no-id + name-trim fallback на id', async () => {
  const { gm } = createHost();
  const log = stubHost(gm, function () {
    return Promise.resolve([
      { id: 'g-1', name: 'sprint-managers' },
      { id: 'g-2', name: '   ' },          // пустое имя → fallback на id
      { id: 'g-3', name: '  trimmed  ' },  // тримминг
      { name: 'no-id-group' },             // нет id → отфильтрован
    ]);
  });
  await gm.call('loadProjectGroups');
  await settle();
  checkJsonSnapshot('data-loaders-loadProjectGroups-happy', {
    fetched: log,
    projectGroups: gm.get('_projectGroups'),
  });
});

/* #71 — маркер автогруппы: все четыре слоя детектора на реальных формах ответа
   YouTrack, снятых 2026-08-23 (2026.1 отдаёт $type и allUsersGroup,
   2025.3 стирает подтип и всегда шлёт allUsersGroup=false). */
test('loadProjectGroups — маркер автогруппы: 4 слоя детектора (#71)', async () => {
  const { gm } = createHost();
  stubHost(gm, function () {
    return Promise.resolve([
      /* YT 2026.1 — слой 1: авторитетный флаг */
      { id: '101-0', name: 'Все пользователи', allUsersGroup: true, $type: 'AllUsersGroup' },
      /* YT 2026.1 — слой 2: подтип (флага нет, имя локализовано) */
      { id: '5-9', name: 'Demo project Team', allUsersGroup: false, $type: 'ProjectTeam' },
      /* YT 2025.3 — слой 3: подтип стёрт, флаг false, имя локализовано → системный id */
      { id: '6-0', name: 'Зарегистрированные пользователи', allUsersGroup: false, $type: 'UserGroup' },
      /* YT 2025.3 — слой 4: имя (EN-инстанс) */
      { id: '9-9', name: 'All Users', allUsersGroup: false, $type: 'UserGroup' },
      /* Обычная группа — маркера быть не должно */
      { id: '4-7', name: 'Разработчики', allUsersGroup: false, $type: 'NestedGroup' },
      /* Обычная группа с « Team» в имени на 2025.3 — ложного срабатывания нет */
      { id: '4-8', name: 'Dream Team', allUsersGroup: false, $type: 'UserGroup' },
    ]);
  });
  await gm.call('loadProjectGroups');
  await settle();
  const byId = {};
  gm.get('_projectGroups').forEach((g) => { byId[g.id] = g.allUsersGroup; });
  assert.deepStrictEqual(byId, {
    '101-0': true, '5-9': true, '6-0': true, '9-9': true,
    '4-7': false, '4-8': false,
  });
});

test('loadProjectGroups — reject: _projectGroups = []', async () => {
  const { gm } = createHost();
  gm.set({ _projectGroups: ['SENTINEL'] });
  stubHost(gm, function () { return Promise.reject(new Error('gm-groups-down')); });
  await gm.call('loadProjectGroups');
  await settle();
  assert.strictEqual(JSON.stringify(gm.get('_projectGroups')), '[]');
});

/* ════════════════════════ loadAllData ════════════════════════ */

test('loadAllData — full transform: settings/sprint/roleItems/history + миграция', async () => {
  const { gm } = createHost();
  const tail = stubTailHooks(gm);
  gm.set({ _ytBase: 'http://yt.local' });
  const apiLog = stubApiGet(gm, {
    'sprint-data': {
      success: true,
      settings: { activeRoles: ['analysis', 'testing'], personalPlanningEnabled: true },
      sprint: {
        sprintId: 'gm-s1',
        status: 'planning',                 // lower-case → migrateStatus
        dateStart: 1779408000000,
        dateEnd: 1781568000000,
      },
      roleItems: {
        analysis: [
          { issueId: 'GM-1', title: 'A', inclusionStatus: 'planned', url: 'http://yt.local/issue/GM-1', sprintId: 'STRIP-ME' },
          { issueId: 'GM-2', title: 'B', inclusionStatus: 'unplanned', url: 'http://x/null/GM-2' }, // url-репэйр
        ],
        testing: [
          { issueId: 'GM-5', title: 'C', inclusionStatus: 'excluded' },                              // url отсутствует → репэйр
        ],
      },
      orphanGanttIssues: ['GM-9'],
      enableDebugLog: true,
    },
    'history': {
      success: true,
      history: [
        { sprintId: 'h-1_analysis', status: 'finished', confirmedAt: 100, items: [{ issueId: 'H-1', inclusionStatus: 'planned' }] },
        { sprintId: 'h-2_testing', status: 'allocated', confirmedAt: 200, items: [] },
      ],
      orphanGanttBySprintId: { 'h-1_analysis': ['H-9'] },
    },
  });
  await gm.call('loadAllData');
  await settle(6);
  checkJsonSnapshot('data-loaders-loadAllData-full', {
    apiLog: apiLog,
    settings: gm.get('_settings'),
    sprint: gm.get('_sprint'),
    roleItems: gm.get('_roleItems'),
    history: gm.get('_history'),
    enableDebugLog: gm.get('_enableDebugLog'),
    tailHooks: tail,
  });
});

test('loadAllData — пустой sprint синтезируется (uid + PLANNING)', async () => {
  const { gm } = createHost();
  stubTailHooks(gm);
  stubApiGet(gm, {
    'sprint-data': { success: true, settings: {}, roleItems: {} },
    'history': { success: true, history: [] },
  });
  await gm.call('loadAllData');
  await settle(6);
  const sprint = gm.get('_sprint');
  assert.ok(sprint && typeof sprint.sprintId === 'string' && sprint.sprintId.length > 0, 'sprintId сгенерирован');
  checkJsonSnapshot('data-loaders-loadAllData-emptySprint', {
    dateStart: sprint.dateStart,
    dateEnd: sprint.dateEnd,
    status: sprint.status,
  });
});

/* ════════════════════ _refreshFeatureStatusBar ════════════════════ */

test('_refreshFeatureStatusBar — 6 chip\'ов по флагам _settings', async () => {
  const { gm, document } = createHost();
  gm.set({
    _settings: {
      dynEditEnabled: true,
      personalPlanningEnabled: false,
      dtaEnabled: true,
      cascadeAggregationEnabled: false,
      stateRollupEnabled: true,
      allowOverlimitPlanning: false,
    },
  });
  gm.call('_refreshFeatureStatusBar');
  const chips = ['ssbInline', 'ssbPersonal', 'ssbDta', 'ssbCascade', 'ssbStateRollup', 'ssbOverlimit'].map(function (id) {
    const el = document.getElementById(id);
    const stateEl = el && el.querySelector('.ssb-chip__state');
    return {
      id: id,
      on: el ? el.classList.contains('ssb-on') : null,
      off: el ? el.classList.contains('ssb-off') : null,
      stateI18n: stateEl ? stateEl.getAttribute('data-i18n') : null,
    };
  });
  checkJsonSnapshot('data-loaders-featureStatusBar', chips);
});

/* ════════════════════ #97 — предохранители загрузки проекта ════════════════════
   Сбой загрузки раньше глотался молча: `loadProjectFields` заканчивался пустым
   `.catch`, `loadAllData` писал только в диаг. Пользователь видел пустой экран,
   неотличимый от пустого проекта. Плюс отсутствовал generation-guard: поздний
   ответ по уже покинутому проекту оседал в стейте под новой шапкой. */

test('#97: сбой загрузки состава → полоса с причиной (а не молчаливый пустой экран)', async () => {
  const { gm } = createHost();
  const banners = [];
  gm.set({ _setGlobalBanner: function (key, sub) { banners.push({ key: key, sub: sub }); } });
  stubApiGet(gm, { 'sprint-data': new Error('gm-backend-down') });
  await gm.call('loadAllData');
  await settle();
  assert.deepStrictEqual(banners, [{ key: 'bannerProjectLoadFailed', sub: 'gm-backend-down' }],
    'причина сбоя показана полосой');
});

test('#97: превышенное ожидание ответа названо человеческим текстом, не «Error»', async () => {
  const { gm } = createHost();
  const banners = [];
  gm.set({ _setGlobalBanner: function (key, sub) { banners.push({ key: key, sub: sub }); } });
  const timeoutErr = new Error('read deadline 30000ms exceeded: project-fields');
  timeoutErr._readDeadlineExceeded = true;
  stubApiGet(gm, { 'project-fields': timeoutErr });
  gm.set({ _updateProjectNameLabel: function () {}, _ytBaseFromProject: function () {} });
  await gm.call('loadProjectFields');
  await settle();
  assert.strictEqual(banners.length, 1);
  assert.strictEqual(banners[0].key, 'bannerProjectLoadFailed');
  assert.strictEqual(banners[0].sub, gm.call('T', 'loadFailedTimeout'), 'причина — локализованный текст таймаута');
});

test('#97: поздний ответ по покинутому проекту не пишет в стейт', async () => {
  const { gm } = createHost();
  gm.set({ _activeProjectKey: 'PRJ-A', _settings: { sentinel: 'KEEP' }, _sprint: null });
  let release = null;
  /* подвешен только sprint-data; остальное отвечает сразу, иначе цепочка не завершится */
  gm.set({
    apiGet: function (path) {
      if (path === 'sprint-data') return new Promise(function (res) { release = res; });
      return Promise.resolve({ success: true, history: [] });
    },
    _workingDraftsLoadFromBackend: function () { return Promise.resolve(); },
    reconcileHasWorkingCopyFlag: function () {}, gcWorkingDrafts: function () {},
  });

  const inFlight = gm.call('loadAllData');
  gm.set({ _activeProjectKey: 'PRJ-B' });          /* пользователь ушёл на другой проект */
  release({ success: true, settings: { sentinel: 'STALE' }, sprint: { sprintId: 'stale' }, roleItems: {} });
  await inFlight;
  await settle();

  assert.strictEqual(gm.get('_settings').sentinel, 'KEEP', 'настройки покинутого проекта не применены');
  assert.strictEqual(gm.get('_sprint'), null, 'спринт покинутого проекта не применён');
});
