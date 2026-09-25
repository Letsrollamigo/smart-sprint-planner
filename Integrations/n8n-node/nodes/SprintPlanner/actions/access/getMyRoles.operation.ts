import type { IExecuteFunctions, INodeProperties } from 'n8n-workflow';
import { forOp, isObj, projectField, projectKeyOf, type Obj } from '../fields';
import type { RunContext } from '../runContext';

/** Роли ответа my-roles (контракт 3.51.0, MyRoles). */
const ROLES = ['editor', 'assigner', 'validator', 'historyManager', 'settingsManager', 'planningManager', 'releaseManager', 'releaseEngineer', 'sprintLockManager'];

export const description: INodeProperties[] = forOp('access', 'getMyRoles', [projectField()]);

export async function execute(this: IExecuteFunctions, i: number, run: RunContext): Promise<Obj[]> {
	const r = await run.ops.myRoles(projectKeyOf(this, i));
	const got = isObj(r.roles) ? r.roles : {};
	const roles: Record<string, boolean> = {};
	for (const k of [...ROLES, ...Object.keys(got)]) roles[k] = got[k] === true;
	return [
		{
			configured: r.configured ?? null,
			disabled: r.disabled ?? null,
			instanceAdmin: r.instanceAdmin ?? null,
			roles,
			list: Object.keys(roles).filter((k) => roles[k]),
		},
	];
}
