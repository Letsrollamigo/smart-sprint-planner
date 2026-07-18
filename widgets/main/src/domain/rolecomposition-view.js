/* Planning-core view — уровень «Роли» вкладки Планирование: accordion-карточки
   ролей (quick-stats/warn перелимита) и таблица состава роли (Ring Table).
   Вынесено из core.js (Тир D слайс 3, ступень 1) за мост
   window.__SSP_ROLECOMP_VIEW; golden-характеризация —
   tests/golden/render-planning.golden.test.js (через делегаторы монолита).

   Deps приходят АРГУМЕНТОМ на каждый вызов (фабрика _roleCompDeps() в монолите).
   state — get-аксессоры монолитного стейта, в event-хендлерах и async-цепочках
   читаются СТРОГО В МОМЕНТ обращения (урок youtrack-api/standup-view; здесь это
   ещё и сохраняет pre-existing класс «render/save читают _sprint/_roleItems
   глобально» — feedback_global_state_in_render). Самовызовы ре-рендера состава
   идут через deps.renderRoleComposition — это монолитный wrapped-делегатор
   (рендер + updateAllocOverlimitUI, переопределение v2.1.0 E4), НЕ внутренняя
   функция: пост-обработка перелимита обязана бежать после каждого ре-рендера.
   React-мост таблиц — window.__SSP_TABLE, читается с window на каждом вызове. */
'use strict';

function computeRoleQuickStats(rk, deps) {
  var role = deps.ALL_ROLES.find(function(r){ return r.key === rk; });
  var _sprint = deps.state.getSprint();
  var _currentSprintId = deps.state.getCurrentSprintId();
  /* v6.3.1 D115 — если выбран исторический спринт в widget-header (т.е.
     _currentSprintId !== _sprint.sprintId), читаем данные из соответствующего
     snapshot _history[i] вместо live _sprint/_roleItems. Иначе пользователь
     видит данные активного спринта вместо выбранного. */
  var isHistoricalView = _currentSprintId && _sprint && _currentSprintId !== _sprint.sprintId;
  if (isHistoricalView) {
    var _history = deps.state.getHistory();
    var histSnap = (Array.isArray(_history) ? _history : []).find(function(h){
      return h && h.sprintId === _currentSprintId + '_' + rk;
    });
    if (histSnap) {
      var resH = (role && histSnap[role.resKey] != null) ? Number(histSnap[role.resKey]) / 60 : 0;
      if (!isFinite(resH)) resH = 0;
      var itemsH = Array.isArray(histSnap.items) ? histSnap.items : [];
      var totH = 0;
      itemsH.forEach(function(it){
        var alloc = it && it['alloc_'+rk];
        var a = (alloc !== null && alloc !== undefined)
          ? alloc / 60
          : Math.max(0, (it['estimate_'+rk] || 0) - (it['fact_'+rk] || 0)) / 60;
        if (isFinite(a)) totH += a;
      });
      return { resource: resH, totalAlloc: totH, taskCount: itemsH.length, overlimit: (resH > 0) && (totH > resH + 0.001) };
    }
    /* нет снапшота для этой роли в выбранном спринте — пустой stat */
    return { resource: 0, totalAlloc: 0, taskCount: 0, overlimit: false };
  }
  /* #45 R4 — ресурс активной роли через адаптер §9: Full+approved → утверждённая ёмкость
     (минуты), иначе verbatim _sprint[role.resKey]. Fallback адаптера = тот же _sprint[resKey],
     поэтому Light остаётся byte-identical; в Full заголовок согласован с остатком/полем
     (calcRemForRole / «Доступные ресурсы» — тоже getApprovedCapacityForRole). */
  var resource = 0;
  if (role && typeof deps.getApprovedCapacityForRole === 'function') {
    resource = Number(deps.getApprovedCapacityForRole(rk)) / 60;
    if (!isFinite(resource)) resource = 0;
  } else if (role && _sprint && _sprint[role.resKey] != null) {
    resource = Number(_sprint[role.resKey]) / 60;
    if (!isFinite(resource)) resource = 0;
  }
  var items = (typeof deps.getRoleItemsArr === 'function') ? (deps.getRoleItemsArr(rk) || []) : [];
  var totalAlloc = 0;
  items.forEach(function(it){
    var alloc = it && it['alloc_'+rk];
    var a = (alloc !== null && alloc !== undefined)
      ? alloc / 60
      : Math.max(0, (it['estimate_'+rk] || 0) - (it['fact_'+rk] || 0)) / 60;
    if (isFinite(a)) totalAlloc += a;
  });
  var overlimit = (resource > 0) && (totalAlloc > resource + 0.001);
  return { resource: resource, totalAlloc: totalAlloc, taskCount: items.length, overlimit: overlimit };
}

function renderRoleAccordion(rk, deps) {
  var T = deps.T, esc = deps.esc;
  var role = deps.ALL_ROLES.find(function(r){ return r.key === rk; });
  if (!role) return '';
  /* #45 super-light — CTA «Распределить по исполнителям» показываем только при
     включённом перс.планировании (иначе вкладка «Люди» скрыта, кнопка ведёт в никуда). */
  var _ppSettings = deps.state.getSettings();
  var ppOn = !!(_ppSettings && _ppSettings.personalPlanningEnabled);
  var stats = computeRoleQuickStats(rk, deps);
  var _uiExpandedRoles = deps.state.getUiExpandedRoles() || {};
  var expanded = !!_uiExpandedRoles[rk];
  var label = (typeof deps.roleLabel === 'function') ? deps.roleLabel(role) : role.label || rk;
  /* 🦜 разовый рендер-тумблер (взводит ядро кликами по бейджу версии, сюда
     приходит через deps): часы → попугаи, 1 попугай ≈ 0.8 ч. */
  var _parrot = (typeof deps.isParrotMode === 'function' && deps.isParrotMode());
  function _fmtStat(h) {
    return _parrot ? String(Math.round(h / 0.8 * 10) / 10) : deps.formatHoursLight(h);
  }
  var statSuffix = _parrot ? '🦜' : esc(T('planningRoleStatHourSuffix'));
  var resStr   = _fmtStat(stats.resource);
  var allocStr = _fmtStat(stats.totalAlloc);
  /* 🔥🐶 перегруз роли >150% ресурса — «this is fine» рядом с бейджем перелимита. */
  var _thisIsFine = stats.overlimit && stats.resource > 0 && stats.totalAlloc > stats.resource * 1.5;
  var DOG_SVG = '<svg width="26" height="18" viewBox="0 0 26 18" xmlns="http://www.w3.org/2000/svg" style="vertical-align:-3px">'
    + '<path d="M2 18 Q1 12 4 10 Q6 13 5 18 Z" fill="#e8590c"/>'
    + '<path d="M22 18 Q25 11 21 9 Q19 12 20 18 Z" fill="#e8590c"/>'
    + '<path d="M24 18 Q26 14 24.5 12 Q23.5 14 23 18 Z" fill="#fab005"/>'
    + '<path d="M0.5 18 Q-0.5 14 1.5 11.5 Q3 14 2.5 18 Z" fill="#fab005"/>'
    + '<path d="M7.5 6 Q6 2 9.5 4 Z" fill="#c98a4b"/>'
    + '<path d="M18.5 6 Q20 2 16.5 4 Z" fill="#c98a4b"/>'
    + '<circle cx="13" cy="10" r="6" fill="#f5d199"/>'
    + '<rect x="10" y="1" width="6" height="3" rx="1" fill="#5c3b1e"/>'
    + '<circle cx="11" cy="9" r="0.9" fill="#333"/>'
    + '<circle cx="15" cy="9" r="0.9" fill="#333"/>'
    + '<circle cx="13" cy="11.2" r="0.8" fill="#7a5230"/>'
    + '<path d="M11.5 13 Q13 14.3 14.5 13" stroke="#7a5230" stroke-width="0.8" fill="none"/>'
    + '</svg>';
  var html = ''
    + '<div class="planning-role-card' + (expanded ? ' expanded' : '') + '" data-role-key="' + rk + '">'
    +   '<button class="planning-role-toggle" type="button" data-role-key="' + rk + '">'
    +     '<span class="planning-role-chevron">' + (expanded ? '▼' : '▶') + '</span>'
    +     '<span class="planning-role-name">' + esc(label) + '</span>'
    +     '<span class="planning-role-stat">' + esc(T('planningRoleStatResource')) + ': <span class="planning-role-stat__num">' + esc(resStr) + '</span> ' + statSuffix + '</span>'
    +     '<span class="planning-role-stat">' + esc(T('planningRoleStatAlloc')) + ': <span class="planning-role-stat__num">' + esc(allocStr) + ' / ' + esc(resStr) + '</span> ' + statSuffix + '</span>'
    +     '<span class="planning-role-stat"><span class="planning-role-stat__num">' + stats.taskCount + '</span> ' + esc(T('planningRoleStatTasks')) + '</span>'
    +     (stats.overlimit ? '<span class="planning-role-warn">' + esc(T('planningRoleStatOverlimit')) + '</span>' : '')
    +     (_thisIsFine ? '<span class="planning-role-dog" title="this is fine">' + DOG_SVG + '</span>' : '')
    +   '</button>'
    +   '<div class="planning-role-body" data-role-body="' + rk + '">'
    /* v5.6.0 — Этап 4 (4c): hint и кнопка «Открыть в legacy» удалены.
       В C4 (4d) сюда монтируется полный editable buildRolePanel(role). */
    +     (ppOn
            ? '<div class="planning-role-body__actions">'
              + '<button class="ring-button-button ring-button-block ring-button-heightS ring-button-primaryBlock ring-button-flat ring-button-whiteText planning-role-jumpPeople" data-role-key="' + rk + '">' + esc(T('btnJumpToPeople')) + '</button>'
              + '</div>'
            : '')
    +   '</div>'
    + '</div>';
  return html;
}

function _updateRoleAccordionStats(rk, deps) {
  var card = document.querySelector('.planning-role-card[data-role-key="' + rk + '"]');
  if (!card) return;
  var stats = computeRoleQuickStats(rk, deps);
  /* 🦜 патчер согласован с рендером: в попугай-режиме числа тоже в попугаях,
     иначе смешанное «часы + 🦜» до авто-отката. */
  var _parrot = (typeof deps.isParrotMode === 'function' && deps.isParrotMode());
  function _fmtStat(h) {
    return _parrot ? String(Math.round(h / 0.8 * 10) / 10) : deps.formatHoursLight(h);
  }
  var resStr   = _fmtStat(stats.resource);
  var allocStr = _fmtStat(stats.totalAlloc);
  var nums = card.querySelectorAll('.planning-role-toggle .planning-role-stat__num');
  if (nums[0]) nums[0].textContent = resStr;
  if (nums[1]) nums[1].textContent = allocStr + ' / ' + resStr;
  if (nums[2]) nums[2].textContent = String(stats.taskCount);
  var warn = card.querySelector('.planning-role-toggle .planning-role-warn');
  if (stats.overlimit) {
    if (!warn) {
      warn = document.createElement('span');
      warn.className = 'planning-role-warn';
      warn.textContent = deps.T('planningRoleStatOverlimit');
      card.querySelector('.planning-role-toggle').appendChild(warn);
    }
  } else if (warn) {
    warn.parentNode.removeChild(warn);
  }
}

function renderPlanningRoles(deps) {
  var container = document.getElementById('roleAccordions');
  var noSprintEl = document.getElementById('planningRolesNoSprint');
  var noActiveEl = document.getElementById('planningRolesNoActive');
  if (!container) return;
  var activeRoles = (typeof deps.getActiveRoles === 'function') ? deps.getActiveRoles() : [];
  if (!activeRoles.length) {
    container.innerHTML = '';
    if (noActiveEl) {
      noActiveEl.classList.remove('hidden');
      /* #43 W2 — CTA «Открыть настройки» только тем, кому виден #openSettingsBtn
         (серверная проверка check-settings-manager, см. refreshOpenSettingsBtn). */
      var ctaEl = document.getElementById('planningRolesNoActiveCta');
      var sBtn  = document.getElementById('openSettingsBtn');
      if (ctaEl) ctaEl.style.display = (sBtn && sBtn.style.display !== 'none') ? '' : 'none';
    }
    if (noSprintEl) noSprintEl.classList.add('hidden');
    return;
  }
  if (noActiveEl) noActiveEl.classList.add('hidden');
  if (!deps.state.getCurrentSprintId()) {
    container.innerHTML = '';
    if (noSprintEl) noSprintEl.classList.remove('hidden');
    return;
  }
  if (noSprintEl) noSprintEl.classList.add('hidden');
  var html = activeRoles.map(function(role){ return renderRoleAccordion(role.key, deps); }).join('');
  container.innerHTML = html;
  _bindAccordionHandlers(deps);
}

function _bindAccordionHandlers(deps) {
  document.querySelectorAll('#roleAccordions .planning-role-toggle').forEach(function(btn){
    btn.addEventListener('click', function(e){
      if (e && e.preventDefault) e.preventDefault();
      var rk = btn.dataset.roleKey;
      if (!rk) return;
      var _uiExpandedRoles = deps.state.getUiExpandedRoles();
      _uiExpandedRoles[rk] = !_uiExpandedRoles[rk];
      var expandedList = Object.keys(_uiExpandedRoles).filter(function(k){ return _uiExpandedRoles[k]; });
      var ui = deps.draftGet('ui') || {}; ui.expandedRoles = expandedList; deps.draftSet('ui', ui);
      var card = btn.closest('.planning-role-card');
      if (card) {
        card.classList.toggle('expanded', !!_uiExpandedRoles[rk]);
        var chev = card.querySelector('.planning-role-chevron');
        if (chev) chev.textContent = _uiExpandedRoles[rk] ? '▼' : '▶';
        /* v5.6.0 — Этап 4 (4d): создаём slot для buildRolePanel при первом раскрытии,
           если его ещё нет (template создаёт slot только при initial expanded=true). */
        if (_uiExpandedRoles[rk]) {
          var bodyEl = card.querySelector('.planning-role-body');
          if (!bodyEl) {
            bodyEl = document.createElement('div');
            bodyEl.className = 'planning-role-body';
            bodyEl.setAttribute('data-role-body', rk);
            card.appendChild(bodyEl);
          }
        }
      }
      /* v5.6.0 — Этап 4 (4d): монтаж/демонтаж editable body после toggle */
      try { _mountExpandedRoleBodies(deps); } catch(err){ deps.diag('mount role bodies on toggle err: '+err,'err'); }
    });
  });
  /* v5.6.0 — Этап 4 (4c): handler .planning-role-openOld удалён вместе с кнопкой. */
  document.querySelectorAll('#roleAccordions .planning-role-jumpPeople').forEach(function(btn){
    btn.addEventListener('click', function(e){
      if (e && e.stopPropagation) e.stopPropagation();
      var rk = btn.dataset.roleKey;
      /* v1.8.1 — явно зафиксировать целевую роль ДО переключения уровня, иначе
         refreshPlanningPeopleForCurrentSprint берёт rk из sel.value/_activeSubtab,
         а они хранят последнюю использованную роль (баг #3 из v1.8.1 acceptance). */
      deps.safeLs.set('ssp_lastActiveRole', rk);
      deps.state.setActiveSubtab(rk);
      var peopleSel = document.getElementById('planningRoleSel');
      if (peopleSel) {
        if (!peopleSel.options.length && typeof deps.populatePlanningRoleSel === 'function') {
          try { deps.populatePlanningRoleSel(); } catch(_){}
        }
        if (peopleSel.querySelector('option[value="'+rk+'"]')) peopleSel.value = rk;
      }
      var lvlBtn = document.querySelector('.planning-level-btn[data-level="people"]');
      if (lvlBtn && lvlBtn.style.display !== 'none' && !lvlBtn.classList.contains('hidden')) lvlBtn.click();
      /* Явный refresh с переданным rk — на случай если levelBtn.click() не вызвал refresh. */
      if (typeof deps.refreshPlanningPeopleForCurrentSprint === 'function') {
        try { deps.refreshPlanningPeopleForCurrentSprint(rk); } catch(_){}
      }
    });
  });
  /* v5.6.0 — Этап 4 (4d): после рендера accordion — монтируем full editable buildRolePanel
     в раскрытые карточки. Свёрнутые карточки очищают тело (для экономии DOM). */
  try { _mountExpandedRoleBodies(deps); } catch(e){ deps.diag('mount role bodies err: '+e,'err'); }
}

/* v5.6.0 — Этап 4 (4d): монтаж полного editable buildRolePanel(role) в раскрытые
   accordion-карточки. Каждая карточка с .expanded получает уникальный buildRolePanel
   (id внутри функции содержат roleKey, поэтому коллизий нет даже при одновременном
   раскрытии нескольких ролей). После монтажа — устанавливаем _activeSubtab и
   applyEditorRightsToUI для применения прав редактора. */
function _mountExpandedRoleBodies(deps) {
  document.querySelectorAll('.planning-role-card.expanded .planning-role-body').forEach(function(host){
    var rk = host.getAttribute('data-role-body');
    if (!rk) return;
    /* Идемпотентность: если уже примонтирован — пропускаем (не пере-рендерим).
       Mark через data-mounted=1. */
    if (host.dataset.mounted === '1') return;
    var role = deps.ALL_ROLES.find(function(r){ return r.key === rk; });
    if (!role) return;
    try {
      /* Сохраняем кнопку «Перейти в Люди» (data-keep="actions") если она есть */
      var keepActions = host.querySelector('.planning-role-body__actions');
      host.innerHTML = '';
      host.appendChild(buildRolePanel(role, deps));
      if (keepActions) host.appendChild(keepActions);
      host.dataset.mounted = '1';
      deps.state.setActiveSubtab(rk);
      if (typeof deps.applyEditorRightsToUI === 'function') deps.applyEditorRightsToUI();
    } catch(e) { deps.diag('_mountExpandedRoleBodies err for rk='+rk+': '+e, 'err'); }
  });
  /* Свёрнутые карточки — сброс mounted флага (на случай повторного раскрытия — пере-рендер свежим состоянием) */
  document.querySelectorAll('.planning-role-card:not(.expanded) .planning-role-body').forEach(function(host){
    if (host.dataset.mounted === '1') {
      host.dataset.mounted = '';
      host.innerHTML = '';
    }
  });
}

/* ── Построить панель для одной роли ── */
function buildRolePanel(role, deps) {
  var T = deps.T, esc = deps.esc;
  var _settings = deps.state.getSettings();
  var dynEdit = _settings && _settings.dynEditEnabled;
  var frag = document.createDocumentFragment();

  /* === Блок: трёхколоночный layout === */
  var cols = document.createElement('div');
  cols.className = 'planner-cols';

  /* Колонка 1: Статус планирования */
  var colStatus = document.createElement('div');
  colStatus.className = 'card';
  colStatus.style.marginBottom = '0';
  colStatus.innerHTML = '<div class="card-title">'+T('cardStatusPlanning')+'</div>';
  var statusRow = document.createElement('div');
  statusRow.className = 'status-row';
  statusRow.style.flexDirection = 'column';
  statusRow.style.alignItems = 'flex-start';
  statusRow.style.gap = '10px';

  /* v5.2.0 — селектор статуса упразднён: после удаления PLANNED у него осталась
     одна опция, теряет смысл. Переход PLANNING→CONFIRMED идёт только через
     кнопку «Валидировать». Текущий статус показывается через statusBadge. */

  var statusBadge = document.createElement('span');
  statusBadge.id = 'statusBadge_'+role.key;
  statusBadge.className = 's-badge s-badge--planning';
  statusBadge.textContent = deps.statusLabel(deps.STATUS.PLANNING);

  var newSprintBtn = document.createElement('button');
  newSprintBtn.className = 'ring-button-button ring-button-block ring-button-heightS new-sprint-btn';
  newSprintBtn.id = 'newSprintBtn_'+role.key;
  newSprintBtn.style.display = 'none';
  newSprintBtn.textContent = T('btnNewSprint');

  var saveHeaderBtn = document.createElement('button');
  saveHeaderBtn.className = 'ring-button-button ring-button-block ring-button-heightM ring-button-primaryBlock ring-button-flat ring-button-whiteText save-header-btn';
  saveHeaderBtn.id = 'saveHeaderBtn_'+role.key;
  saveHeaderBtn.textContent = T('btnSaveParams');

  statusRow.appendChild(statusBadge);
  statusRow.appendChild(newSprintBtn);
  statusRow.appendChild(saveHeaderBtn);
  colStatus.appendChild(statusRow);

  /* Колонка 2: Доступные ресурсы */
  var colRes = document.createElement('div');
  colRes.className = 'card';
  colRes.style.marginBottom = '0';
  colRes.innerHTML = '<div class="card-title">'+T('cardAvailRes')+'</div>';
  var resField = document.createElement('div');
  resField.className = 'field';
  resField.innerHTML = '<label for="res_'+role.key+'">'+esc(deps.roleLabel(role))+'</label>'+
    '<input type="text" id="res_'+role.key+'" placeholder="'+T('phPeriod')+'"/>';
  colRes.appendChild(resField);

  /* Колонка 3: Остатки ресурсов */
  var colRem = document.createElement('div');
  colRem.className = 'card';
  colRem.style.marginBottom = '0';
  colRem.innerHTML = '<div class="card-title">'+T('cardRemRes')+'</div>';
  var remCard = document.createElement('div');
  remCard.className = 'remain-card';
  remCard.id = 'rc_'+role.key;
  remCard.innerHTML = '<div class="remain-card__label">'+esc(deps.roleLabel(role))+'</div>'+
    '<div class="remain-card__val" id="rem_'+role.key+'">—</div>';
  colRem.appendChild(remCard);

  cols.appendChild(colStatus);
  cols.appendChild(colRes);
  cols.appendChild(colRem);
  frag.appendChild(cols);

  /* === Блок: Состав спринта === */
  var compCard = document.createElement('div');
  compCard.className = 'card';
  var compTitle = document.createElement('div');
  compTitle.className = 'card-title';
  compTitle.textContent = T('cardComposition') + ' — ' + deps.roleLabel(role);
  compCard.appendChild(compTitle);

  var toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  toolbar.style.marginBottom = '14px';

  var pickBtn = document.createElement('button');
  pickBtn.className = 'ring-button-button ring-button-block ring-button-heightM ring-button-primaryBlock ring-button-flat ring-button-whiteText editor-btn';
  pickBtn.id = 'pickBtn_'+role.key;
  pickBtn.textContent = T('btnPickTasks');

  /* S6 #35 — кнопка «Обновить из задачи» теперь в обоих режимах (inline и обычный):
     единый refreshFromYouTrack тянет полный срез и в inline безопасен (dirty-guard). */
  var refreshBtn = document.createElement('button');
  refreshBtn.className = 'ring-button-button ring-button-block ring-button-heightS editor-btn';
  refreshBtn.id = 'refreshBtn_'+role.key;
  refreshBtn.disabled = true;
  refreshBtn.textContent = T('btnRefreshFromTask');

  var recalcBtn = document.createElement('button');
  recalcBtn.className = 'ring-button-button ring-button-block ring-button-heightS editor-btn';
  recalcBtn.id = 'recalcBtn_'+role.key;
  recalcBtn.disabled = true;
  recalcBtn.textContent = T('btnRecalc');

  var clearBtn = document.createElement('button');
  clearBtn.className = 'ring-button-button ring-button-block ring-button-heightS ring-button-danger editor-btn';
  clearBtn.id = 'clearBtn_'+role.key;
  clearBtn.disabled = true;
  clearBtn.textContent = T('btnClear');

  var spacer = document.createElement('div');
  spacer.style.flex = '1';

  var validateBtn = document.createElement('button');
  validateBtn.className = 'ring-button-button ring-button-block ring-button-heightM ring-button-primaryBlock ring-button-flat ring-button-whiteText validate-btn';
  validateBtn.id = 'validateBtn_'+role.key;
  validateBtn.textContent = T('btnValidate');

  toolbar.appendChild(pickBtn);
  if (refreshBtn) toolbar.appendChild(refreshBtn);
  toolbar.appendChild(recalcBtn);
  toolbar.appendChild(clearBtn);
  toolbar.appendChild(spacer);
  toolbar.appendChild(validateBtn);
  compCard.appendChild(toolbar);

  /* v2.1.0 E4 — Ring Table host (replaces native <table>/<thead>/<tbody>).
     renderRoleComposition() mounts Ring Table via window.__SSP_TABLE.mountAt
     with columns built from the dynamic column set. */
  var tblWrap = document.createElement('div');
  tblWrap.className = 'tbl-wrap';
  var host = document.createElement('div');
  host.id = 'compHost_'+role.key;
  host.setAttribute('data-ssp-table-host', '');
  host.innerHTML = '<div class="empty">'+esc(T('compEmpty'))+'</div>';
  tblWrap.appendChild(host);
  compCard.appendChild(tblWrap);

  var pag = document.createElement('div');
  pag.className = 'pagination';
  pag.id = 'planPag_'+role.key;
  pag.style.display = 'none';
  pag.innerHTML = '<button class="ring-button-button ring-button-block ring-button-heightS" id="planPrev_'+role.key+'">‹</button>'+
    '<span id="planPageInfo_'+role.key+'"></span>'+
    '<button class="ring-button-button ring-button-block ring-button-heightS" id="planNext_'+role.key+'">›</button>';
  compCard.appendChild(pag);
  frag.appendChild(compCard);

  /* === Навесить события === */
  setTimeout(function() {
    wireRolePanel(role, dynEdit, deps);
    deps.renderRolePlannerHeader(role.key);
    deps.renderRoleComposition(role.key);
    deps.updateRoleRemaining(role.key);
  }, 0);

  return frag;
}


function wireRolePanel(role, dynEdit, deps) {
  var T = deps.T;
  var rk = role.key;

  /* Кнопка Подобрать задачи */
  var pickBtn = document.getElementById('pickBtn_'+rk);
  if (pickBtn) {
    pickBtn.addEventListener('click', function() {
      if (!deps.state.getIsEditor()) { deps.toast(T('toastNoEditRights'), 'warn'); return; }
      deps.openPickModal(rk, role);
    });
  }

  /* Кнопка Обновить данные */
  var refreshBtn = document.getElementById('refreshBtn_'+rk);
  if (refreshBtn) {
    refreshBtn.addEventListener('click', function() {
      if (!deps.state.getIsEditor()) { deps.toast(T('toastNoRightsShort'), 'warn'); return; }
      deps.refreshFromYouTrack(); /* #35 — единый путь: весь спринт, обе вкладки + Гант */
    });
  }

  /* Кнопка Пересчитать */
  var recalcBtn = document.getElementById('recalcBtn_'+rk);
  if (recalcBtn) {
    recalcBtn.addEventListener('click', function() {
      if (!deps.state.getIsEditor()) { deps.toast(T('toastNoRightsShort'), 'warn'); return; }
      deps.updateRoleRemaining(rk);
      deps.toast(T('toastRecalcDone'), 'success');
    });
  }

  /* Кнопка Очистить */
  var clearBtn = document.getElementById('clearBtn_'+rk);
  if (clearBtn) {
    clearBtn.addEventListener('click', (function(roleKey) { return function() {
      if (!deps.state.getIsEditor()) { deps.toast(T('toastNoRightsShort'), 'warn'); return; }
      deps.openModal({
        id: 'clear',
        type: 'confirm',
        title: T('confirmClearTask'),
        body: { kind: 'text', text: T('confirmClearTask') },
        buttons: [
          { id: 'cancel', text: T('btnNo'), variant: 'secondary', onClick: function(h) { h.close(); } },
          { id: 'confirm', text: T('btnYesClear'), variant: 'danger', onClick: function(h) {
            h.close();
            deps.state.getRoleItems()[roleKey] = [];
            deps.apiPost('sprint-data', { roleItems: deps.state.getRoleItems() }).then(function() {
              deps.renderRoleComposition(roleKey);
              deps.updateRoleRemaining(roleKey);
              deps.toast(T('toastCleared'), 'success');
            });
          }},
        ],
        dismissOnBackdrop: false,
        blockEscape: false,
        showCloseButton: false,
      });
    }; })(rk));
  }

  /* Кнопка Валидировать */
  var validateBtn = document.getElementById('validateBtn_'+rk);
  if (validateBtn) {
    validateBtn.addEventListener('click', function() {
      if (!deps.state.getIsValidator()) { deps.toast(T('toastNoValidRights'), 'warn'); return; }
      deps.doValidateRole(rk);
    });
  }

  /* Кнопка Новый спринт */
  var newSprintBtn = document.getElementById('newSprintBtn_'+rk);
  if (newSprintBtn) {
    newSprintBtn.addEventListener('click', function() {
      if (!deps.state.getIsEditor()) { deps.toast(T('toastNoRightsShort'), 'warn'); return; }
      deps.doNewSprint(rk);
    });
  }

  /* Кнопка Сохранить параметры */
  var saveHeaderBtn = document.getElementById('saveHeaderBtn_'+rk);
  if (saveHeaderBtn) {
    saveHeaderBtn.addEventListener('click', function() {
      if (!deps.state.getIsEditor()) { deps.toast(T('toastNoRightsShort'), 'warn'); return; }
      deps.doSaveRoleHeader(rk);
    });
  }

  /* Пагинация */
  var prevBtn = document.getElementById('planPrev_'+rk);
  var nextBtn = document.getElementById('planNext_'+rk);
  if (prevBtn) prevBtn.addEventListener('click', function() {
    var _roleItems = deps.state.getRoleItems();
    var page = (_roleItems[rk] && _roleItems[rk]._page) || 1;
    if (!_roleItems[rk]) return;
    _roleItems[rk]._page = Math.max(1, page - 1);
    deps.renderRoleComposition(rk);
  });
  if (nextBtn) nextBtn.addEventListener('click', function() {
    var _roleItems = deps.state.getRoleItems();
    var page = (_roleItems[rk] && _roleItems[rk]._page) || 1;
    if (!_roleItems[rk]) return;
    _roleItems[rk]._page = page + 1;
    deps.renderRoleComposition(rk);
  });
}

/* ── v1.8.0 D130 — Etap В.2 — External ticket ID cell renderer (module-level).
   Used in role composition table (history/assignee tables держат собственные
   копии в своих кластерах).
   - empty/undefined → muted '—'
   - http(s) URL     → clickable <a> (target=_blank, rel=noopener)
   - plain string    → truncated text with full value in title tooltip
   esc() is mandatory on every path — this is a user-controlled string from a YT custom field. */
/* v2.1.0 E4 — inner-only variant for Ring Table cell (without <td> wrapper). */
function _renderExternalTicketInnerHtml(val, deps) {
  if (!val) return '<span style="color:var(--muted)">—</span>';
  var safe = deps.esc(String(val));
  var style = 'style="max-width:12em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block"';
  if (/^https?:\/\//i.test(val)) {
    return '<span '+style+' title="'+safe+'"><a href="'+deps.safeUrl(val)+'" target="_blank" rel="noopener noreferrer" class="link">'+safe+'</a></span>';
  }
  return '<span '+style+' title="'+safe+'">'+safe+'</span>';
}

/* v2.1.0 E4 — Hybrid controlled-mode Ring Table for renderRoleComposition.
   Ring renders 8-13 dynamic cols (base + optional externalTicketId / system
   / xpriority). Монолит owns sort state (getSortKey / multiKeySort, через
   deps) and all edit handlers live here. Cell renderers return { __html }
   for native HTML; per-row delete buttons and dyn-enum cells wired via
   mousedown-capture delegation (v2.1.14).
   Sort: Ring header click → onSort callback → setSortKey → rerenderAllSortableTables.
   Pagination: external #planPag_<rk> div (sibling of host), unchanged. */
/* Ступень 2 (Тир D слайс 3): вся cell-логика — в vm-билдере; колонки таблицы —
   тупой маппинг row.cells[col.id] (_vmCell). Значения ячеек байт-в-байт прежние,
   контракт «модуль → __SSP_TABLE» не менялся — оракул (materializeTable)
   остаётся diff 0. */
function _vmCell(row, c) { return row.cells[c.id]; }

function _buildRoleCompositionVm(rk, deps) {
  var T = deps.T, esc = deps.esc, safeUrl = deps.safeUrl;
  var _settings = deps.state.getSettings();
  var _sprint = deps.state.getSprint();
  var _currentSprintId = deps.state.getCurrentSprintId();
  /* #25 Ф2 fix — в «историческом виде» (выбран не активный _sprint, без рабочей копии)
     состав читаем из снапшота истории (read-only display), а не из _roleItems активного
     спринта. Иначе шапка показывала счёт снапшота (computeRoleQuickStats), а таблица —
     пустой _roleItems → «Состав спринта пуст». Архитектура не меняется: редактирование
     не-активного спринта по-прежнему только через рабочую копию (read-only снимается там).
     .slice() — чтобы сортировка (multiKeySort) не мутировала persisted _history. */
  var isHistoricalView = _currentSprintId && _sprint && _currentSprintId !== _sprint.sprintId;
  var items;
  if (isHistoricalView) {
    var _history = deps.state.getHistory();
    var _hsnap = (Array.isArray(_history) ? _history : []).find(function(h){
      return h && h.sprintId === _currentSprintId + '_' + rk;
    });
    items = (_hsnap && Array.isArray(_hsnap.items)) ? _hsnap.items.slice() : [];
  } else {
    items = deps.getRoleItemsArr(rk);
  }
  if (!items.length) return { empty: true, itemCount: 0 };

  /* Номер страницы держим на стабильном _roleItems[rk] (getRoleItemsArr), а НЕ на items:
     в историческом виде items = histSnap.items.slice() пересоздаётся КАЖДЫЙ рендер, поэтому
     items._page терялся, а хендлер prev/next пишет _page именно в _roleItems[rk] → стрелки
     не листали состав ALLOCATED/исторических спринтов (баг «в аллокации не переключается
     страница»). Теперь VM и хендлер согласованы по одному стабильному держателю. */
  var _pageHolder = deps.getRoleItemsArr(rk);
  var pageNum = _pageHolder._page || 1;
  var total = Math.ceil(items.length / deps.PAGE_SIZE);
  pageNum = Math.min(pageNum, total);
  _pageHolder._page = pageNum;
  /* v6.1.0 D81 (F4) — multi-key sort применяется поверх items до пагинации.
     Если sort выключен — порядок storage. Сортировка не мутирует _roleItems[rk]. */
  var sortedItems = (typeof deps.multiKeySort === 'function') ? deps.multiKeySort(items) : items;
  var start = (pageNum - 1) * deps.PAGE_SIZE;
  var page  = sortedItems.slice(start, start + deps.PAGE_SIZE);
  var dynEdit = _settings && _settings.dynEditEnabled;

  function fmtDelta(val) {
    if (val === null || val === undefined) return '<span style="color:var(--muted)">—</span>';
    var s = deps.fmtHoursOnly(Math.abs(val));
    if (val < 0) return '<span class="delta-neg">−'+s+'</span>';
    return s;
  }

  /* v5.0.3 — серверный snapshot для сравнения и подсветки dirty rows.
     Ring Table per-row className via column.className isn't per-cell; we
     wrap each cell in a span carrying tr--dirty-row class for visual.
     Lock+dirty visual semantics moved to td-level span wrappers. */
  var _serverSnapshotRoleItems = deps.state.getServerSnapshotRoleItems();
  var snapItems = (_serverSnapshotRoleItems && _serverSnapshotRoleItems[rk]) || [];
  var snapByIssue = {};
  snapItems.forEach(function(it){ if (it && it.issueId) snapByIssue[it.issueId] = it; });
  /* v5.2.0 — после ALLOCATED таблица read-only. Для перехода в edit-режим
     пользователь жмёт «Открыть на правку» (working copy → _activeWorkingDraftKey).
     statusByRole — lock PER-ROLE: раньше глобальный _sprint.status лочил таблицы ВСЕХ
     ролей, если ЛЮБАЯ роль ALLOCATED (латентный «лок скопом»); теперь lock по статусу
     именно этой роли. Активная рабочая копия роли снимает lock (правка идёт в WC). */
  var _wcKey = _sprint ? (_sprint.sprintId + '_' + rk) : null;
  var _wcActive = !!(_wcKey && deps.state.getActiveWorkingDraftKey &&
                     deps.state.getActiveWorkingDraftKey() === _wcKey);
  /* v3.2.1 — лок закрывает И «исторический вид» (просмотр не-активного спринта без WC):
     раньше он рендерил снапшот, но АКТИВНЫЕ контролы мутировали живой _roleItems активного
     спринта (для carried-over issueId клик 🗑 тихо выносил задачу из текущего состава). */
  var isLocked = !!(isHistoricalView || (_sprint && deps.statusForRole(rk) === deps.STATUS.ALLOCATED && !_wcActive));
  var roAttr = isLocked ? ' readonly="readonly" tabindex="-1"' : '';
  /* v3.2.1 — лок теперь дотягивается и до inc-sel/делита/enum-ячеек (раньше read-only
     были только два текстовых инпута — валидированный состав правился в обход WC-флоу). */
  var lockAttr = isLocked ? ' disabled' : '';
  var dynCellEnabled = dynEdit && !isLocked;
  var dynStyle = 'cursor:pointer;text-decoration:underline dotted;color:var(--primary)';

  var hasExtTicket = !!(_settings && _settings.fieldExternalTicketId);
  var hasSystem    = !!(_settings && _settings.fieldSystem);
  var hasXPriority = !!(_settings && _settings.fieldXPriority);

  /* Строки vm: pre-computed derived values + готовые cell-значения
     (esc-строки и { __html } байт-в-байт как прежние column.getValue). */
  var rows = page.map(function(item) {
    var iid  = item.issueId;
    var est  = item['estimate_'+rk];
    var fact = item['fact_'+rk];
    var delta = (est !== null && est !== undefined)
      ? ((fact !== null && fact !== undefined) ? ((est||0) - (fact||0)) : (est||0))
      : null;
    var alloc = item['alloc_'+rk];
    var allocDefault = (delta !== null && delta !== undefined) ? Math.max(0, delta) : null;
    var allocVal = (alloc !== null && alloc !== undefined) ? alloc : allocDefault;
    var allocDisplay = allocVal !== null && allocVal !== undefined ? deps.fmtPeriod(allocVal) : '';
    var snap = snapByIssue[iid];
    var isDirty = !snap || JSON.stringify({a:item['alloc_'+rk], i:item.inclusionStatus, e:item['estimate_'+rk], f:item['fact_'+rk]})
                        !== JSON.stringify({a:snap['alloc_'+rk], i:snap.inclusionStatus, e:snap['estimate_'+rk], f:snap['fact_'+rk]});

    var cells = {};
    cells.id = { __html: '<a href="'+safeUrl(item.url)+'" target="_blank" class="link">'+esc(iid)+'</a>' };
    if (hasExtTicket) {
      cells.externalTicketId = { __html: _renderExternalTicketInnerHtml(item.externalTicketId, deps) };
    }
    if (hasSystem) {
      cells.system = dynCellEnabled
        ? { __html: '<span class="dyn-enum-cell" data-iid="'+esc(iid)+'" data-rk="'+rk+'" data-field="fieldSystem" style="'+dynStyle+'">'+esc(item.system||'—')+'</span>' }
        : esc(item.system||'—');
    }
    cells.priority = (dynCellEnabled && _settings && _settings.fieldPriority)
      ? { __html: '<span class="dyn-enum-cell" data-iid="'+esc(iid)+'" data-rk="'+rk+'" data-field="fieldPriority" style="'+dynStyle+'">'+esc(deps.dispEnum(item.priority)||'—')+'</span>' }
      : esc(deps.dispEnum(item.priority)||'—');
    if (hasXPriority) {
      cells.xpriority = dynCellEnabled
        ? { __html: '<span class="dyn-enum-cell" data-iid="'+esc(iid)+'" data-rk="'+rk+'" data-field="fieldXPriority" style="'+dynStyle+'">'+esc(deps.dispEnum(item.xpriority)||'—')+'</span>' }
        : esc(deps.dispEnum(item.xpriority)||'—');
    }
    cells.state = (dynCellEnabled && _settings && _settings.fieldState)
      ? { __html: '<span class="dyn-enum-cell" data-iid="'+esc(iid)+'" data-rk="'+rk+'" data-field="fieldState" style="'+dynStyle+'">'+esc(deps.dispEnum(item.state)||'—')+'</span>' }
      : esc(deps.dispEnum(item.state)||'—');
    cells.title = esc(item.title||'');
    if (dynEdit) {
      var estDisplay = est !== null && est !== undefined ? deps.fmtPeriod(est) : '';
      /* v2.1.0 E4 — explicit background/color overrides: Ring Table cells
         have their own background and native inputs inherit it (looking
         black in dark theme). Force surface/text vars on inputs. */
      cells.estimate = { __html: '<input type="text" class="dyn-period-input" data-iid="'+esc(iid)+'" data-rk="'+rk+'" value="'+esc(estDisplay)+'" placeholder="'+esc(T('phHours'))+'" style="min-width:70px;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:4px;padding:2px 6px"'+roAttr+'/>' };
      cells.fact = { __html: fact !== null && fact !== undefined ? deps.fmtHoursOnly(fact) : '<span style="color:var(--muted)">—</span>' };
    }
    cells.resource = { __html: fmtDelta(delta) };
    cells.allocation = { __html: '<input type="text" class="alloc-input" data-iid="'+esc(iid)+'" data-rk="'+rk+'" value="'+esc(allocDisplay)+'" placeholder="'+esc(T('phHours'))+'" style="min-width:70px;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:4px;padding:2px 6px"'+roAttr+'/>' };
    cells.incStatus = { __html: '<select class="inc-sel" data-iid="'+esc(iid)+'" data-rk="'+rk+'"'+lockAttr+'>'+
      Object.values(deps.INC).map(function(v){return '<option value="'+v+'"'+(item.inclusionStatus===v?' selected':'')+'>'+esc(deps.incLabel(v))+'</option>';}).join('')+
      '</select>' };
    cells['delete'] = { __html: '<button class="ring-button-button ring-button-inline ring-button-heightM ring-button-ghost ring-button-flat ring-button-iconOnly del-item-btn" data-iid="'+esc(iid)+'" data-rk="'+rk+'"'+lockAttr+' title="'+esc(T('btnDeleteTitle'))+'" aria-label="'+esc(T('aria.btnDeleteRow'))+'">'+deps.icon('trash',T('aria.btnDeleteRow')).outerHTML+'</button>' };

    return { iid: iid, isDirty: isDirty, cells: cells };
  });

  return {
    empty: false,
    itemCount: items.length,
    pageNum: pageNum,
    total: total,
    dynEdit: dynEdit,
    hasExtTicket: hasExtTicket,
    hasSystem: hasSystem,
    hasXPriority: hasXPriority,
    /* Заголовок resource-колонки не-dynEdit режима зависит от роли — часть vm. */
    resourceColTitle: dynEdit
      ? T('thResource')
      : deps.fmtThLabel(deps.roleLabel(deps.ALL_ROLES.find(function(r){return r.key===rk;}) || {key:rk,labelKey:rk})),
    rows: rows,
  };
}

function renderRoleComposition(rk, deps) {
  var T = deps.T, esc = deps.esc, diag = deps.diag;
  var host = document.getElementById('compHost_'+rk);
  if (!host) {
    /* Планировочный вид не смонтирован (открыты настройки / другая вкладка) — рендер-сайд-
       эффект сейва дёрнул рендер невидимой роли; ожидаемый no-op, не ошибка. Если контейнер
       планирования есть, а хоста роли нет — это настоящая аномалия (логируем err). */
    if (document.getElementById('roleAccordions')) diag('renderRoleComposition('+rk+'): host NOT FOUND','err');
    return;
  }
  var vm = _buildRoleCompositionVm(rk, deps);
  var has = !vm.empty;
  diag('renderRoleComposition('+rk+'): items.length='+vm.itemCount+' host=yes has='+has, 'info');
  var clearBtn  = document.getElementById('clearBtn_'+rk);
  var recalcBtn = document.getElementById('recalcBtn_'+rk);
  var refreshBtn = document.getElementById('refreshBtn_'+rk);
  if (clearBtn)  clearBtn.disabled  = !has;
  if (recalcBtn) recalcBtn.disabled = !has;
  if (refreshBtn) refreshBtn.disabled = !has;

  if (!has) {
    if (window.__SSP_TABLE) { try { window.__SSP_TABLE.unmountAt(host); } catch(_){} }
    /* #43 W2 (B-2/D-1) — структурный empty-state; CTA проксирует клик на
       тулбарный pickBtn_<rk> (единая точка входа подбора задач). */
    host.innerHTML = '<div class="ssp-empty">' +
      '<div class="ssp-empty__icon" data-icon="task" aria-hidden="true"></div>' +
      '<div class="ssp-empty__title">' + esc(T('compEmptyTitle')) + '</div>' +
      '<div class="ssp-empty__desc">' + esc(T('compEmptyDesc')) + '</div>' +
      '<button type="button" class="ring-button-button ring-button-block ring-button-heightM ring-button-primaryBlock ring-button-flat ring-button-whiteText editor-btn ssp-empty__cta">' + esc(T('btnPickTasks')) + '</button>' +
      '</div>';
    deps.applyIcons();
    var emptyCtaEl = host.querySelector('.ssp-empty__cta');
    if (emptyCtaEl) emptyCtaEl.addEventListener('click', function() {
      var pb = document.getElementById('pickBtn_' + rk);
      if (pb) pb.click();
    });
    var pagElEmpty = document.getElementById('planPag_'+rk);
    if (pagElEmpty) pagElEmpty.style.display = 'none';
    return;
  }

  var columns = [];
  columns.push({ id: 'id', title: T('thId'), sortable: true, className: 'td-id', getValue: _vmCell });
  if (vm.hasExtTicket) {
    columns.push({ id: 'externalTicketId', title: T('thExternalTicketId'), sortable: true, getValue: _vmCell });
  }
  if (vm.hasSystem) {
    columns.push({ id: 'system', title: T('thSystem'), sortable: false, getValue: _vmCell });
  }
  columns.push({ id: 'priority', title: T('thPriority'), sortable: true, getValue: _vmCell });
  if (vm.hasXPriority) {
    columns.push({ id: 'xpriority', title: T('thXpriority'), sortable: true, getValue: _vmCell });
  }
  columns.push({ id: 'state', title: T('thState'), sortable: false, getValue: _vmCell });
  columns.push({ id: 'title', title: T('thTitle'), sortable: false, className: 'td-title ssp-col-title', getValue: _vmCell });
  if (vm.dynEdit) {
    columns.push({ id: 'estimate', title: T('thEstimate'), sortable: false, className: 'td-num', getValue: _vmCell });
    columns.push({ id: 'fact', title: T('thFact'), sortable: false, className: 'td-num', getValue: _vmCell });
  }
  columns.push({ id: 'resource', title: vm.resourceColTitle, sortable: false, className: 'td-num', getValue: _vmCell });
  columns.push({ id: 'allocation', title: T('thAllocation'), sortable: false, className: 'td-num', getValue: _vmCell });
  columns.push({ id: 'incStatus', title: T('thIncStatus'), sortable: false, getValue: _vmCell });
  columns.push({ id: 'delete', title: '', sortable: false, className: 'ssp-col-action', getValue: _vmCell });

  if (window.__SSP_TABLE) {
    window.__SSP_TABLE.mountAt(host, {
      items: vm.rows,
      columns: columns,
      sortKey: (typeof deps.getSortKey === 'function') ? deps.getSortKey() : 'off',
      onSort: function(nextKey) {
        if (typeof deps.setSortKey === 'function') deps.setSortKey(nextKey);
        if (typeof deps.rerenderAllSortableTables === 'function') deps.rerenderAllSortableTables();
        else deps.renderRoleComposition(rk);
      },
      getItemKey: function(row) { return row.iid; },
      stickyHeader: true,
      emptyText: T('compSprintEmpty'),
    });
  }

  /* v3.2.1 — гейт мутаций состава НА МОМЕНТ СОБЫТИЯ (defense-in-depth поверх
     disabled/readonly разметки): исторический вид — просмотр не-активного спринта
     без WC, где контролы мутировали живой _roleItems активного. Viewer'а здесь НЕ
     гейтим по _isEditor: он false и ДО резолва прав (ложный блок легитимного
     редактора на первых кликах); viewer держат disabled-разметка (permissions.js),
     backend-403 и persist-тосты (_persistErrToast). */
  function _compEditBlocked() {
    var _s = deps.state.getSprint();
    var _cur = deps.state.getCurrentSprintId();
    return !!(_cur && _s && _cur !== _s.sprintId);   /* historical view */
  }

  /* v3.2.1 — persist-ошибки fire-and-forget POST'ов (сеть/403/rev_conflict) раньше
     были unhandled: UI показывал успех, сервер отвергал. rev_conflict уже тостится
     внутри apiPost — не дублируем. */
  function _persistErrToast(e) {
    var msg = (e && e.message) ? e.message : String(e);
    deps.diag('sprint-data persist ERR: ' + msg, 'err');
    if (msg !== 'rev_conflict') { try { deps.toast(deps.T('toastError') + msg, 'err'); } catch (_) {} }
  }

  /* v1.6.2 D127 — стабильный lookup по issueId; индекс в _roleItems[rk] не совпадает
     с позицией в DOM-таблице, когда применена сортировка через multiKeySort. */
  function _findIdxByIid(rkx, iidx) {
    var arr = deps.getRoleItemsArr(rkx);
    for (var __i = 0; __i < arr.length; __i++) {
      if (arr[__i] && arr[__i].issueId === iidx) return __i;
    }
    return -1;
  }

  // Навесить события
  /* Event delegation on host (idempotent). Ring Table does not intercept
     change / focusout events — only clicks. Inputs/selects work via host
     delegation; delete buttons + dyn-enum spans use mousedown-capture
     delegation below. focusout bubbles (unlike blur) and gives us the same
     semantics as legacy blur handlers. Хендлеры читают стейт и сервисы
     через deps В МОМЕНТ события (deps захвачен из биндившего рендера —
     сервисы стабильны, аксессоры live). */
  if (!host.__sspCompHandlersBound) {
    host.__sspCompHandlersBound = true;

    host.addEventListener('change', function(ev) {
      var t = ev.target;
      if (!t || !t.matches || !t.matches('select.inc-sel[data-iid]')) return;
      if (_compEditBlocked()) return;   /* v3.2.1 */
      var rk2 = t.dataset.rk;
      var iid = t.dataset.iid;
      var idx = _findIdxByIid(rk2, iid);
      if (idx < 0) { deps.diag('inc-sel change: item iid='+iid+' not found in role '+rk2,'warn'); return; }
      deps.getRoleItemsArr(rk2)[idx].inclusionStatus = t.value;
      deps.updateRoleRemaining(rk2);
      deps.markDirty('roleItems');
      deps.draftSaveDebounced('roleItems', function(){ return deps.state.getRoleItems(); });
      deps.apiPost('sprint-data', { roleItems: deps.state.getRoleItems() }).catch(_persistErrToast);
    });

    host.addEventListener('focusout', function(ev) {
      var t = ev.target;
      if (!t || !t.matches) return;
      if (t.readOnly) return;
      if ((t.matches('input.alloc-input[data-iid]') || t.matches('input.dyn-period-input[data-iid]'))
          && _compEditBlocked()) return;   /* v3.2.1 */
      /* Аллокация: blur-обработчик (оба режима) */
      if (t.matches('input.alloc-input[data-iid]')) {
        var rk2  = t.dataset.rk;
        var iid  = t.dataset.iid;
        var idx  = _findIdxByIid(rk2, iid);
        if (idx < 0) { deps.diag('alloc-input focusout: item iid='+iid+' not found in role '+rk2,'warn'); return; }
        var item = deps.getRoleItemsArr(rk2)[idx];
        if (!item) return;
        var newVal = deps.parsePeriod(t.value);
        var oldVal = item['alloc_'+rk2];
        if (t.value.trim() === '') newVal = null;
        if (newVal === oldVal) return;
        item['alloc_'+rk2] = newVal;
        if (newVal === null) {
          var est  = item['estimate_'+rk2];
          var fact = item['fact_'+rk2];
          var delta = (est !== null && est !== undefined)
            ? Math.max(0, (est||0)-(fact||0))
            : null;
          t.value = delta !== null ? deps.fmtPeriod(delta) : '';
        } else {
          t.value = deps.fmtPeriod(newVal);
        }
        deps.updateRoleRemaining(rk2);
        deps.markDirty('roleItems');
        deps.draftSaveDebounced('roleItems', function(){ return deps.state.getRoleItems(); });
        deps.apiPost('sprint-data', { roleItems: deps.state.getRoleItems() }).catch(_persistErrToast);
        return;
      }
      /* dynEdit: оценка-period blur */
      if (t.matches('input.dyn-period-input[data-iid]')) {
        var rk3 = t.dataset.rk;
        var iid3 = t.dataset.iid;
        var idx3 = _findIdxByIid(rk3, iid3);
        if (idx3 < 0) { deps.diag('dyn-period-input focusout: item iid='+iid3+' not found in role '+rk3,'warn'); return; }
        var newVal3 = deps.parsePeriod(t.value);
        var item3 = deps.getRoleItemsArr(rk3)[idx3];
        var oldVal3 = item3['estimate_'+rk3];
        if (newVal3 === oldVal3) return;
        var inpEl = t;
        deps.showDynFieldConfirm(
          deps.T('dynModalTitle'),
          deps.T('dynConfirmEst') + ' ' + item3.issueId + ' ' + deps.T('dynConfirmEstTo') + deps.fmtPeriod(newVal3) + '»?',
          null, null,
          function(confirmed) {
            if (confirmed) {
              item3['estimate_'+rk3] = newVal3;
              var _settings3 = deps.state.getSettings();
              deps.updateIssueField(item3.issueId, _settings3[deps.ALL_ROLES.find(function(r){return r.key===rk3;}).fieldEst], newVal3, 'period');
              deps.updateRoleRemaining(rk3);
              deps.renderRoleComposition(rk3);
              deps.apiPost('sprint-data', { roleItems: deps.state.getRoleItems() }).then(function(){ deps.renderRoleComposition(rk3); }).catch(_persistErrToast);
            } else {
              inpEl.value = oldVal3 !== null && oldVal3 !== undefined ? deps.fmtPeriod(oldVal3) : '';
            }
          }
        );
        return;
      }
    });
  }

  /* v2.1.14 — Ring Table на mousedown по содержимому ячейки делает focus/re-render
     строки → кнопка пересоздаётся между mousedown и mouseup → браузер НЕ генерирует
     `click` на первом клике (mousedown/mouseup на разных DOM-элементах; доказано
     инструментально: mousedown✅ mouseup✅ click❌). Старый per-button .onclick и
     click-делегация срабатывали только со 2-го клика (pre-existing класс, как B11).
     Fix: слушаем MOUSEDOWN (приходит всегда, первым) в CAPTURE — данные уже доступны
     (data-iid/rk), действие выполняется сразу. preventDefault гасит Ring row-focus,
     stopPropagation — Ring синтетику. Делегация переживает re-render.
     Инпуты/селекты (alloc-input/inc-sel) НЕ трогаем — им нужен нативный фокус/change.
     Только левая кнопка (ev.button===0). */
  if (!host.__sspCompCaptureBound) {
    host.__sspCompCaptureBound = true;
    host.addEventListener('mousedown', function(ev) {
      if (ev.button !== 0) return;
      var tgt = ev.target;
      if (!tgt || typeof tgt.closest !== 'function') return;
      if (_compEditBlocked()) return;   /* v3.2.1 — делит/enum-мутации только в edit-контексте */

      var delBtn = tgt.closest('button.del-item-btn[data-iid]');
      if (delBtn && host.contains(delBtn)) {
        ev.preventDefault(); ev.stopPropagation();
        var rk2 = delBtn.dataset.rk, iid = delBtn.dataset.iid;
        var idx = _findIdxByIid(rk2, iid);
        if (idx < 0) { deps.diag('del-item-btn click: item iid='+iid+' not found in role '+rk2,'warn'); return; }
        deps.getRoleItemsArr(rk2).splice(idx, 1);
        deps.renderRoleComposition(rk2);
        deps.updateRoleRemaining(rk2);
        deps.markDirty('roleItems');
        deps.draftSaveDebounced('roleItems', function(){ return deps.state.getRoleItems(); });
        deps.apiPost('sprint-data', { roleItems: deps.state.getRoleItems() }).catch(_persistErrToast);
        return;
      }

      var cell = tgt.closest('span.dyn-enum-cell[data-iid]');
      if (cell && host.contains(cell)) {
        ev.preventDefault(); ev.stopPropagation();
        var rkc = cell.dataset.rk, iidc = cell.dataset.iid;
        var idxc = _findIdxByIid(rkc, iidc);
        if (idxc < 0) { deps.diag('dyn-enum-cell click: item iid='+iidc+' not found in role '+rkc,'warn'); return; }
        var dataField = cell.dataset.field;
        var item     = deps.getRoleItemsArr(rkc)[idxc];
        var _settingsC = deps.state.getSettings();
        var fieldName = _settingsC && _settingsC[dataField];
        if (!fieldName) return;
        var fieldTitleMap = { fieldState: deps.T('dynFieldState'), fieldPriority: deps.T('dynFieldPriority'), fieldXPriority: deps.T('dynFieldXpriority'), fieldSystem: deps.T('dynFieldSystem') };
        var itemKeyMap  = { fieldState: 'state', fieldPriority: 'priority', fieldXPriority: 'xpriority', fieldSystem: 'system' };
        var fieldTitle  = fieldTitleMap[dataField] || dataField;
        var itemKey     = itemKeyMap[dataField] || dataField;
        var curVal      = item[itemKey];
        deps.loadEnumBundle(fieldName, function(values) {
          deps.showDynFieldConfirm(
            deps.T('dynModalTitle') + ' «' + fieldTitle + '»',
            deps.T('dynIssuePrefix') + item.issueId,
            values, curVal,
            function(confirmed, newVal) {
              if (confirmed && newVal !== null) {
                item[itemKey] = newVal;
                cell.textContent = deps.localizeEnumVal(newVal) || newVal;
                deps.updateIssueField(item.issueId, fieldName, newVal, 'enum');
                deps.apiPost('sprint-data', { roleItems: deps.state.getRoleItems() }).then(function(){ deps.renderRoleComposition(rkc); }).catch(_persistErrToast);
              }
            }
          );
        });
        return;
      }
    }, true);
  }

  // Пагинация
  var pagEl = document.getElementById('planPag_'+rk);
  if (pagEl) {
    if (vm.total > 1) {
      pagEl.style.display = 'flex';
      var infoEl = document.getElementById('planPageInfo_'+rk);
      if (infoEl) infoEl.textContent = T('pageOf') + vm.pageNum + T('pageOfSep') + vm.total;
      var prevEl = document.getElementById('planPrev_'+rk);
      var nextEl = document.getElementById('planNext_'+rk);
      if (prevEl) prevEl.disabled = vm.pageNum <= 1;
      if (nextEl) nextEl.disabled = vm.pageNum >= vm.total;
    } else {
      pagEl.style.display = 'none';
    }
  }
  _updateRoleAccordionStats(rk, deps);
}

const api = {
  computeRoleQuickStats: computeRoleQuickStats,
  renderRoleAccordion: renderRoleAccordion,
  updateRoleAccordionStats: _updateRoleAccordionStats,
  renderPlanningRoles: renderPlanningRoles,
  renderRoleComposition: renderRoleComposition,
};

if (typeof window !== 'undefined') {
  try { window.__SSP_ROLECOMP_VIEW = api; } catch (_) { /* sandboxed write may throw */ }
}

module.exports = api;
