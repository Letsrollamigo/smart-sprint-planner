/* widgets/main/src/pure/forecast-pure.js
   Side-effect модуль: чистое ядро авто-прогноза дат старта/окончания задач (#40).
   Публикует window.__SSP_FORECAST_PURE ДО исполнения IIFE core.js
   (паттерн как capacity-pure; импортируется в index.js раньше монолита).

   Модель (спека Spec/AUTO_FORECAST_40_SPEC.md §5):
   • Ёмкость исполнителя на спринт (часы, из адаптера getApprovedCapacityForPerson —
     КПЕ/ставка/участие/alloc уже внутри) распределяется по дням окна ПРОПОРЦИОНАЛЬНО
     доступности дня eff = max(0, workH − absH), с дневным капом usefulHoursPerDay
     (⚖ владелец 2026-07-11). Срезанное капом НЕ перераспределяется — смысл капа
     «растянуть» прогноз, а не ужать его в те же даты.
   • Личная очередь ВИРТУАЛЬНАЯ: порядок = прогнозные даты (dateStart asc), tie-break
     rank (приоритет) → issueId; задачи без дат — в хвост по rank → issueId.
     Ничего не персистится (§6 спеки) — материализация только в датах PP.
   • Упаковка последовательная: задача стартует в первый день с остатком квоты,
     потребляет остатки день за днём; не влезла до конца окна → она и все
     последующие → unfit (даты не пишутся).

   Канон — ЧАСЫ float полной точности, дни = ISO 'YYYY-MM-DD' (UTC, как capacity-pure);
   конверсию ISO↔epoch-ms делает обвязка (isoToUTCms). needMin — минуты (канон PP).
   Stateless; без domain/data-зависимостей. */

const EPS = 1e-6;

function numOr(v, d) {
  return (typeof v === 'number' && isFinite(v)) ? v : d;
}

/* Виртуальная очередь исполнителя: [{issueId, startMs|null, endMs|null, rank}] → тот же
   массив, отсортированный. Датированные — по startMs asc; при равном startMs — по endMs asc
   (несколько задач стартуют в один день: раньше упакованная раньше и финиширует — иначе
   своп стрелкой внутри дня «съедался» бы визуально); без дат — в хвост; tie-break
   rank asc → issueId (строковое сравнение — стабильный детерминизм). Задачи с равными
   (startMs, endMs) — уместились в остатке одного дня; их взаимный порядок не влияет на
   даты (честный потолок виртуальной очереди). */
function orderQueue(entries) {
  if (!Array.isArray(entries)) return [];
  var arr = entries.slice();
  arr.sort(function (a, b) {
    var as = (typeof a.startMs === 'number' && isFinite(a.startMs)) ? a.startMs : Infinity;
    var bs = (typeof b.startMs === 'number' && isFinite(b.startMs)) ? b.startMs : Infinity;
    if (as !== bs) return as < bs ? -1 : 1;
    var ae = (typeof a.endMs === 'number' && isFinite(a.endMs)) ? a.endMs : Infinity;
    var be = (typeof b.endMs === 'number' && isFinite(b.endMs)) ? b.endMs : Infinity;
    if (ae !== be) return ae < be ? -1 : 1;
    var ar = numOr(a.rank, Infinity), br = numOr(b.rank, Infinity);
    if (ar !== br) return ar < br ? -1 : 1;
    var ai = String(a.issueId || ''), bi = String(b.issueId || '');
    return ai < bi ? -1 : (ai > bi ? 1 : 0);
  });
  return arr;
}

/* Дневные квоты исполнителя (часы на задачи роли по дням окна).
   days — [{iso, workH, absH}] (обвязка строит через CAPACITY_PURE.workingHoursOfDay /
   absenceHoursOfDay); capacityHours — ёмкость на спринт; usefulHoursPerDay — кап
   (действует, только если задан и > 0). → массив чисел длины days.length. */
function dailyQuotas(capacityHours, days, usefulHoursPerDay) {
  var list = Array.isArray(days) ? days : [];
  var cap = numOr(capacityHours, 0);
  var useful = numOr(usefulHoursPerDay, 0);
  var eff = [], sumEff = 0;
  for (var i = 0; i < list.length; i++) {
    var e = Math.max(0, numOr(list[i] && list[i].workH, 0) - numOr(list[i] && list[i].absH, 0));
    eff.push(e);
    sumEff += e;
  }
  var out = [];
  for (var j = 0; j < eff.length; j++) {
    var q = (cap > EPS && sumEff > EPS) ? cap * eff[j] / sumEff : 0;
    if (useful > EPS && q > useful) q = useful;
    out.push(q);
  }
  return out;
}

/* Последовательная упаковка очереди в дневные квоты.
   queue — [{issueId, needMin}] в порядке очереди (orderQueue); needMin — минуты.
   → { dates: {issueId: {startIso, endIso}}, unfit: [issueId] }.
   Задачи с needMin ≤ 0 пропускаются (ни dates, ни unfit — обвязка их не трогает). */
function forecastAssignee(input) {
  var queue = (input && Array.isArray(input.queue)) ? input.queue : [];
  var days = (input && Array.isArray(input.days)) ? input.days : [];
  var quotas = dailyQuotas(input && input.capacityHours, days, input && input.usefulHoursPerDay);
  var dates = {}, unfit = [];
  var remaining = quotas.slice();
  var cursor = 0;
  var exhausted = false;
  for (var t = 0; t < queue.length; t++) {
    var task = queue[t] || {};
    var needH = numOr(task.needMin, 0) / 60;
    if (needH <= EPS) continue;
    if (exhausted) { unfit.push(task.issueId); continue; }
    var startIdx = -1, endIdx = -1;
    var d = cursor;
    while (d < remaining.length && needH > EPS) {
      if (remaining[d] > EPS) {
        if (startIdx < 0) startIdx = d;
        var take = Math.min(remaining[d], needH);
        remaining[d] -= take;
        needH -= take;
        endIdx = d;
      }
      if (needH > EPS) d++;
    }
    if (needH > EPS) {
      // ёмкость окна исчерпана до завершения задачи → она и все последующие unfit
      // (последовательная семантика очереди; частично потреблённое не откатываем —
      // за unfit-задачей очередь всё равно закончилась)
      unfit.push(task.issueId);
      exhausted = true;
      continue;
    }
    cursor = endIdx; // следующая задача может стартовать в остатке того же дня
    dates[task.issueId] = { startIso: days[startIdx].iso, endIso: days[endIdx].iso };
  }
  return { dates: dates, unfit: unfit };
}

const _api = {
  orderQueue: orderQueue,
  dailyQuotas: dailyQuotas,
  forecastAssignee: forecastAssignee,
  EPS: EPS
};

if (typeof window !== 'undefined') {
  try { window.__SSP_FORECAST_PURE = _api; } catch (_) { /* sandboxed write may throw */ }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = _api;
}
