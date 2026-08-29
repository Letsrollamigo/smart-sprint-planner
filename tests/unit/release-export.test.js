/* release-view.buildExportText + canShareRelease — #48 R4 (US-R4-01/US-R4-03).
 * Экспорт: детерминированная pure-сборка .txt (название / тип ОБОИМИ измерениями /
 * даты / патчноут / заметки). Share-гейт: источник=Вендорский × доступность host-API
 * внешних ссылок (E-2; п.1 compat-якорь — на YT 2025.x кнопки нет).
 * Запуск: node --test 'tests/unit/release-export.test.js'. */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const view = require('../../widgets/main/src/domain/release-view.js');

const L = {
  kindLabel: 'Вид', srcLabel: 'Источник',
  kind: { release: 'Релиз', hotfix: 'Хотфикс' }, src: { internal: 'Внутренний', vendor: 'Вендорский' },
  planDate: 'Плановая дата', closedAt: 'Закрыт', patchNote: 'Патчноут', notes: 'Заметки',
};

test('buildExportText: полный контент — название/тип/дата/патчноут/заметки (golden)', () => {
  const rec = {
    id: 'rel-1', name: 'v2.17.0', kind: 'release', source: 'vendor',
    plannedDate: Date.UTC(2026, 6, 15),
    patchNote: '- фикс А\n- фича Б', notes: 'внутренние',
  };
  assert.strictEqual(view.buildExportText(rec, L, 'ru'), [
    'v2.17.0',
    '=======',
    'Вид: Релиз · Источник: Вендорский',
    'Плановая дата: 15.07.2026',
    '',
    'Патчноут:',
    '- фикс А',
    '- фича Б',
    '',
    'Заметки:',
    'внутренние',
  ].join('\n') + '\n');
});

test('buildExportText: пустые секции опускаются; закрытый несёт момент закрытия', () => {
  const rec = { id: 'rel-2', name: 'HF-1', kind: 'hotfix', source: 'internal', status: 'released', snapshot: { closedAt: Date.UTC(2026, 6, 1, 12, 0) } };
  const text = view.buildExportText(rec, L, 'ru');
  assert.ok(text.indexOf('Патчноут') < 0 && text.indexOf('Заметки') < 0 && text.indexOf('Плановая дата') < 0);
  /* #94 — момент закрытия печатается локалью планера: у ru это «01.07.2026, 19:00»
     (с запятой), у en — «07/01/2026, 07:00 PM». Проверяем формат ru, не значение (локальный tz). */
  assert.ok(/Закрыт: \d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}\n/.test(text), text);
  assert.ok(text.indexOf('Хотфикс') >= 0 && text.indexOf('Внутренний') >= 0);
});

test('canShareRelease: вендорский × внешний share-API (E-2); YT 2025.x → всегда false', () => {
  assert.strictEqual(view.canShareRelease({ source: 'vendor' }, true), true);
  assert.strictEqual(view.canShareRelease({ source: 'internal' }, true), false);
  assert.strictEqual(view.canShareRelease({ source: 'vendor' }, false), false); // negative-якорь п.1
  assert.strictEqual(view.canShareRelease(null, true), false);
});

/* #94 — экспорт релиза следует языку планера: дата раньше печаталась жёстким DD.MM.YYYY
   независимо от локали интерфейса. Плановая дата хранится UTC-полночью, поэтому формат
   обязан читать её как UTC — иначе западнее Гринвича она уезжает на день назад. */
test('#94: дата в экспорте — в языке планера, дата хранится и читается как UTC', () => {
  const rec = { id: 'rel-3', name: 'v3.0.0', kind: 'release', source: 'vendor', plannedDate: Date.UTC(2026, 6, 15) };
  assert.ok(view.buildExportText(rec, L, 'ru').indexOf('Плановая дата: 15.07.2026') >= 0, 'ru → 15.07.2026');
  assert.ok(view.buildExportText(rec, L, 'en').indexOf('Плановая дата: 07/15/2026') >= 0, 'en → 07/15/2026');
  /* без языка — 'en' по умолчанию (как в date-pure), но НЕ локаль машины */
  assert.ok(view.buildExportText(rec, L).indexOf('07/15/2026') >= 0, 'fallback не зависит от локали ОС');
});
