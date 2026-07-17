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
    taskUrl: T('relFieldTaskUrl'),
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
    patchNote: payload.patchNote || '', notes: payload.notes || '', taskUrl: payload.taskUrl || '',
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
    m.patchNote = payload.patchNote || ''; m.notes = payload.notes || ''; m.taskUrl = payload.taskUrl || '';
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
          patchNote: rec.patchNote || '', notes: rec.notes || '', taskUrl: rec.taskUrl || '',
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

function _postReleases(deps, next, okToast, modes, onOk) {
  deps.apiPost('releases', { releases: next }).then(function (r) {
    if (r && r.success) {
      deps.state.release.setReleases(Array.isArray(r.releases) ? r.releases : next);
      if (okToast) deps.toast(okToast, 'success');
      _noteArchived(deps, r); // R4 — закрытие со слепком: самый вероятный триггер порога
      if (typeof onOk === 'function') onOk(); // #55 — авто-теги после успешного статус-write
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
  var rec = (deps.state.release.getReleases() || []).filter(function (r) { return r.id === releaseId; })[0];
  var prevStatus = rec ? rec.status : null;
  var issueIds = rec ? (rec.issues || []).slice() : [];
  _postReleases(deps, _patchRelease(deps, releaseId, { status: newStatus }), deps.T('relStatusChanged'), ['planned'],
    function () { _applyTags(deps, issueIds, prevStatus, newStatus); }); // #55
}

/* Закрытие релиза (released|cancelled): buildSnapshot → status+snapshot → POST → уход в историю. */
function _closeRelease(deps, releaseId, terminalStatus) {
  var rec = (deps.state.release.getReleases() || []).filter(function (r) { return r.id === releaseId; })[0];
  if (!rec) return;
  var build = (typeof deps.buildSnapshot === 'function') ? deps.buildSnapshot(rec) : Promise.resolve(null);
  Promise.resolve(build).then(function (snap) {
    var patch = { status: terminalStatus };
    if (snap) { snap.closedStatus = terminalStatus; patch.snapshot = snap; } // слепок собран ДО патча статуса — иначе внутри старый r.status
    var prevStatus = rec.status;
    var issueIds = (rec.issues || []).slice();
    _postReleases(deps, _patchRelease(deps, releaseId, patch), deps.T('relReleaseClosed'), ['planned', 'history'],
      function () { _applyTags(deps, issueIds, prevStatus, terminalStatus); }); // #55
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

/* v3.12.0 (P2-хвост v3.2.1) — массовые операции по задачам релиза идут чанками
   по 25 (образец — CARRYOVER_CHUNK backlog-loader), а не unbounded Promise-фанаутом:
   релиз на сотни задач не выстреливает сотни конкурентных запросов в YT. */
const APPLY_CHUNK = 25;

/* Последовательные чанки: внутри чанка — параллельно, между чанками — цепочка.
   Каждый job глотает свою ошибку сам (семантика частичного успеха не менялась). */
function _runChunked(items, jobFn) {
  var results = [];
  var p = Promise.resolve();
  for (var i = 0; i < items.length; i += APPLY_CHUNK) {
    (function (chunk) {
      p = p.then(function () {
        return Promise.all(chunk.map(jobFn)).then(function (rs) {
          results.push.apply(results, rs);
        });
      });
    })(items.slice(i, i + APPLY_CHUNK));
  }
  return p.then(function () { return results; });
}

/* Массовое/точечное применение (US-R2-05/06/07): per-issue POST, частичный успех
   сохраняется (изменённый State не откатывается). done({applied:[id], failed:[{id,error}]}) —
   упавшие остаются отмеченными в модалке для повтора. */
function _applyStates(deps, stateField, list, done) {
  _runChunked(list || [], function (row) {
    return deps.apiPost('update-issue-field', { issueId: row.id, fieldName: stateField, value: row.target, type: 'state' })
      .then(function (r) { return { id: row.id, ok: !!(r && r.success), error: (r && r.error) || 'write_failed' }; })
      .catch(function (e) { return { id: row.id, ok: false, error: String((e && e.message) || e) }; });
  }).then(function (results) {
    var applied = [], failed = [];
    results.forEach(function (r) { if (r.ok) applied.push(r.id); else failed.push({ id: r.id, error: r.error }); });
    var T = deps.T;
    deps.toast(T('relPvResult').replace('{changed}', String(applied.length)).replace('{errors}', String(failed.length)),
      failed.length ? 'warn' : 'success');
    if (failed.length) deps.diag('release state apply failed: ' + failed.map(function (f) { return f.id + '=' + f.error; }).join(', '), 'err');
    if (typeof done === 'function') done({ applied: applied, failed: failed });
  });
}

/* ═══ #55 — авто-теги по статусу релиза ═══════════════════════════════════════
   Маппинг settings.releaseTagMapping { статус → имя СУЩЕСТВУЮЩЕГО тега }. Применение —
   прямой официальный REST ОТ ИМЕНИ ЮЗЕРА (backend не участвует): честные права/атрибуция,
   консистентно с fanout-паттерном _applyStates. Тег предыдущего статуса снимается,
   нового — ставится (per-issue реконсиляция полного массива tags — см. _applyTagOps).
   Теги НЕ создаются (авто-созданный тег приватен владельцу — невидим команде);
   ненайденное имя → в отчёт отказов. */

/* pure: план операций для перехода prev→next по составу. prev=null — только простановка
   (догонка при добавлении задач в релиз). Равные теги → no-op. */
function buildTagOps(mapping, prevStatus, nextStatus, issueIds) {
  var m = (mapping && typeof mapping === 'object') ? mapping : {};
  var prevTag = (prevStatus && typeof m[prevStatus] === 'string' && m[prevStatus]) || null;
  var nextTag = (nextStatus && typeof m[nextStatus] === 'string' && m[nextStatus]) || null;
  var ops = [];
  (issueIds || []).forEach(function (id) {
    if (!id) return;
    if (prevTag && prevTag !== nextTag) ops.push({ issueId: id, action: 'remove', tag: prevTag });
    if (nextTag && nextTag !== prevTag) ops.push({ issueId: id, action: 'add', tag: nextTag });
  });
  return ops;
}

/* Исполнитель плана: резолв имя→id по видимым юзеру тегам инстанса, затем per-issue
   реконсиляция набора: GET текущих тегов → (current − removes + adds) → ОДИН POST
   issues/{id} {tags:[…]}. ⚠️ Метод DELETE через host.fetchYouTrack молча не выполняется
   (эмпирика стенда 2026-07-04: «успех» без удаления) — снятие тега возможно только
   полной заменой массива tags POST'ом. Ненайденное имя тега → ошибка соответствующей
   задачи (теги не создаём). */
function _applyTagOps(deps, ops) {
  if (!ops || !ops.length) return Promise.resolve(null);
  var host = deps.state.getHost();
  if (!host || typeof host.fetchYouTrack !== 'function') return Promise.resolve(null);
  return host.fetchYouTrack('tags', { query: { fields: 'id,name', '$top': 10000 } }).then(function (tags) {
    var idByName = Object.create(null);
    (tags || []).forEach(function (t) { if (t && t.name && !idByName[t.name]) idByName[t.name] = t.id; });
    /* план → per-issue дельта наборов */
    var byIssue = Object.create(null), unresolved = [];
    ops.forEach(function (op) {
      var tagId = idByName[op.tag];
      if (!tagId) { unresolved.push(op.issueId + ':' + op.tag); return; }
      var e = byIssue[op.issueId] || (byIssue[op.issueId] = { adds: {}, removes: {} });
      e[op.action === 'add' ? 'adds' : 'removes'][tagId] = 1;
    });
    /* v3.12.0 — per-issue реконсиляции чанками по APPLY_CHUNK (см. _runChunked). */
    return _runChunked(Object.keys(byIssue), function (iid) {
      var d = byIssue[iid];
      return Promise.resolve(host.fetchYouTrack('issues/' + iid + '/tags', { query: { fields: 'id', '$top': 500 } }))
        .then(function (cur) {
          var set = Object.create(null);
          (cur || []).forEach(function (t) { if (t && t.id) set[t.id] = 1; });
          var before = Object.keys(set).sort().join(',');
          Object.keys(d.removes).forEach(function (id) { delete set[id]; });
          Object.keys(d.adds).forEach(function (id) { set[id] = 1; });
          var after = Object.keys(set).sort();
          if (after.join(',') === before) return { ok: true, iid: iid }; // набор не изменился
          return Promise.resolve(host.fetchYouTrack('issues/' + iid, {
            method: 'POST', query: { fields: 'id' },
            body: { tags: after.map(function (id) { return { id: id }; }) }
          })).then(function () { return { ok: true, iid: iid }; });
        })
        .catch(function (e) { return { ok: false, iid: iid, error: String((e && e.message) || e) }; });
    }).then(function (results) { return { results: results, unresolved: unresolved }; });
  }).then(function (r) {
    if (!r) return null;
    var okN = 0, failed = [];
    r.results.forEach(function (x) { if (x.ok) okN++; else failed.push(x.iid + '=' + x.error); });
    var errN = failed.length + r.unresolved.length;
    deps.toast(deps.T('relTagsResult').replace('{n}', String(okN)).replace('{m}', String(errN)),
      errN ? 'warn' : 'success');
    if (failed.length) deps.diag('release tags apply failed: ' + failed.join(', '), 'err');
    if (r.unresolved.length) deps.diag('release tags: имя не найдено среди тегов инстанса: ' + r.unresolved.join(', '), 'err');
    return r;
  }).catch(function (e) { deps.diag('release tags err: ' + e, 'err'); return null; });
}

/* Смена статуса релиза: prev→next по всему составу. */
function _applyTags(deps, issueIds, prevStatus, nextStatus) {
  var s = deps.state.getSettings() || {};
  _applyTagOps(deps, buildTagOps(s.releaseTagMapping, prevStatus, nextStatus, issueIds));
}

/* Догонка (release-pick): добавленные в релиз задачи получают тег ТЕКУЩЕГО статуса. */
function applyTagsForIssues(deps, releaseId, issueIds) {
  var rec = (deps.state.release.getReleases() || []).filter(function (r) { return r.id === releaseId; })[0];
  if (!rec) return;
  _applyTags(deps, issueIds, null, rec.status);
}

/* Перенос (D-B): перенесённая задача теряет тег статуса релиза-владельца и получает
   тег статуса целевого. transferable = [{id, ownerId}] из release-pick. */
function applyTagsForTransfer(deps, releaseId, transferable) {
  var releases = deps.state.release.getReleases() || [];
  var statusById = Object.create(null);
  releases.forEach(function (r) { if (r && r.id) statusById[r.id] = r.status; });
  var target = statusById[releaseId] || null;
  var s = deps.state.getSettings() || {};
  var ops = [];
  (transferable || []).forEach(function (c) {
    if (!c || !c.id) return;
    ops = ops.concat(buildTagOps(s.releaseTagMapping, statusById[c.ownerId] || null, target, [c.id]));
  });
  _applyTagOps(deps, ops);
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

const api = { openCreateDialog: openCreateDialog, openEditDialog: openEditDialog, openDeleteDialog: openDeleteDialog, openStatusMenu: openStatusMenu, toggleFreeze: toggleFreeze, openStatePreview: openStatePreview, buildPreviewRows: buildPreviewRows, buildTagOps: buildTagOps, applyTagsForIssues: applyTagsForIssues, applyTagsForTransfer: applyTagsForTransfer };

if (typeof window !== 'undefined') {
  try { window.__SSP_RELEASE_CTRL = api; } catch (_) { /* sandboxed write may throw */ }
}

module.exports = api;
