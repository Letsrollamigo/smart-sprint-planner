/* widgets/main/src/pure/gantt-all-pure.js — #122 «Сквозной Гант по всем ролям»: чистые правила режима
   «Все роли» — стадии цепочки и порядок дорожек, неявная цепочка задачи, конфликты сроков, сворачивание
   групп с переносом стрелок, стили стрелок, ось либы gantt-task-react и координаты на ней.
   Публикует window.__SSP_GANTT_ALL_PURE ДО исполнения IIFE core.js (паттерн phases-pure).

   Даты канона — UTC-полночь ms, dateEnd инклюзивный (#116): сравнения только через dayMs, поэтому
   голден renderGanttChart под TZ=America/Los_Angeles даёт тот же vm. Исключение — ось (axisDates,
   xOf, monthSpans): это намеренная копия арифметики либы 0.3.9 на ЛОКАЛЬНЫХ Date (ganttDateRange,
   seedDates, getMonday, taskXCoordinate), зовётся только из React-пока полос фаз и шапки, в vm не идёт. */

const DAY_MS = 86400000;
/* ⚖3 — встроенный порядок без маппинга фаз: анализ → роли разработки (одна стадия, параллельно) → тестирование. */
const BUILTIN_STAGES = [['analysis'], ['devPlatform', 'devBack', 'devFront', 'devIos', 'devAndroid', 'devFs', 'devDb'], ['testing']];
/* Служебный тип зависимости цепочки — вне палитры типов связей (LINK_TYPE_PALETTE). */
const CHAIN_TYPE = '__chain';
const HAS = Object.prototype.hasOwnProperty;

function dayMs(ts) { return Math.ceil(ts / DAY_MS - 0.5) * DAY_MS; }
function isNum(v) { return typeof v === 'number' && isFinite(v); }

/* Составные id строк либы (§1 спеки): 'rk:issueId' — полоса, 'track:rk' — дорожка, 'epic:rk:P' — группа
   эпика. Двоеточие не встречается ни в ключе роли, ни в idReadable. */
function barKey(rk, issueId) { return rk + ':' + issueId; }
function parseId(id) {
  const p = String(id || '').split(':');
  if (p[0] === 'track' && p.length === 2) return { kind: 'track', rk: p[1] };
  if (p[0] === 'epic' && p.length === 3) return { kind: 'epic', rk: p[1], issueId: p[2] };
  if (p.length === 2 && p[0] && p[1]) return { kind: 'bar', rk: p[0], issueId: p[1] };
  return null;
}

function _hasMapping(phaseRoles) {
  if (!phaseRoles || typeof phaseRoles !== 'object') return false;
  return Object.keys(phaseRoles).some(function (k) { return Array.isArray(phaseRoles[k]) && phaseRoles[k].length > 0; });
}

function _builtinIdx(rk) {
  for (let i = 0; i < BUILTIN_STAGES.length; i++) if (BUILTIN_STAGES[i].indexOf(rk) >= 0) return i;
  return BUILTIN_STAGES.length;
}

/* §A3.6 — стадии цепочки и порядок дорожек. roleKeys — роли спринта в порядке getSprintRoles();
   phaseKeys — PHASES_PURE.PHASE_KEYS. При включённых фазах и непустом маппинге — стадия на каждую фазу
   (роль из нескольких фаз — в первой по цепочке); без маппинга — встроенный порядок. Роли вне маппинга
   (⚖ владелец 2026-09-14) встают встроенным порядком перед первой фазовой стадией, где есть роль более
   поздней встроенной стадии: при маппинге одного тестирования анализ и разработка идут до него, а не после.
   → { list: [[rk…]], stageOf: { rk: номер стадии }, order: [rk…] — порядок дорожек } */
function stages(roleKeys, settings, phaseKeys) {
  const roles = Array.isArray(roleKeys) ? roleKeys : [];
  const s = settings || {};
  const taken = {}, mapped = [];
  function pick(pred) {
    const rks = roles.filter(function (rk) { return !taken[rk] && pred(rk); });
    rks.forEach(function (rk) { taken[rk] = true; });
    return rks;
  }
  if (s.phasesEnabled === true && _hasMapping(s.phaseRoles)) {
    (phaseKeys || []).forEach(function (k) {
      const m = Array.isArray(s.phaseRoles[k]) ? s.phaseRoles[k] : [];
      const rks = pick(function (rk) { return m.indexOf(rk) >= 0; });
      if (rks.length) mapped.push(rks);
    });
  }
  const before = mapped.map(function () { return []; }).concat([[]]);
  for (let b = 0; b <= BUILTIN_STAGES.length; b++) {
    const rks = pick(function (rk) { return _builtinIdx(rk) === b; });
    if (!rks.length) continue;
    let i = mapped.findIndex(function (st) { return st.some(function (rk) { return _builtinIdx(rk) > b; }); });
    before[i < 0 ? mapped.length : i].push(rks);
  }
  const list = [];
  before.forEach(function (grp, i) { list.push.apply(list, grp); if (i < mapped.length) list.push(mapped[i]); });
  const stageOf = {}, order = [];
  list.forEach(function (rks, i) { rks.forEach(function (rk) { stageOf[rk] = i; order.push(rk); }); });
  return { list: list, stageOf: stageOf, order: order };
}

/* §A3.6 п.4 — рёбра неявной цепочки: полосы одной задачи группируются по стадиям; каждая полоса
   предыдущей НЕПУСТОЙ группы → каждая полоса следующей; внутри стадии рёбер нет.
   bars: [{ key, rk, issueId }] → [{ from, to }] (ключи полос). */
function chainEdges(bars, stageOf) {
  const byIssue = {}, ids = [];
  (bars || []).forEach(function (b) {
    if (!b || !stageOf || !HAS.call(stageOf, b.rk)) return;
    if (!byIssue[b.issueId]) { byIssue[b.issueId] = {}; ids.push(b.issueId); }
    const g = byIssue[b.issueId], st = stageOf[b.rk];
    (g[st] = g[st] || []).push(b.key);
  });
  const out = [];
  ids.forEach(function (id) {
    const g = byIssue[id];
    const idx = Object.keys(g).map(Number).sort(function (a, b) { return a - b; });
    for (let i = 1; i < idx.length; i++) {
      g[idx[i - 1]].forEach(function (from) {
        g[idx[i]].forEach(function (to) { out.push({ from: from, to: to }); });
      });
    }
  });
  return out;
}

/* Отрезок фаз роли по маппингу: объединение всех фаз с датами, где роль упомянута. */
function _phaseRange(rk, ctx) {
  let lo = null, hi = null;
  const keys = [];
  (ctx.phaseKeys || []).forEach(function (k) {
    const p = ctx.phases && ctx.phases[k];
    const mapped = (ctx.phaseRoles && Array.isArray(ctx.phaseRoles[k])) ? ctx.phaseRoles[k] : [];
    if (!p || !isNum(p.dateStart) || !isNum(p.dateEnd) || mapped.indexOf(rk) < 0) return;
    keys.push(k);
    if (lo === null || dayMs(p.dateStart) < lo) lo = dayMs(p.dateStart);
    if (hi === null || dayMs(p.dateEnd) > hi) hi = dayMs(p.dateEnd);
  });
  return keys.length ? { lo: lo, hi: hi, keys: keys } : null;
}

/* §A3.5 — конфликты сроков, без запрета (⚖4).
   bars — полосы с СОБСТВЕННЫМИ датами [{ key, rk, issueId, startMs, endMs }] (полоса на границах спринта
   по фолбэку в проверку не входит); preds — { issueId: [{ id, type }] } из кэша связей; chain — рёбра
   chainEdges; phasesCtx — { enabled, phases (PHASES_PURE.normalize), phaseRoles, phaseKeys }.
   «Раньше конца»: dayMs(старт) ≤ dayMs(конец предшественника) — по каждой полосе предшественника в
   любой роли (явная связь, §О15) и по ребру цепочки. «Вне фазы»: старт раньше начала или конец позже
   конца объединения фаз роли. → { byBar: { key: [конфликт…] }, edges: { 'from→to': true },
   before: полос с «раньше конца», phase: полос «вне фазы», total: полос с любым конфликтом } */
function conflicts(bars, preds, chain, phasesCtx) {
  const list = Array.isArray(bars) ? bars : [];
  const byKey = {}, byIssue = {}, byBar = {}, edges = {};
  list.forEach(function (b) {
    byKey[b.key] = b;
    (byIssue[b.issueId] = byIssue[b.issueId] || []).push(b);
  });
  function add(key, c) { (byBar[key] = byBar[key] || []).push(c); }
  function checkBefore(pb, b) {
    if (dayMs(b.startMs) > dayMs(pb.endMs)) return;
    add(b.key, { kind: 'before', predKey: pb.key, predIssue: pb.issueId, predRole: pb.rk, predEnd: pb.endMs });
    edges[pb.key + '→' + b.key] = true;
  }
  list.forEach(function (b) {
    ((preds && preds[b.issueId]) || []).forEach(function (p) {
      if (!p || p.id === b.issueId) return;
      (byIssue[p.id] || []).forEach(function (pb) { checkBefore(pb, b); });
    });
  });
  (chain || []).forEach(function (e) {
    if (e && byKey[e.from] && byKey[e.to]) checkBefore(byKey[e.from], byKey[e.to]);
  });
  const ctx = phasesCtx || {};
  if (ctx.enabled === true) {
    const ranges = {};
    list.forEach(function (b) {
      if (!HAS.call(ranges, b.rk)) ranges[b.rk] = _phaseRange(b.rk, ctx);
      const r = ranges[b.rk];
      if (r && (dayMs(b.startMs) < r.lo || dayMs(b.endMs) > r.hi)) {
        add(b.key, { kind: 'phase', from: b.startMs, to: b.endMs, phases: r.keys });
      }
    });
  }
  let nBefore = 0, nPhase = 0;
  Object.keys(byBar).forEach(function (k) {
    if (byBar[k].some(function (c) { return c.kind === 'before'; })) nBefore++;
    if (byBar[k].some(function (c) { return c.kind === 'phase'; })) nPhase++;
  });
  return { byBar: byBar, edges: edges, before: nBefore, phase: nPhase, total: Object.keys(byBar).length };
}

/* §A3.3 — сворачивание групп фильтром строк (hideChildren либе НЕ передаётся: её getChildren для task
   идёт по dependencies и спрятал бы зависимые задачи других ролей).
   rows: [{ id, parent: id группы | null, dependencies: [id], depTypes: { id: тип } }] в порядке показа;
   collapsed: { groupId: 1 }. Строка прячется, если свёрнут любой её предок; её представитель — ВНЕШНИЙ
   свёрнутый предок (он видим). Ссылки видимых строк на спрятанные переезжают на представителя, свёрнутая
   группа забирает зависимости спрятанных детей; дубли и петли снимаются.
   → { rows: видимые строки (копии), repOf: { id: id видимого представителя } } */
function collapseRows(rows, collapsed) {
  const list = Array.isArray(rows) ? rows : [];
  const c = collapsed || {};
  const parentOf = {}, repOf = {};
  list.forEach(function (r) { parentOf[r.id] = r.parent || null; });
  function rep(id) {
    if (HAS.call(repOf, id)) return repOf[id];
    if (!HAS.call(parentOf, id)) return id;
    const up = [];
    for (let p = parentOf[id], guard = 0; p && guard < 16; p = parentOf[p], guard++) up.unshift(p);
    let r = id;
    for (let i = 0; i < up.length; i++) if (c[up[i]]) { r = up[i]; break; }
    repOf[id] = r;
    return r;
  }
  const out = [], byId = {};
  list.forEach(function (r) {
    if (rep(r.id) !== r.id) return;
    const row = Object.assign({}, r, { dependencies: [], depTypes: {} });
    byId[r.id] = row;
    out.push(row);
  });
  list.forEach(function (r) {
    const target = byId[repOf[r.id]];
    (r.dependencies || []).forEach(function (pid) {
      const to = rep(pid);
      if (to === target.id || target.dependencies.indexOf(to) >= 0) return;
      target.dependencies.push(to);
      target.depTypes[to] = (r.depTypes || {})[pid] || '';
    });
  });
  return { rows: out, repOf: repOf };
}

/* §A3.8 — стиль стрелок в порядке рендера либы (plan = LINK_ROLES_PURE.ganttArrowOrder): тип из палитры —
   цвет типа; цепочка — серый пунктир 5/4; ребро-виновник конфликта — --warn 2 px поверх (пунктир
   цепочки сохраняется). edges — ключи 'from→to' в id строк либы. → [{ stroke, dash, width } | null]. */
function arrowStyles(plan, colors, edges) {
  return (plan || []).map(function (a) {
    let st = null;
    if (a.type === CHAIN_TYPE) st = { stroke: 'var(--muted)', dash: '5 4', width: null };
    else if (colors && colors[a.type]) st = { stroke: colors[a.type], dash: null, width: null };
    if (edges && edges[a.from + '→' + a.to]) st = { stroke: 'var(--warn)', dash: st ? st.dash : null, width: 2 };
    return st;
  });
}

/* Охват полос: min начала и max конца (сводная полоса дорожки). Нет полос с датами → null. */
function span(bars) {
  let lo = null, hi = null;
  (bars || []).forEach(function (b) {
    if (!b || !isNum(b.startMs) || !isNum(b.endMs)) return;
    if (lo === null || b.startMs < lo) lo = b.startMs;
    if (hi === null || b.endMs > hi) hi = b.endMs;
  });
  return lo === null ? null : { startMs: lo, endMs: hi };
}

/* ── Ось либы 0.3.9 (локальные Date, preStepsCount 1) ── */
function _add(d, n, unit) {
  return new Date(d.getFullYear() + (unit === 'year' ? n : 0), d.getMonth() + (unit === 'month' ? n : 0),
    d.getDate() + (unit === 'day' ? n : 0), d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
}
function _startOf(d, unit) {
  if (unit === 'year') return new Date(d.getFullYear(), 0, 1);
  if (unit === 'month') return new Date(d.getFullYear(), d.getMonth(), 1);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function _monday(d) {
  const day = d.getDay();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - day + (day === 0 ? -6 : 1));
}

/* §A3.7 — даты оси, как их строит либа: ganttDateRange + seedDates. minStart/maxEnd — Date (maxEnd
   exclusive, как task.end либы). Хвост оси у либы не «+1 шаг»: Day +19 дней, Week +1.5 месяца
   (дробный месяц Date усекает), Month — начало года через год. mode: 'Day' | 'Week' | 'Month'. */
function axisDates(minStart, maxEnd, mode) {
  let s, e, n = 1, unit = 'day';
  if (mode === 'Month') {
    s = _startOf(_add(minStart, -1, 'month'), 'month');
    e = _startOf(_add(maxEnd, 1, 'year'), 'year');
    unit = 'month';
  } else if (mode === 'Week') {
    s = _add(_monday(_startOf(minStart, 'day')), -7, 'day');
    e = _add(_startOf(maxEnd, 'day'), 1.5, 'month');
    n = 7;
  } else {
    s = _add(_startOf(minStart, 'day'), -1, 'day');
    e = _add(_startOf(maxEnd, 'day'), 19, 'day');
  }
  const out = [s];
  for (let cur = s; cur < e;) { cur = _add(cur, n, unit); out.push(cur); }
  return out;
}

/* §A3.7 — x даты на оси (taskXCoordinate либы). За краями оси — клэмп: у либы индекс −1 роняет рендер,
   а полоса фазы может начаться раньше первой задачи. */
function xOf(date, dates, colW) {
  const n = (dates || []).length;
  if (n < 2) return 0;
  const t = date.getTime();
  if (t <= dates[0].getTime()) return 0;
  if (t >= dates[n - 1].getTime()) return (n - 1) * colW;
  let j = 1;
  while (dates[j].getTime() < t) j++;
  const a = dates[j - 1].getTime(), b = dates[j].getTime();
  return (j - 1) * colW + (t - a) / (b - a) * colW;
}

/* §A3.7 / §О7 — подписи месяцев режима Day: центр отрезка месяца ВНУТРИ оси (без слушателя прокрутки).
   → [{ x, w, date }] — w: ширина видимого отрезка (подпись шире — не рисуется), date внутри месяца. */
function monthSpans(dates, colW) {
  const n = (dates || []).length, out = [];
  if (n < 2) return out;
  const first = dates[0], last = dates[n - 1];
  for (let m = new Date(first.getFullYear(), first.getMonth(), 1); m < last;) {
    const next = new Date(m.getFullYear(), m.getMonth() + 1, 1);
    const a = m < first ? first : m, b = next > last ? last : next;
    const xa = xOf(a, dates, colW), xb = xOf(b, dates, colW);
    out.push({ x: (xa + xb) / 2, w: xb - xa, date: new Date(m.getFullYear(), m.getMonth(), 15) });
    m = next;
  }
  return out;
}

const _api = {
  DAY_MS: DAY_MS, BUILTIN_STAGES: BUILTIN_STAGES, CHAIN_TYPE: CHAIN_TYPE, dayMs: dayMs,
  barKey: barKey, parseId: parseId, stages: stages, chainEdges: chainEdges, conflicts: conflicts,
  collapseRows: collapseRows, arrowStyles: arrowStyles, span: span,
  axisDates: axisDates, xOf: xOf, monthSpans: monthSpans,
};

if (typeof window !== 'undefined') {
  try { window.__SSP_GANTT_ALL_PURE = _api; } catch (_) { /* sandboxed write may throw */ }
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = _api;
}
