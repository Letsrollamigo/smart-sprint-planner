/* Validation-контроллер: валидация состава роли (doValidateRole), детектор
   перелимита аллокаций + блокировка кнопки валидации (updateAllocOverlimitUI,
   вкл. B13-агрегат и #38 allowOverlimitPlanning), overlimit-модалка v5.2.0
   с downgrade-веткой (приватная showOverlimitModal) и onboarding-подсказка
   ALLOCATED-lock. Вынесено из core.js (Фаза 5 слайс 4, коммит Б)
   за мост window.__SSP_VALIDATION_CTRL; golden-характеризация —
   tests/golden/validation.golden.test.js (через делегаторы монолита).

   Deps приходят АРГУМЕНТОМ на каждый вызов (фабрика _validationDeps() в
   монолите) — стейт зоны (_sprint/_settings/_history/_roleItems, флаг
   _isValidator, ключ _activeWorkingDraftKey, guard _overlimitModalShownFor)
   ОСТАЁТСЯ в стейт-ядре монолита: его трогают другие контроллеры, ресет
   per-project и gm-хук голденов; модуль ходит get/set-аксессорами deps.state
   строго в момент обращения. Коллбеки модалки/таймеров замыкают deps
   снапшотом момента вызова — late-binding getters читают свежий стейт ядра
   при выстреле (паттерн draft-store). Document-листенеры зоны (blur
   alloc-input / change inc-sel, отложенный пересчёт 50мс) регистрируются
   install(depsFactory) из той же точки init, где зона регистрировала их
   раньше — порядок регистрации сохранён (install-once паттерн мостов E3). */
'use strict';

function doValidateRole(rk, deps) {
  var T = deps.T, toast = deps.toast, diag = deps.diag;
  if (!deps.state.getSettings()) { toast(T('toastFillSettings')); return Promise.resolve(); }
  var sprint = deps.state.getSprint();
  if (!sprint || !sprint.dateStart || !sprint.dateEnd) { toast(T('toastFillDates')); return Promise.resolve(); }
  var role = deps.ALL_ROLES.find(function(r){ return r.key === rk; });
  if (!role) return Promise.resolve();
  if (!(sprint[role.resKey] > 0)) { toast(T('toastFillResource')); return Promise.resolve(); }
  var active = deps.getRoleItemsArr(rk).filter(function(i){ return deps.ACTIVE_INC.indexOf(i.inclusionStatus) >= 0; });
  if (!active.length) { toast(T('toastNoActiveTasks')); return Promise.resolve(); }

  var btn = document.getElementById('validateBtn_'+rk);
  return deps.withLoader(btn, function() {
    return deps.checkValidatorNow().then(function(ok) {
      deps.state.setIsValidator(ok);
      if (!ok) { toast(T('toastNoValidRights')); return; }
      var s = deps.state.getSprint();
      s.status = deps.STATUS.CONFIRMED;
      diag('[VALIDATE-COMPOSITION] role='+rk+' set _sprint.status='+s.status+' wcKey='+deps.state.getActiveWorkingDraftKey(), 'info');
      // v5.0 — отправляем с ?action=validate + полный sprint+roleItems,
      // чтобы сервер мог посчитать overlimit и вернуть warnings.
      // v3.15.1 — role=rk скоупит серверную проверку на валидируемую роль.
      return deps.apiPost('sprint-data', { sprint: s, roleItems: deps.state.getRoleItems() }, { action: 'validate', role: rk })
        .then(function(resp) {
          // Server-side warn: показываем все полученные warnings (например, overlimit:devPlatform)
          if (resp && Array.isArray(resp.warnings) && resp.warnings.length) {
            resp.warnings.forEach(function(w) {
              if (typeof w === 'string' && w.indexOf('overlimit:') === 0) {
                var rkw = w.split(':')[1] || '';
                var roleW = deps.ALL_ROLES.find(function(r){ return r.key === rkw; });
                var label = roleW ? (roleW.label) : rkw;
                /* v3.15.1 — предупреждение, не отказ: спринт сохранён и подтверждён,
                   err-тост рядом с success читался как противоречие (ОС прода). */
                toast(T('overlimitWarnSrv').replace('{role}', label), 'warn');
              }
            });
          }
          /* v1.9.3 D134 — Etap О.1: передаём wasValidated=true чтобы snapshot
             получил CONFIRMED. Все остальные call-sites saveRoleHistorySnapshot
             (refresh, working-copy commit, manual save) — без флага → per-role
             preserve existing status или PLANNING для нового snap. */
          return deps.saveRoleHistorySnapshot(rk, undefined, undefined, /* wasValidated */ true);
        }).then(function() {
          var s2 = deps.state.getSprint();
          /* Диаг после snapshot: что в _history для этой роли? */
          var _diagSnap = deps.state.getHistory().find(function(h){ return h && h.sprintId === s2.sprintId + '_' + rk; });
          diag('[VALIDATE-COMPOSITION] role='+rk+' after snap: _history.status='+(_diagSnap?_diagSnap.status:'NOT_FOUND')+' _sprint.status='+s2.status, 'info');
          /* v5.3.0: working copy commit очищает _activeWorkingDraftKey внутри _commitWorkingCopy.
             Здесь — общая очистка legacy-полей (на случай миграции из v5.2.0). */
          if (s2) {
            s2.editingFromHistory = false;
            delete s2.historyIdx;
          }
          deps.state.setActiveWorkingDraftKey(null);
          if (typeof deps.hideWorkingCopyBanner === 'function') deps.hideWorkingCopyBanner();
          var editBanner = document.getElementById('editHistBanner');
          if (editBanner) { editBanner.style.display = 'none'; editBanner.textContent = ''; }
          deps.renderRoleStatusBadge(rk);
          if (typeof deps.renderWidgetHeader === 'function') { try { deps.renderWidgetHeader(); } catch(_){} }
          var ss = document.getElementById('sprintStatus_'+rk);
          if (ss) ss.style.display = 'none';
          var newBtn = document.getElementById('newSprintBtn_'+rk);
          if (newBtn) newBtn.style.display = '';
          toast(T('toastSprintConfirmed').replace('{role}', deps.roleLabel(role)), 'success');
        }).catch(function(e) {
          toast(T('toastSaveError')+': '+(e&&e.message?e.message:String(e)), 'error');
        });
    }).catch(function() {
      toast(T('toastCheckError'));
    });
  });
}

/**
 * Обновляет visual-состояние строк с превышением и кнопки валидации.
 * Вызывается после каждого изменения аллокации.
 */
function updateAllocOverlimitUI(rk, deps) {
  /* v2.1.0 E4 — Ring Table owns DOM; per-row <tr data-alloc-gi> is gone.
     We look up alloc inputs directly by data-iid and apply the visual to
     the input border. Per-row overlimit badge on title cell is degraded
     (Ring Table cells have no stable per-row container we can append into
     without disturbing React reconciliation). Validate button disabling
     and the overlimit modal still work via checkAllocOverlimit(rk). */
  var host = document.getElementById('compHost_'+rk);
  var items = deps.getRoleItemsArr(rk);
  var anyOverlimit = false;

  if (host) {
    var allocInputs = host.querySelectorAll('input.alloc-input[data-iid]');
    allocInputs.forEach(function(inp) {
      var iid = inp.getAttribute('data-iid');
      var item = null;
      for (var i = 0; i < items.length; i++) {
        if (items[i] && items[i].issueId === iid) { item = items[i]; break; }
      }
      if (!item) return;
      if (deps.ACTIVE_INC.indexOf(item.inclusionStatus) < 0) {
        inp.style.borderColor = '';
        return;
      }
      var alloc = item['alloc_'+rk];
      var est   = item['estimate_'+rk];
      var fact  = item['fact_'+rk];
      var delta    = Math.max(0, (est||0) - (fact||0));
      var allocVal = (alloc !== null && alloc !== undefined) ? alloc : delta;
      var isOver = delta > 0 && allocVal > delta;
      if (isOver) anyOverlimit = true;
      inp.style.borderColor = isOver ? 'var(--error)' : '';
    });
  }

  /* Fallback global check — host may not be visible yet (collapsed role
     card), but validate button state still needs to reflect overlimit. */
  if (!anyOverlimit) {
    /* B13 — per-task delta-проверка слепа при пустых est/fact (delta=0).
       Дополняем агрегатом: Σalloc активных задач > ресурс роли. Канон —
       calcRemForRole (та же формула, что красит карточку «Остатки» в red),
       поэтому детектор и индикатор остатка всегда согласованы. */
    anyOverlimit = deps.checkAllocOverlimit(rk).length > 0 || deps.calcRemForRole(rk) < 0;
  }

  // Блокировка валидации: аллокация задачи > ресурс роли
  /* #38 — если включено «разрешить планирование с превышением лимитов»,
     детекция остаётся (красные бордеры/карточка остатка выше — индикация),
     но валидацию НЕ блокируем и overlimit-модалку НЕ показываем. */
  var settings = deps.state.getSettings();
  var allowOver = !!(settings && settings.allowOverlimitPlanning);
  var validateBtn = document.getElementById('validateBtn_'+rk);
  if (validateBtn) {
    if (anyOverlimit && !allowOver) {
      validateBtn.disabled = true;
      validateBtn.title = deps.T('overlimitTooltip');
      validateBtn.classList.add('btn--disabled-overlimit');
      /* v5.2.0 — для валидированных статусов вместо тихого revert показываем модал.
         Guard `_overlimitModalShownFor` предотвращает повторное открытие при каждом
         blur. Сбрасывается в else-ветке при устранении overlimit. */
      var sprint = deps.state.getSprint();
      /* B24/statusByRole — гейт показа модалки по PER-ROLE статусу (не глобальному):
         downgrade-модалка нужна только если ЭТА роль уже валидирована (CONFIRMED/ALLOCATED). */
      var roleStatus = (typeof deps.statusForRole === 'function') ? deps.statusForRole(rk) : (sprint && sprint.status);
      if (sprint && (roleStatus === deps.STATUS.CONFIRMED || roleStatus === deps.STATUS.ALLOCATED)) {
        var modalKey = rk + ':' + (sprint.sprintId || sprint.dateStart || 'cur');
        var shown = deps.state.getOverlimitModalShownFor();
        if (!shown[modalKey]) {
          showOverlimitModal(rk, deps);
          shown[modalKey] = true;
        }
      }
    } else {
      validateBtn.disabled = false;
      validateBtn.title = '';
      validateBtn.classList.remove('btn--disabled-overlimit');
      /* v5.2.0 — overlimit устранён, разрешаем модал показывать снова при следующем превышении */
      var sprint2 = deps.state.getSprint();
      if (sprint2) {
        var modalKey2 = rk + ':' + (sprint2.sprintId || sprint2.dateStart || 'cur');
        delete deps.state.getOverlimitModalShownFor()[modalKey2];
      }
    }
  }
}

/* v5.2.0 — Overlimit-модал (замена тихого status revert). Приватен модулю:
   единственный вход — updateAllocOverlimitUI. Write-only handle модалки
   снесён коммитом А слайса 4 (класс _permissionsReady). */
function showOverlimitModal(rk, deps) {
  var T = deps.T;
  var role = deps.ALL_ROLES.find(function(r){ return r.key === rk; });
  var rl = role ? deps.roleLabel(role) : rk;
  var bodyText = T('overlimitModalBodyTpl').replace('{role}', rl);
  deps.openModal({
    id: 'overlimit',
    type: 'confirm',
    title: bodyText,
    body: { kind: 'text', text: bodyText },
    buttons: [
      { id: 'downgrade', text: T('overlimitModalDowngrade'), variant: 'danger', onClick: function(h) {
        h.close();
        /* B24/statusByRole — понизить статус ТОЛЬКО перелимитной роли rk: запись
           per-role в _history[<sprintId>_<rk>].status + persist + ре-рендер бейджа роли
           и шапки (setRoleStatus). Раньше менялся лишь глобальный _sprint.status, а
           per-role бейдж (читает _history) не обновлялся — ветка обновления бейджей была
           доказуемо мёртвой (B24). Понижаем только rk, остальные роли не трогаем. */
        if (typeof deps.setRoleStatus === 'function') {
          deps.setRoleStatus(rk, deps.STATUS.PLANNING);
          deps.diag('Status downgraded to PLANNING (per-role '+rk+', overlimit modal)', 'info');
          deps.toast(T('toastOverlimitDowngraded'), 'warn');
        }
      }},
      { id: 'cancel', text: T('overlimitModalCancel'), variant: 'primary', onClick: function(h) {
        h.close();
      }},
    ],
    dismissOnBackdrop: false,
    blockEscape: false,
    showCloseButton: false,
  });
}

/* v5.2.0 — единоразовый onboarding при первой встрече с ALLOCATED-спринтом
   (после релиза 5.2.0 поведение строк изменилось: lock + readonly).
   Хранится в localStorage по фиксированному ключу — повторно не показывается. */
function maybeShowAllocatedLockHint(deps) {
  if (deps.safeLs.get('ssp_allocLockHintShown')) return;
  var sprint = deps.state.getSprint();
  /* statusByRole — lock теперь per-role: хинт показываем, когда ХОТЯ БЫ одна активная
     роль ALLOCATED (её таблица read-only). Раньше — по глобальному _sprint.status. */
  var anyAllocated = (typeof deps.statusForRole === 'function' && typeof deps.getActiveRoles === 'function')
    ? deps.getActiveRoles().some(function (r) { return deps.statusForRole(r.key) === deps.STATUS.ALLOCATED; })
    : (sprint && sprint.status === deps.STATUS.ALLOCATED);
  if (!sprint || !anyAllocated) return;
  deps.toast(deps.T('toastAllocatedLockHint'), 'info');
  deps.safeLs.set('ssp_allocLockHintShown', '1');
}

/* Document-листенеры зоны: после изменения аллокации (blur на alloc-input)
   и смены статуса включения (change на inc-sel) — отложенный пересчёт
   перелимита. Небольшая задержка, чтобы значение уже было сохранено в
   _roleItems. Deps резолвятся фабрикой в момент выстрела таймера —
   late-binding (стабы голденов и свежий стейт ядра подхватываются). */
function install(depsFactory) {
  document.addEventListener('blur', function(e) {
    if (e.target && e.target.classList && e.target.classList.contains('alloc-input')) {
      var rk2 = e.target.dataset.rk;
      if (rk2) {
        setTimeout(function() { updateAllocOverlimitUI(rk2, depsFactory()); }, 50);
      }
    }
  }, true);

  document.addEventListener('change', function(e) {
    if (e.target && e.target.classList && e.target.classList.contains('inc-sel')) {
      var rk2 = e.target.dataset.rk;
      if (rk2) setTimeout(function() { updateAllocOverlimitUI(rk2, depsFactory()); }, 50);
    }
  }, true);
}

const api = {
  doValidateRole: doValidateRole,
  updateAllocOverlimitUI: updateAllocOverlimitUI,
  maybeShowAllocatedLockHint: maybeShowAllocatedLockHint,
  install: install,
};

if (typeof window !== 'undefined') {
  try { window.__SSP_VALIDATION_CTRL = api; } catch (_) { /* sandboxed write may throw */ }
}

module.exports = api;
