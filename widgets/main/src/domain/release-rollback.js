/* release-rollback.js — #57-3 откат состояний задач релиза по истории поля State
   (⚖ владелец: снапшот НЕ храним — история изменений YT и есть снимок).

   Источник = bulkStateTransitions (reporting-примитив через core-делегат): новейший
   State-переход per задача, fromState = oldValue (removed) активности, канон-имена
   (preferCanon — сверка с бандлом field-values и fetchIssueData.state, оба канон v.name;
   грабля feedback_yt_activity_name_vs_localized). Превью ДО применения (канон R2.3
   «молча не перетираем»): текущее → куда откатим + дата перехода; пометки nohist
   (переходов не было) / incomplete (история обрезана лимитом, D7) / already / desync
   (текущее ≠ toState последнего перехода — задачу меняли позже; снята, включать
   осознанно) / вне бандла (реюз unreachable). Помеченная строка оживает ручным выбором
   цели (US-R2-06). Применение — release-controller._applyStates через core-делегат
   deps.applyStates (B1 — чужой мост напрямую не зовём); при отказах — штатный нотифай
   про state-machine (⚖ владелец 57-3). */
'use strict';

const _TERMINAL_ST = { released: 1, cancelled: 1 };

/* Pure-сборка строк превью отката (unit-тест release-state-preview.test.js).
   prim = bulkStateTransitions-результат {transitions, incomplete, noTransition}. */
function buildRollbackRows(rec, issueData, prim, bundleValues) {
  var trs = (prim && prim.transitions) || {};
  var incSet = {};
  ((prim && prim.incomplete) || []).forEach(function (id) { incSet[id] = true; });
  return ((rec && rec.issues) || []).map(function (id) {
    var d = (issueData && issueData[id]) || {};
    var cur = d.state || '';
    var tr = trs[id];
    var target = (tr && tr.fromState) || '';
    var mark = 'ok', checked = true, disabled = false;
    if (incSet[id]) { mark = 'incomplete'; checked = false; disabled = true; }
    else if (!tr || !target) { mark = 'nohist'; checked = false; disabled = true; }
    else if (cur && cur === target) { mark = 'already'; checked = false; }
    else if (Array.isArray(bundleValues) && bundleValues.indexOf(target) < 0) { mark = 'unreachable'; checked = false; disabled = true; }
    else if (cur && tr.toState && cur !== tr.toState) { mark = 'desync'; checked = false; }   /* задачу меняли после перехода — откат перезатёр бы ручную правку, включать осознанно */
    var ts = (tr && typeof tr.enteredAt === 'number') ? tr.enteredAt : null;
    return { id: id, title: d.summary || '', current: cur, target: target, mark: mark,
      checked: checked, disabled: disabled,
      tsLabel: ts ? new Date(ts).toLocaleDateString() : '' };
  });
}

function openRollbackPreview(deps, releaseId) {
  var rec = (deps.state.release.getReleases() || []).filter(function (r) { return r.id === releaseId; })[0];
  if (!rec || _TERMINAL_ST[rec.status]) return;
  if (!(rec.issues || []).length) return; // кнопка скрыта при пустом составе — guard
  var T = deps.T;
  var s = deps.state.getSettings() || {};
  var stateField = s.fieldState || 'State';
  Promise.all([
    deps.fetchIssueData(rec.issues),
    deps.apiGet('field-values?fieldName=' + encodeURIComponent(stateField)).catch(function () { return null; }),
    (typeof deps.bulkStateTransitions === 'function' ? deps.bulkStateTransitions(rec.issues) : Promise.resolve(null))
  ]).then(function (res) {
    var bundle = (res[1] && res[1].success && Array.isArray(res[1].values)) ? res[1].values : null;
    var rows = buildRollbackRows(rec, res[0] || {}, res[2] || {}, bundle);
    var handle = deps.openModal({
      id: 'release-state-rollback', type: 'selection', dialogClass: 'ssp-ring-modal--wide',
      title: T('relRbTitle') + ' — ' + (rec.name || rec.id),
      body: { kind: 'component', name: 'releaseStatePreview', props: {
        labels: {
          mappingLine: T('relRbLine'),
          colTask: T('thTitle'), colCurrent: T('relPvColCurrent'), colTarget: T('relRbColTarget'), colMark: T('relPvColMark'),
          willApply: T('relPvWillApply'), desync: T('relPvDesync'), unreachable: T('relPvUnreachable'), already: T('relPvAlreadyTarget'),
          noHistory: T('relRbNoHist'), histIncomplete: T('relRbIncomplete'),
          setAll: T('relPvSetAll'),   /* #57-3 — массовое назначение одного статуса всем */
          applyBtn: T('relRbApplyBtn'), errDetails: T('relPvErrDetails'), retry: T('relPvRetry'), cancel: T('btnCancel'),
        },
        rows: rows,
        stateOptions: bundle || [],
        onApply: function (list, done) {
          deps.applyStates(stateField, list, function (r) {
            /* ⚖ владелец (#57-3): отказ обратного перехода — штатный нотифай про state-machine. */
            if (r && r.failed && r.failed.length) deps.toast(T('relRbSmConflict').replace('{n}', String(r.failed.length)), 'warn');
            if (typeof done === 'function') done(r);
          });
        },
        onCancel: function () { if (handle && handle.close) handle.close(); },
      } },
      buttons: [],
    });
  }).catch(function (e) { deps.diag('release state rollback err: ' + e, 'err'); deps.toast(deps.T('relPickerLoadError'), 'err'); });
}

const api = { openRollbackPreview: openRollbackPreview, buildRollbackRows: buildRollbackRows };

if (typeof window !== 'undefined') {
  try { window.__SSP_RELEASE_ROLLBACK = api; } catch (_) { /* sandboxed write may throw */ }
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
