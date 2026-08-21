'use strict';
// Task-pick cluster (Phase 4 #32 / #33) extracted from widgets/main/src/core.js (Tier C).
// Browser bridge: window.__SSP_PICK. Golden-tested in tests/golden/pick.golden.test.js
// (query/scope matrix, issue-meta mapping, assist contract, paged search, load-all incl.
// cap branch, add-selected item structure, modal spec + onAdd/onClose contracts).
//
// Faithful extraction — bodies mirror the IIFE originals 1:1 modulo state access. The
// monolith keeps thin delegators (building deps per call via _pickDeps); pick cache state
// (_pickAllResults / _pickQueryFingerprint / _currentPickRole / _selectedIds /
// _pickAllInFlight) STAYS in the monolith behind deps.state accessors. Injected deps:
//   t, toast, diag                          — i18n/UI services
//   ctx, settings, currentUser, sprint, roleItems — live state references at call time
//   host                                    — YT host API (fetchYouTrack)
//   pickPage, maxPickTotal, inc, ytBase, draftVersion, baseRevHash — constants/config
//   getRoleItemsArr, apiPost, openModal, roleLabel, markDirty, draftSet — services
//   renderRoleComposition, updateRoleRemaining, refreshRoleEstimates — render hooks
//   pickAssist/pickSearch/pickLoadAll/pickAddSelected — monolith delegators for modal
//     props (late binding: every callback invocation rebuilds deps, как в оригинале)
//   state                                   — get/set аксессоры кэш-стейта подбора

/* v5.0.3 → Phase 4 — построение query + fingerprint; rawQ передаётся из React-компонента
   (DOM-инпут pickQuery удалён вместе с #pickOverlay). */
function _buildPickQuery(rawQ, deps) {
  var q = (rawQ || '').trim();
  /* Скоуп — активный проект (надёжный ключ; ctx.project пусто в global/2026.1 → раньше
     подбор искал по всем проектам). Виджет однопроектный — кросс-проектного подбора нет. */
  var projectId = deps.activeProjectKey
    || (deps.ctx && deps.ctx.project ? (deps.ctx.project.shortName || deps.ctx.project.id) : null);
  var fullQuery = q;
  if (projectId && q.toLowerCase().indexOf('project:') < 0) {
    fullQuery = 'project: ' + projectId + (q ? ' ' + q : '');
  }
  return { fullQuery: fullQuery, fingerprint: fullQuery + '|' + (projectId || '') };
}

/* #33 — скоуп поиска. Два независимых канала (не пересекаются, не трогают каретку):
     folders   → контекст подсказок search/assist (значения статусов/полей под проект)
     projectId → префикс выборки issues (через _buildPickQuery)
   Оба — активный проект (надёжный id/ключ; ctx.project пусто в global/2026.1). Виджет
   однопроектный: кросс-проектного подбора нет (data-слой принимает folders:[…] на будущее). */
function _buildPickScope(deps) {
  var pid = deps.activeProjectId || (deps.ctx && deps.ctx.project && deps.ctx.project.id) || null;
  var pkey = deps.activeProjectKey
    || (deps.ctx && deps.ctx.project ? (deps.ctx.project.shortName || deps.ctx.project.id) : null);
  return {
    /* $type:'Project' обязателен — search/assist без дискриминатора IssueFolder
       отвечает 500 InstantiationException (проверено live-probe на стенде, #33). */
    folders:   pid ? [{ $type: 'Project', id: pid }] : [],
    projectId: pkey
  };
}

/* #33 — data-source подсказок для Ring QueryAssist. Мост к нативному YT endpoint
   POST /api/search/assist: на каждый ввод/движение каретки отдаёт подсказки с
   позициями достройки и диапазонами совпадений (автокомплит + подсветка + синтаксис
   YouTrack «из коробки»). Контракт возврата 1:1 с QueryAssistResponse Ring UI.
   folders — отдельным полем тела (скоуп подсказок под проект), query/caret не трогаем.
   Ошибка/недоступность assist → пустые подсказки (поле и список продолжают работать). */
var ASSIST_FIELDS = '$type,id,suggestions($type,caret,completionStart,completionEnd,' +
                    'matchingStart,matchingEnd,description,group,icon,option,prefix,suffix)';
function _pickAssist(req, deps) {
  var query = (req && req.query) || '';
  var caret = (req && typeof req.caret === 'number') ? req.caret : query.length;
  var scope = _buildPickScope(deps);
  var body = { query: query, caret: caret, ignoreUnresolvedSetting: true };
  if (scope.folders && scope.folders.length) body.folders = scope.folders;
  return deps.host.fetchYouTrack('search/assist', {
    method: 'POST',
    query: { fields: ASSIST_FIELDS },
    body: body,
    headers: { 'Content-Type': 'application/json' }
  }).then(function (res) {
    return { query: query, caret: caret, suggestions: (res && res.suggestions) || [] };
  }).catch(function (err) {
    deps.diag('_pickAssist: search/assist failed — ' + (err && err.message ? err.message : err), 'warn');
    return { query: query, caret: caret, suggestions: [] };
  });
}

/* v5.0.3 — преобразование сырого issue из YouTrack-API в meta-объект для UI/кэша */
function _mapIssueMeta(iss, deps) {
  var cfs = iss.customFields || [];
  function cfValPres(names) {
    if (!names || !names.length) return null;
    for (var ni = 0; ni < names.length; ni++) {
      var target = names[ni]; if (!target) continue;
      var f = null;
      for (var ci = 0; ci < cfs.length; ci++) {
        var cf = cfs[ci];
        var fn = (cf.projectCustomField && cf.projectCustomField.field && cf.projectCustomField.field.name) || cf.name || '';
        if (fn === target) { f = cf; break; }
      }
      if (f && f.value !== null && f.value !== undefined) {
        var v = f.value;
        if (typeof v === 'string') return v;
        if (v && v.localizedName) return v.localizedName;
        if (v && v.presentation)  return v.presentation;
        if (v && v.name)          return v.name;
      }
    }
    return null;
  }
  var stateField    = deps.settings && deps.settings.fieldState            || null;
  var priorityField = deps.settings && deps.settings.fieldPriority         || null;
  var xpField       = deps.settings && deps.settings.fieldXPriority        || null;
  var systemField   = deps.settings && deps.settings.fieldSystem           || null;
  /* v1.8.0 D130 — Etap В.2 — external ticket ID field. */
  var extTicketField = deps.settings && deps.settings.fieldExternalTicketId || null;
  return {
    id:               iss.id,
    idReadable:       iss.idReadable || iss.id,
    summary:          (iss.summary && iss.summary.trim()) || null,
    state:          { name: cfValPres(stateField ? [stateField, 'State','Состояние'] : ['State','Состояние']) || '—' },
    priority:       cfValPres(priorityField  ? [priorityField,'Priority','Приоритет'] : ['Priority','Приоритет']),
    xpriority:      cfValPres(xpField        ? [xpField,'Сквозной приоритет'] : ['Сквозной приоритет']),
    system:         systemField    ? cfValPres([systemField])    : null,
    externalTicketId: extTicketField ? cfValPres([extTicketField]) : null,
  };
}

/* Phase 4 — data-layer для pickPicker: одна страница → {items, hasMore}.
   Поиск НЕ переписан (#33 отдельно): тот же fetchYouTrack + _mapIssueMeta + кэш состояния
   подбора. isAdded вычисляется здесь (роль знает существующий состав). Ошибка → reject
   (компонент ловит). */
function _pickSearch(rawQ, page, deps) {
  var qInfo = _buildPickQuery(rawQ, deps);
  if (qInfo.fingerprint !== deps.state.getFingerprint()) {
    deps.state.setCache(new Map());
    deps.state.setFingerprint(qInfo.fingerprint);
  }
  var skip = (Math.max(1, page) - 1) * deps.pickPage;
  return deps.host.fetchYouTrack('issues', {
    query: {
      fields: 'id,idReadable,summary,customFields(name,projectCustomField(field(name)),value(name,localizedName,presentation,minutes,login))',
      query: qInfo.fullQuery,
      $skip: skip,
      $top: deps.pickPage + 1
    }
  }).then(function(issues) {
    if (!Array.isArray(issues) || !issues.length) return { items: [], hasMore: false };
    var hasMore = issues.length > deps.pickPage;
    if (hasMore) issues = issues.slice(0, deps.pickPage);
    var mapped = issues.map(function(it){ return _mapIssueMeta(it, deps); });
    mapped.forEach(function(it){ deps.state.getCache().set(it.idReadable, it); });
    var existing = new Set(deps.getRoleItemsArr(deps.state.getCurrentRole() || '').map(function(i){ return i.issueId; }));
    var items = mapped.map(function(it){
      return {
        idReadable: it.idReadable,
        isAdded: existing.has(it.idReadable),
        state: (it.state && it.state.name) ? it.state.name : '—',
        summary: it.summary || it.idReadable || '',
        priority: it.priority || ''
      };
    });
    return { items: items, hasMore: hasMore };
  });
}

/* v5.0.3 → Phase 4 — подгрузка ВСЕХ страниц текущего запроса для master «Выбрать все».
   Возвращает addable id'ы (за вычетом уже добавленных в роль) + capped. Тосты loading/
   loaded/limit/err — здесь (компонент держит только busy-флаг). Прерывается на maxPickTotal. */
function _pickLoadAll(rawQ, deps) {
  var T = deps.t, toast = deps.toast;
  var qInfo = _buildPickQuery(rawQ, deps);
  if (qInfo.fingerprint !== deps.state.getFingerprint()) {
    deps.state.setCache(new Map());
    deps.state.setFingerprint(qInfo.fingerprint);
  }
  toast(T('toastPickAllLoading'), 'info');
  var pageIdx = Math.ceil(deps.state.getCache().size / deps.pickPage) || 0;
  var capped = false;
  function loop() {
    if (deps.state.getCache().size >= deps.maxPickTotal) {
      capped = true;
      return Promise.resolve();
    }
    return deps.host.fetchYouTrack('issues', {
      query: {
        fields: 'id,idReadable,summary,customFields(name,projectCustomField(field(name)),value(name,localizedName,presentation,minutes,login))',
        query: qInfo.fullQuery,
        $skip: pageIdx * deps.pickPage,
        $top: deps.pickPage + 1
      }
    }).then(function(issues){
      if (!Array.isArray(issues) || !issues.length) return;
      var hasMore = issues.length > deps.pickPage;
      if (hasMore) issues = issues.slice(0, deps.pickPage);
      issues.map(function(it){ return _mapIssueMeta(it, deps); }).forEach(function(it){ deps.state.getCache().set(it.idReadable, it); });
      pageIdx++;
      if (hasMore) return loop();
    });
  }
  return loop().then(function(){
    var existing = new Set(deps.getRoleItemsArr(deps.state.getCurrentRole() || '').map(function(i){ return i.issueId; }));
    var ids = [];
    deps.state.getCache().forEach(function(_, id){ if (!existing.has(id)) ids.push(id); });
    if (capped) toast(T('toastPickAllLimit').replace('{n}', String(deps.maxPickTotal)), 'warn');
    else        toast(T('toastPickAllLoaded').replace('{n}', String(ids.length)), 'success');
    return { ids: ids, capped: capped };
  }).catch(function(err){
    toast(T('toastPickAllErr') + ': ' + (err && err.message ? err.message : err), 'error');
    throw err;
  });
}

/* Phase 4 — добавление выбранных задач в роль (рефактор бывшего addPickedBtn-листенера).
   selectedIds — массив issueId из компонента; мета берётся из кумулятивного кэша
   состояния подбора (заполнен _pickSearch/_pickLoadAll). Закрытие модалки — у вызывающего. */
function _pickAddSelected(rk, selectedIds, deps) {
  var T = deps.t, toast = deps.toast;
  if (!rk || !selectedIds || !selectedIds.length) { toast(T('toastPickAtLeastOne')); return; }
  var existing = new Set(deps.getRoleItemsArr(rk).map(function(i){ return i.issueId; }));
  var newIds = selectedIds.filter(function(id){ return !existing.has(id); });
  newIds.forEach(function(issueId) {
    /* мета из кумулятивного кэша всех загруженных страниц */
    var issue = deps.state.getCache().get(issueId);
    if (!issue) {
      deps.diag('_pickAddSelected: missing meta for ' + issueId + ' — using stub', 'err');
      toast(T('toastPickPageMetaLost'), 'warn');
      issue = { idReadable: issueId, summary: issueId, priority: '', state: { name: '' }, xpriority: '', system: '' };
    }
    /* v5.0.3 — НЕ кладём sprintId на item: backend whitelist (ALLOWED_ITEM_KEYS) его не
       содержит, validateItem отвергнет item целиком.
       v5.0.3 (5c) — дефолт INC_PLANNED (не PENDING): иначе валидация «нет активных задач». */
    var newItem = {
      issueId:  issueId,
      url:      deps.ytBase + '/issue/' + issueId,
      title:    issue && issue.summary    ? issue.summary    : issueId,
      priority: issue && issue.priority   ? issue.priority   : '',
      xpriority:issue && issue.xpriority  ? issue.xpriority  : '',
      state:    issue && issue.state      ? issue.state.name : '',
      system:   issue && issue.system     ? issue.system     : '',
      inclusionStatus: deps.inc.PLANNED,
      addedAt: Date.now(),
      addedBy: deps.currentUser ? deps.currentUser.login : null,
    };
    /* v1.8.0 D130 — Etap В.2 — externalTicketId если маппинг настроен. */
    if (deps.settings && deps.settings.fieldExternalTicketId && issue && issue.externalTicketId) {
      newItem.externalTicketId = issue.externalTicketId;
    }
    newItem['estimate_'+rk] = null;
    newItem['fact_'+rk]     = null;
    newItem['alloc_'+rk]    = null; // null → при рендере = дельта по умолчанию
    deps.getRoleItemsArr(rk).push(newItem);
  });
  var skipped = selectedIds.length - newIds.length;
  deps.state.setCache(new Map()); deps.state.setFingerprint(''); deps.state.setSelectedIds(new Set());
  if (newIds.length) {
    deps.markDirty('roleItems');
    deps.draftSet('roleItems', deps.roleItems);
    deps.draftSet('meta', { savedAt: Date.now(), version: deps.draftVersion, baseRevHash: deps.baseRevHash });
  }
  /* v5.0.3 — сохраняем _sprint вместе с roleItems (на свежем проекте sprintId не перегенерится). */
  deps.apiPost('sprint-data', { sprint: deps.sprint, roleItems: deps.roleItems }).then(function() {
    deps.renderRoleComposition(rk);
    deps.updateRoleRemaining(rk);
    toast(T('toastPickTasksDone')+': '+newIds.length+(skipped ? ' ('+T('toastDuplicates')+': '+skipped+')' : ''), 'success');
    if (newIds.length) deps.refreshRoleEstimates(rk);
  }).catch(function(e) {
    /* v3.2.1 — отказ persist'а был unhandled rejection: задачи уже в _roleItems/draft,
       сервер их не принял, а пользователь видел тишину вместо ошибки. rev_conflict
       тостится внутри apiPost. */
    var msg = (e && e.message) ? e.message : String(e);
    deps.diag('pick persist ERR: ' + msg, 'err');
    if (msg !== 'rev_conflict') { try { toast(T('toastError') + msg, 'err'); } catch (_) {} }
  });
}

/* Phase 4 — открытие модалки подбора (bespoke React pickPicker через openModal).
   Props-колбэки зовут монолитные делегаторы (deps.pickSearch и др.) — late binding:
   каждое срабатывание собирает свежие deps, как читали глобалы оригинальные тела. */
function openPickModal(rk, role, deps) {
  var T = deps.t;
  deps.state.setCurrentRole(rk);
  deps.state.setSelectedIds(new Set());
  deps.state.setCache(new Map()); deps.state.setFingerprint(''); deps.state.setAllInFlight(false);
  var h = deps.openModal({
    id: 'pick',
    type: 'selection',
    dialogClass: 'ssp-ring-modal--wide',
    title: T('pickModalTitle') + ' — ' + deps.roleLabel(role),
    body: { kind: 'component', name: 'pickPicker', props: {
      labels: {
        searchText:      T('btnFind'),
        placeholder:     T('phPickQuery'),
        emptyInitial:    T('emptyPickResults'),
        searching:       T('pickSearching'),
        notFound:        T('tasksNotFound'),
        errorPrefix:     T('pickError'),
        thState:         T('thState'),
        thTitle:         T('thTitle'),
        thPriority:      T('thPriority'),
        selectAllTitle:  T('titlePickAll'),
        alreadyInSprint: T('alreadyInSprint'),
        pageOf:          T('pageOf'),
        closeText:       T('btnClose'),
        addText:         T('btnAddPicked'),
      },
      onAssist:  function(req){ return deps.pickAssist(req); },
      onSearch:  function(q, page){ return deps.pickSearch(q, page); },
      onLoadAll: function(q){ return deps.pickLoadAll(q); },
      onAdd:     function(ids){ deps.pickAddSelected(rk, ids); h.close(); },
      onCancel:  function(){ h.close(); },
    }},
    buttons: [],
    dismissOnBackdrop: true,
    blockEscape: false,
    showCloseButton: true,
    onClose: function(){ deps.state.setCache(new Map()); deps.state.setFingerprint(''); deps.state.setSelectedIds(new Set()); },
  });
}

const api = {
  _buildPickQuery,
  _buildPickScope,
  _pickAssist,
  _mapIssueMeta,
  _pickSearch,
  _pickLoadAll,
  _pickAddSelected,
  openPickModal,
};

if (typeof window !== 'undefined') {
  try { window.__SSP_PICK = api; } catch (_) { /* sandboxed write may throw */ }
}

module.exports = api;
