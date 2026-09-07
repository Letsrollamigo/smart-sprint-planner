/**
 * Гейт внешнего контракта (#110 «Версионирование API», ⚖ 2026-09-07 — аддитивность):
 *   1. `Integrations/openapi-sprint.yaml` описывает ровно те ключи, что принимает код
 *      (белые списки backend-core) — контракт не отстаёт и не врёт;
 *   2. `info.version` контракта = версии плагина (бампается с релизом);
 *   3. базовая линия `api-contract.baseline.json` — ключи, однажды обещанные интеграторам:
 *      удаление или переименование = красный. Добавление — осознанное обновление линии.
 * YAML читается минимальным разбором (в проекте нет yaml-библиотеки): схемы —
 * `components.schemas.<Name>.properties.<key>` по отступам. Corp-only файл: без него skip.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const YAML = path.join(ROOT, 'Integrations', 'openapi-sprint.yaml');
const BASELINE = path.join(__dirname, 'api-contract.baseline.json');
const present = fs.existsSync(YAML);

function parseContract(text) {
  const lines = text.split('\n');
  const schemas = {}; let cur = null, inProps = false, version = null;
  for (const l of lines) {
    const v = /^  version:\s*([0-9.]+)\s*$/.exec(l); if (v) version = v[1];
    const m = /^    ([A-Za-z][A-Za-z0-9]*):\s*$/.exec(l);
    if (m) { cur = m.group ? m.group(1) : m[1]; schemas[cur] = []; inProps = false; continue; }
    if (cur && /^      properties:\s*$/.test(l)) { inProps = true; continue; }
    if (cur && inProps) {
      const pm = /^        ([A-Za-z_][A-Za-z0-9_]*):/.exec(l);
      if (pm) schemas[cur].push(pm[1]);
      else if (/^      [A-Za-z]/.test(l)) inProps = false;
    }
  }
  return { version, schemas };
}
const sortedEq = (a, b) => JSON.stringify(a.slice().sort()) === JSON.stringify(b.slice().sort());

test('api-contract — контракт совпадает с белыми списками кода и версией плагина', { skip: !present && 'нет Integrations/openapi-sprint.yaml (corp-only)' }, () => {
  const core = require(path.join(ROOT, 'backend-core.js'));
  const pkg = require(path.join(ROOT, 'package.json'));
  const c = parseContract(fs.readFileSync(YAML, 'utf8'));
  assert.strictEqual(c.version, pkg.version, `info.version контракта (${c.version}) ≠ версии плагина (${pkg.version}) — бампнуть с релизом`);
  assert.ok(sortedEq(c.schemas.Sprint, core.ALLOWED_SPRINT_KEYS),
    `Sprint: контракт ${JSON.stringify(c.schemas.Sprint)} ≠ ALLOWED_SPRINT_KEYS ${JSON.stringify(core.ALLOWED_SPRINT_KEYS)}`);
  assert.ok(sortedEq(c.schemas.Item, core.ALLOWED_ITEM_KEYS),
    `Item: контракт ${JSON.stringify(c.schemas.Item)} ≠ ALLOWED_ITEM_KEYS ${JSON.stringify(core.ALLOWED_ITEM_KEYS)}`);
  assert.ok(sortedEq(c.schemas.RoleItems, core.ROLE_KEYS), 'RoleItems ≠ ROLE_KEYS');
  /* POST: контракт — строгое подмножество whitelist: settings намеренно не обещан внешним */
  for (const k of c.schemas.PostSprintDataRequest) assert.ok(core.ALLOWED_SPRINT_DATA_KEYS.includes(k), 'POST-ключ вне whitelist: ' + k);
  assert.ok(sortedEq(c.schemas.PostSprintDataRequest, ['sprint', 'roleItems', 'baseRev']), 'PostSprintDataRequest');
  for (const s of ['AppError', 'RevConflict']) assert.ok(c.schemas[s].includes('cid'), s + ' без cid (#85)');
});

test('api-contract — аддитивность: ключи базовой линии не исчезают и не переименовываются', { skip: !present && 'нет Integrations/openapi-sprint.yaml (corp-only)' }, () => {
  const c = parseContract(fs.readFileSync(YAML, 'utf8'));
  const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  const lost = [];
  for (const [schema, keys] of Object.entries(base.schemas)) {
    assert.ok(c.schemas[schema], 'схема из базовой линии исчезла: ' + schema);
    for (const k of keys) if (!c.schemas[schema].includes(k)) lost.push(schema + '.' + k);
  }
  assert.deepStrictEqual(lost, [], 'из контракта пропали обещанные ключи (правило аддитивности): ' + lost.join(', '));
  /* обратная сверка — новые ключи контракта должны попасть в линию осознанно */
  const unlisted = [];
  for (const [schema, keys] of Object.entries(base.schemas)) for (const k of c.schemas[schema]) if (!keys.includes(k)) unlisted.push(schema + '.' + k);
  assert.deepStrictEqual(unlisted, [], 'в контракте есть ключи вне базовой линии — добавить в api-contract.baseline.json: ' + unlisted.join(', '));
});
