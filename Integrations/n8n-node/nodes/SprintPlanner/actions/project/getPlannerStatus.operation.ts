import type { IExecuteFunctions, INodeProperties } from 'n8n-workflow';
import { forOp, isObj, projectField, projectKeyOf, type Obj } from '../fields';
import type { RunContext } from '../runContext';

export const description: INodeProperties[] = forOp('project', 'getPlannerStatus', [projectField()]);

export async function execute(this: IExecuteFunctions, i: number, run: RunContext): Promise<Obj[]> {
	const key = projectKeyOf(this, i);
	const r = await run.ops.filterPlannerProjects([key]);
	const f = (Array.isArray(r.projects) ? r.projects : []).filter(isObj).find((p) => p.key === key);
	const status: Obj = { key, attached: !!f, hasMirror: f ? (f.hasMirror ?? null) : null, disabled: f ? f.disabled === true : null, configured: null, version: null };
	if (f && f.disabled !== true) {
		const sd = await run.ops.sprintData(key);
		const ver = await run.ops.appVersion();
		status.configured = sd.configured ?? null;
		status.version = typeof ver.version === 'string' ? ver.version : null;
	}
	return [status];
}
