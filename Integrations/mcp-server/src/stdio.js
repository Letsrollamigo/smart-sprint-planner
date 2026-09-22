// @ts-check
/** Режим разработчика: один процесс, токен из YT_TOKEN, транспорт stdio (MCP Inspector, юниты). */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { buildServer } from './server.js';

/** @param {string} token @param {(token: string) => import('./context.js').Ctx} makeCtx @param {ReturnType<import('./log.js').createLog>} log */
export async function startStdio(token, makeCtx, log) {
  const server = buildServer(makeCtx(token));
  await server.connect(new StdioServerTransport());
  log.info({ event: 'listening', transport: 'stdio' });
  return server;
}
