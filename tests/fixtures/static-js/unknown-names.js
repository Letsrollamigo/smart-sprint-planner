/* Фикстура tests/arch/static-js.test.js (N3). Обращения к необъявленным именам здесь
   намеренные — по ним гейт доказывает, что умеет краснеть. Не исправлять. */
'use strict';

function declared() { return 1; }

module.exports = [
  function () { return undeclaredValue + declared(); },   // имя не объявлено нигде
  function () { return declaerd(); },                     // опечатка в объявленном имени
  function () { return { missingShorthand }; },           // сокращённое свойство без переменной
  function () { return process.platform; },               // глобал Node: в браузере и в YouTrack его нет
  function () { return $('#x'); },                        // глобал библиотеки, которой в планере нет
];
