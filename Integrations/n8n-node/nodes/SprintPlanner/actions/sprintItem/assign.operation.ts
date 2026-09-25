import type { IDataObject, IExecuteFunctions, INodeProperties } from 'n8n-workflow';
import {
	collection,
	epochOf,
	fld,
	forOp,
	issueIdField,
	issueIdOf,
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

export const description: INodeProperties[] = forOp('sprintItem', 'assign', [
	projectField(),
	roleField(),
	issueIdField(),
	fld('assignee', { type: 'string', default: '' }, 'assignLogin'),
	collection('additionalFields', [fld('workStart', { type: 'dateTime', default: '' }), fld('workEnd', { type: 'dateTime', default: '' })]),
	collection('options', [revisionOption()]),
]);

export async function execute(this: IExecuteFunctions, i: number, run: RunContext): Promise<Obj[]> {
	const key = projectKeyOf(this, i);
	const a = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
	const body: Obj = {
		roleKey: this.getNodeParameter('roleKey', i) as string,
		issueId: issueIdOf(this.getNodeParameter('issueId', i, '')),
		login: text(this.getNodeParameter('assignee', i, ''), 'assignLogin', 200) ?? null,
	};
	const ds = epochOf(a.workStart, 'workStart');
	const de = epochOf(a.workEnd, 'workEnd');
	if (ds !== undefined) body.dateStart = ds;
	if (de !== undefined) body.dateEnd = de;
	const r = await run.write('slot', key, revisionOf(optionsOf(this, i)), (rev) => run.ops.sprintAction(key, 'assignPerson', { ...body, baseRev: rev }));
	return [written(r)];
}
