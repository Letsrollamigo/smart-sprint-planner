/* domain/reminders-controller.js — #112 «Напоминания»: один GET reminders при загрузке проекта в
   глобальном режиме (после URL-синка — «Перейти» гоняет _setDashNode), колокольчик со счётчиком в
   ряду .page-header__links, модалка секциями при открытии по режиму «раз в день» (штамп
   ssp_reminders_shown в user-prefs, сравнение с серверным today) / «при каждом открытии»,
   «Перейти» к экземпляру (спека §5.5). Мост window.__SSP_REMINDERS_CTRL; deps приходят
   аргументом (фабрика _remindersDeps() в ядре), стейт ядра — за deps.state.*.
   Ошибка/success:false — колокольчик скрыт, одна строка diag, без тоста (напоминания вторичны).
   Повторно в сессии GET не ходит: колокольчик открывает ту же модалку из _last; счётчик
   обновится при следующей загрузке проекта (локальные действия его не пересчитывают —
   осознанное упрощение v3.40.0). Модалка — infra/modal-specs.js showRemindersModal (leaf-мост). */
'use strict';

var PURE = (typeof window !== 'undefined' && window.__SSP_REMINDERS_PURE) || {};
var MODAL_SPECS = (typeof window !== 'undefined' && window.__SSP_MODAL_SPECS) || {};
var STAMP_KEY = 'ssp_reminders_shown';
/* Единственное модуль-приватное состояние: ответ последнего GET текущего проекта (сбрасывается на каждой загрузке). */
var _last = null;

function _btn() { return document.getElementById('remindersBellBtn'); }

function load(deps) {
  _last = null;
  renderBell(deps);
  _bindBell(deps);
  var pk = deps.state.getActiveProjectKey();
  return Promise.resolve().then(function () { return deps.apiGet('reminders'); }).then(function (resp) {
    if (pk !== deps.state.getActiveProjectKey()) return;   /* проект сменили, пока шёл GET — ответ чужой */
    if (!resp || resp.success === false) { deps.diag('reminders: ' + ((resp && resp.error) || 'empty response'), 'warn'); return; }
    _last = resp;
    renderBell(deps);
    maybeOpenOnLoad(deps);
  }).catch(function (e) { deps.diag('reminders GET failed: ' + (e && e.message ? e.message : e), 'warn'); });
}

function _bindBell(deps) {
  var btn = _btn();
  if (!btn || btn._sspRemBound) return;
  btn._sspRemBound = true;
  btn.addEventListener('click', function () { openReminders(deps); });
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

function openReminders(deps) {
  if (!_last || typeof MODAL_SPECS.showRemindersModal !== 'function') return;
  var handle = null;
  handle = MODAL_SPECS.showRemindersModal(PURE.buildVm(_last, deps.T), {
    t: deps.T, openModal: deps.openModal,
    projectName: deps.state.getProjectDisplayName() || deps.state.getActiveProjectKey() || '',
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

var _api = { load: load, renderBell: renderBell, maybeOpenOnLoad: maybeOpenOnLoad, openReminders: openReminders, markShownToday: markShownToday, go: go };

if (typeof window !== 'undefined') {
  try { window.__SSP_REMINDERS_CTRL = _api; } catch (_) { /* sandboxed write may throw */ }
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = _api;
}
