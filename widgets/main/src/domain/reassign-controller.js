/**
 * reassign-controller.js — контроллер реассайн-модалки задачи в Ганте
 * (Фаза 5, зачистка «прочих» — слайс 7, домен D46). Мост window.__SSP_REASSIGN_CTRL.
 *
 * Наименее связный кластер «прочих» (8 deps, все — leaf/делегаторы вынесенных
 * модулей; единственный golden-вход openReassignModal):
 *   • openReassignModal(issueId) — собирает spec модалки: опции из
 *     _currentRolePP.resourcesByAssignee (sorted) + «Не назначен», current из
 *     taskAssignments; «Применить» → _applyReassign, «Отмена» → закрытие handle;
 *   • _applyReassign(issueId, login) — мутация taskAssignments (assignee/
 *     assigneeName, инвалидация legacy ganttColor-кэша), dirty-tracking; канон
 *     (histRec.personalPlanning, single per-role) и serialization-зеркало
 *     _sprint.personalPlanning пишет saveCurrentRoleState (#49 — прямые keyed-записи
 *     rec/_sprint personalPlanning[rk] сняты), зов saveCurrentRoleState +
 *     updateIssueAssigneeField (assignee в YouTrack) + ре-рендер Ганта, синк
 *     таблицы «Люди» по видимости #planning-level-people, снятие dirty в
 *     следующем event-loop;
 *   • hideReassignModal() — закрытие модалки через сохранённый handle
 *     (потребитель header-view: закрытие при переключении вкладки).
 *
 * Паттерн (слайсы 2–6): deps-фабрика per-call (_reassignDeps в монолите). Стейт
 * зоны (_reassignModalHandle + читаемые _currentRolePP/_currentSprintRoleRec/
 * _activeSubtab/_currentSprintId/_sprint/_dirtyRoleKeys) ОСТАЁТСЯ в стейт-ядре
 * монолита за get/set-аксессорами deps.state. Делегаторы выживают у обоих внешне
 * потребляемых (openReassignModal — gantt-view; hideReassignModal — header-view);
 * _applyReassign приватен модулю (вход только openReassignModal.onApply).
 *
 * Контракты — reassign.golden.test.js (идут через делегатор openReassignModal +
 * spec.body.props.onApply/onCancel).
 */
(function () {
  'use strict';

  /* ── openReassignModal — сборка spec реассайн-модалки ── */
  function openReassignModal(issueId, deps) {
    var st = deps.state;
    var T = deps.T;
    var pp = st.getCurrentRolePP();
    if (!pp) {
      deps.diag('openReassignModal: no _currentRolePP', 'warn');
      return;
    }
    var ra = pp.resourcesByAssignee || {};
    var ta = pp.taskAssignments || {};
    var current = (ta[issueId] && ta[issueId].assignee) || '';
    /* Опции <select>: «Не назначен» + ассайни роли (sorted) */
    var options = [{ value: '', label: T('reassignOptionUnassigned') }];
    Object.keys(ra).sort().forEach(function (login) {
      var nm = (ra[login] && ra[login].assigneeName) ? ra[login].assigneeName : login;
      options.push({ value: login, label: nm + ' (' + login + ')' });
    });
    var handle = deps.openModal({
      id: 'reassign',
      type: 'confirm',
      title: T('modalReassignTitle'),
      body: { kind: 'component', name: 'reassignForm', props: {
        issueId: issueId,
        bodyText: T('modalReassignBody'),
        options: options,
        current: current,
        applyText: T('btnApply'),
        cancelText: T('btnCancel'),
        onApply: function (login) { var h = st.getReassignModalHandle(); if (h) h.close(); _applyReassign(issueId, login, deps); },
        onCancel: function () { var h = st.getReassignModalHandle(); if (h) h.close(); },
      }},
      buttons: [],
      dismissOnBackdrop: false,
      blockEscape: false,
      showCloseButton: false,
      onClose: function () { st.setReassignModalHandle(null); },
    });
    st.setReassignModalHandle(handle);
  }

  /* ── hideReassignModal — закрытие через stored handle (потребитель header-view) ── */
  function hideReassignModal(deps) {
    var h = deps.state.getReassignModalHandle();
    if (h) { try { h.close(); } catch (_) {} }
  }

  /* ── _applyReassign — применение переназначения (логика дословно из v5.7.0/
     v6.3.0 D105: мутация _currentRolePP + запись assignee в YouTrack + ре-рендер
     Ганта/Людей). login — '' = «Не назначен». Приватна модулю. ── */
  function _applyReassign(issueId, login, deps) {
    var st = deps.state;
    var diag = deps.diag;
    var pp = st.getCurrentRolePP();
    if (!issueId || !pp) return;
    login = login || '';
    var ra = pp.resourcesByAssignee || {};
    if (!pp.taskAssignments) pp.taskAssignments = {};
    var entry = pp.taskAssignments[issueId] || {};
    entry.assignee     = login || '';
    entry.assigneeName = login ? ((ra[login] && ra[login].assigneeName) ? ra[login].assigneeName : login) : '';
    /* Инвалидация legacy-кэша цвета бара (поле не читается с v2.1.14) */
    delete entry.ganttColor;
    pp.taskAssignments[issueId] = entry;
    /* #49 — канон (histRec.personalPlanning, single per-role) пишется ниже через
       saveCurrentRoleState (deepClone(_currentRolePP)). Прежние прямые keyed-записи
       rec.personalPlanning[rk] и _sprint.personalPlanning[rk] сняты: были мёртвыми
       (saveCurrentRoleState их затирал) и неверной формы (keyed-map внутрь per-role записи).
       _currentRolePP.taskAssignments уже мутирован выше. */
    var rec = st.getCurrentSprintRoleRec();
    var currentSprintId = st.getCurrentSprintId();
    /* Dirty-tracking для confirm при смене роли */
    if (rec && rec.sprintId && currentSprintId) {
      var rkDirty = rec.sprintId.replace(currentSprintId + '_', '');
      if (rkDirty) st.getDirtyRoleKeys()[rkDirty] = true;
    }
    if (typeof deps.saveCurrentRoleState === 'function') {
      try { deps.saveCurrentRoleState(); } catch (e) { diag('saveCurrentRoleState reassign err: ' + e, 'err'); }
    }
    /* v6.3.0 D105 — после reassign в Ганте писать assignee в YouTrack
       через update-issue-field (как делает change-handler на «Распределение»). */
    try {
      var rkForYt = (rec && rec.roleKey) || st.getActiveSubtab();
      if (rkForYt && typeof deps.updateIssueAssigneeField === 'function') {
        deps.updateIssueAssigneeField(issueId, login || null, rkForYt);
      }
    } catch (e) { diag('updateIssueAssigneeField reassign err: ' + e, 'err'); }
    /* Ре-рендер Ганта (visible) */
    if (typeof deps.renderGanttChart === 'function') {
      try { deps.renderGanttChart(); } catch (e) { diag('renderGanttChart reassign err: ' + e, 'err'); }
    }
    /* Двусторонняя синхронизация: если уровень «Люди» рендерил таблицу — обновим её */
    var peopleEl = document.getElementById('planning-level-people');
    if (peopleEl && !peopleEl.classList.contains('hidden')
        && typeof deps.renderCurrentRoleTaskTable === 'function') {
      try { deps.renderCurrentRoleTaskTable(); } catch (e) { diag('renderCurrentRoleTaskTable reassign err: ' + e, 'err'); }
    }
    /* Снимаем dirty в следующем event-loop — saveCurrentRoleState уже flush'ит draft */
    setTimeout(function () {
      var rec2 = st.getCurrentSprintRoleRec();
      var sid2 = st.getCurrentSprintId();
      if (rec2 && rec2.sprintId && sid2) {
        var rkClean = rec2.sprintId.replace(sid2 + '_', '');
        if (rkClean) delete st.getDirtyRoleKeys()[rkClean];
      }
    }, 0);
  }

  var api = {
    openReassignModal: openReassignModal,
    hideReassignModal: hideReassignModal,
  };
  if (typeof window !== 'undefined') window.__SSP_REASSIGN_CTRL = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
