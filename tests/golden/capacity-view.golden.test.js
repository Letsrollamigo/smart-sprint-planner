'use strict';

/* #45 R3 — golden-контракт «модуль → __SSP_CAPACITY_MOUNT»: domain/capacity-view строит
 * view-model и отдаёт его React-мосту (react/capacity-view.jsx живёт отдельно, как gantt/
 * standup). Снимаем VM (host.__sspCapacityVm), сериализованный JSON.stringify'ем — он
 * автоматически выбрасывает функции-коллбэки (compute/fmtH/onSave/...), оставляя данные
 * (sprints/status/roles/persons/computed/calendarDays/labels). Детерминирован (фикс-стейт +
 * фикс-даты). Несовпадение = изменение контракта VM → регрессия или GOLDEN_UPDATE=1. */

const test = require('node:test');
const { createHost } = require('./monolith-host');
const { checkJsonSnapshot } = require('./snap');

const JUN = function (d) { return Date.UTC(2026, 5, d); };

function baseSettings(mode) {
  return {
    capacityMode: mode, activeRoles: ['analysis'],
    kpe: { Intern: 0, Junior: 0.5, Middle: 0.65, Senior: 0.75 },
    hoursPerDay: 8, usefulHoursPerDay: 6, userFieldAnalysis: 'Analyst',
  };
}
const SPRINT = { sprintId: 'S1', name: 'Sprint Июнь', dateStart: JUN(1), dateEnd: JUN(3) };
const ROSTER = { analysis: [{ login: 'alice', name: 'Алиса' }, { login: 'bob', name: 'Борис' }] };
const CAL = { years: { '2026': [{ date: '2026-06-02', type: 'short', hoursDelta: -1 }] }, uploadedAt: 1780000000000 };

function boot(mode, capacity, uiOver) {
  const host = createHost();
  host.gm.set({
    _settings: baseSettings(mode), _sprint: SPRINT, _history: [],
    _capacityRoster: ROSTER, _calendar: CAL, _absences: {}, _capacity: capacity || null,
    _capacityUiState: Object.assign({ selectedSprintId: 'S1', selectedPerson: 'alice', carry: null, dataVersion: 1 }, uiOver || {}),
  });
  return host;
}
/* VM с host (несериализуемые функции отброшены JSON.stringify). */
function vmOf(host) { return JSON.parse(JSON.stringify(host.document.getElementById('tab-capacity').__sspCapacityVm)); }

test('golden: capacity VM — Light (lightHint, без панели)', () => {
  const host = createHost();
  host.gm.set({ _settings: baseSettings('light'), _sprint: SPRINT, _history: [], _capacityUiState: { selectedSprintId: 'S1', dataVersion: 1 } });
  host.gm.call('renderCapacityView');
  checkJsonSnapshot('capacity-vm-light', vmOf(host));
});

test('golden: capacity VM — Full draft (запись null, live-расчёт)', () => {
  const host = boot('full', null);
  host.gm.call('renderCapacityView');
  checkJsonSnapshot('capacity-vm-draft', vmOf(host));
});

test('golden: capacity VM — Full approved (live-расчёт активного)', () => {
  const rec = { status: 'approved', dirty: false, approvedBy: 'lead', persons: {
    alice: { grade: 'Middle', rate: 1, participation: 1, alloc: { analysis: 1 }, base: 30 },
    bob: { grade: 'Senior', rate: 0.5, participation: 1, alloc: { analysis: 1 }, base: 12 },
  } };
  const host = boot('full', rec);
  host.gm.call('renderCapacityView');
  checkJsonSnapshot('capacity-vm-approved', vmOf(host));
});

test('golden: capacity VM — Full approved+dirty', () => {
  const rec = { status: 'approved', dirty: true, approvedBy: 'lead', persons: {
    alice: { grade: 'Senior', rate: 1, participation: 1, alloc: { analysis: 1 }, base: 34 },
  } };
  const host = boot('full', rec);
  host.gm.call('renderCapacityView');
  checkJsonSnapshot('capacity-vm-dirty', vmOf(host));
});

test('golden: capacity VM — overlimit (Σ alloc>100% в computed.sigma)', () => {
  const rec = { status: 'draft', dirty: false, persons: {
    alice: { grade: 'Middle', rate: 1, participation: 1, alloc: { analysis: 1.2 } },
  } };
  const host = boot('full', rec);
  host.gm.call('renderCapacityView');
  checkJsonSnapshot('capacity-vm-overlimit', vmOf(host));
});

test('golden: capacity VM — read-only исторический без записи (frozen, base пуст)', () => {
  const host = createHost();
  host.gm.set({
    _settings: baseSettings('full'), _sprint: SPRINT,
    _history: [{ sprintId: 'HSP_analysis', name: 'Старый спринт', dateStart: Date.UTC(2024, 0, 8), dateEnd: Date.UTC(2024, 0, 12), status: 'FINISHED', roleKey: 'analysis' }],
    _capacityRoster: ROSTER, _calendar: CAL, _absences: {}, _capacity: null,
    _capacityUiState: { selectedSprintId: 'HSP', selectedPerson: 'alice', carry: null, dataVersion: 1 },
  });
  host.gm.call('renderCapacityView');
  checkJsonSnapshot('capacity-vm-readonly-norecord', vmOf(host));
});
