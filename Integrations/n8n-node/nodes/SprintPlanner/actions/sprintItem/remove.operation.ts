import type { IExecuteFunctions, INodeProperties } from 'n8n-workflow';
import { collection, forOp, issueIdField, issueIdOf, optionsOf, projectField, projectKeyOf, revisionOf, revisionOption, roleField, type Obj } from '../fields';
import { written, type RunContext } from '../runContext';

export const description: INodeProperties[] = forOp('sprintItem', 'remove', [
	projectField(),
	roleField(),
	issueIdField(),
	collection('options', [revisionOption()]),
]);

export async function execute(this: IExecuteFunctions, i: number, run: RunContext): Promise<Obj[]> {
	const key = projectKeyOf(this, i);
	const roleKey = this.getNodeParameter('roleKey', i) as string;
	const issueId = issueIdOf(this.getNodeParameter('issueId', i, ''));
	const r = await run.write('slot', key, revisionOf(optionsOf(this, i)), (rev) =>
		run.ops.sprintAction(key, 'removeItem', { roleKey, issueId, baseRev: rev }),
	);
	return [written(r)];
}
