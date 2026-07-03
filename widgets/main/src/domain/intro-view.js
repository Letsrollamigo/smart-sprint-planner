/**
 * intro-view.js — рендер «вводных» планировщика (Фаза 5, зачистка «прочих» — слайс 9).
 * Мост window.__SSP_INTRO_VIEW.
 *
 * Кластер «прочих» (RENDER-функции, оставшиеся после закрытия Тира D render-ядра):
 *   • renderSprintIntroExtras() — sprint/version custom-field селекты карточки
 *     «Вводные данные»: lazy-load options через loadFieldBundle (кэш field-values)
 *     + проставление persisted _sprint.sprintFieldVal/versionFieldVal (зомби-option,
 *     если значение исчезло из бандла);
 *   • renderRolePlannerHeader(rk) — шапка «Параметры спринта» роли (баннер, имя/даты/
 *     цель из выбранного спринта, ресурс роли с personalForResource-режимом) + вызовы
 *     renderRoleStatusBadge + renderSprintIntroExtras;
 *   • renderRoleStatusBadge(rk) — per-role бейдж статуса (v1.8.1: статус per-role из
 *     composite-записи _history sprintId_<rk>, НЕ из глобального _sprint.status).
 *
 * Три render-функции потребляются модулями через deps.renderX() (working-copy,
 * sprint-controller, validation-controller, rolecomposition-view) — в монолите
 * остаются одноимённые делегаторы, внешних правок вызовов нет. Внутренние хелперы
 * (loadFieldBundle, _introSourceForCurrent) приватны модулю. Кэш field-values
 * (_fieldValuesCache/_fieldValuesInflight) — ОБЩИЙ с формой настроек ядра, поэтому
 * живёт в стейт-ядре и приходит object-ref'ом через deps.fieldValuesCache/Inflight
 * (invalidateFieldValuesCache остаётся в ядре). Стейт (_settings/_sprint/_history/
 * _currentSprintId) — в стейт-ядре за deps.state.getX (читается В МОМЕНТ обращения).
 *
 * Паттерн (слайсы 2–8): deps-фабрика per-call (_introDeps в монолите).
 * Контракты — intro-view.golden.test.js (через делегаторы).
 */
(function () {
  'use strict';

  function renderSprintIntroExtras(deps) {
    var _settings = deps.state.getSettings();
    var hasSprint  = _settings && _settings.fieldSprint;
    var hasVersion = _settings && _settings.fieldVersion;
    var extrasEl   = document.getElementById('sprintExtraFields');
    var sprintEl   = document.getElementById('fieldSprintVal');
    var versionEl  = document.getElementById('fieldVersionVal');

    if (!hasSprint && !hasVersion) {
      extrasEl.style.display = 'none';
      return;
    }
    extrasEl.style.display = '';
    /* v5.0.3 (итерация 5) — Bundle async; ждём загрузку options ПЕРЕД setVal,
       иначе persisted значение из _sprint.sprintFieldVal/versionFieldVal не
       находит matching <option> и select остаётся пустым. */
    var loaders = [];
    if (hasSprint) {
      sprintEl.style.display = '';
      loaders.push(loadFieldBundle(_settings.fieldSprint, 'sprintFieldVal', deps));
    } else {
      sprintEl.style.display = 'none';
    }
    if (hasVersion) {
      versionEl.style.display = '';
      loaders.push(loadFieldBundle(_settings.fieldVersion, 'versionFieldVal', deps));
    } else {
      versionEl.style.display = 'none';
    }
    Promise.all(loaders).then(function(){
      var _sprint = deps.state.getSprint();
      if (!_sprint) return;
      [
        { v: _sprint.sprintFieldVal,  id: 'sprintFieldVal'  },
        { v: _sprint.versionFieldVal, id: 'versionFieldVal' }
      ].forEach(function(spec){
        if (!spec.v) return;
        var sel = document.getElementById(spec.id);
        if (!sel) return;
        /* Если matching option уже есть — выставляем; иначе добавляем «зомби»-option,
           чтобы сохранённое значение не терялось (например, оригинальный bundle
           изменился после сохранения снимка). */
        if (!sel.querySelector('option[value="'+CSS.escape(spec.v)+'"]')) {
          var o = document.createElement('option');
          o.value = spec.v;
          o.textContent = spec.v + ' *';
          o.title = 'Значение сохранено, но отсутствует в текущем бандле';
          sel.appendChild(o);
        }
        sel.value = spec.v;
      });
    }).catch(function(e){ deps.diag('renderSprintIntroExtras setVal err: '+e,'err'); });
  }

  function loadFieldBundle(fieldName, selId, deps) {
    var T = deps.T;
    var cache = deps.fieldValuesCache;        // shared object-ref из ядра
    var inflight = deps.fieldValuesInflight;  // shared object-ref из ядра
    var sel = document.getElementById(selId);
    if (!sel || !fieldName) return Promise.resolve();
    function applyToSel(r) {
      if (!r || !r.success || !r.values || !r.values.length) return;
      var prev = sel.value;
      sel.innerHTML = '<option value="">'+T('phNotSelected')+'</option>';
      r.values.forEach(function(name) {
        var o = document.createElement('option');
        o.value = name; o.textContent = name;
        sel.appendChild(o);
      });
      if (prev) sel.value = prev;
    }
    /* Hit cache — наполнить selector синхронно */
    if (cache[fieldName]) {
      applyToSel(cache[fieldName]);
      return Promise.resolve();
    }
    /* In-flight — присоединиться к текущему запросу, потом наполнить selector */
    if (inflight[fieldName]) {
      return inflight[fieldName].then(function(r){ applyToSel(r); });
    }
    /* Cold — летит первый запрос */
    var p = deps.apiGet('field-values?fieldName=' + encodeURIComponent(fieldName))
      .catch(function (e) {
        deps.diag('field-values ['+fieldName+'] FETCH ERR: '+(e&&e.message?e.message:String(e)),'err');
        return null;
      })
      .then(function(r) {
        var dbg = r && r.debug;
        var diagMsg = 'field-values ['+fieldName+']: success='+(!!(r&&r.success))+
          ' count='+(r&&r.values?r.values.length:0)+
          ' typeName='+(dbg&&dbg.typeName||'?')+
          ' method='+(dbg&&dbg.method||'?')+
          (dbg&&dbg.error?' ERR='+dbg.error:'')+
          (dbg&&dbg.findFieldError?' findErr='+dbg.findFieldError:'')+
          (dbg&&dbg.allFieldNames?' fields=['+dbg.allFieldNames.slice(0,5).join(',')+('...'+(dbg.allFieldNames.length-5)+' more')+'  searched='+fieldName+']':'');
        deps.diag(diagMsg, r&&r.success&&r.values&&r.values.length?'ok':'warn');
        if (r && r.success && r.values) cache[fieldName] = r;
        delete inflight[fieldName];
        applyToSel(r);
        return r;
      })
      .catch(function(e) {
        delete inflight[fieldName];
        deps.diag('field-values ['+fieldName+'] ERR: '+String(e&&e.message?e.message:e), 'err');
      });
    inflight[fieldName] = p;
    return p;
  }

  /* #25 Ф2 fix — источник intro-полей (Название/Даты/Цель) = выбранный спринт:
     активный _sprint, если он и есть _currentSprintId; иначе снапшот истории.
     Раньше renderRolePlannerHeader безусловно писал _sprint (активный) → при выборе
     исторического спринта «Параметры спринта» показывали данные активного. */
  function _introSourceForCurrent(deps) {
    var _sprint = deps.state.getSprint();
    var _currentSprintId = deps.state.getCurrentSprintId();
    var _history = deps.state.getHistory();
    if (_sprint && (!_currentSprintId || _sprint.sprintId === _currentSprintId)) return _sprint;
    if (Array.isArray(_history)) {
      var rec = _history.find(function(r){ return r && r.sprintId && String(r.sprintId).split('_')[0] === _currentSprintId; });
      if (rec) return rec;
    }
    return _sprint;
  }

  /* ── Рендер шапки планировщика для роли ── */
  function renderRolePlannerHeader(rk, deps) {
    var _settings = deps.state.getSettings();
    var _sprint = deps.state.getSprint();
    var STATUS = deps.STATUS;
    var T = deps.T;
    var ok = _settings && deps.getActiveRoles().some(function(r){ return r.key === rk && _settings[r.fieldEst]; });
    document.getElementById('bannerPlanner').classList.toggle('hidden', !!ok || !_settings);
    if (!_sprint) {
      /* Свитч на проект без спринтов: не оставляем residual-значения прошлого
         проекта в общих полях формы (⚖ владелец 2026-07-03, TechDEBT+Sanitary). */
      document.getElementById('sprintName').value = '';
      document.getElementById('dateStart').value  = '';
      document.getElementById('dateEnd').value    = '';
      var goalEl0 = document.getElementById('sprintGoal');
      if (goalEl0) goalEl0.value = '';
      return;
    }
    // Название, даты, цель — общие; источник = выбранный спринт (активный или исторический снапшот)
    var _intro = _introSourceForCurrent(deps) || _sprint;
    document.getElementById('sprintName').value = _intro.name || '';
    document.getElementById('dateStart').value  = deps.toDateIn(_intro.dateStart);
    document.getElementById('dateEnd').value    = deps.toDateIn(_intro.dateEnd);
    /* v1.9.0 D132 — Заполнить sprint goal textarea при переключении спринта. */
    var goalEl = document.getElementById('sprintGoal');
    if (goalEl) goalEl.value = _intro.sprintGoal || '';

    var resEl = document.getElementById('res_'+rk);
    var role  = deps.ALL_ROLES.find(function(r){ return r.key === rk; });
    if (resEl && role) {
      if (_settings && _settings.capacityMode === 'full') {
        /* #45 R4 §9.3 — Full: значение = утверждённая ёмкость роли (минуты, адаптер), read-only. */
        resEl.value = deps.fmtPeriod(deps.getApprovedCapacityForRole(rk));
        resEl.readOnly = true;
        resEl.style.opacity = '0.6';
        resEl.title = T('resManagedByCurrentRole');
      } else if (_settings && _settings.personalPlanningEnabled && _settings.usePersonalForResource) {
        // В режиме personalForResource — заполнить из personalPlanning и заблокировать
        var totalH5 = (typeof deps.getPersonalPlanningResourceForRole === 'function') ? deps.getPersonalPlanningResourceForRole(rk) : 0;
        if (_sprint) _sprint[role.resKey] = Math.round(totalH5 * 60);
        resEl.value = deps.fmtPeriod(Math.round(totalH5 * 60));
        resEl.readOnly = true;
        resEl.style.opacity = '0.6';
        resEl.title = T('resManagedByCurrentRole');
      } else {
        resEl.value = _sprint[role.resKey] ? deps.fmtPeriod(_sprint[role.resKey]) : '';
        resEl.readOnly = false;
        resEl.style.opacity = '';
        resEl.title = '';
      }
      /* v5.0.3 — live draft listener для res_<rk> */
      deps.bindResInputDraftListener(rk);
    }
    /* v5.0.3 — на случай первого рендера: bind стабильных инпутов шапки */
    deps.bindSprintHeaderDraftListeners();

    var ss = document.getElementById('sprintStatus_'+rk);
    var newBtn = document.getElementById('newSprintBtn_'+rk);
    if (_sprint.status === STATUS.CONFIRMED || _sprint.status === STATUS.ALLOCATED) {
      if (ss) ss.style.display = 'none';
      if (newBtn) newBtn.style.display = '';
    } else {
      if (ss) { ss.style.display = ''; ss.value = _sprint.status || STATUS.PLANNING; }
      if (newBtn) newBtn.style.display = 'none';
    }
    renderRoleStatusBadge(rk, deps);
    renderSprintIntroExtras(deps);
  }

  function renderRoleStatusBadge(rk, deps) {
    var _sprint = deps.state.getSprint();
    var _history = deps.state.getHistory();
    var STATUS = deps.STATUS;
    var T = deps.T;
    var b = document.getElementById('statusBadge_'+rk);
    if (!b) return;
    /* v1.8.1 — статус берётся per-role из _history (не из глобального _sprint.status).
       Раньше использовали _sprint.status, что приводило к синхронизации статусов между
       всеми ролями: валидация одной роли → у всех карточек ставится её статус. */
    var s = STATUS.PLANNING;
    if (_sprint && _sprint.sprintId) {
      var roleSnapId = _sprint.sprintId + '_' + rk;
      var rec = _history && _history.find(function(r){ return r && r.sprintId === roleSnapId; });
      if (rec && rec.status) s = rec.status;
    }
    b.textContent = deps.statusLabel(s); b.className = 's-badge';
    b.removeAttribute('title');
    if(s===STATUS.ALLOCATED) { b.classList.add('s-badge--allocated'); b.setAttribute('title', T('tooltipStatusAllocated')); }
    else if(s===STATUS.CONFIRMED) b.classList.add('s-badge--confirmed');
    else if(s===STATUS.FINISHED) b.classList.add('s-badge--finished');
    else b.classList.add('s-badge--planning');
  }

  var api = {
    renderSprintIntroExtras: renderSprintIntroExtras,
    renderRolePlannerHeader: renderRolePlannerHeader,
    renderRoleStatusBadge: renderRoleStatusBadge,
  };
  if (typeof window !== 'undefined') window.__SSP_INTRO_VIEW = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
