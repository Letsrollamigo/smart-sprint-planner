import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { flatKeys, loadDictionary } from '../src/i18n/index.js';
import branding from '../src/branding.js';
import { sourceAvailable, diff } from '../scripts/sync-contract.mjs';
import { LOG_FIELDS, createLog } from '../src/log.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));

test('fork-agnostic: в src/ нет значений брендинга и id приложений, кроме branding.js', () => {
  // Запрещённые литералы выводятся из самого branding.js (никаких имён форков в тесте):
  // id приложения, название продукта, хост документации и любой id вида «<слово>-sprint-planner».
  const host = new URL(branding.docsUrl).host;
  const needles = [branding.appId, branding.productName.toLowerCase(), host];
  const bad = walk(path.join(ROOT, 'src')).filter((f) => !f.endsWith('branding.js')).filter((f) => {
    const text = fs.readFileSync(f, 'utf8'), lower = text.toLowerCase();
    return needles.some((n) => lower.includes(n.toLowerCase())) || /\b[a-z]+-sprint-planner\b/.test(text);
  });
  assert.deepEqual(bad.map((f) => path.relative(ROOT, f)), []);
});

test('копии контракта в пакете равны источнику (в репозитории плагина)', { skip: !sourceAvailable() }, () => {
  assert.deepEqual(diff(), []);
});

test('словари: ru полный по ключам инструментов; en (если есть) покрывает все ключи ru', async () => {
  const ru = await loadDictionary('ru');
  const ruKeys = flatKeys(ru);
  for (const name of Object.keys(ru.tools)) assert.ok(ruKeys.includes(`tools.${name}.title`) && ruKeys.includes(`tools.${name}.description`));
  for (const lang of branding.languages.filter((l) => l !== 'ru')) {
    const other = flatKeys(await loadDictionary(lang));
    assert.deepEqual(ruKeys.filter((k) => !other.includes(k)), [], `в ${lang} нет ключей`);
    assert.deepEqual(other.filter((k) => !ruKeys.includes(k)), [], `в ${lang} лишние ключи`);
  }
  assert.ok(branding.languages.includes(branding.defaultLang));
});

test('журнал печатает только поля белого списка', () => {
  const lines = [];
  const log = createLog('info', { write: (s) => lines.push(JSON.parse(s)) });
  log.info({ tool: 'x', token: 'perm-secret', body: { a: 1 }, authorization: 'Bearer z', cid: 'c' });
  log.debug({ tool: 'hidden' });
  assert.equal(lines.length, 1);
  assert.deepEqual(Object.keys(lines[0]).filter((k) => !['ts', 'level'].includes(k)), ['tool', 'cid']);
  assert.ok(!LOG_FIELDS.includes('token') && !LOG_FIELDS.includes('body') && !LOG_FIELDS.includes('authorization'));
});

test('единственный fetch — в client.js; исходящие адреса собираются только там', () => {
  const users = walk(path.join(ROOT, 'src')).filter((f) => /\bfetch\b/.test(fs.readFileSync(f, 'utf8')));
  assert.deepEqual(users.map((f) => path.relative(ROOT, f)).sort(), ['src/client.js', 'src/context.js']);
});
