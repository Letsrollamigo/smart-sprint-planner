'use strict';
/**
 * v1.8.0 D130 — External ticket ID unit tests.
 *
 * Covers:
 *   - ALLOWED_ITEM_KEYS extension (externalTicketId present)
 *   - ALLOWED_SETTINGS_KEYS extension (fieldExternalTicketId present)
 *   - validateItem accepts externalTicketId (valid values)
 *   - validateItem rejects externalTicketId > 200 chars
 *   - validateItem rejects externalTicketId that is not a string
 *   - validateItem accepts items without externalTicketId (backward compat)
 *   - CURRENT_PLUGIN_VERSION bumped to 1.8.0
 */
const test   = require('node:test');
const assert = require('node:assert');
const path   = require('node:path');

const backend = require(path.join(__dirname, '..', '..', 'backend-project.js'));
const {
  validateItem,
  ALLOWED_ITEM_KEYS,
  ALLOWED_SETTINGS_KEYS,
  CURRENT_PLUGIN_VERSION,
} = backend;

test('externalTicketId present in ALLOWED_ITEM_KEYS', function () {
  assert.ok(ALLOWED_ITEM_KEYS.indexOf('externalTicketId') >= 0,
    'ALLOWED_ITEM_KEYS must include externalTicketId');
});

test('fieldExternalTicketId present in ALLOWED_SETTINGS_KEYS', function () {
  assert.ok(ALLOWED_SETTINGS_KEYS.indexOf('fieldExternalTicketId') >= 0,
    'ALLOWED_SETTINGS_KEYS must include fieldExternalTicketId');
});

test('validateItem accepts item with valid externalTicketId (plain string)', function () {
  const item = {
    issueId: 'PROJ-1',
    addedAt: 1779148800000,
    addedBy: 'fixture_user_1',
    inclusionStatus: 'INC_PLANNED',
    externalTicketId: 'EXT-1234'
  };
  assert.strictEqual(validateItem(item), true);
});

test('validateItem accepts item with URL-shaped externalTicketId', function () {
  const item = {
    issueId: 'PROJ-2',
    addedAt: 1779148800000,
    addedBy: 'fixture_user_1',
    inclusionStatus: 'INC_PLANNED',
    externalTicketId: 'https://service-desk.corp/ticket/999'
  };
  assert.strictEqual(validateItem(item), true);
});

test('validateItem accepts item without externalTicketId (backward compat)', function () {
  const item = {
    issueId: 'PROJ-3',
    addedAt: 1779148800000,
    addedBy: 'fixture_user_1',
    inclusionStatus: 'INC_PLANNED'
  };
  assert.strictEqual(validateItem(item), true);
});

test('validateItem rejects externalTicketId longer than 1000 chars', function () {
  const item = {
    issueId: 'PROJ-4',
    addedAt: 1779148800000,
    addedBy: 'fixture_user_1',
    inclusionStatus: 'INC_PLANNED',
    externalTicketId: 'x'.repeat(1001)
  };
  assert.strictEqual(validateItem(item), false);
});

test('validateItem rejects externalTicketId of non-string type', function () {
  const item = {
    issueId: 'PROJ-5',
    addedAt: 1779148800000,
    addedBy: 'fixture_user_1',
    inclusionStatus: 'INC_PLANNED',
    externalTicketId: 12345
  };
  assert.strictEqual(validateItem(item), false);
});

test('validateItem accepts long URL as externalTicketId (> 200 chars, within 1000)', function () {
  // v1.8.0 fix: original 200-char limit rejected real-world URLs — bumped to 1000
  const item = {
    issueId: 'PROJ-6',
    addedAt: 1779148800000,
    addedBy: 'fixture_user_1',
    inclusionStatus: 'INC_PLANNED',
    externalTicketId: 'https://service-desk.corp/browse/' + 'X'.repeat(170)  // ~205 chars
  };
  assert.strictEqual(validateItem(item), true);
});

test('CURRENT_PLUGIN_VERSION is 3.6.0', function () {
  assert.strictEqual(CURRENT_PLUGIN_VERSION, '3.6.0');
});
