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
