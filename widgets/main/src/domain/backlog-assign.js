'use strict';
/* widgets/main/src/domain/backlog-assign.js
   #21 слайс 4 — раскладка задачи из пула бэклога в состав ролей спринта (C1-C2 спеки).
   «Разложить в спринт» = добавить item с INC_PLANNED в _roleItems[rk] для каждой выбранной
   роли (§14.2: состав уже поддерживает INC_PLANNED, доработка не нужна). Форма item — 1:1 с
   domain/pick.js _pickAddSelected (та же проверенная в проде структура; backend whitelist
   ALLOWED_ITEM_KEYS + динамические estimate_/fact_/alloc_). Идемпотентно: задача, уже
   присутствующая в составе роли, пропускается (как pick).

   Модалка выбора ролей — react/backlog-assign.jsx (body 'backlogAssign'), открывается через
   deps.openModal (мост __SSP_RING_MODAL). Целевой спринт = текущий deps.sprint (слайс 4;
   per-tab селектор целевого спринта — слайс 5). Логика построения props живёт здесь (домен),
   core держит тонкий делегатор + deps-фабрику — как openPickModal в pick.js.

   Мета задачи приходит из транзиентного пула (loader, слайс 2b) — НЕ из кэша подбора.
   estimate_/fact_/alloc_ ставим null (как pick) — refreshRoleEstimates дочитает ролевую
   оценку из полей задачи (§6.2: оценки из покера живут в полях, модуль их читает).

   Deps (фабрика _backlogAssignDeps в монолите):
     { t, toast, diag, inc, ytBase, currentUser, draftVersion, baseRevHash,
       sprint, roleItems, settings, backlogPool, getActiveRoles, roleLabel, fmt,
       getRoleItemsArr, openModal, apiPost, markDirty, draftSet,
       renderRoleComposition, updateRoleRemaining, refreshRoleEstimates }.
   Мост window.__SSP_BACKLOG_ASSIGN. */

function _num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }

/* Открыть модалку раскладки для задачи пула по её issueId. Преселект ролей — активные роли
   зоны задачи (§6.1 вар.A автопредложение по маппингу состояние→роль); правка — чекбоксами
   по всем активным ролям. У каждой роли — остаток (§6.3) или метка «нужна оценка» (§6.2). */
function openAssignModal(issueId, deps) {
  var T = deps.t, toast = deps.toast;
  var sprint = deps.sprint;
  if (!sprint || !sprint.sprintId) { try { toast(T('backlogAssignNoSprint'), 'warn'); } catch (_) {} return; }

  var pool = deps.backlogPool || [];
  var task = null;
  for (var i = 0; i < pool.length; i++) { if (pool[i] && pool[i].issueId === issueId) { task = pool[i]; break; } }
  if (!task) { deps.diag('openAssignModal: task not in pool — ' + issueId, 'warn'); return; }

  var settings = deps.settings || {};
  var zonesCfg = Array.isArray(settings.backlogZones) ? settings.backlogZones : [];
  var zoneRoles = {};
  for (var z = 0; z < zonesCfg.length; z++) {
    if (zonesCfg[z] && zonesCfg[z].state === task.stateName) {
      (zonesCfg[z].roles || []).forEach(function (rk) { zoneRoles[rk] = true; });
      break;
    }
  }

  var est = task.estByRole || {}, fact = task.factByRole || {};
  var activeRoles = (typeof deps.getActiveRoles === 'function') ? (deps.getActiveRoles() || []) : [];
  var roles = activeRoles.map(function (r) {
    var e = _num(est[r.key]);
    var f = _num(fact[r.key]) || 0;
    return {
      key: r.key,
      label: deps.roleLabel(r),
      rem: (e == null) ? null : Math.max(0, e - f),
      needsPoker: (e == null),
      preselected: zoneRoles[r.key] === true,
    };
  });

  var h = deps.openModal({
    id: 'backlogAssign',
    type: 'selection',
    title: T('backlogAssignTitle'),
    body: { kind: 'component', name: 'backlogAssign', props: {
      task: { idReadable: task.idReadable || task.issueId, summary: task.summary || '', system: task.system || '' },
      roles: roles,
      fmt: deps.fmt,
      labels: {
        rolesLabel: T('backlogAssignRoles'),
        remainder:  T('backlogAssignRemainder'),
        needsPoker: T('backlogNeedsPoker'),
        noRoles:    T('backlogNoActiveRoles'),
        confirm:    T('backlogAssignConfirm'),
        cancel:     T('btnCancel'),
      },
      onConfirm: function (keys) { assignToSprint(task, keys, deps); h.close(); },
      onCancel:  function () { h.close(); },
    } },
    buttons: [],
    dismissOnBackdrop: true,
    showCloseButton: true,
  });
}

/* task — объект пула (loader): { issueId, idReadable, summary, system, priority, stateName, … }.
   roleKeys — массив ключей ролей. Возвращает число ролей, в состав которых задача добавлена
   (пропущенные дубли не считаются). */
function assignToSprint(task, roleKeys, deps) {
  var T = deps.t, toast = deps.toast;
  if (!task || !task.issueId) { return 0; }
  if (!roleKeys || !roleKeys.length) { toast(T('backlogAssignNeedRole')); return 0; }

  var issueId = task.idReadable || task.issueId;
  var addedRoles = [];
  roleKeys.forEach(function (rk) {
    if (!rk) return;
    var arr = deps.getRoleItemsArr(rk);
    var exists = arr.some(function (i) { return i.issueId === issueId; });
    if (exists) return; /* идемпотентность — как _pickAddSelected */
    /* v5.0.3 — НЕ кладём sprintId на item (backend whitelist его не содержит → отвергнет item).
       INC_PLANNED — «запланирована, роль не начала» (§14.2). */
    var newItem = {
      issueId:  issueId,
      url:      deps.ytBase + '/issue/' + issueId,
      title:    task.summary || issueId,
      priority: task.priority || '',
      xpriority: '',
      state:    task.stateName || '',
      system:   task.system || '',
      inclusionStatus: deps.inc.PLANNED,
      addedAt: Date.now(),
      addedBy: deps.currentUser ? deps.currentUser.login : null,
    };
    newItem['estimate_' + rk] = null;
    newItem['fact_' + rk]     = null;
    newItem['alloc_' + rk]    = null; /* null → при рендере = дельта по умолчанию */
    arr.push(newItem);
    addedRoles.push(rk);
  });

  if (!addedRoles.length) { toast(T('backlogAssignAlready')); return 0; }

  deps.markDirty('roleItems');
  deps.draftSet('roleItems', deps.roleItems);
  deps.draftSet('meta', { savedAt: Date.now(), version: deps.draftVersion, baseRevHash: deps.baseRevHash });
  /* v5.0.3 — сохраняем _sprint вместе с roleItems (на свежем проекте sprintId не перегенерится). */
  deps.apiPost('sprint-data', { sprint: deps.sprint, roleItems: deps.roleItems }).then(function () {
    addedRoles.forEach(function (rk) {
      deps.renderRoleComposition(rk);
      deps.updateRoleRemaining(rk);
      deps.refreshRoleEstimates(rk); /* дочитать ролевую оценку из полей задачи (§6.2) */
    });
    toast(T('backlogAssignDone') + ': ' + addedRoles.length, 'success');
  }).catch(function (err) {
    deps.diag('backlog assign failed: ' + (err && err.message ? err.message : err), 'err');
    toast((T('toastSaveError') || '') + (err && err.message ? err.message : ''), 'err');
  });

  return addedRoles.length;
}

var api = { openAssignModal: openAssignModal, assignToSprint: assignToSprint };

if (typeof window !== 'undefined') {
  try { window.__SSP_BACKLOG_ASSIGN = api; } catch (_) { /* sandboxed write may throw */ }
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
