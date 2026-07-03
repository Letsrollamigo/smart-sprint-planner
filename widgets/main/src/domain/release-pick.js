/* release-pick.js — #48 R1.4 подбор задач YouTrack в релиз (строго Ring UI).
   Переиспользует generic-компонент pickPicker (react/modal-bodies.jsx, registerBody), а
   слой поиска РЕПЛИЦИРОВАН здесь (fetchYouTrack('issues') + search/assist, скоуп активного
   проекта) — pick.js НЕ трогаем (golden/fork-identical; ADR-001 изоляция; ~40 строк
   дублирования search = осознанный трейд-офф, YAGNI на общий util до 3-го консюмера).

   R1.4a: выбор задач → добавление idReadable в release.issues (POST полного блоба) →
   состав на карточке. R1.4b (D-B «Перенос»): бесконфликтные добавляются сразу; задача,
   уже в другом АКТИВНОМ релизе (status ∉ {released,cancelled}), → модалка «Перенести»
   (вынуть из A + влить в B, ОДИН POST). Перенос из ЗАМОРОЖЕННОГО владельца заблокирован (G1),
   в закрытый/замороженный target добавление недоступно; State/маппинг перенос НЕ трогает.

   STATELESS (C1): только function/const. Star-topology (B1): чужих domain-мостов не зовёт —
   host/openModal/state/T приходят депом из core (_releaseDeps). Мост window.__SSP_RELEASE_PICK. */
'use strict';

const TERMINAL = { released: 1, cancelled: 1 };
const PAGE = 10, MAX_TOTAL = 1000;
const ASSIST_FIELDS = '$type,id,suggestions($type,caret,completionStart,completionEnd,matchingStart,matchingEnd,description,group,icon,option,prefix,suffix)';
const ISSUE_FIELDS = 'id,idReadable,summary,customFields(name,projectCustomField(field(name)),value(name,localizedName,presentation))';

function _buildQuery(rawQ, projectKey) {
  var q = (rawQ || '').trim();
  if (projectKey && q.toLowerCase().indexOf('project:') < 0) return 'project: ' + projectKey + (q ? ' ' + q : '');
  return q;
}

/* Ring QueryAssist data-source → нативный POST /api/search/assist (folders $type:Project обяз.). */
function _assist(deps, req) {
  var query = (req && req.query) || '';
  var caret = (req && typeof req.caret === 'number') ? req.caret : query.length;
  var host = deps.state.getHost(), pid = deps.activeProjectId;
  var body = { query: query, caret: caret, ignoreUnresolvedSetting: true };
  if (pid) body.folders = [{ $type: 'Project', id: pid }];
  if (!host) return Promise.resolve({ query: query, caret: caret, suggestions: [] });
  return host.fetchYouTrack('search/assist', {
    method: 'POST', query: { fields: ASSIST_FIELDS }, body: body, headers: { 'Content-Type': 'application/json' }
  }).then(function (res) { return { query: query, caret: caret, suggestions: (res && res.suggestions) || [] }; })
    .catch(function () { return { query: query, caret: caret, suggestions: [] }; });
}

function _cfVal(iss, names) {
  var cfs = iss.customFields || [];
  for (var ni = 0; ni < names.length; ni++) {
    for (var ci = 0; ci < cfs.length; ci++) {
      var cf = cfs[ci];
      var fn = (cf.projectCustomField && cf.projectCustomField.field && cf.projectCustomField.field.name) || cf.name || '';
      if (fn === names[ni] && cf.value != null) {
        var v = cf.value;
        return (typeof v === 'string') ? v : (v.localizedName || v.presentation || v.name || null);
      }
    }
  }
  return null;
}

function _mapItem(iss, settings, existingSet) {
  var s = settings || {};
  var stateNames = s.fieldState ? [s.fieldState, 'State', 'Состояние'] : ['State', 'Состояние'];
  var prioNames = s.fieldPriority ? [s.fieldPriority, 'Priority', 'Приоритет'] : ['Priority', 'Приоритет'];
  var idr = iss.idReadable || iss.id;
  return {
    idReadable: idr, isAdded: existingSet.has(idr),
    state: _cfVal(iss, stateNames) || '—',
    summary: (iss.summary && iss.summary.trim()) || idr,
    priority: _cfVal(iss, prioNames) || '',
  };
}

function _search(deps, rawQ, page, existingSet) {
  var host = deps.state.getHost();
  if (!host) return Promise.resolve({ items: [], hasMore: false });
  var settings = deps.state.getSettings();
  var full = _buildQuery(rawQ, deps.activeProjectKey);
  return host.fetchYouTrack('issues', { query: { fields: ISSUE_FIELDS, query: full, $skip: (Math.max(1, page) - 1) * PAGE, $top: PAGE + 1 } })
    .then(function (issues) {
      if (!Array.isArray(issues) || !issues.length) return { items: [], hasMore: false };
      var hasMore = issues.length > PAGE;
      if (hasMore) issues = issues.slice(0, PAGE);
      return { items: issues.map(function (it) { return _mapItem(it, settings, existingSet); }), hasMore: hasMore };
    });
}

function _loadAll(deps, rawQ, existingSet) {
  var host = deps.state.getHost();
  if (!host) return Promise.resolve({ ids: [], capped: false });
  var full = _buildQuery(rawQ, deps.activeProjectKey);
  var ids = [], pageIdx = 0, capped = false;
  function loop() {
    if (ids.length >= MAX_TOTAL) { capped = true; return Promise.resolve(); }
    return host.fetchYouTrack('issues', { query: { fields: 'idReadable', query: full, $skip: pageIdx * PAGE, $top: PAGE + 1 } })
      .then(function (issues) {
        if (!Array.isArray(issues) || !issues.length) return;
        var hasMore = issues.length > PAGE;
        if (hasMore) issues = issues.slice(0, PAGE);
        issues.forEach(function (it) { var idr = it.idReadable || it.id; if (idr && !existingSet.has(idr)) ids.push(idr); });
        pageIdx++;
        if (hasMore) return loop();
      });
  }
  return loop().then(function () { return { ids: ids, capped: capped }; });
}

/* Индекс issueId → активный релиз-владелец {id,name,frozen} (кроме целевого B; закрытые не
   владеют — closed = слепок, не эксклюзив). null-прото (id == toString/__proto__ не коллизит). */
function _ownerIndex(releases, targetId) {
  var idx = Object.create(null);
  (releases || []).forEach(function (r) {
    if (!r || r.id === targetId || TERMINAL[r.status]) return;
    (r.issues || []).forEach(function (iid) {
      if (!idx[iid]) idx[iid] = { id: r.id, name: r.name || r.id, frozen: !!r.freezeLocked };
    });
  });
  return idx;
}

function _stamp(deps) {
  var me = (deps.state.getCurrentUser && deps.state.getCurrentUser()) || {};
  return { by: me.login || '', at: Date.now() };
}

/* union addIds в состав (дедуп, порядок сохраняется). */
function _merge(existing, addIds) {
  var seen = Object.create(null), out = (existing || []).slice();
  out.forEach(function (i) { seen[i] = 1; });
  (addIds || []).forEach(function (iid) { if (!seen[iid]) { seen[iid] = 1; out.push(iid); } });
  return out;
}

/* POST полного блоба { releases:[…] } → reload стора + rerender. done(ok). */
function _commit(deps, next, done) {
  deps.apiPost('releases', { releases: next }).then(function (resp) {
    if (resp && resp.success) {
      deps.state.release.setReleases(Array.isArray(resp.releases) ? resp.releases : next);
      /* reload (не sync rerender): подтягивает названия новых задач состава через _fetchTitles,
         иначе они пусты до рефреша страницы. Fallback — rerender (test-env без reload-депа). */
      if (typeof deps.reload === 'function') deps.reload('planned');
      else if (typeof deps.rerender === 'function') deps.rerender();
      if (done) done(true);
    } else {
      deps.toast(deps.T('relPickerLoadError'), 'err');
      deps.diag('release issues write failed: ' + (resp && resp.reason), 'err');
      if (done) done(false);
    }
  }).catch(function (e) {
    deps.diag('release issues write err: ' + e, 'err');
    deps.toast(deps.T('relPickerLoadError'), 'err');
    if (done) done(false);
  });
}

/* Разбор выбранного: free (нигде не заняты) vs collisions (в другом активном релизе). */
function _partition(releases, targetId, addedIds) {
  var owners = _ownerIndex(releases, targetId);
  var freeIds = [], collisions = [];
  (addedIds || []).forEach(function (iid) {
    var o = owners[iid];
    if (o) collisions.push({ id: iid, ownerId: o.id, ownerName: o.name, ownerFrozen: o.frozen });
    else freeIds.push(iid);
  });
  return { freeIds: freeIds, collisions: collisions };
}

/* onAdd: free → добавить сразу (POST); collisions → модалка «Перенести» (D-B). */
function _onAddIssues(deps, releaseId, addedIds, closeModal) {
  var releases = deps.state.release.getReleases() || [];
  var rec = releases.filter(function (r) { return r.id === releaseId; })[0];
  if (!rec) { if (closeModal) closeModal(); return; }
  var part = _partition(releases, releaseId, addedIds);
  if (part.freeIds.length) {
    var st = _stamp(deps);
    var next = releases.map(function (r) {
      return r.id === releaseId ? Object.assign({}, r, { issues: _merge(r.issues, part.freeIds), updatedBy: st.by, updatedAt: st.at }) : r;
    });
    _commit(deps, next, function (ok) {
      if (!ok) return;                              // ошибка — оставить пикер открытым для повтора
      /* #55 — догонка: добавленные задачи получают тег текущего статуса релиза. */
      if (typeof deps.onIssuesAdded === 'function') deps.onIssuesAdded(releaseId, part.freeIds.slice());
      if (closeModal) closeModal();
      if (part.collisions.length) _openTransferDialog(deps, releaseId, part.collisions);
    });
  } else if (part.collisions.length) {
    if (closeModal) closeModal();
    _openTransferDialog(deps, releaseId, part.collisions);
  } else if (closeModal) {
    closeModal();
  }
}

/* Модалка коллизий D-B: список задач с релизом-владельцем + «Перенести» (Ring lines-confirm).
   Из ЗАМОРОЖЕННОГО владельца перенос заблокирован (G1) — такие задачи серым, без переноса. */
function _openTransferDialog(deps, releaseId, collisions) {
  var T = deps.T;
  var rec = (deps.state.release.getReleases() || []).filter(function (r) { return r.id === releaseId; })[0];
  if (!rec) return;
  var transferable = collisions.filter(function (c) { return !c.ownerFrozen; });
  var blocked = collisions.filter(function (c) { return c.ownerFrozen; });

  var lines = [{ text: T('relTransferPrompt').replace('{name}', rec.name || rec.id) }];
  transferable.forEach(function (c) {
    lines.push({ text: '• ' + c.id + ' — ' + T('relTransferFrom').replace('{name}', c.ownerName) });
  });
  if (blocked.length) {
    lines.push({ text: T('relTransferFrozenNote'), style: { marginTop: '8px' } });
    blocked.forEach(function (c) {
      lines.push({ text: '• ' + c.id + ' — ' + T('relTransferFrom').replace('{name}', c.ownerName), style: { opacity: 0.5 } });
    });
  }

  var buttons = [{ id: 'cancel', text: T('btnCancel'), variant: 'secondary', onClick: function (h) { h.close(); } }];
  if (transferable.length) {
    buttons.push({ id: 'transfer', text: T('relBtnTransfer'), variant: 'primary', onClick: function (h) {
      h.close(); _doTransfer(deps, releaseId, transferable);
    } });
  }
  deps.openModal({ id: 'release-transfer', type: 'confirm', title: T('relTransferTitle'),
    body: { kind: 'lines', lines: lines }, buttons: buttons });
}

/* Перенос: вынуть moveIds из релизов-владельцев + влить в целевой — ОДИН POST полного блоба.
   Нативный State задач/маппинг НЕ трогаются (G1) — меняется только принадлежность. */
function _doTransfer(deps, releaseId, transferable) {
  var releases = deps.state.release.getReleases() || [];
  var moveIds = transferable.map(function (c) { return c.id; });
  var moveSet = Object.create(null); moveIds.forEach(function (i) { moveSet[i] = 1; });
  var fromOwners = Object.create(null); transferable.forEach(function (c) { fromOwners[c.ownerId] = 1; });
  var st = _stamp(deps);
  var next = releases.map(function (r) {
    if (r.id === releaseId) return Object.assign({}, r, { issues: _merge(r.issues, moveIds), updatedBy: st.by, updatedAt: st.at });
    if (fromOwners[r.id]) return Object.assign({}, r, { issues: (r.issues || []).filter(function (iid) { return !moveSet[iid]; }), updatedBy: st.by, updatedAt: st.at });
    return r;
  });
  _commit(deps, next, function (ok) {
    if (!ok) return;
    deps.toast(deps.T('relTransferDone').replace('{n}', String(moveIds.length)), 'success');
    /* #55 — перенос: тег статуса релиза-владельца снимается, целевого — ставится
       (статусы релизов переносом не меняются → порядок с setReleases безразличен). */
    if (typeof deps.onIssuesTransferred === 'function') deps.onIssuesTransferred(releaseId, transferable);
  });
}

function openReleasePickModal(deps, releaseId) {
  var rec = (deps.state.release.getReleases() || []).filter(function (r) { return r.id === releaseId; })[0];
  if (!rec) return;
  if (TERMINAL[rec.status] || rec.freezeLocked) {   // закрытый/замороженный target — состав неизменяем (G1)
    deps.toast(deps.T('relTransferTargetLocked'), 'warn');
    return;
  }
  var existingSet = new Set(rec.issues || []);
  var T = deps.T;
  var handle = deps.openModal({
    id: 'release-pick', type: 'selection', dialogClass: 'ssp-ring-modal--wide',
    title: T('relAddIssuesTitle') + (rec.name ? ' — ' + rec.name : ''),
    body: { kind: 'component', name: 'pickPicker', props: {
      labels: {
        searchText: T('btnFind'), placeholder: T('phPickQuery'), emptyInitial: T('emptyPickResults'),
        searching: T('pickSearching'), notFound: T('tasksNotFound'), errorPrefix: T('pickError'),
        thState: T('thState'), thTitle: T('thTitle'), thPriority: T('thPriority'),
        selectAllTitle: T('titlePickAll'), alreadyInSprint: T('relPickAlready'),
        pageOf: T('pageOf'), closeText: T('btnClose'), addText: T('btnAddPicked'),
      },
      onAssist: function (req) { return _assist(deps, req); },
      onSearch: function (q, page) { return _search(deps, q, page, existingSet); },
      onLoadAll: function (q) { return _loadAll(deps, q, existingSet); },
      onAdd: function (ids) { _onAddIssues(deps, releaseId, ids, function () { if (handle && handle.close) handle.close(); }); },
      onCancel: function () { if (handle && handle.close) handle.close(); },
    }},
    buttons: [], dismissOnBackdrop: true, blockEscape: false, showCloseButton: true,
  });
}

const api = { openReleasePickModal: openReleasePickModal };

if (typeof window !== 'undefined') {
  try { window.__SSP_RELEASE_PICK = api; } catch (_) { /* sandboxed write may throw */ }
}

module.exports = api;
