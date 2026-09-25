import type { IDataObject, IExecuteFunctions, INodeProperties } from 'n8n-workflow';
import { INCLUSION_STATUSES } from '../../shared/constants.js';
import { itemBodyFromInput } from '../../shared/shape.js';
import { T } from '../../i18n';
import {
	choices,
	collection,
	fld,
	forOp,
	issueIdField,
	issueIdOf,
	minutesField,
	minutesOf,
	optionsOf,
	projectField,
	projectKeyOf,
	revisionOf,
	revisionOption,
	roleField,
	text,
	type Obj,
} from '../fields';
import { written, type RunContext } from '../runContext';

export const description: INodeProperties[] = forOp('sprintItem', 'createOrUpdate', [
	projectField(),
	roleField(),
	issueIdField(),
	collection('additionalFields', [
		minutesField('alloc'),
		fld('assignee', { type: 'string', default: '' }),
		minutesField('estimate'),
		fld('excludeReason', { type: 'string', default: '' }),
		fld('externalTicketId', { type: 'string', default: '' }),
		minutesField('fact'),
		fld('inclusionStatus', { type: 'options', options: choices(INCLUSION_STATUSES, T.options.inclusionStatus), default: 'INC_PLANNED' }),
		fld('title', { type: 'string', default: '' }),
	]),
	collection('options', [revisionOption()]),
]);

export async function execute(this: IExecuteFunctions, i: number, run: RunContext): Promise<Obj[]> {
	const key = projectKeyOf(this, i);
	const roleKey = this.getNodeParameter('roleKey', i) as string;
	const a = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
	const item: Obj = { issueId: issueIdOf(this.getNodeParameter('issueId', i, '')) };
	const put = (k: string, v: unknown) => {
		if (v !== undefined) item[k] = v;
	};
	put('title', text(a.title, 'title', 500));
	put('inclusionStatus', a.inclusionStatus);
	for (const k of ['estimate', 'fact', 'alloc'] as const) if (a[k] !== undefined) item[k] = minutesOf(a[k], k);
	put('excludeReason', text(a.excludeReason, 'excludeReason', 500));
	put('assignee', text(a.assignee, 'assignee', 200));
	put('externalTicketId', text(a.externalTicketId, 'externalTicketId', 200));
	const r = await run.write('slot', key, revisionOf(optionsOf(this, i)), (rev) =>
		run.ops.sprintAction(key, 'upsertItem', { roleKey, item: itemBodyFromInput(item, roleKey), baseRev: rev }),
	);
	return [written(r)];
}
