// @ts-check
/** Чистые проекции: компактные ответы, свёртка ключей ролей, фильтры. Без сети и без MCP. */
import { ROLE_KEYS, LIMITS } from './constants.js';

/** @typedef {Record<string, unknown>} Obj */
/** @param {unknown} v @returns {v is Obj} */
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
/** @param {string} s */
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
/** @param {Obj} o @param {string} k */
const val = (o, k) => (o[k] === undefined ? null : o[k]);

/** `resource<Роль>` контракта для ключа роли: analysis → resourceAnalysis. @param {string} roleKey */
export const resourceKey = (roleKey) => 'resource' + cap(roleKey);

/** @param {Obj} sprint @returns {Record<string, number>} */
export function resourcesOf(sprint) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const r of ROLE_KEYS) { const v = sprint[resourceKey(r)]; if (typeof v === 'number') out[r] = v; }
  return out;
}

/** Шапка спринта для агента. @param {unknown} sprint */
export function sprintHeader(sprint) {
  if (!isObj(sprint)) return null;
  return {
    sprintId: val(sprint, 'sprintId'), name: val(sprint, 'name'), status: val(sprint, 'status'),
    dateStart: val(sprint, 'dateStart'), dateEnd: val(sprint, 'dateEnd'), sprintGoal: val(sprint, 'sprintGoal'),
    roles: val(sprint, 'roles'), sprintFieldVal: val(sprint, 'sprintFieldVal'), versionFieldVal: val(sprint, 'versionFieldVal'),
    resources: resourcesOf(sprint), updatedBy: val(sprint, 'updatedBy'), updatedAt: val(sprint, 'updatedAt'),
    rev: typeof sprint._rev === 'number' ? sprint._rev : 0
  };
}

/** Тело спринта из входа инструмента: resources → resource<Роль>. @param {Obj} input */
export function sprintBodyFromInput(input) {
  const { resources, ...rest } = input;
  /** @type {Obj} */
  const out = { ...rest };
  if (isObj(resources)) for (const [r, v] of Object.entries(resources)) out[resourceKey(r)] = v;
  return out;
}

/** Задача роли для агента: estimate_<role> → estimate и т. д. @param {Obj} item @param {string} roleKey */
export function itemView(item, roleKey) {
  /** @param {string} fam */
  const num = (fam) => { const v = item[fam + '_' + roleKey]; return typeof v === 'number' ? v : null; };
  return {
    issueId: val(item, 'issueId'), title: val(item, 'title'), state: val(item, 'state'), priority: val(item, 'priority'),
    inclusionStatus: val(item, 'inclusionStatus'), assignee: val(item, 'assignee'),
    estimate: num('estimate'), fact: num('fact'), alloc: num('alloc'),
    excludeReason: val(item, 'excludeReason'), externalTicketId: val(item, 'externalTicketId')
  };
}

/** Тело задачи из входа инструмента. @param {Obj} input @param {string} roleKey */
export function itemBodyFromInput(input, roleKey) {
  const { estimate, fact, alloc, ...rest } = input;
  /** @type {Obj} */
  const out = { ...rest };
  if (estimate !== undefined) out['estimate_' + roleKey] = estimate;
  if (fact !== undefined) out['fact_' + roleKey] = fact;
  if (alloc !== undefined) out['alloc_' + roleKey] = alloc;
  return out;
}

/** Состав по ролям, компактно, с лимитом на роль. @param {unknown} roleItems @param {{ roleKey?: string, includeExcluded?: boolean, limit?: number }} o */
export function itemsByRole(roleItems, { roleKey, includeExcluded = true, limit = LIMITS.itemsPerRole } = {}) {
  /** @type {Record<string, { total: number, count: number, hasMore: boolean, items: ReturnType<typeof itemView>[] }>} */
  const out = {};
  if (!isObj(roleItems)) return out;
  for (const r of ROLE_KEYS) {
    if (roleKey && r !== roleKey) continue;
    const list = roleItems[r];
    if (!Array.isArray(list)) continue;
    const kept = list.filter((it) => isObj(it) && (includeExcluded || it.inclusionStatus !== 'INC_EXCLUDED'));
    const slice = kept.slice(0, limit);
    out[r] = { total: kept.length, count: slice.length, hasMore: kept.length > slice.length, items: slice.map((it) => itemView(/** @type {Obj} */ (it), r)) };
  }
  return out;
}

/** Число задач по ролям (для обзора). @param {unknown} roleItems */
export function itemCounts(roleItems) {
  /** @type {Record<string, number>} */
  const out = {};
  if (!isObj(roleItems)) return out;
  for (const r of ROLE_KEYS) if (Array.isArray(roleItems[r])) out[r] = roleItems[r].length;
  return out;
}

/** Запись истории для агента. @param {Obj} rec @param {boolean} includeItems @param {Record<string,string>} roleLabels */
export function historyView(rec, includeItems, roleLabels) {
  const roleKey = typeof rec.roleKey === 'string' ? rec.roleKey : null;
  const items = Array.isArray(rec.items) ? rec.items : [];
  /** @type {Obj} */
  const out = {
    sprintId: val(rec, 'sprintId'), name: val(rec, 'name'), status: val(rec, 'status'), roleKey,
    roleLabel: roleKey ? (roleLabels[roleKey] || val(rec, 'roleLabel')) : null,
    dateStart: val(rec, 'dateStart'), dateEnd: val(rec, 'dateEnd'), confirmedBy: val(rec, 'confirmedBy'), confirmedAt: val(rec, 'confirmedAt'),
    finishedBy: val(rec, 'finishedBy'), finishedAt: val(rec, 'finishedAt'), isOverLimit: val(rec, 'isOverLimit'), agreed: val(rec, 'agreed'),
    sprintGoal: val(rec, 'sprintGoal'), goalOutcome: val(rec, 'goalOutcome'), itemCount: items.length
  };
  if (includeItems && roleKey) out.items = items.filter(isObj).map((it) => itemView(it, roleKey));
  return out;
}

/** Фильтр записей истории. @param {unknown[]} history @param {{ sprintId?: string, roleKey?: string, status?: string }} f */
export function filterHistory(history, { sprintId, roleKey, status }) {
  return history.filter(isObj).filter((r) =>
    (!sprintId || r.sprintId === sprintId || (typeof r.sprintId === 'string' && r.sprintId.startsWith(sprintId + '_'))) &&
    (!roleKey || r.roleKey === roleKey) && (!status || r.status === status));
}

/** Запись ёмкости для агента. @param {unknown} rec */
export function capacityView(rec) {
  if (!isObj(rec)) return null;
  const persons = isObj(rec.persons) ? rec.persons : {};
  /** @type {Record<string, Obj>} */
  const p = {};
  for (const [login, v] of Object.entries(persons)) {
    if (!isObj(v)) continue;
    p[login] = { grade: val(v, 'grade'), rate: val(v, 'rate'), participation: val(v, 'participation'), alloc: val(v, 'alloc'), base: val(v, 'base') };
  }
  return { sprintId: val(rec, 'sprintId'), mode: val(rec, 'mode'), status: val(rec, 'status'), dirty: val(rec, 'dirty'), approvedBy: val(rec, 'approvedBy'), approvedAt: val(rec, 'approvedAt'), dateEnd: val(rec, 'dateEnd'), persons: p };
}

/** Релиз для агента. @param {Obj} r */
export function releaseView(r) {
  return {
    id: val(r, 'id'), name: val(r, 'name'), kind: val(r, 'kind'), source: val(r, 'source'), status: val(r, 'status'),
    plannedDate: val(r, 'plannedDate'), freezeDate: val(r, 'freezeDate'), freezeLocked: val(r, 'freezeLocked'),
    issues: Array.isArray(r.issues) ? r.issues : [], roleReps: val(r, 'roleReps'), taskUrl: val(r, 'taskUrl'),
    updatedBy: val(r, 'updatedBy'), updatedAt: val(r, 'updatedAt')
  };
}

/** Отсутствия с фильтром по логину и пересечению периода (даты YYYY-MM-DD сравниваются как строки). @param {unknown} absences @param {{ login?: string, from?: string, to?: string }} f */
export function filterAbsences(absences, { login, from, to }) {
  /** @type {Record<string, Obj[]>} */
  const out = {};
  if (!isObj(absences)) return out;
  for (const [l, list] of Object.entries(absences)) {
    if (login && l !== login) continue;
    if (!Array.isArray(list)) continue;
    const kept = list.filter(isObj).filter((e) => (!to || String(e.from) <= to) && (!from || String(e.to) >= from));
    if (kept.length) out[l] = kept;
  }
  return out;
}

/** a ≥ b для X.Y.Z. @param {string} a @param {string} b */
export function semverGte(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) { const x = pa[i] || 0, y = pb[i] || 0; if (x !== y) return x > y; }
  return true;
}
