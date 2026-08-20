/* История спринтов — view вкладки «История»: список-пагинация записей
   (renderHistory) и спойлер записи (buildSpoiler): шапка-meta со статус-бейджем,
   кнопки записи (Excel/JSON/правка-WC/завершение/удаление с confirm-модалкой),
   карточка цели/итога/ретро, тоггл «Снимок ↔ Рабочая копия» (Ring Radio) и
   items-таблица (Ring Table). Вынесено из core.js (Тир D слайс 4,
   ступень 1) за мост window.__SSP_HISTORY_VIEW; golden-характеризация —
   tests/golden/render-history.golden.test.js (через делегаторы монолита).

   Deps приходят АРГУМЕНТОМ на каждый вызов (фабрика _historyDeps() в монолите).
   state — get-аксессоры монолитного стейта; в event-хендлерах и async-цепочках
   читаются СТРОГО В МОМЕНТ обращения (урок youtrack-api/standup-view).
   Самовызов ре-рендера после удаления записи идёт через deps.renderHistory
   (монолитный делегатор). WC-механика (правка/возобновление/сброс копии) и
   контроллеры экспорта/завершения остаются в монолите — за deps.
   React-мосты — window.__SSP_TABLE / window.__SSP_RADIO, читаются с window
   на каждом вызове. */
'use strict';

/* Ступень 2 (vm-граница): вся cell-логика items-таблицы записи — в
   _buildHistoryItemsVm (строки с готовыми значениями ячеек, флаги опциональных
   колонок, заголовок дельта-колонки, summary); колонки __SSP_TABLE — тупой
   маппинг row.cells[col.id] (_vmCell). Значения ячеек байт-в-байт прежние —
   оракул materializeTable сохранён (как слайсы 2–3). */
function _vmCell(row, c) { return row.cells[c.id]; }

function _buildHistoryItemsVm(items, rk, rec, deps) {
  var T = deps.T, esc = deps.esc;
  if (!items || !items.length) return { empty: true, summaryHtml: null };
  var sD = items.filter(function(i){ return deps.ACTIVE_INC.indexOf(i.inclusionStatus) >= 0; }).reduce(function(s,i){ return s+(i['estimate_'+rk]||0); }, 0);
  var summaryHtml = '<span><b>'+esc(rec.roleLabel||rk)+':</b> '+deps.fmtPeriod(sD)+'</span>';
  /* v1.8.0 D130 — externalTicketId column visible if setting configured.
     v1.8.1 — XPriority column в истории тоже опциональна. */
  var _settings = deps.state.getSettings();
  var hasExtTicket = !!(_settings && _settings.fieldExternalTicketId);
  var hasXPri      = !!(_settings && _settings.fieldXPriority);

  function _renderExternalTicketInner(val) {
    if (!val) return '<span style="color:var(--muted)">—</span>';
    var safe = esc(String(val));
    var style = 'style="max-width:12em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block"';
    if (/^https?:\/\//i.test(val)) {
      return '<span '+style+' title="'+safe+'"><a href="'+deps.safeUrl(val)+'" target="_blank" rel="noopener noreferrer" class="link">'+safe+'</a></span>';
    }
    return '<span '+style+' title="'+safe+'">'+safe+'</span>';
  }
  function histDelta(v) {
    if (v === null || v === undefined) return '<span style="color:var(--muted)">—</span>';
    var s = deps.fmtHoursOnly(Math.abs(v));
    return v < 0 ? '<span class="delta-neg">−'+s+'</span>' : s;
  }
  /* B19 — исполнитель из per-role записи personalPlanning (может быть массивом —
     multi-assignee → join, как excel-export). Утрачен с v2.0.0 D128 вместе с native-таблицей. */
  var _ta = (rec.personalPlanning && rec.personalPlanning.taskAssignments) || {};
  function _assigneeName(issueId) {
    var ta = _ta[issueId];
    if (!ta) return '—';
    if (Array.isArray(ta)) {
      var n = ta.filter(function(x){ return x && (x.assigneeName || x.assignee); })
               .map(function(x){ return x.assigneeName || x.assignee; });
      return n.length ? n.join(', ') : '—';
    }
    return ta.assigneeName || ta.assignee || '—';
  }

  var rows = items.map(function(item) {
    var est  = item['estimate_'+rk];
    var fact = item['fact_'+rk];
    var delta = (est !== null && est !== undefined)
      ? (fact !== null && fact !== undefined ? (est||0)-(fact||0) : (est||0))
      : null;
    return {
      iid: item.issueId,
      cells: {
        id: { __html: '<a href="'+deps.safeUrl(item.url)+'" target="_blank" rel="noopener noreferrer" class="link">'+esc(item.issueId)+'</a>' },
        externalTicketId: { __html: _renderExternalTicketInner(item.externalTicketId) },
        /* plain-строки → React-текст (table-mount экранирует; esc двоил «&» → «&amp;») */
        title: item.title || '',
        priority: deps.dispEnum(item.priority) || '—',
        xpriority: deps.dispEnum(item.xpriority) || '—',
        state: deps.dispEnum(item.state) || '—',
        incStatus: item.inclusionStatus ? deps.incLabel(item.inclusionStatus) : '—',
        alloc: (function(){ var a = item['alloc_'+rk]; var v = (a !== null && a !== undefined) ? a : Math.max(0, (est||0)-(fact||0)); return deps.fmtPeriod(v); })(),
        assignee: _assigneeName(item.issueId),
        delta: { __html: histDelta(delta) },
      },
    };
  });
  /* fmtThLabel returns 'Ресурс<br>{label}'. table-mount.jsx auto-detects
     <br> in column.title and generates getHeaderValue with React <br/>
     elements (lesson #26). */
  return {
    empty: false,
    summaryHtml: summaryHtml,
    hasExtTicket: hasExtTicket,
    hasXPri: hasXPri,
    deltaColTitle: deps.fmtThLabel(rec.roleLabel || rk),
    rows: rows,
  };
}

/* #60 — история группируется по спринту, а не по ролям: baseId = sprintId записи
   без role-суффикса (записи истории живут как `<sprintId>_<roleKey>`). Режем по
   ПОСЛЕДНЕМУ '_' — как reporting-pure (uid дефисный, но легаси-id мог содержать
   подчёркивание, и тогда split('_')[0] склеил бы разные спринты в одну группу). */
function _histBaseId(sid) {
  var s = String(sid || ''), u = s.lastIndexOf('_');
  return u > 0 ? s.slice(0, u) : s;
}

/* Группы в порядке первого вхождения: sorted уже упорядочен по confirmedAt desc,
   значит порядок групп = порядок самой свежей записи спринта. idx сохраняем
   ИСХОДНЫЙ (позиция в sorted) — editHistorySprint/finishHistorySprint резолвят
   по нему working copy, контракт buildSpoiler не меняется. */
function groupHistoryBySprint(sorted) {
  var order = [], byBase = {};
  (sorted || []).forEach(function(rec, i) {
    if (!rec) return;
    var base = _histBaseId(rec.sprintId);
    if (!byBase[base]) { byBase[base] = { baseId: base, recs: [] }; order.push(byBase[base]); }
    byBase[base].recs.push({ rec: rec, idx: i });
  });
  return order;
}

/* Внешний спойлер спринта: шапка-агрегат + ленивое построение ролевых спойлеров.
   Ролевые строит НЕТРОНУТЫЙ buildSpoiler — вся механика записи (Excel/JSON/правка/
   завершение/удаление, WC-тоггл, items-таблица) остаётся ровно та же. Тела строятся
   по ПЕРВОМУ раскрытию: раньше страница истории монтировала HIST_PAGE Ring Table
   сразу, теперь — ноль до клика. */
function buildSprintGroupSpoiler(group, deps) {
  var T = deps.T, esc = deps.esc, fmtDate = deps.fmtDate;
  var statusLabel = deps.statusLabel, STATUS = deps.STATUS;
  var head0 = group.recs[0].rec;

  var tasks = group.recs.reduce(function(s, e) { return s + ((e.rec.items && e.rec.items.length) || 0); }, 0);
  /* Статусы ролей расходятся штатно (одна роль завершена, другая ещё черновик) —
     показываем ВСЕ фактические бейджи, а не выдуманный «общий статус спринта». */
  var stOrder = [], stCount = {};
  group.recs.forEach(function(e) {
    var st = e.rec.status || '';
    if (stCount[st] === undefined) { stCount[st] = 0; stOrder.push(st); }
    stCount[st]++;
  });
  var badges = stOrder.map(function(st) {
    var cls = 's-badge--planning';
    if (st === STATUS.CONFIRMED) cls = 's-badge--confirmed';
    if (st === STATUS.ALLOCATED) cls = 's-badge--allocated';
    if (st === STATUS.FINISHED)  cls = 's-badge--finished';
    return '<span class="s-badge '+cls+'">'+esc(statusLabel(st))+(stCount[st] > 1 ? ' ×'+stCount[st] : '')+'</span>';
  }).join(' ');

  var wrap = document.createElement('div'); wrap.className = 'spoiler';
  var head = document.createElement('div'); head.className = 'spoiler__head';
  var meta = document.createElement('div'); meta.className = 'spoiler__meta';
  meta.innerHTML =
    (head0.name ? '<div class="spoiler__mi"><span class="spoiler__ml">'+T('histSpoilerName')+'</span><span class="spoiler__mv" style="font-weight:600">'+esc(head0.name)+'</span></div>' : '')+
    '<div class="spoiler__mi"><span class="spoiler__ml">'+T('histSpoilerStart')+'</span><span class="spoiler__mv">'+fmtDate(head0.dateStart)+'</span></div>'+
    '<div class="spoiler__mi"><span class="spoiler__ml">'+T('histSpoilerEnd')+'</span><span class="spoiler__mv">'+fmtDate(head0.dateEnd)+'</span></div>'+
    '<div class="spoiler__mi"><span class="spoiler__ml">'+T('histGroupRoles')+'</span><span class="spoiler__mv">'+group.recs.length+'</span></div>'+
    '<div class="spoiler__mi"><span class="spoiler__ml">'+T('histSpoilerTasks')+'</span><span class="spoiler__mv">'+tasks+'</span></div>'+
    '<div class="spoiler__mi"><span class="spoiler__ml">'+T('histSpoilerStatus')+'</span><span class="spoiler__mv">'+badges+'</span></div>';

  var arr = document.createElement('span'); arr.className = 'spoiler__arrow'; arr.textContent = '▶'; arr.setAttribute('aria-hidden', 'true');
  head.appendChild(meta); head.appendChild(arr);
  /* B16 (a11y) — как у ролевого спойлера: disclosure-кнопка с клавиатурой. */
  head.setAttribute('role', 'button');
  head.setAttribute('tabindex', '0');
  head.setAttribute('aria-expanded', 'false');

  var body = document.createElement('div'); body.className = 'spoiler__body';
  var inner = document.createElement('div'); inner.style.cssText = 'padding:10px 12px 2px;';
  body.appendChild(inner);

  var built = false;
  function ensureBuilt() {
    if (built) return;
    built = true;
    group.recs.forEach(function(e) { inner.appendChild(buildSpoiler(e.rec, e.idx, deps)); });
  }
  function toggleGroup() {
    var isOpen = wrap.classList.toggle('open');
    if (isOpen) ensureBuilt();
    head.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  }
  head.addEventListener('click', toggleGroup);
  head.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); toggleGroup(); }
  });

  wrap.appendChild(head); wrap.appendChild(body);
  return wrap;
}

function renderHistory(deps) {
  var T = deps.T;
  var container = document.getElementById('historyList');
  var _history = deps.state.getHistory();
  if (!_history.length) {
    container.innerHTML = '<div class="empty">'+T('emptyHistory')+'</div>';
    document.getElementById('histPag').style.display = 'none';
    return;
  }
  // Миграция: записи v2.x без roleKey получают первую роль из настроек (или 'analysis')
  _history.forEach(function(rec) {
    if (!rec.roleKey) {
      var _settings = deps.state.getSettings();
      var fallbackRole = deps.ALL_ROLES.find(function(r){ return r.key === ((_settings && _settings.activeRoles && _settings.activeRoles[0]) || 'analysis'); }) || deps.ALL_ROLES[0];
      rec.roleKey   = rec.roleKey   || fallbackRole.key;
      rec.roleLabel = rec.roleLabel || fallbackRole.label;
    }
  });
  var sorted = _history.slice().sort(function(a,b){ return (b.confirmedAt||0)-(a.confirmedAt||0); });
  /* #60 — страница считается в СПРИНТАХ, а не в записях: иначе роли одного спринта
     рвутся между страницами и группа теряет смысл. */
  var groups = groupHistoryBySprint(sorted);
  var total = Math.ceil(groups.length / deps.HIST_PAGE);
  var _histPage = Math.min(deps.state.getHistPage(), total);
  deps.state.setHistPage(_histPage);
  var start = (_histPage - 1) * deps.HIST_PAGE;
  var page  = groups.slice(start, start + deps.HIST_PAGE);
  /* v2.0.0 D5-D — unmount Ring Radio roots внутри spoiler'ов перед innerHTML replace. */
  if (window.__SSP_RADIO && typeof window.__SSP_RADIO.unmountAllIn === 'function') {
    window.__SSP_RADIO.unmountAllIn(container);
  }
  container.innerHTML = '';
  page.forEach(function(group) { container.appendChild(buildSprintGroupSpoiler(group, deps)); });
  var pag = document.getElementById('histPag');
  if (total > 1) {
    pag.style.display = 'flex';
    document.getElementById('histPageInfo').textContent = T('pageOf') + _histPage + T('pageOfSep') + total;
    document.getElementById('histPrev').disabled = _histPage <= 1;
    document.getElementById('histNext').disabled = _histPage >= total;
  } else {
    pag.style.display = 'none';
  }
}

function buildSpoiler(rec, idx, deps) {
  var T = deps.T, esc = deps.esc, icon = deps.icon;
  var fmtDate = deps.fmtDate, fmtDT = deps.fmtDT, fmtHours = deps.fmtHours;
  var statusLabel = deps.statusLabel;
  var STATUS = deps.STATUS;
  var _workingDrafts = deps.state.getWorkingDrafts();
  var _isValidator = deps.state.getIsValidator();
  var _currentUser = deps.state.getCurrentUser();

  var role = deps.ALL_ROLES.find(function(r){ return r.key === rec.roleKey; });
  var wrap = document.createElement('div'); wrap.className = 'spoiler';
  var head = document.createElement('div'); head.className = 'spoiler__head';
  var meta = document.createElement('div'); meta.className = 'spoiler__meta';

  /* v5.0.3 — корректный класс бейджа по статусу записи. Раньше был
     hardcoded "confirmed" с переопределением только на FINISHED/ALLOCATED.
     v5.2.0 — статус PLANNED удалён, legacy-записи мигрируются на PLANNING на read. */
  var badgeClass = 's-badge--planning';
  if (rec.status === STATUS.CONFIRMED) badgeClass = 's-badge--confirmed';
  if (rec.status === STATUS.ALLOCATED) badgeClass = 's-badge--allocated';
  if (rec.isOverLimit) badgeClass = 's-badge--overlimit';
  if (rec.status === STATUS.FINISHED) badgeClass = 's-badge--finished';
  var badgeTitle = (rec.status === STATUS.ALLOCATED) ? T('tooltipStatusAllocated') : '';

  var remKey = role ? role.remKey : 'remainAnalysis';
  var remVal = rec[remKey];

  /* v5.3.0 — pill «Есть рабочая копия» с tooltip владелец/время */
  var wcPill = '';
  if (rec.hasWorkingCopy && _workingDrafts[rec.sprintId]) {
    var d = _workingDrafts[rec.sprintId];
    var pillTitle = T('wcEditedBy')
      .replace('{who}', d.editorLogin || '?')
      .replace('{when}', fmtDT(d.updatedAt));
    wcPill = '<span class="wc-has-copy-pill" title="'+esc(pillTitle)+'">'+esc(T('wcHasCopyPill'))+'</span>';
  }
  /* v1.8.1 — название спринта и роль теперь видны в свёрнутом виде (первые поля).
     Раньше rec.name был только в body (раскрытый вид), что затрудняло идентификацию. */
  var sprintNameInline = rec.name
    ? '<div class="spoiler__mi"><span class="spoiler__ml">'+T('histSpoilerName')+'</span><span class="spoiler__mv" style="font-weight:600">'+esc(rec.name)+'</span></div>'
    : '';
  var roleInline = rec.roleLabel
    ? '<div class="spoiler__mi"><span class="spoiler__ml">'+T('histSpoilerRole')+'</span><span class="spoiler__mv">'+esc(rec.roleLabel)+'</span></div>'
    : '';
  /* v1.9.0 D132 — Goal outcome badge + truncated goal in collapsed spoiler header. */
  var outcomeInline = '';
  if (rec.goalOutcome) {
    var _outMap = { achieved: T('optGoalAchieved'), partial: T('optGoalPartial'), missed: T('optGoalMissed') };
    outcomeInline = '<div class="spoiler__mi"><span class="spoiler__ml">'+T('histOutcomeLabel')+'</span><span class="spoiler__mv">'+esc(_outMap[rec.goalOutcome]||rec.goalOutcome)+'</span></div>';
  }
  var goalHeadInline = '';
  if (rec.sprintGoal) {
    var _truncGoal = rec.sprintGoal.length > 80 ? rec.sprintGoal.substring(0,77)+'…' : rec.sprintGoal;
    goalHeadInline = '<div class="spoiler__mi" title="'+esc(rec.sprintGoal)+'"><span class="spoiler__ml">'+T('histGoalLabel')+'</span><span class="spoiler__mv" style="font-style:italic">'+esc(_truncGoal)+'</span></div>';
  }
  meta.innerHTML =
    sprintNameInline +
    roleInline +
    outcomeInline +
    goalHeadInline +
    '<div class="spoiler__mi"><span class="spoiler__ml">'+T('histSpoilerStart')+'</span><span class="spoiler__mv">'+fmtDate(rec.dateStart)+'</span></div>'+
    '<div class="spoiler__mi"><span class="spoiler__ml">'+T('histSpoilerEnd')+'</span><span class="spoiler__mv">'+fmtDate(rec.dateEnd)+'</span></div>'+
    '<div class="spoiler__mi"><span class="spoiler__ml">'+T('histSpoilerStatus')+'</span><span class="spoiler__mv"><span class="s-badge '+badgeClass+'"'+(badgeTitle?' title="'+esc(badgeTitle)+'"':'')+'>'+esc(statusLabel(rec.status))+'</span>'+(rec.isOverLimit?'<span class="overlimit-tag">'+T('overlimitTag')+'</span>':'')+wcPill+'</span></div>'+
    '<div class="spoiler__mi"><span class="spoiler__ml">'+T('histSpoilerTasks')+'</span><span class="spoiler__mv">'+(rec.items?rec.items.length:0)+'</span></div>'+
    (remVal !== undefined && remVal !== null ? '<div class="spoiler__mi"><span class="spoiler__ml">'+T('histSpoilerRem')+'</span><span class="spoiler__mv" style="color:'+(remVal<0?'var(--error)':'var(--success)')+'">'+fmtHours(remVal)+'</span></div>' : '');

  var ctrl = document.createElement('div'); ctrl.style.cssText = 'display:flex;align-items:center;gap:6px;flex-shrink:0;';

  var xlsBtn = document.createElement('button');
  xlsBtn.className = 'ring-button-button ring-button-inline ring-button-heightM ring-button-ghost ring-button-flat editor-btn btn--excel'; /* #43 W4 (E-1) — Ring-база + цветовой модификатор */ xlsBtn.title = T('btnExcelTitle');
  xlsBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>'+
    '<line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg> Excel';
  xlsBtn.addEventListener('click', (function(r){ return function(e){ e.stopPropagation(); deps.exportSprintToExcel(r); }; })(rec));

  var jsonBtn = document.createElement('button');
  jsonBtn.className = 'ring-button-button ring-button-inline ring-button-heightM ring-button-ghost ring-button-flat editor-btn btn--excel'; jsonBtn.title = T('btnExportSprintJsonTitle') || 'Экспорт спринта в JSON';
  jsonBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>'+
    '<line x1="8" y1="13" x2="16" y2="13"/></svg> JSON';
  jsonBtn.addEventListener('click', (function(r){ return function(e){ e.stopPropagation(); deps.exportPerSprintJson(r); }; })(rec));

  if (_isValidator && rec.status !== STATUS.FINISHED) {
    /* v5.3.0 — disable/relabel «Открыть на правку» по ownership working copy */
    var wcDraft = (rec.hasWorkingCopy && _workingDrafts[rec.sprintId]) ? _workingDrafts[rec.sprintId] : null;
    var myLogin = (_currentUser && _currentUser.login) || '';
    var editBtn = document.createElement('button');
    editBtn.className = 'ring-button-button ring-button-inline ring-button-heightM ring-button-ghost ring-button-flat editor-btn btn--edit-hist';
    if (wcDraft && wcDraft.editorLogin && wcDraft.editorLogin !== myLogin) {
      /* Чужая working copy — disabled */
      editBtn.disabled = true;
      editBtn.title = T('wcLockedByOther').replace('{who}', wcDraft.editorLogin);
      editBtn.textContent = T('btnEditHist');
    } else if (wcDraft) {
      editBtn.textContent = T('wcResume');
    } else {
      editBtn.textContent = T('btnEditHist');
    }
    editBtn.addEventListener('click', (function(r,i){ return function(e){ e.stopPropagation(); deps.editHistorySprint(r, i); }; })(rec, idx));
    ctrl.appendChild(editBtn);
    /* v5.3.0 — кнопка «Отменить правку» (только владельцу working copy) */
    if (wcDraft && wcDraft.editorLogin === myLogin) {
      var discardBtn = document.createElement('button');
      discardBtn.className = 'ring-button-button ring-button-inline ring-button-heightM ring-button-ghost ring-button-flat editor-btn btn--edit-hist';
      discardBtn.style.borderColor = 'var(--error,#e05a6a)';
      discardBtn.style.color = 'var(--error,#e05a6a)';
      discardBtn.textContent = T('wcDiscard');
      discardBtn.addEventListener('click', (function(k){ return function(e){ e.stopPropagation(); deps.discardWorkingDraft(k); }; })(rec.sprintId));
      ctrl.appendChild(discardBtn);
    }
  }
  if (rec.status !== STATUS.FINISHED) {
    var finBtn = document.createElement('button');
    finBtn.className = 'ring-button-button ring-button-inline ring-button-heightM ring-button-ghost ring-button-flat editor-btn btn--finish-hist'; finBtn.textContent = T('btnFinishSprint');
    finBtn.addEventListener('click', (function(r,i){ return function(e){ e.stopPropagation(); deps.finishHistorySprint(r, i); }; })(rec, idx));
    ctrl.appendChild(finBtn);
  }
  var del = document.createElement('button'); del.className = 'ring-button-button ring-button-inline ring-button-heightM ring-button-ghost ring-button-flat ring-button-iconOnly'; del.title = T('btnDeleteTitle'); del.setAttribute('aria-label', T('aria.btnDeleteRow')); del.appendChild(icon('trash', T('aria.btnDeleteRow')));
  del.addEventListener('click', (function(histIdx){ return function(e){
    e.stopPropagation();
    deps.openModal({
      id: 'delHist',
      type: 'destructive',
      title: T('confirmDelHist'),
      body: { kind: 'text', text: T('confirmDelHist') },
      buttons: [
        { id: 'cancel', text: T('btnNo'), variant: 'secondary', onClick: function(h) { h.close(); } },
        { id: 'confirm', text: T('btnYesDelete'), variant: 'danger', onClick: function(h) {
          h.close();
          if (!deps.state.getIsValidator()) { deps.toast(T('toastNoValidRights'), 'warn'); return; }
          var _history = deps.state.getHistory();
          /* v3.2.1 (P0) — histIdx — позиция в ОТСОРТИРОВАННОЙ display-копии (сортировка
             по confirmedAt), а сплайс шёл по живому массиву, порядок которого расходится
             (in-place авто-снапшоты) → удалялась и персистилась ЧУЖАЯ запись. Резолв по
             sprintId записи спойлера. */
          var liveIdx = _history.findIndex(function (h) { return h && h.sprintId === rec.sprintId; });
          if (liveIdx < 0) { deps.renderHistory(); return; }
          _history.splice(liveIdx, 1);
          deps.apiPost('history', { history: _history }).then(function() {
            deps.renderHistory();
            try {
              var _currentSprintId = deps.state.getCurrentSprintId();
              if (_currentSprintId) {
                var stillHas = deps.state.getHistory().some(function(hh){
                  return hh && typeof hh.sprintId === 'string' && hh.sprintId.indexOf(_currentSprintId + '_') === 0;
                });
                var _sprint = deps.state.getSprint();
                var isActive = _sprint && _sprint.sprintId === _currentSprintId;
                if (!stillHas && isActive) {
                  /* S3-фикс (кластер-баг спринтов): удалена последняя ролевая запись
                     активного спринта. Сам спринт живёт в _sprint + двух backend-слоях:
                     ssp_sprint (серверный) И ssp_drafts (per-user черновик, draft.sprint).
                     Без чистки обоих спринт остаётся призраком в пикере (getLogicalSprintIds
                     всегда включает _sprint.sprintId) и воскресает на хард-релоаде из того
                     слоя, что не затёрли. Чистим _sprint + ssp_sprint + черновик, затем
                     переключаемся на следующий спринт (после очистки черновика, иначе новый
                     ui.currentSprintId затёрся бы reset'ом черновика). */
                  /* #67 H5-mirror (ordering) — локальный сброс ТОЛЬКО после ака сервера:
                     fire-and-forget чистил экран даже при 403/сети → спринт-призрак после
                     хард-релоада (класс S3). Черновик/переключение — тоже под .then. */
                  deps.apiPost('sprint-data', { sprint: null, roleItems: {} }).then(function () {
                    deps.state.setSprint(null);
                    if (typeof deps.state.setRoleItems === 'function') deps.state.setRoleItems({});
                    var switchToNextSprint = function () {
                      var idsA = (typeof deps.getLogicalSprintIds === 'function') ? deps.getLogicalSprintIds() : [];
                      deps.setCurrentSprintId(idsA.length > 0 ? idsA[0] : null, { confirmed: true });
                    };
                    if (typeof deps.clearDraftOnBackend === 'function') {
                      deps.clearDraftOnBackend().then(switchToNextSprint).catch(function (e) {
                        deps.diag('delHist clear draft failed: ' + e, 'err'); switchToNextSprint();
                      });
                    } else {
                      switchToNextSprint();
                    }
                  }).catch(function (e) {
                    deps.diag('delHist clear active sprint failed: ' + e, 'err');
                    deps.toast(T('toastSaveError'), 'err');
                  });
                } else if (!stillHas && !isActive) {
                  var ids = (typeof deps.getLogicalSprintIds === 'function') ? deps.getLogicalSprintIds() : [];
                  deps.setCurrentSprintId(ids.length > 0 ? ids[0] : null, { confirmed: true });
                } else if (typeof deps.renderWidgetHeader === 'function') {
                  deps.renderWidgetHeader();
                }
              }
            } catch(e){ deps.diag('delHist sync header err: '+e,'err'); }
            deps.toast(T('toastHistDeleted'), 'success');
          });
        }},
      ],
      dismissOnBackdrop: false,
      blockEscape: false,
      showCloseButton: false,
    });
  }; })(idx));
  var arr = document.createElement('span'); arr.className = 'spoiler__arrow'; arr.textContent = '▶'; arr.setAttribute('aria-hidden', 'true');
  ctrl.appendChild(xlsBtn); ctrl.appendChild(jsonBtn); ctrl.appendChild(del); ctrl.appendChild(arr);
  head.appendChild(meta); head.appendChild(ctrl);
  /* B16 (a11y): шапка спойлера — disclosure-кнопка: клавиатура (Enter/Space) + role/aria-expanded. */
  head.setAttribute('role', 'button');
  head.setAttribute('tabindex', '0');
  head.setAttribute('aria-expanded', 'false');
  function toggleSpoiler() {
    var isOpen = wrap.classList.toggle('open');
    head.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  }
  head.addEventListener('click', toggleSpoiler);
  head.addEventListener('keydown', function(e){
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); toggleSpoiler(); }
  });

  var body = document.createElement('div'); body.className = 'spoiler__body';
  if (rec.name) {
    var nameDiv = document.createElement('div'); nameDiv.className = 'spoiler__name';
    nameDiv.textContent = rec.name;
    body.appendChild(nameDiv);
  }
  // Метка роли
  if (rec.roleLabel) {
    var roleLabel = document.createElement('div'); roleLabel.className = 'spoiler__role-label';
    roleLabel.textContent = rec.roleLabel;
    body.appendChild(roleLabel);
  }
  // Поля Спринт / Версия
  if (rec.sprintFieldVal || rec.versionFieldVal) {
    var sfDiv = document.createElement('div');
    sfDiv.style.cssText = 'padding:6px 16px 0;font-size:12px;color:var(--muted);display:flex;gap:16px;flex-wrap:wrap;';
    if (rec.sprintFieldVal) sfDiv.innerHTML += '<span><b>'+T('histSprintLabel')+':</b> '+esc(rec.sprintFieldVal)+'</span>';
    if (rec.versionFieldVal) sfDiv.innerHTML += '<span><b>'+T('histVersionLabel')+':</b> '+esc(rec.versionFieldVal)+'</span>';
    body.appendChild(sfDiv);
  }
  /* v1.9.0 D132 — Sprint goal + outcome + retro card in expanded body. */
  if (rec.sprintGoal || rec.goalOutcome) {
    var _goalCard = document.createElement('div');
    _goalCard.style.cssText = 'margin:10px 16px 0;padding:10px 12px;background:var(--surface-light,#f5f5f5);border-radius:6px;font-size:12px;line-height:1.5;';
    var _goalCardHtml = '';
    if (rec.sprintGoal) {
      _goalCardHtml += '<div style="margin-bottom:'+(rec.goalOutcome?'8px':'0')+'"><span style="color:var(--muted,#888);font-size:11px;display:block">'+esc(T('histGoalLabel'))+'</span><span style="font-weight:500">'+esc(rec.sprintGoal)+'</span></div>';
    }
    if (rec.goalOutcome) {
      var _outMapB = { achieved: T('optGoalAchieved'), partial: T('optGoalPartial'), missed: T('optGoalMissed') };
      _goalCardHtml += '<div style="margin-bottom:'+(rec.goalRetroNote?'8px':'0')+'"><span style="color:var(--muted,#888);font-size:11px;display:block">'+esc(T('histOutcomeLabel'))+'</span>'+esc(_outMapB[rec.goalOutcome]||rec.goalOutcome)+'</div>';
    }
    if (rec.goalRetroNote) {
      _goalCardHtml += '<div><span style="color:var(--muted,#888);font-size:11px;display:block">'+esc(T('histRetroLabel'))+'</span><span style="font-style:italic">'+esc(rec.goalRetroNote)+'</span></div>';
    }
    _goalCard.innerHTML = _goalCardHtml;
    body.appendChild(_goalCard);
  }
  var conf = document.createElement('div'); conf.className = 'spoiler__confirmed';
  conf.textContent = T('currentRoleConfirmedAt')+': '+(rec.confirmedBy||'—')+' · '+fmtDT(rec.confirmedAt);
  if (rec.finishedAt) conf.textContent += ' · '+T('histSpoilerEnd')+': '+fmtDT(rec.finishedAt);
  body.appendChild(conf);

  /* v5.4.0 (D30, KL#2 v5.3.0) — Toggle «Снимок ↔ Рабочая копия» для записей с активной WC.
     По умолчанию выбран «Снимок». При выборе «Рабочая копия» items списка
     перерисовываются из _workingDrafts[<sprintId>_<roleKey>].items. */
  var wcDraftForToggle = (rec.hasWorkingCopy && _workingDrafts && _workingDrafts[rec.sprintId])
    ? _workingDrafts[rec.sprintId] : null;
  var noticeEl = null;
  var itemsSlot = document.createElement('div');
  if (wcDraftForToggle) {
    /* v2.0.0 D5-D — Ring Radio host вместо 2 native radios. */
    var toggleWrap = document.createElement('div');
    toggleWrap.className = 'wc-spoiler-toggle';
    toggleWrap.style.cssText = 'display:flex;gap:14px;align-items:center;padding:6px 16px 0;font-size:12px;';
    var wcRadioOpts = [
      { value: 'snap', label: T('wcSourceSnapshot') },
      { value: 'wc',   label: T('wcSourceWorkingCopy') }
    ];
    var wcHost = document.createElement('span');
    wcHost.setAttribute('data-ssp-radio-host', '');
    wcHost.dataset.name = 'wc-source-' + rec.sprintId;
    wcHost.dataset.value = 'snap';
    wcHost.dataset.optionsJson = JSON.stringify(wcRadioOpts);
    wcHost.style.display = 'inline-flex';
    wcHost.style.gap = '14px';
    toggleWrap.appendChild(wcHost);
    body.appendChild(toggleWrap);
    noticeEl = document.createElement('div');
    noticeEl.className = 'wc-spoiler-notice hidden';
    noticeEl.style.cssText = 'margin:6px 16px 0;padding:6px 10px;border-radius:4px;background:rgba(255,200,80,.18);color:#8a6500;font-size:11px;';
    noticeEl.innerHTML = T('wcSpoilerNotice')
      .replace('{who}', esc(wcDraftForToggle.editorLogin || '?'))
      .replace('{when}', fmtDT(wcDraftForToggle.updatedAt));
    body.appendChild(noticeEl);
  }
  body.appendChild(itemsSlot);

  /* Локальный helper для рендера блока «summary + таблица задач».
     Используется как для базового снимка (rec.items), так и для working copy
     (draft.items). Принимает items+roleKey, рендерит в itemsSlot.
     Cell-логика — в _buildHistoryItemsVm (ступень 2), здесь — DOM-обвязка
     и тупой маппинг колонок. */
  function __renderHistoryItemsBlock(items, rk) {
    /* v2.0.0 D128 D7 — read-only Ring Table replaces native <table>.
       Unmount prior Ring roots before clearing slot (lesson D5 #21). */
    if (window.__SSP_TABLE) {
      try { window.__SSP_TABLE.unmountAllIn(itemsSlot); } catch(_) {}
    }
    itemsSlot.innerHTML = '';
    var vm = _buildHistoryItemsVm(items, rk, rec, deps);
    if (vm.summaryHtml) {
      var sumDiv = document.createElement('div'); sumDiv.className = 'spoiler__summary';
      sumDiv.innerHTML = vm.summaryHtml;
      itemsSlot.appendChild(sumDiv);
    }
    var tw = document.createElement('div'); tw.className = 'tbl-wrap';
    if (vm.empty) {
      tw.innerHTML = '<div class="empty">'+esc(T('histNoTasks'))+'</div>';
      itemsSlot.appendChild(tw);
      return;
    }

    var cols = [];
    cols.push({ id: 'id', title: T('histColNum'), sortable: false, className: 'td-id', getValue: _vmCell });
    if (vm.hasExtTicket) {
      cols.push({ id: 'externalTicketId', title: T('thExternalTicketId'), sortable: false, className: 'td-hist-ext', getValue: _vmCell });
    }
    /* ssp-col-title — хук ширины/кегля «Название» (#42 v2.3.2); в другом форке
       истории этого хука нет — легитимное межфорковое расхождение (DIFF_MAP). */
    cols.push({ id: 'title', title: T('histColTitle'), sortable: false, className: 'td-title ssp-col-title', getValue: _vmCell });
    cols.push({ id: 'priority', title: T('histColPriority'), sortable: false, className: 'td-hist-narrow', getValue: _vmCell });
    if (vm.hasXPri) {
      cols.push({ id: 'xpriority', title: T('histColXpriority'), sortable: false, className: 'td-hist-narrow', getValue: _vmCell });
    }
    cols.push({ id: 'state', title: T('histColState'), sortable: false, className: 'td-hist-narrow', getValue: _vmCell });
    cols.push({ id: 'incStatus', title: T('histColIncStatus'), sortable: false, className: 'td-hist-inc', getValue: _vmCell });
    cols.push({ id: 'alloc', title: T('histColAlloc'), sortable: false, className: 'td-num', headerClassName: 'td-num', getValue: _vmCell });
    cols.push({ id: 'assignee', title: T('histColAssignee'), sortable: false, className: 'td-title', getValue: _vmCell });
    cols.push({ id: 'delta', title: vm.deltaColTitle, sortable: false, className: 'td-num', headerClassName: 'td-num', getValue: _vmCell });

    /* Internal host div для Ring Table. Уникальный (per spoiler instance). */
    var host = document.createElement('div');
    host.setAttribute('data-ssp-table-host', '');
    tw.appendChild(host);
    itemsSlot.appendChild(tw);

    if (window.__SSP_TABLE) {
      window.__SSP_TABLE.mountAt(host, {
        items: vm.rows,
        columns: cols,
        sortKey: 'off',
        onSort: function() { /* no-op — history is read-only, headers not sortable */ },
        getItemKey: function(row) { return row.iid; },
        stickyHeader: false,
        emptyText: T('histNoTasks'),
      });
    } else {
      host.innerHTML = '<div class="empty">'+esc(T('histNoTasks'))+'</div>';
    }
  }

  /* Первичный рендер — снимок */
  __renderHistoryItemsBlock(rec.items, rec.roleKey);

  /* Listener тоггла — переключаем источник.
     v2.0.0 D5-D — change-event bubbles из Ring Radio host span (dataset.value updated). */
  if (wcDraftForToggle) {
    var wcHostEl = body.querySelector('[data-ssp-radio-host]');
    if (wcHostEl) {
      wcHostEl.addEventListener('change', function(ev) {
        ev.stopPropagation();
        var v = wcHostEl.dataset.value;
        if (v === 'wc') {
          __renderHistoryItemsBlock(wcDraftForToggle.items || [], rec.roleKey);
          if (noticeEl) noticeEl.classList.remove('hidden');
        } else if (v === 'snap') {
          __renderHistoryItemsBlock(rec.items, rec.roleKey);
          if (noticeEl) noticeEl.classList.add('hidden');
        }
      });
    }
    /* Клики по toggle не должны сворачивать спойлер */
    var ws = body.querySelector('.wc-spoiler-toggle');
    if (ws) ws.addEventListener('click', function(ev){ ev.stopPropagation(); });
  }

  wrap.appendChild(head); wrap.appendChild(body);
  /* v2.0.0 D5-D — mount Ring Radio для wc-toggle если есть. Делаем после append'а
     в body чтобы createRoot работал на attached node (React 19 best practice). */
  if (wcDraftForToggle && window.__SSP_RADIO && typeof window.__SSP_RADIO.mountAllIn === 'function') {
    window.__SSP_RADIO.mountAllIn(wrap);
  }
  return wrap;
}

const api = {
  renderHistory: renderHistory,
  buildSpoiler: buildSpoiler,
  groupHistoryBySprint: groupHistoryBySprint,
};

if (typeof window !== 'undefined') {
  try { window.__SSP_HISTORY_VIEW = api; } catch (_) { /* sandboxed write may throw */ }
}

module.exports = api;
