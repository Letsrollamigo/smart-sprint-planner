'use strict';
/* #86 — предохранитель «только локальный стенд».
 *
 * Правило «не трогать прод» до этого жило только в CLAUDE.md и памяти, то есть
 * держалось на дисциплине. Два скрипта принимают цель ИЗВНЕ и делают по ней
 * перезаписывающие POST'ы: stand-deploy.sh (позиционный base-url, импорт
 * приложения целиком) и tests/golden/seed-democlone.js (YT_BASE, сид состояния
 * планера). Опечатка в адресе стоит ровно столько, сколько стоит прод.
 *
 * Тест держит обе стороны контракта: удалённая цель отвергается ДО любого
 * сетевого вызова и до сборки, а локальная — проходит. Негативные адреса взяты
 * заведомо неразрешимые (RFC 2606 .invalid / example.com), чтобы даже сломанная
 * защита не могла отправить запрос по реальному адресу; настоящий корп-хост в
 * тестах не упоминается — community-форк публичный.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const DEPLOY = path.join(ROOT, 'scripts', 'stand-deploy.sh');
const SEED = path.join(ROOT, 'tests', 'golden', 'seed-democlone.js');

const REMOTE = ['https://example.invalid', 'https://youtrack.example.com', 'http://10.0.0.5:8080'];

test('#86 stand-deploy: удалённая цель отвергается с кодом 2', () => {
  for (const url of REMOTE) {
    const r = spawnSync('bash', [DEPLOY, '9.9.9', url], { encoding: 'utf8', cwd: ROOT });
    assert.strictEqual(r.status, 2, url + ': ожидался отказ (exit 2), получено ' + r.status);
    assert.match(r.stderr, /ОТКАЗ/, url + ': отказ обязан быть назван в stderr');
  }
});

test('#86 stand-deploy: отказ наступает ДО сборки и до чтения кред', () => {
  const r = spawnSync('bash', [DEPLOY, '9.9.9', 'https://example.invalid'], { encoding: 'utf8', cwd: ROOT });
  assert.doesNotMatch(r.stdout, /vite|esbuild|patched/i, 'сборка не должна стартовать при отвергнутой цели');
  const src = fs.readFileSync(DEPLOY, 'utf8');
  const guardAt = src.indexOf('Предохранитель');
  const buildAt = src.indexOf('npm run build');
  const credAt = src.indexOf('find-generic-password');
  assert.ok(guardAt > 0, 'предохранитель удалён из stand-deploy.sh');
  assert.ok(guardAt < buildAt, 'предохранитель обязан стоять до сборки');
  assert.ok(guardAt < credAt, 'предохранитель обязан стоять до чтения кред из Keychain');
});

test('#86 seed-democlone: удалённая цель отвергается с кодом 2', () => {
  for (const url of REMOTE) {
    const r = spawnSync(process.execPath, [SEED], {
      encoding: 'utf8', cwd: ROOT, env: { ...process.env, YT_BASE: url, YT_TOKEN: '' },
    });
    assert.strictEqual(r.status, 2, url + ': ожидался отказ (exit 2), получено ' + r.status);
    assert.match(r.stderr, /ОТКАЗ/, url + ': отказ обязан быть назван в stderr');
  }
});

test('#86 seed-democlone: локальная цель предохранителем НЕ блокируется', () => {
  /* Без токена скрипт обязан дойти до собственной проверки токена (exit 1) —
     это и доказывает, что localhost проходит гейт, а не отвергается им. */
  const r = spawnSync(process.execPath, [SEED], {
    encoding: 'utf8', cwd: ROOT, env: { ...process.env, YT_BASE: 'http://localhost:8080', YT_TOKEN: '' },
  });
  assert.strictEqual(r.status, 1, 'localhost обязан пройти предохранитель');
  assert.match(r.stderr, /YT_TOKEN/, 'ожидалась штатная проверка токена, а не отказ предохранителя');
});

test('#86 обе точки входа проверяют цель одним и тем же allow-list', () => {
  /* Allow-list, а не deny-list: неизвестный адрес по умолчанию запрещён.
     Проверка именно текстом — чтобы правило нельзя было ослабить до deny-list
     незаметно (deny-list пропускает всё, что в него забыли внести). */
  for (const [f, src] of [[DEPLOY, fs.readFileSync(DEPLOY, 'utf8')], [SEED, fs.readFileSync(SEED, 'utf8')]]) {
    const name = path.basename(f);
    assert.match(src, /localhost/, name + ': в allow-list нет localhost');
    assert.match(src, /127\\?\.0\\?\.0\\?\.1/, name + ': в allow-list нет 127.0.0.1');
    assert.match(src, /\.local/, name + ': в allow-list нет *.local');
    assert.ok(!/youtrack-drcs|sovcombank/i.test(src), name + ': боевой хост не должен упоминаться в скрипте');
  }
});
