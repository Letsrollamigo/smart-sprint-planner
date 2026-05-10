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
 *   B-10: workflow.message локализуется в 15 языках (WF_I18N inline).
 *   B-11: self-contained файл, exports.rule = entities.Issue.onChange (см.
 *         v1.2.3 lesson learned — YT регистрирует rule только при имени `rule`).
 *   B-12: parent.fields.updated = Date.now() после агрегации.
 *   B-13: idempotency через cur !== target diff — безопасно от infinite loop
 *         когда cascade триггерит сам себя на parent.
 */
const entities = require('@jetbrains/youtrack-scripting-api/entities');
const workflow = require('@jetbrains/youtrack-scripting-api/workflow');
const dateTime = require('@jetbrains/youtrack-scripting-api/date-time');

const SETTINGS_KEY = 'ssp_settings';
const FALLBACK_LANG = 'en';

/* role-key → settings-key для fact/plan полей. Дублируется с
   workflow-dta-aggregation.js (self-contained per B-11). */
const FIELD_FACT_KEY_BY_ROLE = {
  analysis:    'fieldFactAnalysis',
  testing:     'fieldFactTesting',
  devPlatform: 'fieldFactDevPlatform',
  devBack:     'fieldFactDevBack',
  devFront:    'fieldFactDevFront',
  devIos:      'fieldFactDevIos',
  devAndroid:  'fieldFactDevAndroid',
  devFs:       'fieldFactDevFullstack',
  devDb:       'fieldFactDevDb'
};

const FIELD_EST_KEY_BY_ROLE = {
  analysis:    'fieldAnalysis',
  testing:     'fieldTesting',
  devPlatform: 'fieldDevPlatform',
  devBack:     'fieldDevBack',
  devFront:    'fieldDevFront',
  devIos:      'fieldDevIos',
  devAndroid:  'fieldDevAndroid',
  devFs:       'fieldDevFullstack',
  devDb:       'fieldDevDb'
};

/* v1.3.1: разделили cascadeUpdated на est (оценки) / fact (трудозатраты).
   Backward-compat: старый ключ cascadeUpdated больше не используется
   workflow'ом; читать его из settings админам не нужно. */
const WF_I18N = {
  en: {
    cascadeUpdatedEst:  'Cascade-updated estimates in {issueId}: {details}',
    cascadeUpdatedFact: 'Cascade-updated work hours in {issueId}: {details}',
    cascadeFieldChange: '{field}: {from} → {to}'
  },
  ru: {
    cascadeUpdatedEst:  'Каскадно обновлены оценки в {issueId}: {details}',
    cascadeUpdatedFact: 'Каскадно обновлены трудозатраты в {issueId}: {details}',
    cascadeFieldChange: '{field}: {from} → {to}'
  },
  cs: {
    cascadeUpdatedEst:  'Kaskádově aktualizovány odhady v {issueId}: {details}',
    cascadeUpdatedFact: 'Kaskádově aktualizovány pracovní hodiny v {issueId}: {details}',
    cascadeFieldChange: '{field}: {from} → {to}'
  },
  de: {
    cascadeUpdatedEst:  'Schätzungen in {issueId} kaskadierend aktualisiert: {details}',
    cascadeUpdatedFact: 'Arbeitszeit in {issueId} kaskadierend aktualisiert: {details}',
    cascadeFieldChange: '{field}: {from} → {to}'
  },
  es: {
    cascadeUpdatedEst:  'Estimaciones actualizadas en cascada en {issueId}: {details}',
    cascadeUpdatedFact: 'Horas de trabajo actualizadas en cascada en {issueId}: {details}',
    cascadeFieldChange: '{field}: {from} → {to}'
  },
  fr: {
    cascadeUpdatedEst:  'Estimations mises à jour en cascade dans {issueId} : {details}',
    cascadeUpdatedFact: 'Heures de travail mises à jour en cascade dans {issueId} : {details}',
    cascadeFieldChange: '{field} : {from} → {to}'
  },
  hu: {
    cascadeUpdatedEst:  'Becslések kaszkádosan frissítve a(z) {issueId} esetén: {details}',
    cascadeUpdatedFact: 'Munkaóra kaszkádosan frissítve a(z) {issueId} esetén: {details}',
    cascadeFieldChange: '{field}: {from} → {to}'
  },
  it: {
    cascadeUpdatedEst:  'Stime aggiornate a cascata in {issueId}: {details}',
    cascadeUpdatedFact: 'Ore di lavoro aggiornate a cascata in {issueId}: {details}',
    cascadeFieldChange: '{field}: {from} → {to}'
  },
  ja: {
    cascadeUpdatedEst:  '{issueId} の見積もりがカスケードで更新されました: {details}',
    cascadeUpdatedFact: '{issueId} の作業時間がカスケードで更新されました: {details}',
    cascadeFieldChange: '{field}: {from} → {to}'
  },
  ko: {
    cascadeUpdatedEst:  '{issueId}의 추정치가 캐스케이드로 업데이트되었습니다: {details}',
    cascadeUpdatedFact: '{issueId}의 작업 시간이 캐스케이드로 업데이트되었습니다: {details}',
    cascadeFieldChange: '{field}: {from} → {to}'
  },
  nl: {
    cascadeUpdatedEst:  'Schattingen in cascade bijgewerkt in {issueId}: {details}',
    cascadeUpdatedFact: 'Werkuren in cascade bijgewerkt in {issueId}: {details}',
    cascadeFieldChange: '{field}: {from} → {to}'
  },
  pl: {
    cascadeUpdatedEst:  'Szacunki zaktualizowane kaskadowo w {issueId}: {details}',
    cascadeUpdatedFact: 'Godziny pracy zaktualizowane kaskadowo w {issueId}: {details}',
    cascadeFieldChange: '{field}: {from} → {to}'
  },
  pt: {
    cascadeUpdatedEst:  'Estimativas atualizadas em cascata em {issueId}: {details}',
    cascadeUpdatedFact: 'Horas de trabalho atualizadas em cascata em {issueId}: {details}',
    cascadeFieldChange: '{field}: {from} → {to}'
  },
  tr: {
    cascadeUpdatedEst:  '{issueId} içindeki tahminler kademeli olarak güncellendi: {details}',
    cascadeUpdatedFact: '{issueId} içindeki çalışma saatleri kademeli olarak güncellendi: {details}',
    cascadeFieldChange: '{field}: {from} → {to}'
  },
  zh: {
    cascadeUpdatedEst:  '{issueId} 中的估算已级联更新: {details}',
    cascadeUpdatedFact: '{issueId} 中的工作时间已级联更新: {details}',
    cascadeFieldChange: '{field}: {from} → {to}'
  }
};

function _normLang(raw) {
  if (typeof raw !== 'string') return null;
  const lower = raw.toLowerCase().split(/[-_]/)[0];
  return lower || null;
}

function pickLocale(ctx, settings) {
  if (settings && settings.defaultLang) {
    const norm = _normLang(settings.defaultLang);
    if (norm && WF_I18N[norm]) return norm;
  }
  try {
    const userLang = ctx && ctx.currentUser && ctx.currentUser.profile
      && ctx.currentUser.profile.locale && ctx.currentUser.profile.locale.language;
    const norm = _normLang(userLang);
    if (norm && WF_I18N[norm]) return norm;
  } catch (_) {}
  return FALLBACK_LANG;
}

function tWf(lang, key, vars) {
  const dict = WF_I18N[lang] || WF_I18N[FALLBACK_LANG];
  let s = (dict && dict[key]) || (WF_I18N[FALLBACK_LANG][key]) || key;
  if (vars) {
    Object.keys(vars).forEach(function(v) {
      s = s.replace(new RegExp('\\{' + v + '\\}', 'g'), String(vars[v]));
    });
  }
  return s;
}

function readSettings(issue) {
  if (!issue) return null;
  try {
    const project = issue.project;
    if (!project) return null;
    const ep = project.extensionProperties;
    if (!ep) return null;
    const raw = ep[SETTINGS_KEY];
    if (!raw) return null;
    if (typeof raw === 'string') {
      try { return JSON.parse(raw); } catch (_) { return null; }
    }
    if (typeof raw === 'object') return raw;
    return null;
  } catch (_) { return null; }
}

function getMinutes(period) {
  if (!period) return 0;
  const weeks = period.getWeeks ? (period.getWeeks() || 0) : 0;
  const days = period.getDays ? (period.getDays() || 0) : 0;
  const hours = period.getHours ? (period.getHours() || 0) : 0;
  const minutes = period.getMinutes ? (period.getMinutes() || 0) : 0;
  return weeks * 5 * 8 * 60 + days * 8 * 60 + hours * 60 + minutes;
}

function formatMinutes(m) {
  const mm = m || 0;
  const h = Math.floor(mm / 60);
  const r = mm % 60;
  return h + 'h ' + r + 'm';
}

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

/* Имя kind-значения issue. settings.cascadeKindField задаёт имя field'а
   (default 'Type'). Возвращаемый объект может быть либо bundle-element с
   .name, либо string — обрабатываем оба. */
function _kindName(issue, settings) {
  if (!issue) return null;
  const kf = (settings && typeof settings.cascadeKindField === 'string' && settings.cascadeKindField.length)
    ? settings.cascadeKindField : 'Type';
  try {
    const v = issue.fields[kf];
    if (!v) return null;
    if (typeof v === 'string') return v;
    if (v.name) return v.name;
  } catch (_) {}
  return null;
}

function _firstLink(issue, linkName) {
  if (!issue || !issue.links) return null;
  const coll = issue.links[linkName];
  if (!coll) return null;
  if (typeof coll.first === 'function') {
    try { return coll.first(); } catch (_) { return null; }
  }
  return null;
}

function _collectChildren(parent, outwardLinkName) {
  const out = [];
  if (!parent || !parent.links) return out;
  const coll = parent.links[outwardLinkName];
  if (!coll) return out;
  if (typeof coll.forEach === 'function') {
    try {
      coll.forEach(function(c) { if (c) out.push(c); });
    } catch (_) {}
  }
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
  const settings = readSettings(issue);
  if (!settings || !settings.cascadeAggregationEnabled) return;
  const lvl2 = Array.isArray(settings.cascadeLevel2Values) ? settings.cascadeLevel2Values : [];
  const lvl3 = Array.isArray(settings.cascadeLevel3Values) ? settings.cascadeLevel3Values : [];
  if (!lvl2.length && !lvl3.length) return;

  const inwardLink = (typeof settings.cascadeParentLinkInward === 'string' && settings.cascadeParentLinkInward.length)
    ? settings.cascadeParentLinkInward : 'subtask of';
  const lang = pickLocale(ctx, settings);

  /* (1) child → parent (level-2 OR level-3). */
  const parent = _firstLink(issue, inwardLink);
  if (parent) {
    const pKind = _kindName(parent, settings);
    if (pKind && (lvl2.indexOf(pKind) >= 0 || lvl3.indexOf(pKind) >= 0)) {
      aggregateToParent(parent, settings, lang);
      /* (2) parent — level-2 → пересчитать level-3 grandparent. */
      if (lvl2.indexOf(pKind) >= 0) {
        const grand = _firstLink(parent, inwardLink);
        if (grand) {
          const gKind = _kindName(grand, settings);
          if (gKind && lvl3.indexOf(gKind) >= 0) {
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
    if (myParent) {
      const mpKind = _kindName(myParent, settings);
      if (mpKind && lvl3.indexOf(mpKind) >= 0) {
        aggregateToParent(myParent, settings, lang);
      }
    }
  }
}

function _guard(ctx) {
  const issue = ctx && ctx.issue;
  if (!issue) return false;
  const settings = readSettings(issue);
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
