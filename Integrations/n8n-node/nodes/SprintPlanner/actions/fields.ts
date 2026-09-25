import type { IDataObject, IExecuteFunctions, INodeProperties, INodePropertyOptions } from 'n8n-workflow';
import { ROLE_KEYS, ROLE_LABELS } from '../shared/constants.js';
import { BRAND } from '../branding';
import { T } from '../i18n';
import { GuardError, fmt } from '../transport/errors';

export type FieldName = keyof typeof T.fields;
export type Obj = Record<string, unknown>;

/* ───────────── Описание формы ───────────── */

/** Свойство формы: подпись, описание и placeholder — из словаря по имени текста (`text`, по умолчанию = name). */
export function fld(name: string, p: Omit<INodeProperties, 'displayName' | 'name'>, text: FieldName = name as FieldName): INodeProperties {
	const t = T.fields[text] as { displayName: string; description?: string; placeholder?: string };
	const out: INodeProperties = { displayName: t.displayName, name, ...p };
	if (t.description && out.description === undefined) out.description = t.description;
	if (t.placeholder && out.placeholder === undefined) out.placeholder = t.placeholder;
	return out;
}

/** Показывать свойства только для ресурса и операции. */
export function forOp(resource: string, operation: string, props: INodeProperties[]): INodeProperties[] {
	return props.map((p) => ({
		...p,
		displayOptions: { ...p.displayOptions, show: { ...p.displayOptions?.show, resource: [resource], operation: [operation] } },
	}));
}

/** Свойство «Операция» ресурса: подписи, action и описания — из словаря. */
export function operationField(resource: keyof typeof T.ops, names: string[]): INodeProperties {
	const texts = T.ops[resource] as Record<string, { name: string; action: string; description: string }>;
	const first = names[0];
	return {
		displayName: T.operation,
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: [resource] } },
		options: names.map((n) => ({ name: texts[n].name, value: n, action: texts[n].action, description: texts[n].description })),
		default: first,
	};
}

/** Варианты из перечисления с подписями словаря. */
export function choices(values: readonly string[], labels: Record<string, string>): INodePropertyOptions[] {
	return values.map((v) => ({ name: labels[v] ?? v, value: v }));
}

export const roleChoices = (): INodePropertyOptions[] => choices(ROLE_KEYS, ROLE_LABELS[BRAND.lang]);

export const projectField = (): INodeProperties =>
	fld('project', {
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		modes: [
			{ displayName: T.modes.list, name: 'list', type: 'list', placeholder: T.modes.listPlaceholder, typeOptions: { searchListMethod: 'searchProjects', searchable: true } },
			{ displayName: T.modes.key, name: 'key', type: 'string', placeholder: T.modes.keyPlaceholder },
		],
	});

export const releaseField = (): INodeProperties =>
	fld('release', {
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		modes: [
			{ displayName: T.modes.list, name: 'list', type: 'list', placeholder: T.modes.listPlaceholder, typeOptions: { searchListMethod: 'searchReleases', searchable: true } },
			{ displayName: T.modes.id, name: 'id', type: 'string', placeholder: T.modes.idPlaceholder },
		],
	});

export const roleField = (required = true): INodeProperties =>
	fld('roleKey', { type: 'options', options: roleChoices(), default: 'analysis', required });

export const issueIdField = (): INodeProperties => fld('issueId', { type: 'string', default: '', required: true });

export const revisionOption = (): INodeProperties => fld('revision', { type: 'number', default: 0, typeOptions: { minValue: 0 } });

export const outputOption = (): INodeProperties =>
	fld('output', {
		type: 'options',
		default: 'simplified',
		options: [
			{ name: T.options.output.simplified, value: 'simplified' },
			{ name: T.options.output.raw, value: 'raw' },
		],
	});

export const minutesField = (name: string, text: FieldName = name as FieldName): INodeProperties =>
	fld(name, { type: 'number', default: 0, typeOptions: { minValue: 0, maxValue: 100000000 } }, text);

/** Коллекция «Параметры» / «Дополнительные поля» / «Изменяемые поля». */
export function collection(name: 'options' | 'additionalFields' | 'updateFields', options: INodeProperties[]): INodeProperties {
	const label = name === 'options' ? T.collections.options : name === 'additionalFields' ? T.collections.additional : T.collections.update;
	const placeholder = name === 'options' ? T.collections.optionsPlaceholder : T.collections.additionalPlaceholder;
	return { displayName: label, name, type: 'collection', placeholder, default: {}, options };
}

/** Набор «роль → значение» (ресурсы, распределение, представители). */
export function roleMapField(name: string, valueField: INodeProperties): INodeProperties {
	const t = T.fields[name as FieldName] as { displayName: string; description?: string };
	return {
		displayName: t.displayName,
		name,
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		default: {},
		description: t.description,
		options: [{ displayName: T.collections.roleValue, name: 'entries', values: [roleField(), valueField] }],
	};
}

export const returnAllLimit = (defaultLimit: number, max: number): INodeProperties[] => [
	fld('returnAll', { type: 'boolean', default: false }),
	fld('limit', { type: 'number', default: defaultLimit, typeOptions: { minValue: 1, maxValue: max }, displayOptions: { show: { returnAll: [false] } } }),
];

/* ───────────── Чтение параметров ───────────── */

const bad = (field: string, problem: string): GuardError => new GuardError('invalid_field', { field, problem });
const label = (text: FieldName) => (T.fields[text] as { displayName: string }).displayName;

export function projectKeyOf(fn: IExecuteFunctions, i: number): string {
	const v = String(fn.getNodeParameter('project', i, '', { extractValue: true }) ?? '').trim();
	if (!v) throw bad(label('project'), T.problems.required);
	if (v.length > 100) throw bad(label('project'), fmt(T.problems.tooLong, { max: 100 }));
	return v;
}

export function releaseIdOf(fn: IExecuteFunctions, i: number): string {
	return text(String(fn.getNodeParameter('release', i, '', { extractValue: true }) ?? ''), 'release', 64, true) as string;
}

/** Строка: обрезка пробелов, обязательность, длина. Пусто и не обязательна → undefined. */
export function text(v: unknown, field: FieldName, max: number, required = false): string | undefined {
	const s = v === undefined || v === null ? '' : String(v).trim();
	if (!s) {
		if (required) throw bad(label(field), T.problems.required);
		return undefined;
	}
	if (s.length > max) throw bad(label(field), fmt(T.problems.tooLong, { max }));
	return s;
}

export function issueIdOf(v: unknown, field: FieldName = 'issueId'): string {
	const s = text(v, field, 100, true) as string;
	if (!/^[A-Za-z][A-Za-z0-9_]*-\d+$/.test(s)) throw bad(label(field), T.problems.issueId);
	return s;
}

export function intIn(v: unknown, field: FieldName, min: number, max: number): number {
	const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
	if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) throw bad(label(field), fmt(T.problems.integer, { min, max }));
	return n;
}

export function numIn(v: unknown, field: FieldName, min: number, max: number): number {
	const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
	if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) throw bad(label(field), fmt(T.problems.number, { min, max }));
	return n;
}

export const minutesOf = (v: unknown, field: FieldName): number => intIn(v, field, 0, 100000000);

const isEmpty = (v: unknown) => v === undefined || v === null || v === '';

/** Момент времени (даты спринта, релизов, работы) → epoch-ms. Пусто → undefined. */
export function epochOf(v: unknown, field: FieldName): number | undefined {
	if (isEmpty(v)) return undefined;
	if (typeof v === 'number' && Number.isFinite(v)) return v;
	const ms = Date.parse(String(v));
	if (Number.isNaN(ms)) throw bad(label(field), T.problems.date);
	return ms;
}

/**
 * Календарная дата (отсутствия, поля задачи вида date) → YYYY-MM-DD из первых 10 символов значения, без перевода
 * в UTC: значение n8n несёт смещение зоны инстанса, и перевод сдвинул бы дату на день. Пусто → undefined.
 */
export function isoDateOf(v: unknown, field: FieldName): string | undefined {
	if (isEmpty(v)) return undefined;
	const s = typeof v === 'number' ? new Date(v).toISOString() : String(v).trim();
	const d = s.slice(0, 10);
	if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d))) throw bad(label(field), T.problems.date);
	return d;
}

export function isoDateRequired(v: unknown, field: FieldName): string {
	const d = isoDateOf(v, field);
	if (d === undefined) throw bad(label(field), T.problems.required);
	return d;
}

export function jsonOf(v: unknown, field: FieldName): unknown {
	if (typeof v !== 'string') return v;
	try {
		return JSON.parse(v);
	} catch {
		throw bad(label(field), T.problems.json);
	}
}

/** Список ID: строка через запятую или массив из выражения. */
export function idListOf(v: unknown, field: FieldName): string[] {
	const list = Array.isArray(v) ? v.map(String) : String(v ?? '').split(',');
	const out = list.map((s) => s.trim()).filter(Boolean);
	if (out.length > 2000) throw bad(label(field), fmt(T.problems.tooLong, { max: 2000 }));
	for (const s of out) if (s.length > 64) throw bad(label(field), fmt(T.problems.tooLong, { max: 64 }));
	return out;
}

/** Значения набора «роль → значение» из fixedCollection. */
export function roleMapOf(v: unknown, valueKey: string): Record<string, unknown> {
	const entries = ((v as IDataObject | undefined)?.entries ?? []) as IDataObject[];
	const out: Record<string, unknown> = {};
	for (const e of entries) out[String(e.roleKey)] = e[valueKey];
	return out;
}

export const optionsOf = (fn: IExecuteFunctions, i: number, name = 'options'): IDataObject => (fn.getNodeParameter(name, i, {}) as IDataObject) ?? {};

/** Ревизия из «Параметров»: пусто или не число → undefined (нода читает сама). */
export function revisionOf(o: IDataObject): number | undefined {
	const v = o.revision;
	if (isEmpty(v)) return undefined;
	return intIn(v, 'revision', 0, Number.MAX_SAFE_INTEGER);
}

/** Тело ответа планера без `success` — вывод «Полный». */
export function raw(body: Obj): Obj {
	const out = { ...body };
	delete out.success;
	return out;
}

export const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

export const wantsRaw = (o: IDataObject): boolean => o.output === 'raw';

export { bad };
