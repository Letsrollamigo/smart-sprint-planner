/**
 * #88 — запись значения спринта в САМИ задачи YouTrack при согласовании состава роли.
 *
 * Проверяем шов на РЕАЛЬНОМ пути входа (doValidateRole), а не приватную функцию:
 * канал по умолчанию молчит, включённый пишет ролевое значение в ролевое поле только
 * по активным задачам, многозначное поле отбивается до записи, а частичный отказ
 * доходит до пользователя отчётом — молчаливая ошибка на боевых задачах недопустима.
 * Арифметика резолверов — tests/unit/sprint-field.test.js.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { createHost } = require('./monolith-host');
const fx = require('./fixtures/state');

const RK = 'analysis';

/** Стаб apiPost с логом: sprint-data отвечает успехом, update-issue-field — по сценарию. */
function stubApi(gm, writeResult) {
  const log = [];
  gm.set({
    apiPost: function (path, body, query) {
      log.push({ path: path, body: body, query: query === undefined ? null : query });
      if (path === 'update-issue-field') {
        return Promise.resolve(writeResult ? writeResult(body) : { success: true });
      }
      return Promise.resolve({ success: true });
    },
  });
  return log;
}

/* Снимок роли: по умолчанию ведёт себя как настоящий — кладёт в _history запись
   <sprint>_<role> со статусом CONFIRMED. opts.silentNoSave моделирует две реальные
   ветки saveRoleHistorySnapshot, которые отдают resolved-промис, НЕ сохранив снимок
   (модалка конфликта рабочей копии ждёт решения; buildRoleSnap вернул пусто). */
function stubHooks(gm, opts) {
  gm.set({
    checkValidatorNow: function () { return Promise.resolve(true); },
    saveRoleHistorySnapshot: function (rk) {
      if (opts && opts.silentNoSave) return Promise.resolve();
      const sid = gm.get('_sprint').sprintId + '_' + rk;
      const h = gm.get('_history').filter((r) => r.sprintId !== sid);
      h.push({ sprintId: sid, roleKey: rk, status: 'CONFIRMED', items: [], personalPlanning: {}, revisions: [] });
      gm.set({ _history: h });
      return Promise.resolve();
    },
    hideWorkingCopyBanner: function () {},
    renderWidgetHeader: function () {},
    renderRoleStatusBadge: function () {},
  });
}

function recordToasts(gm) {
  const toasts = [];
  gm.set({ toast: function (msg, type) { toasts.push({ msg: msg, type: type || null }); } });
  return toasts;
}

function boot(document, settingsPatch, sprintPatch, projectFields, hookOpts) {
  const host = createHost();
  fx.applyBaseState(host.gm);
  host.document.body.insertAdjacentHTML('beforeend',
    '<button id="validateBtn_' + RK + '"></button><button id="newSprintBtn_' + RK + '"></button>');
  host.gm.set({
    _settings: Object.assign(fx.buildSettings(), settingsPatch || {}),
    _sprint: Object.assign(fx.buildSprint(), sprintPatch || {}),
    _projectFields: projectFields || [{ name: 'Спринт', type: 'enum[1]' }, { name: 'Спринт QA', type: 'enum[1]' }],
  });
  stubHooks(host.gm, hookOpts);
  return host;
}

function writes(log) { return log.filter((c) => c.path === 'update-issue-field'); }

test('#88: выключатель выключен — в задачи не пишем ни разу', async () => {
  const { gm } = boot(null, { fieldSprint: 'Спринт' });
  const log = stubApi(gm);
  /* Предусловие: поле и значение НАСТРОЕНЫ — иначе тест прошёл бы вхолостую. */
  assert.strictEqual(gm.get('_settings').fieldSprint, 'Спринт');
  assert.ok(gm.get('_sprint').sprintFieldVal, 'у спринта есть значение поля');
  assert.strictEqual(!!gm.get('_settings').sprintWriteEnabled, false, 'предусловие: канал выключен');

  await gm.call('doValidateRole', RK);
  assert.deepStrictEqual(writes(log), [], 'выключенный канал не трогает боевые задачи');
});

test('#88: включённый канал пишет ролевое значение в ролевое поле — только активным задачам', async () => {
  const { gm } = boot(null,
    { fieldSprint: 'Спринт', fieldSprintAnalysis: 'Спринт QA', sprintWriteEnabled: true },
    { sprintFieldValByRole: { analysis: 'QA-19' } });
  const log = stubApi(gm);
  await gm.call('doValidateRole', RK);

  const w = writes(log);
  assert.deepStrictEqual(w.map((c) => c.body.issueId).sort(), ['GM-1', 'GM-2', 'GM-3'],
    'исключённая GM-4 в запись не попадает');
  assert.strictEqual(w[0].body.fieldName, 'Спринт QA', 'поле берётся ролевое, не общее');
  assert.strictEqual(w[0].body.value, 'QA-19', 'значение берётся ролевое, не общее');
});

test('#88: без ролевых ключей пишем в общее поле общее значение (проекты до 3.35.0)', async () => {
  const { gm } = boot(null, { fieldSprint: 'Спринт', sprintWriteEnabled: true });
  const log = stubApi(gm);
  await gm.call('doValidateRole', RK);

  const w = writes(log);
  assert.strictEqual(w.length, 3);
  assert.strictEqual(w[0].body.fieldName, 'Спринт');
  assert.strictEqual(w[0].body.value, 'GM Sprint June 2026', 'общее значение спринта из фикстуры');
});

test('🔴 #88: многозначное поле отбивается ДО записи и говорит почему', async () => {
  const { gm } = boot(null,
    { fieldSprint: 'Спринты', sprintWriteEnabled: true },
    null,
    [{ name: 'Спринты', type: 'enum[*]' }]);
  const log = stubApi(gm);
  const toasts = recordToasts(gm);
  /* Предусловие: всё остальное для записи готово — отбивает именно кратность. */
  assert.ok(gm.get('_settings').sprintWriteEnabled && gm.get('_sprint').sprintFieldVal,
    'предусловие: канал включён и значение выбрано');

  await gm.call('doValidateRole', RK);
  assert.deepStrictEqual(writes(log), [],
    'присваивание многозначному полю заменило бы весь список спринтов задачи');
  assert.ok(toasts.some((t) => String(t.msg).indexOf('Спринты') >= 0 && t.type === 'warn'),
    'пользователю сказано, какое поле не подошло: ' + JSON.stringify(toasts));
});

test('#88: частичный отказ доходит отчётом, согласование состава не отменяется', async () => {
  const { gm } = boot(null, { fieldSprint: 'Спринт', sprintWriteEnabled: true });
  const log = stubApi(gm, (body) => (body.issueId === 'GM-2'
    ? { success: false, error: 'value_not_found' }
    : { success: true }));
  const toasts = recordToasts(gm);
  await gm.call('doValidateRole', RK);

  assert.strictEqual(writes(log).length, 3, 'отказ по одной задаче не обрывает остальные');
  assert.ok(toasts.some((t) => t.type === 'success' && String(t.msg).indexOf('GM Sprint') < 0),
    'состав роли всё равно подтверждён: ' + JSON.stringify(toasts.map((t) => t.type)));
  const report = toasts[toasts.length - 1];
  assert.strictEqual(report.type, 'warn', 'итог записи — предупреждение, а не тишина');
  assert.ok(/2/.test(report.msg) && /1/.test(report.msg), 'в отчёте есть и записанные, и ошибки: ' + report.msg);
});

test('#88: значение спринта не выбрано — писать нечего, тишина без ошибки', async () => {
  const { gm } = boot(null, { fieldSprint: 'Спринт', sprintWriteEnabled: true }, { sprintFieldVal: null });
  const log = stubApi(gm);
  const toasts = recordToasts(gm);
  await gm.call('doValidateRole', RK);
  assert.deepStrictEqual(writes(log), []);
  assert.ok(!toasts.some((t) => t.type === 'warn'), 'ненастроенное поле — не повод ругаться');
});

test('🔴 #88: снимок роли не сохранился — в задачи не пишем (иначе метка под несуществующий состав)', async () => {
  const { gm } = boot(null, { fieldSprint: 'Спринт', sprintWriteEnabled: true }, null, null,
    { silentNoSave: true });
  const log = stubApi(gm);
  /* Предусловие: всё для записи готово — блокирует именно отсутствие подтверждения. */
  assert.ok(gm.get('_settings').sprintWriteEnabled && gm.get('_sprint').sprintFieldVal,
    'предусловие: канал включён и значение выбрано');

  await gm.call('doValidateRole', RK);
  const sid = gm.get('_sprint').sprintId + '_' + RK;
  assert.ok(!gm.get('_history').some((r) => r.sprintId === sid && r.status === 'CONFIRMED'),
    'предусловие: подтверждённой записи роли в истории нет');
  assert.deepStrictEqual(writes(log), [],
    'saveRoleHistorySnapshot вернул resolved, ничего не сохранив — писать в задачи нельзя');
});
