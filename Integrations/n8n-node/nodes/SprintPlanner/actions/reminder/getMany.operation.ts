import type { IExecuteFunctions, INodeProperties } from 'n8n-workflow';
import { LIMITS } from '../../shared/constants.js';
import { collection, fld, forOp, isObj, optionsOf, outputOption, projectField, projectKeyOf, raw, wantsRaw, type Obj } from '../fields';
import type { RunContext } from '../runContext';

export const description: INodeProperties[] = forOp('reminder', 'getMany', [
	projectField(),
	collection('options', [fld('includeJournal', { type: 'boolean', default: false }), outputOption()]),
]);

export async function execute(this: IExecuteFunctions, i: number, run: RunContext): Promise<Obj[]> {
	const key = projectKeyOf(this, i);
	const o = optionsOf(this, i);
	const rem = await run.ops.reminders(key);
	const j = o.includeJournal === true ? await run.ops.remindersJournal(key) : null;
	if (wantsRaw(o)) {
		const out = raw(rem);
		if (j) out.journal = raw(j);
		return [out];
	}
	const items = (Array.isArray(rem.items) ? rem.items : []).filter(isObj).map((it) => ({ kind: 'reminder', ...it }));
	const journal = j && Array.isArray(j.journal) ? j.journal.filter(isObj).slice(0, LIMITS.journal).map((e) => ({ kind: 'journal', ...e })) : [];
	return [...items, ...journal];
}
