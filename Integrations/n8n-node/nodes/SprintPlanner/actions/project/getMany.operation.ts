import type { IExecuteFunctions, INodeProperties } from 'n8n-workflow';
import { ytGet } from '../../transport/youtrack';
import { fld, forOp, isObj, returnAllLimit, text, type Obj } from '../fields';
import type { RunContext } from '../runContext';

const PAGE = 100;

export const description: INodeProperties[] = forOp('project', 'getMany', [
	fld('onlyWithPlanner', { type: 'boolean', default: true }),
	fld('search', { type: 'string', default: '' }),
	fld('includeArchived', { type: 'boolean', default: false }),
	...returnAllLimit(50, 5000),
]);

export async function execute(this: IExecuteFunctions, i: number, run: RunContext): Promise<Obj[]> {
	const onlyWithPlanner = this.getNodeParameter('onlyWithPlanner', i, true) as boolean;
	const search = text(this.getNodeParameter('search', i, ''), 'search', 200);
	const includeArchived = this.getNodeParameter('includeArchived', i, false) as boolean;
	const max = (this.getNodeParameter('returnAll', i, false) as boolean) ? Infinity : (this.getNodeParameter('limit', i, 50) as number);
	const out: Obj[] = [];
	for (let skip = 0; out.length < max; skip += PAGE) {
		const page = await ytGet(this, '/api/admin/projects', { fields: 'id,shortName,name,archived', query: search, $skip: skip, $top: PAGE });
		const list = (Array.isArray(page) ? page : []).filter(isObj).filter((p) => includeArchived || p.archived !== true);
		const keys = list.map((p) => String(p.shortName));
		const found = new Map<string, Obj>();
		if (keys.length) {
			const r = await run.ops.filterPlannerProjects(keys);
			for (const p of Array.isArray(r.projects) ? r.projects : []) if (isObj(p)) found.set(String(p.key), p);
		}
		for (const p of list) {
			const f = found.get(String(p.shortName));
			if (onlyWithPlanner && !f) continue;
			out.push({
				key: p.shortName,
				name: p.name,
				id: p.id,
				archived: p.archived === true,
				planner: !!f,
				hasMirror: f ? (f.hasMirror ?? null) : null,
				disabled: f ? f.disabled === true : null,
			});
			if (out.length >= max) break;
		}
		if (!Array.isArray(page) || page.length < PAGE) break;
	}
	return out;
}
