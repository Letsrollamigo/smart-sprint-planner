'use strict';
/* widgets/main/src/domain/backlog-loader.js
   #21 слайс 2b — async-загрузчик пула бэклога. FRONTEND-DIRECT: host.fetchYouTrack('issues')
   (backend issue-search НЕ существует — R1 разведки). Постранично грузит задачи по зонам +
   стартовым состояниям + базовому фильтру по типу, мапит сырой issue → task-контракт,
   кладёт в transient _backlogPool (§4 спеки: НЕ храним — спрашиваем трекер при открытии вкладки).
   pure VM собирается из этого пула через backlog-vm-pure.buildBacklogVm (рендер — слайс 3).
   carry-over (activities) — НЕ здесь (слайс 3/5). Публикует window.__SSP_BACKLOG_LOADER.

   deps: { t, toast, diag, ctx, settings, host, roles(ALL_ROLES), getActiveRoles,
           backlogPage, maxBacklogTotal, userFilter (слайс 5 — query-assist фильтр),
           state:{ getSettings, setBacklogPool, getBacklogPool } } */

/* YT issue-поля: customFields покрывают State/Type/System/Priority + ролевые est/fact
   (value.minutes); value.isResolved — §8 resolved auto-hide; tags(name) — §8 пауза по тегу.

   R5 (аудит стабильности §1) — селектор ПЛОСКИЙ: links раскрывают только idReadable на другом
   конце. Прежний 2-уровневый разворот links(issues(...,links(issues(...)))) заставлял YT
   отдавать на каждую задачу пула ВСЕ типы связей её родителя, включая «parent for» → все
   sibling-подзадачи стори с полными customFields — payload и серверный CPU росли как
   O(N × siblings) (1–2 мин на проде). Родители/прародители теперь дотягиваются БАТЧАМИ по
   уникальным id (_loadParentChains) — дерево §5 (depth=2) сохраняется полностью. */
var BACKLOG_ISSUE_FIELDS = 'id,idReadable,summary,'
  /* field(name,id): id поля State нужен слайсу 7 (carry-over) — надёжный fieldId для
     activities-детекта смены состояния (без localized-mismatch; project-fields id не отдаёт). */
  + 'customFields(name,projectCustomField(field(name,id)),value(name,localizedName,presentation,minutes,isResolved)),'
  + 'tags(name),'
  /* §5/#74: направление + имя и фразы типа связи + id на другом конце. Родители и
     инфо-связи резолвятся из этого же набора (pure/link-roles-pure) — бейджу ⚖4
     новых полей не нужно. Имя типа обязательно: id типов различаются между инстансами. */
  + 'links(direction,linkType(name,sourceToTarget,targetToSource),issues(idReadable))';
/* R5 фаза 2/3 — поля батч-дозагрузки родителей: summary + kind-CF (value(name) — как отдавал
   прежний вложенный селектор) + плоские links для резолва прародителя. Прародителям links не нужны. */
const BACKLOG_PARENT_FIELDS = 'idReadable,summary,'
  + 'customFields(name,projectCustomField(field(name)),value(name)),'
  + 'links(direction,linkType(name,sourceToTarget,targetToSource),issues(idReadable))';
const BACKLOG_GRANDPARENT_FIELDS = 'idReadable,summary,'
  + 'customFields(name,projectCustomField(field(name)),value(name))';

/* Уникальные непустые состояния стартового пула + всех зон — для query 'State: ...'. */
function _poolStates(settings) {
  var s = settings || {};
  var out = [], seen = {};
  (Array.isArray(s.backlogStartStates) ? s.backlogStartStates : []).forEach(function (st) {
    if (st && !seen[st]) { seen[st] = true; out.push(st); }
  });
  (Array.isArray(s.backlogZones) ? s.backlogZones : []).forEach(function (z) {
    var st = z && z.state;
    if (st && !seen[st]) { seen[st] = true; out.push(st); }
  });
  return out;
}

/* §8 schema-level fail-loud: состояния бандла fieldState, которые НЕ замаплены (не зона,
   не старт, не пауза) и НЕ resolved → «донастройте». Чистая set-разность. values/resolved —
   из backend field-values (resolved отдаётся аддитивно; старый backend без него → resolved=[],
   тогда resolved-состояния попали бы в unmapped — вызывающий зовёт только при наличии resolved). */
function computeUnmappedStates(values, resolved, s) {
  if (!Array.isArray(values)) return [];
  s = s || {};
  var mapped = {};
  (Array.isArray(s.backlogStartStates) ? s.backlogStartStates : []).forEach(function (x) { mapped[x] = true; });
  (Array.isArray(s.backlogZones) ? s.backlogZones : []).forEach(function (z) { if (z && z.state) mapped[z.state] = true; });
  (Array.isArray(s.backlogPauseStates) ? s.backlogPauseStates : []).forEach(function (x) { mapped[x] = true; });
  (Array.isArray(resolved) ? resolved : []).forEach(function (x) { mapped[x] = true; });
  return values.filter(function (v) { return v && !mapped[v]; });
}

/* YT-query пула: 'project: <short> <stateAttr>: {A},{B} <typeAttr>: {X},{Y}'.
   Значения атрибутов с пробелами ('In Progress', 'To Do', 'Под уточнение') ОБЯЗАНЫ быть
   в брейсах {…} — иначе YT парсит первое слово как значение, остальные как свободный текст
   (дока YouTrack attribute search). Брейсим значения безусловно (для односложных безвредно).
   Имя атрибута — из настроек (fieldState/fieldType, НЕ литерал, §9 спеки) + брейс при пробеле.
   Запятая внутри атрибута = OR. */
function _bv(v) { return '{' + v + '}'; }
function _battr(name) { return /\s/.test(name) ? '{' + name + '}' : name; }
/* #21-fix — НАДЁЖНЫЙ ключ активного проекта: resolved activeProjectKey (entity/picker) в
   приоритете, ctx.project — только legacy-fallback (на YT 2026.1 / в global-режиме пусто). */
function _activeProj(deps) {
  if (deps.activeProjectKey) return String(deps.activeProjectKey);
  var p = deps.ctx && deps.ctx.project;
  return p ? String(p.shortName || p.id || '') : '';
}
function _buildPoolQuery(deps) {
  var s = deps.settings || {};
  var proj = _activeProj(deps);
  var parts = [];
  if (proj) parts.push('project: ' + proj);
  var states = _poolStates(s);
  if (states.length) parts.push(_battr(s.fieldState || 'State') + ': ' + states.map(_bv).join(','));
  var types = Array.isArray(s.backlogTypeFilter) ? s.backlogTypeFilter.filter(Boolean) : [];
  if (types.length) parts.push(_battr(s.fieldType || 'Type') + ': ' + types.map(_bv).join(','));
  /* §2 ось «Фильтр» (слайс 5): пользовательский query-assist фильтр AND-ится к базовому
     (YT AND по пробелу). Сырой ввод пользователя — не брейсим (он сам пишет синтаксис YT). */
  var userQ = (deps.userFilter || '').trim();
  if (userQ) parts.push(userQ);
  /* R5 — детерминированный порядок для постраничной выгрузки: без явной сортировки YT-порядок
     нестабилен → при конкурентных правках между страницами возможны дубли/пропуски. created asc
     append-only: задачи, созданные во время пагинации, встают В КОНЕЦ — уже выбранные страницы
     не сдвигаются. Пользовательский sort by в фильтре уважаем (не дублируем клаузу). */
  var q = parts.join(' ');
  if (!/sort by:/i.test(q)) q += (q ? ' ' : '') + 'sort by: created asc';
  return q;
}

/* §2/§10 слайс 5 — data-source подсказок Ring QueryAssist для фильтра пула в шапке вкладки.
   1:1 с pick.js _pickAssist (POST /api/search/assist, scope = текущий проект). Ошибка →
   пустые подсказки (поле продолжает работать). */
/* const (не var) — C1 arch-fitness: module-level var/let = «новое состояние»; const иммутабелен и исключён. */
const ASSIST_FIELDS = '$type,id,suggestions($type,caret,completionStart,completionEnd,'
  + 'matchingStart,matchingEnd,description,group,icon,option,prefix,suffix)';
function _backlogAssist(req, deps) {
  var query = (req && req.query) || '';
  var caret = (req && typeof req.caret === 'number') ? req.caret : query.length;
  /* folders-скоуп подсказок → активный проект (activeProjectId; ctx.project пусто в global). */
  var pid = deps.activeProjectId || (deps.ctx && deps.ctx.project && deps.ctx.project.id) || null;
  var body = { query: query, caret: caret, ignoreUnresolvedSetting: true };
  if (pid) body.folders = [{ $type: 'Project', id: pid }];
  return deps.host.fetchYouTrack('search/assist', {
    method: 'POST', query: { fields: ASSIST_FIELDS }, body: body,
    headers: { 'Content-Type': 'application/json' },
  }).then(function (res) {
    return { query: query, caret: caret, suggestions: (res && res.suggestions) || [] };
  }).catch(function (err) {
    if (deps.diag) deps.diag('_backlogAssist: search/assist failed — ' + (err && err.message ? err.message : err), 'warn');
    return { query: query, caret: caret, suggestions: [] };
  });
}

/* customField issue по ИМЕНИ поля (projectCustomField.field.name | cf.name).
   ponytail: cf-резолвинг уже живёт 3 раза (pick.js cfValPres, refresh-controller cfOf/
   getMin/getStr) — здесь 4-я локальная копия (~15 строк). Вынести в pure/cf-access.js и
   переиспустить из loader+pick+refresh — при слайсе 3 (когда рендер уже трогает этот тракт),
   а не отдельным cross-module рефактором сейчас (минимальный дифф). */
function _cfByName(iss, fieldName) {
  if (!fieldName) return null;
  var cfs = iss.customFields || [];
  for (var i = 0; i < cfs.length; i++) {
    var cf = cfs[i];
    var fn = (cf.projectCustomField && cf.projectCustomField.field && cf.projectCustomField.field.name) || cf.name || '';
    if (fn === fieldName) return cf;
  }
  return null;
}
function _cfPres(iss, fieldName) {
  var cf = _cfByName(iss, fieldName);
  var v = cf && cf.value;
  if (!v) return null;
  return v.localizedName || v.presentation || v.name || null;
}
function _cfMinutes(iss, fieldName) {
  var cf = _cfByName(iss, fieldName);
  var v = cf && cf.value;
  return (v && typeof v.minutes === 'number') ? v.minutes : null;
}
/* Каноническое имя enum-значения (value.name) — для стабильной сортировки (не локализованное). */
function _cfName(iss, fieldName) {
  var cf = _cfByName(iss, fieldName);
  var v = cf && cf.value;
  return (v && v.name) || null;
}

/* #74 — мост к резолверу ролей связей (pure/link-roles-pure.js). Как и прочие
   pure-мосты программы, читается по месту вызова: к моменту загрузки пула модуль
   уже импортирован index.js. Мост недоступен → дерево без иерархии (деградация
   канона _treeRows в release-view), а не тихо неверные родители. */
function _LR() {
  return (typeof window !== 'undefined' && window.__SSP_LINK_ROLES_PURE) || null;
}

/* §5 — родители-issue (raw, с вложенными links для рекурсии). #74: ВСЕ пары роли
   «Иерархия» из резолвера и ВСЕ issues внутри каждой связи — до #74 брался только
   links[i].issues[0] по единственной фразе cascadeParentLinkInward, из-за чего
   терялся даже второй родитель того же типа. */
function _parentsRaw(iss, s) {
  var LR = _LR();
  if (!LR) return [];
  return LR.linkParents(iss, LR.resolveLinkRoles(s).hierarchy);
}
function _toContainer(p, s) {
  return {
    issueId: p.idReadable || p.id,
    summary: (p.summary && p.summary.trim()) || '',
    kind: s.cascadeKindField ? _cfPres(p, s.cascadeKindField) : null,
  };
}
/* §5 — цепочки родителей (ближний→дальний), depth хопов (вложенность links). Для
   Эпик▸Стори▸Таск depth=2 (Стори, Эпик). Работает по тем данным, что есть в links
   (плоский фетч R5 даст id-only заглушку — цепочки доуточняет _loadParentChains).
   #74 ⚖3: цепочка на КАЖДОГО прямого родителя (лист крепится под каждым). Выше по
   цепочке берём первого родителя-предка: контейнер под двумя предками VM всё равно
   финализирует один раз (visited-guard v3.2.1), лишние ветки были бы холостыми. */
function _parentChains(iss, s, depth) {
  var d = depth || 2;
  return _parentsRaw(iss, s).map(function (p) {
    var chain = [_toContainer(p, s)], cur = p;
    for (var i = 1; i < d; i++) {
      var up = _parentsRaw(cur, s)[0];
      if (!up) break;
      chain.push(_toContainer(up, s));
      cur = up;
    }
    return chain;
  });
}
/* #74 ⚖4 — инфо-связи задачи для бейджа-счётчика: [{ idReadable, phrase }].
   Данные уже в пуле (links фетчатся под иерархию) — ни одного нового запроса. */
function _infoLinks(iss, s) {
  var LR = _LR();
  if (!LR) return [];
  return LR.linkInfo(iss, LR.resolveLinkRoles(s).info);
}

/* R5 — id прямых родителей из плоских links (реюз _parentsRaw). [] если родителей нет. */
function _parentIdsOf(iss, s) {
  return _parentsRaw(iss, s).map(function (p) { return p.idReadable || p.id; }).filter(Boolean);
}

/* R5 фазы 2/3 — дотянуть цепочки родителей батчами по УНИКАЛЬНЫМ id (у 1000 задач обычно
   100–200 стори и десятки эпиков): один-два запроса `issue id: …` на уровень вместо
   квадратичного разворота siblings на каждую задачу пула. Мутирует task.parentChains
   (контракт buildBacklogVm: ближний→дальний, ≤2). Родитель, недоступный батчу (нет прав/
   удалён), остаётся id-only заглушкой из _parentChains. Ошибка фетча — reject (как падала
   и страница прежнего вложенного селектора: fail-loud, не тихая деградация дерева). */
const PARENT_BATCH = 100;   /* const — C1 arch-fitness */
function _fetchByIds(deps, ids, fields) {
  var chunks = [];
  for (var i = 0; i < ids.length; i += PARENT_BATCH) chunks.push(ids.slice(i, i + PARENT_BATCH));
  return Promise.all(chunks.map(function (chunk) {
    return deps.host.fetchYouTrack('issues', {
      query: { fields: fields, query: 'issue id: ' + chunk.join(', '), $top: chunk.length },
    }).then(function (raw) { return Array.isArray(raw) ? raw : []; });
  })).then(function (pages) {
    var by = {};
    pages.forEach(function (arr) { arr.forEach(function (p) { if (p && (p.idReadable || p.id)) by[p.idReadable || p.id] = p; }); });
    return by;
  });
}
function _loadParentChains(acc, deps) {
  var s = deps.settings || {};
  var pids = [], seen = {};
  acc.forEach(function (t) {
    (t._parentIds || []).forEach(function (id) { if (id && !seen[id]) { seen[id] = true; pids.push(id); } });
  });
  if (!pids.length) return Promise.resolve();
  return _fetchByIds(deps, pids, BACKLOG_PARENT_FIELDS).then(function (parents) {
    var gids = [], gseen = {};
    pids.forEach(function (pid) {
      var p = parents[pid]; if (!p) return;
      var gid = _parentIdsOf(p, s)[0];
      if (gid && !gseen[gid]) { gseen[gid] = true; gids.push(gid); }
    });
    var gp = gids.length ? _fetchByIds(deps, gids, BACKLOG_GRANDPARENT_FIELDS) : Promise.resolve({});
    return gp.then(function (grands) {
      acc.forEach(function (t) {
        /* #74 ⚖3 — цепочка на КАЖДОГО прямого родителя. Недобранный батчем родитель
           (нет прав/удалён) даёт id-only заглушку, а не выпадение ветки: иначе задача
           с родителями [A, недоступный] потеряла бы вторую ветку дерева. */
        var chains = [];
        (t._parentIds || []).forEach(function (pid) {
          var p = parents[pid];
          if (!p) { chains.push([{ issueId: pid, summary: '', kind: null }]); return; }
          var chain = [_toContainer(p, s)];
          var gid = _parentIdsOf(p, s)[0];
          if (gid) chain.push(grands[gid] ? _toContainer(grands[gid], s) : { issueId: gid, summary: '', kind: null });
          chains.push(chain);
        });
        t.parentChains = chains;
      });
      if (deps.diag) deps.diag('backlog parents: ' + pids.length + ' uniq, grandparents: ' + gids.length, 'info');
    });
  });
}

/* Сырой issue → task-контракт для pure buildBacklogVm. stateName = value.name (НЕ
   локализованное) — матчится с backlogZones[].state. */
function _mapPoolIssue(iss, deps) {
  var s = deps.settings || {};
  var stateCf = _cfByName(iss, s.fieldState || 'State');
  var stateVal = stateCf && stateCf.value;
  var roleList = deps.getActiveRoles ? deps.getActiveRoles(s) : (deps.roles || []);
  var estByRole = {}, factByRole = {};
  roleList.forEach(function (r) {
    estByRole[r.key] = _cfMinutes(iss, s[r.fieldEst]);
    factByRole[r.key] = _cfMinutes(iss, s[r.fieldFact]);
  });
  return {
    issueId: iss.idReadable || iss.id,
    idReadable: iss.idReadable || iss.id,
    summary: (iss.summary && iss.summary.trim()) || '',
    stateName: (stateVal && stateVal.name) || '',
    isResolved: !!(stateVal && stateVal.isResolved),
    system: s.fieldSystem ? _cfPres(iss, s.fieldSystem) : null,
    priority: s.fieldPriority ? _cfPres(iss, s.fieldPriority) : null,
    /* #3 — канон priority (value.name) для сортировки по приоритету (presentation локализован). */
    priorityName: s.fieldPriority ? _cfName(iss, s.fieldPriority) : null,
    tags: (iss.tags || []).map(function (t) { return t && t.name; }).filter(Boolean),
    estByRole: estByRole,
    factByRole: factByRole,
    parentChains: _parentChains(iss, s, 2), /* §5/#74 ⚖3 — цепочки as-is (R5: id-заглушка до батча) */
    _parentIds: _parentIdsOf(iss, s),        /* R5 — вход батч-дозагрузки _loadParentChains */
    infoLinks: _infoLinks(iss, s),           /* #74 ⚖4 — бейдж «связана с N» (данные уже в пуле) */
  };
}

/* §7 — id поля State из пула (project-fields id не отдаёт; берём из projectCustomField.field.id). */
function _stateFieldId(iss, s) {
  var cf = _cfByName(iss, (s && s.fieldState) || 'State');
  return (cf && cf.projectCustomField && cf.projectCustomField.field && cf.projectCustomField.field.id) || '';
}

/* §7 carry-over (E2) — обогатить пул историей входа в текущее состояние. Activities API
   (как Гант #20), chunks по 25 ПАРАЛЛЕЛЬНО. reverse:true → первая запись на issue =
   свежайшая смена состояния: _sinceTs (когда вошёл), _prevState (откуда). Эвристика
   «Перенос/Продолжение» (vs дата старта спринта) — pure (vm). Cap по размеру пула (перф);
   нет id поля State → пропуск (детект ненадёжен без fieldId). Best-effort: ошибка чанка не
   роняет загрузку (бейджа просто не будет). */
/* const — C1 arch-fitness: var/let = module-state; эти иммутабельны (как ASSIST_FIELDS). */
const MAX_CARRYOVER_POOL = 300, CARRYOVER_CHUNK = 25;
/* R5 — ширина раунда параллельной пагинации пула (аудит §1: батчи по 3–4 страницы). */
const PARALLEL_PAGES = 3;
function _loadCarryover(acc, deps, stateFieldId) {
  if (!acc.length || !stateFieldId || acc.length > MAX_CARRYOVER_POOL) {
    if (acc.length > MAX_CARRYOVER_POOL && deps.diag) deps.diag('carryover: пул ' + acc.length + ' > ' + MAX_CARRYOVER_POOL + ' — пропуск (перф)', 'info');
    return Promise.resolve();
  }
  var byId = {}; acc.forEach(function (t) { byId[t.idReadable] = t; });
  var ids = acc.map(function (t) { return t.idReadable; }), chunks = [];
  for (var i = 0; i < ids.length; i += CARRYOVER_CHUNK) chunks.push(ids.slice(i, i + CARRYOVER_CHUNK));
  return Promise.all(chunks.map(function (chunk) {
    return deps.host.fetchYouTrack('activities', { query: {
      categories: 'CustomFieldCategory',
      issueQuery: 'issue id: ' + chunk.join(', '),
      fields: 'timestamp,target(idReadable),field(id),added(name),removed(name,localizedName)',
      reverse: 'true', $top: 300,
    } }).then(function (acts) {
      if (!Array.isArray(acts)) return;
      acts.forEach(function (act) {
        if (!act || !act.target) return;
        var t = byId[act.target.idReadable];
        if (!t || t._sinceTs != null) return;                 // первая (свежайшая) — оставляем
        if (((act.field && act.field.id) || '') !== stateFieldId) return;
        var removedArr = Array.isArray(act.removed) ? act.removed : (act.removed ? [act.removed] : []);
        var rv = removedArr[0] || null;
        t._sinceTs = act.timestamp || null;
        t._prevState = rv ? (rv.name || rv.localizedName || '') : '';
      });
    }).catch(function (e) { if (deps.diag) deps.diag('carryover chunk err: ' + (e && e.message ? e.message : e), 'warn'); });
  }));
}

/* #polish — множество idReadable задач, состоящих в СОСТАВЕ любого спринта: текущий состав
   (roleItems) ∪ все снимки истории (ssp_history). Из стейта, БЕЗ доп. фетча (история и
   roleItems уже загружены ядром). null-proto lookup. Best-effort: нет аксессора → пустой set. */
function _inSprintIdSet(deps) {
  var set = Object.create(null);
  var st = (deps && deps.state) || {};
  var hist = (typeof st.getHistory === 'function' && st.getHistory()) || [];
  for (var i = 0; i < hist.length; i++) {
    var items = hist[i] && hist[i].items;
    if (Array.isArray(items)) for (var j = 0; j < items.length; j++) { var id = items[j] && items[j].issueId; if (id) set[id] = true; }
  }
  var ri = (typeof st.getRoleItems === 'function' && st.getRoleItems()) || {};
  for (var rk in ri) {
    if (!Object.prototype.hasOwnProperty.call(ri, rk) || !Array.isArray(ri[rk])) continue;
    for (var k = 0; k < ri[rk].length; k++) { var id2 = ri[rk][k] && ri[rk][k].issueId; if (id2) set[id2] = true; }
  }
  return set;
}

/* Постранично выгрести пул (cap maxBacklogTotal), смапить, положить в transient _backlogPool.
   Возвращает Promise<{ count, capped }>; ошибка → reject (вызывающий ловит). */
function loadBacklogPool(deps) {
  /* #21-fix — изоляция проекта обязательна: без resolved-ключа НЕ шлём кросс-проектный
     запрос (раньше тянул задачи по всем доступным проектам). Пустой пул + diag. */
  if (!_activeProj(deps)) {
    if (deps.diag) deps.diag('loadBacklogPool: активный проект не определён — пул не загружаем (изоляция)', 'warn');
    deps.state.setBacklogPool([]);
    return Promise.resolve({ count: 0, capped: false, noProject: true });
  }
  var query = _buildPoolQuery(deps);
  var page = deps.backlogPage || 50;
  var cap = deps.maxBacklogTotal || 1000;
  var acc = [], skip = 0, capped = false, stateFieldId = '';
  /* R5 — страницы раундами по PARALLEL_PAGES параллельно (было 20 последовательных
     round-trip'ов по 50). Конец выборки = первая неполная страница (детерминизм порядка
     между страницами даёт sort by: created asc в query); хвост раунда за ней игнорируем. */
  function fetchPage(atSkip) {
    return deps.host.fetchYouTrack('issues', {
      query: { fields: BACKLOG_ISSUE_FIELDS, query: query, $skip: atSkip, $top: page },
    }).then(function (issues) { return Array.isArray(issues) ? issues : []; });
  }
  function round() {
    if (acc.length >= cap) { capped = true; return Promise.resolve(); }
    var skips = [];
    for (var i = 0; i < PARALLEL_PAGES; i++) skips.push(skip + i * page);
    return Promise.all(skips.map(fetchPage)).then(function (pages) {
      var short = false;
      for (var pi = 0; pi < pages.length && !short; pi++) {
        pages[pi].forEach(function (iss) {
          if (!stateFieldId) stateFieldId = _stateFieldId(iss, deps.settings);
          acc.push(_mapPoolIssue(iss, deps));
        });
        if (pages[pi].length < page) short = true;
      }
      skip += PARALLEL_PAGES * page;
      if (short) return undefined;
      return round();
    });
  }
  return round()
    .then(function () {
      if (acc.length > cap) { acc = acc.slice(0, cap); capped = true; }   /* раунд мог перебрать кап — обрезаем к прежнему контракту */
      return _loadParentChains(acc, deps);                                /* R5 фазы 2/3 — цепочки родителей батчами */
    })
    .then(function () { return _loadCarryover(acc, deps, stateFieldId); })   /* §7 — обогащение историей */
    .then(function () {
      var inSet = _inSprintIdSet(deps);   /* #polish — пометить задачи уже в составе любого спринта */
      acc.forEach(function (t) { if (inSet[t.idReadable]) t._inSprint = true; });
      deps.state.setBacklogPool(acc);
      if (capped && deps.diag) deps.diag('loadBacklogPool: capped at ' + cap + ' (' + acc.length + ' loaded)', 'warn');
      return { count: acc.length, capped: capped };
    });
}

var _api = {
  _poolStates: _poolStates,
  _buildPoolQuery: _buildPoolQuery,
  _backlogAssist: _backlogAssist,
  computeUnmappedStates: computeUnmappedStates,
  _mapPoolIssue: _mapPoolIssue,
  _parentIdsOf: _parentIdsOf,             /* test-only — парити матчера родителей с release-view (#69 строка 28, #74) */
  loadBacklogPool: loadBacklogPool,
};

if (typeof window !== 'undefined') {
  try { window.__SSP_BACKLOG_LOADER = _api; } catch (_) { /* sandboxed write may throw */ }
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = _api;
}
