/**
 * Golden-master: модель personalPlanning keyed-vs-single (#49, ДО рефактора «Вариант A»).
 *
 * Характеризует ТЕКУЩЕЕ поведение двух чисто-вызываемых сайтов in-memory кэша
 * `_sprint.personalPlanning`:
 *   • _getPersonalPlanningForCurrent (getPP) — канон-hit / fallback на кэш / miss;
 *   • saveCurrentRoleState — форма `_sprint.personalPlanning` после save + канон-запись
 *     истории + payload sprint-data POST.
 *
 * НЕ покрыто здесь (осознанно): syncWorkingDraftFromMemory приватен draft-store.js
 * (draft-сериализация → working-copy.golden матрицы restore/resume); saveRoleHistorySnapshot
 * уже зафиксирован working-copy-save-snapshot.snap; backend detectOrphanGanttIssues —
 * спека §2.3 (не экспортирован тест-only). См. Spec/PERSONALPLANNING_49_SPEC.md §5.
 *
 * ⚠️ После «Варианта A» эти снимки ЛЕГИТИМНО меняются (семантика, golden diff ≠ 0):
 *   - getPP fallback-ветка → null (bugfix: кэш мёртв/неверный shape, канон = источник правды);
 *   - saveCurrentRoleState: `_sprint.personalPlanning` больше не пишется single-объектом;
 *     payload sprint-data несёт keyed-map, derived из канона (buildPPMapFromCanon).
 * Регенерировать поимённо с ревью каждого diff (bugfix vs регресс) — спека §5/§9.
 */
'use strict';

const test = require('node:test');
const { createHost } = require('./monolith-host');
const { checkJsonSnapshot } = require('./snap');
const fx = require('./fixtures/state');

/** Классификатор формы PP-объекта/мапы — делает diff читаемым (single PP vs keyed-map ролей). */
function ppForm(pp) {
  if (pp == null) return { value: pp === undefined ? 'undefined' : 'null' };
  if (typeof pp !== 'object') return { value: String(pp) };
  const keys = Object.keys(pp).sort();
  /* single PP несёт resourcesByAssignee/taskAssignments (или legacy people) на верхнем уровне;
     keyed-map несёт ключи ролей, значения которых — PP-объекты. */
  const isSingle = 'resourcesByAssignee' in pp || 'taskAssignments' in pp || 'people' in pp;
  return {
    form: isSingle ? 'single' : 'keyed-map',
    topKeys: keys,
    taskAssignmentKeys: (pp.taskAssignments && typeof pp.taskAssignments === 'object')
      ? Object.keys(pp.taskAssignments).sort() : null,
  };
}

/** Recording-стаб apiPost: классифицирует форму personalPlanning в sprint-data / history payload. */
function stubApiPostPP(gm) {
  const log = [];
  gm.set({
    apiPost: function (path, body, query) {
      const entry = { path: path, query: query === undefined ? null : query };
      if (body && body.sprint && Object.prototype.hasOwnProperty.call(body.sprint, 'personalPlanning')) {
        entry.sprintPP = ppForm(body.sprint.personalPlanning);
      }
      if (body && Array.isArray(body.history)) {
        entry.historyPP = body.history.map(function (h) {
          return { sprintId: h.sprintId, pp: ppForm(h.personalPlanning) };
        });
      }
      log.push(entry);
      return Promise.resolve({ success: true });
    },
  });
  return log;
}

/** Минимальные draft/render-стабы, нужные делегатору saveCurrentRoleState. */
function stubSaveDeps(gm) {
  gm.set({
    _markDirty: function () {},
    _draftSaveDebounced: function () {},
    refreshDirtyIndicator: function () {},
    updateCurrentRoleTotals: function () {},
    _updateRoleAccordionStats: function () {},
    applyPersonalResourceToInputs: function () {},
  });
}

async function flush(n) { for (let i = 0; i < (n || 6); i++) await Promise.resolve(); }

/* ═══════════════════ _getPersonalPlanningForCurrent (getPP) ═══════════════════ */

test('golden: getPP — канон-hit / fallback на _sprint.personalPlanning / miss', () => {
  const { gm } = createHost();
  fx.applyBaseState(gm);

  /* (1) Канон-hit: per-role запись активного спринта присутствует в _history → берётся первой. */
  const canonRec = Object.assign(fx.buildCurrentRoleRec(), { personalPlanning: fx.buildCurrentRolePP() });
  gm.set({ _history: fx.buildHistory().concat([canonRec]) });
  const canonHit = gm.call('_getPersonalPlanningForCurrent', 'devBack');

  /* (2) Fallback: канон-записи роли нет (база _history = только gm-hist), но
     _sprint.personalPlanning = keyed-map {devBack:{…}} (legacy people-shape) → fallback-ветка. */
  gm.set({ _history: fx.buildHistory() });
  const fallback = gm.call('_getPersonalPlanningForCurrent', 'devBack');

  /* (3) Miss: ни канона, ни записи в кэше для роли. */
  const miss = gm.call('_getPersonalPlanningForCurrent', 'analysis');

  checkJsonSnapshot('pp-getpp-sources', {
    canonHit: { returned: canonHit, shape: ppForm(canonHit) },
    fallback: { returned: fallback, shape: ppForm(fallback) },
    miss: { returned: miss === null ? 'null' : miss },
  });
});

/* ═══════════════════ saveCurrentRoleState — форма PP при персисте ═══════════════════ */

test('golden: saveCurrentRoleState — форма _sprint.personalPlanning + канон + sprint-data payload', async () => {
  const { gm } = createHost();
  fx.applyBaseState(gm);
  fx.applyPeopleState(gm);
  /* Канон-запись активной роли в _history (иначе histRec не найдётся и канон-write не сработает). */
  const canonRec = Object.assign(fx.buildCurrentRoleRec(), { personalPlanning: {} });
  gm.set({ _history: fx.buildHistory().concat([canonRec]), _isEditor: true, _isAssigner: false });
  stubSaveDeps(gm);
  const api = stubApiPostPP(gm);

  /* До save: _sprint.personalPlanning = keyed-map {devBack:{…}} (из фикстуры buildSprint). */
  const beforePP = ppForm(gm.get('_sprint').personalPlanning);

  gm.call('saveCurrentRoleState');
  await flush();

  /* После save: _sprint.personalPlanning регрессирует в single (currentRolePP),
     канон-запись истории получает single-клон, sprint-data POST несёт ту же форму. */
  const afterPP = ppForm(gm.get('_sprint').personalPlanning);
  const canonAfter = ppForm(
    gm.get('_history').find(function (r) { return r.sprintId === fx.SPRINT_ID + '_devBack'; }).personalPlanning
  );

  checkJsonSnapshot('pp-savecurrentrole-forms', {
    beforeSprintPP: beforePP,
    afterSprintPP: afterPP,
    canonRecPP: canonAfter,
    apiLog: api,
  });
});
