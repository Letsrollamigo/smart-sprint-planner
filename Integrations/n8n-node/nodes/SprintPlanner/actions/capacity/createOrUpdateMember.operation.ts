import type { IDataObject, IExecuteFunctions, INodeProperties } from 'n8n-workflow';
import { GuardError } from '../../transport/errors';
import { collection, fld, forOp, numIn, projectField, projectKeyOf, roleMapField, roleMapOf, text, type Obj } from '../fields';
import type { RunContext } from '../runContext';
import { sprintIdOrSlot } from './get.operation';

const share = (name: string, text: 'rate' | 'participation' | 'share') =>
	fld(name, { type: 'number', default: 1, typeOptions: { minValue: 0, maxValue: 1, numberPrecision: 2 } }, text);

export const description: INodeProperties[] = forOp('capacity', 'createOrUpdateMember', [
	projectField(),
	fld('login', { type: 'string', default: '', required: true }),
	collection('additionalFields', [
		roleMapField('allocation', share('share', 'share')),
		fld('grade', { type: 'string', default: '' }),
		share('participation', 'participation'),
		share('rate', 'rate'),
		fld('sprintId', { type: 'string', default: '' }, 'sprintIdDefault'),
	]),
]);

export async function execute(this: IExecuteFunctions, i: number, run: RunContext): Promise<Obj[]> {
	const key = projectKeyOf(this, i);
	const login = text(this.getNodeParameter('login', i, ''), 'login', 200, true) as string;
	const a = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
	const person: Obj = {};
	const grade = text(a.grade, 'grade', 64);
	if (grade !== undefined) person.grade = grade;
	if (a.rate !== undefined) person.rate = numIn(a.rate, 'rate', 0, 1);
	if (a.participation !== undefined) person.participation = numIn(a.participation, 'participation', 0, 1);
	const alloc = roleMapOf(a.allocation, 'share');
	if (Object.keys(alloc).length) {
		const m: Obj = {};
		for (const [r, v] of Object.entries(alloc)) m[r] = numIn(v, 'share', 0, 1);
		person.alloc = m;
	}
	const sid = await sprintIdOrSlot(run, key, text(a.sprintId, 'sprintIdDefault', 100));
	if (!sid) throw new GuardError('sprint_not_found');
	const res = await run.ops.capacityAction(key, 'upsertPerson', sid, { login, person });
	return [{ sprintId: sid, applied: res.applied ?? null, allocOk: res.allocOk ?? null }];
}
