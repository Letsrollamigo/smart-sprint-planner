import type { IDataObject, IExecuteFunctions, INodeProperties } from 'n8n-workflow';
import { RELEASE_KINDS, RELEASE_SOURCES, RELEASE_STATUSES } from '../../shared/constants.js';
import { T } from '../../i18n';
import {
	choices,
	collection,
	epochOf,
	fld,
	forOp,
	optionsOf,
	projectField,
	projectKeyOf,
	revisionOf,
	revisionOption,
	roleMapField,
	roleMapOf,
	text,
	type Obj,
} from '../fields';
import { written, type RunContext } from '../runContext';

export const description: INodeProperties[] = forOp('release', 'createOrUpdate', [
	projectField(),
	fld('releaseId', { type: 'string', default: '', required: true }),
	collection('additionalFields', [
		fld('freezeDate', { type: 'dateTime', default: '' }),
		fld('freezeLocked', { type: 'boolean', default: false }),
		fld('kind', { type: 'options', options: choices(RELEASE_KINDS, T.options.releaseKind), default: 'release' }),
		fld('name', { type: 'string', default: '' }, 'releaseName'),
		fld('notes', { type: 'string', default: '', typeOptions: { rows: 4 } }),
		fld('patchNote', { type: 'string', default: '', typeOptions: { rows: 4 } }),
		fld('plannedDate', { type: 'dateTime', default: '' }),
		roleMapField('roleReps', fld('login', { type: 'string', default: '' }, 'repLogin')),
		fld('source', { type: 'options', options: choices(RELEASE_SOURCES, T.options.releaseSource), default: 'internal' }),
		fld('status', { type: 'options', options: choices(RELEASE_STATUSES, T.options.releaseStatus), default: 'planned' }, 'releaseStatus'),
		fld('taskUrl', { type: 'string', default: '' }),
	]),
	collection('options', [revisionOption()]),
]);

export async function execute(this: IExecuteFunctions, i: number, run: RunContext): Promise<Obj[]> {
	const key = projectKeyOf(this, i);
	const a = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
	const release: Obj = { id: text(this.getNodeParameter('releaseId', i, ''), 'releaseId', 64, true) };
	const put = (k: string, v: unknown) => {
		if (v !== undefined) release[k] = v;
	};
	put('name', text(a.name, 'releaseName', 200));
	put('kind', a.kind);
	put('source', a.source);
	put('status', a.status);
	put('plannedDate', epochOf(a.plannedDate, 'plannedDate'));
	put('freezeDate', epochOf(a.freezeDate, 'freezeDate'));
	put('freezeLocked', a.freezeLocked);
	put('patchNote', text(a.patchNote, 'patchNote', 20000));
	put('notes', text(a.notes, 'notes', 20000));
	put('taskUrl', text(a.taskUrl, 'taskUrl', 2000));
	const reps = roleMapOf(a.roleReps, 'login');
	if (Object.keys(reps).length) {
		const m: Obj = {};
		for (const [r, v] of Object.entries(reps)) m[r] = text(v, 'repLogin', 128) ?? null;
		release.roleReps = m;
	}
	const r = await run.write('rel', key, revisionOf(optionsOf(this, i)), (rev) => run.ops.releasesAction(key, 'upsertRelease', { release, baseRev: rev }));
	return [written(r)];
}
