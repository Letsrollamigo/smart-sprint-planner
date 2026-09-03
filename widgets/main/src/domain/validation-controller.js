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

/* ═══ #88 — запись значения спринта в САМИ задачи YouTrack ════════════════════
   Момент записи — согласование состава роли (⚖ владелец 2026-09-03), а не каждое
   добавление задачи: черновиковая возня (добавили → убрали → добавили) не должна
   править боевые задачи и будить правила/уведомления YouTrack пачками.
   Снятие значения НЕ делаем никогда: его могли поставить руками до нас, и стирание
   было бы ожогом #102 наизнанку. Канал под своим выключателем sprintWriteEnabled
   (default OFF) — новый путь записи в боевые задачи включается осознанно.
   Частичный успех сохраняется, отчёт позадачный (модель release-controller
   _applyStates): молчаливый отказ на боевых задачах недопустим. */
var SPRINT_WRITE_CHUNK = 25;

/* Мост читаем в момент вызова — порядок импорта бандла не гарантирует публикацию. */
function _sfPure() { return (typeof window !== 'undefined' && window.__SSP_SPRINT_FIELD_PURE) || null; }

/* Последовательные чанки: внутри чанка параллельно, между чанками цепочкой —
   спринт на сотни задач не выстреливает сотни конкурентных запросов. */
function _writeChunked(plan, jobFn) {
  var results = [];
  var p = Promise.resolve();
  for (var i = 0; i < plan.length; i += SPRINT_WRITE_CHUNK) {
    (function (chunk) {
      p = p.then(function () {
        return Promise.all(chunk.map(jobFn)).then(function (rs) { results.push.apply(results, rs); });
      });
    })(plan.slice(i, i + SPRINT_WRITE_CHUNK));
  }
  return p.then(function () { return results; });
}

/* Возвращает Promise<{written,failed}|null>. null — писать было нечего (выключено,
   поле не настроено, значение не выбрано, нет активных задач): штатный тихий исход. */
function writeSprintFieldToIssues(rk, role, deps) {
  var SF = _sfPure();
  var settings = deps.state.getSettings() || {};
  if (!SF || !settings.sprintWriteEnabled) return Promise.resolve(null);

  /* Пишем ТОЛЬКО если состав роли действительно подтверждён. saveRoleHistorySnapshot
     в двух ветках отдаёт resolved-промис, НЕ сохранив снимок: модалка конфликта рабочей
     копии ждёт решения человека, и buildRoleSnap может вернуть пусто. Без этой проверки
     задачи получили бы метку спринта под состав, которого на сервере нет, — тот же
     рассинхрон «экран говорит одно, сервер знает другое», что и #100. */
  var sprint = deps.state.getSprint();
  var sid = (sprint && sprint.sprintId) ? sprint.sprintId + '_' + rk : null;
  var rec = sid && (deps.state.getHistory() || []).filter(function (h) { return h && h.sprintId === sid; })[0];
  if (!rec || rec.status !== deps.STATUS.CONFIRMED) return Promise.resolve(null);

  var fieldName = SF.fieldNameFor(settings, role);
  var value     = SF.valueFor(sprint, rk, settings, role);
  if (!fieldName || !value) return Promise.resolve(null);

  /* Страховка от многозначного поля (⚖ владелец 2026-09-03): присваивание заменило бы
     весь список спринтов задачи. Подбор в настройках такие поля уже не предлагает —
     здесь ловим настройку, сохранённую до 3.35.0. Молча не пропускаем: говорим почему. */
  var pf = (deps.state.getProjectFields && deps.state.getProjectFields()) || [];
  for (var q = 0; q < pf.length; q++) {
    if (pf[q] && pf[q].name === fieldName && !SF.isSingleValueType(pf[q].type)) {
      deps.toast(deps.T('sprintWriteMultiValue').replace('{field}', fieldName), 'warn');
      return Promise.resolve(null);
    }
  }

  var plan = SF.writePlan(deps.getRoleItemsArr(rk), deps.ACTIVE_INC, fieldName, value);
  if (!plan.length) return Promise.resolve(null);

  return _writeChunked(plan, function (row) {
    return deps.apiPost('update-issue-field',
        { issueId: row.issueId, fieldName: row.fieldName, value: row.value, type: 'enum' })
      .then(function (r) {
        return { id: row.issueId, ok: !!(r && r.success), error: (r && (r.message || r.error)) || 'write_failed' };
      })
      .catch(function (e) { return { id: row.issueId, ok: false, error: String((e && e.message) || e) }; });
  }).then(function (results) {
    var written = [], failed = [];
    results.forEach(function (r) { if (r.ok) written.push(r.id); else failed.push(r); });
    var T = deps.T;
    deps.toast(T('sprintWriteResult').replace('{field}', fieldName).replace('{value}', value)
      .replace('{written}', String(written.length)).replace('{errors}', String(failed.length)),
      failed.length ? 'warn' : 'success');
    if (failed.length) {
      deps.diag('#88 sprint field write failed: ' + failed.map(function (f) { return f.id + '=' + f.error; }).join(', '), 'err');
    }
    return { written: written, failed: failed };
  });
}

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
          /* v5.3.0: working copy commit очищает _activeWorkingDraftKey внутри _commitWorkingCopy. */
          deps.state.setActiveWorkingDraftKey(null);
          if (typeof deps.hideWorkingCopyBanner === 'function') deps.hideWorkingCopyBanner();
          var editBanner = document.getElementById('editHistBanner');
          if (editBanner) { editBanner.style.display = 'none'; editBanner.textContent = ''; }
          deps.renderRoleStatusBadge(rk);
          if (typeof deps.renderWidgetHeader === 'function') { try { deps.renderWidgetHeader(); } catch(_){} }
          var newBtn = document.getElementById('newSprintBtn_'+rk);
          if (newBtn) newBtn.style.display = '';
          toast(T('toastSprintConfirmed').replace('{role}', deps.roleLabel(role)), 'success');
          /* #88 — состав роли утверждён: только теперь отражаем спринт в самих задачах.
             Отказ записи не отменяет подтверждение — состав уже сохранён. */
          return writeSprintFieldToIssues(rk, role, deps);
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
  writeSprintFieldToIssues: writeSprintFieldToIssues,   /* #88 — голден-вход */
  updateAllocOverlimitUI: updateAllocOverlimitUI,
  maybeShowAllocatedLockHint: maybeShowAllocatedLockHint,
  install: install,
};

if (typeof window !== 'undefined') {
  try { window.__SSP_VALIDATION_CTRL = api; } catch (_) { /* sandboxed write may throw */ }
}

module.exports = api;
