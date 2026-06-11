'use strict';
// Stand-up view extracted from widgets/main/src/legacy-monolith.js (Tier D slice 1).
// Browser bridge: window.__SSP_STANDUP_VIEW. Stage 2 (React-ификация): рендер-ядро
// строит view-model и отдаёт его React-мосту window.__SSP_STANDUP_MOUNT
// (react/standup-view.jsx) — DOM бакетов/баннера/хинтов собирает React.
// Статические empty-states index.html (standupNoSprint/standupEmptyRole, CTA-бинды
// per-element) остаются под прямым classList-управлением отсюда.
// Golden-tested in tests/golden/render-shell.golden.test.js (vm-контракт «модуль →
// __SSP_STANDUP_MOUNT»: классификация бакетов вкл. fallback done-states, empty
// states, селектор роли populate/onchange, refresh contract: no-field early exit /
// mutation+persist chain / no-change).
//
// Классификация/PP/контроллеры — 1:1 со ступени 1. The monolith keeps thin
// delegators (building deps per call via _standupDeps). Injected deps:
//   T, esc, fmtHours              — i18n + pure formatters (monolith aliases;
//                                   esc после React-ификации не используется —
//                                   контракт _standupDeps не сужаем)
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

/* Строки бакета для vm — расчёты 1:1 с vanilla-рендером ступени 1
   (factSum по fact_*, planH из assignment либо item, trunc 60→57+…, hours
   «факт/план» при planH или «факт» при factSum). Экранирование ушло: React
   эскейпит текст сам, vm несёт сырые строки. */
function _buildStandupBucketRows(issueIds, rk, deps) {
  var fmtHours = deps.fmtHours;
  var pp = _standupPP(rk, deps);
  var assignments = (pp && pp.taskAssignments) || {};
  var _roleItems = deps.state.getRoleItems();
  var roleItems   = (_roleItems && _roleItems[rk]) || [];
  return issueIds.map(function(issueId) {
    var a = assignments[issueId] || {};
    var item = roleItems.find(function(i){ return i.issueId === issueId; });
    var title = (item && item.title) || issueId;
    var url   = (item && item.url)   || '';
    var factSum = 0;
    Object.keys(a).forEach(function(k){ if (/^fact_/.test(k)) factSum += (a[k] || 0); });
    var planH = a['estimate_'+rk] || (item && item['estimate_'+rk]) || 0;
    var titleTrunc = title.length > 60 ? title.substring(0, 57) + '…' : title;
    var hours = planH
      ? fmtHours(factSum) + '/' + fmtHours(planH)
      : (factSum ? fmtHours(factSum) : '');
    var assignee = a.assignee || (item && item.assignee) || '';
    return { issueId: issueId, url: url, title: title, titleTrunc: titleTrunc, hours: hours, assignee: assignee };
  });
}

/* vm → React-мост. Флаги видимости заменяют display-toggle ступени 1 (conditional
   render); host/мост читаются в момент вызова (late binding — в golden-харнессе
   мост = recording-стаб). */
function _mountStandupVm(vm) {
  var host = document.getElementById('standupViewHost');
  var mount = (typeof window !== 'undefined' && window.__SSP_STANDUP_MOUNT) || null;
  if (host && mount && typeof mount.mountAt === 'function') mount.mountAt(host, vm);
}

function _hiddenStandupVm() {
  return {
    goalBannerVisible: false, goalLabel: '', goalText: '',
    goalMissingVisible: false, goalMissingText: '',
    bucketsVisible: false, buckets: [],
    noDoneHintVisible: false, noDoneHintText: '',
  };
}

function renderStandupView(deps) {
  var noSprint   = document.getElementById('standupNoSprint');
  var emptyRole  = document.getElementById('standupEmptyRole');
  var _sprint = deps.state.getSprint();
  // Empty state: no sprint
  if (!_sprint) {
    if (noSprint)   noSprint.classList.remove('hidden');
    if (emptyRole)  emptyRole.classList.add('hidden');
    _mountStandupVm(_hiddenStandupVm());
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
  // Sprint goal banner (флаги — в обоих исходах ниже, вкл. пустую роль)
  var vm = _hiddenStandupVm();
  vm.goalBannerVisible  = !!_sprint.sprintGoal;
  vm.goalLabel          = deps.T('standupGoalLabel');
  vm.goalText           = _sprint.sprintGoal || '';
  vm.goalMissingVisible = !_sprint.sprintGoal;
  vm.goalMissingText    = deps.T('standupGoalMissing');
  // Empty state: no tasks in role
  var pp = _standupPP(rk, deps);  /* канон-источник (v2.2.4 фикс) — не сырой кэш _sprint.personalPlanning[rk] */
  var assignments = (pp && pp.taskAssignments) || {};
  var hasItems = Object.keys(assignments).length > 0;
  var _roleItems = deps.state.getRoleItems();
  var roleItems = (_roleItems && _roleItems[rk]) || [];
  if (!hasItems && !roleItems.length) {
    if (emptyRole)  emptyRole.classList.remove('hidden');
    _mountStandupVm(vm);
    return;
  }
  if (emptyRole) emptyRole.classList.add('hidden');
  vm.bucketsVisible = true;
  // Done states resolution
  var _settings = deps.state.getSettings();
  var doneStates = (_settings && Array.isArray(_settings.standupDoneStates) && _settings.standupDoneStates.length)
    ? _settings.standupDoneStates
    : _stateRollupFallbackDone(deps);
  vm.noDoneHintVisible = !doneStates.length;
  vm.noDoneHintText    = deps.T('standupNoDoneStatesHint');
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
  vm.buckets = [
    { id: 'standupBucketDone',       header: deps.T('standupBucketDone')       + ' (' + classified.done.length       + ')', rows: _buildStandupBucketRows(classified.done,       rk, deps) },
    { id: 'standupBucketInflight',   header: deps.T('standupBucketInflight')   + ' (' + classified.inflight.length   + ')', rows: _buildStandupBucketRows(classified.inflight,   rk, deps) },
    { id: 'standupBucketNotStarted', header: deps.T('standupBucketNotStarted') + ' (' + classified.notStarted.length + ')', rows: _buildStandupBucketRows(classified.notStarted, rk, deps) },
  ];
  _mountStandupVm(vm);
}

function _populateStandupRoleSel(deps) {
  var sel = document.getElementById('standupRoleSel');
  if (!sel) return;
  var activeRoles = deps.getActiveRoles();
  sel.innerHTML = '';
  activeRoles.forEach(function(r) {
    var o = document.createElement('option');
    o.value = r.key; o.textContent = r.label;
    sel.appendChild(o);
  });
  var _activeSubtab = deps.state.getActiveSubtab();
  if (_activeSubtab && activeRoles.some(function(r){ return r.key === _activeSubtab; })) {
    sel.value = _activeSubtab;
  }
  sel.onchange = function() { try { renderStandupView(deps); } catch(_){} };
}

/* v2.2.4 — фикс: раньше слался { sprintId } на /refresh-assignees, а handler ждёт
   { issueIds, fieldName, stateFieldName } и отдаёт { assignees } → запрос всегда падал
   (стендап-refresh не работал с full-rebuild v2.1.0). Теперь корректный контракт:
     • state (ось бакетов done/inflight/notStarted) — для выбранной роли rk в _roleItems[rk]
       (чистая keyed-модель, персист sprint-data) — работает для любой роли селектора;
     • assignee — только для текущей роли через _currentRolePP + saveCurrentRoleState
       (канон-персист). Для не-текущей роли assignee не мутируем (избегаем tangled
       personalPlanning-персиста — техдолг в COMMON_ROADMAP); бакетинг идёт по state. */
function doStandupRefresh(deps) {
  if (!deps.state.getSprint()) return Promise.resolve();
  var sel = document.getElementById('standupRoleSel');
  var rk = (sel && sel.value) || deps.state.getActiveSubtab() || '';
  if (!rk) { var ar = deps.getActiveRoles(); rk = ar.length ? ar[0].key : ''; }
  var role = deps.ALL_ROLES.find(function (r) { return r.key === rk; });
  if (!role) return Promise.resolve();
  var _settings = deps.state.getSettings();
  var fieldName = _settings && _settings[role.userField];
  if (!fieldName) { deps.toast(deps.T('toastSyncFromYtNoField'), 'warn'); return Promise.resolve(); }
  var _roleItems = deps.state.getRoleItems();
  var roleItems = (_roleItems && _roleItems[rk]) || [];
  var ids = roleItems
    .filter(function (i) { return i && i.issueId && deps.ACTIVE_INC.indexOf(i.inclusionStatus) >= 0; })
    .map(function (i) { return i.issueId; });
  if (!ids.length) { renderStandupView(deps); return Promise.resolve(); }
  var stateField = (_settings && _settings.fieldState) || '';
  var rec = deps.state.getCurrentSprintRoleRec();
  var isCur = !!(rec && (rec.roleKey || deps.state.getActiveSubtab()) === rk);
  var btn = document.getElementById('standupRefreshBtn');
  return deps.withLoader(btn, function () {
    return deps.apiPost('refresh-assignees', { issueIds: ids, fieldName: fieldName, stateFieldName: stateField })
      .then(function (res) {
        if (!res || !res.success) { deps.toast(deps.T('toastSyncFromYtErr')); return; }
        var assignees = res.assignees || {};
        var pp = isCur ? deps.state.getCurrentRolePP() : null;
        if (isCur && !pp) { pp = { resourcesByAssignee: {}, taskAssignments: {} }; deps.state.setCurrentRolePP(pp); }
        if (pp && !pp.taskAssignments) pp.taskAssignments = {};
        var byId = {};
        roleItems.forEach(function (it) { if (it && it.issueId) byId[it.issueId] = it; });
        var changed = 0;
        Object.keys(assignees).forEach(function (id) {
          var e = assignees[id];
          if (pp) { /* assignee — только текущая роль (канон-персист) */
            var login = (e && e.login) || null;
            var ta = pp.taskAssignments[id] || (pp.taskAssignments[id] = {});
            if ((ta.assignee || null) !== login) {
              ta.assignee = login;
              ta.assigneeName = login ? ((e && (e.fullName || e.login)) || login) : '';
              delete ta.ganttColor;
              changed++;
            }
          }
          if (stateField && e && e.state && byId[id]) { /* state — любая роль */
            var ns = e.state.localizedName || e.state.name || '';
            if (ns && ns !== (byId[id].state || '')) {
              byId[id].state = ns;
              byId[id].stateLocalized = ns;
              var sc = e.state.color;
              byId[id].stateColor = (sc && (sc.background || sc.foreground))
                ? { background: sc.background || null, foreground: sc.foreground || null } : null;
              changed++;
            }
          }
        });
        if (!changed) { renderStandupView(deps); deps.toast(deps.T('toastSyncFromYtNoChange'), 'info'); return; }
        deps.markDirty('roleItems');
        deps.apiPost('sprint-data', { roleItems: deps.state.getRoleItems() }).catch(function () {});
        if (isCur) deps.saveCurrentRoleState();
        renderStandupView(deps);
        deps.toast(deps.T('toastStandupRefreshed'), 'success');
      })
      .catch(function (e) { deps.diag('standup refresh err: ' + e, 'err'); deps.toast(deps.T('toastSyncFromYtErr')); });
  });
}

const api = {
  renderStandupView,
  doStandupRefresh,
  _populateStandupRoleSel,
};

if (typeof window !== 'undefined') {
  try { window.__SSP_STANDUP_VIEW = api; } catch (_) { /* sandboxed write may throw */ }
}

module.exports = api;
