import type { IDataObject, IExecuteFunctions, INodeProperties } from 'n8n-workflow';
import { ABSENCE_TYPES } from '../../shared/constants.js';
import { T } from '../../i18n';
import {
	choices,
	collection,
	fld,
	forOp,
	isoDateRequired,
	numIn,
	optionsOf,
	projectField,
	projectKeyOf,
	revisionOf,
	revisionOption,
	text,
	type Obj,
} from '../fields';
import { written, type RunContext } from '../runContext';

export const description: INodeProperties[] = forOp('absence', 'createOrUpdate', [
	projectField(),
	fld('login', { type: 'string', default: '', required: true }),
	fld('from', { type: 'dateTime', default: '', required: true }),
	fld('to', { type: 'dateTime', default: '', required: true }),
	fld('type', { type: 'options', options: choices(ABSENCE_TYPES, T.options.absenceType), default: 'vacation' }, 'absenceType'),
	collection('additionalFields', [fld('hoursDelta', { type: 'number', default: 4, typeOptions: { minValue: 0.5, maxValue: 24, numberPrecision: 1 } })]),
	collection('options', [revisionOption()]),
]);

export async function execute(this: IExecuteFunctions, i: number, run: RunContext): Promise<Obj[]> {
	const key = projectKeyOf(this, i);
	const login = text(this.getNodeParameter('login', i, ''), 'login', 200, true) as string;
	const a = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
	const entry: Obj = {
		from: isoDateRequired(this.getNodeParameter('from', i, ''), 'from'),
		to: isoDateRequired(this.getNodeParameter('to', i, ''), 'to'),
		type: this.getNodeParameter('type', i) as string,
	};
	if (a.hoursDelta !== undefined && a.hoursDelta !== null && a.hoursDelta !== '') entry.hoursDelta = numIn(a.hoursDelta, 'hoursDelta', 0.5, 24);
	const r = await run.write('abs', key, revisionOf(optionsOf(this, i)), (rev) => run.ops.absencesAction(key, 'upsertAbsence', { login, entry, baseRev: rev }));
	return [written(r)];
}
