import type { IExecuteFunctions, INodeProperties } from 'n8n-workflow';
import { LIMITS } from '../../shared/constants.js';
import { capacityView } from '../../shared/shape.js';
import { collection, fld, forOp, isObj, optionsOf, outputOption, projectField, projectKeyOf, raw, text, wantsRaw, type Obj } from '../fields';
import type { RunContext } from '../runContext';

export const description: INodeProperties[] = forOp('capacity', 'get', [
	projectField(),
	collection('options', [
		fld('includeArchive', { type: 'boolean', default: false }),
		outputOption(),
		fld('sprintId', { type: 'string', default: '' }, 'sprintIdDefault'),
	]),
]);

/** ID спринта из параметра или спринта рабочего слота. */
export async function sprintIdOrSlot(run: RunContext, key: string, given: string | undefined): Promise<string | undefined> {
	if (given) return given;
	const sd = await run.ops.sprintData(key);
	return isObj(sd.sprint) && typeof sd.sprint.sprintId === 'string' ? sd.sprint.sprintId : undefined;
}

export async function execute(this: IExecuteFunctions, i: number, run: RunContext): Promise<Obj[]> {
	const key = projectKeyOf(this, i);
	const o = optionsOf(this, i);
	const sid = await sprintIdOrSlot(run, key, text(o.sprintId, 'sprintIdDefault', 100));
	const cap = sid ? await run.ops.capacity(key, sid) : null;
	const arc = o.includeArchive === true ? await run.ops.capacityArchive(key) : null;
	if (wantsRaw(o)) {
		const out: Obj = cap ? raw(cap) : { sprintId: sid ?? null, capacity: null };
		if (arc) out.archive = raw(arc);
		return [out];
	}
	const data: Obj = {
		sprintId: sid ?? null,
		capacity: cap ? capacityView(cap.capacity) : null,
		archivedCount: cap && typeof cap.archivedCount === 'number' ? cap.archivedCount : null,
	};
	if (arc) {
		const list = Array.isArray(arc.archive) ? arc.archive : Array.isArray(arc.records) ? arc.records : [];
		data.archive = list.slice(0, LIMITS.capacityArchive).map(capacityView);
	}
	return [data];
}
