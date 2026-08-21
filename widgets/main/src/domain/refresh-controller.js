/* Refresh-контроллер #35 «Обновить из задачи»: единый refreshFromYouTrack
   (чанкованный REST-батч + field-class merge через resolveRefreshMerge +
   конфликт-модалки S4/S5) и legacy per-role путь refreshRoleEstimates.
   Вынесено из core.js (Фаза 5 слайс 5) за мост
   window.__SSP_REFRESH_CTRL; golden-характеризация —
   tests/golden/refresh.golden.test.js (через делегаторы монолита).

   Deps приходят АРГУМЕНТОМ на каждый вызов (фабрика _refreshDeps() в
   монолите) — стейт зоны (_currentSprintId/_sprint/_settings/_roleItems/
   _currentRolePP/_serverSnapshot-снимки/_ganttStateHist/_ytBase) ОСТАЁТСЯ в
   стейт-ядре монолита: его трогают другие контроллеры, ресет per-project
   и gm-хук голденов; модуль ходит get/set-аксессорами deps.state строго
   в момент обращения. Промис-чейны и коллбеки модалок замыкают deps
   снапшотом момента вызова — late-binding getters читают свежий стейт
   ядра при выстреле (паттерн draft-store/validation). saveCurrentRoleState
   (sprint-домен) приходит делегатором монолита через deps. */
'use strict';

/* ── #35 — apply-хелперы универсального refresh ───────────────────────────── */
/* updates приходят из резолвера с обобщёнными ключами estimate/fact; в item они
   хранятся per-role как estimate_<rk>/fact_<rk>. Зеркальные поля — как есть. */
function _applyRefreshItemUpdates(item, updates, rk) {
  Object.keys(updates).forEach(function (k) {
    var target = (k === 'estimate') ? ('estimate_' + rk)
               : (k === 'fact')     ? ('fact_' + rk)
               : k;
    item[target] = updates[k];
  });
}
/* assignee живёт в taskAssignments текущей роли (personalPlanning). value = {login,fullName}|null. */
function _applyRefreshAssignee(issueId, value, deps) {
  var pp = deps.state.getCurrentRolePP();
  if (!pp) { pp = { resourcesByAssignee: {}, taskAssignments: {} }; deps.state.setCurrentRolePP(pp); }
  if (!pp.taskAssignments) pp.taskAssignments = {};
  var ta = pp.taskAssignments[issueId] = pp.taskAssignments[issueId] || {};
  var login = value ? (value.login || null) : null;
  var full  = value ? (value.fullName || value.login) : '';
  ta.assignee = login;
  ta.assigneeName = login ? (full || login) : '';
  delete ta.ganttColor;
}
function _setRefreshBtnsBusy(busy) {
  try {
    var sel = '#currentRoleSyncFromYtBtn, #ganttSyncFromYtBtn, #planningRefreshBtn';
    document.querySelectorAll(sel).forEach(function (btn) { btn.disabled = !!busy; });
  } catch (_) {}
}
function _persistAndRerenderRefresh(curRk, deps, skipPPSave) {
  deps.markDirty('roleItems');
  if (!skipPPSave) deps.markDirty('currentRole');
  deps.apiPost('sprint-data', { roleItems: deps.state.getRoleItems() }).catch(function () {});
  try { if (typeof deps.renderPlanningRoles === 'function') deps.renderPlanningRoles(); } catch (_) {}
  if (curRk) { try { if (typeof deps.renderRoleComposition === 'function') deps.renderRoleComposition(curRk); } catch (_) {} }
  try { deps.renderCurrentRoleAssigneeTable(); } catch (_) {}
  try { deps.renderCurrentRoleTaskTable(); } catch (_) {}
  try { if (typeof deps.updateCurrentRoleTotals === 'function') deps.updateCurrentRoleTotals(); } catch (_) {}
  deps.state.getGanttStateHist()._fetchedAt = 0;
  try { if (typeof deps.renderGanttChart === 'function') deps.renderGanttChart(); } catch (_) {}
  /* v3.2.1 — при протухшем _currentSprintRoleRec (skipPPSave) PP-канон не персистим:
     saveCurrentRoleState записал бы клон PP ЧУЖОГО спринта в его запись истории. */
  if (!skipPPSave) deps.saveCurrentRoleState();
}

/* S7 #35 — открыт ли незакоммиченный редактор ячейки в таблицах планирования.
   Редактируемые ячейки состава роли: .dyn-period-input (inline-режим — прямая запись в YT
   по blur+confirm) и .alloc-input (локальная аллокация — blur-коммит). Пока такой input
   в фокусе, значение ещё не записано в item → refresh откладываем, чтобы не затереть ввод. */
function _isInlineCellEditing() {
  try {
    var ae = document.activeElement;
    return !!(ae && ae.matches && ae.matches('input.dyn-period-input, input.alloc-input'));
  } catch (_) { return false; }
}

/* S5 #35 — представление конфликта в diff: подпись поля + форматирование значения.
   Конфликты возникают только на пограничных полях: estimate / fact (минуты) и assignee (login). */
function _refreshConflictFieldLabel(field, deps) {
  if (field === 'estimate') return deps.T('refreshConflictFieldEstimate');
  if (field === 'fact')     return deps.T('refreshConflictFieldFact');
  if (field === 'assignee') return deps.T('refreshConflictFieldAssignee');
  return field;
}
function _refreshConflictVal(field, v, deps) {
  if (v == null || v === '') return '—';
  if (field === 'assignee') return String(v);
  return deps.fmtPeriod(v); /* estimate/fact — минуты */
}

/* S5 #35 — diff-просмотр конфликтов поверх wcDiffView (read-only, Phase 3 #32).
   Конфликты уже несут точные from/to (вкл. assignee) — группируем по задаче в changed[].
   reopen() — колбэк возврата в сводку-модалку (S4) после закрытия diff. */
function _showRefreshDiffModal(conflicts, reopen, deps) {
  var T = deps.T;
  var byItem = {};
  (conflicts || []).forEach(function (c) {
    var key = c.issueId || '';
    if (!byItem[key]) {
      var it = c._item || {};
      byItem[key] = { title: it.title || it.summary || c.issueId || '', fields: [] };
    }
    byItem[key].fields.push({
      name: _refreshConflictFieldLabel(c.field, deps),
      from: _refreshConflictVal(c.field, c.from, deps),
      to:   _refreshConflictVal(c.field, c.to, deps),
    });
  });
  var changed = Object.keys(byItem).map(function (k) { return byItem[k]; });
  var h = deps.openModal({
    id: 'refreshDiff',
    type: 'read-only',
    title: T('refreshDiffTitle'),
    body: { kind: 'component', name: 'wcDiffView', props: {
      added: [], removed: [], changed: changed,
      labels: {
        added: T('wcDiffAdded'), removed: T('wcDiffRemoved'), changed: T('wcDiffChanged'),
        noChanges: T('wcDiffNoChanges'), close: T('btnClose'),
      },
      onClose: function () { h.close(); },
    }},
    buttons: [],
    dismissOnBackdrop: true,
    blockEscape: false,
    showCloseButton: true,
    onClose: function () { if (typeof reopen === 'function') reopen(); },
  });
}

/* S4 #35 — модалка-сводка конфликтов «Обновить из задачи».
   spec = { total, conflictCount, conflicts, onAll, onSkip }.
     • [Обновить всё из YouTrack] → onAll (overwrite, вкл. конфликтные);
     • [Сохранить мои правки]     → onSkip (только бесконфликтные);
     • [Показать различия]        → diff-подмодалка → возврат в эту сводку.
   Escape/backdrop/close-X → отмена (ничего не применяем — безопасно). */
function _showRefreshConflictModal(spec, deps) {
  var T = deps.T;
  spec = spec || {};
  var decided = null; /* 'all' | 'skip' | 'diff' | null */
  function open() {
    decided = null;
    deps.openModal({
      id: 'refreshConflict',
      type: 'confirm',
      title: T('refreshConflictTitle'),
      body: { kind: 'text', text: T('refreshConflictBody')
        .replace('{n}', String(spec.total || 0))
        .replace('{k}', String(spec.conflictCount || 0)) },
      buttons: [
        { id: 'all',  text: T('refreshConflictAll'),  variant: 'danger',    onClick: function (h) { decided = 'all';  h.close(); } },
        { id: 'skip', text: T('refreshConflictSkip'), variant: 'primary',   onClick: function (h) { decided = 'skip'; h.close(); } },
        { id: 'diff', text: T('refreshConflictDiff'), variant: 'secondary', onClick: function (h) { decided = 'diff'; h.close(); } },
      ],
      dismissOnBackdrop: false,
      blockEscape: false,
      showCloseButton: true,
      onClose: function () {
        if (decided === 'all') { if (spec.onAll) spec.onAll(); }
        else if (decided === 'skip') { if (spec.onSkip) spec.onSkip(); }
        else if (decided === 'diff') { _showRefreshDiffModal(spec.conflicts, open, deps); }
        /* decided === null → отмена: ничего не применяем */
      },
    });
  }
  open();
}

/* ── #35 — универсальный refresh «Обновить из задачи» ───────────────────────
   Единый путь обновления данных задач из YouTrack для обеих вкладок планирования
   (Аллокация общего ресурса + Распределение по исполнителям) и Ганта.
     • item-поля (estimate/fact/state/priority/system/extId) — для ВСЕХ активных ролей;
     • assignee-распределение — только для текущей роли (там, где people-вкладка и где
       пользователь его правит; для прочих ролей подтянется при переключении).
   Слияние — через resolveRefreshMerge (field-class + dirty-guard).
   Конфликты — эскалируются в _showRefreshConflictModal (S4). */
function refreshFromYouTrack(deps) {
  var T = deps.T, toast = deps.toast;
  var state = deps.state;
  /* Гард v2.2.6: refresh доступен для редактируемого активного/планируемого спринта в ЛЮБОМ
     статусе (вкл. «Состав согласован»/ALLOCATED). Блокируем ТОЛЬКО исторический readonly-просмотр
     (§5) и редактирование working-copy истории. Критерий — тот же, что у UI readonly-режима
     (isHistoricalView), а НЕ isActiveSprintRecord: последний требует непустой working
     `_sprint` и ложно блокировал активный согласованный спринт, собранный из истории
     (_sprint === null → вид редактируемый, но refresh падал). */
  var sprint = state.getSprint();
  var curSprintId = state.getCurrentSprintId();
  var _histView = !!(curSprintId && sprint && curSprintId !== sprint.sprintId);
  if (!curSprintId || _histView || state.getActiveWorkingDraftKey()) {
    toast(T('toastRefreshNotActive'), 'info'); return;
  }
  if (_isInlineCellEditing()) {
    toast(T('toastRefreshBusyEditing'), 'warn'); return; /* S7 */
  }
  var roles = deps.getActiveRoles();
  if (!roles.length) { toast(T('toastSelectSprint')); return; }

  /* null-safe: _currentSprintRoleRec может быть null на вкладке «Состав ролей» или при _sprint===null. */
  var curRoleRec = state.getCurrentSprintRoleRec();
  /* v3.2.1 — rec может ПРОТУХНУТЬ: смена спринта пикером с уровня «Роли» не перезагружает
     _currentSprintRoleRec/_currentRolePP (их обновляет только рендер «Люди»/Ганта). Протухший
     rec ДРУГОГО спринта направлял remote-assignee задач НОВОГО спринта в PP-канон СТАРОГО
     (класс прод-бага #56-7). Протух = rec есть, но sprintId не матчится префиксом; тогда
     assignee-ось и PP-персист выключаем. rec=null — легитимный live-кейс (уровень «Роли»,
     curRk из activeSubtab) — прежнее поведение. */
  var recStale = !!(curRoleRec && curSprintId
      && String(curRoleRec.sprintId || '').indexOf(curSprintId + '_') !== 0);
  if (recStale) curRoleRec = null;
  var recFresh = !recStale;
  var curRk = (curRoleRec && curRoleRec.roleKey) || state.getActiveSubtab()
            || (roles[0] && roles[0].key) || null;
  var curRole = deps.ALL_ROLES.find(function (r) { return r.key === curRk; });

  var settings   = state.getSettings();
  var fState     = (settings && settings.fieldState) || '';
  var fPriority  = (settings && settings.fieldPriority) || '';
  var fXPriority = (settings && settings.fieldXPriority) || '';
  var fSystem    = (settings && settings.fieldSystem) || '';
  var fExtId     = (settings && settings.fieldExternalTicketId) || '';
  var curUserField = (curRole && settings && settings[curRole.userField]) || '';

  var roleData = [], idSet = {};
  roles.forEach(function (role) {
    var ytEst  = (settings && settings[role.fieldEst]) || null;
    var ytFact = (settings && settings[role.fieldFact]) || null;
    var all = deps.getRoleItemsArr(role.key);
    var arr = all.filter(function (i) {
      return i && i.issueId && deps.ACTIVE_INC.indexOf(i.inclusionStatus) >= 0;
    });
    /* #56-2 — «Исключена из спринта»: YT-зеркальные поля (state/priority/xpriority/
       system/extId) обновляем и у исключённых, иначе они застывают навсегда.
       Оценки/факт/исполнителя у excluded не трогаем — задача вне спринта. */
    var arrEx = all.filter(function (i) {
      return i && i.issueId && i.inclusionStatus === 'INC_EXCLUDED';
    });
    arr.forEach(function (i) { idSet[i.issueId] = 1; });
    arrEx.forEach(function (i) { idSet[i.issueId] = 1; });
    roleData.push({ rk: role.key, items: arr, itemsEx: arrEx, ytEst: ytEst, ytFact: ytFact });
  });

  var ids = Object.keys(idSet);
  if (!ids.length) { toast(T('toastSyncFromYtNoTasks'), 'info'); return; }

  /* Источник — фронтовый REST-батч. YouTrack REST отдаёт локализованные enum/state
     (localizedName/presentation); workflow entities-API на backend — нет (#35: на стенде
     priority приходил как name «Show-stopper» вместо «Неотложная»). Чанкуем по 100 id,
     чтобы не упереться в лимит длины URL-запроса. */
  var FIELDS = 'id,idReadable,summary,customFields(name,projectCustomField(field(name,id)),value(name,localizedName,presentation,color(id,background,foreground),minutes,login,fullName))';
  var CHUNK = 100, chunks = [];
  for (var ci = 0; ci < ids.length; ci += CHUNK) chunks.push(ids.slice(ci, ci + CHUNK));

  function cfOf(issue, fname) {
    var cfs = issue.customFields || [];
    return cfs.find(function (cf) {
      var fn = (cf.projectCustomField && cf.projectCustomField.field && cf.projectCustomField.field.name) || cf.name || '';
      return fn === fname;
    });
  }
  function getMin(issue, fname) {
    var f = cfOf(issue, fname);
    return (f && f.value && f.value.minutes !== undefined) ? f.value.minutes : null;
  }
  function getStr(issue, fname) {
    var f = cfOf(issue, fname);
    if (!f || f.value === null || f.value === undefined) return '';
    var v = f.value;
    if (typeof v === 'string') return v;
    return v.localizedName || v.presentation || v.name || '';
  }
  function getUser(issue, fname) {
    var f = cfOf(issue, fname);
    var v = f && f.value;
    return (v && typeof v === 'object' && (v.login || v.fullName))
      ? { login: v.login || null, fullName: v.fullName || v.name || null }
      : null;
  }
  function getStateObj(issue, fname) {
    var f = cfOf(issue, fname);
    var v = f && f.value;
    if (!v || typeof v !== 'object') return null;
    var nm = v.localizedName || v.presentation || v.name || '';
    var c = v.color;
    return { name: nm, color: (c && (c.background || c.foreground)) ? { background: c.background || null, foreground: c.foreground || null } : null };
  }

  _setRefreshBtnsBusy(true);
  Promise.all(chunks.map(function (chunk) {
    return deps.host.fetchYouTrack('issues', { query: { fields: FIELDS, query: 'issue id: ' + chunk.join(', '), '$top': chunk.length } });
  })).then(function (results) {
    var issuesById = {};
    (results || []).forEach(function (arr) {
      (arr || []).forEach(function (issue) {
        if (issue.idReadable) issuesById[issue.idReadable] = issue;
        if (issue.id) issuesById[issue.id] = issue;
      });
    });

    var curPP = state.getCurrentRolePP();
    var snapPP = state.getServerSnapshotCurrentRolePP();
    var curTA  = (curPP && curPP.taskAssignments) || {};
    var snapTA = (snapPP && snapPP.taskAssignments) || {};
    function snapItem(rk, issueId) {
      var snapItems = state.getServerSnapshotRoleItems();
      var arr = (snapItems && snapItems[rk]) || [];
      for (var i = 0; i < arr.length; i++) if (arr[i] && arr[i].issueId === issueId) return arr[i];
      return null;
    }

    var pendingItemUpdates = [];  /* {item, updates, rk} */
    var pendingAssignee = [];     /* {issueId, value} */
    var conflicts = [];           /* {issueId, roleKey, field, from, to, _item, _rk, _assignee} */

    roleData.forEach(function (rd) {
      var rk = rd.rk, isCur = (rk === curRk);
      rd.items.forEach(function (item) {
        var issue = issuesById[item.issueId];
        if (!issue) return;
        var remote = {};
        if (rd.ytEst)  remote.estimate = getMin(issue, rd.ytEst);
        if (rd.ytFact) remote.fact     = getMin(issue, rd.ytFact);
        if (fState) {
          var stv = getStateObj(issue, fState);
          if (stv) { remote.state = stv.name; remote.stateLocalized = stv.name; remote.stateColor = stv.color; }
        }
        if (fPriority)  remote.priority         = getStr(issue, fPriority);
        if (fXPriority) remote.xpriority        = getStr(issue, fXPriority);
        if (fSystem)    remote.system           = getStr(issue, fSystem);
        if (fExtId)     remote.externalTicketId = getStr(issue, fExtId);
        if (isCur && curUserField && recFresh) remote.assignee = getUser(issue, curUserField); /* {login,fullName}|null; v3.2.1 — только при свежем rec */

        var sItem = snapItem(rk, item.issueId);
        var local = {
          estimate: item['estimate_' + rk], fact: item['fact_' + rk],
          state: item.state, priority: item.priority, xpriority: item.xpriority,
          system: item.system, externalTicketId: item.externalTicketId,
        };
        var snapshot = {
          estimate: sItem ? sItem['estimate_' + rk] : null,
          fact: sItem ? sItem['fact_' + rk] : null,
        };
        if (isCur) {
          local.assignee = (curTA[item.issueId] || {}).assignee || null;
          snapshot.assignee = (snapTA[item.issueId] || {}).assignee || null;
        }

        var res = deps.resolveRefreshMerge({
          issueId: item.issueId, roleKey: rk, local: local, snapshot: snapshot, remote: remote,
        });

        if (res.updates && Object.keys(res.updates).length) pendingItemUpdates.push({ item: item, updates: res.updates, rk: rk });
        if (res.assigneeUpdate !== undefined) pendingAssignee.push({ issueId: item.issueId, value: res.assigneeUpdate });
        (res.conflicts || []).forEach(function (c) {
          var rich = { issueId: c.issueId, roleKey: c.roleKey, field: c.field, from: c.from, to: c.to, _item: item, _rk: rk };
          if (c.field === 'assignee') rich._assignee = remote.assignee;
          conflicts.push(rich);
        });
      });
      /* #56-2 — исключённые: только YT-зеркальные поля, без est/fact/assignee
         (remote их не содержит → merge-pure не тронет; конфликтов не бывает). */
      (rd.itemsEx || []).forEach(function (item) {
        var issue = issuesById[item.issueId];
        if (!issue) return;
        var remote = {};
        if (fState) {
          var stv = getStateObj(issue, fState);
          if (stv) { remote.state = stv.name; remote.stateLocalized = stv.name; remote.stateColor = stv.color; }
        }
        if (fPriority)  remote.priority         = getStr(issue, fPriority);
        if (fXPriority) remote.xpriority        = getStr(issue, fXPriority);
        if (fSystem)    remote.system           = getStr(issue, fSystem);
        if (fExtId)     remote.externalTicketId = getStr(issue, fExtId);
        var res = deps.resolveRefreshMerge({
          issueId: item.issueId, roleKey: rk,
          local: { state: item.state, priority: item.priority, xpriority: item.xpriority,
                   system: item.system, externalTicketId: item.externalTicketId },
          snapshot: {}, remote: remote,
        });
        if (res.updates && Object.keys(res.updates).length) pendingItemUpdates.push({ item: item, updates: res.updates, rk: rk });
      });
    });

    /* mode: 'all' (вкл. конфликтные) | 'skip' (только бесконфликтные). */
    function applyAndFinish(mode) {
      pendingItemUpdates.forEach(function (u) { _applyRefreshItemUpdates(u.item, u.updates, u.rk); });
      pendingAssignee.forEach(function (a) { _applyRefreshAssignee(a.issueId, a.value, deps); });
      if (mode === 'all') {
        conflicts.forEach(function (c) {
          if (c.field === 'assignee') { _applyRefreshAssignee(c.issueId, c._assignee, deps); }
          else { var u = {}; u[c.field] = c.to; _applyRefreshItemUpdates(c._item, u, c._rk); }
        });
      }
      _persistAndRerenderRefresh(curRk, deps, !recFresh);
      var applied = pendingItemUpdates.length + pendingAssignee.length + (mode === 'all' ? conflicts.length : 0);
      if (!applied) toast(T('toastSyncFromYtNoChange'), 'info');
      else toast(T('toastSyncFromYtUpdated').replace('{n}', String(applied)), 'success');
    }

    var totalAffected = pendingItemUpdates.length + pendingAssignee.length + conflicts.length;
    if (!conflicts.length) {
      if (!totalAffected) { toast(T('toastSyncFromYtNoChange'), 'info'); return; }
      applyAndFinish('skip');
      return;
    }
    /* Сводка считает ЗАДАЧИ (distinct issueId), не записи: одна задача может дать несколько
       field-изменений/конфликтов. N = затронутых задач, K = задач с несохранёнными правками. */
    var affTaskSet = {}, conflTaskSet = {};
    pendingItemUpdates.forEach(function (u) { if (u.item && u.item.issueId) affTaskSet[u.item.issueId] = 1; });
    pendingAssignee.forEach(function (a) { if (a.issueId) affTaskSet[a.issueId] = 1; });
    conflicts.forEach(function (c) { if (c.issueId) { affTaskSet[c.issueId] = 1; conflTaskSet[c.issueId] = 1; } });
    /* Эскалация: модалка-сводка (S4). */
    _showRefreshConflictModal({
      total: Object.keys(affTaskSet).length,
      conflictCount: Object.keys(conflTaskSet).length,
      conflicts: conflicts,
      onAll: function () { applyAndFinish('all'); },
      onSkip: function () { applyAndFinish('skip'); },
    }, deps);
  }).catch(function (e) {
    deps.diag('refreshFromYouTrack failed: ' + (e && e.message ? e.message : e), 'err');
    toast(T('toastSyncFromYtErr'));
  }).finally(function () {
    _setRefreshBtnsBusy(false);
  });
}

/* ── Обновить оценки из YouTrack для роли (legacy per-role путь: последовательные
   фетчи, getMin затирает null'ом — сознательное отличие от resolveRefreshMerge,
   см. шапку refresh-merge-pure.js) ── */
function refreshRoleEstimates(rk, deps) {
  var T = deps.T, state = deps.state;
  var items = deps.getRoleItemsArr(rk);
  if (!items.length) return;
  var role = deps.ALL_ROLES.find(function(r){ return r.key === rk; });
  if (!role) return;
  var btn = document.getElementById('planningRefreshBtn');   /* #69 R1 — busy на общей кнопке «Роли» */
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> '+T('btnRefreshLoading'); }
  var p = Promise.resolve();
  items.forEach(function(item) {
    p = p.then(function() {
      return deps.host.fetchYouTrack('issues/' + item.issueId, {
        query: { fields: 'id,idReadable,summary,customFields(name,projectCustomField(field(name,id)),value(name,localizedName,presentation,color(id,background,foreground),minutes,login))' }
      }).then(function(issue) {
        if (!issue) return;
        var cfs = issue.customFields || [];
        function findCf(fname) {
          return cfs.find(function(cf){
            var fn = (cf.projectCustomField && cf.projectCustomField.field && cf.projectCustomField.field.name) || cf.name || '';
            return fn === fname;
          });
        }
        function getMin(fname) {
          var f = findCf(fname);
          return (f && f.value && f.value.minutes !== undefined) ? f.value.minutes : null;
        }
        function getStr(fname) {
          var f = findCf(fname);
          if (!f || f.value === null || f.value === undefined) return '';
          var v = f.value;
          if (typeof v === 'string') return v;
          return v.localizedName || v.presentation || v.name || '';
        }
        var settings = state.getSettings();
        if (settings && settings[role.fieldEst])  item['estimate_'+rk] = getMin(settings[role.fieldEst]);
        if (settings && settings[role.fieldFact]) item['fact_'+rk]     = getMin(settings[role.fieldFact]);
        if (settings && settings.fieldPriority)         item.priority          = getStr(settings.fieldPriority);
        if (settings && settings.fieldXPriority)        item.xpriority         = getStr(settings.fieldXPriority);
        if (settings && settings.fieldState) {
          item.state = getStr(settings.fieldState);
          var _stCf = findCf(settings.fieldState);
          var _stV  = _stCf && _stCf.value;
          item.stateLocalized = _stV ? (_stV.localizedName || _stV.presentation || _stV.name || '') : '';
          var _stC  = _stV && _stV.color;
          item.stateColor = (_stC && (_stC.background || _stC.foreground))
            ? { background: _stC.background || null, foreground: _stC.foreground || null }
            : null;
          item.stateFieldId = (_stCf && _stCf.projectCustomField && _stCf.projectCustomField.field && _stCf.projectCustomField.field.id) || null;
        }
        if (settings && settings.fieldSystem)           item.system            = getStr(settings.fieldSystem);
        /* v1.8.0 D130 — Etap В.2 — populate externalTicketId from YT string field. */
        if (settings && settings.fieldExternalTicketId) item.externalTicketId  = getStr(settings.fieldExternalTicketId);
        if (!item.url || item.url.indexOf('/null/') >= 0) {
          item.url = state.getYtBase() + '/issue/' + (issue.idReadable || item.issueId);
        }
        if (!item.title || item.title === item.issueId) {
          item.title = issue.summary || item.issueId;
        }
      }).catch(function(){});
    });
  });
  p.then(function(){ return deps.apiPost('sprint-data', { roleItems: state.getRoleItems() }); })
   .then(function(){
     deps.renderRoleComposition(rk);
     deps.updateRoleRemaining(rk);
     deps.toast(T('toastEstUpdated'), 'success');
   })
   .finally(function(){
     if (btn) { btn.disabled = false; btn.textContent = T('btnRefreshFromTask'); } /* S6 #35 — единый label */
   });
}

const api = {
  refreshFromYouTrack: refreshFromYouTrack,
  refreshRoleEstimates: refreshRoleEstimates,
};

if (typeof window !== 'undefined') {
  try { window.__SSP_REFRESH_CTRL = api; } catch (_) { /* sandboxed write may throw */ }
}

module.exports = api;
