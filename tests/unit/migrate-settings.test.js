'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const path   = require('node:path');

const backend = require(path.join(__dirname, '..', '..', 'backend-project.js'));
const { migrateSettingsObj, validateSettings } = backend;

/* v2.15.2 — read-time нормализатор settings: ремап legacy-orphan ключей роли
   dev1c→devPlatform (внутренняя линия v7.x «Разработка 1С»).

   Регрессия (прод v2.14.0, проект scbt1CUUHDB): full-rebuild (v2.1.x) мигрировал
   sprint/roleItems/history, но field-ключи НАСТРОЕК — нет. Сироты fieldDev /
   fieldFactDev / userFieldDev1c + мёртвая роль dev1c в activeRoles застряли в
   хранилище; форма collect() делает Object.assign({}, initial) и re-POST'ит весь
   блоб → строгий validateSettings отклоняет → invalid_settings_structure на КАЖДОМ
   сохранении настроек (и на init-авто-POST). Источник payload'ов — реальный HAR. */

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
  // До миграции реальный прод-блоб отклоняется...
  assert.strictEqual(validateSettings(harBlobA()), false, 'сырой прод-блоб должен отклоняться');
  // ...после — принимается, что и проигрывает фронтовый re-POST.
  assert.strictEqual(validateSettings(migrateSettingsObj(harBlobA())), true);
});
