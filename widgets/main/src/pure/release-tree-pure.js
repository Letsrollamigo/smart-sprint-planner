/* release-tree-pure.js — #48 R3.2 дерево состава релиза (US-R3-04).
   Pure-билдер (leaf-слой): плоский состав + parent-ссылки → flatten-DFS список строк
   для рендера деревом (эпик → стори → таска, макет design/mirror/release/planned-card.html
   .tree). Зоны НЕ считает — приходят готовыми в items (live: computeZone release-view;
   история: zone из слепка), слой pure доменные мосты не тянет (гейт B2).

   Контракт buildReleaseTree(items):
   items — [{id, summary, state, zone, type, parents:[id…]}] в порядке состава (id уникальны).
   → { rows, hasHierarchy }, rows = [{id, summary, state, zone, type, depth, hasChildren,
     ancestors:[id…], orphan, agg}] в DFS-порядке: сначала деревья (корни с детьми, порядок
     состава), затем orphan-хвост (узлы без родителя В СОСТАВЕ и без детей — по макету
     плоско top-level под подписью; orphan=true только когда есть хоть одна иерархия).
   Родитель узла = ПЕРВЫЙ из parents, присутствующий в составе (родители вне состава
   виртуальными узлами не добираются — решение скетча R3.2). Цикл parent-ссылок →
   ребро стартового узла рвётся (узел становится корнем). agg — только у узлов с детьми:
   счётчики зон по ЛИСТЬЯМ поддерева (лист = без детей в составе) + total листьев
   (по макету: свод эпика «🟢2 🟡1 · 3 задачи» не считает промежуточную стори). */
'use strict';

function buildReleaseTree(items) {
  var list = (Array.isArray(items) ? items : []).filter(function (it) { return it && it.id; });
  var byId = Object.create(null);
  list.forEach(function (it) { byId[it.id] = it; });

  /* Родитель в составе: первый из parents, который есть в составе и не сам узел. */
  var parentOf = Object.create(null);
  list.forEach(function (it) {
    var ps = Array.isArray(it.parents) ? it.parents : [];
    for (var i = 0; i < ps.length; i++) {
      if (ps[i] !== it.id && byId[ps[i]]) { parentOf[it.id] = ps[i]; break; }
    }
  });

  /* Разрыв циклов: подъём к корню; повторный визит → рвём ребро стартового узла. */
  list.forEach(function (it) {
    var seen = Object.create(null), cur = it.id;
    while (parentOf[cur]) {
      if (seen[cur]) { delete parentOf[it.id]; break; }
      seen[cur] = 1; cur = parentOf[cur];
    }
  });

  var children = Object.create(null);
  list.forEach(function (it) {
    var p = parentOf[it.id];
    if (p) (children[p] = children[p] || []).push(it.id); // порядок состава сохраняется
  });
  var hasHierarchy = list.some(function (it) { return !!parentOf[it.id]; });

  /* Свод по листьям поддерева. */
  function agg(id) {
    var c = { green: 0, yellow: 0, red: 0, grey: 0, total: 0 };
    (function walk(n) {
      var kids = children[n];
      if (!kids || !kids.length) {
        var z = (byId[n] && byId[n].zone) || 'grey';
        c[z] = (c[z] || 0) + 1; c.total++;
        return;
      }
      kids.forEach(walk);
    })(id);
    return c;
  }

  var rows = [];
  function push(id, depth, ancestors, orphan) {
    var it = byId[id], kids = children[id] || [];
    rows.push({
      id: id, summary: it.summary || '', state: it.state || '', zone: it.zone || 'grey',
      type: it.type || '', depth: depth, hasChildren: kids.length > 0,
      ancestors: ancestors, orphan: !!orphan, agg: kids.length ? agg(id) : null,
    });
    kids.forEach(function (k) { push(k, depth + 1, ancestors.concat([id]), false); });
  }

  var treeRoots = [], orphans = [];
  list.forEach(function (it) {
    if (parentOf[it.id]) return;
    (children[it.id] ? treeRoots : orphans).push(it.id);
  });
  treeRoots.forEach(function (id) { push(id, 0, [], false); });
  orphans.forEach(function (id) { push(id, 0, [], hasHierarchy); }); // без иерархии — просто плоский список, подпись не нужна

  return { rows: rows, hasHierarchy: hasHierarchy };
}

const api = { buildReleaseTree: buildReleaseTree };

if (typeof window !== 'undefined') {
  try { window.__SSP_RELEASE_TREE_PURE = api; } catch (_) { /* sandboxed write may throw */ }
}

module.exports = api;
