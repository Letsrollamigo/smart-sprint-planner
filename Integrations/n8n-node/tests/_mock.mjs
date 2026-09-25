// Подменённый IExecuteFunctions/ILoadOptionsFunctions и маршрутизатор ответов: тесты гоняют собранный dist/ без сети.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
export const dist = (p) => require('../dist/nodes/SprintPlanner/' + p);
export const { SprintPlanner } = dist('SprintPlanner.node.js');

/**
 * Ответы по ключу `<METHOD> <путь контракта>[?<action>]` либо `<METHOD> <путь YouTrack>`. Значение — ответ, массив
 * ответов (расходуются по очереди, последний повторяется), функция от запроса или Error (сбой сети).
 * Ответ без statusCode — тело успеха контракта ({success:true, ...}).
 */
export function responder(routes) {
	return (opts) => {
		const u = new URL(opts.url);
		const m = /\/backend-global\/(.+)$/.exec(u.pathname);
		const key = m ? `${opts.method} ${m[1]}${opts.qs?.action ? '?' + opts.qs.action : ''}` : `${opts.method} ${u.pathname}`;
		let r = routes[key];
		if (r === undefined) throw new Error('unexpected request ' + key);
		if (Array.isArray(r)) r = r.length > 1 ? r.shift() : r[0];
		if (typeof r === 'function') r = r(opts);
		if (r instanceof Error) throw r;
		if (r && typeof r === 'object' && 'statusCode' in r) return r;
		return { statusCode: 200, body: Array.isArray(r) ? r : { success: true, ...r } };
	};
}

/** Контекст выполнения: params — параметры по элементам; calls — журнал запросов. */
export function ctx({ params = [{}], routes = {}, continueOnFail = false, creds } = {}) {
	const calls = [];
	const reply = responder(routes);
	const fn = {
		getInputData: () => params.map(() => ({ json: {} })),
		getNodeParameter(name, i, fallback, opts) {
			const p = params[i] ?? {};
			if (!(name in p)) {
				if (arguments.length >= 3) return fallback;
				throw new Error('no parameter ' + name);
			}
			let v = p[name];
			if (opts?.extractValue && v && typeof v === 'object' && 'value' in v) v = v.value;
			return v;
		},
		getCurrentNodeParameter(name, opts) {
			return fn.getNodeParameter(name, 0, undefined, opts);
		},
		getNode: () => ({ id: 'n1', name: 'Planner', type: 'n8n-nodes-test.sprintPlanner', typeVersion: 1, position: [0, 0], parameters: {} }),
		continueOnFail: () => continueOnFail,
		getCredentials: async () => creds ?? { url: 'https://yt.test/', token: 'secret', appId: 'test-app' },
		helpers: {
			async httpRequestWithAuthentication(credType, opts) {
				calls.push({ credType, ...opts });
				return reply(opts);
			},
		},
	};
	return { fn, calls };
}

/** Запуск ноды: результат — json элементов вывода (и pairedItem рядом). */
export async function run(params, routes, extra = {}) {
	const c = ctx({ params: Array.isArray(params) ? params : [params], routes, ...extra });
	const [out] = await new SprintPlanner().execute.call(c.fn);
	return { out, json: out.map((x) => x.json), calls: c.calls, fn: c.fn };
}

export const project = (key = 'DEMO') => ({ __rl: true, mode: 'key', value: key });
export const refusal = (reason, extra = {}) => ({ statusCode: 200, body: { success: false, reason, error: reason, cid: 'cid-1', ...extra } });
/** Путь контракта запроса из журнала. */
export const pathOf = (c) => (/\/backend-global\/(.+)$/.exec(new URL(c.url).pathname) || [])[1] + (c.qs?.action ? '?' + c.qs.action : '');
