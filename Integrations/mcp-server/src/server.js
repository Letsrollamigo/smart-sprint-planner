// @ts-check
/** Сборка McpServer для одного контекста: инструменты (запись — если не READ_ONLY), ресурсы, промпты, instructions. */
import fs from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SERVER_NAME, CONTRACT_MIN } from './constants.js';
import { registerReadTools } from './tools/read.js';
import { registerWriteTools } from './tools/write.js';
import { registerResources } from './resources.js';
import { registerPrompts } from './prompts.js';

export const VERSION = /** @type {string} */ (JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version);

/** @param {import('./context.js').Ctx} ctx */
export function buildServer(ctx) {
  const server = new McpServer({ name: SERVER_NAME, version: VERSION }, {
    instructions: ctx.t('server.instructions', { productName: ctx.branding.productName, contractMin: CONTRACT_MIN, readOnly: ctx.readOnly ? ctx.t('server.readOnlyNote') : '' })
  });
  registerReadTools(server, ctx);
  if (!ctx.readOnly) registerWriteTools(server, ctx);
  registerResources(server, ctx);
  registerPrompts(server, ctx);
  return server;
}
