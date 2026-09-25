import type { IExecuteFunctions, INodeProperties } from 'n8n-workflow';
import { LIMITS } from '../../shared/constants.js';
import { itemsByRole, sprintHeader } from '../../shared/shape.js';
import { collection, fld, forOp, intIn, isObj, optionsOf, outputOption, projectField, projectKeyOf, raw, roleField, wantsRaw, type Obj } from '../fields';
import type { RunContext } from '../runContext';

export const description: INodeProperties[] = forOp('sprint', 'get', [
	projectField(),
	collection('options', [
		fld('includeExcluded', { type: 'boolean', default: true }),
		fld('includeSettings', { type: 'boolean', default: false }),
		fld('limitPerRole', { type: 'number', default: LIMITS.itemsPerRole, typeOptions: { minValue: 1, maxValue: 1000 } }),
		outputOption(),
		roleField(false),
		fld('splitIntoItems', { type: 'boolean', default: false }),
	]),
]);

export async function execute(this: IExecuteFunctions, i: number, run: RunContext): Promise<Obj[]> {
	const key = projectKeyOf(this, i);
	const o = optionsOf(this, i);
	const sd = await run.ops.sprintData(key);
	if (wantsRaw(o)) return [raw(sd)];
	const roleKey = typeof o.roleKey === 'string' ? o.roleKey : undefined;
	const limit = o.limitPerRole === undefined ? LIMITS.itemsPerRole : intIn(o.limitPerRole, 'limitPerRole', 1, 1000);
	const sprint = sprintHeader(sd.sprint);
	const items = itemsByRole(sd.roleItems, { roleKey, includeExcluded: o.includeExcluded !== false, limit });
	if (o.splitIntoItems === true) {
		return Object.entries(items).flatMap(([r, v]) => v.items.map((it) => ({ roleKey: r, sprintId: sprint?.sprintId ?? null, ...it })));
	}
	const data: Obj = {
		sprint,
		activeRoles: isObj(sd.settings) && Array.isArray(sd.settings.activeRoles) ? sd.settings.activeRoles : null,
		items,
		configured: sd.configured ?? null,
	};
	if (o.includeSettings === true) data.settings = sd.settings ?? null;
	return [data];
}
