'use strict';

/* #113 1б-2 — MCP-инструменты во встроенном MCP YouTrack (mcp-common.js, mcp-i18n.js, mcp-tool-*.js).
 * Инструмент зовёт обработчик главного меню (backend-global.js) на подставном запросе — тесты идут
 * через НАСТОЯЩИЕ обработчики: проект резолвится подменённым entities.Project.findByKey, права —
 * группы пользователя против ssp_acl/ssp_settings (не-админ: hasPermission даёт только чтение).
 * Запуск: node --test 'tests/unit/mcp-tools.test.js'. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const entities = require('@jetbrains/youtrack-scripting-api/entities');
const mcp = require(path.join(ROOT, 'mcp-common.js'));
const i18n = require(path.join(ROOT, 'mcp-i18n.js'));

const SPRINT = { sprintId: 'S-1', name: 'Спринт', status: 'PLANNING', dateStart: 1779148800000, dateEnd: 1780358400000,
  updatedBy: 'user1', updatedAt: 1779148800000, personalPlanning: {}, _rev: 4 };
const ITEM = { issueId: 'SCBT-1', title: 'Задача', inclusionStatus: 'INC_PLANNED', estimate_analysis: 480 };
const G_ADMIN = { id: 'g-admin', name: 'Admins' };

let projects = {};
let lookups = 0;
entities.Project.findByKey = (k) => { lookups++; return projects[k] || null; };

function mkProject(over) {
  const props = Object.assign({
    ssp_acl: JSON.stringify({ settingsManagerGroup: G_ADMIN }),
    ssp_settings: JSON.stringify({ editGroups: ['g-admin'], validationGroups: ['g-admin'], activeRoles: ['analysis'] }),
    ssp_sprint: JSON.stringify(SPRINT), ssp_roleitems: JSON.stringify({ analysis: [ITEM] })
  }, over || {});
  projects = { SCBT: { key: 'SCBT', name: 'SCBT', extensionProperties: props } };
  return props;
}
/* Не-админ: чтение проекта есть, глобальной роли нет; groups — членство в группах планера. */
function user(groups, canRead) {
  return { id: 'u-1', login: 'user1', groups: groups, hasPermission: (perm) => perm === 'READ_PROJECT_BASIC' && canRead !== false };
}
function run(name, args, u) {
  const orig = console.warn; console.warn = () => {};
  try { return mcp.tool(name).execute({ arguments: args, currentUser: u || user([G_ADMIN]) }); } finally { console.warn = orig; }
}
function refusal(name, args, u) {
  try { run(name, args, u); } catch (e) { return e; }
  assert.fail('ожидался отказ ' + name);
}

/* ── Упаковка ───────────────────────────────────────────────────────────────── */

test('файл на инструмент: mcp-tool-<имя>.js ровно по определениям, одна строка, имя без префикса', () => {
  const files = fs.readdirSync(ROOT).filter((f) => /^mcp-tool-.*\.js$/.test(f)).sort();
  assert.deepStrictEqual(files, mcp.NAMES.map((n) => 'mcp-tool-' + n + '.js').sort());
  assert.strictEqual(mcp.NAMES.length, 19);
  for (const n of mcp.NAMES) {
    assert.strictEqual(fs.readFileSync(path.join(ROOT, 'mcp-tool-' + n + '.js'), 'utf8'), "exports.aiTool = require('./mcp-common.js').tool('" + n + "');\n");
    const tl = require(path.join(ROOT, 'mcp-tool-' + n + '.js')).aiTool;
    assert.strictEqual(tl.name, n);
    assert.ok(!/^planner_/.test(tl.name), 'префикс даёт manifest.aiToolPrefix');
    assert.strictEqual(typeof tl.execute, 'function');
    assert.strictEqual(tl.inputSchema.properties.projectKey.type, 'string');
    assert.ok(tl.inputSchema.required.includes('projectKey'));
  }
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8')).aiToolPrefix, 'planner');
});

test('словарь: ключи RU и EN совпадают, у каждого инструмента есть название и описание, описания полей найдены', () => {
  function flat(o, p) { return Object.keys(o).flatMap((k) => (typeof o[k] === 'object' ? flat(o[k], p + k + '.') : [p + k])); }
  assert.deepStrictEqual(flat(i18n.DICT.en, '').sort(), flat(i18n.DICT.ru, '').sort());
  assert.ok(['ru', 'en'].includes(i18n.LANG));
  for (const n of mcp.NAMES) for (const lang of ['ru', 'en']) {
    assert.notStrictEqual(i18n.t('tools.' + n + '.title', null, lang), 'tools.' + n + '.title');
    assert.notStrictEqual(i18n.t('tools.' + n + '.description', null, lang), 'tools.' + n + '.description');
  }
  const unresolved = JSON.stringify(mcp.NAMES.map((n) => mcp.tool(n))).match(/"fields\.\w+"/g);
  assert.strictEqual(unresolved, null, 'нет описания поля: ' + unresolved);
});

test('ключи ролей — копия core.ROLE_KEYS; бэкенд не грузится при загрузке модуля инструмента', () => {
  assert.deepStrictEqual(mcp.ROLE_KEYS, require(path.join(ROOT, 'backend-core.js')).ROLE_KEYS);
  assert.ok(!/^var \w+ = require\('\.\/backend-/m.test(fs.readFileSync(path.join(ROOT, 'mcp-common.js'), 'utf8')), 'require бэкенда — только внутри call()');
});

test('аннотации: чтение — readOnly, удаление и заливка — destructive, заливка не идемпотентна', () => {
  const ann = (n) => mcp.tool(n).annotations;
  mcp.NAMES.filter((n) => n.startsWith('get_')).forEach((n) => assert.strictEqual(ann(n).readOnlyHint, true, n));
  ['remove_item', 'remove_absence', 'update_release_issues', 'upload_draft'].forEach((n) => assert.strictEqual(ann(n).destructiveHint, true, n));
  assert.strictEqual(ann('upload_draft').idempotentHint, false);
  assert.strictEqual(ann('upsert_item').destructiveHint, false);
});

/* ── Проверка входа ─────────────────────────────────────────────────────────── */

test('вход: лишний ключ, чужой enum, тип, шаблон — invalid_argument ДО обращения к проекту; default проставляется', () => {
  mkProject();
  lookups = 0;
  assert.strictEqual(refusal('get_sprint', { projectKey: 'SCBT', extra: 1 }).info.reason, 'invalid_argument:extra');
  assert.strictEqual(refusal('get_sprint', { projectKey: 'SCBT', roleKey: 'nope' }).info.reason, 'invalid_argument:roleKey');
  assert.strictEqual(refusal('get_history', { projectKey: 'SCBT', limit: 1.5 }).info.reason, 'invalid_argument:limit');
  assert.strictEqual(refusal('remove_item', { projectKey: 'SCBT', roleKey: 'analysis', issueId: '1-bad' }).info.reason, 'invalid_argument:issueId');
  assert.strictEqual(refusal('upsert_item', { projectKey: 'SCBT', roleKey: 'analysis', item: { issueId: 'SCBT-1', estimate_analysis: 5 } }).info.reason,
    'invalid_argument:item.estimate_analysis', 'контрактные ключи роли на вход не принимаются');
  assert.strictEqual(refusal('upload_draft', { projectKey: 'SCBT', sprint: { sprintId: 'S', name: 'N', dateStart: 1, dateEnd: 2 }, roleItems: { bogus: [] } }).info.reason,
    'invalid_argument:roleItems.bogus');
  assert.strictEqual(lookups, 0, 'проект не читался');
  const a = { projectKey: 'SCBT' };
  assert.strictEqual(mcp.check(mcp.tool('get_sprint').inputSchema, a, ''), null);
  assert.deepStrictEqual([a.includeExcluded, a.includeSettings, a.limit], [true, false, 200]);
});

/* ── Чтение и шлюз проекта ──────────────────────────────────────────────────── */

test('get_sprint: проекция роли (estimate_<роль> → estimate), ревизия, сводка', () => {
  mkProject();
  const r = run('get_sprint', { projectKey: 'SCBT' });
  assert.strictEqual(r.sprint.sprintId, 'S-1');
  assert.strictEqual(r.sprint.rev, 4);
  assert.deepStrictEqual(r.activeRoles, ['analysis']);
  assert.strictEqual(r.items.analysis.total, 1);
  assert.strictEqual(r.items.analysis.items[0].estimate, 480);
  assert.ok(!('settings' in r));
  assert.strictEqual(typeof r.summary, 'string');
});

test('шлюз главного меню: нет права чтения или нет проекта — один отказ project_unavailable', () => {
  mkProject();
  const e1 = refusal('get_sprint', { projectKey: 'SCBT' }, user([G_ADMIN], false));
  const e2 = refusal('get_sprint', { projectKey: 'NOPE' });
  for (const e of [e1, e2]) {
    assert.strictEqual(e.info.kind, 'planner');
    assert.strictEqual(e.info.reason, 'project_unavailable');
    assert.strictEqual(e.info.status, 403);
    assert.ok(/^cid-/.test(e.info.cid));
  }
  assert.ok(e1.message.split('\n')[0].includes('project_unavailable'));
  assert.deepStrictEqual(JSON.parse(e1.message.split('\n')[1]), e1.info, 'вторая строка — JSON отказа');
});

test('планер отключён в проекте — planner_disabled', () => {
  mkProject({ ssp_settings: JSON.stringify({ editGroups: ['g-admin'], activeRoles: ['analysis'], plannerDisabled: true }) });
  assert.strictEqual(refusal('get_sprint', { projectKey: 'SCBT' }).info.reason, 'planner_disabled');
});

/* ── Запись ─────────────────────────────────────────────────────────────────── */

test('upsert_item: не-админ редактор по группам пишет через штатную полную запись; наблюдатель — отказ прав', () => {
  const props = mkProject();
  const r = run('upsert_item', { projectKey: 'SCBT', roleKey: 'analysis', item: { issueId: 'SCBT-2', estimate: 60 } });
  assert.strictEqual(r.rev, 5);
  assert.deepStrictEqual(r.applied, { roleKey: 'analysis', issueId: 'SCBT-2', created: true });
  const stored = JSON.parse(props.ssp_roleitems).analysis;
  assert.strictEqual(stored.find((i) => i.issueId === 'SCBT-2').estimate_analysis, 60);
  assert.strictEqual(stored.find((i) => i.issueId === 'SCBT-1').estimate_analysis, 480);

  const before = props.ssp_roleitems;
  const e = refusal('upsert_item', { projectKey: 'SCBT', roleKey: 'analysis', item: { issueId: 'SCBT-3' } }, user([]));
  assert.strictEqual(e.info.reason, 'editor_rights_required');
  assert.strictEqual(props.ssp_roleitems, before, 'состав не тронут');
});

test('baseRev агента передаётся как есть: чужая ревизия — rev_conflict с текущей', () => {
  mkProject();
  const e = refusal('remove_item', { projectKey: 'SCBT', roleKey: 'analysis', issueId: 'SCBT-1', baseRev: 1 });
  assert.strictEqual(e.info.reason, 'rev_conflict');
  assert.strictEqual(e.info.rev, 4);
  assert.ok(e.message.split('\n')[0].includes('4'));
});

test('upload_draft: чужая роль, занятый слот без overwrite — защиты до записи; overwrite пишет PLANNING', () => {
  const draft = { projectKey: 'SCBT', sprint: { sprintId: 'S-2', name: 'Новый', dateStart: 1779148800000, dateEnd: 1780358400000 },
    roleItems: { analysis: [{ issueId: 'SCBT-5', estimate: 120 }] } };
  let props = mkProject();
  const e1 = refusal('upload_draft', Object.assign({}, draft, { roleItems: { testing: [] } }));
  assert.strictEqual(e1.info.reason, 'role_not_active');
  props = mkProject({ ssp_sprint: JSON.stringify(Object.assign({}, SPRINT, { status: 'CONFIRMED' })) });
  const e2 = refusal('upload_draft', draft);
  assert.deepStrictEqual([e2.info.kind, e2.info.reason, e2.info.sprintId, e2.info.status], ['tool', 'slot_occupied', 'S-1', 'CONFIRMED']);
  assert.strictEqual(JSON.parse(props.ssp_sprint).sprintId, 'S-1', 'слот не тронут');

  props = mkProject();
  const r = run('upload_draft', Object.assign({}, draft, { overwrite: true }));
  assert.strictEqual(r.overwrote, true, 'черновик другого id в слоте — занят, записан по overwrite');
  assert.strictEqual(r.rev, 5);
  const s2 = JSON.parse(props.ssp_sprint);
  assert.deepStrictEqual([s2.sprintId, s2.status], ['S-2', 'PLANNING']);
  assert.strictEqual(JSON.parse(props.ssp_roleitems).analysis[0].estimate_analysis, 120);

  mkProject();
  const same = run('upload_draft', Object.assign({}, draft, { sprint: Object.assign({}, draft.sprint, { sprintId: 'S-1' }) }));
  assert.strictEqual(same.overwrote, false, 'свой черновик перезаписывается без overwrite');
});

test('пустые правки — nothing_to_do без записи', () => {
  mkProject();
  assert.strictEqual(refusal('patch_sprint', { projectKey: 'SCBT', sprint: {} }).info.reason, 'nothing_to_do');
  assert.strictEqual(refusal('update_release_issues', { projectKey: 'SCBT', id: 'R-1' }).info.reason, 'nothing_to_do');
});
