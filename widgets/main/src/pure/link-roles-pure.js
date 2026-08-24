/* link-roles-pure.js — эпик #74 фаза 1 «Связи задач»: роли типов связей.

   До #74 иерархия задавалась ДВУМЯ текстовыми полями настроек
   (cascadeParentLinkInward/Outward) — одна пара фраз на весь проект, ненаправленные
   типы не вмещались в модель вовсе. Теперь набор ролей задаётся таблицей
   «тип связи × роль» (settings.linkTypeRoles), строки которой берутся из фактических
   типов инстанса (GET issueLinkTypes). Хранится ИМЯ типа (IssueLinkType.name):
   id типов различаются между инстансами (референс-анализ спеки §3), name — нет.

   Роли (спека §4):
     Иерархия    — родитель→потомок: дерево бэклога + каскад состава релиза (⚖8);
     Зависимость — «сначала А, потом Б»: Гант (фаза 2);
     Инфо        — показать, не интерпретировать: бейдж-счётчик (⚖4).
   Направленным типам нужна СТОРОНА: какой конец связи является родителем /
   предшественником (семантика кастомов неавтовыводима — «входит в группу»
   держит родителя в target).

   Без DOM и React. Потребители: domain/backlog-loader.js (дерево),
   domain/release-view.js (каскад состава), react/settings-links.jsx (таблица).
   Юниты — tests/unit/link-roles.test.js. */
'use strict';

/* Дефолт пустой настройки (спека §5.2). В хранилище НЕ пишется — синтезируется здесь,
   поэтому «из коробки» поведение совпадает с доредакционным (иерархия по Subtask). */
const DEFAULT_ROLES = [
  { type: 'Subtask', hier: 'source', dep: null,     info: false },
  { type: 'Depend',  hier: null,     dep: 'source', info: false },
  { type: 'Relates', hier: null,     dep: null,     info: true  }
];

const SIDES = { source: 1, target: 1 };

/* Строка настройки → нормальная форма. Мусор отбрасывается: строгая валидация живёт
   на бэке, здесь defensive — блоб может прийти из чужой/старой вкладки. */
function _normRow(r) {
  if (!r || typeof r !== 'object') return null;
  var type = (typeof r.type === 'string') ? r.type.trim() : '';
  if (!type) return null;
  return {
    type: type,
    hier: SIDES[r.hier] ? r.hier : null,
    dep:  SIDES[r.dep]  ? r.dep  : null,
    info: !!r.info
  };
}

/* Нормализация массива строк: отбрасывает мусор, дедуп по type (first-seen). */
function normalizeRows(rows) {
  if (!Array.isArray(rows)) return [];
  var out = [], seen = {};
  for (var i = 0; i < rows.length; i++) {
    var r = _normRow(rows[i]);
    if (!r || seen[r.type]) continue;
    seen[r.type] = true;
    out.push(r);
  }
  return out;
}

function _fromRows(rows) {
  var h = [], d = [], inf = [];
  rows.forEach(function (r) {
    if (r.hier) h.push({ type: r.type, side: r.hier });
    if (r.dep)  d.push({ type: r.type, side: r.dep });
    if (r.info) inf.push({ type: r.type });
  });
  return { hierarchy: h, dependency: d, info: inf };
}

/* Слоёный резолвер (спека §5.3; паттерн getSprintRolesFor из #73):
     1) settings.linkTypeRoles непустой → он (матчинг по linkType.name + стороне);
     2) легаси cascadeParentLinkInward задан → иерархия по ФРАЗЕ (ровно поведение
        до #74), зависимость/инфо — из дефолта (новые роли ничего не ломают);
     3) ничего нет → дефолт целиком.
   Выход — три списка матчеров:
     { type, side } — side = какой конец связи родитель/предшественник;
     { phrase }     — легаси: фраза со стороны ЭТОЙ задачи, ведущая к родителю. */
function resolveLinkRoles(settings) {
  var s = settings || {};
  var rows = normalizeRows(s.linkTypeRoles);
  if (rows.length) return _fromRows(rows);

  var def = _fromRows(DEFAULT_ROLES);
  var legacy = (typeof s.cascadeParentLinkInward === 'string') ? s.cascadeParentLinkInward.trim() : '';
  if (legacy) return { hierarchy: [{ phrase: legacy }], dependency: def.dependency, info: def.info };
  /* Дефолт иерархии — имя типа И историческая фраза. До #74 ничего не настроивший
     инстанс матчил РОВНО по фразе 'subtask of'; если там переименовали встроенный тип
     (name ≠ 'Subtask'), одного имени не хватило бы и дерево молча схлопнулось бы на
     апгрейде. Матчеры складываются, дубли снимает дедуп linkParents по id. */
  def.hierarchy = def.hierarchy.concat([{ phrase: 'subtask of' }]);
  return def;
}

/* Фраза связи со стороны ЭТОЙ задачи (OUTWARD→sourceToTarget, INWARD→targetToSource).
   Ненаправленный тип приходит с direction 'BOTH' → фразы со «своей стороны» нет. */
function linkPhrase(l) {
  if (!l || !l.linkType) return null;
  return (l.direction === 'OUTWARD') ? (l.linkType.sourceToTarget || null)
    : (l.direction === 'INWARD') ? (l.linkType.targetToSource || null)
      : null;
}

/* Матчит ли связь один матчер «дальний конец = родитель/предшественник».
   side='source' → искомый конец source ⇒ ЭТА задача target ⇒ direction INWARD;
   side='target' → наоборот, OUTWARD. Ненаправленные не матчатся никогда
   (в таблице настроек чекбоксы Иерархия/Зависимость у них выключены). */
function matchesEnd(l, m) {
  if (!l || !l.linkType || !m) return false;
  if (m.phrase) return linkPhrase(l) === m.phrase;
  if (l.linkType.name !== m.type) return false;
  return (m.side === 'source') ? (l.direction === 'INWARD') : (l.direction === 'OUTWARD');
}

/* ВСЕ дальние концы задачи по набору матчеров — по всем парам роли и по всем issues
   внутри каждой связи. До #74 брался только links[i].issues[0]: терялся не только
   второй родитель другого типа, но и второй родитель того же типа. Возвращает
   issue-объекты (рекурсия по вложенным links живёт в вызывающем); дедуп по id. */
function linkParents(iss, matchers) {
  var links = (iss && iss.links) || [];
  var out = [], seen = {};
  (matchers || []).forEach(function (m) {
    links.forEach(function (l) {
      if (!matchesEnd(l, m)) return;
      ((l && l.issues) || []).forEach(function (p) {
        var id = p && (p.idReadable || p.id);
        if (!id || seen[id]) return;
        seen[id] = true;
        out.push(p);
      });
    });
  });
  return out;
}

/* ⚖4 — инфо-связи задачи: [{ idReadable, phrase }] для бейджа-счётчика и тултипа.
   Инфо матчится по типу в ЛЮБОМ направлении, включая ненаправленные (для них
   «своей» фразы нет — показываем sourceToTarget, иначе имя типа). */
function linkInfo(iss, matchers) {
  var links = (iss && iss.links) || [];
  var types = {};
  (matchers || []).forEach(function (m) { if (m && m.type) types[m.type] = true; });
  var out = [], seen = {};
  links.forEach(function (l) {
    if (!l || !l.linkType || !types[l.linkType.name]) return;
    var phrase = linkPhrase(l) || l.linkType.sourceToTarget || l.linkType.name;
    ((l.issues) || []).forEach(function (p) {
      var id = p && (p.idReadable || p.id);
      if (!id || seen[id]) return;
      seen[id] = true;
      out.push({ idReadable: id, phrase: phrase });
    });
  });
  return out;
}

/* Легаси-зеркало (⚖ владелец 2026-08-24, вариант «брать из новой таблицы»).
   Два фоновых правила (workflow-cascade-aggregation, workflow-state-rollup) читают
   тот же блоб настроек напрямую и в скоуп #74 не входят; настройки сохраняются
   целиком, поэтому «форма просто перестала писать» молча откатило бы правила на
   стандартную «subtask of». Форма продолжает писать пару ключей, ВЫВОДЯ её из
   первой строки колонки «Иерархия» (прецедент PLANNING_MODEL_SHIM v2.14.0):
   inward — фраза со стороны ПОТОМКА (ведёт к родителю), outward — обратная.
   types = фактические типы инстанса; фетч не удался или тип не найден → null,
   вызывающий сохраняет прежние значения (правила не теряют настройку). */
function legacyCascadePhrases(rows, types) {
  var norm = normalizeRows(rows);
  var first = null;
  for (var i = 0; i < norm.length; i++) { if (norm[i].hier) { first = norm[i]; break; } }
  if (!first || !Array.isArray(types)) return null;
  var t = null;
  for (var j = 0; j < types.length; j++) { if (types[j] && types[j].name === first.type) { t = types[j]; break; } }
  if (!t || !t.sourceToTarget || !t.targetToSource) return null;
  return (first.hier === 'source')
    ? { inward: t.targetToSource, outward: t.sourceToTarget }
    : { inward: t.sourceToTarget, outward: t.targetToSource };
}

/* ── Описание ролей ДАННЫМИ (#74 переделка настроек) ─────────────────────────
   Раньше знание «какая роль что значит и кто её читает» было размазано по UI
   (тернарники role==='hier', три зашитые колонки) и по прозе подсказок в 15 локалях.
   Теперь это таблица: экран настроек рендерится из неё, и он же показывает
   пользователю, какой модуль настройку потребляет.
     key             — поле строки настройки;
     kind            — 'side': роль требует стороны (какой конец главный) | 'flag': да/нет;
     needsDirected   — роль доступна только направленным типам;
     consumers       — кто читает: gate = имя предиката «модуль включён» (null = всегда),
                       firstOnly = потребитель берёт только ПЕРВУЮ строку с этой ролью. */
const ROLE_DEFS = [
  { key: 'hier', kind: 'side', needsDirected: true, consumers: [
    { id: 'backlog', gate: 'backlog' },
    { id: 'release', gate: 'release' },
    /* Каскад оценок и подтяжка состояния — фоновые правила YT: читают не резолвер, а
       легаси-пару фраз, которую форма выводит из ПЕРВОЙ строки «Иерархии». */
    { id: 'cascade', gate: 'cascade', firstOnly: true },
    { id: 'rollup',  gate: 'rollup',  firstOnly: true },
  ] },
  { key: 'dep', kind: 'side', needsDirected: true, consumers: [
    { id: 'gantt', gate: null },
  ] },
  { key: 'info', kind: 'flag', needsDirected: false, consumers: [
    { id: 'backlog', gate: 'backlog' },
  ] },
];

/* Предикаты «модуль включён в проекте» — чтобы в строке было видно не только КТО читает
   настройку, но и работает ли он сейчас. Бэклог включённым считается по наличию зон/
   стартовых состояний (своего тумблера у него нет). */
const MODULE_GATES = {
  backlog: function (s) {
    return !!(s && ((Array.isArray(s.backlogZones) && s.backlogZones.length)
      || (Array.isArray(s.backlogStartStates) && s.backlogStartStates.length)));
  },
  release: function (s) { return !!(s && s.releaseEnabled); },
  cascade: function (s) { return !!(s && s.cascadeAggregationEnabled); },
  rollup:  function (s) { return !!(s && s.stateRollupEnabled); },
};

function roleDef(key) {
  for (var i = 0; i < ROLE_DEFS.length; i++) if (ROLE_DEFS[i].key === key) return ROLE_DEFS[i];
  return null;
}

/* Потребители роли с признаком «включён сейчас» — вход бейджей строки настройки. */
function roleConsumers(roleKey, settings) {
  var def = roleDef(roleKey);
  if (!def) return [];
  return def.consumers.map(function (c) {
    return {
      id: c.id,
      firstOnly: !!c.firstOnly,
      enabled: c.gate ? !!(MODULE_GATES[c.gate] && MODULE_GATES[c.gate](settings)) : true,
    };
  });
}

/* Фразы типа со стороны, ВЫБРАННОЙ пользователем: chosen — та, что ведёт к главному концу
   (родителю / предшественнику), pair — обратная. Локализованная берётся, когда её отдал
   трекер (2026.1 отдаёт, 2025.3 — null). Ненаправленный тип несёт ровно одну фразу. */
function phrasesForSide(t, side) {
  if (!t) return { chosen: '', pair: '' };
  var s2t = t.localizedSourceToTarget || t.sourceToTarget || '';
  var t2s = t.localizedTargetToSource || t.targetToSource || '';
  if (!t.directed) return { chosen: s2t, pair: '' };
  return (side === 'target') ? { chosen: s2t, pair: t2s } : { chosen: t2s, pair: s2t };
}

/* Сторона, зафиксированная строкой (роли «Иерархия»/«Зависимость» несут её обе одинаково —
   она задаётся выбором фразы в пикере). null — строка пока только «Инфо», стороны нет. */
function rowSide(row) {
  if (!row) return null;
  return (row.hier || row.dep) || null;
}

/* Опции пикера «добавить связь»: по одной на КАЖДУЮ фразу каждого типа, которого ещё нет
   в настройке. Выбор фразы задаёт и тип, и сторону — отдельного вопроса «кто родитель»
   не нужно: targetToSource читается со стороны младшей задачи (главный конец = source),
   sourceToTarget — наоборот. Добавленный тип уходит из пикера ОБЕИМИ фразами. */
function pickerOptions(types, rows) {
  var used = {};
  normalizeRows(rows).forEach(function (r) { used[r.type] = true; });
  var out = [];
  (types || []).forEach(function (t) {
    if (!t || !t.name || used[t.name]) return;
    var label = t.localizedName || t.name;
    var ph = phrasesForSide(t, 'source');
    if (!t.directed) {
      out.push({ key: t.name + '|', type: t.name, side: null, directed: false,
        typeLabel: label, phrase: ph.chosen, pairPhrase: '', aggregation: !!t.aggregation });
      return;
    }
    var back = phrasesForSide(t, 'target');
    out.push({ key: t.name + '|source', type: t.name, side: 'source', directed: true,
      typeLabel: label, phrase: ph.chosen, pairPhrase: ph.pair, aggregation: !!t.aggregation });
    out.push({ key: t.name + '|target', type: t.name, side: 'target', directed: true,
      typeLabel: label, phrase: back.chosen, pairPhrase: back.pair, aggregation: !!t.aggregation });
  });
  return out;
}

/* ── Фаза 2: Гант ───────────────────────────────────────────────────────────
   ⚖7 — свой цвет каждому типу связи, без настройки цветов. Палитра ИЗОЛЮМИНАНТНАЯ
   (все восемь на одной относительной яркости L≈0.235): один и тот же hex проходит
   ≥3:1 против обоих фонов строк Ганта и в светлой, и в тёмной теме, поэтому CSS-
   переменных и парных объявлений не нужно. Проверка контраста — юнитом.
   Прецедент палитры и легенды — зоны бэклога (react/backlog-view.jsx). */
const LINK_TYPE_PALETTE = ['#5585D7', '#269855', '#CA6D1D', '#AF68CD', '#1F92A3', '#D95C6D', '#CC5DAA', '#7B8793'];

/* Цвет на тип: по позиции ВНУТРИ списка матчеров роли «Зависимость», а не по всему
   массиву настройки — тогда правка ролей у постороннего типа не сдвигает цвета стрелок.
   Ключ матчера: имя типа (новый путь) либо фраза (легаси-слой). */
function dependencyColors(settings) {
  const out = {};
  resolveLinkRoles(settings).dependency.forEach(function (m, i) {
    out[m.type || m.phrase] = LINK_TYPE_PALETTE[i % LINK_TYPE_PALETTE.length];
  });
  return out;
}

/* Предшественники задачи по роли «Зависимость»: [{ id, type }] — тип нужен для цвета
   стрелки. Дедуп по дальнему концу: между одной парой задач рисуется ОДНА стрелка
   (у либы React-key = «Arrow from A to B», дубли пары дали бы одинаковые ключи). */
function dependencyPreds(iss, matchers) {
  const links = (iss && iss.links) || [];
  const out = [], seen = {};
  (matchers || []).forEach(function (m) {
    links.forEach(function (l) {
      if (!matchesEnd(l, m)) return;
      ((l && l.issues) || []).forEach(function (p) {
        const id = p && (p.idReadable || p.id);
        if (!id || seen[id]) return;
        seen[id] = true;
        out.push({ id: id, type: (l.linkType && l.linkType.name) || (m.type || '') });
      });
    });
  });
  return out;
}

/* Порядок стрелок, В КОТОРОМ ИХ РЕНДЕРИТ ЛИБА — вход для пост-рендерной раскраски
   (у узла <g class="arrow"> нет ни id, ни data-атрибута, сопоставлять можно только
   позиционно). Либа: для каждой задачи в порядке массива и каждого её предшественника
   в порядке массива кладёт задачу в barChildren предшественника; рисует потом обходом
   задач в том же порядке и их barChildren в порядке вставки. Ссылка на id, которого
   нет среди задач, молча игнорируется — воспроизводим и это.
   tasks: [{ id, dependencies:[predId], depTypes:{predId: typeName} }] */
function ganttArrowOrder(tasks) {
  const list = Array.isArray(tasks) ? tasks : [];
  const known = {};
  list.forEach(function (t) { if (t && t.id) known[t.id] = true; });
  const children = {};
  list.forEach(function (t) {
    ((t && t.dependencies) || []).forEach(function (pid) {
      if (!known[pid]) return;                       /* внешние — не стрелка, а значок */
      if (!children[pid]) children[pid] = [];
      children[pid].push({ to: t.id, type: (t.depTypes || {})[pid] || '' });
    });
  });
  const out = [];
  list.forEach(function (t) {
    (children[(t && t.id)] || []).forEach(function (c) {
      out.push({ from: t.id, to: c.to, type: c.type });
    });
  });
  return out;
}

var _api = {
  DEFAULT_ROLES: DEFAULT_ROLES,
  ROLE_DEFS: ROLE_DEFS,
  roleDef: roleDef,
  roleConsumers: roleConsumers,
  phrasesForSide: phrasesForSide,
  rowSide: rowSide,
  pickerOptions: pickerOptions,
  LINK_TYPE_PALETTE: LINK_TYPE_PALETTE,
  dependencyColors: dependencyColors,
  dependencyPreds: dependencyPreds,
  ganttArrowOrder: ganttArrowOrder,
  normalizeRows: normalizeRows,
  resolveLinkRoles: resolveLinkRoles,
  linkPhrase: linkPhrase,
  matchesEnd: matchesEnd,
  linkParents: linkParents,
  linkInfo: linkInfo,
  legacyCascadePhrases: legacyCascadePhrases,
};

if (typeof window !== 'undefined') {
  try { window.__SSP_LINK_ROLES_PURE = _api; } catch (_) { /* sandboxed write may throw */ }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = _api;
}
