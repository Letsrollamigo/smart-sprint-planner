/* Диаграмма Ганта — view вкладки «Гант» (v4.0.0): таблица «задача × дни» с
   полосами в цвет родного stateColor задачи YT (v2.1.14), бейджем состояния
   и прогрессивной строкой истории переходов «← было…» (#20), плюс
   click-контракт реассайна (v5.7.0 D46, модал через deps). Timeline-ядро —
   кастомный рендер (Ring не даёт примитива чарта, бэклог #39).
   Вынесено из legacy-monolith.js (Тир D слайс 6, ступень 1) за мост
   window.__SSP_GANTT_VIEW; golden-характеризация —
   tests/golden/render-shell.golden.test.js (через делегаторы монолита).

   Deps приходят АРГУМЕНТОМ на каждый вызов (фабрика _ganttDeps() в монолите).
   state — get-аксессоры монолитного стейта, читаются СТРОГО В МОМЕНТ обращения;
   настройки/права в click-хендлере реассайна читаются НА МОМЕНТ КЛИКА, не
   рендера. Кэш истории _ganttStateHist живёт в монолите (youtrack-api deps,
   Тир C) — модуль его не трогает: фетч идёт через deps.fetchGanttStateHistory,
   обратные DOM-апдейты — через _updateGanttHistDOM (его зовёт youtrack-api
   по мере прихода чанков activities). */
'use strict';

function renderGanttChart(deps) {
  var container = document.getElementById('ganttContainer');
  var emptyEl   = document.getElementById('ganttEmpty');
  if (!deps.state.getCurrentSprintRoleRec() || !deps.state.getCurrentRolePP()) {
    if (emptyEl) emptyEl.style.display = '';
    return;
  }
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

  if (!ganttItems.length) {
    if (emptyEl) emptyEl.style.display = '';
    container.innerHTML = '';
    container.appendChild(emptyEl || document.createTextNode(deps.T('histNoDates')));
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  // Определить диапазон
  var minTs = Math.min.apply(null, ganttItems.map(function(g){ return g.start; }));
  var maxTs = Math.max.apply(null, ganttItems.map(function(g){ return g.end;   }));
  var dayMs = 86400000;
  var totalDays = Math.max(1, Math.ceil((maxTs - minTs) / dayMs)) + 1;

  // ── Цвета Ганта: цвет полосы — родной stateColor задачи (v2.1.14), вычислен в map выше.

  // Построить HTML-таблицу Ганта
  var html = '<table style="border-collapse:collapse;min-width:600px;font-size:12px">';

  // Шапка: дни
  html += '<thead><tr>';
  html += '<th style="min-width:180px;max-width:220px;padding:6px 10px;background:var(--surface2);border:1px solid var(--border);position:sticky;left:0;z-index:2;white-space:nowrap;font-weight:600;font-size:12px">'+deps.T('ganttColTask')+'</th>';
  for (var d = 0; d < totalDays; d++) {
    var dayTs = minTs + d * dayMs;
    var dayDate = new Date(dayTs);
    var dayLabel = (dayDate.getDate()) + '.' + String(dayDate.getMonth()+1).padStart(2,'0');
    var isWeekend = dayDate.getDay() === 0 || dayDate.getDay() === 6;
    // Даты — чёрный читаемый шрифт; выходные чуть светлее
    var dateColor = isWeekend ? 'var(--muted)' : 'var(--text)';
    var dateBg    = isWeekend ? 'rgba(255,255,255,.03)' : 'var(--surface2)';
    html += '<th style="min-width:34px;padding:4px 3px;background:'+dateBg+';border:1px solid var(--border);font-weight:700;font-size:11px;color:'+dateColor+';text-align:center;white-space:nowrap">'+dayLabel+'</th>';
  }
  html += '</tr></thead><tbody>';

  ganttItems.forEach(function(g) {
    var startDay = Math.round((g.start - minTs) / dayMs);
    var endDay   = Math.round((g.end   - minTs) / dayMs);
    /* цвет уже вычислен в g.bg (stateColor задачи, v2.1.14) */

    html += '<tr data-gantt-issue="'+deps.esc(g.issueId)+'">';
    html += '<td style="padding:4px 8px;border:1px solid var(--border);position:sticky;left:0;background:var(--surface);z-index:1;max-width:220px;overflow:hidden" title="'+deps.esc(g.title)+'">' +
            '<a href="'+deps.safeUrl(g.url)+'" target="_blank" class="link" style="font-weight:600;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+deps.esc(g.issueId)+'</a>' +
            '<div style="font-size:11px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+deps.esc(g.assignee)+'</div>' +
            _renderGanttStateBadge(g, _isActiveSprint, deps) +
            '</td>';

    for (var d2 = 0; d2 < totalDays; d2++) {
      var inBar   = d2 >= startDay && d2 <= endDay;
      var isStart = d2 === startDay;
      var isEnd   = d2 === endDay;
      var isSingle = isStart && isEnd;

      // Стиль ячейки — нейтральный, без фона; полоса рисуется внутренним div-ом
      var cellStyle = 'padding:0;border:1px solid var(--border);min-width:34px;height:36px;cursor:'+(inBar?'pointer':'default')+';position:relative;overflow:hidden;';

      var innerDiv = '';
      if (inBar) {
        // Высота полосы — 60% высоты ячейки, центрируется через flex
        // border-radius: pill на торцах, прямая линия посередине
        var r = '999px';
        var br;
        if (isSingle) {
          br = r;                                  // полная пилюля
        } else if (isStart) {
          br = r+' 0 0 '+r;                        // скруглён только левый торец
        } else if (isEnd) {
          br = '0 '+r+' '+r+' 0';                  // скруглён только правый торец
        } else {
          br = '0';                                 // середина — без скругления
        }
        // Ячейка занимает полную ширину; start/end добавляют padding чтобы торец не упирался
        var pl = isStart  ? '4px' : '0';
        var pr = isEnd    ? '4px' : '0';
        // Между ячейками полосы нет горизонтального зазора — overflow:hidden обеспечивает ровный стык
        innerDiv = '<div style="'+
          'position:absolute;top:50%;left:'+pl+';right:'+pr+';'+
          'transform:translateY(-50%);'+
          'height:60%;'+
          'background:'+g.bg+';'+
          'border-radius:'+br+';'+
          'box-shadow:0 2px 6px rgba(0,0,0,.18);'+
          'pointer-events:none'+
        '"></div>';
      }

      html += '<td class="gantt-cell" data-issue="'+deps.esc(g.issueId)+'" data-inbar="'+(inBar?'1':'0')+'" style="'+cellStyle+'">'+innerDiv+'</td>';
    }
    html += '</tr>';
  });
  html += '</tbody></table>';

  container.innerHTML = html;

  /* v5.7.0 — Этап 5 (D46): dblclick по бару открывает модал переназначения,
     а не toggle цвета. Старая модель _currentRoleGantt.tasks[].color рендером
     не используется вовсе (поле может оставаться в персисте legacy-записей). */
  var _ganttCells = container.querySelectorAll('.gantt-cell[data-inbar="1"]');
  _ganttCells.forEach(function(cell) {
    var _clickTimer = null;
    cell.addEventListener('click', function() {
      if (_clickTimer) return;
      var issueId = cell.getAttribute('data-issue');
      _clickTimer = setTimeout(function() {
        _clickTimer = null;
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
    });
  });
  var settingsNow = deps.state.getSettings();
  if (_isActiveSprint && settingsNow && settingsNow.fieldState) {
    var _histIds = ganttItems.map(function(g){ return g.issueId; });
    var _histStates = {};
    var _stateFieldId = '';
    ganttItems.forEach(function(g){
      _histStates[g.issueId] = g.stateLocalized || g.state || '';
      if (!_stateFieldId && g.stateFieldId) _stateFieldId = g.stateFieldId;
    });
    var _histKey = (deps.state.getCurrentSprintId() || '') + ':' + rk;
    deps.fetchGanttStateHistory(_histIds, _histKey, false, _histStates, _stateFieldId);
  }
}

/* Бейдж состояния задачи в левой колонке (#20): пилюля в родных цветах
   stateColor + (только на активном спринте) плейсхолдеры since/prev,
   которые заполняет _updateGanttHistDOM по приходу истории. */
function _renderGanttStateBadge(g, activeSprint, deps) {
  if (!g || (!g.state && !g.stateLocalized)) return '';
  var label  = g.stateLocalized || g.state;
  var pillBg = (g.stateColor && g.stateColor.background) ? g.stateColor.background : '#c8c8c8';
  var pillFg = (g.stateColor && g.stateColor.foreground) ? g.stateColor.foreground : '#1a1a1a';
  var pillHtml =
    '<span style="display:inline-flex;align-items:center;gap:3px;padding:1px 5px;border-radius:10px;' +
    'font-size:10px;line-height:1.4;background:' + pillBg + ';color:' + pillFg + ';' +
    'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%">' +
    '<span style="display:inline-block;width:5px;height:5px;border-radius:50%;background:' + pillFg + ';flex-shrink:0"></span>' +
    deps.esc(label) + '</span>';
  var sinceSpan = activeSprint
    ? '<span data-gantt-hist-since="' + deps.esc(g.issueId) + '" style="color:var(--muted);font-size:10px;margin-left:4px"></span>'
    : '';
  var prevDiv = activeSprint
    ? '<div data-gantt-hist-prev="' + deps.esc(g.issueId) + '" style="color:var(--muted);font-size:10px;margin-top:1px;white-space:normal">' + deps.esc(deps.T('ganttStateLoading')) + '</div>'
    : '';
  return '<div style="margin-top:2px;white-space:nowrap;overflow:hidden">' + pillHtml + sinceSpan + '</div>' + prevDiv;
}

/* DOM-аппликатор строки истории переходов (#20): заполняет плейсхолдеры
   since/prev по мере прихода чанков activities (зовёт youtrack-api через
   делегатор монолита в _ytApiDeps). */
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
  _renderGanttStateBadge: _renderGanttStateBadge,
  _updateGanttHistDOM: _updateGanttHistDOM,
};

if (typeof window !== 'undefined') {
  try { window.__SSP_GANTT_VIEW = api; } catch (_) { /* sandboxed write may throw */ }
}

module.exports = api;
