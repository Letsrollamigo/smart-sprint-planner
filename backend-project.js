/**
 * Smart Sprint Planner — HTTP Handler (PROJECT scope)
 *
 * #25 Ф1 — тонкая обёртка. Вся логика вынесена в общее ядро backend-core.js
 * (runtime require). Публикует endpoints ядра под scope:'project' — поведение
 * идентично прежней монолитной версии. Парный handler — backend-global.js.
 */

var core = require('./backend-core.js');
/* #45 R2 — Capacity Management. require'ится ДО чтения core.ENDPOINTS: его тело дописывает
   capacity-endpoints в общий core.ENDPOINTS массив (тот же читает backend-global.js — gotcha #7). */
var capacity = require('./backend-capacity.js');
/* issue-fields backend-модуль: тело дописывает свои endpoints в core.ENDPOINTS (тот же
   читает backend-global.js — gotcha #7). require ДО публикации httpHandler ниже. */
require('./backend-issuefields.js');

/* Test-only re-export: unit-тесты делают require('./backend-project.js'). */
if (typeof module !== 'undefined' && module.exports) {
  Object.assign(exports, core);
  Object.assign(exports, capacity); // #45 R2 — computeCapacity/validateCapacity*/… для unit-тестов
}

exports.httpHandler = { endpoints: core.ENDPOINTS };
