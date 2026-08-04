/* diag-snapshot.js — экспорт-слепок состояния из диаг-панели (#63 п.4).
   Перепрофилирование TXT-экспорта: вместо «ленты событий» — диагностический слепок
   состояния. Формат `ssp-state-snapshot` (formatVersion 1) ЕДИНЫЙ с фикстурами
   tests/fixtures/prod-snapshots/ (файл юзера → анонимизация → фикстура): версия
   приложения + среда хоста (YT-версия async с фолбэком '?', наличие localStorage/
   host.navigation — грабли YT 2025.3 vs 2026.1, #58) + эффективные настройки +
   срезы состояния (все источники класса D109 рядом: рабочий слот _sprint,
   выбранный спринт/роль, roleItems, rk-снапшоты истории, мета WC, slotRev)
   + err/warn-хвост ленты. Анти-скоуп (⚖ владелец 2026-08-01): без телеметрии/
   авто-отправки, без буферизации payload'ов, happy-path строк в ленту не добавляет.
   Blob-download в OOPIF доказан #48 R4; расширение .txt намеренно (открывается
   везде, дружит с корп-почтой), содержимое — pretty-printed JSON.
   Мост window.__SSP_DIAG_SNAPSHOT; deps приходят аргументом на вызов
   (фабрика _diagSnapshotDeps в ядре). */
'use strict';

var ERR_TAIL_LIMIT = 30;   // хвост err/warn-строк ленты в слепке
var YT_VERSION_TIMEOUT_MS = 1500;

/** Чистая сборка слепка из текущего состояния (характеризуется голденом). */
function buildStateSnapshot(ytVersion, deps) {
  var st = deps.state;
  var hasLs = false;
  try { window.localStorage.setItem('ssp_ls_probe', '1'); window.localStorage.removeItem('ssp_ls_probe'); hasLs = true; } catch (_) {}
  var host = deps.getHost();
  var lang = '?';
  try { lang = window.__SSP_I18N__.getCurrentLang() || '?'; } catch (_) {}
  return {
    format: 'ssp-state-snapshot',
    formatVersion: 1,
    appVersion: deps.APP_VERSION,
    exported: new Date().toISOString(),
    host: {
      ytVersion: ytVersion || '?',
      lang: lang,
      mode: st.getMode(),
      projectKey: st.getProjectKey(),
      hasLocalStorage: hasLs,
      hasHostNavigation: !!(host && host.navigation),
    },
    settings: st.getSettings() || null,
    state: {
      sprint: st.getSprint() || null,
      roleItems: st.getRoleItems() || {},
      history: st.getHistory() || [],
      currentSprintId: st.getCurrentSprintId() || null,
      activeSubtab: st.getActiveSubtab() || null,
      workingDraftKey: st.getActiveWorkingDraftKey() || null,
      slotRev: st.getSlotRev(),
      baseRevHash: st.getBaseRevHash() || null,
    },
    errTail: (st.getDiagLines() || [])
      .filter(function (l) { return l && (l.type === 'err' || l.type === 'warn'); })
      .slice(-ERR_TAIL_LIMIT),
  };
}

/** Клик «Экспорт TXT»: YT-версия асинхронно (таймаут → '?') → слепок → download. */
function downloadStateSnapshot(deps) {
  function fin(ytVersion) {
    try {
      var snap = buildStateSnapshot(ytVersion, deps);
      var ts = new Date();
      var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
      var stamp = ts.getFullYear() + pad(ts.getMonth() + 1) + pad(ts.getDate())
                + '-' + pad(ts.getHours()) + pad(ts.getMinutes()) + pad(ts.getSeconds());
      var blob = new Blob([JSON.stringify(snap, null, 2) + '\n'], { type: 'text/plain;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'ssp-state-' + stamp + '.txt';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      try { deps.toast(deps.T('toastLogExported'), 'success'); } catch (_) {}
    } catch (err) {
      deps.diag('diag export err: ' + err, 'err');
    }
  }
  var vp = null;
  try {
    var host = deps.getHost();
    vp = (host && typeof host.fetchYouTrack === 'function') ? host.fetchYouTrack('config?fields=version,build') : null;
  } catch (_) {}
  if (!vp || typeof vp.then !== 'function') return fin('?');
  var done = false;
  var t = setTimeout(function () { if (!done) { done = true; fin('?'); } }, YT_VERSION_TIMEOUT_MS);
  vp.then(function (r) {
    if (done) return; done = true; clearTimeout(t);
    var v = r && (r.version || r.build) ? String(r.version || r.build) : '?';
    if (r && r.version && r.build) v = r.version + ' (' + r.build + ')';
    fin(v);
  }).catch(function () {
    if (done) return; done = true; clearTimeout(t);
    fin('?');
  });
}

var api = {
  buildStateSnapshot: buildStateSnapshot,
  downloadStateSnapshot: downloadStateSnapshot,
};

if (typeof window !== 'undefined') {
  try { window.__SSP_DIAG_SNAPSHOT = api; } catch (_) { /* sandboxed write may throw */ }
}

if (typeof module !== 'undefined' && module.exports) module.exports = api;
