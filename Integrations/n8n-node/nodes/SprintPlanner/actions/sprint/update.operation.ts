import type { IDataObject, IExecuteFunctions, INodeProperties } from 'n8n-workflow';
import { sprintBodyFromInput } from '../../shared/shape.js';
import { GuardError } from '../../transport/errors';
import { collection, fld, forOp, optionsOf, projectField, projectKeyOf, revisionOf, revisionOption, type Obj } from '../fields';
import { written, type RunContext } from '../runContext';
import { optionalHeaderFields, readHeader } from './header';

export const description: INodeProperties[] = forOp('sprint', 'update', [
	projectField(),
	collection('updateFields', [
		fld('name', { type: 'string', default: '' }),
		fld('dateStart', { type: 'dateTime', default: '' }),
		fld('dateEnd', { type: 'dateTime', default: '' }),
		...optionalHeaderFields(),
	]),
	collection('options', [revisionOption()]),
]);

export async function execute(this: IExecuteFunctions, i: number, run: RunContext): Promise<Obj[]> {
	const key = projectKeyOf(this, i);
	const body = sprintBodyFromInput(readHeader(this.getNodeParameter('updateFields', i, {}) as IDataObject));
	if (!Object.keys(body).length) throw new GuardError('nothing_to_do');
	const r = await run.write('slot', key, revisionOf(optionsOf(this, i)), (rev) => run.ops.sprintAction(key, 'patchSprint', { sprint: body, baseRev: rev }));
	return [written(r)];
}
