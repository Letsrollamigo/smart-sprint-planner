/* release-controller.js — #48 R1.3 действия релиз-менеджмента (создание; удаление — R1.3b).
   Domain-модуль (ADR-001): оркеструет открытие модалки создания (react/release-create.jsx,
   registerBody('releaseCreate')) и запись через POST /releases. Мост window.__SSP_RELEASE_CTRL.

   STATELESS (C1): только function/const; стейт RM — в release-store.js (deps.state.release.*).
   Star-topology (B1): не зовёт чужих domain-мостов — openModal/apiPost/fetchYouTrack/T/rerender
   приходят депом из core (_releaseDeps). Представители — union членов групп-кандидатов
   (frontend-direct fetchYouTrack('groups/{id}/users'), транзитив по докам YT; ponytail —
   при 403 у не-админа промоутить в backend-прокси). */
'use strict';

/* 'YYYY-MM-DD' → epoch-ms (UTC-полночь) | null. */
function _ymdToMs(s) {
  if (!s || typeof s !== 'string') return null;
  var ms = Date.parse(s + 'T00:00:00Z');
  return isFinite(ms) ? ms : null;
}

function _genId() {
  return 'rel-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
}

/* epoch-ms (UTC-полночь) → локальная Date с теми же Y/M/D (форма читает fmtYmd по локали,
   поэтому строим из UTC-компонент, иначе off-by-one у отрицательных tz). null → null. */
function _msToLocalDate(ms) {
  if (typeof ms !== 'number' || !isFinite(ms)) return null;
  var d = new Date(ms);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/* Union членов групп-кандидатов → [{value:login, label:name}] (дедуп по login). */
function _loadGroupUsers(deps, groupIds) {
  var host = deps.state.getHost && deps.state.getHost();
  if (!host || typeof host.fetchYouTrack !== 'function' || !Array.isArray(groupIds) || !groupIds.length) {
    return Promise.resolve([]);
  }
  var jobs = groupIds.map(function (gid) {
    return host.fetchYouTrack('groups/' + encodeURIComponent(gid) + '/users', {
      query: { fields: 'login,fullName', $top: 1000 }
    }).then(function (raw) { return Array.isArray(raw) ? raw : []; }).catch(function () { return null; });
  });
  return Promise.all(jobs).then(function (results) {
    if (results.some(function (r) { return r === null; })) throw new Error('group-users load failed');
    var seen = Object.create(null), out = []; // null-прото: логин == toString/__proto__ не коллизит
    results.forEach(function (users) {
      users.forEach(function (u) {
        if (u && u.login && !seen[u.login]) { seen[u.login] = 1; out.push({ value: u.login, label: u.fullName || u.login }); }
      });
    });
    out.sort(function (a, b) { return a.label.localeCompare(b.label); });
    return out;
  });
}

/* Загрузка кандидатов ОДНОЙ роли независимо (fail-closed только этой роли, не обеих). */
function _loadRole(deps, groups) {
  if (!groups.length) return Promise.resolve({ options: [], noGroups: true, loadError: false });
  return _loadGroupUsers(deps, groups)
    .then(function (opts) { return { options: opts, noGroups: false, loadError: false }; })
    .catch(function (e) { deps.diag('release candidates load err: ' + e, 'err'); return { options: [], noGroups: false, loadError: true }; });
}

function _loadCandidates(deps) {
  var s = deps.state.getSettings() || {};
  var mgrGroups = Array.isArray(s.releaseCandidateManagerGroups) ? s.releaseCandidateManagerGroups : [];
  var engGroups = Array.isArray(s.releaseCandidateEngineerGroups) ? s.releaseCandidateEngineerGroups : [];
  return Promise.all([_loadRole(deps, mgrGroups), _loadRole(deps, engGroups)]).then(function (r) {
    return {
      managerOptions: r[0].options, engineerOptions: r[1].options,
      managerNoGroups: r[0].noGroups, engineerNoGroups: r[1].noGroups,
      managerLoadError: r[0].loadError, engineerLoadError: r[1].loadError,
    };
  });
}

function _labels(deps) {
  var T = deps.T;
  return {
    name: T('relFieldName'), planDate: T('relFieldPlanDate'), freezeDate: T('relFieldFreezeDate'),
    kind: T('relKindLabel'), kindRelease: T('relKindRelease'), kindHotfix: T('relKindHotfix'),
    source: T('relSrcLabel'), srcInternal: T('relSrcInternal'), srcVendor: T('relSrcVendor'),
    manager: T('relFieldManager'), engineer: T('relFieldEngineer'),
    patchNote: T('relFieldPatchnote'), notes: T('relFieldNotes'),
    create: T('relBtnCreate'), cancel: T('btnCancel'), notSelected: T('phNotSelected'), selectDate: T('phNotSelected'),
    hintFreeze: T('relHintFreezeRule'), hintManager: T('relHintManagerDefault'), hintEngineer: T('relHintEngineerRequired'),
    valNameRequired: T('relValNameRequired'), valFreezeAfterPlan: T('relValFreezeAfterPlan'),
    pickerNoGroups: T('relPickerNoGroups'), pickerLoadError: T('relPickerLoadError'),
  };
}

/* R4 (US-R4-02) — уведомление об авто-архиве (бэкенд вернул archived>0 в ответе POST):
   старейшие закрытые уехали в спойлер «Архив» истории — данные не теряются молча. */
function _noteArchived(deps, r) {
  if (r && r.success && r.archived > 0) deps.toast(deps.T('relArchivedToast').replace('{n}', String(r.archived)), 'warn');
}

/* Сборка записи из payload формы + POST полного блоба { releases:[…] } → reload. */
function _doCreate(deps, payload, closeModal) {
  var me = (deps.state.getCurrentUser && deps.state.getCurrentUser()) || {};
  var now = Date.now();
  var roleReps = {};
  if (payload.manager) roleReps.manager = payload.manager;
  if (payload.engineer) roleReps.engineer = payload.engineer;
  var record = {
    id: _genId(),
    name: payload.name,
    kind: payload.kind, source: payload.source, status: 'planned',
    plannedDate: _ymdToMs(payload.planDate), freezeDate: _ymdToMs(payload.freezeDate), freezeLocked: false,
    patchNote: payload.patchNote || '', notes: payload.notes || '',
    roleReps: roleReps, issues: [],
    createdBy: me.login || '', createdAt: now, updatedBy: me.login || '', updatedAt: now,
    pluginVersion: deps.appVersion || '',
  };
  var next = (deps.state.release.getReleases() || []).concat([record]);
  deps.apiPost('releases', { releases: next }).then(function (r) {
    if (r && r.success) {
      deps.state.release.setReleases(Array.isArray(r.releases) ? r.releases : next);
      if (typeof closeModal === 'function') closeModal();
      deps.toast(deps.T('relBtnCreate'), 'success');
      _noteArchived(deps, r);
      if (typeof deps.rerender === 'function') deps.rerender();
    } else {
      deps.toast(deps.T('relPickerLoadError'), 'err'); // generic write-error toast (R2 уточнит reason-коды)
      deps.diag('release create failed: ' + (r && r.reason), 'err');
    }
  }).catch(function (e) { deps.diag('release create err: ' + e, 'err'); deps.toast(deps.T('relPickerLoadError'), 'err'); });
}

function openCreateDialog(deps) {
  _loadCandidates(deps).then(function (cand) {
    var me = (deps.state.getCurrentUser && deps.state.getCurrentUser()) || {};
    var handle = deps.openModal({
      id: 'release-create',
      title: deps.T('relNewTitle'),
      dialogClass: 'ssp-ring-modal--release', // 520px — 2-колоночная форма без оверфлоу

      body: { kind: 'component', name: 'releaseCreate', props: {
        labels: _labels(deps),
        managerOptions: cand.managerOptions, engineerOptions: cand.engineerOptions,
        managerNoGroups: cand.managerNoGroups, engineerNoGroups: cand.engineerNoGroups,
        managerLoadError: cand.managerLoadError, engineerLoadError: cand.engineerLoadError,
        defaultManager: me.login || '',
        onCreate: function (payload) { _doCreate(deps, payload, function () { if (handle && handle.close) handle.close(); }); },
        onCancel: function () { if (handle && handle.close) handle.close(); },
      } },
      buttons: [], /* форма рисует свой footer */
    });
  });
}

/* R1.5a — обновление записи: .map-замена в блобе (id/status/issues/freezeLocked/snapshot/
   createdBy/createdAt НЕ трогаем — только редактируемые поля + updatedBy/At). (US-R1-10) */
function _doUpdate(deps, releaseId, payload, closeModal) {
  var me = (deps.state.getCurrentUser && deps.state.getCurrentUser()) || {};
  var roleReps = {};
  if (payload.manager) roleReps.manager = payload.manager;
  if (payload.engineer) roleReps.engineer = payload.engineer;
  var next = (deps.state.release.getReleases() || []).map(function (r) {
    if (r.id !== releaseId) return r;
    var m = {}; for (var k in r) if (Object.prototype.hasOwnProperty.call(r, k)) m[k] = r[k];
    m.name = payload.name; m.kind = payload.kind; m.source = payload.source;
    m.plannedDate = _ymdToMs(payload.planDate); m.freezeDate = _ymdToMs(payload.freezeDate);
    m.patchNote = payload.patchNote || ''; m.notes = payload.notes || '';
    m.roleReps = roleReps; m.updatedBy = me.login || ''; m.updatedAt = Date.now();
    return m;
  });
  deps.apiPost('releases', { releases: next }).then(function (r) {
    if (r && r.success) {
      deps.state.release.setReleases(Array.isArray(r.releases) ? r.releases : next);
      if (typeof closeModal === 'function') closeModal();
      deps.toast(deps.T('relSaveBtn'), 'success');
      _noteArchived(deps, r);
      if (typeof deps.rerender === 'function') deps.rerender();
    } else {
      deps.toast(deps.T('relPickerLoadError'), 'err');
      deps.diag('release update failed: ' + (r && r.reason), 'err');
    }
  }).catch(function (e) { deps.diag('release update err: ' + e, 'err'); deps.toast(deps.T('relPickerLoadError'), 'err'); });
}

/* Гарантирует, что назначенный login присутствует в options (осиротевший представитель G3 —
   вне текущего пула кандидатов; без этого Select молча сбросил бы значение при сохранении). */
function _ensureRepOption(options, login, repNames) {
  if (!login || options.some(function (o) { return o.value === login; })) return options;
  return options.concat([{ value: login, label: (repNames && repNames[login]) || login }]);
}

function openEditDialog(deps, releaseId) {
  var rec = (deps.state.release.getReleases() || []).filter(function (r) { return r.id === releaseId; })[0];
  if (!rec) return;
  if (rec.status === 'released' || rec.status === 'cancelled') return; // терминальные (история) — read-only
  _loadCandidates(deps).then(function (cand) {
    var reps = rec.roleReps || {};
    var repNames = (deps.state.release.getRepNames && deps.state.release.getRepNames()) || {};
    var mgrOpts = _ensureRepOption(cand.managerOptions, reps.manager, repNames);
    var engOpts = _ensureRepOption(cand.engineerOptions, reps.engineer, repNames);
    var handle = deps.openModal({
      id: 'release-edit',
      title: deps.T('relEditTitle'),
      dialogClass: 'ssp-ring-modal--release',
      body: { kind: 'component', name: 'releaseCreate', props: {
        labels: _labels(deps), submitLabel: deps.T('relSaveBtn'),
        managerOptions: mgrOpts, engineerOptions: engOpts,
        managerNoGroups: cand.managerNoGroups, engineerNoGroups: cand.engineerNoGroups,
        managerLoadError: cand.managerLoadError, engineerLoadError: cand.engineerLoadError,
        initial: {
          name: rec.name || '', kind: rec.kind || 'release', source: rec.source || 'internal',
          planDate: _msToLocalDate(rec.plannedDate), freezeDate: _msToLocalDate(rec.freezeDate),
          manager: reps.manager || '', engineer: reps.engineer || '',
          patchNote: rec.patchNote || '', notes: rec.notes || '',
        },
        onCreate: function (payload) { _doUpdate(deps, releaseId, payload, function () { if (handle && handle.close) handle.close(); }); },
        onCancel: function () { if (handle && handle.close) handle.close(); },
      } },
      buttons: [],
    });
  });
}

/* R1.3b — удаление незакрытого релиза: запись убирается из блоба → POST. (US-R1-09) */
function _doDelete(deps, releaseId) {
  var next = (deps.state.release.getReleases() || []).filter(function (r) { return r.id !== releaseId; });
  deps.apiPost('releases', { releases: next }).then(function (r) {
    if (r && r.success) {
      deps.state.release.setReleases(Array.isArray(r.releases) ? r.releases : next);
      deps.toast(deps.T('relDeleteDone'), 'success');
      _noteArchived(deps, r);
      if (typeof deps.rerender === 'function') deps.rerender();
    } else {
      deps.toast(deps.T('relPickerLoadError'), 'err');
      deps.diag('release delete failed: ' + (r && r.reason), 'err');
    }
  }).catch(function (e) { deps.diag('release delete err: ' + e, 'err'); deps.toast(deps.T('relPickerLoadError'), 'err'); });
}

function openDeleteDialog(deps, releaseId) {
  var rec = (deps.state.release.getReleases() || []).filter(function (r) { return r.id === releaseId; })[0];
  if (!rec) return;
  if (rec.status === 'released' || rec.status === 'cancelled') return; // терминальные (история) не удаляются — только архив R4
  var T = deps.T;
  deps.openModal({
    id: 'release-delete', type: 'destructive', title: T('relDeleteTitle'),
    body: { kind: 'text', text: T('relDeleteConfirm').replace('{name}', rec.name || rec.id) },
    buttons: [
      { id: 'cancel', text: T('btnCancel'), variant: 'secondary', onClick: function (h) { h.close(); } },
      { id: 'del', text: T('btnYesDelete'), variant: 'danger', onClick: function (h) { h.close(); _doDelete(deps, releaseId); } },
    ],
  });
}

/* ─── R2.1 смена статуса (US-R2-01/02, машина US-00-02) ─────────────────────────
   Линейный ход planned→prep→work→released; cancelled из любого нетерминального.
   released/cancelled — терминальные: закрытие → buildSnapshot → уход в историю (D-A, необратимо). */
const _STATUS_ORDER = ['planned', 'prep', 'work', 'released'];
const _TERMINAL_ST = { released: 1, cancelled: 1 };
function _nextStatus(s) { var i = _STATUS_ORDER.indexOf(s); return (i >= 0 && i < _STATUS_ORDER.length - 1) ? _STATUS_ORDER[i + 1] : null; }
function _statusLabels(T) { return { planned: T('relStatusPlanned'), prep: T('relStatusPrep'), work: T('relStatusWork'), released: T('relStatusReleased'), cancelled: T('relStatusCancelled') }; }

/* .map-замена одной записи (копия own-props + патч). */
function _patchRelease(deps, releaseId, patch) {
  var me = (deps.state.getCurrentUser && deps.state.getCurrentUser()) || {};
  return (deps.state.release.getReleases() || []).map(function (r) {
    if (r.id !== releaseId) return r;
    var m = {}; for (var k in r) if (Object.prototype.hasOwnProperty.call(r, k)) m[k] = r[k];
    for (var p in patch) if (Object.prototype.hasOwnProperty.call(patch, p)) m[p] = patch[p];
    m.updatedBy = me.login || ''; m.updatedAt = Date.now();
    return m;
  });
}

function _postReleases(deps, next, okToast, modes) {
  deps.apiPost('releases', { releases: next }).then(function (r) {
    if (r && r.success) {
      deps.state.release.setReleases(Array.isArray(r.releases) ? r.releases : next);
      if (okToast) deps.toast(okToast, 'success');
      _noteArchived(deps, r); // R4 — закрытие со слепком: самый вероятный триггер порога
      if (typeof deps.reload === 'function') (modes || ['planned']).forEach(function (m) { deps.reload(m); });
      else if (typeof deps.rerender === 'function') deps.rerender();
    } else {
      deps.toast(deps.T('relPickerLoadError'), 'err');
      deps.diag('release status write failed: ' + (r && r.reason), 'err');
    }
  }).catch(function (e) { deps.diag('release status err: ' + e, 'err'); deps.toast(deps.T('relPickerLoadError'), 'err'); });
}

/* Перевод в нетерминальный статус (planned→prep, prep→work) — только поле status. */
function _advanceStatus(deps, releaseId, newStatus) {
  _postReleases(deps, _patchRelease(deps, releaseId, { status: newStatus }), deps.T('relStatusChanged'), ['planned']);
}

/* Закрытие релиза (released|cancelled): buildSnapshot → status+snapshot → POST → уход в историю. */
function _closeRelease(deps, releaseId, terminalStatus) {
  var rec = (deps.state.release.getReleases() || []).filter(function (r) { return r.id === releaseId; })[0];
  if (!rec) return;
  var build = (typeof deps.buildSnapshot === 'function') ? deps.buildSnapshot(rec) : Promise.resolve(null);
  Promise.resolve(build).then(function (snap) {
    var patch = { status: terminalStatus };
    if (snap) { snap.closedStatus = terminalStatus; patch.snapshot = snap; } // слепок собран ДО патча статуса — иначе внутри старый r.status
    _postReleases(deps, _patchRelease(deps, releaseId, patch), deps.T('relReleaseClosed'), ['planned', 'history']);
  }).catch(function (e) { deps.diag('release close err: ' + e, 'err'); deps.toast(deps.T('relPickerLoadError'), 'err'); });
}

/* Подтверждение закрытия (снимок + необратимость D-A). */
function _confirmClose(deps, releaseId, terminalStatus) {
  var rec = (deps.state.release.getReleases() || []).filter(function (r) { return r.id === releaseId; })[0];
  if (!rec) return;
  var T = deps.T;
  var title = terminalStatus === 'released' ? T('relBtnRelease') : T('relCancelRelease');
  deps.openModal({
    id: 'release-close', type: (terminalStatus === 'cancelled' ? 'destructive' : 'confirm'), title: title,
    body: { kind: 'text', text: T('relConfirmClose').replace('{name}', rec.name || rec.id) },
    buttons: [
      { id: 'no', text: T('btnCancel'), variant: 'secondary', onClick: function (h) { h.close(); } },
      { id: 'yes', text: title, variant: (terminalStatus === 'cancelled' ? 'danger' : 'primary'), onClick: function (h) { h.close(); _closeRelease(deps, releaseId, terminalStatus); } },
    ],
  });
}

/* Меню «Сменить статус»: следующий линейный переход (или «Выпустить» на work→released) +
   «Отменить релиз» — только РМ (D-C, R2.4): РИ отмену не ставит, бэкенд это тоже гейтит. */
function openStatusMenu(deps, releaseId) {
  var rec = (deps.state.release.getReleases() || []).filter(function (r) { return r.id === releaseId; })[0];
  if (!rec || _TERMINAL_ST[rec.status]) return; // терминальные — read-only (в «Планируемых» их нет)
  var T = deps.T;
  var sl = _statusLabels(T);
  var nxt = _nextStatus(rec.status);
  var canManage = !!(deps.state.release.getPerms && deps.state.release.getPerms().canManage);
  var buttons = [];
  if (nxt && _TERMINAL_ST[nxt]) {
    buttons.push({ id: 'release', text: T('relBtnRelease'), variant: 'primary', onClick: function (h) { h.close(); _confirmClose(deps, releaseId, 'released'); } });
  } else if (nxt) {
    buttons.push({ id: 'advance', text: T('relStatusAdvanceTo').replace('{status}', sl[nxt] || nxt), variant: 'primary', onClick: function (h) { h.close(); _advanceStatus(deps, releaseId, nxt); } });
  }
  if (canManage) buttons.push({ id: 'cancel-release', text: T('relCancelRelease'), variant: 'danger', onClick: function (h) { h.close(); _confirmClose(deps, releaseId, 'cancelled'); } });
  buttons.push({ id: 'close', text: T('btnCancel'), variant: 'secondary', onClick: function (h) { h.close(); } });
  deps.openModal({
    id: 'release-status', type: 'selection', title: T('relStatusChange') + (rec.name ? ' — ' + rec.name : ''),
    body: { kind: 'text', text: (sl[rec.status] || rec.status) },
    buttons: buttons,
  });
}

/* ─── R2.2 фриз состава (US-R2-08/09; подсказка по виду — US-T-03) ─────────────
   freezeLocked=true → добавление/удаление задач недоступно (гейт уже в release-pick, G1);
   правка полей/дат/патчноута остаётся (US-R1-10). Разморозка — отдельное подтверждение. */
function toggleFreeze(deps, releaseId) {
  var rec = (deps.state.release.getReleases() || []).filter(function (r) { return r.id === releaseId; })[0];
  if (!rec) return;
  if (rec.status === 'released' || rec.status === 'cancelled') return; // терминальные — слепок, фриз не имеет смысла
  var T = deps.T;
  if (rec.freezeLocked) {
    deps.openModal({
      id: 'release-unfreeze', type: 'confirm', title: T('relActUnfreeze'),
      body: { kind: 'text', text: T('relUnfreezeConfirm').replace('{name}', rec.name || rec.id) },
      buttons: [
        { id: 'no', text: T('btnCancel'), variant: 'secondary', onClick: function (h) { h.close(); } },
        { id: 'yes', text: T('relActUnfreeze'), variant: 'primary', onClick: function (h) { h.close(); _postReleases(deps, _patchRelease(deps, releaseId, { freezeLocked: false }), T('relUnfreezeDone'), ['planned']); } },
      ],
    });
  } else {
    var hint = rec.kind === 'hotfix' ? T('relFreezeHintHotfix') : T('relFreezeHintRelease'); // US-T-03: информационно, не запрет
    deps.openModal({
      id: 'release-freeze', type: 'confirm', title: T('relActFreeze'),
      body: { kind: 'lines', lines: [
        { text: T('relFreezeConfirm').replace('{name}', rec.name || rec.id) },
        { text: hint, style: { color: 'var(--muted)', fontSize: '12px' } },
      ] },
      buttons: [
        { id: 'no', text: T('btnCancel'), variant: 'secondary', onClick: function (h) { h.close(); } },
        { id: 'yes', text: T('relActFreeze'), variant: 'primary', onClick: function (h) { h.close(); _postReleases(deps, _patchRelease(deps, releaseId, { freezeLocked: true }), T('relFreezeDone'), ['planned']); } },
      ],
    });
  }
}

/* ─── R2.3 маппинг статус→State (US-R2-03..07, D-F) ────────────────────────────
   Кнопка карточки «Обновить состояния задач» → предпросмотр по маппингу ТЕКУЩЕГО
   статуса релиза → массовое применение отмеченных в нативный YT State
   (POST /update-issue-field type:'state'). Молча не перетираем: рассинхрон и
   недостижимое целевое размечаются в предпросмотре ДО применения. */

/* Pure-сборка строк предпросмотра — детерминирована (golden-тест).
   target = mapping[status]; expected («что планер ставил прошлым шагом», гард D-F) =
   маппинг ближайшего ПРЕДЫДУЩЕГО статуса цепочки с непустым значением; нет такого
   (первый статус / маппинг частичен) → рассинхрон не размечаем.
   bundleValues=null → бандл State не загрузился: reachability не проверяем (graceful,
   отказ перехода поймает результат применения). Пометки по приоритету:
   unreachable (нет State в проекте, чекбокс заблокирован) > already (уже в целевом,
   снята) > desync (факт ≠ expected, отмечена+подсветка) > ok (отмечена). */
function buildPreviewRows(rec, mapping, issueData, bundleValues) {
  var m = (mapping && typeof mapping === 'object') ? mapping : {};
  var target = m[rec.status] || '';
  var expected = '';
  for (var i = _STATUS_ORDER.indexOf(rec.status) - 1; i >= 0; i--) {
    if (m[_STATUS_ORDER[i]]) { expected = m[_STATUS_ORDER[i]]; break; }
  }
  var reachable = !Array.isArray(bundleValues) || bundleValues.indexOf(target) >= 0;
  return ((rec && rec.issues) || []).map(function (id) {
    var d = (issueData && issueData[id]) || {};
    var cur = d.state || '';
    var mark = 'ok', checked = true, disabled = false;
    if (!reachable) { mark = 'unreachable'; checked = false; disabled = true; }
    else if (cur && cur === target) { mark = 'already'; checked = false; }
    else if (expected && cur !== expected) { mark = 'desync'; }
    return { id: id, title: d.summary || '', current: cur, target: target, mark: mark, checked: checked, disabled: disabled };
  });
}

/* Массовое/точечное применение (US-R2-05/06/07): per-issue POST, частичный успех
   сохраняется (изменённый State не откатывается). done({applied:[id], failed:[{id,error}]}) —
   упавшие остаются отмеченными в модалке для повтора. */
function _applyStates(deps, stateField, list, done) {
  var jobs = (list || []).map(function (row) {
    return deps.apiPost('update-issue-field', { issueId: row.id, fieldName: stateField, value: row.target, type: 'state' })
      .then(function (r) { return { id: row.id, ok: !!(r && r.success), error: (r && r.error) || 'write_failed' }; })
      .catch(function (e) { return { id: row.id, ok: false, error: String((e && e.message) || e) }; });
  });
  Promise.all(jobs).then(function (results) {
    var applied = [], failed = [];
    results.forEach(function (r) { if (r.ok) applied.push(r.id); else failed.push({ id: r.id, error: r.error }); });
    var T = deps.T;
    deps.toast(T('relPvResult').replace('{changed}', String(applied.length)).replace('{errors}', String(failed.length)),
      failed.length ? 'warn' : 'success');
    if (failed.length) deps.diag('release state apply failed: ' + failed.map(function (f) { return f.id + '=' + f.error; }).join(', '), 'err');
    if (typeof done === 'function') done({ applied: applied, failed: failed });
  });
}

function openStatePreview(deps, releaseId) {
  var rec = (deps.state.release.getReleases() || []).filter(function (r) { return r.id === releaseId; })[0];
  if (!rec || _TERMINAL_ST[rec.status]) return;
  if (!(rec.issues || []).length) return; // кнопка скрыта при пустом составе — guard
  var T = deps.T;
  var s = deps.state.getSettings() || {};
  var mapping = (s.releaseStatusStateMapping && typeof s.releaseStatusStateMapping === 'object') ? s.releaseStatusStateMapping : {};
  var sl = _statusLabels(T);
  var target = mapping[rec.status] || '';
  if (!target) { deps.toast(T('relPvNoMapping').replace('{status}', sl[rec.status] || rec.status), 'warn'); return; }
  var stateField = s.fieldState || 'State';
  Promise.all([
    deps.fetchIssueData(rec.issues),
    deps.apiGet('field-values?fieldName=' + encodeURIComponent(stateField)).catch(function () { return null; })
  ]).then(function (res) {
    var bundle = (res[1] && res[1].success && Array.isArray(res[1].values)) ? res[1].values : null;
    var rows = buildPreviewRows(rec, mapping, res[0] || {}, bundle);
    var handle = deps.openModal({
      id: 'release-state-preview', type: 'selection', dialogClass: 'ssp-ring-modal--wide',
      title: T('relPvTitle') + ' — ' + (rec.name || rec.id) + ' → «' + (sl[rec.status] || rec.status) + '»',
      body: { kind: 'component', name: 'releaseStatePreview', props: {
        labels: {
          mappingLine: T('relPvMappingLine').replace('{status}', sl[rec.status] || rec.status).replace('{state}', target),
          colTask: T('thTitle'), colCurrent: T('relPvColCurrent'), colTarget: T('relPvColTarget'), colMark: T('relPvColMark'),
          willApply: T('relPvWillApply'), desync: T('relPvDesync'), unreachable: T('relPvUnreachable'), already: T('relPvAlreadyTarget'),
          applyBtn: T('relPvApplyBtn'), errDetails: T('relPvErrDetails'), retry: T('relPvRetry'), cancel: T('btnCancel'),
        },
        rows: rows,
        stateOptions: bundle || [],  // per-row Select целевого (US-R2-06); пуст → колонка read-only
        onApply: function (list, done) { _applyStates(deps, stateField, list, done); },
        onCancel: function () { if (handle && handle.close) handle.close(); },
      } },
      buttons: [],
    });
  }).catch(function (e) { deps.diag('release state preview err: ' + e, 'err'); deps.toast(deps.T('relPickerLoadError'), 'err'); });
}

const api = { openCreateDialog: openCreateDialog, openEditDialog: openEditDialog, openDeleteDialog: openDeleteDialog, openStatusMenu: openStatusMenu, toggleFreeze: toggleFreeze, openStatePreview: openStatePreview, buildPreviewRows: buildPreviewRows };

if (typeof window !== 'undefined') {
  try { window.__SSP_RELEASE_CTRL = api; } catch (_) { /* sandboxed write may throw */ }
}

module.exports = api;
