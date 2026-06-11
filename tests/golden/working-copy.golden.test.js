/**
 * Golden-master: стейт-машины — рабочие копии и ре-валидация.
 *
 * createWorkingDraftFromSnapshot / _commitWorkingCopy / computeRevHash /
 * computeBaseSnapshotHash + computeRequiredRevalidationLevel /
 * applyRevalidationLevel. Время заморожено → createdAt/updatedAt
 * детерминированы; uid — seeded.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { createHost } = require('./monolith-host');
const { checkJsonSnapshot } = require('./snap');
const fx = require('./fixtures/state');

function bootWithUser() {
  const host = createHost();
  fx.applyBaseState(host.gm);
  host.gm.set({ _currentUser: { login: 'gm_user_editor', fullName: 'GM Editor' } });
  return host;
}

test('golden: computeRevHash / computeBaseSnapshotHash на фикстуре', () => {
  const { gm } = bootWithUser();
  checkJsonSnapshot('rev-hashes', {
    revHash: gm.call('computeRevHash', gm.get('_sprint'), gm.get('_roleItems')),
    baseSnapshotHash0: gm.call('computeBaseSnapshotHash', gm.get('_history')[0]),
    baseSnapshotHash1: gm.call('computeBaseSnapshotHash', gm.get('_history')[1]),
  });
});

test('golden: createWorkingDraftFromSnapshot — структура драфта + флаг истории', () => {
  const { gm } = bootWithUser();
  const draft = gm.call('createWorkingDraftFromSnapshot', gm.get('_history')[0], 0);
  assert.ok(draft, 'draft must be created');
  /* editorTabToken — per-boot uid: вынесен из снимка отдельным полем-фактом наличия */
  const tokenPresent = typeof draft.editorTabToken === 'string' && draft.editorTabToken.length > 0;
  const snapDraft = JSON.parse(JSON.stringify(draft));
  delete snapDraft.editorTabToken;
  checkJsonSnapshot('working-draft-created', {
    draft: snapDraft,
    tokenPresent: tokenPresent,
    historyFlag: gm.get('_history')[0].hasWorkingCopy,
    draftRegistered: !!gm.get('_workingDrafts')[draft.key],
  });
});

test('golden: computeRequiredRevalidationLevel — сценарии diff', () => {
  const { gm } = bootWithUser();
  const snap = gm.get('_history')[0];
  const mk = () => JSON.parse(JSON.stringify(gm.call('createWorkingDraftFromSnapshot', snap, null)));

  const identical = mk();

  const allocChanged = mk();
  allocChanged.items[0].alloc_analysis = 720;

  const itemAdded = mk();
  itemAdded.items.push({
    issueId: 'GM-NEW', title: 'Новая задача', inclusionStatus: 'INC_PLANNED',
    estimate_analysis: 300, fact_analysis: 0, alloc_analysis: null,
  });

  const itemRemoved = mk();
  itemRemoved.items.pop();

  const resourceChanged = mk();
  resourceChanged.sprint.resourceAnalysis = 9999;

  const datesChanged = mk();
  datesChanged.sprint.dateEnd = fx.DATE_END + 86400000;

  checkJsonSnapshot('revalidation-levels', {
    identical: gm.call('computeRequiredRevalidationLevel', snap, identical),
    allocChanged: gm.call('computeRequiredRevalidationLevel', snap, allocChanged),
    itemAdded: gm.call('computeRequiredRevalidationLevel', snap, itemAdded),
    itemRemoved: gm.call('computeRequiredRevalidationLevel', snap, itemRemoved),
    resourceChanged: gm.call('computeRequiredRevalidationLevel', snap, resourceChanged),
    datesChanged: gm.call('computeRequiredRevalidationLevel', snap, datesChanged),
  });
});

test('golden: applyRevalidationLevel — матрица статус × уровень', () => {
  const { gm } = bootWithUser();
  const statuses = ['PLANNING', 'ALLOCATED', 'CONFIRMED', 'FINISHED'];
  const levels = ['none', 'soft', 'hard'];
  const out = {};
  for (const st of statuses) {
    out[st] = {};
    for (const lv of levels) {
      out[st][lv] = gm.call('applyRevalidationLevel', st, lv);
    }
  }
  checkJsonSnapshot('apply-revalidation-matrix', out);
});

test('golden: _commitWorkingCopy — коммит драфта в историю', () => {
  const { gm } = bootWithUser();
  const draft = gm.call('createWorkingDraftFromSnapshot', gm.get('_history')[0], 0);
  draft.items[0].alloc_analysis = 720;
  draft.updatedAt = draft.updatedAt + 60000;
  /* snapFromCurrent — по контракту call-site (saveRoleHistorySnapshot):
     свежий снимок текущего состояния с правками рабочей копии */
  const snapFromCurrent = JSON.parse(JSON.stringify(gm.get('_history')[0]));
  snapFromCurrent.items = JSON.parse(JSON.stringify(draft.items));
  gm.call('_commitWorkingCopy', 'analysis', 0, draft, snapFromCurrent);
  const rec = JSON.parse(JSON.stringify(gm.get('_history')[0]));
  checkJsonSnapshot('working-copy-committed', {
    record: rec,
    draftStillRegistered: !!gm.get('_workingDrafts')[draft.key],
  });
});

/* ── Добор Тира C: restore / resume / discard / saveRoleHistorySnapshot ──── */

const flush = () => new Promise((r) => setTimeout(r, 0));

/** Дата/время в тостах локализованы и TZ-зависимы → нормализуем цифры. */
function normToast(t) {
  return { msg: String(t.msg).replace(/[\d.,:\s]{6,}/g, '<ts>'), type: t.type };
}

test('golden: restoreDraftIfAny — матрица no-meta/version/dirty/stale/restore', () => {
  const { gm } = bootWithUser();
  const out = {};

  function run(label, draftObj, baseRevHash) {
    const calls = { toasts: [], cleaned: [] };
    gm.set({
      toast: function (msg, type) { calls.toasts.push(normToast({ msg: msg, type: type })); },
      _markClean: function (s) { calls.cleaned.push(s); },
      _draft: Object.assign({ meta: null, ui: null, sprint: null, roleItems: null, currentRole: null, dirty: null }, draftObj),
      _baseRevHash: baseRevHash || '',
      _sprint: fx.buildSprint(),
      _roleItems: fx.buildRoleItems(),
    });
    gm.call('restoreDraftIfAny');
    calls.sprintReplaced = gm.get('_sprint').name !== 'GM Sprint June 2026';
    out[label] = calls;
  }

  const ver = gm.get('DRAFT_VERSION');
  run('noMeta', {});
  run('versionMismatch', { meta: { savedAt: fx.DATE_START, version: 999, baseRevHash: 'X' } });
  run('noDirty', { meta: { savedAt: fx.DATE_START, version: ver, baseRevHash: 'X' }, dirty: {} });
  run('stale', {
    meta: { savedAt: fx.DATE_START, version: ver, baseRevHash: 'DRAFT-HASH' },
    dirty: { sprint: true },
    sprint: { name: 'stale sprint' },
  }, 'SERVER-HASH');
  run('restored', {
    meta: { savedAt: fx.DATE_START, version: ver, baseRevHash: 'SAME' },
    dirty: { sprint: true, roleItems: true, currentRole: true },
    sprint: Object.assign(fx.buildSprint(), { name: 'Draft sprint' }),
    roleItems: { analysis: [{ issueId: 'GM-D1', title: 'Из черновика', inclusionStatus: 'INC_PLANNED' }] },
    currentRole: { pp: { roleKey: 'devBack' }, gantt: { tasks: {} }, nkcKey: 'june' },
  }, 'SAME');

  out.restoredState = {
    sprintName: gm.get('_sprint').name,
    roleItems: gm.get('_roleItems'),
    currentRolePP: gm.get('_currentRolePP'),
    currentRoleNkcKey: gm.get('_currentRoleNkcKey'),
    restoreFlagReset: gm.get('_draftRestoreInProgress') === false,
  };
  checkJsonSnapshot('working-copy-restore-draft', out);
});

test('golden: resumeWorkingDraft — загрузка WC в активный стейт + изоляция других ролей', async () => {
  const { gm } = bootWithUser();
  const calls = { apiPost: [], renders: [], diag: [] };
  gm.set({
    apiPost: function (path, body) { calls.apiPost.push({ path: path, keys: Object.keys(body || {}) }); return Promise.resolve({ success: true }); },
    renderPlanningRoles: function () { calls.renders.push('planningRoles'); },
    renderWorkingCopyBanner: function () { calls.renders.push('wcBanner'); },
    renderRolePlannerHeader: function (rk) { calls.renders.push('rolePlannerHeader:' + rk); },
    renderRoleComposition: function (rk) { calls.renders.push('roleComposition:' + rk); },
    updateRoleRemaining: function (rk) { calls.renders.push('roleRemaining:' + rk); },
    renderHistory: function () { calls.renders.push('history'); },
  });

  const draft = gm.call('createWorkingDraftFromSnapshot', gm.get('_history')[0], 0);
  draft.items[0].alloc_analysis = 777;
  draft.sprint.name = 'WC renamed';

  gm.call('resumeWorkingDraft', draft.key, 0);
  await flush();

  const sprint = JSON.parse(JSON.stringify(gm.get('_sprint')));
  const roleItems = JSON.parse(JSON.stringify(gm.get('_roleItems')));
  checkJsonSnapshot('working-copy-resume', {
    activeKey: gm.get('_activeWorkingDraftKey'),
    sprint: {
      sprintId: sprint.sprintId, name: sprint.name, status: sprint.status,
      resourceAnalysis: sprint.resourceAnalysis,
      legacyFlagsGone: sprint.editingFromHistory === undefined && sprint.historyIdx === undefined,
    },
    analysisItems: roleItems.analysis,
    testingFromHistSnap: roleItems.testing.map(function (i) { return i.issueId; }),
    devBackIsolated: roleItems.devBack,
    devFrontIsolated: roleItems.devFront,
    uiExpanded: gm.get('_uiExpandedRoles').analysis === true,
    calls: calls,
  });

  /* отсутствие базового снимка → no-op (стейт не трогается) */
  gm.set({ _activeWorkingDraftKey: null, _workingDrafts: { orphan_x: { key: 'orphan_x', items: [] } } });
  gm.call('resumeWorkingDraft', 'orphan_x', 0);
  assert.equal(gm.get('_activeWorkingDraftKey'), null, 'missing base snap must be no-op');
});

test('golden: discardWorkingDraft — контракт confirm-модалки + эффекты сброса', async () => {
  const { gm } = bootWithUser();
  const calls = { modal: [], apiPost: [], apiGet: [], toasts: [], renders: [] };
  let modalCb = null;
  gm.set({
    showDiscardConfirmModal: function (key, cb) { calls.modal.push(key); modalCb = cb; },
    apiPost: function (path, body, query) { calls.apiPost.push({ path: path, action: query && query.action, key: query && query.key }); return Promise.resolve({ success: true }); },
    apiGet: function (path) {
      calls.apiGet.push(path);
      return Promise.resolve({ success: true, sprint: { sprintId: 'reloaded-sprint' }, roleItems: { analysis: [] }, orphanGanttIssues: ['GM-ORF'] });
    },
    hideWorkingCopyBanner: function () { calls.renders.push('hideWcBanner'); },
    renderPlannerRoles: function () { calls.renders.push('plannerRoles'); },
    renderHistory: function () { calls.renders.push('history'); },
    toast: function (msg, type) { calls.toasts.push(normToast({ msg: msg, type: type })); },
  });

  const draft = gm.call('createWorkingDraftFromSnapshot', gm.get('_history')[0], 0);
  gm.set({ _activeWorkingDraftKey: draft.key });

  gm.call('discardWorkingDraft', draft.key);
  modalCb(false); /* отмена в модалке → ничего не происходит */
  const afterCancel = {
    draftKept: !!gm.get('_workingDrafts')[draft.key],
    flagKept: gm.get('_history')[0].hasWorkingCopy === true,
  };

  modalCb(true); /* подтверждение → полный сброс */
  await flush();
  checkJsonSnapshot('working-copy-discard', {
    modalKeys: calls.modal,
    afterCancel: afterCancel,
    draftRemoved: !gm.get('_workingDrafts')[draft.key],
    histFlagCleared: gm.get('_history')[0].hasWorkingCopy === false,
    activeKeyCleared: gm.get('_activeWorkingDraftKey') === null,
    sprintReloaded: gm.get('_sprint').sprintId,
    orphansApplied: gm.get('_sprint')._orphanGanttIssues,
    calls: calls,
  });
});

test('golden: saveRoleHistorySnapshot — insert/preserve/validated + commit-flow + конфликт', async () => {
  const { gm } = bootWithUser();
  const calls = { apiPost: [], conflictModal: [], exportConflict: [], toasts: [] };
  gm.set({
    apiPost: function (path, body) { calls.apiPost.push(path); return Promise.resolve({ success: true }); },
    renderHistory: function () {},
    renderRoleComposition: function () {},
    renderWidgetHeader: function () {},
    hideWorkingCopyBanner: function () {},
    toast: function (msg, type) { calls.toasts.push(normToast({ msg: msg, type: type })); },
  });

  /* (i) insert нового снапшота: статус PLANNING, items per-role поля, перелимит devFront */
  await gm.call('saveRoleHistorySnapshot', 'devFront');
  const inserted = JSON.parse(JSON.stringify(gm.get('_history')[0]));

  /* (ii) preserve: существующий статус снапшота сохраняется при пере-сейве */
  gm.get('_history')[0].status = 'ALLOCATED';
  await gm.call('saveRoleHistorySnapshot', 'devFront');
  const preserved = { status: gm.get('_history')[0].status, histLen: gm.get('_history').length };

  /* (iii) wasValidated=true → CONFIRMED (per-role single source of truth, D134 О.1) */
  await gm.call('saveRoleHistorySnapshot', 'devFront', undefined, null, true);
  const validated = gm.get('_history')[0].status;

  /* (iv) commit-flow: активная WC на ключ активного спринта → _commitWorkingCopy */
  const histIdx = 0;
  const baseSnap = gm.get('_history')[histIdx];
  const draft = gm.call('createWorkingDraftFromSnapshot', baseSnap, histIdx);
  gm.set({ _activeWorkingDraftKey: draft.key });
  await gm.call('saveRoleHistorySnapshot', 'devFront');
  const committed = {
    draftRemoved: !gm.get('_workingDrafts')[draft.key],
    activeKeyCleared: gm.get('_activeWorkingDraftKey') === null,
    revisions: JSON.parse(JSON.stringify(gm.get('_history')[histIdx].revisions || [])),
    status: gm.get('_history')[histIdx].status,
  };

  /* (v) конфликт: hash базового снимка уехал → модалка; export и overwrite ветки */
  const draft2 = gm.call('createWorkingDraftFromSnapshot', gm.get('_history')[histIdx], histIdx);
  gm.set({ _activeWorkingDraftKey: draft2.key });
  gm.get('_history')[histIdx].items.push({ issueId: 'GM-EXT', title: 'Чужая правка', inclusionStatus: 'INC_PLANNED' });
  let decisionCb = null;
  gm.set({
    showWorkingCopyConflictModal: function (key, base, snap, cb) { calls.conflictModal.push(key); decisionCb = cb; },
    exportConflictToExcel: function (base, snap) { calls.exportConflict.push({ base: base.sprintId, snap: snap.sprintId }); },
  });
  await gm.call('saveRoleHistorySnapshot', 'devFront');
  const conflictDetected = { draftKept: !!gm.get('_workingDrafts')[draft2.key] };
  decisionCb('export'); /* экспорт различий — драфт остаётся */
  conflictDetected.exportKeepsDraft = !!gm.get('_workingDrafts')[draft2.key];
  decisionCb('overwrite'); /* перезапись — коммит */
  await flush();
  conflictDetected.overwriteCommits = !gm.get('_workingDrafts')[draft2.key];

  checkJsonSnapshot('working-copy-save-snapshot', {
    inserted: inserted,
    preserved: preserved,
    validated: validated,
    committed: committed,
    conflict: { modalKeys: calls.conflictModal, exportCalls: calls.exportConflict, flow: conflictDetected },
    toasts: calls.toasts,
  });
});
