// @ts-check
/** Восемь инструментов чтения. */
import { defineTool } from './common.js';
import { OUT } from '../schemas.js';
import { slotRev, bodyRev } from '../ops.js';
import { CONTRACT_MIN, LIMITS } from '../constants.js';
import { sprintHeader, itemsByRole, itemCounts, historyView, filterHistory, capacityView, releaseView, filterAbsences, semverGte } from '../shape.js';

/** @typedef {Record<string, unknown>} Obj */
/** @param {unknown} v @returns {v is Obj} */
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
/** @param {Obj} sd */
const activeRolesOf = (sd) => (isObj(sd.settings) && Array.isArray(sd.settings.activeRoles)) ? /** @type {string[]} */ (sd.settings.activeRoles) : null;

/** @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server @param {import('../context.js').Ctx} ctx */
export function registerReadTools(server, ctx) {
  const { ops, schemas: S, t } = ctx;
  const R = { readOnlyHint: true, destructiveHint: false, idempotentHint: true };

  defineTool(server, ctx, 'planner_get_project_overview', { input: S.read.overview, output: OUT.overview, annotations: R, handler: async ({ projectKey }) => {
    const [ver, sd, lock, rel] = await Promise.all([ops.appVersion(), ops.sprintData(projectKey), ops.sprintLock(projectKey), ops.releases(projectKey)]);
    const version = typeof ver.version === 'string' ? ver.version : null;
    const contractOk = !!version && semverGte(version, CONTRACT_MIN);
    const sprint = sprintHeader(sd.sprint);
    const data = {
      version, contractMin: CONTRACT_MIN, contractOk, configured: sd.configured === undefined ? null : sd.configured, activeRoles: activeRolesOf(sd),
      sprint: sprint ? { ...sprint, itemCounts: itemCounts(sd.roleItems) } : null,
      sprintCreationLocked: lock.locked === true,
      releases: { count: Array.isArray(rel.releases) ? rel.releases.length : 0, rev: bodyRev(rel) }
    };
    const text = t('result.overview', { projectKey, version: version || '?', sprint: sprint ? `${sprint.name} (${sprint.status}, rev ${sprint.rev})` : t('result.slotEmpty'), releases: data.releases.count })
      + (contractOk ? '' : ' ' + t('result.contractOld', { version: version || '?', min: CONTRACT_MIN }));
    return { text, data };
  } });

  defineTool(server, ctx, 'planner_get_sprint', { input: S.read.sprint, output: OUT.sprint, annotations: R, handler: async ({ projectKey, roleKey, includeExcluded, includeSettings, limit }) => {
    const sd = await ops.sprintData(projectKey);
    const sprint = sprintHeader(sd.sprint);
    const items = itemsByRole(sd.roleItems, { roleKey, includeExcluded, limit });
    /** @type {Obj} */
    const data = { sprint, activeRoles: activeRolesOf(sd), items, configured: sd.configured === undefined ? null : sd.configured };
    if (includeSettings) data.settings = sd.settings ?? null;
    const counts = Object.entries(items).map(([r, v]) => `${r}: ${v.total}`).join(', ');
    return { text: sprint ? t('result.sprint', { name: sprint.name, status: sprint.status, rev: sprint.rev, counts: counts || '—' }) : t('result.slotEmpty'), data };
  } });

  defineTool(server, ctx, 'planner_get_history', { input: S.read.history, output: OUT.history, annotations: R, handler: async ({ projectKey, sprintId, roleKey, status, limit, includeItems }) => {
    const h = await ops.history(projectKey);
    const all = filterHistory(Array.isArray(h.history) ? h.history : [], { sprintId, roleKey, status });
    const slice = all.slice(0, limit);
    const withItems = includeItems && !!sprintId;
    const data = { rev: bodyRev(h), total: all.length, count: slice.length, hasMore: all.length > slice.length, records: slice.map((r) => historyView(r, withItems, ctx.roleLabels)) };
    return { text: t('result.history', { count: slice.length, total: all.length }) + (includeItems && !sprintId ? ' ' + t('result.itemsNeedSprintId') : ''), data };
  } });

  defineTool(server, ctx, 'planner_get_capacity', { input: S.read.capacity, output: OUT.capacity, annotations: R, handler: async ({ projectKey, sprintId, includeArchive }) => {
    let sid = sprintId;
    if (!sid) { const sd = await ops.sprintData(projectKey); sid = isObj(sd.sprint) && typeof sd.sprint.sprintId === 'string' ? sd.sprint.sprintId : undefined; }
    const cap = sid ? await ops.capacity(projectKey, sid) : null;
    /** @type {Obj} */
    const data = { sprintId: sid ?? null, capacity: cap ? capacityView(cap.capacity) : null, archivedCount: cap && typeof cap.archivedCount === 'number' ? cap.archivedCount : null };
    if (includeArchive) {
      const arc = await ops.capacityArchive(projectKey);
      const list = Array.isArray(arc.archive) ? arc.archive : (Array.isArray(arc.records) ? arc.records : []);
      data.archive = list.slice(0, LIMITS.capacityArchive).map(capacityView);
    }
    const persons = data.capacity && isObj(data.capacity) && isObj(data.capacity.persons) ? Object.keys(data.capacity.persons).length : 0;
    return { text: data.capacity ? t('result.capacity', { sprintId: sid, persons, status: /** @type {Obj} */ (data.capacity).status }) : t('result.capacityNone', { sprintId: sid || '—' }), data };
  } });

  defineTool(server, ctx, 'planner_get_calendar', { input: S.read.calendar, output: OUT.calendar, annotations: R, handler: async ({ projectKey, year }) => {
    const c = await ops.calendar(projectKey);
    const cal = isObj(c.calendar) ? c.calendar : {};
    const years = isObj(cal.years) ? cal.years : {};
    const picked = year ? (years[String(year)] !== undefined ? { [String(year)]: years[String(year)] } : {}) : years;
    const data = { years: picked, uploadedBy: cal.uploadedBy ?? null, uploadedAt: cal.uploadedAt ?? null };
    return { text: t('result.calendar', { years: Object.keys(picked).join(', ') || '—' }), data };
  } });

  defineTool(server, ctx, 'planner_get_absences', { input: S.read.absences, output: OUT.absences, annotations: R, handler: async ({ projectKey, login, from, to }) => {
    const a = await ops.absences(projectKey);
    const absences = filterAbsences(a.absences, { login, from, to });
    const n = Object.values(absences).reduce((s, l) => s + l.length, 0);
    return { text: t('result.absences', { people: Object.keys(absences).length, entries: n }), data: { rev: bodyRev(a), absences } };
  } });

  defineTool(server, ctx, 'planner_get_releases', { input: S.read.releases, output: OUT.releases, annotations: R, handler: async ({ projectKey, status, includeArchive }) => {
    const r = await ops.releases(projectKey);
    const list = (Array.isArray(r.releases) ? r.releases : []).filter(isObj).filter((x) => !status || x.status === status);
    /** @type {Obj} */
    const data = { rev: bodyRev(r), perms: r.perms ?? null, total: list.length, releases: list.slice(0, LIMITS.releases).map(releaseView) };
    if (includeArchive) { const arc = await ops.releasesArchive(projectKey); data.archive = (Array.isArray(arc.releases) ? arc.releases : []).filter(isObj).slice(0, LIMITS.releases).map(releaseView); }
    return { text: t('result.releases', { count: list.length, rev: data.rev }), data };
  } });

  defineTool(server, ctx, 'planner_get_reminders', { input: S.read.reminders, output: OUT.reminders, annotations: R, handler: async ({ projectKey, includeJournal }) => {
    const rem = await ops.reminders(projectKey);
    /** @type {Obj} */
    const data = { enabled: rem.enabled === true, today: rem.today ?? null, count: typeof rem.count === 'number' ? rem.count : 0, items: Array.isArray(rem.items) ? rem.items : [], modules: rem.modules ?? null };
    if (includeJournal) { const j = await ops.remindersJournal(projectKey); data.journal = (Array.isArray(j.journal) ? j.journal : []).slice(0, LIMITS.journal); }
    return { text: data.enabled ? t('result.reminders', { count: data.count }) : t('result.remindersOff'), data };
  } });
}
