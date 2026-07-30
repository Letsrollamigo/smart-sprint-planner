/* #61 — Сводная таблица мультиролевого планирования: read-only спойлер над
   аккордеонами ролей экрана «Аллокация общего ресурса» (#allocSummaryHost).
   Строки — объединение составов всех активных ролей (дедуп по issueId,
   pure/allocsummary-pure.js), колонки — общие один раз + «Оценка ‹Роль›»
   per-role + «Оценка Σ»; красным — задачи ролей с перелимитом ёмкости
   (computeRoleQuickStats(rk).overlimit, потолок «красное всё» принят ⚖).

   Паттерн ленивого тела — #60 (history-view.buildSprintGroupSpoiler): Ring
   Table (window.__SSP_TABLE) монтируется по раскрытию и сносится при
   сворачивании — свёрнутый спойлер не стоит ни таблицы, ни React-корня.
   Deps приходят АРГУМЕНТОМ на каждый вызов (фабрика _roleCompDeps в core +
   computeRoleQuickStats); модуль без собственного состояния — открытость
   живёт в DOM (.spoiler.open), renderAllocSummary() идемпотентен и
   сохраняет её при перестройке (вызывается из renderPlanningRoles и после
   каждого renderRoleComposition — шапка-счётчики не застывают, урок #59). */
'use strict';

function _isHistoricalView(deps) {
  var s = deps.state.getSprint(), cur = deps.state.getCurrentSprintId();
  return !!(cur && s && cur !== s.sprintId);
}

function _teardownBody(inner) {
  var tblHost = inner.querySelector('[data-ssp-table-host]');
  if (tblHost && window.__SSP_TABLE) { try { window.__SSP_TABLE.unmountAt(tblHost); } catch (_) {} }
  inner.innerHTML = '';
}

function _cell(row, c) { return row.cells[c.id]; }

/* Тело спойлера: легенда + Ring Table. Строится на КАЖДОЕ раскрытие/refresh —
   данные всегда свежие, кэшировать нечего (read-only витрина). */
function _buildBody(inner, deps) {
  var T = deps.T, esc = deps.esc, safeUrl = deps.safeUrl;
  _teardownBody(inner);

  var PURE = (typeof window !== 'undefined' && window.__SSP_ALLOCSUMMARY_PURE) || null;
  if (!PURE || !window.__SSP_TABLE) return;

  var _settings = deps.state.getSettings();
  var activeRoles = deps.getActiveRoles();
  var keys = activeRoles.map(function (r) { return r.key; });

  var statsByRk = {}, overByRk = {};
  keys.forEach(function (rk) {
    statsByRk[rk] = deps.computeRoleQuickStats(rk);
    overByRk[rk] = !!statsByRk[rk].overlimit;
  });

  var rows = PURE.markOverlimitRows(
    PURE.buildAllocSummaryRows(deps.state.getRoleItems(), keys), overByRk);
  var sorted = deps.multiKeySort(rows);

  var legend = document.createElement('div');
  legend.className = 'ssp-allocsum-legend';
  legend.textContent = T('allocSummaryLegend');
  inner.appendChild(legend);

  var hasExtTicket = !!(_settings && _settings.fieldExternalTicketId);
  var hasSystem    = !!(_settings && _settings.fieldSystem);
  var hasXPriority = !!(_settings && _settings.fieldXPriority);

  var vmRows = sorted.map(function (row) {
    var cells = {};
    cells.id = { __html: '<a href="' + safeUrl(row.url) + '" target="_blank" class="link">' + esc(row.issueId) + '</a>' };
    if (hasExtTicket) {
      var ext = row.externalTicketId;
      cells.externalTicketId = ext
        ? (/^https?:\/\//i.test(ext)
            ? { __html: '<a href="' + safeUrl(ext) + '" target="_blank" rel="noopener noreferrer" class="link">' + esc(String(ext)) + '</a>' }
            : String(ext))
        : '—';
    }
    if (hasSystem) cells.system = row.system || '—';
    cells.priority = deps.dispEnum(row.priority) || '—';
    if (hasXPriority) cells.xpriority = deps.dispEnum(row.xpriority) || '—';
    cells.state = deps.dispEnum(row.state) || '—';
    cells.title = row.title || '';
    keys.forEach(function (rk) {
      var est = row.estByRole[rk];
      cells['est_' + rk] = (est === null || est === undefined) ? '—' : deps.fmtPeriod(est);
    });
    cells.estSum = (row.estSum === null || row.estSum === undefined) ? '—' : deps.fmtPeriod(row.estSum);
    return { iid: row.issueId, over: row.isOver, cells: cells };
  });

  var columns = [];
  columns.push({ id: 'id', title: T('thId'), sortable: true, className: 'td-id', getValue: _cell });
  if (hasExtTicket) columns.push({ id: 'externalTicketId', title: T('thExternalTicketId'), sortable: true, getValue: _cell });
  if (hasSystem)    columns.push({ id: 'system', title: T('thSystem'), sortable: false, getValue: _cell });
  columns.push({ id: 'priority', title: T('thPriority'), sortable: true, getValue: _cell });
  if (hasXPriority) columns.push({ id: 'xpriority', title: T('thXpriority'), sortable: true, getValue: _cell });
  columns.push({ id: 'state', title: T('thState'), sortable: false, getValue: _cell });
  columns.push({ id: 'title', title: T('thTitle'), sortable: false, className: 'td-title ssp-col-title', getValue: _cell });
  keys.forEach(function (rk) {
    var role = deps.ALL_ROLES.find(function (r) { return r.key === rk; });
    var st = statsByRk[rk];
    /* Вторая строка заголовка — «аллокация / ресурс ч» роли: перелимит виден
       рядом с причиной (autoBrHeader в table-mount превращает <br> в перенос). */
    columns.push({
      id: 'est_' + rk,
      title: T('thEstimate') + ' ' + (typeof deps.roleLabel === 'function' && role ? deps.roleLabel(role) : rk)
        + '<br>' + deps.formatHoursLight(st.totalAlloc) + ' / ' + deps.formatHoursLight(st.resource) + ' ' + T('planningRoleStatHourSuffix'),
      sortable: false, className: 'td-num', getValue: _cell,
    });
  });
  columns.push({ id: 'estSum', title: T('thEstSum'), sortable: false, className: 'td-num', getValue: _cell });

  var tblWrap = document.createElement('div');
  tblWrap.className = 'tbl-wrap';
  var tblHost = document.createElement('div');
  tblHost.setAttribute('data-ssp-table-host', '');
  tblWrap.appendChild(tblHost);
  inner.appendChild(tblWrap);

  window.__SSP_TABLE.mountAt(tblHost, {
    items: vmRows,
    columns: columns,
    sortKey: (typeof deps.getSortKey === 'function') ? deps.getSortKey() : 'off',
    onSort: function (nextKey) {
      if (typeof deps.setSortKey === 'function') deps.setSortKey(nextKey);
      /* Ролевые таблицы перерендерит rerenderAllSortableTables; сводную —
         прямой вызов (если ни одна роль не раскрыта, wrapped-хук состава
         не выстрелит). Повторный вызов через хук идемпотентен. */
      if (typeof deps.rerenderAllSortableTables === 'function') deps.rerenderAllSortableTables();
      renderAllocSummary(deps);
    },
    getItemKey: function (row) { return row.iid; },
    getItemClassName: function (row) { return row && row.over ? 'ssp-allocsum-row--over' : ''; },
    stickyHeader: true,
    emptyText: T('compSprintEmpty'),
  });
}

function renderAllocSummary(deps) {
  var host = document.getElementById('allocSummaryHost');
  if (!host) return;
  var settings = deps.state.getSettings();
  var activeRoles = (typeof deps.getActiveRoles === 'function') ? deps.getActiveRoles() : [];
  /* Гейт фичи (тумблер allocSummaryEnabled, дефолт ON по `!== false`) и контекста:
     нет спринта / нет активных ролей / исторический вид (live _roleItems ≠ снапшот,
     который видят таблицы — витрина бы врала). Выключено → ни строки DOM. */
  var enabled = !(settings && settings.allocSummaryEnabled === false);
  if (!enabled || !deps.state.getCurrentSprintId() || !activeRoles.length || _isHistoricalView(deps)) {
    var oldInner = host.querySelector('.ssp-allocsum-inner');
    if (oldInner) _teardownBody(oldInner);
    host.innerHTML = '';
    return;
  }

  var wasOpen = !!host.querySelector('.spoiler.open');
  var prevInner = host.querySelector('.ssp-allocsum-inner');
  if (prevInner) _teardownBody(prevInner);
  host.innerHTML = '';

  /* Счётчики шапки — по тем же pure-строкам, что и таблица (дёшево: O(n) дедуп). */
  var PURE = (typeof window !== 'undefined' && window.__SSP_ALLOCSUMMARY_PURE) || null;
  var keys = activeRoles.map(function (r) { return r.key; });
  var rows = PURE ? PURE.buildAllocSummaryRows(deps.state.getRoleItems(), keys) : [];
  var overRoles = keys.filter(function (rk) { return deps.computeRoleQuickStats(rk).overlimit; });

  var T = deps.T, esc = deps.esc;
  var wrap = document.createElement('div'); wrap.className = 'spoiler';
  var head = document.createElement('div'); head.className = 'spoiler__head';
  var meta = document.createElement('div'); meta.className = 'spoiler__meta';
  var overBadge = overRoles.length
    ? '<div class="spoiler__mi"><span class="spoiler__ml">' + esc(T('planningRoleStatOverlimit')) + '</span><span class="spoiler__mv"><span class="s-badge s-badge--overlimit">' + esc(overRoles.map(function (rk) {
        var role = deps.ALL_ROLES.find(function (r) { return r.key === rk; });
        return (typeof deps.roleLabel === 'function' && role) ? deps.roleLabel(role) : rk;
      }).join(', ')) + '</span></span></div>'
    : '';
  meta.innerHTML =
    '<div class="spoiler__mi"><span class="spoiler__ml">' + esc(T('planningLevelRoles')) + '</span><span class="spoiler__mv" style="font-weight:600">' + esc(T('allocSummaryTitle')) + '</span></div>' +
    '<div class="spoiler__mi"><span class="spoiler__ml">' + esc(T('histSpoilerTasks')) + '</span><span class="spoiler__mv">' + rows.length + '</span></div>' +
    '<div class="spoiler__mi"><span class="spoiler__ml">' + esc(T('histGroupRoles')) + '</span><span class="spoiler__mv">' + activeRoles.length + '</span></div>' +
    overBadge;

  var arr = document.createElement('span'); arr.className = 'spoiler__arrow'; arr.textContent = '▶'; arr.setAttribute('aria-hidden', 'true');
  head.appendChild(meta); head.appendChild(arr);
  head.setAttribute('role', 'button');
  head.setAttribute('tabindex', '0');
  head.setAttribute('aria-expanded', 'false');

  var body = document.createElement('div'); body.className = 'spoiler__body';
  var inner = document.createElement('div');
  inner.className = 'ssp-allocsum-inner';
  inner.style.cssText = 'padding:10px 12px 12px;';
  body.appendChild(inner);

  function toggle() {
    var isOpen = wrap.classList.toggle('open');
    if (isOpen) _buildBody(inner, deps);
    else _teardownBody(inner);
    head.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  }
  head.addEventListener('click', toggle);
  head.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); toggle(); }
  });

  wrap.appendChild(head); wrap.appendChild(body);
  host.appendChild(wrap);

  if (wasOpen) toggle();
}

const api = { renderAllocSummary: renderAllocSummary };

if (typeof window !== 'undefined') {
  try { window.__SSP_ALLOCSUMMARY_VIEW = api; } catch (_) { /* sandboxed write may throw */ }
}

module.exports = api;
