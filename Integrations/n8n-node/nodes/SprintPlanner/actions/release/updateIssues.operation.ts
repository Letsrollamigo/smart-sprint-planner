import type { IDataObject, IExecuteFunctions, INodeProperties } from 'n8n-workflow';
import { GuardError } from '../../transport/errors';
import {
	collection,
	fld,
	forOp,
	idListOf,
	isObj,
	optionsOf,
	projectField,
	projectKeyOf,
	releaseField,
	releaseIdOf,
	revisionOf,
	revisionOption,
	type Obj,
} from '../fields';
import type { RunContext } from '../runContext';

export const description: INodeProperties[] = forOp('release', 'updateIssues', [
	projectField(),
	releaseField(),
	collection('additionalFields', [fld('issuesToAdd', { type: 'string', default: '' }), fld('issuesToRemove', { type: 'string', default: '' })]),
	collection('options', [revisionOption()]),
]);

const listOf = (applied: unknown, k: string): string[] => (isObj(applied) && Array.isArray(applied[k]) ? (applied[k] as string[]) : []);

/** Добавление и удаление — две точечные записи по цепочке ревизий; повтор при конфликте — только у первой. */
export async function execute(this: IExecuteFunctions, i: number, run: RunContext): Promise<Obj[]> {
	const key = projectKeyOf(this, i);
	const id = releaseIdOf(this, i);
	const a = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
	const toAdd = idListOf(a.issuesToAdd, 'issuesToAdd');
	const toRemove = idListOf(a.issuesToRemove, 'issuesToRemove');
	if (!toAdd.length && !toRemove.length) throw new GuardError('nothing_to_do');
	let rev = revisionOf(optionsOf(this, i));
	let added: string[] = [];
	let removed: string[] = [];
	let retried = false;
	if (toAdd.length) {
		const r = await run.write('rel', key, rev, (rv) => run.ops.releasesAction(key, 'addReleaseIssues', { id, issues: toAdd, baseRev: rv }));
		added = listOf(r.result.applied, 'added');
		rev = typeof r.result.rev === 'number' ? r.result.rev : rev;
		retried = r.retried;
	}
	if (toRemove.length) {
		const r = await run.write('rel', key, rev, (rv) => run.ops.releasesAction(key, 'removeReleaseIssues', { id, issues: toRemove, baseRev: rv }), !toAdd.length);
		removed = listOf(r.result.applied, 'removed');
		rev = typeof r.result.rev === 'number' ? r.result.rev : rev;
		retried = retried || r.retried;
	}
	return [{ rev: rev ?? null, added, removed, retried }];
}
