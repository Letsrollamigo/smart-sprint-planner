/**
 * history-controller.js — контроллер действий вкладки «История»: правка/
 * завершение спринта + экспорт/импорт истории в JSON (Фаза 5, зачистка
 * «прочих» — слайс 10). Мост window.__SSP_HISTORY_CTRL.
 *
 * UI-оркестровка поверх уже вынесенных слоёв: IO-конверт/anonymize/preflight/
 * import-dialog — в history-io.js (window.__SSP_HISTORY_IO); спеки модалок —
 * в modal-specs.js. Здесь — контроллеры, дёргающие эти слои + persistence:
 *   • editHistorySprint(rec, idx) — гейт прав (checkValidatorNow, async),
 *     запрет правки FINISHED, поиск роли в ALL_ROLES, ветвление по working copy
 *     (_workingDrafts): чужая → lock-toast; своя в другой вкладке →
 *     multi-tab-модал (fallback: take-over); своя/отсутствует → resume /
 *     create+resume;
 *   • finishHistorySprint(rec, idx) — confirm-модал → гейт _isValidator →
 *     openConfirmGoalDialog → запись FINISHED + apiPost('history') + renderHistory;
 *   • exportPerSprintJson(rec) — фильтр истории по базовому sprintId, конверт
 *     (buildHistEnvelope), имя файла (deps.histFilePrefix — fork-литерал в ядре),
 *     download (triggerJsonDownload);
 *   • submitHistImport(sel, mode, recs) — merge overwrite/skip + apiPost('history');
 *   • doImportReplaceAll() — гард pending + apiPost(import-replace) + замена _history.
 *
 * Паттерн (слайсы 2–9): deps-фабрика per-call (_histCtrlDeps в монолите) —
 * стабы closure-vars подхватываются и после выноса. Все пять — делегаторы ядра
 * (выживающие entry-points): editHistorySprint/finishHistorySprint/
 * exportPerSprintJson — потребители history-view (_historyDeps handler-refs);
 * submitHistImport — коллбек HISTORY_IO через _histIoDeps; doImportReplaceAll —
 * коллбек _openImportReplaceConfirm. Стейт (_history/_workingDrafts/_currentUser/
 * _isValidator/_thisTabToken/_importHistPending) остаётся в стейт-ядре за
 * get/set-аксессорами deps.state. _triggerJsonDownload (DOM-util) и
 * _openImportReplaceConfirm (wiring к MODAL_SPECS) + HIST_*-маркеры остаются в
 * ядре (HIST_* и histFilePrefix намеренно различаются между форками).
 *
 * Контракты — history-controller.golden.test.js (идут через делегаторы);
 * IO-слой — history-io.golden.test.js; import-replace-модал — modal-specs.golden.test.js.
 */
(function () {
  'use strict';

  /* ── Открыть на правку: working copies (immutable snapshots, D3/b) ── */
  function editHistorySprint(rec, idx, deps) {
    var st = deps.state;
    deps.checkValidatorNow().then(function (ok) {
      if (!ok) { deps.toast(deps.T('toastNoEditRights')); return; }
      if (!rec || !rec.sprintId) return;
      if (rec.status === deps.STATUS.FINISHED) {
        try { deps.toast(deps.T('cannotEditFinished'), 'warn'); } catch (_) {}
        return;
      }
      var role = deps.ALL_ROLES.find(function (r) { return r.key === rec.roleKey; });
      if (!role) return;
      var key = rec.sprintId;
      var existing = st.getWorkingDrafts()[key];
      var cu = st.getCurrentUser();
      var login = (cu && cu.login) || '';

      if (existing) {
        /* Чужая working copy — должна быть отфильтрована disabled-кнопкой,
           но защита defense-in-depth. */
        if (existing.editorLogin && existing.editorLogin !== login) {
          try { deps.toast(deps.T('wcLockedByOther').replace('{who}', existing.editorLogin), 'warn'); } catch (_) {}
          return;
        }
        /* Same user, другая вкладка → soft-warn модал */
        if (existing.editorTabToken && existing.editorTabToken !== st.getThisTabToken()) {
          if (typeof deps.showMultiTabConflictModal === 'function') {
            deps.showMultiTabConflictModal(key, function (takeOver) {
              if (takeOver) {
                existing.editorTabToken = st.getThisTabToken();
                existing.updatedAt = Date.now();
                deps.workingDraftsScheduleFlush();
                deps.resumeWorkingDraft(key, idx);
              }
              /* takeOver=false → ничего не делаем, остаёмся на вкладке истории */
            });
            return;
          }
          /* Fallback если модала нет ещё (race на boot) — take-over автоматом */
          existing.editorTabToken = st.getThisTabToken();
          existing.updatedAt = Date.now();
          deps.workingDraftsScheduleFlush();
        }
        deps.resumeWorkingDraft(key, idx);
        return;
      }
      /* Working copy не существует — создаём и возобновляем */
      deps.createWorkingDraftFromSnapshot(rec, idx);
      deps.resumeWorkingDraft(key, idx);
    });
  }

  /* ── Завершить спринт ── */
  function finishHistorySprint(rec, idx, deps) {
    var st = deps.state;
    var T = deps.T;
    deps.openModal({
      id: 'finishHist',
      type: 'confirm',
      title: T('confirmFinishSprint'),
      body: { kind: 'text', text: T('confirmFinishSprint') },
      buttons: [
        { id: 'cancel', text: T('btnNo'), variant: 'secondary', onClick: function (h) { h.close(); } },
        { id: 'confirm', text: T('btnYesFinish'), variant: 'primary', onClick: function (h) {
          h.close();
          if (!st.getIsValidator()) { deps.toast(T('toastNoValidRights'), 'warn'); return; }
          var hist = st.getHistory();
          if (!hist[idx]) return;
          var histRec = hist[idx];
          deps.openConfirmGoalDialog(histRec.sprintGoal, histRec.goalOutcome).then(function (goalFields) {
            if (!goalFields) return;
            histRec.status = deps.STATUS.FINISHED;
            histRec.finishedAt = Date.now();
            if (goalFields.goalOutcome)   histRec.goalOutcome   = goalFields.goalOutcome;
            if (goalFields.goalRetroNote) histRec.goalRetroNote = goalFields.goalRetroNote;
            deps.apiPost('history', { history: hist }).then(function () {
              deps.renderHistory();
              deps.toast(T('toastSprintFinished'), 'success');
            });
          });
        } },
      ],
      dismissOnBackdrop: false,
      blockEscape: false,
      showCloseButton: false,
    });
  }

  /* Экспорт одного спринта (все роли) по базовому sprintId */
  function exportPerSprintJson(rec, deps) {
    var hist = deps.state.getHistory();
    var baseId = String(rec.sprintId).split('_')[0];
    var sprintRecs = hist.filter(function (h) { return h && String(h.sprintId).split('_')[0] === baseId; });
    var env = deps.buildHistEnvelope(sprintRecs, false);
    var safeName = (rec.name || 'sprint').replace(/[\\/:*?"<>|]/g, '_');
    var d = rec.dateStart ? deps.fmtDate(rec.dateStart).replace(/\./g, '-') : 'nodate';
    deps.triggerJsonDownload(env, deps.histFilePrefix + safeName + '_' + d + '.json');
    deps.toast(deps.T('toastHistExported') || 'Спринт экспортирован', 'success');
  }

  /* Слияние импортируемых записей (overwrite/skip) + persist */
  function submitHistImport(selectedBaseIds, mode, fileRecords, deps) {
    var st = deps.state;
    var current = (st.getHistory() || []).slice();
    var toAdd = fileRecords.filter(function (r) { return r && r.sprintId && selectedBaseIds.indexOf(String(r.sprintId).split('_')[0]) >= 0; });
    if (mode === 'overwrite') {
      var removeSet = {};
      toAdd.forEach(function (r) { removeSet[r.sprintId] = true; });
      current = current.filter(function (h) { return !removeSet[h.sprintId]; });
    } else {
      // skip: убираем из toAdd то, что уже есть (по полному sprintId)
      var existingIds = {}; current.forEach(function (h) { if (h) existingIds[h.sprintId] = true; });
      toAdd = toAdd.filter(function (r) { return !existingIds[r.sprintId]; });
    }
    var merged = current.concat(toAdd);
    return deps.apiPost('history', { history: merged }).then(function () {
      st.setHistory(merged);
      deps.renderHistory();
      deps.toast((deps.T('toastHistImported') || 'Импортировано: {n}').replace('{n}', toAdd.length), 'success');
      deps.diag('history import merged: ' + toAdd.length + ' records (mode=' + mode + ')', 'ok');
    }).catch(function (e) {
      var msg = (e && e.message) ? e.message : String(e);
      if (msg.indexOf('history_data_too_large') >= 0) deps.toast(deps.T('toastHistImportTooLarge') || 'Файл превышает допустимый размер', 'err');
      else deps.toast((deps.T('toastHistImportErr') || 'Ошибка импорта: ') + msg, 'err');
    });
  }

  /* Полное восстановление (replace-all) — downstream-стейт через deps */
  function doImportReplaceAll(deps) {
    var st = deps.state;
    var pending = st.getImportHistPending();
    if (!pending || !pending.records) { st.setImportHistPending(null); return; }
    var records = pending.records; st.setImportHistPending(null);
    deps.apiPost('history', { history: records }, { action: 'import-replace' })
      .then(function (r) {
        if (!r || !r.success) throw new Error((r && r.reason) || 'unknown');
        st.setHistory(records.slice());
        deps.renderHistory();
        deps.toast(deps.T('toastHistReplaced') || 'История восстановлена из файла', 'success');
        deps.diag('history replaced: ' + records.length + ' records', 'ok');
      })
      .catch(function (e) {
        var msg = (e && e.message) ? e.message : String(e);
        if (msg.indexOf('history_manager_rights_required') >= 0 || msg.indexOf('403') >= 0) deps.toast(deps.T('toastNoHistReplaceRights') || 'Нет прав', 'err');
        else deps.toast((deps.T('toastHistReplaceErr') || 'Ошибка: ') + msg, 'err');
      });
  }

  var api = {
    editHistorySprint: editHistorySprint,
    finishHistorySprint: finishHistorySprint,
    exportPerSprintJson: exportPerSprintJson,
    submitHistImport: submitHistImport,
    doImportReplaceAll: doImportReplaceAll,
  };
  if (typeof window !== 'undefined') window.__SSP_HISTORY_CTRL = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
