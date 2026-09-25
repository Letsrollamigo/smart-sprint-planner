import type { IDataObject } from 'n8n-workflow';
import { YouTrackError } from './errors';
import { bodyText, credentialsOf, send, type Ctx } from './planner';

/** Штатный REST YouTrack — только эти пути (инвариант «сеть только к известным адресам»). */
const YT_PATHS = [
	/^\/api\/admin\/projects$/,
	/^\/api\/admin\/projects\/[^/]+\/customFields$/,
	/^\/api\/issues$/,
	/^\/api\/issues\/[^/]+$/,
];

async function ytRequest(ctx: Ctx, method: 'GET' | 'POST', path: string, qs: IDataObject, body?: IDataObject): Promise<unknown> {
	if (!YT_PATHS.some((re) => re.test(path))) throw new Error('path outside YouTrack allowlist: ' + path);
	const { url } = await credentialsOf(ctx);
	const res = await send(ctx, url, { method, url: url + path, qs, body });
	if (res.statusCode < 200 || res.statusCode >= 300) {
		const b = (res.body && typeof res.body === 'object' ? res.body : {}) as Record<string, unknown>;
		throw new YouTrackError(
			res.statusCode,
			typeof b.error === 'string' ? b.error : bodyText(res.body),
			typeof b.error_description === 'string' ? b.error_description : '',
		);
	}
	return res.body;
}

export const ytGet = (ctx: Ctx, path: string, qs: IDataObject = {}) => ytRequest(ctx, 'GET', path, qs);
export const ytPost = (ctx: Ctx, path: string, qs: IDataObject, body: IDataObject) => ytRequest(ctx, 'POST', path, qs, body);

/** Постраничное чтение списка штатного REST ($skip/$top), до `max` элементов. */
export async function ytList(ctx: Ctx, path: string, qs: IDataObject, max: number, pageSize = 100): Promise<IDataObject[]> {
	const out: IDataObject[] = [];
	for (let skip = 0; out.length < max; skip += pageSize) {
		const top = Math.min(pageSize, max - out.length);
		const page = await ytGet(ctx, path, { ...qs, $skip: skip, $top: top });
		const list = Array.isArray(page) ? (page as IDataObject[]) : [];
		out.push(...list);
		if (list.length < top) break;
	}
	return out;
}
