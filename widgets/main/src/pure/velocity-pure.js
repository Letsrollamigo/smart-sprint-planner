/* widgets/main/src/pure/velocity-pure.js
   #11 Velocity (v3.12.0) — скорость команды по ролям из FINISHED-снимков ssp_history.
   ЕДИНЫЙ источник velocity-модели: сейчас — отчёт A11 (контур A), позже — коэффициент
   авто-прогноза дат #40 v2 (требование бэклога: не строить два независимых источника
   прогноза). Канон данных = A10 Spillover (reporting-pure.computeSpillover):
   «закоммичено» = inclusionStatus ∈ activeInc, «закрыта» = state ∈ doneStates по
   снимку финального состава спринта, минуты = estimate_<rk>.
   Публикует window.__SSP_VELOCITY_PURE (+ module.exports для node:test). */

/* computeRoleVelocity(snapshots, opts) →
     { roleRows:[{roleKey, label,
         sprints:[{sprintId,name,dateStart,plannedMinutes,closedMinutes,pct}],  // старые → новые
         avgClosedMinutes, avgPct, sparse}] }
   opts: { roles:[{key,label}], doneStates:string[], window:int 1..10 (дефолт 3),
           activeInc:string[] (дефолт INC_PLANNED+INC_UNPLANNED) }.
   Спринты роли с plannedMinutes=0 (роль не планировалась) — шум, выпадают ДО оконного
   среза; sparse=true когда точек меньше окна («мало данных»); роль без единой точки
   в roleRows не попадает. */
function computeRoleVelocity(snapshots, opts) {
  opts = opts || {};
  var roles = Array.isArray(opts.roles) ? opts.roles : [];
  var win = (typeof opts.window === 'number' && isFinite(opts.window)) ? Math.round(opts.window) : 3;
  if (win < 1) win = 1;
  if (win > 10) win = 10;
  var doneSet = {};
  (Array.isArray(opts.doneStates) ? opts.doneStates : []).forEach(function (s) { doneSet[s] = true; });
  var inc = Array.isArray(opts.activeInc) ? opts.activeInc : ['INC_PLANNED', 'INC_UNPLANNED'];
  var incSet = {};
  inc.forEach(function (s) { incSet[s] = true; });

  var byRole = {};
  (Array.isArray(snapshots) ? snapshots : []).forEach(function (s) {
    if (!s || !s.sprintId || s.status !== 'FINISHED' || !s.roleKey) return;
    (byRole[s.roleKey] = byRole[s.roleKey] || []).push(s);
  });

  var roleRows = [];
  roles.forEach(function (r) {
    if (!r || !r.key) return;
    var chain = (byRole[r.key] || []).slice().sort(function (a, b) { return (a.dateStart || 0) - (b.dateStart || 0); });
    var pts = [];
    chain.forEach(function (rec) {
      var planned = 0, closed = 0;
      (Array.isArray(rec.items) ? rec.items : []).forEach(function (it) {
        if (!it || !incSet[it.inclusionStatus]) return;
        var v = it['estimate_' + r.key];
        var m = (typeof v === 'number' && isFinite(v)) ? v : 0;
        planned += m;
        if (doneSet[it.state]) closed += m;
      });
      if (planned <= 0) return;
      pts.push({ sprintId: rec.sprintId, name: rec.name || rec.sprintId,
        dateStart: (typeof rec.dateStart === 'number' ? rec.dateStart : 0),
        plannedMinutes: planned, closedMinutes: closed, pct: closed / planned });
    });
    var winPts = pts.slice(-win);
    if (!winPts.length) return;
    var sumClosed = 0, sumPct = 0;
    winPts.forEach(function (p) { sumClosed += p.closedMinutes; sumPct += p.pct; });
    roleRows.push({ roleKey: r.key, label: r.label || r.key, sprints: winPts,
      avgClosedMinutes: sumClosed / winPts.length, avgPct: sumPct / winPts.length,
      sparse: winPts.length < win });
  });
  return { roleRows: roleRows };
}

const _api = { computeRoleVelocity: computeRoleVelocity };

if (typeof window !== 'undefined') {
  try { window.__SSP_VELOCITY_PURE = _api; } catch (_) { /* sandboxed write may throw */ }
}
if (typeof module !== 'undefined' && module.exports) { module.exports = _api; }
