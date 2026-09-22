#!/usr/bin/env node
// @ts-check
/** Точка входа: язык → словарь → конфиг → журнал → контекст → транспорт. */
import fs from 'node:fs';
import branding from './branding.js';
import { pickLang, loadConfig, ConfigError } from './config.js';
import { loadDictionary, makeT } from './i18n/index.js';
import { createLog } from './log.js';
import { contextFactory } from './context.js';
import { startHttp } from './http.js';
import { startStdio } from './stdio.js';
import { VERSION } from './server.js';

if (process.argv.includes('--version')) { console.log(VERSION); process.exit(0); }

const lang = pickLang(process.env, branding);
const t = makeT(await loadDictionary(lang));
let config;
try {
  config = loadConfig(process.env, branding, t);
} catch (e) {
  console.error(t('config.header'));
  console.error(e instanceof ConfigError ? e.problems.map((p) => ' - ' + p).join('\n') : String(e));
  process.exit(2);
}
const log = createLog(config.logLevel);
const notes = JSON.parse(fs.readFileSync(new URL('../contract/error-codes.notes.json', import.meta.url), 'utf8'));
const makeCtx = contextFactory(config, { t, notes, log, branding });

if (config.transport === 'http') await startHttp(config, makeCtx, { t, log });
else await startStdio(config.token, makeCtx, log);
