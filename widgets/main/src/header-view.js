/* Шапка виджета — view «общего контекста спринта» (v5.4.0, журнал D25–D29):
   селектор логических спринтов, per-role статус-бейджи (v1.8.1), индикатор
   рабочей копии, подпись полного имени спринта в global-рельсе (#25 Ф2 п.6)
   + хелперы «логического спринта». Вынесено из legacy-monolith.js (Тир D
   слайс 5, ступень 1) за мост window.__SSP_HEADER_VIEW; golden-характеризация —
   tests/golden/render-shell.golden.test.js (через делегаторы монолита).

   Deps приходят АРГУМЕНТОМ на каждый вызов (фабрика _headerDeps() в монолите).
   state — get/set-аксессоры монолитного стейта, читаются СТРОГО В МОМЕНТ
   обращения. Рендер ПИШЕТ _currentSprintId (D72-сброс при пустом селекторе,
   fallback на первый видимый) через raw-сеттер deps.state.setCurrentSprintId —
   это НЕ контроллер setCurrentSprintId монолита (тот сам зовёт рендер шапки).
   Контроллеры (setCurrentSprintId/doNewSprint/share-цепочка #36) и init-бинды
   (bindWidgetHeader, дерево/каркас global-рельса) остаются в монолите. */
'use strict';

/* Ранг статусов для агрегации бейджа (D27): чем меньше rank — тем «менее продвинут». */
var STATUS_RANK = { PLANNING: 0, CONFIRMED: 1, ALLOCATED: 2, FINISHED: 3 };

/* Уникальные id «логических спринтов» (без суффикса _<roleKey>),
   отсортированные по свежести (активный _sprint первым, далее по rec.confirmedAt). */
function getLogicalSprintIds(deps) {
  var _sprint = deps.state.getSprint();
  var _history = deps.state.getHistory();
  var seen = {};
  var entries = []; // {id, sortKey}
  if (_sprint && _sprint.sprintId) {
    seen[_sprint.sprintId] = true;
    entries.push({ id: _sprint.sprintId, sortKey: Date.now() });
  }
  if (Array.isArray(_history)) {
    _history.forEach(function(rec) {
      if (!rec || !rec.sprintId) return;
      var logical = String(rec.sprintId).split('_')[0];
      if (seen[logical]) return;
      seen[logical] = true;
      entries.push({ id: logical, sortKey: rec.confirmedAt || 0 });
    });
  }
  entries.sort(function(a, b) { return b.sortKey - a.sortKey; });
  return entries.map(function(e) { return e.id; });
}

/* Все per-role записи _history для логического id (rec.sprintId === <id>_<roleKey>). */
function getSprintRolesEntries(logicalId, deps) {
  var _history = deps.state.getHistory();
  if (!logicalId || !Array.isArray(_history)) return [];
  return _history.filter(function(rec) {
    return rec && rec.sprintId && String(rec.sprintId).indexOf(logicalId + '_') === 0;
  });
}

/* Метаданные «логического спринта» для шапки.
   status = минимальный по STATUS_RANK среди не-FINAL ролей (D27).
   Возвращает null, если все роли FINAL (такой спринт не показываем в селекторе). */
function getSprintMeta(logicalId, deps) {
  if (!logicalId) return null;
  var _sprint = deps.state.getSprint();
  var entries = getSprintRolesEntries(logicalId, deps);
  var meta = { name: '', dateStart: null, dateEnd: null,
               status: 'PLANNING', statusByRole: {} };
  if (_sprint && _sprint.sprintId === logicalId) {
    meta.name      = _sprint.name      || '';
    meta.dateStart = _sprint.dateStart || null;
    meta.dateEnd   = _sprint.dateEnd   || null;
  }
  var minRank = Infinity;
  entries.forEach(function(rec) {
    if (!rec.status || rec.status === deps.STATUS.FINISHED) return;
    if (!meta.name      && rec.name)      meta.name      = rec.name;
    if (!meta.dateStart && rec.dateStart) meta.dateStart = rec.dateStart;
    if (!meta.dateEnd   && rec.dateEnd)   meta.dateEnd   = rec.dateEnd;
    var rank = STATUS_RANK[rec.status];
    if (rank != null && rank < minRank) { minRank = rank; meta.status = rec.status; }
    if (rec.roleKey) meta.statusByRole[rec.roleKey] = rec.status;
  });
  /* Особый случай: только активный _sprint без role-snapshot'ов в _history.
     Это первая загрузка только что созданного спринта — возвращаем PLANNING-meta
     по данным _sprint, чтобы строка появилась в селекторе. */
  if (minRank === Infinity) {
    if (_sprint && _sprint.sprintId === logicalId && meta.name) {
      meta.status = _sprint.status || 'PLANNING';
      return meta;
    }
    return null;
  }
  return meta;
}

/* Есть ли для данного логического спринта хотя бы одна working copy (любая роль). */
function hasWorkingCopyForSprint(logicalId, deps) {
  var _workingDrafts = deps.state.getWorkingDrafts();
  if (!logicalId || !_workingDrafts) return false;
  var keys = Object.keys(_workingDrafts);
  for (var i = 0; i < keys.length; i++) {
    if (keys[i].indexOf(logicalId + '_') === 0) return true;
  }
  return false;
}

/* #25 Ф2 п.6 — полное имя текущего спринта под селектором (нативный <select> обрезает;
   показываем выбранный текст отдельной подписью с переносом до 4 строк). Только global-рельс. */
function _updateRailSprintName() {
  var el = document.getElementById('sspRailSprintName');
  if (!el) return;
  var sel = document.getElementById('widgetSprintSel');
  var txt = '';
  if (sel && sel.value && sel.selectedIndex >= 0 && sel.options[sel.selectedIndex]) {
    txt = (sel.options[sel.selectedIndex].textContent || '').trim();
  }
  el.textContent = txt;
}

/* Идемпотентный рендер шапки виджета.
   Вызывается при init, после loadAllData, при смене селектора, после
   saveRoleHistorySnapshot/finishHistorySprint/_workingDraftsScheduleFlush. */
function renderWidgetHeader(deps) {
  var headerEl = document.getElementById('widgetHeader');
  if (!headerEl) return;
  var sel    = document.getElementById('widgetSprintSel');
  var badge  = document.getElementById('widgetSprintBadge');
  var wcInd  = document.getElementById('widgetWcIndicator');
  if (!sel || !badge || !wcInd) return;
  var T = deps.T, esc = deps.esc, fmtDate = deps.fmtDate;

  /* 1. Заполняем селектор */
  var ids = getLogicalSprintIds(deps);
  /* Фильтруем id с meta=null (все роли FINAL) */
  var visibleIds = [];
  var metaCache = {};
  ids.forEach(function(id) {
    var m = getSprintMeta(id, deps);
    if (m) { visibleIds.push(id); metaCache[id] = m; }
  });

  sel.innerHTML = '';
  if (!visibleIds.length) {
    /* v6.1.0 D72 — нет видимых спринтов → сбросить _currentSprintId, иначе он
       продолжает указывать на удалённую/невидимую запись и ломает рендер вкладок. */
    if (deps.state.getCurrentSprintId()) {
      deps.state.setCurrentSprintId(null);
      var ui0 = deps.draft.get('ui') || {}; ui0.currentSprintId = null; deps.draft.set('ui', ui0);
    }
    var opt0 = document.createElement('option');
    opt0.value = ''; opt0.disabled = true; opt0.selected = true;
    opt0.textContent = T('phNoSprintsActive');
    sel.appendChild(opt0); sel.disabled = true;
  } else {
    sel.disabled = false;
    visibleIds.forEach(function(id) {
      var m = metaCache[id];
      var opt = document.createElement('option');
      opt.value = id;
      opt.textContent = (m.name || id) +
        (m.dateStart ? ' · ' + fmtDate(m.dateStart) : '') +
        (m.dateEnd   ? ' — ' + fmtDate(m.dateEnd)   : '');
      sel.appendChild(opt);
    });
    /* Восстановить _currentSprintId, если он валиден; иначе взять первый */
    var cur = deps.state.getCurrentSprintId();
    if (cur && visibleIds.indexOf(cur) >= 0) {
      sel.value = cur;
    } else {
      sel.value = visibleIds[0];
      deps.state.setCurrentSprintId(visibleIds[0]);
      var ui = deps.draft.get('ui') || {}; ui.currentSprintId = visibleIds[0]; deps.draft.set('ui', ui);
    }
  }

  /* 2. Бейджи статуса — список per-role (v1.8.1).
     Раньше — единый агрегированный бейдж с min(STATUS_RANK) среди ролей. Это
     вводило в заблуждение: при одной аллоцированной и одной черновой роли в шапке
     висел «Черновик». Теперь — explicit список «Роль: Статус».
     Источник статуса каждой роли:
       - запись в _history (per-role snapshot) — берём её status (включая FINISHED);
       - если записи нет — PLANNING (роль ещё не валидирована). */
  var curId = deps.state.getCurrentSprintId();
  if (curId) {
    var activeRoles = (typeof deps.getActiveRoles === 'function' && deps.getActiveRoles().length)
      ? deps.getActiveRoles()
      : deps.ALL_ROLES;
    var entries = getSprintRolesEntries(curId, deps);
    var statusByRole = {};
    entries.forEach(function(rec) {
      if (rec && rec.roleKey && rec.status) statusByRole[rec.roleKey] = rec.status;
    });
    badge.classList.remove('hidden');
    badge.classList.remove('widget-header__badge--planning',
      'widget-header__badge--confirmed',
      'widget-header__badge--allocated',
      'widget-header__badge--finished');
    badge.removeAttribute('title');
    /* v1.8.1 — inline-стили убраны, layout управляется через CSS .widget-header__badge
       (flex-wrap + flex-basis:100%). Inline-style раньше дублировал и конфликтовал с CSS,
       из-за чего при 4+ ролях бейджи наезжали на селектор спринта. */
    badge.removeAttribute('style');
    var _diagDump = activeRoles.map(function(role) {
      return role.key + '=' + (statusByRole[role.key] || 'PLANNING(default)');
    }).join(', ');
    deps.diag('[RENDER-HEADER] sprintId='+curId+' entries='+entries.length+' roles=['+_diagDump+']', 'info');
    badge.innerHTML = activeRoles.map(function(role) {
      var st = statusByRole[role.key] || 'PLANNING';
      var stLabel = (typeof deps.statusLabel === 'function') ? deps.statusLabel(st) : st;
      var rLabel  = (typeof deps.roleLabel === 'function') ? deps.roleLabel(role) : (role.label || role.key);
      var cls     = 's-badge s-badge--' + String(st).toLowerCase();
      return '<span class="'+cls+'" title="'+esc(rLabel + ': ' + stLabel)+'">'
           +    '<span style="opacity:.7">'+esc(rLabel)+':</span> '+esc(stLabel)
           + '</span>';
    }).join('');
  } else {
    badge.classList.add('hidden');
    badge.innerHTML = '';
  }

  /* 3. WC indicator */
  if (curId && hasWorkingCopyForSprint(curId, deps)) {
    wcInd.classList.remove('hidden');
  } else {
    wcInd.classList.add('hidden');
  }
  /* Кнопка «+ Новый спринт» — visibility управляется .editor-btn classом
     через общую цепочку init (как остальные editor-кнопки виджета). */
  /* #25 Ф2 п.6 — синхронизировать подпись полного имени спринта в global-рельсе. */
  if (typeof _updateRailSprintName === 'function') { try { _updateRailSprintName(); } catch(_){} }
}

const api = {
  renderWidgetHeader: renderWidgetHeader,
  getLogicalSprintIds: getLogicalSprintIds,
  _updateRailSprintName: _updateRailSprintName,
};

if (typeof window !== 'undefined') {
  try { window.__SSP_HEADER_VIEW = api; } catch (_) { /* sandboxed write may throw */ }
}

module.exports = api;
