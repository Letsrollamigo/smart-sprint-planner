// @ts-check
/** Общий HTTP-сервер: /healthz без токена; POST /mcp — Bearer обязателен, на каждый запрос свой McpServer и транспорт без сессий. */
import http from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { buildServer, VERSION } from './server.js';
import { SERVER_NAME, CONTRACT_MIN } from './constants.js';

/** @param {http.ServerResponse} res @param {number} status @param {unknown} body */
function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

/**
 * @param {{ host: string, port: number, allowedHosts: string[] }} config
 * @param {(token: string) => import('./context.js').Ctx} makeCtx
 * @param {{ t: (k: string, p?: Record<string, unknown>) => string, log: ReturnType<import('./log.js').createLog> }} deps
 * @returns {Promise<http.Server>}
 */
export async function startHttp(config, makeCtx, { t, log }) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/healthz') return json(res, 200, { ok: true, name: SERVER_NAME, version: VERSION, contractMin: CONTRACT_MIN });
    if (url.pathname !== '/mcp') return json(res, 404, { error: 'not_found' });
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return json(res, 405, { error: 'method_not_allowed' }); }
    const m = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || '');
    // 401 без WWW-Authenticate намеренно: заголовок запускал бы у клиентов OAuth-сценарий, а здесь нужен токен YouTrack.
    if (!m) { log.info({ event: 'unauthorized', path: '/mcp' }); return json(res, 401, { error: 'unauthorized', message: t('http.noToken') }); }
    const mcp = buildServer(makeCtx(m[1]));
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, enableJsonResponse: true,
      enableDnsRebindingProtection: config.allowedHosts.length > 0, allowedHosts: config.allowedHosts.length ? config.allowedHosts : undefined
    });
    res.on('close', () => { transport.close().catch(() => {}); mcp.close().catch(() => {}); });
    try {
      await mcp.connect(transport);
      await transport.handleRequest(req, res);
    } catch (e) {
      log.error({ event: 'mcp_request_failed', msg: e instanceof Error ? e.message : String(e) });
      if (!res.headersSent) json(res, 500, { error: 'internal' });
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(config.port, config.host, () => resolve(undefined)); });
  log.info({ event: 'listening', transport: 'http', host: config.host, port: config.port });
  return server;
}
