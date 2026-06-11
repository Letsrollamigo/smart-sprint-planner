'use strict';
// Stand-up view extracted from widgets/main/src/legacy-monolith.js (Tier D slice 1,
// stage 1 — faithful as-is move). Browser bridge: window.__SSP_STANDUP_VIEW.
// Golden-tested in tests/golden/render-shell.golden.test.js (bucket classification
// incl. fallback done-states, empty states, role selector populate/onchange,
// refresh contract: no-field early exit / mutation+persist chain / no-change).
//
// Bodies mirror the IIFE originals 1:1 modulo state access. The monolith keeps thin
// delegators (building deps per call via _standupDeps). Injected deps:
//   T, esc, fmtHours              — i18n + pure formatters (monolith aliases)
//   getActiveRoles                — shared role helper (stays in monolith)
//   getPersonalPlanningForCurrent — canonical PP read (v2.2.4 fix), stays in monolith
//   state                         — get-аксессоры монолитного стейта, читаются
//     В МОМЕНТ обращения (урок youtrack-api): settings / sprint / roleItems /
//     activeSubtab / currentRolePP / currentSprintRoleRec

function _stateRollupFallbackDone(deps) {
  var s = deps.state.getSettings();
  var order = (s && Array.isArray(s.stateRollupOrder)) ? s.stateRollupOrder : [];
  return order.length >= 2 ? order.slice(-2) : (order.length === 1 ? order.slice(-1) : []);
}

function _classifyStandupBuckets(taskAssignmentsMap, doneStates) {
  var done = [], inflight = [], notStarted = [];
  Object.keys(taskAssignmentsMap || {}).forEach(function(issueId) {
    var a = taskAssignmentsMap[issueId];
    if (!a) return;
    var state = (a.state || '').trim();
    var isDone = doneStates.length > 0 && doneStates.indexOf(state) >= 0;
    if (isDone) { done.push(issueId); return; }
    var factSum = 0;
    Object.keys(a).forEach(function(k){ if (/^fact_/.test(k)) factSum += (a[k] || 0); });
    if (factSum > 0 || a.inclusionStatus === 'IN_PROGRESS') {
      inflight.push(issueId);
    } else {
      notStarted.push(issueId);
    }
  });
  return { done: done, inflight: inflight, notStarted: notStarted };
}

/* Канон-источник personalPlanning роли для Stand-up (фикс tangled keyed-vs-single модели,
   v2.2.4): текущая роль → live _currentRolePP; иначе → _getPersonalPlanningForCurrent (histRec
   first, кэш _sprint.personalPlanning[rk] лишь fallback). Раньше Stand-up читал сырой кэш
   напрямую — а saveCurrentRoleState затирает его single-объектом одной роли → assignee пропадал. */
function _standupPP(rk, deps) {
  var pp = deps.state.getCurrentRolePP();
  var rec = deps.state.getCurrentSprintRoleRec();
  if (pp && rec && (rec.roleKey || deps.state.getActiveSubtab()) === rk) return pp;
  return (typeof deps.getPersonalPlanningForCurrent === 'function') ? deps.getPersonalPlanningForCurrent(rk) : null;
}

function _renderStandupBucket(containerId, titleKey, issueIds, rk, deps) {
  var el = document.getElementById(containerId);
  if (!el) return;
  var esc = deps.esc, fmtHours = deps.fmtHours;
  var pp = _standupPP(rk, deps);
  var assignments = (pp && pp.taskAssignments) || {};
  var _roleItems = deps.state.getRoleItems();
  var roleItems   = (_roleItems && _roleItems[rk]) || [];
  el.innerHTML = '';
  var hdr = document.createElement('div');
  hdr.style.cssText = 'font-weight:600;font-size:12px;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid var(--border,#e0e0e0)';
  hdr.textContent = deps.T(titleKey) + ' (' + issueIds.length + ')';
  el.appendChild(hdr);
  if (!issueIds.length) {
    var emp = document.createElement('div');
    emp.style.cssText = 'font-size:11px;color:var(--muted,#888);text-align:center;padding:12px 0';
    emp.textContent = '—';
    el.appendChild(emp);
    return;
  }
  issueIds.forEach(function(issueId) {
    var a = assignments[issueId] || {};
    var item = roleItems.find(function(i){ return i.issueId === issueId; });
    var title = (item && item.title) || issueId;
    var url   = (item && item.url)   || '';
    var factSum = 0;
    Object.keys(a).forEach(function(k){ if (/^fact_/.test(k)) factSum += (a[k] || 0); });
    var planH = a['estimate_'+rk] || (item && item['estimate_'+rk]) || 0;
    var row = document.createElement('div');
    row.style.cssText = 'padding:5px 0;border-bottom:1px solid var(--border,#e0e0e0);font-size:12px;';
    var idHtml = url
      ? '<a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer" style="font-weight:600;color:var(--primary)">' + esc(issueId) + '</a>'
      : '<span style="font-weight:600">' + esc(issueId) + '</span>';
    var titleTrunc = title.length > 60 ? title.substring(0, 57) + '…' : title;
    var hoursHtml = planH
      ? '<span style="color:var(--muted,#888);font-size:11px;float:right">' + fmtHours(factSum) + '/' + fmtHours(planH) + '</span>'
      : (factSum ? '<span style="color:var(--muted,#888);font-size:11px;float:right">' + fmtHours(factSum) + '</span>' : '');
    var assignee = a.assignee || (item && item.assignee) || '';
    var assigneeHtml = assignee ? '<div style="font-size:11px;color:var(--muted,#888);margin-top:2px">@' + esc(assignee) + '</div>' : '';
    row.innerHTML = hoursHtml + idHtml + ' <span title="'+esc(title)+'" style="color:var(--text)">'+esc(titleTrunc)+'</span>' + assigneeHtml;
    el.appendChild(row);
  });
}

function renderStandupView(deps) {
  var noSprint   = document.getElementById('standupNoSprint');
  var emptyRole  = document.getElementById('standupEmptyRole');
  var buckets    = document.getElementById('standupBuckets');
  var noDoneHint = document.getElementById('standupNoDoneStatesHint');
  var goalBanner = document.getElementById('standupGoalBanner');
  var goalMissing= document.getElementById('standupGoalMissingHint');
  var goalText   = document.getElementById('standupGoalText');
  var _sprint = deps.state.getSprint();
  // Empty state: no sprint
  if (!_sprint) {
    if (noSprint)   noSprint.classList.remove('hidden');
    if (emptyRole)  emptyRole.classList.add('hidden');
    if (buckets)    buckets.style.display = 'none';
    if (noDoneHint) noDoneHint.style.display = 'none';
    if (goalBanner) goalBanner.style.display = 'none';
    if (goalMissing)goalMissing.style.display = 'none';
    return;
  }
  if (noSprint) noSprint.classList.add('hidden');
  // Role selector
  var sel = document.getElementById('standupRoleSel');
  var rk = sel ? sel.value : (deps.state.getActiveSubtab() || '');
  if (!rk) {
    var activeRoles = deps.getActiveRoles();
    rk = activeRoles.length ? activeRoles[0].key : '';
  }
  // Sprint goal banner
  if (_sprint.sprintGoal) {
    if (goalBanner) { goalBanner.style.display = ''; if (goalText) goalText.textContent = _sprint.sprintGoal; }
    if (goalMissing) goalMissing.style.display = 'none';
  } else {
    if (goalBanner) goalBanner.style.display = 'none';
    if (goalMissing) goalMissing.style.display = '';
  }
  // Empty state: no tasks in role
  var pp = _standupPP(rk, deps);  /* канон-источник (v2.2.4 фикс) — не сырой кэш _sprint.personalPlanning[rk] */
  var assignments = (pp && pp.taskAssignments) || {};
  var hasItems = Object.keys(assignments).length > 0;
  var _roleItems = deps.state.getRoleItems();
  var roleItems = (_roleItems && _roleItems[rk]) || [];
  if (!hasItems && !roleItems.length) {
    if (emptyRole)  emptyRole.classList.remove('hidden');
    if (buckets)    buckets.style.display = 'none';
    if (noDoneHint) noDoneHint.style.display = 'none';
    return;
  }
  if (emptyRole) emptyRole.classList.add('hidden');
  if (buckets)   buckets.style.display = '';
  // Done states resolution
  var _settings = deps.state.getSettings();
  var doneStates = (_settings && Array.isArray(_settings.standupDoneStates) && _settings.standupDoneStates.length)
    ? _settings.standupDoneStates
    : _stateRollupFallbackDone(deps);
  if (noDoneHint) noDoneHint.style.display = doneStates.length ? 'none' : '';
  // Build a unified map: combine personalPlanning.taskAssignments + roleItems for state
  var unifiedMap = {};
  roleItems.forEach(function(item) {
    unifiedMap[item.issueId] = { state: item.state, inclusionStatus: item.inclusionStatus };
    Object.keys(item).forEach(function(k){ if (/^(fact_|estimate_|alloc_)/.test(k)) unifiedMap[item.issueId][k] = item[k]; });
  });
  Object.keys(assignments).forEach(function(id) {
    if (!unifiedMap[id]) return;  /* v2.2.5 — только обогащаем задачи состава роли исполнителем/состоянием;
      «осиротевшие» назначения (issueId есть в taskAssignments, но нет в _roleItems[rk] — задача убрана
      из состава, запись назначенца осталась) НЕ добавляем как title-less строки. До v2.2.4 баг был скрыт
      пустым кэшем _sprint.personalPlanning[rk]; read-fix v2.2.4 вскрыл сирот. */
    var a = assignments[id];
    if (a.state) unifiedMap[id].state = a.state;
    if (a.assignee) unifiedMap[id].assignee = a.assignee;
  });
  var classified = _classifyStandupBuckets(unifiedMap, doneStates);
  _renderStandupBucket('standupBucketDone',       'standupBucketDone',       classified.done,       rk, deps);
  _renderStandupBucket('standupBucketInflight',   'standupBucketInflight',   classified.inflight,   rk, deps);
  _renderStandupBucket('standupBucketNotStarted', 'standupBucketNotStarted', classified.notStarted, rk, deps);
}

const api = {
  renderStandupView,
};

if (typeof window !== 'undefined') {
  try { window.__SSP_STANDUP_VIEW = api; } catch (_) { /* sandboxed write may throw */ }
}

module.exports = api;
