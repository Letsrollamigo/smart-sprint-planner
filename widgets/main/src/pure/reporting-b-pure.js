/* reporting-b-pure.js — #50 S8c. Чистый движок B2 «Налог на баги» (контур B).
   Отдельный leaf-модуль: reporting-pure.js на потолке бюджета (640, уже «жирный» >600) —
   большой движок вынесен, а не бloat'ит фат-файл (владелец предвидел: «взвесить reporting-b-pure.js»).

   Метрика (⚖ лок владельца): доля инженерных ЧЧ, ушедших на баги, а не на фичи.
     на систему × роль:  tax = Σwi(баг) / [Σwi(фича) + Σwi(баг)]
   Пул-на-систему = Σбаг ÷ Σвсё (НЕ среднее долей): числитель/знаменатель агрегируются
   ПО ТОТАЛАМ, потом делятся. «Фича» = любая задача, слинкованная с багом (reportingLinkTypes) —
   фичи БЕЗ багов вне охвата (владелец: universe = bug-linked). Роль workitem'а = роль, чей
   исполнитель задачи == автор (первое совпадение, реюз правила A4 — без двойного счёта).

   Fallback (в баг ЧАСЫ НЕ списаны): часы в ФИЧЕ, пока связанный баг был ОТКРЫТ
   (created ≤ ts ≤ resolve; unresolved → конец окна), переклассифицируются как багфикс —
   переезжают из фича-корзины в баг-числитель (знаменатель НЕ меняется: это те же фича-часы).
   ⚠ эвристика. Делёж «по окну открытости» при N багах на фичу для АГРЕГАТА система×роль МОТ
   (все переклассифицированные часы в одну систему/роль независимо от того, какому багу их отдать)
   → окно нужно лишь как ВЕРХНЯЯ граница (resolve). Per-bug раскладка — если когда-то понадобится
   вывод по каждому багу. ponytail: union открытых окон вместо взвешенного дележа — потолок точный
   для система×роль, апгрейд до per-bug при выводе по багам.

   Баг на N фич (СПИСАННЫЕ часы) → делёж пропорц. собственным ЧЧ фич (равно, если у всех 0).
   Баги-вне-фич (orphan) → «корзина»: багфикс-часы без знаменателя (числитель-only, отдельно).

   БЕЗ I/O. Публикует __SSP_REPORTING_B_PURE ДО core.js; node-тестируемо (module.exports). */
'use strict';

function _validMin(m) { return (typeof m === 'number' && isFinite(m) && m > 0); }
function _sumVals(o) { var s = 0; for (var k in o) s += o[k]; return s; }
function _addRole(dst, rk, v) { dst[rk] = (dst[rk] || 0) + v; }

/* computeBugTax(input):
     issues:  [{ id, isBug:bool, system:str, created:num|null, resolveTs:num|null, featureIds:[id…] }]
              featureIds — ссылки бага на фичи (значимо только для isBug). resolveTs — момент входа
              бага в done-статус (null = не решён). system — значение поля «система» ФИЧИ.
     workItems:  [{ issueId, author, minutes, dateTs }] — уже оконные (caller режет по периоду).
     roleExecutors: { issueId → { roleKey → login } } — исполнители ролей задачи (A4-шейп).
     roles:  [{ key, label }] — активные роли (порядок = приоритет матча автор→роль).
     windowToTs: num — конец окна периода (верхняя граница открытого бага при unresolved).
   → { groups:[{ system, rows:[{ roleKey,label,bugMinutes,allMinutes,pct }] }],
       basket:{ rows:[{roleKey,label,minutes}], totalMinutes }|null,
       totalBugMinutes, totalAllMinutes, totalPct,
       bugCount, featureCount, fallbackBugCount, orphanBugCount } */
function computeBugTax(input) {
  input = input || {};
  var issues = Array.isArray(input.issues) ? input.issues : [];
  var workItems = Array.isArray(input.workItems) ? input.workItems : [];
  var roleExecutors = (input.roleExecutors && typeof input.roleExecutors === 'object') ? input.roleExecutors : {};
  var roles = Array.isArray(input.roles) ? input.roles : [];
  var roleKeys = roles.map(function (r) { return r.key; });
  var roleLabel = {}; roles.forEach(function (r) { roleLabel[r.key] = r.label || r.key; });
  var windowToTs = (typeof input.windowToTs === 'number' && isFinite(input.windowToTs)) ? input.windowToTs : Infinity;

  var byId = Object.create(null);
  issues.forEach(function (it) { if (it && it.id) byId[it.id] = it; });

  /* 1. Атрибуция workitems: роль = первый исполнитель роли задачи == автор (реюз правила A4).
     Неатрибутированный труд (автор не в ролях задачи) в метрику не входит. Копим per-issue:
     byRole (Σ по роли) + items (для fallback по дате). */
  var work = Object.create(null);   /* issueId → { byRole:{rk→min}, items:[{rk,min,ts}] } */
  var rawMin = Object.create(null); /* issueId → Σ ЛЮБОГО валидного труда (до атрибуции) — гейт fallback */
  function roleOf(issueId, author) {
    var ex = roleExecutors[issueId]; if (!ex || !author) return null;
    for (var i = 0; i < roleKeys.length; i++) { var rk = roleKeys[i]; if (ex[rk] && ex[rk] === author) return rk; }
    return null;
  }
  for (var wi = 0; wi < workItems.length; wi++) {
    var w = workItems[wi]; if (!w || !w.issueId || !_validMin(w.minutes)) continue;
    rawMin[w.issueId] = (rawMin[w.issueId] || 0) + w.minutes;   /* сырьё ДО roleOf — «в баг НЕ списано» = raw≤0, а не «неатрибутировано» */
    var rk = roleOf(w.issueId, w.author); if (!rk) continue;
    var e = work[w.issueId] || (work[w.issueId] = { byRole: Object.create(null), items: [] });
    _addRole(e.byRole, rk, w.minutes);
    e.items.push({ rk: rk, min: w.minutes, ts: (typeof w.dateTs === 'number') ? w.dateTs : null });
  }
  function ownByRole(id) { return (work[id] && work[id].byRole) || {}; }
  function ownItems(id) { return (work[id] && work[id].items) || []; }
  /* zeroLog = вообще НЕ списано (raw≤0). Баг со списанным-но-неатрибутированным трудом (raw>0)
     НЕ zeroLog → fallback НЕ срабатывает (иначе тихо переклассифицирует 100% фича-часов в баг). */
  function zeroLog(id) { return (rawMin[id] || 0) <= 0; }

  /* 2. Классификация. Фича = НЕ-баг задача популяции, на которую ссылается баг. */
  var bugs = issues.filter(function (it) { return it && it.isBug; });
  var featureBugs = Object.create(null);   /* featureId → [bug…] */
  var orphanBugs = [];
  bugs.forEach(function (bug) {
    var seenFid = Object.create(null);   /* дедуп: фича, слинкованная >1 типом связи, считается один раз (иначе кривой делёж N-фич) */
    var fids = (Array.isArray(bug.featureIds) ? bug.featureIds : [])
      .filter(function (fid) { return byId[fid] && !byId[fid].isBug && !seenFid[fid] && (seenFid[fid] = true); });
    bug._fids = fids;
    if (!fids.length) { orphanBugs.push(bug); return; }
    fids.forEach(function (fid) { (featureBugs[fid] || (featureBugs[fid] = [])).push(bug); });
  });
  var featureIds = Object.keys(featureBugs);

  /* 3. Пулы система×роль: all (знаменатель) = собственный труд фич; bug (числитель) += списанное
     на баг + переклассифицированный fallback. */
  var perSys = Object.create(null);   /* sys → { bug:{rk→min}, all:{rk→min} } */
  function bucket(sys) { return perSys[sys] || (perSys[sys] = { bug: Object.create(null), all: Object.create(null) }); }

  featureIds.forEach(function (fid) {
    var f = byId[fid], b = bucket(f.system || ''), fo = ownByRole(fid);
    for (var k in fo) _addRole(b.all, k, fo[k]);   /* фича-часы → знаменатель */
  });

  /* 3a. Списанные на баг часы → делёж пропорц. собственным ЧЧ связанных фич (равно если все 0);
     идут И в числитель, И в знаменатель системы каждой фичи. */
  var fallbackBugCount = 0;
  bugs.forEach(function (bug) {
    if (!bug._fids.length) return;   /* orphan — ниже, в корзину */
    var bw = ownByRole(bug.id), bwTotal = _sumVals(bw);
    if (bwTotal <= 0) { if (zeroLog(bug.id)) fallbackBugCount++; return; }   /* нет атрибут. труда: fallback (3b) только если raw≤0; иначе неатрибут. труд отброшен */
    var weights = bug._fids.map(function (fid) { return _sumVals(ownByRole(fid)); });
    var wsum = weights.reduce(function (a, c) { return a + c; }, 0);
    var equal = wsum <= 0;
    bug._fids.forEach(function (fid, i) {
      var share = equal ? (1 / bug._fids.length) : (weights[i] / wsum);
      var b = bucket(byId[fid].system || '');
      for (var k in bw) { var add = bw[k] * share; _addRole(b.bug, k, add); _addRole(b.all, k, add); }
    });
  });

  /* 3b. Fallback: часы фичи, пока связанный zero-log баг был ОТКРЫТ [created, resolve|windowEnd],
     переклассифицируются в баг-числитель (знаменатель НЕ трогаем — уже учтён как фича-час). */
  featureIds.forEach(function (fid) {
    var f = byId[fid];
    var fbugs = featureBugs[fid].filter(function (bug) { return zeroLog(bug.id); });   /* raw≤0: вообще не списано */
    if (!fbugs.length) return;
    var b = bucket(f.system || '');
    ownItems(fid).forEach(function (it) {
      if (it.ts === null) return;
      var isBugfix = fbugs.some(function (bug) {
        if (!(typeof bug.created === 'number' && isFinite(bug.created)) || bug.created > it.ts) return false;   /* NaN/невалид created = как null: НЕ переклассифицируем (иначе -Infinity → вся история) */
        var hi = (bug.resolveTs != null) ? bug.resolveTs : windowToTs;
        return it.ts <= hi;
      });
      if (isBugfix) _addRole(b.bug, it.rk, it.min);
    });
  });

  /* 4. Корзина — orphan-баги: списанный багфикс без знаменателя (числитель-only). */
  var basketRole = Object.create(null);
  orphanBugs.forEach(function (bug) {
    var bw = ownByRole(bug.id);
    for (var k in bw) _addRole(basketRole, k, bw[k]);
  });

  /* 5. Сборка. Строка на роль с данными (all>0 ∨ bug>0). */
  var sysOrder = Object.keys(perSys);
  var groups = [], totalBug = 0, totalAll = 0;
  sysOrder.forEach(function (sys) {
    var g = perSys[sys], rows = [];
    roleKeys.forEach(function (k) {
      var bugM = g.bug[k] || 0, allM = g.all[k] || 0;
      if (allM <= 0 && bugM <= 0) return;
      rows.push({ roleKey: k, label: roleLabel[k], bugMinutes: bugM, allMinutes: allM,
        pct: allM > 0 ? (bugM / allM) : 0 });
      totalBug += bugM; totalAll += allM;
    });
    if (rows.length) groups.push({ system: sys, rows: rows });
  });

  var basketRows = [], basketTotal = 0;
  roleKeys.forEach(function (k) {
    var m = basketRole[k] || 0; if (m <= 0) return;
    basketRows.push({ roleKey: k, label: roleLabel[k], minutes: m }); basketTotal += m;
  });

  return {
    groups: groups,
    basket: basketRows.length ? { rows: basketRows, totalMinutes: basketTotal } : null,
    totalBugMinutes: totalBug, totalAllMinutes: totalAll, totalPct: totalAll > 0 ? (totalBug / totalAll) : 0,
    bugCount: bugs.length, featureCount: featureIds.length,
    fallbackBugCount: fallbackBugCount, orphanBugCount: orphanBugs.length,
  };
}

var _api = { computeBugTax: computeBugTax };

if (typeof window !== 'undefined') {
  try { window.__SSP_REPORTING_B_PURE = _api; } catch (_) { /* sandboxed write may throw */ }
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = _api;
}
