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
