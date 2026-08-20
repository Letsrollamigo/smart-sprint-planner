'use strict';
// Working-copy lifecycle state machine (v5.3.0 D3/b) extracted from
// widgets/main/src/core.js (Tier C, most interconnected cluster).
// Browser bridge: window.__SSP_WORKING_COPY. Golden-tested in
// tests/golden/working-copy.golden.test.js (draft structure, commit transitions,
// restore matrix, resume incl. other-roles isolation, discard chain,
// saveRoleHistorySnapshot insert/preserve/validated + commit-flow + conflict).
//
// Faithful extraction — bodies mirror the IIFE originals 1:1 modulo state access. The
// monolith keeps thin delegators (building deps per call via _wcDeps). Working-draft
// persistence infra (_workingDrafts load/flush/delete/reconcile/gc) and
// syncWorkingDraftFromMemory STAY in the monolith. Injected deps:
//   t, toast, diag                       — i18n/UI services
//   allRoles, status, activeInc, draftVersion — constants
//   deepClone, apiGet, apiPost, getRoleItemsArr, calcRemForRole, isActiveSprintRecord,
//   computeBaseSnapshotHash, computeRequiredRevalidationLevel, applyRevalidationLevel,
//   workingDraftsScheduleFlush, workingDraftsDeleteOnBackend,
//   draftGet, draftSet, markClean        — services (монолитные делегаторы-обёртки —
//                                          late binding на каждом срабатывании)
//   showDiscardConfirmModal, showWorkingCopyConflictModal, exportConflictToExcel,
//   hideWorkingCopyBanner, renderWorkingCopyBanner, renderPlanningRoles,
//   renderRolePlannerHeader, renderRoleComposition, updateRoleRemaining,
//   renderHistory, renderPlannerRoles, renderWidgetHeader — модалки/рендер-хуки
//   state                                — get/set аксессоры монолитного стейта
//     (_workingDrafts/_history/_sprint/_roleItems/_activeWorkingDraftKey/_currentUser/
//      _thisTabToken/_settings/_currentSprintRoleRec/_currentRolePP|Gantt|NkcKey/
//      _baseRevHash/_draftRestoreInProgress/_lang/_uiExpandedRoles)

/* ═══ v5.3.0 — Working copy lifecycle ═══ */
function createWorkingDraftFromSnapshot(snap, idx, deps) {
  if (!snap || !snap.sprintId) return null;
  var key = snap.sprintId;
  var rk  = snap.roleKey;
  var role = deps.allRoles.find(function(r){ return r.key === rk; });
  if (!role) return null;
  var currentUser = deps.state.getCurrentUser();
  var login = (currentUser && currentUser.login) || '';
  var draft = {
    schemaVersion:    1,
    key:              key,
    baseSnapshotHash: deps.computeBaseSnapshotHash(snap),
    baseStatusAtOpen: snap.status || deps.status.PLANNING,
    createdAt:        Date.now(),
    updatedAt:        Date.now(),
    editorLogin:      login,
    editorTabToken:   deps.state.getThisTabToken(),
    sprint: {
      sprintId:        snap.sprintId,
      name:            snap.name || null,
      dateStart:       snap.dateStart || null,
      dateEnd:         snap.dateEnd || null,
      sprintFieldVal:  snap.sprintFieldVal || null,
      versionFieldVal: snap.versionFieldVal || null
    },
    items: (snap.items || []).map(function(it){
      var copy = {};
      Object.keys(it).forEach(function(k){ copy[k] = it[k]; });
      return copy;
    }),
    personalPlanning: snap.personalPlanning ? deps.deepClone(snap.personalPlanning) : null,
    gantt:            snap.gantt            ? deps.deepClone(snap.gantt)            : null,
    revisions:        (snap.revisions || []).slice()
  };
  /* Скопировать ёмкость роли (resource<Role>) */
  if (role.resKey) draft.sprint[role.resKey] = (snap[role.resKey] != null ? snap[role.resKey] : 0);

  deps.state.getWorkingDrafts()[key] = draft;
  var history = deps.state.getHistory();
  /* v3.2.1 — idx приходит из ОТСОРТИРОВАННОГО display-списка истории (renderHistory
     сортирует по confirmedAt, порядок живого массива расходится из-за in-place
     авто-снапшотов) → флаг hasWorkingCopy садился на чужую запись. Резолв по sprintId. */
  var liveIdx = history.findIndex(function (h) { return h && h.sprintId === key; });
  if (liveIdx >= 0) {
    history[liveIdx].hasWorkingCopy = true;
    deps.apiPost('history', { history: history }).catch(function(){});
  }
  deps.workingDraftsScheduleFlush();
  return draft;
}

function resumeWorkingDraft(key, idx, deps) {
  var draft = deps.state.getWorkingDrafts()[key];
  if (!draft) return;
  var rk = (draft.items && draft.items.length) ? null : null;
  /* Извлекаем roleKey из ключа: '<sprintId>_<roleKey>'. */
  var history = deps.state.getHistory();
  var snap = history.find(function(s){ return s && s.sprintId === key; });
  if (!snap) {
    deps.diag('resumeWorkingDraft: base snap not found for key='+key, 'err');
    return;
  }
  rk = snap.roleKey;
  var role = deps.allRoles.find(function(r){ return r.key === rk; });
  if (!role) return;

  deps.state.setActiveWorkingDraftKey(key);

  /* Загрузить данные working copy в активный _sprint и _roleItems[rk]. */
  var sprint = deps.state.getSprint() || {};
  deps.state.setSprint(sprint);
  sprint.sprintId        = key.replace('_' + rk, '');
  sprint.name            = draft.sprint.name;
  sprint.dateStart       = draft.sprint.dateStart;
  sprint.dateEnd         = draft.sprint.dateEnd;
  sprint.sprintFieldVal  = draft.sprint.sprintFieldVal;
  sprint.versionFieldVal = draft.sprint.versionFieldVal;
  sprint.status          = deps.status.PLANNING;  /* в working copy всегда PLANNING (lock-bypass) */
  /* Все resource<Role> копируются */
  deps.allRoles.forEach(function(r){
    if (draft.sprint[r.resKey] != null) sprint[r.resKey] = draft.sprint[r.resKey];
  });
  /* Legacy флаги стираем — больше не нужны */
  delete sprint.editingFromHistory;
  delete sprint.historyIdx;

  var roleItems = deps.state.getRoleItems();
  roleItems[rk] = (draft.items || []).map(function(it){
    var copy = {};
    Object.keys(it).forEach(function(k){ copy[k] = it[k]; });
    return copy;
  });
  /* v1.9.3 D134 — Etap О.2/П.2 fix: контаминация составов других ролей.
     До v1.9.3 _roleItems[otherRk] оставался от предыдущего контекста (другой
     спринт / роль), потому что resumeWorkingDraft грузил из draft только
     активную rk. Симптом: открываешь на правку спринт А роль X → состав X
     корректный (из draft), но спойлеры ролей Y и Z в Planning показывали
     составы из спринта Б (что было активно до).

     Источник истины для других ролей при открытии исторического спринта на
     правку — последний history snapshot этого же sprintId для каждой роли.
     Если snapshot отсутствует (роль никогда не редактировалась в спринте) —
     пустой массив (а не stale данные предыдущего контекста).

     Cherry-pick из proprietary v7.3.2 Этап П.2. */
  var _sprintIdForOthers = sprint.sprintId;
  deps.allRoles.forEach(function(r) {
    if (r.key === rk) return; // активную роль уже загрузили выше из draft
    var otherSnapId = _sprintIdForOthers + '_' + r.key;
    var otherSnap = Array.isArray(history)
      ? history.find(function(h){ return h && h.sprintId === otherSnapId; })
      : null;
    if (otherSnap && Array.isArray(otherSnap.items)) {
      roleItems[r.key] = otherSnap.items.map(function(it){
        var copy = {};
        Object.keys(it).forEach(function(k){ copy[k] = it[k]; });
        return copy;
      });
    } else {
      roleItems[r.key] = [];
    }
  });
  /* #49 — in-progress PP рабочей копии (single per-role) сеем в КАНОН-запись редактируемой
     роли (snap = history-запись для key); getPP читает только канон. _sprint.personalPlanning
     затем выставляем derived keyed-map из канона (serialization-зеркало для sprint-data POST
     ниже), а НЕ single draft.personalPlanning (был регрессор keyed→single в WC-пути). */
  if (draft.personalPlanning && snap) snap.personalPlanning = deps.deepClone(draft.personalPlanning);
  sprint.personalPlanning = deps.buildPPMapFromCanon(sprint.sprintId, history, deps.deepClone);
  if (draft.gantt)            sprint.gantt            = deps.deepClone(draft.gantt);

  /* Sync на бэкенд _sprint+_roleItems */
  deps.apiPost('sprint-data', { sprint: sprint, roleItems: roleItems })
    .catch(function(e){ deps.diag('resumeWorkingDraft: sprint-data sync failed: '+(e&&e.message?e.message:e),'err'); });

  /* v5.6.0 — Этап 4 (4c): переключение на tab-planning > Роли + раскрытие accordion-карточки.
     Legacy tab-planner и subtabs физически удалены. */
  var planBtn = document.querySelector('.tab-btn[data-tab="planning"]');
  if (planBtn) planBtn.click();
  var rolesBtn = document.querySelector('.planning-level-btn[data-level="roles"]');
  if (rolesBtn) rolesBtn.click();
  var uiExpanded = deps.state.getUiExpandedRoles();
  if (typeof uiExpanded !== 'undefined') {
    uiExpanded[rk] = true;
    var ui = deps.draftGet('ui') || {};
    ui.expandedRoles = Object.keys(uiExpanded).filter(function(k){ return uiExpanded[k]; });
    deps.draftSet('ui', ui);
  }
  if (typeof deps.renderPlanningRoles === 'function') {
    try { deps.renderPlanningRoles(); } catch(e){ deps.diag('renderPlanningRoles err: '+e,'err'); }
  }

  if (typeof deps.renderWorkingCopyBanner === 'function') deps.renderWorkingCopyBanner();
  if (typeof deps.renderRolePlannerHeader === 'function') deps.renderRolePlannerHeader(rk);
  if (typeof deps.renderRoleComposition  === 'function') deps.renderRoleComposition(rk);
  if (typeof deps.updateRoleRemaining    === 'function') deps.updateRoleRemaining(rk);
  if (typeof deps.renderHistory          === 'function') deps.renderHistory();
}

function discardWorkingDraft(key, deps) {
  if (typeof deps.showDiscardConfirmModal === 'function') {
    deps.showDiscardConfirmModal(key, function(confirmed){
      if (!confirmed) return;
      _doDiscardWorkingDraft(key, deps);
    });
  } else {
    _doDiscardWorkingDraft(key, deps);
  }
}
function _doDiscardWorkingDraft(key, deps) {
  delete deps.state.getWorkingDrafts()[key];
  var history = deps.state.getHistory();
  var idx = history.findIndex(function(s){ return s && s.sprintId === key; });
  if (idx >= 0) {
    history[idx].hasWorkingCopy = false;
    deps.apiPost('history', { history: history }).catch(function(){});
  }
  deps.workingDraftsDeleteOnBackend(key);
  if (deps.state.getActiveWorkingDraftKey() === key) {
    deps.state.setActiveWorkingDraftKey(null);
    if (typeof deps.hideWorkingCopyBanner === 'function') deps.hideWorkingCopyBanner();
    /* Перезагрузить активный спринт */
    deps.apiGet('sprint-data').then(function(r){
      if (r && r.success) {
        var sp = r.sprint || null;
        deps.state.setSprint(sp);
        deps.state.setRoleItems(r.roleItems || {});
        /* v5.9.0 — D59: orphans из backend. */
        if (sp && Array.isArray(r.orphanGanttIssues) && r.orphanGanttIssues.length) {
          sp._orphanGanttIssues = r.orphanGanttIssues;
        }
        if (typeof deps.renderPlannerRoles === 'function') deps.renderPlannerRoles();
      }
    }).catch(function(){});
  }
  if (typeof deps.renderHistory === 'function') deps.renderHistory();
  try { deps.toast(deps.t('wcDiscardedToast'), 'info'); } catch(_){}
}

/* Commit working copy → overwrite базового snap + revisions[].
   Уровень ре-валидации применяется к статусу. */
function _commitWorkingCopy(rk, idx, draft, snapFromCurrent, deps) {
  var history = deps.state.getHistory();
  var baseSnap = history[idx];
  if (!baseSnap) return Promise.resolve();   /* v3.2.1 — вызывающие чейнят .catch */
  var level = deps.computeRequiredRevalidationLevel(baseSnap, draft);
  var newStatus = deps.applyRevalidationLevel(baseSnap.status, level);
  deps.diag('[COMMIT-WC] role='+rk+' baseStatus='+baseSnap.status+' level='+level+' newStatus='+newStatus+' snapFromStatus='+(snapFromCurrent&&snapFromCurrent.status), 'info');
  var currentUser = deps.state.getCurrentUser();
  var finalSnap = snapFromCurrent;
  finalSnap.status = newStatus;
  if (level !== 'NONE' && level !== 'META_ONLY') {
    finalSnap.confirmedAt = Date.now();
    finalSnap.confirmedBy = (currentUser && (currentUser.fullName || currentUser.login)) || baseSnap.confirmedBy || '';
  } else {
    finalSnap.confirmedAt = baseSnap.confirmedAt;
    finalSnap.confirmedBy = baseSnap.confirmedBy;
  }
  /* v1.8.1 — не записывать revision с level='NONE' (no-op commit без реальных изменений).
     Ранее: при closing working copy без правок level='NONE' приводил к invalid_history_structure
     (backend whitelist его отвергал). Теперь добавляем revision ТОЛЬКО для значимых уровней. */
  var newRevisions = (baseSnap.revisions || []).slice();
  if (level !== 'NONE') {
    newRevisions.push({
      at:    Date.now(),
      by:    (currentUser && currentUser.login) || '',
      level: level
    });
  }
  finalSnap.revisions = newRevisions.slice(-200);  /* лимит 200 ревизий — защита от runaway */
  finalSnap.hasWorkingCopy = false;
  if (baseSnap.finishedAt) finalSnap.finishedAt = baseSnap.finishedAt;
  if (baseSnap.finishedBy) finalSnap.finishedBy = baseSnap.finishedBy;

  history[idx] = finalSnap;

  /* v3.2.1 — рабочая копия уничтожается ТОЛЬКО после подтверждённого POST: раньше
     драфт удалялся (локально + backend) ДО записи, и отказ persist'а
     (history_data_too_large / 403 / сеть) молча терял все правки WC навсегда. */
  return deps.apiPost('history', { history: history }).then(function(){
    delete deps.state.getWorkingDrafts()[draft.key];
    deps.workingDraftsScheduleFlush();
    deps.workingDraftsDeleteOnBackend(draft.key);
    deps.state.setActiveWorkingDraftKey(null);
    if (typeof deps.hideWorkingCopyBanner === 'function') deps.hideWorkingCopyBanner();
    if (typeof deps.renderHistory === 'function') deps.renderHistory();
    if (typeof deps.renderRoleComposition === 'function') deps.renderRoleComposition(rk);
    /* v1.8.1 — после commit working copy шапка должна пересчитаться, иначе
       бейдж в main-виджете висит на старом статусе (например "Черновик"), даже
       когда таблица истории уже показывает новый (CONFIRMED/ALLOCATED). */
    if (typeof deps.renderWidgetHeader === 'function') {
      try { deps.renderWidgetHeader(); } catch(_){}
    }
    try {
      var statusLabelKey = 'status_' + newStatus;
      var levelKey       = 'wcLevel_' + level;
      deps.toast(deps.t('wcRevalidatedToast').replace('{status}', deps.t(statusLabelKey)).replace('{level}', deps.t(levelKey)),
            level === 'CONFIRMED_REVAL' ? 'warn' : 'info');
    } catch(_){}
  }).catch(function(e){
    /* Откат локальной подмены: база прежняя, WC жива — пользователь может повторить. */
    history[idx] = baseSnap;
    var msg = (e && e.message) ? e.message : String(e);
    deps.diag('[COMMIT-WC] persist failed, WC сохранена: ' + msg, 'err');
    try { deps.toast(deps.t('toastError') + msg, 'err'); } catch(_){}
    throw e;
  });
}

function restoreDraftIfAny(deps) {
  var meta = deps.draftGet('meta');
  if (!meta) { deps.diag('draft: no meta in localStorage','info'); return; }
  deps.diag('draft: meta found, savedAt='+meta.savedAt+' version='+meta.version+' baseRevHash='+meta.baseRevHash, 'info');
  if (meta.version !== deps.draftVersion) {
    deps.diag('draft: schema version mismatch, ignoring', 'info');
    return;
  }
  var dirty = deps.draftGet('dirty') || {};
  var hasAny = !!(dirty.sprint || dirty.roleItems || dirty.currentRole);
  deps.diag('draft: dirty='+JSON.stringify(dirty)+' hasAny='+hasAny, 'info');
  if (!hasAny) return;
  /* Конфликт: серверная версия изменилась — не накатываем черновик, чтобы не затереть чужие правки.
     v3.12.0 — переходное двойное сравнение: черновик, сохранённый ДО канонизации
     computeRevHash (key-order), сверяется и с legacy-форматом — апгрейд не сбрасывает
     живые черновики. Legacy-ветку убрать через 1–2 минора. */
  var baseRevHash = deps.state.getBaseRevHash();
  var legacyHash = (typeof deps.computeRevHashLegacy === 'function') ? deps.computeRevHashLegacy() : null;
  if (meta.baseRevHash && meta.baseRevHash !== baseRevHash
      && (!legacyHash || meta.baseRevHash !== legacyHash)) {
    try { deps.toast(deps.t('toastDraftStale'), 'warn'); } catch(_){}
    deps.markClean('sprint'); deps.markClean('roleItems'); deps.markClean('currentRole');
    deps.diag('draft: stale, skipping restore (serverHash='+baseRevHash+', draftBase='+meta.baseRevHash+')', 'info');
    return;
  }
  deps.state.setDraftRestoreInProgress(true);
  try {
    if (dirty.sprint) {
      var d = deps.draftGet('sprint');
      if (d && typeof d === 'object') deps.state.setSprint(d);
    }
    if (dirty.roleItems) {
      var dr = deps.draftGet('roleItems');
      if (dr && typeof dr === 'object') deps.state.setRoleItems(dr);
    }
    if (dirty.currentRole) {
      var dd = deps.draftGet('currentRole');
      if (dd && typeof dd === 'object') {
        deps.state.setCurrentRolePP(dd.pp || null);
        deps.state.setCurrentRoleGantt(dd.gantt || null);
        if (dd.nkcKey) deps.state.setCurrentRoleNkcKey(dd.nkcKey);
        /* _currentSprintRoleRec восстанавливается через ui.distribSprintId в restoreUiState */
      }
    }
    var ts;
    try { ts = new Date(meta.savedAt).toLocaleString(deps.state.getLang() === 'en' ? 'en-US' : 'ru-RU'); }
    catch(_) { ts = String(meta.savedAt); }
    try { deps.toast(deps.t('toastDraftRestored').replace('{ts}', ts), 'info'); } catch(_){}
    deps.diag('draft: restored sections '+JSON.stringify(dirty), 'ok');
  } finally {
    deps.state.setDraftRestoreInProgress(false);
  }
}

/* Билдер per-role history-снимка рабочего состава роли — вынесен из saveRoleHistorySnapshot
   для переиспользования в snapshotPlanningRolesToHistory (снимок всех ролей при switch). */
function buildRoleSnap(rk, goalFields, wasValidated, deps) {
  var role = deps.allRoles.find(function(r){ return r.key === rk; });
  var sprint = deps.state.getSprint();
  if (!role || !sprint) return null;
  var items = deps.getRoleItemsArr(rk);
  var activeItems = items.filter(function(i){ return deps.activeInc.indexOf(i.inclusionStatus) >= 0; });
  var rem = deps.calcRemForRole(rk);
  var isOverLimit = rem < 0;
  var history = deps.state.getHistory();
  var currentUser = deps.state.getCurrentUser();

  /* v1.9.3 D134 — Etap О.1 fix: per-role status в snapshot, не глобальный _sprint.status.
     До v1.9.3 snapshot ЛЮБОЙ роли получал status = _sprint.status. После
     doValidateRole(rk1) → _sprint.status = CONFIRMED, и при ближайшем save другой
     роли rk2 (refresh / save header / commit working copy / etc.) её snapshot
     получал status = CONFIRMED — хотя rk2 не валидировалась. Контаминация была
     визуально скрыта v1.8.1 фиксом renderRoleStatusBadge (читает per-role из
     _history), но снимок в _history оставался поражённым → History spoiler и
     Excel export показывали неверный статус.

     Cherry-pick из proprietary v7.3.1 Этап О.1: добавлен параметр wasValidated
     (true только при вызове из doValidateRole), статус резолвится per-role:
       - wasValidated=true → CONFIRMED (single source of truth для validate)
       - иначе → existing snap.status из _history (preserve) ИЛИ PLANNING для нового
     Архитектурно правильное решение (deep refactor на _sprint.statusByRole[rk])
     отложено; quick fix через explicit param достаточен для всех known call-sites. */
  var resolvedStatus;
  if (wasValidated === true) {
    resolvedStatus = deps.status.CONFIRMED;
  } else {
    var existingSnap = history.find(function(s){ return s && s.sprintId === (sprint.sprintId + '_' + rk); });
    resolvedStatus = (existingSnap && existingSnap.status) ? existingSnap.status : deps.status.PLANNING;
  }
  var snap = {
    sprintId:     sprint.sprintId + '_' + rk,
    roleKey:      rk,
    roleLabel:    role.label,
    dateStart:    sprint.dateStart,
    dateEnd:      sprint.dateEnd,
    name:         sprint.name || null,
    status:       resolvedStatus,
    confirmedAt:  Date.now(),
    confirmedBy:  currentUser ? (currentUser.fullName || currentUser.login) : null,
    isOverLimit:  isOverLimit,
    settings:     deps.state.getSettings(),
    sprintFieldVal:   sprint.sprintFieldVal || null,
    versionFieldVal:  sprint.versionFieldVal || null,
  };
  snap[role.resKey] = sprint[role.resKey] || 0;
  snap[role.remKey] = rem;
  snap.items = items.map(function(i) {
    var obj = {
      issueId:  i.issueId,
      url:      i.url,
      title:    i.title,
      priority: i.priority,
      xpriority:i.xpriority,
      state:    i.state,
      system:   i.system,
      inclusionStatus: i.inclusionStatus,
    };
    /* v1.8.0 D130 — Etap В.2 — фиксируем externalTicketId в snapshot.
       Раньше поле не копировалось в snap.items, поэтому история не содержала
       значений нового поля даже когда оно было задано на live item. */
    if (i.externalTicketId !== undefined && i.externalTicketId !== null && i.externalTicketId !== '') {
      obj.externalTicketId = i.externalTicketId;
    }
    obj['estimate_'+rk] = i['estimate_'+rk];
    obj['fact_'+rk]     = i['fact_'+rk];
    obj['alloc_'+rk]    = i['alloc_'+rk] !== undefined ? i['alloc_'+rk] : null;
    return obj;
  });
  // v6.1.0 D69 — сохранять только personalPlanning. Поле `gantt` удалено из snap-whitelist
  // в v5.9.0 (D60); запись `snap.gantt` ломала validateHistory → invalid_history_structure
  // → каскад #4/#6/#7/#10 в v6.0.0 testbench. Источник истины для назначений и дат —
  // personalPlanning[*].taskAssignments[issueId].{assignee,startDate,endDate}.
  /* #49 — snap.personalPlanning = SINGLE PP роли rk (канон per-role). Fallback больше НЕ берёт
     sprint.personalPlanning: с #49 это keyed-map {[rk]: PP} (serialization-зеркало), запись её
     в per-role снимок испортила бы канон. Вне active-current роли — берём существующую канон-запись
     роли (preserve), иначе null.
     #56-7 — _currentRolePP берём ТОЛЬКО если это PP именно роли rk: раньше снап ЧУЖОЙ роли
     (перебор ролей в snapshotPlanningRolesToHistory при активной другой подвкладке) получал
     PP текущей роли целиком → назначения исполнителей «переезжали» между ролями в каноне
     истории, реконструкция затирала их крест-накрест (HAR прод-бага: analysis↔devPlatform). */
  var _existingSnapForRk = deps.state.getHistory().find(function (s) {
    return s && s.sprintId === (sprint.sprintId + '_' + rk);
  });
  var _curRec = deps.state.getCurrentSprintRoleRec();
  var _curPP  = deps.state.getCurrentRolePP();
  var _curPPisForRk = !!(_curPP && _curRec && deps.isActiveSprintRecord(_curRec)
    && (_curRec.roleKey === rk || String(_curRec.sprintId || '') === (sprint.sprintId + '_' + rk)));
  var ppToSnap    = _curPPisForRk
    ? _curPP
    : ((_existingSnapForRk && _existingSnapForRk.personalPlanning) || null);
  snap.personalPlanning = deps.deepClone(ppToSnap);
  /* v1.9.0 D132 — Freeze sprint goal + inject outcome/retro from confirm dialog. */
  if (sprint.sprintGoal) snap.sprintGoal = sprint.sprintGoal;
  if (goalFields) {
    if (goalFields.goalOutcome)  snap.goalOutcome  = goalFields.goalOutcome;
    if (goalFields.goalRetroNote) snap.goalRetroNote = goalFields.goalRetroNote;
  }
  return snap;
}

function saveRoleHistorySnapshot(rk, overrideIdx, goalFields, wasValidated, deps) {
  var snap = buildRoleSnap(rk, goalFields, wasValidated, deps);
  if (!snap) return Promise.resolve();
  var history = deps.state.getHistory();

  /* v5.3.0 — Если активна working copy на этот ключ — commit-flow с ре-валидацией.
     Иначе — обычный insert/overwrite. Legacy ветка editingFromHistory удалена. */
  var snapKey = snap.sprintId;
  var workingDrafts = deps.state.getWorkingDrafts();
  if (overrideIdx === undefined && deps.state.getActiveWorkingDraftKey() === snapKey && workingDrafts[snapKey]) {
    var draft = workingDrafts[snapKey];
    var commitIdx = history.findIndex(function(h){ return h.sprintId === snapKey; });
    if (commitIdx >= 0) {
      var baseSnap = history[commitIdx];
      /* Conflict detection: hash базового снимка изменился? */
      var currentHash = deps.computeBaseSnapshotHash(baseSnap);
      if (draft.baseSnapshotHash && currentHash !== draft.baseSnapshotHash) {
        if (typeof deps.showWorkingCopyConflictModal === 'function') {
          deps.showWorkingCopyConflictModal(snapKey, baseSnap, snap, function(decision){
            if (decision === 'overwrite') {
              /* v3.2.1 — тост об ошибке показывает сам commit; глушим rejection. */
              _commitWorkingCopy(rk, commitIdx, draft, snap, deps).catch(function(){});
            } else if (decision === 'export' && typeof deps.exportConflictToExcel === 'function') {
              /* v5.7.0 — KL#5: один xlsx с двумя листами + diff-маркер. */
              deps.exportConflictToExcel(baseSnap, snap);
            }
            /* 'cancel' → ничего */
          });
          return Promise.resolve();
        }
      }
      return _commitWorkingCopy(rk, commitIdx, draft, snap, deps);
    }
    /* Орфан: working copy без базового снимка — fallback на обычный insert */
    deps.diag('saveRoleHistorySnapshot: working copy without base snap, fallback to insert', 'warn');
  }
  var idx = -1;
  if (overrideIdx !== undefined) {
    idx = overrideIdx;
  } else {
    idx = history.findIndex(function(h){ return h.sprintId === snap.sprintId; });
  }
  if (idx >= 0) history[idx] = snap; else history.unshift(snap);
  /* #67 H5-editor — узкая ветка ?action=snapshot (upsert одной записи по sprintId,
     editor∨validator) вместо full-replace POST /history (validator): авто-снапшот у
     редактора-без-validator больше не 403-ится молча, а серверный upsert атомарнее
     read-modify-full-replace (класс R6 / P1 #11). Локальный upsert выше — зеркало UI. */
  return deps.apiPost('history', { history: [snap] }, { action: 'snapshot' }).then(function() {
    deps.renderHistory();
  });
}

/* Сброс всего состава рабочего спринта в историю (per-role, один POST). Чинит потерю состава
   при переключении между двумя PLANNING-спринтами одного проекта: общий рабочий слот
   ssp_roleitems перезаписывается при switch, а loadUnfinishedSprintAsWorking реконструирует
   из истории — куда роль попадала только на confirm. Снимок безопасен: buildRoleSnap сохраняет
   per-role статус существующих записей (ALLOCATED/CONFIRMED не сбрасывается в PLANNING). */
function snapshotPlanningRolesToHistory(deps, newId) {
  var st = deps.state;
  var sprint = st.getSprint();
  var history = st.getHistory();
  if (!sprint || !sprint.sprintId || !Array.isArray(history)) return Promise.resolve();
  if (sprint.sprintId === newId) return Promise.resolve();              // не уходим — тот же спринт
  if (sprint.status !== deps.status.PLANNING) return Promise.resolve(); // только PLANNING (ALLOCATED/CONFIRMED — WC-путь)
  var roles = (typeof deps.getActiveRoles === 'function') ? deps.getActiveRoles() : deps.allRoles;
  var snaps = [];
  roles.forEach(function(r){
    var snap = buildRoleSnap(r.key, undefined, false, deps);
    if (!snap) return;
    var idx = history.findIndex(function(h){ return h && h.sprintId === snap.sprintId; });
    if (idx >= 0) history[idx] = snap; else history.unshift(snap);
    snaps.push(snap);
  });
  if (!snaps.length) return Promise.resolve();
  /* #67 H5-editor — тот же пассивный авто-путь, что saveRoleHistorySnapshot (переключение
     PLANNING-спринтов — действие редактора): full-replace шёл под validator и молча
     403-ился у editor-без-validator. Per-role ?action=snapshot, ПОСЛЕДОВАТЕЛЬНО:
     каждый POST бампает rev слота, параллельные ловили бы 409 друг о друга (baseRev
     обновляется в сторе из ответа — youtrack-api). */
  var chain = Promise.resolve();
  snaps.forEach(function(snap){
    chain = chain.then(function(){
      return deps.apiPost('history', { history: [snap] }, { action: 'snapshot' });
    });
  });
  return chain.then(function(){
    if (typeof deps.renderHistory === 'function') { try { deps.renderHistory(); } catch(_){} }
  });
}

const api = {
  createWorkingDraftFromSnapshot,
  resumeWorkingDraft,
  discardWorkingDraft,
  _doDiscardWorkingDraft,
  _commitWorkingCopy,
  restoreDraftIfAny,
  saveRoleHistorySnapshot,
  snapshotPlanningRolesToHistory,
};

if (typeof window !== 'undefined') {
  try { window.__SSP_WORKING_COPY = api; } catch (_) { /* sandboxed write may throw */ }
}

module.exports = api;
