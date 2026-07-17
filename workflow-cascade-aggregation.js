/**
 * Smart Sprint Planner — Cascade aggregation parent ← child workflow rule.
 *
 * v1.3.0 — RESOLVED B-1..B-14 (см. .roadmap-source/feature-2-cascade-and-forbid.md):
 *   B-1: один общий link type для всех уровней (settings.cascadeParentLinkInward
 *        / cascadeParentLinkOutward; default «subtask of» / «parent for»).
 *   B-2: поля для агрегации derived из DTA — settings.fieldFact* +
 *        settings.fieldEst* для active roles через FIELD_FACT_KEY_BY_ROLE +
 *        FIELD_EST_KEY_BY_ROLE.
 *   B-7: 2 уровня иерархии max (level-2 = story-like, level-3 = epic-like).
 *   B-8: kind-field name + values конфигурируемы (settings.cascadeKindField,
 *        cascadeLevel2Values, cascadeLevel3Values).
 *   B-9: generic — никаких русско-специфичных хардкодов.
 *   B-10: workflow.message локализуется в 15 языках (WF_I18N — workflow-common.js, R3c).
 *   B-11 (снят R3c): общая инфраструктура — ./workflow-common.js; exports.rule =
 *         entities.Issue.onChange (v1.2.3 lesson — YT регистрирует только имя `rule`).
 *   B-12: parent.fields.updated = Date.now() после агрегации.
 *   B-13: idempotency через cur !== target diff — безопасно от infinite loop
 *         когда cascade триггерит сам себя на parent.
 */
const entities = require('@jetbrains/youtrack-scripting-api/entities');
const workflow = require('@jetbrains/youtrack-scripting-api/workflow');
const dateTime = require('@jetbrains/youtrack-scripting-api/date-time');

/* R3c (v3.7.0) — общая WF-инфраструктура вынесена в ./workflow-common.js
   (B-11 снят, см. workflow-common.js). WF_I18N — объединённый словарь. */
const wfCommon = require('./workflow-common.js');
const WF_I18N                = wfCommon.WF_I18N;
const pickLocale             = wfCommon.pickLocale;
const tWf                    = wfCommon.tWf;
const readSettings           = wfCommon.readSettings;
const getMinutes             = wfCommon.getMinutes;
const formatMinutes          = wfCommon.formatMinutes;
const FIELD_FACT_KEY_BY_ROLE = wfCommon.FIELD_FACT_KEY_BY_ROLE;
const FIELD_EST_KEY_BY_ROLE  = wfCommon.FIELD_EST_KEY_BY_ROLE;
const _kindName              = wfCommon.kindName;
const _firstLink             = wfCommon.firstLink;
const _collectChildren       = wfCommon.collectChildren;

/* List всех cascade-агрегируемых полей: settings.fieldFact* +
   settings.fieldEst* для active roles, в порядке activeRoles. Пустые
   настройки фильтруются. Используется и в guard'е, и в aggregateToParent. */
function _activeFieldList(settings) {
  if (!settings || !Array.isArray(settings.activeRoles)) return [];
  const out = [];
  settings.activeRoles.forEach(function(role) {
    const factKey = FIELD_FACT_KEY_BY_ROLE[role];
    const estKey = FIELD_EST_KEY_BY_ROLE[role];
    if (factKey && typeof settings[factKey] === 'string' && settings[factKey].length) out.push(settings[factKey]);
    if (estKey && typeof settings[estKey] === 'string' && settings[estKey].length) out.push(settings[estKey]);
  });
  return out;
}

/* v1.3.1: индекс field-name → kind ('est' | 'fact'). Используется для
   разделения уведомлений про обновление оценок vs трудозатрат. */
function _buildFieldKindIndex(settings) {
  const idx = {};
  if (!settings || !Array.isArray(settings.activeRoles)) return idx;
  settings.activeRoles.forEach(function(role) {
    const factName = settings[FIELD_FACT_KEY_BY_ROLE[role]];
    const estName  = settings[FIELD_EST_KEY_BY_ROLE[role]];
    if (typeof factName === 'string' && factName.length) idx[factName] = 'fact';
    if (typeof estName  === 'string' && estName.length)  idx[estName]  = 'est';
  });
  return idx;
}

/* Сумма поля fieldName по всем children. Idempotent: пишет в parent
   только если cur !== target (B-13). Возвращает массив изменений.
   v1.3.1: workflow.message эмитится отдельно по группам est / fact —
   чтобы текст уведомления соответствовал реальному типу обновлённых
   полей (раньше всё описывалось как «трудозатраты»). */
function aggregateToParent(parent, settings, lang) {
  const outwardLinkName = (settings && typeof settings.cascadeParentLinkOutward === 'string' && settings.cascadeParentLinkOutward.length)
    ? settings.cascadeParentLinkOutward : 'parent for';
  const children = _collectChildren(parent, outwardLinkName);
  /* R6/P-5 — пересумма осталась ПОЛНОЙ по всем активным полям (контракт «both DTA fields»:
     любое событие бутстрапит родителя целиком — включение каскада на живой иерархии).
     Сужение по isChanged-полям и value-дельта ОТВЕРГНУТЫ осознанно: ломают бутстрап /
     несут дрейф. Экономию даёт intra-run дедуп целей в _runCascade. */
  const fields = _activeFieldList(settings);
  const fieldKind = _buildFieldKindIndex(settings);
  const changes = [];
  fields.forEach(function(fieldName) {
    let total = 0;
    children.forEach(function(c) {
      try {
        const v = c.fields[fieldName];
        if (v) total += getMinutes(v);
      } catch (_) {}
    });
    let cur = 0;
    try {
      const v = parent.fields[fieldName];
      if (v) cur = getMinutes(v);
    } catch (_) {}
    if (cur !== total) {
      try {
        if (total > 0) {
          parent.fields[fieldName] = dateTime.toPeriod(total * 60000);
        } else {
          parent.fields[fieldName] = null;
        }
        changes.push({ field: fieldName, from: cur, to: total, kind: fieldKind[fieldName] || 'fact' });
      } catch (_) { /* не period-type / не существует — тихо пропускаем */ }
    }
  });
  if (changes.length) {
    try { parent.fields.updated = Date.now(); } catch (_) {}
    /* Группируем по kind и эмитим отдельные сообщения для est / fact.
       Если admin перепутал маппинг и одно поле висит и там и там —
       fool-proof валидация в settings UI блокирует save. */
    const groups = { est: [], fact: [] };
    changes.forEach(function(c) {
      (groups[c.kind] || groups.fact).push(c);
    });
    ['est', 'fact'].forEach(function(kind) {
      const arr = groups[kind];
      if (!arr.length) return;
      const details = arr.map(function(c) {
        return tWf(lang, 'cascadeFieldChange', {
          field: c.field, from: formatMinutes(c.from), to: formatMinutes(c.to)
        });
      }).join('; ');
      const msgKey = (kind === 'est') ? 'cascadeUpdatedEst' : 'cascadeUpdatedFact';
      try {
        workflow.message(tWf(lang, msgKey, { issueId: parent.id, details: details }));
      } catch (_) {}
    });
  }
  return changes;
}

function _runCascade(issue, ctx) {
  const settings = wfCommon.takeSettings(issue);
  if (!settings || !settings.cascadeAggregationEnabled) return;
  wfCommon.setHoursPerDay(settings.hoursPerDay);
  const lvl2 = Array.isArray(settings.cascadeLevel2Values) ? settings.cascadeLevel2Values : [];
  const lvl3 = Array.isArray(settings.cascadeLevel3Values) ? settings.cascadeLevel3Values : [];
  if (!lvl2.length && !lvl3.length) return;

  const inwardLink = (typeof settings.cascadeParentLinkInward === 'string' && settings.cascadeParentLinkInward.length)
    ? settings.cascadeParentLinkInward : 'subtask of';
  const lang = pickLocale(ctx, settings);

  /* R6/P-4 — intra-run дедуп целей: для level-2-события Path (1) и Path (3) бьют ОДИН
     и тот же узел (второй проход был идемпотентным no-op — чистое CPU×children×fields).
     Семантика пересчёта не менялась: каждый узел по-прежнему пересуммируется целиком. */
  const done = {};

  /* (1) child → parent (level-2 OR level-3). */
  const parent = _firstLink(issue, inwardLink);
  if (parent) {
    const pKind = _kindName(parent, settings);
    if (pKind && (lvl2.indexOf(pKind) >= 0 || lvl3.indexOf(pKind) >= 0)) {
      done[parent.id] = 1;
      aggregateToParent(parent, settings, lang);
      /* (2) parent — level-2 → пересчитать level-3 grandparent. */
      if (lvl2.indexOf(pKind) >= 0) {
        const grand = _firstLink(parent, inwardLink);
        if (grand && !done[grand.id]) {
          const gKind = _kindName(grand, settings);
          if (gKind && lvl3.indexOf(gKind) >= 0) {
            done[grand.id] = 1;
            aggregateToParent(grand, settings, lang);
          }
        }
      }
    }
  }

  /* (3) Прямое изменение level-2 → пересчитать level-3 parent (если есть). */
  const myKind = _kindName(issue, settings);
  if (myKind && lvl2.indexOf(myKind) >= 0) {
    const myParent = _firstLink(issue, inwardLink);
    if (myParent && !done[myParent.id]) {
      const mpKind = _kindName(myParent, settings);
      if (mpKind && lvl3.indexOf(mpKind) >= 0) {
        done[myParent.id] = 1;
        aggregateToParent(myParent, settings, lang);
      }
    }
  }
}

function _guard(ctx) {
  const issue = ctx && ctx.issue;
  if (!issue) return false;
  const settings = readSettings(issue);
  wfCommon.stashSettings(issue, settings); /* handoff guard→action — workflow-common */
  if (!settings || !settings.cascadeAggregationEnabled) return false;
  const fields = _activeFieldList(settings);
  if (!fields.length) return false;
  /* Срабатываем только если изменилось одно из cascade-полей. */
  for (let i = 0; i < fields.length; i++) {
    try {
      if (issue.fields.isChanged && issue.fields.isChanged(fields[i])) return true;
    } catch (_) {}
  }
  return false;
}

/* v1.2.3 lesson learned: YT scripting registers a workflow rule only when
   the export is named exactly `exports.rule`. */
exports.rule = entities.Issue.onChange({
  title: 'Smart Sprint Planner — cascade aggregation parent ← child',
  guard: _guard,
  action: function(ctx) { _runCascade(ctx && ctx.issue, ctx); }
});

// v1.7.1 — Test-only exports (для node --test). YT scripting игнорирует typeof module проверку.
if (typeof module !== 'undefined' && module.exports) {
  Object.assign(module.exports, {
    WF_I18N:    WF_I18N,
    tWf:        tWf,
    pickLocale: pickLocale
  });
}
