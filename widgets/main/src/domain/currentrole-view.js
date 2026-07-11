/* Current-role tables view — таблицы текущей роли уровня «Люди»
   («Распределение по исполнителям» + таблица задач) и их calc-хелперы.
   Вынесено из core.js (Тир D слайс 2, ступень 1) за мост
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
  /* #45 R4 §9.2 — ресурс человека через адаптер (Full+approved → base×alloc; Light → entry.resource). */
  var totalRes = deps.getApprovedCapacityForPerson(login, rk);
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
  var _ppRk = _currentRolePP.roleKey;
  var totalRes = 0;
  Object.keys(_currentRolePP.resourcesByAssignee || {}).forEach(function (login) {
    /* #45 R4 §9.2 — Full→утверждённая ёмкость, Light→entry.resource (адаптер fallback). */
    totalRes += deps.getApprovedCapacityForPerson(login, _ppRk) || 0;
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
/* Ступень 2 (Тир D слайс 2): вся cell-логика — в vm-билдере; колонки таблицы —
   тупой маппинг row.cells[col.id]. Значения ячеек байт-в-байт прежние,
   контракт «модуль → __SSP_TABLE» не менялся — оракул (materializeTable)
   остаётся diff 0. */
function _vmCell(row, c) { return row.cells[c.id]; }

function _buildAssigneeTableVm(deps) {
  var T = deps.T, esc = deps.esc;
  var _settings = deps.state.getSettings();
  var _currentRolePP = deps.state.getCurrentRolePP();
  /* #45 R4 §9.3 — в Full ресурс деривируется из утверждённой ёмкости → manual-ввод выкл (read-only). */
  var fullMode = !!(_settings && _settings.capacityMode === 'full');
  var manualMode = !fullMode && !!(_settings && _settings.manualPersonalResource);
  var showByProj = !!(_settings && _settings.fieldSystem && _settings.personalPlanningEnabled);

  if (!_currentRolePP || !Object.keys(_currentRolePP.resourcesByAssignee || {}).length) {
    return { empty: true };
  }

  var _ppRk = _currentRolePP.roleKey;
  /* Строки vm — pre-computed derived values + готовые cell-значения. */
  var rows = Object.keys(_currentRolePP.resourcesByAssignee).map(function (login) {
    var entry  = _currentRolePP.resourcesByAssignee[login];
    var used   = calcAssigneeUsed(login, deps);
    /* #45 R4 §9.2 — ресурс через адаптер (Full+approved → base×alloc; Light → entry.resource). */
    var _res   = deps.getApprovedCapacityForPerson(login, _ppRk);
    var remain = Math.round((_res - used) * 100) / 100;
    var cells = {};
    cells.assigneeName = esc(entry.assigneeName || login);
    var currentGrade = deps.migrateGrade(entry.grade);
    cells.grade = { __html:
      '<select class="currentRole-grade-sel" data-login="' + esc(login) + '" style="width:100%;font-size:12px">' +
        GRADES_LOCAL.map(function (g) {
          return '<option value="' + g + '"' + (currentGrade === g ? ' selected' : '') + '>' + esc(T('grade' + g)) + '</option>';
        }).join('') +
        '</select>'
    };
    if (manualMode) {
      var manualVal = (typeof entry.manualResource === 'number') ? entry.manualResource
                     : (typeof entry.resource === 'number' ? entry.resource : 0);
      cells.resource = { __html:
        '<input type="number" min="0" step="0.25" class="currentRole-manual-res" ' +
          'data-login="' + esc(login) + '" ' +
          'value="' + round2(manualVal) + '" ' +
          'style="width:80px;font-size:12px;padding:2px 4px;text-align:right;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--text)"/>'
      };
    } else {
      cells.resource = round2(_res);
    }
    if (showByProj) {
      var rowsBySys = calcAssigneeAllocByProject(login, deps);
      if (!rowsBySys.length) {
        cells.allocByProject = { __html: '<span style="color:var(--muted)">—</span>' };
      } else {
        var hSuf = T('hourShort');
        cells.allocByProject = { __html: rowsBySys.map(function (r) {
          var sysLabel = r.system === '__none__' ? T('allocBySysNoProject') : r.system;
          var pctStr = (r.percent === null) ? '' : (' · ' + r.percent + '%');
          var over = (r.percent !== null && r.percent > 100);
          var cls = 'alloc-by-sys-row' +
                    (over ? ' alloc-by-sys-row--over' : '') +
                    (r.system === '__none__' ? ' alloc-by-sys-row--nosys' : '');
          return '<div class="' + cls + '">' + esc(sysLabel) + ' · ' + round2(r.hours) + hSuf + pctStr + (over ? ' ⚠' : '') + '</div>';
        }).join('') };
      }
    }
    var remainColor = remain < 0 ? 'var(--error)' : 'var(--success)';
    cells.remain = { __html: '<span style="color:' + remainColor + '">' + round2(remain) + '</span>' };
    cells['delete'] = { __html:
      '<button class="ring-button-button ring-button-inline ring-button-heightM ring-button-ghost ring-button-flat ring-button-iconOnly currentRole-del-assignee" ' +
        'data-login="' + esc(login) + '" ' +
        'title="' + esc(T('confirmDelAssignee').replace('?', '')) + '" ' +
        'aria-label="' + esc(T('aria.btnDeleteRow')) + '">' +
        deps.icon('trash', T('aria.btnDeleteRow')).outerHTML +
      '</button>'
    };
    return { login: login, cells: cells };
  });

  return { showByProj: showByProj, rows: rows };
}

function renderCurrentRoleAssigneeTable(deps) {
  var T = deps.T, esc = deps.esc;
  var host = document.getElementById('currentRoleAssigneeHost');
  if (!host) return;
  var vm = _buildAssigneeTableVm(deps);

  if (vm.empty) {
    if (window.__SSP_TABLE) { try { window.__SSP_TABLE.unmountAt(host); } catch (_) {} }
    host.innerHTML = '<div class="empty">' + esc(T('emptyAssignees')) + '</div>';
    return;
  }

  var columns = [];
  columns.push({ id: 'assigneeName', title: T('thTeamMember'), sortable: false, getValue: _vmCell });
  columns.push({ id: 'grade', title: T('thGrade'), sortable: false, getValue: _vmCell });
  columns.push({ id: 'resource', title: T('thResourceH'), sortable: false, className: 'td-num', getValue: _vmCell });
  if (vm.showByProj) {
    columns.push({ id: 'allocByProject', title: T('thAllocByProject'), sortable: false, className: 'td-alloc-by-sys', getValue: _vmCell });
  }
  columns.push({ id: 'remain', title: T('thRemainH'), sortable: false, className: 'td-num', getValue: _vmCell });
  columns.push({ id: 'delete', title: '', sortable: false, className: 'ssp-col-action', getValue: _vmCell });

  if (window.__SSP_TABLE) {
    window.__SSP_TABLE.mountAt(host, {
      items: vm.rows,
      columns: columns,
      sortKey: 'off',
      onSort: function () {},
      getItemKey: function (row) { return row.login; },
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
        if (!mm && _settings) {   /* v3.2.1 — _settings=null ронял _settings.kpe ниже */
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
function _buildTaskTableVm(deps) {
  var T = deps.T, esc = deps.esc, safeUrl = deps.safeUrl, toDateIn = deps.toDateIn, dispEnum = deps.dispEnum;
  var _currentSprintRoleRec = deps.state.getCurrentSprintRoleRec();
  var _currentRolePP = deps.state.getCurrentRolePP();
  var _settings = deps.state.getSettings();
  var _sprint = deps.state.getSprint();

  if (!_currentSprintRoleRec) return { empty: 'noRec' };

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
  if (!active.length) return { empty: 'noTasks' };

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

  var hasExternalTicket = !!(_settings && _settings.fieldExternalTicketId);
  var hasXPriority = !!(_settings && _settings.fieldXPriority);
  var hasSystem = !!(_settings && _settings.fieldSystem);
  var hasState = !!(_settings && _settings.fieldState);   /* #polish — read-only статус задачи по настройке поля состояния */

  /* #40 — колонка «№»: позиция задачи в виртуальной очереди исполнителя (даты→rank→id). */
  var showQueue = !!(_settings && _settings.autoForecastEnabled);
  var queuePos = {}, queueLen = {};
  if (showQueue && _currentRolePP) {
    var FPq = _forecastPure();
    if (FPq) {
      var _blq = _forecastByLogin(deps, rec, _currentRolePP, rk, null);
      Object.keys(_blq).forEach(function (login) {
        var orderedQ = FPq.orderQueue(_blq[login]);
        orderedQ.forEach(function (t, idx) {
          queuePos[t.issueId] = idx + 1;
          queueLen[t.issueId] = orderedQ.length;
        });
      });
    }
  }

  /* v3.2.1 — unfit-сет валиден только в контексте своего прогноза (sprintId_rk). */
  var unfitSet = _forecastUnfitFor(deps.state.getCurrentSprintRoleRec());
  var rows = active.map(function (item) {
    var taEntry = ta[item.issueId] || {};
    var cells = {};
    cells.id = { __html: '<a href="' + safeUrl(item.url || '') + '" target="_blank" class="link">' + esc(item.issueId) + '</a>' };
    if (hasExternalTicket) {
      cells.externalTicketId = { __html: _renderExternalTicketInner(item.externalTicketId) };
    }
    var ts = taEntry.dateStart || null;
    var te = taEntry.dateEnd   || null;
    var oor = (ts && sprintStart && ts < sprintStart) || (te && sprintEnd && te > sprintEnd);
    var warn = oor ? '<span style="color:var(--error);font-size:11px;margin-left:4px">⚠ ' + esc(T('outOfRangeWarn') || 'вне диапазона') + '</span>' : '';
    /* #40 — transient-бейдж «не помещается в ёмкость» последнего прогноза (сессионный). */
    var unfitWarn = unfitSet[item.issueId]
      ? '<span style="color:var(--error);font-size:11px;margin-left:4px">⚠ ' + esc(T('forecastUnfitBadge')) + '</span>' : '';
    cells.title = { __html: esc(item.title || '') + warn + unfitWarn };
    if (hasState) { cells.state = esc(dispEnum(item.state) || '—'); }   /* #polish — read-only статус (как rolecomposition state-cell read-only ветка) */
    cells.priority = esc(dispEnum(item.priority) || '—');
    if (hasXPriority) {
      cells.xpriority = esc(dispEnum(item.xpriority) || '—');
    }
    var alloc = item['alloc_' + rk];
    var est = item['estimate_' + rk];
    var fact = item['fact_' + rk];
    var allocVal = (alloc !== null && alloc !== undefined) ? alloc : Math.max(0, (est || 0) - (fact || 0));
    cells.allocH = (allocVal / 60).toFixed(2);
    if (hasSystem) {
      cells.system = esc(item.system || '—');
    }
    cells.assignee = { __html:
      '<select class="currentRole-task-assignee assigner-btn" data-issue="' + esc(item.issueId) + '" style="width:100%;font-size:12px">' +
        '<option value="">' + esc(T('phNotAssigned')) + '</option>' +
        assigneeOptions.map(function (login) {
          var entry = rba[login];
          return '<option value="' + esc(login) + '"' + (taEntry.assignee === login ? ' selected' : '') + '>' + esc(entry.assigneeName || login) + '</option>';
        }).join('') +
        '</select>'
    };
    /* #40 — «№» очереди + стрелки ↑/↓ (только назначенным; края очереди disabled). */
    if (showQueue) {
      var qp = queuePos[item.issueId] || null;
      var qn = queueLen[item.issueId] || 0;
      cells.queue = { __html: qp
        ? '<span style="display:inline-flex;align-items:center;gap:2px;white-space:nowrap">' + qp +
          '<button type="button" class="currentRole-queue-move" data-issue="' + esc(item.issueId) + '" data-dir="up" title="' + esc(T('queueMoveUp')) + '"' + (qp === 1 ? ' disabled' : '') + '>&#9650;</button>' +
          '<button type="button" class="currentRole-queue-move" data-issue="' + esc(item.issueId) + '" data-dir="down" title="' + esc(T('queueMoveDown')) + '"' + (qp === qn ? ' disabled' : '') + '>&#9660;</button></span>'
        : '<span style="color:var(--muted)">—</span>' };
    }
    /* __type: 'datepicker' marker → SspDatePickerCell preserves DatePicker
       React root across Ring Table row re-renders (focus changes). HTML
       string would tear the inner mount down — see D7 lesson #24. */
    cells.dateStart = {
      __type: 'datepicker',
      issue: item.issueId,
      className: 'currentRole-task-date currentRole-task-start',
      dateValue: ts ? toDateIn(ts) : sprintStartDate,
      min: sprintStartDate,
      max: sprintEndDate,
    };
    cells.dateEnd = {
      __type: 'datepicker',
      issue: item.issueId,
      className: 'currentRole-task-date currentRole-task-end',
      dateValue: te ? toDateIn(te) : sprintEndDate,
      min: sprintStartDate,
      max: sprintEndDate,
    };
    return { issueId: item.issueId, cells: cells };
  });

  return {
    rows: rows,
    sortKey: deps.getSortKey(),
    hasExternalTicket: hasExternalTicket,
    hasXPriority: hasXPriority,
    hasSystem: hasSystem,
    hasState: hasState,
    showQueue: showQueue,   /* #40 */
  };
}

function renderCurrentRoleTaskTable(deps) {
  var T = deps.T, esc = deps.esc;
  var host = document.getElementById('currentRoleTaskHost');
  if (!host) return;
  /* #40 — видимость и бинд кнопки «Спрогнозировать даты» (гейт по настройке;
     стейт читается через deps.state в момент клика — deps-функции стабильны). */
  var fbtn = document.getElementById('currentRoleForecastBtn');
  if (fbtn) {
    var _fcSettings = deps.state.getSettings();
    fbtn.classList.toggle('hidden', !(_fcSettings && _fcSettings.autoForecastEnabled));
    if (!fbtn.__sspForecastBound) {
      fbtn.__sspForecastBound = true;
      fbtn.addEventListener('click', function () { doForecastDates(deps); });
    }
  }
  /* DatePicker mount/unmount lifecycle is owned by SspDatePickerCell (React
     useEffect cleanup). NO manual __SSP_DATEPICKER.unmountAll / mountAllIn
     calls here — that would double-mount or strip stable roots. */
  var vm = _buildTaskTableVm(deps);

  if (vm.empty === 'noRec') {
    if (window.__SSP_TABLE) { try { window.__SSP_TABLE.unmountAt(host); } catch (_) {} }
    host.innerHTML = '<div class="empty">' + esc(T('emptyTaskCurrentRole')) + '</div>';
    return;
  }
  if (vm.empty === 'noTasks') {
    if (window.__SSP_TABLE) { try { window.__SSP_TABLE.unmountAt(host); } catch (_) {} }
    host.innerHTML = '<div class="empty">' + esc(T('currentRoleNoTasks')) + '</div>';
    return;
  }

  var columns = [];
  columns.push({ id: 'id', title: T('thId'), sortable: true, className: 'td-id', getValue: _vmCell });
  if (vm.hasExternalTicket) {
    columns.push({ id: 'externalTicketId', title: T('thExternalTicketId'), sortable: true, getValue: _vmCell });
  }
  /* min-width keeps task titles legible (default Ring cell collapses to text wrap on every word). */
  columns.push({ id: 'title', title: T('thTitle'), sortable: false, className: 'td-title ssp-col-title', getValue: _vmCell });
  if (vm.hasState) {   /* #polish — read-only статус задачи (по настройке fieldState) */
    columns.push({ id: 'state', title: T('thState'), sortable: false, className: 'td-state', getValue: _vmCell });
  }
  columns.push({ id: 'priority', title: T('thPriority'), sortable: true, className: 'td-priority', getValue: _vmCell });
  if (vm.hasXPriority) {
    columns.push({ id: 'xpriority', title: T('thXpriority'), sortable: true, className: 'td-xpriority', getValue: _vmCell });
  }
  columns.push({ id: 'allocH', title: T('thAllocH'), sortable: false, className: 'td-num', getValue: _vmCell });
  if (vm.hasSystem) {
    columns.push({ id: 'system', title: T('thSystem'), sortable: true, className: 'td-system', getValue: _vmCell });
  }
  /* v1.10.0 B-23 — assignee sortable. compareAssignee применён в multiKeySort
     в vm-билдере; здесь sortable: true только для header affordance + onSort callback. */
  columns.push({ id: 'assignee', title: T('thAssignee'), sortable: true, getValue: _vmCell });
  if (vm.showQueue) {   /* #40 — очередь исполнителя */
    columns.push({ id: 'queue', title: T('thQueue'), sortable: false, className: 'td-queue', getValue: _vmCell });
  }
  columns.push({ id: 'dateStart', title: T('thStart'), sortable: false, className: 'td-date td-start', getValue: _vmCell });
  columns.push({ id: 'dateEnd', title: T('thFinish'), sortable: false, className: 'td-date td-end', getValue: _vmCell });

  if (window.__SSP_TABLE) {
    window.__SSP_TABLE.mountAt(host, {
      items: vm.rows,
      columns: columns,
      sortKey: vm.sortKey,
      onSort: function (nextKey) {
        /* IIFE owns sort state. nextKey is already cycled (off↔active) by table-mount. */
        deps.setSortKey(nextKey);
        if (typeof deps.rerenderAllSortableTables === 'function') {
          deps.rerenderAllSortableTables();
        } else {
          renderCurrentRoleTaskTable(deps);
        }
      },
      getItemKey: function (row) { return row.issueId; },
      stickyHeader: true,
      emptyText: T('currentRoleNoTasks'),
    });
  }

  /* #40 — стрелки очереди: MOUSEDOWN-capture делегат (канон Ring Table — mousedown
     приходит всегда, click теряется при пересоздании строки; см. del-assignee). */
  if (!host.__sspQueueBound) {
    host.__sspQueueBound = true;
    host.addEventListener('mousedown', function (ev) {
      if (ev.button !== 0) return;
      var tgt = ev.target;
      if (!tgt || typeof tgt.closest !== 'function') return;
      var qbtn = tgt.closest('button.currentRole-queue-move[data-issue]');
      if (!qbtn || !host.contains(qbtn) || qbtn.disabled) return;
      ev.preventDefault(); ev.stopPropagation();
      _onQueueMove(deps, qbtn.getAttribute('data-issue'), qbtn.getAttribute('data-dir'));
    }, true);
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
      /* v3.2.1 — pp=null при живом rec достижим (draft-restore setCurrentRolePP(dd.pp||null)):
         хендлеры ниже писали в _currentRolePP.taskAssignments без guard'а → TypeError,
         назначение терялось. Grade-хендлер аналогичный guard уже имеет. */
      if (!_currentRolePP) return;
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
        /* #40 — смена исполнителя меняет очереди обоих исполнителей → перерендер
           таблицы (иначе колонка «№» показывает «—»/устаревшие позиции до релоада). */
        if (_settings && _settings.autoForecastEnabled) {
          try { renderCurrentRoleTaskTable(deps); } catch (_) {}
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


/* ── Контроллеры кнопок уровня «Люди» ── */
/* ─── «Рассчитать ресурс» — пересчитать часы для ТЕКУЩЕГО списка исполнителей ─── */
function doRecalcResource(deps) {
  var T = deps.T;
  var _settings = deps.state.getSettings();
  var _currentRolePP = deps.state.getCurrentRolePP();
  if (!_currentRolePP || !Object.keys(_currentRolePP.resourcesByAssignee || {}).length) {
    deps.toast(T('toastAssigneesEmpty'));
    return;
  }
  if (!_settings) return;   /* v3.2.1 — паттерн doCurrentRoleCalc: без настроек не считаем */
  var nkc = getCurrentRoleNkcHours(deps);
  var kpeMap = deps.migrateKpeObject(_settings.kpe || {});
  var mm = !!(_settings && _settings.manualPersonalResource);
  Object.keys(_currentRolePP.resourcesByAssignee).forEach(function (login) {
    if (mm) return;
    var entry = _currentRolePP.resourcesByAssignee[login];
    var g = deps.migrateGrade(entry.grade);
    var kpe   = (kpeMap[g] !== undefined) ? kpeMap[g] : (KPE_DEFAULTS_LOCAL[g] || 0.65);
    var rate  = _settings.rate         !== undefined ? _settings.rate         : 1;
    var parti = _settings.participation !== undefined ? _settings.participation : 1;
    entry.resource = nkc * kpe * rate * parti;
  });
  _currentRolePP.nkcKey = deps.state.getCurrentRoleNkcKey();
  _currentRolePP.calculatedAt = Date.now();
  renderCurrentRoleAssigneeTable(deps);
  updateCurrentRoleTotals(deps);
  deps.saveCurrentRoleState();
  deps.toast(T('toastResourceRecalc'), 'success');
}

/* ─── «Подобрать исполнителей» — загрузить актуальный список из бандла поля ─── */
function doCurrentRoleCalc(deps) {
  var T = deps.T, toast = deps.toast, diag = deps.diag;
  var _currentSprintRoleRec = deps.state.getCurrentSprintRoleRec();
  var _settings = deps.state.getSettings();
  var _currentRolePP = deps.state.getCurrentRolePP();
  if (!_currentSprintRoleRec) { toast(T('toastSelectSprint')); return; }
  if (!_settings) { toast(T('toastFillSettings')); return; }

  var rec = _currentSprintRoleRec;
  var nkc = getCurrentRoleNkcHours(deps);

  // Сохраняем текущие грейды из снэпшота — они не должны теряться при перезагрузке
  var savedGrades = {};
  if (_currentRolePP && _currentRolePP.resourcesByAssignee) {
    Object.keys(_currentRolePP.resourcesByAssignee).forEach(function (login) {
      savedGrades[login] = deps.migrateGrade(_currentRolePP.resourcesByAssignee[login].grade) || 'Middle';
    });
  }
  var manualMode = !!(_settings && _settings.manualPersonalResource);
  var savedResources = {};
  if (manualMode && _currentRolePP && _currentRolePP.resourcesByAssignee) {
    Object.keys(_currentRolePP.resourcesByAssignee).forEach(function (login) {
      var e = _currentRolePP.resourcesByAssignee[login];
      savedResources[login] = { resource: e.resource, manualResource: e.manualResource };
    });
  }

  // Определить роли спринта
  var roles;
  if (rec.roleKey) {
    // Снэпшот из истории — одна конкретная роль
    var singleRole = deps.ALL_ROLES.find(function (r) { return r.key === rec.roleKey; });
    roles = singleRole ? [singleRole] : [];
  } else {
    /* v5.6.0 — Этап 4 (4c): legacy #distribRoleSel удалён. Активная роль читается из
       _activeSubtab (текущий уровень «Люди» или раскрытая accordion-карточка) или
       localStorage.ssp_lastActiveRole. */
    var selectedRoleKey = deps.state.getActiveSubtab();
    if (!selectedRoleKey) {
      selectedRoleKey = deps.safeLs.get('ssp_lastActiveRole') || '';
    }
    if (selectedRoleKey) {
      var selectedRole = deps.ALL_ROLES.find(function (r) { return r.key === selectedRoleKey; });
      roles = selectedRole ? [selectedRole] : deps.getActiveRoles();
    } else {
      toast(T('toastSelectRoleFirst'));
      return;
    }
  }

  // Сохранить выбранную роль в PP для восстановления при следующем открытии
  if (roles.length === 1 && _currentRolePP) {
    _currentRolePP.roleKey = roles[0].key;
  }

  // Уникальные поля пользователей по ролям
  var fieldNames = [];
  roles.forEach(function (role) {
    var fn = (_settings && role) ? (_settings[role.userField] || null) : null;
    if (fn && fieldNames.indexOf(fn) < 0) fieldNames.push(fn);
  });

  if (!fieldNames.length) {
    toast(T('toastNoUserField'));
    return;
  }

  var pickBtn = document.getElementById('currentRolePickBtn');
  var calcBtn = document.getElementById('currentRoleCalcBtn');
  if (pickBtn) { pickBtn.disabled = true; pickBtn.textContent = T('toastPickLoading'); }
  if (calcBtn) { calcBtn.disabled = true; }

  // Параллельные запросы по всем полям
  var promises = fieldNames.map(function (fn) {
    return deps.apiGet('get-user-field-values?fieldName=' + encodeURIComponent(fn))
      .then(function (r) {
        diag('get-user-field-values [' + fn + ']: ' + ((r && r.users) ? r.users.length : 0) + ' users', (r && r.users && r.users.length) ? 'ok' : 'warn');
        return (r && r.users) ? r.users : [];
      }).catch(function (e) {
        diag('get-user-field-values [' + fn + '] ERR: ' + String(e), 'err');
        return [];
      });
  });

  Promise.all(promises).then(function (bundleResults) {
    /* стейт перечитывается В МОМЕНТ резолва (мог смениться за время запросов) */
    var _settings = deps.state.getSettings();
    var _currentRolePP = deps.state.getCurrentRolePP();
    var assigneeSet = {};

    // 1. Объединить пользователей из бандлов всех полей
    bundleResults.forEach(function (users) {
      users.forEach(function (u) {
        var login = u.login || '';
        if (!login || assigneeSet[login]) return;
        // Сохранить грейд из снэпшота если был, иначе Middle (canonical default)
        var grade = savedGrades[login] || 'Middle';
        var kpeMap = deps.migrateKpeObject(_settings.kpe || {});
        var kpe   = (kpeMap[grade] !== undefined) ? kpeMap[grade] : (KPE_DEFAULTS_LOCAL[grade] || 0.65);
        var rate  = _settings.rate         !== undefined ? _settings.rate         : 1;
        var parti = _settings.participation !== undefined ? _settings.participation : 1;
        var computedRes = nkc * kpe * rate * parti;
        var prevRes = manualMode ? savedResources[login] : null;
        assigneeSet[login] = {
          login:        login,
          assigneeName: u.fullName || login,
          grade:        grade,
          resource:     (prevRes && typeof prevRes.resource === 'number') ? prevRes.resource : computedRes,
        };
        if (prevRes && typeof prevRes.manualResource === 'number') {
          assigneeSet[login].manualResource = prevRes.manualResource;
        }
      });
    });

    // 2. Исполнители уже назначены в задачах, но не попали в бандл — добавить с пометкой
    if (_currentRolePP && _currentRolePP.taskAssignments) {
      Object.keys(_currentRolePP.taskAssignments).forEach(function (issueId) {
        var ta = _currentRolePP.taskAssignments[issueId];
        if (!ta || !ta.assignee || assigneeSet[ta.assignee]) return;
        var grade = savedGrades[ta.assignee] || 'Middle';
        var kpeMap = deps.migrateKpeObject(_settings.kpe || {});
        var kpe   = (kpeMap[grade] !== undefined) ? kpeMap[grade] : (KPE_DEFAULTS_LOCAL[grade] || 0.65);
        var rate  = _settings.rate !== undefined ? _settings.rate : 1;
        var parti = _settings.participation !== undefined ? _settings.participation : 1;
        var computedRes2 = nkc * kpe * rate * parti;
        var prevRes2 = manualMode ? savedResources[ta.assignee] : null;
        assigneeSet[ta.assignee] = {
          login:        ta.assignee,
          assigneeName: ta.assigneeName || ta.assignee,
          grade:        grade,
          resource:     (prevRes2 && typeof prevRes2.resource === 'number') ? prevRes2.resource : computedRes2,
        };
        if (prevRes2 && typeof prevRes2.manualResource === 'number') {
          assigneeSet[ta.assignee].manualResource = prevRes2.manualResource;
        }
      });
    }

    if (!Object.keys(assigneeSet).length) {
      toast(T('toastPickEmpty'));
    } else {
      toast(T('toastPickDone') + ': ' + Object.keys(assigneeSet).length, 'success');
    }

    // 3. Обновить список — снэпшот полностью заменяется актуальным бандлом
    _currentRolePP.resourcesByAssignee = assigneeSet;
    _currentRolePP.nkcKey = deps.state.getCurrentRoleNkcKey();
    _currentRolePP.calculatedAt = Date.now();

    renderCurrentRoleAssigneeTable(deps);
    renderCurrentRoleTaskTable(deps);   // dropdown исполнителей в задачах обновится
    updateCurrentRoleTotals(deps);
    deps.saveCurrentRoleState();
    var recNow = deps.state.getCurrentSprintRoleRec();
    var _rk = recNow ? recNow.roleKey : null;
    if (_rk && typeof deps.refreshPlanningPeopleForCurrentSprint === 'function') {
      try { deps.refreshPlanningPeopleForCurrentSprint(_rk); } catch (_) {}
    }

  }).catch(function (e) {
    toast(T('toastPickErr') + ': ' + (e && e.message ? e.message : String(e)));
    diag('doCurrentRoleCalc ERR: ' + String(e), 'err');
  }).finally(function () {
    if (pickBtn) { pickBtn.disabled = false; pickBtn.textContent = T('btnPickAssignees'); }
    if (calcBtn) { calcBtn.disabled = false; }
  });
}

/* ═══ #40 — Авто-прогноз дат старта/окончания (Spec/AUTO_FORECAST_40_SPEC.md) ═══
   Ядро расчёта — pure/forecast-pure.js (мост FORECAST_PURE); здесь обвязка:
   сбор входов (календарь/отсутствия по REST, ёмкость через адаптер §9) и запись
   результата в СУЩЕСТВУЮЩИЕ personalPlanning.taskAssignments[*].dateStart/dateEnd
   (ручная корректировка/Гант/Excel/история — штатными путями, новых полей нет).
   Очередь ВИРТУАЛЬНАЯ (§6 спеки): порядок = даты, ничего не персистится. */

/* Transient-сет «не помещается в ёмкость» последнего прогноза (issueId→1).
   Сессионный по построению: не персистится (unfit-задачи и так без дат).
   v3.2.1 — привязан к контексту прогноза (sprintId_rk): смена роли/спринта
   сбрасывает сет, иначе задача из двух ролей несла ложный бейдж «⚠ не помещается». */
var _forecastUnfit = {};
var _forecastUnfitCtx = '';
function _forecastUnfitFor(rec) {
  var ctx = (rec && rec.sprintId) || '';
  if (ctx !== _forecastUnfitCtx) { _forecastUnfitCtx = ctx; _forecastUnfit = {}; }
  return _forecastUnfit;
}

function _forecastPure()  { return (typeof window !== 'undefined' && window.__SSP_FORECAST_PURE) || null; }
function _capacityPureRef() { return (typeof window !== 'undefined' && window.__SSP_CAPACITY_PURE) || null; }

/* Активные задачи роли (тот же отбор, что в _buildTaskTableVm). */
function _forecastActiveItems(deps, rec, rk) {
  var items = deps.isActiveSprintRecord(rec) ? deps.getRoleItemsArr(rk) : (rec.items || []);
  return items.filter(function (i) { return deps.ACTIVE_INC.indexOf(i.inclusionStatus) >= 0; });
}

/* Плановые минуты задачи — канон VM: alloc_<rk> ?? max(0, estimate−fact). */
function _forecastNeedMin(item, rk) {
  var alloc = item['alloc_' + rk];
  if (alloc !== null && alloc !== undefined) return alloc;
  return Math.max(0, (item['estimate_' + rk] || 0) - (item['fact_' + rk] || 0));
}

/* Задачи роли, сгруппированные по исполнителю: {login: [{issueId, needMin, startMs, rank}]}.
   rank приоритета = позиция в каноническом порядке multiKeySort('priority') (учитывает
   xpriority-tie-break) — tie-break виртуальной очереди. Общий вход для прогноза (кнопка),
   свопа очереди (стрелки) и VM-нумерации колонки «№». */
function _forecastByLogin(deps, rec, pp, rk, loginsFilter) {
  var active = _forecastActiveItems(deps, rec, rk);
  var ta = pp.taskAssignments || {};
  var rankOf = {};
  deps.multiKeySort(active, 'priority', ta).forEach(function (it, idx) { rankOf[it.issueId] = idx; });
  var byLogin = {};
  active.forEach(function (it) {
    var e = ta[it.issueId];
    var login = e && e.assignee;
    if (!login) return;
    if (loginsFilter && !loginsFilter[login]) return;
    (byLogin[login] = byLogin[login] || []).push({
      issueId: it.issueId,
      needMin: _forecastNeedMin(it, rk),
      startMs: (e && typeof e.dateStart === 'number') ? e.dateStart : null,
      endMs:   (e && typeof e.dateEnd === 'number') ? e.dateEnd : null,
      rank: rankOf[it.issueId],
    });
  });
  return byLogin;
}

/* Прогноз и запись дат. loginsFilter — null (все исполнители роли) либо {login:1}
   (перепаковка одного исполнителя). queueOverride — {login: [issueId...]} — явный
   порядок очереди (своп стрелками) вместо виртуального. Возвращает Promise<bool>. */
function runForecastDates(deps, loginsFilter, queueOverride) {
  var T = deps.T;
  var FP = _forecastPure(), CP = _capacityPureRef();
  var _settings = deps.state.getSettings() || {};
  var rec = deps.state.getCurrentSprintRoleRec();
  var _sprint = deps.state.getSprint();
  var pp = deps.state.getCurrentRolePP();
  if (!FP || !CP || !rec || !pp) return Promise.resolve(false);
  var rk = rec.roleKey || (pp.roleKey) || (deps.getActiveRoles()[0] || deps.ALL_ROLES[0]).key;
  var sprintStart = rec.dateStart || (_sprint && _sprint.dateStart);
  var sprintEnd   = rec.dateEnd   || (_sprint && _sprint.dateEnd);
  if (typeof sprintStart !== 'number' || typeof sprintEnd !== 'number') {
    deps.toast(T('toastForecastNoDates'), 'warn');
    return Promise.resolve(false);
  }
  if (!pp.taskAssignments) pp.taskAssignments = {};
  var ta = pp.taskAssignments;
  var byLogin = _forecastByLogin(deps, rec, pp, rk, loginsFilter);
  var logins = Object.keys(byLogin).sort();
  if (!logins.length) { deps.toast(T('toastForecastEmpty'), 'warn'); return Promise.resolve(false); }
  var isFull = _settings.capacityMode === 'full';
  var hoursPerDay = (typeof _settings.hoursPerDay === 'number' && isFinite(_settings.hoursPerDay)) ? _settings.hoursPerDay : 8;
  var useful = (typeof _settings.usefulHoursPerDay === 'number' && isFinite(_settings.usefulHoursPerDay)) ? _settings.usefulHoursPerDay : 0;
  /* Свежий фетч на каждый запуск (без кэша — прогноз явное действие; Light: отсутствия
     не ведутся → не запрашиваем, §5 спеки). fail-soft: нет календаря → fallback Пн-Пт. */
  return Promise.all([
    deps.apiGet('calendar').catch(function () { return null; }),
    isFull ? deps.apiGet('absences').catch(function () { return null; }) : Promise.resolve(null),
  ]).then(function (rs) {
    var calendar = (rs[0] && rs[0].calendar) || null;
    var absences = (isFull && rs[1] && rs[1].absences) || {};
    var baseDays = CP.dayKeysUTC(sprintStart, sprintEnd).map(function (iso) {
      return { iso: iso, workH: CP.workingHoursOfDay(iso, calendar, hoursPerDay), absH: 0 };
    });
    _forecastUnfitFor(deps.state.getCurrentSprintRoleRec());   /* v3.2.1 — синк контекста */
    if (!loginsFilter) _forecastUnfit = {};
    var unfitN = 0;
    logins.forEach(function (login) {
      var days = baseDays;
      var bounds = CP.absenceBounds(absences[login] || []);
      if (bounds.length) {
        days = baseDays.map(function (d) {
          return { iso: d.iso, workH: d.workH, absH: CP.absenceHoursOfDay(d.iso, bounds, calendar, hoursPerDay) };
        });
      }
      /* Порядок очереди: явный override (своп стрелками) либо виртуальный (даты→rank→id). */
      var queue;
      if (queueOverride && queueOverride[login]) {
        var byId = {};
        byLogin[login].forEach(function (t) { byId[t.issueId] = t; });
        queue = queueOverride[login].map(function (id) { return byId[id]; }).filter(Boolean);
      } else {
        queue = FP.orderQueue(byLogin[login]);
      }
      var res = FP.forecastAssignee({
        queue: queue,
        days: days,
        capacityHours: deps.getApprovedCapacityForPerson(login, rk) || 0,
        usefulHoursPerDay: useful,
      });
      byLogin[login].forEach(function (t) {
        if (!ta[t.issueId]) ta[t.issueId] = {};
        var dd = res.dates[t.issueId];
        delete _forecastUnfit[t.issueId];
        if (dd) {
          ta[t.issueId].dateStart = CP.isoToUTCms(dd.startIso);
          ta[t.issueId].dateEnd   = CP.isoToUTCms(dd.endIso);
        } else if (res.unfit.indexOf(t.issueId) >= 0) {
          ta[t.issueId].dateStart = null;
          ta[t.issueId].dateEnd   = null;
          _forecastUnfit[t.issueId] = 1;
          unfitN++;
        }
      });
    });
    deps.saveCurrentRoleState();
    renderCurrentRoleTaskTable(deps);
    var ganttTab = document.getElementById('tab-gantt');
    if (ganttTab && !ganttTab.classList.contains('hidden') && typeof deps.renderGanttChart === 'function') {
      try { deps.renderGanttChart(); } catch (e) { deps.diag('forecast gantt sync err: ' + e, 'err'); }
    }
    if (unfitN) deps.toast(T('toastForecastUnfit').replace('{n}', String(unfitN)), 'warn');
    else deps.toast(T('toastForecastDone'), 'success');
    return true;
  }).catch(function (e) {
    deps.diag('runForecastDates ERR: ' + String(e), 'err');
    deps.toast(T('toastForecastErr'), 'err');
    return false;
  });
}

/* Своп задачи со «соседом» в очереди исполнителя + мгновенная перепаковка его
   прогноза (⚖ §8 п.7 спеки: пересчёт — только явные действия). dir — 'up'|'down'. */
function _onQueueMove(deps, issueId, dir) {
  var T = deps.T;
  var FP = _forecastPure();
  var _settings = deps.state.getSettings() || {};
  if (!FP || !_settings.autoForecastEnabled) return;
  if (deps.state.isEditor && !deps.state.isEditor()) { deps.toast(T('toastNoEditRights'), 'warn'); return; }
  var rec = deps.state.getCurrentSprintRoleRec();
  var pp = deps.state.getCurrentRolePP();
  if (!rec || !pp) return;
  var rk = rec.roleKey || (deps.getActiveRoles()[0] || deps.ALL_ROLES[0]).key;
  var ta = pp.taskAssignments || {};
  var login = ta[issueId] && ta[issueId].assignee;
  if (!login) return;
  var byLogin = _forecastByLogin(deps, rec, pp, rk, null);
  var ids = FP.orderQueue(byLogin[login] || []).map(function (t) { return t.issueId; });
  var i = ids.indexOf(issueId);
  var j = (dir === 'up') ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ids.length) return;
  ids[i] = ids[j];
  ids[j] = issueId;
  var f = {}; f[login] = 1;
  var ov = {}; ov[login] = ids;
  runForecastDates(deps, f, ov);
}

/* Кнопка «Спрогнозировать даты»: гейты + Ring-конфирм перезаписи (⚖ §8 п.3 спеки). */
function doForecastDates(deps) {
  var T = deps.T;
  var _settings = deps.state.getSettings() || {};
  if (!_settings.autoForecastEnabled) return;
  if (deps.state.isEditor && !deps.state.isEditor()) { deps.toast(T('toastNoEditRights'), 'warn'); return; }
  var rec = deps.state.getCurrentSprintRoleRec();
  var pp = deps.state.getCurrentRolePP();
  if (!rec || !pp) { deps.toast(T('toastSelectSprint')); return; }
  var rk = rec.roleKey || (deps.getActiveRoles()[0] || deps.ALL_ROLES[0]).key;
  var ta = pp.taskAssignments || {};
  var hasDates = _forecastActiveItems(deps, rec, rk).some(function (it) {
    var e = ta[it.issueId];
    return !!(e && e.assignee && (e.dateStart || e.dateEnd));
  });
  if (!hasDates) { runForecastDates(deps, null); return; }
  deps.openModal({
    id: 'forecastConfirm',
    title: T('forecastConfirmTitle'),
    body: { kind: 'text', text: T('forecastConfirmText') },
    buttons: [
      { id: 'cancel', text: T('btnCancel'), variant: 'secondary', onClick: function (h) { h.close(); } },
      { id: 'confirm', text: T('btnForecastConfirm'), variant: 'primary', onClick: function (h) {
        h.close();
        runForecastDates(deps, null);
      }},
    ],
    dismissOnBackdrop: false,
    blockEscape: false,
    showCloseButton: false,
  });
}

const api = {
  renderCurrentRoleAssigneeTable: renderCurrentRoleAssigneeTable,
  renderCurrentRoleTaskTable: renderCurrentRoleTaskTable,
  updateCurrentRoleTotals: updateCurrentRoleTotals,
  calcAssigneeUsed: calcAssigneeUsed,
  doRecalcResource: doRecalcResource,
  doCurrentRoleCalc: doCurrentRoleCalc,
  doForecastDates: doForecastDates,
  runForecastDates: runForecastDates,
};

if (typeof window !== 'undefined') {
  try { window.__SSP_CURRENTROLE_VIEW = api; } catch (_) { /* sandboxed write may throw */ }
}

module.exports = api;
