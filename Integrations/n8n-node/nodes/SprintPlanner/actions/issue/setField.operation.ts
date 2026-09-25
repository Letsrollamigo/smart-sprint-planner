import type { IExecuteFunctions, INodeProperties } from 'n8n-workflow';
import { T } from '../../i18n';
import { GuardError, fmt } from '../../transport/errors';
import { ytGet, ytPost } from '../../transport/youtrack';
import { bad, epochOf, fld, forOp, intIn, isObj, isoDateRequired, issueIdField, issueIdOf, numIn, projectField, text, type Obj } from '../fields';
import { fieldValue } from './search.operation';

const WRITTEN = 'idReadable,customFields(id,name,$type,value(name,login,fullName,minutes,presentation,text))';

export const description: INodeProperties[] = forOp('issue', 'setField', [
	projectField(),
	issueIdField(),
	fld('field', {
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getProjectFields', loadOptionsDependsOn: ['project.value'] },
		default: '',
		required: true,
	}),
	fld('value', { type: 'string', default: '', displayOptions: { show: { clearField: [false] } } }),
	fld('clearField', { type: 'boolean', default: false }),
]);

/**
 * Значение по фактическому `$type` поля задачи (пробы 2026-09-25, спека §6): набор → {name}, пользователь → {login},
 * период → {minutes}, текст → {text}, дата → epoch-ms (вид date — полдень UTC календарной даты: так YouTrack хранит её сам,
 * и дата не сдвигается ни в одном часовом поясе сервера), простое — число или строка.
 */
export function valueFor($type: string, fieldType: string, v: unknown): unknown {
	const label = T.fields.value.displayName;
	if (/^Single(Enum|Version|Build|Owned|Group)IssueCustomField$|^State(Machine)?IssueCustomField$/.test($type)) return { name: text(v, 'value', 500, true) };
	if ($type === 'SingleUserIssueCustomField') return { login: text(v, 'value', 200, true) };
	if ($type === 'PeriodIssueCustomField') return { minutes: intIn(v, 'value', 0, 100000000) };
	if ($type === 'TextIssueCustomField') return { text: text(v, 'value', 20000, true) };
	if ($type === 'DateIssueCustomField') {
		if (fieldType !== 'date') return epochOf(text(v, 'value', 100, true), 'value');
		const [y, m, d] = isoDateRequired(v, 'value').split('-').map(Number);
		return Date.UTC(y, m - 1, d, 12);
	}
	if ($type === 'SimpleIssueCustomField') {
		if (fieldType === 'integer') return intIn(v, 'value', Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
		if (fieldType === 'float') return numIn(v, 'value', -Number.MAX_VALUE, Number.MAX_VALUE);
		return text(v, 'value', 20000, true);
	}
	throw bad(label, fmt(T.problems.unsupportedType, { type: $type }));
}

export async function execute(this: IExecuteFunctions, i: number): Promise<Obj[]> {
	const issueId = issueIdOf(this.getNodeParameter('issueId', i, ''));
	const picked = String(this.getNodeParameter('field', i, '') ?? '');
	const sep = picked.indexOf('|');
	if (sep <= 0) throw bad(T.fields.field.displayName, T.problems.fieldValue);
	const fieldId = picked.slice(0, sep);
	const fieldType = picked.slice(sep + 1);
	if (fieldType.endsWith('[*]')) throw new GuardError('multi_value_field', { field: fieldId });
	const path = '/api/issues/' + encodeURIComponent(issueId);
	const issue = await ytGet(this, path, { fields: 'idReadable,customFields(id,name,$type)' });
	const cf = (isObj(issue) && Array.isArray(issue.customFields) ? issue.customFields : []).filter(isObj).find((f) => f.id === fieldId);
	if (!cf) throw new GuardError('field_not_in_issue', { issueId });
	const $type = String(cf.$type);
	if ($type.startsWith('Multi')) throw new GuardError('multi_value_field', { field: String(cf.name) });
	const value = this.getNodeParameter('clearField', i, false) ? null : valueFor($type, fieldType, this.getNodeParameter('value', i, ''));
	const res = await ytPost(this, path, { fields: WRITTEN }, { customFields: [{ id: fieldId, $type, value: value as never }] });
	const after = (isObj(res) && Array.isArray(res.customFields) ? res.customFields : []).filter(isObj).find((f) => f.id === fieldId);
	return [{ idReadable: isObj(res) ? (res.idReadable ?? issueId) : issueId, field: { id: fieldId, name: cf.name ?? null, value: fieldValue(after?.value) } }];
}
