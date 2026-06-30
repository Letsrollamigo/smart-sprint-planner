/**
 * sprint-controller.js — контроллеры спринт-CRUD (Фаза 5 слайс 6, домен E1-sprint,
 * последний подслайс E1). Мост window.__SSP_SPRINT_CTRL.
 *
 * Кластер с МАКСИМАЛЬНЫМ числом внешних callers всего E1 — поэтому выносится последним:
 *   • markSavedAndCleanup — снятие dirty + обновление _serverSnapshot-снимков + кэша
 *     черновика после успешного apiPost (golden-вход youtrack-api: _ytApiDeps его зовёт);
 *   • saveCurrentRoleState — персист personalPlanning/gantt текущей роли (макс. callers
 *     всего проекта: currentrole-view ×7, standup-view, refresh-controller late-binding);
 *   • refreshPlanningPeopleForCurrentSprint — context-loader вкладки «Люди» (отложен из
 *     слайса 5; ПИШЕТ _currentSprintRoleRec/_currentRolePP/_currentRoleGantt/_activeSubtab);
 *   • doSaveRoleHeader / doSaveSprintIntro — сохранение вводных данных спринта;
 *   • doNewSprint — создание/переиспользование черновика нового спринта;
 *   • setCurrentSprintId — D28-флоу смены спринта (WC-protection + каскад ре-рендера).
 *
 * Паттерн (слайсы 2–5): deps-фабрика per-call (_sprintDeps в монолите). Стейт зоны
 * (_currentSprintId/_sprint/_roleItems/_serverSnapshot-снимки/_currentRole-стейт/
 * _activeSubtab/_activeWorkingDraftKey/_history/_baseRevHash) ОСТАЁТСЯ в стейт-ядре
 * монолита за get/set-аксессорами deps.state — его трогают gm-хук голденов, другие
 * контроллеры и ресет per-project. Делегаторы выживают у всех 7 (внешние callers +
 * golden-входы). Внутренние хелперы _clearFieldErrors/_showFieldError приватны
 * соответствующим функциям (нативная вложенность сохранена — точная семантика).
 *
 * Контракты — sprint.golden.test.js (идут через делегаторы монолита).
 */
(function () {
  'use strict';

  /* ── markSavedAndCleanup — снять dirty + snapshot + кэш черновика после apiPost ── */
  function markSavedAndCleanup(section, deps) {
    var st = deps.state;
    deps.markClean(section);
    if (section === 'sprint') {
      var sp = st.getSprint();
      st.setServerSnapshotSprint(sp ? deps.deepClone(sp) : null);
      deps.draftSet('sprint', sp);
    }
    if (section === 'roleItems') {
      var ri = st.getRoleItems();
      st.setServerSnapshotRoleItems(ri ? deps.deepClone(ri) : null);
      deps.draftSet('roleItems', ri);
    }
    if (section === 'currentRole') {
      var pp = st.getCurrentRolePP();
      var gantt = st.getCurrentRoleGantt();
      var rec = st.getCurrentSprintRoleRec();
      st.setServerSnapshotCurrentRolePP(pp ? deps.deepClone(pp) : null);
      st.setServerSnapshotCurrentRoleGantt(gantt ? deps.deepClone(gantt) : null);
      deps.draftSet('currentRole', { pp: pp, gantt: gantt, nkcKey: st.getCurrentRoleNkcKey(),
                              sprintRecKey: rec ? rec.sprintId : null });
    }
    var revHash = deps.computeRevHash(st.getSprint(), st.getRoleItems());
    st.setBaseRevHash(revHash);
    deps.draftSet('meta', { savedAt: Date.now(), version: deps.DRAFT_VERSION, baseRevHash: revHash });
    deps.refreshDirtyIndicator();
    /* Перерисовать активную таблицу состава, чтобы снять подсветку tr--dirty-row */
    var activeSubtab = st.getActiveSubtab();
    if (activeSubtab && typeof deps.renderRoleComposition === 'function') {
      try { deps.renderRoleComposition(activeSubtab); } catch(_){}
    }
  }

  /* ── saveCurrentRoleState — персист personalPlanning / gantt текущей роли ── */
  function saveCurrentRoleState(deps) {
    var st = deps.state;
    var diag = deps.diag;
    var apiPost = deps.apiPost;
    var rec = st.getCurrentSprintRoleRec();
    if (!rec) return;
    /* v5.0.3 — отметить dirty и запушить в backend draft debounce'ом */
    deps.markDirty('currentRole');
    deps.draftSaveDebounced('currentRole', function(){
      return { pp: st.getCurrentRolePP(), gantt: st.getCurrentRoleGantt(), nkcKey: st.getCurrentRoleNkcKey(),
               sprintRecKey: st.getCurrentSprintRoleRec() ? st.getCurrentSprintRoleRec().sprintId : null };
    });
    /* v6.3.0 D109 — после изменений на «Распределение по исполнителям» обновлять
       summary в шапке (currentRoleTotalResource/Remain) + accordion-карточку этой роли
       на подвкладке «Аллокация общего ресурса», чтобы цифры там не отставали. */
    try {
      if (typeof deps.updateCurrentRoleTotals === 'function') deps.updateCurrentRoleTotals();
      var _rkForStats = rec && rec.roleKey;
      if (_rkForStats && typeof deps.updateRoleAccordionStats === 'function') {
        deps.updateRoleAccordionStats(_rkForStats);
      }
    } catch(e){ diag('saveCurrentRoleState stats refresh err: '+e,'err'); }

    /* v6.1.0 D82 (F5) — assigner-роль (variant b): assigner НЕ имеет editor-прав, поэтому
       обычные POST /history и POST /sprint-data вернут 403. Используем action=assignerSync —
       backend перезапишет ТОЛЬКО personalPlanning в существующих записях. */
    var assignerOnly = !st.getIsEditor() && st.getIsAssigner();

    /* v5.0.3 — теперь все варианты — записи истории. Обновляем запись в _history.
       Если запись соответствует активному _sprint — также обновляем _sprint.personalPlanning. */
    var history = st.getHistory();
    var pp = st.getCurrentRolePP();
    var histRec = history.find(function(r){ return r.sprintId === rec.sprintId; });
    if (histRec) {
      histRec.personalPlanning = deps.deepClone(pp);
    }
    if (assignerOnly) {
      var minimalHistory = histRec
        ? [{ sprintId: histRec.sprintId, personalPlanning: deps.deepClone(pp) }]
        : [];
      apiPost('history', { history: minimalHistory }, { action: 'assignerSync' })
        .catch(function (e) { diag('saveCurrentRoleState(history,assignerSync) failed: ' + e, 'err'); });
    } else {
      apiPost('history', { history: history })
        .catch(function (e) { diag('saveCurrentRoleState(history) failed: ' + e, 'err'); });
    }

    if (deps.isActiveSprintRecord(rec)) {
      var sprint = st.getSprint();
      /* #49 — `_sprint.personalPlanning` = serialization-зеркало, derived keyed-map из канона
         (histRec уже обновлён current-role pp выше). Не single-объект (был регрессор: затирал
         мапу формой одной роли). buildPPMapFromCanon собирает {[rk]: PP} из per-role записей. */
      sprint.personalPlanning = deps.buildPPMapFromCanon(sprint.sprintId, history, deps.deepClone);
      if (assignerOnly) {
        apiPost('sprint-data', { sprint: { personalPlanning: deps.buildPPMapFromCanon(sprint.sprintId, history, deps.deepClone) } }, { action: 'assignerSync' })
          .catch(function (e) { diag('saveCurrentRoleState(sprint,assignerSync) failed: ' + e, 'err'); });
      } else {
        apiPost('sprint-data', { sprint: sprint })
          .then(function () {
            var settings = st.getSettings();
            if (settings && settings.personalPlanningEnabled && settings.usePersonalForResource && typeof deps.applyPersonalResourceToInputs === 'function') {
              deps.applyPersonalResourceToInputs();
            }
          })
          .catch(function (e) { diag('saveCurrentRoleState(active-sync) failed: ' + e, 'err'); });
      }
    }
  }

  /* ── refreshPlanningPeopleForCurrentSprint — context-loader вкладки «Люди» ── */
  function refreshPlanningPeopleForCurrentSprint(roleKey, deps) {
    var st = deps.state;
    var T = deps.T;
    var diag = deps.diag;
    var deepClone = deps.deepClone;
    var sel = document.getElementById('planningRoleSel');
    if (!sel) return;
    if (!sel.options.length) deps.populatePlanningRoleSel();
    /* v6.1.0 D73 — fallback на активную роль из «Ролей» / последнюю активную, чтобы
       при переключении уровня «Роли» → «Люди» dropdown #planningRoleSel автоматически
       подтягивал текущую роль и _currentSprintRoleRec не оставался пустым (баг #8). */
    var rk = roleKey || sel.value || st.getActiveSubtab() || deps.safeLs.get('ssp_lastActiveRole') || '';
    if (rk && sel.value !== rk) sel.value = rk;
    if (!rk) return;
    deps.safeLs.set('ssp_lastActiveRole', rk);
    var noSprintEl = document.getElementById('planningPeopleNoSprint');
    var emptyEl    = document.getElementById('planningPeopleEmpty');
    var contentEl  = document.getElementById('planningPeopleContent');
    if (!st.getCurrentSprintId()) {
      if (noSprintEl) noSprintEl.classList.remove('hidden');
      if (emptyEl)    emptyEl.classList.add('hidden');
      if (contentEl)  contentEl.classList.add('hidden');
      st.setCurrentSprintRoleRec(null); st.setCurrentRolePP(null); st.setCurrentRoleGantt(null);
      return;
    }
    if (noSprintEl) noSprintEl.classList.add('hidden');
    var role = deps.ALL_ROLES.find(function(r){ return r.key === rk; });
    var roleName = role ? ((typeof deps.roleLabel === 'function') ? deps.roleLabel(role) : (role.label || rk)) : rk;
    var pp = deps.getPersonalPlanningForCurrent(rk);
    var hasPP = pp && pp.resourcesByAssignee && Object.keys(pp.resourcesByAssignee).length > 0;
    if (!hasPP) {
      if (emptyEl) {
        emptyEl.classList.remove('hidden');
        var titleEl = document.getElementById('planningPeopleEmptyTitle');
        if (titleEl) titleEl.textContent = T('planningPeopleEmptyTitleTpl').replace('{role}', roleName);
      }
      if (contentEl) contentEl.classList.add('hidden');
      /* НЕ сбрасываем _currentSprintRoleRec — пользователь может ткнуть CTA, который вызовет doCurrentRoleCalc.
         doCurrentRoleCalc проверяет _currentSprintRoleRec на null и берёт его из _findHistRecForCurrent(rk). */
      var emptyRec = deps.findHistRecForCurrent(rk);
      /* S1-фикс (кластер-баг спринтов): свежая роль активного спринта ещё не имеет
         histRec → emptyRec=null → _currentSprintRoleRec=null → doCurrentRoleCalc и
         «Подобрать исполнителей» упирались в guard «Выберите спринт», хотя спринт выбран.
         Синтезируем минимальный rec с тем же ключом, что построит будущий histRec
         (saveRoleHistorySnapshot: _sprint.sprintId+'_'+rk). Только для активного _sprint:
         планирование «Люди» исторического спринта по-прежнему идёт через рабочую копию. */
      if (!emptyRec) {
        var _curSid = st.getCurrentSprintId();
        var _activeSprint = st.getSprint();
        if (_curSid && _activeSprint && _activeSprint.sprintId === _curSid) {
          emptyRec = { sprintId: _curSid + '_' + rk, roleKey: rk };
        }
      }
      st.setCurrentSprintRoleRec(emptyRec);
      st.setCurrentRolePP((emptyRec && emptyRec.personalPlanning) ? deepClone(emptyRec.personalPlanning) : (typeof deps.emptyPP === 'function' ? deps.emptyPP() : { resourcesByAssignee:{}, taskAssignments:{} }));
      st.setCurrentRoleGantt((emptyRec && emptyRec.gantt) ? deepClone(emptyRec.gantt) : { tasks:{}, updatedAt:null });
      st.setActiveSubtab(rk);
      deps.renderOrphanGanttBanner(emptyRec); /* v5.7.0 — Этап 5 */
      return;
    }
    if (emptyEl) emptyEl.classList.add('hidden');
    if (contentEl) contentEl.classList.remove('hidden');
    /* Контекст для render-функций (читают из _currentRole*; v5.10.0 — ранее _distrib*) */
    var fullRec = deps.findHistRecForCurrent(rk);
    st.setCurrentSprintRoleRec(fullRec);
    var fullPP = deepClone(pp);
    st.setCurrentRolePP(fullPP);
    st.setCurrentRoleGantt((fullRec && fullRec.gantt) ? deepClone(fullRec.gantt) : { tasks:{}, updatedAt:null });
    st.setCurrentRoleNkcKey((fullPP.nkcKey) || st.getCurrentRoleNkcKey() || 'other');
    var nkcSel = document.getElementById('currentRoleNkcSel');
    if (nkcSel && nkcSel.querySelector('option[value="'+st.getCurrentRoleNkcKey()+'"]')) {
      nkcSel.value = st.getCurrentRoleNkcKey();
    }
    st.setActiveSubtab(rk);
    if (typeof deps.renderCurrentRoleAssigneeTable === 'function') {
      try { deps.renderCurrentRoleAssigneeTable(); } catch(e){ diag('renderCurrentRoleAssigneeTable err: '+e,'err'); }
    }
    if (typeof deps.renderCurrentRoleTaskTable === 'function') {
      try { deps.renderCurrentRoleTaskTable(); } catch(e){ diag('renderCurrentRoleTaskTable err: '+e,'err'); }
    }
    if (typeof deps.updateCurrentRoleTotals === 'function') {
      try { deps.updateCurrentRoleTotals(); } catch(e){ diag('updateCurrentRoleTotals err: '+e,'err'); }
    }
    deps.renderResourceModeIndicator(rk, st.getCurrentRolePP());
    deps.renderOrphanGanttBanner(fullRec); /* v5.7.0 — Этап 5 */
    if (typeof deps.applyEditorRightsToUI === 'function') {
      try { deps.applyEditorRightsToUI(); } catch(_){}
    }
  }

  /* ── doSaveRoleHeader — сохранить параметры спринта для роли ── */
  function doSaveRoleHeader(rk, deps) {
    var st = deps.state;
    var T = deps.T;
    var toast = deps.toast;
    /* v1.8.2 — inline-error helper. Глобальный toast при validation попадает в position:fixed
       которое в YT-iframe иногда уходит за viewport главного окна (особенно при 2+ ролях
       когда контент длинный). Inline-error всегда рядом с проблемным полем + scrollIntoView. */
    function _clearFieldErrors() {
      ['sprintName','dateStart','dateEnd'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.classList.remove('field-err-input');
      });
      var en = document.getElementById('errName'); if (en) en.textContent = '';
      var ed = document.getElementById('errDate'); if (ed) ed.textContent = '';
    }
    function _showFieldError(fieldId, errSpanId, msgKey) {
      var fld = document.getElementById(fieldId);
      var err = document.getElementById(errSpanId);
      if (err) err.textContent = T(msgKey);
      if (fld) {
        fld.classList.add('field-err-input');
        try { fld.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch(_){}
        try { fld.focus(); } catch(_){}
      }
      /* Toast оставляем как дублирующий сигнал — но основной visual cue теперь inline. */
      toast(T(msgKey), 'warn');
    }
    _clearFieldErrors();
    var s = document.getElementById('dateStart').value;
    var e = document.getElementById('dateEnd').value;
    /* v1.6.2 D126 — обязательные поля: название + даты начала/окончания. */
    var nameVal = (document.getElementById('sprintName').value || '').trim();
    var draftName = T('newSprintDraftName');
    if (!nameVal || nameVal === draftName) {
      _showFieldError('sprintName', 'errName', 'toastSprintNameRequired');
      return;
    }
    if (!s) {
      _showFieldError('dateStart', 'errDate', 'toastSprintDateStartRequired');
      return;
    }
    if (!e) {
      _showFieldError('dateEnd', 'errDate', 'toastSprintDateEndRequired');
      return;
    }
    if (s && e && deps.fromDateIn(e) < deps.fromDateIn(s)) {
      _showFieldError('dateEnd', 'errDate', 'toastDateError');
      return;
    }
    _clearFieldErrors();
    var _sprint = st.getSprint();
    _sprint.name      = nameVal.substring(0,60);
    _sprint.dateStart = deps.fromDateIn(s);
    _sprint.dateEnd   = deps.fromDateIn(e);
    var role = deps.ALL_ROLES.find(function(r){ return r.key === rk; });
    if (role) {
      var resEl = document.getElementById('res_'+rk);
      if (resEl) _sprint[role.resKey] = deps.parsePeriod(resEl.value);
    }
    var ss = document.getElementById('sprintStatus_'+rk);
    if (_sprint.status !== deps.STATUS.CONFIRMED && _sprint.status !== deps.STATUS.ALLOCATED && ss) _sprint.status = ss.value;
    // Сохранить поля Спринт / Версия
    var sprintFv = document.getElementById('sprintFieldVal');
    var versionFv = document.getElementById('versionFieldVal');
    if (sprintFv) _sprint.sprintFieldVal = sprintFv.value || null;
    if (versionFv) _sprint.versionFieldVal = versionFv.value || null;
    /* v1.9.0 D132 — Сохранить sprint goal (shared field, same for all roles). */
    var _goalEl = document.getElementById('sprintGoal');
    var _goalVal = _goalEl ? (_goalEl.value || '').trim() : '';
    _sprint.sprintGoal = _goalVal || undefined;
    _sprint.updatedAt = Date.now();
    var _currentUser = st.getCurrentUser();
    _sprint.updatedBy = _currentUser ? _currentUser.login : null;

    var btn = document.getElementById('saveHeaderBtn_'+rk);
    /* v5.0.3 — пометить dirty + записать в localStorage. apiPost-успех снимет dirty. */
    deps.markDirty('sprint');
    deps.draftSet('sprint', _sprint);
    deps.draftSet('meta', { savedAt: Date.now(), version: deps.DRAFT_VERSION, baseRevHash: st.getBaseRevHash() });
    return deps.withLoader(btn, function() {
      return deps.apiPost('sprint-data', { sprint: _sprint }).then(function() {
        deps.updateRoleRemaining(rk);
        deps.renderRoleStatusBadge(rk);
        toast(T('toastSprintSaved'), 'success');
        /* v1.8.1 — селектор шапки виджета и бейдж статуса должны отразить новое имя/даты
           сразу после сохранения параметров. Раньше изменения подхватывались только после
           перезахода на вкладку. Дополнительно: убеждаемся что _currentSprintId указывает
           на _sprint.sprintId (для свежесозданного спринта). */
        if (_sprint && _sprint.sprintId && st.getCurrentSprintId() !== _sprint.sprintId) {
          st.setCurrentSprintId(_sprint.sprintId);
          var _uiNew = deps.draftGet('ui') || {}; _uiNew.currentSprintId = _sprint.sprintId; deps.draftSet('ui', _uiNew);
        }
        if (typeof deps.renderWidgetHeader === 'function') { try { deps.renderWidgetHeader(); } catch(_){} }
      }).catch(function(e) {
        toast(T('toastSaveError')+': '+(e&&e.message?e.message:e));
      });
    });
  }

  /* ── doSaveSprintIntro — сохранить общие поля «Вводных данных по спринту» ── */
  function doSaveSprintIntro(deps) {
    var st = deps.state;
    var T = deps.T;
    var toast = deps.toast;
    function _clearFieldErrors() {
      ['sprintName','dateStart','dateEnd'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.classList.remove('field-err-input');
      });
      var en = document.getElementById('errName'); if (en) en.textContent = '';
      var ed = document.getElementById('errDate'); if (ed) ed.textContent = '';
      var ei = document.getElementById('errSprintIntro'); if (ei) ei.textContent = '';
    }
    function _showFieldError(fieldId, errSpanId, msgKey) {
      var fld = document.getElementById(fieldId);
      var err = document.getElementById(errSpanId);
      if (err) err.textContent = T(msgKey);
      if (fld) {
        fld.classList.add('field-err-input');
        try { fld.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch(_){}
        try { fld.focus(); } catch(_){}
      }
      toast(T(msgKey), 'warn');
    }
    _clearFieldErrors();
    var s = document.getElementById('dateStart').value;
    var e = document.getElementById('dateEnd').value;
    var nameVal = (document.getElementById('sprintName').value || '').trim();
    var draftName = T('newSprintDraftName');
    if (!nameVal || nameVal === draftName) {
      _showFieldError('sprintName', 'errName', 'toastSprintNameRequired');
      return;
    }
    if (!s) {
      _showFieldError('dateStart', 'errDate', 'toastSprintDateStartRequired');
      return;
    }
    if (!e) {
      _showFieldError('dateEnd', 'errDate', 'toastSprintDateEndRequired');
      return;
    }
    if (s && e && deps.fromDateIn(e) < deps.fromDateIn(s)) {
      _showFieldError('dateEnd', 'errDate', 'toastDateError');
      return;
    }
    _clearFieldErrors();
    var _sprint = st.getSprint();
    _sprint.name      = nameVal.substring(0,60);
    _sprint.dateStart = deps.fromDateIn(s);
    _sprint.dateEnd   = deps.fromDateIn(e);
    var sprintFv  = document.getElementById('sprintFieldVal');
    var versionFv = document.getElementById('versionFieldVal');
    if (sprintFv)  _sprint.sprintFieldVal  = sprintFv.value  || null;
    if (versionFv) _sprint.versionFieldVal = versionFv.value || null;
    /* v1.9.0 D132 — Sprint goal: read + soft-warn if empty. */
    var _goalElI = document.getElementById('sprintGoal');
    var _goalValI = _goalElI ? (_goalElI.value || '').trim() : '';
    _sprint.sprintGoal = _goalValI || undefined;
    _sprint.updatedAt = Date.now();
    var _currentUser = st.getCurrentUser();
    _sprint.updatedBy = _currentUser ? _currentUser.login : null;

    var btn = document.getElementById('saveSprintIntroBtn');
    var origLabel = btn ? btn.textContent : null;
    if (btn) { btn.disabled = true; btn.textContent = T('toastSaving'); }
    deps.markDirty('sprint');
    deps.draftSet('sprint', _sprint);
    deps.draftSet('meta', { savedAt: Date.now(), version: deps.DRAFT_VERSION, baseRevHash: st.getBaseRevHash() });
    deps.apiPost('sprint-data', { sprint: _sprint }).then(function() {
      if (btn) { btn.disabled = false; btn.textContent = origLabel || T('btnSaveSprintIntro'); }
      toast(T('toastSprintSaved'), 'success');
      /* v1.9.0 D132 — Soft-warn если sprint goal не задан. */
      if (!_goalValI) { setTimeout(function(){ toast(T('toastSprintGoalMissing'), 'warn'); }, 400); }
      /* Sync header + currentSprintId (как в doSaveRoleHeader при new-sprint flow). */
      if (_sprint && _sprint.sprintId && st.getCurrentSprintId() !== _sprint.sprintId) {
        st.setCurrentSprintId(_sprint.sprintId);
        var _uiNew = deps.draftGet('ui') || {}; _uiNew.currentSprintId = _sprint.sprintId; deps.draftSet('ui', _uiNew);
      }
      if (typeof deps.renderWidgetHeader === 'function') { try { deps.renderWidgetHeader(); } catch(_){} }
    }).catch(function(err) {
      if (btn) { btn.disabled = false; btn.textContent = origLabel || T('btnSaveSprintIntro'); }
      toast(T('toastSaveError')+': '+(err&&err.message?err.message:err));
    });
  }

  /* ── doNewSprint — создание/переиспользование черновика нового спринта ── */
  function doNewSprint(rk, deps) {
    var st = deps.state;
    var T = deps.T;
    var STATUS = deps.STATUS;
    var draftName = T('newSprintDraftName');
    var _sprint = st.getSprint();
    var isActiveDraft = _sprint &&
      _sprint.status === STATUS.PLANNING &&
      (!_sprint.name || _sprint.name === draftName);

    if (isActiveDraft) {
      // Переиспользуем тот же sprintId, обнуляем поля черновика.
      _sprint.name = draftName;
      _sprint.dateStart = null;
      _sprint.dateEnd = null;
      deps.ALL_ROLES.forEach(function(r) { _sprint[r.resKey] = 0; });
    } else {
      _sprint = {
        sprintId: deps.uid(),
        name: draftName,
        dateStart: null, dateEnd: null,
        status: STATUS.PLANNING
      };
      deps.ALL_ROLES.forEach(function(r) { _sprint[r.resKey] = 0; });
      st.setSprint(_sprint);
    }
    st.setRoleItems({});
    var editBanner = document.getElementById('editHistBanner');
    if (editBanner) { editBanner.style.display = 'none'; editBanner.textContent = ''; }

    /* v1.8.1 — синхронизируем _currentSprintId на свежесозданный спринт, иначе
       селектор «Текущий спринт» в шапке виджета остаётся на предыдущем редактируемом. */
    if (_sprint && _sprint.sprintId) {
      st.setCurrentSprintId(_sprint.sprintId);
      var _uiNS = deps.draftGet('ui') || {}; _uiNS.currentSprintId = _sprint.sprintId; deps.draftSet('ui', _uiNS);
    }

    /* Переключаемся на Планирование → Роли (с любой вкладки). */
    var planBtn = document.querySelector('.tab-btn[data-tab="planning"]');
    if (planBtn && !planBtn.classList.contains('active')) planBtn.click();
    var rolesBtn = document.querySelector('.planning-level-btn[data-level="roles"]');
    if (rolesBtn) rolesBtn.click();

    var postData = { sprint: _sprint, roleItems: st.getRoleItems() };
    deps.apiPost('sprint-data', postData).then(function() {
      deps.getActiveRoles().forEach(function(r) {
        deps.renderRolePlannerHeader(r.key);
        deps.renderRoleComposition(r.key);
        deps.updateRoleRemaining(r.key);
      });
      if (typeof deps.renderWidgetHeader === 'function') {
        try { deps.renderWidgetHeader(); } catch(_){}
      }
      deps.toast(T('toastSprintCreated'), 'success');
      /* Фокус на поле названия — пользователь сразу видит, что нужно ввести. */
      setTimeout(function() {
        var nameEl = document.getElementById('sprintName');
        if (nameEl) { try { nameEl.focus(); nameEl.select(); } catch(_){} }
      }, 50);
    });
  }

  /* ── loadUnfinishedSprintAsWorking — «выбрал → редактирую» ──
     Незавершённый (все role-снапшоты PLANNING) спринт, выбранный в пикере и НЕ совпадающий
     с рабочим _sprint, грузим как рабочий: реконструируем _sprint (мета + ресурсы всех ролей)
     и _roleItems из per-role history-снапшотов <newId>_<rk>. PLANNING не залочен → working-copy
     не нужна, правки идут прямо в загруженный спринт. Так чинится рассинхрон, при котором состав
     рисовался из снапшота (historical), а pick/delete утекали в прежний _sprint (другой спринт).
     Возвращает true если загрузил; false (→ прежний read-only/WC-путь) для ALLOCATED/CONFIRMED/
     FINISHED, смешанного статуса ролей, отсутствия снапшотов или если спринт уже рабочий. */
  function loadUnfinishedSprintAsWorking(newId, deps) {
    var st = deps.state;
    if (!newId) return false;
    var _sprint = st.getSprint();
    if (_sprint && _sprint.sprintId === newId) return false; // уже рабочий
    var history = st.getHistory();
    if (!Array.isArray(history)) return false;
    var snaps = history.filter(function(h){
      return h && typeof h.sprintId === 'string' && h.sprintId.indexOf(newId + '_') === 0;
    });
    if (!snaps.length) return false;
    /* Консервативно: только полностью планируемый спринт (все role-снапшоты PLANNING).
       Смешанный/ALLOCATED оставляем прежнему пути (read-only / working copy под validator). */
    var allPlanning = snaps.every(function(s){ return s.status === deps.STATUS.PLANNING; });
    if (!allPlanning) return false;
    var meta = snaps[0];
    var sprint = {
      sprintId:        newId,
      name:            meta.name || null,
      dateStart:       meta.dateStart || null,
      dateEnd:         meta.dateEnd || null,
      status:          deps.STATUS.PLANNING,
      sprintGoal:      meta.sprintGoal,
      sprintFieldVal:  meta.sprintFieldVal || null,
      versionFieldVal: meta.versionFieldVal || null
    };
    var roleItems = {};
    deps.ALL_ROLES.forEach(function(r){
      var rs = null;
      for (var i = 0; i < snaps.length; i++) { if (snaps[i].roleKey === r.key) { rs = snaps[i]; break; } }
      if (r.resKey) sprint[r.resKey] = (rs && rs[r.resKey] != null) ? rs[r.resKey] : 0;
      roleItems[r.key] = (rs && Array.isArray(rs.items)) ? rs.items.map(function(it){
        var c = {}; Object.keys(it).forEach(function(k){ c[k] = it[k]; }); return c;
      }) : [];
    });
    try { sprint.personalPlanning = deps.buildPPMapFromCanon(newId, history, deps.deepClone); } catch(_){}
    st.setSprint(sprint);
    st.setRoleItems(roleItems);
    /* Синк active-slot на backend, чтобы он совпал с рабочим спринтом (как resumeWorkingDraft).
       Только для редактора — иначе viewer постил бы sprint-data на каждый выбор (backend отвергнет). */
    if (!st.getIsEditor || st.getIsEditor()) {
      deps.apiPost('sprint-data', { sprint: sprint, roleItems: roleItems }).catch(function(e){
        deps.diag('loadUnfinishedSprintAsWorking: sprint-data sync failed: ' + (e && e.message ? e.message : e), 'err');
      });
    }
    deps.diag('loadUnfinishedSprintAsWorking: ' + newId + ' loaded as working _sprint (' + snaps.length + ' role snaps)', 'info');
    return true;
  }

  /* ── setCurrentSprintId — D28-флоу смены спринта (WC-protection + каскад) ── */
  function setCurrentSprintId(newId, opts, deps) {
    var st = deps.state;
    var diag = deps.diag;
    opts = opts || {};
    if (newId === st.getCurrentSprintId()) return true;
    if (st.getActiveWorkingDraftKey() && !opts.confirmed) {
      deps.showCloseWorkingCopyModal(function(ok) {
        if (!ok) return; // селектор откатится в обработчике change
        st.setActiveWorkingDraftKey(null);
        setCurrentSprintId(newId, { confirmed: true }, deps);
      });
      return false;
    }
    /* Снимок уходящего PLANNING-спринта в историю до switch (иначе свежий подбор теряется: общий слот ssp_roleitems перезаписывается, switch реконструирует из истории). newId/PLANNING-гейт — внутри. */
    if (st.getSprint() && (!st.getIsEditor || st.getIsEditor())) { try { deps.snapshotPlanningRolesToHistory(newId); } catch(e){ diag('snapPlanningRoles err: '+e,'err'); } }
    /* «Выбрал → редактирую»: PLANNING грузим как рабочий _sprint (иначе pick/delete утекают в прежний). */
    try { loadUnfinishedSprintAsWorking(newId, deps); } catch(e){ diag('loadUnfinishedSprintAsWorking err: '+e,'err'); }
    st.setCurrentSprintId(newId || null);
    var ui = deps.draftGet('ui') || {}; ui.currentSprintId = st.getCurrentSprintId(); deps.draftSet('ui', ui);
    if (typeof deps.renderWidgetHeader === 'function') {
      try { deps.renderWidgetHeader(); } catch(e){ diag('renderWidgetHeader err: '+e,'err'); }
    }
    /* B20 (UX): WC-баннер живёт отдельно от шапки виджета — обновить после смены спринта,
       иначе при D28-закрытии рабочей копии баннер остаётся висеть. Идемпотентно (сам прячется при пустом ключе). */
    if (typeof deps.renderWorkingCopyBanner === 'function') {
      try { deps.renderWorkingCopyBanner(); } catch(e){ diag('renderWorkingCopyBanner err: '+e,'err'); }
    }
    /* Императивный re-render активной вкладки.
       v5.6.0 — Этап 4: legacy ветки 'planner' и 'distrib' удалены; добавлена 'gantt'. */
    var activeBtn = document.querySelector('.tab-btn.active');
    var activeTab = activeBtn ? activeBtn.dataset.tab : null;
    if (activeTab === 'planning') {
      try { deps.renderPlanningLevel(st.getPlanningLevel()); } catch(e){ diag('planning re-render err: '+e,'err'); }
      /* B9 fix v2.1.10 — read intro from selected sprint, not stale _sprint global.
         _sprint = working sprint only; not updated on dropdown switch.
         1. newId === _sprint.sprintId → use _sprint (in-flight edits, B8 preserved).
         2. else → first _history record for newId (shares name/dates/goal). */
      var introSrc = null;
      var _sprint = st.getSprint();
      var _history = st.getHistory();
      if (_sprint && _sprint.sprintId === newId) {
        introSrc = _sprint;
      } else if (Array.isArray(_history) && newId) {
        introSrc = _history.find(function(rec) {
          return rec && rec.sprintId && String(rec.sprintId).split('_')[0] === newId;
        });
      }
      if (introSrc) {
        var nameEl = document.getElementById('sprintName');
        if (nameEl) nameEl.value = introSrc.name || '';
        var dsEl = document.getElementById('dateStart');
        if (dsEl) dsEl.value = deps.toDateIn(introSrc.dateStart);
        var deEl = document.getElementById('dateEnd');
        if (deEl) deEl.value = deps.toDateIn(introSrc.dateEnd);
        var goalEl = document.getElementById('sprintGoal');
        if (goalEl) goalEl.value = introSrc.sprintGoal || '';
        if (typeof deps.renderSprintIntroExtras === 'function') { try { deps.renderSprintIntroExtras(); } catch(_){} }
      }
    } else if (activeTab === 'gantt') {
      try {
        var rkG = deps.safeLs.get('ssp_lastActiveRole')
               || ((typeof deps.getActiveRoles === 'function' && deps.getActiveRoles()[0]) ? deps.getActiveRoles()[0].key : null);
        if (typeof deps.refreshGanttForCurrentSprint === 'function') deps.refreshGanttForCurrentSprint(rkG);
      } catch(e){ diag('gantt re-render err: '+e,'err'); }
    } else if (activeTab === 'history') {
      try { deps.renderHistory(); } catch(e){ diag('renderHistory err: '+e,'err'); }
    }
    /* v5.5.0 — D34: применить hybrid-режим (read-only / editable) для нового _currentSprintId */
    try { deps.applyHybridSprintMode(st.getCurrentSprintId()); } catch(e){ diag('hybrid sprint mode err: '+e,'err'); }
    /* #36 — синк sprintId в URL + обновить кнопку «Поделиться» (enabled при наличии спринта) */
    try { deps.syncStateToUrl(); } catch(_){}
    try { deps.updateShareBtnState(); } catch(_){}
    return true;
  }

  var api = {
    markSavedAndCleanup: markSavedAndCleanup,
    saveCurrentRoleState: saveCurrentRoleState,
    refreshPlanningPeopleForCurrentSprint: refreshPlanningPeopleForCurrentSprint,
    doSaveRoleHeader: doSaveRoleHeader,
    doSaveSprintIntro: doSaveSprintIntro,
    doNewSprint: doNewSprint,
    setCurrentSprintId: setCurrentSprintId,
    loadUnfinishedSprintAsWorking: loadUnfinishedSprintAsWorking,
  };
  if (typeof window !== 'undefined') window.__SSP_SPRINT_CTRL = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
