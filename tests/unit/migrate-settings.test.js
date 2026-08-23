'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const path   = require('node:path');

const backend = require(path.join(__dirname, '..', '..', 'backend-project.js'));
const { migrateSettingsObj, validateSettings } = backend;

/* v2.15.2 — read-time нормализатор settings: ремап legacy-orphan ключей роли
   dev1c→devPlatform (v7.x «Разработка 1С»).

   Регрессия (v2.14.0, снимок настроек с боевой инсталляции): full-rebuild (v2.1.x) мигрировал
   sprint/roleItems/history, но field-ключи НАСТРОЕК — нет. Сироты fieldDev /
   fieldFactDev / userFieldDev1c + мёртвая роль dev1c в activeRoles застряли в
   хранилище; форма collect() делает Object.assign({}, initial) и re-POST'ит весь
   блоб → строгий validateSettings отклоняет → invalid_settings_structure на КАЖДОМ
   сохранении настроек (и на init-авто-POST). Источник payload'ов — снятый HAR. */

// HAR-A: канонические devPlatform-ключи пустые (null), userFieldDevPlatform=null.
function harBlobA() {
  return {
    activeRoles: ['analysis', 'testing', 'dev1c', 'devPlatform'],
    fieldState: 'State',
    fieldDev: '$Оценка разработка 1С ЧЧ',           // legacy orphan
    fieldFactDev: '$Факт разработка 1С ЧЧ',          // legacy orphan
    userFieldDev1c: 'Assignee',                      // legacy orphan
    fieldDevPlatform: null,
    fieldFactDevPlatform: null,
    userFieldDevPlatform: null,
    planningModel: 'simple',
    savedAt: 1782381675258
  };
}

test('HAR-A: legacy dev1c orphans → devPlatform canonical; blob становится валидным', function () {
  var m = migrateSettingsObj(harBlobA());
  assert.ok(!('fieldDev' in m),       'fieldDev должен быть удалён');
  assert.ok(!('fieldFactDev' in m),   'fieldFactDev должен быть удалён');
  assert.ok(!('userFieldDev1c' in m), 'userFieldDev1c должен быть удалён');
  assert.strictEqual(m.fieldDevPlatform,     '$Оценка разработка 1С ЧЧ');
  assert.strictEqual(m.fieldFactDevPlatform, '$Факт разработка 1С ЧЧ');
  assert.strictEqual(m.userFieldDevPlatform, 'Assignee');
  assert.deepStrictEqual(m.activeRoles, ['analysis', 'testing', 'devPlatform']);
  assert.strictEqual(validateSettings(m), true, 'после миграции validateSettings=true');
});

test('HAR-B: непустой userFieldDevPlatform НЕ перезатирается (non-overwrite)', function () {
  var b = harBlobA();
  b.userFieldDevPlatform = 'Assignee';   // канон уже задан
  var m = migrateSettingsObj(b);
  assert.strictEqual(m.userFieldDevPlatform, 'Assignee');
  assert.ok(!('userFieldDev1c' in m), 'сирота удаляется независимо от копирования');
  assert.strictEqual(validateSettings(m), true);
});

test('non-overwrite: непустой canonical побеждает legacy, сирота отбрасывается', function () {
  var m = migrateSettingsObj({ fieldDevPlatform: '$CANON', fieldDev: '$LEGACY' });
  assert.strictEqual(m.fieldDevPlatform, '$CANON');
  assert.ok(!('fieldDev' in m));
});

test('activeRoles: dev1c→devPlatform + dedup при уже присутствующем devPlatform', function () {
  var m = migrateSettingsObj({ activeRoles: ['devPlatform', 'dev1c'] });
  assert.deepStrictEqual(m.activeRoles, ['devPlatform']);
  var m2 = migrateSettingsObj({ activeRoles: ['dev1c', 'devPlatform'] });
  assert.deepStrictEqual(m2.activeRoles, ['devPlatform']);
});

test('defensive strip: неизвестный сирота-ключ срезается → save не бриковается', function () {
  var m = migrateSettingsObj({ fieldState: 'State', bogusKey: 'x', anotherOrphan: 42 });
  assert.ok(!('bogusKey' in m));
  assert.ok(!('anotherOrphan' in m));
  assert.strictEqual(m.fieldState, 'State');
  assert.strictEqual(validateSettings(m), true);
});

test('activeRoles отсутствует/null — не трогаем, blob валиден', function () {
  assert.strictEqual(validateSettings(migrateSettingsObj({ fieldState: 'State' })), true);
  var m = migrateSettingsObj({ activeRoles: null, fieldState: 'State' });
  assert.strictEqual(m.activeRoles, null);
  assert.strictEqual(validateSettings(m), true);
});

test('идемпотентность: повторный прогон не меняет результат', function () {
  var once  = migrateSettingsObj(harBlobA());
  var twice = migrateSettingsObj(migrateSettingsObj(harBlobA()));
  assert.deepStrictEqual(twice, once);
});

test('guards: null → null; массив → passthrough', function () {
  assert.strictEqual(migrateSettingsObj(null), null);
  var arr = [];
  assert.strictEqual(migrateSettingsObj(arr), arr);
});

test('round-trip: вывод миграции (GET) → POST проходит validateSettings (петля сирот разорвана)', function () {
  // До миграции блоб с боевой инсталляции отклоняется...
  assert.strictEqual(validateSettings(harBlobA()), false, 'сырой блоб должен отклоняться');
  // ...после — принимается, что и проигрывает фронтовый re-POST.
  assert.strictEqual(validateSettings(migrateSettingsObj(harBlobA())), true);
});

/* v3.6.0 — hard-removal hideDiagLogUi (лестница #56-5: soft → hard).
   Ключ снят с ALLOWED_SETTINGS_KEYS; из легаси-блобов тихо уходит на READ
   (defensive strip, шаг 3) — петля re-POST'а сирот не возникает. */
test('v3.6.0 hard-removal: hideDiagLogUi срезается на READ, round-trip валиден', function () {
  var legacy = { fieldState: 'State', hideDiagLogUi: true, showDiagLogUi: true, savedAt: 1782381675258 };
  assert.strictEqual(validateSettings(legacy), false, 'сырой блоб с hideDiagLogUi должен отклоняться');
  var m = migrateSettingsObj(legacy);
  assert.ok(!('hideDiagLogUi' in m), 'hideDiagLogUi должен быть срезан');
  assert.strictEqual(m.showDiagLogUi, true, 'showDiagLogUi не трогаем');
  assert.strictEqual(validateSettings(m), true, 'после strip блоб валиден для POST');
});

/* v3.6.0 — history-записи встраивают settings-блоб (заморозка при confirm);
   migrateHistoryArr обязан чистить его тем же нормализатором, иначе строгий
   validateSettings внутри history-валидатора бракует легаси-запись целиком.
   Найдено на фикстуре v7.5.0 (hideDiagLogUi в history[0].settings). */
test('v3.6.0: hideDiagLogUi во встроенном history.settings срезается migrateHistoryArr', function () {
  var backend2 = require(path.join(__dirname, '..', '..', 'backend-project.js'));
  var rec = {
    sprintId: 'hist-legacy-1', name: 'Legacy', roleKey: 'devPlatform',
    status: 'FINISHED', dateStart: 1770000000000, dateEnd: 1771000000000,
    items: [], personalPlanning: {}, revisions: [], pluginVersion: '2.14.0',
    settings: { fieldState: 'State', hideDiagLogUi: true, showDiagLogUi: true }
  };
  var arr = backend2.migrateHistoryArr([rec]);
  assert.ok(!('hideDiagLogUi' in arr[0].settings), 'вложенный hideDiagLogUi должен быть срезан');
  assert.strictEqual(arr[0].settings.showDiagLogUi, true);
  assert.strictEqual(backend2.validateHistoryForRead(arr), true, 'ForRead принимает запись после чистки');
  assert.strictEqual(backend2.validateHistoryForWrite(arr), true, 'ForWrite принимает запись после чистки');
});
