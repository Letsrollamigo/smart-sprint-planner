/* Фикстура tests/arch/static-js.test.js (W3): три издателя мостов разной формы. */
import * as mod from './bridge-module.js';

var api = { render: function () {}, close: function () {} };

window.__FIX_VIEW = api;      // объект-литерал через переменную
window.__FIX_NS__ = mod;      // модуль целиком: состав моста = экспорты модуля
window.__FIX_FLAG = true;     // не объект: состав неизвестен, обращения вне проверки
