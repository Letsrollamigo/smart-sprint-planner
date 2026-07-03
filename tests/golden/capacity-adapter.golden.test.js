/**
 * Golden-master: R4-адаптер планирования (#45 §9, тест-долг закрыт в #54).
 *
 * Характеризует потребление утверждённой бизнес-ёмкости планировщиком (Full):
 *   • _approvedRecordForPlanning — гейт (Full+approved+свой спринт, иначе null);
 *   • getApprovedCapacityForRole(rk)      — ёмкость роли в МИНУТАХ (fallback = ручной
 *     ресурс _sprint[resKey]);
 *   • getApprovedCapacityForPerson(login) — ёмкость человека в роли в ЧАСАХ (fallback =
 *     PP-ресурс _currentRolePP.resourcesByAssignee).
 *
 * ⚠️ Единицы разные НАМЕРЕННО (роль → минуты для calcRemForRole; человек → часы,
 * D1↔D12) — снимок фиксирует контракт, parity-тест ниже сверяет адаптер с формулами
 * CAPACITY_PURE (roleCapacity / roleContribution) на одной и той же записи.
 *
 * Потребители адаптера: core.js (calcRemForRole, computeRoleQuickStats, «Доступные
 * ресурсы»), currentrole-view, rolecomposition-view, intro-view, backlog-view.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { createHost } = require('./monolith-host');
const { checkJsonSnapshot } = require('./snap');
const fx = require('./fixtures/state');

const PURE = require(path.join(__dirname, '..', '..', 'widgets', 'main', 'src', 'pure', 'capacity-pure.js'));

const SPRINT_ID = 'gm-sprint-2026-06'; // = fx.buildSprint().sprintId

/** Утверждённая Full-запись ёмкости: 2 человека в analysis, 1 частично в testing. */
function buildApprovedRec() {
  return {
    mode: 'full',
    status: 'approved',
    sprintId: SPRINT_ID,
    persons: {
      gm_user_1: { base: 120, alloc: { analysis: 0.5, testing: 0.25 } },
      gm_user_2: { base: 80,  alloc: { analysis: 1 } },
      gm_user_3: { base: 100, alloc: {} }, // без аллокаций — вклад 0 во все роли
    },
  };
}

/** Полный срез адаптера для снимка: роли в минутах + люди в часах. */
function adapterSlice(gm) {
  return {
    roleMinutes: {
      analysis: gm.call('getApprovedCapacityForRole', 'analysis'),
      testing: gm.call('getApprovedCapacityForRole', 'testing'),
      devBack: gm.call('getApprovedCapacityForRole', 'devBack'),
    },
    personHours: {
      gm_user_1_analysis: gm.call('getApprovedCapacityForPerson', 'gm_user_1', 'analysis'),
      gm_user_1_testing: gm.call('getApprovedCapacityForPerson', 'gm_user_1', 'testing'),
      gm_user_2_analysis: gm.call('getApprovedCapacityForPerson', 'gm_user_2', 'analysis'),
      gm_user_3_analysis: gm.call('getApprovedCapacityForPerson', 'gm_user_3', 'analysis'),
      unknown_login: gm.call('getApprovedCapacityForPerson', 'ghost', 'analysis'),
    },
  };
}

/** PP-fallback для getApprovedCapacityForPerson (часы). */
function ppFallback() {
  return { resourcesByAssignee: { gm_user_1: { resource: 33 }, gm_user_2: { resource: 0 } } };
}

test('golden: R4-адаптер — Full approved + матрица гейтов/fallback', () => {
  const { gm } = createHost();
  fx.applyBaseState(gm);
  const settings = gm.get('_settings');

  /* (1) Full + approved запись СВОЕГО спринта → адаптер считает из записи. */
  gm.set({
    _settings: Object.assign({}, settings, { capacityMode: 'full' }),
    _planCap: { sprintId: SPRINT_ID, record: buildApprovedRec() },
    _currentRolePP: ppFallback(),
  });
  const fullApproved = adapterSlice(gm);

  /* (2) Гейт: запись draft → null → fallback (роль = ручной ресурс _sprint[resKey]
     в минутах; человек = PP-ресурс в часах). */
  gm.set({ _planCap: { sprintId: SPRINT_ID, record: Object.assign(buildApprovedRec(), { status: 'draft' }) } });
  const gateDraft = adapterSlice(gm);

  /* (3) Гейт: запись mode=light → fallback. */
  gm.set({ _planCap: { sprintId: SPRINT_ID, record: Object.assign(buildApprovedRec(), { mode: 'light' }) } });
  const gateLightRecord = adapterSlice(gm);

  /* (4) Гейт: кэш ЧУЖОГО спринта → fallback. _planCapLoading=true подавляет
     lazy-фетч _ensurePlanCapacity (side-effect вне скоупа снимка). */
  gm.set({
    _planCap: { sprintId: 'other-sprint', record: buildApprovedRec() },
    _planCapLoading: true,
  });
  const gateForeignSprint = adapterSlice(gm);
  gm.set({ _planCapLoading: false });

  /* (5) ХАРАКТЕРИЗАЦИЯ: light-НАСТРОЙКИ не гейтятся при ТЁПЛОМ кэше _planCap —
     _approvedRecordForPlanning проверяет только запись (mode/status/sprintId),
     capacityMode настроек смотрит лишь lazy-load _ensurePlanCapacity. Т.е. Light
     «byte-identical» держится на том, что в Light кэш никогда не наполняется;
     переключение Full→Light в рамках сессии (без F5/смены проекта) оставит
     адаптер на approved-записи до сброса кэша. Снимок фиксирует ФАКТ. */
  gm.set({
    _settings: Object.assign({}, settings, { capacityMode: 'light' }),
    _planCap: { sprintId: SPRINT_ID, record: buildApprovedRec() },
  });
  const lightSettingsWarmCache = adapterSlice(gm);

  /* (5b) Light + холодный кэш (реальный Light-путь: lazy-load не срабатывает,
     кэш пуст) → fallback на ручной ресурс / PP. */
  gm.set({ _planCap: { sprintId: null, record: null } });
  const lightSettingsColdCache = adapterSlice(gm);

  /* (6) Fallback без данных: Full, запись отсутствует (record=null, загрузка
     подавлена), ручной ресурс не задан, PP пуст → нули. */
  const sprint = gm.get('_sprint');
  gm.set({
    _settings: Object.assign({}, settings, { capacityMode: 'full' }),
    _planCap: { sprintId: SPRINT_ID, record: null },
    _planCapLoading: true,
    _sprint: Object.assign({}, sprint, { resourceAnalysis: undefined, resourceTesting: undefined, resourceDevBack: undefined }),
    _currentRolePP: null,
  });
  const fallbackEmpty = adapterSlice(gm);
  gm.set({ _sprint: sprint, _planCapLoading: false });

  checkJsonSnapshot('capacity-adapter-r4', {
    fullApproved: fullApproved,
    gateDraft: gateDraft,
    gateLightRecord: gateLightRecord,
    gateForeignSprint: gateForeignSprint,
    lightSettingsWarmCache: lightSettingsWarmCache,
    lightSettingsColdCache: lightSettingsColdCache,
    fallbackEmpty: fallbackEmpty,
  });
});

test('parity: адаптер == формулы CAPACITY_PURE на одной записи (минуты/часы)', () => {
  const { gm } = createHost();
  fx.applyBaseState(gm);
  const rec = buildApprovedRec();
  gm.set({
    _settings: Object.assign({}, gm.get('_settings'), { capacityMode: 'full' }),
    _planCap: { sprintId: SPRINT_ID, record: rec },
  });

  ['analysis', 'testing', 'devBack'].forEach(function (rk) {
    assert.strictEqual(
      gm.call('getApprovedCapacityForRole', rk),
      Math.round(PURE.roleCapacity(rk, rec) * 60),
      'roleCapacity parity (минуты): ' + rk
    );
  });
  Object.keys(rec.persons).forEach(function (login) {
    const p = rec.persons[login];
    assert.strictEqual(
      gm.call('getApprovedCapacityForPerson', login, 'analysis'),
      PURE.roleContribution(p.base, p.alloc, 'analysis'),
      'roleContribution parity (часы): ' + login
    );
  });
});
