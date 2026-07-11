/* Persistence-инфра: серверный черновик (GET/POST /draft, debounced 300мс)
   и working copies (GET/POST /working-drafts + reconcile/gc). Вынесено из
   core.js (Фаза 5 слайс 3, коммит Б) за мост
   window.__SSP_DRAFT_STORE; golden-характеризация —
   tests/golden/draft-store.golden.test.js (через делегаторы монолита).

   Deps приходят АРГУМЕНТОМ на каждый вызов (фабрика _draftStoreDeps() в
   монолите) — стейт черновика (_draft, _draftPending, _draftRestoreInProgress)
   и working copies (_workingDrafts, _workingDraftsDirty, _workingDraftsLoaded,
   _activeWorkingDraftKey, _thisTabToken) ОСТАЁТСЯ в стейт-ядре монолита: его
   пишут init-restore и _resetProjectStateCaches, читают gm-хук голденов и
   deps-фабрики других модулей; модуль ходит через get/set-аксессоры deps.state
   строго в момент обращения. Таймеры flush/debounce — приватный стейт модуля
   (снаружи их никто не читает; сброс per-project стейта таймеры не трогает —
   поведение монолита сохранено). */
'use strict';

/* ── приватный стейт модуля: таймеры ─────────────────────────── */
var _draftFlushTimer = null;
var _draftSaveTimers = {};
var _workingDraftsFlushTimer = null;

/* ═══ серверный черновик (_draft) ══════════════════════════════ */
/* YouTrack iframe sandboxed без allow-same-origin → localStorage недоступен.
   Поэтому единый объект `_draft` в памяти (стейт-ядро монолита),
   синхронизируемый с backend через debounced POST. Структура:
   { meta, ui, sprint, roleItems, currentRole, dirty }. */

function draftSet(suffix, value, deps) {
  var _draft = deps.state.getDraft();
  if (!_draft) { _draft = {}; deps.state.setDraft(_draft); }
  _draft[suffix] = value;
  deps.diag('draft SET '+suffix+' (in-memory)', 'ok');
  draftScheduleFlush(deps);
}
function draftGet(suffix, deps) {
  var _draft = deps.state.getDraft();
  return _draft ? (_draft[suffix] !== undefined ? _draft[suffix] : null) : null;
}
function draftDel(suffix, deps) {
  var _draft = deps.state.getDraft();
  if (_draft) delete _draft[suffix];
  draftScheduleFlush(deps);
}
function draftScheduleFlush(deps) {
  if (deps.state.getDraftRestoreInProgress()) return;
  deps.state.setDraftPending(true);
  clearTimeout(_draftFlushTimer);
  /* Короткая задержка (300мс), чтобы аккумулировать несколько draftSet
     в один POST (например, dirty + roleItems + meta пишутся подряд). */
  _draftFlushTimer = setTimeout(function () { draftFlushNow(deps); }, 300);
}
function draftFlushNow(deps) {
  if (!deps.state.getDraftPending()) return;
  var _draft = deps.state.getDraft();
  var sz = JSON.stringify(_draft || {}).length;
  if (sz > 200 * 1024) {
    try { deps.toast(deps.T('toastDraftTooLarge'), 'warn'); } catch(_){}
    return;
  }
  deps.state.setDraftPending(false);
  deps.diag('draft FLUSH → backend (size='+sz+'B)', 'info');
  deps.apiPost('draft', { data: _draft })
    .catch(function(e){
      deps.diag('draft flush failed: '+(e&&e.message?e.message:e),'err');
      /* v3.2.1 — ретрай: pending гасится ДО POST, отказ раньше оставлял черновик
         только в памяти до следующего draftSet. Перевзводим отложенный повтор.
         ponytail: бесконечный 5с-ретрай при лежащем backend — самолечится. */
      deps.state.setDraftPending(true);
      clearTimeout(_draftFlushTimer);
      _draftFlushTimer = setTimeout(function () { draftFlushNow(deps); }, 5000);
    });
}
function draftLoadFromBackend(deps) {
  return deps.apiGet('draft').then(function(r){
    var slot = (r && r.data) || null;
    if (slot && typeof slot === 'object') {
      deps.state.setDraft({
        meta:      slot.meta      || null,
        ui:        slot.ui        || null,
        sprint:    slot.sprint    || null,
        roleItems: slot.roleItems || null,
        currentRole: slot.currentRole || null,
        dirty:     slot.dirty     || null
      });
      deps.diag('draft loaded from backend (meta='+(slot.meta?'yes':'no')+')', 'ok');
    } else {
      deps.state.setDraft({ meta: null, ui: null, sprint: null, roleItems: null, currentRole: null, dirty: null });
      deps.diag('draft: no data on backend','info');
    }
  }).catch(function(e){
    deps.diag('draft load failed: '+(e&&e.message?e.message:e),'err');
    deps.state.setDraft({ meta: null, ui: null, sprint: null, roleItems: null, currentRole: null, dirty: null });
  });
}
function draftClearOnBackend(deps) {
  /* Полная очистка: POST /draft?action=clear */
  return deps.apiPost('draft', {}, { action: 'clear' }).then(function(){
    deps.state.setDraft({ meta: null, ui: null, sprint: null, roleItems: null, currentRole: null, dirty: null });
  });
}

function draftSaveDebounced(suffix, valueGetter, delayMs, deps) {
  if (deps.state.getDraftRestoreInProgress()) return;
  clearTimeout(_draftSaveTimers[suffix]);
  _draftSaveTimers[suffix] = setTimeout(function(){
    draftSet(suffix, valueGetter(), deps);
    draftSet('meta', { savedAt: Date.now(), version: deps.draftVersion, baseRevHash: deps.state.getBaseRevHash() }, deps);
  }, delayMs || 800);
}
function markDirty(section, deps) {
  if (deps.state.getDraftRestoreInProgress()) return;
  var d = draftGet('dirty', deps) || {};
  d[section] = true;
  draftSet('dirty', d, deps);
  deps.refreshDirtyIndicator();
  /* v5.3.0 — если активна working copy, любое dirty-событие синхронизирует
     in-memory _sprint/_roleItems в _workingDrafts[key]. Roleкей берём из активной
     подвкладки или из ключа working copy. Защищаемся try/catch чтобы не сорвать flow. */
  var activeKey = deps.state.getActiveWorkingDraftKey();
  if (activeKey) {
    try {
      var rk = deps.state.getActiveSubtab();
      if (!rk) {
        var draft = deps.state.getWorkingDrafts()[activeKey];
        if (draft) {
          var snap = deps.state.getHistory().find(function(s){ return s && s.sprintId === activeKey; });
          if (snap) rk = snap.roleKey;
        }
      }
      if (rk) syncWorkingDraftFromMemory(rk, deps);
    } catch(e) {
      deps.diag('syncWorkingDraftFromMemory failed: '+(e&&e.message?e.message:e), 'err');
    }
  }
}
function markClean(section, deps) {
  var d = draftGet('dirty', deps) || {};
  d[section] = false;
  draftSet('dirty', d, deps);
  deps.refreshDirtyIndicator();
}
function draftIsDirty(deps) {
  var d = draftGet('dirty', deps) || {};
  return !!(d.sprint || d.roleItems || d.currentRole);
}
function clearDraftStorage(deps) {
  ['meta','ui','sprint','roleItems','currentRole','dirty'].forEach(function(suf){ draftDel(suf, deps); });
  /* v6.1.0 D72 — сбросить in-memory state виджета. Иначе после ручной очистки истории
     в backend (через storage props) + click «Очистить черновик» в widget-header'е
     оставался артефакт удалённого спринта (_currentSprintId указывал в пустоту,
     селектор не перерисовывался). */
  deps.state.setCurrentSprintId(null);
  if (typeof deps.renderWidgetHeader === 'function') {
    try { deps.renderWidgetHeader(); } catch (_) {}
  }
}

/* ═══════════════════════════════════════════════════════════
   v5.3.0 — Working copies persistence (immutable snapshots, D3/b)
   ═══════════════════════════════════════════════════════════
   Аналогично _draft, но:
   • Multi-user видимость (карта общая по проекту, не per-login).
   • Backend: viewer GET, validator POST, владелец/settingsManager DELETE.
   • Дроссель flush 300мс. */
function workingDraftsLoadFromBackend(deps) {
  return deps.apiGet('working-drafts').then(function(r){
    var data = (r && r.data) || {};
    deps.state.setWorkingDrafts((data && typeof data === 'object' && !Array.isArray(data)) ? data : {});
    deps.state.setWorkingDraftsLoaded(true);
    var n = Object.keys(deps.state.getWorkingDrafts()).length;
    deps.diag('working-drafts loaded ('+n+' entries)', 'ok');
  }).catch(function(e){
    deps.diag('working-drafts load failed: '+(e&&e.message?e.message:e), 'err');
    deps.state.setWorkingDrafts({});
    deps.state.setWorkingDraftsLoaded(true);
  });
}
function workingDraftsScheduleFlush(deps) {
  deps.state.setWorkingDraftsDirty(true);
  if (_workingDraftsFlushTimer) clearTimeout(_workingDraftsFlushTimer);
  _workingDraftsFlushTimer = setTimeout(function () { workingDraftsFlushNow(deps); }, 300);
}
function workingDraftsFlushNow(deps) {
  if (!deps.state.getWorkingDraftsDirty()) return;
  deps.state.setWorkingDraftsDirty(false);
  return deps.apiPost('working-drafts', { data: deps.state.getWorkingDrafts() }).then(function(){
    /* v5.4.0 — синхронизировать индикатор WC в шапке виджета */
    if (typeof deps.renderWidgetHeader === 'function') {
      try { deps.renderWidgetHeader(); } catch(_){}
    }
    /* v5.5.0 — D37: cross-tab signal через localStorage. Вторая вкладка той же
       страницы получит storage-event и обновит свой индикатор без F5.
       Префикс ключа согласован байт-в-байт с reader'ом storage-листенера
       в ядре; не переименовывать в одиночку. */
    Object.keys(deps.state.getWorkingDrafts() || {}).forEach(function(k){
      deps.safeLs.set('ssp:wc-touched:' + k, String(Date.now()));
    });
  }).catch(function(e){
    var reason = (e && e.reason) || (e && e.error) || '';
    if (String(reason).indexOf('working_drafts_too_large') >= 0
        || String(reason).indexOf('working_draft_too_large') >= 0) {
      try { deps.toast(deps.T('wcStorageQuotaExceeded'), 'warn'); } catch(_){}
    } else {
      deps.diag('working-drafts flush failed: '+(e&&e.message?e.message:e), 'err');
    }
    /* Не теряем dirty — следующий debounced flush попробует снова */
    deps.state.setWorkingDraftsDirty(true);
    /* v3.2.1 — таймер тоже перевзводим: если это был последний ввод сессии,
       без него WC оставалась только в памяти вкладки. */
    if (_workingDraftsFlushTimer) clearTimeout(_workingDraftsFlushTimer);
    _workingDraftsFlushTimer = setTimeout(function () { workingDraftsFlushNow(deps); }, 5000);
  });
}
function workingDraftsDeleteOnBackend(key, deps) {
  if (!key) return Promise.resolve();
  return deps.apiPost('working-drafts', null, { action: 'delete', key: key })
    .catch(function(e){
      deps.diag('working-drafts delete failed for '+key+': '+(e&&e.message?e.message:e), 'err');
    });
}
/* Двусторонний sync hasWorkingCopy на снимках ↔ Object.keys(_workingDrafts).
   Удаляет orphan working copies (без базового снимка); выравнивает флаг
   hasWorkingCopy на снимках. Вызывается один раз после init. */
function reconcileHasWorkingCopyFlag(deps) {
  if (!deps.state.getWorkingDraftsLoaded()) return;
  var _workingDrafts = deps.state.getWorkingDrafts();
  var _history = deps.state.getHistory();
  var historyChanged = false, draftsChanged = false;
  /* 1) Drafts без snap → orphan, удалить */
  Object.keys(_workingDrafts).forEach(function(key){
    var found = _history.some(function(snap){ return snap && snap.sprintId === key; });
    if (!found) {
      deps.diag('working-drafts: orphan removed: '+key, 'warn');
      delete _workingDrafts[key];
      draftsChanged = true;
    }
  });
  /* 2) Snap.hasWorkingCopy выровнять */
  _history.forEach(function(snap){
    if (!snap) return;
    var actual = !!_workingDrafts[snap.sprintId];
    if (!!snap.hasWorkingCopy !== actual) {
      snap.hasWorkingCopy = actual;
      historyChanged = true;
    }
  });
  if (draftsChanged) workingDraftsScheduleFlush(deps);
  if (historyChanged) {
    deps.apiPost('history', { history: _history }).catch(function(e){
      deps.diag('history flush after reconcile failed: '+(e&&e.message?e.message:e), 'err');
    });
  }
}
/* Lazy purge: удаляет working copies со updatedAt > 30 дней назад.
   Без фоновых таймеров — один проход на init. Сводный toast. */
function gcWorkingDrafts(deps) {
  if (!deps.state.getWorkingDraftsLoaded()) return;
  var _workingDrafts = deps.state.getWorkingDrafts();
  var now = Date.now();
  var TTL = 30 * 24 * 3600 * 1000;
  var removed = [];
  Object.keys(_workingDrafts).forEach(function(key){
    var d = _workingDrafts[key];
    if (!d) { delete _workingDrafts[key]; removed.push(key); return; }
    if ((now - (d.updatedAt || 0)) > TTL) {
      delete _workingDrafts[key];
      removed.push(key);
    }
  });
  if (removed.length) {
    deps.diag('working-drafts GC: removed '+removed.length+' stale entries', 'info');
    workingDraftsScheduleFlush(deps);
    /* Снять hasWorkingCopy с соответствующих снимков */
    var historyChanged = false;
    var _history = deps.state.getHistory();
    _history.forEach(function(snap){
      if (snap && removed.indexOf(snap.sprintId) >= 0 && snap.hasWorkingCopy) {
        snap.hasWorkingCopy = false;
        historyChanged = true;
      }
    });
    if (historyChanged) {
      deps.apiPost('history', { history: _history }).catch(function(){});
    }
    try { deps.toast(deps.T('wcGcDiscarded').replace('{n}', removed.length), 'info'); } catch(_){}
  }
}

/* Зеркалит in-memory правки (_sprint/_roleItems) в активную working copy.
   Приватен модулю — единственный вызов из markDirty (WC-путь). */
function syncWorkingDraftFromMemory(rk, deps) {
  var activeKey = deps.state.getActiveWorkingDraftKey();
  if (!activeKey) return;
  var draft = deps.state.getWorkingDrafts()[activeKey];
  if (!draft) return;
  draft.updatedAt = Date.now();
  draft.editorTabToken = deps.state.getThisTabToken();
  var _sprint = deps.state.getSprint();
  if (_sprint) {
    draft.sprint.name            = _sprint.name || null;
    draft.sprint.dateStart       = _sprint.dateStart || null;
    draft.sprint.dateEnd         = _sprint.dateEnd || null;
    draft.sprint.sprintFieldVal  = _sprint.sprintFieldVal || null;
    draft.sprint.versionFieldVal = _sprint.versionFieldVal || null;
    deps.allRoles.forEach(function(r){
      if (_sprint[r.resKey] != null) draft.sprint[r.resKey] = _sprint[r.resKey];
    });
    /* #49 — WC-draft.personalPlanning = SINGLE PP активной роли rk из канона (per-role
       histRec), а не сырой keyed-кэш _sprint.personalPlanning (был источником keyed-vs-single
       рассинхрона). Канон уже актуализирован live-правками через saveCurrentRoleState; если
       записи нет — прежнее значение драфта не трогаем (createWorkingDraftFromSnapshot уже
       положил single PP из базового снимка). */
    if (rk && _sprint.sprintId) {
      var _wcCanonRec = deps.state.getHistory().find(function (r) {
        return r && r.sprintId === _sprint.sprintId + '_' + rk;
      });
      if (_wcCanonRec && _wcCanonRec.personalPlanning) {
        draft.personalPlanning = deps.deepClone(_wcCanonRec.personalPlanning);
      }
    }
    if (_sprint.gantt)            draft.gantt            = deps.deepClone(_sprint.gantt);
  }
  var _roleItems = deps.state.getRoleItems();
  if (rk && _roleItems[rk]) {
    draft.items = _roleItems[rk].map(function(it){
      var copy = {};
      Object.keys(it).forEach(function(k){ copy[k] = it[k]; });
      return copy;
    });
  }
  workingDraftsScheduleFlush(deps);
  if (typeof deps.renderWorkingCopyBanner === 'function') deps.renderWorkingCopyBanner();
}

/* v3.2.1 — отмена отложенных флашей при смене проекта (global-режим): stale-таймер
   стрелял бы уже с роутингом на НОВЫЙ проект (deps читают активный ключ на момент
   таймера) — пустая карта WC затирала working copies нового проекта. */
function cancelScheduledFlushes() {
  if (_draftFlushTimer) { clearTimeout(_draftFlushTimer); _draftFlushTimer = null; }
  if (_workingDraftsFlushTimer) { clearTimeout(_workingDraftsFlushTimer); _workingDraftsFlushTimer = null; }
}

const api = {
  draftSet: draftSet,
  cancelScheduledFlushes: cancelScheduledFlushes,
  draftGet: draftGet,
  draftFlushNow: draftFlushNow,
  draftLoadFromBackend: draftLoadFromBackend,
  draftClearOnBackend: draftClearOnBackend,
  draftSaveDebounced: draftSaveDebounced,
  markDirty: markDirty,
  markClean: markClean,
  draftIsDirty: draftIsDirty,
  clearDraftStorage: clearDraftStorage,
  workingDraftsLoadFromBackend: workingDraftsLoadFromBackend,
  workingDraftsScheduleFlush: workingDraftsScheduleFlush,
  workingDraftsFlushNow: workingDraftsFlushNow,
  workingDraftsDeleteOnBackend: workingDraftsDeleteOnBackend,
  reconcileHasWorkingCopyFlag: reconcileHasWorkingCopyFlag,
  gcWorkingDrafts: gcWorkingDrafts,
};

if (typeof window !== 'undefined') {
  try { window.__SSP_DRAFT_STORE = api; } catch (_) { /* sandboxed write may throw */ }
}

module.exports = api;
