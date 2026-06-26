'use strict';

/* S3 (кластер-баг спринтов) — сброс активного спринта затирает ssp_sprint.
 * Backend POST /sprint-data при body.sprint===null делает setProp(ctx,'ssp_sprint','').
 * Этот тест фиксирует read-инвариант, на котором держится фикс: на следующем
 * GET /sprint-data (backend-core.js: parseJson(getProp(ctx,'ssp_sprint'), null))
 * затёртый проп резолвится в null → удалённый спринт не воскресает призраком
 * в пикере и не переживает хард-релоад. */

const test   = require('node:test');
const assert = require('node:assert');
const path   = require('node:path');

const { getProp, setProp, parseJson } = require(path.join(__dirname, '..', '..', 'backend-core.js'));

test('S3 wipe: после setProp(ssp_sprint,"") read-path резолвится в null', () => {
  const ctx = { project: { extensionProperties: {} } };
  // precondition — призрак лежит в проп
  setProp(ctx, 'ssp_sprint', JSON.stringify({ sprintId: 'ghost', status: 'PLANNING' }));
  assert.ok(parseJson(getProp(ctx, 'ssp_sprint'), null), 'precondition: спринт должен читаться');
  // S3-нук — ровно то, что делает backend-ветка body.sprint===null
  setProp(ctx, 'ssp_sprint', '');
  assert.strictEqual(parseJson(getProp(ctx, 'ssp_sprint'), null), null,
    'после затирания спринт-призрак не должен воскресать на read');
});
