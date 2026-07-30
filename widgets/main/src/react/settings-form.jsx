/* v2.2.0 Phase 5 #32 — bespoke SettingsForm для openModal(body.kind:'component').
   Полная де-гибридизация settingsOverlay: вся форма настроек рендерится настоящим
   React внутри Ring Dialog (вместо vanilla .settings-overlay + applySettingsUI/
   collectSettings из DOM). Компонент изолирован от IIFE core.js — ВСЁ
   приходит через body.props (initial-настройки, списки полей, i18n-функция t,
   колбэки onSave/onClose). Регистрируется в реестре modal-mount.jsx.

   Суб-фазы (все собраны):
     5a — каркас + роли + поля-маппинги + нормы + режимы + прочее.
     5b — 4 группы-мультиселекта.
     5c — DTA + каскад + state-rollup + стендап (async bundle-данные через
          props.loadFieldValues/stateFieldName/enumFields).
   Раскладка — two-pane (nav-список секций слева + активная секция справа).
   Passthrough: collect() стартует с {...initial}, поэтому неизвестные ключи
   (savedAt, rescan-маркеры и т.п.) переносятся as-is и save их не теряет. */

import * as React from 'react';
/* R6 (аудит §7 п.13) — декомпозиция: общие контролы и 7 Section'ов вынесены по файлам. */
import { ADMIN_SECTION_IDS, noop, genZoneUid, I18nCtx, _btnCls, FieldSelect, NumField, RoleCheck, LockIcon, GrpMultiSelect, strOrNull, capValues, RingSelLite } from './settings-shared.jsx';
import { DtaSection } from './settings-dta.jsx';
import { CascadeSection } from './settings-cascade.jsx';
import { StateRollupSection } from './settings-rollup.jsx';
import { StandupSection } from './settings-standup.jsx';
import { BacklogSection } from './settings-backlog.jsx';
import { ReleaseSection } from './settings-release.jsx';
import { ReportingSection, _repThToRows, _repA1ToRows, _repFlowToRows, _repRowsToTh, _repRowsToA1, _repRowsToFlow } from './settings-reporting.jsx';

function SettingsForm(props) {
  const t = props.t || ((k) => k);
  const initial = props.initial || {};
  const roles = props.roles || [];
  const fieldsByType = props.fieldsByType || {};
  const onSave = props.onSave || (() => Promise.resolve({ success: true }));
  const onClose = props.onClose || noop;
  const onUiLangChange = props.onUiLangChange || noop;
  /* #22 — admin-тир (workflow-правила + доступ/права) рендерится только при true. */
  const canEditWorkflow = !!props.canEditWorkflow;

  /* ── Состояние формы (React source-of-truth; collect = сериализация этого) ── */
  const [activeRoles, setActiveRoles] = React.useState(() => (initial.activeRoles || []).slice());

  /* Поля-маппинги (7 одиночных селектов) */
  const [fields, setFields] = React.useState(() => ({
    fieldPriority: initial.fieldPriority || '',
    fieldXPriority: initial.fieldXPriority || '',
    fieldState: initial.fieldState || '',
    fieldSystem: initial.fieldSystem || '',
    fieldExternalTicketId: initial.fieldExternalTicketId || '',
    fieldSprint: initial.fieldSprint || '',
    fieldVersion: initial.fieldVersion || '',
    /* #21 — тип-назначение (Фича/Баг/…) для фильтра модуля «Работа с бэклогом». */
    fieldType: initial.fieldType || '',
  }));
  const setField = (k, v) => setFields((p) => Object.assign({}, p, { [k]: v }));

  /* Per-role est/fact/user (динамические ключи role.fieldEst/fieldFact/userField). */
  const [roleFields, setRoleFields] = React.useState(() => {
    const o = {};
    roles.forEach((r) => {
      o[r.key] = {
        est: (initial[r.fieldEst] || ''),
        fact: (initial[r.fieldFact] || ''),
        user: (initial[r.userField] || ''),
      };
    });
    return o;
  });
  const setRoleField = (rk, slot, v) =>
    setRoleFields((p) => Object.assign({}, p, { [rk]: Object.assign({}, p[rk], { [slot]: v }) }));

  /* Режимы (parent-child).
     v2.14.0 — «Модель планирования»: planningModel (simple|light|full) + lightSub
     (auto|manual) — источник правды UI. Тройка legacy-флагов больше не редактируется
     напрямую; пишется derived-зеркалом в collect (см. PLANNING_MODEL_SHIM). */
  const [modes, setModes] = React.useState(() => {
    const PM = globalThis.__SSP_PLANNING_MODEL_PURE;
    const pm = PM.planningModelFromSettings(initial);
    return {
      planningModel: pm.model,
      lightSub: pm.lightSub,
      /* PLANNING_MODEL_SHIM — фиксируем legacy-гибрид (PP on + useRes off) из исходных
         настроек один раз: пересохранение не должно насильно включать авто-перенос суммы. */
      legacyHybrid: PM.isLegacyHybrid(initial),
      dynEditEnabled: !!initial.dynEditEnabled,
      allowOverlimitPlanning: !!initial.allowOverlimitPlanning,
      /* #40 — авто-прогноз дат (кнопка + очередь на уровне «Люди»); планировочный тир. */
      autoForecastEnabled: !!initial.autoForecastEnabled,
      /* #59 — кросс-ролевое исключение; дефолт ON (ключа нет у старых установок). */
      crossRoleExcludeEnabled: initial.crossRoleExcludeEnabled !== false,
    };
  });
  const toggleMode = (k) => setModes((p) => Object.assign({}, p, { [k]: !p[k] }));
  const setMode = (k, v) => setModes((p) => Object.assign({}, p, { [k]: v }));

  /* Нормы */
  const [nums, setNums] = React.useState(() => {
    const kpe = initial.kpe || {};
    return {
      nkcJanuary: initial.nkcJanuary != null ? initial.nkcJanuary : 105,
      nkcMay: initial.nkcMay != null ? initial.nkcMay : 119,
      nkcOther: initial.nkcOther != null ? initial.nkcOther : 145,
      rate: initial.rate != null ? initial.rate : 1,
      participation: initial.participation != null ? initial.participation : 1,
      kpeIntern: kpe.Intern != null ? kpe.Intern : 0,
      kpeJun: kpe.Junior != null ? kpe.Junior : 0.5,
      kpeMid: kpe.Middle != null ? kpe.Middle : 0.65,
      kpeSenior: kpe.Senior != null ? kpe.Senior : 0.75,
    };
  });
  const setNum = (k, v) => setNums((p) => Object.assign({}, p, { [k]: v }));

  /* Группы-мультиселекты (5b): val / edit / histClear / assigner. */
  const [groups, setGroups] = React.useState(() => ({
    val: { ids: (initial.validationGroups || []).slice(), names: (initial.validationGroupNames || []).slice() },
    edit: { ids: (initial.editGroups || []).slice(), names: (initial.editGroupNames || []).slice() },
    histClear: { ids: (initial.historyClearGroups || []).slice(), names: (initial.historyClearGroupNames || []).slice() },
    sprintLock: { ids: (initial.sprintLockGroups || []).slice(), names: (initial.sprintLockGroupNames || []).slice() },   /* #57-2 */
    assigner: { ids: (initial.assignerGroups || []).slice(), names: (initial.assignerGroupNames || []).slice() },
    /* #22 — планировочный тир (Вариант C). */
    planning: { ids: (initial.planningManagerGroups || []).slice(), names: (initial.planningManagerGroupNames || []).slice() },
  }));
  const setGroup = (k, v) => setGroups((p) => Object.assign({}, p, { [k]: v }));

  /* Прочее */
  /* #56-5 — showDiagLogUi заменил инверсный hideDiagLogUi (лог скрыт по умолчанию). */
  const [showDiagLogUi, setShowDiagLogUi] = React.useState(initial.showDiagLogUi === true);
  const [defaultLang, setDefaultLang] = React.useState(initial.defaultLang || '');
  const [uiLang, setUiLang] = React.useState(props.uiLang || 'ru');

  /* ── 5c: DTA / каскад / state-rollup / стендап ── */
  const [dta, setDta] = React.useState(() => {
    const mapping = initial.workItemTypeMapping || {};
    return {
      enabled: !!initial.dtaEnabled,
      warnings: !!initial.dtaWarningsEnabled,
      rows: Object.keys(mapping).map((tp) => ({ type: tp, role: mapping[tp] || '' })),
    };
  });
  const [cascade, setCascade] = React.useState(() => ({
    agg: !!initial.cascadeAggregationEnabled,
    forbid: !!initial.forbidContainerWorkItems,
    kindField: (typeof initial.cascadeKindField === 'string') ? initial.cascadeKindField : '',
    level2: Array.isArray(initial.cascadeLevel2Values) ? initial.cascadeLevel2Values.slice() : [],
    level3: Array.isArray(initial.cascadeLevel3Values) ? initial.cascadeLevel3Values.slice() : [],
    linkIn: (typeof initial.cascadeParentLinkInward === 'string') ? initial.cascadeParentLinkInward : '',
    linkOut: (typeof initial.cascadeParentLinkOutward === 'string') ? initial.cascadeParentLinkOutward : '',
    tag: (typeof initial.cascadeManualEstTag === 'string') ? initial.cascadeManualEstTag : '',
  }));
  const [rollup, setRollup] = React.useState(() => ({
    enabled: !!initial.stateRollupEnabled,
    order: Array.isArray(initial.stateRollupOrder) ? initial.stateRollupOrder.slice() : [],
    resolved: Array.isArray(initial.stateRollupResolvedStates) ? initial.stateRollupResolvedStates.slice() : [],
    floor: (typeof initial.stateRollupFloor === 'string') ? initial.stateRollupFloor : '',
  }));
  const [standupDone, setStandupDone] = React.useState(() =>
    Array.isArray(initial.standupDoneStates) ? initial.standupDoneStates.slice() : []);
  /* #21 — «Работа с бэклогом»: зоны (состояние→роль(и), MANY) + старт-пул + фильтр по типу
     + источник паузы. Дефолты — пустые ([] = «не размечено» → fail-loud во вкладке, §8 спеки). */
  const [backlog, setBacklog] = React.useState(() => ({
    zones: Array.isArray(initial.backlogZones)
      ? initial.backlogZones.map((z) => ({ _uid: genZoneUid(), state: (z && z.state) || '', roles: (z && Array.isArray(z.roles)) ? z.roles.slice() : [] }))
      : [],
    startStates: Array.isArray(initial.backlogStartStates) ? initial.backlogStartStates.slice() : [],
    typeFilter: Array.isArray(initial.backlogTypeFilter) ? initial.backlogTypeFilter.slice() : [],
    pauseTags: Array.isArray(initial.backlogPauseTags) ? initial.backlogPauseTags.slice() : [],
    pauseStates: Array.isArray(initial.backlogPauseStates) ? initial.backlogPauseStates.slice() : [],
  }));
  /* #48 R1 — «Релиз-менеджмент»: тумблер + пул кандидатов + группы прав + маппинг
     статус→состояние (R3: зоны светофора — авто по State, своих настроек нет).
     Все дефолты пустые/выключены. */
  const [release, setRelease] = React.useState(() => ({
    enabled: !!initial.releaseEnabled,
    candMgr:   { ids: (initial.releaseCandidateManagerGroups || []).slice(),  names: (initial.releaseCandidateManagerGroupNames || []).slice() },
    candEng:   { ids: (initial.releaseCandidateEngineerGroups || []).slice(), names: (initial.releaseCandidateEngineerGroupNames || []).slice() },
    rightsMgr: { ids: (initial.releaseManagerGroups || []).slice(),           names: (initial.releaseManagerGroupNames || []).slice() },
    rightsEng: { ids: (initial.releaseEngineerGroups || []).slice(),          names: (initial.releaseEngineerGroupNames || []).slice() },
    mapping: Object.assign({ planned: '', prep: '', work: '', released: '', cancelled: '' },
      (initial.releaseStatusStateMapping && typeof initial.releaseStatusStateMapping === 'object') ? initial.releaseStatusStateMapping : {}),
    /* #55 — маппинг «статус → тег задач» (имена СУЩЕСТВУЮЩИХ тегов; пусто = без тега). */
    tagMapping: Object.assign({ planned: '', prep: '', work: '', released: '', cancelled: '' },
      (initial.releaseTagMapping && typeof initial.releaseTagMapping === 'object') ? initial.releaseTagMapping : {}),
  }));

  /* #50 — «Отчётность» (admin-тир). enabled + reporting-access группы A/B + пороги aging (S1c)
     + целевые статусы/ярлыки A1 (S2). */
  const [reporting, setReporting] = React.useState(() => ({
    enabled: !!initial.reportingEnabled,
    groupsA: { ids: (initial.reportingGroupsA || []).slice(), names: (initial.reportingGroupsANames || []).slice() },
    groupsB: { ids: (initial.reportingGroupsB || []).slice(), names: (initial.reportingGroupsBNames || []).slice() },
    /* #50 — статусные секции как строки-редактора (пикер+добавить); каноническая модель прежняя,
       конвертеры _rep*ToRows / _repRowsTo* (пороги-объект / цели-массив+ярлыки / поток-массив). */
    thRows: _repThToRows(initial.reportingThresholds),
    a1Rows: _repA1ToRows(initial.reportingTargetStatuses, initial.reportingStatusLabels),
    flowRows: _repFlowToRows(initial.reportingFlowStates),
    /* #50 S3a — A2 TTM: якоря / нормативы / маркеры пауз (аддитивно, defensive type-guards). */
    anchors: (initial.reportingAnchors && typeof initial.reportingAnchors === 'object'
      && !Array.isArray(initial.reportingAnchors)) ? initial.reportingAnchors : {},
    ttmNorms: (function () {
      const n = initial.reportingTtmNorms;
      const ok = n && typeof n === 'object' && !Array.isArray(n);
      return { lead: ok && n.lead !== undefined ? n.lead : 21, team: ok && n.team !== undefined ? n.team : 15 };
    })(),
    /* #50 v3.2.0 — A2 терминальная политика reopen: enum, всё кроме 'last-stable-close' → дефолт. */
    terminalPolicy: (initial.reportingTerminalPolicy === 'last-stable-close') ? 'last-stable-close' : 'first-close',
    variancePct: (typeof initial.reportingVariancePct === 'number' && isFinite(initial.reportingVariancePct)) ? initial.reportingVariancePct : 20,
    velocityWindow: (typeof initial.reportingVelocityWindow === 'number' && isFinite(initial.reportingVelocityWindow)) ? initial.reportingVelocityWindow : 3,
    timeoutSec: (typeof initial.reportingTimeoutSec === 'number' && isFinite(initial.reportingTimeoutSec)) ? initial.reportingTimeoutSec : 90,   /* #50 D10 таймаут-бэкстоп */
    maxIssues: (typeof initial.reportingMaxIssues === 'number' && isFinite(initial.reportingMaxIssues)) ? initial.reportingMaxIssues : 1000,   /* #58-5 ш2 — потолок задач среза */
    showSystem: initial.reportingShowSystem !== false,   /* v3.9.0 — «Система» в отчётах (дефолт ON) */
    /* #50 S6a — A3 : имена YT-полей бизнес-колонок среза (пусто = колонка скрыта). */
    a3StageField: (typeof initial.reportingA3StageField === 'string') ? initial.reportingA3StageField : '',
    a3OrgField: (typeof initial.reportingA3OrgField === 'string') ? initial.reportingA3OrgField : '',
    a3PriorityField: (typeof initial.reportingA3PriorityField === 'string') ? initial.reportingA3PriorityField : '',
    /* #50 S6b — A6: месячная ёмкость роли { roleKey → ч/мес } (знаменатель «месяцев бэклога»). */
    a6Capacity: (initial.reportingRoleMonthlyCapacity && typeof initial.reportingRoleMonthlyCapacity === 'object'
      && !Array.isArray(initial.reportingRoleMonthlyCapacity)) ? Object.assign({}, initial.reportingRoleMonthlyCapacity) : {},
    /* #50 S7a — A10: пороги «возраста хвоста» { warm|hot → int спринтов }. Дефолт {warm:2, hot:5} (мокап). */
    ageBands: (initial.reportingSpilloverAgeBands && typeof initial.reportingSpilloverAgeBands === 'object'
      && !Array.isArray(initial.reportingSpilloverAgeBands)) ? Object.assign({}, initial.reportingSpilloverAgeBands) : { warm: 2, hot: 5 },
    thousandTag: (typeof initial.reportingThousandTag === 'string') ? initial.reportingThousandTag : '',   /* #50 S8a — B3 тег */
    techDebtType: (typeof initial.reportingTechDebtType === 'string') ? initial.reportingTechDebtType : '',   /* #50 S8b — B1 отбор техдолга */
    techDebtTag: (typeof initial.reportingTechDebtTag === 'string') ? initial.reportingTechDebtTag : '',
    bugType: (typeof initial.reportingBugType === 'string') ? initial.reportingBugType : '',   /* #50 S8c — B2 тип-баг */
    linkTypes: Array.isArray(initial.reportingLinkTypes) ? initial.reportingLinkTypes.join(', ') : '',   /* #50 S8c — B2 типы связей баг→фича (CSV в форме) */
    pauseMarkers: (function () {
      const m = initial.reportingPauseMarkers;
      const ok = m && typeof m === 'object' && !Array.isArray(m);
      return {
        states: ok && Array.isArray(m.states) ? m.states.slice() : [],
        tags: ok && Array.isArray(m.tags) ? m.tags.slice() : [],
      };
    })(),
  }));

  /* Bundle-состояния state-поля проекта — общий источник для rollup + standup + backlog.
     Реактивно перезагружаются при смене ЖИВОГО выбора State-поля (fields.fieldState),
     а не один раз на mount по сохранённому props.stateFieldName — иначе выбор/смена
     поля состояния не подтягивала бандл (пустой пикер). Паттерн — как cascade.kindField. */
  const [bundleStates, setBundleStates] = React.useState([]);
  React.useEffect(() => {
    let alive = true;
    if (props.loadFieldValues) {
      Promise.resolve(props.loadFieldValues(fields.fieldState || props.stateFieldName || 'State'))
        .then((vals) => { if (alive && Array.isArray(vals)) setBundleStates(vals); })
        .catch(noop);
    }
    return () => { alive = false; };
  }, [fields.fieldState]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Two-pane: активная секция (левый nav → правый pane). Дефолт — первая секция.
     Заменяет прежний аккордеон (openCard/toggleCard) — плотные секции не тянулись
     одной колонкой в модалке ограниченной высоты (см. NEXT_SESSION_PROMPT §3). */
  const [activeSection, setActiveSection] = React.useState('roles');

  /* Save UX */
  const [saving, setSaving] = React.useState(false);
  const [hint, setHint] = React.useState(null); // {cls,text}

  const activeRoleList = roles.filter((r) => activeRoles.indexOf(r.key) >= 0);

  /* Валидация дублей est/fact (как _recomputeSaveBtnState): одно period-поле
     нельзя назначить двум ролям. Блокирует save. */
  function dupKeys(slot) {
    const seen = {}; const dups = {};
    activeRoleList.forEach((r) => {
      const v = roleFields[r.key] && roleFields[r.key][slot];
      if (!v) return;
      if (seen[v]) dups[v] = true; else seen[v] = true;
    });
    return dups;
  }
  const estDups = dupKeys('est');
  const factDups = dupKeys('fact');
  const hasEstDup = Object.keys(estDups).length > 0;
  const hasFactDup = Object.keys(factDups).length > 0;

  /* DTA: один work-item-type нельзя замаппить на 2 роли (дубль type-name блокирует save). */
  const dtaCounts = {};
  dta.rows.forEach((r) => { const tp = (r.type || '').trim(); if (tp) dtaCounts[tp] = (dtaCounts[tp] || 0) + 1; });
  const hasDtaDup = Object.keys(dtaCounts).some((k) => dtaCounts[k] > 1);
  /* rollup noHierarchy-подсказка: каскад задаёт иерархию (level2/level3). */
  const cascadeHasHierarchy = cascade.level2.length > 0 || cascade.level3.length > 0;

  /* #21 — дубль состояния в зонах бэклога блокирует save (бэкенд требует unique state). */
  const backlogStateCounts = {};
  backlog.zones.forEach((z) => { const s = (z.state || '').trim(); if (s) backlogStateCounts[s] = (backlogStateCounts[s] || 0) + 1; });
  const hasBacklogDup = Object.keys(backlogStateCounts).some((k) => backlogStateCounts[k] > 1);

  /* #50 (ревью) — дубли статусов в секциях отчётности блокируют save (иначе молчаливый
     last-wins/first-wins при проекции rows→объект), паттерн hasBacklogDup. */
  const _repDupIn = (rows) => {
    const c = {};
    (rows || []).forEach((r) => { const s = ((r && r.state) || '').trim(); if (s) c[s] = (c[s] || 0) + 1; });
    return Object.keys(c).some((k) => c[k] > 1);
  };
  const hasReportingDup = _repDupIn(reporting.thRows) || _repDupIn(reporting.a1Rows) || _repDupIn(reporting.flowRows);

  const blocked = hasEstDup || hasFactDup || hasDtaDup || hasBacklogDup || hasReportingDup;

  function toggleRole(rk) {
    setActiveRoles((prev) => {
      const i = prev.indexOf(rk);
      if (i >= 0) { const n = prev.slice(); n.splice(i, 1); return n; }
      return prev.concat([rk]);
    });
  }

  /* ── Сборка settings-объекта (passthrough из initial + реализованные секции) ── */
  function collect() {
    const data = Object.assign({}, initial); // passthrough нереализованных секций (5b/5c)

    data.activeRoles = activeRoles.slice();
    data.dynEditEnabled = modes.dynEditEnabled;
    /* v2.14.0 — planningModel = источник правды; legacy-флаги пишутся derived-зеркалом
       (расчёты/super-light читают их). PLANNING_MODEL_SHIM — derived-блок снять, когда
       расчёты переведут на planningModel (см. PLANNING_MODEL_DROPDOWN_SPEC §10). */
    data.planningModel = modes.planningModel;
    const _ppFlags = globalThis.__SSP_PLANNING_MODEL_PURE.planningModelToFlags(
      modes.planningModel, modes.lightSub, { legacyHybrid: modes.legacyHybrid });
    data.personalPlanningEnabled = _ppFlags.personalPlanningEnabled;
    data.usePersonalForResource = _ppFlags.usePersonalForResource;
    data.manualPersonalResource = _ppFlags.manualPersonalResource;
    data.allowOverlimitPlanning = modes.allowOverlimitPlanning;
    data.autoForecastEnabled = modes.autoForecastEnabled;   /* #40 */
    data.crossRoleExcludeEnabled = modes.crossRoleExcludeEnabled;   /* #59 */
    data.showDiagLogUi = showDiagLogUi;   /* #56-5 — hideDiagLogUi больше не пишем (soft-deprecated) */

    const num = (v, d) => { const f = parseFloat(v); return isFinite(f) ? f : d; };
    data.nkcJanuary = num(nums.nkcJanuary, 105);
    data.nkcMay = num(nums.nkcMay, 119);
    data.nkcOther = num(nums.nkcOther, 145);
    data.rate = num(nums.rate, 1);
    data.participation = num(nums.participation, 1);
    data.kpe = {
      Intern: num(nums.kpeIntern, 0),
      Junior: num(nums.kpeJun, 0.5),
      Middle: num(nums.kpeMid, 0.65),
      Senior: num(nums.kpeSenior, 0.75),
    };

    /* #45 R4 — capacityMode деривируется из planningModel: 'full' → модуль ёмкости вкл
       (вкладка Capacity + остаток планирования из утверждённой ёмкости), иначе 'light'.
       hoursPerDay/usefulHoursPerDay — константы Full-расчёта: passthrough из stored, дефолты
       (8/7) при первом включении Full. Все — admin-тир (preserve-merge для не-админа). */
    data.capacityMode = (modes.planningModel === 'full') ? 'full' : 'light';
    if (initial.hoursPerDay != null) data.hoursPerDay = initial.hoursPerDay;
    else if (data.capacityMode === 'full') data.hoursPerDay = 8;
    if (initial.usefulHoursPerDay != null) data.usefulHoursPerDay = initial.usefulHoursPerDay;
    else if (data.capacityMode === 'full') data.usefulHoursPerDay = 7;

    data.fieldPriority = fields.fieldPriority || null;
    data.fieldXPriority = fields.fieldXPriority || null;
    data.fieldState = fields.fieldState || null;
    data.fieldSystem = fields.fieldSystem || null;
    data.fieldExternalTicketId = fields.fieldExternalTicketId || null;
    data.fieldSprint = fields.fieldSprint || null;
    data.fieldVersion = fields.fieldVersion || null;
    data.fieldType = fields.fieldType || null;

    data.defaultLang = defaultLang || undefined;

    /* Группы (5b) */
    data.validationGroups = groups.val.ids.slice();
    data.validationGroupNames = groups.val.names.slice();
    data.editGroups = groups.edit.ids.slice();
    data.editGroupNames = groups.edit.names.slice();
    data.historyClearGroups = groups.histClear.ids.slice();
    data.historyClearGroupNames = groups.histClear.names.slice();
    data.sprintLockGroups = groups.sprintLock.ids.slice();          /* #57-2 */
    data.sprintLockGroupNames = groups.sprintLock.names.slice();
    data.assignerGroups = groups.assigner.ids.slice();
    data.assignerGroupNames = groups.assigner.names.slice();
    /* #22 — планировочный тир (Вариант C). */
    data.planningManagerGroups = groups.planning.ids.slice();
    data.planningManagerGroupNames = groups.planning.names.slice();

    /* DTA (5c): mapping из строк (пустой type/role скипается; дубль блокирует save выше). */
    data.dtaEnabled = dta.enabled;
    data.dtaWarningsEnabled = dta.warnings;
    data.workItemTypeMapping = (function () {
      const out = {};
      dta.rows.forEach((r) => {
        const tp = (r.type || '').trim();
        if (!tp || !r.role) return;
        out[tp] = r.role;
      });
      return out;
    })();

    /* Каскад (5c): 7 ключей. Пустые kind-field/links → null (backend допускает). */
    data.cascadeAggregationEnabled = cascade.agg;
    data.forbidContainerWorkItems = cascade.forbid;
    data.cascadeKindField = strOrNull(cascade.kindField);
    data.cascadeLevel2Values = capValues(cascade.level2);
    data.cascadeLevel3Values = capValues(cascade.level3);
    data.cascadeParentLinkInward = strOrNull(cascade.linkIn);
    data.cascadeParentLinkOutward = strOrNull(cascade.linkOut);
    data.cascadeManualEstTag = strOrNull(cascade.tag);

    /* State rollup (5c): strategy всегда 'min' (enum пока только min). */
    data.stateRollupEnabled = rollup.enabled;
    data.stateRollupOrder = rollup.order.slice();
    data.stateRollupResolvedStates = rollup.resolved.slice();
    data.stateRollupFloor = rollup.floor || null;
    data.stateRollupStrategy = 'min';

    /* Стендап (5c): done-состояния. */
    data.standupDoneStates = standupDone.slice();

    /* #21 — «Работа с бэклогом». Зоны: пустой state скипается, dedup по state,
       roles ∩ role keys (бэкенд: unique state, roles⊆ROLE_KEYS). Остальные — capValues.
       valid берётся из ВСЕХ ролей (не activeRoleList) НАМЕРЕННО: роль, размеченную при
       активной роли и позже деактивированную в «Составе», не теряем (паритет с DtaSection
       workItemTypeMapping; admin-конфиг переживает временную деактивацию). */
    data.backlogZones = (function () {
      const valid = {}; roles.forEach((r) => { valid[r.key] = true; });
      const out = []; const seen = {};
      backlog.zones.forEach((z) => {
        let st = String((z && z.state) || '').trim();
        if (!st || seen[st]) return;
        if (st.length > 200) st = st.slice(0, 200);
        seen[st] = true;
        const rls = []; const seenR = {};
        ((z && z.roles) || []).forEach((rk) => { if (valid[rk] && !seenR[rk]) { seenR[rk] = true; rls.push(rk); } });
        out.push({ state: st, roles: rls });
      });
      return out;
    })();
    data.backlogStartStates = capValues(backlog.startStates);
    data.backlogTypeFilter = capValues(backlog.typeFilter);
    data.backlogPauseTags = capValues(backlog.pauseTags);
    data.backlogPauseStates = capValues(backlog.pauseStates);

    /* #48 R1 — «Релиз-менеджмент». Группы — {ids,names}; маппинг — только непустые статусы;
       поле готовности — strOrNull; зоны — capValues. Все admin-тир (preserve-merge на бэке). */
    data.releaseEnabled = release.enabled;
    data.releaseCandidateManagerGroups = release.candMgr.ids.slice();
    data.releaseCandidateManagerGroupNames = release.candMgr.names.slice();
    data.releaseCandidateEngineerGroups = release.candEng.ids.slice();
    data.releaseCandidateEngineerGroupNames = release.candEng.names.slice();
    data.releaseManagerGroups = release.rightsMgr.ids.slice();
    data.releaseManagerGroupNames = release.rightsMgr.names.slice();
    data.releaseEngineerGroups = release.rightsEng.ids.slice();
    data.releaseEngineerGroupNames = release.rightsEng.names.slice();
    data.releaseStatusStateMapping = (function () {
      const out = {};
      ['planned', 'prep', 'work', 'released', 'cancelled'].forEach((k) => {
        const val = String((release.mapping && release.mapping[k]) || '').trim();
        if (val) out[k] = val.length > 200 ? val.slice(0, 200) : val;
      });
      return out;
    })();
    /* #55 — маппинг статус → тег (форма идентична state-маппингу). */
    data.releaseTagMapping = (function () {
      const out = {};
      ['planned', 'prep', 'work', 'released', 'cancelled'].forEach((k) => {
        const val = String((release.tagMapping && release.tagMapping[k]) || '').trim();
        if (val) out[k] = val.length > 200 ? val.slice(0, 200) : val;
      });
      return out;
    })();

    /* #50 — «Отчётность». enabled + reporting-access группы + пороги aging (admin-тир,
       preserve-merge на бэке). */
    data.reportingEnabled = reporting.enabled;
    data.reportingGroupsA = reporting.groupsA.ids.slice();
    data.reportingGroupsANames = reporting.groupsA.names.slice();
    data.reportingGroupsB = reporting.groupsB.ids.slice();
    data.reportingGroupsBNames = reporting.groupsB.names.slice();
    data.reportingThresholds = _repRowsToTh(reporting.thRows);
    const _repA1 = _repRowsToA1(reporting.a1Rows);
    data.reportingTargetStatuses = _repA1.states;
    data.reportingStatusLabels = _repA1.labels;
    data.reportingFlowStates = _repRowsToFlow(reporting.flowRows); /* #50 S4 — порядок = порядок строк */
    /* #50 S3a — A2 TTM: якоря / нормативы / маркеры пауз (admin-тир, preserve-merge на бэке). */
    data.reportingAnchors = reporting.anchors || {};
    data.reportingTtmNorms = reporting.ttmNorms || { lead: 21, team: 15 };
    data.reportingTerminalPolicy = (reporting.terminalPolicy === 'last-stable-close') ? 'last-stable-close' : 'first-close'; /* #50 v3.2.0 — A2 политика reopen */
    data.reportingVariancePct = (typeof reporting.variancePct === 'number' && isFinite(reporting.variancePct)) ? reporting.variancePct : 20; /* #50 S5b A5 */
    data.reportingVelocityWindow = (typeof reporting.velocityWindow === 'number' && isFinite(reporting.velocityWindow)) ? reporting.velocityWindow : 3; /* v3.12.0 #11 A11 */
    data.reportingTimeoutSec = (typeof reporting.timeoutSec === 'number' && isFinite(reporting.timeoutSec)) ? reporting.timeoutSec : 90; /* #50 D10 таймаут */
    data.reportingMaxIssues = (typeof reporting.maxIssues === 'number' && isFinite(reporting.maxIssues)) ? reporting.maxIssues : 1000; /* #58-5 ш2 — потолок задач среза */
    data.reportingShowSystem = reporting.showSystem !== false; /* v3.9.0 — «Система» в отчётах (bool, дефолт ON) */
    data.reportingPauseMarkers = reporting.pauseMarkers || { states: [], tags: [] };
    /* #50 S6a — A3 срез: имена YT-полей бизнес-колонок (пусто → null = колонка скрыта). */
    data.reportingA3StageField = reporting.a3StageField || null;
    data.reportingA3OrgField = reporting.a3OrgField || null;
    data.reportingA3PriorityField = reporting.a3PriorityField || null;
    data.reportingRoleMonthlyCapacity = reporting.a6Capacity || {}; /* #50 S6b — A6 месячная ёмкость роли */
    data.reportingSpilloverAgeBands = (reporting.ageBands && typeof reporting.ageBands === 'object' && !Array.isArray(reporting.ageBands)) ? reporting.ageBands : { warm: 2, hot: 5 }; /* #50 S7a — A10 пороги возраста хвоста */
    data.reportingThousandTag = reporting.thousandTag || null; /* #50 S8a — B3 тег «1000 мелочей» (контур B) */
    data.reportingTechDebtType = reporting.techDebtType || null; /* #50 S8b — B1 отбор техдолга (контур B) */
    data.reportingTechDebtTag = reporting.techDebtTag || null;
    data.reportingBugType = reporting.bugType || null; /* #50 S8c — B2 тип-баг (контур B) */
    data.reportingLinkTypes = (function () {   /* #50 S8c — B2 типы связей баг→фича: CSV → уникальный str[] */
      const seen = {}, out = [];
      String(reporting.linkTypes || '').split(',').forEach((s) => { const t = s.trim(); if (t && !seen[t]) { seen[t] = true; out.push(t); } });
      return out;
    })();

    /* Per-role: для ВСЕХ ролей (как legacy) — null для неактивных/неназначенных. */
    roles.forEach((r) => {
      const rf = (activeRoles.indexOf(r.key) >= 0) ? (roleFields[r.key] || {}) : {};
      data[r.fieldEst] = rf.est || null;
      data[r.fieldFact] = rf.fact || null;
      data[r.userField] = rf.user || null;
    });

    return data; // savedAt проставит легаси-колбэк onSave.
  }

  function doSave() {
    if (blocked || saving) return;
    setSaving(true);
    setHint({ cls: 'save-hint', text: t('toastSaving') });
    Promise.resolve(onSave(collect())).then((resp) => {
      setSaving(false);
      if (resp && resp.success === false) {
        setHint({ cls: 'save-err', text: t('toastSettingsErr') + (resp.reason ? ': ' + resp.reason : '') });
        return;
      }
      setHint({ cls: 'save-ok', text: t('toastSettingsSaved') });
    }).catch((e) => {
      setSaving(false);
      setHint({ cls: 'save-err', text: t('toastSettingsErr') + ': ' + (e && e.message ? e.message : String(e)) });
    });
  }

  function changeUiLang(lang) {
    setUiLang(lang);
    onUiLangChange(lang); // легаси меняет глобальный _lang + applyI18N остального UI; t() ниже читает новый язык
  }

  /* #43 W1 (C-1, Path B) — вендорный Ring Checkbox для сетки выбора ролей. */
  const RingCheckbox = globalThis.SSP_VENDORED && globalThis.SSP_VENDORED.Checkbox;

  /* ── Конфиг секций (two-pane): id → title → node. Контент идентичен прежним
     Card-блокам; меняется только обёртка (nav-список слева + активная секция справа).
     node вычисляется каждый рендер (дёшево) — все секции в одном scope.
     nav (#43 W2, B-3) — короткий label левого списка (один ряд, ровный ритм);
     полное название остаётся в pane__title. Без nav — в списке title. ── */
  const SECTIONS = [
    {
      id: 'roles', title: t('cardRoles'), nav: t('navRoles'),
      node: (
        <div className="roles-grid">
          {roles.map((r) => {
            const on = activeRoles.indexOf(r.key) >= 0;
            /* v3.12.2 — подпись роли через словарь (15 локалей), как roleLabel() ядра;
               бинарник en/ru отдавал кириллицу любой третьей локали (de/fr/…). */
            const lbl = t('role.' + r.key);
            return RingCheckbox
              ? <RingCheckbox key={r.key} checked={on} label={lbl} onChange={() => toggleRole(r.key)} />
              : (
                <div
                  key={r.key}
                  className={'role-check' + (on ? ' active' : '')}
                  onClick={() => toggleRole(r.key)}
                >
                  <span className="role-check__cb"></span>
                  <span className="role-check__label">{lbl}</span>
                </div>
              );
          })}
        </div>
      ),
    },
    {
      id: 'groups', title: t('cardGroups'),
      node: (
        <React.Fragment>
          {[
            { key: 'planning', label: t('lblPlanningManagerGroup'), hint: t('hintPlanningManagerGroup') },
            { key: 'val', label: t('lblValGroup') },
            { key: 'edit', label: t('lblEditGroup') },
            { key: 'histClear', label: t('lblHistClearGroup'), hint: t('hintHistClearGroup') },
            { key: 'assigner', label: t('lblAssignerGroup'), hint: t('hintAssignerGroup') },
            { key: 'sprintLock', label: t('lblSprintLockGroup'), hint: t('hintSprintLockGroup') },   /* #57-2 */
          ].map((g) => (
            <div className="field" key={g.key} style={{ marginBottom: '12px' }}>
              <label>{g.label}</label>
              <GrpMultiSelect
                t={t}
                value={groups[g.key]}
                onChange={(v) => setGroup(g.key, v)}
                initialGroups={props.initialGroups}
                loadGroups={props.loadGroups}
                onMax={() => setHint({ cls: 'save-err', text: t('toastMaxGroupsReached') })}
              />
              {g.hint ? <span className="hint" style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px', display: 'block' }}>{g.hint}</span> : null}
            </div>
          ))}
        </React.Fragment>
      ),
    },
    {
      id: 'fields', title: t('cardOtherFields'),
      node: (
        <React.Fragment>
          <div className="card-subtitle" style={{ fontSize: '12px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '8px' }}>
            {t('cardOtherFieldsRequired')}
          </div>
          <div className="form-grid form-grid--2">
            <div className="field">
              <label>{t('fldPriority')}</label>
              <FieldSelect value={fields.fieldPriority} onChange={(v) => setField('fieldPriority', v)} names={fieldsByType.priority} placeholder={t('phNotSelected')} />
            </div>
            <div className="field">
              <label>{t('fldState')}</label>
              <FieldSelect value={fields.fieldState} onChange={(v) => setField('fieldState', v)} names={fieldsByType.state} placeholder={t('phNotSelected')} />
            </div>
          </div>
          <div className="card-subtitle" style={{ fontSize: '12px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginTop: '16px', marginBottom: '8px' }}>
            {t('cardOtherFieldsOptional')}
          </div>
          <div className="form-grid form-grid--2">
            <div className="field">
              <label>{t('fldXpriority')}</label>
              <FieldSelect value={fields.fieldXPriority} onChange={(v) => setField('fieldXPriority', v)} names={fieldsByType.xpriority} placeholder={t('phNotSelected')} />
            </div>
            <div className="field">
              <label>{t('fldSystem')}</label>
              <FieldSelect value={fields.fieldSystem} onChange={(v) => setField('fieldSystem', v)} names={fieldsByType.system} placeholder={t('phNotSelected')} />
            </div>
            <div className="field">
              <label>{t('fldExternalTicketId')}</label>
              <FieldSelect value={fields.fieldExternalTicketId} onChange={(v) => setField('fieldExternalTicketId', v)} names={fieldsByType.externalTicketId} placeholder={t('phNotSelected')} />
            </div>
            <div className="field">
              <label>{t('fldSprint')}</label>
              <FieldSelect value={fields.fieldSprint} onChange={(v) => setField('fieldSprint', v)} names={fieldsByType.sprint} placeholder={t('phNotSelected')} />
            </div>
            <div className="field">
              <label>{t('fldVersion')}</label>
              <FieldSelect value={fields.fieldVersion} onChange={(v) => setField('fieldVersion', v)} names={fieldsByType.version} placeholder={t('phNotSelected')} />
            </div>
            {/* #21 — поле типа-назначения (Фича/Баг/…) для фильтра модуля «Работа с бэклогом». */}
            <div className="field">
              <label>{t('fldType')}</label>
              <FieldSelect value={fields.fieldType} onChange={(v) => { if (v !== fields.fieldType) setBacklog((b) => Object.assign({}, b, { typeFilter: [] })); setField('fieldType', v); }} names={fieldsByType.enumFields} placeholder={t('phNotSelected')} />
            </div>
          </div>
          <div className="card-subtitle" style={{ fontSize: '12px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginTop: '16px', marginBottom: '8px' }}>
            {t('cardUserFields')}
          </div>
          <div className="form-grid ssp-role-grid">
            {activeRoleList.map((r) => (
              <div className="field" key={r.key}>
                <label>{t('role.' + r.key)}</label>
                <FieldSelect value={roleFields[r.key] ? roleFields[r.key].user : ''} onChange={(v) => setRoleField(r.key, 'user', v)} names={fieldsByType.user} placeholder={t('phNotSelected')} />
              </div>
            ))}
          </div>
        </React.Fragment>
      ),
    },
    {
      id: 'est', title: t('cardFieldEst'), error: hasEstDup,
      node: (
        <React.Fragment>
          <div className="form-grid ssp-role-grid">
            {activeRoleList.map((r) => (
              <div className="field" key={r.key}>
                <label>{t('role.' + r.key)}</label>
                <FieldSelect value={roleFields[r.key] ? roleFields[r.key].est : ''} onChange={(v) => setRoleField(r.key, 'est', v)} names={fieldsByType.period} placeholder={t('phNotSelected')} />
              </div>
            ))}
          </div>
          {hasEstDup ? <div className="hint" style={{ fontSize: '12px', color: 'var(--error)', marginTop: '8px', fontWeight: 500 }}>{t('errDuplicateEstField')}</div> : null}
        </React.Fragment>
      ),
    },
    {
      id: 'fact', title: t('cardFieldFact'), nav: t('navFieldFact'), error: hasFactDup,
      node: (
        <React.Fragment>
          <div className="form-grid ssp-role-grid">
            {activeRoleList.map((r) => (
              <div className="field" key={r.key}>
                <label>{t('role.' + r.key)}</label>
                <FieldSelect value={roleFields[r.key] ? roleFields[r.key].fact : ''} onChange={(v) => setRoleField(r.key, 'fact', v)} names={fieldsByType.period} placeholder={t('phNotSelected')} />
              </div>
            ))}
          </div>
          {hasFactDup ? <div className="hint" style={{ fontSize: '12px', color: 'var(--error)', marginTop: '8px', fontWeight: 500 }}>{t('errDuplicateFactField')}</div> : null}
        </React.Fragment>
      ),
    },
    {
      /* #45 (b) — секция оставлена только с чисто-планировочными режимами.
         Нормы/КПЕ (бывшая «Учёт ёмкости») и personalPlanning-кластер (мастер + источник
         ресурса) переехали в admin-секцию «Управление ёмкостью». dynEdit + allowOverlimit
         намеренно ОСТАЮТСЯ здесь (планировочный тир). */
      id: 'modes', title: t('cardModes'),
      node: (
        <React.Fragment>
          <RoleCheck on={modes.dynEditEnabled} label={t('lblDynEdit')} hint={t('descDynEdit')} tooltip={t('tooltipDynEdit')} onToggle={() => toggleMode('dynEditEnabled')} />
          <div style={{ marginTop: '12px' }}>
            <RoleCheck on={modes.allowOverlimitPlanning} label={t('lblAllowOverlimit')} hint={t('descAllowOverlimit')} onToggle={() => toggleMode('allowOverlimitPlanning')} />
          </div>
          <div style={{ marginTop: '12px' }}>
            <RoleCheck on={modes.autoForecastEnabled} label={t('lblAutoForecast')} hint={t('descAutoForecast')} onToggle={() => toggleMode('autoForecastEnabled')} />
          </div>
        </React.Fragment>
      ),
    },
    {
      /* #59/#61 — запросы внешней команды: планирование одной задачи сразу на
         несколько ролей. Своя секция, а не «Режимы планирования»: тумблеры гейтят
         сквозную кросс-ролевую механику, а не режим отдельной таблицы. Тир —
         планировочный (не admin): включает/выключает поведение планирования. */
      id: 'multirole', title: t('cardMultirole'),
      node: (
        <React.Fragment>
          <RoleCheck on={modes.crossRoleExcludeEnabled} label={t('lblCrossRoleExclude')} hint={t('descCrossRoleExclude')} onToggle={() => toggleMode('crossRoleExcludeEnabled')} />
        </React.Fragment>
      ),
    },
    {
      id: 'dta', title: t('cardDta'), nav: t('navDta'), error: hasDtaDup,
      node: (
        <DtaSection t={t} value={dta} onChange={setDta} activeRoles={activeRoleList} uiLang={uiLang} hasDup={hasDtaDup} />
      ),
    },
    {
      id: 'cascade', title: t('cardCascade'), nav: t('navCascade'),
      node: (
        <CascadeSection t={t} value={cascade} onChange={setCascade} enumFields={props.enumFields || []} loadFieldValues={props.loadFieldValues} />
      ),
    },
    {
      id: 'rollup', title: t('cardStateRollup'), nav: t('navStateRollup'), error: rollup.order.length === 1,
      node: (
        <StateRollupSection t={t} value={rollup} onChange={setRollup} bundleStates={bundleStates} cascadeHasHierarchy={cascadeHasHierarchy} />
      ),
    },
    {
      id: 'standup', title: t('cardStandupSettings'),
      node: (
        <StandupSection t={t} value={standupDone} onChange={setStandupDone} bundleStates={bundleStates} />
      ),
    },
    {
      /* #21 — модуль «Работа с бэклогом» (admin-тир, §9 спеки: настройки = admin). */
      id: 'backlog', title: t('cardBacklog'), nav: t('navBacklog'), error: hasBacklogDup,
      node: (
        <BacklogSection
          t={t} value={backlog} onChange={setBacklog}
          bundleStates={bundleStates} activeRoles={activeRoleList} uiLang={uiLang}
          fieldTypeName={fields.fieldType} loadFieldValues={props.loadFieldValues} loadTags={props.loadTags}
          hasDup={hasBacklogDup}
        />
      ),
    },
    {
      /* #45 (b) — admin-секция «Управление ёмкостью»: нормы/КПЕ (бывшая «Учёт ёмкости»)
         + источник ресурса исполнителей (бывший personalPlanning-кластер из «Режимов»).
         Все ключи — admin-тир (см. backend ADMIN_TIER_SETTINGS_KEYS).
         L2: ввод Full-модели (capacityMode/hoursPerDay/usefulHoursPerDay) на main НЕ
         показываем — заглушка; значения сохраняются из stored в collect(). */
      id: 'capacity', title: t('cardCapacity'), nav: t('navCapacity'),
      node: (
        <React.Fragment>
          {/* Нормы расчёта ёмкости (бывшая секция «Учёт ёмкости»). */}
          <div className="card-subtitle" style={{ fontSize: '12px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '8px' }}>
            {t('cardWorkloadSettings')}
          </div>
          <div className="form-grid form-grid--3">
            <NumField id="s_nkc_january" label={t('lblNkcJanuary')} value={nums.nkcJanuary} onChange={(v) => setNum('nkcJanuary', v)} min={0} step={0.5} />
            <NumField id="s_nkc_may" label={t('lblNkcMay')} value={nums.nkcMay} onChange={(v) => setNum('nkcMay', v)} min={0} step={0.5} />
            <NumField id="s_nkc_other" label={t('lblNkcOther')} value={nums.nkcOther} onChange={(v) => setNum('nkcOther', v)} min={0} step={0.5} />
            <NumField id="s_rate" label={t('lblRate')} value={nums.rate} onChange={(v) => setNum('rate', v)} min={0} max={2} step={0.01} />
            <NumField id="s_participation" label={t('lblParticipation')} value={nums.participation} onChange={(v) => setNum('participation', v)} min={0} max={1} step={0.01} />
          </div>

          {/* КПЕ по грейдам. */}
          <div className="card-subtitle" style={{ fontSize: '12px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginTop: '16px', marginBottom: '8px' }}>
            {t('cardKpe')}
          </div>
          <div className="form-grid form-grid--3">
            <NumField id="s_kpe_intern" label={t('lblKpeIntern')} value={nums.kpeIntern} onChange={(v) => setNum('kpeIntern', v)} min={0} max={2} step={0.01} />
            <NumField id="s_kpe_jun" label={t('lblKpeJun')} value={nums.kpeJun} onChange={(v) => setNum('kpeJun', v)} min={0} max={2} step={0.01} />
            <NumField id="s_kpe_mid" label={t('lblKpeMid')} value={nums.kpeMid} onChange={(v) => setNum('kpeMid', v)} min={0} max={2} step={0.01} />
            <NumField id="s_kpe_senior" label={t('lblKpeSenior')} value={nums.kpeSenior} onChange={(v) => setNum('kpeSenior', v)} min={0} max={2} step={0.01} />
          </div>

          {/* v2.14.0 — «Модель планирования»: один dropdown (simple|light|full) заменяет
              тройку тогглов (PLANNING_MODEL_DROPDOWN_SPEC). Full (#45 R4) — модуль ёмкости:
              ресурс ролей из утверждённой ёмкости спринта, capacityMode='full' деривируется в collect.
              При light — radio способа расчёта ресурса (авто по формуле / ручной ввод). */}
          <div className="card-subtitle" style={{ fontSize: '12px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginTop: '16px', marginBottom: '8px' }}>
            {t('capGroupResource')}
          </div>
          <div className="field">
            <label htmlFor="s_planning_model">{t('lblPlanningModel')}</label>
            <RingSelLite
              options={[
                { key: 'simple', label: t('optModelSimple') },
                { key: 'light', label: t('optModelLight') },
                { key: 'full', label: t('optModelFull') },
              ]}
              value={modes.planningModel}
              onChange={(v) => setMode('planningModel', v)}
            />
            <div className="field-hint" style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '6px' }}>
              {t(modes.planningModel === 'full' ? 'descCapacityMode' : modes.planningModel === 'light' ? 'descModelLight' : 'descModelSimple')}
            </div>
          </div>
          {modes.planningModel === 'light' ? (
            <div className="field" style={{ marginTop: '12px' }} role="radiogroup" aria-label={t('lblLightCalcMethod')}>
              <label style={{ fontSize: '12px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '6px', display: 'block' }}>
                {t('lblLightCalcMethod')}
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', cursor: 'pointer' }}>
                <input type="radio" name="ssp-light-sub" checked={modes.lightSub === 'auto'} onChange={() => setMode('lightSub', 'auto')} />
                <span>{t('lblLightAuto')}</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input type="radio" name="ssp-light-sub" checked={modes.lightSub === 'manual'} onChange={() => setMode('lightSub', 'manual')} />
                <span>{t('lblLightManual')}</span>
              </label>
            </div>
          ) : null}
        </React.Fragment>
      ),
    },
    {
      id: 'misc', title: t('cardMisc'),
      node: (
        <React.Fragment>
          <div className="form-grid form-grid--2">
            <div className="field">
              <label>{t('lblLang')}</label>
              <RingSelLite
                options={[{ key: 'ru', label: '🇷🇺 RU' }, { key: 'en', label: '🇬🇧 EN' }]}
                value={uiLang} onChange={changeUiLang}
              />
            </div>
            <div className="field">
              <label>{t('lblDefaultLang')}</label>
              <RingSelLite
                options={(props.defaultLangOptions || [{ value: 'ru', label: 'RU' }, { value: 'en', label: 'EN' }]).map((o) => ({ key: o.value, label: o.label }))}
                value={defaultLang} clearable
                placeholder={t('optInheritFromUser') !== 'optInheritFromUser' ? t('optInheritFromUser') : '— inherit from user —'}
                onChange={setDefaultLang}
              />
            </div>
          </div>
          <div style={{ marginTop: '12px' }}>
            <RoleCheck on={showDiagLogUi} label={t('lblShowDiagLogUi')} hint={t('hintShowDiagLogUi')} onToggle={() => setShowDiagLogUi((v) => !v)} />
          </div>
        </React.Fragment>
      ),
    },
    {
      /* #48 R1 — «Релиз-менеджмент» (admin-тир; риск §8 обследования). */
      id: 'release', title: t('relTabTitle'), nav: t('relNavSettings'),
      node: (
        <ReleaseSection
          t={t} value={release} onChange={setRelease}
          bundleStates={bundleStates}
          loadTags={props.loadTags} /* #55 — опции колонки «Тег задач» */
          loadGroups={props.loadGroups} initialGroups={props.initialGroups}
          onMax={() => setHint({ cls: 'save-err', text: t('toastMaxGroupsReached') })}
        />
      ),
    },
    {
      /* #50 — «Отчётность» (admin-тир; данные чувствительны — доступ по reporting-группам). */
      id: 'reporting', title: t('repNavSettings'), nav: t('repNavSettings'), error: hasReportingDup,
      node: (
        <ReportingSection
          t={t} value={reporting} onChange={setReporting} activeRoles={activeRoleList} uiLang={uiLang}
          bundleStates={bundleStates} loadTags={props.loadTags}
          fieldsByType={fieldsByType} /* A3 — пикеры имён полей */
          fieldTypeName={fields.fieldType} loadFieldValues={props.loadFieldValues} /* B1/B2 — значения Type-поля */
          loadGroups={props.loadGroups} initialGroups={props.initialGroups}
          onMax={() => setHint({ cls: 'save-err', text: t('toastMaxGroupsReached') })}
        />
      ),
    },
  ];

  /* #22 — фильтр nav по тиру: не-админ (canEditWorkflow=false) не видит admin-секции. */
  const visibleSections = canEditWorkflow
    ? SECTIONS
    : SECTIONS.filter((s) => !ADMIN_SECTION_IDS[s.id]);
  const active = visibleSections.filter((s) => s.id === activeSection)[0] || visibleSections[0];

  return (
    <I18nCtx.Provider value={t}>
    <div className="ssp-settings-form">
      {/* Явный × закрытия в правом верхнем углу (Ring showCloseButton отключён в
         openSettingsModal — был бледным и у самого края island, неинтуитивен). */}
      <button
        type="button" className="ssp-settings-close"
        title={t('btnCloseSettingsTitle')} aria-label={t('btnCloseSettings')}
        onClick={() => onClose()}
      >×</button>
      <div className="ssp-settings-main">
        {/* ── Левый nav: список секций (кнопки → @ref в OOPIF, тестируемы agent-browser) ── */}
        {/* #22 — nav сгруппирован по тиру: «Планирование» (всегда) + «Администрирование»
            (workflow + доступ/права, с замком; только при canEditWorkflow). */}
        <nav className="ssp-settings-nav" aria-label={t('appTitleSettings')}>
          {[
            { tier: 'planning', label: t('navGroupPlanning'), lock: false },
            { tier: 'admin', label: t('navGroupAdmin'), lock: true },
          ].map((grp) => {
            const items = visibleSections.filter((s) => (ADMIN_SECTION_IDS[s.id] ? 'admin' : 'planning') === grp.tier);
            if (!items.length) return null;
            return (
              <React.Fragment key={grp.tier}>
                <div className="ssp-settings-nav__grouptitle" style={{ fontSize: '11px', letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--muted)', padding: '10px 10px 4px', fontWeight: 500 }}>
                  {grp.lock ? <LockIcon /> : null}{grp.label}
                </div>
                {items.map((s) => (
                  <button
                    key={s.id} type="button"
                    className={'ssp-settings-nav__item' + (s.id === active.id ? ' active' : '') + (s.error ? ' has-error' : '')}
                    aria-current={s.id === active.id ? 'true' : undefined}
                    onClick={() => setActiveSection(s.id)}
                  >
                    <span className="ssp-settings-nav__label">{s.nav || s.title}</span>
                    {s.error ? <span className="ssp-settings-nav__dot" aria-hidden="true">●</span> : null}
                  </button>
                ))}
              </React.Fragment>
            );
          })}
        </nav>

        {/* ── Правый pane: только активная секция (свой скролл) ── */}
        <div className="ssp-settings-pane">
          <div className="ssp-settings-pane__title">{active.title}</div>
          {active.node}
        </div>
      </div>

      {/* ── Footer: save + hint (flex-child снизу обеих панелей, всегда виден) ── */}
      <div className="ssp-modal-footer" style={{ alignItems: 'center' }}>
        <button type="button" className={_btnCls('secondary')} onClick={() => onClose()}>{t('btnCancel')}</button>
        <button type="button" className={_btnCls('primary')} disabled={blocked || saving} onClick={doSave}>{t('btnSaveSettings')}</button>
        {hint ? <span className={hint.cls} style={{ marginLeft: '10px', fontSize: '12px' }}>{hint.text}</span> : null}
      </div>
    </div>
    </I18nCtx.Provider>
  );
}

if (window.__SSP_RING_MODAL && typeof window.__SSP_RING_MODAL.registerBody === 'function') {
  window.__SSP_RING_MODAL.registerBody('settingsForm', SettingsForm);
}

export { SettingsForm };

