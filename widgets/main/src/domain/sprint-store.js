/* sprint-store.js — доменный стор конфликт-канона спринта (ADR-001, второе применение).

   Зона: серверные снапшоты (_serverSnapshot*) + rev-канон (_baseRevHash/_slotRev) —
   база конфликт-детекта черновиков/refresh-merge и optimistic lock слота sprint-data
   (#56-4 rev-lock; прод-баги класса v2.16.6 жили ровно здесь). Стейт инкапсулирован
   ЗДЕСЬ (module-private), не в стейт-ядре core.js — осознанное исключение гейта C1
   (module-registry.json:modules[...].state + stateNote). Мост window.__SSP_SPRINT_STORE.

   Границы (ADR-001, YAGNI): без DomainStore-интерфейса, без PubSub, без транспорта.
   Lifecycle-швы оркеструет ядро: resetProjectSlice() зовётся из _resetProjectStateCaches.
   Консюмеры (working-copy/draft-store/refresh/sprint-controller/youtrack-api) ходят
   через deps.state-аксессоры — ядро делегирует срез сюда (get/set в deps-фабриках core.js).
   Семантика сеттеров/резета скопирована из ядра 1:1 (перенос без изменения поведения). */
'use strict';

/* ── приватный стейт модуля (владелец «конфликт-канона») ─────── */
var _serverSnapshotSprint    = null;  // v5.0.3 — deepClone серверной версии спринта
var _serverSnapshotRoleItems = null;  // v5.0.3 — deepClone серверного состава ролей
var _serverSnapshotCurrentRolePP    = null;  // снимок personalPlanning текущей роли (refresh-merge)
var _serverSnapshotCurrentRoleGantt = null;  // снимок gantt текущей роли
var _baseRevHash = '';  // v5.0.3 — хеш серверной базы (сравнение с черновиком/WC)
var _slotRev     = 0;   // #56-4 — rev слота sprint-data (optimistic lock; синк в youtrack-api)

function getServerSnapshotSprint()        { return _serverSnapshotSprint; }
function setServerSnapshotSprint(v)       { _serverSnapshotSprint = v; }
function getServerSnapshotRoleItems()     { return _serverSnapshotRoleItems; }
function setServerSnapshotRoleItems(v)    { _serverSnapshotRoleItems = v; }
function getServerSnapshotCurrentRolePP()  { return _serverSnapshotCurrentRolePP; }
function setServerSnapshotCurrentRolePP(v) { _serverSnapshotCurrentRolePP = v; }
function getServerSnapshotCurrentRoleGantt()  { return _serverSnapshotCurrentRoleGantt; }
function setServerSnapshotCurrentRoleGantt(v) { _serverSnapshotCurrentRoleGantt = v; }
function getBaseRevHash()  { return _baseRevHash; }
function setBaseRevHash(v) { _baseRevHash = v; }
function getSlotRev()  { return _slotRev; }
function setSlotRev(v) { _slotRev = (typeof v === 'number') ? v : 0; }

/* Сброс per-project — вызывает ядро из _resetProjectStateCaches. Семантика прежнего
   резета 1:1: PP/Gantt-снимки и _slotRev НАМЕРЕННО не чистятся (снимки перезаписывает
   sprint-controller при загрузке роли, slotRev самовосстанавливается первым GET
   sprint-data) — менять это = отдельное решение, не перенос. */
function resetProjectSlice() {
  _serverSnapshotSprint = null;
  _serverSnapshotRoleItems = null;
  _baseRevHash = '';
}

const api = {
  getServerSnapshotSprint: getServerSnapshotSprint, setServerSnapshotSprint: setServerSnapshotSprint,
  getServerSnapshotRoleItems: getServerSnapshotRoleItems, setServerSnapshotRoleItems: setServerSnapshotRoleItems,
  getServerSnapshotCurrentRolePP: getServerSnapshotCurrentRolePP, setServerSnapshotCurrentRolePP: setServerSnapshotCurrentRolePP,
  getServerSnapshotCurrentRoleGantt: getServerSnapshotCurrentRoleGantt, setServerSnapshotCurrentRoleGantt: setServerSnapshotCurrentRoleGantt,
  getBaseRevHash: getBaseRevHash, setBaseRevHash: setBaseRevHash,
  getSlotRev: getSlotRev, setSlotRev: setSlotRev,
  resetProjectSlice: resetProjectSlice,
};

if (typeof window !== 'undefined') {
  try { window.__SSP_SPRINT_STORE = api; } catch (_) { /* sandboxed write may throw */ }
}

module.exports = api;
