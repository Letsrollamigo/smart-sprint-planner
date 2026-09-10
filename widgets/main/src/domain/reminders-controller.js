/* domain/reminders-controller.js — #112 «Напоминания»: один POST reminders sync при загрузке проекта в
   глобальном режиме (после URL-синка — «Перейти» гоняет _setDashNode), колокольчик со счётчиком в
   ряду .page-header__links, модалка секциями при открытии по режиму «раз в день» (штамп
   ssp_reminders_shown в user-prefs, сравнение с серверным today) / «при каждом открытии»,
   «Перейти» к экземпляру (спека §5.5). Мост window.__SSP_REMINDERS_CTRL; deps приходят
   аргументом (фабрика _remindersDeps() в ядре), стейт ядра — за deps.state.*.
   Ошибка/success:false — колокольчик скрыт, одна строка diag, без тоста (напоминания вторичны).
   Колокольчик открывает ту же модалку из _last. #126 (v3.43.0): после своей записи, которая
   гасит или сдвигает пункты (REFRESH_AFTER), ядро зовёт afterWrite → тот же POST sync без
   модалки при загрузке; до этого список и счётчик жили до перезагрузки страницы.
   Модалка — infra/modal-specs.js showRemindersModal (leaf-мост).
   S5 (v3.41.0): по колокольчику модалка с вкладками «Активные | Журнал» (при загрузке — без);
   журнал грузится лениво (GET reminders-journal, раз на открытие) и удаляется по id
   (POST reminders-journal) — отказ not_addressee / прочее → тост, список не трогается. */
'use strict';

var PURE = (typeof window !== 'undefined' && window.__SSP_REMINDERS_PURE) || {};
var MODAL_SPECS = (typeof window !== 'undefined' && window.__SSP_MODAL_SPECS) || {};
var STAMP_KEY = 'ssp_reminders_shown';
/* Модуль-приватное состояние: ответ последнего sync текущего проекта (сбрасывается на каждой загрузке),
   номер последнего sync (ответ обогнанного запроса не применяется) и таймер отложенного пересчёта. */
var _last = null;
var _seq = 0;
var _refreshTimer = null;
/* #126 — записи, после которых пункты гаснут или сдвигаются: история (завершение роли, первая запись
   слота, даты), sprint-data (даты спринта; через него же сохраняются настройки модулей), ёмкость
   (согласование), релизы (выпуск, отмена, дата). */
var REFRESH_AFTER = { history: true, 'sprint-data': true, capacity: true, releases: true };

function _btn() { return document.getElementById('remindersBellBtn'); }

/* POST, не GET: YouTrack исполняет GET endpoint в read-only транзакции — сверка журнала из GET не пишется (3.41.0) */
function _sync(deps, onLoad) {
  var my = ++_seq, pk = deps.state.getActiveProjectKey();
  return Promise.resolve().then(function () { return deps.apiPost('reminders', { action: 'sync' }); }).then(function (resp) {
    if (my !== _seq || pk !== deps.state.getActiveProjectKey()) return;   /* обогнан более поздним sync / проект сменили — ответ чужой */
    if (!resp || resp.success === false) { deps.diag('reminders: ' + ((resp && resp.error) || 'empty response'), 'warn'); return; }
    _last = resp;
    renderBell(deps);
    if (onLoad) maybeOpenOnLoad(deps);
  }).catch(function (e) { deps.diag('reminders sync failed: ' + (e && e.message ? e.message : e), 'warn'); });
}

function load(deps) {
  _last = null;
  renderBell(deps);
  _bindBell(deps);
  return _sync(deps, true);
}

/* #126 — пересчёт после своей записи: тот же POST sync, модалка при этом не всплывает.
   Напоминания в этой загрузке не поднимались (проектный режим, сбой sync) — молчим. */
function refresh(deps) { return _last ? _sync(deps, false) : Promise.resolve(); }

/* Вход из ядра: apiPost отдаёт сюда каждую запись. Успешная запись из REFRESH_AFTER → один refresh
   через 500 мс (валидация пишет спринт и историю подряд — схлопываем в один запрос). */
function afterWrite(path, promise, depsFactory) {
  if (REFRESH_AFTER[path] !== true || !promise || typeof promise.then !== 'function') return;
  promise.then(function () {
    clearTimeout(_refreshTimer);
    _refreshTimer = setTimeout(function () { _refreshTimer = null; refresh(depsFactory()); }, 500);
  }, function () { /* запись отвергнута — пересчитывать нечего */ });
}

function _bindBell(deps) {
  var btn = _btn();
  if (!btn || btn._sspRemBound) return;
  btn._sspRemBound = true;
  btn.addEventListener('click', function () { openReminders(deps, true); });
}

/* hidden/бейдж/title по bellState; title — только отсюда (data-i18n-title на кнопке нет — один владелец). */
function renderBell(deps) {
  var btn = _btn();
  if (!btn) return;
  var st = PURE.bellState(_last);
  btn.classList.toggle('hidden', !st.visible);
  var badge = btn.querySelector('.ssp-reminders__count');
  if (badge) { badge.textContent = String(st.count); badge.classList.toggle('hidden', !(st.count > 0)); }
  btn.title = st.count > 0 ? deps.T('remBellTitle').replace('{n}', String(st.count)) : deps.T('remBellTitleNone');
}

function _mode(deps) { var s = deps.state.getSettings() || {}; return s.remindersModalMode === 'always' ? 'always' : 'daily'; }
function _stamp(deps) { return PURE.parseStamp(deps.lsGet(STAMP_KEY)); }

function maybeOpenOnLoad(deps) {
  if (!_last) return;
  var mode = _mode(deps);
  if (!PURE.shouldOpenOnLoad({
    enabled: !!_last.enabled, count: _last.count, mode: mode,
    stamp: mode === 'daily' ? _stamp(deps) : {}, today: _last.today, projectKey: deps.state.getActiveProjectKey()
  })) return;
  openReminders(deps);
}

/* Штамп пишется на любое закрытие (крестик/Esc/backdrop/«Закрыть»/«Перейти»); в режиме «always» — нет. */
function markShownToday(deps) {
  if (!_last || _mode(deps) === 'always') return;
  deps.lsSet(STAMP_KEY, JSON.stringify(PURE.nextStamp(_stamp(deps), deps.state.getActiveProjectKey(), _last.today)));
}

/* Причина отказа из ответа (apiGet) или из Error apiPost («reason [cid]»). */
function _reason(x) { return (x && x.reason) || String((x && x.message) || '').split(' ')[0]; }

/* Журнал для тела модалки: load → VM таблицы, remove(id) → VM после удаления (отказ → тост + reject). */
function _journalApi(deps) {
  var vm = function (resp) { return PURE.buildJournalVm(resp, deps.T, deps.fmtDay); };
  return {
    load: function () {
      return Promise.resolve().then(function () { return deps.apiGet('reminders-journal'); }).then(function (resp) {
        if (!resp || resp.success === false) throw new Error(_reason(resp) || 'journal_load_failed');
        return vm(resp);
      });
    },
    remove: function (id) {
      return Promise.resolve().then(function () { return deps.apiPost('reminders-journal', { action: 'delete', id: id }); })
        .then(function (resp) { if (!resp || resp.success === false) throw new Error(_reason(resp) || 'journal_delete_failed'); return vm(resp); })
        .catch(function (e) {
          deps.toast(deps.T(_reason(e) === 'not_addressee' ? 'remJrnNoRights' : 'remJrnDeleteError'), 'err');
          throw e;
        });
    }
  };
}

function openReminders(deps, withJournal) {
  if (!_last || typeof MODAL_SPECS.showRemindersModal !== 'function') return;
  var handle = null;
  handle = MODAL_SPECS.showRemindersModal(PURE.buildVm(_last, deps.T), {
    t: deps.T, openModal: deps.openModal,
    projectName: deps.state.getProjectDisplayName() || deps.state.getActiveProjectKey() || '',
    withJournal: !!withJournal, journal: withJournal ? _journalApi(deps) : null,
    onGo: function (item) { if (handle) handle.close(); go(item, deps); },
    onClose: function () { markShownToday(deps); }
  });
  return handle;
}

/* Спринт текущего слота переключаем только для ёмкости/слота без согласования; историю — нет (все спринты видны). */
function go(item, deps) {
  var t = PURE.navTarget(item);
  if (!t) return;
  try {
    if (t.sprintId && t.sprintId !== deps.state.getCurrentSprintId()) deps.setCurrentSprintId(t.sprintId, { confirmed: true });
    deps.setDashNode(t.node);
    if (t.focus) deps.applyShareFocus(t.focus);
  } catch (e) { deps.diag('reminders go err: ' + e, 'err'); }
}

var _api = { load: load, refresh: refresh, afterWrite: afterWrite, renderBell: renderBell, maybeOpenOnLoad: maybeOpenOnLoad, openReminders: openReminders, markShownToday: markShownToday, go: go };

if (typeof window !== 'undefined') {
  try { window.__SSP_REMINDERS_CTRL = _api; } catch (_) { /* sandboxed write may throw */ }
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = _api;
}
