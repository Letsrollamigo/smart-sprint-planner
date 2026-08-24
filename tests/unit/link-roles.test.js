/* Эпик #74 фаза 1 — роли типов связей: резолвер, общий матчер, инфо-бейдж,
 * легаси-зеркало и DAG-дерево. Запуск: node --test tests/unit/link-roles.test.js */
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const path   = require('node:path');

const LR = require(path.join(__dirname, '..', '..', 'widgets', 'main', 'src', 'pure', 'link-roles-pure.js'));
const { buildTreeVm } = require(path.join(__dirname, '..', '..', 'widgets', 'main', 'src', 'pure', 'backlog-vm-pure.js'));

/* Типы инстанса в форме, которую отдаёт GET issueLinkTypes. */
const SUBTASK = { name: 'Subtask', sourceToTarget: 'parent for',   targetToSource: 'subtask of' };
const DEPEND  = { name: 'Depend',  sourceToTarget: 'is required for', targetToSource: 'depends on' };
const RELATES = { name: 'Relates', sourceToTarget: 'relates to',  targetToSource: 'relates to' };
const DUPLICATE_AS_DEP = { name: 'Duplicate', sourceToTarget: 'is duplicated by', targetToSource: 'duplicates' };
const GROUP   = { name: 'Включает', sourceToTarget: 'включает',   targetToSource: 'входит в группу' };

/* ── слои резолвера ──────────────────────────────────────────────────────── */

test('слой 3 (дефолт): пустые настройки → Subtask/Иерархия + историческая фраза, Depend/Зависимость, Relates/Инфо', () => {
  const r = LR.resolveLinkRoles({});
  assert.deepStrictEqual(r.hierarchy, [{ type: 'Subtask', side: 'source' }, { phrase: 'subtask of' }]);
  assert.deepStrictEqual(r.dependency, [{ type: 'Depend', side: 'source' }]);
  assert.deepStrictEqual(r.info, [{ type: 'Relates' }]);
});

test('слой 2 (легаси): cascadeParentLinkInward задан → иерархия ТОЛЬКО по фразе (поведение до #74)', () => {
  const r = LR.resolveLinkRoles({ cascadeParentLinkInward: 'part of epic' });
  assert.deepStrictEqual(r.hierarchy, [{ phrase: 'part of epic' }]);
  assert.deepStrictEqual(r.info, [{ type: 'Relates' }], 'новые роли берутся из дефолта — легаси их не знал');
});

test('слой 1 (таблица): linkTypeRoles вытесняет и легаси-фразу, и дефолт', () => {
  const r = LR.resolveLinkRoles({
    cascadeParentLinkInward: 'part of epic',
    linkTypeRoles: [{ type: 'Включает', hier: 'target', dep: null, info: true }],
  });
  assert.deepStrictEqual(r.hierarchy, [{ type: 'Включает', side: 'target' }]);
  assert.deepStrictEqual(r.dependency, []);
  assert.deepStrictEqual(r.info, [{ type: 'Включает' }]);
});

test('нормализация: мусорные строки отброшены, дедуп по type first-seen, стороны — только source/target', () => {
  const rows = LR.normalizeRows([
    null, 'x', { type: '  ' },
    { type: ' Subtask ', hier: 'source', dep: 'left', info: 1 },
    { type: 'Subtask', hier: 'target' },
  ]);
  assert.deepStrictEqual(rows, [{ type: 'Subtask', hier: 'source', dep: null, info: true }]);
});

test('пустой массив linkTypeRoles не считается настройкой — падаем на следующий слой', () => {
  assert.deepStrictEqual(LR.resolveLinkRoles({ linkTypeRoles: [], cascadeParentLinkInward: 'p of e' }).hierarchy,
    [{ phrase: 'p of e' }]);
});

/* ── матчер сторон ───────────────────────────────────────────────────────── */

test('сторона source: родитель = source-конец ⇒ у задачи связь INWARD (OUTWARD не матчится)', () => {
  const m = { type: 'Subtask', side: 'source' };
  assert.strictEqual(LR.matchesEnd({ direction: 'INWARD',  linkType: SUBTASK }, m), true);
  assert.strictEqual(LR.matchesEnd({ direction: 'OUTWARD', linkType: SUBTASK }, m), false);
});

test('сторона target: родитель = target-конец ⇒ у задачи связь OUTWARD («входит в группу»)', () => {
  const m = { type: 'Включает', side: 'target' };
  assert.strictEqual(LR.matchesEnd({ direction: 'OUTWARD', linkType: GROUP }, m), true);
  assert.strictEqual(LR.matchesEnd({ direction: 'INWARD',  linkType: GROUP }, m), false);
});

test('ненаправленный тип (direction BOTH) не матчится в иерархию/зависимость ни одной стороной', () => {
  assert.strictEqual(LR.matchesEnd({ direction: 'BOTH', linkType: RELATES }, { type: 'Relates', side: 'source' }), false);
  assert.strictEqual(LR.matchesEnd({ direction: 'BOTH', linkType: RELATES }, { type: 'Relates', side: 'target' }), false);
});

test('легаси-матчер по фразе смотрит фразу со стороны ЭТОЙ задачи', () => {
  assert.strictEqual(LR.matchesEnd({ direction: 'INWARD',  linkType: SUBTASK }, { phrase: 'subtask of' }), true);
  assert.strictEqual(LR.matchesEnd({ direction: 'OUTWARD', linkType: SUBTASK }, { phrase: 'subtask of' }), false);
});

/* ── сбор родителей ──────────────────────────────────────────────────────── */

test('linkParents: ВСЕ issues внутри связи (до #74 брался только issues[0] — второй родитель терялся)', () => {
  const iss = { links: [{ direction: 'INWARD', linkType: SUBTASK, issues: [{ idReadable: 'EP-1' }, { idReadable: 'EP-2' }] }] };
  assert.deepStrictEqual(LR.linkParents(iss, [{ type: 'Subtask', side: 'source' }]).map((p) => p.idReadable),
    ['EP-1', 'EP-2']);
});

test('linkParents: несколько ПАР иерархии — родители из каждой, порядок матчеров', () => {
  const iss = { links: [
    { direction: 'OUTWARD', linkType: GROUP,   issues: [{ idReadable: 'GR-1' }] },
    { direction: 'INWARD',  linkType: SUBTASK, issues: [{ idReadable: 'EP-1' }] },
  ] };
  const roles = LR.resolveLinkRoles({ linkTypeRoles: [{ type: 'Subtask', hier: 'source' }, { type: 'Включает', hier: 'target' }] });
  assert.deepStrictEqual(LR.linkParents(iss, roles.hierarchy).map((p) => p.idReadable), ['EP-1', 'GR-1']);
});

test('linkParents: один родитель, попавший под два матчера (имя + историческая фраза), не задваивается', () => {
  const iss = { links: [{ direction: 'INWARD', linkType: SUBTASK, issues: [{ idReadable: 'EP-1' }] }] };
  assert.deepStrictEqual(LR.linkParents(iss, LR.resolveLinkRoles({}).hierarchy).map((p) => p.idReadable), ['EP-1']);
});

test('linkParents: чужие типы связей игнорируются', () => {
  const iss = { links: [{ direction: 'BOTH', linkType: RELATES, issues: [{ idReadable: 'X-1' }] }] };
  assert.deepStrictEqual(LR.linkParents(iss, LR.resolveLinkRoles({}).hierarchy), []);
});

/* ── инфо-бейдж (⚖4) ─────────────────────────────────────────────────────── */

test('linkInfo: ненаправленная связь → id + фраза типа (своей стороны у BOTH нет)', () => {
  const iss = { links: [{ direction: 'BOTH', linkType: RELATES, issues: [{ idReadable: 'X-1' }, { idReadable: 'X-2' }] }] };
  assert.deepStrictEqual(LR.linkInfo(iss, LR.resolveLinkRoles({}).info), [
    { idReadable: 'X-1', phrase: 'relates to' },
    { idReadable: 'X-2', phrase: 'relates to' },
  ]);
});

test('linkInfo: направленный тип с ролью Инфо берёт фразу со стороны задачи и матчится в обе стороны', () => {
  const roles = LR.resolveLinkRoles({ linkTypeRoles: [{ type: 'Depend', info: true }] });
  assert.deepStrictEqual(LR.linkInfo({ links: [{ direction: 'OUTWARD', linkType: DEPEND, issues: [{ idReadable: 'D-1' }] }] }, roles.info),
    [{ idReadable: 'D-1', phrase: 'is required for' }]);
  assert.deepStrictEqual(LR.linkInfo({ links: [{ direction: 'INWARD', linkType: DEPEND, issues: [{ idReadable: 'D-2' }] }] }, roles.info),
    [{ idReadable: 'D-2', phrase: 'depends on' }]);
});

test('linkInfo: тип без роли Инфо в бейдж не попадает', () => {
  assert.deepStrictEqual(LR.linkInfo({ links: [{ direction: 'INWARD', linkType: SUBTASK, issues: [{ idReadable: 'EP-1' }] }] },
    LR.resolveLinkRoles({}).info), []);
});

/* ── легаси-зеркало для фоновых правил (⚖ владелец 2026-08-24) ───────────── */

test('legacyCascadePhrases: hier=source → inward = фраза со стороны потомка (targetToSource)', () => {
  assert.deepStrictEqual(LR.legacyCascadePhrases([{ type: 'Subtask', hier: 'source' }], [SUBTASK, RELATES]),
    { inward: 'subtask of', outward: 'parent for' });
});

test('legacyCascadePhrases: hier=target → фразы зеркалятся («входит в группу» ведёт к родителю)', () => {
  assert.deepStrictEqual(LR.legacyCascadePhrases([{ type: 'Включает', hier: 'target' }], [GROUP]),
    { inward: 'включает', outward: 'входит в группу' });
});

test('legacyCascadePhrases: берётся ПЕРВАЯ строка с ролью Иерархия (строки без неё пропускаются)', () => {
  const rows = [{ type: 'Relates', info: true }, { type: 'Depend', dep: 'source' }, { type: 'Subtask', hier: 'source' }];
  assert.deepStrictEqual(LR.legacyCascadePhrases(rows, [SUBTASK, DEPEND, RELATES]), { inward: 'subtask of', outward: 'parent for' });
});

test('legacyCascadePhrases: типы инстанса недоступны или тип не найден → null (вызывающий сохраняет прежние значения)', () => {
  assert.strictEqual(LR.legacyCascadePhrases([{ type: 'Subtask', hier: 'source' }], null), null);
  assert.strictEqual(LR.legacyCascadePhrases([{ type: 'Ghost', hier: 'source' }], [SUBTASK]), null);
  assert.strictEqual(LR.legacyCascadePhrases([{ type: 'Relates', info: true }], [RELATES]), null, 'ни одной строки Иерархии');
});

/* ── дерево: DAG, ромб, цикл (⚖3) ────────────────────────────────────────── */

const TREE_S = { cascadeLevel2Values: ['Story'], cascadeLevel3Values: ['Epic'], backlogStartStates: ['Open'] };
const leaf = (id, chains) => ({ issueId: id, idReadable: id, summary: id, stateName: 'Open', parentChains: chains });

test('DAG: задача с двумя родителями разных типов видна под КАЖДЫМ (⚖3)', () => {
  const vm = buildTreeVm([leaf('T-1', [[{ issueId: 'S-1', kind: 'Story' }], [{ issueId: 'GR-1', kind: 'Story' }]])], TREE_S);
  const byId = {}; vm.roots.forEach((r) => { byId[r.issueId] = r; });
  assert.deepStrictEqual(Object.keys(byId).sort(), ['GR-1', 'S-1']);
  assert.deepStrictEqual(byId['S-1'].tasks.map((t) => t.issueId), ['T-1']);
  assert.deepStrictEqual(byId['GR-1'].tasks.map((t) => t.issueId), ['T-1']);
  assert.strictEqual(vm.orphans.length, 0);
});

test('DAG: один и тот же прямой родитель по двум парам — лист кладётся ОДИН раз', () => {
  const vm = buildTreeVm([leaf('T-1', [[{ issueId: 'S-1', kind: 'Story' }], [{ issueId: 'S-1', kind: 'Story' }]])], TREE_S);
  assert.strictEqual(vm.roots.length, 1);
  assert.deepStrictEqual(vm.roots[0].tasks.map((t) => t.issueId), ['T-1']);
  assert.strictEqual(vm.roots[0].agg.count, 1, 'агрегат не задваивается');
});

test('ромб: стори под двумя эпиками финализируется один раз (guard v3.2.1), задача не дублируется в дереве', () => {
  const vm = buildTreeVm([leaf('T-1', [
    [{ issueId: 'S-1', kind: 'Story' }, { issueId: 'E-1', kind: 'Epic' }],
    [{ issueId: 'S-1', kind: 'Story' }, { issueId: 'E-2', kind: 'Epic' }],
  ])], TREE_S);
  assert.deepStrictEqual(vm.roots.map((r) => r.issueId), ['E-1', 'E-2']);
  const nested = vm.roots.map((r) => r.children.length);
  assert.deepStrictEqual(nested, [1, 0], 'стори раскрыта под первым эпиком, под вторым — уже финализирована');
  assert.strictEqual(vm.roots[0].agg.count, 1);
});

test('цикл A↔B: рекурсия не уходит в бесконечность, задачи не теряются (доносятся в «Без родителя»)', () => {
  const vm = buildTreeVm([leaf('T-1', [[{ issueId: 'A', kind: 'Story' }, { issueId: 'B', kind: 'Epic' }]]),
    leaf('T-2', [[{ issueId: 'B', kind: 'Epic' }, { issueId: 'A', kind: 'Story' }]])], TREE_S);
  const shown = vm.roots.reduce(function walk(n, r) { return n + r.tasks.length + r.children.reduce(walk, 0); }, 0);
  assert.strictEqual(shown + vm.orphans.length, 2, 'обе задачи видны — в дереве или в сиротах');
});

test('обратная совместимость: старый одиночный parentChain и одиночный parent по-прежнему строят дерево', () => {
  const vmChain = buildTreeVm([{ issueId: 'T-1', idReadable: 'T-1', stateName: 'Open', parentChain: [{ issueId: 'S-1', kind: 'Story' }] }], TREE_S);
  assert.deepStrictEqual(vmChain.roots.map((r) => r.issueId), ['S-1']);
  const vmParent = buildTreeVm([{ issueId: 'T-2', idReadable: 'T-2', stateName: 'Open', parent: { issueId: 'S-2', kind: 'Story' } }], TREE_S);
  assert.deepStrictEqual(vmParent.roots.map((r) => r.issueId), ['S-2']);
});

test('инфо-связи доезжают до листа дерева (вход бейджа ⚖4)', () => {
  const t = leaf('T-1', [[{ issueId: 'S-1', kind: 'Story' }]]);
  t.infoLinks = [{ idReadable: 'X-1', phrase: 'relates to' }];
  const vm = buildTreeVm([t], TREE_S);
  assert.deepStrictEqual(vm.roots[0].tasks[0].infoLinks, [{ idReadable: 'X-1', phrase: 'relates to' }]);
});

/* ── переделка настроек: пикер фраз + реестр потребителей ────────────────── */

const T_RELATES = { name: 'Relates', localizedName: 'Связана', directed: false, aggregation: false,
  sourceToTarget: 'relates to', targetToSource: '', localizedSourceToTarget: 'связана с', localizedTargetToSource: '' };
const T_SUBTASK = { name: 'Subtask', localizedName: 'Подзадача', directed: true, aggregation: true,
  sourceToTarget: 'parent for', targetToSource: 'subtask of',
  localizedSourceToTarget: 'родитель для', localizedTargetToSource: 'подзадача для' };
const T_PLAIN = { name: 'Depend', localizedName: '', directed: true, aggregation: false,
  sourceToTarget: 'is required for', targetToSource: 'depends on',
  localizedSourceToTarget: '', localizedTargetToSource: '' };

test('пикер: направленный тип даёт ДВЕ опции (по фразе на сторону), ненаправленный — одну', () => {
  const opts = LR.pickerOptions([T_RELATES, T_SUBTASK], []);
  assert.deepStrictEqual(opts.map((o) => o.key), ['Relates|', 'Subtask|source', 'Subtask|target']);
  assert.strictEqual(opts[0].side, null, 'у ненаправленного стороны нет');
  assert.strictEqual(opts[0].pairPhrase, '', 'парной фразы у ненаправленного тоже нет');
});

test('пикер: выбор фразы задаёт сторону — фраза со стороны младшей задачи ⇒ side=source', () => {
  const opts = LR.pickerOptions([T_SUBTASK], []);
  const bySide = {}; opts.forEach((o) => { bySide[o.side] = o; });
  assert.strictEqual(bySide.source.phrase, 'подзадача для');
  assert.strictEqual(bySide.source.pairPhrase, 'родитель для', 'парная фраза подставляется сама');
  assert.strictEqual(bySide.target.phrase, 'родитель для');
});

test('пикер: добавленный тип исчезает ОБЕИМИ фразами', () => {
  const opts = LR.pickerOptions([T_RELATES, T_SUBTASK], [{ type: 'Subtask', hier: 'source' }]);
  assert.deepStrictEqual(opts.map((o) => o.key), ['Relates|']);
});

test('пикер: локализованные фразы берутся когда есть, иначе канонические (YT 2025.3 их не отдаёт)', () => {
  assert.strictEqual(LR.pickerOptions([T_SUBTASK], [])[0].phrase, 'подзадача для');
  assert.strictEqual(LR.pickerOptions([T_PLAIN], [])[0].phrase, 'depends on');
  assert.strictEqual(LR.pickerOptions([T_PLAIN], [])[0].typeLabel, 'Depend', 'нет localizedName → каноническое имя');
});

test('phrasesForSide: сторона переворачивает пару, ненаправленный несёт одну фразу', () => {
  assert.deepStrictEqual(LR.phrasesForSide(T_SUBTASK, 'source'), { chosen: 'подзадача для', pair: 'родитель для' });
  assert.deepStrictEqual(LR.phrasesForSide(T_SUBTASK, 'target'), { chosen: 'родитель для', pair: 'подзадача для' });
  assert.deepStrictEqual(LR.phrasesForSide(T_RELATES, 'source'), { chosen: 'связана с', pair: '' });
});

test('rowSide: сторона строки берётся из назначенной роли; только «Инфо» — стороны нет', () => {
  assert.strictEqual(LR.rowSide({ type: 'A', hier: 'target' }), 'target');
  assert.strictEqual(LR.rowSide({ type: 'A', dep: 'source' }), 'source');
  assert.strictEqual(LR.rowSide({ type: 'A', info: true }), null);
});

test('реестр ролей: набор описан данными, а не разложен по коду UI', () => {
  assert.deepStrictEqual(LR.ROLE_DEFS.map((d) => d.key), ['hier', 'dep', 'info']);
  assert.strictEqual(LR.roleDef('hier').kind, 'side');
  assert.strictEqual(LR.roleDef('info').kind, 'flag');
  assert.strictEqual(LR.roleDef('info').needsDirected, false, 'ненаправленным доступна только «Инфо»');
  assert.strictEqual(LR.roleDef('hier').needsDirected, true);
  assert.strictEqual(LR.roleDef('нет-такой'), null);
});

test('потребители: «Иерархия» читается бэклогом, релизами и двумя фоновыми правилами', () => {
  const c = LR.roleConsumers('hier', { releaseEnabled: true, backlogZones: [{ state: 'Открыта' }],
    cascadeAggregationEnabled: true, stateRollupEnabled: false });
  const by = {}; c.forEach((x) => { by[x.id] = x; });
  assert.deepStrictEqual(Object.keys(by).sort(), ['backlog', 'cascade', 'release', 'rollup']);
  assert.strictEqual(by.backlog.enabled, true);
  assert.strictEqual(by.release.enabled, true);
  assert.strictEqual(by.cascade.enabled, true);
  assert.strictEqual(by.rollup.enabled, false, 'подтяжка состояния выключена в проекте');
  assert.strictEqual(by.cascade.firstOnly, true, 'фоновые правила берут только первую строку иерархии');
  assert.strictEqual(by.backlog.firstOnly, false);
});

test('потребители: выключенный модуль не исчезает, а помечается — настройка остаётся видимой', () => {
  const off = LR.roleConsumers('hier', {});
  assert.strictEqual(off.length, 4);
  assert.ok(off.every((c) => c.enabled === false), 'ничего не включено → все потребители помечены');
});

test('потребители: «Зависимость» читает Гант, «Инфо» — бэклог; бэклог включён наличием зон или старта', () => {
  assert.deepStrictEqual(LR.roleConsumers('dep', {}), [{ id: 'gantt', firstOnly: false, enabled: true }]);
  assert.deepStrictEqual(LR.roleConsumers('info', { backlogStartStates: ['Открыта'] }),
    [{ id: 'backlog', firstOnly: false, enabled: true }]);
  assert.strictEqual(LR.roleConsumers('info', { backlogZones: [] })[0].enabled, false);
});

/* ── фаза 2: Гант — предшественники, порядок стрелок, палитра ────────────── */

test('dependencyPreds: предшественники по роли «Зависимость», тип связи едет с ними (нужен для цвета)', () => {
  const iss = { links: [
    { direction: 'INWARD', linkType: DEPEND, issues: [{ idReadable: 'A-1' }, { idReadable: 'A-2' }] },
    { direction: 'INWARD', linkType: SUBTASK, issues: [{ idReadable: 'EP-1' }] },
  ] };
  const roles = LR.resolveLinkRoles({ linkTypeRoles: [{ type: 'Depend', dep: 'source' }] });
  assert.deepStrictEqual(LR.dependencyPreds(iss, roles.dependency),
    [{ id: 'A-1', type: 'Depend' }, { id: 'A-2', type: 'Depend' }]);
});

test('dependencyPreds: между одной парой задач — ОДНА стрелка (у либы ключ = «from→to», дубли ломают ключи)', () => {
  const iss = { links: [
    { direction: 'INWARD', linkType: DEPEND, issues: [{ idReadable: 'A-1' }] },
    { direction: 'INWARD', linkType: DUPLICATE_AS_DEP, issues: [{ idReadable: 'A-1' }] },
  ] };
  const roles = LR.resolveLinkRoles({ linkTypeRoles: [{ type: 'Depend', dep: 'source' }, { type: 'Duplicate', dep: 'source' }] });
  assert.deepStrictEqual(LR.dependencyPreds(iss, roles.dependency).map((p) => p.id), ['A-1']);
});

test('ganttArrowOrder: воспроизводит порядок рендера либы — обход задач, внутри порядок вставки в barChildren', () => {
  const tasks = [
    { id: 'A', dependencies: ['B'], depTypes: { B: 'Depend' } },
    { id: 'B', dependencies: [], depTypes: {} },
    { id: 'C', dependencies: ['B'], depTypes: { B: 'Duplicate' } },
  ];
  assert.deepStrictEqual(LR.ganttArrowOrder(tasks), [
    { from: 'B', to: 'A', type: 'Depend' },
    { from: 'B', to: 'C', type: 'Duplicate' },
  ]);
});

test('ganttArrowOrder: предшественник вне спринта стрелки не даёт (либа такой id молча игнорирует)', () => {
  const tasks = [{ id: 'A', dependencies: ['СНАРУЖИ-1', 'B'], depTypes: { B: 'Depend' } }, { id: 'B', dependencies: [] }];
  assert.deepStrictEqual(LR.ganttArrowOrder(tasks), [{ from: 'B', to: 'A', type: 'Depend' }]);
});

test('ganttArrowOrder: пусто когда зависимостей нет', () => {
  assert.deepStrictEqual(LR.ganttArrowOrder([{ id: 'A' }, { id: 'B', dependencies: [] }]), []);
  assert.deepStrictEqual(LR.ganttArrowOrder(null), []);
});

test('палитра: цвет на тип по позиции среди зависимостей — правка чужих ролей стрелки не перекрашивает', () => {
  const c1 = LR.dependencyColors({ linkTypeRoles: [{ type: 'Depend', dep: 'source' }, { type: 'Duplicate', dep: 'source' }] });
  assert.deepStrictEqual(c1, { Depend: LR.LINK_TYPE_PALETTE[0], Duplicate: LR.LINK_TYPE_PALETTE[1] });
  /* Между ними добавили тип, который зависимостью НЕ является — цвета не поехали. */
  const c2 = LR.dependencyColors({ linkTypeRoles: [
    { type: 'Depend', dep: 'source' }, { type: 'Subtask', hier: 'source' }, { type: 'Duplicate', dep: 'source' }] });
  assert.deepStrictEqual(c2, c1);
});

test('палитра: все восемь цветов различимы на светлом и тёмном фоне строк Ганта (≥3:1, WCAG 1.4.11)', () => {
  const lum = (hex) => {
    const ch = [1, 3, 5].map((i) => parseInt(hex.substr(i, 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  const contrast = (a, b) => {
    const l1 = lum(a), l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  /* Четыре фона строк: светлая тема surface/surface2 и тёмная surface/surface2. */
  const BACKGROUNDS = ['#ffffff', '#eef2f5', '#2a2a3d', '#313149'];
  LR.LINK_TYPE_PALETTE.forEach((c) => {
    BACKGROUNDS.forEach((bg) => {
      const k = contrast(c, bg);
      assert.ok(k >= 3, 'цвет ' + c + ' на фоне ' + bg + ' даёт контраст ' + k.toFixed(2) + ' < 3:1');
    });
  });
  assert.strictEqual(new Set(LR.LINK_TYPE_PALETTE).size, LR.LINK_TYPE_PALETTE.length, 'дублей в палитре нет');
});
