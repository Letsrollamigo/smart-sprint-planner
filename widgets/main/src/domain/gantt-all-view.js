/* Сквозной Гант по всем ролям (#122, v3.47.0 → v3.48.0) — domain-вью режима «Все роли» вкладки «Гант».
   Мост window.__SSP_GANTT_ALL_VIEW; deps — фабрика _ganttAllDeps() ядра, приходят аргументом на каждый
   вызов; стейт ядра читается аксессорами deps.state в момент обращения (права и заморозка #100 — на момент
   действия, не рендера). Правила (стадии, цепочка, конфликты, сворачивание, эпики) — pure/gantt-all-pure.js,
   презентация — react/gantt-all.jsx за мостом __SSP_GANTT_ALL_MOUNT (vm стэшится на #ganttContainer),
   прогноз по всем ролям — domain/gantt-all-forecast.js (через deps ядра).

   • renderGanttAll — дорожка на роль спринта в порядке стадий (⚖2/⚖3): заголовок-группа со сводной
     полосой, строки задач с полосами из personalPlanning роли (фолбэк — даты записи роли / рабочего
     спринта). История — из снимков <sprintId>_<rk> только чтение; роль без записи — «снимка нет», в живом
     спринте тоже только чтение (§О16: assignerSync такую запись молча пропускает).
   • 3.48.0: группы эпиков в дорожке ребёнка (§A6) — родитель в своей роли строкой группы (бар = охват
     подзадач), в чужой — пометкой роли; полосы без дат после прогноза — маркер без стрелок и сводный блок.
   • onDateChange / onAssigneeChange — правка любой роли: гейт прав → заморозка #100 → prev-снимок канона
     роли ДО мутации → мутация → savePlanningForRoles (история assignerSync → слот) → перерисовка.
   • toggleCollapsed — свёрнутость дорожек и эпиков на сессию (_collapsed); syncModeUi — кнопки «Роль | Все роли».
   Режим «Роль» по-прежнему рисует domain/gantt-view.js; корни React двух режимов на одном контейнере
   взаимно демонтируются при переключении. */
'use strict';

/* Свёрнутые группы по спринту { <sprintId>: { <groupId>: 1 } } — на сессию, без персиста (⚖9, §О6: блоб
   предпочтений 2 КБ на всё; как раскрытость блока исключённых #121). */
var _collapsed = {};

function _pure() { return (typeof window !== 'undefined' && window.__SSP_GANTT_ALL_PURE) || null; }
function _phasesPure() { return (typeof window !== 'undefined' && window.__SSP_PHASES_PURE) || null; }
function _linkRoles() { return (typeof window !== 'undefined' && window.__SSP_LINK_ROLES_PURE) || null; }
/* прогноз по всем ролям — domain-модуль gantt-all-forecast.js, приходит через deps ядра (звезда-топология B1) */
function _forecast(deps) { var F = deps && deps.ganttAllForecast; return (F && typeof F.unfitFor === 'function') ? F : null; }
function _isNum(v) { return typeof v === 'number' && isFinite(v); }

/* #100 — «локальный стейт разошёлся с сервером»: метку ставит api-слой, снимает перезагрузка. */
function _revConflictBlocked() {
  try { return !!(document.body && document.body.dataset && document.body.dataset.sspRevConflict === '1'); }
  catch (_) { return false; }
}

/* Гейты режима на момент вызова (§A3.2): история, readonly-mode панели и активная рабочая копия (§О4) —
   только чтение; drag — редактор; исполнитель — редактор или назначающий (⚖8). */
function _ctx(deps) {
  var st = deps.state;
  var sid = st.getCurrentSprintId();
  var sprint = st.getSprint();
  var live = !!(sid && sprint && sprint.sprintId === sid);
  var panel = document.getElementById('tab-gantt');
  var viewable = live && !(panel && panel.classList.contains('readonly-mode')) && !st.getActiveWorkingDraftKey();
  var isEditor = st.getIsEditor();
  return {
    sid: sid, sprint: sprint, live: live,
    editable: viewable && isEditor !== false,
    canAssign: viewable && (isEditor !== false || st.getIsAssigner() === true),
  };
}

function _histRec(deps, sid, rk) {
  return (deps.state.getHistory() || []).find(function (r) { return r && r.sprintId === sid + '_' + rk; }) || null;
}

/* Ключ кэша связей режима (§A3.4): матчеры зависимости и иерархии (3.48.0) — правка любой из ролей связей
   сбрасывает кэш; смена режима — тоже (ключ Ганта роли другой). */
function _linksKey(sid, settings) {
  var LR = _linkRoles(), lr = LR ? LR.resolveLinkRoles(settings || {}) : { dependency: [], hierarchy: [] };
  return sid + ':all:links:' + JSON.stringify(lr.dependency) + JSON.stringify(lr.hierarchy);
}

function _conflictText(x, bar, deps, labelOf, PH) {
  var T = deps.T, fmt = deps.fmtGanttDay;
  if (x.kind === 'before') {
    return T('ganttConflictBeforeTip').replace('{date}', fmt(bar.startMs)).replace('{issue}', x.predIssue)
      .replace('{role}', labelOf[x.predRole] || x.predRole).replace('{prevDate}', fmt(x.predEnd));
  }
  return T('ganttConflictPhaseTip').replace('{from}', fmt(x.from)).replace('{to}', fmt(x.to))
    .replace('{role}', labelOf[bar.rk] || bar.rk)
    .replace('{phases}', x.phases.map(function (k) { return T(PH.LABEL_KEYS[k]); }).join(' · '));
}

function _badge(item, live, deps) {
  if (!item.state && !item.stateLocalized) return null;
  var sc = item.stateColor || null;
  return {
    label: item.stateLocalized || item.state,
    pillBg: (sc && sc.background) ? sc.background : 'var(--ring-tag-background-color, #c8c8c8)',
    pillFg: (sc && sc.foreground) ? sc.foreground : '#1a1a1a',
    hist: live,
    loadingText: deps.T('ganttStateLoading'),
  };
}

/* Pure-билдер vm (голден render-shell). null — ни одной полосы ни в одной роли (empty-ветка у вызывающего). */
function _buildGanttAllVm(deps) {
  var P = _pure(), PH = _phasesPure(), LR = _linkRoles();
  var st = deps.state, T = deps.T, c = _ctx(deps);
  if (!P || !PH || !c.sid) return null;
  var settings = st.getSettings() || {};
  var roles = deps.getSprintRoles() || [];
  var labelOf = {};
  roles.forEach(function (r) { labelOf[r.key] = deps.roleLabel(r); });
  var stg = P.stages(roles.map(function (r) { return r.key; }), settings, PH.PHASE_KEYS);
  var cur = st.getCurrentSprintRoleRec();
  /* пометки последнего прогноза — только живой спринт и только полосам, так и оставшимся без своих дат */
  var unfitMap = (c.live && _forecast(deps)) ? _forecast(deps).unfitFor(c.sid) : {};

  var tracks = [], allBars = [], barsByIssue = {}, activeIds = {}, itemOf = {}, roleOfIssue = {}, sprintName = '';
  stg.order.forEach(function (rk) {
    var rec = _histRec(deps, c.sid, rk);
    if (rec && rec.name && !sprintName) sprintName = rec.name;
    var items = c.live ? deps.getRoleItemsArr(rk) : ((rec && rec.items) || []);
    var active = (items || []).filter(function (i) { return deps.ACTIVE_INC.indexOf(i.inclusionStatus) >= 0; });
    var pp = (rec && cur && cur.sprintId === rec.sprintId) ? st.getCurrentRolePP() : (rec ? deps.getPlanningForRole(rk) : null);
    var ta = (pp && pp.taskAssignments) || {};
    active = deps.multiKeySort(active, undefined, ta);
    var dStart = (rec && rec.dateStart) || (c.live && c.sprint ? c.sprint.dateStart : null);
    var dEnd = (rec && rec.dateEnd) || (c.live && c.sprint ? c.sprint.dateEnd : null);
    var bars = [];
    active.forEach(function (item) {
      activeIds[item.issueId] = true;
      if (!itemOf[item.issueId]) { itemOf[item.issueId] = item; roleOfIssue[item.issueId] = rk; }
      var e = ta[item.issueId] || {};
      var own = _isNum(e.dateStart) && _isNum(e.dateEnd);
      var uf = (!own && unfitMap[P.barKey(rk, item.issueId)]) || null;
      var s = uf ? dStart : (e.dateStart || dStart), en = uf ? dStart : (e.dateEnd || dEnd);
      if (!s || !en) return;
      var b = { key: P.barKey(rk, item.issueId), rk: rk, issueId: item.issueId, startMs: s, endMs: en,
        own: own, unfit: uf, item: item, e: e };
      bars.push(b); allBars.push(b);
      (barsByIssue[item.issueId] = barsByIssue[item.issueId] || []).push(b);
    });
    tracks.push({ rk: rk, rec: rec, pp: pp, bars: bars });
  });
  if (!allBars.length) return null;
  var whole = P.span(allBars);

  /* Связи — один фетч по объединению задач всех ролей (§A3.4); первый кадр без стрелок, явных конфликтов и эпиков. */
  var linksKey = _linksKey(c.sid, settings);
  var linkData = deps.linksDataFor(linksKey);
  var preds = (linkData && linkData.preds) || {};
  var linkColors = LR ? LR.dependencyColors(settings) : {};

  /* Группы эпиков (§A6): родитель в своей дорожке — строка группы вместо своей полосы (id либы epic:rk:P);
     его собственные даты не показываются и в конфликты не идут, связи и цепочка рисуются к строке группы. */
  var libId = {};
  tracks.forEach(function (t) {
    t.layout = P.epicLayout(t.bars.map(function (b) { return b.issueId; }), (linkData && linkData.parents) || {}, activeIds);
    t.layout.forEach(function (g) { if (g.children && g.own) libId[P.barKey(t.rk, g.id)] = 'epic:' + t.rk + ':' + g.id; });
  });
  var lid = function (k) { return libId[k] || k; };

  /* Фазы (§A3.7): при тумблере — снимок фаз спринта (слот либо снимок роли в истории). */
  var phasesOn = settings.phasesEnabled === true;
  var phaseRoles = settings.phaseRoles || {};
  var phSrcRec = c.live ? null : (st.getHistory() || []).find(function (r) { return r && r.phases && r.sprintId.indexOf(c.sid + '_') === 0; });
  var phases = PH.normalize(c.live ? (c.sprint && c.sprint.phases) : (phSrcRec && phSrcRec.phases));
  var phaseBands = !phasesOn ? [] : PH.PHASE_KEYS.filter(function (k) { return phases[k]; }).map(function (k) {
    return { key: k, label: T(PH.LABEL_KEYS[k]), startMs: phases[k].dateStart, endMs: phases[k].dateEnd,
      roles: Array.isArray(phaseRoles[k]) ? phaseRoles[k].slice() : [] };
  });

  var chain = P.chainEdges(allBars.filter(function (b) { return !b.unfit; }), stg.stageOf);
  var chainTo = {};
  chain.forEach(function (e) { (chainTo[e.to] = chainTo[e.to] || []).push(e.from); });
  var cf = P.conflicts(allBars.filter(function (b) { return b.own && !libId[b.key]; }), preds, chain,
    { enabled: phasesOn, phases: phases, phaseRoles: phaseRoles, phaseKeys: PH.PHASE_KEYS });

  var rows = [], seenTypes = {}, hasExt = false, unfitList = [];
  /* Стрелки полосы: явные предшественники (все их полосы в любой роли, §О15) и цепочка; полосы без дат после
     прогноза стрелок не имеют ни к себе, ни от себя (Д7). */
  function depsOf(b) {
    var dl = [], types = {}, ext = [];
    if (b.unfit) return { dl: dl, types: types, ext: ext };
    (preds[b.issueId] || []).forEach(function (p) {
      if (!p || p.id === b.issueId) return;
      if (barsByIssue[p.id]) {
        barsByIssue[p.id].forEach(function (pb) {
          var id = lid(pb.key);
          if (pb.unfit || dl.indexOf(id) >= 0) return;
          dl.push(id); types[id] = p.type; seenTypes[p.type] = true;
        });
        return;
      }
      var sx = (linkData && linkData.ext && linkData.ext[p.id]) || { state: '', resolved: false };
      ext.push({ id: p.id, state: sx.state, resolved: !!sx.resolved, type: p.type });
    });
    (chainTo[b.key] || []).forEach(function (from) {
      var id = lid(from);
      if (dl.indexOf(id) < 0) { dl.push(id); types[id] = P.CHAIN_TYPE; }
    });
    if (ext.length) hasExt = true;
    return { dl: dl, types: types, ext: ext };
  }
  function barRow(t, b, id, parent) {
    var item = b.item, e = b.e, d = depsOf(b), nosnap = !t.rec, unfitText = '', unfitTip = '';
    if (b.unfit) {
      var w = b.unfit.waitsFor ? P.parseId(b.unfit.waitsFor) : null;
      unfitText = w ? T('ganttWaitsFor').replace('{issue}', w.issueId).replace('{role}', labelOf[w.rk] || w.rk) : T('forecastUnfitBadge');
      unfitTip = w ? T('ganttUnfitReasonWait') : T('ganttUnfitReasonCap').replace('{who}', e.assigneeName || e.assignee || '');
      unfitList.push({ issueId: b.issueId, url: item.url || '', role: labelOf[t.rk] || t.rk, mark: unfitText, reason: unfitTip });
    }
    return {
      id: id, kind: 'bar', rk: t.rk, issueId: b.issueId, parent: parent,
      title: item.title || b.issueId, url: item.url || '', roleLabel: labelOf[t.rk] || t.rk,
      assignee: e.assignee || '', assigneeText: e.assigneeName || e.assignee || T('ganttBarTooltipUnassigned'),
      options: t.options, canAssign: c.canAssign && !nosnap, readonly: !c.editable || nosnap,
      bg: (item.stateColor && item.stateColor.background) || deps.ASSIGNEE_FALLBACK_COLOR,
      startTs: b.startMs, endTs: b.endMs, badge: _badge(item, c.live, deps),
      dependencies: d.dl, depTypes: d.types, extDeps: d.ext, unfit: !!b.unfit, unfitText: unfitText, unfitTip: unfitTip,
      conflicts: (cf.byBar[b.key] || []).map(function (x) { return _conflictText(x, b, deps, labelOf, PH); }),
    };
  }

  tracks.forEach(function (t) {
    var rk = t.rk, trackId = 'track:' + rk;
    var sp = P.span(t.bars) || whole;
    var nConf = t.bars.filter(function (b) { return cf.byBar[b.key]; }).length;
    var rba = (t.pp && t.pp.resourcesByAssignee) || {};
    t.options = Object.keys(rba).map(function (login) {
      return { value: login, label: (rba[login] && rba[login].assigneeName) || login };
    });
    rows.push({
      id: trackId, kind: 'track', rk: rk, parent: null, dependencies: [], depTypes: {},
      label: labelOf[rk] || rk, nosnap: !t.rec, count: t.bars.length, startTs: sp.startMs, endTs: sp.endMs,
      tasksText: T('ganttTrackTasks').replace('{n}', String(t.bars.length)),
      conflictsText: nConf ? T('ganttTrackConflicts').replace('{n}', String(nConf)) : '',
      chips: phaseBands.filter(function (pb) { return pb.roles.indexOf(rk) >= 0; }).map(function (pb) { return pb.label; }),
    });
    var byIssue = {};
    t.bars.forEach(function (b) { byIssue[b.issueId] = b; });
    t.layout.forEach(function (g) {
      if (!g.children) { rows.push(barRow(t, byIssue[g.id], byIssue[g.id].key, trackId)); return; }
      var gid = 'epic:' + rk + ':' + g.id, kids = g.children.map(function (id) { return byIssue[id]; });
      var it = itemOf[g.id] || {}, ksp = P.span(kids);
      var head = g.own ? barRow(t, byIssue[g.id], gid, trackId) : {
        id: gid, rk: rk, issueId: g.id, parent: trackId, title: it.title || g.id, url: it.url || '',
        dependencies: [], depTypes: {}, extDeps: [], options: [],
        parentRoleText: T('ganttEpicParentRole').replace('{role}', labelOf[roleOfIssue[g.id]] || roleOfIssue[g.id] || ''),
        parentRoleTip: T('ganttEpicParentRoleTip'),
      };
      rows.push(Object.assign(head, { kind: 'epic', own: !!g.own, conflicts: [], startTs: ksp.startMs, endTs: ksp.endMs,
        chipText: T('ganttEpicChip').replace('{n}', String(kids.length)) }));
      kids.forEach(function (k) { rows.push(Object.assign(barRow(t, k, k.key, gid), { indent: true })); });
    });
  });

  /* Сворачивание — фильтр строк со стрелками на группу (§A3.3); виновники конфликтов — в id видимых строк. */
  var collapsedMap = _collapsed[c.sid] || {};
  var col = P.collapseRows(rows, collapsedMap);
  var rep = function (id) { return col.repOf[id] || id; };
  var edges = {};
  Object.keys(cf.edges).forEach(function (k) {
    var ft = k.split('→'), f = rep(lid(ft[0])), to = rep(lid(ft[1]));
    if (f !== to) edges[f + '→' + to] = true;
  });
  col.rows.forEach(function (r) { if (r.kind === 'track' || r.kind === 'epic') r.collapsed = !!collapsedMap[r.id]; });

  var fetchPlan = null;
  if (c.live && settings.fieldState) {
    var hIds = [], hStates = {}, hField = '';
    allBars.forEach(function (b) {
      if (hStates[b.issueId] === undefined) { hIds.push(b.issueId); hStates[b.issueId] = b.item.stateLocalized || b.item.state || ''; }
      if (!hField && b.item.stateFieldId) hField = b.item.stateFieldId;
    });
    fetchPlan = { ids: hIds, key: c.sid + ':all', states: hStates, fieldId: hField };
  }

  return {
    vm: {
      mode: 'all', rows: col.rows, taskColHeader: T('ganttColTask'), editable: c.editable,
      lang: (typeof deps.getLang === 'function' && deps.getLang()) || 'en',
      zoomLabels: { day: T('ganttZoomDay'), week: T('ganttZoomWeek'), month: T('ganttZoomMonth') },
      fmtDate: deps.fmtGanttDay,
      headerHeight: phaseBands.length ? 76 : 50, phaseBands: phaseBands,
      linkColors: linkColors, linksReady: !!linkData, linksPartial: !!(linkData && linkData.partial),
      linkLegend: { types: Object.keys(seenTypes).map(function (n) { return { name: n, color: linkColors[n] || '' }; }),
        external: hasExt, chain: chain.length > 0, conflict: cf.total > 0 },
      conflictEdges: edges,
      conflictsCounter: cf.total ? T('ganttConflictsCounter').replace('{n}', String(cf.total)) : '',
      conflictsTip: T('ganttConflictsTip').replace('{a}', String(cf.before)).replace('{b}', String(cf.phase)),
      historyBadge: c.live ? '' : T('ganttHistoryBadge').replace('{sprint}', sprintName || c.sid),
      i18nExt: {
        badge: T('ganttExtDeps'), unknown: T('ganttExtStateUnknown'), legend: T('ganttLegendTitle'),
        legendExt: T('ganttLegendExternal'), linksPartial: T('ganttLinksPartial'),
        legendChain: T('ganttLegendChain'), legendConflict: T('ganttLegendConflict'),
        collapse: T('ganttTrackCollapse'), expand: T('ganttTrackExpand'), noSnapshot: T('ganttNoSnapshot'),
        assigneeTip: T('ganttAssigneeTip'), notAssigned: T('phNotAssigned'),
      },
    },
    fetchPlan: fetchPlan,
    linksPlan: { ids: Object.keys(activeIds), key: linksKey },
    unfitList: unfitList,
  };
}

function _setHistoryBadge(text) {
  var el = document.getElementById('ganttHistoryBadge');
  if (!el) return;
  el.textContent = text || '';
  el.classList.toggle('hidden', !text);
}

/* Канон PP роли под правку + prev-снимок ДО мутации (правило #100). null — у роли нет записи истории
   в спринте (§О16). Текущая роль правится в живом PP (его перенесёт в запись savePlanningForRoles). */
function _targetPP(deps, rk) {
  var st = deps.state, rec = _histRec(deps, st.getCurrentSprintId(), rk);
  if (!rec) return null;
  var prevPP = (rec.personalPlanning === undefined) ? undefined : deps.deepClone(rec.personalPlanning);
  var cur = st.getCurrentSprintRoleRec();
  if (cur && cur.sprintId === rec.sprintId && st.getCurrentRolePP()) return { current: true, pp: st.getCurrentRolePP(), prevPP: prevPP };
  var pp = deps.getPlanningForRole(rk);
  if (!pp) { pp = deps.emptyPP(); rec.personalPlanning = pp; }
  return { current: false, pp: pp, prevPP: prevPP };
}

function _refusedByRevConflict(deps) {
  if (!_revConflictBlocked()) return false;
  try { deps.toast(deps.T('toastEditsBlockedRevConflict'), 'warn'); } catch (_) {}
  deps.renderGanttChart();
  return true;
}

/* Drag полосы (§A3.2): не-редактор и некорректные даты — тихий no-op с перерисовкой (откат визуального сдвига). */
function onDateChange(deps, id, startMs, endMs) {
  var P = _pure(), pid = P ? P.parseId(id) : null;
  if (!pid || pid.kind !== 'bar' || !_ctx(deps).editable || !_isNum(startMs) || !_isNum(endMs) || endMs < startMs) {
    deps.renderGanttChart(); return;
  }
  if (_refusedByRevConflict(deps)) return;
  var t = _targetPP(deps, pid.rk);
  if (!t) { deps.renderGanttChart(); return; }
  var ta = t.pp.taskAssignments || (t.pp.taskAssignments = {});
  var e = ta[pid.issueId] || (ta[pid.issueId] = {});
  e.dateStart = startMs;
  e.dateEnd = endMs;
  deps.savePlanningForRoles([{ rk: pid.rk, prevPP: t.prevPP }]);
  if (t.current) { try { deps.renderCurrentRoleTaskTable(); } catch (_) {} }
  deps.renderGanttChart();
}

/* Select исполнителя в строке (Д4): люди роли, запись как в таблице роли + поле задачи YouTrack. */
function onAssigneeChange(deps, rk, issueId, login) {
  if (!rk || !issueId) return;
  if (!_ctx(deps).canAssign) { deps.renderGanttChart(); return; }
  if (_refusedByRevConflict(deps)) return;
  var t = _targetPP(deps, rk);
  if (!t) { deps.renderGanttChart(); return; }
  var rba = t.pp.resourcesByAssignee || {};
  var ta = t.pp.taskAssignments || (t.pp.taskAssignments = {});
  var e = ta[issueId] || (ta[issueId] = {});
  e.assignee = login || '';
  e.assigneeName = login ? ((rba[login] && rba[login].assigneeName) || login) : '';
  delete e.ganttColor;
  deps.savePlanningForRoles([{ rk: rk, prevPP: t.prevPP }]);
  deps.updateIssueAssigneeField(issueId, login, rk);
  if (t.current) {
    try { deps.renderCurrentRoleTaskTable(); } catch (_) {}
    try { deps.updateCurrentRoleTotals(); } catch (_) {}
  }
  deps.renderGanttChart();
}

function toggleCollapsed(deps, groupId) {
  var sid = deps.state.getCurrentSprintId();
  if (!sid || !groupId) return;
  var m = _collapsed[sid] || (_collapsed[sid] = {});
  if (m[groupId]) delete m[groupId]; else m[groupId] = 1;
  deps.renderGanttChart();
}

/* Д1 — пара кнопок «Роль | Все роли» в карточке роли: активная кнопка, селектор роли гаснет в «Все роли».
   Обработчик вешается один раз (dataset.bound, паттерн bindGanttHandlers ядра). */
function syncModeUi(deps) {
  var mode = deps.getGanttMode();
  var box = document.getElementById('ganttModeBtns');
  if (box) {
    if (!box.dataset.bound) {
      box.dataset.bound = '1';
      box.addEventListener('click', function (ev) {
        var btn = (ev.target && ev.target.closest) ? ev.target.closest('button[data-ssp-gantt-mode]') : null;
        if (btn) deps.setGanttMode(btn.getAttribute('data-ssp-gantt-mode'));
      });
    }
    Array.prototype.forEach.call(box.querySelectorAll('button[data-ssp-gantt-mode]'), function (b) {
      b.classList.toggle('ring-button-active', b.getAttribute('data-ssp-gantt-mode') === mode);
    });
  }
  var sel = document.getElementById('ganttRoleSel');
  if (sel) sel.disabled = (mode === 'all');
  var F = _forecast(deps);
  if (F) F.syncButton(deps, mode);
  if (mode !== 'all') {
    _setHistoryBadge('');
    if (F) F.renderUnfitBlock(deps, []);
  }
}

/* Select исполнителя внутри React-списка — через делегат на контейнере: перерисовка не теряет биндинг,
   deps берутся свежие (кладутся на хост каждым рендером). */
function _bindContainer(container, deps) {
  container.__sspGanttAllDeps = deps;
  if (container.__sspGanttAllBound) return;
  container.__sspGanttAllBound = true;
  container.addEventListener('change', function (ev) {
    var t = ev.target;
    if (!t || !t.matches || !t.matches('select.ssp-gantt-all__assignee[data-issue][data-rk]')) return;
    onAssigneeChange(container.__sspGanttAllDeps, t.getAttribute('data-rk'), t.getAttribute('data-issue'), t.value);
  });
}

function renderGanttAll(deps) {
  var container = document.getElementById('ganttContainer');
  if (!container) return;
  var emptyEl = document.getElementById('ganttEmpty');
  var mount = (typeof window !== 'undefined' && window.__SSP_GANTT_ALL_MOUNT) || null;
  var roleMount = (typeof window !== 'undefined' && window.__SSP_GANTT_MOUNT) || null;
  if (roleMount && typeof roleMount.unmountAt === 'function') roleMount.unmountAt(container);
  var built;
  try {
    built = _buildGanttAllVm(deps);
  } catch (e) {
    /* fail-loud: OOPIF прячет исключения от top-консоли — текст в пейн (как у Ганта роли). */
    container.textContent = deps.T('ganttVmError') + ': ' + String((e && e.message) || e);
    return;
  }
  _setHistoryBadge(built ? built.vm.historyBadge : '');
  if (_forecast(deps)) _forecast(deps).renderUnfitBlock(deps, built ? built.unfitList : []);
  if (!built) {
    if (mount && typeof mount.unmountAt === 'function') mount.unmountAt(container);
    if (emptyEl) { emptyEl.style.display = ''; emptyEl.classList.remove('hidden'); }
    container.innerHTML = '';
    container.appendChild(emptyEl || document.createTextNode(deps.T('emptyGantt')));
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';
  var vm = built.vm;
  vm.onDateChange = function (id, s, e) { onDateChange(deps, id, s, e); };
  vm.onToggle = function (groupId) { toggleCollapsed(deps, groupId); };
  vm.zoom = (typeof deps.getGanttZoom === 'function') ? deps.getGanttZoom() : 'Day';
  vm.onZoom = deps.setGanttZoom;
  vm.onAfterRender = function () {
    /* Связи и история переходов — после коммита DOM, как у Ганта роли (guard ключа внутри фетча). */
    if (built.linksPlan.ids.length && typeof deps.loadGanttLinks === 'function') {
      deps.loadGanttLinks(deps, built.linksPlan.ids, built.linksPlan.key, { hierarchy: true });
    }
    if (built.fetchPlan) deps.fetchGanttStateHistory(built.fetchPlan.ids, built.fetchPlan.key, false, built.fetchPlan.states, built.fetchPlan.fieldId);
  };
  _bindContainer(container, deps);
  if (mount && typeof mount.mountAt === 'function') mount.mountAt(container, vm);
}

const api = {
  renderGanttAll: renderGanttAll,
  syncModeUi: syncModeUi,
  toggleCollapsed: toggleCollapsed,
  onDateChange: onDateChange,
  onAssigneeChange: onAssigneeChange,
  _buildGanttAllVm: _buildGanttAllVm,
  /* 3.48.0 — для прогноза по всем ролям (gantt-all-forecast.js): гейты, канон роли, ключ связей */
  _ctx: _ctx, _histRec: _histRec, _targetPP: _targetPP, _refusedByRevConflict: _refusedByRevConflict, linksKey: _linksKey,
};

if (typeof window !== 'undefined') {
  try { window.__SSP_GANTT_ALL_VIEW = api; } catch (_) { /* sandboxed write may throw */ }
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
