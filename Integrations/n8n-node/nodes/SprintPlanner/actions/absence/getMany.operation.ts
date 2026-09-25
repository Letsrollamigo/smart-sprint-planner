import type { IExecuteFunctions, INodeProperties } from 'n8n-workflow';
import { filterAbsences } from '../../shared/shape.js';
import { collection, fld, forOp, isoDateOf, optionsOf, outputOption, projectField, projectKeyOf, raw, text, wantsRaw, type Obj } from '../fields';
import type { RunContext } from '../runContext';

export const description: INodeProperties[] = forOp('absence', 'getMany', [
	projectField(),
	collection('options', [
		fld('login', { type: 'string', default: '' }, 'loginFilter'),
		outputOption(),
		fld('periodFrom', { type: 'dateTime', default: '' }),
		fld('periodTo', { type: 'dateTime', default: '' }),
	]),
]);

export async function execute(this: IExecuteFunctions, i: number, run: RunContext): Promise<Obj[]> {
	const key = projectKeyOf(this, i);
	const o = optionsOf(this, i);
	const a = await run.ops.absences(key);
	if (wantsRaw(o)) return [raw(a)];
	const byLogin = filterAbsences(a.absences, {
		login: text(o.login, 'loginFilter', 200),
		from: isoDateOf(o.periodFrom, 'periodFrom'),
		to: isoDateOf(o.periodTo, 'periodTo'),
	});
	return Object.entries(byLogin).flatMap(([login, list]) =>
		list.map((e) => ({ login, from: e.from ?? null, to: e.to ?? null, type: e.type ?? null, hoursDelta: e.hoursDelta ?? null })),
	);
}
