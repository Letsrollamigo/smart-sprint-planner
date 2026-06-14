'use strict';
// Pure legacy → canonical data-migration helpers shared with
// widgets/main/src/core.js. Browser bridge: window.__SSP_MIGRATE_PURE.
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

/* #49 — personalPlanning: единый канон = per-role записи истории (histRec.personalPlanning,
   single PP). In-memory `_sprint.personalPlanning` больше не источник правды — лишь
   serialization-зеркало, derived из канона keyed-мапой. Две pure-функции ниже:
   собрать keyed-map из канона + backfill канона из legacy keyed-кэша на чтении. */

/* Собирает keyed-map {[roleKey]: PP} из per-role канон-записей истории для sprintId.
   PP = клон histRec.personalPlanning (resourcesByAssignee-shape). Пустые роли пропускаются.
   Pure; deepClone опционален (для глубокой изоляции от стейта). */
function buildPPMapFromCanon(sprintId, history, deepClone) {
  const map = {};
  if (!sprintId || !Array.isArray(history)) return map;
  const prefix = sprintId + '_';
  for (let i = 0; i < history.length; i++) {
    const rec = history[i];
    if (!rec || !rec.sprintId || rec.sprintId.indexOf(prefix) !== 0) continue;
    const rk = rec.roleKey || rec.sprintId.slice(prefix.length);
    if (!rk) continue;
    const pp = rec.personalPlanning;
    if (pp && typeof pp === 'object' && Object.keys(pp).length) {
      map[rk] = deepClone ? deepClone(pp) : pp;
    }
  }
  return map;
}

/* Backfill-on-read (#49): legacy keyed-кэш `sprint.personalPlanning` {[rk]: PP} мог нести
   данные ролей, чьи канон-записи пусты (очень старые/мигрированные снимки). Чтобы снос
   getPP-fallback не терял их — досеять КАНОН (history per-role записи) из кэша ДО того,
   как кэш будет перезаписан derived-мапой. Мутирует history in-place; дополняет только
   СУЩЕСТВУЮЩИЕ записи с пустым personalPlanning (создание полноценной записи = домен
   saveRoleHistorySnapshot). single-форму кэша (resourcesByAssignee/people на верхнем уровне)
   игнорирует — это не keyed-map. Возвращает history. */
function backfillCanonFromSprintPP(sprint, history, deepClone) {
  if (!sprint || !sprint.sprintId || !Array.isArray(history)) return history;
  const ppMap = sprint.personalPlanning;
  if (!ppMap || typeof ppMap !== 'object') return history;
  /* keyed-map ⟺ на верхнем уровне нет признаков single-PP */
  if (ppMap.resourcesByAssignee || ppMap.taskAssignments || ppMap.people) return history;
  const prefix = sprint.sprintId + '_';
  for (const rk in ppMap) {
    if (!Object.prototype.hasOwnProperty.call(ppMap, rk)) continue;
    const pp = ppMap[rk];
    if (!pp || typeof pp !== 'object' || !Object.keys(pp).length) continue;
    const key = prefix + rk;
    let rec = null;
    for (let i = 0; i < history.length; i++) {
      if (history[i] && history[i].sprintId === key) { rec = history[i]; break; }
    }
    if (rec && (!rec.personalPlanning || !Object.keys(rec.personalPlanning).length)) {
      rec.personalPlanning = deepClone ? deepClone(pp) : pp;
    }
  }
  return history;
}

const api = {
  STATUS_MIGRATION,
  INC_MIGRATION,
  GRADE_LEGACY_MAP,
  migrateStatus,
  migrateInc,
  migrateGrade,
  migrateKpeObject,
  buildPPMapFromCanon,
  backfillCanonFromSprintPP
};

if (typeof window !== 'undefined') {
  try { window.__SSP_MIGRATE_PURE = api; } catch (_) { /* sandboxed write may throw */ }
}

module.exports = api;
