/* capacity-store.js — доменный стор ёмкости #45 (ADR-001, третье применение после
   sprint-store/release-store; R6 — вынос из стейт-ядра core.js, аудит §7 п.14).

   Зона: стейт вкладки «Ёмкость» (_capacity/_calendar/_absences/_capacityRoster/
   _capacityUiState) + кэш утверждённой ёмкости ПЛАНИРУЕМОГО спринта (_planCap/
   _planCapLoading, #45 R4 — отвязан от вкладки: она может смотреть другой спринт).
   Стейт инкапсулирован ЗДЕСЬ (module-private) — осознанное исключение гейта C1
   (module-registry.json:modules[...].state + stateNote). Мост window.__SSP_CAPACITY_STORE.

   Границы (ADR-001, YAGNI): без DomainStore-интерфейса, без PubSub, без транспорта.
   Семантика сеттеров скопирована из ядра 1:1 (setAbsences/setRoster/setUiState коэрсят
   null → {}). Смена проекта сбрасывает ТОЛЬКО planCap (invalidatePlanCap(null) из
   _resetProjectStateCaches — как в ядре с v3.2.1): остальной срез перезатирает fetch
   вкладки при загрузке — «дочинивать» это тут молча нельзя (поведение 1:1). */
'use strict';

/* ── приватный стейт модуля (владелец домена «ёмкость») ─────── */
var _capacity = null;          // запись ёмкости выбранного на вкладке спринта (или null)
var _calendar = null;          // производственный календарь (full map)
var _absences = {};            // реестр отсутствий (full map login→[entry])
var _capacityRoster = {};      // {roleKey:[{login,name}]}
var _capacityUiState = { selectedSprintId: null, selectedPerson: null, persons: null, absences: null, carry: null };
var _planCap = { sprintId: null, record: null };   // #45 R4 — кэш утверждённой ёмкости планируемого спринта
var _planCapLoading = false;

function getCapacity()        { return _capacity; }
function setCapacity(v)       { _capacity = v; }
function getCalendar()        { return _calendar; }
function setCalendar(v)       { _calendar = v; }
function getAbsences()        { return _absences; }
function setAbsences(v)       { _absences = v || {}; }
function getRoster()          { return _capacityRoster; }
function setRoster(v)         { _capacityRoster = v || {}; }
function getCapacityUiState() { return _capacityUiState; }
function setCapacityUiState(v){ _capacityUiState = v || {}; }
function getPlanCap()         { return _planCap; }
function setPlanCap(v)        { _planCap = (v && typeof v === 'object') ? v : { sprintId: null, record: null }; }
function isPlanCapLoading()   { return _planCapLoading; }
function setPlanCapLoading(v) { _planCapLoading = !!v; }

/* Сброс кэша утверждённой ёмкости: sid не задан (смена проекта) ИЛИ совпал с кэшем
   (save/approve на вкладке «Ёмкость» — иначе Full-остатки живут по устаревшей записи
   до F5, v3.2.1). Логика 1:1 из ядра. */
function invalidatePlanCap(sid) {
  if (!sid || _planCap.sprintId === sid) {
    _planCap = { sprintId: null, record: null };
    _planCapLoading = false;
  }
}

const api = {
  getCapacity: getCapacity, setCapacity: setCapacity,
  getCalendar: getCalendar, setCalendar: setCalendar,
  getAbsences: getAbsences, setAbsences: setAbsences,
  getRoster: getRoster, setRoster: setRoster,
  getCapacityUiState: getCapacityUiState, setCapacityUiState: setCapacityUiState,
  getPlanCap: getPlanCap, setPlanCap: setPlanCap,
  isPlanCapLoading: isPlanCapLoading, setPlanCapLoading: setPlanCapLoading,
  invalidatePlanCap: invalidatePlanCap,
};

if (typeof window !== 'undefined') {
  try { window.__SSP_CAPACITY_STORE = api; } catch (_) { /* sandboxed write may throw */ }
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
