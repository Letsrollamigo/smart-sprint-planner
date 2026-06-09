'use strict';
// Unit tests for isValidProjectKey (backend-global.js) — prod-fix 2026-06-09.
// Регресс: проект «1С ЗУП» (ключ 1c_demo) пропадал из global-picker'а, т.к. прежняя
// ASCII-allowlist /^[A-Za-z][A-Za-z0-9_]{0,99}$/ резала цифру-в-начале / кириллицу / дефис.
// Новый валидатор: длина + denylist опасных символов; пускает любые реальные YT-ключи.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');

const { isValidProjectKey } = require(path.join(__dirname, '..', '..', 'backend-global.js'));

describe('isValidProjectKey — допустимые ключи YouTrack (любой формат)', () => {
  const valid = [
    '1c_demo',        // ← регресс-кейс: «1С ЗУП», старт с цифры + нижний регистр + подчёркивание
    'DEMO', 'DEMOClone', 'MyProj', 'PROJ_2025',
    'БУХ', 'КА', 'ЗУП', 'Тест',          // кириллица
    'SCB-NEW', 'ABC-12', 'проект-1', 'UT-КА.2025',  // дефис / точка / смешанные
    '1C', 'a', 'ZUP_2025-v2'
  ];
  valid.forEach((k) => {
    it('PASS: ' + JSON.stringify(k), () => assert.equal(isValidProjectKey(k), true));
  });
});

describe('isValidProjectKey — отклоняемые (мусор / инъекция / границы)', () => {
  const invalid = [
    '', '   ', null, undefined, 42, {},
    'a b', 'a\tb',                         // whitespace
    'a<b', 'a>b', 'a"b', "a'b", 'a`b',     // injection/quotes
    'a/b', 'a\\b', 'a?b', 'a#b', 'a&b',    // URL
    'a=b', 'a;b', 'a%b', 'a{b', 'a}b',
    'a(b', 'a)b', 'a:b', 'a|b', 'a@b', 'a,b', 'a!b',
    new Array(102).join('x')              // 101 символ — длиннее лимита 100
  ];
  invalid.forEach((k) => {
    it('FAIL: ' + JSON.stringify(k), () => assert.equal(isValidProjectKey(k), false));
  });
});

describe('isValidProjectKey — точечно регресс «1С ЗУП»', () => {
  it('1c_demo проходит (раньше падал на ^[A-Za-z])', () => {
    assert.equal(isValidProjectKey('1c_demo'), true);
  });
  it('trim применяется', () => {
    assert.equal(isValidProjectKey('  1c_demo  '), true);
  });
});
