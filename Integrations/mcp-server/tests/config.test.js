import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, pickLang, ConfigError } from '../src/config.js';
import { makeT, loadDictionary } from '../src/i18n/index.js';
import branding from '../src/branding.js';

const t = makeT(await loadDictionary('ru'));
const B = { appId: 'demo-app', defaultLang: 'ru', languages: ['ru', 'en'] };

test('минимальный http-конфиг и умолчания', () => {
  const c = loadConfig({ YT_BASE_URL: 'http://yt.local:8080/' }, B, t);
  assert.equal(c.baseUrl, 'http://yt.local:8080'); assert.equal(c.transport, 'http'); assert.equal(c.port, 8085); assert.equal(c.host, '127.0.0.1');
  assert.equal(c.appId, 'demo-app'); assert.equal(c.lang, 'ru'); assert.equal(c.readOnly, false); assert.deepEqual(c.allowlist, []); assert.equal(c.timeoutMs, 30000);
});

test('http + YT_TOKEN — ошибка; stdio без токена — ошибка; stdio с токеном — ок', () => {
  assert.throws(() => loadConfig({ YT_BASE_URL: 'http://a', YT_TOKEN: 'x' }, B, t), (e) => e instanceof ConfigError && e.problems.length === 1 && /YT_TOKEN/.test(e.problems[0]));
  assert.throws(() => loadConfig({ YT_BASE_URL: 'http://a', MCP_TRANSPORT: 'stdio' }, B, t), /YT_TOKEN/);
  assert.equal(loadConfig({ YT_BASE_URL: 'http://a', MCP_TRANSPORT: 'stdio', YT_TOKEN: 'x' }, B, t).token, 'x');
});

test('проверки: адрес, порт, транспорт, таймаут, appId — все проблемы разом', () => {
  assert.throws(() => loadConfig({ YT_BASE_URL: 'yt.local/api', MCP_PORT: '99999', MCP_TRANSPORT: 'sse', YT_TIMEOUT_MS: '5', PLANNER_APP_ID: 'Bad App' }, B, t), (e) => e.problems.length === 5);
});

test('списки, флаги, язык', () => {
  const c = loadConfig({ YT_BASE_URL: 'https://yt', PROJECT_ALLOWLIST: 'A, B,,C', MCP_ALLOWED_HOSTS: 'localhost:8085', READ_ONLY: '1', MCP_LANG: 'en', LOG_LEVEL: 'debug', MCP_HOST: '0.0.0.0' }, B, t);
  assert.deepEqual(c.allowlist, ['A', 'B', 'C']); assert.deepEqual(c.allowedHosts, ['localhost:8085']); assert.equal(c.readOnly, true); assert.equal(c.lang, 'en'); assert.equal(c.logLevel, 'debug'); assert.equal(c.host, '0.0.0.0');
  assert.equal(loadConfig({ YT_BASE_URL: 'https://yt', MCP_LANG: 'de' }, B, t).lang, 'ru');
  assert.equal(pickLang({ MCP_LANG: 'en' }, branding), branding.languages.includes('en') ? 'en' : branding.defaultLang);
});
