#!/usr/bin/env node
/**
 * v1.6.0 D125 — Детерминированный генератор синтетических fixture'ов.
 *
 * Использование:
 *   VERSION=1.6.0 node tests/fixtures/generate-baseline.js
 *   npm run fixtures:generate               # VERSION берётся из package.json
 *
 * Генерирует tests/fixtures/snapshots/<VERSION>/ с 4 файлами:
 *   sprint-baseline.json  — минимальный sprint
 *   sprint-full.json      — sprint с personalPlanning и ёмкостью
 *   history.json          — массив из 2 records (FINISHED + CONFIRMED)
 *   working-draft.json    — рабочая копия
 *
 * Правила:
 *   - Все timestamps — фиксированные константы (не Date.now()).
 *   - Все имена пользователей — fixture_user_<N>.
 *   - pluginVersion выставляется в VERSION в каждом snapshot'е.
 *   - Если схема не изменилась, fixture = byte-identical с предыдущей версией
 *     + bump pluginVersion.
 *   - Если directory уже существует и идентична — скрипт завершается без записи (идемпотентен).
 */
'use strict';

const fs   = require('node:fs');
const path = require('node:path');

// Определяем VERSION
let VERSION = process.env.VERSION;
if (!VERSION) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'));
    VERSION = pkg.version;
  } catch (e) {
    console.error('Cannot determine VERSION: set VERSION env or provide package.json');
    process.exit(1);
  }
}
if (!/^\d+\.\d+\.\d+$/.test(VERSION)) {
  console.error('Invalid VERSION: ' + VERSION + ' — must be X.Y.Z');
  process.exit(1);
}

const OUT_DIR = path.join(__dirname, 'snapshots', VERSION);

// ─── Fixture definitions ──────────────────────────────────────────────────────
// Все timestamps — фиксированные константы.
// При изменении schema — добавляй новые поля здесь, а не в предыдущих fixture'ах.

const SPRINT_BASELINE = {
  sprintId:        'ssp-fixture-2026-05-20-baseline',
  name:            'Fixture Sprint Baseline',
  status:          'PLANNING',
  dateStart:       1779148800000,
  dateEnd:         1780358400000,
  updatedBy:       'fixture_user_1',
  updatedAt:       1779148800000,
  personalPlanning: {},
  pluginVersion:   VERSION
};

const SPRINT_FULL = {
  sprintId:        'ssp-fixture-2026-05-20-full',
  name:            'Fixture Sprint Full',
  status:          'ALLOCATED',
  dateStart:       1779148800000,
  dateEnd:         1780358400000,
  updatedBy:       'fixture_user_1',
  updatedAt:       1779235200000,
  sprintFieldVal:  'Fixture Sprint May 2026',
  versionFieldVal: 'v2026.05',
  resourceDevFront: 80,
  resourceDevBack:  96,
  resourceTesting:  56,
  remainDevFront:   38,
  remainDevBack:    30,
  remainTesting:    21,
  personalPlanning: {
    devFront: {
      nkcKey: 'may',
      people: [{ name: 'fixture_user_1', grade: 'Middle', kpe: 1.0, participation: 1.0, nkc: 168 }],
      taskAssignments: {}
    }
  },
  migrationLog:    [],
  pluginVersion:   VERSION
};

const HISTORY = [
  {
    sprintId:     'ssp-fixture-history-1',
    name:         'Fixture History Sprint 1',
    roleKey:      'devFront',
    roleLabel:    'Frontend Development',
    status:       'FINISHED',
    dateStart:    1776556800000,
    dateEnd:      1777766400000,
    confirmedAt:  1776556800000,
    confirmedBy:  'fixture_user_validator',
    finishedAt:   1777766400000,
    finishedBy:   'fixture_user_validator',
    items:        [],
    personalPlanning: {},
    hasWorkingCopy: false,
    revisions:    [],
    pluginVersion: VERSION
  },
  {
    sprintId:     'ssp-fixture-history-2',
    name:         'Fixture History Sprint 2',
    roleKey:      'devBack',
    roleLabel:    'Backend Development',
    status:       'CONFIRMED',
    dateStart:    1777939200000,
    dateEnd:      1779148800000,
    confirmedAt:  1777939200000,
    confirmedBy:  'fixture_user_validator',
    items:        [],
    personalPlanning: {},
    hasWorkingCopy: false,
    revisions:    [],
    pluginVersion: VERSION
  }
];

const WORKING_DRAFT = {
  schemaVersion:    1,
  key:              'ssp-fixture-2026-05-20-full_devFront',
  baseSnapshotHash: 'fixture-hash-abc123',
  baseStatusAtOpen: 'ALLOCATED',
  createdAt:        1779321600000,
  updatedAt:        1779321600000,
  editorLogin:      'fixture_user_2',
  editorTabToken:   'fixture-tab-token-xyz',
  sprint: Object.assign({}, SPRINT_FULL),
  items:            [],
  personalPlanning: {
    devFront: { nkcKey: 'may', people: [], taskAssignments: {} }
  },
  revisions:        [],
  pluginVersion:    VERSION
};

// ─── Write files ──────────────────────────────────────────────────────────────

const files = {
  'sprint-baseline.json': SPRINT_BASELINE,
  'sprint-full.json':     SPRINT_FULL,
  'history.json':         HISTORY,
  'working-draft.json':   WORKING_DRAFT
};

// Guard: never overwrite a directory that already exists AND is committed (frozen baseline).
// A frozen directory has files that differ from the generated content (e.g. 1.4.2 predates
// the pluginVersion field). Use --force to explicitly regenerate an existing version.
const FORCE = process.argv.includes('--force');
if (fs.existsSync(OUT_DIR) && !FORCE) {
  // Check if any file differs from what we'd generate.
  const diffs = [];
  for (const [fname, data] of Object.entries(files)) {
    const fpath = path.join(OUT_DIR, fname);
    const newContent = JSON.stringify(data, null, 2) + '\n';
    let existing = '';
    try { existing = fs.readFileSync(fpath, 'utf8'); } catch (e) { /* missing */ }
    if (existing !== newContent) diffs.push(fname);
  }
  if (diffs.length > 0) {
    console.log('⚠  ' + OUT_DIR + ' already exists with different content.');
    console.log('   Differing files: ' + diffs.join(', '));
    console.log('   If this is a frozen baseline, do NOT overwrite it.');
    console.log('   To force regeneration: VERSION=' + VERSION + ' node tests/fixtures/generate-baseline.js --force');
    process.exit(1);
  }
  console.log('✓ Fixtures for v' + VERSION + ' already up to date (no changes)');
  process.exit(0);
}

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

let anyChanged = false;
for (const [fname, data] of Object.entries(files)) {
  const fpath   = path.join(OUT_DIR, fname);
  const content = JSON.stringify(data, null, 2) + '\n';
  let existing  = '';
  try { existing = fs.readFileSync(fpath, 'utf8'); } catch (e) { /* new file */ }
  if (existing === content) {
    console.log('  unchanged  ' + fname);
  } else {
    fs.writeFileSync(fpath, content);
    console.log('  wrote      ' + fname);
    anyChanged = true;
  }
}

if (anyChanged) {
  console.log('✓ Generated fixtures for v' + VERSION + ' in ' + OUT_DIR);
} else {
  console.log('✓ Fixtures for v' + VERSION + ' already up to date');
}
