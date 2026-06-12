/* Диаграмма Ганта — view вкладки «Гант» (v4.0.0): таблица «задача × дни» с
   полосами в цвет родного stateColor задачи YT (v2.1.14), бейджем состояния
   и прогрессивной строкой истории переходов «← было…» (#20), плюс
   click-контракт реассайна (v5.7.0 D46, модал через deps).
   Вынесено из legacy-monolith.js (Тир D слайс 6, ступень 1) за мост
   window.__SSP_GANTT_VIEW; ступень 2 (#39) — вся compute-логика в
   _buildGanttVm (pure), рендер — React-компонент react/gantt-view.jsx за
   мостом window.__SSP_GANTT_MOUNT (timeline-ядро кастомное: Ring не даёт
   примитива чарта — итоги feasibility в шапке jsx). Golden-характеризация —
   tests/golden/render-shell.golden.test.js: контракт «модуль → __SSP_GANTT_MOUNT»
   (vm), React-сторона — живьём (build + live-smoke).

   Deps приходят АРГУМЕНТОМ на каждый вызов (фабрика _ganttDeps() в монолите).
   state — get-аксессоры монолитного стейта, читаются СТРОГО В МОМЕНТ обращения;
   настройки/права в click-хендлере реассайна читаются НА МОМЕНТ КЛИКА
   (vm.onCellClick), не рендера. История #20: план фетча считается при билде vm,
   но стартует ПОСЛЕ коммита DOM (vm.onAfterRender из useEffect компонента) —
   DOM-поки кэш-хитов youtrack-api должны попадать в уже закоммиченные
   плейсхолдеры. Кэш _ganttStateHist живёт в монолите (youtrack-api deps,
   Тир C) — модуль его не трогает; обратные DOM-апдейты — _updateGanttHistDOM
   (его зовёт youtrack-api по мере прихода чанков activities).

   Empty-ветки остаются vanilla (показ #ganttEmpty / текст histNoDates) —
   статика вне React, как empty-states Stand-up; перед vanilla-веткой React-root
   демонтируется (unmountAt). */
'use strict';

/* Pure-билдер view-model Ганта. Возвращает null, если нет задач с датами
   (empty-ветка — на вызывающем). Сайд-эффектов нет: фетч-план возвращается
   данными (fetchPlan), решение «когда стартовать» — за onAfterRender. */
function _buildGanttVm(deps) {
  var rec = deps.state.getCurrentSprintRoleRec();
  var rk  = rec.roleKey || (deps.getActiveRoles()[0] || deps.ALL_ROLES[0]).key;
  /* v5.0.3 — если запись соответствует активному _sprint, берём live items
     из _roleItems[rk] (могут быть свежее snapshot); иначе — items из истории. */
  var _isActiveSprint = deps.isActiveSprintRecord(rec);
  var items = _isActiveSprint ? deps.getRoleItemsArr(rk) : (rec.items || []);
  var active = items.filter(function(i){ return deps.ACTIVE_INC.indexOf(i.inclusionStatus) >= 0; });
  var ta  = (deps.state.getCurrentRolePP().taskAssignments || {});
  /* v6.1.0 D81 (F4) — multi-key sort на Ганте. */
  if (typeof deps.multiKeySort === 'function') active = deps.multiKeySort(active, undefined, ta);
  var sprint = deps.state.getSprint();

  // Задачи с назначенными датами
  var ganttItems = active.map(function(item) {
    var issueId = item.issueId;
    var ta_entry = ta[issueId] || {};
    var sprintStart = rec.dateStart || (sprint && sprint.dateStart);
    var sprintEnd   = rec.dateEnd   || (sprint && sprint.dateEnd);
    var start = ta_entry.dateStart || sprintStart;
    var end   = ta_entry.dateEnd   || sprintEnd;
    /* v2.1.14 — цвет полосы = родной цвет состояния YT (item.stateColor).
       Fallback — нейтральный серый при отсутствии state или цвета. */
    var bg = (item.stateColor && item.stateColor.background)
      ? item.stateColor.background
      : deps.ASSIGNEE_FALLBACK_COLOR;
    return {
      issueId:        issueId,
      title:          item.title || issueId,
      url:            item.url || '',
      assignee:       ta_entry.assigneeName || ta_entry.assignee || deps.T('ganttBarTooltipUnassigned'),
      start:          start,
      end:            end,
      bg:             bg,
      state:          item.state || '',
      stateLocalized: item.stateLocalized || item.state || '',
      stateColor:     item.stateColor || null,
      stateFieldId:   item.stateFieldId || null,
    };
  }).filter(function(g){ return g.start && g.end; });

  if (!ganttItems.length) return null;

  // Определить диапазон
  var minTs = Math.min.apply(null, ganttItems.map(function(g){ return g.start; }));
  var maxTs = Math.max.apply(null, ganttItems.map(function(g){ return g.end;   }));
  var dayMs = 86400000;
  var totalDays = Math.max(1, Math.ceil((maxTs - minTs) / dayMs)) + 1;

  // Ось дат
  var days = [];
  for (var d = 0; d < totalDays; d++) {
    var dayTs = minTs + d * dayMs;
    var dayDate = new Date(dayTs);
    days.push({
      label: (dayDate.getDate()) + '.' + String(dayDate.getMonth()+1).padStart(2,'0'),
      weekend: dayDate.getDay() === 0 || dayDate.getDay() === 6,
    });
  }

  // Строки: позиция полосы в днях + данные бейджа состояния (#20)
  var rows = ganttItems.map(function(g) {
    var badge = null;
    if (g.state || g.stateLocalized) {
      badge = {
        label:  g.stateLocalized || g.state,
        /* родные цвета stateColor YT; fallback фона — Ring-токен (#39) */
        pillBg: (g.stateColor && g.stateColor.background)
          ? g.stateColor.background
          : 'var(--ring-tag-background-color, #c8c8c8)',
        pillFg: (g.stateColor && g.stateColor.foreground) ? g.stateColor.foreground : '#1a1a1a',
        hist:   _isActiveSprint,
        loadingText: deps.T('ganttStateLoading'),
      };
    }
    return {
      issueId:  g.issueId,
      title:    g.title,
      url:      g.url,
      assignee: g.assignee,
      bg:       g.bg,
      startDay: Math.round((g.start - minTs) / dayMs),
      endDay:   Math.round((g.end   - minTs) / dayMs),
      badge:    badge,
    };
  });

  // План history-фетча (#20): только активный спринт при настроенном fieldState
  var fetchPlan = null;
  var settingsNow = deps.state.getSettings();
  if (_isActiveSprint && settingsNow && settingsNow.fieldState) {
    var _histIds = ganttItems.map(function(g){ return g.issueId; });
    var _histStates = {};
    var _stateFieldId = '';
    ganttItems.forEach(function(g){
      _histStates[g.issueId] = g.stateLocalized || g.state || '';
      if (!_stateFieldId && g.stateFieldId) _stateFieldId = g.stateFieldId;
    });
    fetchPlan = {
      ids: _histIds,
      key: (deps.state.getCurrentSprintId() || '') + ':' + rk,
      states: _histStates,
      fieldId: _stateFieldId,
    };
  }

  return {
    vm: { taskColHeader: deps.T('ganttColTask'), days: days, rows: rows },
    fetchPlan: fetchPlan,
  };
}

/* Фабрика click-хендлера реассайна (D46): дебаунс per-cell (WeakMap по DOM-ячейке,
   как per-cell таймеры vanilla-рендера), проверки настроек/прав/readonly —
   НА МОМЕНТ КЛИКА через deps.state. */
function _makeGanttCellClick(deps) {
  var timers = new WeakMap();
  return function (issueId, cellEl) {
    if (cellEl && timers.get(cellEl)) return;
    var t = setTimeout(function() {
      if (cellEl) timers.delete(cellEl);
      deps.startPermissionsCheck().then(function() {
        var settings = deps.state.getSettings();
        if (!(settings && settings.dynEditEnabled)) {
          try { deps.toast(deps.T('ganttReassignDisabledByInlineEdit'), 'warn'); } catch(_){}
          return;
        }
        var isEditor = deps.state.getIsEditor();
        if (typeof isEditor !== 'undefined' && isEditor === false) {
          try { deps.toast(deps.T('ganttReassignNoRights'), 'warn'); } catch(_){}
          return;
        }
        var ganttPanel = document.getElementById('tab-gantt');
        if (ganttPanel && ganttPanel.classList.contains('readonly-mode')) {
          try { deps.toast(deps.T('ganttReassignNoRights'), 'warn'); } catch(_){}
          return;
        }
        if (typeof deps.openReassignModal === 'function') deps.openReassignModal(issueId);
      });
    }, 250);
    if (cellEl) timers.set(cellEl, t);
  };
}

function renderGanttChart(deps) {
  var container = document.getElementById('ganttContainer');
  var emptyEl   = document.getElementById('ganttEmpty');
  var mount = (typeof window !== 'undefined' && window.__SSP_GANTT_MOUNT) || null;
  if (!deps.state.getCurrentSprintRoleRec() || !deps.state.getCurrentRolePP()) {
    if (emptyEl) emptyEl.style.display = '';
    return;
  }
  var built = _buildGanttVm(deps);
  if (!built) {
    /* Empty-ветка vanilla (вне React): демонтировать root, показать баннер.
       Квирк v4.0.0 сохранён: emptyEl переносится ВНУТРЬ контейнера и гибнет
       при следующем data-рендере → последующие empty показывают текст. */
    if (container && mount && typeof mount.unmountAt === 'function') mount.unmountAt(container);
    if (emptyEl) emptyEl.style.display = '';
    container.innerHTML = '';
    container.appendChild(emptyEl || document.createTextNode(deps.T('histNoDates')));
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  var vm = built.vm;
  vm.onCellClick = _makeGanttCellClick(deps);
  vm.onAfterRender = function () {
    if (!built.fetchPlan) return;
    deps.fetchGanttStateHistory(built.fetchPlan.ids, built.fetchPlan.key, false,
      built.fetchPlan.states, built.fetchPlan.fieldId);
  };
  if (container && mount && typeof mount.mountAt === 'function') mount.mountAt(container, vm);
}

/* DOM-аппликатор строки истории переходов (#20): заполняет плейсхолдеры
   since/prev по мере прихода чанков activities (зовёт youtrack-api через
   делегатор монолита в _ytApiDeps). Поверх React-дерева легитимен: апдейты
   точечные, каждый новый рендер даёт свежие плейсхолдеры и новый фетч-пинок. */
function _updateGanttHistDOM(container, issueId, hist, deps) {
  var sinceEl = container.querySelector('[data-gantt-hist-since="' + issueId + '"]');
  var prevEl  = container.querySelector('[data-gantt-hist-prev="'  + issueId + '"]');
  if (sinceEl) {
    sinceEl.textContent = hist.sinceTs ? deps.T('ganttStateSince').replace('{date}', deps.fmtGanttDate(hist.sinceTs)) : '';
  }
  if (prevEl) {
    if (!hist.prev) {
      prevEl.textContent = deps.T('ganttStateNoTransitions');
    } else {
      var dotBg  = (hist.prevColor && hist.prevColor.background) ? hist.prevColor.background : deps.ASSIGNEE_FALLBACK_COLOR;
      var ago    = hist.sinceTs ? deps.ganttDaysAgo(hist.sinceTs) : null;
      var agoStr = ago !== null ? (' · ' + deps.T('ganttStateAgo').replace('{n}', String(ago))) : '';
      prevEl.innerHTML =
        '<span style="display:inline-block;width:5px;height:5px;border-radius:50%;background:' + dotBg + ';margin-right:3px;vertical-align:middle"></span>' +
        deps.esc(deps.T('ganttStateWas').replace('{state}', hist.prev)) + agoStr;
    }
  }
}

const api = {
  renderGanttChart: renderGanttChart,
  _buildGanttVm: _buildGanttVm,
  _updateGanttHistDOM: _updateGanttHistDOM,
};

if (typeof window !== 'undefined') {
  try { window.__SSP_GANTT_VIEW = api; } catch (_) { /* sandboxed write may throw */ }
}

module.exports = api;
