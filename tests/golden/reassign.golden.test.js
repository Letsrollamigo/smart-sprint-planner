/**
 * Golden-master: reassign-контроллер (Фаза 5, зачистка «прочих» — слайс 7).
 *
 * Характеризация ДО выноса в reassign-controller.js (__SSP_REASSIGN_CTRL):
 *   • openReassignModal — сборка spec реассайн-модалки (опции из
 *     _currentRolePP.resourcesByAssignee + «Не назначен», current из
 *     taskAssignments), гард отсутствия _currentRolePP;
 *   • _applyReassign — мутация taskAssignments (assignee/assigneeName,
 *     инвалидация ganttColor), синк в _currentSprintRoleRec.personalPlanning
 *     и _sprint.personalPlanning (через isActiveSprintRecord), dirty-tracking,
 *     зов saveCurrentRoleState / updateIssueAssigneeField / renderGanttChart,
 *     синк таблицы «Люди» по видимости #planning-level-people, dirty-clear
 *     в следующем event-loop (setTimeout через управляемый планировщик);
 *   • onApply/onCancel модалки закрывают handle (наблюдаемо через recording
 *     close — _reassignModalHandle станет приватным модулю, через gm НЕ ассертим).
 *
 * Контракты — только через выживающие entry-points (урок слайса 3):
 * openReassignModal остаётся делегатором (потребители gantt-view + golden);
 * _applyReassign будет приватен модулю — характеризуется через spec.onApply.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { createHost } = require('./monolith-host');
const { checkJsonSnapshot } = require('./snap');
const fx = require('./fixtures/state');

/** Управляемый планировщик: очередь таймеров + ручной прогон (паттерн draft-store). */
function stubScheduler(window) {
  const timers = [];
  let seq = 0;
  window.setTimeout = function (fn, delay) {
    seq += 1;
    timers.push({ id: seq, fn: fn, delay: delay });
    return seq;
  };
  window.clearTimeout = function (id) {
    if (id == null) return;
    for (let i = 0; i < timers.length; i++) {
      if (timers[i].id === id) { timers.splice(i, 1); return; }
    }
  };
  return {
    timers: timers,
    delays: function () { return timers.map(function (t) { return t.delay; }); },
    runAll: function () { while (timers.length) { const t = timers.shift(); t.fn(); } },
  };
}

/** Перехват реассайн-модалки: лог spec'ов + наблюдаемый close() handle'а.
 *  openModal монолита читает window.__SSP_RING_MODAL.open в момент вызова. */
function recordModals(window) {
  const specs = [];
  const closeLog = [];
  const orig = window.__SSP_RING_MODAL;
  window.__SSP_RING_MODAL = {
    open: function (spec) {
      const idx = specs.push(spec) - 1;
      return { close: function () { closeLog.push(idx); } };
    },
    mountInline: orig.mountInline,
    close: orig.close,
  };
  return { specs: specs, closeLog: closeLog };
}

/** Recording-стабы deps _applyReassign (после выноса per-call deps-фабрика
 *  читает closure в момент вызова — стабы подхватываются). */
function stubReassignDeps(gm) {
  const log = { save: 0, assignee: [], gantt: 0, table: 0 };
  gm.set({
    saveCurrentRoleState: function () { log.save += 1; },
    updateIssueAssigneeField: function (id, login, rk) {
      log.assignee.push({ id: id, login: login === null ? '<null>' : login, rk: rk });
    },
    renderGanttChart: function () { log.gantt += 1; },
    renderCurrentRoleTaskTable: function () { log.table += 1; },
  });
  return log;
}

function recordDiag(gm) {
  const lines = [];
  gm.set({ diag: function (msg, level) { lines.push({ msg: String(msg), level: level || null }); } });
  return lines;
}

/* ───────────────────────── openReassignModal ───────────────────────── */

test('golden: openReassignModal — spec реассайн-модалки (опции + current + конфиг)', () => {
  const { gm, window } = createHost();
  fx.applyBaseState(gm);
  fx.applyPeopleState(gm);
  const modals = recordModals(window);

  gm.call('openReassignModal', 'GM-10');

  assert.strictEqual(modals.specs.length, 1, 'модалка открыта один раз');
  const spec = modals.specs[0];
  const props = spec.body.props;
  checkJsonSnapshot('reassign-open-spec', {
    id: spec.id,
    type: spec.type,
    title: spec.title,
    bodyKind: spec.body.kind,
    bodyName: spec.body.name,
    issueId: props.issueId,
    bodyText: props.bodyText,
    current: props.current,
    options: props.options,
    applyText: props.applyText,
    cancelText: props.cancelText,
    buttons: spec.buttons,
    dismissOnBackdrop: spec.dismissOnBackdrop,
    blockEscape: spec.blockEscape,
    showCloseButton: spec.showCloseButton,
  });
});

test('golden: openReassignModal — гард без _currentRolePP (diag warn, модалка не открыта)', () => {
  const { gm, window } = createHost();
  fx.applyBaseState(gm);
  gm.set({ _currentRolePP: null });
  const modals = recordModals(window);
  const diag = recordDiag(gm);

  gm.call('openReassignModal', 'GM-10');

  checkJsonSnapshot('reassign-open-guard-no-pp', {
    modalsOpened: modals.specs.length,
    diag: diag,
  });
});

/* ───────────────────────── _applyReassign (через onApply) ───────────── */

test('golden: onApply — переназначение на другого ассайни (мутация + синк + deps)', () => {
  const { gm, window } = createHost();
  fx.applyBaseState(gm);
  fx.applyPeopleState(gm);
  const modals = recordModals(window);
  const deps = stubReassignDeps(gm);
  const sched = stubScheduler(window);

  gm.call('openReassignModal', 'GM-10');
  modals.specs[0].body.props.onApply('gm_user_2');

  const pp = gm.get('_currentRolePP');
  const sprint = gm.get('_sprint');
  const rec = gm.get('_currentSprintRoleRec');
  const dirty = gm.get('_dirtyRoleKeys');

  const before = {
    taskAssignmentGM10: pp.taskAssignments['GM-10'],
    ganttColorPresent: Object.prototype.hasOwnProperty.call(pp.taskAssignments['GM-10'], 'ganttColor'),
    /* #49 — reassign больше НЕ пишет напрямую rec/_sprint personalPlanning[rk]
       (keyed-записи сняты как мёртвые/неверной формы). Канон персистится через
       saveCurrentRoleState (см. before.deps.save). Прямых мутаций нет: */
    recPPNotDirectlyMutated: !(rec.personalPlanning && rec.personalPlanning.devBack),
    sprintPPNotMutatedByReassign: !(sprint.personalPlanning && sprint.personalPlanning.devBack === pp),
    dirtyDevBack: dirty.devBack === true,
    closeCalled: modals.closeLog,
    deps: deps,
    timerDelays: sched.delays(),
  };

  sched.runAll(); /* dirty-clear в следующем event-loop */
  const dirtyAfter = gm.get('_dirtyRoleKeys');

  checkJsonSnapshot('reassign-apply-to-other', {
    before: before,
    dirtyDevBackAfterFlush: dirtyAfter.devBack === undefined ? '<cleared>' : dirtyAfter.devBack,
  });
});

test('golden: onApply — синк таблицы «Люди» при видимом #planning-level-people', () => {
  const { gm, window, document } = createHost();
  fx.applyBaseState(gm);
  fx.applyPeopleState(gm);
  const modals = recordModals(window);
  const deps = stubReassignDeps(gm);
  stubScheduler(window);

  document.getElementById('planning-level-people').classList.remove('hidden');

  gm.call('openReassignModal', 'GM-11');
  modals.specs[0].body.props.onApply('gm_user_1');

  checkJsonSnapshot('reassign-apply-people-visible', {
    peopleTableRendered: deps.table,
    ganttRendered: deps.gantt,
    assignee: deps.assignee,
  });
});

test('golden: onApply — снятие назначения (login="" → assignee/assigneeName пусты, YT null)', () => {
  const { gm, window } = createHost();
  fx.applyBaseState(gm);
  fx.applyPeopleState(gm);
  const modals = recordModals(window);
  const deps = stubReassignDeps(gm);
  stubScheduler(window);

  gm.call('openReassignModal', 'GM-10');
  modals.specs[0].body.props.onApply('');

  const pp = gm.get('_currentRolePP');
  checkJsonSnapshot('reassign-apply-unassign', {
    taskAssignmentGM10: pp.taskAssignments['GM-10'],
    assigneeYt: deps.assignee,
    closeCalled: modals.closeLog,
  });
});

test('golden: onApply — reassign не мутирует _sprint/rec personalPlanning (канон через save)', () => {
  const { gm, window } = createHost();
  fx.applyBaseState(gm);
  fx.applyPeopleState(gm);
  /* sprintId не совпадает с _currentSprintId → isActiveSprintRecord=false */
  const rec = fx.buildCurrentRoleRec();
  rec.sprintId = fx.HIST_SPRINT_ID + '_devBack';
  gm.set({ _currentSprintRoleRec: rec });
  const modals = recordModals(window);
  stubReassignDeps(gm);
  stubScheduler(window);

  gm.call('openReassignModal', 'GM-10');
  modals.specs[0].body.props.onApply('gm_user_2');

  const pp = gm.get('_currentRolePP');
  const sprint = gm.get('_sprint');
  const recAfter = gm.get('_currentSprintRoleRec');
  checkJsonSnapshot('reassign-apply-inactive-record', {
    /* #49 — reassign не мутирует ни rec, ни _sprint personalPlanning (ни для active,
       ни для inactive записи); канон идёт через saveCurrentRoleState. */
    recPPNotMutated: !(recAfter.personalPlanning && recAfter.personalPlanning.devBack),
    sprintPPDevBackIsFixtureBlock: !!(sprint.personalPlanning && sprint.personalPlanning.devBack) && sprint.personalPlanning.devBack !== pp,
  });
});

test('golden: onApply — гард _applyReassign без _currentRolePP (early return, deps не зовутся)', () => {
  const { gm, window } = createHost();
  fx.applyBaseState(gm);
  fx.applyPeopleState(gm);
  const modals = recordModals(window);
  const deps = stubReassignDeps(gm);
  stubScheduler(window);

  gm.call('openReassignModal', 'GM-10');
  /* PP исчезает между открытием модалки и применением */
  gm.set({ _currentRolePP: null });
  modals.specs[0].body.props.onApply('gm_user_2');

  checkJsonSnapshot('reassign-apply-guard-no-pp', {
    deps: deps,
    closeCalled: modals.closeLog,
  });
});

test('golden: onCancel — закрытие модалки без переназначения', () => {
  const { gm, window } = createHost();
  fx.applyBaseState(gm);
  fx.applyPeopleState(gm);
  const modals = recordModals(window);
  const deps = stubReassignDeps(gm);
  stubScheduler(window);

  const ppBefore = JSON.stringify(gm.get('_currentRolePP').taskAssignments);
  gm.call('openReassignModal', 'GM-10');
  modals.specs[0].body.props.onCancel();
  const ppAfter = JSON.stringify(gm.get('_currentRolePP').taskAssignments);

  checkJsonSnapshot('reassign-cancel', {
    closeCalled: modals.closeLog,
    deps: deps,
    taskAssignmentsUnchanged: ppBefore === ppAfter,
  });
});
