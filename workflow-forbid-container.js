/**
 * Smart Sprint Planner — Forbid direct work-item logging on container issues.
 *
 * v1.3.0 — RESOLVED B-3..B-5 (см. .roadmap-source/feature-2-cascade-and-forbid.md):
 *   B-3: без bypass — settings.forbidContainerWorkItems = true блокирует всех.
 *   B-4: hard block через workflow.check(false, ...) — save отклоняется.
 *   B-5: блокирует и `added`, и `editedWorkItems` — половинчатый блок создаёт
 *        лазейку через edit.
 *   B-8: kind-field name + values конфигурируемы (settings.cascadeKindField,
 *        cascadeLevel2Values, cascadeLevel3Values).
 *   B-10: workflow.check message локализуется в 15 языках (WF_I18N — workflow-common.js, R3c).
 *   B-11 (снят R3c): общая инфраструктура — ./workflow-common.js.
 */
const entities = require('@jetbrains/youtrack-scripting-api/entities');
const workflow = require('@jetbrains/youtrack-scripting-api/workflow');

/* R3c (v3.7.0) — общая WF-инфраструктура вынесена в ./workflow-common.js
   (B-11 снят, см. workflow-common.js). WF_I18N — объединённый словарь. */
const wfCommon = require('./workflow-common.js');
const WF_I18N      = wfCommon.WF_I18N;
const pickLocale   = wfCommon.pickLocale;
const tWf          = wfCommon.tWf;
const readSettings = wfCommon.readSettings;
const _kindName    = wfCommon.kindName;

function _isContainerKind(kindName, settings) {
  if (!kindName) return false;
  const lvl2 = Array.isArray(settings.cascadeLevel2Values) ? settings.cascadeLevel2Values : [];
  const lvl3 = Array.isArray(settings.cascadeLevel3Values) ? settings.cascadeLevel3Values : [];
  return lvl2.indexOf(kindName) >= 0 || lvl3.indexOf(kindName) >= 0;
}

function _hasWorkItemMutation(issue) {
  if (!issue) return false;
  if (issue.workItems && wfCommon.collNotEmpty(issue.workItems.added)) return true;
  if (wfCommon.collNotEmpty(issue.editedWorkItems)) return true;
  return false;
}

function _guard(ctx) {
  const issue = ctx && ctx.issue;
  if (!issue) return false;
  const settings = readSettings(issue);
  wfCommon.stashSettings(issue, settings); /* handoff guard→action — workflow-common */
  if (!settings || !settings.forbidContainerWorkItems) return false;
  if (!_hasWorkItemMutation(issue)) return false;
  const kind = _kindName(issue, settings);
  return _isContainerKind(kind, settings);
}

exports.rule = entities.Issue.onChange({
  title: 'Smart Sprint Planner — forbid direct workItems on container issues',
  guard: _guard,
  action: function(ctx) {
    const issue = ctx && ctx.issue;
    const settings = wfCommon.takeSettings(issue);
    const lang = pickLocale(ctx, settings);
    workflow.check(false, tWf(lang, 'errForbidContainer'));
  }
});

// v1.7.1 — Test-only exports (для node --test). YT scripting игнорирует typeof module проверку.
if (typeof module !== 'undefined' && module.exports) {
  Object.assign(module.exports, {
    WF_I18N:    WF_I18N,
    tWf:        tWf,
    pickLocale: pickLocale
  });
}
