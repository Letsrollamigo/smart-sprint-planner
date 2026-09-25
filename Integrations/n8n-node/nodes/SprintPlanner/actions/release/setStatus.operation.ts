import type { IDataObject, IExecuteFunctions, INodeProperties } from 'n8n-workflow';
import { RELEASE_STATUSES } from '../../shared/constants.js';
import { T } from '../../i18n';
import {
	bad,
	choices,
	collection,
	fld,
	forOp,
	isObj,
	jsonOf,
	optionsOf,
	projectField,
	projectKeyOf,
	releaseField,
	releaseIdOf,
	revisionOf,
	revisionOption,
	type Obj,
} from '../fields';
import { written, type RunContext } from '../runContext';

export const description: INodeProperties[] = forOp('release', 'setStatus', [
	projectField(),
	releaseField(),
	fld('status', { type: 'options', options: choices(RELEASE_STATUSES, T.options.releaseStatus), default: 'prep' }, 'releaseStatus'),
	collection('additionalFields', [fld('snapshot', { type: 'json', default: '{}' })]),
	collection('options', [revisionOption()]),
]);

export async function execute(this: IExecuteFunctions, i: number, run: RunContext): Promise<Obj[]> {
	const key = projectKeyOf(this, i);
	const body: Obj = { id: releaseIdOf(this, i), status: this.getNodeParameter('status', i) as string };
	const a = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
	if (a.snapshot !== undefined && a.snapshot !== '') {
		const snap = jsonOf(a.snapshot, 'snapshot');
		if (!isObj(snap)) throw bad(T.fields.snapshot.displayName, T.problems.json);
		body.snapshot = snap;
	}
	const r = await run.write('rel', key, revisionOf(optionsOf(this, i)), (rev) => run.ops.releasesAction(key, 'setReleaseStatus', { ...body, baseRev: rev }));
	return [written(r)];
}
