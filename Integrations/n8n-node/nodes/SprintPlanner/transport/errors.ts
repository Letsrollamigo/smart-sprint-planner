import type { INode, JsonObject } from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';
import { GuardError, NetworkError, PlannerRefusal, PlatformError, hintFor } from '../shared/errors.js';
import { NOTES, T } from '../i18n';
import { BRAND } from '../branding';

export { GuardError };

/** Минимальная версия планера для ноды; отдельным операциям — REQUIRES. */
export const PLANNER_MIN = '3.49.1';

/** Операции, которым нужна версия планера новее общей (3.49.1). Ключ — `<ресурс>.<операция>`. */
export const REQUIRES: Record<string, string> = { 'access.getMyRoles': '3.51.0', 'release.delete': '3.51.0' };

/** Ошибка штатного REST YouTrack (не контракта планера). */
export class YouTrackError extends Error {
	kind = 'youtrack' as const;
	constructor(
		public status: number,
		public error: string,
		public errorDescription: string,
	) {
		super('youtrack ' + status);
		this.name = 'YouTrackError';
	}
}

/** Подстановка `{ключ}` в шаблон словаря. */
export function fmt(tpl: string, params: Record<string, unknown> = {}): string {
	return tpl.replace(/\{(\w+)\}/g, (m, k: string) => (params[k] === undefined ? m : String(params[k])));
}

export type ErrorScope = { itemIndex: number; opKey: string; projectKey?: string };

type Explained = {
	cls: 'api' | 'operation';
	kind: string;
	reason: string;
	message: string;
	description: string;
	hint?: string;
	action?: string;
	cid?: string | null;
	rev?: number | null;
	httpCode?: string;
};

function explain(err: unknown, scope: ErrorScope): Explained {
	const requires = REQUIRES[scope.opKey];
	if (err instanceof PlannerRefusal) {
		if (requires && err.reason === 'invalid_action') return requiresError(requires);
		const h = hintFor(NOTES, err.reason, BRAND.lang);
		const tail = [
			h.action,
			err.cid ? fmt(T.errors.cid, { cid: err.cid }) : '',
			err.reason === 'rev_conflict' && err.rev !== null ? fmt(T.errors.revConflict, { rev: err.rev }) : '',
			err.errors ? fmt(T.errors.details, { errors: JSON.stringify(err.errors) }) : '',
		].filter(Boolean);
		return {
			cls: 'api',
			kind: 'planner',
			reason: err.reason,
			message: h.meaning
				? fmt(T.errors.refusal, { meaning: h.meaning.replace(/\.$/, ''), reason: err.reason })
				: fmt(T.errors.refusalNoHint, { reason: err.reason }),
			description: tail.join(' '),
			hint: h.meaning,
			action: h.action,
			cid: err.cid,
			rev: err.rev,
		};
	}
	if (err instanceof PlatformError) {
		const base = { cls: 'api' as const, kind: 'platform', reason: 'http_' + err.status, httpCode: String(err.status) };
		if (err.status === 401) return { ...base, message: T.errors.token, description: T.errors.tokenHint };
		if (err.status === 404) {
			if (requires) return { ...base, ...requiresError(requires) };
			return {
				...base,
				message: scope.projectKey ? fmt(T.errors.notAvailable, { projectKey: scope.projectKey }) : T.errors.notAvailableAny,
				description: T.errors.notAvailableHint,
			};
		}
		return { ...base, message: fmt(T.errors.status, { status: err.status }), description: err.text };
	}
	if (err instanceof YouTrackError) {
		return {
			cls: 'api',
			kind: 'youtrack',
			reason: err.error || 'http_' + err.status,
			message: err.errorDescription || fmt(T.errors.status, { status: err.status }),
			description: err.error,
			httpCode: String(err.status),
		};
	}
	if (err instanceof NetworkError) {
		return {
			cls: 'api',
			kind: 'network',
			reason: err.timeout ? 'timeout' : 'network',
			message: fmt(err.timeout ? T.errors.timeout : T.errors.network, { url: err.baseUrl }),
			description: '',
		};
	}
	if (err instanceof GuardError) {
		const g = (T.guards as Record<string, { message: string; hint: string }>)[err.code];
		return {
			cls: 'operation',
			kind: 'node',
			reason: err.code,
			message: g ? fmt(g.message, err.details) : err.code,
			description: g ? fmt(g.hint, err.details) : '',
		};
	}
	return {
		cls: 'operation',
		kind: 'node',
		reason: 'unexpected',
		message: err instanceof Error ? err.message : String(err),
		description: '',
	};
}

function requiresError(version: string): Explained {
	return {
		cls: 'api',
		kind: 'planner',
		reason: 'planner_too_old',
		message: fmt(T.errors.requires, { version }),
		description: T.errors.notAvailableHint,
	};
}

/** Ошибка для броска из ноды: NodeApiError (ответ сервиса) или NodeOperationError (защиты ноды). */
export function toNodeError(node: INode, err: unknown, scope: ErrorScope): NodeApiError | NodeOperationError {
	if (err instanceof NodeApiError || err instanceof NodeOperationError) return err;
	const e = explain(err, scope);
	const opts = { message: e.message, description: e.description || undefined, itemIndex: scope.itemIndex };
	if (e.cls === 'operation') return new NodeOperationError(node, e.message, opts);
	const response: JsonObject = { reason: e.reason };
	if (e.cid) response.cid = e.cid;
	return new NodeApiError(node, response, { ...opts, httpCode: e.httpCode });
}

/** Элемент вывода вместо броска при «Continue On Fail». */
export function failureJson(err: unknown, scope: ErrorScope): JsonObject {
	if (err instanceof NodeApiError || err instanceof NodeOperationError) {
		return { ok: false, kind: 'node', reason: 'node_error', message: err.message, hint: err.description ?? '', action: '', cid: null };
	}
	const e = explain(err, scope);
	const out: JsonObject = {
		ok: false,
		kind: e.kind,
		reason: e.reason,
		message: e.message,
		hint: e.hint ?? e.description,
		action: e.action ?? '',
		cid: e.cid ?? null,
	};
	if (typeof e.rev === 'number') out.rev = e.rev;
	return out;
}
