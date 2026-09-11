'use strict';

/* #120 (v3.45.0) — фазы работ спринта: POST sprint-data?action=phases (сателлит backend-phases.js
 * через делегацию ядра) + серверная принадлежность фаз (applyStored на прочих записях).
 * Mock ctx — по образцу sprint-rev-lock.test.js. Каждый негативный кейс отличается от валидного
 * ровно одним полем; утверждения «сверять rev только если слот держит спринт» и «границы только
 * для изменённых фаз» обязаны падать на вариантах «сверять/проверять всегда» (проверено).
 * Запуск: node --test 'tests/unit/phases-backend.test.js'. */

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const core = require(path.join(__dirname, '..', '..', 'backend-project.js'));
const phasesMod = require(path.join(__dirname, '..', '..', 'backend-phases.js'));
const DP = require(path.join(__dirname, '..', '..', 'widgets', 'main', 'src', 'pure', 'date-pure.js'));

const POST_SPRINT = core.ENDPOINTS.find((e) => e.method === 'POST' && e.path === 'sprint-data');
const POST_HISTORY = core.ENDPOINTS.find((e) => e.method === 'POST' && e.path === 'history');

const DAY = 86400000;
const S0 = Date.UTC(2026, 9, 5);          /* 5 окт 2026 */
const S1 = Date.UTC(2026, 9, 30);         /* 30 окт 2026 */
const SID = 'sprint-2026-10';

function pair(fromDay, toDay) { return { dateStart: S0 + fromDay * DAY, dateEnd: S0 + toDay * DAY }; }
function sixPhases(over) {
  return Object.assign({ analysis: pair(0, 3), development: pair(2, 14), techTest: pair(14, 19), regression: pair(21, 23), bizTest: pair(21, 24), deploy: pair(25, 25) }, over || {});
}
function slotSprint(over) {
  return Object.assign({ sprintId: SID, name: 'Спринт октябрь', status: 'PLANNING', dateStart: S0, dateEnd: S1, _rev: 5 }, over || {});
}
function snap(rk, over) {
  return Object.assign({ sprintId: SID + '_' + rk, roleKey: rk, roleLabel: rk, name: 'Спринт октябрь', status: 'CONFIRMED',
    dateStart: S0, dateEnd: S1, confirmedAt: S0, confirmedBy: 'fixture_user_1', agreed: { at: S0, items: {} } }, over || {});
}

/* groups: ['editor'|'validator'|'admin'] → членство в группах настроек проекта. */
function mkCtx(opts) {
  opts = opts || {};
  const settings = Object.assign({ editGroups: ['g-edit'], validationGroups: ['g-val'], phasesEnabled: true }, opts.settings || {});
  const props = {
    ssp_settings: JSON.stringify(settings),
    ssp_sprint: opts.slot ? JSON.stringify(opts.slot) : '',
    ssp_history: opts.history ? JSON.stringify(opts.history) : '',
    ssp_history_rev: opts.historyRev !== undefined ? String(opts.historyRev) : '',
  };
  const groups = (opts.groups || ['editor']).map((g) => ({ editor: { id: 'g-edit', name: 'g-edit' }, validator: { id: 'g-val', name: 'g-val' } }[g])).filter(Boolean);
  const params = Object.assign({ action: 'phases' }, opts.params || {});
  return {
    settings: { settingsManagerGroup: { id: 'g-admin', name: 'Admins' } },
    currentUser: { id: 'u-1', login: 'user1', fullName: 'Иванов И. И.', groups: groups },
    project: { extensionProperties: props },
    request: { body: JSON.stringify(opts.body), getParameter: (k) => params[k] || '' },
    response: { status: 200, body: null, json(v) { this.body = v; } },
    _props: props,
  };
}
function call(ep, ctx) { ep.handle(ctx); return ctx; }
function stored(ctx, key) { return core.parseJson(ctx._props[key], null); }

/* ── права ── */
test('#120 права: viewer → 403; validator без editor → 200; editor → 200; тумблер выключен → phases_disabled', () => {
  const body = { sprint: { sprintId: SID, phases: sixPhases() }, baseRev: 5 };
  const v = call(POST_SPRINT, mkCtx({ groups: [], slot: slotSprint(), body }));
  assert.strictEqual(v.response.status, 403);
  const val = call(POST_SPRINT, mkCtx({ groups: ['validator'], slot: slotSprint(), body }));
  assert.strictEqual(val.response.status, 200); assert.strictEqual(val.response.body.success, true);
  const ed = call(POST_SPRINT, mkCtx({ groups: ['editor'], slot: slotSprint(), body }));
  assert.strictEqual(ed.response.body.success, true);
  const off = call(POST_SPRINT, mkCtx({ slot: slotSprint(), body, settings: { phasesEnabled: false } }));
  assert.strictEqual(off.response.status, 400); assert.strictEqual(off.response.body.reason, 'phases_disabled');
  assert.match(String(off.response.body.cid), /^cid-/);
});

/* ── rev ── */
test('#120 rev: слот держит спринт + baseRev ≠ _rev → 409; слот держит ДРУГОЙ спринт + протухший baseRev → 200', () => {
  const body = { sprint: { sprintId: SID, phases: sixPhases() }, baseRev: 3 };
  const c = call(POST_SPRINT, mkCtx({ slot: slotSprint({ _rev: 5 }), body }));
  assert.strictEqual(c.response.status, 409); assert.strictEqual(c.response.body.error, 'rev_conflict');
  assert.strictEqual(stored(c, 'ssp_sprint').phases, undefined, 'при конфликте ничего не записано');
  /* спринт живёт только снимками, слот держит чужой спринт с _rev 5, клиент прислал 3 */
  const other = call(POST_SPRINT, mkCtx({ slot: slotSprint({ sprintId: 'other', _rev: 5 }), history: [snap('testing')], body }));
  assert.strictEqual(other.response.status, 200, 'слот с чужим спринтом на конфликт не сверяется');
  assert.strictEqual(other.response.body.rev, undefined, 'rev слота не возвращается — слот не трогали');
  assert.strictEqual(stored(other, 'ssp_sprint').sprintId, 'other');
  assert.strictEqual(stored(other, 'ssp_sprint').phases, undefined, 'чужой слот не тронут');
  const noRev = call(POST_SPRINT, mkCtx({ slot: slotSprint(), body: { sprint: { sprintId: SID, phases: sixPhases() } } }));
  assert.strictEqual(noRev.response.body.reason, 'base_rev_required');
});

/* ── форма и поиск спринта ── */
test('#120 форма: лишний ключ / половинка / конец раньше начала / массив → invalid_phases_structure:*; тело без phases → invalid_phases_body', () => {
  const run = (phases) => call(POST_SPRINT, mkCtx({ slot: slotSprint(), body: { sprint: { sprintId: SID, phases }, baseRev: 5 } })).response.body.reason;
  assert.strictEqual(run(sixPhases({ extra: pair(1, 2) })), 'invalid_phases_structure:shape');
  assert.strictEqual(run(sixPhases({ deploy: { dateStart: S0 } })), 'invalid_phases_structure:deploy');
  assert.strictEqual(run(sixPhases({ deploy: { dateStart: S0 + 3 * DAY, dateEnd: S0 } })), 'invalid_phases_structure:deploy');
  assert.strictEqual(run([pair(0, 1)]), 'invalid_phases_body');
  assert.strictEqual(run(sixPhases({ techTest: [S0, S1] })), 'invalid_phases_structure:techTest');
  assert.strictEqual(call(POST_SPRINT, mkCtx({ slot: slotSprint(), body: { sprint: { sprintId: SID }, baseRev: 5 } })).response.body.reason, 'invalid_phases_body');
});

test('#120 поиск: sprintId не найден → sprint_not_found; все снимки FINISHED → sprint_finished; смешанный статус → 200; нет дат → sprint_dates_missing', () => {
  const body = { sprint: { sprintId: SID, phases: sixPhases() }, baseRev: 0 };
  assert.strictEqual(call(POST_SPRINT, mkCtx({ slot: slotSprint({ sprintId: 'other' }), history: [], body })).response.body.reason, 'sprint_not_found');
  assert.strictEqual(call(POST_SPRINT, mkCtx({ history: [snap('testing', { status: 'FINISHED' }), snap('analysis', { status: 'FINISHED' })], body })).response.body.reason, 'sprint_finished');
  const mixed = call(POST_SPRINT, mkCtx({ history: [snap('testing', { status: 'FINISHED' }), snap('analysis', { status: 'CONFIRMED' })], body }));
  assert.strictEqual(mixed.response.body.success, true, 'смешанный статус ролей — не завершён');
  assert.strictEqual(call(POST_SPRINT, mkCtx({ slot: slotSprint({ dateStart: null, dateEnd: null }), body: Object.assign({}, body, { baseRev: 5 }) })).response.body.reason, 'sprint_dates_missing');
});

/* ── границы ── */
test('#120 границы: изменённая фаза вне спринта → phases_out_of_sprint:<key> + errors[]; неизменённая вне (спринт сузили) + правка другой → 200', () => {
  const out = call(POST_SPRINT, mkCtx({ slot: slotSprint(), body: { sprint: { sprintId: SID, phases: sixPhases({ deploy: pair(25, 27) }) }, baseRev: 5 } }));
  assert.strictEqual(out.response.status, 400);
  assert.strictEqual(out.response.body.reason, 'phases_out_of_sprint:deploy');
  assert.deepStrictEqual(out.response.body.errors, [{ phase: 'deploy', code: 'phases_out_of_sprint', sprintDateStart: S0, sprintDateEnd: S1 }]);
  assert.match(String(out.response.body.cid), /^cid-/);
  assert.strictEqual(stored(out, 'ssp_sprint').phases, undefined, 'отказ — записи нет');
  /* сохранённый deploy стоит за новой границей спринта (26 окт), правится только analysis */
  const narrowed = slotSprint({ dateEnd: S0 + 21 * DAY, phases: sixPhases({ deploy: pair(25, 25) }), phasesUpdatedAt: S0, phasesUpdatedBy: 'x' });
  const ok = call(POST_SPRINT, mkCtx({ slot: narrowed, body: { sprint: { sprintId: SID, phases: sixPhases({ analysis: pair(0, 4), deploy: pair(25, 25) }) }, baseRev: 5 } }));
  assert.strictEqual(ok.response.status, 200, 'старая фаза за границей не блокирует правку другой: ' + JSON.stringify(ok.response.body));
  assert.deepStrictEqual(ok.response.body.phases.deploy, pair(25, 25));
});

/* ── fan-out ── */
test('#120 fan-out: слот + три снимка получают одинаковые фазы и штампы, rev слота +1, rev истории +1, статусы/agreed снимков нетронуты, чужой спринт не тронут', () => {
  const foreign = snap('testing', { sprintId: 'other_testing', phases: { deploy: pair(1, 1) } });
  const hist = [snap('testing'), snap('analysis', { status: 'ALLOCATED', agreed: { at: S0 + DAY, by: 'q', items: { 'A-1': { e: 60 } } } }), snap('devBack', { status: 'PLANNING' }), foreign];
  const ctx = call(POST_SPRINT, mkCtx({ slot: slotSprint({ _rev: 5 }), history: hist, historyRev: 7, body: { sprint: { sprintId: SID, phases: sixPhases() }, baseRev: 5 } }));
  const r = ctx.response.body;
  assert.strictEqual(r.success, true);
  assert.deepStrictEqual({ action: r.action, sprintId: r.sprintId, changed: r.changed, rev: r.rev, historyRev: r.historyRev, snaps: r.snaps, by: r.phasesUpdatedBy },
    { action: 'phases', sprintId: SID, changed: true, rev: 6, historyRev: 8, snaps: 3, by: 'Иванов И. И.' });
  assert.strictEqual(typeof r.phasesUpdatedAt, 'number');
  const slot = stored(ctx, 'ssp_sprint');
  assert.deepStrictEqual(slot.phases, sixPhases()); assert.strictEqual(slot._rev, 6); assert.strictEqual(slot.phasesUpdatedBy, 'Иванов И. И.');
  const h = stored(ctx, 'ssp_history');
  h.filter((x) => x.sprintId !== 'other_testing').forEach((x, i) => {
    assert.deepStrictEqual(x.phases, sixPhases(), 'снимок ' + x.sprintId);
    assert.strictEqual(x.phasesUpdatedAt, r.phasesUpdatedAt);
    assert.strictEqual(x.status, hist[i].status, 'статус нетронут');
    assert.deepStrictEqual(x.agreed, hist[i].agreed, 'agreed нетронут');
    assert.strictEqual(x.pluginVersion, core.CURRENT_PLUGIN_VERSION);
  });
  assert.deepStrictEqual(h.find((x) => x.sprintId === 'other_testing').phases, { deploy: pair(1, 1) }, 'чужой спринт не тронут');
  assert.strictEqual(ctx._props.ssp_history_rev, '8');
});

test('#120 changed:false — те же даты (в т.ч. не-полуночные ms того же дня) → нет записи, ревизии прежние', () => {
  const slot = slotSprint({ _rev: 5, phases: sixPhases(), phasesUpdatedAt: S0, phasesUpdatedBy: 'Петров' });
  const noon = sixPhases({ analysis: { dateStart: S0 + 12 * 3600000, dateEnd: S0 + 3 * DAY + 3600000 } });
  const ctx = call(POST_SPRINT, mkCtx({ slot, history: [snap('testing', { phases: sixPhases() })], historyRev: 7, body: { sprint: { sprintId: SID, phases: noon }, baseRev: 5 } }));
  const r = ctx.response.body;
  assert.strictEqual(r.changed, false);
  assert.strictEqual(r.rev, 5); assert.strictEqual(r.historyRev, undefined);
  assert.strictEqual(r.phasesUpdatedBy, 'Петров');
  assert.strictEqual(stored(ctx, 'ssp_sprint')._rev, 5, 'rev слота не двигался');
  assert.strictEqual(ctx._props.ssp_history_rev, '7');
});

/* ── applyStored: серверная принадлежность ── */
test('#120 applyStored: full POST history без phases поверх хранимой с фазами → фазы остались; с ДРУГИМИ phases → хранимые победили', () => {
  const kept = sixPhases();
  const hist = [snap('testing', { phases: kept, phasesUpdatedAt: S0, phasesUpdatedBy: 'Петров' })];
  const noKeys = snap('testing');
  const c1 = call(POST_HISTORY, mkCtx({ groups: ['validator'], history: hist, historyRev: 1, params: { action: '' }, body: { history: [noKeys], baseRev: 1 } }));
  assert.strictEqual(c1.response.body.success, true, JSON.stringify(c1.response.body));
  assert.deepStrictEqual(stored(c1, 'ssp_history')[0].phases, kept);
  assert.strictEqual(stored(c1, 'ssp_history')[0].phasesUpdatedBy, 'Петров');
  const different = snap('testing', { phases: sixPhases({ deploy: pair(20, 20) }), phasesUpdatedAt: S1, phasesUpdatedBy: 'клиент' });
  const c2 = call(POST_HISTORY, mkCtx({ groups: ['validator'], history: hist, historyRev: 1, params: { action: '' }, body: { history: [different], baseRev: 1 } }));
  assert.deepStrictEqual(stored(c2, 'ssp_history')[0].phases, kept, 'клиентские фазы не прошли');
  assert.strictEqual(stored(c2, 'ssp_history')[0].phasesUpdatedBy, 'Петров');
});

test('#120 applyStored: POST sprint-data слота спринта, у которого фазы в истории → слот их получил; спринт без носителя с фазами → приняты', () => {
  const inHist = sixPhases({ techTest: null });
  const c1 = call(POST_SPRINT, mkCtx({ history: [snap('testing', { phases: inHist, phasesUpdatedAt: S0, phasesUpdatedBy: 'Петров' })], params: { action: '' },
    body: { sprint: slotSprint(), baseRev: 0 } }));
  assert.strictEqual(c1.response.body.success, true, JSON.stringify(c1.response.body));
  assert.deepStrictEqual(stored(c1, 'ssp_sprint').phases, inHist);
  const fresh = call(POST_SPRINT, mkCtx({ history: [], params: { action: '' },
    body: { sprint: slotSprint({ sprintId: 'brand-new', phases: sixPhases(), phasesUpdatedAt: S0, phasesUpdatedBy: 'импорт' }), baseRev: 0 } }));
  assert.strictEqual(fresh.response.body.success, true, JSON.stringify(fresh.response.body));
  assert.deepStrictEqual(stored(fresh, 'ssp_sprint').phases, sixPhases(), 'носителя нет — входящие приняты');
  assert.strictEqual(stored(fresh, 'ssp_sprint').phasesUpdatedBy, 'импорт');
});

test('#120 applyStored: import-replace с фазами в файле → приняты; snapshot upsert → сохранённые фазы переживают', () => {
  const ir = call(POST_HISTORY, mkCtx({ groups: ['validator'], history: [], params: { action: 'import-replace' },
    settings: { historyClearGroups: ['g-val'] }, body: { history: [snap('testing', { phases: sixPhases(), phasesUpdatedBy: 'бэкап' })] } }));
  assert.strictEqual(ir.response.body.success, true, JSON.stringify(ir.response.body));
  assert.deepStrictEqual(stored(ir, 'ssp_history')[0].phases, sixPhases());
  const kept = sixPhases({ deploy: null });
  const sn = call(POST_HISTORY, mkCtx({ history: [snap('testing', { phases: kept, phasesUpdatedBy: 'Петров' })], historyRev: 2, params: { action: 'snapshot' },
    body: { history: [snap('testing', { name: 'обновлённый' })], baseRev: 2 } }));
  assert.strictEqual(sn.response.body.success, true, JSON.stringify(sn.response.body));
  assert.strictEqual(stored(sn, 'ssp_history')[0].name, 'обновлённый');
  assert.deepStrictEqual(stored(sn, 'ssp_history')[0].phases, kept, 'upsert снимка не теряет фазы');
});

/* ── read/write валидаторы ── */
test('#120 read: снимок с битым phases → validateHistoryForRead снимает ключи с WARN_PHASES_DROPPED; validateHistoryForWrite отвергает; слот — симметрично', () => {
  const bad = snap('testing', { phases: { deploy: { dateStart: 'x', dateEnd: 1 } }, phasesUpdatedAt: S0, phasesUpdatedBy: 'q' });
  assert.strictEqual(core.validateHistoryForWrite([JSON.parse(JSON.stringify(bad))]), false);
  const rec = JSON.parse(JSON.stringify(bad));
  assert.notStrictEqual(core.validateHistoryForRead([rec]), false);
  assert.ok(!('phases' in rec) && !('phasesUpdatedAt' in rec) && !('phasesUpdatedBy' in rec));
  assert.ok(rec.migrationLog.some((e) => e.level === 'WARN_PHASES_DROPPED' && /deploy/.test(e.key)));
  const good = snap('testing', { phases: sixPhases({ deploy: null }) });
  assert.strictEqual(core.validateHistoryForWrite([good]), true);
  const badSlot = slotSprint({ phases: { analysis: pair(3, 1) } });
  assert.strictEqual(core.validateSprintForWrite(JSON.parse(JSON.stringify(badSlot))), false);
  const rs = JSON.parse(JSON.stringify(badSlot));
  assert.strictEqual(core.validateSprintForRead(rs), true);
  assert.ok(!('phases' in rs) && rs.migrationLog.some((e) => e.level === 'WARN_PHASES_DROPPED'));
  assert.strictEqual(core.validateSprintForWrite(slotSprint({ phases: sixPhases(), phasesUpdatedAt: S0, phasesUpdatedBy: 'q' })), true);
  assert.strictEqual(core.validateSprintForWrite(slotSprint({ phasesUpdatedBy: 'x'.repeat(201) })), false);
});

/* ── dayMs сателлита = date-pure ── */
test('#120 dayMs сателлита = pure/date-pure.dayMs на выборке (полночь UTC, полдень UTC, локальные полуночи ±11 ч)', () => {
  const samples = [S0, S0 + 12 * 3600000, S0 + 12 * 3600000 + 1, S0 - 11 * 3600000, S0 + 11 * 3600000, S0 - 3 * 3600000, S0 + 7 * 3600000];
  samples.forEach((ts) => assert.strictEqual(phasesMod.dayMs(ts), DP.dayMs(ts), String(ts)));
  assert.notStrictEqual(phasesMod.dayMs(S0 + 12 * 3600000 + 1), phasesMod.dayMs(S0), 'полдень+1мс — следующий день (assert способен упасть при Math.floor)');
});
