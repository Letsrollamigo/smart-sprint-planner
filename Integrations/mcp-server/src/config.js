// @ts-check
/** Разбор и проверка окружения. Тексты ошибок — через словарь (t), чтобы оператор читал их на языке сервера. */

const TRANSPORTS = ['http', 'stdio'];
const LOG_LEVELS = ['error', 'info', 'debug'];

export class ConfigError extends Error {
  /** @param {string[]} problems */
  constructor(problems) { super(problems.join('\n')); this.name = 'ConfigError'; this.problems = problems; }
}

/** @param {string|undefined} s */
const list = (s) => (s || '').split(',').map((x) => x.trim()).filter(Boolean);

/**
 * @param {Record<string, string|undefined>} env
 * @param {{ appId: string, defaultLang: string, languages: string[] }} branding
 * @param {(key: string, params?: Record<string, unknown>) => string} t
 */
export function loadConfig(env, branding, t) {
  /** @type {string[]} */
  const problems = [];
  const rawBase = (env.YT_BASE_URL || '').trim();
  if (!/^https?:\/\/[^\s/?#]+$/.test(rawBase.replace(/\/+$/, ''))) problems.push(t('config.baseUrl'));
  const baseUrl = rawBase.replace(/\/+$/, '');

  const appId = (env.PLANNER_APP_ID || branding.appId).trim();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(appId)) problems.push(t('config.appId'));

  const transport = env.MCP_TRANSPORT || 'http';
  if (!TRANSPORTS.includes(transport)) problems.push(t('config.transport'));

  const port = env.MCP_PORT === undefined || env.MCP_PORT === '' ? 8085 : Number(env.MCP_PORT);
  if (!Number.isInteger(port) || port < 0 || port > 65535) problems.push(t('config.port'));

  const timeoutMs = env.YT_TIMEOUT_MS === undefined || env.YT_TIMEOUT_MS === '' ? 30000 : Number(env.YT_TIMEOUT_MS);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 600000) problems.push(t('config.timeout'));

  const token = (env.YT_TOKEN || '').trim();
  if (transport === 'http' && token) problems.push(t('config.tokenInHttp'));
  if (transport === 'stdio' && !token) problems.push(t('config.tokenMissingStdio'));

  const lang = env.MCP_LANG && branding.languages.includes(env.MCP_LANG) ? env.MCP_LANG : branding.defaultLang;
  const logLevel = env.LOG_LEVEL && LOG_LEVELS.includes(env.LOG_LEVEL) ? env.LOG_LEVEL : 'info';

  if (problems.length) throw new ConfigError(problems);
  return {
    baseUrl, appId, transport, port, timeoutMs, token, lang,
    host: env.MCP_HOST || '127.0.0.1',
    allowedHosts: list(env.MCP_ALLOWED_HOSTS),
    allowlist: list(env.PROJECT_ALLOWLIST),
    readOnly: env.READ_ONLY === '1' || env.READ_ONLY === 'true',
    logLevel: /** @type {'error'|'info'|'debug'} */ (logLevel)
  };
}

/** Язык выбирается до загрузки словаря — по тем же правилам, что в loadConfig. @param {Record<string, string|undefined>} env @param {{ defaultLang: string, languages: string[] }} branding */
export function pickLang(env, branding) {
  return env.MCP_LANG && branding.languages.includes(env.MCP_LANG) ? env.MCP_LANG : branding.defaultLang;
}
