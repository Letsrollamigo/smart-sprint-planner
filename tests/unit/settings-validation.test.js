'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const path   = require('node:path');

const backend = require(path.join(__dirname, '..', '..', 'backend-project.js'));
const { validateSettings, ALLOWED_KPE_KEYS, ALLOWED_SETTINGS_KEYS } = backend;

/* v1.7.1 — KPE whitelist accepts both legacy Russian and canonical English keys.
   Pre-existing bug: frontend wrote English keys (Intern/Junior/Middle/Senior)
   since v1.4.1 D128 but backend whitelist allowed only Russian (Стажёр/Джун/Мидл/Синьор).
   Result: any settings POST failed invalid_settings_structure. */

test('KPE whitelist accepts canonical English keys (v1.4.1+ frontend storage layer)', function() {
  var s = { kpe: { Intern: 0, Junior: 0.5, Middle: 0.65, Senior: 0.75 } };
  assert.strictEqual(validateSettings(s), true);
});

test('KPE whitelist accepts legacy Russian keys (backward compat with old installs)', function() {
  var s = { kpe: { 'Стажёр': 0, 'Джун': 0.5, 'Мидл': 0.65, 'Синьор': 0.75 } };
  assert.strictEqual(validateSettings(s), true);
});

test('KPE whitelist rejects unknown grade keys', function() {
  var s = { kpe: { Lead: 1.5 } };
  assert.strictEqual(validateSettings(s), false);
});

test('KPE whitelist accepts mixed Russian+English (during legacy migration window)', function() {
  var s = { kpe: { Intern: 0, 'Джун': 0.5, Middle: 0.65 } };
  assert.strictEqual(validateSettings(s), true);
});

test('ALLOWED_KPE_KEYS contains both alphabets', function() {
  assert.ok(ALLOWED_KPE_KEYS.indexOf('Intern')  >= 0, 'missing Intern');
  assert.ok(ALLOWED_KPE_KEYS.indexOf('Junior')  >= 0, 'missing Junior');
  assert.ok(ALLOWED_KPE_KEYS.indexOf('Middle')  >= 0, 'missing Middle');
  assert.ok(ALLOWED_KPE_KEYS.indexOf('Senior')  >= 0, 'missing Senior');
  assert.ok(ALLOWED_KPE_KEYS.indexOf('Стажёр')  >= 0, 'missing Стажёр');
  assert.ok(ALLOWED_KPE_KEYS.indexOf('Джун')    >= 0, 'missing Джун');
  assert.ok(ALLOWED_KPE_KEYS.indexOf('Мидл')    >= 0, 'missing Мидл');
  assert.ok(ALLOWED_KPE_KEYS.indexOf('Синьор')  >= 0, 'missing Синьор');
});

test('Repro of pre-existing v1.7.0 bug: full settings POST with English KPE keys', function() {
  // Repro the exact scenario from acceptance smoke test 2026-05-15:
  // frontend collects ~70 keys including kpe with English grades.
  var s = {
    activeRoles: ['analysis', 'devFront'],
    fieldState: 'State',
    cascadeAggregationEnabled: false,
    forbidContainerWorkItems: false,
    cascadeKindField: 'Type',
    cascadeLevel2Values: ['Story'],
    cascadeLevel3Values: [],
    cascadeParentLinkInward: 'subtask of',
    cascadeParentLinkOutward: 'parent for',
    nkcJanuary: 105,
    nkcMay: 119,
    nkcOther: 145,
    rate: 1,
    participation: 1,
    kpe: { Intern: 0, Junior: 0.5, Middle: 0.65, Senior: 0.75 },
    stateRollupEnabled: true,
    stateRollupOrder: ['To Do', 'In Progress', 'Done'],
    stateRollupResolvedStates: ['Done'],
    stateRollupFloor: null,
    stateRollupStrategy: 'min'
  };
  assert.strictEqual(validateSettings(s), true,
    'pre-existing kpe bug should be fixed: full settings with English KPE keys must validate');
});

/* v2.14.0 — «Модель планирования»: planningModel enum + whitelist. */
test('planningModel: enum simple/light/full принимается', function() {
  assert.strictEqual(validateSettings({ planningModel: 'simple' }), true);
  assert.strictEqual(validateSettings({ planningModel: 'light' }), true);
  assert.strictEqual(validateSettings({ planningModel: 'full' }), true);
});

test('planningModel: невалидное значение реджектится', function() {
  assert.strictEqual(validateSettings({ planningModel: 'garbage' }), false);
  assert.strictEqual(validateSettings({ planningModel: 42 }), false);
});

test('planningModel: в ALLOWED_SETTINGS_KEYS (иначе весь save реджектится)', function() {
  assert.ok(ALLOWED_SETTINGS_KEYS.indexOf('planningModel') >= 0);
});

test('planningModel: derived-зеркало совместно с legacy-флагами проходит валидацию', function() {
  // как пишет collect: planningModel + тройка derived флагов
  var s = { planningModel: 'light', personalPlanningEnabled: true,
            usePersonalForResource: true, manualPersonalResource: false };
  assert.strictEqual(validateSettings(s), true);
});

/* #48 R1.1 — Релиз-менеджмент: ключи в whitelist + типизация. R3.1: readinessField/zone*Values
   удалены (зоны — авто по State); ключи не должны вернуться в whitelist. */
test('release: все ключи раздела в ALLOWED_SETTINGS_KEYS (иначе весь save реджектится)', function() {
  ['releaseEnabled','releaseCandidateManagerGroups','releaseCandidateManagerGroupNames',
   'releaseCandidateEngineerGroups','releaseCandidateEngineerGroupNames',
   'releaseManagerGroups','releaseManagerGroupNames','releaseEngineerGroups','releaseEngineerGroupNames',
   'releaseStatusStateMapping'
  ].forEach(function(k){ assert.ok(ALLOWED_SETTINGS_KEYS.indexOf(k) >= 0, 'missing ' + k); });
});

test('release R3.1: снесённые ключи светофора НЕ в whitelist (зоны — авто по State)', function() {
  ['releaseReadinessField','releaseZoneGreenValues','releaseZoneYellowValues','releaseZoneRedValues']
    .forEach(function(k){ assert.ok(ALLOWED_SETTINGS_KEYS.indexOf(k) < 0, 'stale ' + k); });
});

test('release: полный валидный payload раздела проходит', function() {
  var s = {
    releaseEnabled: true,
    releaseCandidateManagerGroups: ['g1'], releaseCandidateManagerGroupNames: ['Менеджеры'],
    releaseCandidateEngineerGroups: ['g2'], releaseCandidateEngineerGroupNames: ['Инженеры'],
    releaseManagerGroups: ['g1'], releaseManagerGroupNames: ['Менеджеры'],
    releaseEngineerGroups: ['g2'], releaseEngineerGroupNames: ['Инженеры'],
    releaseStatusStateMapping: { planned: 'Open', work: 'In Progress', released: 'Done' },
  };
  assert.strictEqual(validateSettings(s), true);
});

test('release: releaseEnabled не-boolean реджектится', function() {
  assert.strictEqual(validateSettings({ releaseEnabled: 'yes' }), false);
  assert.strictEqual(validateSettings({ releaseEnabled: true }), true);
});

test('release: маппинг с неизвестным статусом-ключом реджектится', function() {
  assert.strictEqual(validateSettings({ releaseStatusStateMapping: { bogus: 'Done' } }), false);
  assert.strictEqual(validateSettings({ releaseStatusStateMapping: { overdue: 'Done' } }), false); // derived, не хранимый
  assert.strictEqual(validateSettings({ releaseStatusStateMapping: { prep: 'Ready' } }), true);
});

test('release: маппинг-массив (не объект) и нестроковое целевое состояние реджектятся', function() {
  assert.strictEqual(validateSettings({ releaseStatusStateMapping: ['x'] }), false);
  assert.strictEqual(validateSettings({ releaseStatusStateMapping: { planned: 42 } }), false);
});

/* #50 S2 — A1 Прогресс: целевые статусы (str[]) + ярлыки (статус→подпись map). */
test('reporting A1: принимает целевые статусы + ярлыки', function() {
  var s = { reportingTargetStatuses: ['In Progress', 'Done'],
            reportingStatusLabels: { 'In Progress': 'Начата разработка', 'Done': 'Выполнен релиз' } };
  assert.strictEqual(validateSettings(s), true);
});

test('reporting A1: реджектит не-массив целевых статусов и нестроковый/массивный ярлык', function() {
  assert.strictEqual(validateSettings({ reportingTargetStatuses: 'In Progress' }), false);
  assert.strictEqual(validateSettings({ reportingStatusLabels: { Done: 5 } }), false);
  assert.strictEqual(validateSettings({ reportingStatusLabels: ['x'] }), false);
});

/* #50 S4 — A8/A9: reportingFlowStates — упорядоченный str[] имён статусов потока. */
test('reporting A8/A9: принимает упорядоченный поток статусов, реджектит не-str[]', function() {
  assert.strictEqual(validateSettings({ reportingFlowStates: ['Analysis', 'Dev', 'Test', 'Done'] }), true);
  assert.strictEqual(validateSettings({ reportingFlowStates: [] }), true);
  assert.strictEqual(validateSettings({ reportingFlowStates: 'Analysis' }), false);
  assert.strictEqual(validateSettings({ reportingFlowStates: [1, 2] }), false);
  assert.strictEqual(validateSettings({ reportingFlowStates: { a: 'b' } }), false);
});

/* #50 S6a — A3: reportingA3StageField/OrgField/PriorityField — имя YT-поля (str≤200|null, опц.). */
test('reporting A3: принимает имена полей среза (str|null), реджектит нестроку и переросшую длину', function() {
  assert.strictEqual(validateSettings({ reportingA3StageField: 'Бизнес-этап', reportingA3OrgField: 'Орг-юнит', reportingA3PriorityField: 'Priority' }), true);
  assert.strictEqual(validateSettings({ reportingA3StageField: '' }), true);   // пусто = колонка скрыта
  assert.strictEqual(validateSettings({ reportingA3OrgField: null }), true);
  assert.strictEqual(validateSettings({ reportingA3PriorityField: 42 }), false);
  assert.strictEqual(validateSettings({ reportingA3StageField: 'x'.repeat(201) }), false);
});

/* #50 S6b — A6: reportingRoleMonthlyCapacity — { roleKey → ч/мес num 0..100000|null }. */
test('reporting A6: принимает месячную ёмкость ролей, реджектит массив/нечисло/вне диапазона', function() {
  assert.strictEqual(validateSettings({ reportingRoleMonthlyCapacity: { analysis: 145, dev: 119, test: null } }), true);
  assert.strictEqual(validateSettings({ reportingRoleMonthlyCapacity: {} }), true);
  assert.strictEqual(validateSettings({ reportingRoleMonthlyCapacity: [] }), false);       // массив
  assert.strictEqual(validateSettings({ reportingRoleMonthlyCapacity: { analysis: 'x' } }), false);
  assert.strictEqual(validateSettings({ reportingRoleMonthlyCapacity: { analysis: -1 } }), false);
  assert.strictEqual(validateSettings({ reportingRoleMonthlyCapacity: { analysis: 100001 } }), false);
});

/* #50 S3a — A2 TTM: якоря (metric→{start,end}) + нормативы (lead/team int|null) + маркеры пауз. */
test('reporting A2: принимает полный валидный payload якорей/нормативов/пауз', function() {
  var s = {
    reportingAnchors: {
      lead:  { start: 'Analysis', end: 'Done' },
      team:  { start: 'Analysis', end: 'Business Test' },
      cycle: { start: 'Dev Start' } // один конец — валидно, метрика просто не считается
    },
    reportingTtmNorms: { lead: 21, team: 15 },
    reportingPauseMarkers: { states: ['On Hold', 'Blocked'], tags: ['paused'] }
  };
  assert.strictEqual(validateSettings(s), true);
  // граничные валидные формы: пустые объекты/массивы + null-нормы
  assert.strictEqual(validateSettings({ reportingAnchors: {}, reportingTtmNorms: {}, reportingPauseMarkers: {} }), true);
  assert.strictEqual(validateSettings({ reportingTtmNorms: { lead: null, team: null } }), true);
  assert.strictEqual(validateSettings({ reportingPauseMarkers: { states: [], tags: [] } }), true);
});

test('reporting A2: реджектит неизвестный метрик-ключ якорей', function() {
  assert.strictEqual(validateSettings({ reportingAnchors: { bogus: { start: 'A', end: 'B' } } }), false);
  assert.strictEqual(validateSettings({ reportingTtmNorms: { cycle: 10 } }), false); // Cycle норматива не имеет
});

test('reporting A2: реджектит не-объектную пару якоря и массив вместо объекта', function() {
  assert.strictEqual(validateSettings({ reportingAnchors: { lead: 'Analysis' } }), false);
  assert.strictEqual(validateSettings({ reportingAnchors: { lead: ['A', 'B'] } }), false);
  assert.strictEqual(validateSettings({ reportingAnchors: ['x'] }), false);
});

test('reporting A2: реджектит переусложнённую строку конца якоря', function() {
  var longName = new Array(202).join('x'); // 201 символ > 200
  assert.strictEqual(validateSettings({ reportingAnchors: { lead: { start: 'A', end: longName } } }), false);
});

test('reporting A2: реджектит норматив вне диапазона и нечисловой', function() {
  assert.strictEqual(validateSettings({ reportingTtmNorms: { lead: 10001 } }), false);
  assert.strictEqual(validateSettings({ reportingTtmNorms: { team: -1 } }), false);
  assert.strictEqual(validateSettings({ reportingTtmNorms: { lead: '21' } }), false);
  assert.strictEqual(validateSettings({ reportingTtmNorms: ['x'] }), false);
});

test('reporting A2: реджектит не-массив states/tags маркеров пауз', function() {
  assert.strictEqual(validateSettings({ reportingPauseMarkers: { states: 'On Hold' } }), false);
  assert.strictEqual(validateSettings({ reportingPauseMarkers: { tags: { a: 1 } } }), false);
  assert.strictEqual(validateSettings({ reportingPauseMarkers: ['x'] }), false);
});

/* #69 R1 — fieldExternalTicketId был в whitelist, но не в fieldKeys → не проходил assertStr(200). */
test('fieldExternalTicketId: строка ≤200 принимается, не-строка и >200 отклоняются', function() {
  assert.strictEqual(validateSettings({ fieldExternalTicketId: 'External ID' }), true);
  assert.strictEqual(validateSettings({ fieldExternalTicketId: null }), true);
  assert.strictEqual(validateSettings({ fieldExternalTicketId: 42 }), false);
  assert.strictEqual(validateSettings({ fieldExternalTicketId: 'x'.repeat(201) }), false);
});

/* ── #74 фаза 1 — linkTypeRoles: таблица «тип связи × роль» ──────────────── */

test('#74: linkTypeRoles — валидные строки (обе стороны, роль выключена через null)', function () {
  assert.strictEqual(validateSettings({ linkTypeRoles: [
    { type: 'Subtask', hier: 'source', dep: null, info: false },
    { type: 'Включает', hier: 'target', dep: null, info: true },
    { type: 'Relates', info: true },
  ] }), true);
});

test('#74: linkTypeRoles — отсутствие/null принимаются (backward compat: слоёный фолбэк резолвера)', function () {
  assert.strictEqual(validateSettings({}), true);
  assert.strictEqual(validateSettings({ linkTypeRoles: null }), true);
  assert.strictEqual(validateSettings({ linkTypeRoles: [] }), true);
});

test('#74: linkTypeRoles — reject: дубль type, пустой/длинный type, не-объект строки', function () {
  assert.strictEqual(validateSettings({ linkTypeRoles: [{ type: 'A' }, { type: 'A' }] }), false);
  assert.strictEqual(validateSettings({ linkTypeRoles: [{ type: '' }] }), false);
  assert.strictEqual(validateSettings({ linkTypeRoles: [{ type: 'x'.repeat(201) }] }), false);
  assert.strictEqual(validateSettings({ linkTypeRoles: [{ type: 'x'.repeat(200) }] }), true);
  assert.strictEqual(validateSettings({ linkTypeRoles: ['A'] }), false);
  assert.strictEqual(validateSettings({ linkTypeRoles: [null] }), false);
});

test('#74: linkTypeRoles — reject: сторона вне {source,target,null}, нелогический info, не-массив, >50 строк', function () {
  assert.strictEqual(validateSettings({ linkTypeRoles: [{ type: 'A', hier: 'left' }] }), false);
  assert.strictEqual(validateSettings({ linkTypeRoles: [{ type: 'A', dep: 'up' }] }), false);
  assert.strictEqual(validateSettings({ linkTypeRoles: [{ type: 'A', info: 'yes' }] }), false);
  assert.strictEqual(validateSettings({ linkTypeRoles: {} }), false);
  assert.strictEqual(validateSettings({ linkTypeRoles: Array.from({ length: 51 }, function (_, i) { return { type: 'T' + i }; }) }), false);
  assert.strictEqual(validateSettings({ linkTypeRoles: Array.from({ length: 50 }, function (_, i) { return { type: 'T' + i }; }) }), true);
});

test('#74: linkTypeRoles — в whitelist и в admin-тире (иначе ключ терялся бы на READ или при сейве планировщиком)', function () {
  const backendFull = require(path.join(__dirname, '..', '..', 'backend-project.js'));
  assert.ok(ALLOWED_SETTINGS_KEYS.indexOf('linkTypeRoles') >= 0, 'вне whitelist — migrateSettingsObj стёр бы ключ на READ');
  assert.ok(backendFull.ADMIN_TIER_SETTINGS_KEYS.indexOf('linkTypeRoles') >= 0, 'вне admin-тира — сейв планировочным менеджером затёр бы настройку');
});

test('#74: linkTypeRoles переживает round-trip через migrateSettingsObj (defensive strip не съедает)', function () {
  const backendFull = require(path.join(__dirname, '..', '..', 'backend-project.js'));
  const rows = [{ type: 'Subtask', hier: 'source', dep: null, info: false }];
  const out = backendFull.migrateSettingsObj({ activeRoles: ['analysis'], linkTypeRoles: rows });
  assert.deepStrictEqual(out.linkTypeRoles, rows);
});

test('#74: легаси-пара фраз остаётся в whitelist (лестница шаг 1 — backend принимает)', function () {
  assert.ok(ALLOWED_SETTINGS_KEYS.indexOf('cascadeParentLinkInward') >= 0);
  assert.ok(ALLOWED_SETTINGS_KEYS.indexOf('cascadeParentLinkOutward') >= 0);
  assert.strictEqual(validateSettings({ cascadeParentLinkInward: 'subtask of', cascadeParentLinkOutward: 'parent for',
    linkTypeRoles: [{ type: 'Subtask', hier: 'source' }] }), true);
});

test('#74 лестница шаг 1: блоб ТОЛЬКО с легаси-фразами читается и переписывается без потерь', function () {
  const backendFull = require(path.join(__dirname, '..', '..', 'backend-project.js'));
  /* Инстанс до v3.28.0: таблицы нет, фразы кастомные. Backend обязан принять их и на
     READ, и на WRITE — иначе фоновые правила каскада/подтяжки состояния осиротеют. */
  const legacy = { activeRoles: ['analysis'], cascadeParentLinkInward: 'part of epic', cascadeParentLinkOutward: 'epic of' };
  const read = backendFull.migrateSettingsObj(Object.assign({}, legacy));
  assert.strictEqual(read.cascadeParentLinkInward, 'part of epic');
  assert.strictEqual(read.cascadeParentLinkOutward, 'epic of');
  assert.strictEqual(validateSettings(read), true, 'migrate → validateForRead → validateForWrite');
});

test('#74 лестница шаг 1: таблица и легаси-пара сосуществуют (клиент v3.28.0 пишет обе)', function () {
  const backendFull = require(path.join(__dirname, '..', '..', 'backend-project.js'));
  const both = { activeRoles: ['analysis'], linkTypeRoles: [{ type: 'Subtask', hier: 'source', dep: null, info: false }],
    cascadeParentLinkInward: 'subtask of', cascadeParentLinkOutward: 'parent for' };
  const out = backendFull.migrateSettingsObj(Object.assign({}, both));
  assert.deepStrictEqual(out.linkTypeRoles, both.linkTypeRoles);
  assert.strictEqual(out.cascadeParentLinkInward, 'subtask of');
  assert.strictEqual(validateSettings(out), true);
});

test('#74: SCHEMA_MIGRATIONS достроен записью 3.27.0→3.28.0 (маркер уехал дальше — 68-8)', function () {
  const backendFull = require(path.join(__dirname, '..', '..', 'backend-project.js'));
  assert.strictEqual(backendFull.CURRENT_PLUGIN_VERSION, '3.29.0');
  const step = backendFull.SCHEMA_MIGRATIONS.find((m) => m.to === '3.28.0');
  assert.ok(step && step.from === '3.27.0', 'нет записи 3.27.0→3.28.0');
  /* Снимки shape не меняли — миграция обязана быть no-op (настройка project-level). */
  const snap = { sprintId: 'S-1', pluginVersion: '3.27.0' };
  const before = JSON.stringify(snap);
  step.migrate(snap);
  assert.strictEqual(JSON.stringify(snap), before);
});
