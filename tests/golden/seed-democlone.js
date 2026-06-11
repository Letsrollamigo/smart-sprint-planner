#!/usr/bin/env node
/**
 * Сидинг изолированного тест-проекта DEMOClone (Фаза 2 декомпозиции, #28).
 *
 * Заливает в DEMOClone детерминированное состояние планера через СОБСТВЕННЫЙ
 * backend приложения (extension endpoints → валидаторы/whitelist применяются,
 * данные гарантированно schema-valid):
 *   1. settings  — зеркало эталона DEMO + роль «Тестирование» (3 роли);
 *   2. sprint    — активный спринт + roleItems на задачах DEMOClone-1..8
 *                  (alloc задан / alloc=null→delta / fact>est / EXCLUDED /
 *                  перелимит testing);
 *   3. history   — завершённый спринт (FINISHED ×2 роли) с personalPlanning.
 *
 * Запуск (стенд localhost:8080, задачи DEMOClone-1..8 должны существовать):
 *   YT_TOKEN=perm-... node tests/golden/seed-democlone.js
 * Переменные: YT_BASE (default http://localhost:8080), YT_PROJECT (DEMOClone).
 * Имя приложения берётся из manifest.json:name — скрипт fork-agnostic.
 *
 * Скрипт идемпотентен: повторный запуск перезаписывает то же состояние.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const BASE = process.env.YT_BASE || 'http://localhost:8080';
const TOKEN = process.env.YT_TOKEN;
const PROJECT = process.env.YT_PROJECT || 'DEMOClone';
const APP = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'manifest.json'), 'utf8')).name;

if (!TOKEN) {
  console.error('YT_TOKEN не задан (permanent admin token стенда).');
  process.exit(1);
}

/* Детерминированные константы (синхронны tests/golden/fixtures/state.js) */
const DATE_START = 1779408000000; // 2026-05-18
const DATE_END = 1781568000000;   // 2026-06-12
const HIST_START = 1776556800000; // 2026-04-15
const HIST_END = 1778889600000;   // 2026-05-12
const STAMP = 1779494400000;      // 2026-05-19
const SPRINT_ID = 'gmclone-sprint-2026-06';
const HIST_ID = 'gmclone-hist-2026-05';

async function api(method, url, body) {
  const r = await fetch(BASE + url, {
    method,
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) {}
  if (!r.ok) throw new Error(method + ' ' + url + ' → HTTP ' + r.status + ': ' + text.slice(0, 300));
  return json;
}

function ep(pid, p) {
  return '/api/admin/projects/' + pid + '/extensionEndpoints/' + APP + '/backend-project/' + p;
}

/* settings: эталон DEMO (снят 2026-06-11) + роль testing на паре «Оценка»/«Затраченное время» */
function buildSettings(base) {
  const s = JSON.parse(JSON.stringify(base));
  s.activeRoles = ['analysis', 'testing', 'devPlatform'];
  s.fieldTesting = 'Оценка';
  s.fieldFactTesting = 'Затраченное время';
  s.userFieldTesting = 'Assignee';
  s.savedAt = STAMP;
  return s;
}

function item(id, title, prio, state, inc, fields) {
  return Object.assign({
    issueId: id,
    url: BASE + '/issue/' + id,
    title: title,
    priority: prio,
    xpriority: prio,
    state: state,
    system: '',
    inclusionStatus: inc,
  }, fields);
}

function buildRoleItems() {
  return {
    analysis: [
      item('DEMOClone-1', 'Анализ требований платёжного модуля', 'Major', 'To do', 'INC_PLANNED',
        { estimate_analysis: 600, fact_analysis: null, alloc_analysis: 480 }),
      item('DEMOClone-2', 'Обследование интеграции с 1С', 'Normal', 'In Progress', 'INC_PLANNED',
        { estimate_analysis: 900, fact_analysis: 300, alloc_analysis: null }),
      item('DEMOClone-3', 'Ревью схемы данных', 'Minor', 'Done', 'INC_UNPLANNED',
        { estimate_analysis: 120, fact_analysis: 240, alloc_analysis: null }),
      item('DEMOClone-8', 'Платформенный рефактор ядра', 'Critical', 'To do', 'INC_EXCLUDED',
        { estimate_analysis: 6000, fact_analysis: null, alloc_analysis: 6000 }),
    ],
    testing: [
      item('DEMOClone-4', 'Регресс смоук-набора', 'Major', 'To do', 'INC_PLANNED',
        { estimate_testing: 600, fact_testing: null, alloc_testing: 960 }),
      item('DEMOClone-5', 'Тест-кейсы перелимита', 'Normal', 'To do', 'INC_PLANNED',
        { estimate_testing: 480, fact_testing: null, alloc_testing: 600 }),
    ],
    devPlatform: [
      item('DEMOClone-6', 'Бэкенд расчёта ёмкости', 'Major', 'In Progress', 'INC_PLANNED',
        { estimate_devPlatform: 1200, fact_devPlatform: 600, alloc_devPlatform: 900 }),
      item('DEMOClone-7', 'Эндпоинт истории спринтов', 'Normal', 'To do', 'INC_PLANNED',
        { estimate_devPlatform: 2400, fact_devPlatform: null, alloc_devPlatform: null }),
    ],
  };
}

function buildSprint() {
  return {
    sprintId: SPRINT_ID,
    name: 'GM Clone Sprint June 2026',
    status: 'PLANNING',
    dateStart: DATE_START,
    dateEnd: DATE_END,
    sprintFieldVal: null,
    versionFieldVal: null,
    resourceAnalysis: 2400,
    resourceTesting: 1200,    // перелимит: Σalloc testing = 1560 (26ч)
    resourceDevPlatform: 4800,
    resourceDevBack: 0,
    resourceDevFront: 0,
    resourceDevIos: 0,
    resourceDevAndroid: 0,
    resourceDevFs: 0,
    resourceDevDb: 0,
    personalPlanning: {
      devPlatform: {
        nkcKey: 'other',
        resourcesByAssignee: {
          Test_user_2: { login: 'Test_user_2', assigneeName: 'Test user 2', grade: 'Senior', resource: 108.75 },
          Test_user_3: { login: 'Test_user_3', assigneeName: 'Test user 3', grade: 'Middle', resource: 94.25 },
        },
        taskAssignments: {
          'DEMOClone-6': { assignee: 'Test_user_2' },
          'DEMOClone-7': { assignee: 'Test_user_3' },
        },
      },
    },
    pluginVersion: '2.5.6',
  };
}

function histRecord(rk, roleLabel, resKey, resVal, remVal, items, settings, pp) {
  const rec = {
    sprintId: HIST_ID + '_' + rk,
    roleKey: rk,
    roleLabel: roleLabel,
    name: 'GM Clone Hist May 2026',
    status: 'FINISHED',
    dateStart: HIST_START,
    dateEnd: HIST_END,
    confirmedAt: HIST_START,
    confirmedBy: 'Letsrollamigo',
    finishedAt: HIST_END,
    finishedBy: 'Letsrollamigo',
    isOverLimit: false,
    hasWorkingCopy: false,
    sprintFieldVal: null,
    versionFieldVal: null,
    settings: settings,
    items: items,
    personalPlanning: pp || {},
    pluginVersion: '2.5.6',
  };
  rec[resKey] = resVal;
  rec['remain' + resKey.slice('resource'.length)] = remVal;
  return rec;
}

function buildHistory(settings) {
  const histPP = {
    nkcKey: 'other',
    resourcesByAssignee: {
      Test_user_2: { login: 'Test_user_2', assigneeName: 'Test user 2', grade: 'Middle', resource: 94.25 },
    },
    taskAssignments: { 'DEMOClone-1': { assignee: 'Test_user_2' } },
  };
  return [
    histRecord('analysis', 'Анализ', 'resourceAnalysis', 1800, 300, [
      item('DEMOClone-1', 'Анализ требований платёжного модуля', 'Major', 'Done', 'INC_PLANNED',
        { estimate_analysis: 600, fact_analysis: 600, alloc_analysis: 600 }),
      item('DEMOClone-2', 'Обследование интеграции с 1С', 'Normal', 'Done', 'INC_PLANNED',
        { estimate_analysis: 900, fact_analysis: 300, alloc_analysis: null }),
    ], settings, histPP),
    histRecord('testing', 'Тестирование', 'resourceTesting', 1200, 0, [
      item('DEMOClone-4', 'Регресс смоук-набора', 'Major', 'Done', 'INC_PLANNED',
        { estimate_testing: 1200, fact_testing: 1200, alloc_testing: 1200 }),
    ], settings, {}),
  ];
}

(async () => {
  const projects = await api('GET', '/api/admin/projects?fields=id,shortName');
  const proj = projects.find((p) => p.shortName === PROJECT);
  if (!proj) throw new Error('Проект ' + PROJECT + ' не найден на ' + BASE);
  const pid = proj.id;
  console.log('project', PROJECT, '=', pid, '| app =', APP);

  /* эталон настроек — с DEMO (источник канона), поверх — наши роли */
  const demo = projects.find((p) => p.shortName === 'DEMO');
  if (!demo) throw new Error('Эталонный проект DEMO не найден');
  const demoData = await api('GET', ep(demo.id, 'sprint-data'));
  if (!demoData || !demoData.settings) throw new Error('DEMO без настроек — эталона нет');
  const settings = buildSettings(demoData.settings);

  let r = await api('POST', ep(pid, 'sprint-data'), { settings: settings });
  console.log('settings POST →', JSON.stringify(r).slice(0, 120));

  r = await api('POST', ep(pid, 'sprint-data'), { sprint: buildSprint(), roleItems: buildRoleItems() });
  console.log('sprint+roleItems POST →', JSON.stringify(r).slice(0, 120));

  r = await api('POST', ep(pid, 'history'), { history: buildHistory(settings) });
  console.log('history POST →', JSON.stringify(r).slice(0, 120));

  /* round-trip контроль */
  const back = await api('GET', ep(pid, 'sprint-data'));
  const hist = await api('GET', ep(pid, 'history'));
  console.log('verify: configured =', back.configured,
    '| activeRoles =', JSON.stringify(back.settings && back.settings.activeRoles),
    '| sprint =', back.sprint && back.sprint.sprintId,
    '| roleItems =', JSON.stringify(Object.fromEntries(Object.entries(back.roleItems || {}).map(([k, v]) => [k, v.length]))),
    '| history =', (hist.history || []).length, 'records');
})().catch((e) => { console.error('SEED FAILED:', e.message); process.exit(1); });
