import type { IExecuteFunctions, INodeProperties } from 'n8n-workflow';
import { LIMITS, RELEASE_STATUSES } from '../../shared/constants.js';
import { releaseView } from '../../shared/shape.js';
import { T } from '../../i18n';
import { choices, collection, fld, forOp, isObj, optionsOf, outputOption, projectField, projectKeyOf, raw, returnAllLimit, wantsRaw, type Obj } from '../fields';
import type { RunContext } from '../runContext';

export const description: INodeProperties[] = forOp('release', 'getMany', [
	projectField(),
	...returnAllLimit(LIMITS.releases, 1000),
	collection('options', [
		fld('includeArchive', { type: 'boolean', default: false }),
		outputOption(),
		fld('status', { type: 'options', options: choices(RELEASE_STATUSES, T.options.releaseStatus), default: 'planned' }, 'releaseStatusFilter'),
	]),
]);

export async function execute(this: IExecuteFunctions, i: number, run: RunContext): Promise<Obj[]> {
	const key = projectKeyOf(this, i);
	const o = optionsOf(this, i);
	const r = await run.ops.releases(key);
	const arc = o.includeArchive === true ? await run.ops.releasesArchive(key) : null;
	if (wantsRaw(o)) {
		const out = raw(r);
		if (arc) out.archive = raw(arc);
		return [out];
	}
	const status = typeof o.status === 'string' ? o.status : undefined;
	const pick = (body: Obj | null) => (body && Array.isArray(body.releases) ? body.releases : []).filter(isObj).filter((x) => !status || x.status === status);
	const list: Obj[] = [...pick(r).map(releaseView), ...pick(arc).map((x) => ({ ...releaseView(x), archived: true }))];
	const max = (this.getNodeParameter('returnAll', i, false) as boolean) ? list.length : (this.getNodeParameter('limit', i, LIMITS.releases) as number);
	return list.slice(0, max);
}
