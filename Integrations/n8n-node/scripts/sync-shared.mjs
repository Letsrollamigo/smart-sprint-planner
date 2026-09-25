#!/usr/bin/env node
// Общий слой ноды: nodes/SprintPlanner/shared/ ← ../mcp-server/src/ (байт-копии) и notes.<язык>.json —
// выборка полей языка сборки из ../error-codes.notes.json. Источник правды — MCP-сервер и реестр кодов.
// `--check` — сверка (гейт tests/shared.test.mjs зовёт ту же функцию).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PKG = path.resolve(HERE, '..');
const SRC = path.resolve(PKG, '..', 'mcp-server', 'src');
const NOTES = path.resolve(PKG, '..', 'error-codes.notes.json');
export const SHARED = path.join(PKG, 'nodes', 'SprintPlanner', 'shared');
export const FILES = ['constants.js', 'errors.js', 'ops.js', 'shape.js'];
const LANG_FIELDS = { ru: ['ru', 'action'], en: ['en', 'actionEn'] };

/** Язык сборки — из branding.ts (единственный per-fork источник). */
export function lang() {
  const m = /\blang:\s*'(ru|en)'/.exec(fs.readFileSync(path.join(PKG, 'nodes', 'SprintPlanner', 'branding.ts'), 'utf8'));
  if (!m) throw new Error('branding.ts: lang not found');
  return m[1];
}

export function sourceAvailable() { return fs.existsSync(NOTES) && FILES.every((f) => fs.existsSync(path.join(SRC, f))); }

/** @param {string} l */
export function notesText(l) {
  const all = JSON.parse(fs.readFileSync(NOTES, 'utf8'));
  const out = {};
  for (const [code, n] of Object.entries(all)) {
    const o = {};
    for (const k of LANG_FIELDS[l]) if (typeof n[k] === 'string') o[k] = n[k];
    out[code] = o;
  }
  return JSON.stringify(out, null, 2) + '\n';
}

export function diff() {
  const out = [];
  for (const f of FILES) {
    const b = path.join(SHARED, f);
    if (!fs.existsSync(b)) out.push(f + ': missing copy');
    else if (!fs.readFileSync(path.join(SRC, f)).equals(fs.readFileSync(b))) out.push(f + ': copy differs from mcp-server/src');
  }
  const l = lang();
  const n = path.join(SHARED, `notes.${l}.json`);
  if (!fs.existsSync(n) || fs.readFileSync(n, 'utf8') !== notesText(l)) out.push(`notes.${l}.json: differs from error-codes.notes.json`);
  return out;
}

export function sync() {
  fs.mkdirSync(SHARED, { recursive: true });
  for (const f of FILES) fs.copyFileSync(path.join(SRC, f), path.join(SHARED, f));
  const l = lang();
  fs.writeFileSync(path.join(SHARED, `notes.${l}.json`), notesText(l));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!sourceAvailable()) { console.error('sync-shared: ../mcp-server/src not found — run inside the plugin repository'); process.exit(2); }
  if (process.argv.includes('--check')) {
    const d = diff();
    if (d.length) { console.error('sync-shared: ' + d.join('; ') + ' — run npm run sync-shared'); process.exit(1); }
    console.log('sync-shared: copies match');
  } else { sync(); console.log('sync-shared: copied ' + FILES.join(', ') + ' and notes.' + lang() + '.json'); }
}
