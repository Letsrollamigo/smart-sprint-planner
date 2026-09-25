import type { IExecuteFunctions, INodeProperties } from 'n8n-workflow';
import { T } from '../../i18n';
import { choices, fld, forOp, intIn, issueIdField, issueIdOf, projectField, projectKeyOf, raw, text, type Obj } from '../fields';
import type { RunContext } from '../runContext';

const FIELD_TYPES = ['enum', 'state', 'version', 'owned', 'build', 'user', 'period'] as const;

export const description: INodeProperties[] = forOp('issue', 'setFieldViaPlanner', [
	projectField(),
	issueIdField(),
	fld('fieldName', { type: 'string', default: '', required: true }),
	fld('fieldType', { type: 'options', options: choices(FIELD_TYPES, T.options.fieldType), default: 'enum' }),
	fld('value', { type: 'string', default: '', displayOptions: { show: { clearField: [false] } } }, 'plannerValue'),
	fld('clearField', { type: 'boolean', default: false }),
]);

export async function execute(this: IExecuteFunctions, i: number, run: RunContext): Promise<Obj[]> {
	const key = projectKeyOf(this, i);
	const type = this.getNodeParameter('fieldType', i) as string;
	const v = this.getNodeParameter('value', i, '');
	const value = this.getNodeParameter('clearField', i, false)
		? null
		: type === 'period'
			? intIn(v, 'plannerValue', 0, 100000)
			: text(v, 'plannerValue', type === 'user' ? 200 : 500, true);
	const body = {
		issueId: issueIdOf(this.getNodeParameter('issueId', i, '')),
		fieldName: text(this.getNodeParameter('fieldName', i, ''), 'fieldName', 200, true),
		type,
		value,
	};
	return [raw(await run.call('POST', 'update-issue-field', { projectKey: key, body }))];
}
