'use strict';

/* #48 R1.2 — backend-release.js: валидаторы записи/блоба релизов + чтение стора.
 * Trust-boundary: whitelist ключей + энумы вида/источника/статуса + структура блоба.
 * Запуск: node --test 'tests/unit/release-backend.test.js'. */

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const rel = require(path.join(__dirname, '..', '..', 'backend-release.js'));

function validRec(over) {
  return Object.assign({
    id: 'R-1', name: 'v1.0', kind: 'release', source: 'internal', status: 'planned',
    plannedDate: 1750000000000, freezeLocked: false,
    roleReps: { manager: '1-1', engineer: '1-2' }, issues: ['DEMO-1', 'DEMO-2'],
  }, over || {});
}

test('validateReleaseRecord: валидная запись проходит', () => {
  assert.strictEqual(rel.validateReleaseRecord(validRec()), true);
});

test('validateReleaseRecord: id обязателен', () => {
  const r = validRec(); delete r.id;
  assert.strictEqual(rel.validateReleaseRecord(r), false);
});

test('validateReleaseRecord: неизвестный ключ реджектится (whitelist)', () => {
  assert.strictEqual(rel.validateReleaseRecord(validRec({ bogus: 1 })), false);
});

test('validateReleaseRecord: чужой вид/источник/статус реджектится', () => {
  assert.strictEqual(rel.validateReleaseRecord(validRec({ kind: 'patch' })), false);
  assert.strictEqual(rel.validateReleaseRecord(validRec({ source: 'external' })), false);
  assert.strictEqual(rel.validateReleaseRecord(validRec({ status: 'overdue' })), false); // derived, не хранимый
});

test('validateReleaseRecord: issues — массив строк; roleReps — только manager/engineer', () => {
  assert.strictEqual(rel.validateReleaseRecord(validRec({ issues: 'DEMO-1' })), false);
  assert.strictEqual(rel.validateReleaseRecord(validRec({ issues: [42] })), false);
  assert.strictEqual(rel.validateReleaseRecord(validRec({ roleReps: { lead: 'x' } })), false);
});

test('validateReleasesBlob: пустой стор ок; дубль id реджектится', () => {
  assert.strictEqual(rel.validateReleasesBlob({}), true);
  assert.strictEqual(rel.validateReleasesBlob({ releases: [] }), true);
  assert.strictEqual(rel.validateReleasesBlob({ releases: [validRec({ id: 'A' }), validRec({ id: 'B' })] }), true);
  assert.strictEqual(rel.validateReleasesBlob({ releases: [validRec({ id: 'A' }), validRec({ id: 'A' })] }), false);
  assert.strictEqual(rel.validateReleasesBlob({ releases: 'nope' }), false);
});

test('readReleases: парсит стор проекта; мусор → []', () => {
  const ctx = (raw) => ({ project: { extensionProperties: { ssp_releases: raw } } });
  assert.deepStrictEqual(rel.readReleases(ctx(JSON.stringify({ releases: [validRec({ id: 'X' })] }))).map((r) => r.id), ['X']);
  assert.deepStrictEqual(rel.readReleases(ctx(null)), []);
  assert.deepStrictEqual(rel.readReleases(ctx('{bad json')), []);
});

/* ── R2.4 authz РМ/РИ (D-C, US-R2-11/12): releasePerms + серверный дифф РИ + стамп ── */

/* Полный mock ctx: группы юзера (по id), stored-блоб, POST-тело. Настройки проекта
   содержат релиз-группы g-rm/g-re; settingsManagerGroup=g-admin (configured). */
function mkCtx(groups, storedReleases, body) {
  return {
    settings: { settingsManagerGroup: { id: 'g-admin', name: 'Admins' } },
    currentUser: { id: 'u-1', login: 'user1', groups: (groups || []).map((g) => ({ id: g, name: g })) },
    project: { extensionProperties: {
      ssp_settings: JSON.stringify({ releaseManagerGroups: ['g-rm'], releaseEngineerGroups: ['g-re'], editGroups: ['g-edit'] }),
      ssp_releases: JSON.stringify({ releases: storedReleases || [] }),
    } },
    /* v3.2.1 — handlePostReleases читает через core.getBody (ctx.request.body — сырая
       строка) вместо raw json(): мок отдаёт оба представления. */
    request: { json: () => body, body: body === undefined ? '' : JSON.stringify(body) },
    response: { status: 200, body: null, json(v) { this.body = v; } },
  };
}

test('releasePerms: РМ={manage,advance}; РИ={advance}; settings-менеджер ⊃ РМ; наблюдатель/editor — ничего', () => {
  assert.deepStrictEqual(rel.releasePerms(mkCtx(['g-rm'])), { canManage: true, canAdvance: true });
  assert.deepStrictEqual(rel.releasePerms(mkCtx(['g-re'])), { canManage: false, canAdvance: true });
  assert.deepStrictEqual(rel.releasePerms(mkCtx(['g-admin'])), { canManage: true, canAdvance: true });
  assert.deepStrictEqual(rel.releasePerms(mkCtx([])), { canManage: false, canAdvance: false });
  assert.deepStrictEqual(rel.releasePerms(mkCtx(['g-edit'])), { canManage: false, canAdvance: false }); // editor-плейсхолдер R1.2 ужесточён
});

test('GET /releases отдаёт perms рядом со списком', () => {
  const ctx = mkCtx(['g-re'], [validRec()]);
  rel.handleGetReleases(ctx);
  assert.strictEqual(ctx.response.body.success, true);
  assert.deepStrictEqual(ctx.response.body.perms, { canManage: false, canAdvance: true });
});

test('POST: наблюдатель и legacy-editor → 403 release_rights_required', () => {
  for (const groups of [[], ['g-edit']]) {
    const ctx = mkCtx(groups, [validRec()], { releases: [] });
    rel.handlePostReleases(ctx);
    assert.strictEqual(ctx.response.status, 403);
    assert.strictEqual(ctx.response.body.reason, 'release_rights_required');
  }
});

test('POST РМ: полная замена блоба проходит', () => {
  const ctx = mkCtx(['g-rm'], [validRec()], { releases: [validRec({ name: 'renamed' }), validRec({ id: 'R-2' })] });
  rel.handlePostReleases(ctx);
  assert.strictEqual(ctx.response.body.success, true);
  assert.strictEqual(rel.readReleases(ctx).length, 2);
});

test('POST РИ: шаг статуса по цепочке проходит; released — со снапшотом', () => {
  const stored = [validRec({ status: 'work' })];
  const ctx = mkCtx(['g-re'], stored, { releases: [validRec({ status: 'released', snapshot: { closedAt: 1 } })] });
  rel.handlePostReleases(ctx);
  assert.strictEqual(ctx.response.body.success, true);
});

test('POST РИ: отмена / скачок / откат / реанимация терминальной → 403 status_transition', () => {
  const cases = [
    ['planned', 'cancelled'], ['planned', 'work'], ['work', 'prep'], ['released', 'planned'], ['cancelled', 'planned'],
  ];
  for (const [from, to] of cases) {
    const ctx = mkCtx(['g-re'], [validRec({ status: from })], { releases: [validRec({ status: to })] });
    rel.handlePostReleases(ctx);
    assert.strictEqual(ctx.response.status, 403, from + '→' + to);
    assert.strictEqual(ctx.response.body.reason, 'release_engineer_scope_status_transition', from + '→' + to);
  }
});

test('POST РИ: правка состава/полей и добавление/удаление записей → 403', () => {
  const stored = [validRec()];
  const byBody = (releases, reason) => {
    const ctx = mkCtx(['g-re'], stored, { releases });
    rel.handlePostReleases(ctx);
    assert.strictEqual(ctx.response.status, 403, reason);
    assert.strictEqual(ctx.response.body.reason, 'release_engineer_scope_' + reason);
  };
  byBody([validRec({ issues: ['DEMO-1'] })], 'field_change');                    // состав
  byBody([validRec({ name: 'other' })], 'field_change');                         // поле
  byBody([validRec({ freezeLocked: true })], 'field_change');                    // фриз
  byBody([validRec(), validRec({ id: 'R-2' })], 'record_count_change');          // добавление
  byBody([], 'record_count_change');                                             // удаление
  byBody([validRec({ snapshot: { closedAt: 1 } })], 'snapshot_change');          // снапшот без закрытия
});

test('POST: сервер штампует аудит — клиентским updatedBy/createdBy не доверяем', () => {
  const stored = [
    validRec({ id: 'R-1', status: 'planned', createdBy: 'author', createdAt: 100, updatedBy: 'author', updatedAt: 100 }),
    validRec({ id: 'R-2', createdBy: 'author', createdAt: 100, updatedBy: 'author', updatedAt: 100 }),
  ];
  const next = [
    validRec({ id: 'R-1', status: 'prep', createdBy: 'hacker', createdAt: 1, updatedBy: 'hacker', updatedAt: 1 }), // изменена
    validRec({ id: 'R-2', createdBy: 'author', createdAt: 100, updatedBy: 'author', updatedAt: 100 }),             // не тронута
    validRec({ id: 'R-3', createdBy: 'hacker', createdAt: 1 }),                                                    // новая
  ];
  const ctx = mkCtx(['g-rm'], stored, { releases: next });
  rel.handlePostReleases(ctx);
  assert.strictEqual(ctx.response.body.success, true);
  const out = {}; rel.readReleases(ctx).forEach((r) => { out[r.id] = r; });
  assert.strictEqual(out['R-1'].createdBy, 'author');            // created неизменен
  assert.strictEqual(out['R-1'].updatedBy, 'user1');             // стамп сервера
  assert.ok(out['R-1'].updatedAt > 100);
  assert.strictEqual(out['R-2'].updatedBy, 'author');            // нетронутая — аудит из stored
  assert.strictEqual(out['R-2'].updatedAt, 100);
  assert.strictEqual(out['R-3'].createdBy, 'user1');             // новая — created от сервера
  assert.strictEqual(out['R-3'].updatedBy, 'user1');
});

/* ── R4 архив истории (US-R4-02): splitForArchive + endpoints ──────────────── */

/* Жирная терминальная запись (~3.5КБ) с моментом закрытия для сортировки. */
function fatClosed(id, closedAt, over) {
  return validRec(Object.assign({
    id: id, status: 'released',
    patchNote: new Array(3501).join('x'),
    snapshot: { closedAt: closedAt, closedStatus: 'released' },
  }, over || {}));
}

test('splitForArchive: ниже порога — no-op', () => {
  const blob = { releases: [fatClosed('R-1', 100)] };
  const s = rel.splitForArchive(blob, []);
  assert.strictEqual(s.moved, 0);
  assert.strictEqual(blob.releases.length, 1);
});

test('splitForArchive: старейшие закрытые уезжают, активный ужимается до цели', () => {
  const releases = [];
  for (let i = 0; i < 100; i++) releases.push(fatClosed('R-' + i, i)); // closedAt=i → R-0 старейший
  releases.push(validRec({ id: 'ACT', status: 'work' }));
  const blob = { releases: releases };
  assert.ok(JSON.stringify(blob).length > 300 * 1024, 'фикстура должна превышать порог');
  const s = rel.splitForArchive(blob, []);
  assert.ok(s.moved > 0);
  assert.ok(JSON.stringify(blob).length <= 250 * 1024);
  assert.strictEqual(s.archive.length, s.moved);
  assert.deepStrictEqual(s.archive.slice(0, 3).map((r) => r.id), ['R-0', 'R-1', 'R-2']); // старейшие первыми
  assert.ok(blob.releases.some((r) => r.id === 'ACT')); // незакрытый не трогаем
});

test('splitForArchive: без терминальных кандидатов — no-op (POST дальше отклонится too_large)', () => {
  const releases = [];
  for (let i = 0; i < 100; i++) releases.push(validRec({ id: 'W-' + i, status: 'work', patchNote: new Array(3501).join('x') }));
  const blob = { releases: releases };
  const s = rel.splitForArchive(blob, []);
  assert.strictEqual(s.moved, 0);
  assert.strictEqual(blob.releases.length, 100);
});

test('splitForArchive: id уже в архиве (split-brain недописи) → вынимается без дубля', () => {
  const releases = [];
  for (let i = 0; i < 100; i++) releases.push(fatClosed('R-' + i, i));
  const blob = { releases: releases };
  const s = rel.splitForArchive(blob, [fatClosed('R-0', 0)]);
  assert.ok(!blob.releases.some((r) => r.id === 'R-0'));
  assert.strictEqual(s.archive.filter((r) => r.id === 'R-0').length, 1);
});

test('GET /releases отдаёт archivedCount; GET /releases-archive отдаёт архив (viewer)', () => {
  const ctx = mkCtx([], [validRec()]);
  ctx.project.extensionProperties.ssp_releases_archive = JSON.stringify({ releases: [validRec({ id: 'OLD', status: 'released' })] });
  rel.handleGetReleases(ctx);
  assert.strictEqual(ctx.response.body.archivedCount, 1);
  rel.handleGetArchive(ctx);
  assert.strictEqual(ctx.response.body.success, true);
  assert.deepStrictEqual(ctx.response.body.releases.map((r) => r.id), ['OLD']);
});

test('POST РМ выше порога: авто-архив — archived>0 в ответе, архив-проп записан, активный ужат', () => {
  const next = [];
  for (let i = 0; i < 100; i++) next.push(fatClosed('R-' + i, i));
  const ctx = mkCtx(['g-rm'], [], { releases: next });
  rel.handlePostReleases(ctx);
  assert.strictEqual(ctx.response.body.success, true);
  assert.ok(ctx.response.body.archived > 0);
  const arch = JSON.parse(ctx.project.extensionProperties.ssp_releases_archive).releases;
  assert.strictEqual(arch.length, ctx.response.body.archived);
  assert.strictEqual(arch[0].id, 'R-0'); // старейший ушёл первым
  assert.ok(ctx.project.extensionProperties.ssp_releases.length <= 250 * 1024);
  assert.strictEqual(ctx.response.body.releases.length, 100 - ctx.response.body.archived);
});
