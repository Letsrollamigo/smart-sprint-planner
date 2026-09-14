/* Прогноз дат по всем ролям (#122, ступень v3.48.0, спека §A5) — обвязка режима «Все роли» вкладки «Гант».
   Мост window.__SSP_GANTT_ALL_FORECAST; deps — фабрика _ganttAllDeps() ядра, приходят аргументом. Ядро расчёта —
   GANTT_ALL_PURE.forecastAll (граф зависимостей и цепочки, циклы, укладка), очереди и дневные квоты —
   FORECAST_PURE, дни окна — CAPACITY_PURE; гейты, prev-снимки и ключ связей — у вида «Все роли» (deps.ganttAllView).

   • doForecastAll — кнопка «Спрогнозировать даты»: гейты как у прогноза роли + окно подтверждения, если у
     назначенных полос уже есть даты.
   • runForecastAll — входы по всем ролям спринта, prev-снимки ролей ДО мутации, запись только дат одним
     savePlanningForRoles (⚖5), пометки «ждёт / не помещается» до следующего прогноза (_forecastUnfitAll), тосты.
   • renderUnfitBlock — сводный блок «Без дат после прогноза (N)» под полотном (.spoiler, vanilla вне React).
   • syncButton — видимость (режим «Все роли» + тумблер авто-прогноза) и бинд #ganttForecastAllBtn. */
'use strict';

/* Полосы без дат после последнего прогноза { <sprintId>: { <rk:issueId>: { reason, waitsFor } } } — на сессию,
   без персиста (⚖5 «сохраняются только даты»); отдельно от _forecastUnfit прогноза роли (§Л, v3.2.1). */
var _forecastUnfitAll = {};

function _w(name) { return (typeof window !== 'undefined' && window[name]) || null; }
function _isNum(v) { return typeof v === 'number' && isFinite(v); }

function unfitFor(sid) { return (sid && _forecastUnfitAll[sid]) || {}; }

/* Полосы всех ролей спринта в порядке дорожек. Роль без записи истории (§О16) не пишется — её полосы без
   исполнителя, то есть фиксированные. needMin — канон VM роли: alloc_<rk> ?? max(0, estimate − fact). */
function _collect(deps, sid, settings) {
  var st = deps.state, V = deps.ganttAllView, P = _w('__SSP_GANTT_ALL_PURE'), PH = _w('__SSP_PHASES_PURE');
  var stg = P.stages((deps.getSprintRoles() || []).map(function (r) { return r.key; }), settings, PH.PHASE_KEYS);
  var cur = st.getCurrentSprintRoleRec(), bars = [], ord = {};
  stg.order.forEach(function (rk, i) {
    ord[rk] = i;
    var rec = V._histRec(deps, sid, rk);
    var pp = !rec ? null : ((cur && cur.sprintId === rec.sprintId) ? st.getCurrentRolePP() : deps.getPlanningForRole(rk));
    var ta = (pp && pp.taskAssignments) || {}, rank = {};
    var active = (deps.getRoleItemsArr(rk) || []).filter(function (it) { return deps.ACTIVE_INC.indexOf(it.inclusionStatus) >= 0; });
    deps.multiKeySort(active, 'priority', ta).forEach(function (it, idx) { rank[it.issueId] = idx; });
    active.forEach(function (it) {
      var e = ta[it.issueId] || {}, alloc = it['alloc_' + rk];
      bars.push({ key: P.barKey(rk, it.issueId), issueId: it.issueId, rk: rk, rec: rec, pp: pp, rank: rank[it.issueId],
        login: (rec && e.assignee) || null,
        needMin: (alloc !== null && alloc !== undefined) ? alloc : Math.max(0, (it['estimate_' + rk] || 0) - (it['fact_' + rk] || 0)),
        startMs: _isNum(e.dateStart) ? e.dateStart : null, endMs: _isNum(e.dateEnd) ? e.dateEnd : null });
    });
  });
  return { bars: bars, stageOf: stg.stageOf, ord: ord };
}

function runForecastAll(deps) {
  var T = deps.T, st = deps.state;
  var V = deps.ganttAllView, P = _w('__SSP_GANTT_ALL_PURE'), FP = _w('__SSP_FORECAST_PURE'), CP = _w('__SSP_CAPACITY_PURE');
  if (!V || !P || !FP || !CP || !V._ctx(deps).editable || V._refusedByRevConflict(deps)) return Promise.resolve(false);
  var sid = st.getCurrentSprintId(), settings = st.getSettings() || {}, sprint = st.getSprint() || {};
  /* Связи ещё не пришли — без явных зависимостей не считаем: прогноз разошёлся бы со стрелками. */
  var links = deps.linksDataFor(V.linksKey(sid, settings));
  if (!links) { deps.toast(T('toastForecastErr'), 'warn'); return Promise.resolve(false); }
  var data = _collect(deps, sid, settings);
  var queued = data.bars.filter(function (b) { return b.login && b.needMin > 0; });
  if (!queued.length) { deps.toast(T('toastForecastEmpty'), 'warn'); return Promise.resolve(false); }
  function win(b) { return [b.rec.dateStart || sprint.dateStart, b.rec.dateEnd || sprint.dateEnd]; }
  if (queued.some(function (b) { return !_isNum(win(b)[0]) || !_isNum(win(b)[1]); })) {
    deps.toast(T('toastForecastNoDates'), 'warn');
    return Promise.resolve(false);
  }
  var isFull = settings.capacityMode === 'full';
  var hpd = _isNum(settings.hoursPerDay) ? settings.hoursPerDay : 8;
  var useful = _isNum(settings.usefulHoursPerDay) ? settings.usefulHoursPerDay : 0;
  return Promise.all([
    deps.apiGet('calendar').catch(function () { return null; }),
    isFull ? deps.apiGet('absences').catch(function () { return null; }) : Promise.resolve(null),
  ]).then(function (rs) {
    var calendar = (rs[0] && rs[0].calendar) || null, absences = (isFull && rs[1] && rs[1].absences) || {};
    var groups = {}, people = {}, queues = {}, needH = {};
    queued.forEach(function (b) {
      (groups[b.login + '|' + b.rk] = groups[b.login + '|' + b.rk] || []).push(b);
      needH[b.key] = b.needMin / 60;
    });
    /* Очереди — пара (человек, роль), обход по логину, затем по порядку дорожек: детерминизм прогноза. */
    Object.keys(groups).sort(function (a, b) {
      var x = groups[a][0], y = groups[b][0];
      return x.login < y.login ? -1 : (x.login > y.login ? 1 : data.ord[x.rk] - data.ord[y.rk]);
    }).forEach(function (pk) {
      var b0 = groups[pk][0], bounds = CP.absenceBounds(absences[b0.login] || []);
      var days = CP.dayKeysUTC(win(b0)[0], win(b0)[1]).map(function (iso) {
        return { iso: iso, workH: CP.workingHoursOfDay(iso, calendar, hpd), absH: bounds.length ? CP.absenceHoursOfDay(iso, bounds, calendar, hpd) : 0 };
      });
      /* третий аргумент — PP роли: фолбэк Light иначе читал бы текущую роль и чужие люди получали бы 0 часов */
      people[pk] = { days: days.map(function (d) { return d.iso; }),
        quotas: FP.dailyQuotas(deps.getApprovedCapacityForPerson(b0.login, b0.rk, b0.pp) || 0, days, useful) };
      queues[pk] = FP.orderQueue(groups[pk]).map(function (b) { return b.key; });
    });
    var res = P.forecastAll({ bars: data.bars, preds: links.preds || {}, chain: P.chainEdges(data.bars, data.stageOf),
      queues: queues, people: people, needH: needH });

    var targets = {};
    queued.forEach(function (b) { if (!targets[b.rk]) targets[b.rk] = V._targetPP(deps, b.rk); });   /* prev-снимки ДО мутации */
    var unfit = {}, n = 0;
    queued.forEach(function (b) {
      var t = targets[b.rk];
      if (!t) return;
      var ta = t.pp.taskAssignments || (t.pp.taskAssignments = {});
      var e = ta[b.issueId] || (ta[b.issueId] = {}), dd = res.dates[b.key];
      e.dateStart = dd ? CP.isoToUTCms(dd.startIso) : null;
      e.dateEnd = dd ? CP.isoToUTCms(dd.endIso) : null;
      if (!dd) { unfit[b.key] = res.unfit[b.key] || { reason: 'cap', waitsFor: null }; n++; }
    });
    _forecastUnfitAll = {};
    _forecastUnfitAll[sid] = unfit;
    var host = document.getElementById('ganttUnfitBlock');
    if (host) host.__sspOpen = n > 0;   /* макет «⚖ Принято»: блок раскрыт сразу после прогноза */
    var rks = Object.keys(targets).filter(function (rk) { return targets[rk]; });
    deps.savePlanningForRoles(rks.map(function (rk) { return { rk: rk, prevPP: targets[rk].prevPP }; }));
    if (rks.some(function (rk) { return targets[rk].current; })) {
      try { deps.renderCurrentRoleTaskTable(); deps.updateCurrentRoleTotals(); } catch (_) {}
    }
    deps.renderGanttChart();
    deps.toast(n ? T('toastForecastAllUnfit').replace('{n}', String(n)) : T('toastForecastAllDone'), n ? 'warn' : 'success');
    if (res.cycles.length) deps.toast(T('ganttCycleWarn').replace('{issues}', [].concat.apply([], res.cycles).join(', ')), 'warn');
    return true;
  }).catch(function (e) {
    if (typeof deps.diag === 'function') deps.diag('runForecastAll ERR: ' + String(e), 'err');
    deps.toast(T('toastForecastErr'), 'err');
    return false;
  });
}

function doForecastAll(deps) {
  var T = deps.T, st = deps.state, V = deps.ganttAllView;
  var settings = st.getSettings() || {};
  if (!V || !settings.autoForecastEnabled) return;
  if (st.getIsEditor() === false) { deps.toast(T('toastNoEditRights'), 'warn'); return; }
  if (!V._ctx(deps).editable || V._refusedByRevConflict(deps)) return;
  var dated = _collect(deps, st.getCurrentSprintId(), settings).bars.some(function (b) {
    return b.login && (b.startMs !== null || b.endMs !== null);
  });
  if (!dated) { runForecastAll(deps); return; }
  deps.openModal({
    id: 'forecastAllConfirm',
    title: T('forecastConfirmTitle'),
    body: { kind: 'text', text: T('forecastAllConfirmText') },
    buttons: [
      { id: 'cancel', text: T('btnCancel'), variant: 'secondary', onClick: function (h) { h.close(); } },
      { id: 'confirm', text: T('btnForecastConfirm'), variant: 'primary', onClick: function (h) { h.close(); runForecastAll(deps); } },
    ],
    dismissOnBackdrop: false,
    blockEscape: false,
    showCloseButton: false,
  });
}

/* Сводный блок (Д7) под полотном: list — [{ issueId, url, role, mark, reason }] из vm; пусто — блока нет.
   Раскрытость держит хост (перерисовка полотна после прихода связей не сворачивает блок). */
function renderUnfitBlock(deps, list) {
  var host = document.getElementById('ganttUnfitBlock');
  if (!host) return;
  if (!list || !list.length) { host.innerHTML = ''; return; }
  var esc = deps.esc, T = deps.T;
  host.innerHTML = '<div class="spoiler ssp-gantt-unfit' + (host.__sspOpen ? ' open' : '') + '">' +
    '<div class="spoiler__head"><span class="spoiler__arrow">▶</span><span class="ssp-gantt-unfit__title">' +
    esc(T('ganttUnfitBlockTitle').replace('{n}', String(list.length))) + '</span></div>' +
    '<div class="spoiler__body">' + list.map(function (r) {
      return '<div class="ssp-gantt-unfit__row"><a class="link" href="' + deps.safeUrl(r.url) + '" target="_blank" rel="noopener noreferrer">' +
        esc(r.issueId) + '</a> · ' + esc(r.role) + ' · <span class="ssp-gantt-all__unfit">! ' + esc(r.mark) + '</span> — ' + esc(r.reason) + '</div>';
    }).join('') + '</div></div>';
  if (host.__sspBound) return;
  host.__sspBound = true;
  host.addEventListener('click', function (ev) {
    var head = (ev.target && ev.target.closest) ? ev.target.closest('.spoiler__head') : null;
    if (!head) return;
    host.__sspOpen = !host.__sspOpen;
    head.parentNode.classList.toggle('open', host.__sspOpen);
  });
}

function syncButton(deps, mode) {
  var btn = document.getElementById('ganttForecastAllBtn');
  if (!btn) return;
  btn.classList.toggle('hidden', !(mode === 'all' && (deps.state.getSettings() || {}).autoForecastEnabled));
  btn.__sspDeps = deps;
  if (btn.__sspBound) return;
  btn.__sspBound = true;
  btn.addEventListener('click', function () { doForecastAll(btn.__sspDeps); });
}

const api = {
  doForecastAll: doForecastAll,
  runForecastAll: runForecastAll,
  renderUnfitBlock: renderUnfitBlock,
  syncButton: syncButton,
  unfitFor: unfitFor,
};

if (typeof window !== 'undefined') {
  try { window.__SSP_GANTT_ALL_FORECAST = api; } catch (_) { /* sandboxed write may throw */ }
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
