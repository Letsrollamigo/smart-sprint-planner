/**
 * Golden-master: permissions-кластер (E4) + share/URL-цепочка #36 (E5) —
 * контракты сняты ДО выноса (Фаза 5 слайс 2) через выживающие entry-points:
 * делегаторы монолита (checkValidatorNow/checkValidator/checkEditorRights/
 * checkAssignerRights/checkSettingsManager/_startPermissionsCheck/
 * applyEditorRightsToUI; _buildShareHref/_syncStateToUrl/_readShareParams/
 * _validSprintId/_onShareClick/_applyShareFocus) и стейт-флаги монолита
 * (gm.get/gm.set — флаги остаются в стейт-ядре и после выноса).
 *
 * Backend НЕ ходим: _backendCall подменяется recording-стабом через gm.set
 * (после выноса деps-фабрика читает closure в момент вызова — стаб
 * подхватывается, паттерн recording-тоста слайса 1). Навигация хоста (#36) —
 * recording-стаб _host.navigation; SHARE_URL_PURE — настоящий модуль.
 *
 * ⚠️ Снапшоты share-href-contract/share-onclick-contract фиксируют per-fork
 * _SHARE_APP_PATH (DIFF_MAP §9): путь различается именем приложения —
 * зеркалятся sed-заменой имени приложения ДО namespace-префиксов.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHost } = require('./monolith-host');
const { checkJsonSnapshot } = require('./snap');

const flush = () => new Promise((r) => setTimeout(r, 0));

/** Recording-стаб _backendCall: лог {path, method} + ответы по карте.
 *  Значение REJECT в карте → Promise.reject (fallback-ветки .catch). */
const REJECT = { reject: true };
function stubBackend(gm, responses) {
  const log = [];
  gm.set({
    _backendCall: function (path, baseOpts) {
      log.push({ path: path, method: (baseOpts && baseOpts.method) || null });
      const r = responses[path];
      if (r === REJECT) return Promise.reject(new Error('gm-backend-reject'));
      return Promise.resolve(r !== undefined ? r : {});
    },
  });
  return log;
}

/** Recording-стаб diag (как в bridges.golden.test.js). */
function recordDiag(gm) {
  const entries = [];
  gm.set({ diag: function (msg, level) { entries.push({ msg: msg, level: level || null }); } });
  return entries;
}

/* ═══════════════════ E4 — permissions-кластер ═══════════════════ */

test('golden: permissions — checkValidatorNow/checkSettingsManager: эндпоинты, маппинг, fallback', async () => {
  const { gm } = createHost();
  const diagLog = recordDiag(gm);
  const log = stubBackend(gm, {
    'check-validator': { isValidator: true },
    'check-settings-manager': { canManage: true, groupName: 'Админы планера' },
  });
  const okValidator = await gm.call('checkValidatorNow');
  const okManager = await gm.call('checkSettingsManager');
  /* пустой ответ → false; reject → false (catch-fallback «запрещаем») */
  stubBackend(gm, { 'check-validator': {}, 'check-settings-manager': REJECT });
  const emptyValidator = await gm.call('checkValidatorNow');
  const rejManager = await gm.call('checkSettingsManager');
  checkJsonSnapshot('perm-checknow-contract', {
    backend: log,
    results: { okValidator, okManager, emptyValidator, rejManager },
    diag: diagLog,
  });
});

test('golden: permissions — wrapper\'ы check*: флаги стейта, diag-след, body-класс', async () => {
  const { gm, document } = createHost();
  const diagLog = recordDiag(gm);
  stubBackend(gm, {
    'check-validator': { isValidator: true },
    'check-editor': { isEditor: false },
    'check-assigner': { isAssigner: true },
  });
  gm.call('checkValidator');
  gm.call('checkEditorRights');
  gm.call('checkAssignerRights');
  await flush();
  checkJsonSnapshot('perm-wrappers-contract', {
    flags: {
      isValidator: gm.get('_isValidator'),
      isEditor: gm.get('_isEditor'),
      isAssigner: gm.get('_isAssigner'),
    },
    /* assigner-rights класс: editor=false OR assigner=true → есть */
    bodyHasAssignerRights: document.body.classList.contains('has-assigner-rights'),
    diag: diagLog,
  });
});

test('golden: permissions — _startPermissionsCheck: батч 3 GET, синглтон-кэш промиса', async () => {
  const { gm, document } = createHost();
  const log = stubBackend(gm, {
    'check-validator': { isValidator: true },
    'check-editor': { isEditor: true },
    'check-assigner': { isAssigner: false },
  });
  const p1 = gm.call('_startPermissionsCheck');
  const p2 = gm.call('_startPermissionsCheck'); /* повторный вызов до resolve */
  await p1;
  const callsAfterSettle = log.length;
  const p3 = gm.call('_startPermissionsCheck'); /* и после resolve — тот же кэш */
  await flush();
  checkJsonSnapshot('perm-singleton-contract', {
    backend: log,
    samePromiseWhilePending: p1 === p2,
    samePromiseAfterResolve: p1 === p3,
    callsAfterSettle: callsAfterSettle,
    callsAfterThird: log.length,
    flags: {
      isValidator: gm.get('_isValidator'),
      isEditor: gm.get('_isEditor'),
      isAssigner: gm.get('_isAssigner'),
    },
    bodyHasAssignerRights: document.body.classList.contains('has-assigner-rights'),
  });
});

/** Фикстура панели прав: expanded-карточка роли с кнопками всех 5 классов. */
function rightsPanelFixture(document, roleKey) {
  const card = document.createElement('div');
  card.className = 'planning-role-card expanded';
  card.setAttribute('data-role-key', roleKey);
  card.innerHTML =
    '<div class="planning-role-body">' +
    '<button class="editor-btn">e</button>' +
    '<button class="validate-btn">v</button>' +
    '<button class="new-sprint-btn">n</button>' +
    '<button class="save-header-btn">s</button>' +
    '<input class="assigner-btn">' +
    '</div>';
  document.getElementById('tab-planning').appendChild(card);
  return card;
}

function captureBtn(el) {
  return {
    cls: el.className,
    tooltip: el.getAttribute('data-tooltip'),
    disabled: !!el.disabled,
    readOnly: el.readOnly === undefined ? null : !!el.readOnly,
  };
}

function capturePanel(card) {
  const out = {};
  ['editor-btn', 'validate-btn', 'new-sprint-btn', 'save-header-btn', 'assigner-btn'].forEach(function (cls) {
    out[cls] = captureBtn(card.querySelector('.' + cls));
  });
  return out;
}

test('golden: permissions — applyEditorRightsToUI: матрица прав на панели активной роли', () => {
  const { gm, document } = createHost();
  const card = rightsPanelFixture(document, 'dev');
  gm.set({ _activeSubtab: 'dev' });
  const matrix = {};
  [
    ['none', false, false, false],
    ['editorOnly', true, false, false],
    ['validatorOnly', false, true, false],
    ['assignerOnly', false, false, true],
    ['editorPlusAssigner', true, false, true],
  ].forEach(function (combo) {
    gm.set({ _isEditor: combo[1], _isValidator: combo[2], _isAssigner: combo[3] });
    gm.call('applyEditorRightsToUI');
    matrix[combo[0]] = capturePanel(card);
  });
  checkJsonSnapshot('perm-apply-matrix', matrix);
});

test('golden: permissions — applyEditorRightsToUI: разрешение панели и fallback-путь', () => {
  const { gm, document } = createHost();
  /* Кнопка ВНЕ панелей (в body) — не должна затрагиваться, пока панель находится. */
  const outside = document.createElement('button');
  outside.className = 'editor-btn';
  document.body.appendChild(outside);
  /* Overlay-ветка: не-settings overlay обрабатывается, settings-overlay — нет. */
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = '<button class="editor-btn">o</button>';
  document.body.appendChild(ov);
  const settingsOv = document.createElement('div');
  settingsOv.className = 'overlay settings-overlay';
  settingsOv.innerHTML = '<button class="editor-btn">so</button>';
  document.body.appendChild(settingsOv);

  gm.set({ _isEditor: false, _isValidator: false, _isAssigner: false });

  /* (а) активный сабтаб с expanded-карточкой → применяется к телу карточки + overlay */
  const card = rightsPanelFixture(document, 'qa');
  gm.set({ _activeSubtab: 'qa' });
  gm.call('applyEditorRightsToUI');
  const viaCard = {
    cardEditor: captureBtn(card.querySelector('.editor-btn')),
    outside: captureBtn(outside),
    overlay: captureBtn(ov.querySelector('.editor-btn')),
    settingsOverlay: captureBtn(settingsOv.querySelector('.editor-btn')),
  };

  /* (б) карточки нет → #planningPeopleContent */
  card.remove();
  const ppl = document.getElementById('planningPeopleContent');
  ppl.innerHTML = '<button class="editor-btn">p</button>';
  gm.call('applyEditorRightsToUI');
  const viaPeople = {
    people: captureBtn(ppl.querySelector('.editor-btn')),
    outside: captureBtn(outside),
  };

  /* (в) нет и его → fallback на #tab-planning + #tab-gantt */
  ppl.remove();
  const inPlanning = document.createElement('button');
  inPlanning.className = 'validate-btn';
  document.getElementById('tab-planning').appendChild(inPlanning);
  const inGantt = document.createElement('button');
  inGantt.className = 'editor-btn';
  document.getElementById('tab-gantt').appendChild(inGantt);
  gm.call('applyEditorRightsToUI');
  const viaFallback = {
    planningValidate: captureBtn(inPlanning),
    ganttEditor: captureBtn(inGantt),
    outside: captureBtn(outside),
  };

  checkJsonSnapshot('perm-apply-panel-resolution', {
    viaCard: viaCard, viaPeople: viaPeople, viaFallback: viaFallback,
  });
});

/* ═══════════════════ E5 — share/URL-цепочка #36 ═══════════════════ */

/** Recording-стаб навигации хоста (#36): getAppLocation/replaceAppLocation. */
function stubNav(gm, search) {
  const log = { replace: [] };
  gm.set({
    _host: {
      navigation: {
        getAppLocation: function () { return { search: search || '' }; },
        replaceAppLocation: function (loc) { log.replace.push(loc); },
      },
    },
  });
  return log;
}

/** Фикстура дерева global-рельса с активным узлом. */
function treeFixture(document, activeNode) {
  const tree = document.createElement('div');
  tree.className = 'ssp-tree';
  tree.innerHTML =
    '<div data-node="dash">d</div>' +
    '<div data-node="' + activeNode + '" class="active">a</div>';
  document.body.appendChild(tree);
  return tree;
}

test('golden: share — _buildShareHref: app_-префиксация, узел дерева, _SHARE_APP_PATH', () => {
  const { gm, document } = createHost();
  gm.set({ _ytBase: 'http://localhost:8080/', _activeProjectKey: 'DEMOClone', _currentSprintId: 'abc-123' });
  /* узел дерева → внешний dotted-формат (planning-standup → planning.standup) */
  treeFixture(document, 'planning-standup');
  const full = gm.call('_buildShareHref');
  /* неизвестный внутренний узел → node опускается (enum-карта share-url-pure) */
  document.querySelector('.ssp-tree').remove();
  treeFixture(document, 'no-such-node');
  const unknownNode = gm.call('_buildShareHref');
  /* без спринта и узла; и совсем пустое состояние */
  document.querySelector('.ssp-tree').remove();
  gm.set({ _currentSprintId: null });
  const noSprintNoNode = gm.call('_buildShareHref');
  gm.set({ _activeProjectKey: null });
  const empty = gm.call('_buildShareHref');
  checkJsonSnapshot('share-href-contract', {
    full: full, unknownNode: unknownNode, noSprintNoNode: noSprintNoNode, empty: empty,
  });
});

test('golden: share — _syncStateToUrl: гарды urlSync/mode и payload replaceAppLocation', () => {
  const { gm, document } = createHost();
  const log = stubNav(gm);
  gm.set({ _activeProjectKey: 'GM', _currentSprintId: 's-77' });
  treeFixture(document, 'planning-roles');
  /* гард 1: _urlSyncEnabled=false (init-restore) → no-op */
  gm.set({ _urlSyncEnabled: false, _mode: 'global' });
  gm.call('_syncStateToUrl');
  const afterDisabled = log.replace.length;
  /* гард 2: project-mode → no-op */
  gm.set({ _urlSyncEnabled: true, _mode: 'project' });
  gm.call('_syncStateToUrl');
  const afterProjectMode = log.replace.length;
  /* рабочий путь: global + enabled → replaceAppLocation({search}) */
  gm.set({ _mode: 'global' });
  gm.call('_syncStateToUrl');
  checkJsonSnapshot('share-syncurl-contract', {
    afterDisabled: afterDisabled,
    afterProjectMode: afterProjectMode,
    replaceLog: log.replace,
  });
});

test('golden: share — _readShareParams: парсинг search, недоступная навигация → {}', async () => {
  const { gm } = createHost();
  stubNav(gm, '?projectKey=GM&sprintId=s1&node=planning.standup&focus=role:dev');
  const parsed = await gm.call('_readShareParams');
  stubNav(gm, '?node=bogus.node&focus=not-a-focus'); /* невалидные значения опускаются */
  const invalids = await gm.call('_readShareParams');
  gm.set({ _host: {} }); /* навигации нет (YT < 2026.1) */
  const noNav = await gm.call('_readShareParams');
  checkJsonSnapshot('share-readparams-contract', { parsed: parsed, invalids: invalids, noNav: noNav });
});

test('golden: share — _validSprintId: активный спринт + base-UUID истории', () => {
  const { gm } = createHost();
  gm.set({
    _sprint: { sprintId: 'aaa-111' },
    _history: [{ sprintId: 'bbb-222_dev' }, { sprintId: 'ccc-333_qa' }],
  });
  checkJsonSnapshot('share-validsprint-contract', {
    activeMatch: gm.call('_validSprintId', 'aaa-111'),
    historyBaseMatch: gm.call('_validSprintId', 'bbb-222'),
    historyFullNoMatch: gm.call('_validSprintId', 'bbb-222_dev'),
    unknown: gm.call('_validSprintId', 'zzz-999'),
    empty: gm.call('_validSprintId', ''),
  });
});

test('golden: share — _onShareClick: execCommand-путь, тосты ok/err, diag, textarea-cleanup', () => {
  const { gm, document } = createHost();
  gm.set({ _ytBase: 'http://localhost:8080', _activeProjectKey: 'GM', _currentSprintId: 's-1' });
  const toasts = [];
  gm.set({ toast: function (msg, type) { toasts.push({ msg: msg, type: type || null }); } });
  const diagLog = recordDiag(gm);
  /* primary: execCommand('copy') в gesture'е — recording-стаб, текст из textarea */
  const copied = [];
  document.execCommand = function (cmd) {
    copied.push({ cmd: cmd, value: (document.querySelector('textarea[readonly]') || {}).value || null });
    return true;
  };
  gm.call('_onShareClick');
  const afterOk = {
    copied: copied.slice(),
    toasts: toasts.slice(),
    textareaLeft: !!document.querySelector('textarea[readonly]'),
    diagShare: diagLog.filter(function (e) { return e.msg.indexOf('share copy:') === 0; }),
  };
  /* fallback-цепочка: execCommand=false, clipboard недоступен → err-тост */
  toasts.length = 0;
  document.execCommand = function () { return false; };
  gm.call('_onShareClick');
  checkJsonSnapshot('share-onclick-contract', {
    afterOk: afterOk,
    afterFail: { toasts: toasts.slice() },
  });
});

test('golden: share — _applyShareFocus: отложенная подсветка role-фокуса, невалид → no-op', () => {
  const { gm, window, document } = createHost();
  /* Управляемый планировщик: setTimeout → очередь (паттерн стаба таймеров). */
  const timers = [];
  window.setTimeout = function (fn, delay) { timers.push({ fn: fn, delay: delay }); return timers.length; };
  const scrolls = [];
  window.HTMLElement.prototype.scrollIntoView = function (opts) { scrolls.push(opts || null); };
  const card = document.createElement('div');
  card.className = 'planning-role-card';
  card.setAttribute('data-role-key', 'dev');
  document.body.appendChild(card);

  gm.call('_applyShareFocus', 'role:dev');
  const scheduled = timers.map(function (t) { return t.delay; });
  timers.shift().fn(); /* 200мс — поиск, scroll, флеш-класс */
  const afterFind = { classFlash: card.className, scrolls: scrolls.slice(), nextDelays: timers.map(function (t) { return t.delay; }) };
  timers.shift().fn(); /* 1600мс — снятие флеша */
  const afterUnflash = { classFlash: card.className };

  /* невалидный focus → парсер null → таймеры не ставятся */
  gm.call('_applyShareFocus', 'garbage');
  gm.call('_applyShareFocus', '');
  checkJsonSnapshot('share-focus-contract', {
    scheduled: scheduled,
    afterFind: afterFind,
    afterUnflash: afterUnflash,
    timersAfterInvalid: timers.length,
  });
});

/* ═══════════════════ #124 — фокус в ссылке «Поделиться», ожидание цели, страховка 2025.3 ═══════════════════ */

/** Управляемые таймеры + заглушка прокрутки (паттерн share-focus-contract). */
function focusHarness(window) {
  const timers = [];
  window.setTimeout = function (fn, delay) { timers.push({ fn: fn, delay: delay }); return timers.length; };
  window.HTMLElement.prototype.scrollIntoView = function () {};
  return {
    timers: timers,
    runNext: function () { const t = timers.shift(); if (t) t.fn(); return t; },
    /* только тики фокуса (200 мс): «Перейти» открывает вкладку и ставит в очередь чужие таймеры (флаш черновика) */
    runFocusTicks: function () { for (let i = 0; i < 30; i++) { const k = timers.findIndex((t) => t.delay === 200); if (k < 0) return; timers.splice(k, 1)[0].fn(); } },
  };
}

test('golden: share #124 — _applyShareFocus ждёт цель до 25 тиков по 200 мс, по таймауту — no-op', () => {
  const { gm, window, document } = createHost();
  const h = focusHarness(window);
  gm.call('_applyShareFocus', 'role:late');
  assert.equal(document.querySelector('[data-role-key="late"]'), null, 'предусловие: цели ещё нет');
  h.runNext(); h.runNext();
  assert.deepEqual(h.timers.map((t) => t.delay), [200], 'после промаха — ещё один тик 200 мс');
  const card = document.createElement('div');
  card.className = 'planning-role-card';
  card.setAttribute('data-role-key', 'late');
  document.body.appendChild(card);
  h.runNext();
  assert.ok(card.classList.contains('ssp-focus-flash'), 'цель дорисовалась позже — подсвечена');

  h.timers.length = 0;
  gm.call('_applyShareFocus', 'role:never');
  let ticks = 0;
  while (h.timers.length) { h.runNext(); ticks++; }
  assert.equal(ticks, 25, 'ожидание ограничено 25 тиками (5 с)');
});

test('golden: share #124 — фокус на «Ёмкости»: выбор справа через стейт, подсвечены все строки человека', () => {
  const { gm, window, document } = createHost();
  const h = focusHarness(window);
  treeFixture(document, 'capacity');
  const tab = document.getElementById('tab-capacity');
  gm.call('_applyShareFocus', 'user:lk');
  let ui = gm.get('CAPACITY_STORE').getCapacityUiState();
  assert.deepEqual([ui.selectedPerson, ui.viewMode], ['lk', 'person'], 'выбор человека выставлен до отрисовки строк');
  h.runNext();   /* строк ещё нет: данные вкладки грузятся */
  const row = (login) => { const r = document.createElement('div'); r.className = 'ssp-capacity-row'; r.setAttribute('data-login', login); tab.appendChild(r); return r; };
  const rows = [row('lk'), row('oa'), row('lk')];
  h.runNext();
  assert.deepEqual(rows.map((r) => r.classList.contains('ssp-focus-flash')), [true, false, true]);

  h.timers.length = 0;
  gm.call('_applyShareFocus', 'role:an');
  ui = gm.get('CAPACITY_STORE').getCapacityUiState();
  assert.deepEqual([ui.selectedRole, ui.selectedPerson, ui.viewMode, ui.mainView], ['an', null, 'role', 'roles']);
  const sp = document.createElement('div');
  sp.className = 'ssp-capacity-spoiler';
  sp.setAttribute('data-ssp-cap-role', 'an');
  tab.appendChild(sp);
  h.runNext();
  assert.ok(sp.classList.contains('ssp-focus-flash'), 'спойлер роли подсвечен');
});

test('golden: share #124 — release: в «Истории релизов» раскрывает спойлер своей панели, планируемую не трогает', () => {
  const { gm, window, document } = createHost();
  const h = focusHarness(window);
  treeFixture(document, 'release-history');
  const planned = document.getElementById('tab-release-planned');
  planned.innerHTML = '<li class="ssp-release-card" data-ssp-release-id="rel-1"></li>';
  const hist = document.getElementById('tab-release-history');
  hist.innerHTML = '<div class="spoiler" data-ssp-release-id="rel-1"><div class="spoiler__head"></div></div>';
  const sp = hist.firstChild;
  sp.firstChild.addEventListener('click', () => sp.classList.add('open'));
  gm.call('_applyShareFocus', 'release:rel-1');
  h.runNext();
  assert.ok(sp.classList.contains('open'), 'спойлер раскрыт');
  assert.ok(sp.classList.contains('ssp-focus-flash'));
  assert.ok(!planned.firstChild.classList.contains('ssp-focus-flash'), 'карточка другой панели не подсвечена');
});

test('golden: share #124 — _onShareClick(target): фокус и спринт в ссылке, имя цели в тосте; невалидный фокус → общий тост', () => {
  const { gm, document } = createHost();
  gm.set({ _ytBase: 'http://localhost:8080', _activeProjectKey: 'GM', _currentSprintId: 's-1' });
  const toasts = [];
  gm.set({ toast: function (msg) { toasts.push(msg); } });
  const diagLog = recordDiag(gm);
  document.execCommand = function () { return true; };
  const ctrl = gm.get('SHARE_CTRL');
  const hrefs = () => diagLog.filter((e) => e.msg.indexOf('share copy: ') === 0).map((e) => e.msg.slice(12));
  const T = (k) => gm.call('T', k);

  ctrl._onShareClick(gm.call('_shareDeps'), { node: 'release-history', focus: 'release:rel-1', label: 'R-1' });
  ctrl._onShareClick(gm.call('_shareDeps'), { node: 'capacity', sprintId: 's-9', focus: 'user:bad login', label: 'X' });
  treeFixture(document, 'capacity');
  const cu = gm.get('CAPACITY_STORE').getCapacityUiState();
  Object.assign(cu, { selectedSprintId: 's-7', viewMode: 'person', selectedPerson: 'lk' });
  gm.call('_onShareClick');   /* рельс на «Ёмкости» — выбор справа */

  const h = hrefs();
  assert.ok(h[0].includes('app_node=releases.history') && h[0].includes('app_focus=release%3Arel-1') && h[0].includes('app_sprintId=s-1'), h[0]);
  assert.ok(h[1].includes('app_sprintId=s-9') && !h[1].includes('focus'), 'логин вне алфавита — фокус отброшен: ' + h[1]);
  assert.ok(h[2].includes('app_node=capacity') && h[2].includes('app_sprintId=s-7') && h[2].includes('app_focus=user%3Alk'), h[2]);
  assert.deepEqual(toasts, [T('shareCopyOkTarget').replace('{target}', 'R-1'), T('shareCopyOk'), T('shareCopyOkTarget').replace('{target}', 'lk')]);
});

test('golden: share #124 — страховка 2025.3: без host.navigation «Перейти» из напоминаний работает, кнопки ссылки нет', () => {
  const { gm, window, document } = createHost();
  const h = focusHarness(window);
  /* хост 2025.3: fetchApp/fetchYouTrack есть, navigation — нет */
  gm.set({ _host: { fetchApp: function () { return Promise.resolve({}); }, fetchYouTrack: function () { return Promise.resolve({}); } }, _mode: 'global' });
  assert.equal(gm.call('_navAvailable'), false, 'предусловие: навигации нет (YT 2025.3)');
  const tree = document.createElement('div');
  tree.className = 'ssp-tree';
  tree.innerHTML = '<div data-node="history">h</div><div data-node="release-planned">r</div>';
  document.body.appendChild(tree);
  const go = (item) => gm.get('REMINDERS_CTRL').go(item, gm.call('_remindersDeps'));

  /* запись истории спринта: группа и запись раскрываются кликом по шапке */
  const box = document.createElement('div');
  box.innerHTML = '<div class="spoiler" data-ssp-hist-group="g1"><div class="spoiler__head"></div>' +
    '<div class="spoiler" data-ssp-hist-rec="g1_dev"><div class="spoiler__head"></div></div></div>';
  document.body.appendChild(box);
  box.querySelectorAll('.spoiler__head').forEach((hd) => hd.addEventListener('click', () => hd.parentNode.classList.add('open')));
  go({ module: 'sprints', kind: 'sprintOverdue', entityId: 'g1_dev' });
  assert.ok(tree.querySelector('[data-node="history"]').classList.contains('active'), 'узел выставлен до фокуса');
  h.runFocusTicks();
  const rec = box.querySelector('[data-ssp-hist-rec="g1_dev"]');
  assert.ok(rec.classList.contains('open') && rec.classList.contains('ssp-focus-flash'), 'запись истории раскрыта и подсвечена');

  /* планируемый релиз */
  h.timers.length = 0;
  document.getElementById('tab-release-planned').innerHTML = '<li class="ssp-release-card" data-ssp-release-id="rel-9"></li>';
  go({ module: 'releases', entityId: 'rel-9' });
  h.runFocusTicks();
  assert.ok(document.querySelector('#tab-release-planned [data-ssp-release-id="rel-9"]').classList.contains('ssp-focus-flash'), 'карточка релиза подсвечена');

  /* «Скопировать ссылку» на карточках: без навигации — нет; гейт способен открыться */
  assert.equal(gm.call('_releaseDeps').canCopyLink(), false);
  gm.set({ _host: { navigation: { getAppLocation: function () { return Promise.resolve({}); } } } });
  assert.equal(gm.call('_releaseDeps').canCopyLink(), true, 'с навигацией кнопка есть — assert способен упасть');
  gm.set({ _mode: 'project' });
  assert.equal(gm.call('_releaseDeps').canCopyLink(), false, 'в проектном режиме ссылок нет');
});

test('golden: share #124 — узел из body-класса, когда в дереве нет активного узла (старт: «Ёмкость»/«Релизы» ещё не построены)', () => {
  const { gm, window, document } = createHost();
  focusHarness(window);
  gm.set({ _ytBase: 'http://localhost:8080', _activeProjectKey: 'GM', _currentSprintId: 's-1' });
  assert.equal(document.querySelector('.ssp-tree [data-node].active'), null, 'предусловие: активного узла в дереве нет');
  document.body.classList.add('ssp-dashnode-capacity');
  gm.call('_applyShareFocus', 'role:an');
  assert.equal(gm.get('CAPACITY_STORE').getCapacityUiState().selectedRole, 'an', 'фокус ушёл в выбор «Ёмкости»');
  document.body.classList.replace('ssp-dashnode-capacity', 'ssp-dashnode-release-history');
  assert.ok(gm.call('_buildShareHref').includes('app_node=releases.history'), 'узел попал в ссылку');
});
