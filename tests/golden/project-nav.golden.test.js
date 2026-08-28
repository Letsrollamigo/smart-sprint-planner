/**
 * Golden-master: project-nav (#25 Ф1 — global-picker проектов + project-mode страница
 * настроек). Добор ДО выноса (Фаза 5 слайс 14, домен E6 — выносимый подкластер
 * init/bootstrap):
 *   global-picker: _loadGlobalProjectList / _renderProjectPicker / _setGlobalBanner /
 *     _setPickerValue / _applyActiveProject / _initGlobalProjectSelection /
 *     _onProjectPicked / _switchToProject / _confirmDiscardAndSwitch;
 *   project-mode: _loadSettingsOnly / _renderProjectSettingsPage / _mountProjectSettings.
 *
 * init-IIFE заморожен в host (YTApp.register — вечный промис) → функции, достижимые
 * в проде только из init-цепочки, характеризуются ИЗОЛИРОВАННО через gm.call. Стейт-
 * резет ядра (_resetProjectStateCaches, 22 var) и оркестратор старта
 * (_loadAndRenderProject) ОСТАЮТСЯ в ядре → в модуль приходят late-binding deps;
 * кросс-кластерные хуки (share/draft/i18n/loaders/settings + chrome) — через core-
 * делегаторы. gm.set-стабы их перехватывают. _NO_PROJECT_SENTINEL — object-ref ядра.
 * LS-ключ last-used per-fork (ssp_/ssp_) → core-dep литерал → safeLs читает localStorage.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { createHost } = require('./monolith-host');
const { checkJsonSnapshot } = require('./snap');

/** Settle промис-чейнов (loadGlobalProjectList: admin/projects → filter-planner-projects). */
async function settle(n) {
  for (let i = 0; i < (n || 4); i++) await new Promise(function (r) { setTimeout(r, 0); });
}

/** Recording-стаб _host.fetchYouTrack по path. */
function stubHost(gm, handler) {
  const log = [];
  gm.set({
    _host: {
      fetchYouTrack: function (p, o) {
        log.push({ path: p, fields: o && o.query ? o.query.fields : undefined, top: o && o.query ? o.query['$top'] : undefined });
        return handler(p, o);
      },
      fetchApp: function () { return Promise.resolve({}); },
    },
  });
  return log;
}

/** Recording-стаб apiGet/apiPost с диспетчеризацией по path. */
function stubApi(gm, getResp, postResp) {
  const log = [];
  gm.set({
    apiGet: function (path) {
      log.push({ get: path });
      const r = (getResp || {})[path];
      if (r instanceof Error) return Promise.reject(r);
      return Promise.resolve(r === undefined ? null : r);
    },
    apiPost: function (path, body) {
      log.push({ post: path, body: body });
      const r = (postResp || {})[path];
      if (r instanceof Error) return Promise.reject(r);
      return Promise.resolve(r === undefined ? null : r);
    },
  });
  return log;
}

/* ════════════════════ _loadGlobalProjectList ════════════════════ */

test('_loadGlobalProjectList — happy: admin/projects (фильтр archived) → filter-planner-projects', async () => {
  const { gm } = createHost();
  const ytLog = stubHost(gm, function () {
    return Promise.resolve([
      { id: 'p-1', name: 'Демопроект', shortName: 'DEMO', archived: false },
      { id: 'p-2', name: 'Архивный', shortName: 'OLD', archived: true },        // archived → отфильтрован
      { id: 'p-3', name: 'Clone', shortName: 'DEMOClone', archived: false },
      { id: 'p-4', name: 'Без ключа' },                                          // нет shortName → отфильтрован
    ]);
  });
  const apiLog = stubApi(gm, {}, {
    'filter-planner-projects': { projects: [
      { key: 'DEMO', name: 'Демопроект' },
      { key: 'DEMOClone', name: 'Clone' },
    ] },
  });
  const res = await gm.call('_loadGlobalProjectList');
  await settle();
  checkJsonSnapshot('project-nav-loadGlobalProjectList-happy', {
    ytLog: ytLog,
    apiLog: apiLog,
    result: res,
  });
});

test('_loadGlobalProjectList — пустой набор ключей: [] без filter-вызова', async () => {
  const { gm } = createHost();
  stubHost(gm, function () { return Promise.resolve([{ shortName: 'OLD', archived: true }]); });
  const apiLog = stubApi(gm, {}, { 'filter-planner-projects': { projects: [{ key: 'X' }] } });
  const res = await gm.call('_loadGlobalProjectList');
  await settle();
  assert.strictEqual(JSON.stringify(res), '[]');
  assert.strictEqual(apiLog.length, 0, 'filter-planner-projects не вызывается при пустых keys');
});

test('_loadGlobalProjectList — reject admin/projects → []', async () => {
  const { gm } = createHost();
  stubHost(gm, function () { return Promise.reject(new Error('gm-projects-down')); });
  stubApi(gm, {}, {});
  const res = await gm.call('_loadGlobalProjectList');
  await settle();
  assert.strictEqual(JSON.stringify(res), '[]');
});

/* ════════════════════ _renderProjectPicker / _setPickerValue ════════════════════ */

test('_renderProjectPicker — структура select из _globalProjects + value=_activeProjectKey', () => {
  const { gm, document } = createHost();
  gm.set({
    _globalProjects: [
      { key: 'DEMO', name: 'Демопроект' },
      { key: 'DEMOClone', name: 'Clone of Демопроект' },
    ],
    _activeProjectKey: 'DEMOClone',
  });
  gm.call('_renderProjectPicker');
  const wrap = document.getElementById('globalProjectPicker');
  const sel = document.getElementById('globalProjectSelect');
  const options = Array.prototype.map.call(sel.options, function (o) {
    return { value: o.value, text: o.textContent, i18n: o.getAttribute('data-i18n') };
  });
  checkJsonSnapshot('project-nav-renderProjectPicker', {
    wrapHidden: wrap.classList.contains('hidden'),
    selClass: sel.className,
    options: options,
    selectedValue: sel.value,
  });
});

test('_setPickerValue — выставляет select.value (или \'\' при null)', () => {
  const { gm, document } = createHost();
  gm.set({ _globalProjects: [{ key: 'DEMO', name: 'D' }], _activeProjectKey: 'DEMO' });
  gm.call('_renderProjectPicker');
  gm.call('_setPickerValue', 'DEMO');
  assert.strictEqual(document.getElementById('globalProjectSelect').value, 'DEMO');
  gm.call('_setPickerValue', null);
  assert.strictEqual(document.getElementById('globalProjectSelect').value, '');
});

/* ════════════════════ _setGlobalBanner ════════════════════ */

test('_setGlobalBanner — textKey → текст+visible; null → hidden; {key}-replace', () => {
  const { gm, document } = createHost();
  const b = document.getElementById('globalNoProjectBanner');
  gm.call('_setGlobalBanner', 'globalPickPrompt');
  const shown = { text: b.textContent, hidden: b.classList.contains('hidden') };
  gm.call('_setGlobalBanner', 'noAccessToProject', 'SECRET');   // #36 — {key}-подстановка
  const withKey = { text: b.textContent, hidden: b.classList.contains('hidden') };
  gm.call('_setGlobalBanner', null);
  const cleared = { text: b.textContent, hidden: b.classList.contains('hidden') };
  checkJsonSnapshot('project-nav-setGlobalBanner', { shown: shown, withKey: withKey, cleared: cleared });
});

/* ════════════════════ _applyActiveProject ════════════════════ */

test('_applyActiveProject — стейт (_activeProjectKey/_projectDisplayName) + picker + last-key + хуки', () => {
  const { gm, document, window } = createHost();
  gm.set({
    _globalProjects: [{ key: 'DEMOClone', name: 'Clone of Демопроект' }],
    _activeProjectKey: null,
    _projectDisplayName: '',
  });
  gm.call('_renderProjectPicker');
  const hooks = [];
  gm.set({
    _updateProjectNameLabel: function () { hooks.push('nameLabel'); },
    _syncStateToUrl: function () { hooks.push('syncUrl'); },
  });
  gm.call('_applyActiveProject', 'DEMOClone');
  checkJsonSnapshot('project-nav-applyActiveProject', {
    activeProjectKey: gm.get('_activeProjectKey'),
    projectDisplayName: gm.get('_projectDisplayName'),
    pickerValue: document.getElementById('globalProjectSelect').value,
    lastKeyLs: window.localStorage.getItem('ssp_last_project_key'),
    hooks: hooks,
  });
});

test('_applyActiveProject — неизвестный ключ: display-name = key (fallback)', () => {
  const { gm } = createHost();
  gm.set({ _globalProjects: [{ key: 'DEMO', name: 'Демо' }], _activeProjectKey: null, _projectDisplayName: '' });
  gm.set({ _updateProjectNameLabel: function () {}, _syncStateToUrl: function () {} });
  gm.call('_applyActiveProject', 'GHOST');
  assert.strictEqual(gm.get('_projectDisplayName'), 'GHOST');
});

/* ════════════════════ _initGlobalProjectSelection — ветки резолва ════════════════════ */

/** Подготовка _initGlobalProjectSelection: share-params + список проектов + recorder load. */
function primeInit(gm, opts) {
  opts = opts || {};
  gm.set({
    _urlSyncEnabled: true,            // должен сброситься в false на входе
    _pendingShareParams: null,
    _globalProjects: [],
    _activeProjectKey: null,
    _readShareParams: function () { return Promise.resolve(opts.share || {}); },
    _updateProjectNameLabel: function () {},
    _syncStateToUrl: function () {},
  });
  const loadLog = [];
  gm.set({ _loadAndRenderProject: function () { loadLog.push('load'); return Promise.resolve(); } });
  stubHost(gm, function () { return Promise.resolve(opts.adminProjects || []); });
  stubApi(gm, {}, { 'filter-planner-projects': { projects: opts.projects || [] } });
  return loadLog;
}

/** Прогон _initGlobalProjectSelection: ловит NO_PROJECT_SENTINEL, возвращает {threw,sentinel}. */
async function runInit(gm) {
  let threw = false, sentinel = false;
  await gm.call('_initGlobalProjectSelection').catch(function (e) {
    threw = true;
    sentinel = (e === gm.get('_NO_PROJECT_SENTINEL'));
  });
  await settle();
  return { threw: threw, sentinel: sentinel };
}

test('_initGlobalProjectSelection — нет проектов: banner globalNoProjects + throw SENTINEL', async () => {
  const { gm, document } = createHost();
  const loadLog = primeInit(gm, { adminProjects: [], projects: [] });
  const r = await runInit(gm);
  checkJsonSnapshot('project-nav-init-noProjects', {
    threw: r.threw, sentinel: r.sentinel,
    urlSyncReset: gm.get('_urlSyncEnabled'),
    banner: document.getElementById('globalNoProjectBanner').textContent,
    loadCalled: loadLog.length,
  });
});

/* issue #28 — регресс: в global-режиме без выбранного проекта applyI18N ДОЛЖЕН вызваться
   (иначе статические [data-i18n] шапки/сайдбара остаются на RU-дефолтах index.html, а язык-
   селектор — без обработчика). Ранее applyI18N жил только в _loadAndRenderProject, недостижимом
   до выбора проекта → баг «Setting EN language has no effect» (GitHub #28). */
test('issue #28 — global no-project: applyI18N + langSel populate вызваны до NO_PROJECT_SENTINEL', async () => {
  const { gm } = createHost();
  const i18nCalls = [];
  primeInit(gm, { adminProjects: [], projects: [] });
  gm.set({
    applyI18N: function () { i18nCalls.push('applyI18N'); },
    _populateLangSelect: function () { i18nCalls.push('populateLangSelect'); },
  });
  const r = await runInit(gm);
  assert.strictEqual(r.sentinel, true, 'нет проектов → NO_PROJECT_SENTINEL');
  assert.ok(i18nCalls.indexOf('applyI18N') >= 0,
    'applyI18N должен вызваться в global-no-project (локализация статики шапки/сайдбара) — issue #28');
  assert.ok(i18nCalls.indexOf('populateLangSelect') >= 0,
    'язык-селектор шапки должен заполняться в global-no-project — issue #28');
});

/* issue #28 — тот же инвариант для ветки «несколько проектов без last-used» (globalPickPrompt):
   applyI18N до throw, иначе экран выбора проекта тоже был бы полу-русским. */
test('issue #28 — global pick-prompt: applyI18N вызван до NO_PROJECT_SENTINEL', async () => {
  const { gm } = createHost();
  const i18nCalls = [];
  primeInit(gm, {
    adminProjects: [{ shortName: 'A', archived: false }, { shortName: 'B', archived: false }],
    projects: [{ key: 'A', name: 'Project A' }, { key: 'B', name: 'Project B' }],
  });
  gm.set({ applyI18N: function () { i18nCalls.push('applyI18N'); } });
  const r = await runInit(gm);
  assert.strictEqual(r.sentinel, true, 'несколько без last → NO_PROJECT_SENTINEL');
  assert.ok(i18nCalls.indexOf('applyI18N') >= 0, 'applyI18N до pick-prompt throw — issue #28');
});

test('_initGlobalProjectSelection — share.projectKey valid: apply + load (приоритет над last)', async () => {
  const { gm } = createHost();
  const loadLog = primeInit(gm, {
    share: { projectKey: 'DEMOClone' },
    adminProjects: [{ shortName: 'DEMO', archived: false }, { shortName: 'DEMOClone', archived: false }],
    projects: [{ key: 'DEMO', name: 'Демо' }, { key: 'DEMOClone', name: 'Clone' }],
  });
  const r = await runInit(gm);
  assert.strictEqual(r.threw, false, 'успешный резолв — без throw');
  assert.strictEqual(gm.get('_activeProjectKey'), 'DEMOClone');
  assert.strictEqual(loadLog.length, 1, '_loadAndRenderProject вызван');
});

test('_initGlobalProjectSelection — share.projectKey недоступен: banner noAccessToProject + throw', async () => {
  const { gm, document } = createHost();
  const loadLog = primeInit(gm, {
    share: { projectKey: 'FORBIDDEN' },
    adminProjects: [{ shortName: 'DEMO', archived: false }],
    projects: [{ key: 'DEMO', name: 'Демо' }],
  });
  const r = await runInit(gm);
  assert.strictEqual(r.sentinel, true);
  assert.strictEqual(loadLog.length, 0, 'load не вызван');
  assert.ok(/FORBIDDEN/.test(document.getElementById('globalNoProjectBanner').textContent), '{key} подставлен в banner');
  assert.strictEqual(gm.get('_pendingShareParams'), null, 'share-params очищены');
});

test('_initGlobalProjectSelection — last-used valid: apply(last) + load', async () => {
  const { gm, window } = createHost();
  window.localStorage.setItem('ssp_last_project_key', 'DEMOClone');
  const loadLog = primeInit(gm, {
    adminProjects: [{ shortName: 'DEMO', archived: false }, { shortName: 'DEMOClone', archived: false }],
    projects: [{ key: 'DEMO', name: 'Демо' }, { key: 'DEMOClone', name: 'Clone' }],
  });
  const r = await runInit(gm);
  assert.strictEqual(r.threw, false);
  assert.strictEqual(gm.get('_activeProjectKey'), 'DEMOClone', 'last-used применён');
  assert.strictEqual(loadLog.length, 1);
});

/* #58-10 — srcdoc-песочница: localStorage мёртв (SecurityError), host.navigation на
   YT 2025.3 отсутствует → полный reload страницы переживает только серверный last-used
   (backend-global/last-project, User.extensionProperties). Порядок: safeLs → сервер. */
test('_initGlobalProjectSelection — #58-10 server last-project (LS пуст): apply + load', async () => {
  const { gm } = createHost();
  const loadLog = primeInit(gm, {
    adminProjects: [{ shortName: 'SRVA', archived: false }, { shortName: 'SRVB', archived: false }],
    projects: [{ key: 'SRVA', name: 'Server A' }, { key: 'SRVB', name: 'Server B' }],
  });
  stubApi(gm,
    { 'last-project': { success: true, projectKey: 'SRVB' } },
    { 'filter-planner-projects': { projects: [{ key: 'SRVA', name: 'Server A' }, { key: 'SRVB', name: 'Server B' }] } });
  const r = await runInit(gm);
  assert.strictEqual(r.threw, false, 'server-last резолвит проект без prompt');
  assert.strictEqual(gm.get('_activeProjectKey'), 'SRVB', 'серверный last-project применён');
  assert.strictEqual(loadLog.length, 1);
});

test('_initGlobalProjectSelection — #58-10 LS приоритетнее server last-project', async () => {
  const { gm, window } = createHost();
  window.localStorage.setItem('ssp_last_project_key', 'SRVA');
  const loadLog = primeInit(gm, {
    adminProjects: [{ shortName: 'SRVA', archived: false }, { shortName: 'SRVB', archived: false }],
    projects: [{ key: 'SRVA', name: 'Server A' }, { key: 'SRVB', name: 'Server B' }],
  });
  stubApi(gm,
    { 'last-project': { success: true, projectKey: 'SRVB' } },
    { 'filter-planner-projects': { projects: [{ key: 'SRVA', name: 'Server A' }, { key: 'SRVB', name: 'Server B' }] } });
  const r = await runInit(gm);
  assert.strictEqual(r.threw, false);
  assert.strictEqual(gm.get('_activeProjectKey'), 'SRVA', 'safeLs-кандидат первым');
  assert.strictEqual(loadLog.length, 1);
});

test('_initGlobalProjectSelection — #58-10 server last вне списка: prompt (значение игнорируется)', async () => {
  const { gm } = createHost();
  const loadLog = primeInit(gm, {
    adminProjects: [{ shortName: 'SRVA', archived: false }, { shortName: 'SRVB', archived: false }],
    projects: [{ key: 'SRVA', name: 'Server A' }, { key: 'SRVB', name: 'Server B' }],
  });
  stubApi(gm,
    { 'last-project': { success: true, projectKey: 'GONE' } },
    { 'filter-planner-projects': { projects: [{ key: 'SRVA', name: 'Server A' }, { key: 'SRVB', name: 'Server B' }] } });
  const r = await runInit(gm);
  assert.strictEqual(r.sentinel, true, 'недоступный серверный ключ → prompt');
  assert.strictEqual(loadLog.length, 0);
});

test('_initGlobalProjectSelection — единственный проект: авто-выбор + load', async () => {
  const { gm } = createHost();
  const loadLog = primeInit(gm, {
    adminProjects: [{ shortName: 'SOLO', archived: false }],
    projects: [{ key: 'SOLO', name: 'Единственный' }],
  });
  const r = await runInit(gm);
  assert.strictEqual(r.threw, false);
  assert.strictEqual(gm.get('_activeProjectKey'), 'SOLO');
  assert.strictEqual(loadLog.length, 1);
});

test('_initGlobalProjectSelection — несколько без last: banner globalPickPrompt + throw', async () => {
  const { gm, document } = createHost();
  const loadLog = primeInit(gm, {
    adminProjects: [{ shortName: 'A', archived: false }, { shortName: 'B', archived: false }],
    projects: [{ key: 'A', name: 'Project A' }, { key: 'B', name: 'Project B' }],
  });
  const r = await runInit(gm);
  assert.strictEqual(r.sentinel, true);
  assert.strictEqual(loadLog.length, 0);
  assert.ok(document.getElementById('globalNoProjectBanner').textContent.length > 0, 'prompt-banner показан');
});

/* ════════════════════ _onProjectPicked / _switchToProject ════════════════════ */

test('_onProjectPicked — тот же ключ: no-op', () => {
  const { gm } = createHost();
  let switched = false;
  gm.set({ _activeProjectKey: 'DEMO', _draftIsDirty: function () { switched = true; return false; } });
  gm.call('_onProjectPicked', 'DEMO');
  assert.strictEqual(switched, false, '_draftIsDirty даже не опрошен при том же ключе');
});

test('_onProjectPicked — чистый черновик: прямой _switchToProject (reset+apply+load)', async () => {
  const { gm } = createHost();
  gm.set({
    _activeProjectKey: 'DEMO',
    _globalProjects: [{ key: 'DEMOClone', name: 'Clone' }],
    _draftIsDirty: function () { return false; },
    _updateProjectNameLabel: function () {}, _syncStateToUrl: function () {},
  });
  const log = [];
  gm.set({
    _resetProjectStateCaches: function () { log.push('reset'); },
    _loadAndRenderProject: function () { log.push('load'); return Promise.resolve(); },
  });
  gm.call('_onProjectPicked', 'DEMOClone');
  await settle();
  checkJsonSnapshot('project-nav-onProjectPicked-clean', {
    order: log,
    activeProjectKey: gm.get('_activeProjectKey'),
  });
});

test('_onProjectPicked — грязный черновик: confirm-модалка (openModal), switch отложен', () => {
  const { gm } = createHost();
  const modalSpecs = [];
  gm.set({
    _activeProjectKey: 'DEMO',
    _draftIsDirty: function () { return true; },
    openModal: function (spec) { modalSpecs.push({ id: spec.id, type: spec.type, buttons: spec.buttons.map(function (b) { return b.id; }) }); },
    _resetProjectStateCaches: function () { modalSpecs.push('reset'); },
    _loadAndRenderProject: function () { modalSpecs.push('load'); return Promise.resolve(); },
  });
  gm.call('_onProjectPicked', 'DEMOClone');
  checkJsonSnapshot('project-nav-onProjectPicked-dirty', { specs: modalSpecs });
});

test('_switchToProject — reset → applyActiveProject → banner-clear → load', async () => {
  const { gm, document } = createHost();
  gm.set({
    _globalProjects: [{ key: 'DEMOClone', name: 'Clone' }],
    _activeProjectKey: 'DEMO',
    _updateProjectNameLabel: function () {}, _syncStateToUrl: function () {},
  });
  const log = [];
  gm.set({
    _resetProjectStateCaches: function () { log.push('reset'); },
    _loadAndRenderProject: function () { log.push('load'); return Promise.resolve(); },
  });
  document.getElementById('globalNoProjectBanner').classList.remove('hidden');
  gm.call('_switchToProject', 'DEMOClone');
  await settle();
  checkJsonSnapshot('project-nav-switchToProject', {
    order: log,
    activeProjectKey: gm.get('_activeProjectKey'),
    bannerHidden: document.getElementById('globalNoProjectBanner').classList.contains('hidden'),
  });
});

/* ════════════════════ _confirmDiscardAndSwitch ════════════════════ */

test('_confirmDiscardAndSwitch — Ring openModal: confirm → onConfirm; cancel → onCancel', () => {
  const { gm } = createHost();
  let captured = null;
  gm.set({ openModal: function (spec) { captured = spec; } });
  let decided = '';
  gm.call('_confirmDiscardAndSwitch', function () { decided = 'confirm'; }, function () { decided = 'cancel'; });
  // эмулируем клик «подтвердить»
  const okBtn = captured.buttons.filter(function (b) { return b.id === 'ok'; })[0];
  okBtn.onClick({ close: function () {} });
  checkJsonSnapshot('project-nav-confirmDiscard', {
    modalId: captured.id,
    type: captured.type,
    buttonIds: captured.buttons.map(function (b) { return b.id; }),
    dismissOnBackdrop: captured.dismissOnBackdrop,
    decidedAfterOk: decided,
  });
});

/* Закрытие модалки БЕЗ решения (крестик, Escape — blockEscape:false) обязано быть отменой:
   иначе пикер остался бы на новом проекте, а данные — на прежнем (разбор 2026-08-28). */
test('_confirmDiscardAndSwitch — onClose без решения = отмена (крестик/Escape)', () => {
  const { gm } = createHost();
  let captured = null;
  gm.set({ openModal: function (spec) { captured = spec; } });
  let decided = '';
  gm.call('_confirmDiscardAndSwitch', function () { decided = 'confirm'; }, function () { decided = 'cancel'; });
  assert.strictEqual(captured.showCloseButton, true, 'крестик есть — значит выход без кнопок возможен');
  assert.strictEqual(captured.blockEscape, false, 'Escape закрывает — тот же выход');
  captured.onClose();
  assert.strictEqual(decided, 'cancel', 'закрытие без решения откатывает выбор проекта');

  /* А после решения onClose повторно отменять НЕ должен (иначе откат затрёт удачный switch). */
  let decided2 = '';
  gm.call('_confirmDiscardAndSwitch', function () { decided2 = 'confirm'; }, function () { decided2 = 'cancel'; });
  captured.buttons.filter(function (b) { return b.id === 'ok'; })[0].onClick({ close: function () {} });
  captured.onClose();
  assert.strictEqual(decided2, 'confirm', 'подтверждение не перебивается закрытием');
});

/* ════════════════════ project-mode: _loadSettingsOnly ════════════════════ */

test('_loadSettingsOnly — apiGet sprint-data → _settings; reject → стейт цел', async () => {
  const { gm } = createHost();
  gm.set({ _settings: { sentinel: 'KEEP' } });
  stubApi(gm, { 'sprint-data': { settings: { activeRoles: ['analysis'] } } }, {});
  await gm.call('_loadSettingsOnly');
  await settle();
  assert.strictEqual(JSON.stringify(gm.get('_settings')), JSON.stringify({ activeRoles: ['analysis'] }));

  gm.set({ _settings: { sentinel: 'KEEP2' } });
  stubApi(gm, { 'sprint-data': new Error('down') }, {});
  await gm.call('_loadSettingsOnly');
  await settle();
  assert.strictEqual(gm.get('_settings').sentinel, 'KEEP2', 'reject не трогает _settings');
});

/* ════════════════════ project-mode: _mountProjectSettings ════════════════════ */

test('_mountProjectSettings — mountInline(settingsForm) + readonly-toggle по правам', () => {
  const { gm, document, window } = createHost();
  const mountLog = [];
  window.__SSP_RING_MODAL.mountInline = function (host, name, props) {
    mountLog.push({ name: name, hasProps: !!props });
  };
  gm.set({ _buildSettingsFormProps: function () { return { stub: true }; } });
  // canManage=true, configured=true → НЕ readonly
  gm.call('_mountProjectSettings', true, true);
  const host = document.getElementById('projectSettingsHost');
  const editable = host.classList.contains('ssp-settings-readonly');
  // canManage=false → readonly
  gm.call('_mountProjectSettings', false, true);
  const ro = host.classList.contains('ssp-settings-readonly');
  checkJsonSnapshot('project-nav-mountProjectSettings', {
    mountLog: mountLog,
    readonlyWhenManager: editable,
    readonlyWhenNotManager: ro,
  });
});

test('_mountProjectSettings — нет RING_MODAL: hint-текст, без mount', () => {
  const { gm, document, window } = createHost();
  window.__SSP_RING_MODAL = null;
  const host = document.getElementById('projectSettingsHost');
  gm.call('_mountProjectSettings', true, true);
  assert.ok(host.textContent.length > 0, 'fallback hint выставлен');
});

/* ════════════════════ project-mode: _renderProjectSettingsPage ════════════════════ */

test('_renderProjectSettingsPage — loaders + check-settings-manager → body-mode + banner + mount', async () => {
  const { gm, document, window } = createHost();
  const calls = [];
  gm.set({
    loadProjectFields: function () { calls.push('fields'); return Promise.resolve(); },
    loadProjectGroups: function () { calls.push('groups'); return Promise.resolve(); },
    _populateLangSelect: function () {}, setLang: function () {}, applyI18N: function () { calls.push('i18n'); },
    applyIcons: function () {}, applyRingTheme: function () {}, _loadAppVersion: function () {},
    _buildSettingsFormProps: function () { return {}; },
  });
  stubApi(gm, { 'sprint-data': { settings: {} }, 'check-settings-manager': { canManage: true, configured: true } }, {});
  const mountLog = [];
  window.__SSP_RING_MODAL.mountInline = function (host, name) { mountLog.push(name); };
  await gm.call('_renderProjectSettingsPage');
  await settle(6);
  checkJsonSnapshot('project-nav-renderProjectSettingsPage', {
    bodyMode: document.body.classList.contains('ssp-project-settings-mode'),
    bannerShown: !document.getElementById('projectSettingsBanner').classList.contains('hidden'),
    loadersCalled: calls.sort(),
    mountInline: mountLog,
  });
});

/* #97 хвост — селектор не врёт, пока висит вопрос о черновике. Нативный <select>
   переключается сам, до обработчика: раньше он показывал новый проект всё время,
   пока модалка ждала ответа, а данные оставались от прежнего. Именно это в разборе
   2026-08-28 было принято за «расхождение при смене проекта». */
test('#97: грязный черновик — селектор откатывается на время вопроса, новое значение только после подтверждения', () => {
  const { gm, document } = createHost();
  let confirmBtn = null;
  gm.set({
    _activeProjectKey: 'DEMO',
    _globalProjects: [{ key: 'DEMO', name: 'Демопроект' }, { key: 'DEMOClone', name: 'Clone' }],
    _draftIsDirty: function () { return true; },
    _updateProjectNameLabel: function () {}, _syncStateToUrl: function () {},
    _resetProjectStateCaches: function () {},
    _loadAndRenderProject: function () { return Promise.resolve(); },
    openModal: function (spec) { confirmBtn = spec.buttons.filter(function (b) { return b.id === 'ok'; })[0]; },
  });
  gm.call('_renderProjectPicker');
  const sel = document.getElementById('globalProjectSelect');
  sel.value = 'DEMOClone';                       /* браузер уже переключил значение сам */

  gm.call('_onProjectPicked', 'DEMOClone');
  assert.strictEqual(sel.value, 'DEMO', 'пока вопрос не решён, селектор показывает открытый проект');

  confirmBtn.onClick({ close: function () {} });
  assert.strictEqual(sel.value, 'DEMOClone', 'после подтверждения селектор переезжает на новый проект');
  assert.strictEqual(gm.get('_activeProjectKey'), 'DEMOClone');
});
