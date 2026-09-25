import type { IDataObject, IExecuteFunctions, INodeProperties } from 'n8n-workflow';
import { INCLUSION_STATUSES, ROLE_KEYS } from '../../shared/constants.js';
import { slotRev } from '../../shared/ops.js';
import { itemBodyFromInput, sprintBodyFromInput, sprintHeader } from '../../shared/shape.js';
import { T } from '../../i18n';
import { GuardError, fmt } from '../../transport/errors';
import {
	bad,
	collection,
	fld,
	forOp,
	issueIdOf,
	isObj,
	jsonOf,
	minutesOf,
	optionsOf,
	projectField,
	projectKeyOf,
	revisionOf,
	revisionOption,
	roleChoices,
	text,
	type Obj,
} from '../fields';
import type { RunContext } from '../runContext';
import { optionalHeaderFields, readHeader } from './header';

export const description: INodeProperties[] = forOp('sprint', 'uploadDraft', [
	projectField(),
	fld('sprintId', { type: 'string', default: '', required: true }),
	fld('name', { type: 'string', default: '', required: true }),
	fld('dateStart', { type: 'dateTime', default: '', required: true }),
	fld('dateEnd', { type: 'dateTime', default: '', required: true }),
	fld('items', { type: 'json', default: '{}', required: true }),
	collection('additionalFields', [...optionalHeaderFields(), fld('roles', { type: 'multiOptions', options: roleChoices(), default: [] })]),
	collection('options', [fld('overwrite', { type: 'boolean', default: false }), revisionOption()]),
]);

const ITEM_KEYS = new Set(['issueId', 'title', 'inclusionStatus', 'estimate', 'fact', 'alloc', 'excludeReason', 'assignee', 'externalTicketId']);
const itemsLabel = () => T.fields.items.displayName;

/** Одна задача состава: те же ограничения, что у MCP-схемы ItemIn; ошибка — с ID задачи. */
function readItem(v: unknown, n: number): Obj {
	if (!isObj(v)) throw bad(itemsLabel(), fmt(T.problems.item, { issueId: '#' + (n + 1), problem: T.problems.itemShape }));
	const issueId = String(v.issueId ?? '#' + (n + 1));
	try {
		for (const k of Object.keys(v)) if (!ITEM_KEYS.has(k)) throw bad(itemsLabel(), fmt(T.problems.unknownKey, { key: k }));
		const out: Obj = { issueId: issueIdOf(v.issueId) };
		const put = (k: string, val: unknown) => {
			if (val !== undefined) out[k] = val;
		};
		put('title', text(v.title, 'title', 500));
		if (v.inclusionStatus !== undefined) {
			if (!(INCLUSION_STATUSES as readonly string[]).includes(String(v.inclusionStatus))) throw bad(T.fields.inclusionStatus.displayName, fmt(T.problems.oneOf, { values: INCLUSION_STATUSES.join(', ') }));
			out.inclusionStatus = v.inclusionStatus;
		}
		for (const k of ['estimate', 'fact', 'alloc'] as const) if (v[k] !== undefined) out[k] = minutesOf(v[k], k);
		put('excludeReason', text(v.excludeReason, 'excludeReason', 500));
		if (v.assignee === null) out.assignee = null;
		else put('assignee', text(v.assignee, 'assignee', 200));
		put('externalTicketId', text(v.externalTicketId, 'externalTicketId', 200));
		return out;
	} catch (e) {
		const d = e instanceof GuardError ? e.details : { field: '', problem: String(e) };
		throw bad(itemsLabel(), fmt(T.problems.item, { issueId, problem: d.field && d.field !== itemsLabel() ? `«${d.field}» ${d.problem}` : d.problem }));
	}
}

/** Состав по ролям: `{ "<роль>": [ { issueId, … } ] }`. */
export function readItems(value: unknown): Record<string, Obj[]> {
	const j = jsonOf(value, 'items');
	if (!isObj(j)) throw bad(itemsLabel(), T.problems.itemsShape);
	const out: Record<string, Obj[]> = {};
	for (const [role, list] of Object.entries(j)) {
		if (!(ROLE_KEYS as readonly string[]).includes(role)) throw bad(itemsLabel(), fmt(T.problems.role, { role }));
		if (!Array.isArray(list) || list.length > 1000) throw bad(itemsLabel(), T.problems.itemsShape);
		out[role] = list.map(readItem);
	}
	return out;
}

export async function execute(this: IExecuteFunctions, i: number, run: RunContext): Promise<Obj[]> {
	const key = projectKeyOf(this, i);
	const sprintId = text(this.getNodeParameter('sprintId', i, ''), 'sprintId', 100, true) as string;
	const header = readHeader({
		...(this.getNodeParameter('additionalFields', i, {}) as IDataObject),
		name: text(this.getNodeParameter('name', i, ''), 'name', 500, true),
		dateStart: this.getNodeParameter('dateStart', i, '') as string,
		dateEnd: this.getNodeParameter('dateEnd', i, '') as string,
	});
	if (header.dateStart === undefined) throw bad(T.fields.dateStart.displayName, T.problems.required);
	if (header.dateEnd === undefined) throw bad(T.fields.dateEnd.displayName, T.problems.required);
	const add = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
	if (Array.isArray(add.roles) && add.roles.length) header.roles = add.roles;
	const roleItems = readItems(this.getNodeParameter('items', i, '{}'));
	const o = optionsOf(this, i);
	const baseRev = revisionOf(o);

	const sd = await run.ops.sprintData(key);
	const active = isObj(sd.settings) && Array.isArray(sd.settings.activeRoles) ? (sd.settings.activeRoles as string[]) : null;
	if (active) for (const r of Object.keys(roleItems)) if (!active.includes(r)) throw new GuardError('role_not_active', { roleKey: r, activeRoles: active.join(', ') });
	const cur = sprintHeader(sd.sprint);
	const occupied = !!cur && cur.status !== 'FINISHED' && !(cur.status === 'PLANNING' && cur.sprintId === sprintId);
	if (occupied && o.overwrite !== true) throw new GuardError('slot_occupied', { sprintId: String(cur.sprintId), status: String(cur.status), rev: cur.rev });

	const items: Obj = {};
	for (const [r, list] of Object.entries(roleItems)) items[r] = list.map((it) => itemBodyFromInput(it, r));
	const body = { sprint: { ...sprintBodyFromInput({ sprintId, ...header }), status: 'PLANNING' }, roleItems: items, baseRev: baseRev ?? slotRev(sd) };
	const res = await run.ops.writeSprint(key, body);
	run.remember('slot', key, res.rev);
	return [{ rev: res.rev ?? null, enriched: res.enriched ?? null, warnings: Array.isArray(res.warnings) ? res.warnings : [], overwrote: occupied }];
}
