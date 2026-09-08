'use strict';
/* #114 (строка пула #110 «WebSockets / Long Polling») — подсказка «спринт изменён другим».
   При возврате фокуса вкладки — один лёгкий GET rev слота sprint-data, сравнение с rev,
   который эта вкладка видела, и подсказка в шапке виджета (#widgetSlotChanged).

   Зонд идёт через apiProbeRev, а НЕ через apiGet: apiGet синхронизирует rev слота и базу
   трёхстороннего слияния (#84) — чужие правки стали бы «нашей базой», и следующее
   сохранение молча затёрло бы их. Стейта у модуля нет (гейт C): троттл и последний
   серверный rev живут в document.body.dataset (прецедент _revConflictRefuse).
   Browser bridge: window.__SSP_SLOT_WATCH. Юнит-тест: tests/unit/slot-watch-114.test.js. */

const MIN_GAP_MS = 20000;   /* не чаще раза в 20 с: переключение вкладок туда-сюда — не повод долбить бэкенд */

function _applyHint(show, deps, serverRev, seenRev) {
  var el = document.getElementById('widgetSlotChanged');
  if (!el) return;
  if (show) {
    el.textContent = deps.T('slotChangedHint');
    el.title = 'rev ' + seenRev + ' → ' + serverRev;
    el.classList.remove('hidden');
    deps.diag('[SLOT-WATCH] sprint-data rev ' + seenRev + ' → ' + serverRev + ' — изменён вне вкладки', 'warn');
  } else {
    el.classList.add('hidden');
  }
}

/* Проверить слот сейчас. force=true — без троттла (ручной вызов, тесты). */
function check(deps, force) {
  var body = (typeof document !== 'undefined') ? document.body : null;
  if (!body || !body.dataset) return Promise.resolve(false);
  if (body.dataset.sspRevConflict === '1') return Promise.resolve(false);   /* #100 — вкладка уже заморожена */
  if (!deps.state.getSprint()) return Promise.resolve(false);                /* спринт не загружен — сравнивать не с чем */
  var now = Date.now();
  var last = Number(body.dataset.sspSlotProbeAt || 0);
  if (!force && last && (now - last) < MIN_GAP_MS) return Promise.resolve(false);
  body.dataset.sspSlotProbeAt = String(now);
  return deps.apiProbeRev('sprint-data').then(function (serverRev) {
    var seen = deps.state.getSlotRev();
    var changed = (typeof serverRev === 'number') && serverRev > seen;
    body.dataset.sspSlotServerRev = String(serverRev);
    _applyHint(changed, deps, serverRev, seen);
    return changed;
  }).catch(function (e) {
    deps.diag('slot-watch probe err: ' + ((e && e.message) || e), 'warn');
    return false;
  });
}

/* Повесить слушатель видимости вкладки. Возвращает true, если повесили. */
function install(deps) {
  if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return false;
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') check(deps, false);
  });
  return true;
}

const api = { install, check, MIN_GAP_MS };

if (typeof window !== 'undefined') {
  try { window.__SSP_SLOT_WATCH = api; } catch (_) { /* sandboxed write may throw */ }
}

module.exports = api;
