#!/usr/bin/env node
'use strict';
const fs   = require('node:fs');
const path = require('node:path');

const ROOT    = path.join(__dirname, '..');
const SCHEMA  = path.join(ROOT, 'schema', 'whitelists.json');
const BACKEND = path.join(ROOT, 'backend-core.js'); // #25 Ф1 — whitelist'ы в ядре

const BEGIN_MARK = '// AUTOGEN:WHITELISTS BEGIN — generated from schema/whitelists.json by scripts/sync-backend-whitelists.js. Do NOT edit by hand.';
const END_MARK   = '// AUTOGEN:WHITELISTS END';

const schema = JSON.parse(fs.readFileSync(SCHEMA, 'utf8'));

const expected = [
  'ALLOWED_SPRINT_KEYS', 'ALLOWED_HISTORY_SNAP_KEYS', 'ALLOWED_WORKING_DRAFT_KEYS',
  // #45 Capacity Management — задекларированы в R1, потребляются валидаторами R2.
  'ALLOWED_CALENDAR_KEYS', 'ALLOWED_ABSENCE_ENTRY_KEYS',
  'ALLOWED_CAPACITY_RECORD_KEYS', 'ALLOWED_CAPACITY_PERSON_KEYS',
  // #48 Release Management — стор ssp_releases (R1.2 фундамент), потребляет backend-release.js.
  'ALLOWED_RELEASES_KEYS'
];
for (const k of expected) {
  if (!Array.isArray(schema[k]))      { console.error('schema: ' + k + ' must be array');                            process.exit(1); }
  if (schema[k].length === 0)         { console.error('schema: ' + k + ' empty');                                    process.exit(1); }
  if (schema[k].some(v => typeof v !== 'string' || v.length === 0)) {
    console.error('schema: ' + k + ' must be array of non-empty strings');                                           process.exit(1);
  }
  if (new Set(schema[k]).size !== schema[k].length) {
    console.error('schema: ' + k + ' has duplicate keys');                                                            process.exit(1);
  }
}

function fmtArr(name, keys) {
  return 'var ' + name + ' = [\n' + keys.map(k => "  '" + k + "'").join(',\n') + '\n];';
}

const generated = [
  BEGIN_MARK,
  fmtArr('ALLOWED_SPRINT_KEYS',        schema.ALLOWED_SPRINT_KEYS),
  fmtArr('ALLOWED_HISTORY_SNAP_KEYS',  schema.ALLOWED_HISTORY_SNAP_KEYS),
  fmtArr('ALLOWED_WORKING_DRAFT_KEYS', schema.ALLOWED_WORKING_DRAFT_KEYS),
  // #45 Capacity Management whitelist'ы (R1 фундамент).
  fmtArr('ALLOWED_CALENDAR_KEYS',        schema.ALLOWED_CALENDAR_KEYS),
  fmtArr('ALLOWED_ABSENCE_ENTRY_KEYS',   schema.ALLOWED_ABSENCE_ENTRY_KEYS),
  fmtArr('ALLOWED_CAPACITY_RECORD_KEYS', schema.ALLOWED_CAPACITY_RECORD_KEYS),
  fmtArr('ALLOWED_CAPACITY_PERSON_KEYS', schema.ALLOWED_CAPACITY_PERSON_KEYS),
  // #48 Release Management whitelist (R1.2 фундамент).
  fmtArr('ALLOWED_RELEASES_KEYS', schema.ALLOWED_RELEASES_KEYS),
  END_MARK
].join('\n');

let content = fs.readFileSync(BACKEND, 'utf8');
const bi = content.indexOf(BEGIN_MARK);
const ei = content.indexOf(END_MARK);

if (bi === -1 || ei === -1) {
  console.error('AUTOGEN markers not found in backend-core.js — add markers manually before first sync');
  process.exit(1);
}
if (ei < bi) { console.error('END marker before BEGIN'); process.exit(1); }

const before  = content.slice(0, bi);
const after   = content.slice(ei + END_MARK.length);
const updated = before + generated + after;

if (updated === content) {
  console.log('✓ whitelists in backend-core.js already in sync with schema/whitelists.json');
} else {
  fs.writeFileSync(BACKEND, updated);
  console.log('✓ synced backend-core.js from schema/whitelists.json');
}
