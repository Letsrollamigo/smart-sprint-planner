/**
 * Golden-master: рендер уровня «Роли» вкладки Планирование.
 *
 * renderRoleAccordion(rk) — чистая HTML-строка карточки роли.
 * renderRoleComposition(rk) — состав роли: непустой (контракт Ring Table)
 * и пустой (структурный empty-state #43-W2) случаи, исторический вид.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { createHost } = require('./monolith-host');
const { checkHtmlSnapshot, checkJsonSnapshot } = require('./snap');
const { materializeTable } = require('./serialize');
const fx = require('./fixtures/state');

/** compHost_<rk> и сопутствующие элементы создаются buildRolePanel динамически —
 *  для изолированной характеризации создаём их в body напрямую. */
function ensureCompHost(document, rk) {
  document.body.insertAdjacentHTML(
    'beforeend',
    '<div id="compHost_' + rk + '"></div><div id="planPag_' + rk + '"></div>' +
      '<button id="clearBtn_' + rk + '"></button><button id="recalcBtn_' + rk + '"></button>' +
      '<button id="refreshBtn_' + rk + '"></button><button id="pickBtn_' + rk + '"></button>'
  );
  return document.getElementById('compHost_' + rk);
}

test('golden: renderRoleAccordion по активным ролям', () => {
  const { gm } = createHost();
  fx.applyBaseState(gm);
  const out = {};
  for (const rk of ['analysis', 'testing', 'devBack', 'devFront']) {
    out[rk] = gm.call('renderRoleAccordion', rk);
  }
  checkJsonSnapshot('role-accordion', out);
});

test('golden: B22 — renderPlannerRoles заполняет intro-поля «Параметры спринта» при холодном init без драфта', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  /* эмулируем холодный init: поля #sprintIntroCard пусты (до фикса так и оставались). */
  ['sprintName', 'dateStart', 'dateEnd', 'sprintGoal'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  gm.call('renderPlannerRoles');
  /* Статические поля #sprintIntroCard заполняются из активного _sprint.
     (#sprintGoal — Ring Input host, в golden-стабе не монтируется → вне ассертов; в
     реальном виджете заполняется тем же renderRolePlannerHeader через goalEl-guard.) */
  assert.strictEqual(document.getElementById('sprintName').value, 'GM Sprint June 2026', 'sprintName заполнен из активного _sprint');
  assert.ok(document.getElementById('dateStart').value, 'dateStart заполнен');
  assert.ok(document.getElementById('dateEnd').value, 'dateEnd заполнен');
});

test('golden: renderRoleComposition — непустой состав (контракт Ring Table)', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  const host = ensureCompHost(document, 'analysis');
  gm.call('renderRoleComposition', 'analysis');
  const table = materializeTable(host);
  assert.ok(table, 'Ring Table contract must be stashed on compHost_analysis');
  checkJsonSnapshot('composition-analysis', table);
});

test('golden: renderRoleComposition — пустой состав (empty-state)', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  gm.set({ _roleItems: Object.assign(fx.buildRoleItems(), { devBack: [] }) });
  const host = ensureCompHost(document, 'devBack');
  gm.call('renderRoleComposition', 'devBack');
  checkHtmlSnapshot('composition-empty-devback', host.innerHTML);
});

test('golden: renderRoleComposition — исторический вид (items из снапшота)', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  gm.set({ _currentSprintId: fx.HIST_SPRINT_ID });
  const host = ensureCompHost(document, 'analysis');
  gm.call('renderRoleComposition', 'analysis');
  const table = materializeTable(host);
  assert.ok(table, 'historical composition must mount Ring Table from history snapshot');
  checkJsonSnapshot('composition-analysis-historical', table);
});

/* ═══ Добор слайса 3 Тира D (планинг-ядро) — характеризация ДО выноса ═══
   renderPlanningRoles / аккордеон / buildRolePanel / wireRolePanel /
   ветки и event-контракты renderRoleComposition. */

/** Снимок видимости empty-state'ов уровня «Роли». */
function planningEmptyStates(document) {
  return {
    noSprintHidden: document.getElementById('planningRolesNoSprint').classList.contains('hidden'),
    noActiveHidden: document.getElementById('planningRolesNoActive').classList.contains('hidden'),
  };
}

test('golden: renderPlanningRoles — карточки активных ролей, empty-states скрыты', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  gm.call('renderPlanningRoles');
  const cards = Array.from(
    document.querySelectorAll('#roleAccordions .planning-role-card')
  ).map(function (c) {
    return {
      rk: c.getAttribute('data-role-key'),
      expanded: c.classList.contains('expanded'),
      chevron: c.querySelector('.planning-role-chevron').textContent,
      hasJumpPeople: !!c.querySelector('.planning-role-jumpPeople'),
    };
  });
  checkJsonSnapshot('planning-roles-render', Object.assign({ cards: cards }, planningEmptyStates(document)));
});

test('golden: renderPlanningRoles — нет активных ролей (CTA по видимости openSettingsBtn)', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  const st = fx.buildSettings();
  st.activeRoles = [];
  gm.set({ _settings: st });
  /* openSettingsBtn в index.html display:none → CTA скрыт */
  gm.call('renderPlanningRoles');
  const ctaEl = document.getElementById('planningRolesNoActiveCta');
  const hiddenCase = {
    states: planningEmptyStates(document),
    containerEmpty: document.getElementById('roleAccordions').innerHTML === '',
    ctaDisplay: ctaEl.style.display,
  };
  /* кнопка настроек видима (серверная проверка прошла) → CTA показан */
  document.getElementById('openSettingsBtn').style.display = '';
  gm.call('renderPlanningRoles');
  const visibleCase = { ctaDisplay: ctaEl.style.display };
  checkJsonSnapshot('planning-roles-no-active', { settingsBtnHidden: hiddenCase, settingsBtnVisible: visibleCase });
});

test('golden: renderPlanningRoles — спринт не выбран (no-sprint empty-state)', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  gm.set({ _currentSprintId: null });
  gm.call('renderPlanningRoles');
  checkJsonSnapshot('planning-roles-no-sprint', Object.assign(
    { containerEmpty: document.getElementById('roleAccordions').innerHTML === '' },
    planningEmptyStates(document)
  ));
});

test('golden: тоггл аккордеона — expand монтирует buildRolePanel, collapse демонтирует', async () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  gm.call('renderPlanningRoles');
  const card = document.querySelector('.planning-role-card[data-role-key="analysis"]');
  const toggle = card.querySelector('.planning-role-toggle');

  toggle.click();
  /* buildRolePanel вешает wireRolePanel/render* через setTimeout(0) */
  await new Promise(function (r) { setTimeout(r, 20); });

  const body = card.querySelector('.planning-role-body');
  const expandedContract = {
    cardExpanded: card.classList.contains('expanded'),
    chevron: card.querySelector('.planning-role-chevron').textContent,
    uiExpandedRoles: JSON.parse(JSON.stringify(gm.get('_uiExpandedRoles'))),
    draftUiExpandedRoles: (gm.get('_draft').ui || {}).expandedRoles || null,
    mounted: body.dataset.mounted,
    activeSubtab: gm.get('_activeSubtab'),
    keepActionsPreserved: !!body.querySelector('.planning-role-body__actions'),
  };
  /* DOM полной панели — оракул buildRolePanel (статус/ресурсы/остатки/тулбар/хост таблицы) */
  checkHtmlSnapshot('rolepanel-mounted-analysis', body.innerHTML);
  /* renderRoleComposition отработал в setTimeout → Ring Table контракт на compHost */
  const table = materializeTable(document.getElementById('compHost_analysis'));
  assert.ok(table, 'composition must mount inside expanded role panel');
  checkJsonSnapshot('rolepanel-composition-analysis', table);

  toggle.click();
  await new Promise(function (r) { setTimeout(r, 20); });
  const collapsedContract = {
    cardExpanded: card.classList.contains('expanded'),
    chevron: card.querySelector('.planning-role-chevron').textContent,
    uiExpandedAnalysis: !!gm.get('_uiExpandedRoles').analysis,
    draftUiExpandedRoles: (gm.get('_draft').ui || {}).expandedRoles || null,
    mounted: body.dataset.mounted,
    bodyEmpty: body.innerHTML === '',
  };
  checkJsonSnapshot('accordion-toggle-contract', { expanded: expandedContract, collapsed: collapsedContract });
});

test('golden: кнопка «→ Открыть в Людях» — фиксация роли + переключение уровня', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  const refreshCalls = [];
  gm.set({
    refreshPlanningPeopleForCurrentSprint: function (rk) { refreshCalls.push(rk === undefined ? '<none>' : rk); },
  });
  gm.call('renderPlanningRoles');
  const jumpBtn = document.querySelector('.planning-role-card[data-role-key="testing"] .planning-role-jumpPeople');
  jumpBtn.click();
  const sel = document.getElementById('planningRoleSel');
  checkJsonSnapshot('accordion-jump-people-contract', {
    lastActiveRole: gm.get('safeLs').get('ssp_lastActiveRole'),
    activeSubtab: gm.get('_activeSubtab'),
    roleSelValue: sel ? sel.value : null,
    refreshCalls: refreshCalls,
    peopleLevelActive: !!document.querySelector('.planning-level-btn[data-level="people"].active'),
  });
});

test('golden: renderRoleAccordion — исторический вид (снапшот есть / снапшота нет)', () => {
  const { gm } = createHost();
  fx.applyBaseState(gm);
  gm.set({ _currentSprintId: fx.HIST_SPRINT_ID });
  checkJsonSnapshot('role-accordion-historical', {
    analysisWithSnapshot: gm.call('renderRoleAccordion', 'analysis'),
    devBackNoSnapshot: gm.call('renderRoleAccordion', 'devBack'),
  });
});

test('golden: _updateRoleAccordionStats — обновление чисел и появление/уход warn', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  gm.call('renderPlanningRoles');
  const card = document.querySelector('.planning-role-card[data-role-key="analysis"]');
  function snapCard() {
    return {
      nums: Array.from(card.querySelectorAll('.planning-role-toggle .planning-role-stat__num')).map(function (n) { return n.textContent; }),
      warn: !!card.querySelector('.planning-role-toggle .planning-role-warn'),
    };
  }
  const before = snapCard();
  /* перелимит: одна задача с alloc больше ресурса роли (40ч) */
  const ri = fx.buildRoleItems();
  ri.analysis[0].alloc_analysis = 3000; /* 50ч */
  gm.set({ _roleItems: ri });
  gm.call('_updateRoleAccordionStats', 'analysis');
  const overlimit = snapCard();
  /* возврат к норме → warn снимается */
  gm.set({ _roleItems: fx.buildRoleItems() });
  gm.call('_updateRoleAccordionStats', 'analysis');
  const restored = snapCard();
  checkJsonSnapshot('accordion-stats-update-contract', { before: before, overlimit: overlimit, restored: restored });
});

/** Настройки с полным набором опциональных колонок + dynEdit. */
function buildDynEditSettings() {
  const st = fx.buildSettings();
  st.dynEditEnabled = true;
  st.fieldExternalTicketId = 'External Ticket';
  st.fieldSystem = 'System';
  st.fieldXPriority = 'XPriority';
  st.fieldAnalysis = 'Analysis Estimation';
  return st;
}

test('golden: renderRoleComposition — dynEdit + полный набор колонок (PLANNING, не locked)', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  const st = buildDynEditSettings();
  const sp = fx.buildSprint();
  sp.status = 'PLANNING';
  const ri = fx.buildRoleItems();
  ri.analysis[0].externalTicketId = 'https://ext.example.com/T-1';
  ri.analysis[0].system = 'CRM';
  ri.analysis[0].xpriority = 'X1';
  ri.analysis[1].externalTicketId = 'EXT-PLAIN-2';
  ri.analysis[1].system = 'Billing';
  gm.set({ _settings: st, _sprint: sp, _roleItems: ri });
  const host = ensureCompHost(document, 'analysis');
  gm.call('renderRoleComposition', 'analysis');
  const table = materializeTable(host);
  assert.ok(table, 'dynEdit composition must mount Ring Table');
  checkJsonSnapshot('composition-analysis-dynedit', table);
});

test('golden: renderRoleComposition — активная сортировка + контракт onSort', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  gm.call('setSortKey', 'priority');
  const host = ensureCompHost(document, 'analysis');
  gm.call('renderRoleComposition', 'analysis');
  const sorted = materializeTable(host);
  /* onSort: Ring header click → setSortKey + ре-рендер раскрытых таблиц */
  host.__sspTableOpts.onSort('id');
  checkJsonSnapshot('composition-analysis-sorted', {
    sortKey: sorted.sortKey,
    itemKeys: sorted.itemKeys,
    sortKeyAfterOnSort: gm.call('getSortKey'),
  });
});

test('golden: renderRoleComposition — пагинация (30 задач, страницы 1 и 2)', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  const ri = fx.buildRoleItems();
  ri.analysis = [];
  for (let i = 1; i <= 30; i++) {
    ri.analysis.push({
      issueId: 'GMP-' + i, title: 'Пагинация ' + i, inclusionStatus: 'INC_PLANNED',
      estimate_analysis: 60 * i, fact_analysis: 0, alloc_analysis: null,
      priority: 'Normal', state: 'Open', addedAt: 1779494400000, addedBy: 'gm_user_validator',
    });
  }
  gm.set({ _roleItems: ri });
  const host = ensureCompHost(document, 'analysis');
  const pag = document.getElementById('planPag_analysis');
  /* кнопки/инфо пагинации создаёт buildRolePanel — для изолированного host добавляем руками */
  pag.innerHTML = '<button id="planPrev_analysis"></button><span id="planPageInfo_analysis"></span><button id="planNext_analysis"></button>';
  function pagContract() {
    return {
      display: pag.style.display,
      info: document.getElementById('planPageInfo_analysis').textContent,
      prevDisabled: document.getElementById('planPrev_analysis').disabled,
      nextDisabled: document.getElementById('planNext_analysis').disabled,
      itemKeys: materializeTable(host).itemKeys,
    };
  }
  gm.call('renderRoleComposition', 'analysis');
  const page1 = pagContract();
  gm.get('_roleItems').analysis._page = 2;
  gm.call('renderRoleComposition', 'analysis');
  const page2 = pagContract();
  checkJsonSnapshot('composition-pagination-contract', { page1: page1, page2: page2 });
});

test('golden: renderRoleComposition — перелимит testing блокирует «Валидировать» (wrapper + overlimit-модалка)', () => {
  const { gm, document, modalLog } = createHost();
  fx.applyBaseState(gm);
  const host = ensureCompHost(document, 'testing');
  document.body.insertAdjacentHTML('beforeend', '<button id="validateBtn_testing"></button>');
  const validateBtn = document.getElementById('validateBtn_testing');
  gm.call('renderRoleComposition', 'testing'); /* wrapped: рендер + updateAllocOverlimitUI */
  checkJsonSnapshot('composition-overlimit-validate-contract', {
    validateDisabled: validateBtn.disabled,
    overlimitClass: validateBtn.classList.contains('btn--disabled-overlimit'),
    title: validateBtn.title,
    /* ALLOCATED-статус + overlimit → одноразовая модалка (guard _overlimitModalShownFor) */
    overlimitModalIds: modalLog.map(function (s) { return s.id; }),
    modalShownGuard: JSON.parse(JSON.stringify(gm.get('_overlimitModalShownFor'))),
  });
});

test('golden: состав — change-контракт inc-sel (мутация + remaining + dirty + персист)', () => {
  const { gm, document, window } = createHost();
  fx.applyBaseState(gm);
  const apiPostLog = [];
  const remainCalls = [];
  gm.set({
    apiPost: function (path, body) { apiPostLog.push({ path: path, keys: Object.keys(body || {}) }); return Promise.resolve({ success: true }); },
    updateRoleRemaining: function (rk) { remainCalls.push(rk); },
  });
  const host = ensureCompHost(document, 'analysis');
  gm.call('renderRoleComposition', 'analysis'); /* биндит change/focusout-делегаты на host */
  const sel = document.createElement('select');
  sel.className = 'inc-sel';
  sel.setAttribute('data-iid', 'GM-1');
  sel.setAttribute('data-rk', 'analysis');
  sel.innerHTML = '<option value="INC_PLANNED"></option><option value="INC_EXCLUDED"></option>';
  host.appendChild(sel);
  sel.value = 'INC_EXCLUDED';
  sel.dispatchEvent(new window.Event('change', { bubbles: true }));
  checkJsonSnapshot('composition-inc-sel-contract', {
    inclusionStatus: gm.get('_roleItems').analysis[0].inclusionStatus,
    remainCalls: remainCalls,
    dirty: JSON.parse(JSON.stringify(gm.get('_draft').dirty || null)),
    apiPostLog: apiPostLog,
  });
});

test('golden: состав — focusout-контракт alloc-input (парсер периода, реформат, пустое → delta)', () => {
  const { gm, document, window } = createHost();
  fx.applyBaseState(gm);
  const apiPostLog = [];
  gm.set({
    apiPost: function (path) { apiPostLog.push(path); return Promise.resolve({ success: true }); },
    updateRoleRemaining: function () {},
  });
  const host = ensureCompHost(document, 'analysis');
  gm.call('renderRoleComposition', 'analysis');
  const inp = document.createElement('input');
  inp.className = 'alloc-input';
  inp.setAttribute('data-iid', 'GM-1');
  inp.setAttribute('data-rk', 'analysis');
  host.appendChild(inp);
  /* голое число = часы (#34): '12' → 720 минут, значение реформатится */
  inp.value = '12';
  inp.dispatchEvent(new window.Event('focusout', { bubbles: true }));
  const afterSet = { alloc: gm.get('_roleItems').analysis[0].alloc_analysis, inputValue: inp.value };
  /* пустая строка → alloc=null, input реформатится к delta (est-fact) */
  inp.value = '';
  inp.dispatchEvent(new window.Event('focusout', { bubbles: true }));
  const afterClear = { alloc: gm.get('_roleItems').analysis[0].alloc_analysis, inputValue: inp.value };
  /* повторный blur после clear: видимое значение = delta ('10ч'), но alloc=null →
     parsePeriod даёт 600 ≠ null → пишется снова (pre-existing поведение, фиксируем) */
  const postsBefore = apiPostLog.length;
  inp.dispatchEvent(new window.Event('focusout', { bubbles: true }));
  checkJsonSnapshot('composition-alloc-input-contract', {
    afterSet: afterSet,
    afterClear: afterClear,
    repeatBlurAfterClearPersists: apiPostLog.length !== postsBefore,
    allocAfterRepeatBlur: gm.get('_roleItems').analysis[0].alloc_analysis,
    apiPostPaths: apiPostLog,
  });
});

test('golden: состав — focusout dyn-period-input (confirm-флоу оценки: подтверждение и отмена)', () => {
  const { gm, document, window } = createHost();
  fx.applyBaseState(gm);
  const st = buildDynEditSettings();
  const apiPostLog = [];
  const updateFieldCalls = [];
  const confirmSpecs = [];
  let confirmAnswer = true;
  gm.set({
    _settings: st,
    apiPost: function (path) { apiPostLog.push(path); return Promise.resolve({ success: true }); },
    updateRoleRemaining: function () {},
    updateIssueField: function (iid, fieldName, value, type) { updateFieldCalls.push({ iid: iid, fieldName: fieldName, value: value, type: type }); },
    showDynFieldConfirm: function (title, desc, enumValues, currentVal, cb) {
      confirmSpecs.push({ title: title, desc: desc, enumValues: enumValues, currentVal: currentVal });
      cb(confirmAnswer, null);
    },
  });
  const host = ensureCompHost(document, 'analysis');
  gm.call('renderRoleComposition', 'analysis');
  const inp = document.createElement('input');
  inp.className = 'dyn-period-input';
  inp.setAttribute('data-iid', 'GM-1');
  inp.setAttribute('data-rk', 'analysis');
  host.appendChild(inp);
  inp.value = '8';
  inp.dispatchEvent(new window.Event('focusout', { bubbles: true }));
  const confirmed = { estimate: gm.get('_roleItems').analysis[0].estimate_analysis, updateFieldCalls: updateFieldCalls.slice() };
  /* отмена → значение инпута откатывается к старому, мутации нет */
  confirmAnswer = false;
  const synth2 = document.createElement('input');
  synth2.className = 'dyn-period-input';
  synth2.setAttribute('data-iid', 'GM-2');
  synth2.setAttribute('data-rk', 'analysis');
  host.appendChild(synth2);
  synth2.value = '99';
  synth2.dispatchEvent(new window.Event('focusout', { bubbles: true }));
  checkJsonSnapshot('composition-dynperiod-confirm-contract', {
    confirmed: confirmed,
    declined: { estimate: gm.get('_roleItems').analysis[1].estimate_analysis, revertedInput: synth2.value },
    confirmSpecs: confirmSpecs,
    apiPostPaths: apiPostLog,
  });
});

test('golden: состав — mousedown-контракты удаления строки и dyn-enum ячейки', () => {
  const { gm, document, window } = createHost();
  fx.applyBaseState(gm);
  const st = buildDynEditSettings();
  const apiPostLog = [];
  const updateFieldCalls = [];
  gm.set({
    _settings: st,
    apiPost: function (path) { apiPostLog.push(path); return Promise.resolve({ success: true }); },
    updateRoleRemaining: function () {},
    updateIssueField: function (iid, fieldName, value, type) { updateFieldCalls.push({ iid: iid, fieldName: fieldName, value: value, type: type }); },
    loadEnumBundle: function (fieldName, cb) { cb(['Normal', 'Critical']); },
    showDynFieldConfirm: function (title, desc, enumValues, currentVal, cb) { cb(true, 'Critical'); },
  });
  const host = ensureCompHost(document, 'analysis');
  gm.call('renderRoleComposition', 'analysis'); /* биндит mousedown-capture делегат */
  function md(el) {
    el.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
  }
  /* удаление строки GM-3 */
  const delBtn = document.createElement('button');
  delBtn.className = 'del-item-btn';
  delBtn.setAttribute('data-iid', 'GM-3');
  delBtn.setAttribute('data-rk', 'analysis');
  host.appendChild(delBtn);
  md(delBtn);
  const afterDelete = {
    ids: gm.get('_roleItems').analysis.map(function (it) { return it.issueId; }),
    apiPostPaths: apiPostLog.slice(),
  };
  /* dyn-enum смена приоритета GM-1 */
  const cell = document.createElement('span');
  cell.className = 'dyn-enum-cell';
  cell.setAttribute('data-iid', 'GM-1');
  cell.setAttribute('data-rk', 'analysis');
  cell.setAttribute('data-field', 'fieldPriority');
  host.appendChild(cell);
  md(cell);
  checkJsonSnapshot('composition-row-actions-contract', {
    afterDelete: afterDelete,
    dynEnum: {
      priority: gm.get('_roleItems').analysis[0].priority,
      cellText: cell.textContent,
      updateFieldCalls: updateFieldCalls,
    },
  });
});

test('golden: состав — CTA пустого состава проксирует клик на pickBtn', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  gm.set({ _roleItems: Object.assign(fx.buildRoleItems(), { devBack: [] }) });
  const host = ensureCompHost(document, 'devBack');
  let pickClicks = 0;
  document.getElementById('pickBtn_devBack').addEventListener('click', function () { pickClicks++; });
  gm.call('renderRoleComposition', 'devBack');
  host.querySelector('.ssp-empty__cta').click();
  checkJsonSnapshot('composition-empty-cta-contract', {
    pickClicks: pickClicks,
    pagHidden: document.getElementById('planPag_devBack').style.display,
  });
});

test('golden: wireRolePanel — контракты кнопок панели (права, recalc, clear-confirm, validate, пагинация)', async () => {
  const { gm, document, window, modalLog } = createHost();
  fx.applyBaseState(gm);
  const toastLog = [];
  const remainCalls = [];
  const ctlCalls = [];
  const apiPostLog = [];
  gm.set({
    toast: function (msg, type) { toastLog.push({ msg: msg, type: type || null }); },
    updateRoleRemaining: function (rk) { remainCalls.push(rk); },
    doValidateRole: function (rk) { ctlCalls.push('validate:' + rk); },
    doNewSprint: function (rk) { ctlCalls.push('newSprint:' + rk); },
    doSaveRoleHeader: function (rk) { ctlCalls.push('saveHeader:' + rk); },
    refreshFromYouTrack: function () { ctlCalls.push('refresh'); },
    openPickModal: function (rk) { ctlCalls.push('pick:' + rk); },
    apiPost: function (path) { apiPostLog.push(path); return Promise.resolve({ success: true }); },
  });
  /* панель монтируем штатным флоу: renderPlanningRoles → toggle */
  gm.call('renderPlanningRoles');
  document.querySelector('.planning-role-card[data-role-key="analysis"] .planning-role-toggle').click();
  await new Promise(function (r) { setTimeout(r, 20); });

  /* без прав редактора — warn-тосты, контроллеры не зовутся */
  gm.set({ _isEditor: false, _isValidator: false });
  document.getElementById('pickBtn_analysis').click();
  document.getElementById('recalcBtn_analysis').disabled = false;
  document.getElementById('recalcBtn_analysis').click();
  document.getElementById('validateBtn_analysis').click();
  const noRights = { toasts: toastLog.slice(), ctlCalls: ctlCalls.slice(), remainCalls: remainCalls.slice() };

  /* с правами — действия и контроллеры */
  toastLog.length = 0;
  gm.set({ _isEditor: true, _isValidator: true });
  document.getElementById('pickBtn_analysis').click();
  document.getElementById('recalcBtn_analysis').click();
  document.getElementById('validateBtn_analysis').click();
  document.getElementById('newSprintBtn_analysis').click();
  document.getElementById('saveHeaderBtn_analysis').click();
  document.getElementById('refreshBtn_analysis').disabled = false;
  document.getElementById('refreshBtn_analysis').click();
  const withRights = { toasts: toastLog.slice(), ctlCalls: ctlCalls.slice(), remainCalls: remainCalls.slice() };

  /* clear: confirm-модалка → подтверждение очищает роль и персистит */
  modalLog.length = 0;
  document.getElementById('clearBtn_analysis').disabled = false;
  document.getElementById('clearBtn_analysis').click();
  const clearSpec = modalLog[0];
  const confirmBtn = clearSpec.buttons.find(function (b) { return b.id === 'confirm'; });
  confirmBtn.onClick({ close: function () {} });
  await new Promise(function (r) { setTimeout(r, 5); });
  const clearContract = {
    modalId: clearSpec.id,
    modalType: clearSpec.type,
    buttonIds: clearSpec.buttons.map(function (b) { return b.id; }),
    itemsAfterClear: gm.get('_roleItems').analysis.length,
    apiPostPaths: apiPostLog.slice(),
  };

  /* пагинация панели: у testing 2 задачи = 1 страница → next инкрементит _page,
     но re-render нормализует к total (clamp); листание страниц — отдельный тест
     composition-pagination-contract */
  const ri = gm.get('_roleItems');
  ri.testing._page = 1;
  document.querySelector('.planning-role-card[data-role-key="testing"] .planning-role-toggle').click();
  await new Promise(function (r) { setTimeout(r, 20); });
  document.getElementById('planNext_testing').click();
  const pageAfterNext = gm.get('_roleItems').testing._page;
  document.getElementById('planPrev_testing').click();
  const pageAfterPrev = gm.get('_roleItems').testing._page;

  checkJsonSnapshot('rolepanel-buttons-contract', {
    noRights: noRights,
    withRights: withRights,
    clear: clearContract,
    pagination: { afterNext: pageAfterNext, afterPrev: pageAfterPrev },
  });
});
