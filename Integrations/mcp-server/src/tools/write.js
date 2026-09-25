// @ts-check
/** Двенадцать инструментов записи: guards, цикл ревизий, точечные операции. */
import { defineTool } from './common.js';
import { OUT } from '../schemas.js';
import { slotRev, bodyRev, withRev } from '../ops.js';
import { GuardError } from '../errors.js';
import { sprintHeader, sprintBodyFromInput, itemBodyFromInput } from '../shape.js';

/** @typedef {Record<string, unknown>} Obj */
/** @param {unknown} v @returns {v is Obj} */
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server @param {import('../context.js').Ctx} ctx */
export function registerWriteTools(server, ctx) {
  const { ops, schemas: S, t } = ctx;
  const W = { readOnlyHint: false, destructiveHint: false, idempotentHint: true };
  const D = { readOnlyHint: false, destructiveHint: true, idempotentHint: true };

  const readSlotRev = (/** @type {string} */ key) => async () => slotRev(await ops.sprintData(key));
  const readAbsRev = (/** @type {string} */ key) => async () => bodyRev(await ops.absences(key));
  const readRelRev = (/** @type {string} */ key) => async () => bodyRev(await ops.releases(key));
  /** @param {string} action @param {{ result: Obj, retried: boolean }} r */
  const writeResult = (action, r) => ({ text: t('result.written', { action, rev: r.result.rev ?? '—' }) + (r.retried ? ' ' + t('result.retried') : ''), data: { rev: r.result.rev ?? null, applied: r.result.applied ?? null, retried: r.retried, ...(r.result.historyRev !== undefined ? { historyRev: r.result.historyRev } : {}) } });

  defineTool(server, ctx, 'planner_upload_draft', { input: S.write.uploadDraft, output: OUT.uploadDraft, annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false }, handler: async ({ projectKey, sprint, roleItems, overwrite, baseRev }) => {
    const sd = await ops.sprintData(projectKey);
    const active = isObj(sd.settings) && Array.isArray(sd.settings.activeRoles) ? /** @type {string[]} */ (sd.settings.activeRoles) : null;
    if (active) for (const r of Object.keys(roleItems)) if (!active.includes(r)) throw new GuardError('role_not_active', { roleKey: r, activeRoles: active.join(', ') });
    const cur = sprintHeader(sd.sprint);
    const occupied = !!cur && cur.status !== 'FINISHED' && !(cur.status === 'PLANNING' && cur.sprintId === sprint.sprintId);
    if (occupied && !overwrite) throw new GuardError('slot_occupied', { sprintId: String(cur.sprintId), status: String(cur.status), rev: cur.rev });
    /** @type {Obj} */
    const items = {};
    for (const [r, list] of Object.entries(roleItems)) items[r] = (list || []).map((it) => itemBodyFromInput(it, r));
    const body = { sprint: { ...sprintBodyFromInput(sprint), status: 'PLANNING' }, roleItems: items, baseRev: typeof baseRev === 'number' ? baseRev : slotRev(sd) };
    const res = await ops.writeSprint(projectKey, body);
    const data = { rev: res.rev ?? null, enriched: res.enriched ?? null, warnings: Array.isArray(res.warnings) ? res.warnings : [], overwrote: occupied };
    return { text: t('result.uploaded', { sprintId: sprint.sprintId, rev: data.rev ?? '—', warnings: data.warnings.length }), data };
  } });

  defineTool(server, ctx, 'planner_upsert_item', { input: S.write.upsertItem, output: OUT.write, annotations: W, handler: async ({ projectKey, roleKey, item, baseRev }) => {
    const r = await withRev({ baseRev, readRev: readSlotRev(projectKey), run: (rev) => ops.sprintAction(projectKey, 'upsertItem', { roleKey, item: itemBodyFromInput(item, roleKey), baseRev: rev }) });
    return writeResult('upsertItem', r);
  } });

  defineTool(server, ctx, 'planner_remove_item', { input: S.write.removeItem, output: OUT.write, annotations: D, handler: async ({ projectKey, roleKey, issueId, baseRev }) => {
    const r = await withRev({ baseRev, readRev: readSlotRev(projectKey), run: (rev) => ops.sprintAction(projectKey, 'removeItem', { roleKey, issueId, baseRev: rev }) });
    return writeResult('removeItem', r);
  } });

  defineTool(server, ctx, 'planner_patch_sprint', { input: S.write.patchSprint, output: OUT.write, annotations: W, handler: async ({ projectKey, sprint, baseRev }) => {
    const body = sprintBodyFromInput(sprint);
    if (!Object.keys(body).length) throw new GuardError('nothing_to_do');
    const r = await withRev({ baseRev, readRev: readSlotRev(projectKey), run: (rev) => ops.sprintAction(projectKey, 'patchSprint', { sprint: body, baseRev: rev }) });
    return writeResult('patchSprint', r);
  } });

  defineTool(server, ctx, 'planner_assign_person', { input: S.write.assignPerson, output: OUT.write, annotations: W, handler: async ({ projectKey, roleKey, issueId, login, dateStart, dateEnd, baseRev }) => {
    /** @type {Obj} */
    const body = { roleKey, issueId, login };
    if (dateStart !== undefined) body.dateStart = dateStart;
    if (dateEnd !== undefined) body.dateEnd = dateEnd;
    const r = await withRev({ baseRev, readRev: readSlotRev(projectKey), run: (rev) => ops.sprintAction(projectKey, 'assignPerson', { ...body, baseRev: rev }) });
    return writeResult('assignPerson', r);
  } });

  defineTool(server, ctx, 'planner_upsert_absence', { input: S.write.upsertAbsence, output: OUT.write, annotations: W, handler: async ({ projectKey, login, entry, baseRev }) => {
    const r = await withRev({ baseRev, readRev: readAbsRev(projectKey), run: (rev) => ops.absencesAction(projectKey, 'upsertAbsence', { login, entry, baseRev: rev }) });
    return writeResult('upsertAbsence', r);
  } });

  defineTool(server, ctx, 'planner_remove_absence', { input: S.write.removeAbsence, output: OUT.write, annotations: D, handler: async ({ projectKey, login, from, to, baseRev }) => {
    const r = await withRev({ baseRev, readRev: readAbsRev(projectKey), run: (rev) => ops.absencesAction(projectKey, 'removeAbsence', { login, from, to, baseRev: rev }) });
    return writeResult('removeAbsence', r);
  } });

  defineTool(server, ctx, 'planner_upsert_capacity_person', { input: S.write.upsertCapacityPerson, output: OUT.capacityWrite, annotations: W, handler: async ({ projectKey, sprintId, login, person }) => {
    let sid = sprintId;
    if (!sid) { const sd = await ops.sprintData(projectKey); sid = isObj(sd.sprint) && typeof sd.sprint.sprintId === 'string' ? sd.sprint.sprintId : undefined; }
    if (!sid) throw new GuardError('sprint_not_found');
    const res = await ops.capacityAction(projectKey, 'upsertPerson', sid, { login, person });
    return { text: t('result.written', { action: 'upsertPerson', rev: '—' }), data: { sprintId: sid, applied: res.applied ?? null, allocOk: res.allocOk === undefined ? null : res.allocOk } };
  } });

  defineTool(server, ctx, 'planner_upsert_release', { input: S.write.upsertRelease, output: OUT.write, annotations: W, handler: async ({ projectKey, release, baseRev }) => {
    const r = await withRev({ baseRev, readRev: readRelRev(projectKey), run: (rev) => ops.releasesAction(projectKey, 'upsertRelease', { release, baseRev: rev }) });
    return writeResult('upsertRelease', r);
  } });

  defineTool(server, ctx, 'planner_set_release_status', { input: S.write.setReleaseStatus, output: OUT.write, annotations: W, handler: async ({ projectKey, id, status, snapshot, baseRev }) => {
    /** @type {Obj} */
    const body = { id, status };
    if (snapshot !== undefined) body.snapshot = snapshot;
    const r = await withRev({ baseRev, readRev: readRelRev(projectKey), run: (rev) => ops.releasesAction(projectKey, 'setReleaseStatus', { ...body, baseRev: rev }) });
    return writeResult('setReleaseStatus', r);
  } });

  defineTool(server, ctx, 'planner_update_release_issues', { input: S.write.updateReleaseIssues, output: OUT.releaseIssues, annotations: D, handler: async ({ projectKey, id, add, remove, baseRev }) => {
    const toAdd = add || [], toRemove = remove || [];
    if (!toAdd.length && !toRemove.length) throw new GuardError('nothing_to_do');
    /** @type {string[]} */ let added = [];
    /** @type {string[]} */ let removed = [];
    let rev = baseRev;
    let retried = false;
    if (toAdd.length) {
      const r = await withRev({ baseRev, readRev: readRelRev(projectKey), run: (rv) => ops.releasesAction(projectKey, 'addReleaseIssues', { id, issues: toAdd, baseRev: rv }) });
      added = isObj(r.result.applied) && Array.isArray(r.result.applied.added) ? r.result.applied.added : [];
      rev = typeof r.result.rev === 'number' ? r.result.rev : rev;
      retried = r.retried;
    }
    if (toRemove.length) {
      const r = await withRev({ baseRev: rev, readRev: readRelRev(projectKey), run: (rv) => ops.releasesAction(projectKey, 'removeReleaseIssues', { id, issues: toRemove, baseRev: rv }), retry: !toAdd.length });
      removed = isObj(r.result.applied) && Array.isArray(r.result.applied.removed) ? r.result.applied.removed : [];
      rev = typeof r.result.rev === 'number' ? r.result.rev : rev;
      retried = retried || r.retried;
    }
    return { text: t('result.releaseIssues', { id, added: added.length, removed: removed.length, rev: rev ?? '—' }), data: { rev: rev ?? null, added, removed, retried } };
  } });

  defineTool(server, ctx, 'planner_remove_release', { input: S.write.removeRelease, output: OUT.write, annotations: D, handler: async ({ projectKey, id, baseRev }) => {
    const r = await withRev({ baseRev, readRev: readRelRev(projectKey), run: (rev) => ops.releasesAction(projectKey, 'removeRelease', { id, baseRev: rev }) });
    return writeResult('removeRelease', r);
  } });
}
