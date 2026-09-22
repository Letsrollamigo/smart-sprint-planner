// @ts-check
/** Пять статических ресурсов: контракт, реестр кодов, роли, перечисления, памятка. Токен не нужен. */
import fs from 'node:fs';
import { ROLE_KEYS, ROLE_LABELS, SPRINT_STATUSES, INCLUSION_STATUSES, ABSENCE_TYPES, RELEASE_STATUSES, RELEASE_KINDS, RELEASE_SOURCES, PHASE_KEYS, CONTRACT_MIN } from './constants.js';

const read = (/** @type {string} */ rel) => fs.readFileSync(new URL('../contract/' + rel, import.meta.url), 'utf8');
const openapi = read('openapi-sprint.yaml');
const codes = JSON.parse(read('error-codes.json'));
const notes = JSON.parse(read('error-codes.notes.json'));

/** Реестр кодов + подсказки в одном документе. */
const errorCodes = JSON.stringify({ contract: CONTRACT_MIN, codes: (codes.codes || []).filter((/** @type {any} */ c) => c.published !== false).map((/** @type {any} */ c) => ({ code: c.code, http: c.http, error: c.error, ...(notes[c.code] || {}) })) }, null, 1);

/** @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server @param {import('./context.js').Ctx} ctx */
export function registerResources(server, ctx) {
  const { t } = ctx;
  /** @param {string} id @param {string} uri @param {string} mime @param {() => string} body */
  const add = (id, uri, mime, body) => server.registerResource(id, uri, { title: t(`resources.${id}.title`), description: t(`resources.${id}.description`), mimeType: mime },
    async (u) => ({ contents: [{ uri: u.href, mimeType: mime, text: body() }] }));
  add('openapi', 'planner://contract/openapi', 'application/yaml', () => openapi);
  add('errorCodes', 'planner://contract/error-codes', 'application/json', () => errorCodes);
  add('roles', 'planner://reference/roles', 'application/json', () => JSON.stringify(ROLE_KEYS.map((k) => ({ roleKey: k, ru: ROLE_LABELS.ru[k], en: ROLE_LABELS.en[k], resourceKey: 'resource' + k.charAt(0).toUpperCase() + k.slice(1) })), null, 1));
  add('enums', 'planner://reference/enums', 'application/json', () => JSON.stringify({ sprintStatuses: SPRINT_STATUSES, inclusionStatuses: INCLUSION_STATUSES, absenceTypes: ABSENCE_TYPES, releaseStatuses: RELEASE_STATUSES, releaseChain: ['planned', 'prep', 'work', 'released'], releaseKinds: RELEASE_KINDS, releaseSources: RELEASE_SOURCES, phaseKeys: PHASE_KEYS, units: { effort: 'minutes', dates: 'epoch-ms', absences: 'YYYY-MM-DD' } }, null, 1));
  add('quickstart', 'planner://guide/quickstart', 'text/markdown', () => t('guide.quickstart', { productName: ctx.branding.productName, contractMin: CONTRACT_MIN }));
}

export const RESOURCE_COUNT = 5;
