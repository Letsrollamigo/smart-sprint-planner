#!/usr/bin/env node
// Копии контракта внутри пакета: contract/ ← ../ (Integrations/). Источник правды — Integrations/.
// `--check` — сверка байт-в-байт (гейт tests/contract-copies.test.js зовёт ту же функцию).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PKG = path.resolve(HERE, '..');
export const SRC = path.resolve(PKG, '..');
export const FILES = ['openapi-sprint.yaml', 'error-codes.json', 'error-codes.notes.json'];

export function sourceAvailable() { return FILES.every((f) => fs.existsSync(path.join(SRC, f))); }

export function diff() {
  const out = [];
  for (const f of FILES) {
    const a = path.join(SRC, f), b = path.join(PKG, 'contract', f);
    if (!fs.existsSync(b)) { out.push(f + ': копии нет'); continue; }
    if (!fs.readFileSync(a).equals(fs.readFileSync(b))) out.push(f + ': копия расходится с источником');
  }
  return out;
}

export function sync() {
  fs.mkdirSync(path.join(PKG, 'contract'), { recursive: true });
  for (const f of FILES) fs.copyFileSync(path.join(SRC, f), path.join(PKG, 'contract', f));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!sourceAvailable()) { console.error('sync-contract: источник ../ не найден — запуск только из репозитория плагина'); process.exit(2); }
  if (process.argv.includes('--check')) {
    const d = diff();
    if (d.length) { console.error('sync-contract: ' + d.join('; ') + ' — выполните npm run sync-contract'); process.exit(1); }
    console.log('sync-contract: копии совпадают');
  } else { sync(); console.log('sync-contract: скопировано ' + FILES.join(', ')); }
}
