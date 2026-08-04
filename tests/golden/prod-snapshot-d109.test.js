/**
 * #63 — сценарные тесты на прод-слепке #62 + инвариант кросс-зонной
 * консистентности (класс D109 «рассинхрон зон рендера по источникам
 * „рабочий слот vs выбранный спринт"»).
 *
 * Фикстура — tests/fixtures/prod-snapshots/62-emp-mixed-sprints.json:
 * анонимизированный прод-стейт ОС внешней команды (#62): рабочий слот sprint-jul CONFIRMED,
 * sprint-aug смешанный (devPlatform CONFIRMED / testing PLANNING res=0 /
 * analysis PLANNING), CONFIRMED-хвост sprint-jun/sprint-may2.
 *
 * Инвариант (закрывает класс, а не конкретный случай): после любого
 * рендера/свитча ВСЕ зоны шапки роли читают ОДИН источник — rk-снапшот
 * выбранного спринта (или рабочий _sprint, если выбран он):
 *   инпут ресурса res_<rk> == шапка аккордеона == карточка остатков,
 *   validate-payload — из того же источника (рабочего слота).
 * Ожидаемые значения считаются ИЗ ФИКСТУРЫ (не из внутренних функций
 * приложения) — формула остатка продублирована здесь намеренно как спека.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { createHost } = require('./monolith-host');

const SNAP = require('../fixtures/prod-snapshots/62-emp-mixed-sprints.json');
const ACTIVE_INC = ['INC_PLANNED', 'INC_UNPLANNED']; // канон ядра (calcRemForRole)
const RES_KEY = { analysis: 'resourceAnalysis', testing: 'resourceTesting', devPlatform: 'resourceDevPlatform' };

function clone(o) { return JSON.parse(JSON.stringify(o)); }

/** Ожидаемые {res, rem} роли rk спринта baseId — строго из фикстуры. */
function expectedFromFixture(baseId, rk) {
  const st = SNAP.state;
  let res, items;
  if (st.sprint.sprintId === baseId) {
    res = st.sprint[RES_KEY[rk]] || 0;
    items = st.roleItems[rk] || [];
  } else {
    const snap = st.history.find((h) => h.sprintId === baseId + '_' + rk);
    res = (snap && snap[RES_KEY[rk]]) || 0;
    items = (snap && snap.items) || [];
  }
  const used = items.reduce((s, i) => {
    if (!i || ACTIVE_INC.indexOf(i.inclusionStatus) < 0) return s;
    const alloc = i['alloc_' + rk];
    if (alloc !== null && alloc !== undefined) return s + Math.max(0, alloc);
    return s + Math.max(0, (i['estimate_' + rk] || 0) - (i['fact_' + rk] || 0));
  }, 0);
  return { res, rem: res - used };
}

/** Host + прод-слепок как состояние ядра + recording-стабы сети. */
function createSnapHost() {
  const h = createHost();
  const { gm, document } = h;
  const st = clone(SNAP.state);
  const apiLog = [];
  gm.set({
    _settings: clone(SNAP.settings),
    _settingsLoaded: true,
    _sprint: st.sprint,
    _roleItems: st.roleItems,
    _history: st.history,
    _currentSprintId: st.currentSprintId,
    _activeSubtab: st.activeSubtab,
    _isEditor: true,
    apiGet: function (path) { apiLog.push({ m: 'GET', path }); return Promise.resolve({}); },
    apiPost: function (path, body, query) { apiLog.push({ m: 'POST', path, body, query }); return Promise.resolve({ success: true }); },
    bindResInputDraftListener: function () {},
    bindSprintHeaderDraftListeners: function () {},
  });
  /* Per-role DOM зон (в проде создаёт buildRolePanel при mount раскрытой карточки). */
  for (const rk of ['analysis', 'testing', 'devPlatform']) {
    document.body.insertAdjacentHTML(
      'beforeend',
      '<input id="res_' + rk + '">' +
        '<select id="sprintStatus_' + rk + '"><option value="PLANNING">PLANNING</option><option value="CONFIRMED">CONFIRMED</option></select>' +
        '<button id="newSprintBtn_' + rk + '"></button>' +
        '<span id="statusBadge_' + rk + '"></span>' +
        '<div id="rc_' + rk + '" class="remain-card"><div id="rem_' + rk + '"></div></div>' +
        '<button id="validateBtn_' + rk + '"></button>' +
        '<button id="saveHeaderBtn_' + rk + '"></button>'
    );
  }
  if (!document.getElementById('sprintGoal')) {
    document.body.insertAdjacentHTML('beforeend', '<textarea id="sprintGoal"></textarea>');
  }
  h.apiLog = apiLog;
  return h;
}

/** Отрендерить все зоны шапки роли (порядок как в mount buildRolePanel). */
function renderZones(h, rk) {
  h.gm.call('renderPlanningRoles');
  h.gm.call('renderRolePlannerHeader', rk);
  h.gm.call('updateRoleRemaining', rk);
}

/** ИНВАРИАНТ D109: все зоны == ожиданию из фикстуры для выбранного спринта. */
function assertZonesConsistent(h, baseId, rk, label) {
  const { gm, document } = h;
  const exp = expectedFromFixture(baseId, rk);
  // 1) инпут ресурса
  assert.strictEqual(
    document.getElementById('res_' + rk).value,
    exp.res ? gm.call('fmtPeriod', exp.res) : '',
    label + ': res_' + rk + ' (инпут ресурса)'
  );
  // 2) шапка аккордеона (первый stat__num = ресурс, часы)
  const card = document.querySelector('.planning-role-card[data-role-key="' + rk + '"]');
  assert.ok(card, label + ': аккордеон-карточка ' + rk + ' существует');
  const nums = card.querySelectorAll('.planning-role-toggle .planning-role-stat__num');
  assert.strictEqual(
    nums[0].textContent,
    gm.call('_formatHoursLight', exp.res / 60),
    label + ': шапка аккордеона (ресурс) ' + rk
  );
  // 3) карточка остатков
  assert.strictEqual(
    document.getElementById('rem_' + rk).textContent,
    gm.call('fmtHours', exp.rem),
    label + ': карточка остатков ' + rk
  );
}

/* ═══ Сценарий «свитч туда-обратно» — репро #62 ═══ */

test('D109-инвариант: свитч jul → aug (смешанный) → jul, все зоны из выбранного спринта', () => {
  const h = createSnapHost();
  const { gm } = h;

  // Рабочий спринт (jul) выбран — зоны из _sprint
  renderZones(h, 'devPlatform');
  assertZonesConsistent(h, 'sprint-jul', 'devPlatform', 'старт jul');

  // Свитч на смешанный aug: CONFIRMED-роль не грузится в рабочий слот (гейт #62)
  gm.call('setCurrentSprintId', 'sprint-aug', { confirmed: true });
  assert.strictEqual(gm.get('_sprint').sprintId, 'sprint-jul',
    'рабочий слот не переключился (гейт loadUnfinishedSprintAsWorking, сетап #62)');
  for (const rk of ['devPlatform', 'testing', 'analysis']) {
    renderZones(h, rk);
    assertZonesConsistent(h, 'sprint-aug', rk, 'просмотр aug');
  }
  // контроль конкретики #62: у devPlatform ресурс августа, не июля
  assert.strictEqual(h.document.getElementById('res_devPlatform').value, gm.call('fmtPeriod', 12780),
    'res_devPlatform = ресурс СВОЕГО (августовского) rk-снапшота');

  // Обратно на jul — зоны вернулись к рабочему слоту
  gm.call('setCurrentSprintId', 'sprint-jul', { confirmed: true });
  for (const rk of ['devPlatform', 'testing', 'analysis']) {
    renderZones(h, rk);
    assertZonesConsistent(h, 'sprint-jul', rk, 'возврат jul');
  }
});

test('D109-инвариант: CONFIRMED-хвост (jun/may2) — зоны из своих rk-снапшотов', () => {
  const h = createSnapHost();
  for (const baseId of ['sprint-jun', 'sprint-may2']) {
    h.gm.call('setCurrentSprintId', baseId, { confirmed: true });
    renderZones(h, 'devPlatform');
    assertZonesConsistent(h, baseId, 'devPlatform', 'просмотр ' + baseId);
  }
});

/* ═══ Сценарий «валидация» — payload из того же источника ═══ */

test('D109-инвариант: validate-payload несёт ресурс рабочего слота (== зонам)', async () => {
  const h = createSnapHost();
  const { gm } = h;
  gm.set({
    _isValidator: true,
    checkValidatorNow: function () { return Promise.resolve(true); },
  });
  renderZones(h, 'devPlatform');

  await gm.call('doValidateRole', 'devPlatform');

  const call = h.apiLog.find((c) => c.m === 'POST' && c.path === 'sprint-data' && c.query && c.query.action === 'validate');
  assert.ok(call, 'ушёл POST sprint-data?action=validate');
  assert.strictEqual(call.query.role, 'devPlatform', 'валидация заскоуплена ролью (v3.15.1 Fix B)');
  const exp = expectedFromFixture('sprint-jul', 'devPlatform');
  assert.strictEqual(call.body.sprint.resourceDevPlatform, exp.res,
    'validate-payload: ресурс роли из того же источника, что зоны шапки');
  assert.strictEqual(call.body.sprint.sprintId, 'sprint-jul', 'валидируется рабочий слот');
  // после валидации зоны остаются консистентными
  renderZones(h, 'devPlatform');
  assertZonesConsistent(h, 'sprint-jul', 'devPlatform', 'после validate');
});

/* ═══ Сценарий «правка» — сейв ресурса освежает все зоны (v3.15.0) ═══ */

test('D109-инвариант: правка ресурса + сейв — инпут, аккордеон и остатки согласованы', async () => {
  const h = createSnapHost();
  const { gm, document } = h;
  renderZones(h, 'devPlatform');

  const NEW_RES = 18000; // 300ч
  document.getElementById('res_devPlatform').value = gm.call('fmtPeriod', NEW_RES);
  await gm.call('doSaveRoleHeader', 'devPlatform');

  assert.strictEqual(gm.get('_sprint').resourceDevPlatform, NEW_RES, 'ресурс рабочего слота обновлён');
  // все зоны — из ОДНОГО нового значения (сейв сам освежает аккордеон и остатки)
  const expUsed = expectedFromFixture('sprint-jul', 'devPlatform'); // used не менялся
  const card = document.querySelector('.planning-role-card[data-role-key="devPlatform"]');
  const nums = card.querySelectorAll('.planning-role-toggle .planning-role-stat__num');
  assert.strictEqual(nums[0].textContent, gm.call('_formatHoursLight', NEW_RES / 60),
    'шапка аккордеона обновилась сразу после сейва (фикс v3.15.0, класс D109)');
  assert.strictEqual(document.getElementById('rem_devPlatform').textContent,
    gm.call('fmtHours', NEW_RES - (expUsed.res - expUsed.rem)),
    'карточка остатков пересчитана от нового ресурса');
  assert.strictEqual(document.getElementById('res_devPlatform').value, gm.call('fmtPeriod', NEW_RES),
    'инпут ресурса держит введённое значение');
});
