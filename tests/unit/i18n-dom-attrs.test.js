'use strict';
// Регресс 2026-07-19: textarea цели спринта носила data-i18n-placeholder —
// атрибут, которого applyI18N не знает (поддержан data-i18n-ph) → RU-плейсхолдер
// «Что команда хочет достичь…» показывался во всех локалях. Гард: каждый
// data-i18n-* атрибут в index.html — из поддерживаемого applyI18N набора
// (см. widgets/main/src/i18n/i18n-controller.js).
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SUPPORTED = new Set([
  'data-i18n',          // textContent / innerHTML (с модификатором data-i18n-html)
  'data-i18n-html',
  'data-i18n-title',
  'data-i18n-ph',       // placeholder
  'data-i18n-tooltip',
  'data-i18n-label',
]);

describe('index.html — только поддерживаемые data-i18n-* атрибуты', () => {
  const html = fs.readFileSync(
    path.join(__dirname, '..', '..', 'widgets', 'main', 'index.html'), 'utf8');

  it('нет неизвестных applyI18N data-i18n-* атрибутов', () => {
    const seen = new Set(html.match(/data-i18n[-a-z0-9]*(?==)/g) || []);
    const unknown = [...seen].filter((a) => !SUPPORTED.has(a));
    assert.deepEqual(unknown, [], 'незнакомые атрибуты (applyI18N их молча игнорирует): ' + unknown);
  });

  it('плейсхолдер цели спринта привязан через data-i18n-ph', () => {
    assert.match(html, /data-i18n-ph="phSprintGoal"/);
  });

  it('applyI18N пишет placeholder АТРИБУТОМ (span-host Ring Input читает атрибут, не property)', () => {
    const ctrl = fs.readFileSync(
      path.join(__dirname, '..', '..', 'widgets', 'main', 'src', 'i18n', 'i18n-controller.js'), 'utf8');
    assert.match(ctrl, /setAttribute\('placeholder',\s*T\(el\.getAttribute\('data-i18n-ph'\)\)\)/);
  });
});

/* #119 — data-i18n-title на #langSel (tipLanguage): ключ обязан быть во всех 15 локалях, иначе
   Ring Tooltip покажет сам ключ (ожог v3.39.2: outOfRangeWarn). Гард на ВСЕ data-i18n*-ключи index.html. */
describe('index.html — каждый data-i18n*-ключ есть во всех локалях', () => {
  const html = fs.readFileSync(
    path.join(__dirname, '..', '..', 'widgets', 'main', 'index.html'), 'utf8');
  const dir = path.join(__dirname, '..', '..', 'widgets', 'main', 'i18n');
  const keys = new Set((html.match(/data-i18n(?:-title|-ph|-label|-tooltip)?="([^"]+)"/g) || [])
    .map((a) => a.replace(/^[^"]+"|"$/g, '')));
  const locales = fs.readdirSync(dir).filter((f) => /^[a-z]{2}\.json$/.test(f));

  it('15 локалей на месте', () => { assert.equal(locales.length, 15); });

  it('нет ключей без перевода', () => {
    const missing = [];
    for (const f of locales) {
      const dict = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      for (const k of keys) if (!(k in dict)) missing.push(f + ':' + k);
    }
    assert.ok(keys.has('tipLanguage'), 'tipLanguage привязан к #langSel');
    assert.deepEqual(missing, [], 'ключи без перевода: ' + missing.join(', '));
  });
});
