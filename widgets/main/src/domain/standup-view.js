'use strict';
// Stand-up view extracted from widgets/main/src/core.js (Tier D slice 1).
// Browser bridge: window.__SSP_STANDUP_VIEW. Stage 2 (React-ификация): рендер-ядро
// строит view-model и отдаёт его React-мосту window.__SSP_STANDUP_MOUNT
// (react/standup-view.jsx) — DOM секций/баннера собирает React.
// Статические empty-states index.html (standupNoSprint/standupEmptyRole, CTA-бинды
// per-element) остаются под прямым classList-управлением отсюда.
// Golden-tested in tests/golden/render-shell.golden.test.js (vm-контракт «модуль →
// __SSP_STANDUP_MOUNT»: группировка секций по состояниям вкл. bundle-порядок и
// алфавит-фолбэк, скрытые состояния, режим «Все роли», empty states, селектор роли
// populate/onchange, refresh contract).
//
// 68-7 (запрос заказчика, вариант А) — три сводных бакета done/inflight/notStarted
// заменены секциями по фактическим состояниям задач: порядок = бандл state-поля
// проекта (deps.getStateBundle, ленивый fetch 68-1 с ре-рендером по приходу;
// до загрузки/без бандла — алфавит присутствующих состояний). Показываются ВСЕ
// состояния бандла, включая пустые; скрытие поимённо — settings.standupHiddenStates
// (вместе с задачами). Селектор роли получил пункт «Все роли» (дефолт): union
// состава активных ролей, часы = суммы план/факт по ролям, исполнители списком.
// Состав фильтруется по ACTIVE_INC («задачи, включённые в спринт») в обоих режимах.
// settings.standupStateRoles (маппинг «состояние → роли», UI общий с зонами
// бэклога) в per-role режиме сужает набор секций до состояний роли; её задачи в
// прочих состояниях уходят в сводную секцию «Прочие состояния».
// Настройка standupDoneStates осталась done-каноном отчётности (A10/spillover) —
// стендап её больше не читает.
//
// Injected deps:
//   T, esc, fmtHours              — i18n + pure formatters (monolith aliases;
//                                   esc после React-ификации не используется —
//                                   контракт _standupDeps не сужаем)
//   getActiveRoles                — shared role helper (stays in monolith)
//   getStateBundle                — 68-7: {values[], colors{}} | null из кэша
//                                   field-values (лениво, ре-рендер по приходу)
//   getPersonalPlanningForCurrent — canonical PP read (v2.2.4 fix), stays in monolith
//   state                         — get-аксессоры монолитного стейта, читаются
//     В МОМЕНТ обращения (урок youtrack-api): settings / sprint / roleItems /
//     activeSubtab / currentRolePP / currentSprintRoleRec

var STANDUP_ALL_ROLES = '__all__';   /* значение опции «Все роли» (не пересекается с role keys) */

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

/* 68-7 — union записей по issueId для набора ролей. Часы: на роль берётся ЕЁ собственный
   суффикс (a['estimate_'+rk] || item['estimate_'+rk], то же для fact_) и суммируется —
   без двойного счёта при пересечении составов. Исполнители — уникальный список по ролям.
   Состав фильтруется по ACTIVE_INC (исключённые из спринта не показываются). */
function _collectStandupEntries(deps, roleKeys) {
  var order = [];
  var map = {};
  var _roleItems = deps.state.getRoleItems();
  roleKeys.forEach(function (rk) {
    var pp = _standupPP(rk, deps);
    var assignments = (pp && pp.taskAssignments) || {};
    var items = ((_roleItems && _roleItems[rk]) || []).filter(function (i) {
      return i && i.issueId && deps.ACTIVE_INC.indexOf(i.inclusionStatus) >= 0;
    });
    items.forEach(function (item) {
      var a = assignments[item.issueId] || {};
      var e = map[item.issueId];
      if (!e) {
        e = map[item.issueId] = {
          issueId: item.issueId, title: item.title || item.issueId, url: item.url || '',
          state: '', stateColor: null, fact: 0, plan: 0, assignees: [],
        };
        order.push(e);
      }
      if ((!e.title || e.title === e.issueId) && item.title) e.title = item.title;
      if (!e.url && item.url) e.url = item.url;
      var st = ((a.state || item.state) || '').trim();
      if (st) e.state = st;
      if (!e.stateColor && item.stateColor && (item.stateColor.background || item.stateColor.foreground)) {
        e.stateColor = item.stateColor;
      }
      var plan = a['estimate_' + rk];
      if (plan === undefined || plan === null) plan = item['estimate_' + rk];
      e.plan += plan || 0;
      var fact = a['fact_' + rk];
      if (fact === undefined || fact === null) fact = item['fact_' + rk];
      e.fact += fact || 0;
      var login = a.assignee || item.assignee || '';
      if (login && e.assignees.indexOf(login) < 0) e.assignees.push(login);
    });
  });
  return order;
}

/* withState — только для сводной «Прочие состояния»: строка несёт подпись фактического
   состояния (иначе секция воспроизводила бы «свалку», ради устранения которой 68-7 и делался). */
function _standupSectionRows(list, deps, withState) {
  var fmtHours = deps.fmtHours;
  return list.map(function (e) {
    var titleTrunc = e.title.length > 60 ? e.title.substring(0, 57) + '…' : e.title;
    var hours = e.plan
      ? fmtHours(e.fact) + '/' + fmtHours(e.plan)
      : (e.fact ? fmtHours(e.fact) : '');
    var row = { issueId: e.issueId, url: e.url, title: e.title, titleTrunc: titleTrunc, hours: hours, assignees: e.assignees.slice() };
    if (withState) row.stateLabel = e.state || deps.T('standupNoState');
    return row;
  });
}

/* 68-7 — маппинг «состояние → роли» из настроек: множество состояний роли.
   Пустой маппинг (или роль ни в одной строке) → null = «без фильтра». */
function _statesOfRole(stateRoles, rk) {
  if (!Array.isArray(stateRoles) || !stateRoles.length) return null;
  var set = {};
  var any = false;
  stateRoles.forEach(function (z) {
    if (!z || !z.state || !Array.isArray(z.roles)) return;
    if (z.roles.indexOf(rk) < 0) return;
    set[z.state] = true;
    any = true;
  });
  return any ? set : null;
}

/* 68-7 — секции по состояниям. Порядок: бандл (все значения, включая пустые секции) →
   присутствующие-вне-бандла алфавитом (он же полный фолбэк до загрузки бандла) →
   «Без состояния» последней (только если непусто). standupHiddenStates скрывает секцию
   вместе с её задачами. Цвет чипа: бандл → stateColor любой задачи секции → нейтральный.
   roleStates (per-role режим с заполненным маппингом) сужает набор секций до состояний
   роли; её задачи в прочих состояниях не теряются — уходят в сводную секцию
   «Прочие состояния» с подписью состояния в строке (иначе тихая потеря из виду).
   roleLabelsByState (режим «Все роли» с маппингом) — бейдж ролей-владельцев на секции. */
function _buildStandupSections(entries, bundle, hiddenStates, deps, roleStates, roleLabelsByState) {
  var hidden = {};
  (hiddenStates || []).forEach(function (s) { if (s) hidden[s] = true; });
  var present = {};
  entries.forEach(function (e) {
    var st = e.state || '';
    (present[st] = present[st] || []).push(e);
  });
  var order = [];
  var seen = {};
  if (bundle && Array.isArray(bundle.values)) {
    bundle.values.forEach(function (s) { if (s && !seen[s]) { seen[s] = true; order.push(s); } });
  }
  Object.keys(present).filter(function (s) { return s && !seen[s]; }).sort()
    .forEach(function (s) { seen[s] = true; order.push(s); });
  var colors = (bundle && bundle.colors) || {};
  var sections = [];
  var other = [];
  order.forEach(function (st) {
    if (hidden[st]) return;
    var list = present[st] || [];
    if (roleStates && !roleStates[st]) { other = other.concat(list); return; }
    var color = colors[st] || null;
    if (!color) {
      for (var i = 0; i < list.length && !color; i++) { color = list[i].stateColor || null; }
    }
    sections.push({
      id: 'standupState:' + st,
      state: st,
      label: st,
      count: list.length,
      chipBg: (color && color.background) || null,
      chipFg: (color && color.foreground) || null,
      roleLabels: (roleLabelsByState && roleLabelsByState[st]) || [],
      rows: _standupSectionRows(list, deps),
    });
  });
  if (other.length) {
    sections.push({
      id: 'standupStateOther', state: null, label: deps.T('standupOtherStates'),
      count: other.length, chipBg: null, chipFg: null, roleLabels: [],
      rows: _standupSectionRows(other, deps, true),
    });
  }
  var noState = present[''] || [];
  if (noState.length) {
    sections.push({
      id: 'standupState:', state: '', label: deps.T('standupNoState'),
      count: noState.length, chipBg: null, chipFg: null, roleLabels: [],
      rows: _standupSectionRows(noState, deps),
    });
  }
  return sections;
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
    sectionsVisible: false, sections: [],
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
  // Role selector: 68-7 — дефолт «Все роли»
  var sel = document.getElementById('standupRoleSel');
  var rk = (sel && sel.value) || STANDUP_ALL_ROLES;
  // Sprint goal banner (флаги — в обоих исходах ниже, вкл. пустой состав)
  var vm = _hiddenStandupVm();
  vm.goalBannerVisible  = !!_sprint.sprintGoal;
  vm.goalLabel          = deps.T('standupGoalLabel');
  vm.goalText           = _sprint.sprintGoal || '';
  vm.goalMissingVisible = !_sprint.sprintGoal;
  vm.goalMissingText    = deps.T('standupGoalMissing');
  var roleKeys = (rk === STANDUP_ALL_ROLES)
    ? deps.getActiveRoles().map(function (r) { return r.key; })
    : [rk];
  var entries = _collectStandupEntries(deps, roleKeys);
  // Empty state: no tasks (per-role: в роли; «Все роли»: во всём составе)
  if (!entries.length) {
    if (emptyRole)  emptyRole.classList.remove('hidden');
    _mountStandupVm(vm);
    return;
  }
  if (emptyRole) emptyRole.classList.add('hidden');
  vm.sectionsVisible = true;
  var _settings = deps.state.getSettings();
  var bundle = (typeof deps.getStateBundle === 'function') ? deps.getStateBundle() : null;
  var hiddenStates = (_settings && Array.isArray(_settings.standupHiddenStates)) ? _settings.standupHiddenStates : [];
  /* Маппинг «состояние → роли»: в per-role режиме сужает секции до состояний роли;
     в «Все роли» фильтр не имеет смысла (секции ролей склеены) — вместо него бейдж
     ролей-владельцев на секции. */
  var stateRolesArr = (_settings && Array.isArray(_settings.standupStateRoles)) ? _settings.standupStateRoles : [];
  var roleStates = (rk === STANDUP_ALL_ROLES) ? null : _statesOfRole(stateRolesArr, rk);
  var roleLabelsByState = null;
  if (rk === STANDUP_ALL_ROLES && stateRolesArr.length) {
    var labelByKey = {};
    deps.getActiveRoles().forEach(function (r) { labelByKey[r.key] = r.label; });
    roleLabelsByState = {};
    stateRolesArr.forEach(function (z) {
      if (!z || !z.state || !Array.isArray(z.roles)) return;
      var ls = z.roles.map(function (k) { return labelByKey[k]; }).filter(Boolean);
      if (ls.length) roleLabelsByState[z.state] = ls;
    });
  }
  vm.sections = _buildStandupSections(entries, bundle, hiddenStates, deps, roleStates, roleLabelsByState);
  _mountStandupVm(vm);
}

function _populateStandupRoleSel(deps) {
  var sel = document.getElementById('standupRoleSel');
  if (!sel) return;
  var activeRoles = deps.getActiveRoles();
  var prev = sel.value;
  sel.innerHTML = '';
  var all = document.createElement('option');
  all.value = STANDUP_ALL_ROLES;
  all.textContent = deps.T('standupRoleAll');
  sel.appendChild(all);
  activeRoles.forEach(function (r) {
    var o = document.createElement('option');
    o.value = r.key; o.textContent = r.label;
    sel.appendChild(o);
  });
  /* 68-7 — дефолт «Все роли»; живой выбор пользователя переживает repopulate */
  sel.value = (prev && (prev === STANDUP_ALL_ROLES || activeRoles.some(function (r) { return r.key === prev; })))
    ? prev : STANDUP_ALL_ROLES;
  sel.onchange = function () { try { renderStandupView(deps); } catch (_) {} };
}

/* v2.2.4 — фикс: раньше слался { sprintId } на /refresh-assignees, а handler ждёт
   { issueIds, fieldName, stateFieldName } и отдаёт { assignees } → запрос всегда падал
   (стендап-refresh не работал с full-rebuild v2.1.0). Контракт:
     • state (ось секций 68-7) — для каждой роли в её _roleItems[rk]
       (чистая keyed-модель, персист sprint-data);
     • assignee — только для текущей роли через _currentRolePP + saveCurrentRoleState
       (канон-персист). Для не-текущей роли assignee не мутируем (избегаем tangled
       personalPlanning-персиста — техдолг в COMMON_ROADMAP).
   68-7 — режим «Все роли»: последовательный обход активных ролей с настроенным
   userField (fieldName обязателен для handler'а; ≤9 запросов по клику), один общий
   persist sprint-data + render + тост после всех. */
function doStandupRefresh(deps) {
  if (!deps.state.getSprint()) return Promise.resolve();
  var sel = document.getElementById('standupRoleSel');
  var rk = (sel && sel.value) || STANDUP_ALL_ROLES;
  var roles = (rk === STANDUP_ALL_ROLES)
    ? deps.getActiveRoles()
    : deps.ALL_ROLES.filter(function (r) { return r.key === rk; });
  if (!roles.length) return Promise.resolve();
  var _settings = deps.state.getSettings();
  var withField = roles.filter(function (r) { return !!(_settings && _settings[r.userField]); });
  if (!withField.length) { deps.toast(deps.T('toastSyncFromYtNoField'), 'warn'); return Promise.resolve(); }
  var stateField = (_settings && _settings.fieldState) || '';
  var _roleItems = deps.state.getRoleItems();
  var rec = deps.state.getCurrentSprintRoleRec();
  var curRk = rec ? (rec.roleKey || deps.state.getActiveSubtab()) : null;
  var btn = document.getElementById('standupRefreshBtn');
  return deps.withLoader(btn, function () {
    var changed = 0;
    var curPPChanged = false;
    var failed = false;
    var chain = Promise.resolve();
    withField.forEach(function (role) {
      chain = chain.then(function () {
        var rkey = role.key;
        var roleItems = (_roleItems && _roleItems[rkey]) || [];
        var ids = roleItems
          .filter(function (i) { return i && i.issueId && deps.ACTIVE_INC.indexOf(i.inclusionStatus) >= 0; })
          .map(function (i) { return i.issueId; });
        if (!ids.length) return;
        return deps.apiPost('refresh-assignees', { issueIds: ids, fieldName: _settings[role.userField], stateFieldName: stateField })
          .then(function (res) {
            if (!res || !res.success) { failed = true; return; }
            var assignees = res.assignees || {};
            var isCur = curRk === rkey;
            var pp = isCur ? deps.state.getCurrentRolePP() : null;
            if (isCur && !pp) { pp = { resourcesByAssignee: {}, taskAssignments: {} }; deps.state.setCurrentRolePP(pp); }
            if (pp && !pp.taskAssignments) pp.taskAssignments = {};
            var byId = {};
            roleItems.forEach(function (it) { if (it && it.issueId) byId[it.issueId] = it; });
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
                  curPPChanged = true;
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
          });
      });
    });
    return chain.then(function () {
      if (failed && !changed) { deps.toast(deps.T('toastSyncFromYtErr')); return; }
      if (!changed) { renderStandupView(deps); deps.toast(deps.T('toastSyncFromYtNoChange'), 'info'); return; }
      deps.markDirty('roleItems');
      deps.apiPost('sprint-data', { roleItems: deps.state.getRoleItems() }).catch(function (e) {
        /* v3.2.1 — 409/сеть глотались молча: UI уже показал «Обновлено», а изменения
           жили только в памяти вкладки. rev_conflict тостится внутри apiPost. */
        var msg = (e && e.message) ? e.message : String(e);
        deps.diag('standup persist ERR: ' + msg, 'err');
        if (msg !== 'rev_conflict') { try { deps.toast(deps.T('toastError') + msg, 'err'); } catch (_) {} }
      });
      if (curPPChanged) deps.saveCurrentRoleState();
      renderStandupView(deps);
      deps.toast(deps.T('toastStandupRefreshed'), 'success');
      if (failed) deps.diag('standup refresh: часть ролей не обновилась', 'err');
    }).catch(function (e) { deps.diag('standup refresh err: ' + e, 'err'); deps.toast(deps.T('toastSyncFromYtErr')); });
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
