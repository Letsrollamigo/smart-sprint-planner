/* Planning-core view — уровень «Роли» вкладки Планирование: accordion-карточки
   ролей (quick-stats/warn перелимита) и таблица состава роли (Ring Table).
   Вынесено из legacy-monolith.js (Тир D слайс 3, ступень 1) за мост
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
  var resource = 0;
  if (role && _sprint && _sprint[role.resKey] != null) {
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
  var stats = computeRoleQuickStats(rk, deps);
  var _uiExpandedRoles = deps.state.getUiExpandedRoles() || {};
  var expanded = !!_uiExpandedRoles[rk];
  var label = (typeof deps.roleLabel === 'function') ? deps.roleLabel(role) : role.label || rk;
  var resStr   = deps.formatHoursLight(stats.resource);
  var allocStr = deps.formatHoursLight(stats.totalAlloc);
  var html = ''
    + '<div class="planning-role-card' + (expanded ? ' expanded' : '') + '" data-role-key="' + rk + '">'
    +   '<button class="planning-role-toggle" type="button" data-role-key="' + rk + '">'
    +     '<span class="planning-role-chevron">' + (expanded ? '▼' : '▶') + '</span>'
    +     '<span class="planning-role-name">' + esc(label) + '</span>'
    +     '<span class="planning-role-stat">' + esc(T('planningRoleStatResource')) + ': <span class="planning-role-stat__num">' + esc(resStr) + '</span> ' + esc(T('planningRoleStatHourSuffix')) + '</span>'
    +     '<span class="planning-role-stat">' + esc(T('planningRoleStatAlloc')) + ': <span class="planning-role-stat__num">' + esc(allocStr) + ' / ' + esc(resStr) + '</span> ' + esc(T('planningRoleStatHourSuffix')) + '</span>'
    +     '<span class="planning-role-stat"><span class="planning-role-stat__num">' + stats.taskCount + '</span> ' + esc(T('planningRoleStatTasks')) + '</span>'
    +     (stats.overlimit ? '<span class="planning-role-warn">' + esc(T('planningRoleStatOverlimit')) + '</span>' : '')
    +   '</button>'
    +   '<div class="planning-role-body" data-role-body="' + rk + '">'
    /* v5.6.0 — Этап 4 (4c): hint и кнопка «Открыть в legacy» удалены.
       В C4 (4d) сюда монтируется полный editable buildRolePanel(role). */
    +     '<div class="planning-role-body__actions">'
    +       '<button class="ring-button-button ring-button-block ring-button-heightS ring-button-primaryBlock ring-button-flat ring-button-whiteText planning-role-jumpPeople" data-role-key="' + rk + '">' + esc(T('btnJumpToPeople')) + '</button>'
    +     '</div>'
    +   '</div>'
    + '</div>';
  return html;
}

function _updateRoleAccordionStats(rk, deps) {
  var card = document.querySelector('.planning-role-card[data-role-key="' + rk + '"]');
  if (!card) return;
  var stats = computeRoleQuickStats(rk, deps);
  var resStr   = deps.formatHoursLight(stats.resource);
  var allocStr = deps.formatHoursLight(stats.totalAlloc);
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
function renderRoleComposition(rk, deps) {
  var T = deps.T, esc = deps.esc, safeUrl = deps.safeUrl, diag = deps.diag;
  var host = document.getElementById('compHost_'+rk);
  if (!host) { diag('renderRoleComposition('+rk+'): host NOT FOUND','err'); return; }
  var _settings = deps.state.getSettings();
  var _sprint = deps.state.getSprint();
  var _currentSprintId = deps.state.getCurrentSprintId();
  /* #25 Ф2 fix — в «историческом виде» (выбран не активный _sprint, без рабочей копии)
     состав читаем из снапшота истории (read-only display), а не из _roleItems активного
     спринта. Иначе шапка показывала счёт снапшота (computeRoleQuickStats), а таблица —
     пустой _roleItems → «Состав спринта пуст». Архитектура не меняется: редактирование
     не-активного спринта по-прежнему только через рабочую копию (read-only снимается там).
     .slice() — чтобы не мутировать _history (items._page ставится ниже). */
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
  var has = items.length > 0;
  diag('renderRoleComposition('+rk+'): items.length='+items.length+' host=yes has='+has, 'info');
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

  var pageNum = items._page || 1;
  var total = Math.ceil(items.length / deps.PAGE_SIZE);
  pageNum = Math.min(pageNum, total);
  items._page = pageNum;
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
     пользователь жмёт «Открыть на правку» в истории (текущая логика сбрасывает
     статус в PLANNING → lock автоматически снимается). Полная working-copy логика — v5.3.0. */
  var isLocked = !!(_sprint && _sprint.status === deps.STATUS.ALLOCATED);
  var roAttr = isLocked ? ' readonly="readonly" tabindex="-1"' : '';
  var dynStyle = 'cursor:pointer;text-decoration:underline dotted;color:var(--primary)';

  /* Pre-compute per-item derived data so cell renderers stay cheap. */
  var pageData = page.map(function(item) {
    var est  = item['estimate_'+rk];
    var fact = item['fact_'+rk];
    var delta = (est !== null && est !== undefined)
      ? ((fact !== null && fact !== undefined) ? ((est||0) - (fact||0)) : (est||0))
      : null;
    var alloc = item['alloc_'+rk];
    var allocDefault = (delta !== null && delta !== undefined) ? Math.max(0, delta) : null;
    var allocVal = (alloc !== null && alloc !== undefined) ? alloc : allocDefault;
    var allocDisplay = allocVal !== null && allocVal !== undefined ? deps.fmtPeriod(allocVal) : '';
    var snap = snapByIssue[item.issueId];
    var isDirty = !snap || JSON.stringify({a:item['alloc_'+rk], i:item.inclusionStatus, e:item['estimate_'+rk], f:item['fact_'+rk]})
                        !== JSON.stringify({a:snap['alloc_'+rk], i:snap.inclusionStatus, e:snap['estimate_'+rk], f:snap['fact_'+rk]});
    return {
      item: item, est: est, fact: fact, delta: delta,
      allocDisplay: allocDisplay, isDirty: isDirty, iid: item.issueId,
    };
  });

  var columns = [];
  columns.push({
    id: 'id', title: T('thId'), sortable: true, className: 'td-id',
    getValue: function(row) {
      return { __html: '<a href="'+safeUrl(row.item.url)+'" target="_blank" class="link">'+esc(row.iid)+'</a>' };
    }
  });
  if (_settings && _settings.fieldExternalTicketId) {
    columns.push({
      id: 'externalTicketId', title: T('thExternalTicketId'), sortable: true,
      getValue: function(row) { return { __html: _renderExternalTicketInnerHtml(row.item.externalTicketId, deps) }; }
    });
  }
  if (_settings && _settings.fieldSystem) {
    columns.push({
      id: 'system', title: T('thSystem'), sortable: false,
      getValue: function(row) {
        if (dynEdit) {
          return { __html: '<span class="dyn-enum-cell" data-iid="'+esc(row.iid)+'" data-rk="'+rk+'" data-field="fieldSystem" style="'+dynStyle+'">'+esc(row.item.system||'—')+'</span>' };
        }
        return esc(row.item.system||'—');
      }
    });
  }
  columns.push({
    id: 'priority', title: T('thPriority'), sortable: true,
    getValue: function(row) {
      if (dynEdit && _settings && _settings.fieldPriority) {
        return { __html: '<span class="dyn-enum-cell" data-iid="'+esc(row.iid)+'" data-rk="'+rk+'" data-field="fieldPriority" style="'+dynStyle+'">'+esc(deps.dispEnum(row.item.priority)||'—')+'</span>' };
      }
      return esc(deps.dispEnum(row.item.priority)||'—');
    }
  });
  if (_settings && _settings.fieldXPriority) {
    columns.push({
      id: 'xpriority', title: T('thXpriority'), sortable: true,
      getValue: function(row) {
        if (dynEdit) {
          return { __html: '<span class="dyn-enum-cell" data-iid="'+esc(row.iid)+'" data-rk="'+rk+'" data-field="fieldXPriority" style="'+dynStyle+'">'+esc(deps.dispEnum(row.item.xpriority)||'—')+'</span>' };
        }
        return esc(deps.dispEnum(row.item.xpriority)||'—');
      }
    });
  }
  columns.push({
    id: 'state', title: T('thState'), sortable: false,
    getValue: function(row) {
      if (dynEdit && _settings && _settings.fieldState) {
        return { __html: '<span class="dyn-enum-cell" data-iid="'+esc(row.iid)+'" data-rk="'+rk+'" data-field="fieldState" style="'+dynStyle+'">'+esc(deps.dispEnum(row.item.state)||'—')+'</span>' };
      }
      return esc(deps.dispEnum(row.item.state)||'—');
    }
  });
  columns.push({
    id: 'title', title: T('thTitle'), sortable: false, className: 'td-title ssp-col-title',
    getValue: function(row) { return esc(row.item.title||''); }
  });
  if (dynEdit) {
    columns.push({
      id: 'estimate', title: T('thEstimate'), sortable: false, className: 'td-num',
      getValue: function(row) {
        var estDisplay = row.est !== null && row.est !== undefined ? deps.fmtPeriod(row.est) : '';
        /* v2.1.0 E4 — explicit background/color overrides: Ring Table cells
           have their own background and native inputs inherit it (looking
           black in dark theme). Force surface/text vars on inputs. */
        return { __html: '<input type="text" class="dyn-period-input" data-iid="'+esc(row.iid)+'" data-rk="'+rk+'" value="'+esc(estDisplay)+'" placeholder="'+esc(T('phHours'))+'" style="min-width:70px;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:4px;padding:2px 6px"'+roAttr+'/>' };
      }
    });
    columns.push({
      id: 'fact', title: T('thFact'), sortable: false, className: 'td-num',
      getValue: function(row) {
        return { __html: row.fact !== null && row.fact !== undefined ? deps.fmtHoursOnly(row.fact) : '<span style="color:var(--muted)">—</span>' };
      }
    });
    columns.push({
      id: 'resource', title: T('thResource'), sortable: false, className: 'td-num',
      getValue: function(row) { return { __html: fmtDelta(row.delta) }; }
    });
  } else {
    columns.push({
      id: 'resource', title: deps.fmtThLabel(deps.roleLabel(deps.ALL_ROLES.find(function(r){return r.key===rk;}) || {key:rk,labelKey:rk})), sortable: false, className: 'td-num',
      getValue: function(row) { return { __html: fmtDelta(row.delta) }; }
    });
  }
  columns.push({
    id: 'allocation', title: T('thAllocation'), sortable: false, className: 'td-num',
    getValue: function(row) {
      return { __html: '<input type="text" class="alloc-input" data-iid="'+esc(row.iid)+'" data-rk="'+rk+'" value="'+esc(row.allocDisplay)+'" placeholder="'+esc(T('phHours'))+'" style="min-width:70px;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:4px;padding:2px 6px"'+roAttr+'/>' };
    }
  });
  columns.push({
    id: 'incStatus', title: T('thIncStatus'), sortable: false,
    getValue: function(row) {
      var html = '<select class="inc-sel" data-iid="'+esc(row.iid)+'" data-rk="'+rk+'">'+
        Object.values(deps.INC).map(function(v){return '<option value="'+v+'"'+(row.item.inclusionStatus===v?' selected':'')+'>'+esc(deps.incLabel(v))+'</option>';}).join('')+
        '</select>';
      return { __html: html };
    }
  });
  columns.push({
    id: 'delete', title: '', sortable: false, className: 'ssp-col-action',
    getValue: function(row) {
      return { __html: '<button class="ring-button-button ring-button-inline ring-button-heightM ring-button-ghost ring-button-flat ring-button-iconOnly del-item-btn" data-iid="'+esc(row.iid)+'" data-rk="'+rk+'" title="'+esc(T('btnDeleteTitle'))+'" aria-label="'+esc(T('aria.btnDeleteRow'))+'">'+deps.icon('trash',T('aria.btnDeleteRow')).outerHTML+'</button>' };
    }
  });

  if (window.__SSP_TABLE) {
    window.__SSP_TABLE.mountAt(host, {
      items: pageData,
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
      var rk2 = t.dataset.rk;
      var iid = t.dataset.iid;
      var idx = _findIdxByIid(rk2, iid);
      if (idx < 0) { deps.diag('inc-sel change: item iid='+iid+' not found in role '+rk2,'warn'); return; }
      deps.getRoleItemsArr(rk2)[idx].inclusionStatus = t.value;
      deps.updateRoleRemaining(rk2);
      deps.markDirty('roleItems');
      deps.draftSaveDebounced('roleItems', function(){ return deps.state.getRoleItems(); });
      deps.apiPost('sprint-data', { roleItems: deps.state.getRoleItems() });
    });

    host.addEventListener('focusout', function(ev) {
      var t = ev.target;
      if (!t || !t.matches) return;
      if (t.readOnly) return;
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
        deps.apiPost('sprint-data', { roleItems: deps.state.getRoleItems() });
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
              deps.apiPost('sprint-data', { roleItems: deps.state.getRoleItems() }).then(function(){ deps.renderRoleComposition(rk3); });
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
        deps.apiPost('sprint-data', { roleItems: deps.state.getRoleItems() });
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
                deps.apiPost('sprint-data', { roleItems: deps.state.getRoleItems() }).then(function(){ deps.renderRoleComposition(rkc); });
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
    if (total > 1) {
      pagEl.style.display = 'flex';
      var infoEl = document.getElementById('planPageInfo_'+rk);
      if (infoEl) infoEl.textContent = T('pageOf') + pageNum + T('pageOfSep') + total;
      var prevEl = document.getElementById('planPrev_'+rk);
      var nextEl = document.getElementById('planNext_'+rk);
      if (prevEl) prevEl.disabled = pageNum <= 1;
      if (nextEl) nextEl.disabled = pageNum >= total;
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
  renderRoleComposition: renderRoleComposition,
};

if (typeof window !== 'undefined') {
  try { window.__SSP_ROLECOMP_VIEW = api; } catch (_) { /* sandboxed write may throw */ }
}

module.exports = api;
