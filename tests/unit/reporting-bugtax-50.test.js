'use strict';

/* #50 S8c — B2 «Налог на баги» (контур B): чистый computeBugTax.
   Σwi(баг)/[Σwi(фича)+Σwi(баг)] на систему×роль; fallback (открытое окно бага) переклассифицирует
   фича-часы в баг-числитель; баг на N фич → пропорц. делёж; orphan-баги → корзина. */

const test = require('node:test');
const assert = require('node:assert');
const { computeBugTax } = require('../../widgets/main/src/pure/reporting-b-pure.js');

const ROLES = [{ key: 'dev', label: 'Разработчик' }, { key: 'ana', label: 'Аналитик' }];
const DAY = 86400000;
const near = (a, b) => Math.abs(a - b) < 1e-6;

/* helper: собрать вход. Автор == roleKey для простоты (executor login = roleKey). */
function ex(roleKey) { return { dev: roleKey === 'dev' ? 'dev' : undefined, ana: roleKey === 'ana' ? 'ana' : undefined }; }

test('базовая метрика: списано на баг и фичу, tax = баг/(фича+баг) на систему×роль', () => {
  const out = computeBugTax({
    roles: ROLES, windowToTs: 100 * DAY,
    issues: [
      { id: 'F1', isBug: false, system: 'S1' },
      { id: 'B1', isBug: true, system: 'S1', created: 1 * DAY, resolveTs: 5 * DAY, featureIds: ['F1'] },
    ],
    roleExecutors: { F1: { dev: 'dev' }, B1: { dev: 'dev' } },
    workItems: [
      { issueId: 'F1', author: 'dev', minutes: 300, dateTs: 2 * DAY },  // фича dev 300
      { issueId: 'B1', author: 'dev', minutes: 100, dateTs: 3 * DAY },  // баг dev 100
    ],
  });
  assert.strictEqual(out.groups.length, 1);
  const s1 = out.groups[0]; assert.strictEqual(s1.system, 'S1');
  const dev = s1.rows.find((r) => r.roleKey === 'dev');
  assert.strictEqual(dev.bugMinutes, 100);
  assert.strictEqual(dev.allMinutes, 400);   // фича 300 + баг 100
  assert.ok(near(dev.pct, 0.25));
  assert.ok(near(out.totalPct, 0.25));
  assert.strictEqual(out.fallbackBugCount, 0);
  assert.strictEqual(out.orphanBugCount, 0);
});

test('роль workitem = исполнитель роли задачи == автор; чужой автор игнор', () => {
  const out = computeBugTax({
    roles: ROLES, windowToTs: 100 * DAY,
    issues: [
      { id: 'F1', isBug: false, system: 'S1' },
      { id: 'B1', isBug: true, system: 'S1', created: 1 * DAY, resolveTs: null, featureIds: ['F1'] },
    ],
    roleExecutors: { F1: { dev: 'alice', ana: 'bob' }, B1: { ana: 'bob' } },
    workItems: [
      { issueId: 'F1', author: 'alice', minutes: 200, dateTs: 2 * DAY },  // dev
      { issueId: 'F1', author: 'bob', minutes: 100, dateTs: 2 * DAY },    // ana
      { issueId: 'B1', author: 'bob', minutes: 40, dateTs: 3 * DAY },     // ana баг
      { issueId: 'B1', author: 'ghost', minutes: 999, dateTs: 3 * DAY },  // не исполнитель → игнор
    ],
  });
  const s1 = out.groups[0];
  const dev = s1.rows.find((r) => r.roleKey === 'dev');
  const ana = s1.rows.find((r) => r.roleKey === 'ana');
  assert.strictEqual(dev.bugMinutes, 0);
  assert.strictEqual(dev.allMinutes, 200);
  assert.strictEqual(ana.bugMinutes, 40);
  assert.strictEqual(ana.allMinutes, 140);   // фича ana 100 + баг ana 40
});

test('fallback: часы фичи в ОТКРЫТОМ окне бага → баг-числитель; после resolve — нет', () => {
  const out = computeBugTax({
    roles: ROLES, windowToTs: 100 * DAY,
    issues: [
      { id: 'F1', isBug: false, system: 'S1' },
      { id: 'B1', isBug: true, system: 'S1', created: 10 * DAY, resolveTs: 20 * DAY, featureIds: ['F1'] },
    ],
    roleExecutors: { F1: { dev: 'dev' }, B1: { dev: 'dev' } },
    workItems: [
      { issueId: 'F1', author: 'dev', minutes: 60, dateTs: 5 * DAY },    // до бага → фича
      { issueId: 'F1', author: 'dev', minutes: 100, dateTs: 15 * DAY },  // в окне → багфикс
      { issueId: 'F1', author: 'dev', minutes: 40, dateTs: 25 * DAY },   // после resolve → фича
      // B1 без workitems → fallback
    ],
  });
  const dev = out.groups[0].rows.find((r) => r.roleKey === 'dev');
  assert.strictEqual(dev.allMinutes, 200);   // вся фича 60+100+40 в знаменателе
  assert.strictEqual(dev.bugMinutes, 100);   // только окно
  assert.ok(near(dev.pct, 0.5));
  assert.strictEqual(out.fallbackBugCount, 1);
});

test('fallback: unresolved баг открыт до конца окна (windowToTs)', () => {
  const out = computeBugTax({
    roles: ROLES, windowToTs: 30 * DAY,
    issues: [
      { id: 'F1', isBug: false, system: 'S1' },
      { id: 'B1', isBug: true, system: 'S1', created: 10 * DAY, resolveTs: null, featureIds: ['F1'] },
    ],
    roleExecutors: { F1: { dev: 'dev' }, B1: { dev: 'dev' } },
    workItems: [
      { issueId: 'F1', author: 'dev', minutes: 100, dateTs: 15 * DAY },  // в открытом окне
      { issueId: 'F1', author: 'dev', minutes: 50, dateTs: 40 * DAY },   // за windowToTs → фича
    ],
  });
  const dev = out.groups[0].rows.find((r) => r.roleKey === 'dev');
  assert.strictEqual(dev.bugMinutes, 100);
  assert.strictEqual(dev.allMinutes, 150);
});

test('баг на N фич (списанные часы) → делёж пропорц. собственным ЧЧ фич', () => {
  const out = computeBugTax({
    roles: ROLES, windowToTs: 100 * DAY,
    issues: [
      { id: 'F1', isBug: false, system: 'S1' },
      { id: 'F2', isBug: false, system: 'S2' },
      { id: 'B1', isBug: true, system: 'S1', created: 1 * DAY, resolveTs: 5 * DAY, featureIds: ['F1', 'F2'] },
    ],
    roleExecutors: { F1: { dev: 'dev' }, F2: { dev: 'dev' }, B1: { dev: 'dev' } },
    workItems: [
      { issueId: 'F1', author: 'dev', minutes: 300, dateTs: 2 * DAY },  // F1 own 300 (75%)
      { issueId: 'F2', author: 'dev', minutes: 100, dateTs: 2 * DAY },  // F2 own 100 (25%)
      { issueId: 'B1', author: 'dev', minutes: 80, dateTs: 3 * DAY },   // делёж 60/20
    ],
  });
  const s1 = out.groups.find((g) => g.system === 'S1').rows.find((r) => r.roleKey === 'dev');
  const s2 = out.groups.find((g) => g.system === 'S2').rows.find((r) => r.roleKey === 'dev');
  assert.ok(near(s1.bugMinutes, 60));   // 80 * 300/400
  assert.strictEqual(s1.allMinutes, 360);  // 300 + 60
  assert.ok(near(s2.bugMinutes, 20));   // 80 * 100/400
  assert.strictEqual(s2.allMinutes, 120);  // 100 + 20
});

test('пул-на-систему = Σбаг/Σвсё, НЕ среднее долей (обе фичи bug-linked)', () => {
  // Фича A: баг 90 / всё 100 (90%). Фича B: баг 100 / всё 1000 (10%). Среднее долей = 50%.
  // Пул (владелец) = (90+100)/(100+1000) = 190/1100 ≈ 17.3% ≠ 50%.
  const out = computeBugTax({
    roles: ROLES, windowToTs: 100 * DAY,
    issues: [
      { id: 'FA', isBug: false, system: 'S1' },
      { id: 'FB', isBug: false, system: 'S1' },
      { id: 'BA', isBug: true, system: 'S1', created: 1 * DAY, resolveTs: 2 * DAY, featureIds: ['FA'] },
      { id: 'BB', isBug: true, system: 'S1', created: 1 * DAY, resolveTs: 2 * DAY, featureIds: ['FB'] },
    ],
    roleExecutors: { FA: { dev: 'dev' }, FB: { dev: 'dev' }, BA: { dev: 'dev' }, BB: { dev: 'dev' } },
    workItems: [
      { issueId: 'FA', author: 'dev', minutes: 10, dateTs: 3 * DAY },
      { issueId: 'FB', author: 'dev', minutes: 900, dateTs: 3 * DAY },
      { issueId: 'BA', author: 'dev', minutes: 90, dateTs: 3 * DAY },
      { issueId: 'BB', author: 'dev', minutes: 100, dateTs: 3 * DAY },
    ],
  });
  const dev = out.groups[0].rows.find((r) => r.roleKey === 'dev');
  assert.strictEqual(dev.bugMinutes, 190);
  assert.strictEqual(dev.allMinutes, 1100);   // 10 + 900 + 90 + 100
  assert.ok(near(dev.pct, 190 / 1100));        // ≈ 0.1727, НЕ среднее (0.5)
});

test('orphan-баг (без фич) → корзина; bug-free фича вне охвата (нет групп)', () => {
  const out = computeBugTax({
    roles: ROLES, windowToTs: 100 * DAY,
    issues: [
      { id: 'F1', isBug: false, system: 'S1' },   // без связанного бага → вне охвата
      { id: 'B1', isBug: true, system: 'S1', created: 1 * DAY, resolveTs: 5 * DAY, featureIds: [] },
    ],
    roleExecutors: { F1: { dev: 'dev' }, B1: { dev: 'dev' } },
    workItems: [
      { issueId: 'F1', author: 'dev', minutes: 200, dateTs: 2 * DAY },
      { issueId: 'B1', author: 'dev', minutes: 50, dateTs: 3 * DAY },
    ],
  });
  assert.strictEqual(out.groups.length, 0);   // F1 без багов вне метрики, orphan-баг не в систему
  assert.ok(out.basket);
  assert.strictEqual(out.basket.totalMinutes, 50);
  assert.strictEqual(out.basket.rows[0].minutes, 50);
  assert.strictEqual(out.orphanBugCount, 1);
  /* #58-6: корзина входит в «Баги всего»; доли без знаменателя нет → null, не 0% */
  assert.strictEqual(out.totalBugMinutes, 50);
  assert.strictEqual(out.totalPct, null);
});

test('пустой вход / нет ролей → пустой результат без краха', () => {
  const out = computeBugTax({});
  assert.deepStrictEqual(out.groups, []);
  assert.strictEqual(out.basket, null);
  assert.strictEqual(out.totalPct, null);   /* #58-6 — нет базы: не 0%, а «нет доли» */
  assert.strictEqual(out.bugCount, 0);
});

/* --- адверс-6-линз регресс (3 REAL_BUG) --- */

test('РЕГРЕСС: баг со списанным-но-НЕатрибутированным трудом НЕ триггерит fallback', () => {
  // B1 имеет реальный workitem (author=ghost, не исполнитель роли) → raw>0. Раньше bwTotal=0 → fallback
  // переклассифицировал ВСЕ 1000мин фичи в баг (pct=1.0). Теперь raw>0 → fallback НЕ срабатывает.
  const out = computeBugTax({
    roles: ROLES, windowToTs: 100 * DAY,
    issues: [
      { id: 'F1', isBug: false, system: 'S1' },
      { id: 'B1', isBug: true, system: 'S1', created: 1 * DAY, resolveTs: null, featureIds: ['F1'] },
    ],
    roleExecutors: { F1: { dev: 'dev' }, B1: { dev: 'dev' } },
    workItems: [
      { issueId: 'F1', author: 'dev', minutes: 1000, dateTs: 10 * DAY },  // фича dev
      { issueId: 'B1', author: 'ghost', minutes: 10, dateTs: 11 * DAY },  // баг, но автор не исполнитель → неатрибут.
    ],
  });
  const dev = out.groups[0].rows.find((r) => r.roleKey === 'dev');
  assert.strictEqual(dev.bugMinutes, 0);     // НЕ 1000
  assert.strictEqual(dev.allMinutes, 1000);
  assert.ok(near(dev.pct, 0));
  assert.strictEqual(out.fallbackBugCount, 0);
});

test('РЕГРЕСС: created=NaN (zero-log) → fallback НЕ переклассифицирует историю фичи', () => {
  const out = computeBugTax({
    roles: ROLES, windowToTs: 100 * DAY,
    issues: [
      { id: 'F1', isBug: false, system: 'S1' },
      { id: 'B1', isBug: true, system: 'S1', created: NaN, resolveTs: null, featureIds: ['F1'] },
    ],
    roleExecutors: { F1: { dev: 'dev' }, B1: { dev: 'dev' } },
    workItems: [
      { issueId: 'F1', author: 'dev', minutes: 70, dateTs: 2 * DAY },
      { issueId: 'F1', author: 'dev', minutes: 30, dateTs: 90 * DAY },
    ],
  });
  const dev = out.groups[0].rows.find((r) => r.roleKey === 'dev');
  assert.strictEqual(dev.bugMinutes, 0);     // NaN created = как null: не переклассифицируем
  assert.strictEqual(dev.allMinutes, 100);
});

test('РЕГРЕСС: дубль фичи в featureIds (2 типа связи) считается один раз при N-дележе', () => {
  const out = computeBugTax({
    roles: ROLES, windowToTs: 100 * DAY,
    issues: [
      { id: 'F1', isBug: false, system: 'S1' },
      { id: 'F2', isBug: false, system: 'S2' },
      { id: 'B1', isBug: true, system: 'S1', created: 1 * DAY, resolveTs: 5 * DAY, featureIds: ['F1', 'F2', 'F2'] },
    ],
    roleExecutors: { F1: { dev: 'dev' }, F2: { dev: 'dev' }, B1: { dev: 'dev' } },
    workItems: [
      { issueId: 'F1', author: 'dev', minutes: 100, dateTs: 2 * DAY },  // равные веса
      { issueId: 'F2', author: 'dev', minutes: 100, dateTs: 2 * DAY },
      { issueId: 'B1', author: 'dev', minutes: 90, dateTs: 3 * DAY },
    ],
  });
  const s1 = out.groups.find((g) => g.system === 'S1').rows.find((r) => r.roleKey === 'dev');
  const s2 = out.groups.find((g) => g.system === 'S2').rows.find((r) => r.roleKey === 'dev');
  assert.ok(near(s1.bugMinutes, 45));   // 90/2, НЕ 30 (было бы при F2 дважды)
  assert.ok(near(s2.bugMinutes, 45));
  assert.strictEqual(out.featureCount, 2);
});

test('баг ссылается на другой баг (не фичу) → orphan, не самосвязь', () => {
  const out = computeBugTax({
    roles: ROLES, windowToTs: 100 * DAY,
    issues: [
      { id: 'B1', isBug: true, system: 'S1', created: 1 * DAY, resolveTs: null, featureIds: ['B2'] },
      { id: 'B2', isBug: true, system: 'S1', created: 1 * DAY, resolveTs: null, featureIds: [] },
    ],
    roleExecutors: { B1: { dev: 'dev' } },
    workItems: [{ issueId: 'B1', author: 'dev', minutes: 30, dateTs: 2 * DAY }],
  });
  assert.strictEqual(out.orphanBugCount, 2);   // B1 ссылка на баг = не фича → orphan
  assert.ok(out.basket && out.basket.totalMinutes === 30);
});
