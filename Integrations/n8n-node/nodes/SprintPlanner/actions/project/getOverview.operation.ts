import type { IExecuteFunctions, INodeProperties } from 'n8n-workflow';
import { bodyRev } from '../../shared/ops.js';
import { itemCounts, semverGte, sprintHeader } from '../../shared/shape.js';
import { PLANNER_MIN } from '../../transport/errors';
import { forOp, isObj, projectField, projectKeyOf } from '../fields';
import type { Obj, RunContext } from '../runContext';

export const description: INodeProperties[] = forOp('project', 'getOverview', [projectField()]);

export async function execute(this: IExecuteFunctions, i: number, run: RunContext): Promise<Obj[]> {
	const key = projectKeyOf(this, i);
	const ver = await run.ops.appVersion();
	const sd = await run.ops.sprintData(key);
	const lock = await run.ops.sprintLock(key);
	const rel = await run.ops.releases(key);
	const version = typeof ver.version === 'string' ? ver.version : null;
	const sprint = sprintHeader(sd.sprint);
	return [
		{
			version,
			contractMin: PLANNER_MIN,
			contractOk: !!version && semverGte(version, PLANNER_MIN),
			configured: sd.configured ?? null,
			activeRoles: isObj(sd.settings) && Array.isArray(sd.settings.activeRoles) ? sd.settings.activeRoles : null,
			sprint: sprint ? { ...sprint, itemCounts: itemCounts(sd.roleItems) } : null,
			sprintCreationLocked: lock.locked === true,
			releases: { count: Array.isArray(rel.releases) ? rel.releases.length : 0, rev: bodyRev(rel) },
		},
	];
}
