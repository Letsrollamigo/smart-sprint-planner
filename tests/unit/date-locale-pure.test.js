'use strict';
// Unit tests for widgets/main/src/pure/date-pure.js — локаль дат не прибита к ru-RU.
// Баг 2026-07-19: fmtDate/fmtDT хардкодили 'ru-RU', а react/i18n-bridge фолбэкал
// на 'ru' — EN-пользователи видели русские даты. Теперь локаль инжектится
// параметром (core передаёт активный _lang), дефолт en; react-мост читает
// каноническую цепочку loader'а (__SSP_I18N__) с дефолтом en.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { fmtDate, fmtDT } = require('../../widgets/main/src/pure/date-pure.js');

// Локальный полдень — вне TZ-краёв (см. v3.2.1 date-drift урок).
const TS = new Date(2026, 6, 18, 12, 5).getTime(); // 18 июля 2026, 12:05 local

describe('fmtDate — локаль параметром, не хардкод', () => {
  it('ru → DD.MM.YYYY (прежнее поведение RU-пользователей сохранено)', () => {
    assert.strictEqual(fmtDate(TS, 'ru'), '18.07.2026');
  });
  it('en → MM/DD/YYYY (EN-пользователи больше не видят RU-формат)', () => {
    assert.strictEqual(fmtDate(TS, 'en'), '07/18/2026');
  });
  it('без lang → дефолт en (синхронно core.js DEFAULT_LANG)', () => {
    assert.strictEqual(fmtDate(TS), '07/18/2026');
  });
  it('пустой ts → тире', () => {
    assert.strictEqual(fmtDate(null), '—');
    assert.strictEqual(fmtDate(0), '—');
  });
});

describe('fmtDT — локаль параметром', () => {
  it('ru → дата в RU-формате с временем', () => {
    assert.match(fmtDT(TS, 'ru'), /^18\.07\.2026/);
  });
  it('en → дата в EN-формате с временем', () => {
    assert.match(fmtDT(TS, 'en'), /^07\/18\/2026/);
  });
  it('без lang → дефолт en', () => {
    assert.match(fmtDT(TS), /^07\/18\/2026/);
  });
});

describe('source-контракт — RU-фолбэки не возвращаются', () => {
  const read = (rel) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

  it('date-pure.js не хардкодит ru-RU', () => {
    assert.doesNotMatch(read('widgets/main/src/pure/date-pure.js'), /ru-RU/);
  });
  it("react/i18n-bridge.jsx: фолбэк языка — en, не ru; читается сам мост, не только комментарий", () => {
    const src = read('widgets/main/src/react/i18n-bridge.jsx');
    assert.doesNotMatch(src, /(\|\||\?\?)\s*['"]ru['"]/);
    assert.doesNotMatch(src, /return\s+['"]ru['"]/);
    assert.match(src, /window\.__SSP_I18N__/, 'мост должен читать window.__SSP_I18N__ (вызов, не комментарий)');
    assert.match(src, /getCurrentLang\(\)/, 'мост должен вызывать getCurrentLang() канонической цепочки');
  });
  it('core.js: делегаты fmtDate/fmtDT передают _lang', () => {
    const src = read('widgets/main/src/core.js');
    assert.match(src, /DATE_PURE\.fmtDate\(ts,\s*_lang\)/);
    assert.match(src, /DATE_PURE\.fmtDT\(ts,\s*_lang\)/);
  });
  it('i18n-controller синкает in-memory язык loader (иначе DatePicker замирает на стартовом)', () => {
    const ctrl = read('widgets/main/src/i18n/i18n-controller.js');
    assert.match(ctrl, /i18nBridge\.setCurrentLang\(lang\)/);
    assert.match(ctrl, /i18nBridge\.setCurrentLang\(prev\)/, 'откат при провале загрузки словаря тоже синкает loader');
    assert.match(read('widgets/main/src/i18n/loader.js'), /export function setCurrentLang/);
  });
  it('имена файлов экспорта не строятся из локализованного fmtDate (en даёт слэши)', () => {
    assert.doesNotMatch(read('widgets/main/src/domain/excel-export.js'), /fmtDate\([^)]*\)\.replace/);
    assert.doesNotMatch(read('widgets/main/src/domain/history-controller.js'), /fmtDate\([^)]*\)\.replace/);
  });
});
