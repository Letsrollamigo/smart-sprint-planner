/**
 * Smart Sprint Planner — Differentiated Time Accounting (DTA) workflow rule.
 *
 * v1.2.1 — Acceptance hot-fix on top of v1.2.0:
 *   Bug A — workflow.message выходило на EN при русской локали юзера.
 *           ctx.currentUser.profile.locale.language в YT scripting workflow
 *           context часто либо undefined, либо в формате 'ru-RU' (а ключи
 *           словаря 'ru'). Сделали primary settings.defaultLang (project-level,
 *           всегда есть из widget settings), secondary — нормализованный
 *           currentUser.profile.locale.language (берём префикс до '-').
 *   Bug B — fact-поля не обновлялись после списания трудозатрат.
 *           Старый fieldFactName(role) синтезировал имя 'fact'+Role
 *           (например, 'factDevFront'), которого в реальном YT-проекте нет.
 *           Имя custom-field, в которое надо писать, уже хранится в
 *           settings[FIELD_FACT_KEY_BY_ROLE[role]] (например,
 *           settings.fieldFactDevFront = 'Факт разработка ФРОНТ ЧЧ') —
 *           заполняется из settings UI «Поля → Факт» при сохранении.
 *           Теперь читаем оттуда; синтетический fallback убран.
 *   Bug C — Issue.onChange в некоторых сборках YT 2024.3 не срабатывает
 *           на add/remove workItems. Добавили второй экспорт через
 *           IssueWorkItem.onChange — теперь любой YT-runtime, поддерживающий
 *           хотя бы один из двух событий, прогоняет агрегацию.
 *           Идемпотентность через cur-vs-target diff делает повторные
 *           срабатывания безопасными.
 *
 * Архитектурные инварианты (RESOLVED A-1..A-6, B-6):
 *   A-1: источник = `issue.workItems` (TimeTracking-логи).
 *   A-2: маппинг хранится в `ssp_settings.workItemTypeMapping`; constraint
 *        «один type → одна роль» обеспечивается JSON-object shape'ом.
 *   A-3: generic — поддерживает любое число активных ролей (читает
 *        settings.activeRoles + workItemTypeMapping).
 *   A-4: parent/child иерархия (Story/Epic) исключена.
 *   A-5: ИИ-экономия удалена.
 *   A-6: workflow поставляется в корне YT-app zip (паттерн VK Notifier).
 *   B-6: workflow.message локализуется (см. Bug A выше).
 */
const entities = require('@jetbrains/youtrack-scripting-api/entities');
const workflow = require('@jetbrains/youtrack-scripting-api/workflow');
const dateTime = require('@jetbrains/youtrack-scripting-api/date-time');

/* R3c (v3.7.0) — общая WF-инфраструктура вынесена в ./workflow-common.js
   (инвариант B-11 «self-contained» снят: sibling-require подтверждён
   стенд-пробами 3.3.94/3.3.95, битый require валит импорт приложения
   fail-fast). WF_I18N — объединённый словарь всех 4 правил (ключи дизъюнктны). */
const wfCommon = require('./workflow-common.js');
const WF_I18N                = wfCommon.WF_I18N;
const pickLocale             = wfCommon.pickLocale;
const tWf                    = wfCommon.tWf;
const readSettings           = wfCommon.readSettings;
const getMinutes             = wfCommon.getMinutes;
const formatMinutes          = wfCommon.formatMinutes;
const FIELD_FACT_KEY_BY_ROLE = wfCommon.FIELD_FACT_KEY_BY_ROLE;
const FIELD_EST_KEY_BY_ROLE  = wfCommon.FIELD_EST_KEY_BY_ROLE;

/* v1.2.4: целое число часов плана (без минут) — для строки «{planHours} ч»
   в notifyProgress. Совпадает с поведением оригинального workflow. */
function getHoursFromPeriod(p) {
  if (!p) return 0;
  const weeks = p.getWeeks ? (p.getWeeks() || 0) : 0;
  const days = p.getDays ? (p.getDays() || 0) : 0;
  const hours = p.getHours ? (p.getHours() || 0) : 0;
  return weeks * 5 * 8 + days * 8 + hours;
}

/* v1.2.4: локализованный лейбл «Xч Yм» / «Xh Ym» — для текущего факта
   в notifyProgress. unitH/unitM берутся из WF_I18N по lang. */
function toPeriodLabel(minutes, lang) {
  const p = dateTime.toPeriod((minutes || 0) * 60000);
  const h = p.getHours ? (p.getHours() || 0) : 0;
  const m = p.getMinutes ? (p.getMinutes() || 0) : 0;
  return h + tWf(lang, 'unitH') + ' ' + m + tWf(lang, 'unitM');
}

function isRoleActive(settings, role) {
  if (!settings || !settings.activeRoles) return false;
  if (Array.isArray(settings.activeRoles)) return settings.activeRoles.indexOf(role) >= 0;
  return Boolean(settings.activeRoles[role]);
}

/* v1.2.1 fix Bug B: имя реального custom-field берём из settings,
   которые SSP-виджет наполняет в settings UI «Поля → Факт». Если для
   роли поле не выбрано — возвращаем null и aggregate() пропускает её
   с warning. */
function fieldFactName(role, settings) {
  const settingsKey = FIELD_FACT_KEY_BY_ROLE[role];
  if (!settingsKey) return null;
  const v = settings && settings[settingsKey];
  return (typeof v === 'string' && v.length > 0) ? v : null;
}

function _wiMinutes(wi) {
  if (!wi) return 0;
  try {
    if (typeof wi.duration === 'number') return wi.duration;
    if (wi.duration && typeof wi.duration.minutes === 'number') return wi.duration.minutes;
    if (wi.duration) return getMinutes(wi.duration);
  } catch (_) {}
  return 0;
}

function _wiTypeName(wi) {
  try { return (wi && wi.type && wi.type.name) ? wi.type.name : ''; } catch (_) { return ''; }
}

function groupWorkItemsByType(issue) {
  const out = {};
  if (!issue || !issue.workItems) return out;
  issue.workItems.forEach(function(wi) {
    out[_wiTypeName(wi)] = (out[_wiTypeName(wi)] || 0) + _wiMinutes(wi);
  });
  return out;
}

/* v1.2.4 (#7 из оригинала): full recompute по всем workItems issue —
   используется когда есть `editedWorkItems` (старый тип неизвестен,
   delta невозможна без артефактов). */
function _computeRoleMinutesFull(issue, settings) {
  const mapping = settings.workItemTypeMapping || {};
  const byType = groupWorkItemsByType(issue);
  const out = {};
  Object.keys(byType).forEach(function(typeName) {
    const role = mapping[typeName];
    if (!role) return;
    out[role] = (out[role] || 0) + byType[typeName];
  });
  return out;
}

/* v1.2.4 (#7): delta — текущие fact-поля + added.duration - removed.duration.
   Безопасно когда editedWorkItems пуст (никто не сменил тип у уже
   существующего workItem). Inactive-role фильтруется в действии-обёртке. */
function _computeRoleMinutesDelta(issue, settings) {
  const mapping = settings.workItemTypeMapping || {};
  const out = {};

  /* 1. Стартовое значение из текущих fact-полей для каждой роли в маппинге. */
  const rolesInMapping = {};
  Object.keys(mapping).forEach(function(t) {
    const r = mapping[t];
    if (r) rolesInMapping[r] = true;
  });
  Object.keys(rolesInMapping).forEach(function(role) {
    const fname = fieldFactName(role, settings);
    let cur = 0;
    if (fname) {
      try {
        const v = issue.fields[fname];
        if (v) cur = getMinutes(v);
      } catch (_) {}
    }
    out[role] = cur;
  });

  /* 2. + added. */
  if (issue.workItems && issue.workItems.added && typeof issue.workItems.added.forEach === 'function') {
    issue.workItems.added.forEach(function(wi) {
      const role = mapping[_wiTypeName(wi)];
      if (!role) return;
      out[role] = (out[role] || 0) + _wiMinutes(wi);
    });
  }
  /* 3. - removed. */
  if (issue.workItems && issue.workItems.removed && typeof issue.workItems.removed.forEach === 'function') {
    issue.workItems.removed.forEach(function(wi) {
      const role = mapping[_wiTypeName(wi)];
      if (!role) return;
      out[role] = Math.max(0, (out[role] || 0) - _wiMinutes(wi));
    });
  }
  return out;
}

function _computeRoleMinutes(issue, settings) {
  /* Если есть editedWorkItems — полный пересчёт; иначе — оптимизированная
     дельта по added/removed. */
  const edited = issue && issue.editedWorkItems;
  let editedNotEmpty = false;
  if (edited) {
    if (typeof edited.isNotEmpty === 'function') editedNotEmpty = edited.isNotEmpty();
    else if (typeof edited.isEmpty === 'function') editedNotEmpty = !edited.isEmpty();
    else if (typeof edited.size === 'number') editedNotEmpty = edited.size > 0;
  }
  return editedNotEmpty
    ? _computeRoleMinutesFull(issue, settings)
    : _computeRoleMinutesDelta(issue, settings);
}

/* v1.2.4: уведомление о соотношении план/факт по роли. Три порога:
   <90% — info, 90-100% — ⚠️ остаток <10%, >100% — 🚨 ПЕРЕЛИМИТ.
   Подсказка («декомпозируй» vs «свяжись с аналитиком») зависит от того,
   является ли роль аналитической. Только для analysis-role hardcoded;
   все остальные роли получают executor-подсказку. */
function notifyProgress(roleKey, durMinutes, planPeriod, lang) {
  const label = tWf(lang, 'roleLabel_' + roleKey);
  const fact = toPeriodLabel(durMinutes, lang);
  const planMinutes = getMinutes(planPeriod);

  if (planMinutes <= 0) {
    try { workflow.message(tWf(lang, 'progressNoEstimate', { label: label, fact: fact })); } catch (_) {}
    return;
  }

  const planHours = getHoursFromPeriod(planPeriod);
  const percentNum = (durMinutes / planMinutes) * 100;
  const percent = percentNum.toFixed(2);
  const unitH = tWf(lang, 'unitH');
  const advice = (roleKey === 'analysis')
    ? tWf(lang, 'adviceAnalysis')
    : tWf(lang, 'adviceExecutor');
  const vars = {
    label: label, fact: fact,
    planHours: planHours, percent: percent, unitH: unitH, advice: advice
  };

  let key;
  if (percentNum < 90)         key = 'progressUnder90';
  else if (percentNum <= 100)  key = 'progressNearLimit';
  else                         key = 'progressOverLimit';

  try { workflow.message(tWf(lang, key, vars)); } catch (_) {}
}

function aggregate(issue, settings, lang) {
  const mapping = settings.workItemTypeMapping || {};

  /* v1.2.4: full vs delta — выбирается _computeRoleMinutes по наличию
     editedWorkItems. Inactive-role диагностика делается отдельным
     pre-проходом по mapping (одно сообщение на проблемный type). */
  const roleMinutesRaw = _computeRoleMinutes(issue, settings);

  /* Diagnostic: type → role, role не active. Один проход по mapping. */
  Object.keys(mapping).forEach(function(typeName) {
    const role = mapping[typeName];
    if (role && !isRoleActive(settings, role) && roleMinutesRaw.hasOwnProperty(role)) {
      try { workflow.message(tWf(lang, 'errInvalidRole', { type: typeName, role: role })); } catch (_) {}
    }
  });

  /* Отфильтровываем inactive-роли из результата. */
  const roleMinutes = {};
  Object.keys(roleMinutesRaw).forEach(function(role) {
    if (isRoleActive(settings, role)) roleMinutes[role] = roleMinutesRaw[role];
  });

  /* Обнуляем fact-поля для активных ролей в маппинге, у которых нет
     workItems (cleanup stale-значений после удаления всех). */
  const rolesInMapping = {};
  Object.keys(mapping).forEach(function(t) {
    const r = mapping[t];
    if (r && isRoleActive(settings, r)) rolesInMapping[r] = true;
  });
  Object.keys(rolesInMapping).forEach(function(r) {
    if (!(r in roleMinutes)) roleMinutes[r] = 0;
  });

  const changes = [];
  Object.keys(roleMinutes).forEach(function(role) {
    const fname = fieldFactName(role, settings);
    if (!fname) {
      try { workflow.message(tWf(lang, 'errFieldMissing', { role: role })); } catch (_) {}
      return;
    }
    let cur = 0;
    try {
      const v = issue.fields[fname];
      if (v) cur = getMinutes(v);
    } catch (_) {}
    const target = roleMinutes[role];
    if (cur !== target) {
      try {
        if (target > 0) {
          issue.fields[fname] = dateTime.toPeriod(target * 60000);
        } else {
          issue.fields[fname] = null;
        }
        changes.push({ field: fname, role: role, from: cur, to: target });
      } catch (_) { /* поле не period-type / не существует — тихо пропускаем */ }
    }

    /* v1.2.4: notifyProgress если флаг включён. Срабатывает даже если
       cur === target (для каждого нового списания мы хотим уведомить
       пользователя об актуальном проценте). */
    if (settings.dtaWarningsEnabled) {
      let planPeriod = null;
      try {
        const planFieldKey = FIELD_EST_KEY_BY_ROLE[role];
        const planFieldName = planFieldKey ? settings[planFieldKey] : null;
        if (planFieldName && typeof planFieldName === 'string') {
          planPeriod = issue.fields[planFieldName];
        }
      } catch (_) {}
      notifyProgress(role, target, planPeriod, lang);
    }
  });
  return changes;
}

/* v1.2.4: mandatory type-check для каждого added/edited workItem.
   workflow.check блокирует save если condition false → save fails,
   юзер видит сообщение. removed-items не проверяем (там тип уже
   ничего не значит). */
function _assertAllAddedHaveType(issue, lang) {
  if (!issue || !issue.workItems) return;
  function each(coll) {
    if (!coll || typeof coll.forEach !== 'function') return;
    coll.forEach(function(wi) {
      workflow.check(!!(wi && wi.type), tWf(lang, 'errMissingType'));
    });
  }
  each(issue.workItems.added);
  each(issue.editedWorkItems);
}

function _runIfDtaEnabled(issue, ctx) {
  if (!issue) return;
  const settings = wfCommon.takeSettings(issue);
  if (!settings || !settings.dtaEnabled) return;
  if (!settings.workItemTypeMapping || !Object.keys(settings.workItemTypeMapping).length) return;
  wfCommon.setHoursPerDay(settings.hoursPerDay);

  const lang = pickLocale(ctx, settings);

  /* Type-check ДО aggregate: если есть added/edited без type — workflow.check
     прервёт выполнение через throw и save не пройдёт. */
  _assertAllAddedHaveType(issue, lang);

  const changes = aggregate(issue, settings, lang);
  if (changes && changes.length) {
    const details = changes.map(function(c) {
      return c.field + ': ' + formatMinutes(c.from) + ' → ' + formatMinutes(c.to);
    }).join('; ');
    try {
      workflow.message(tWf(lang, 'msgFactUpdated', {
        issueId: issue.id,
        details: details
      }));
    } catch (_) {}
  }
}

/* v1.2.4: guard расширен.
   - `isReported && !isResolved` — не дёргаем workflow для черновиков и
     для закрытых issue (последнее особенно важно: после Resolved
     перерасчёт fact-полей не нужен и может конфликтовать с другими
     workflows-замораживателями).
   - `hasWorkItemChanges` — workflow стартует только если затронуты
     workItems (а не любое изменение issue). Это снижает количество
     no-op срабатываний на изменения других полей.
   Если на текущем YT-билде collections `added/editedWorkItems/removed`
   не имеют `.isNotEmpty()` — fallback на best-effort (size, length,
   isEmpty), либо считаем что workItems могли поменяться. */
function _hasWorkItemChanges(issue) {
  if (!issue || !issue.workItems) return false;
  if (wfCommon.collNotEmpty(issue.workItems.added)) return true;
  if (wfCommon.collNotEmpty(issue.workItems.removed)) return true;
  if (wfCommon.collNotEmpty(issue.editedWorkItems)) return true;
  return false;
}

function _commonGuard(issue) {
  if (!issue) return false;
  /* Skip drafts and resolved issues. */
  try {
    if (issue.isReported === false) return false;
    if (issue.isResolved === true) return false;
  } catch (_) { /* fields могут быть недоступны — пропускаем чек */ }
  /* v3.2.1 — дешёвый отсекатель ПЕРВЫМ: readSettings парсит многокилобайтный
     ssp_settings на КАЖДОЕ изменение любого поля любой задачи проекта; раньше
     parse стоял до чека workItems и налогом ложился на все массовые правки. */
  if (!_hasWorkItemChanges(issue)) return false;
  const settings = readSettings(issue);
  wfCommon.stashSettings(issue, settings); /* handoff guard→action — workflow-common */
  if (!settings || !settings.dtaEnabled) return false;
  if (!settings.workItemTypeMapping) return false;
  if (!Object.keys(settings.workItemTypeMapping).length) return false;
  return true;
}

/* v1.2.3 (acceptance fix #3): YT scripting API регистрирует workflow rule
   ТОЛЬКО когда экспорт называется ровно `exports.rule` (так это сделано
   в VK Workspace Notifier и так требует JetBrains Apps spec).
   Кастомные имена `exports.issueRule` / `exports.workItemRule` YT парсит
   как "exported script" (action/script-type), а не как on-change rule.
   В UI YT Admin → Workflows такой entry не получает on-change-trigger.
   Возвращаемся к одиночному `exports.rule = entities.Issue.onChange(...)`.
   Issue.onChange срабатывает на add/remove workItems как часть
   issue-update event (тот же cascading-mutation механизм, что и для
   comments.added / tags.added в VK Notifier). */
exports.rule = entities.Issue.onChange({
  title: 'Smart Sprint Planner — DTA workItem aggregation',
  guard: function(ctx) { return _commonGuard(ctx && ctx.issue); },
  action: function(ctx) { _runIfDtaEnabled(ctx && ctx.issue, ctx); }
});

// v1.7.1 — Test-only exports (для node --test). YT scripting игнорирует typeof module проверку.
if (typeof module !== 'undefined' && module.exports) {
  Object.assign(module.exports, {
    WF_I18N:    WF_I18N,
    tWf:        tWf,
    pickLocale: pickLocale
  });
}
