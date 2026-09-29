'use strict';

/* #140 — две кнопки сохранения «Ёмкости» не теряют черновик друг друга (прод-баг: отметил
 * отпуск → «Сохранить» таблицы → зелёный тост, отпуск пропал; и наоборот — «Сохранить
 * отсутствия» откатывала несохранённые правки таблицы). Гоняем колбэки VM настоящего модуля
 * в монолите с моками apiPost/apiGet. */

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHost } = require('./monolith-host');

const JUN = function (d) { return Date.UTC(2026, 5, d); };
const SPRINT = { sprintId: 'S1', name: 'Sprint Июнь', dateStart: JUN(1), dateEnd: JUN(3) };
const ROSTER = { analysis: [{ login: 'alice', name: 'Алиса' }, { login: 'bob', name: 'Борис' }] };
const REC = { status: 'draft', dirty: false, persons: {
  alice: { grade: 'Middle', rate: 1, participation: 1, alloc: { analysis: 1 } },
  bob: { grade: 'Middle', rate: 1, participation: 1, alloc: { analysis: 1 } },
} };
const VACATION = { alice: [{ from: '2026-06-02', to: '2026-06-03', type: 'vacation' }] };

function tick() { return new Promise((r) => setTimeout(r, 0)); }

function boot(opts) {
  const host = createHost();
  const log = [];
  const server = { absences: {}, capacity: REC };
  host.gm.set({
    _settings: { capacityMode: 'full', activeRoles: ['analysis'], kpe: { Intern: 0, Junior: 0.5, Middle: 0.65, Senior: 0.75 },
      hoursPerDay: 8, usefulHoursPerDay: 6, userFieldAnalysis: 'Analyst' },
    _sprint: SPRINT, _history: [],
    _capacityRoster: ROSTER, _calendar: null, _absences: {}, _capacity: REC,
    _capacityUiState: { selectedSprintId: 'S1', selectedPerson: 'alice', carry: null, dataVersion: 1 },
    _host: { fetchApp: () => Promise.resolve({}), fetchYouTrack: () => Promise.resolve({}) },   // гейты CSV в перезагрузке
    apiPost: function (path, body) {
      log.push(path);
      if (path === 'absences') {
        if (opts && opts.refuseAbsences) return Promise.resolve({ success: false, reason: 'absences_invalid' });
        server.absences = JSON.parse(JSON.stringify(body.absences));
      }
      return Promise.resolve({ success: true, rev: 1 });
    },
    apiGet: function (path) {
      if (path.indexOf('get-user-field-values') === 0) return Promise.resolve({ users: ROSTER.analysis.map((u) => ({ login: u.login, fullName: u.name })) });
      if (path === 'absences') return Promise.resolve({ success: true, absences: server.absences, rev: 1 });
      if (path.indexOf('capacity') === 0) return Promise.resolve({ capacity: server.capacity });
      return Promise.resolve({});
    },
  });
  host.gm.call('renderCapacityView');
  return { host, log, server, vm: () => host.document.getElementById('tab-capacity').__sspCapacityVm };
}

test('#140 «Сохранить» таблицы сперва досылает черновик отсутствий, потом таблицу', async () => {
  const t = boot();
  const vm = t.vm();
  vm.onSave(JSON.parse(JSON.stringify(vm.persons)), VACATION);
  await tick(); await tick();
  assert.deepEqual(t.log, ['absences', 'capacity']);
  assert.deepEqual(t.server.absences, VACATION);
});

test('#140 «Утвердить»: отсутствия не приняты → таблицу не пишем (утверждение заморозило бы старые)', async () => {
  const t = boot({ refuseAbsences: true });
  const vm = t.vm();
  vm.onApprove(JSON.parse(JSON.stringify(vm.persons)), VACATION);
  await tick(); await tick();
  assert.deepEqual(t.log, ['absences']);
});

test('#140 «Сохранить» без правок в календаре — отсутствия не шлём', async () => {
  const t = boot();
  const vm = t.vm();
  vm.onSave(JSON.parse(JSON.stringify(vm.persons)), { bob: [] });   // пустой массив — не правка
  await tick(); await tick();
  assert.deepEqual(t.log, ['capacity']);
});

test('#140 «Сохранить отсутствия» переносит несохранённую правку таблицы через перезагрузку', async () => {
  const t = boot();
  const vm = t.vm();
  const edited = JSON.parse(JSON.stringify(vm.persons));
  edited.alice.participation = 0.5;
  vm.onSaveAbsences(VACATION, edited);
  for (let i = 0; i < 5; i++) await tick();
  assert.deepEqual(t.log, ['absences']);
  const after = t.vm();
  assert.equal(after.persons.alice.participation, 0.5, 'правка таблицы пережила перезагрузку');
  assert.equal(after.persons.bob.participation, 1);
  assert.deepEqual(after.absencesByLogin, VACATION, 'отсутствия — с сервера');
  assert.notEqual(after.versionTag, vm.versionTag, 'перезагрузка была (иначе проверка ничего не доказывает)');
});
