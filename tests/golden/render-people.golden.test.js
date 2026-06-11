/**
 * Golden-master: рендер уровня «Люди» — таблицы задач и исполнителей
 * текущей роли (devBack на активном спринте) + пустые состояния.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { createHost } = require('./monolith-host');
const { checkHtmlSnapshot, checkJsonSnapshot } = require('./snap');
const { materializeTable } = require('./serialize');
const fx = require('./fixtures/state');

test('golden: renderCurrentRoleTaskTable — devBack активного спринта', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  fx.applyPeopleState(gm);
  gm.call('renderCurrentRoleTaskTable');
  const host = document.getElementById('currentRoleTaskHost');
  const table = materializeTable(host);
  assert.ok(table, 'task table contract must be stashed on currentRoleTaskHost');
  checkJsonSnapshot('people-task-table', table);
});

test('golden: renderCurrentRoleTaskTable — нет выбранной записи (empty)', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  gm.call('renderCurrentRoleTaskTable');
  checkHtmlSnapshot('people-task-table-empty', document.getElementById('currentRoleTaskHost').innerHTML);
});

test('golden: renderCurrentRoleAssigneeTable — ресурсы/остатки исполнителей', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  fx.applyPeopleState(gm);
  gm.call('renderCurrentRoleAssigneeTable');
  const host = document.getElementById('currentRoleAssigneeHost');
  const table = materializeTable(host);
  assert.ok(table, 'assignee table contract must be stashed on currentRoleAssigneeHost');
  checkJsonSnapshot('people-assignee-table', table);
});

test('golden: renderCurrentRoleAssigneeTable — пустой PP (empty)', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  gm.call('renderCurrentRoleAssigneeTable');
  checkHtmlSnapshot('people-assignee-table-empty', document.getElementById('currentRoleAssigneeHost').innerHTML);
});

test('golden: calcAssigneeUsed по исполнителям devBack', () => {
  const { gm } = createHost();
  fx.applyBaseState(gm);
  fx.applyPeopleState(gm);
  const out = {
    gm_user_1: gm.call('calcAssigneeUsed', 'gm_user_1'),
    gm_user_2: gm.call('calcAssigneeUsed', 'gm_user_2'),
    unknown: gm.call('calcAssigneeUsed', 'gm_user_none'),
  };
  checkJsonSnapshot('calc-assignee-used', out);
});

/* ── Добор Тира D слайс 2: непокрытые ветки кластера таблиц текущей роли.
   Все тесты идут только через стабильные точки входа (render*, doCurrentRoleCalc,
   doRecalcResource, updateCurrentRoleTotals, calcAssigneeUsed, host change-события)
   + gm.set стейта/стабов — переживают вынос кластера. ── */

test('golden: renderCurrentRoleTaskTable — полный набор колонок (externalTicket/xpriority/system) + oor + даты из ta', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  fx.applyPeopleState(gm);
  const st = fx.buildSettings();
  st.fieldExternalTicketId = 'External ID';
  st.fieldXPriority = 'XPriority';
  st.fieldSystem = 'System';
  const ri = fx.buildRoleItems();
  /* url-ветка external ticket + xpriority + system */
  ri.devBack[0].externalTicketId = 'https://tracker.example.com/SD-77';
  ri.devBack[0].xpriority = 'Срочный';
  ri.devBack[0].system = 'Платёжный модуль';
  /* plain-ветка external ticket, system отсутствует → '—' */
  ri.devBack[1].externalTicketId = 'SD-123';
  /* третья задача: external ticket отсутствует → '—' */
  ri.devBack.push({
    issueId: 'GM-12', title: 'Задача без внешнего тикета', inclusionStatus: 'INC_PLANNED',
    addedAt: 1779494400000, addedBy: 'gm_user_validator',
    estimate_devBack: 300, fact_devBack: 0, alloc_devBack: 120,
    priority: 'Minor', state: 'Open',
  });
  const pp = fx.buildCurrentRolePP();
  /* GM-10: dateEnd за пределами спринта → oor-warn в title + даты в datepicker */
  pp.taskAssignments['GM-10'].dateStart = fx.DATE_START + 86400000;
  pp.taskAssignments['GM-10'].dateEnd = fx.DATE_END + 2 * 86400000;
  /* GM-11: обе даты в диапазоне */
  pp.taskAssignments['GM-11'].dateStart = fx.DATE_START + 2 * 86400000;
  pp.taskAssignments['GM-11'].dateEnd = fx.DATE_END - 86400000;
  gm.set({ _settings: st, _roleItems: ri, _currentRolePP: pp });
  gm.call('renderCurrentRoleTaskTable');
  const table = materializeTable(document.getElementById('currentRoleTaskHost'));
  assert.ok(table, 'task table contract must be stashed');
  checkJsonSnapshot('people-task-table-fullcols', table);
});

test('golden: renderCurrentRoleTaskTable — все задачи исключены (второй empty-state)', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  fx.applyPeopleState(gm);
  const ri = fx.buildRoleItems();
  ri.devBack.forEach(function (i) { i.inclusionStatus = 'INC_EXCLUDED'; });
  gm.set({ _roleItems: ri });
  gm.call('renderCurrentRoleTaskTable');
  checkHtmlSnapshot('people-task-table-notasks', document.getElementById('currentRoleTaskHost').innerHTML);
});

test('golden: renderCurrentRoleTaskTable — исторический снэпшот (items из записи, не из _roleItems)', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  const rec = fx.buildCurrentRoleRec();
  /* prefix-мисматч с активным _sprint → isActiveSprintRecord=false → rec.items */
  rec.sprintId = 'gm-hist-2026-05_devBack';
  rec.items = [
    {
      issueId: 'GM-H10', title: 'Историческая задача devBack', inclusionStatus: 'INC_PLANNED',
      addedAt: 1779494400000, addedBy: 'gm_user_validator',
      estimate_devBack: 600, fact_devBack: 600, alloc_devBack: 480,
      priority: 'Major', state: 'Fixed',
    },
    {
      issueId: 'GM-H11', title: 'Историческая без alloc', inclusionStatus: 'INC_PLANNED',
      addedAt: 1779494400000, addedBy: 'gm_user_validator',
      estimate_devBack: 900, fact_devBack: 300, alloc_devBack: null,
      priority: 'Normal', state: 'Fixed',
    },
  ];
  const pp = fx.buildCurrentRolePP();
  pp.taskAssignments = { 'GM-H10': { assignee: 'gm_user_1' } };
  gm.set({ _currentSprintRoleRec: rec, _currentRolePP: pp });
  gm.call('renderCurrentRoleTaskTable');
  const table = materializeTable(document.getElementById('currentRoleTaskHost'));
  assert.ok(table, 'task table contract must be stashed');
  checkJsonSnapshot('people-task-table-historical', table);
});

test('golden: renderCurrentRoleTaskTable — активная сортировка по приоритету (порядок + affordance)', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  fx.applyPeopleState(gm);
  const ri = fx.buildRoleItems();
  ri.devBack.push({
    issueId: 'GM-13', title: 'Блокер для сортировки', inclusionStatus: 'INC_PLANNED',
    addedAt: 1779494400000, addedBy: 'gm_user_validator',
    estimate_devBack: 120, fact_devBack: 0, alloc_devBack: 60,
    priority: 'Show-stopper', state: 'Open',
  });
  gm.set({ _roleItems: ri });
  gm.call('setSortKey', 'priority');
  gm.call('renderCurrentRoleTaskTable');
  const table = materializeTable(document.getElementById('currentRoleTaskHost'));
  assert.ok(table, 'task table contract must be stashed');
  checkJsonSnapshot('people-task-table-sorted', {
    sortKey: table.sortKey,
    itemKeys: table.itemKeys,
  });
});

test('golden: renderCurrentRoleAssigneeTable — ручной режим ресурса (manualPersonalResource)', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  fx.applyPeopleState(gm);
  const st = fx.buildSettings();
  st.manualPersonalResource = true;
  gm.set({ _settings: st });
  gm.call('renderCurrentRoleAssigneeTable');
  const table = materializeTable(document.getElementById('currentRoleAssigneeHost'));
  assert.ok(table, 'assignee table contract must be stashed');
  checkJsonSnapshot('people-assignee-table-manual', table);
});

test('golden: renderCurrentRoleAssigneeTable — разбивка по системам (allocByProject: система/__none__/перелимит)', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  fx.applyPeopleState(gm);
  const st = fx.buildSettings();
  st.fieldSystem = 'System';
  st.personalPlanningEnabled = true;
  const ri = fx.buildRoleItems();
  /* GM-10 (gm_user_1, alloc 15ч из 40 → 38%) — именованная система;
     GM-11 (gm_user_2, est 40ч из 16 → 250% → over) — без системы → __none__ */
  ri.devBack[0].system = 'Платёжный модуль';
  gm.set({ _settings: st, _roleItems: ri });
  gm.call('renderCurrentRoleAssigneeTable');
  const table = materializeTable(document.getElementById('currentRoleAssigneeHost'));
  assert.ok(table, 'assignee table contract must be stashed');
  checkJsonSnapshot('people-assignee-table-byproj', table);
});

test('golden: updateCurrentRoleTotals — нет PP / положительный остаток / перелимит', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  const resEl = document.getElementById('currentRoleTotalResource');
  const remEl = document.getElementById('currentRoleTotalRemain');
  function readTotals() {
    return { res: resEl.textContent, rem: remEl.textContent, remColor: remEl.style.color || null };
  }
  /* PP нет → прочерки */
  gm.call('updateCurrentRoleTotals');
  const noPP = readTotals();
  /* фикстурный PP: ресурс 56, used 55 → остаток 1 (success-цвет) */
  fx.applyPeopleState(gm);
  gm.call('updateCurrentRoleTotals');
  const positive = readTotals();
  /* срезаем ресурс gm_user_1 → суммарный остаток отрицательный (error-цвет) */
  const pp = fx.buildCurrentRolePP();
  pp.resourcesByAssignee.gm_user_1.resource = 10;
  gm.set({ _currentRolePP: pp });
  gm.call('updateCurrentRoleTotals');
  const negative = readTotals();
  checkJsonSnapshot('people-totals-contract', { noPP: noPP, positive: positive, negative: negative });
});

test('golden: doRecalcResource — guard пустого списка / пересчёт по грейдам / ручной режим не трогает ресурсы', () => {
  const { gm } = createHost();
  fx.applyBaseState(gm);
  const toasts = [];
  const apiPostLog = [];
  gm.set({
    toast: function (msg, type) { toasts.push([type || 'info', msg]); },
    apiPost: function (path) { apiPostLog.push(path); return Promise.resolve({ success: true }); },
  });
  /* Guard: PP нет → toastAssigneesEmpty, ресурсы не трогаются */
  gm.call('doRecalcResource');
  const guardToasts = toasts.slice();
  /* Пересчёт: nkc 'other' → 145; Senior 0.75 → 108.75; Middle 0.65 → 94.25 */
  fx.applyPeopleState(gm);
  gm.set({ _currentSprintRoleRec: fx.buildCurrentRoleRec() });
  toasts.length = 0;
  gm.call('doRecalcResource');
  const recalc = {
    toasts: toasts.slice(),
    resources: JSON.parse(JSON.stringify(gm.get('_currentRolePP').resourcesByAssignee)),
    nkcKey: gm.get('_currentRolePP').nkcKey,
    calculatedAt: gm.get('_currentRolePP').calculatedAt,
  };
  /* Ручной режим: ресурсы сохраняются, но nkcKey/calculatedAt всё равно обновляются */
  const st = fx.buildSettings();
  st.manualPersonalResource = true;
  gm.set({ _settings: st, _currentRolePP: fx.buildCurrentRolePP() });
  toasts.length = 0;
  gm.call('doRecalcResource');
  const manual = {
    toasts: toasts.slice(),
    resources: JSON.parse(JSON.stringify(gm.get('_currentRolePP').resourcesByAssignee)),
    nkcKey: gm.get('_currentRolePP').nkcKey,
  };
  checkJsonSnapshot('calc-recalc-contract', {
    guardToasts: guardToasts,
    recalc: recalc,
    manual: manual,
    apiPostPaths: apiPostLog,
  });
});

test('golden: doCurrentRoleCalc — ранние выходы (нет записи / нет настроек / нет поля роли)', async () => {
  const { gm } = createHost();
  fx.applyBaseState(gm);
  const toasts = [];
  const apiGetLog = [];
  gm.set({
    toast: function (msg, type) { toasts.push([type || 'info', msg]); },
    apiGet: function (path) { apiGetLog.push(path); return Promise.resolve({ users: [] }); },
  });
  /* 1: запись не выбрана */
  gm.call('doCurrentRoleCalc');
  /* 2: запись есть, настроек нет */
  gm.set({ _currentSprintRoleRec: fx.buildCurrentRoleRec(), _settings: null });
  gm.call('doCurrentRoleCalc');
  /* 3: настройки без userFieldDevBack → нет полей пользователей */
  gm.set({ _settings: fx.buildSettings(), _currentRolePP: fx.buildCurrentRolePP() });
  gm.call('doCurrentRoleCalc');
  await new Promise(function (r) { setTimeout(r, 0); });
  checkJsonSnapshot('calc-pick-contract-early', { toasts: toasts, apiGetCalls: apiGetLog });
});

test('golden: doCurrentRoleCalc — мердж бандла (сохранение грейдов, орфан из ta, новый исполнитель) + персист', async () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  fx.applyPeopleState(gm);
  const st = fx.buildSettings();
  st.userFieldDevBack = 'Backend Dev';
  const toasts = [];
  const apiGetLog = [];
  const apiPostLog = [];
  const refreshCalls = [];
  gm.set({
    _settings: st,
    toast: function (msg, type) { toasts.push([type || 'info', msg]); },
    /* бандл: gm_user_1 (есть в PP — грейд Senior сохранится) + gm_user_3 (новый → Middle);
       gm_user_2 в бандл не попал, но назначен в ta → вернётся орфан-веткой */
    apiGet: function (path) {
      apiGetLog.push(path);
      return Promise.resolve({ users: [
        { login: 'gm_user_1', fullName: 'GM User One' },
        { login: 'gm_user_3', fullName: 'GM User Three' },
      ] });
    },
    apiPost: function (path) { apiPostLog.push(path); return Promise.resolve({ success: true }); },
    refreshPlanningPeopleForCurrentSprint: function (rk) { refreshCalls.push(rk); },
  });
  gm.call('doCurrentRoleCalc');
  await new Promise(function (r) { setTimeout(r, 0); });
  const pp = gm.get('_currentRolePP');
  checkJsonSnapshot('calc-pick-contract-success', {
    toasts: toasts,
    apiGetCalls: apiGetLog,
    apiPostPaths: apiPostLog,
    refreshCalls: refreshCalls,
    resourcesByAssignee: JSON.parse(JSON.stringify(pp.resourcesByAssignee)),
    nkcKey: pp.nkcKey,
    calculatedAt: pp.calculatedAt,
    pickBtnText: document.getElementById('currentRolePickBtn').textContent,
    pickBtnDisabled: document.getElementById('currentRolePickBtn').disabled,
  });
});

test('golden: doCurrentRoleCalc — ручной режим сохраняет введённые ресурсы', async () => {
  const { gm } = createHost();
  fx.applyBaseState(gm);
  fx.applyPeopleState(gm);
  const st = fx.buildSettings();
  st.userFieldDevBack = 'Backend Dev';
  st.manualPersonalResource = true;
  const apiPostLog = [];
  gm.set({
    _settings: st,
    toast: function () {},
    apiGet: function () {
      return Promise.resolve({ users: [
        { login: 'gm_user_1', fullName: 'GM User One' },
        { login: 'gm_user_2', fullName: 'GM User Two' },
        { login: 'gm_user_3', fullName: 'GM User Three' },
      ] });
    },
    apiPost: function (path) { apiPostLog.push(path); return Promise.resolve({ success: true }); },
    refreshPlanningPeopleForCurrentSprint: function () {},
  });
  gm.call('doCurrentRoleCalc');
  await new Promise(function (r) { setTimeout(r, 0); });
  checkJsonSnapshot('calc-pick-contract-manual', {
    resourcesByAssignee: JSON.parse(JSON.stringify(gm.get('_currentRolePP').resourcesByAssignee)),
  });
});

test('golden: calcAssigneeUsed — исторические items, roleKey-фоллбэк из PP, EXCLUDED и fact>est', () => {
  const { gm } = createHost();
  fx.applyBaseState(gm);
  const rec = fx.buildCurrentRoleRec();
  rec.sprintId = 'gm-hist-2026-05_devBack';
  delete rec.roleKey; /* → фоллбэк на _currentRolePP.roleKey */
  rec.items = [
    { issueId: 'GM-H20', title: 'alloc задан', inclusionStatus: 'INC_PLANNED',
      estimate_devBack: 1200, fact_devBack: 0, alloc_devBack: 600, priority: 'Major', state: 'Open' },
    { issueId: 'GM-H21', title: 'исключённая', inclusionStatus: 'INC_EXCLUDED',
      estimate_devBack: 6000, fact_devBack: 0, alloc_devBack: 6000, priority: 'Major', state: 'Open' },
    { issueId: 'GM-H22', title: 'fact больше est', inclusionStatus: 'INC_PLANNED',
      estimate_devBack: 300, fact_devBack: 600, alloc_devBack: null, priority: 'Normal', state: 'Fixed' },
    { issueId: 'GM-H23', title: 'alloc null — дельта', inclusionStatus: 'INC_PLANNED',
      estimate_devBack: 900, fact_devBack: 300, alloc_devBack: null, priority: 'Normal', state: 'Open' },
  ];
  const pp = fx.buildCurrentRolePP();
  pp.taskAssignments = {
    'GM-H20': { assignee: 'gm_user_1' },
    'GM-H21': { assignee: 'gm_user_1' },
    'GM-H22': { assignee: 'gm_user_1' },
    'GM-H23': { assignee: 'gm_user_1' },
  };
  gm.set({ _currentSprintRoleRec: rec, _currentRolePP: pp });
  checkJsonSnapshot('calc-assignee-used-branches', {
    gm_user_1: gm.call('calcAssigneeUsed', 'gm_user_1'),
  });
});

test('golden: смена грейда в таблице исполнителей — пересчёт ресурса + персист (host change-делегат)', () => {
  const { gm, document, window } = createHost();
  fx.applyBaseState(gm);
  fx.applyPeopleState(gm);
  const apiPostLog = [];
  gm.set({ apiPost: function (path) { apiPostLog.push(path); return Promise.resolve({ success: true }); } });
  gm.call('renderCurrentRoleAssigneeTable'); /* биндит change-делегат на host */
  const host = document.getElementById('currentRoleAssigneeHost');
  /* Recording-стаб таблицы DOM не строит — ячейку-источник события создаём руками
     (тот же селектор, что рендерит cell renderer). */
  const sel = document.createElement('select');
  sel.className = 'currentRole-grade-sel';
  sel.setAttribute('data-login', 'gm_user_2');
  sel.innerHTML = '<option value="Middle">М</option><option value="Senior">С</option>';
  host.appendChild(sel);
  sel.value = 'Senior';
  sel.dispatchEvent(new window.Event('change', { bubbles: true }));
  const entry = gm.get('_currentRolePP').resourcesByAssignee.gm_user_2;
  checkJsonSnapshot('people-grade-change-contract', {
    grade: entry.grade,
    resource: entry.resource,
    manualResource: entry.manualResource,
    apiPostPaths: apiPostLog,
  });
});

test('golden: ввод ручного ресурса — manualResource+resource, отрицательное → 0 (host change-делегат)', () => {
  const { gm, document, window } = createHost();
  fx.applyBaseState(gm);
  fx.applyPeopleState(gm);
  const st = fx.buildSettings();
  st.manualPersonalResource = true;
  gm.set({ _settings: st, apiPost: function () { return Promise.resolve({ success: true }); } });
  gm.call('renderCurrentRoleAssigneeTable');
  const host = document.getElementById('currentRoleAssigneeHost');
  const inp = document.createElement('input');
  inp.type = 'number';
  inp.className = 'currentRole-manual-res';
  inp.setAttribute('data-login', 'gm_user_1');
  host.appendChild(inp);
  inp.value = '25.5';
  inp.dispatchEvent(new window.Event('change', { bubbles: true }));
  const after = JSON.parse(JSON.stringify(gm.get('_currentRolePP').resourcesByAssignee.gm_user_1));
  inp.value = '-3';
  inp.dispatchEvent(new window.Event('change', { bubbles: true }));
  const negative = JSON.parse(JSON.stringify(gm.get('_currentRolePP').resourcesByAssignee.gm_user_1));
  checkJsonSnapshot('people-manual-res-contract', { after: after, negativeClamped: negative });
});

test('golden: назначение исполнителя в таблице задач + смена даты — ta/персист/update-issue-field', () => {
  const { gm, document, window } = createHost();
  fx.applyBaseState(gm);
  fx.applyPeopleState(gm);
  const st = fx.buildSettings();
  st.userFieldDevBack = 'Backend Dev';
  const apiPostLog = [];
  const ganttCalls = [];
  gm.set({
    _settings: st,
    apiPost: function (path, body) { apiPostLog.push({ path: path, body: body || null }); return Promise.resolve({ success: true }); },
    renderGanttChart: function () { ganttCalls.push(1); },
  });
  gm.call('renderCurrentRoleTaskTable'); /* биндит change-делегат на host */
  const host = document.getElementById('currentRoleTaskHost');
  /* назначение: GM-11 → gm_user_1 */
  const sel = document.createElement('select');
  sel.className = 'currentRole-task-assignee assigner-btn';
  sel.setAttribute('data-issue', 'GM-11');
  sel.innerHTML = '<option value=""></option><option value="gm_user_1">U1</option>';
  host.appendChild(sel);
  sel.value = 'gm_user_1';
  sel.dispatchEvent(new window.Event('change', { bubbles: true }));
  /* смена даты старта: GM-10 → внутри спринта (outline снимается) */
  const span = document.createElement('span');
  span.className = 'currentRole-task-date currentRole-task-start';
  span.setAttribute('data-issue', 'GM-10');
  span.dataset.value = '2026-05-25';
  host.appendChild(span);
  span.dispatchEvent(new window.Event('change', { bubbles: true }));
  const updCall = apiPostLog.filter(function (e) { return e.path === 'update-issue-field'; });
  checkJsonSnapshot('people-task-assignee-change-contract', {
    taskAssignments: JSON.parse(JSON.stringify(gm.get('_currentRolePP').taskAssignments)),
    updateIssueFieldCalls: updCall,
    apiPostPaths: apiPostLog.map(function (e) { return e.path; }),
    dateOutline: span.style.outline || null,
  });
});
