/* Permissions-кластер: backend-проверки прав (validator/editor/assigner/
   settings-manager), синглтон-батч _startPermissionsCheck и применение прав
   к editor/validate/assigner-кнопкам активной панели. Вынесено из
   core.js (Фаза 5 слайс 2, коммит Б) за мост
   window.__SSP_PERMISSIONS; golden-характеризация —
   tests/golden/permissions-share.golden.test.js (через делегаторы монолита).

   Deps приходят АРГУМЕНТОМ на каждый вызов (фабрика _permsDeps() в монолите) —
   флаги прав (_isEditor/_isValidator/_isAssigner) и кэш промиса
   (_permissionsCheckPromise) ОСТАЮТСЯ в стейт-ядре монолита: их читают guard'ы
   контроллеров и deps-фабрики других модулей; модуль ходит через
   get/set-аксессоры deps.state строго в момент обращения. Сброс флагов при
   смене проекта (_resetProjectStateCaches) — тоже в монолите. */
'use strict';

/**
 * [P1-1] Проверка прав валидатора — исключительно через backend GET /check-validator.
 * Сервер читает группы из сохранённых настроек (ctx.project.extensionProperties),
 * клиент не передаёт список групп — их нельзя подменить.
 */
function checkValidatorNow(deps) {
  return deps.backendCall('check-validator', { method: 'GET' })
    .then(function(r){ return !!(r && r.isValidator); })
    .catch(function(){ return false; });
}

/**
 * [P1-1] Проверка прав редактора — исключительно через backend GET /check-editor.
 * Сервер сверяет ctx.currentUser.groups с настроенными группами редактирования.
 */
function checkEditorRightsNow(deps) {
  return deps.backendCall('check-editor', { method: 'GET' })
    .then(function(r){ return !!(r && r.isEditor); })
    .catch(function(){ return false; });
}

function checkSettingsManager(deps) {
  deps.diag('checkSettingsManager: запрос...', 'info');
  return deps.backendCall('check-settings-manager', { method: 'GET' })
    .then(function(r) {
    var msg = 'checkSettingsManager: canManage=' + (r && r.canManage) +
      ' group="' + (r && r.groupName || '') + '"';
    deps.diag(msg, (r && r.canManage) ? 'ok' : 'err');
    return !!(r && r.canManage);
  }).catch(function(e) {
    deps.diag('checkSettingsManager ERR: ' + String(e) + ' — фоллбек: запрещаем', 'err');
    return false;
  });
}

/* #51 — глобальная роль админа инстанса (гейт кнопки глобального пуша календаря).
   UI-only: enforcement — серверный байпас в authzGuard/ролевых хелперах. */
function checkInstanceAdmin(deps) {
  return deps.backendCall('check-instance-admin', { method: 'GET' })
    .then(function (r) { return !!(r && r.isInstanceAdmin); })
    .catch(function () { return false; });
}

function checkValidator(deps) {
  checkValidatorNow(deps).then(function(ok){
    deps.state.setIsValidator(ok);
    deps.diag('checkValidator: isValidator='+ok, ok?'ok':'err');
  });
}

function checkEditorRights(deps) {
  checkEditorRightsNow(deps).then(function(ok){
    deps.state.setIsEditor(ok);
    deps.diag('checkEditorRights: isEditor='+ok, ok?'ok':'err');
    applyEditorRightsToUI(deps);
  });
}

/* v6.1.0 D82 (F5) — assigner-роль. Иерархия editor⊃assigner⊃viewer.
   Backend GET /check-assigner возвращает { isAssigner }, наследование на frontend
   учитывается в applyEditorRightsToUI (assigner-btn enabled if editor OR assigner). */
function checkAssignerRightsNow(deps) {
  return deps.backendCall('check-assigner', { method: 'GET' })
    .then(function (r) {
    return !!(r && r.isAssigner);
  }).catch(function () { return false; });
}
function checkAssignerRights(deps) {
  checkAssignerRightsNow(deps).then(function (ok) {
    deps.state.setIsAssigner(ok);
    deps.diag('checkAssignerRights: isAssigner=' + ok, ok ? 'ok' : 'info');
    try { document.body.classList.toggle('has-assigner-rights', !!(deps.state.getIsEditor() || deps.state.getIsAssigner())); } catch (_) {}
    applyEditorRightsToUI(deps);
  });
}

/* v2.0.0 Phase D3 — Singleton permission check.
   Запускает все 3 async permission checks одним батчем, кэширует Promise.
   Повторные вызовы возвращают тот же Promise (no duplicate API calls).
   Critical click-handlers могут .then() для guard'ов без race. */
function _startPermissionsCheck(deps) {
  var cached = deps.state.getPermissionsCheckPromise();
  if (cached) return cached;
  var validator = (typeof checkValidatorNow === 'function')
    ? checkValidatorNow(deps).then(function(ok){ deps.state.setIsValidator(ok); })
    : Promise.resolve();
  var editor = (typeof checkEditorRightsNow === 'function')
    ? checkEditorRightsNow(deps).then(function(ok){ deps.state.setIsEditor(ok); })
    : Promise.resolve();
  var assigner = (typeof checkAssignerRightsNow === 'function')
    ? checkAssignerRightsNow(deps).then(function(ok){ deps.state.setIsAssigner(ok); })
    : Promise.resolve();
  var all = Promise.all([validator, editor, assigner]).then(function() {
    try { document.body.classList.toggle('has-assigner-rights', !!(deps.state.getIsEditor() || deps.state.getIsAssigner())); } catch(_){}
    if (typeof applyEditorRightsToUI === 'function') { try { applyEditorRightsToUI(deps); } catch(_){} }
    /* v3.2.1 — transient-сбой чеков (их внутренние catch → false) раньше кэшировался
       НАВСЕГДА → сессия «без прав» до F5. Итог все-три-false не кэшируем: следующий
       гейтнутый клик перепроверит. ponytail: честный viewer платит повторным лёгким
       чеком на редких кликах — приемлемо против залипшей сессии. */
    if (!deps.state.getIsEditor() && !deps.state.getIsValidator() && !deps.state.getIsAssigner()) {
      deps.state.setPermissionsCheckPromise(null);
    }
  });
  deps.state.setPermissionsCheckPromise(all);
  return all;
}

/* Применить права редактора к кнопкам планирования/ганта.
   Editor-гейтинг ГЛОБАЛЕН (зависит только от isEditor/isValidator/isAssigner, не от
   конкретной панели), поэтому проходим по ВСЕМ смонтированным карточкам ролей и уровню
   «Люди», а не по одной активной подвкладке. Прежнее сужение до getActiveSubtab()-панели
   оставляло НЕ-активные раскрытые карточки со stale-классом btn--disabled-rights, если их
   кнопки были отрисованы в окне ещё-не-подтверждённых прав (isEditor=false): кнопка
   выглядела disabled, но кликалась (баг: «Подобрать задачи» неактивна, но действие
   выполняется). #planningPeopleContent лежит внутри #tab-planning, уровень «Люди» покрыт. */
function applyEditorRightsToUI(deps) {
  var roots = [];
  var p1 = document.getElementById('tab-planning'); if (p1) roots.push(p1);
  var p2 = document.getElementById('tab-gantt');    if (p2) roots.push(p2);
  roots.forEach(function (r) { _applyEditorRightsTo(r, deps); });
  /* v5.9.0 — расширение на overlay'и: editor-кнопки в #reassignOverlay/#clearAssigneesOverlay/etc.
     должны дизейблиться так же, как в основных вкладках. Settings-overlay (отдельный класс
     .settings-overlay без `.overlay`) НЕ затрагивается — управляется собственным flow check'ов. */
  var ovs = document.querySelectorAll('.overlay:not(.settings-overlay)');
  for (var i = 0; i < ovs.length; i++) _applyEditorRightsTo(ovs[i], deps);
}
function _applyEditorRightsTo(panel, deps) {
  if (!panel) return;
  var T = deps.T;
  var _isEditor = deps.state.getIsEditor();
  var _isValidator = deps.state.getIsValidator();
  var _isAssigner = deps.state.getIsAssigner();
  var editorBtns = panel.querySelectorAll('.editor-btn');
  editorBtns.forEach(function(btn) {
    if (_isEditor) {
      btn.classList.remove('btn--disabled-rights');
      btn.removeAttribute('data-tooltip');
      /* v3.2.1 — не сбрасываем disabled у кнопки, занятой withLoader (in-flight
         double-click guard): поздний permissions-проход открывал окно двойного submit. */
      if (!btn.__sspLoaderRoot) btn.disabled = false;
    } else {
      btn.classList.add('btn--disabled-rights');
      btn.setAttribute('data-tooltip', T('tooltipNoRightsEdit'));
      // НЕ ставим btn.disabled = true, чтобы показывался тултип
    }
  });
  var validateBtns = panel.querySelectorAll('.validate-btn');
  validateBtns.forEach(function(btn) {
    if (_isValidator) {
      btn.classList.remove('btn--disabled-rights');
      btn.removeAttribute('data-tooltip');
    } else {
      btn.classList.add('btn--disabled-rights');
      btn.setAttribute('data-tooltip', T('tooltipNoRightsVal'));
    }
  });
  var newSprintBtns = panel.querySelectorAll('.new-sprint-btn');
  newSprintBtns.forEach(function(btn) {
    if (_isEditor) {
      btn.classList.remove('btn--disabled-rights');
      btn.removeAttribute('data-tooltip');
    } else {
      btn.classList.add('btn--disabled-rights');
      btn.setAttribute('data-tooltip', T('tooltipNoRightsEdit'));
    }
  });
  var saveHeaderBtns = panel.querySelectorAll('.save-header-btn');
  saveHeaderBtns.forEach(function(btn) {
    if (_isEditor) {
      btn.classList.remove('btn--disabled-rights');
      btn.removeAttribute('data-tooltip');
    } else {
      btn.classList.add('btn--disabled-rights');
      btn.setAttribute('data-tooltip', T('tooltipNoRightsEdit'));
    }
  });
  /* v6.1.0 D82 (F5) — assigner-btn включён если editor OR assigner. */
  var assignerBtns = panel.querySelectorAll('.assigner-btn');
  assignerBtns.forEach(function (el) {
    if (_isEditor || _isAssigner) {
      el.classList.remove('btn--disabled-rights');
      el.removeAttribute('data-tooltip');
      if (!el.__sspLoaderRoot) el.disabled = false;   /* v3.2.1 — см. editor-btns */
      try { el.readOnly = false; } catch (_) {}
    } else {
      el.classList.add('btn--disabled-rights');
      el.setAttribute('data-tooltip', T('tooltipNoRightsEdit'));
      try { el.readOnly = true; } catch (_) {}
      /* v3.2.1 — SELECT игнорирует readOnly (действует только на input/textarea):
         селект смены исполнителя оставался интерактивным у не-assigner. */
      if (el.tagName === 'SELECT') el.disabled = true;
    }
  });
}

const api = {
  checkValidatorNow: checkValidatorNow,
  checkSettingsManager: checkSettingsManager,
  checkInstanceAdmin: checkInstanceAdmin,
  checkValidator: checkValidator,
  checkEditorRights: checkEditorRights,
  checkAssignerRights: checkAssignerRights,
  _startPermissionsCheck: _startPermissionsCheck,
  applyEditorRightsToUI: applyEditorRightsToUI,
};

if (typeof window !== 'undefined') {
  try { window.__SSP_PERMISSIONS = api; } catch (_) { /* sandboxed write may throw */ }
}

module.exports = api;
