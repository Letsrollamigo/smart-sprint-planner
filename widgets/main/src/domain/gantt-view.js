/* Диаграмма Ганта — view вкладки «Гант» (v4.0.0): таблица «задача × дни» с
   полосами в цвет родного stateColor задачи YT (v2.1.14), бейджем состояния
   и прогрессивной строкой истории переходов «← было…» (#20), плюс
   click-контракт реассайна (v5.7.0 D46, модал через deps).
   Вынесено из core.js (Тир D слайс 6, ступень 1) за мост
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

/* ── #74 фаза 2: связи состава спринта ───────────────────────────────────────
   Links НЕ хранятся ни в составе спринта, ни в снимках истории (backend-whitelist
   их не знает) — поэтому фетч ЭФЕМЕРНЫЙ и схемы не касается вовсе.
   Два чанк-фетча (канон release-view.fetchIssueData): (1) связи задач состава,
   (2) состояние внешних предшественников — ⚖6 «номер + состояние», даты чужих
   проектов не тянем. Результат кэшируется на связку «спринт + роль»: билд vm
   синхронный, поэтому первый проход рисует Гант без стрелок, а приход данных
   запускает повторный renderGanttChart — стрелки появляются вторым кадром.
   Кэш модуль-приватный и транзиентный (прецедент — таймеры draft-store);
   зарегистрирован в module-registry (гейт C1). */
var _ganttLinks = { key: '', loading: false, data: null };

/* Реальный ретрай неполной загрузки связей (68-8 ⚖6): «Обновить из задачи» сбрасывает
   ключ, следующий onAfterRender стартует фетч заново. */
/* #94 — язык планера для подписей дат ('en', если аксессор не пробросили). */
function _langOf(deps) { return (deps && typeof deps.getLang === 'function' && deps.getLang()) || 'en'; }

function resetLinksCache() { _ganttLinks = { key: '', loading: false, data: null }; }

const GANTT_LINK_CHUNK = 50;
const GANTT_LINK_FIELDS = 'idReadable,links(direction,linkType(name,sourceToTarget,targetToSource),issues(idReadable))';
const GANTT_EXT_FIELDS = 'idReadable,customFields(name,projectCustomField(field(name)),value(name,localizedName,isResolved))';

function _linkChunks(ids) {
  var out = [];
  for (var i = 0; i < ids.length; i += GANTT_LINK_CHUNK) out.push(ids.slice(i, i + GANTT_LINK_CHUNK));
  return out;
}
/* Ошибка чанка не роняет Гант (он обязан нарисоваться и без связей), но и НЕ глотается:
   68-8 ⚖6 — провалы считаются и доезжают до легенды признаком «связи загрузились не
   полностью». Раньше пустой catch выдавал частичный результат за полный. */
function _fetchChunks(host, ids, fields, onIssue) {
  var failed = 0;
  return Promise.all(_linkChunks(ids).map(function (chunk) {
    return host.fetchYouTrack('issues', {
      query: { fields: fields, query: 'issue id: ' + chunk.join(', '), $top: chunk.length },
    }).then(function (issues) { (issues || []).forEach(onIssue); }).catch(function () { failed++; });
  })).then(function () { return failed; });
}

/* Локализованное состояние задачи (⚖6). Имя поля состояния — из настроек, с
   фолбэком на канонические, как в release-view._cfState. */
function _extState(iss, stateNames) {
  var cfs = (iss && iss.customFields) || [];
  for (var i = 0; i < cfs.length; i++) {
    var cf = cfs[i];
    var nm = (cf && cf.name) || (cf && cf.projectCustomField && cf.projectCustomField.field && cf.projectCustomField.field.name) || '';
    if (stateNames.indexOf(nm) < 0) continue;
    var v = cf.value;
    if (!v) continue;
    return { state: v.localizedName || v.name || '', resolved: !!v.isResolved };
  }
  return { state: '', resolved: false };
}

function _loadGanttLinks(deps, ids, key) {
  var host = deps.state.getHost && deps.state.getHost();
  if (!host || !ids.length) return;
  if (_ganttLinks.loading || _ganttLinks.key === key) return;
  var s = deps.state.getSettings() || {};
  var LR = (typeof window !== 'undefined' && window.__SSP_LINK_ROLES_PURE) || null;
  if (!LR) return;
  var matchers = LR.resolveLinkRoles(s).dependency;
  if (!matchers.length) { _ganttLinks = { key: key, loading: false, data: { preds: {}, ext: {} } }; return; }

  _ganttLinks.loading = true;
  var preds = {}, inSprint = {};
  ids.forEach(function (id) { inSprint[id] = true; });

  var _failed = 0;
  _fetchChunks(host, ids, GANTT_LINK_FIELDS, function (it) {
    if (!it || !it.idReadable) return;
    preds[it.idReadable] = LR.dependencyPreds(it, matchers);
  }).then(function (nf) {
    _failed += nf;
    var extIds = [], seen = {};
    Object.keys(preds).forEach(function (id) {
      preds[id].forEach(function (p) {
        if (inSprint[p.id] || seen[p.id]) return;
        seen[p.id] = true; extIds.push(p.id);
      });
    });
    var ext = {};
    if (!extIds.length) return ext;
    var stateNames = s.fieldState ? [s.fieldState, 'State', 'Состояние'] : ['State', 'Состояние'];
    return _fetchChunks(host, extIds, GANTT_EXT_FIELDS, function (it) {
      if (!it || !it.idReadable) return;
      ext[it.idReadable] = _extState(it, stateNames);
    }).then(function (nf) { _failed += nf; return ext; });
  }).then(function (ext) {
    _ganttLinks = { key: key, loading: false, data: { preds: preds, ext: ext || {}, partial: _failed > 0 } };
    /* Данные приехали — перерисовать Гант со стрелками (второй кадр). */
    try { if (typeof deps.renderGanttChart === 'function') deps.renderGanttChart(); } catch (_) {}
  }).catch(function () {
    /* Ошибка — фиксируем ключ с ПОМЕЧЕННЫМ частичным результатом: onAfterRender дёргается
       после КАЖДОГО коммита DOM, без фиксации получился бы бесконечный цикл рендер↔фетч.
       68-8 ⚖6: partial доезжает до легенды, а реальный ретрай даёт «Обновить из задачи» —
       она сбрасывает ключ через resetLinksCache (прежний комментарий про сброс ключа
       коду не соответствовал: сбрасывать было некому). */
    _ganttLinks = { key: key, loading: false, data: { preds: {}, ext: {}, partial: true } };
  });
}

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
      /* #94 — подпись дня в языке планера (был жёсткий D.MM). Формат короткий: на линейке
         помещается только день+месяц, год берётся из шапки периода. */
      label: dayDate.toLocaleDateString(_langOf(deps), { day: 'numeric', month: '2-digit' }),
      weekend: dayDate.getDay() === 0 || dayDate.getDay() === 6,
    });
  }

  // Строки: позиция полосы в днях + данные бейджа состояния (#20)
  // #20-v2 (v3.2.0) — startTs/endTs (сырые ms, канон ta) для gantt-task-react (drag дат).
  /* #74 фаза 2 — ключ кэша связей: спринт + роль, как у истории состояний. */
  /* 68-8 ⚖6 — в ключ входит и НАСТРОЙКА связей: без неё правка ролей типов связей
     оставляла кэш прежним и Гант рисовал стрелки по старым правилам. */
  var _LRP0 = (typeof window !== 'undefined' && window.__SSP_LINK_ROLES_PURE) || null;
  var _lrFp = _LRP0 ? JSON.stringify(_LRP0.resolveLinkRoles(deps.state.getSettings() || {}).dependency) : '';
  var linksKey = (deps.state.getCurrentSprintId() || '') + ':' + rk + ':links:' + _lrFp;
  var _linkData = (_ganttLinks.key === linksKey) ? _ganttLinks.data : null;
  var _idSet = {};
  ganttItems.forEach(function (g) { _idSet[g.issueId] = true; });

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
    /* #74 фаза 2 — предшественники: внутри спринта дают стрелку (нативный
       Task.dependencies), вне спринта — значок на строке (⚖5/⚖6). */
    var _p = (_linkData && _linkData.preds && _linkData.preds[g.issueId]) || [];
    var _in = [], _types = {}, _ext = [];
    _p.forEach(function (pr) {
      if (_idSet[pr.id]) { _in.push(pr.id); _types[pr.id] = pr.type; return; }
      var st = (_linkData && _linkData.ext && _linkData.ext[pr.id]) || { state: '', resolved: false };
      _ext.push({ id: pr.id, state: st.state, resolved: !!st.resolved, type: pr.type });
    });
    return {
      issueId:  g.issueId,
      title:    g.title,
      url:      g.url,
      assignee: g.assignee,
      bg:       g.bg,
      startDay: Math.round((g.start - minTs) / dayMs),
      endDay:   Math.round((g.end   - minTs) / dayMs),
      startTs:  g.start,
      endTs:    g.end,
      badge:    badge,
      deps:     _in,
      depTypes: _types,
      extDeps:  _ext,
    };
  });

  /* #74 ⚖7 — палитра на тип + легенда из фактически видимых обозначений. */
  var LRP = (typeof window !== 'undefined' && window.__SSP_LINK_ROLES_PURE) || null;
  var _linkColors = LRP ? LRP.dependencyColors(deps.state.getSettings() || {}) : {};
  var _seenTypes = {}, _hasExt = false;
  rows.forEach(function (r) {
    Object.keys(r.depTypes || {}).forEach(function (k) { _seenTypes[r.depTypes[k]] = true; });
    if (r.extDeps && r.extDeps.length) _hasExt = true;
  });
  var _legend = { types: Object.keys(_seenTypes).map(function (n) {
    return { name: n, color: _linkColors[n] || '' };
  }), external: _hasExt };

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

  /* #20-v2 (v3.2.0) — гейт редактирования drag'а дат: права editor + не readonly-режим
     панели (проверка на момент БИЛДА; повторный гейт — в самом onDateChange). */
  var ganttPanel = (typeof document !== 'undefined') ? document.getElementById('tab-gantt') : null;
  var readonly = !!(ganttPanel && ganttPanel.classList.contains('readonly-mode'));
  var isEditor = deps.state.getIsEditor();
  var editable = !(typeof isEditor !== 'undefined' && isEditor === false) && !readonly;

  return {
    vm: {
      taskColHeader: deps.T('ganttColTask'), days: days, rows: rows,
      /* #20-v2 — поля gantt-task-react: зум, локаль оси, редактируемость drag'а */
      editable: editable,
      lang: _langOf(deps),
      zoomLabels: { day: deps.T('ganttZoomDay'), week: deps.T('ganttZoomWeek'), month: deps.T('ganttZoomMonth') },
      fmtDate: deps.fmtGanttDate,
      /* #74 фаза 2 ⚖7 — цвет на тип связи (детерминирован порядком типов в настройке)
         и легенда: только фактически видимые обозначения. */
      linkColors: _linkColors,
      linkLegend: _legend,
      linksReady: !!_linkData,
      /* 68-8 ⚖6 — «связи загрузились не полностью»: раньше провал чанка был неотличим
         от «связей нет». Признак показывает легенда, ретрай — «Обновить из задачи». */
      linksPartial: !!(_linkData && _linkData.partial),
      i18nExt: {
        badge: deps.T('ganttExtDeps'),
        unknown: deps.T('ganttExtStateUnknown'),
        legend: deps.T('ganttLegendTitle'),
        legendExt: deps.T('ganttLegendExternal'),
        linksPartial: deps.T('ganttLinksPartial'),
      },
    },
    fetchPlan: fetchPlan,
    linksPlan: { ids: ganttItems.map(function (g) { return g.issueId; }), key: linksKey },
  };
}

/* #20-v2 (v3.2.0) — фабрика записи дат с drag'а бара: тот же канал, что авто-прогноз #40 —
   ta[issueId].dateStart/dateEnd (UTC-полночь ms, dateEnd ИНКЛЮЗИВНЫЙ последний день) +
   saveCurrentRoleState + синк таблицы текущей роли и самого Ганта (нормализация оси).
   Права перепроверяются на момент drop'а (не билда); не-editor — тихий no-op + перерендер
   (откат визуального сдвига либы). */
function _makeGanttDateChange(deps) {
  return function (issueId, startMs, endMs) {
    var isEditor = deps.state.getIsEditor();
    var pp = deps.state.getCurrentRolePP();
    var rerender = function () {
      if (typeof deps.renderGanttChart === 'function') { try { deps.renderGanttChart(); } catch (_) {} }
    };
    if ((typeof isEditor !== 'undefined' && isEditor === false) || !pp) { rerender(); return; }
    if (typeof startMs !== 'number' || typeof endMs !== 'number' || endMs < startMs) { rerender(); return; }
    if (!pp.taskAssignments) pp.taskAssignments = {};
    var ta = pp.taskAssignments;
    if (!ta[issueId]) ta[issueId] = {};
    ta[issueId].dateStart = startMs;
    ta[issueId].dateEnd   = endMs;
    deps.saveCurrentRoleState();
    if (typeof deps.renderCurrentRoleTaskTable === 'function') { try { deps.renderCurrentRoleTaskTable(); } catch (_) {} }
    rerender();
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
  var built;
  try {
    built = _buildGanttVm(deps);
  } catch (e) {
    /* #20-v2 fail-loud: OOPIF прячет исключения от top-консоли — показываем в пейне. */
    if (container) container.textContent = 'Gantt vm error: ' + String((e && e.message) || e);
    return;
  }
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
  var cellClick = _makeGanttCellClick(deps);
  vm.onCellClick = cellClick;
  /* #20-v2 — контракты gantt-task-react: drag дат + реассайн D46 двойным кликом по бару
     (одиночный клик у либы = select; прежний cell-click недоступен — ячеек больше нет). */
  vm.onDateChange = _makeGanttDateChange(deps);
  vm.onBarDoubleClick = function (issueId) { cellClick(issueId, null); };
  vm.onAfterRender = function () {
    /* #74 фаза 2 — связи: старт после коммита, как история состояний. Внутри guard
       по in-flight и по уже собранному ключу, иначе цикл (см. _loadGanttLinks). */
    if (built.linksPlan) _loadGanttLinks(deps, built.linksPlan.ids, built.linksPlan.key);
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
  resetLinksCache: resetLinksCache,   /* 68-8 ⚖6 — ретрай из «Обновить из задачи» */
  _buildGanttVm: _buildGanttVm,
  _updateGanttHistDOM: _updateGanttHistDOM,
};

if (typeof window !== 'undefined') {
  try { window.__SSP_GANTT_VIEW = api; } catch (_) { /* sandboxed write may throw */ }
}

module.exports = api;
