/**
 * Golden-master: #112 «Напоминания» — контракт «ядро → контроллер → мосты» через монолит-хост.
 *
 *   • reminders-bell — DOM кнопки #remindersBellBtn по четырём ответам POST reminders sync
 *     (три пункта / ноль / мастер выкл / не-адресат): hidden, бейдж, title, открылась ли модалка;
 *   • modal-spec-reminders — спек модалки (recording-стаб __SSP_RING_MODAL.open) + поведение:
 *     закрытие любым способом → onClose ровно один раз → штамп «показано сегодня» в safeLs;
 *     повторная загрузка в режиме daily модалку не открывает, в режиме always — открывает;
 *     клик колокольчика открывает ту же модалку; «Перейти» → setDashNode + applyShareFocus /
 *     setCurrentSprintId по виду пункта;
 *   • S5: при загрузке — без вкладок (withJournal:false), по колокольчику — с журналом:
 *     journal.load() → GET reminders-journal → VM таблицы; journal.remove(id) → POST → VM из
 *     ответа; отказ not_addressee → тост remJrnNoRights + reject, прочий отказ → remJrnDeleteError.
 * React-тело remindersBody не рендерится (граница характеризации — спек).
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { createHost } = require('./monolith-host');
const { checkJsonSnapshot } = require('./snap');
const fx = require('./fixtures/state');

const TODAY = Date.UTC(2026, 8, 9);

async function settle(n) { for (let i = 0; i < (n || 4); i++) await new Promise((r) => setTimeout(r, 0)); }

function serializeSpec(spec) {
  return JSON.parse(JSON.stringify(spec, (k, v) => (typeof v === 'function' ? '<fn>' : v)));
}

const RESP3 = {
  success: true, enabled: true, today: TODAY, count: 3,
  items: [
    { id: 'sprints:sp-1_devBack', module: 'sprints', kind: 'sprintRoleOpen', entityId: 'sp-1_devBack', params: { sprint: 'Спринт 1', role: 'Бэкенд' }, days: 3, ref: { sprintId: 'sp-1', roleKey: 'devBack' } },
    { id: 'capacity:sp-cur', module: 'capacity', kind: 'capacityBefore', entityId: 'sp-cur', params: { sprint: 'Текущий' }, days: -2, ref: { sprintId: 'sp-cur' } },
    { id: 'releases:rel-1', module: 'releases', kind: 'releaseOverdue', entityId: 'rel-1', params: { release: 'R 2026.09', status: 'work' }, days: 0, ref: { releaseId: 'rel-1' } },
  ],
  modules: { sprints: { on: true, addressee: true }, capacity: { on: true, addressee: true }, releases: { on: true, addressee: true } },
};
const RESP0 = Object.assign({}, RESP3, { count: 0, items: [] });
const RESP_OFF = { success: true, enabled: false, count: 0, items: [], modules: {} };
const RESP_NOT_ME = Object.assign({}, RESP3, { count: 0, items: [], modules: { sprints: { on: true, addressee: false }, capacity: { on: false, addressee: true }, releases: { on: true, addressee: false } } });

/* Стабы журнала — держатели: колокольчик привязывает deps ПЕРВОЙ загрузки (в рантайме apiGet/apiPost/toast
   стабильны), поэтому стабы читаются лениво при вызове, а не при загрузке. */
const STUB = { reminders: {}, syncBodies: [], journal: {}, post: function () { return Promise.resolve({}); }, calls: [], toasts: [] };

function boot() {
  const host = createHost();
  fx.applyBaseState(host.gm);
  host.gm.set({ _mode: 'global', _activeProjectKey: 'GM', _projectDisplayName: 'GM Clone', _lang: 'ru',
    apiPost: function (p, body) {
      if (p === 'reminders') { STUB.syncBodies.push(body); return Promise.resolve(STUB.reminders); }   /* загрузка — POST sync (GET в YouTrack read-only) */
      STUB.calls.push(['POST', p, body]); return STUB.post(p, body);
    },
    apiGet: function (p) { if (p === 'reminders-journal') { STUB.calls.push(['GET', p]); return Promise.resolve(STUB.journal); } return Promise.resolve({}); },
    toast: function (msg, type) { STUB.toasts.push([msg, type]); } });
  return host;
}

async function loadWith(host, resp) {
  STUB.reminders = resp;
  host.gm.call('loadReminders');
  await settle();
}

function bellSnap(host) {
  const btn = host.document.getElementById('remindersBellBtn');
  const badge = btn.querySelector('.ssp-reminders__count');
  return { hidden: btn.classList.contains('hidden'), badgeHidden: badge.classList.contains('hidden'), badgeText: badge.textContent, title: btn.title };
}

test('golden: reminders-bell — четыре состояния кнопки + модалка при загрузке', async () => {
  const host = boot();
  const out = {};
  for (const [name, resp] of [['threeItems', RESP3], ['zeroItems', RESP0], ['masterOff', RESP_OFF], ['notAddressee', RESP_NOT_ME]]) {
    const before = host.modalLog.length;
    await loadWith(host, resp);
    out[name] = Object.assign(bellSnap(host), { modalOpened: host.modalLog.length - before });
    /* штамп между прогонами чистим — иначе daily-режим спрячет модалку у следующего ответа */
    host.gm.get('safeLs').del('ssp_reminders_shown');
  }
  checkJsonSnapshot('reminders-bell', out);
});

test('golden: modal-spec-reminders — спек + штамп/повтор/колокольчик/«Перейти»', async () => {
  const host = boot();
  const { gm, modalLog, document } = host;
  const nav = [];
  gm.set({
    _setDashNode: function (n) { nav.push({ node: n }); },
    _applyShareFocus: function (f) { nav.push({ focus: f }); },
    setCurrentSprintId: function (id, o) { nav.push({ sprint: id, confirmed: !!(o && o.confirmed) }); return true; },
  });
  await loadWith(host, RESP3);
  assert.strictEqual(modalLog.length, 1, 'модалка при загрузке открыта');
  const spec = modalLog[0];
  assert.strictEqual(gm.get('safeLs').get('ssp_reminders_shown'), null, 'до закрытия штампа нет');

  /* закрытие крестиком/Esc/backdrop → onClose один раз → штамп проекта = today сервера */
  spec.onClose();
  const stamp = JSON.parse(gm.get('safeLs').get('ssp_reminders_shown'));
  assert.deepStrictEqual(stamp, { GM: TODAY });

  /* daily: повторная загрузка модалку не открывает; колокольчик — открывает */
  await loadWith(host, RESP3);
  assert.strictEqual(modalLog.length, 1, 'daily — повтор не показывает');
  document.getElementById('remindersBellBtn').click();
  assert.strictEqual(modalLog.length, 2, 'колокольчик открывает ту же модалку');

  /* always: штамп игнорируется */
  gm.set({ _settings: Object.assign({}, gm.get('_settings'), { remindersModalMode: 'always' }) });
  await loadWith(host, RESP3);
  assert.strictEqual(modalLog.length, 3, 'always — открывается при каждой загрузке');
  modalLog[2].onClose();
  assert.deepStrictEqual(JSON.parse(gm.get('safeLs').get('ssp_reminders_shown')), { GM: TODAY }, 'always — штамп не пишется');

  /* «Перейти» по трём видам */
  const props = spec.body.props;
  const vmItems = props.vm.sections.map((s) => s.items[0]);
  props.onGo(vmItems[0]); props.onGo(vmItems[1]); props.onGo(vmItems[2]);

  /* S5: при загрузке журнала нет, по колокольчику — есть */
  assert.strictEqual(props.withJournal, false); assert.strictEqual(props.journal, null);
  assert.strictEqual(modalLog[1].body.props.withJournal, true);
  const JOURNAL = { success: true, today: TODAY, journal: [
    { id: 'sprints:sp-1_devBack:' + (TODAY - 3 * 86400000), module: 'sprints', kind: 'sprintRoleOpen', entityId: 'sp-1_devBack', params: { sprint: 'Спринт 1', role: 'Бэкенд' }, firedDay: TODAY - 3 * 86400000, resolvedDay: null, resolvedHow: null, resolvedBy: null },
    { id: 'capacity:sp-0:' + (TODAY - 9 * 86400000), module: 'capacity', kind: 'capacityBefore', entityId: 'sp-0', params: { sprint: 'Нулевой' }, firedDay: TODAY - 9 * 86400000, resolvedDay: TODAY - 7 * 86400000, resolvedHow: 'capacityApproved', resolvedBy: 'pm1' },
  ] };
  STUB.journal = JOURNAL; STUB.calls.length = 0; STUB.toasts.length = 0;
  STUB.post = function (p, body) {
    if (body.id === 'deny') return Promise.reject(new Error('not_addressee [cid-1]'));   /* apiPost отвергает success:false Error-ом «reason [cid]» */
    if (body.id === 'boom') return Promise.reject(new Error('journal_record_not_found [cid-2]'));
    return Promise.resolve({ success: true, today: TODAY, journal: JOURNAL.journal.filter((r) => r.id !== body.id) });
  };
  const bellProps = modalLog[1].body.props;
  const loaded = await bellProps.journal.load();
  const removed = await bellProps.journal.remove(JOURNAL.journal[1].id);
  const denied = await bellProps.journal.remove('deny').then(() => 'resolved', (e) => 'rejected: ' + e.message);
  const failed = await bellProps.journal.remove('boom').then(() => 'resolved', (e) => 'rejected: ' + e.message);

  checkJsonSnapshot('modal-spec-reminders', {
    spec: serializeSpec(spec),
    behavior: { stampAfterClose: stamp, nav: nav },
    sync: { body: STUB.syncBodies[0], loads: STUB.syncBodies.length },
    journal: { calls: STUB.calls, loaded: loaded, removed: removed, denied: denied, failed: failed, toasts: STUB.toasts },
  });
});

/* #126 — настоящий apiPost ядра поверх стаба сетевого слоя: хук записи → afterWrite → sync. */
test('golden: #126 — своя запись, гасящая пункт, пересчитывает колокольчик без перезагрузки и без модалки', async () => {
  const host = createHost();
  fx.applyBaseState(host.gm);
  const { gm, modalLog } = host;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let resp = RESP3;
  const posts = [];
  gm.set({ _mode: 'global', _activeProjectKey: 'GM', _projectDisplayName: 'GM Clone', _lang: 'ru',
    YT_API: {
      apiGet: function () { return Promise.resolve({}); },
      apiPost: function (p) { posts.push(p); return Promise.resolve(p === 'reminders' ? resp : { success: true }); },
    } });
  gm.call('loadReminders');
  await settle();
  assert.strictEqual(bellSnap(host).badgeText, '3');
  /* режим «always»: ошибочный вызов модалки при загрузке из пересчёта был бы виден */
  gm.set({ _settings: Object.assign({}, gm.get('_settings'), { remindersModalMode: 'always' }) });
  const opened = modalLog.length;

  resp = Object.assign({}, RESP3, { count: 2, items: RESP3.items.slice(1) });   /* роль завершена — пункт спринта погас */
  await gm.call('apiPost', 'sprint-data', {});
  await gm.call('apiPost', 'history', { history: [] });
  await wait(650);
  assert.strictEqual(posts.filter((p) => p === 'reminders').length, 2, 'загрузка + ОДИН пересчёт на две записи подряд');
  assert.deepStrictEqual(bellSnap(host), { hidden: false, badgeHidden: false, badgeText: '2', title: bellSnap(host).title });
  assert.strictEqual(modalLog.length, opened, 'пересчёт модалку не открывает');

  /* запись вне списка (черновик) и отвергнутая запись колокольчик не трогают */
  await gm.call('apiPost', 'draft', {});
  gm.set({ YT_API: { apiGet: function () { return Promise.resolve({}); },
    apiPost: function (p) { posts.push(p); return p === 'reminders' ? Promise.resolve(resp) : Promise.reject(new Error('rev_conflict [cid]')); } } });
  await gm.call('apiPost', 'history', {}).catch(() => {});
  await wait(650);
  assert.strictEqual(posts.filter((p) => p === 'reminders').length, 2, 'ни черновик, ни отказ записи sync не зовут');
});
