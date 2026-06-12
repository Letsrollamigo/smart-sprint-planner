/* Current-role tables view — таблицы текущей роли уровня «Люди»
   («Распределение по исполнителям» + таблица задач) и их calc-хелперы.
   Вынесено из legacy-monolith.js (Тир D слайс 2, ступень 1) за мост
   window.__SSP_CURRENTROLE_VIEW; golden-характеризация —
   tests/golden/render-people.golden.test.js (через делегаторы монолита).

   Deps приходят АРГУМЕНТОМ на каждый вызов (фабрика _currentRoleDeps()
   в монолите). Сервисы: T/esc/toast/diag/icon/openModal/safeUrl/toDateIn/
   dispEnum/multiKeySort/getSortKey/setSortKey/rerenderAllSortableTables/
   renderGanttChart/migrateGrade/migrateKpeObject/ALL_ROLES/ACTIVE_INC/
   getActiveRoles/getRoleItemsArr/isActiveSprintRecord/saveCurrentRoleState/
   updateIssueAssigneeField. state — get-аксессоры монолитного стейта,
   в event-хендлерах и async-цепочках читаются СТРОГО В МОМЕНТ обращения
   (урок youtrack-api/standup-view). React-мост таблиц — window.__SSP_TABLE,
   читается с window на каждом вызове. */
'use strict';

/* v1.4.1 D128 — canonical grade keys are English; display локализуется
   через T('grade<Key>'). Легаси-кириллица мигрируется migrate-pure
   (deps.migrateGrade / deps.migrateKpeObject) на чтении. */
var GRADES_LOCAL = ['Intern', 'Junior', 'Middle', 'Senior'];
var KPE_DEFAULTS_LOCAL = { Intern: 0, Junior: 0.5, Middle: 0.65, Senior: 0.75 };

/* Округление до 2 знаков как строка. ⚠ Дважды жертва dead-code аудитов
   (v2.4.11/v2.4.14 — ReferenceError в проде): живых вызовов 6, не сносить. */
function round2(v) { return (Math.round((v || 0) * 100) / 100).toFixed(2); }

/* ── Получить НКЧ в часах из настроек ── */
function getCurrentRoleNkcHours(deps) {
  var _settings = deps.state.getSettings();
  var _currentRoleNkcKey = deps.state.getCurrentRoleNkcKey();
  if (!_settings) return 145;
  if (_currentRoleNkcKey === 'january') return _settings.nkcJanuary || 105;
  if (_currentRoleNkcKey === 'may')     return _settings.nkcMay     || 119;
  return _settings.nkcOther || 145;
}

/* Сумма «использовано» (часы) по исполнителю для текущей роли.
   ⚠ Дважды жертва dead-code аудитов (см. round2) — живые вызовы здесь
   и в updateCurrentRoleTotals; делегатор в монолите — точка входа голденов. */
function calcAssigneeUsed(login, deps) {
  var _currentSprintRoleRec = deps.state.getCurrentSprintRoleRec();
  var _currentRolePP = deps.state.getCurrentRolePP();
  if (!_currentSprintRoleRec || !_currentRolePP) return 0;
  var rec = _currentSprintRoleRec;
  // Для активного спринта используем roleKey сохранённый в PP (выбранный пользователем)
  // Для снэпшота — roleKey из записи истории
  var rk = rec.roleKey || (_currentRolePP && _currentRolePP.roleKey) || (deps.getActiveRoles()[0] || deps.ALL_ROLES[0]).key;
  /* v5.0.3 — если запись соответствует активному _sprint, берём live items
     из _roleItems[rk] (могут быть свежее snapshot); иначе — items из истории. */
  var items = deps.isActiveSprintRecord(rec) ? deps.getRoleItemsArr(rk) : (rec.items || []);
  var ta = _currentRolePP.taskAssignments || {};
  return items.reduce(function (sum, item) {
    if (!ta[item.issueId]) return sum;
    if (ta[item.issueId].assignee !== login) return sum;
    if (deps.ACTIVE_INC.indexOf(item.inclusionStatus) < 0) return sum;
    var alloc = item['alloc_' + rk];
    var est   = item['estimate_' + rk];
    var fact  = item['fact_' + rk];
    var allocVal = (alloc !== null && alloc !== undefined)
      ? alloc / 60  // в часы
      : Math.max(0, ((est || 0) - (fact || 0))) / 60;
    return sum + allocVal;
  }, 0);
}

/* v1.4.0 — Resource breakdown по системам для одного исполнителя.
   Активные items (PLANNED+UNPLANNED), отфильтрованные по taskAssignments[id].assignee===login,
   группируются по item.system (или '__none__'). Часы — alloc/60 либо max(0, est-fact)/60.
   Возвращает массив {system, hours, percent} sorted by hours desc. */
function calcAssigneeAllocByProject(login, deps) {
  var _currentSprintRoleRec = deps.state.getCurrentSprintRoleRec();
  var _currentRolePP = deps.state.getCurrentRolePP();
  if (!_currentSprintRoleRec || !_currentRolePP) return [];
  var rec = _currentSprintRoleRec;
  var rk = rec.roleKey || (_currentRolePP && _currentRolePP.roleKey) || (deps.getActiveRoles()[0] || deps.ALL_ROLES[0]).key;
  var items = deps.isActiveSprintRecord(rec) ? deps.getRoleItemsArr(rk) : (rec.items || []);
  var ta = _currentRolePP.taskAssignments || {};
  var byKey = {};
  items.forEach(function (item) {
    if (deps.ACTIVE_INC.indexOf(item.inclusionStatus) < 0) return;
    if (!ta[item.issueId] || ta[item.issueId].assignee !== login) return;
    var alloc = item['alloc_' + rk];
    var est   = item['estimate_' + rk];
    var fact  = item['fact_' + rk];
    var allocVal = (alloc !== null && alloc !== undefined)
      ? alloc / 60
      : Math.max(0, ((est || 0) - (fact || 0))) / 60;
    var key = item.system ? String(item.system) : '__none__';
    byKey[key] = (byKey[key] || 0) + allocVal;
  });
  var entry = _currentRolePP.resourcesByAssignee[login];
  var totalRes = (entry && typeof entry.resource === 'number') ? entry.resource : 0;
  var rows = Object.keys(byKey).map(function (k) {
    var hours = Math.round(byKey[k] * 100) / 100;
    var percent = totalRes > 0 ? Math.round((hours / totalRes) * 100) : null;
    return { system: k, hours: hours, percent: percent };
  });
  rows.sort(function (a, b) { return b.hours - a.hours; });
  return rows;
}

/* ── Обновить итоги ── */
function updateCurrentRoleTotals(deps) {
  var _currentRolePP = deps.state.getCurrentRolePP();
  if (!_currentRolePP) {
    document.getElementById('currentRoleTotalResource').textContent = '—';
    document.getElementById('currentRoleTotalRemain').textContent = '—';
    return;
  }
  var totalRes = 0;
  Object.keys(_currentRolePP.resourcesByAssignee || {}).forEach(function (login) {
    totalRes += _currentRolePP.resourcesByAssignee[login].resource || 0;
  });
  var totalUsed = 0;
  Object.keys(_currentRolePP.resourcesByAssignee || {}).forEach(function (login) {
    var used = calcAssigneeUsed(login, deps);
    totalUsed += used;
  });
  var totalRemain = totalRes - totalUsed;
  document.getElementById('currentRoleTotalResource').textContent = round2(totalRes);
  var remEl = document.getElementById('currentRoleTotalRemain');
  remEl.textContent = round2(totalRemain);
  remEl.style.color = totalRemain < 0 ? 'var(--error)' : 'var(--success)';
}

/* v2.1.0 E1 — Ring Table is React-owned: per-row remain cells no longer have
   stable IDs to mutate directly. Re-render through Ring Table mountAt (cheap:
   items array rebuild + React reconciliation), then update totals. */
function updateCurrentRoleAssigneeRemain(deps) {
  if (!deps.state.getCurrentRolePP()) return;
  renderCurrentRoleAssigneeTable(deps);
  updateCurrentRoleTotals(deps);
}

/* v2.1.0 E1 — Hybrid controlled-mode Ring Table.
   Ring Table renders inside host #currentRoleAssigneeHost. IIFE owns state
   (_currentRolePP.resourcesByAssignee, manualMode/showByProj flags, all
   change/click handlers); Ring Table is visual only. Cell renderers return
   HTML strings via { __html } so legacy CSS-classes and data-attrs
   (.currentRole-grade-sel, .currentRole-manual-res, .currentRole-del-assignee)
   are preserved. Cell handlers — single event-delegated listener on host,
   bound idempotently on first render. */
function renderCurrentRoleAssigneeTable(deps) {
  var T = deps.T, esc = deps.esc;
  var host = document.getElementById('currentRoleAssigneeHost');
  if (!host) return;
  var _settings = deps.state.getSettings();
  var _currentRolePP = deps.state.getCurrentRolePP();
  var manualMode = !!(_settings && _settings.manualPersonalResource);
  var showByProj = !!(_settings && _settings.fieldSystem && _settings.personalPlanningEnabled);

  if (!_currentRolePP || !Object.keys(_currentRolePP.resourcesByAssignee || {}).length) {
    if (window.__SSP_TABLE) { try { window.__SSP_TABLE.unmountAt(host); } catch (_) {} }
    host.innerHTML = '<div class="empty">' + esc(T('emptyAssignees')) + '</div>';
    return;
  }

  /* Build items array — pre-computed derived values to keep cell renderers cheap. */
  var items = Object.keys(_currentRolePP.resourcesByAssignee).map(function (login) {
    var entry  = _currentRolePP.resourcesByAssignee[login];
    var used   = calcAssigneeUsed(login, deps);
    var remain = Math.round((entry.resource - used) * 100) / 100;
    return {
      login: login,
      entry: entry,
      used: used,
      remain: remain,
    };
  });

  var columns = [];
  columns.push({
    id: 'assigneeName', title: T('thTeamMember'), sortable: false,
    getValue: function (item) { return esc(item.entry.assigneeName || item.login); }
  });
  columns.push({
    id: 'grade', title: T('thGrade'), sortable: false,
    getValue: function (item) {
      var currentGrade = deps.migrateGrade(item.entry.grade);
      var html = '<select class="currentRole-grade-sel" data-login="' + esc(item.login) + '" style="width:100%;font-size:12px">' +
        GRADES_LOCAL.map(function (g) {
          return '<option value="' + g + '"' + (currentGrade === g ? ' selected' : '') + '>' + esc(T('grade' + g)) + '</option>';
        }).join('') +
        '</select>';
      return { __html: html };
    }
  });
  columns.push({
    id: 'resource', title: T('thResourceH'), sortable: false, className: 'td-num',
    getValue: function (item) {
      if (manualMode) {
        var manualVal = (typeof item.entry.manualResource === 'number') ? item.entry.manualResource
                       : (typeof item.entry.resource === 'number' ? item.entry.resource : 0);
        return { __html:
          '<input type="number" min="0" step="0.25" class="currentRole-manual-res" ' +
            'data-login="' + esc(item.login) + '" ' +
            'value="' + round2(manualVal) + '" ' +
            'style="width:80px;font-size:12px;padding:2px 4px;text-align:right;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--text)"/>'
        };
      }
      return round2(item.entry.resource);
    }
  });
  if (showByProj) {
    columns.push({
      id: 'allocByProject', title: T('thAllocByProject'), sortable: false, className: 'td-alloc-by-sys',
      getValue: function (item) {
        var rows = calcAssigneeAllocByProject(item.login, deps);
        if (!rows.length) return { __html: '<span style="color:var(--muted)">—</span>' };
        var hSuf = T('hourShort');
        var rowsHtml = rows.map(function (r) {
          var sysLabel = r.system === '__none__' ? T('allocBySysNoProject') : r.system;
          var pctStr = (r.percent === null) ? '' : (' · ' + r.percent + '%');
          var over = (r.percent !== null && r.percent > 100);
          var cls = 'alloc-by-sys-row' +
                    (over ? ' alloc-by-sys-row--over' : '') +
                    (r.system === '__none__' ? ' alloc-by-sys-row--nosys' : '');
          return '<div class="' + cls + '">' + esc(sysLabel) + ' · ' + round2(r.hours) + hSuf + pctStr + (over ? ' ⚠' : '') + '</div>';
        }).join('');
        return { __html: rowsHtml };
      }
    });
  }
  columns.push({
    id: 'remain', title: T('thRemainH'), sortable: false, className: 'td-num',
    getValue: function (item) {
      var color = item.remain < 0 ? 'var(--error)' : 'var(--success)';
      return { __html: '<span style="color:' + color + '">' + round2(item.remain) + '</span>' };
    }
  });
  columns.push({
    id: 'delete', title: '', sortable: false, className: 'ssp-col-action',
    getValue: function (item) {
      return { __html:
        '<button class="ring-button-button ring-button-inline ring-button-heightM ring-button-ghost ring-button-flat ring-button-iconOnly currentRole-del-assignee" ' +
          'data-login="' + esc(item.login) + '" ' +
          'title="' + esc(T('confirmDelAssignee').replace('?', '')) + '" ' +
          'aria-label="' + esc(T('aria.btnDeleteRow')) + '">' +
          deps.icon('trash', T('aria.btnDeleteRow')).outerHTML +
        '</button>'
      };
    }
  });

  if (window.__SSP_TABLE) {
    window.__SSP_TABLE.mountAt(host, {
      items: items,
      columns: columns,
      sortKey: 'off',
      onSort: function () {},
      getItemKey: function (item) { return item.login; },
      stickyHeader: true,
      emptyText: T('emptyAssignees'),
    });
  }

  /* Event delegation — idempotent. Bind ONCE on host for change events;
     bind ONCE on document for click events (Ring Table's row click handlers
     intercept bubbling, so host-level click delegation does not fire — same
     pattern as _bindSortHeaders / _bindCheckboxEvents). Хендлеры читают стейт
     через deps.state В МОМЕНТ события (deps захвачен из биндившего рендера —
     сервисы стабильны, аксессоры live). */
  if (!host.__sspAssigneeHandlersBound) {
    host.__sspAssigneeHandlersBound = true;

    host.addEventListener('change', function (ev) {
      var t = ev.target;
      if (!t || !t.matches) return;
      var _currentRolePP = deps.state.getCurrentRolePP();
      var _settings = deps.state.getSettings();
      /* Grade select change */
      if (t.matches('select.currentRole-grade-sel[data-login]')) {
        var login = t.getAttribute('data-login');
        if (!_currentRolePP || !_currentRolePP.resourcesByAssignee[login]) return;
        _currentRolePP.resourcesByAssignee[login].grade = t.value;
        var mm = !!(_settings && _settings.manualPersonalResource);
        if (!mm) {
          var nkc2 = getCurrentRoleNkcHours(deps);
          var kpeMap = deps.migrateKpeObject(_settings.kpe || {});
          var kpe   = (kpeMap[t.value] !== undefined) ? kpeMap[t.value] : (KPE_DEFAULTS_LOCAL[t.value] || 0.65);
          var rate  = _settings.rate !== undefined ? _settings.rate : 1;
          var parti = _settings.participation !== undefined ? _settings.participation : 1;
          _currentRolePP.resourcesByAssignee[login].resource = nkc2 * kpe * rate * parti;
          renderCurrentRoleAssigneeTable(deps);
          updateCurrentRoleTotals(deps);
        }
        deps.saveCurrentRoleState();
        return;
      }
      /* Manual resource input change */
      if (t.matches('input.currentRole-manual-res[data-login]')) {
        var login2 = t.getAttribute('data-login');
        if (!_currentRolePP || !_currentRolePP.resourcesByAssignee[login2]) return;
        var v = parseFloat(t.value);
        if (!isFinite(v) || v < 0) v = 0;
        _currentRolePP.resourcesByAssignee[login2].manualResource = v;
        _currentRolePP.resourcesByAssignee[login2].resource = v;
        renderCurrentRoleAssigneeTable(deps);
        updateCurrentRoleTotals(deps);
        deps.saveCurrentRoleState();
        return;
      }
    });
  }

  /* v2.1.14 — MOUSEDOWN-capture делегат (как в renderRoleComposition): Ring Table
     на mousedown пересоздаёт строку → первый `click` не генерируется браузером
     (доказано: mousedown✅ mouseup✅ click❌) → старый .onclick реагировал со 2-го
     клика. Слушаем mousedown (приходит первым, всегда), действие сразу. Переживает
     Ring re-render → per-button rebind + MutationObserver не нужны. Только ЛКМ. */
  if (!host.__sspDelCaptureBound) {
    host.__sspDelCaptureBound = true;
    host.addEventListener('mousedown', function (ev) {
      if (ev.button !== 0) return;
      var tgt = ev.target;
      if (!tgt || typeof tgt.closest !== 'function') return;
      var btn = tgt.closest('button.currentRole-del-assignee[data-login]');
      if (!btn || !host.contains(btn)) return;
      ev.preventDefault(); ev.stopPropagation();
      var login = btn.getAttribute('data-login');
      var _currentRolePP = deps.state.getCurrentRolePP();
      if (!_currentRolePP || !_currentRolePP.resourcesByAssignee[login]) return;
      deps.openModal({
        id: 'delAssignee',
        type: 'destructive',
        title: T('confirmDelAssignee'),
        body: { kind: 'text', text: T('confirmDelAssignee') },
        buttons: [
          { id: 'cancel', text: T('btnCancel'), variant: 'secondary', onClick: function (h) { h.close(); } },
          { id: 'confirm', text: T('btnYesDelete'), variant: 'danger', onClick: function (h) {
            h.close();
            var pp = deps.state.getCurrentRolePP();
            if (pp && pp.resourcesByAssignee) {
              delete pp.resourcesByAssignee[login];
            }
            renderCurrentRoleAssigneeTable(deps);
            renderCurrentRoleTaskTable(deps);
            updateCurrentRoleTotals(deps);
            deps.saveCurrentRoleState();
            deps.toast(T('toastAssigneeDeleted'), 'success');
          }},
        ],
        dismissOnBackdrop: false,
        blockEscape: false,
        showCloseButton: false,
      });
    }, true);
  }
}

/* ── Таблица задач ── */
/* v2.0.0 D128 D7 — Hybrid controlled-mode Ring Table.
   Ring Table renders inside host #currentRoleTaskHost. IIFE owns state
   (getSortKey, _currentRolePP, save handlers); Ring Table is visual only.
   Cell renderers return HTML strings via { __html } so legacy CSS-classes
   and data-attrs (.currentRole-task-assignee, data-ssp-datepicker-host)
   are preserved. Cell change handlers — single event-delegated listener
   on host, bound idempotently on first render. */
function renderCurrentRoleTaskTable(deps) {
  var T = deps.T, esc = deps.esc, safeUrl = deps.safeUrl, toDateIn = deps.toDateIn, dispEnum = deps.dispEnum;
  var host = document.getElementById('currentRoleTaskHost');
  if (!host) return;
  var _currentSprintRoleRec = deps.state.getCurrentSprintRoleRec();
  var _currentRolePP = deps.state.getCurrentRolePP();
  var _settings = deps.state.getSettings();
  var _sprint = deps.state.getSprint();
  /* DatePicker mount/unmount lifecycle is owned by SspDatePickerCell (React
     useEffect cleanup). NO manual __SSP_DATEPICKER.unmountAll / mountAllIn
     calls here — that would double-mount or strip stable roots. */
  if (!_currentSprintRoleRec) {
    if (window.__SSP_TABLE) { try { window.__SSP_TABLE.unmountAt(host); } catch (_) {} }
    host.innerHTML = '<div class="empty">' + esc(T('emptyTaskCurrentRole')) + '</div>';
    return;
  }
  var rec = _currentSprintRoleRec;
  var rk  = rec.roleKey || (_currentRolePP && _currentRolePP.roleKey) || (deps.getActiveRoles()[0] || deps.ALL_ROLES[0]).key;
  /* v5.0.3 — если запись соответствует активному _sprint, берём live items
     из _roleItems[rk] (могут быть свежее snapshot); иначе — items из истории. */
  var items = deps.isActiveSprintRecord(rec) ? deps.getRoleItemsArr(rk) : (rec.items || []);
  var active = items.filter(function (i) { return deps.ACTIVE_INC.indexOf(i.inclusionStatus) >= 0; });
  /* ta defined before sort so multiKeySort can resolve assignee from task-assignments. */
  var ta  = (_currentRolePP && _currentRolePP.taskAssignments) ? _currentRolePP.taskAssignments : {};
  /* v6.1.0 D81 (F4) — multi-key sort на «Люди». Ring Table получает items
     уже отсортированными; sortKey/sortOrder только для header affordance. */
  if (typeof deps.multiKeySort === 'function') active = deps.multiKeySort(active, undefined, ta);
  if (!active.length) {
    if (window.__SSP_TABLE) { try { window.__SSP_TABLE.unmountAt(host); } catch (_) {} }
    host.innerHTML = '<div class="empty">' + esc(T('currentRoleNoTasks')) + '</div>';
    return;
  }
  var rba = (_currentRolePP && _currentRolePP.resourcesByAssignee) ? _currentRolePP.resourcesByAssignee : {};
  var assigneeOptions = Object.keys(rba);
  var sprintStart = rec.dateStart || (_sprint && _sprint.dateStart);
  var sprintEnd   = rec.dateEnd   || (_sprint && _sprint.dateEnd);
  var sprintStartDate = sprintStart ? toDateIn(sprintStart) : '';
  var sprintEndDate   = sprintEnd   ? toDateIn(sprintEnd)   : '';

  function _renderExternalTicketInner(val) {
    if (!val) return '<span style="color:var(--muted)">—</span>';
    var safe = esc(String(val));
    var style = 'style="max-width:12em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block"';
    if (/^https?:\/\//i.test(val)) {
      return '<span ' + style + ' title="' + safe + '"><a href="' + safeUrl(val) + '" target="_blank" rel="noopener noreferrer" class="link">' + safe + '</a></span>';
    }
    return '<span ' + style + ' title="' + safe + '">' + safe + '</span>';
  }

  var columns = [];
  columns.push({
    id: 'id', title: T('thId'), sortable: true, className: 'td-id',
    getValue: function (item) {
      return { __html: '<a href="' + safeUrl(item.url || '') + '" target="_blank" class="link">' + esc(item.issueId) + '</a>' };
    }
  });
  if (_settings && _settings.fieldExternalTicketId) {
    columns.push({
      id: 'externalTicketId', title: T('thExternalTicketId'), sortable: true,
      getValue: function (item) { return { __html: _renderExternalTicketInner(item.externalTicketId) }; }
    });
  }
  columns.push({
    /* min-width keeps task titles legible (default Ring cell collapses to text wrap on every word). */
    id: 'title', title: T('thTitle'), sortable: false, className: 'td-title ssp-col-title',
    getValue: function (item) {
      var taEntry = ta[item.issueId] || {};
      var ts = taEntry.dateStart || null;
      var te = taEntry.dateEnd   || null;
      var oor = (ts && sprintStart && ts < sprintStart) || (te && sprintEnd && te > sprintEnd);
      var warn = oor ? '<span style="color:var(--error);font-size:11px;margin-left:4px">⚠ ' + esc(T('outOfRangeWarn') || 'вне диапазона') + '</span>' : '';
      return { __html: esc(item.title || '') + warn };
    }
  });
  columns.push({
    id: 'priority', title: T('thPriority'), sortable: true, className: 'td-priority',
    getValue: function (item) { return esc(dispEnum(item.priority) || '—'); }
  });
  if (_settings && _settings.fieldXPriority) {
    columns.push({
      id: 'xpriority', title: T('thXpriority'), sortable: true, className: 'td-xpriority',
      getValue: function (item) { return esc(dispEnum(item.xpriority) || '—'); }
    });
  }
  columns.push({
    id: 'allocH', title: T('thAllocH'), sortable: false, className: 'td-num',
    getValue: function (item) {
      var alloc = item['alloc_' + rk];
      var est = item['estimate_' + rk];
      var fact = item['fact_' + rk];
      var allocVal = (alloc !== null && alloc !== undefined) ? alloc : Math.max(0, (est || 0) - (fact || 0));
      return (allocVal / 60).toFixed(2);
    }
  });
  if (_settings && _settings.fieldSystem) {
    columns.push({
      id: 'system', title: T('thSystem'), sortable: true, className: 'td-system',
      getValue: function (item) { return esc(item.system || '—'); }
    });
  }
  /* v1.10.0 B-23 — assignee sortable. compareAssignee применён в multiKeySort
     выше; здесь sortable: true только для header affordance + onSort callback. */
  columns.push({
    id: 'assignee', title: T('thAssignee'), sortable: true,
    getValue: function (item) {
      var taEntry = ta[item.issueId] || {};
      var html = '<select class="currentRole-task-assignee assigner-btn" data-issue="' + esc(item.issueId) + '" style="width:100%;font-size:12px">' +
        '<option value="">' + esc(T('phNotAssigned')) + '</option>' +
        assigneeOptions.map(function (login) {
          var entry = rba[login];
          return '<option value="' + esc(login) + '"' + (taEntry.assignee === login ? ' selected' : '') + '>' + esc(entry.assigneeName || login) + '</option>';
        }).join('') +
        '</select>';
      return { __html: html };
    }
  });
  columns.push({
    id: 'dateStart', title: T('thStart'), sortable: false, className: 'td-date td-start',
    getValue: function (item) {
      var taEntry = ta[item.issueId] || {};
      var ts = taEntry.dateStart || null;
      /* __type: 'datepicker' marker → SspDatePickerCell preserves DatePicker
         React root across Ring Table row re-renders (focus changes). HTML
         string would tear the inner mount down — see D7 lesson #24. */
      return {
        __type: 'datepicker',
        issue: item.issueId,
        className: 'currentRole-task-date currentRole-task-start',
        dateValue: ts ? toDateIn(ts) : sprintStartDate,
        min: sprintStartDate,
        max: sprintEndDate,
      };
    }
  });
  columns.push({
    id: 'dateEnd', title: T('thFinish'), sortable: false, className: 'td-date td-end',
    getValue: function (item) {
      var taEntry = ta[item.issueId] || {};
      var te = taEntry.dateEnd || null;
      return {
        __type: 'datepicker',
        issue: item.issueId,
        className: 'currentRole-task-date currentRole-task-end',
        dateValue: te ? toDateIn(te) : sprintEndDate,
        min: sprintStartDate,
        max: sprintEndDate,
      };
    }
  });

  if (window.__SSP_TABLE) {
    window.__SSP_TABLE.mountAt(host, {
      items: active,
      columns: columns,
      sortKey: deps.getSortKey(),
      onSort: function (nextKey) {
        /* IIFE owns sort state. nextKey is already cycled (off↔active) by table-mount. */
        deps.setSortKey(nextKey);
        if (typeof deps.rerenderAllSortableTables === 'function') {
          deps.rerenderAllSortableTables();
        } else {
          renderCurrentRoleTaskTable(deps);
        }
      },
      getItemKey: function (item) { return item.issueId; },
      stickyHeader: true,
      emptyText: T('currentRoleNoTasks'),
    });
  }

  /* Event delegation для cell handlers — idempotent. Bind ONCE per host.
     Survives Ring Table re-renders (rows might be recreated by React).
     Стейт — через deps.state в момент события. */
  if (!host.__sspHandlersBound) {
    host.__sspHandlersBound = true;
    host.addEventListener('change', function (ev) {
      var t = ev.target;
      if (!t) return;
      var _currentRolePP = deps.state.getCurrentRolePP();
      var _currentSprintRoleRec = deps.state.getCurrentSprintRoleRec();
      var _sprint = deps.state.getSprint();
      var _settings = deps.state.getSettings();
      /* Assignee select change */
      var sel = (t.matches && t.matches('select.currentRole-task-assignee[data-issue]')) ? t : null;
      if (sel) {
        var issueId = sel.getAttribute('data-issue');
        if (!_currentRolePP.taskAssignments) _currentRolePP.taskAssignments = {};
        if (!_currentRolePP.taskAssignments[issueId]) _currentRolePP.taskAssignments[issueId] = {};
        var login = sel.value;
        var rba2 = (_currentRolePP.resourcesByAssignee) || {};
        _currentRolePP.taskAssignments[issueId].assignee = login;
        _currentRolePP.taskAssignments[issueId].assigneeName = login
          ? ((rba2[login] && rba2[login].assigneeName) || login)
          : '';
        /* v5.7.0 — cross-section sync — invalidate ganttColor cache */
        delete _currentRolePP.taskAssignments[issueId].ganttColor;
        var ganttTab = document.getElementById('tab-gantt');
        if (ganttTab && !ganttTab.classList.contains('hidden')
            && typeof deps.renderGanttChart === 'function') {
          try { deps.renderGanttChart(); } catch (e) { deps.diag('renderGanttChart sync err: ' + e, 'err'); }
        }
        updateCurrentRoleTotals(deps);
        updateCurrentRoleAssigneeRemain(deps);
        if (_settings && _settings.fieldSystem && _settings.personalPlanningEnabled) {
          try { renderCurrentRoleAssigneeTable(deps); } catch (_) {}
        }
        deps.saveCurrentRoleState();
        var rkNow = _currentSprintRoleRec && _currentSprintRoleRec.roleKey;
        deps.updateIssueAssigneeField(issueId, login, rkNow);
        return;
      }
      /* DatePicker host change — target is the host span itself (Ring DatePicker
         dispatches change на host через __SSP_DATEPICKER). */
      var dateHost = (t.closest) ? t.closest('span.currentRole-task-date[data-issue]') : null;
      if (dateHost) {
        var issueIdD = dateHost.getAttribute('data-issue');
        if (!_currentRolePP.taskAssignments) _currentRolePP.taskAssignments = {};
        if (!_currentRolePP.taskAssignments[issueIdD]) _currentRolePP.taskAssignments[issueIdD] = {};
        var isStart = dateHost.classList.contains('currentRole-task-start');
        var raw = dateHost.dataset.value || '';
        var tsv = raw ? new Date(raw).getTime() : null;
        if (isStart) {
          _currentRolePP.taskAssignments[issueIdD].dateStart = tsv;
        } else {
          _currentRolePP.taskAssignments[issueIdD].dateEnd = tsv;
        }
        var ss = (_currentSprintRoleRec && _currentSprintRoleRec.dateStart) || (_sprint && _sprint.dateStart);
        var se = (_currentSprintRoleRec && _currentSprintRoleRec.dateEnd)   || (_sprint && _sprint.dateEnd);
        var oor = (tsv && isStart && ss && tsv < ss) || (tsv && !isStart && se && tsv > se);
        dateHost.style.outline = oor ? '1px solid var(--error)' : '';
        dateHost.style.borderRadius = oor ? '4px' : '';
        deps.saveCurrentRoleState();
      }
    });
  }

  /* No manual DatePicker mount here — SspDatePickerCell handles its own
     lifecycle inside React (useEffect). */
}

const api = {
  renderCurrentRoleAssigneeTable: renderCurrentRoleAssigneeTable,
  renderCurrentRoleTaskTable: renderCurrentRoleTaskTable,
  updateCurrentRoleTotals: updateCurrentRoleTotals,
  calcAssigneeUsed: calcAssigneeUsed,
  getCurrentRoleNkcHours: getCurrentRoleNkcHours,
};

if (typeof window !== 'undefined') {
  try { window.__SSP_CURRENTROLE_VIEW = api; } catch (_) { /* sandboxed write may throw */ }
}

module.exports = api;
