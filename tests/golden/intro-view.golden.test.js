/**
 * Golden-master: intro-кластер планировщика (Фаза 5, зачистка «прочих» — слайс 9).
 *
 * Характеризация ДО выноса в intro-view.js (__SSP_INTRO_VIEW):
 *   • renderRoleStatusBadge(rk) — per-role бейдж статуса из _history (v1.8.1: статус
 *     берётся per-role из composite-записи sprintId_<rk>, НЕ из глобального
 *     _sprint.status); матрица PLANNING(default, нет записи) / CONFIRMED / ALLOCATED /
 *     FINISHED — текст statusLabel + className + title;
 *   • renderSprintIntroExtras() — sprint/version custom-field селекты: hidden-ветка
 *     (нет _settings.fieldSprint/fieldVersion → #sprintExtraFields display:none, без
 *     apiGet) и populated-ветка (apiGet field-values → loadFieldBundle наполняет
 *     <select>, затем persisted _sprint.sprintFieldVal/versionFieldVal проставляются);
 *   • renderRolePlannerHeader(rk) — шапка «Параметры спринта» роли: normal-resource
 *     ветка (res редактируем) и personalForResource ветка (res readOnly + запись
 *     _sprint[role.resKey]); + интегрированные суб-рендеры (badge + extras hidden).
 *
 * Контракты — ТОЛЬКО через выживающие entry-points (урок слайсов 3–8): все три
 * функции остаются делегаторами ядра. Внутренние суб-рендеры renderRolePlannerHeader
 * (renderRoleStatusBadge/renderSprintIntroExtras) исполняются ВЖИВУЮ — после выноса
 * модуль зовёт собственные функции напрямую, gm.set-стаб делегаторов их не
 * перехватил бы (стабим лишь внешние deps — bind-листенеры и
 * getPersonalPlanningResourceForRole, идущие через _introDeps()). Стейт
 * (_settings/_sprint/_history/_currentSprintId)
 * остаётся в стейт-ядре за gm.get/gm.set; кэш field-values (_fieldValuesCache/
 * _fieldValuesInflight) приватен кластеру → переедет в модуль.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { createHost } = require('./monolith-host');
const { checkJsonSnapshot, checkHtmlSnapshot } = require('./snap');
const fx = require('./fixtures/state');

/** Прокрутить N микротасков (apiGet-цепочки loadFieldBundle/Promise.all). */
async function flush(n) {
  for (let i = 0; i < (n || 8); i++) await Promise.resolve();
}

/** Recording-стаб apiGet: лог путей + фиксированный ответ (field-values). */
function stubApiGet(gm, response) {
  const log = [];
  gm.set({
    apiGet: function (path) {
      log.push(path);
      return Promise.resolve(response !== undefined ? response : { success: true, values: [] });
    },
  });
  return log;
}

/** #sprintGoal — Ring-input host (в проде id монтирует React, в харнессе стаб),
 *  renderRolePlannerHeader пишет в него под guard'ом. Создаём вручную. */
function ensureSharedIntroDom(document) {
  if (!document.getElementById('sprintGoal')) {
    document.body.insertAdjacentHTML('beforeend', '<textarea id="sprintGoal"></textarea>');
  }
}

/** Per-role DOM шапки планировщика (создаётся динамически buildRolePanel). */
function ensureRolePlannerDom(document, rk) {
  document.body.insertAdjacentHTML(
    'beforeend',
    '<input id="res_' + rk + '">' +
      '<button id="newSprintBtn_' + rk + '"></button>' +
      '<span id="statusBadge_' + rk + '"></span>'
  );
}

/* ═══════════════════ renderRoleStatusBadge ═══════════════════ */

test('golden: renderRoleStatusBadge — матрица статусов (per-role из _history)', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  /* Composite-записи sprintId_<rk> на активном спринте с разными статусами +
     роль без записи (analysis) → default PLANNING. */
  gm.set({
    _history: [
      { sprintId: fx.SPRINT_ID + '_testing', roleKey: 'testing', status: 'CONFIRMED' },
      { sprintId: fx.SPRINT_ID + '_devBack', roleKey: 'devBack', status: 'ALLOCATED' },
      { sprintId: fx.SPRINT_ID + '_devFront', roleKey: 'devFront', status: 'FINISHED' },
    ],
  });
  const out = {};
  for (const rk of ['analysis', 'testing', 'devBack', 'devFront']) {
    ensureRolePlannerDom(document, rk);
    gm.call('renderRoleStatusBadge', rk);
    out[rk] = document.getElementById('statusBadge_' + rk).outerHTML;
  }
  checkJsonSnapshot('intro-status-badge-matrix', out);
});

/* ═══════════════════ renderSprintIntroExtras ═══════════════════ */

test('golden: renderSprintIntroExtras — hidden (нет field-config)', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm); // buildSettings без fieldSprint/fieldVersion
  const log = stubApiGet(gm);
  gm.call('renderSprintIntroExtras');
  assert.deepStrictEqual(log, [], 'hidden-ветка не должна слать field-values');
  checkHtmlSnapshot('intro-extras-hidden', document.getElementById('sprintExtraFields').outerHTML);
});

test('golden: renderSprintIntroExtras — populated (field-config + apiGet)', async () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  gm.set({
    _settings: Object.assign(fx.buildSettings(), { fieldSprint: 'Sprints', fieldVersion: 'Fix versions' }),
    _sprint: Object.assign(fx.buildSprint(), { sprintFieldVal: 'Sprint B', versionFieldVal: 'v2026.06' }),
  });
  const log = stubApiGet(gm, { success: true, values: ['Sprint A', 'Sprint B', 'Sprint C'] });
  gm.call('renderSprintIntroExtras');
  await flush(10);
  checkJsonSnapshot('intro-extras-populated', {
    apiGet: log.slice().sort(),
    extrasHtml: document.getElementById('sprintExtraFields').outerHTML,
  });
});

/* #88 — поля спринта у ролей разошлись: один общий список показал бы значение чужого
   бандла, поэтому вводные переключаются на строку-на-роль. Ролям, у которых поле не
   настроено, строки не дают — выбора они не создают. */
test('golden: renderSprintIntroExtras — #88 ролевые поля спринта (строка на роль)', async () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  gm.set({
    _settings: Object.assign(fx.buildSettings(), {
      activeRoles: ['analysis', 'testing'],
      fieldSprint: 'Sprints', fieldSprintTesting: 'QA Sprints',
    }),
    _sprint: Object.assign(fx.buildSprint(), {
      roles: ['analysis', 'testing'],
      sprintFieldVal: 'Sprint B',
      sprintFieldValByRole: { testing: 'QA-19' },
    }),
  });
  const log = stubApiGet(gm, { success: true, values: ['Sprint A', 'Sprint B', 'Sprint C'] });
  gm.call('renderSprintIntroExtras');
  await flush(10);

  /* Предусловия: общий список скрыт, ролевой блок показан — иначе снимок ниже
     зафиксировал бы «как было» и молча прошёл. */
  assert.strictEqual(document.getElementById('fieldSprintVal').style.display, 'none',
    'общий список скрыт: у ролей разные поля');
  assert.notStrictEqual(document.getElementById('fieldSprintPerRole').style.display, 'none',
    'ролевой блок показан');
  assert.strictEqual(document.getElementById('sprintFieldVal_testing').value, 'QA-19',
    'у роли со своим полем стоит ЕЁ значение');
  assert.strictEqual(document.getElementById('sprintFieldVal_analysis').value, 'Sprint B',
    'роль на общем поле берёт общее значение');
  assert.ok(log.indexOf('field-values?fieldName=QA%20Sprints') >= 0,
    'бандл ролевого поля запрошен: ' + JSON.stringify(log));

  checkJsonSnapshot('intro-extras-per-role', {
    apiGet: log.slice().sort(),
    perRoleHtml: document.getElementById('fieldSprintPerRole').outerHTML,
  });
});

/* ═══════════════════ renderRolePlannerHeader ═══════════════════ */

test('golden: renderRolePlannerHeader — normal-resource (+ badge/extras вживую)', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  /* bind*-листенеры — внешние deps, стабим (идут через _introDeps, переживают вынос). */
  const binds = { res: [], header: 0 };
  gm.set({
    bindResInputDraftListener: function (rk) { binds.res.push(rk); },
    bindSprintHeaderDraftListeners: function () { binds.header += 1; },
  });
  const rk = 'analysis';
  ensureSharedIntroDom(document);
  ensureRolePlannerDom(document, rk);
  gm.call('renderRolePlannerHeader', rk);
  checkJsonSnapshot('intro-planner-header-normal', {
    banner: document.getElementById('bannerPlanner').className,
    name: document.getElementById('sprintName').value,
    dateStart: document.getElementById('dateStart').value,
    dateEnd: document.getElementById('dateEnd').value,
    goal: document.getElementById('sprintGoal').value,
    res: { value: document.getElementById('res_' + rk).value, readOnly: document.getElementById('res_' + rk).readOnly },
    newBtn: { display: document.getElementById('newSprintBtn_' + rk).style.display },
    badge: document.getElementById('statusBadge_' + rk).outerHTML,
    binds: binds,
  });
});

test('golden: renderRolePlannerHeader — personalForResource (res readOnly + запись _sprint[resKey])', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  gm.set({
    /* #45 super-light — usePersonalForResource действует только при включённом
       personalPlanningEnabled (иначе ресурс роли вводится вручную). */
    _settings: Object.assign(fx.buildSettings(), { personalPlanningEnabled: true, usePersonalForResource: true }),
    bindResInputDraftListener: function () {},
    bindSprintHeaderDraftListeners: function () {},
    getPersonalPlanningResourceForRole: function (rk) { return rk === 'devBack' ? 50 : 0; },
  });
  const rk = 'devBack';
  ensureSharedIntroDom(document);
  ensureRolePlannerDom(document, rk);
  gm.call('renderRolePlannerHeader', rk);
  checkJsonSnapshot('intro-planner-header-personal', {
    res: {
      value: document.getElementById('res_' + rk).value,
      readOnly: document.getElementById('res_' + rk).readOnly,
      opacity: document.getElementById('res_' + rk).style.opacity,
    },
    sprintResDevBack: gm.get('_sprint').resourceDevBack,
  });
});

/* ═══════════════════ v3.15.1 — res_<rk> при просмотре чужого спринта ═══════════════════ */

/* ОС прода 2026-07-31 «часы из спринта Август»: просмотр CONFIRMED/смешанного
   спринта не переключает рабочий слот (гейт loadUnfinishedSprintAsWorking), а res_<rk>
   заполнялся из _sprint → в шапке застревал ресурс прежнего спринта (класс D109).
   Контракт: источник ресурса = снапшот ЭТОЙ роли выбранного спринта; для рабочего
   спринта — прежнее поведение (_sprint). */
test('renderRolePlannerHeader — просмотр чужого спринта: res_<rk> из rk-снапшота (v3.15.1)', () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  gm.set({
    bindResInputDraftListener: function () {},
    bindSprintHeaderDraftListeners: function () {},
  });
  const rk = 'analysis';
  ensureSharedIntroDom(document);
  ensureRolePlannerDom(document, rk);
  const work = gm.get('_sprint');
  work.resourceAnalysis = 6000; /* рабочий слот: 100ч */
  gm.set({
    _currentSprintId: 'viewed-1',
    _history: [
      /* Первым — снапшот ЧУЖОЙ роли выбранного спринта: generic-резолвер
         _introSourceForCurrent берёт первую запись по префиксу sprintId,
         ресурс обязан прийти из rk-снапшота ниже, а не из неё. */
      { sprintId: 'viewed-1_testing', roleKey: 'testing', name: 'Просмотр', status: 'CONFIRMED',
        dateStart: 1754000000000, dateEnd: 1755000000000, resourceTesting: 60 },
      { sprintId: 'viewed-1_analysis', roleKey: 'analysis', name: 'Просмотр', status: 'CONFIRMED',
        dateStart: 1754000000000, dateEnd: 1755000000000, resourceAnalysis: 12780 },
    ],
  });
  gm.call('renderRolePlannerHeader', rk);
  assert.strictEqual(document.getElementById('res_' + rk).value, gm.call('fmtPeriod', 12780),
    'ресурс — из rk-снапшота выбранного спринта, не из рабочего _sprint');

  /* Рабочий спринт выбран → источник прежний, _sprint. */
  gm.set({ _currentSprintId: work.sprintId });
  gm.call('renderRolePlannerHeader', rk);
  assert.strictEqual(document.getElementById('res_' + rk).value, gm.call('fmtPeriod', 6000),
    'для рабочего спринта источник ресурса не изменился');
});

/* ═══════════════════ #120 — блок «Фазы работ» (renderRolePlannerHeader → renderPhasesBlock) ═══════════════════ */

const DAY_MS = 86400000;
function ph(a, b) { return { dateStart: fx.DATE_START + a * DAY_MS, dateEnd: fx.DATE_START + b * DAY_MS }; }
/* Макет params-block на датах фикстуры (пн 18 мая — пт 12 июня 2026, 26 дней): шесть фаз заданы. */
function sixPhases(over) {
  return Object.assign({ analysis: ph(0, 3), development: ph(3, 16), techTest: ph(14, 19), regression: ph(21, 22), bizTest: ph(21, 23), deploy: ph(25, 25) }, over || {});
}
function phasesHost(opts) {
  opts = opts || {};
  const h = createHost();
  const { gm, document } = h;
  fx.applyBaseState(gm);
  const stubs = { bindResInputDraftListener: function () {} };
  if (!opts.realDraft) stubs.bindSprintHeaderDraftListeners = function () {};   /* тест хостов дат держит настоящий слушатель черновика */
  gm.set(Object.assign(stubs, {
    _settings: Object.assign(fx.buildSettings(), { phasesEnabled: true, phaseRoles: { techTest: ['testing'], regression: ['testing'] } }, opts.settings || {}),
    _isEditor: opts.isEditor !== undefined ? opts.isEditor : true,
    _isValidator: !!opts.isValidator,
  }));
  if (opts.phases !== undefined) {
    const sp = gm.get('_sprint');
    sp.phases = opts.phases; sp.phasesUpdatedAt = opts.updatedAt === undefined ? null : opts.updatedAt; sp.phasesUpdatedBy = opts.updatedBy || null;
  }
  ensureSharedIntroDom(document);
  ensureRolePlannerDom(document, opts.rk || 'testing');
  return h;
}
function blockFacts(document) {
  const block = document.getElementById('sprintPhasesBlock');
  const btn = document.getElementById('savePhasesBtn');
  const hosts = block.querySelectorAll('[data-ssp-datepicker-host]');
  return {
    hidden: block.classList.contains('hidden'),
    hosts: hosts.length,
    disabledHosts: block.querySelectorAll('[data-ssp-datepicker-host][data-disabled="1"]').length,
    chips: Array.prototype.map.call(block.querySelectorAll('.ssp-phases__role'), (e) => e.textContent),
    mineNames: block.querySelectorAll('.ssp-phases__name.is-mine').length,
    segs: Array.prototype.map.call(block.querySelectorAll('.ssp-phases__seg'), (e) => e.className + (e.dataset.tail ? '|tail=' + e.dataset.tail : '')),
    ticks: Array.prototype.map.call(block.querySelectorAll('.ssp-phases__tick'), (e) => e.textContent),
    statuses: Array.prototype.map.call(block.querySelectorAll('.ssp-phases__status'), (e) => e.textContent.trim()),
    tooltips: Array.prototype.map.call(block.querySelectorAll('[data-ssp-tooltip]'), (e) => e.dataset.sspTooltip),
    stampHasWho: !!(block.querySelector('.ssp-phases__stamp') && /Петров/.test(block.querySelector('.ssp-phases__stamp').textContent)),
    btn: btn ? { cls: btn.className, disabled: btn.disabled, title: btn.getAttribute('title'), tooltip: btn.getAttribute('data-tooltip'), text: btn.textContent } : null,
    err: block.querySelector('#errPhases') ? block.querySelector('#errPhases').textContent : null,
  };
}

test('golden: renderRolePlannerHeader → блок фаз — заполнено, роль «Тестирование» с чипами (макет)', () => {
  const { gm, document } = phasesHost({ phases: sixPhases(), updatedAt: fx.DATE_START + 5 * DAY_MS, updatedBy: 'Петров И. С.' });
  gm.call('renderRolePlannerHeader', 'testing');
  const facts = blockFacts(document);
  assert.strictEqual(facts.hidden, false);
  assert.deepStrictEqual(facts.chips, ['Тестирование', 'Тестирование']);
  assert.strictEqual(facts.mineNames, 2);
  assert.strictEqual(facts.disabledHosts, 0);
  assert.strictEqual(facts.stampHasWho, true);
  checkJsonSnapshot('intro-phases-filled', facts);
});

test('golden: renderRolePlannerHeader → блок фаз — пусто (спринт только создан): «не планируется» ×6, штампа нет, HTML по макету', () => {
  const { gm, document } = phasesHost({ phases: null, rk: 'analysis' });
  gm.call('renderRolePlannerHeader', 'analysis');
  const facts = blockFacts(document);
  assert.strictEqual(facts.statuses.filter((s) => s === 'не планируется').length, 6);
  assert.strictEqual(facts.stampHasWho, false);
  assert.strictEqual(facts.mineNames, 6, 'у роли анализа нет фаз в маппинге → правило одного тона: все is-mine, чипов нет');
  assert.deepStrictEqual(facts.chips, []);
  checkHtmlSnapshot('intro-phases-empty', document.getElementById('sprintPhasesBlock').innerHTML);
});

test('golden: renderRolePlannerHeader → блок фаз — предупреждения: сломанный порядок (оранжевый) и «вне диапазона» с пунктирным хвостом после сужения спринта', () => {
  const { gm, document } = phasesHost({ phases: sixPhases({ bizTest: ph(17, 23) }) });
  gm.get('_sprint').dateEnd = fx.DATE_START + 23 * DAY_MS;   /* спринт сузили: deploy (25) снаружи */
  gm.call('renderRolePlannerHeader', 'testing');
  const facts = blockFacts(document);
  assert.ok(facts.segs.some((c) => /is-warn/.test(c)), 'отрезок бизнес-теста помечен is-warn');
  assert.ok(facts.segs.some((c) => /is-oor/.test(c) && /tail=right/.test(c)), 'deploy: is-oor + хвост справа');
  assert.strictEqual(facts.tooltips.length, 2);
  assert.ok(/раньше фазы «Регресс»/.test(facts.statuses[4]));
  checkJsonSnapshot('intro-phases-warnings', facts);
});

test('golden: renderRolePlannerHeader → блок фаз — тумблер выключен: контейнер скрыт и пуст', () => {
  const { gm, document } = phasesHost({ phases: sixPhases(), settings: { phasesEnabled: false } });
  gm.call('renderRolePlannerHeader', 'testing');
  const block = document.getElementById('sprintPhasesBlock');
  assert.strictEqual(block.classList.contains('hidden'), true);
  assert.strictEqual(block.innerHTML, '');
});

test('golden: renderRolePlannerHeader → блок фаз — наблюдатель: пикеры disabled, кнопка приглушена с подсказкой обеих групп; валидатор без прав редактора — рабочий блок', () => {
  const v = phasesHost({ phases: sixPhases(), isEditor: false, isValidator: false });
  v.gm.call('renderRolePlannerHeader', 'testing');
  const viewer = blockFacts(v.document);
  assert.strictEqual(viewer.disabledHosts, 12);
  assert.ok(/btn--disabled-rights/.test(viewer.btn.cls));
  assert.strictEqual(viewer.btn.tooltip, 'Недостаточно прав. Необходима группа «Редактирование спринта» или «Валидация спринта»');
  const w = phasesHost({ phases: sixPhases(), isEditor: false, isValidator: true });
  w.gm.call('renderRolePlannerHeader', 'testing');
  const validator = blockFacts(w.document);
  assert.strictEqual(validator.disabledHosts, 0);
  assert.ok(!/btn--disabled-rights/.test(validator.btn.cls));
  checkJsonSnapshot('intro-phases-rights', { viewer: viewer.btn, validator: validator.btn });
});

test('golden: renderRolePlannerHeader → блок фаз — завершённый спринт из истории (только чтение) и спринт без дат (нет шкалы)', () => {
  const f = phasesHost({ phases: sixPhases() });
  f.gm.set({ _currentSprintId: fx.HIST_SPRINT_ID });   /* все снимки FINISHED, слот держит другой спринт */
  f.gm.call('renderRolePlannerHeader', 'analysis');
  const fin = blockFacts(f.document);
  assert.strictEqual(fin.disabledHosts, 12);
  assert.strictEqual(fin.btn.disabled, true);
  assert.strictEqual(fin.btn.title, 'Спринт завершён — фазы не меняются');
  const n = phasesHost({ phases: null });
  n.gm.get('_sprint').dateStart = null; n.gm.get('_sprint').dateEnd = null;
  n.gm.call('renderRolePlannerHeader', 'testing');
  const nodates = blockFacts(n.document);
  assert.deepStrictEqual(nodates.ticks, []);
  assert.strictEqual(nodates.disabledHosts, 12);
  assert.strictEqual(nodates.btn.title, 'Сначала укажите даты спринта');
  checkJsonSnapshot('intro-phases-finished-nodates', { finished: fin.btn, noDates: nodates.btn, noDatesTicks: nodates.ticks });
});

test('golden: renderRolePlannerHeader → блок фаз — отказ по кнопке (конец раньше начала) и отказ сервера phases_out_of_sprint:deploy: строка помечена, модель не тронута', async () => {
  const { gm, document, window } = phasesHost({ phases: sixPhases() });
  const posts = [];
  gm.set({ apiPost: function (path, body, query) { posts.push({ path: path, body: body, query: query }); return Promise.reject(new Error('phases_out_of_sprint:deploy [cid-1]')); } });
  gm.call('renderRolePlannerHeader', 'testing');
  const block = document.getElementById('sprintPhasesBlock');
  const host = (k, edge) => block.querySelector('[data-ssp-datepicker-host][data-ssp-phase="' + k + '"][data-ssp-edge="' + edge + '"]');
  const click = () => document.getElementById('savePhasesBtn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  /* клиентский отказ: конец раньше начала у тех.теста — запрос не шлётся */
  host('techTest', 'start').dataset.value = '2026-06-05'; host('techTest', 'end').dataset.value = '2026-06-01';
  click();
  const client = { posts: posts.length, err: block.querySelector('#errPhases').textContent, techErr: host('techTest', 'start').classList.contains('is-err') && host('techTest', 'end').classList.contains('is-err'), status: block.querySelector('.ssp-phases__status[data-ssp-phase="techTest"]').textContent.trim() };
  assert.strictEqual(client.posts, 0);
  assert.strictEqual(client.techErr, true);
  /* серверный отказ: чиним тех.тест, двигаем деплой — сервер отвечает phases_out_of_sprint:deploy */
  host('techTest', 'end').dataset.value = '2026-06-06';
  host('deploy', 'start').dataset.value = '2026-06-12'; host('deploy', 'end').dataset.value = '2026-06-13';
  click();
  await flush(12);
  const server = { posts: posts.length, query: posts[0] && posts[0].query, sentDeploy: posts[0] && posts[0].body.sprint.phases.deploy, sentTechTest: posts[0] && posts[0].body.sprint.phases.techTest,
    deployErr: host('deploy', 'start').classList.contains('is-err'), techErrCleared: !host('techTest', 'start').classList.contains('is-err'),
    err: block.querySelector('#errPhases').textContent, modelDeploy: gm.get('_sprint').phases.deploy, btnEnabled: !document.getElementById('savePhasesBtn').disabled };
  assert.strictEqual(server.posts, 1);
  assert.strictEqual(JSON.stringify(server.query), JSON.stringify({ action: 'phases' }));
  assert.strictEqual(server.deployErr, true, 'строка деплоя помечена по ключу из суффикса');
  assert.strictEqual(JSON.stringify(server.modelDeploy), JSON.stringify(ph(25, 25)), 'модель не тронута отказом');
  checkJsonSnapshot('intro-phases-refusals', { client: client, server: server });
});

test('golden: renderRolePlannerHeader → блок фаз — успех: _sprint и снимки истории получают фазы и штампы из ответа, rev слота и истории синхронизированы, блок перерисован', async () => {
  const { gm, document, window } = phasesHost({ phases: sixPhases() });
  const sid = fx.SPRINT_ID;
  const resp = { success: true, action: 'phases', sprintId: sid, changed: true, phases: sixPhases({ deploy: null }), phasesUpdatedAt: fx.DATE_START + 9 * DAY_MS, phasesUpdatedBy: 'Петров И. С.', rev: 7, historyRev: 9, snaps: 1 };
  const calls = [];
  gm.set({ _host: { fetchApp: function (p, o) { calls.push({ p: p, q: o && o.query, body: o && o.body }); return Promise.resolve(resp); }, fetchYouTrack: function () { return Promise.resolve({}); } } });
  /* снимок роли текущего спринта в истории — после успеха обязан получить те же фазы (fan-out сервера) */
  gm.get('_history').push({ sprintId: sid + '_testing', roleKey: 'testing', roleLabel: 'Тестирование', status: 'CONFIRMED', dateStart: fx.DATE_START, dateEnd: fx.DATE_END, phases: sixPhases() });
  gm.call('renderRolePlannerHeader', 'testing');
  const block = document.getElementById('sprintPhasesBlock');
  const host = (k, edge) => block.querySelector('[data-ssp-datepicker-host][data-ssp-phase="' + k + '"][data-ssp-edge="' + edge + '"]');
  host('deploy', 'start').dataset.value = ''; host('deploy', 'end').dataset.value = '';
  document.getElementById('savePhasesBtn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await flush(20);
  const store = window.__SSP_SPRINT_STORE;
  const out = {
    call: calls[0] && { p: calls[0].p, q: calls[0].q, baseRevNum: typeof calls[0].body.baseRev === 'number', deploy: calls[0].body.sprint.phases.deploy },
    sprintDeploy: gm.get('_sprint').phases.deploy, sprintBy: gm.get('_sprint').phasesUpdatedBy,
    histPhases: gm.get('_history').filter((r) => r.sprintId.indexOf(sid + '_') === 0).map((r) => r.phases && r.phases.deploy),
    foreignUntouched: gm.get('_history').filter((r) => r.sprintId.indexOf(sid + '_') !== 0).every((r) => r.phases === undefined),
    slotRev: store.getSlotRev(), historyRev: store.getSlotRevFor('history'),
    stampHasWho: blockFacts(document).stampHasWho, deployStatus: block.querySelector('.ssp-phases__status[data-ssp-phase="deploy"]').textContent.trim(),
  };
  assert.strictEqual(out.sprintDeploy, null);
  assert.ok(out.histPhases.length > 0 && out.histPhases.every((v) => v === null), 'снимки истории спринта получили фазы: ' + JSON.stringify(out));
  assert.strictEqual(out.foreignUntouched, true);
  assert.strictEqual(out.slotRev, 7); assert.strictEqual(out.historyRev, 9);
  assert.strictEqual(out.deployStatus, 'не планируется');
  checkJsonSnapshot('intro-phases-saved', out);
});

test('golden: renderRolePlannerHeader — даты спринта на Ring-хостах (⚖8): скрытый input несёт value, хост — data-value, ошибка валидации — is-err на хосте', () => {
  const { gm, document } = phasesHost({ phases: null, realDraft: true });
  gm.call('renderRolePlannerHeader', 'testing');
  const ds = document.getElementById('dateStart'), hostDs = document.querySelector('[data-ssp-datepicker-host][data-ssp-for="dateStart"]');
  const before = { inputType: ds.type, value: ds.value, hostValue: hostDs.dataset.value };
  /* пользователь выбрал дату в пикере: мост пишет data-value и шлёт change на хосте → input догоняет */
  hostDs.dataset.value = '2026-05-20';
  hostDs.dispatchEvent(new document.defaultView.Event('change', { bubbles: true }));
  const afterPick = { value: ds.value, sprintDateStart: gm.get('_sprint').dateStart };
  /* пустая дата окончания → отказ вводных: рамка на хосте, не на скрытом input */
  gm.set({ toast: function () {} });
  gm.call('setDateField', 'dateEnd', '');
  gm.call('doSaveSprintIntro');
  const hostDe = document.querySelector('[data-ssp-datepicker-host][data-ssp-for="dateEnd"]');
  const afterErr = { hostErr: hostDe.classList.contains('is-err'), errText: document.getElementById('errDate').textContent };
  assert.strictEqual(before.inputType, 'hidden');
  assert.strictEqual(afterPick.value, '2026-05-20');
  assert.strictEqual(afterPick.sprintDateStart, Date.UTC(2026, 4, 20), 'слушатель черновика ядра сработал через change на input');
  assert.strictEqual(afterErr.hostErr, true);
  checkJsonSnapshot('intro-dates-ring-hosts', { before: before, afterPick: afterPick, afterErr: afterErr });
});
