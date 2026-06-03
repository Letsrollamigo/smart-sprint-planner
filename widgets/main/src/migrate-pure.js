'use strict';
// Pure legacy → canonical data-migration helpers shared with
// widgets/main/src/legacy-monolith.js. Browser bridge: window.__SSP_MIGRATE_PURE.
// Unit-tested in tests/unit/migrate-pure.test.js.
//
// Read-side normalisation: older installs stored Cyrillic status/inclusion/grade
// labels; these maps translate them to the canonical English keys. Idempotent —
// already-normalised values pass through untouched. Faithful 1:1 extraction.

const STATUS_MIGRATION = {
  'Планируется':                'PLANNING',
  'Запланирован':               'PLANNING',
  'Запланирован и подтвержден': 'CONFIRMED',
  'Запланирован и подтверждён': 'CONFIRMED',
  'Аллоцирован':                                'ALLOCATED',
  'Запланирован, подтверждён, аллоцирован':     'ALLOCATED',
  'Завершён':                   'FINISHED',
  'Завершен':                   'FINISHED'
};

const INC_MIGRATION = {
  'Ожидает распределения': 'INC_PENDING',
  'Включена планово':      'INC_PLANNED',
  'Включена внепланово':   'INC_UNPLANNED',
  'Исключена из спринта':  'INC_EXCLUDED'
};

// v1.4.1 D128 — grade keys flipped Cyrillic → English on read.
const GRADE_LEGACY_MAP = {
  'Стажёр': 'Intern',
  'Джун':   'Junior',
  'Мидл':   'Middle',
  'Синьор': 'Senior'
};

function migrateStatus(v) {
  if (!v) return v;
  if (STATUS_MIGRATION[v]) return STATUS_MIGRATION[v];
  // v5.2.0 — PLANNED removed from STATUS, migrate to PLANNING. Idempotent.
  if (v === 'PLANNED') return 'PLANNING';
  return v;
}

function migrateInc(v) { return v && INC_MIGRATION[v] ? INC_MIGRATION[v] : v; }

function migrateGrade(g) {
  if (!g) return g;
  return GRADE_LEGACY_MAP[g] || g;
}

function migrateKpeObject(kpe) {
  if (!kpe || typeof kpe !== 'object') return kpe;
  const out = {};
  for (const k in kpe) {
    if (!Object.prototype.hasOwnProperty.call(kpe, k)) continue;
    const nk = migrateGrade(k);
    out[nk] = kpe[k];
  }
  return out;
}

const api = {
  STATUS_MIGRATION,
  INC_MIGRATION,
  GRADE_LEGACY_MAP,
  migrateStatus,
  migrateInc,
  migrateGrade,
  migrateKpeObject
};

if (typeof window !== 'undefined') {
  try { window.__SSP_MIGRATE_PURE = api; } catch (_) { /* sandboxed write may throw */ }
}

module.exports = api;
