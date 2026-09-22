// @ts-check
/** Контекст одного запроса (http) либо процесса (stdio): операции с токеном вызывающего, тексты, журнал, guards. */
import { createClient } from './client.js';
import { makeOps } from './ops.js';
import { makeSchemas } from './schemas.js';
import { ROLE_LABELS } from './constants.js';

/**
 * @typedef {{ ops: ReturnType<typeof makeOps>, schemas: ReturnType<typeof makeSchemas>, t: (key: string, params?: Record<string, unknown>) => string,
 *   lang: string, notes: Record<string, any>, log: ReturnType<import('./log.js').createLog>, allowlist: string[], readOnly: boolean,
 *   roleLabels: Record<string, string>, branding: { appId: string, productName: string, docsUrl: string } }} Ctx
 */

/**
 * @param {{ baseUrl: string, appId: string, timeoutMs: number, allowlist: string[], readOnly: boolean, lang: string }} config
 * @param {{ t: Ctx['t'], notes: Record<string, any>, log: Ctx['log'], branding: Ctx['branding'], fetchImpl?: typeof fetch }} deps
 */
export function contextFactory(config, deps) {
  const schemas = makeSchemas(deps.t);
  const roleLabels = ROLE_LABELS[/** @type {'ru'|'en'} */ (config.lang)] || ROLE_LABELS.ru;
  /** @param {string} token @returns {Ctx} */
  return function makeCtx(token) {
    const client = createClient({ baseUrl: config.baseUrl, appId: config.appId, token, timeoutMs: config.timeoutMs, fetchImpl: deps.fetchImpl });
    return { ops: makeOps(client), schemas, t: deps.t, lang: config.lang, notes: deps.notes, log: deps.log, allowlist: config.allowlist, readOnly: config.readOnly, roleLabels, branding: deps.branding };
  };
}
