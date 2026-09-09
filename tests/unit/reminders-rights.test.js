'use strict';
/* #112 «Напоминания» — GET reminders через ПРОД-КЛАСС (backend-project.js → core.ENDPOINTS)
   с mock-ctx (образец authz-67): матрица адресатов — валидатор / планировочный / settings-менеджер /
   представитель релиза / инстанс-админ / никто; флаги modules.*.addressee; мастер выкл — журнал
   не пишется; журнал пишется и идемпотентен; гашение и ленивый архив релизов; в ответе нет чужих
   логинов; глобальный обработчик публикует путь.
   Запуск: node --test tests/unit/reminders-rights.test.js */

const test   = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');

const core = require(path.join(__dirname, '..', '..', 'backend-project.js'));
const calc = require(path.join(__dirname, '..', '..', 'backend-reminders-calc.js'));
const EP = core.ENDPOINTS.find((e) => e.method === 'GET' && e.path === 'reminders');

const DAY = 86400000;
const TODAY = calc.todayOf(Date.now());
const d = (n) => TODAY + n * DAY;

const G_VALIDATOR = { id: 'g-v', name: 'Validators' };
const G_PLANNING  = { id: 'g-p', name: 'Planners' };
const G_ADMIN     = { id: 'g-admin', name: 'Admins' };

const SETTINGS = { validationGroups: [G_VALIDATOR.id], planningManagerGroups: [G_PLANNING.id],
  remindersEnabled: true, capacityMode: 'full', releaseEnabled: true };
const HISTORY = [{ sprintId: 'sp-old_devBack', name: 'Старый', roleKey: 'devBack', roleLabel: 'Бэкенд', status: 'CONFIRMED', dateStart: d(-17), dateEnd: d(-3), confirmedBy: 'val0' }];
const SPRINT = { sprintId: 'sp-cur', name: 'Текущий', dateStart: d(2), dateEnd: d(16) };
const RELEASES = { releases: [{ id: 'rel-1', name: 'Релиз 1', status: 'work', plannedDate: d(-1), roleReps: { manager: 'rep1', engineer: 'rep2' } }] };

function mkCtx(opts) {
  opts = opts || {};
  const props = Object.assign({
    ssp_settings: JSON.stringify(Object.assign({}, SETTINGS, opts.settings || {})),
    ssp_history:  JSON.stringify(opts.history || HISTORY),
    ssp_sprint:   JSON.stringify(opts.sprint === undefined ? SPRINT : opts.sprint),
    ssp_capacity: JSON.stringify(opts.capacity || {}),
    ssp_releases: JSON.stringify(opts.releases || RELEASES)
  }, opts.props || {});
  return {
    settings: { settingsManagerGroup: { id: G_ADMIN.id, name: G_ADMIN.name } },
    currentUser: opts.noUser ? null : {
      id: 'u-1', login: opts.login || 'user1', groups: opts.groups || [],
      hasPermission: opts.instanceAdmin ? function () { return true; } : function () { return false; }
    },
    project: { extensionProperties: props },
    request: { body: '{}', getParameter: () => '' },
    response: { status: 200, body: null, json(v) { this.body = v; } },
    _props: props
  };
}
function call(opts) { const ctx = mkCtx(opts); EP.handle(ctx); return ctx; }
const ids = (ctx) => ctx.response.body.items.map((i) => i.id);
const journalOf = (ctx) => JSON.parse(ctx._props.ssp_reminders).journal;

test('#112 endpoint зарегистрирован в core.ENDPOINTS и в глобальном обработчике', () => {
  assert.ok(EP, 'GET reminders в core.ENDPOINTS');
  const glob = require(path.join(__dirname, '..', '..', 'backend-global.js'));
  assert.ok(glob.httpHandler.endpoints.some((e) => e.scope === 'global' && e.method === 'GET' && e.path === 'reminders'),
    'backend-global.js читает core.ENDPOINTS после require backend-reminders (gotcha #7)');
});

test('#112 валидатор — спринты и релизы (orValidator), ёмкость нет; флаги модулей', () => {
  const ctx = call({ groups: [G_VALIDATOR] });
  const b = ctx.response.body;
  assert.equal(b.success, true);
  assert.equal(b.enabled, true);
  assert.equal(b.today, TODAY);
  assert.deepEqual(ids(ctx), ['sprints:sp-old_devBack', 'releases:rel-1']);
  assert.equal(b.count, 2);
  assert.deepEqual(b.modules, { sprints: { on: true, addressee: true }, capacity: { on: true, addressee: false }, releases: { on: true, addressee: true } });
  const it = b.items[0];
  assert.deepEqual(Object.keys(it).sort(), ['days', 'entityId', 'id', 'kind', 'module', 'params', 'ref']);
  assert.equal(it.days, 3);
  assert.deepEqual(it.ref, { sprintId: 'sp-old', roleKey: 'devBack' });
});

test('#112 планировочный менеджер и settings-менеджер — только ёмкость', () => {
  for (const g of [G_PLANNING, G_ADMIN]) {
    const ctx = call({ groups: [g] });
    assert.deepEqual(ids(ctx), ['capacity:sp-cur'], g.name);
    assert.equal(ctx.response.body.items[0].kind, 'capacityBefore');
    assert.equal(ctx.response.body.items[0].days, -2);
    assert.deepEqual(ctx.response.body.modules.capacity, { on: true, addressee: true });
    assert.equal(ctx.response.body.modules.sprints.addressee, false);
  }
});

test('#112 представитель релиза по логину — только свой релиз; чужой логин — ничего', () => {
  const rm = call({ login: 'rep1' });
  assert.deepEqual(ids(rm), ['releases:rel-1']);
  assert.deepEqual(rm.response.body.modules.releases, { on: true, addressee: true });
  assert.equal(rm.response.body.modules.sprints.addressee, false);
  const ri = call({ login: 'rep2' });
  assert.deepEqual(ids(ri), ['releases:rel-1']);
  const other = call({ login: 'someone' });
  assert.deepEqual(ids(other), []);
  assert.equal(other.response.body.modules.releases.addressee, false);
});

test('#112 никто (нет групп, не представитель) — count 0, но пункты посчитаны и журнал написан (deny-by-default — не дефект)', () => {
  const ctx = call({});
  assert.equal(ctx.response.body.count, 0);
  assert.deepEqual(ctx.response.body.items, []);
  assert.deepEqual(ctx.response.body.modules, { sprints: { on: true, addressee: false }, capacity: { on: true, addressee: false }, releases: { on: true, addressee: false } });
  const j = journalOf(ctx);
  assert.deepEqual(j.map((r) => r.id).sort(), ['capacity:sp-cur:' + TODAY, 'releases:rel-1:' + TODAY, 'sprints:sp-old_devBack:' + TODAY]);
  assert.ok(j.every((r) => r.resolvedDay === null && r.firedDay === TODAY));
});

test('#112 инстанс-админ — адресат всего (байпас #51), даже без групп', () => {
  const ctx = call({ instanceAdmin: true });
  assert.deepEqual(ids(ctx), ['sprints:sp-old_devBack', 'capacity:sp-cur', 'releases:rel-1']);
  assert.ok(Object.values(ctx.response.body.modules).every((m) => m.addressee === true));
});

test('#112 мастер выключен — enabled:false, пусто, журнал не читается и не пишется', () => {
  const ctx = call({ groups: [G_VALIDATOR], settings: { remindersEnabled: false } });
  assert.deepEqual(ctx.response.body, { success: true, enabled: false, count: 0, items: [], modules: {} });
  assert.equal(ctx._props.ssp_reminders, undefined);
  const absent = call({ groups: [G_VALIDATOR], settings: { remindersEnabled: undefined } });
  assert.equal(absent.response.body.enabled, false, 'отсутствие ключа = выключен (после обновления)');
});

test('#112 тумблер модуля выключен — его пунктов нет, modules.<m>.on=false, addressee — по правам', () => {
  const ctx = call({ groups: [G_VALIDATOR], settings: { remindersSprints: false } });
  assert.deepEqual(ids(ctx), ['releases:rel-1']);
  assert.deepEqual(ctx.response.body.modules.sprints, { on: false, addressee: true });
  const light = call({ groups: [G_PLANNING], settings: { capacityMode: 'light' } });
  assert.deepEqual(ids(light), []);
  assert.deepEqual(light.response.body.modules.capacity, { on: false, addressee: true });
});

test('#112 без авторизации — 403 auth_required с cid; settings-блоб отсутствует — enabled:false', () => {
  const ctx = call({ noUser: true });
  assert.equal(ctx.response.status, 403);
  assert.equal(ctx.response.body.reason, 'auth_required');
  assert.ok(ctx.response.body.cid);
  const noSettings = call({ groups: [G_VALIDATOR], props: { ssp_settings: undefined } });
  assert.equal(noSettings.response.body.enabled, false);
});

test('#112 в ответе нет чужих логинов: roleReps и правило адресации не эхом', () => {
  const ctx = call({ groups: [G_VALIDATOR] });
  const s = JSON.stringify(ctx.response.body);
  assert.ok(s.indexOf('rep1') < 0 && s.indexOf('rep2') < 0 && s.indexOf('addressee":"') < 0 && s.indexOf('logins') < 0, s);
});

test('#112 журнал: первый GET пишет три открытые записи; повтор (ретрай read-gate) — байт-в-байт тот же блоб', () => {
  const ctx = call({ groups: [G_VALIDATOR] });
  const first = ctx._props.ssp_reminders;
  const blob = JSON.parse(first);
  assert.equal(blob.pluginVersion, core.CURRENT_PLUGIN_VERSION);
  assert.equal(blob.journal.length, 3);
  const again = call({ groups: [G_VALIDATOR], props: { ssp_reminders: first } });
  assert.equal(again._props.ssp_reminders, first, 'reconcile — функция состояния: без изменений запись не повторяется');
});

test('#112 журнал: роль завершили → запись гаснет roleFinished/finishedBy; ёмкость утвердили → capacityApproved/approvedBy', () => {
  const seed = call({})._props.ssp_reminders;
  const done = call({ props: { ssp_reminders: seed },
    history: [Object.assign({}, HISTORY[0], { status: 'FINISHED', finishedBy: 'val1' })],
    capacity: { 'sp-cur': { status: 'approved', dirty: false, approvedBy: 'pm1' } } });
  const j = journalOf(done);
  const sp = j.find((r) => r.module === 'sprints');
  assert.deepEqual([sp.resolvedDay, sp.resolvedHow, sp.resolvedBy], [TODAY, 'roleFinished', 'val1']);
  const cap = j.find((r) => r.module === 'capacity');
  assert.deepEqual([cap.resolvedDay, cap.resolvedHow, cap.resolvedBy], [TODAY, 'capacityApproved', 'pm1']);
  assert.equal(j.find((r) => r.module === 'releases').resolvedDay, null, 'релиз всё ещё активен');
  assert.deepEqual(ids(done), [], 'без прав — пусто, но журнал сверен');
});

test('#112 журнал: релиз ушёл в архив выпущенным → архив дочитан лениво, запись гаснет released/updatedBy', () => {
  const seed = call({})._props.ssp_reminders;
  const ctx = call({ props: { ssp_reminders: seed,
    ssp_releases_archive: JSON.stringify({ releases: [{ id: 'rel-1', name: 'Релиз 1', status: 'released', plannedDate: d(-1), updatedBy: 'rm9' }] }) },
    releases: { releases: [] } });
  const r = journalOf(ctx).find((x) => x.module === 'releases');
  assert.deepEqual([r.resolvedDay, r.resolvedHow, r.resolvedBy], [TODAY, 'released', 'rm9']);
  const gone = call({ props: { ssp_reminders: seed }, releases: { releases: [] } });
  assert.equal(journalOf(gone).find((x) => x.module === 'releases').resolvedHow, 'gone', 'ни в активе, ни в архиве');
});

test('#112 журнал: модуль выключили → его открытые записи гаснут moduleOff', () => {
  const seed = call({})._props.ssp_reminders;
  const ctx = call({ props: { ssp_reminders: seed }, settings: { remindersReleases: false } });
  const r = journalOf(ctx).find((x) => x.module === 'releases');
  assert.deepEqual([r.resolvedDay, r.resolvedHow, r.resolvedBy], [TODAY, 'moduleOff', null]);
});

test('#112 журнал: битый блоб не ломает ответ — перезаписывается валидным; ошибка setProp не валит ответ', () => {
  const ctx = call({ groups: [G_VALIDATOR], props: { ssp_reminders: '{broken' } });
  assert.equal(ctx.response.body.success, true);
  assert.equal(journalOf(ctx).length, 3);
  const frozen = mkCtx({ groups: [G_VALIDATOR] });
  Object.defineProperty(frozen.project.extensionProperties, 'ssp_reminders', { set() { throw new Error('boom'); }, get() { return undefined; } });
  const warned = [];
  const orig = console.warn; console.warn = (m) => warned.push(String(m));
  try { EP.handle(frozen); } finally { console.warn = orig; }
  assert.equal(frozen.response.body.success, true);
  assert.equal(frozen.response.body.count, 2);
  assert.ok(warned.some((m) => /reminders journal skipped: set_prop_failed/.test(m) && /cid-/.test(m)), warned.join('|'));
});
