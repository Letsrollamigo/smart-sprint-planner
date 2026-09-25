import type { IExecuteFunctions, INodeProperties } from 'n8n-workflow';
import { collection, forOp, optionsOf, projectField, projectKeyOf, releaseField, releaseIdOf, revisionOf, revisionOption, type Obj } from '../fields';
import type { RunContext } from '../runContext';

export const description: INodeProperties[] = forOp('release', 'delete', [projectField(), releaseField(), collection('options', [revisionOption()])]);

export async function execute(this: IExecuteFunctions, i: number, run: RunContext): Promise<Obj[]> {
	const key = projectKeyOf(this, i);
	const id = releaseIdOf(this, i);
	const r = await run.write('rel', key, revisionOf(optionsOf(this, i)), (rev) => run.ops.releasesAction(key, 'removeRelease', { id, baseRev: rev }));
	return [{ deleted: true, id, rev: r.result.rev ?? null, retried: r.retried }];
}
