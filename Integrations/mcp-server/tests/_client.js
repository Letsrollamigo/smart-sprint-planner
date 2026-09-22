// @ts-check
/** Клиент SDK, связанный с сервером в памяти. */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildServer } from '../src/server.js';

/** @param {import('../src/context.js').Ctx} ctx */
export async function connect(ctx) {
  const server = buildServer(ctx);
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st);
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(ct);
  /** @param {string} name @param {Record<string, unknown>} args */
  const call = async (name, args) => /** @type {any} */ (await client.callTool({ name, arguments: args }));
  return { client, server, call, close: async () => { await client.close(); await server.close(); } };
}
