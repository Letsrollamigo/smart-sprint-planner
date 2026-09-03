/**
 * #80 (перенос 2026-09-03) — «Отключить/включить планер в этом проекте» из секции
 * «Опасная зона» формы настроек, вход _togglePlannerFromSettings (project-nav).
 * Кнопка ушла из сайдбара (⚖ владелец: один промах в рабочей области — и проект
 * пропал у всех). Контракт входа:
 *   • global: выключение = confirm → POST planner-disabled → форма закрывается
 *     колбэком ДО экрана «отключён» → пикер помечает проект, баннер с кнопкой включения;
 *   • project: флаг ложится в _settings, страница настроек перерисовывается, форму
 *     закрывать не надо (перемонтируется страницей); включение идёт без confirm.
 * Отказ сервера — флаг не трогаем, форму не закрываем.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { createHost } = require('./monolith-host');
const fx = require('./fixtures/state');

async function settle(n) {
  for (let i = 0; i < (n || 6); i++) await new Promise((r) => setTimeout(r, 0));
}

/** confirm-модалка: авто-нажатие кнопки confirm (или cancel); лог вызовов. */
function stubConfirm(gm, press) {
  const modals = [];
  gm.set({
    openModal: function (spec) {
      modals.push(spec.id);
      const btn = (spec.buttons || []).filter((b) => b.id === press)[0];
      if (btn) btn.onClick({ close: function () {} });
    },
  });
  return modals;
}

function stubApi(gm, postResp) {
  const log = [];
  gm.set({
    /* project-режим перерисовывает страницу настроек и перечитывает sprint-data:
       сервер отдаёт то, что только что записал, — эхо текущих настроек памяти. */
    apiGet: function (path) {
      log.push({ get: path });
      if (path === 'sprint-data') return Promise.resolve({ success: true, settings: gm.get('_settings') });
      return Promise.resolve(null);
    },
    /* Песочница голденов грузит подмножество модулей — без release-store полный ресет
       кэшей проекта падает. Сам ресет — ядро, к контракту входа не относится. */
    _resetProjectStateCaches: function () {},
    apiPost: function (path, body) {
      log.push({ post: path, body: body });
      const r = postResp[path];
      return r instanceof Error ? Promise.reject(r) : Promise.resolve(r === undefined ? null : r);
    },
    loadProjectFields: function () { return Promise.resolve(); },
    loadProjectGroups: function () { return Promise.resolve(); },
    toast: function () {},
  });
  return log;
}

function bootGlobal() {
  const host = createHost();
  fx.applyBaseState(host.gm);
  host.gm.set({
    _mode: 'global',
    _globalProjects: [{ key: 'DEMO', name: 'Демо' }],
    _activeProjectKey: 'DEMO',
  });
  return host;
}

test('global: выключение — confirm → POST → форма закрыта → пикер помечен, экран «отключён»', async () => {
  const { gm, document } = bootGlobal();
  const modals = stubConfirm(gm, 'confirm');
  const log = stubApi(gm, { 'planner-disabled': { success: true } });
  let closed = 0;
  const closeForm = function () { closed += 1; };

  gm.call('PROJECT_NAV._togglePlannerFromSettings', gm.call('_projectNavDeps'), true, closeForm);
  await settle();

  assert.deepStrictEqual(modals, ['plannerDisableConfirm'], 'выключение идёт только через подтверждение');
  const post = log.filter((c) => c.post === 'planner-disabled')[0];
  assert.ok(post, 'флаг пишет эндпоинт planner-disabled');
  /* тело приходит из песочницы (другой realm) — сравниваем по полям, не по прототипу */
  assert.strictEqual(post.body.disabled, true);
  assert.deepStrictEqual(Object.keys(post.body), ['disabled'], 'тело эндпоинта — ровно {disabled}');
  assert.strictEqual(closed, 1, 'модалка настроек закрыта — иначе повисла бы над экраном «отключён»');
  const entry = gm.get('_globalProjects').filter((p) => p.key === 'DEMO')[0];
  assert.strictEqual(entry.disabled, true, 'пикер помечает проект отключённым');
  const banner = document.getElementById('globalNoProjectBanner');
  assert.ok(banner && !banner.classList.contains('hidden'), 'экран «отключён» показан');
  assert.ok(banner.querySelector('button'), 'на экране есть кнопка включения — путь назад одним кликом');
});

test('global: отказ в confirm — ни POST, ни закрытия формы', async () => {
  const { gm } = bootGlobal();
  stubConfirm(gm, 'cancel');
  const log = stubApi(gm, { 'planner-disabled': { success: true } });
  let closed = 0;
  gm.call('PROJECT_NAV._togglePlannerFromSettings', gm.call('_projectNavDeps'), true, function () { closed += 1; });
  await settle();
  assert.strictEqual(log.filter((c) => c.post).length, 0);
  assert.strictEqual(closed, 0, 'форма остаётся открытой — человек передумал');
});

test('global: сервер отверг — форма не закрыта, пикер не помечен', async () => {
  const { gm } = bootGlobal();
  stubConfirm(gm, 'confirm');
  stubApi(gm, { 'planner-disabled': { success: false, reason: 'settings_manager_rights_required' } });
  let closed = 0;
  gm.call('PROJECT_NAV._togglePlannerFromSettings', gm.call('_projectNavDeps'), true, function () { closed += 1; });
  await settle();
  assert.strictEqual(closed, 0);
  assert.strictEqual(gm.get('_globalProjects')[0].disabled, undefined, 'отказ не помечает проект');
});

test('project: выключение кладёт флаг в _settings, страница перерисована, форму не закрываем', async () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  gm.set({ _mode: 'project', _activeProjectKey: 'GM', _settings: fx.buildSettings() });
  const modals = stubConfirm(gm, 'confirm');
  const log = stubApi(gm, { 'planner-disabled': { success: true } });
  let closed = 0;
  assert.strictEqual(gm.get('_settings').plannerDisabled, undefined, 'предусловие: флага нет');

  gm.call('PROJECT_NAV._togglePlannerFromSettings', gm.call('_projectNavDeps'), true, function () { closed += 1; });
  await settle(10);

  assert.deepStrictEqual(modals, ['plannerDisableConfirm']);
  assert.ok(log.some((c) => c.post === 'planner-disabled' && c.body.disabled === true));
  assert.strictEqual(gm.get('_settings').plannerDisabled, true, 'флаг в памяти — форма при перемонтировании покажет «Включить»');
  assert.strictEqual(closed, 0, 'в project-режиме форму закрывает перерисовка страницы, не колбэк');
  const banner = document.getElementById('plannerDisabledBanner');
  assert.ok(banner && !banner.classList.contains('hidden'), 'баннер «отключён» показан всем');
  assert.ok(document.body.classList.contains('ssp-project-settings-mode'), 'страница настроек перерисована');
});

test('project: включение — без confirm, флаг снят, баннер спрятан', async () => {
  const { gm, document } = createHost();
  fx.applyBaseState(gm);
  gm.set({ _mode: 'project', _activeProjectKey: 'GM', _settings: Object.assign(fx.buildSettings(), { plannerDisabled: true }) });
  const modals = stubConfirm(gm, 'confirm');
  const log = stubApi(gm, { 'planner-disabled': { success: true } });

  gm.call('PROJECT_NAV._togglePlannerFromSettings', gm.call('_projectNavDeps'), false, function () {});
  await settle(10);

  assert.deepStrictEqual(modals, [], 'включение — не разрушительное, подтверждения нет');
  assert.ok(log.some((c) => c.post === 'planner-disabled' && c.body.disabled === false));
  assert.strictEqual(gm.get('_settings').plannerDisabled, undefined, 'ключ снят, а не выставлен в false');
  const banner = document.getElementById('plannerDisabledBanner');
  assert.ok(banner && banner.classList.contains('hidden'), 'баннер «отключён» спрятан');
});
