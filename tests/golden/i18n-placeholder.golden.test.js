/**
 * Регресс 2026-07-19: RU-плейсхолдер цели спринта во всех локалях.
 *
 * Две половины бага: (1) span-host Ring Input носил data-i18n-placeholder —
 * атрибут, которого applyI18N не знает; (2) applyI18N писал el.placeholder
 * PROPERTY — на span это expando, а input-mount.jsx читает АТРИБУТ placeholder
 * (и слушает его MutationObserver'ом). Контракт: applyI18N переводит атрибут
 * placeholder у [data-i18n-ph]-хоста в активный язык.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { createHost } = require('./monolith-host');
const fx = require('./fixtures/state');

test('регресс: applyI18N переводит placeholder цели спринта (span-host, атрибут)', () => {
  const { gm, document } = createHost();       /* host default lang = ru */
  fx.applyBaseState(gm);
  const host = document.querySelector('[data-input-id="sprintGoal"]');
  assert.ok(host, 'span-host цели спринта присутствует в index.html');

  gm.call('applyI18N');
  assert.strictEqual(host.getAttribute('placeholder'),
    'Что команда хочет достичь к концу спринта', 'ru-плейсхолдер из словаря');

  gm.set({ _lang: 'en' });
  gm.call('applyI18N');
  assert.strictEqual(host.getAttribute('placeholder'),
    'What the team wants to achieve by sprint end', 'после смены языка атрибут переведён (EN)');
});
