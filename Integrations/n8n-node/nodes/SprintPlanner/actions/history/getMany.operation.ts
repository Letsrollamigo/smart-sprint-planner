import type { IExecuteFunctions, INodeProperties } from 'n8n-workflow';
import { LIMITS, ROLE_LABELS, SPRINT_STATUSES } from '../../shared/constants.js';
import { filterHistory, historyView } from '../../shared/shape.js';
import { T } from '../../i18n';
import { BRAND } from '../../branding';
import {
	choices,
	collection,
	fld,
	forOp,
	optionsOf,
	outputOption,
	projectField,
	projectKeyOf,
	raw,
	returnAllLimit,
	roleField,
	text,
	wantsRaw,
	type Obj,
} from '../fields';
import type { RunContext } from '../runContext';

export const description: INodeProperties[] = forOp('history', 'getMany', [
	projectField(),
	...returnAllLimit(LIMITS.history, 500),
	collection('options', [
		fld('includeItems', { type: 'boolean', default: false }),
		outputOption(),
		roleField(false),
		fld('sprintId', { type: 'string', default: '' }, 'sprintIdFilter'),
		fld('status', { type: 'options', options: choices(SPRINT_STATUSES, T.options.sprintStatus), default: 'CONFIRMED' }, 'sprintStatus'),
	]),
]);

export async function execute(this: IExecuteFunctions, i: number, run: RunContext): Promise<Obj[]> {
	const key = projectKeyOf(this, i);
	const o = optionsOf(this, i);
	const h = await run.ops.history(key);
	if (wantsRaw(o)) return [raw(h)];
	const sprintId = text(o.sprintId, 'sprintIdFilter', 100);
	const all = filterHistory(Array.isArray(h.history) ? h.history : [], {
		sprintId,
		roleKey: typeof o.roleKey === 'string' ? o.roleKey : undefined,
		status: typeof o.status === 'string' ? o.status : undefined,
	});
	const max = (this.getNodeParameter('returnAll', i, false) as boolean) ? all.length : (this.getNodeParameter('limit', i, LIMITS.history) as number);
	return all.slice(0, max).map((r) => historyView(r, o.includeItems === true && !!sprintId, ROLE_LABELS[BRAND.lang]));
}
