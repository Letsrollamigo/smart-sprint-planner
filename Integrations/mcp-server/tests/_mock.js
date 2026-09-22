// @ts-check
/** Мок YouTrack для юнитов: fetch по маршрутам контракта с простым состоянием (ревизии растут, конфликт по baseRev). */
import fs from 'node:fs';
import { makeT, loadDictionary } from '../src/i18n/index.js';
import { createLog } from '../src/log.js';
import { contextFactory } from '../src/context.js';
import branding from '../src/branding.js';

export const NOTES = JSON.parse(fs.readFileSync(new URL('../contract/error-codes.notes.json', import.meta.url), 'utf8'));

/** Состояние мок-проекта. */
export function makeState() {
  return {
    version: '3.49.1',
    sprint: { sprintId: 'sprint-1', name: 'Спринт 1', status: 'PLANNING', dateStart: 1790000000000, dateEnd: 1791000000000, resourceAnalysis: 4800, _rev: 5 },
    roleItems: { analysis: [{ issueId: 'DEMO-1', title: 'Задача 1', inclusionStatus: 'INC_PLANNED', estimate_analysis: 480 }, { issueId: 'DEMO-2', inclusionStatus: 'INC_EXCLUDED', excludeReason: 'дубль' }], testing: [] },
    settings: { activeRoles: ['analysis', 'testing'], rates: { secret: 1 } },
    history: { rev: 3, history: [{ sprintId: 'sprint-0_analysis', name: 'Спринт 0', status: 'FINISHED', roleKey: 'analysis', items: [{ issueId: 'DEMO-0', estimate_analysis: 60 }] }] },
    absences: { rev: 2, absences: { ivanov: [{ from: '2026-10-13', to: '2026-10-17', type: 'vacation' }] } },
    releases: { rev: 7, releases: [{ id: 'rel-1', name: 'Р1', status: 'planned', issues: ['DEMO-1'] }], perms: { canManage: true, canAdvance: true } },
    locked: false,
    calls: /** @type {{ method: string, path: string, query: Record<string,string>, body: any, auth: string }[]} */ ([]),
    conflictOnce: false,
    platformStatus: /** @type {number|null} */ (null)
  };
}

/** @param {ReturnType<typeof makeState>} st */
export function mockFetch(st) {
  const refuse = (/** @type {string} */ reason, /** @type {Record<string, unknown>} */ extra = {}) => ({ success: false, error: 'Bad Request', reason, cid: 'cid-test-1', ...extra });
  /** @type {typeof fetch} */
  return async (input, init) => {
    const u = new URL(String(input));
    const m = /\/backend-global\/([a-z-]+)$/.exec(u.pathname);
    const path = m ? m[1] : '';
    const query = Object.fromEntries(u.searchParams.entries());
    const body = init && init.body ? JSON.parse(String(init.body)) : null;
    const auth = String((init && init.headers && /** @type {Record<string,string>} */ (init.headers).Authorization) || '');
    st.calls.push({ method: String(init && init.method), path, query, body, auth });
    const json = (/** @type {unknown} */ b, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
    if (st.platformStatus) return new Response('{"error":"x"}', { status: st.platformStatus });
    if (path !== 'app-version' && query.projectKey !== 'DEMO') return json(refuse('project_unavailable'));
    const action = query.action || '';
    const revGate = (/** @type {number} */ cur) => {
      if (typeof body?.baseRev !== 'number') return refuse('base_rev_required');
      if (st.conflictOnce) { st.conflictOnce = false; return { success: false, error: 'rev_conflict', reason: 'rev_conflict', rev: cur, cid: 'cid-conf' }; }
      if (body.baseRev !== cur) return { success: false, error: 'rev_conflict', reason: 'rev_conflict', rev: cur, cid: 'cid-conf' };
      return null;
    };
    switch (path) {
      case 'app-version': return json({ success: true, version: st.version });
      case 'sprint-lock': return json({ success: true, locked: st.locked });
      case 'sprint-data':
        if (init?.method === 'GET') return json({ success: true, sprint: st.sprint, roleItems: st.roleItems, settings: st.settings, configured: true });
        { const g = revGate(st.sprint ? st.sprint._rev : 0); if (g) return json(g);
          if (action === '') { st.sprint = { ...body.sprint, _rev: (st.sprint?._rev || 0) + 1 }; st.roleItems = body.roleItems; return json({ success: true, rev: st.sprint._rev, enriched: { count: 1, skipped: 0 }, warnings: [] }); }
          if (action === 'upsertItem') { st.sprint._rev++; return json({ success: true, rev: st.sprint._rev, action, applied: { roleKey: body.roleKey, issueId: body.item.issueId, created: true } }); }
          if (action === 'removeItem') { st.sprint._rev++; return json({ success: true, rev: st.sprint._rev, action, applied: { roleKey: body.roleKey, issueId: body.issueId } }); }
          if (action === 'patchSprint') { st.sprint._rev++; return json({ success: true, rev: st.sprint._rev, action, applied: { keys: Object.keys(body.sprint) } }); }
          if (action === 'assignPerson') { if (body.roleKey === 'devDb') return json(refuse('role_record_not_found')); st.sprint._rev++; st.history.rev++; return json({ success: true, rev: st.sprint._rev, historyRev: st.history.rev, action, applied: { issueId: body.issueId, assignee: body.login } }); }
          return json(refuse('invalid_action')); }
      case 'history': return json({ success: true, ...st.history });
      case 'capacity':
        if (init?.method === 'GET') return json({ success: true, sprintId: query.sprintId, capacity: query.sprintId === 'sprint-1' ? { status: 'draft', persons: { ivanov: { grade: 'S', rate: 1, base: 40 } } } : null, archivedCount: 0 });
        if (query.sprintId !== 'sprint-1') return json(refuse('sprint_not_current'));
        return json({ success: true, sprintId: query.sprintId, capacity: {}, action, applied: { login: body.login, created: false }, allocOk: true });
      case 'capacity-archive': return json({ success: true, archive: [] });
      case 'calendar': return json({ success: true, calendar: { years: { '2026': [{ date: '2026-01-01', type: 'holiday' }], '2027': [] } } });
      case 'absences':
        if (init?.method === 'GET') return json({ success: true, ...st.absences });
        { const g = revGate(st.absences.rev); if (g) return json(g); st.absences.rev++; return json({ success: true, rev: st.absences.rev, action, applied: { login: body.login } }); }
      case 'releases':
        if (init?.method === 'GET') return json({ success: true, ...st.releases, archivedCount: 0 });
        { const g = revGate(st.releases.rev); if (g) return json(g); st.releases.rev++;
          const applied = action === 'addReleaseIssues' ? { id: body.id, added: body.issues } : action === 'removeReleaseIssues' ? { id: body.id, removed: body.issues } : { id: body.id || body.release?.id };
          return json({ success: true, rev: st.releases.rev, action, applied }); }
      case 'releases-archive': return json({ success: true, releases: [] });
      case 'reminders': return json({ success: true, enabled: true, today: 1, count: 1, items: [{ id: 'sprints:x', module: 'sprints', kind: 'sprintRoleOpen', entityId: 'x', params: {}, days: 0, ref: {} }], modules: {} });
      case 'reminders-journal': return json({ success: true, journal: [] });
      default: return new Response('HTTP handler not found', { status: 404 });
    }
  };
}

/** Готовый контекст с моком. @param {ReturnType<typeof makeState>} st @param {Partial<{ readOnly: boolean, allowlist: string[], lang: string }>} [o] */
export async function makeTestCtx(st, o = {}) {
  const lang = o.lang || 'ru';
  const t = makeT(await loadDictionary(lang));
  const lines = /** @type {string[]} */ ([]);
  const log = createLog('debug', { write: (s) => lines.push(s) });
  const makeCtx = contextFactory({ baseUrl: 'http://yt.local', appId: 'test-app', timeoutMs: 5000, allowlist: o.allowlist || [], readOnly: !!o.readOnly, lang }, { t, notes: NOTES, log, branding, fetchImpl: mockFetch(st) });
  return { ctx: makeCtx('perm-test-token-XYZ'), lines, t };
}
