import type { ILoadOptionsFunctions, INodeListSearchResult } from 'n8n-workflow';
import { makeOps } from '../shared/ops.js';
import { T } from '../i18n';
import { makePlannerCall } from '../transport/planner';
import { ytGet } from '../transport/youtrack';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const PAGE = 50;

/** Ключ проекта из формы (для выражения — пусто: значение известно только при выполнении). */
export function currentProjectKey(fn: ILoadOptionsFunctions): string {
	const v = fn.getCurrentNodeParameter('project', { extractValue: true });
	const s = typeof v === 'string' ? v.trim() : '';
	return s.startsWith('=') ? '' : s;
}

export const listSearch = {
	/** Проекты YouTrack с подключённым планером: страница admin/projects ∩ filter-planner-projects. */
	async searchProjects(this: ILoadOptionsFunctions, filter?: string, paginationToken?: string): Promise<INodeListSearchResult> {
		const skip = Number(paginationToken) || 0;
		const page = await ytGet(this, '/api/admin/projects', { fields: 'shortName,name,archived', query: filter ?? '', $skip: skip, $top: PAGE });
		const list = (Array.isArray(page) ? page : []).filter(isObj).filter((p) => p.archived !== true);
		const keys = list.map((p) => String(p.shortName));
		const found = new Set<string>();
		if (keys.length) {
			const r = await makeOps({ call: makePlannerCall(this) }).filterPlannerProjects(keys);
			for (const p of Array.isArray(r.projects) ? r.projects : []) if (isObj(p)) found.add(String(p.key));
		}
		return {
			results: list.filter((p) => found.has(String(p.shortName))).map((p) => ({ name: `${p.name} (${p.shortName})`, value: String(p.shortName) })),
			paginationToken: Array.isArray(page) && page.length === PAGE ? String(skip + PAGE) : undefined,
		};
	},

	/** Релизы выбранного проекта; проект задан выражением — подсказка выбрать его из списка. */
	async searchReleases(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult> {
		const key = currentProjectKey(this);
		if (!key) return { results: [{ name: T.lists.selectProject, value: '' }] };
		const r = await makeOps({ call: makePlannerCall(this) }).releases(key);
		const f = (filter ?? '').toLowerCase();
		return {
			results: (Array.isArray(r.releases) ? r.releases : [])
				.filter(isObj)
				.map((x) => ({ name: `${x.name ?? x.id} (${x.id})`, value: String(x.id) }))
				.filter((x) => !f || x.name.toLowerCase().includes(f)),
		};
	},
};
