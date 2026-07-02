/* release-store.js — доменный стор релиз-менеджмента (#48, ADR-001).

   Пилот «state out of core»: стейт RM инкапсулирован ЗДЕСЬ (module-private),
   а не в стейт-ядре core.js — осознанное исключение гейта C1
   (module-registry.json:modules[...].state + stateNote). Мост window.__SSP_RELEASE_STORE.

   Границы (ADR-001, YAGNI): без формального DomainStore-интерфейса (одна реализация),
   без PubSub — приложение рендерит императивно (mutate → explicit render-call).
   Lifecycle-швы ОРКЕСТРИРУЕТ ядро: оно зовёт reset()/serialize()/hydrate() в своих
   точках (reset — из _resetProjectStateCaches; draft-персист — R1.2). Транспорта
   (localStorage/BroadcastChannel) здесь НЕТ. Консюмеры (release-view/-controller, R1.2+)
   ходят через deps.state.release.* — ядро делегирует срез сюда (_releaseDeps() в core.js). */
'use strict';

/* ── приватный стейт модуля (владелец «релизного среза») ─────── */
var _releases      = [];    // список релизов проекта (незакрытые + недавние)
var _currentId     = null;  // id выбранного релиза
var _freezeLocks   = {};    // releaseId → bool (заморозка состава/дат)
var _snapshotDraft = null;  // буфер сбора слепка при закрытии (консюмер — R1.5)
var _pickState     = null;  // состояние пикера задач/представителей (R1.3/R1.4)
var _issueData     = {};    // idReadable → {summary,state,resolved} (состав карточки + светофор, R1.4/R3.1)
var _repNames      = {};    // login → fullName (отображение представителей на карточке, R1.5)
var _perms         = null;  // права релиз-ролей из GET /releases (R2.4); null → deny-by-default
var _archive       = null;  // архив истории (R4, US-R4-02); null → ещё не загружен (lazy)
var _archivedCount = 0;     // счётчик архива из GET /releases (спойлер «Архив (N)»)

function getReleases()        { return _releases; }
function setReleases(v)       { _releases = Array.isArray(v) ? v : []; }
function getCurrent()         { return _currentId; }
function setCurrent(id)       { _currentId = id || null; }
function getFreezeLock(id)    { return !!_freezeLocks[id]; }
function setFreezeLock(id, v) { if (id) _freezeLocks[id] = !!v; }
function getSnapshotDraft()   { return _snapshotDraft; }
function setSnapshotDraft(v)  { _snapshotDraft = v || null; }
function getPickState()       { return _pickState; }
function setPickState(v)      { _pickState = v || null; }
function getIssueData()       { return _issueData; }
function setIssueData(m)      { _issueData = (m && typeof m === 'object' && !Array.isArray(m)) ? m : {}; }
function getRepNames()        { return _repNames; }
function setRepNames(m)       { _repNames = (m && typeof m === 'object' && !Array.isArray(m)) ? m : {}; }
function getPerms()           { return _perms || { canManage: false, canAdvance: false }; }
function setPerms(v)          { _perms = (v && typeof v === 'object') ? { canManage: !!v.canManage, canAdvance: !!v.canAdvance } : null; }
function getArchive()         { return _archive; }
function setArchive(v)        { _archive = Array.isArray(v) ? v : null; }
function getArchivedCount()   { return _archivedCount; }
function setArchivedCount(n)  { _archivedCount = (typeof n === 'number' && n > 0) ? n : 0; }

/* Сброс per-project — вызывает ядро из _resetProjectStateCaches. deps для diag/симметрии. */
function reset(deps) {
  _releases = [];
  _currentId = null;
  _freezeLocks = {};
  _snapshotDraft = null;
  _pickState = null;
  _issueData = {};
  _repNames = {};
  _perms = null;
  _archive = null;
  _archivedCount = 0;
  if (deps && typeof deps.diag === 'function') deps.diag('release-store reset (per-project)', 'ok');
}

/* draft-персист (вызывает ядро): durable-срез в слот и обратно. Transient-буферы
   (_snapshotDraft/_pickState) НЕ персистятся — эфемерны в рамках операции. */
function serialize() {
  return { releases: _releases, currentId: _currentId, freezeLocks: _freezeLocks };
}
function hydrate(slot) {
  if (!slot || typeof slot !== 'object') return;
  _releases    = Array.isArray(slot.releases) ? slot.releases : [];
  _currentId   = slot.currentId || null;
  _freezeLocks = (slot.freezeLocks && typeof slot.freezeLocks === 'object') ? slot.freezeLocks : {};
}

const api = {
  getReleases: getReleases, setReleases: setReleases,
  getCurrent: getCurrent, setCurrent: setCurrent,
  getFreezeLock: getFreezeLock, setFreezeLock: setFreezeLock,
  getSnapshotDraft: getSnapshotDraft, setSnapshotDraft: setSnapshotDraft,
  getPickState: getPickState, setPickState: setPickState,
  getIssueData: getIssueData, setIssueData: setIssueData,
  getRepNames: getRepNames, setRepNames: setRepNames,
  getPerms: getPerms, setPerms: setPerms,
  getArchive: getArchive, setArchive: setArchive,
  getArchivedCount: getArchivedCount, setArchivedCount: setArchivedCount,
  reset: reset, serialize: serialize, hydrate: hydrate,
};

if (typeof window !== 'undefined') {
  try { window.__SSP_RELEASE_STORE = api; } catch (_) { /* sandboxed write may throw */ }
}

module.exports = api;
