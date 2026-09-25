import type { IExecuteFunctions, INodeProperties } from 'n8n-workflow';
import { collection, fld, forOp, intIn, isObj, optionsOf, outputOption, projectField, projectKeyOf, raw, wantsRaw, type Obj } from '../fields';
import type { RunContext } from '../runContext';

export const description: INodeProperties[] = forOp('calendar', 'get', [
	projectField(),
	collection('options', [outputOption(), fld('year', { type: 'number', default: 2026, typeOptions: { minValue: 2000, maxValue: 2100 } })]),
]);

export async function execute(this: IExecuteFunctions, i: number, run: RunContext): Promise<Obj[]> {
	const key = projectKeyOf(this, i);
	const o = optionsOf(this, i);
	const c = await run.ops.calendar(key);
	if (wantsRaw(o)) return [raw(c)];
	const cal = isObj(c.calendar) ? c.calendar : {};
	const years = isObj(cal.years) ? cal.years : {};
	const year = o.year === undefined ? undefined : String(intIn(o.year, 'year', 2000, 2100));
	const picked = year ? (years[year] !== undefined ? { [year]: years[year] } : {}) : years;
	return [{ years: picked, uploadedBy: cal.uploadedBy ?? null, uploadedAt: cal.uploadedAt ?? null }];
}
