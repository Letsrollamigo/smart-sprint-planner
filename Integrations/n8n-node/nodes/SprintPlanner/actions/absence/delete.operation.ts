import type { IExecuteFunctions, INodeProperties } from 'n8n-workflow';
import { collection, fld, forOp, isoDateRequired, optionsOf, projectField, projectKeyOf, revisionOf, revisionOption, text, type Obj } from '../fields';
import type { RunContext } from '../runContext';

export const description: INodeProperties[] = forOp('absence', 'delete', [
	projectField(),
	fld('login', { type: 'string', default: '', required: true }),
	fld('from', { type: 'dateTime', default: '', required: true }),
	fld('to', { type: 'dateTime', default: '', required: true }),
	collection('options', [revisionOption()]),
]);

export async function execute(this: IExecuteFunctions, i: number, run: RunContext): Promise<Obj[]> {
	const key = projectKeyOf(this, i);
	const login = text(this.getNodeParameter('login', i, ''), 'login', 200, true) as string;
	const from = isoDateRequired(this.getNodeParameter('from', i, ''), 'from');
	const to = isoDateRequired(this.getNodeParameter('to', i, ''), 'to');
	const r = await run.write('abs', key, revisionOf(optionsOf(this, i)), (rev) => run.ops.absencesAction(key, 'removeAbsence', { login, from, to, baseRev: rev }));
	return [{ deleted: true, rev: r.result.rev ?? null, retried: r.retried }];
}
