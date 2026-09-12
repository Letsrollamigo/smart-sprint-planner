/**
 * Golden-master: #121 «Исключённые задачи с причиной» — блок «Исключённые из спринта (N)» под таблицей
 * роли (domain/excluded-view.js) и контракт исключения с причиной из селекта статуса: окно → мутация +
 * каскад #59 с той же причиной и одной отметкой → один POST sprint-data → откат при отказе (правило #100)
 * с одним исключением — editor_rights_required у валидатора (путь #67 H5). Снимок в снапшот, инварианты —
 * прямыми assert'ами (каждый проверен на нынешнем коде инверсией: старый контракт «change → мутация + POST»
 * роняет (a)). Модалка — recording-стаб хоста: «Исключить» = props.onConfirm(text) + spec.onClose().
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { createHost } = require('./monolith-host');
const { checkJsonSnapshot, checkHtmlSnapshot } = require('./snap');
const fx = require('./fixtures/state');

const EXCLUDED = 'INC_EXCLUDED', PLANNED = 'INC_PLANNED';
const KEYS = ['excludeReason', 'excludedAt', 'excludedBy'];

async function settle(n) { for (let i = 0; i < (n || 4); i++) await new Promise((r) => setTimeout(r, 0)); }

/* Стенд: PLANNING-спринт (ALLOCATED без рабочей копии = только просмотр), права по opts,
   apiPost/toast — записывающие стабы, мост подсказок — шпион. */
function boot(opts) {
  opts = opts || {};
  const host = createHost();
  const { gm, window } = host;
  fx.applyBaseState(gm);
  gm.get('_sprint').status = opts.status || 'PLANNING';
  gm.set({
    _isEditor: opts.editor !== false,
    _isValidator: !!opts.validator,
    _currentUser: { login: 'gm_user_9', fullName: 'Голден Пользователь' },
  });
  host.apiPostLog = []; host.toastLog = []; host.tipLog = []; host.reject = opts.reject || null;
  gm.set({
    apiPost: function (path, body) {
      host.apiPostLog.push({ path: path, keys: Object.keys(body || {}) });
      /* отказ — только записи состава: черновик (draft-store) на отказе уходит в повтор и держит event loop */
      return (host.reject && path === 'sprint-data') ? window.Promise.reject(new Error(host.reject)) : window.Promise.resolve({ success: true });
    },
    toast: function (msg, kind) { host.toastLog.push({ msg: msg, kind: kind }); },
    updateRoleRemaining: function () {},
  });
  window.__SSP_TOOLTIP = {
    mountAll: function (el) { host.tipLog.push('mount:' + (el && el.id)); return 0; },
    unmountAll: function (el) { host.tipLog.push('unmount:' + (el && el.id)); },
  };
  return host;
}

function ensureHosts(document, rk) {
  document.body.insertAdjacentHTML('beforeend',
    '<div id="compHost_' + rk + '"></div><div id="planPag_' + rk + '"></div>' +
    '<button id="clearBtn_' + rk + '"></button><button id="recalcBtn_' + rk + '"></button><button id="pickBtn_' + rk + '"></button>' +
    '<div id="exclHost_' + rk + '" class="ssp-excluded-host"></div>');
  return document.getElementById('exclHost_' + rk);
}
function click(document, el) { el.dispatchEvent(new (document.defaultView.MouseEvent)('click', { bubbles: true })); }
function itemOf(gm, rk, iid) { return (gm.get('_roleItems')[rk] || []).find(function (i) { return i.issueId === iid; }); }
function keysOf(it) { return KEYS.filter(function (k) { return it && it[k] !== undefined; }); }
function lastSpec(host) { return host.modalLog[host.modalLog.length - 1]; }
function withReason(it) { it.inclusionStatus = EXCLUDED; it.excludeReason = 'Блокер: зависимость от смежной системы не готова, переносим в следующий спринт'; it.excludedAt = fx.DATE_START; it.excludedBy = 'Петров И. С.'; return it; }

/* ── блок ── */

test('golden #121: блок — legacy-исключённая без причины: свёрнут по умолчанию, «—» вместо причины и отметки, две кнопки редактора', () => {
  const host = boot();
  const { gm, document } = host;
  const excl = ensureHosts(document, 'analysis');
  gm.call('renderRoleComposition', 'analysis');
  const box = excl.querySelector('.ssp-excluded');
  assert.ok(box && !box.classList.contains('open'), 'по умолчанию свёрнут');
  assert.strictEqual(excl.querySelectorAll('.ssp-excluded__row[data-iid]').length, 1, 'GM-4 — единственная исключённая роли analysis');
  assert.strictEqual(excl.querySelectorAll('button.excluded-btn').length, 2);
  assert.strictEqual(excl.querySelectorAll('button.excluded-btn.btn--disabled-rights').length, 0, 'редактор — кнопки активны');
  checkHtmlSnapshot('excluded-block-analysis-legacy', excl.innerHTML);
});

test('golden #121: блок — раскрытие держится на сессию (переживает renderRoleComposition), подсказка только на обрезанной строке, детект при раскрытии', () => {
  const host = boot();
  const { gm, document } = host;
  withReason(itemOf(gm, 'analysis', 'GM-4'));
  const excl = ensureHosts(document, 'analysis');
  gm.call('renderRoleComposition', 'analysis');
  const text = excl.querySelector('.ssp-excluded__reason-text');
  assert.ok(!text.hasAttribute('data-ssp-tooltip'), 'свёрнут → подсказки нет');
  /* jsdom без раскладки: обрезку эмулируем геттерами на самом элементе */
  Object.defineProperty(text, 'scrollHeight', { value: 54 });
  Object.defineProperty(text, 'clientHeight', { value: 36 });
  click(document, excl.querySelector('.spoiler__head'));
  assert.ok(excl.querySelector('.ssp-excluded').classList.contains('open'));
  assert.strictEqual(text.getAttribute('data-ssp-tooltip'), 'Блокер: зависимость от смежной системы не готова, переносим в следующий спринт\nИсключена 22.05.2026, 00:00 · Петров И. С.');
  assert.deepStrictEqual(host.tipLog.filter((s) => s.indexOf('mount:') === 0), ['mount:exclHost_analysis'], 'мост подсказок смонтирован на хосте');
  /* перерисовка состава — раскрытость сохраняется, узел не обрезан → подсказки нет, размонтирование перед сносом */
  gm.call('renderRoleComposition', 'analysis');
  assert.ok(excl.querySelector('.ssp-excluded').classList.contains('open'), 'раскрыт после перерисовки');
  assert.ok(!excl.querySelector('.ssp-excluded__reason-text').hasAttribute('data-ssp-tooltip'), 'новый узел не обрезан (jsdom) → без подсказки');
  assert.ok(host.tipLog.indexOf('unmount:exclHost_analysis') >= 0, 'unmountTooltips перед innerHTML');
  checkHtmlSnapshot('excluded-block-analysis-open', excl.innerHTML);
});

test('golden #121: блок — наблюдатель: кнопки видны, но btn--disabled-rights + подсказка; только просмотр (ALLOCATED без WC): кнопок нет; пусто — хоста нет', () => {
  const viewer = boot({ editor: false });
  ensureHosts(viewer.document, 'analysis');
  viewer.gm.call('renderRoleComposition', 'analysis');
  const btns = viewer.document.querySelectorAll('#exclHost_analysis button.excluded-btn');
  assert.strictEqual(btns.length, 2);
  btns.forEach((b) => { assert.ok(b.classList.contains('btn--disabled-rights')); assert.ok(b.getAttribute('data-tooltip')); });

  const locked = boot();
  /* лок = статус РОЛИ (запись истории <sprintId>_<rk>) ALLOCATED без рабочей копии — как у контролов таблицы */
  locked.gm.get('_history').push({ sprintId: fx.SPRINT_ID + '_analysis', roleKey: 'analysis', roleLabel: 'Анализ', name: 'GM Sprint June 2026', status: 'ALLOCATED', dateStart: fx.DATE_START, dateEnd: fx.DATE_END, items: [], personalPlanning: {}, revisions: [], pluginVersion: '3.46.0' });
  ensureHosts(locked.document, 'analysis');
  locked.gm.call('renderRoleComposition', 'analysis');
  const box = locked.document.querySelector('#exclHost_analysis .ssp-excluded');
  assert.ok(box.classList.contains('is-readonly'));
  assert.strictEqual(box.querySelectorAll('button').length, 0, 'только просмотр — кнопок нет');
  assert.strictEqual(box.querySelectorAll('.ssp-excluded__row--head > div').length, 3, 'колонки действий нет');

  const empty = boot();
  const exclT = ensureHosts(empty.document, 'testing');
  empty.gm.call('renderRoleComposition', 'testing');
  assert.strictEqual(exclT.innerHTML, '', 'исключённых нет → блока нет');
});

test('golden #121: «Вернуть» → «Включена планово», три ключа стёрты, каскада нет, один POST, блок исчезает; «Изменить причину» — только причина, отметки прежние', async () => {
  const host = boot();
  const { gm, document } = host;
  withReason(itemOf(gm, 'analysis', 'GM-4'));
  gm.get('_roleItems').testing.push(withReason({ issueId: 'GM-4', title: 'Копия в другой роли', estimate_testing: 60 }));
  const excl = ensureHosts(document, 'analysis');
  gm.call('renderRoleComposition', 'analysis');

  click(document, excl.querySelector('button.excluded-btn[data-action="edit"]'));
  const edit = lastSpec(host);
  assert.strictEqual(edit.id, 'excludeReason');
  assert.strictEqual(edit.body.props.mode, 'edit');
  assert.strictEqual(edit.body.props.stampText, 'Исключена 22.05.2026, 00:00 · Петров И. С.');
  assert.strictEqual(edit.body.props.cascadeText, null, 'при правке строки каскада нет');
  edit.body.props.onConfirm('  Новая причина  '); edit.onClose();
  await settle();
  const after = itemOf(gm, 'analysis', 'GM-4');
  assert.strictEqual(after.excludeReason, 'Новая причина');
  assert.strictEqual(after.excludedAt, fx.DATE_START, 'отметка не переставлена');
  assert.strictEqual(after.excludedBy, 'Петров И. С.');
  assert.strictEqual(itemOf(gm, 'testing', 'GM-4').excludeReason.indexOf('Блокер'), 0, 'правка в другие роли не едет');
  assert.strictEqual(host.apiPostLog.length, 1);

  click(document, excl.querySelector('button.excluded-btn[data-action="return"]'));
  await settle();
  const back = itemOf(gm, 'analysis', 'GM-4');
  assert.strictEqual(back.inclusionStatus, PLANNED);
  assert.deepStrictEqual(keysOf(back), [], 'возврат стирает причину и отметки');
  assert.strictEqual(itemOf(gm, 'testing', 'GM-4').inclusionStatus, EXCLUDED, 'возврат не каскадится');
  assert.strictEqual(host.apiPostLog.length, 2);
  assert.strictEqual(excl.innerHTML, '', 'N = 0 → хост пуст');
});

/* ── контракт исключения из селекта ── */

function setupChange(host) {
  const { gm, document, window } = host;
  gm.get('_roleItems').testing.push({ issueId: 'GM-1', title: 'Копия GM-1 в тестировании', inclusionStatus: PLANNED, estimate_testing: 60, fact_testing: 0, alloc_testing: 60 });
  ensureHosts(document, 'analysis');
  gm.call('renderRoleComposition', 'analysis');
  const sel = document.createElement('select');
  sel.className = 'inc-sel';
  sel.setAttribute('data-iid', 'GM-1');
  sel.setAttribute('data-rk', 'analysis');
  sel.innerHTML = '<option value="INC_PLANNED"></option><option value="INC_EXCLUDED"></option>';
  sel.value = PLANNED;
  document.getElementById('compHost_analysis').appendChild(sel);
  return {
    change: function () { sel.value = EXCLUDED; sel.dispatchEvent(new window.Event('change', { bubbles: true })); },
    sel: sel,
  };
}

test('golden #121: change → EXCLUDED — окно с dry-run каскада, модель/dirty/POST не тронуты; «Отмена» — селект назад; «Исключить» — статус, причина, одна отметка на копии, один POST', async () => {
  const host = boot();
  const { gm } = host;
  const ui = setupChange(host);
  const before = host.modalLog.length;

  ui.change();
  const spec = lastSpec(host);
  assert.strictEqual(host.modalLog.length, before + 1, 'окно открыто');
  assert.strictEqual(spec.id, 'excludeReason');
  assert.strictEqual(spec.body.props.mode, 'exclude');
  assert.strictEqual(spec.body.props.issueKey, 'GM-1');
  assert.strictEqual(spec.body.props.roleLine, 'Роль «Анализ» · GM Sprint June 2026');
  assert.strictEqual(spec.body.props.cascadeText, 'Кросс-ролевое исключение включено: задача будет исключена также в ролях «Тестирование» — с той же причиной.');
  assert.strictEqual(itemOf(gm, 'analysis', 'GM-1').inclusionStatus, PLANNED, '(a) модель не тронута до «Исключить»');
  assert.strictEqual(gm.get('_draft').dirty, null, '(a) dirty не тронут');
  assert.deepStrictEqual(host.apiPostLog, [], '(a) POST не ушёл');

  /* (i) повторный change при открытом окне — селект восстановлен, второго окна нет */
  ui.change();
  assert.strictEqual(host.modalLog.length, before + 1, 'второго окна нет');
  assert.strictEqual(ui.sel.value, PLANNED, 'селект восстановлен');

  /* (b) отмена */
  ui.sel.value = EXCLUDED;
  spec.onClose();
  await settle();
  assert.strictEqual(ui.sel.value, PLANNED, '(b) «Отмена» вернула селект');
  assert.strictEqual(itemOf(gm, 'analysis', 'GM-1').inclusionStatus, PLANNED);
  assert.deepStrictEqual(host.apiPostLog, []);

  /* (c) подтверждение */
  ui.change();
  const spec2 = lastSpec(host);
  spec2.body.props.onConfirm(' Причина исключения ');
  spec2.onClose();
  await settle();
  const src = itemOf(gm, 'analysis', 'GM-1'), copy = itemOf(gm, 'testing', 'GM-1');
  assert.strictEqual(src.inclusionStatus, EXCLUDED);
  assert.strictEqual(src.excludeReason, 'Причина исключения');
  assert.strictEqual(src.excludedBy, 'Голден Пользователь');
  assert.strictEqual(copy.inclusionStatus, EXCLUDED, 'каскад #59');
  assert.strictEqual(copy.excludeReason, src.excludeReason, 'та же причина');
  assert.strictEqual(copy.excludedAt, src.excludedAt, 'одна отметка');
  assert.deepStrictEqual(host.apiPostLog, [{ path: 'sprint-data', keys: ['roleItems'] }], 'один POST');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(gm.get('_draft').dirty)), { roleItems: true });
  assert.strictEqual(host.toastLog.filter((t) => t.msg.indexOf('Исключена также') === 0).length, 1, 'тост каскада');
  checkJsonSnapshot('excluded-change-contract', {
    spec: JSON.parse(JSON.stringify(spec2, (k, v) => (typeof v === 'function' ? '<fn>' : v))),
    source: { status: src.inclusionStatus, reason: src.excludeReason, at: src.excludedAt, by: src.excludedBy },
    copy: { status: copy.inclusionStatus, reason: copy.excludeReason, at: copy.excludedAt, by: copy.excludedBy },
    apiPostLog: host.apiPostLog,
    toasts: host.toastLog,
  });
});

test('golden #121: отказ сервера — reason_required → откат всех ролей + тост; editor_rights_required у валидатора — правка остаётся, тоста нет; у наблюдателя — откат + тост', async () => {
  async function run(opts) {
    const host = boot(opts);
    const ui = setupChange(host);
    ui.change();
    const spec = lastSpec(host);
    spec.body.props.onConfirm('Причина'); spec.onClose();
    await settle();
    return { host: host, src: itemOf(host.gm, 'analysis', 'GM-1'), copy: itemOf(host.gm, 'testing', 'GM-1') };
  }
  const d = await run({ reject: 'reason_required (cid-1)' });
  assert.strictEqual(d.src.inclusionStatus, PLANNED, '(d) источник откачен');
  assert.deepStrictEqual(keysOf(d.src), []);
  assert.strictEqual(d.copy.inclusionStatus, PLANNED, '(d) копия каскада откачена');
  assert.deepStrictEqual(keysOf(d.copy), []);
  assert.ok(d.host.toastLog.some((t) => t.msg === 'Укажите причину исключения' && t.kind === 'err'), '(d) тост причины');

  const e = await run({ reject: 'editor_rights_required (cid-2)', editor: false, validator: true });
  assert.strictEqual(e.src.inclusionStatus, EXCLUDED, '(e) валидатор: правка остаётся (путь validate)');
  assert.strictEqual(e.copy.inclusionStatus, EXCLUDED);
  assert.ok(!e.host.toastLog.some((t) => t.kind === 'err'), '(e) тоста ошибки нет');

  const f = await run({ reject: 'editor_rights_required (cid-3)', editor: false, validator: false });
  assert.strictEqual(f.src.inclusionStatus, PLANNED, '(f) наблюдатель: откат');
  assert.ok(f.host.toastLog.some((t) => t.kind === 'err' && t.msg.indexOf('editor_rights_required') >= 0), '(f) тост');
});

/* ── снимок роли несёт три ключа (working-copy.buildRoleSnap) ── */

test('golden #121: saveRoleHistorySnapshot — снимок исключённой несёт причину и отметки, активная — без ключей', async () => {
  const host = boot();
  const { gm } = host;
  withReason(itemOf(gm, 'analysis', 'GM-4'));
  await gm.call('saveRoleHistorySnapshot', 'analysis');
  await settle();
  const rec = gm.get('_history').find((r) => r && r.sprintId === fx.SPRINT_ID + '_analysis');
  assert.ok(rec, 'снимок роли записан');
  const ex = rec.items.find((i) => i.issueId === 'GM-4'), pl = rec.items.find((i) => i.issueId === 'GM-1');
  assert.deepStrictEqual(keysOf(ex), KEYS, 'три ключа в снимке');
  assert.strictEqual(ex.excludedBy, 'Петров И. С.');
  assert.deepStrictEqual(keysOf(pl), [], 'активная — без ключей');
});
