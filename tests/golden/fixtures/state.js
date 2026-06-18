/**
 * Детерминированная golden-фикстура состояния монолита (Фаза 2 декомпозиции).
 *
 * Все timestamps — фиксированные константы (не Date.now()); FIXED_NOW песочницы =
 * 2026-06-01T12:00:00Z, спринт лежит вокруг этой даты. Имена — gm_user_<N>.
 * Сценарий покрывает расчётные ветки: alloc задан / alloc=null→delta /
 * fact>est (отрицательная delta → 0) / INC_EXCLUDED (фильтруется) /
 * перелимит роли testing / нулевой ресурс devFront.
 */
'use strict';

/* 2026-05-18T00:00:00Z и 2026-06-12T00:00:00Z — спринт охватывает FIXED_NOW. */
const DATE_START = 1779408000000;
const DATE_END = 1781568000000;
const STAMP = 1779494400000; // 2026-05-19T00:00:00Z — created/updated метки

const SPRINT_ID = 'gm-sprint-2026-06';

function buildSettings() {
  return {
    activeRoles: ['analysis', 'testing', 'devBack', 'devFront'],
    /* #45 — базовая фикстура = полный планировочный режим (перс.планирование вкл.),
       чтобы golden-снимки роль-аккордеона включали CTA «Распределить по исполнителям». */
    personalPlanningEnabled: true,
    defaultLang: 'ru',
    sprintField: 'Sprints',
    versionField: 'Fix versions',
    fieldState: 'State',
    fieldPriority: 'Priority',
    settingsManagerGroup: 'sprint-managers',
    validatorsGroup: 'sprint-validators',
    editorsGroup: 'sprint-editors',
  };
}

function buildSprint() {
  return {
    sprintId: SPRINT_ID,
    name: 'GM Sprint June 2026',
    status: 'ALLOCATED',
    dateStart: DATE_START,
    dateEnd: DATE_END,
    updatedBy: 'gm_user_1',
    updatedAt: STAMP,
    sprintFieldVal: 'GM Sprint June 2026',
    versionFieldVal: 'v2026.06',
    sprintGoal: 'Golden-master характеризация монолита',
    /* ресурсы в МИНУТАХ (канон calcRemForRole) */
    resourceAnalysis: 2400,   // 40ч
    resourceTesting: 1200,    // 20ч — перелимит (ниже Σalloc 26ч)
    resourceDevBack: 4800,    // 80ч
    resourceDevFront: 0,      // нулевой ресурс — ветка resource=0
    remainAnalysis: 600,
    remainTesting: -360,
    remainDevBack: 1200,
    remainDevFront: 0,
    personalPlanning: {
      devBack: {
        nkcKey: 'june',
        people: [
          { name: 'gm_user_1', grade: 'Senior', kpe: 1, participation: 1, nkc: 168 },
          { name: 'gm_user_2', grade: 'Middle', kpe: 0.8, participation: 0.5, nkc: 168 },
        ],
        taskAssignments: { 'GM-10': { assignee: 'gm_user_1' }, 'GM-11': { assignee: 'gm_user_2' } },
      },
    },
    migrationLog: [],
    pluginVersion: '2.5.6',
  };
}

function item(issueId, title, inc, fields) {
  return Object.assign(
    {
      issueId: issueId,
      title: title,
      inclusionStatus: inc,
      addedAt: STAMP,
      addedBy: 'gm_user_validator',
    },
    fields || {}
  );
}

function buildRoleItems() {
  return {
    analysis: [
      /* alloc задан явно */
      item('GM-1', 'Анализ требований платёжного модуля', 'INC_PLANNED', {
        estimate_analysis: 600, fact_analysis: 0, alloc_analysis: 480,
        priority: 'Major', state: 'Open',
      }),
      /* alloc=null → delta est-fact */
      item('GM-2', 'Обследование интеграции с 1С', 'INC_PLANNED', {
        estimate_analysis: 900, fact_analysis: 300, alloc_analysis: null,
        priority: 'Normal', state: 'In Progress',
      }),
      /* fact > est → delta 0 */
      item('GM-3', 'Ревью схемы данных', 'INC_UNPLANNED', {
        estimate_analysis: 120, fact_analysis: 240, alloc_analysis: null,
        priority: 'Minor', state: 'Fixed',
      }),
      /* EXCLUDED — не должен попадать в расчёт */
      item('GM-4', 'Исключённая задача', 'INC_EXCLUDED', {
        estimate_analysis: 6000, fact_analysis: 0, alloc_analysis: 6000,
        priority: 'Show-stopper', state: 'Open',
      }),
    ],
    testing: [
      /* перелимит: Σalloc = 26ч > ресурс 20ч */
      item('GM-5', 'Регресс смоук-набора', 'INC_PLANNED', {
        estimate_testing: 600, fact_testing: 0, alloc_testing: 960,
        priority: 'Major', state: 'Open',
      }),
      item('GM-6', 'Тест-кейсы перелимита', 'INC_PLANNED', {
        estimate_testing: 480, fact_testing: 0, alloc_testing: 600,
        priority: 'Normal', state: 'Open',
      }),
    ],
    devBack: [
      item('GM-10', 'Бэкенд расчёта ёмкости', 'INC_PLANNED', {
        estimate_devBack: 1200, fact_devBack: 600, alloc_devBack: 900,
        priority: 'Major', state: 'In Progress', assignee: 'gm_user_1',
      }),
      item('GM-11', 'Эндпоинт истории спринтов', 'INC_PLANNED', {
        estimate_devBack: 2400, fact_devBack: 0, alloc_devBack: null,
        priority: 'Normal', state: 'Open', assignee: 'gm_user_2',
      }),
    ],
    devFront: [
      item('GM-20', 'Фронт без ресурса роли', 'INC_PLANNED', {
        estimate_devFront: 300, fact_devFront: 0, alloc_devFront: 240,
        priority: 'Normal', state: 'Open',
      }),
    ],
  };
}

/** Per-role исторические снапшоты завершённого спринта (композитный sprintId_<rk>). */
function buildHistory() {
  const histSprintId = 'gm-hist-2026-05';
  return [
    {
      sprintId: histSprintId + '_analysis',
      roleKey: 'analysis',
      roleLabel: 'Анализ',
      name: 'GM Hist May 2026',
      status: 'FINISHED',
      dateStart: 1776556800000, // 2026-04-15
      dateEnd: 1778889600000,   // 2026-05-12
      finishedAt: 1778889600000,
      finishedBy: 'gm_user_validator',
      confirmedAt: 1776556800000,
      confirmedBy: 'gm_user_validator',
      resourceAnalysis: 1800,
      remainAnalysis: 300,
      hasWorkingCopy: false,
      items: [
        item('GM-H1', 'Историческая задача анализа', 'INC_PLANNED', {
          estimate_analysis: 600, fact_analysis: 600, alloc_analysis: 600,
          priority: 'Major', state: 'Fixed',
        }),
        item('GM-H2', 'Историческая задача без alloc', 'INC_PLANNED', {
          estimate_analysis: 900, fact_analysis: 300, alloc_analysis: null,
          priority: 'Normal', state: 'Fixed',
        }),
      ],
      personalPlanning: {},
      revisions: [],
      pluginVersion: '2.5.6',
    },
    {
      sprintId: histSprintId + '_testing',
      roleKey: 'testing',
      roleLabel: 'Тестирование',
      name: 'GM Hist May 2026',
      status: 'FINISHED',
      dateStart: 1776556800000,
      dateEnd: 1778889600000,
      finishedAt: 1778889600000,
      finishedBy: 'gm_user_validator',
      confirmedAt: 1776556800000,
      confirmedBy: 'gm_user_validator',
      resourceTesting: 1200,
      remainTesting: 0,
      hasWorkingCopy: false,
      items: [
        item('GM-H5', 'Исторический регресс', 'INC_PLANNED', {
          estimate_testing: 1200, fact_testing: 1200, alloc_testing: 1200,
          priority: 'Major', state: 'Fixed',
        }),
      ],
      personalPlanning: {},
      revisions: [],
      pluginVersion: '2.5.6',
    },
  ];
}

const HIST_SPRINT_ID = 'gm-hist-2026-05';

/** Запись «текущая роль на активном спринте» (sprintId = <activeId>_<rk> → isActiveSprintRecord=true). */
function buildCurrentRoleRec() {
  return {
    sprintId: SPRINT_ID + '_devBack',
    roleKey: 'devBack',
    roleLabel: 'Разработка Back',
    name: 'GM Sprint June 2026',
    status: 'ALLOCATED',
    dateStart: DATE_START,
    dateEnd: DATE_END,
    confirmedAt: STAMP,
    confirmedBy: 'gm_user_validator',
    resourceDevBack: 4800,
    remainDevBack: 1200,
    hasWorkingCopy: false,
    items: [],
    personalPlanning: {},
    revisions: [],
    pluginVersion: '2.5.6',
  };
}

/** personalPlanning-блок текущей роли (devBack): ресурсы в ЧАСАХ, назначения по канону {assignee}. */
function buildCurrentRolePP() {
  return {
    roleKey: 'devBack',
    nkcKey: 'june',
    resourcesByAssignee: {
      gm_user_1: { resource: 40, manualResource: null, grade: 'Senior', kpe: 1, participation: 1, nkc: 168 },
      gm_user_2: { resource: 16, manualResource: 12, grade: 'Middle', kpe: 0.8, participation: 0.5, nkc: 168 },
    },
    taskAssignments: { 'GM-10': { assignee: 'gm_user_1' }, 'GM-11': { assignee: 'gm_user_2' } },
  };
}

/** Применить people-фикстуру (вкладка «Люди»/Гант текущей роли devBack). */
function applyPeopleState(gm) {
  gm.set({
    _currentSprintRoleRec: buildCurrentRoleRec(),
    _currentRolePP: buildCurrentRolePP(),
    _currentRoleGantt: { tasks: {} },
    _ganttStateHist: {},
  });
}

/** Стаб _host (init заморожен — persistence-вызовы логируются и резолвятся пустым). */
function buildHostStub() {
  const log = [];
  return {
    log: log,
    fetchApp: function (p, o) { log.push({ kind: 'app', path: p, opts: o }); return Promise.resolve({}); },
    fetchYouTrack: function (p, o) { log.push({ kind: 'yt', path: p, opts: o }); return Promise.resolve({}); },
  };
}

/** Применить базовую фикстуру к песочнице (активный спринт выбран в шапке). */
function applyBaseState(gm) {
  gm.set({
    _settings: buildSettings(),
    _settingsLoaded: true,
    _sprint: buildSprint(),
    _roleItems: buildRoleItems(),
    _history: buildHistory(),
    _currentSprintId: SPRINT_ID,
    _host: buildHostStub(),
  });
}

module.exports = {
  SPRINT_ID,
  HIST_SPRINT_ID,
  DATE_START,
  DATE_END,
  buildSettings,
  buildSprint,
  buildRoleItems,
  buildHistory,
  buildCurrentRoleRec,
  buildCurrentRolePP,
  buildHostStub,
  applyBaseState,
  applyPeopleState,
};
