/**
 * Smart Sprint Planner — State rollup parent.State ← min(children.State).
 *
 * v1.7.0 D128:
 *   - Стратегия 'min' (least-progressed child wins).
 *   - Idempotent: cur === target → no-op (защита от loop).
 *   - isResolved guard: parent.State ∈ stateRollupResolvedStates → skip write.
 *   - Floor: target = order[max(minChildIdx, floorIdx)] если задан stateRollupFloor.
 *   - i18n WF_I18N — объединённый словарь в workflow-common.js (R3c; B-11 снят).
 *   - Reuses cascade hierarchy config (cascadeKindField, cascadeLevel2/3Values,
 *     cascadeParentLinkInward/Outward, fieldState) — no duplicate settings.
 *
 * Loop prevention: cascade writes fact/est fields; rollup writes State.
 *   Cross-trigger невозможен. Idempotent writes защищают в любом случае.
 *
 * Out of scope (TODO post-v1.7.0): max/mode strategies, sprint-level rollup,
 *   cross-project Epic, audit chain в snapshot'ах, manual rescan (v1.7.1).
 */
const entities = require('@jetbrains/youtrack-scripting-api/entities');
const workflow = require('@jetbrains/youtrack-scripting-api/workflow');

/* R3c (v3.7.0) — общая WF-инфраструктура вынесена в ./workflow-common.js
   (B-11 снят, см. workflow-common.js). WF_I18N — объединённый словарь. */
const wfCommon = require('./workflow-common.js');
const WF_I18N          = wfCommon.WF_I18N;
const FALLBACK_LANG    = wfCommon.FALLBACK_LANG;
const pickLocale       = wfCommon.pickLocale;
const tWf              = wfCommon.tWf;
const readSettings     = wfCommon.readSettings;
const _kindName        = wfCommon.kindName;
const _firstLink       = wfCommon.firstLink;
const _collectChildren = wfCommon.collectChildren;

/* ---- State rollup logic ---- */

function _stateOrderIndex(stateName, order) {
  if (!stateName || !Array.isArray(order)) return -1;
  return order.indexOf(stateName);
}

function _readIssueStateName(issue, stateFieldName) {
  if (!issue) return null;
  const fname = stateFieldName || 'State';
  try {
    const v = issue.fields[fname];
    if (!v) return null;
    if (typeof v === 'string') return v;
    if (v.name) return v.name;
  } catch (_) {}
  return null;
}

/**
 * Вычислить target state для parent на основе children.
 * Возвращает { target: string|null, reason: string }.
 */
/* v3.2.1 — сообщения копятся в msgs и эмитятся ВЫЗЫВАЮЩИМ только при реальном
   применении: раньше unknown-state/floor-баннеры сыпались на КАЖДЫЙ save каждого
   ребёнка даже при идемпотентном no-op (curState===target) — воспринималось как сбой. */
function computeRollupTarget(parent, settings, outwardLinkName, stateFieldName, lang, msgs) {
  const order = settings.stateRollupOrder || [];
  if (!Array.isArray(order) || order.length < 2) return { target: null, reason: 'no-order' };

  const children = _collectChildren(parent, outwardLinkName);
  if (!children.length) return { target: null, reason: 'no-children' };

  let minIdx = Number.MAX_SAFE_INTEGER;
  let anyKnown = false;
  for (let i = 0; i < children.length; i++) {
    const childState = _readIssueStateName(children[i], stateFieldName);
    const idx = _stateOrderIndex(childState, order);
    if (idx < 0) {
      if (childState && msgs) {
        msgs.push(tWf(lang || FALLBACK_LANG, 'rollupUnknownState', { state: childState }));
      }
      continue;
    }
    anyKnown = true;
    if (idx < minIdx) minIdx = idx;
  }
  if (!anyKnown) return { target: null, reason: 'unknown-states' };

  const floor = settings.stateRollupFloor;
  if (floor && typeof floor === 'string') {
    const floorIdx = _stateOrderIndex(floor, order);
    if (floorIdx >= 0 && minIdx < floorIdx) {
      if (msgs) {
        msgs.push(tWf(lang || FALLBACK_LANG, 'rollupFloorHit', {
          issueId: parent.id,
          floorState: floor,
          minState: order[minIdx]
        }));
      }
      return { target: order[floorIdx], reason: 'ok-floor' };
    }
  }

  return { target: order[minIdx], reason: 'ok' };
}

function _applyRollupToParent(parent, settings, outwardLink, stateFieldName, lang) {
  const curStateName = _readIssueStateName(parent, stateFieldName);
  const resolved = Array.isArray(settings.stateRollupResolvedStates) ? settings.stateRollupResolvedStates : [];
  if (curStateName && resolved.indexOf(curStateName) >= 0) {
    /* v3.2.1 — resolved-parent скипается ТИХО: message на каждый save каждого
       ребёнка резолвнутого эпика был баннер-спамом (ponytail: осознанное удаление
       информационного сообщения — skip штатный, не сбой). */
    return;
  }

  const msgs = [];
  const res = computeRollupTarget(parent, settings, outwardLink, stateFieldName, lang, msgs);
  if (!res.target) return;

  if (curStateName === res.target) return; // idempotent — защита от loop (тихо, без msgs)
  for (let mi = 0; mi < msgs.length; mi++) { try { workflow.message(msgs[mi]); } catch (_) {} }

  try {
    parent.fields[stateFieldName] = res.target;
    parent.fields.updated = Date.now();
    workflow.message(tWf(lang, 'rollupUpdated', {
      issueId: parent.id,
      fromState: curStateName || '(empty)',
      toState: res.target
    }));
  } catch (e) {
    try { console.error('[state-rollup] write failed for ' + parent.id + ': ' + e); } catch (_) {}
  }
}

function _runRollup(issue, ctx) {
  const settings = wfCommon.takeSettings(issue);
  if (!settings || !settings.stateRollupEnabled) return;

  if (settings.stateRollupStrategy && settings.stateRollupStrategy !== 'min') return;

  const lvl2 = Array.isArray(settings.cascadeLevel2Values) ? settings.cascadeLevel2Values : [];
  const lvl3 = Array.isArray(settings.cascadeLevel3Values) ? settings.cascadeLevel3Values : [];
  if (!lvl2.length && !lvl3.length) return;

  const inwardLink = (typeof settings.cascadeParentLinkInward === 'string' && settings.cascadeParentLinkInward.length)
    ? settings.cascadeParentLinkInward : 'subtask of';
  const outwardLink = (typeof settings.cascadeParentLinkOutward === 'string' && settings.cascadeParentLinkOutward.length)
    ? settings.cascadeParentLinkOutward : 'parent for';

  const stateFieldName = (typeof settings.fieldState === 'string' && settings.fieldState.length)
    ? settings.fieldState : 'State';

  const lang = pickLocale(ctx, settings);

  // Path 1: child → parent (level-2 OR level-3).
  const parent = _firstLink(issue, inwardLink);
  if (parent) {
    const pKind = _kindName(parent, settings);
    if (pKind && (lvl2.indexOf(pKind) >= 0 || lvl3.indexOf(pKind) >= 0)) {
      _applyRollupToParent(parent, settings, outwardLink, stateFieldName, lang);
      // Path 1+: если parent — level-2, пересчитать level-3 grandparent.
      if (lvl2.indexOf(pKind) >= 0) {
        const grand = _firstLink(parent, inwardLink);
        if (grand) {
          const gKind = _kindName(grand, settings);
          if (gKind && lvl3.indexOf(gKind) >= 0) {
            _applyRollupToParent(grand, settings, outwardLink, stateFieldName, lang);
          }
        }
      }
    }
  }

  // Path 2: изменился level-2 → пересчитать level-3 parent (если есть).
  const myKind = _kindName(issue, settings);
  if (myKind && lvl2.indexOf(myKind) >= 0) {
    const myParent = _firstLink(issue, inwardLink);
    if (myParent) {
      const mpKind = _kindName(myParent, settings);
      if (mpKind && lvl3.indexOf(mpKind) >= 0) {
        _applyRollupToParent(myParent, settings, outwardLink, stateFieldName, lang);
      }
    }
  }
}

function _guard(ctx) {
  const issue = ctx && ctx.issue;
  if (!issue) return false;
  const settings = readSettings(issue);
  wfCommon.stashSettings(issue, settings); /* handoff guard→action — workflow-common */
  if (!settings || !settings.stateRollupEnabled) return false;

  const stateFieldName = (typeof settings.fieldState === 'string' && settings.fieldState.length)
    ? settings.fieldState : 'State';
  try {
    if (issue.fields.isChanged && issue.fields.isChanged(stateFieldName)) return true;
  } catch (_) {}
  return false;
}

exports.rule = entities.Issue.onChange({
  title: 'Smart Sprint Planner — state rollup parent ← min(children)',
  guard: _guard,
  action: function(ctx) { _runRollup(ctx && ctx.issue, ctx); }
});

// Test-only exports (для node --test). YT scripting игнорирует typeof module проверку.
if (typeof module !== 'undefined' && module.exports) {
  Object.assign(module.exports, {
    computeRollupTarget: computeRollupTarget,
    _stateOrderIndex:    _stateOrderIndex,
    _readIssueStateName: _readIssueStateName,
    WF_I18N:             WF_I18N,
    tWf:                 tWf,
    pickLocale:          pickLocale
  });
}
