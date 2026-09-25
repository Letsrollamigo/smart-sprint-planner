// @ts-check
/** Операции контракта как функции + цикл ревизий. Ничего не знает об MCP. */
import { PlannerRefusal } from './errors.js';

/** @typedef {{ call: (method: 'GET'|'POST', path: string, opts?: { projectKey?: string, query?: Record<string, unknown>, body?: unknown }) => Promise<Record<string, unknown>> }} Client */

/** @param {Client} client */
export function makeOps(client) {
  /** @param {string} path @param {string} key @param {Record<string, unknown>} [query] */
  const get = (path, key, query) => client.call('GET', path, { projectKey: key, query });
  /** @param {string} path @param {string} key @param {unknown} body @param {Record<string, unknown>} [query] */
  const post = (path, key, body, query) => client.call('POST', path, { projectKey: key, body, query });
  return {
    appVersion: () => client.call('GET', 'app-version'),
    filterPlannerProjects: (/** @type {string[]} */ keys) => client.call('POST', 'filter-planner-projects', { body: { keys } }),
    myRoles: (/** @type {string} */ key) => get('my-roles', key),
    sprintData: (/** @type {string} */ key) => get('sprint-data', key),
    history: (/** @type {string} */ key) => get('history', key),
    capacity: (/** @type {string} */ key, /** @type {string|undefined} */ sprintId) => get('capacity', key, { sprintId }),
    capacityArchive: (/** @type {string} */ key) => get('capacity-archive', key),
    calendar: (/** @type {string} */ key) => get('calendar', key),
    absences: (/** @type {string} */ key) => get('absences', key),
    releases: (/** @type {string} */ key) => get('releases', key),
    releasesArchive: (/** @type {string} */ key) => get('releases-archive', key),
    reminders: (/** @type {string} */ key) => get('reminders', key),
    remindersJournal: (/** @type {string} */ key) => get('reminders-journal', key),
    sprintLock: (/** @type {string} */ key) => get('sprint-lock', key),
    writeSprint: (/** @type {string} */ key, /** @type {unknown} */ body) => post('sprint-data', key, body),
    sprintAction: (/** @type {string} */ key, /** @type {string} */ action, /** @type {unknown} */ body) => post('sprint-data', key, body, { action }),
    absencesAction: (/** @type {string} */ key, /** @type {string} */ action, /** @type {unknown} */ body) => post('absences', key, body, { action }),
    releasesAction: (/** @type {string} */ key, /** @type {string} */ action, /** @type {unknown} */ body) => post('releases', key, body, { action }),
    capacityAction: (/** @type {string} */ key, /** @type {string} */ action, /** @type {string} */ sprintId, /** @type {unknown} */ body) => post('capacity', key, body, { action, sprintId })
  };
}

/** Ревизия рабочего слота из ответа GET sprint-data: sprint:null → 0. @param {Record<string, unknown>} sd */
export function slotRev(sd) {
  const s = sd && sd.sprint;
  return s && typeof s === 'object' && typeof (/** @type {Record<string, unknown>} */ (s))._rev === 'number' ? /** @type {number} */ ((/** @type {Record<string, unknown>} */ (s))._rev) : 0;
}

/** Ревизия из ответа GET history/absences/releases. @param {Record<string, unknown>} body */
export function bodyRev(body) { return typeof body.rev === 'number' ? body.rev : 0; }

/**
 * Цикл ревизий. baseRev передан агентом → один вызов, конфликт — наружу. Не передан → читаем ревизию,
 * зовём; при rev_conflict и retry — повтор ровно один раз с ревизией из отказа (или перечитанной).
 * @template T
 * @param {{ baseRev?: number, readRev: () => Promise<number>, run: (rev: number) => Promise<T>, retry?: boolean }} o
 * @returns {Promise<{ result: T, retried: boolean }>}
 */
export async function withRev({ baseRev, readRev, run, retry = true }) {
  if (typeof baseRev === 'number') return { result: await run(baseRev), retried: false };
  const rev = await readRev();
  try {
    return { result: await run(rev), retried: false };
  } catch (e) {
    if (!(retry && e instanceof PlannerRefusal && e.reason === 'rev_conflict')) throw e;
    const next = e.rev !== null ? e.rev : await readRev();
    return { result: await run(next), retried: true };
  }
}
