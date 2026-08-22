/* Fitness function D — registry completeness (feature-placement).
 *
 * Каждый модуль в widgets/main/src обязан иметь запись в module-registry.json с
 * заявленным слоем и доменом. Новый файл без записи = красный гейт → автор вынужден
 * либо положить код в существующий домен (в рамках его бюджета, см. A), либо ЗАВЕСТИ
 * новый модуль с осознанной записью. Это делает cross-domain scatter и «случайный
 * god-модуль рядом» видимым в diff реестра, а не молчаливым.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const lib = require('./_lib.js');
const reg = require('../../module-registry.json');

const VALID_LAYERS = new Set(['domain', 'data', 'infra', 'pure', 'i18n']);

test('D1 — каждый модуль зарегистрирован (новый файл без записи в реестре = красный)', () => {
  const onDisk = new Set(lib.listModules());
  const registered = new Set(Object.keys(reg.modules));
  const missing = [...onDisk].filter((f) => !registered.has(f));
  assert.deepStrictEqual(missing, [],
    'Новые модули без записи в module-registry.json. Добавь запись {layer, domain, ' +
    'state, publishes} — это и есть «куда приземлилась фича»:\n  ' + missing.join('\n  '));
});

test('D2 — нет осиротевших записей (удалённый модуль убран из реестра)', () => {
  const onDisk = new Set(lib.listModules());
  const stale = Object.keys(reg.modules).filter((f) => !onDisk.has(f));
  assert.deepStrictEqual(stale, [], 'Записи реестра без файла на диске:\n  ' + stale.join('\n  '));
});

test('D3 — у каждого модуля валидный слой', () => {
  const bad = Object.entries(reg.modules)
    .filter(([, m]) => !VALID_LAYERS.has(m.layer))
    .map(([f, m]) => `${f}: layer="${m.layer}"`);
  assert.deepStrictEqual(bad, [], 'Невалидный слой (допустимо: ' +
    [...VALID_LAYERS].join('/') + '):\n  ' + bad.join('\n  '));
});
