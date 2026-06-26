'use strict';
/* #45 R2 — backend-capacity.js: валидаторы (атомарные календарь/отсутствия с reason-кодами)
 * + endpoint-логика через mock-ctx (authz-тиры, статусная машина approve/reapprove,
 * no-client-claims, nested-key round-trip gotcha #8, защита окна спринта #2).
 * Импорт — через backend-project.js (ре-экспорт backend-capacity). */

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const backend = require(path.join(__dirname, '..', '..', 'backend-project.js'));
const {
  validateCalendarForWrite, validateAbsencesForWrite, validateCapacityForWrite,
  handlePostCapacity, handleGetCapacity, handlePostCalendar, handlePostAbsences, handleGetCalendar
} = backend;

const JUN = function (d) { return Date.UTC(2026, 5, d); };

/* ── mock-стенд: общий props-словарь, свежий ctx на запрос ──────────────────── */
function Stand(initialProps) {
  this.props = Object.assign({}, initialProps || {});
}
Stand.prototype.ctx = function (opts) {
  opts = opts || {};
  const props = this.props;
  const role = opts.role || 'planner'; // planner | admin | outsider | anon
  let currentUser;
  if (role === 'anon') currentUser = null;
  else if (role === 'admin') currentUser = { login: opts.login || 'adminUser', groups: [{ id: 'mgr', name: 'mgr' }] };
  else if (role === 'planner') currentUser = { login: opts.login || 'plannerUser', groups: [{ id: 'gP', name: 'Planners' }] };
  else currentUser = { login: opts.login || 'outsider', groups: [{ id: 'gX', name: 'Other' }] };
  // ssp_settings: planningManagerGroups=['gP'] (+ kpe/часы для constants)
  if (props.ssp_settings === undefined) {
    props.ssp_settings = JSON.stringify({
      planningManagerGroups: ['gP'], planningManagerGroupNames: [],
      kpe: { Middle: 0.65, Senior: 0.75 }, hoursPerDay: 8, usefulHoursPerDay: 6
    });
  }
  const res = { status: 200, _out: null, json: function (o) { this._out = o; } };
  return {
    project: { extensionProperties: props },
    settings: { settingsManagerGroup: opts.unconfigured ? null : 'mgr', enableDebugLog: false },
    currentUser: currentUser,
    request: {
      body: opts.body === undefined ? null : (typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body)),
      getParameter: function (k) { return (opts.params && opts.params[k] !== undefined) ? opts.params[k] : null; }
    },
    response: res,
    _res: function () { return res; }
  };
};

function seedSprint(stand, sprintId, start, end) {
  stand.props.ssp_sprint = JSON.stringify({ sprintId: sprintId, dateStart: start, dateEnd: end });
}

/* ═══════════════════ Валидатор календаря (атомарно) ═══════════════════ */

test('calendar: валидный → ok + normalized', () => {
  const r = validateCalendarForWrite({ years: { '2026': [
    { date: '2026-01-01', type: 'holiday', hoursDelta: 0 },
    { date: '2026-04-30', type: 'short', hoursDelta: -1 },
    { date: '2026-05-11', type: 'workday', hoursDelta: 0 }
  ] } });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.normalized.years['2026'].length, 3);
});
test('calendar: невалидный type → reject + код invalid_type (без эха значения)', () => {
  const r = validateCalendarForWrite({ years: { '2026': [{ date: '2026-01-01', type: 'bogus', hoursDelta: 0 }] } });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.errors[0].code, 'invalid_type');
  assert.ok(!('value' in r.errors[0]), 'reason-код не должен эхоить значение');
});
test('calendar: нечисловой hoursDelta на short → invalid_delta', () => {
  const r = validateCalendarForWrite({ years: { '2026': [{ date: '2026-01-01', type: 'short', hoursDelta: 'x' }] } });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.errors[0].code, 'invalid_delta');
});
test('calendar: hoursDelta≠0 на holiday → delta_must_be_zero', () => {
  const r = validateCalendarForWrite({ years: { '2026': [{ date: '2026-01-01', type: 'holiday', hoursDelta: -1 }] } });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.errors[0].code, 'delta_must_be_zero');
});
test('calendar: дата вне ISO → invalid_date', () => {
  const r = validateCalendarForWrite({ years: { '2026': [{ date: '2026-13-40', type: 'holiday', hoursDelta: 0 }] } });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.errors[0].code, 'invalid_date');
});
test('calendar: дубль дат → duplicate_date', () => {
  const r = validateCalendarForWrite({ years: { '2026': [
    { date: '2026-01-01', type: 'holiday', hoursDelta: 0 },
    { date: '2026-01-01', type: 'workday', hoursDelta: 0 }
  ] } });
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors.some(function (e) { return e.code === 'duplicate_date'; }));
});
test('calendar: год записи ≠ ключ года → year_mismatch', () => {
  const r = validateCalendarForWrite({ years: { '2026': [{ date: '2027-01-01', type: 'holiday', hoursDelta: 0 }] } });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.errors[0].code, 'year_mismatch');
});
test('calendar: атомарность — несколько ошибок собраны, файл отклонён целиком', () => {
  const r = validateCalendarForWrite({ years: { '2026': [
    { date: 'BAD', type: 'holiday', hoursDelta: 0 },
    { date: '2026-01-02', type: 'nope', hoursDelta: 0 }
  ] } });
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors.length >= 2);
});

/* ═══════════════════ Валидатор отсутствий ═══════════════════ */

test('absences: валидный → ok', () => {
  const r = validateAbsencesForWrite({ alice: [{ from: '2026-06-23', to: '2026-06-25', type: 'vacation' }] });
  assert.strictEqual(r.ok, true);
});
test('absences: from>to → from_after_to', () => {
  const r = validateAbsencesForWrite({ alice: [{ from: '2026-06-25', to: '2026-06-23', type: 'vacation' }] });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.errors[0].code, 'from_after_to');
});
test('absences: невалидный type → invalid_type', () => {
  const r = validateAbsencesForWrite({ alice: [{ from: '2026-06-23', to: '2026-06-25', type: 'holiday-trip' }] });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.errors[0].code, 'invalid_type');
});
test('absences: лишние ключи записи отфильтрованы (whitelist entry)', () => {
  const r = validateAbsencesForWrite({ alice: [{ from: '2026-06-23', to: '2026-06-25', type: 'vacation', evil: 1 }] });
  assert.strictEqual(r.ok, true);
  assert.ok(!('evil' in r.normalized.alice[0]));
});

/* ═══════════════════ Валидатор записи ёмкости ═══════════════════ */

test('capacity record: валидный (primitives) → true', () => {
  assert.strictEqual(validateCapacityForWrite({
    persons: { a: { grade: 'Middle', rate: 1, alloc: { analysis: 0.5, testing: 0.5 } } }
  }), true);
});
test('capacity record: alloc вне [0..1] → false', () => {
  assert.strictEqual(validateCapacityForWrite({ persons: { a: { alloc: { analysis: 1.5 } } } }), false);
});
test('capacity record: rate вне [0..1] → false', () => {
  assert.strictEqual(validateCapacityForWrite({ persons: { a: { rate: 2 } } }), false);
});
test('capacity record: неизвестный status → false', () => {
  assert.strictEqual(validateCapacityForWrite({ status: 'frozen' }), false);
});
test('capacity record: пустой/без полей → true (всё optional)', () => {
  assert.strictEqual(validateCapacityForWrite({}), true);
});
test('capacity record: participation вне [0..1] → false (per-person множитель)', () => {
  assert.strictEqual(validateCapacityForWrite({ persons: { a: { participation: 1.5 } } }), false);
  assert.strictEqual(validateCapacityForWrite({ persons: { a: { participation: 0.8 } } }), true);
});
test('#2 regression: alloc-ключ не из ROLE_KEYS → false (data-integrity)', () => {
  assert.strictEqual(validateCapacityForWrite({ persons: { a: { alloc: { '__weird role!!': 0.5 } } } }), false);
  assert.strictEqual(validateCapacityForWrite({ persons: { a: { alloc: { analysis: 0.5 } } } }), true);
});

/* ═══════════════════ Endpoint authz-тиры ═══════════════════ */

test('POST /capacity: outsider (не планировочный) → 403', () => {
  const s = new Stand(); seedSprint(s, 'S1', JUN(1), JUN(5));
  const ctx = s.ctx({ role: 'outsider', params: { sprintId: 'S1', action: 'save' }, body: { persons: {} } });
  handlePostCapacity(ctx);
  assert.strictEqual(ctx._res().status, 403);
});
test('POST /capacity: planner (планировочный тир) → ok', () => {
  const s = new Stand(); seedSprint(s, 'S1', JUN(1), JUN(5));
  const ctx = s.ctx({ role: 'planner', params: { sprintId: 'S1', action: 'save' }, body: { persons: { a: { grade: 'Middle', rate: 1, alloc: { analysis: 1 } } } } });
  handlePostCapacity(ctx);
  assert.strictEqual(ctx._res()._out.success, true);
});
test('POST /calendar: planner (НЕ admin) → 403; admin → ok', () => {
  const s = new Stand();
  const calBody = { years: { '2026': [{ date: '2026-01-01', type: 'holiday', hoursDelta: 0 }] } };
  const c1 = s.ctx({ role: 'planner', body: calBody });
  handlePostCalendar(c1);
  assert.strictEqual(c1._res().status, 403);
  const c2 = s.ctx({ role: 'admin', body: calBody });
  handlePostCalendar(c2);
  assert.strictEqual(c2._res()._out.success, true);
});

/* ═══════════════════ Статусная машина + no-client-claims ═══════════════════ */

test('save → draft (status draft, dirty false), GET возвращает запись', () => {
  const s = new Stand(); seedSprint(s, 'S1', JUN(1), JUN(5));
  const save = s.ctx({ role: 'planner', params: { sprintId: 'S1', action: 'save' }, body: { persons: { a: { grade: 'Middle', rate: 1, alloc: { analysis: 1 } } } } });
  handlePostCapacity(save);
  const rec = save._res()._out.capacity;
  assert.strictEqual(rec.status, 'draft');
  assert.strictEqual(rec.dirty, false);
  assert.strictEqual(rec.persons.a.base, 40 * 0.65); // working 40 (Пн-Пт), Middle
  const get = s.ctx({ role: 'planner', params: { sprintId: 'S1' } });
  handleGetCapacity(get);
  assert.strictEqual(get._res()._out.capacity.status, 'draft');
});

test('no-client-claims: клиентский base игнорируется, сервер пересчитывает', () => {
  const s = new Stand(); seedSprint(s, 'S1', JUN(1), JUN(5));
  const ctx = s.ctx({ role: 'planner', params: { sprintId: 'S1', action: 'save' },
    body: { persons: { a: { grade: 'Middle', rate: 1, alloc: { analysis: 1 }, base: 99999 } } } });
  handlePostCapacity(ctx);
  assert.strictEqual(ctx._res()._out.capacity.persons.a.base, 26); // 40×0.65, НЕ 99999
});

test('approve: Σ alloc>1 → 400 alloc_sum_exceeds_100 (hard-block D1a)', () => {
  const s = new Stand(); seedSprint(s, 'S1', JUN(1), JUN(5));
  const ctx = s.ctx({ role: 'planner', params: { sprintId: 'S1', action: 'approve' },
    body: { persons: { a: { grade: 'Middle', rate: 1, alloc: { analysis: 0.6, testing: 0.6 } } } } });
  handlePostCapacity(ctx);
  assert.strictEqual(ctx._res().status, 400);
  assert.strictEqual(ctx._res()._out.reason, 'alloc_sum_exceeds_100');
});

test('approve: status approved, dirty false, approvedBy из ctx (не из тела #14)', () => {
  const s = new Stand(); seedSprint(s, 'S1', JUN(1), JUN(5));
  const ctx = s.ctx({ role: 'planner', login: 'realApprover', params: { sprintId: 'S1', action: 'approve' },
    body: { approvedBy: 'attacker', persons: { a: { grade: 'Middle', rate: 1, alloc: { analysis: 1 } } } } });
  handlePostCapacity(ctx);
  const rec = ctx._res()._out.capacity;
  assert.strictEqual(rec.status, 'approved');
  assert.strictEqual(rec.dirty, false);
  assert.strictEqual(rec.approvedBy, 'realApprover'); // НЕ 'attacker'
  assert.strictEqual(typeof rec.approvedAt, 'number');
  assert.deepStrictEqual(rec.reapprovals, []);
});

test('live-edit после approve: save → status остаётся approved, dirty=true, base пересчитан', () => {
  const s = new Stand(); seedSprint(s, 'S1', JUN(1), JUN(5));
  handlePostCapacity(s.ctx({ role: 'planner', login: 'appr', params: { sprintId: 'S1', action: 'approve' },
    body: { persons: { a: { grade: 'Middle', rate: 1, alloc: { analysis: 1 } } } } }));
  // правка: grade Senior
  const edit = s.ctx({ role: 'planner', params: { sprintId: 'S1', action: 'save' },
    body: { persons: { a: { grade: 'Senior', rate: 1, alloc: { analysis: 1 } } } } });
  handlePostCapacity(edit);
  const rec = edit._res()._out.capacity;
  assert.strictEqual(rec.status, 'approved');
  assert.strictEqual(rec.dirty, true);
  assert.strictEqual(rec.approvedBy, 'appr'); // approve-метаданные сохранены
  assert.strictEqual(rec.persons.a.base, 40 * 0.75); // Senior пересчитан live
});

test('reapprove: dirty снят, reapprovals[] дописан', () => {
  const s = new Stand(); seedSprint(s, 'S1', JUN(1), JUN(5));
  handlePostCapacity(s.ctx({ role: 'planner', login: 'appr', params: { sprintId: 'S1', action: 'approve' },
    body: { persons: { a: { grade: 'Middle', rate: 1, alloc: { analysis: 1 } } } } }));
  handlePostCapacity(s.ctx({ role: 'planner', params: { sprintId: 'S1', action: 'save' },
    body: { persons: { a: { grade: 'Senior', rate: 1, alloc: { analysis: 1 } } } } }));
  const re = s.ctx({ role: 'planner', login: 'reAppr', params: { sprintId: 'S1', action: 'reapprove' },
    body: { persons: { a: { grade: 'Senior', rate: 1, alloc: { analysis: 1 } } } } });
  handlePostCapacity(re);
  const rec = re._res()._out.capacity;
  assert.strictEqual(rec.status, 'approved');
  assert.strictEqual(rec.dirty, false);
  assert.strictEqual(rec.reapprovals.length, 1);
  assert.strictEqual(rec.reapprovals[0].by, 'reAppr');
});

test('sprint_not_current: sprintId ≠ активного → 400 (окно из ssp_sprint, #2)', () => {
  const s = new Stand(); seedSprint(s, 'S1', JUN(1), JUN(5));
  const ctx = s.ctx({ role: 'planner', params: { sprintId: 'OTHER', action: 'save' }, body: { persons: {} } });
  handlePostCapacity(ctx);
  assert.strictEqual(ctx._res().status, 400);
  assert.strictEqual(ctx._res()._out.reason, 'sprint_not_current');
});

/* ═══════════════════ nested-key round-trip (gotcha #8) ═══════════════════ */

test('round-trip: мультиролевой alloc + absencesApplied переживают POST→GET без потери', () => {
  const s = new Stand(); seedSprint(s, 'S1', JUN(1), JUN(5));
  s.props.ssp_absences = JSON.stringify({ a: [{ from: '2026-06-02', to: '2026-06-02', type: 'vacation' }] });
  handlePostCapacity(s.ctx({ role: 'planner', params: { sprintId: 'S1', action: 'approve' },
    body: { persons: {
      a: { grade: 'Middle', rate: 1, alloc: { analysis: 0.5, testing: 0.5 } },
      b: { grade: 'Senior', rate: 0.5, alloc: { devBack: 1 } }
    } } }));
  const get = s.ctx({ role: 'planner', params: { sprintId: 'S1' } });
  handleGetCapacity(get);
  const rec = get._res()._out.capacity;
  // под-карта alloc по обоим ролям цела
  assert.deepStrictEqual(rec.persons.a.alloc, { analysis: 0.5, testing: 0.5 });
  assert.deepStrictEqual(rec.persons.b.alloc, { devBack: 1 });
  // frozen absencesApplied скопированы в окне
  assert.strictEqual(rec.persons.a.absencesApplied.length, 1);
  assert.strictEqual(rec.persons.a.absencesApplied[0].type, 'vacation');
});

/* ═══════════════════ participation (% участия, per-person) ═══════════════════ */

test('participation: per-person множитель влияет на base через POST', () => {
  const s = new Stand(); seedSprint(s, 'S1', JUN(1), JUN(5));
  const ctx = s.ctx({ role: 'planner', params: { sprintId: 'S1', action: 'save' },
    body: { persons: { a: { grade: 'Middle', rate: 1, participation: 0.5, alloc: { analysis: 1 } } } } });
  handlePostCapacity(ctx);
  const rec = ctx._res()._out.capacity;
  assert.strictEqual(rec.persons.a.participation, 0.5);
  assert.strictEqual(rec.persons.a.base, 40 * 0.65 * 0.5); // 13 (working 40 × Middle × rate × участие)
});

/* ═══════════════════ Регрессии багфиксов верификации ═══════════════════ */

test('#4 regression: GET /capacity?sprintId=__proto__ → capacity null (не фантом)', () => {
  const s = new Stand(); seedSprint(s, 'S1', JUN(1), JUN(5));
  handlePostCapacity(s.ctx({ role: 'planner', params: { sprintId: 'S1', action: 'save' }, body: { persons: {} } }));
  const get = s.ctx({ role: 'planner', params: { sprintId: '__proto__' } });
  handleGetCapacity(get);
  assert.strictEqual(get._res()._out.capacity, null);
});

test('#5 regression: live-save после approve СОХРАНЯЕТ frozen absencesApplied (§8)', () => {
  const s = new Stand(); seedSprint(s, 'S1', JUN(1), JUN(5));
  s.props.ssp_absences = JSON.stringify({ a: [{ from: '2026-06-02', to: '2026-06-03', type: 'vacation' }] });
  handlePostCapacity(s.ctx({ role: 'planner', login: 'appr', params: { sprintId: 'S1', action: 'approve' },
    body: { persons: { a: { grade: 'Middle', rate: 1, alloc: { analysis: 1 } } } } }));
  // удаляем отсутствие из LIVE-стора и делаем live-save (без переутверждения)
  s.props.ssp_absences = JSON.stringify({});
  const edit = s.ctx({ role: 'planner', params: { sprintId: 'S1', action: 'save' },
    body: { persons: { a: { grade: 'Senior', rate: 1, alloc: { analysis: 1 } } } } });
  handlePostCapacity(edit);
  const rec = edit._res()._out.capacity;
  assert.strictEqual(rec.dirty, true);
  // frozen-снимок входов сохранён из approve (НЕ затёрт текущим пустым стором)
  assert.strictEqual(rec.persons.a.absencesApplied.length, 1);
  assert.strictEqual(rec.persons.a.absencesApplied[0].type, 'vacation');
});

test('#3 regression: POST /absences с логином «absences» не теряет данные', () => {
  const s = new Stand();
  const ctx = s.ctx({ role: 'planner', body: {
    absences: [{ from: '2026-06-02', to: '2026-06-03', type: 'vacation' }],
    realuser: [{ from: '2026-06-04', to: '2026-06-05', type: 'sick' }]
  } });
  handlePostAbsences(ctx);
  assert.strictEqual(ctx._res()._out.success, true);
  const stored = JSON.parse(s.props.ssp_absences);
  assert.ok(stored.realuser && stored.realuser.length === 1, 'realuser потерян');
  assert.ok(stored.absences && stored.absences.length === 1, 'absences-логин потерян');
});

test('#12 regression: длинный lead-in out_of_membership даёт полное отсутствие в окне', () => {
  const s = new Stand(); seedSprint(s, 'S1', JUN(1), JUN(5)); // 40ч working
  s.props.ssp_absences = JSON.stringify({ a: [{ from: '2021-01-01', to: '2026-06-05', type: 'out_of_membership' }] });
  const ctx = s.ctx({ role: 'planner', params: { sprintId: 'S1', action: 'save' },
    body: { persons: { a: { grade: 'Middle', rate: 1, alloc: { analysis: 1 } } } } });
  handlePostCapacity(ctx);
  // человек отсутствует весь спринт → base 0 (а не завышенный из-за guard-обрезки)
  assert.strictEqual(ctx._res()._out.capacity.persons.a.base, 0);
});
