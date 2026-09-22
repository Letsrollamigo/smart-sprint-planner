// @ts-check
/** Единственный модуль с сетью: адрес по ключу проекта, Bearer из контекста запроса, таймаут, разбор конверта. */
import { CONTRACT_PATHS } from './constants.js';
import { NetworkError, PlannerRefusal, PlatformError } from './errors.js';

/**
 * @param {{ baseUrl: string, appId: string, token: string, timeoutMs: number, fetchImpl?: typeof fetch }} opts
 */
export function createClient({ baseUrl, appId, token, timeoutMs, fetchImpl = globalThis.fetch }) {
  /** @param {string} path @param {{ projectKey?: string, query?: Record<string, unknown> }} q */
  function url(path, { projectKey, query } = {}) {
    if (!(/** @type {readonly string[]} */ (CONTRACT_PATHS)).includes(path)) throw new Error('path outside contract: ' + path);
    const u = new URL(`${baseUrl}/api/extensionEndpoints/${appId}/backend-global/${path}`);
    if (projectKey) u.searchParams.set('projectKey', projectKey);
    for (const [k, v] of Object.entries(query || {})) if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, String(v));
    return u;
  }

  /**
   * @param {'GET'|'POST'} method @param {string} path
   * @param {{ projectKey?: string, query?: Record<string, unknown>, body?: unknown }} [opts]
   * @returns {Promise<Record<string, unknown>>} тело успешного ответа (success:true)
   */
  async function call(method, path, opts = {}) {
    const u = url(path, opts);
    /** @type {Record<string, string>} */
    const headers = { Authorization: 'Bearer ' + token, Accept: 'application/json' };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    let res;
    try {
      res = await fetchImpl(u, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body), signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) {
      throw new NetworkError(e, baseUrl);
    }
    const text = await res.text();
    if (res.status !== 200) throw new PlatformError(res.status, text.slice(0, 300));
    /** @type {unknown} */
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch { throw new PlatformError(200, 'non-JSON body'); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new PlatformError(200, 'unexpected body');
    const body = /** @type {Record<string, unknown>} */ (data);
    if (body.success === false) throw new PlannerRefusal(body);
    return body;
  }

  return { call, url };
}
