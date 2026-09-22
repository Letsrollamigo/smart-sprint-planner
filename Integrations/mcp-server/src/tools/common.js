// @ts-check
/** Регистрация инструмента: единый конверт результата, guards, журнал, перевод ошибок. */
import { CHARACTER_LIMIT } from '../constants.js';
import { GuardError, toToolResult } from '../errors.js';

/** @typedef {import('../context.js').Ctx} Ctx */

/**
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 * @param {Ctx} ctx
 * @param {string} name
 * @param {{ input: import('zod').ZodType, output: import('zod').ZodType, annotations: Record<string, boolean>, handler: (args: any) => Promise<{ text: string, data: Record<string, unknown> }> }} def
 */
export function defineTool(server, ctx, name, def) {
  server.registerTool(name, {
    title: ctx.t(`tools.${name}.title`),
    description: ctx.t(`tools.${name}.description`),
    inputSchema: def.input,
    outputSchema: def.output,
    annotations: { openWorldHint: true, ...def.annotations }
  }, async (/** @type {Record<string, unknown>} */ args) => {
    const started = Date.now();
    const projectKey = typeof args.projectKey === 'string' ? args.projectKey : undefined;
    try {
      if (projectKey && ctx.allowlist.length && !ctx.allowlist.includes(projectKey)) throw new GuardError('project_not_allowed', { projectKey });
      const { text, data } = await def.handler(args);
      ctx.log.info({ tool: name, projectKey, outcome: 'ok', ms: Date.now() - started });
      return { content: [{ type: /** @type {const} */ ('text'), text: fit(text + '\n' + JSON.stringify(data, null, 1), ctx) }], structuredContent: data };
    } catch (err) {
      const res = toToolResult(err, ctx.t, ctx.notes, ctx.lang);
      const s = /** @type {Record<string, unknown>} */ (res._meta.error);
      ctx.log.info({ tool: name, projectKey, outcome: String(s.kind), reason: s.reason, cid: s.cid, ms: Date.now() - started });
      return res;
    }
  });
}

/** @param {string} text @param {Ctx} ctx */
function fit(text, ctx) {
  if (text.length <= CHARACTER_LIMIT) return text;
  return text.slice(0, CHARACTER_LIMIT) + '\n…' + ctx.t('result.truncated', { limit: CHARACTER_LIMIT });
}
