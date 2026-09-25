import type { IExecuteFunctions, INodeProperties } from 'n8n-workflow';
import { ytList } from '../../transport/youtrack';
import { collection, fld, forOp, isObj, optionsOf, outputOption, returnAllLimit, text, wantsRaw, type Obj } from '../fields';

const FIELDS =
	'id,idReadable,summary,created,updated,resolved,project(shortName,name),customFields(id,name,$type,value(name,login,fullName,minutes,presentation,text))';

export const description: INodeProperties[] = forOp('issue', 'search', [
	fld('query', { type: 'string', default: '', required: true }),
	...returnAllLimit(50, 5000),
	collection('options', [outputOption(), fld('project', { type: 'string', default: '' }, 'searchProject')]),
]);

/** Значение поля задачи компактно: логин, имя значения, минуты, текст; множественное — массивом. */
export function fieldValue(v: unknown): unknown {
	if (v === null || v === undefined) return null;
	if (Array.isArray(v)) return v.map(fieldValue);
	if (!isObj(v)) return v;
	for (const k of ['login', 'name', 'minutes', 'text', 'presentation']) if (v[k] !== undefined && v[k] !== null) return v[k];
	return null;
}

export function issueView(it: Obj): Obj {
	const fields: Obj = {};
	for (const f of Array.isArray(it.customFields) ? it.customFields : []) if (isObj(f)) fields[String(f.name)] = fieldValue(f.value);
	return {
		id: it.id ?? null,
		idReadable: it.idReadable ?? null,
		summary: it.summary ?? null,
		project: isObj(it.project) ? (it.project.shortName ?? null) : null,
		created: it.created ?? null,
		updated: it.updated ?? null,
		resolved: it.resolved ?? null,
		fields,
	};
}

export async function execute(this: IExecuteFunctions, i: number): Promise<Obj[]> {
	const o = optionsOf(this, i);
	const q = text(this.getNodeParameter('query', i, ''), 'query', 4000, true) as string;
	const project = text(o.project, 'searchProject', 100);
	const max = (this.getNodeParameter('returnAll', i, false) as boolean) ? Infinity : (this.getNodeParameter('limit', i, 50) as number);
	const list = (await ytList(this, '/api/issues', { query: project ? `project: ${project} ${q}` : q, fields: FIELDS }, max)).filter(isObj);
	return wantsRaw(o) ? list : list.map(issueView);
}
